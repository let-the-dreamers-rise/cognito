import { randomUUID } from "node:crypto";
import { doc, TABLE, ALL_MEMBERS, getMember, putItem, memberKey } from "./shared/db.mjs";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";
import { authorise } from "./shared/auth.mjs";
import { DEFAULT_TZ } from "./shared/time.mjs";
import { isDemoCode, demoExpiry } from "./shared/demo.mjs";

const PAIR_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479";

const pairCode = () =>
  Array.from(
    { length: 6 },
    () => PAIR_ALPHABET[Math.floor(Math.random() * PAIR_ALPHABET.length)]
  ).join("");

/**
 * The watched person enrols first and hands out the code. A watcher can never
 * add themselves to someone else's account, which is what makes covert
 * installation impossible.
 */
async function enrolParent(body, { demo = false } = {}) {
  const memberId = randomUUID();
  const deviceToken = randomUUID();
  const code = pairCode();
  const now = new Date().toISOString();

  await putItem({
    ...memberKey(memberId),
    gsi1pk: ALL_MEMBERS,
    gsi1sk: `MEM#${memberId}`,
    memberId,
    role: "parent",
    // Only a member created this way can ever be made to escalate on command.
    demo,
    ...(demo ? { ttl: demoExpiry() } : {}),
    name: body.name ?? "Amma",
    tz: body.tz ?? DEFAULT_TZ,
    phone: body.phone ?? null,
    deviceToken,
    pairCode: code,
    pushToken: body.pushToken ?? null,
    enabled: true,
    travelUntil: null,
    localContact: null,
    baseline: { samples: [], firstActivityMedian: null },
    // Seed both clocks at enrolment. An unset clock reads as infinitely stale,
    // which assessed a brand new member as two days silent on the next sweep.
    lastSeenAt: now,
    lastWakingAt: now,
    createdAt: now,
  });

  await putItem({ pk: `PAIR#${code}`, sk: "PROFILE", memberId, createdAt: now });

  return { memberId, deviceToken, pairCode: code, role: "parent", demo };
}

/**
 * The demo code does not point at one shared account. It mints a new one each
 * time, so two judges trying it at the same minute never see each other's
 * escalations, and nobody can leave the demo in a broken state for the next
 * person.
 */
async function enrolIntoFreshDemo(body) {
  const parent = await enrolParent({ name: "Amma" }, { demo: true });
  const watcher = await attachWatcher(parent.memberId, body, { demo: true });
  return { ...watcher, memberName: "Amma", demo: true };
}

async function attachWatcher(memberId, body, { demo = false } = {}) {
  const watcherId = randomUUID();
  const deviceToken = randomUUID();

  await putItem({
    pk: `MEM#${memberId}`,
    sk: `WATCHER#${watcherId}`,
    watcherId,
    memberId,
    name: body.name ?? "Family",
    deviceToken,
    pushToken: body.pushToken ?? null,
    createdAt: new Date().toISOString(),
    // Expires with the demo member it belongs to, rather than orphaning.
    ...(demo ? { ttl: demoExpiry() } : {}),
  });

  return { watcherId, memberId, deviceToken, role: "watcher" };
}

async function enrolWatcher(body) {
  if (!body.pairCode) return null;

  if (isDemoCode(body.pairCode)) return enrolIntoFreshDemo(body);

  const pair = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `PAIR#${String(body.pairCode).toUpperCase()}`, sk: "PROFILE" },
    })
  );
  if (!pair.Item) return null;

  const member = await getMember(pair.Item.memberId);
  const watcher = await attachWatcher(pair.Item.memberId, body);

  return {
    ...watcher,
    memberName: member?.name ?? "Amma",
    // A real account, whatever the watcher's device thinks.
    demo: Boolean(member?.demo),
  };
}

/** Hers to change. */
const SELF_FIELDS = [
  "pushToken",
  "enabled",
  "travelUntil",
  "localContact",
  "name",
  "tz",
  "phone",
];

/**
 * A watcher may register the neighbour and her number, because they are usually
 * the one setting this up and the last rung is useless without them. They
 * cannot touch anything about what is shared or whether sharing is on.
 */
const WATCHER_FIELDS = ["localContact", "phone"];

async function updateSettings(event, body) {
  const auth = await authorise(body.memberId, bearer(event));
  if (!auth) return null;

  const { member, role } = auth;
  const allowed = role === "self" ? SELF_FIELDS : WATCHER_FIELDS;
  const updates = allowed.filter((k) => body[k] !== undefined);
  if (updates.length === 0) return member;

  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: memberKey(body.memberId),
      UpdateExpression: `SET ${updates.map((k) => `#${k} = :${k}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(updates.map((k) => [`#${k}`, k])),
      ExpressionAttributeValues: Object.fromEntries(
        updates.map((k) => [`:${k}`, body[k]])
      ),
      ReturnValues: "ALL_NEW",
    })
  );
  return res.Attributes;
}

export async function handler(event) {
  const path = event?.rawPath ?? "";
  const body = parseBody(event);
  if (body === null) return bad(400, "invalid JSON body");

  try {
    if (path.endsWith("/enroll/parent")) return ok(await enrolParent(body));

    if (path.endsWith("/enroll/watcher")) {
      const result = await enrolWatcher(body);
      return result ? ok(result) : bad(404, "that pairing code did not match anyone");
    }

    if (path.endsWith("/settings")) {
      const result = await updateSettings(event, body);
      return result ? ok(result) : bad(403, "not your account");
    }

    return bad(404, "unknown route");
  } catch (err) {
    console.error("enroll failed", err);
    return bad(500, "enrolment failed");
  }
}
