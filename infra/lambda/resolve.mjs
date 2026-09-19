import { openIncident, setIncidentStatus, putItem } from "./shared/db.mjs";
import { authorise } from "./shared/auth.mjs";
import { ok, bad, parseBody, bearer } from "./shared/http.mjs";

/**
 * "I have spoken to her." The family can stand the ladder down themselves,
 * which is faster than waiting for her phone to prove it.
 *
 * This closes the incident without writing a waking signal, because a phone
 * call is evidence about her, not about her phone, and the two clocks should
 * keep telling the truth.
 */
export async function handler(event) {
  const body = parseBody(event);
  if (body === null) return bad(400, "invalid JSON body");

  const auth = await authorise(body.memberId, bearer(event));
  if (!auth) return bad(403, "not linked to this person");

  const incident = await openIncident(body.memberId);
  if (!incident) return ok({ resolved: null, note: "nothing was open" });

  await setIncidentStatus(body.memberId, incident.incidentId, "resolved", {
    resolvedBy: auth.actor,
    resolvedHow: body.how ?? "spoke to her",
  });

  await putItem({
    pk: `MEM#${body.memberId}`,
    sk: `LOG#${new Date().toISOString()}`,
    actor: auth.actor,
    action: "stood the check down after speaking to her",
    at: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 3600,
  });

  return ok({ resolved: incident.incidentId, by: auth.actor });
}
