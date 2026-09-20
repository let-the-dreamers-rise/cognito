import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  doc,
  TABLE,
  listParents,
  recentSignals,
  watchersOf,
  putItem,
  memberKey,
} from "./shared/db.mjs";
import { pushToExpo } from "./shared/push.mjs";
import { narrate } from "./shared/narrate.mjs";
import {
  startOfLocalDay,
  localDate,
  formatLocalTime,
} from "./shared/time.mjs";
import {
  firstWakingSignal,
  updateBaseline,
  isLearning,
  stepsToday,
} from "./shared/baseline.mjs";

async function summariseMember(member) {
  const now = new Date();
  const tz = member.tz;
  const signals = await recentSignals(member.memberId, startOfLocalDay(now, tz));
  const first = firstWakingSignal(signals, tz);

  const summary = {
    weekday: new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(now),
    firstActivityAt: first ? formatLocalTime(first.at, tz) : null,
    steps: stepsToday(signals),
    transactions: signals.filter((s) => s.type === "transaction").length,
    charged: signals.some((s) => s.type === "charging"),
    lastSeenAt: member.lastSeenAt ? formatLocalTime(member.lastSeenAt, tz) : null,
  };

  const { text: narrative, source } = await narrate(summary, member.name);

  await putItem({
    pk: `MEM#${member.memberId}`,
    sk: `DAY#${localDate(now, tz)}`,
    ...summary,
    narrative,
    createdAt: now.toISOString(),
  });

  // Only a day we actually saw teaches the baseline anything.
  if (first) {
    const baseline = updateBaseline(member.baseline, first.minutes);
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: memberKey(member.memberId),
        UpdateExpression: "SET baseline = :b",
        ExpressionAttributeValues: { ":b": baseline },
      })
    );
  }

  const watchers = await watchersOf(member.memberId);
  await pushToExpo(
    watchers.map((w) => ({
      to: w.pushToken,
      title: isLearning(member.baseline) ? "Still learning her routine" : "Today",
      body: narrative,
      data: { action: "daily", memberId: member.memberId },
    }))
  );

  return { memberId: member.memberId, narrative, source };
}

export async function handler() {
  const parents = await listParents();
  const results = await Promise.all(
    parents.map((m) =>
      summariseMember(m).catch((err) => {
        console.error("summary failed for", m.memberId, err);
        return { memberId: m.memberId, error: String(err) };
      })
    )
  );
  console.log(JSON.stringify({ summarised: results.length, results }));
  return { summarised: results.length };
}
