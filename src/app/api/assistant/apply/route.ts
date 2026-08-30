import { createClient } from "@/lib/supabase/server";
import { verifyProposal } from "@/lib/assistantAuth";
import { NextResponse } from "next/server";

/**
 * The only endpoint that actually applies a change the assistant proposed.
 * Called once, only after the doctor presses Confirm in the assistant's
 * dialog. Three independent checks before anything is written:
 *   1. The signed token must match this exact proposal (not tampered with).
 *   2. The record's current value must still match what was proposed
 *      against, so a stale or double-submitted confirm can't silently
 *      overwrite a more recent change.
 *   3. The update itself goes through the normal signed-in Supabase client,
 *      so Row Level Security still applies — a forged token still can't
 *      reach another clinic's patient.
 */
export async function POST(req: Request) {
  const { patient_id, old_phone, new_phone, token } = (await req.json()) as {
    patient_id: string; old_phone: string | null; new_phone: string; token: string;
  };

  if (!patient_id || !new_phone || !token) {
    return NextResponse.json({ error: "Missing information." }, { status: 400 });
  }
  if (!verifyProposal({ patient_id, old_phone, new_phone }, token)) {
    return NextResponse.json({ error: "This confirmation is invalid or expired. Try asking again." }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: current } = await sb.from("patients").select("phone, full_name").eq("id", patient_id).single();
  if (!current) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  if (current.phone !== old_phone) {
    return NextResponse.json({
      error: "This patient's phone number has changed since that was proposed. Please ask again.",
    }, { status: 409 });
  }

  const { error } = await sb.from("patients").update({ phone: new_phone }).eq("id", patient_id);
  if (error) return NextResponse.json({ error: "Couldn't update the phone number." }, { status: 400 });

  await sb.rpc("log_audit", {
    p_action: "assistant.update_phone", p_entity: "patients", p_entity_id: patient_id,
    p_meta: { old_phone, new_phone },
  });

  return NextResponse.json({ ok: true, text: `Updated ${current.full_name}'s phone number to ${new_phone}.` });
}
