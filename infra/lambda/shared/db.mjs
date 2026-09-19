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

export async function listParents() {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :p",
      ExpressionAttributeValues: { ":p": ALL_MEMBERS },
    })
  );
  return (res.Items ?? []).filter((m) => m.role === "parent" && m.enabled !== false);
}

/** Signals for one member, newest first. */
export async function recentSignals(memberId, sinceIso, limit = 200) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":p": `MEM#${memberId}`,
        ":from": `SIG#${sinceIso}`,
        ":to": "SIG#9999",
      },
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

export async function openIncident(memberId) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
      ExpressionAttributeValues: { ":p": `MEM#${memberId}`, ":s": "INC#" },
      ScanIndexForward: false,
      Limit: 5,
    })
  );
  return (res.Items ?? []).find((i) => i.status === "open") ?? null;
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
