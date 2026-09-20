import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = process.env.TABLE_NAME;
export const ALL_MEMBERS = "ALL_MEMBERS";

/** Signals older than this are dropped automatically. Raw signals are never kept long. */
export const SIGNAL_TTL_DAYS = 14;

export const memberKey = (memberId) => ({ pk: `MEM#${memberId}`, sk: "PROFILE" });

export async function getMember(memberId) {
  const res = await doc.send(
    new GetCommand({ TableName: TABLE, Key: memberKey(memberId) })
  );
  return res.Item ?? null;
}

export async function putItem(item) {
  await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/**
 * Every member the sweep must consider.
 *
 * Paginated deliberately: a DynamoDB query page caps at 1MB, so a single-page
 * read silently stops returning members somewhere past a couple of thousand -
 * and a sweep that checks 1,400 of 2,000 people reports success while the rest
 * go unwatched. In a system whose failure mode is "nobody notices", a silent
 * truncation is the worst possible shape of bug.
 */
export async function listParents() {
  const members = [];
  let startKey;

  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :p",
        ExpressionAttributeValues: { ":p": ALL_MEMBERS },
        ExclusiveStartKey: startKey,
      })
    );
    members.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return members.filter((m) => m.role === "parent" && m.enabled !== false);
}

/**
 * Signals for one member since an instant, OLDEST FIRST.
 *
 * The order matters more than it looks. Every caller ultimately wants the first
 * waking signal of the day, and a newest-first query with a limit returns the
 * earliest of the most recent N - which is a different day's worth of meaning.
 * At one heartbeat every five minutes a day is roughly 600 rows, so the limit
 * is set above a full day rather than near it.
 */
export async function recentSignals(memberId, sinceIso, limit = 1200) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":p": `MEM#${memberId}`,
        ":from": `SIG#${sinceIso}`,
        ":to": "SIG#9999",
      },
      ScanIndexForward: true,
      Limit: limit,
    })
  );
  return res.Items ?? [];
}


/** The last few daily verdicts, newest first. Used for the week at a glance. */
export async function recentDays(memberId, limit = 7) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "DAY#" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return res.Items ?? [];
}

export async function recentIncidents(memberId, limit = 5) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "INC#" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return res.Items ?? [];
}

export async function watchersOf(memberId) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "WATCHER#" },
    })
  );
  return res.Items ?? [];
}

/**
 * The escalation ladder times out after six hours, so an incident still marked
 * open beyond that is not in progress - it is stranded, because its execution
 * died between rungs.
 *
 * This matters more than it looks. The sweep skips any member with an open
 * incident, so a stranded one makes that member permanently invisible: skipped
 * every ten minutes, logged at info, reported as success. If the stranded
 * incident was critical, nothing could ever raise them again. Ageing it out
 * means the next sweep reopens the case instead of stepping over it forever.
 */
const STRANDED_AFTER_MS = 6 * 3600 * 1000;

/** Incidents are worth keeping for a while, but not forever. */
export const INCIDENT_TTL_DAYS = 120;

/**
 * Incident ids must sort by time, because every reader of them asks for the
 * newest few and DynamoDB sorts sort keys lexically. A random UUID here meant
 * "the five most recent incidents" was really "five arbitrary incidents", so
 * once a member had more than five in their history the open one could simply
 * not be found - and a sign of life would then fail to close it.
 *
 * Epoch millis are fixed width until well beyond any horizon that matters, and
 * contain only characters that are also legal in a Step Functions execution
 * name, which the same id is used for.
 */
export const newIncidentId = (now = new Date()) =>
  `${now.getTime()}-${randomUUID().slice(0, 8)}`;

export async function openIncident(memberId, now = new Date()) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "INC#" },
      ScanIndexForward: false,
      Limit: 5,
    })
  );

  return (
    (res.Items ?? []).find(
      (i) =>
        i.status === "open" &&
        now.getTime() - new Date(i.openedAt).getTime() < STRANDED_AFTER_MS
    ) ?? null
  );
}

export async function setIncidentStatus(memberId, incidentId, status, extra = {}) {
  const sets = ["#s = :s", "updatedAt = :u"];
  const names = { "#s": "status" };
  const values = { ":s": status, ":u": new Date().toISOString() };

  for (const [k, v] of Object.entries(extra)) {
    sets.push(`${k} = :${k}`);
    values[`:${k}`] = v;
  }

  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `MEM#${memberId}`, sk: `INC#${incidentId}` },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

/** Who looked in on her, newest first. Her side of the relationship. */
export async function recentLooks(memberId, limit = 10) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "LOG#" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return res.Items ?? [];
}

/** Transparency ledger: the watched person can see every read of their data. */
export async function logAccess(memberId, actor, action) {
  const now = new Date();
  await putItem({
    pk: `MEM#${memberId}`,
    sk: `LOG#${now.toISOString()}`,
    actor,
    action,
    at: now.toISOString(),
    ttl: Math.floor(now.getTime() / 1000) + 90 * 24 * 3600,
  });
}
