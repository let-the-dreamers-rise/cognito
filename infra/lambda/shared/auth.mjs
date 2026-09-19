import { getMember, watchersOf } from "./db.mjs";

/**
 * Resolves an opaque device token against one member. Either she holds it, or a
 * watcher she handed a pairing code to does. Nobody else can reach the record.
 */
export async function authorise(memberId, token) {
  if (!memberId || !token) return null;

  const member = await getMember(memberId);
  if (!member) return null;

  if (member.deviceToken === token) {
    return { member, role: "self", actor: member.name ?? "She" };
  }

  const watchers = await watchersOf(memberId);
  const watcher = watchers.find((w) => w.deviceToken === token);
  if (!watcher) return null;

  return { member, role: "watcher", actor: watcher.name ?? "Family", watcher };
}
