/**
 * One pairing code opens a demo. Every other code is somebody's mother.
 *
 * The distinction is not cosmetic. Demo controls can force a critical
 * escalation, and on a real account that means a real SMS to a real neighbour
 * at whatever hour it happens to be. Without this gate, anyone holding any
 * pairing code could make that happen.
 *
 * Letters are drawn from the pairing alphabet, which omits the characters that
 * are easy to misread aloud - no B, I, O, S, Z, 0, 1, 2, 5, 6 or 8.
 */
export const DEMO_PAIR_CODE = 'TRYME9';

export const isDemoCode = (code) =>
  String(code ?? '').trim().toUpperCase() === DEMO_PAIR_CODE;

/** Demo accounts clean themselves up rather than being swept forever. */
export const DEMO_TTL_DAYS = 7;

export const demoExpiry = (now = new Date()) =>
  Math.floor(now.getTime() / 1000) + DEMO_TTL_DAYS * 24 * 3600;
