const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
};

export const ok = (body) => ({
  statusCode: 200,
  headers: CORS,
  body: JSON.stringify(body),
});

export const bad = (statusCode, message) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify({ error: message }),
});

export function parseBody(event) {
  if (!event?.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Device tokens are opaque and scoped to one member. Not a substitute for Cognito. */
export function bearer(event) {
  const header =
    event?.headers?.authorization ?? event?.headers?.Authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
