import { describe, it, expect, beforeEach } from "vitest";
import { signProposal, verifyProposal } from "./assistantAuth";

// This is the only thing standing between "the assistant showed a Confirm
// button" and "the confirm actually writes to the database". If this is
// wrong, either legitimate confirmations get rejected (annoying) or a
// tampered confirmation gets accepted (a real security problem).
describe("assistant proposal signing", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-do-not-use-in-prod";
  });

  const proposal = { patient_id: "p1", old_phone: "0300", new_phone: "0301" };

  it("a token signed for a proposal verifies against that same proposal", () => {
    const token = signProposal(proposal);
    expect(verifyProposal(proposal, token)).toBe(true);
  });

  it("rejects a token if any field of the proposal changes", () => {
    const token = signProposal(proposal);
    expect(verifyProposal({ ...proposal, new_phone: "0399" }, token)).toBe(false);
    expect(verifyProposal({ ...proposal, patient_id: "someone-else" }, token)).toBe(false);
    expect(verifyProposal({ ...proposal, old_phone: "0000" }, token)).toBe(false);
  });

  it("rejects a garbage or empty token instead of throwing", () => {
    expect(verifyProposal(proposal, "")).toBe(false);
    expect(verifyProposal(proposal, "not-a-real-token")).toBe(false);
    expect(verifyProposal(proposal, "a")).toBe(false);
  });

  it("is not sensitive to key order — the same proposal always signs the same way", () => {
    const a = signProposal({ patient_id: "p1", old_phone: "0300", new_phone: "0301" });
    const b = signProposal({ new_phone: "0301", patient_id: "p1", old_phone: "0300" });
    expect(a).toBe(b);
  });

  it("produces a different token for a different secret", () => {
    const token = signProposal(proposal);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "a-different-secret";
    expect(verifyProposal(proposal, token)).toBe(false);
  });
});
