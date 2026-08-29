import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

/** Portal tokens are random, hashed at rest, expiring and revocable. */
export async function POST(req: Request) {
  const { patient_id, items, days } = await req.json();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: prof } = await sb.from("profiles").select("clinic_id").eq("id", user.id).single();
  if (!prof) return NextResponse.json({ error: "No clinic" }, { status: 403 });

  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + (Number(days) || 14) * 86400000);

  const { data: row, error } = await sb.from("portal_tokens").insert({
    clinic_id: prof.clinic_id, patient_id, token_hash: hash,
    expires_at: expires.toISOString(), created_by: user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const validItems = (items as string[]).filter((t) =>
    ["summary", "prescription", "lab_report", "imaging", "bill"].includes(t));
  if (validItems.length > 0) {
    const { error: shareError } = await sb.from("portal_shared_items").insert(
      validItems.map((t) => ({ clinic_id: prof.clinic_id, token_id: row.id, item_type: t }))
    );
    if (shareError) {
      // Don't leave a token behind that will show nothing when opened.
      await sb.from("portal_tokens").delete().eq("id", row.id);
      return NextResponse.json({ error: "Couldn't save what to share. Try again." }, { status: 400 });
    }
  }
  await sb.rpc("log_audit", {
    p_action: "portal.link_generated", p_entity: "portal_tokens",
    p_entity_id: row.id, p_meta: { patient_id, items },
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.json({ url: `${base}/portal/${token}`, expires_at: expires });
}

export async function DELETE(req: Request) {
  const { patient_id } = await req.json();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await sb.from("portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("patient_id", patient_id).is("revoked_at", null);
  await sb.rpc("log_audit", {
    p_action: "portal.link_revoked", p_entity: "patients",
    p_entity_id: patient_id, p_meta: {},
  });
  return NextResponse.json({ ok: true });
}
