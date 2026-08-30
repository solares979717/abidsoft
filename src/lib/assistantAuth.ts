import crypto from "crypto";

/**
 * The assistant never writes to the database directly. When it proposes a
 * change, the proposal (old value, new value, patient id) is signed with
 * this HMAC so the confirm step can prove the proposal wasn't tampered
 * with client-side. Row Level Security is still the real authority — this
 * only prevents a doctor's browser from confirming a change to a different
 * patient than the one actually shown on screen.
 */
function secret() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return s;
}

export function signProposal(payload: Record<string, string | null>): string {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  const sig = crypto.createHmac("sha256", secret()).update(json).digest("hex");
  return sig;
}

export function verifyProposal(payload: Record<string, string | null>, token: string): boolean {
  try {
    const expected = signProposal(payload);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
