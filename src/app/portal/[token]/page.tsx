import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { money, fmtDate, ageFromDob } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Public patient portal.
 * Reads only what the doctor explicitly shared. Private visit notes are
 * never selected from the database here, so they cannot leak.
 */
export default async function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const sb = createAdminClient();

  const { data: t } = await sb.from("portal_tokens")
    .select("id, patient_id, clinic_id, expires_at, revoked_at")
    .eq("token_hash", hash).maybeSingle();

  if (!t || t.revoked_at || new Date(t.expires_at) < new Date()) {
    return (
      <Shell>
        <p className="text-[15px] text-ink">This link is no longer valid.</p>
        <p className="mt-1 text-[13px] text-ink-2">
          Ask the clinic for a new link on 0341 4118069 or 0342 5851301.
        </p>
      </Shell>
    );
  }

  await sb.rpc("portal_register_view", { p_token_hash: hash });

  const { data: shared } = await sb.from("portal_shared_items")
    .select("item_type").eq("token_id", t.id);
  const allow = new Set((shared ?? []).map((s: { item_type: string }) => s.item_type));

  const [{ data: patient }, { data: clinic }, { data: visits }, { data: rxs }, { data: invs }, { data: labs }] =
    await Promise.all([
      sb.from("patients").select("full_name, patient_no, dob, gender").eq("id", t.patient_id).single(),
      sb.from("clinics").select("name, address, phone_1, phone_2").eq("id", t.clinic_id).single(),
      sb.from("visits")
        .select("id, visit_date, doctors(full_name), visit_diagnoses(diagnosis_text)")
        .eq("patient_id", t.patient_id).eq("is_deleted", false)
        .order("visit_date", { ascending: false }).limit(10),
      sb.from("prescriptions")
        .select("id, created_at, prescription_items(medicine_name, strength, dose, frequency, duration, instructions)")
        .eq("patient_id", t.patient_id).eq("is_deleted", false)
        .order("created_at", { ascending: false }).limit(5),
      sb.from("invoices").select("invoice_no, created_at, net_total, paid_total, due_total")
        .eq("patient_id", t.patient_id).eq("is_deleted", false)
        .order("created_at", { ascending: false }).limit(5),
      sb.from("visit_investigations").select("test_name, category, status, ordered_at")
        .eq("patient_id", t.patient_id).order("ordered_at", { ascending: false }).limit(10),
    ]);

  return (
    <Shell clinic={clinic}>
      <h1 className="display text-[20px] text-ink">{patient?.full_name}</h1>
      <p className="data text-[13px] text-ink-3">
        {patient?.patient_no} · {ageFromDob(patient?.dob)} · {patient?.gender}
      </p>

      {allow.has("summary") && (
        <Box title="Visits">
          {(visits ?? []).map((v: PVisit) => {
            const d = v.doctors as unknown as { full_name: string } | null;
            const dx = (v.visit_diagnoses as unknown as { diagnosis_text: string }[] ?? [])
              .map((x) => x.diagnosis_text).join(", ");
            return (
              <div key={v.id} className="border-b border-line py-2 last:border-0">
                <p className="data text-[14px]">{fmtDate(v.visit_date)}</p>
                <p className="text-[13px] text-ink-2">{d?.full_name}{dx && ` · ${dx}`}</p>
              </div>
            );
          })}
          {!visits?.length && <p className="text-[13px] text-ink-3">No visits.</p>}
        </Box>
      )}

      {allow.has("prescription") && (
        <Box title="Prescriptions">
          {(rxs ?? []).map((r: PRx) => (
            <div key={r.id} className="border-b border-line py-2 last:border-0">
              <p className="data text-[14px]">{fmtDate(r.created_at)}</p>
              {((r.prescription_items as unknown as Med[]) ?? []).map((m, i) => (
                <p key={i} className="data text-[13px] text-ink-2">
                  {m.medicine_name} {m.strength} — {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")}
                  {m.instructions?.length ? ` (${m.instructions.join(", ")})` : ""}
                </p>
              ))}
            </div>
          ))}
          {!rxs?.length && <p className="text-[13px] text-ink-3">No prescriptions.</p>}
        </Box>
      )}

      {(allow.has("lab_report") || allow.has("imaging")) && (
        <Box title="Investigations">
          {(labs ?? [])
            .filter((l: PLab) => (l.category === "Laboratory" ? allow.has("lab_report") : allow.has("imaging")))
            .map((l: PLab, i: number) => (
              <div key={i} className="flex justify-between border-b border-line py-2 last:border-0">
                <span className="text-[14px]">{l.test_name}</span>
                <span className="text-[13px] text-ink-2">{l.status}</span>
              </div>
            ))}
        </Box>
      )}

      {allow.has("bill") && (
        <Box title="Bills">
          {(invs ?? []).map((i: PInv) => (
            <div key={i.invoice_no} className="flex justify-between border-b border-line py-2 last:border-0">
              <span className="data text-[13px]">{i.invoice_no} · {fmtDate(i.created_at)}</span>
              <span className="data text-[13px]">
                {money(Number(i.net_total))}
                {Number(i.due_total) > 0 && (
                  <span className="font-semibold text-danger"> · {money(Number(i.due_total))} due</span>
                )}
              </span>
            </div>
          ))}
          {!invs?.length && <p className="text-[13px] text-ink-3">No bills.</p>}
        </Box>
      )}
    </Shell>
  );
}

type PVisit = { id: string; visit_date: string; doctors: unknown; visit_diagnoses: unknown };
type PRx = { id: string; created_at: string; prescription_items: unknown };
type PLab = { test_name: string; category: string; status: string; ordered_at: string };
type PInv = { invoice_no: string; created_at: string; net_total: number; paid_total: number; due_total: number };
type Med = { medicine_name: string; strength: string; dose: string; frequency: string; duration: string; instructions: string[] };

function Shell({ children, clinic }: {
  children: React.ReactNode;
  clinic?: { name: string; address: string | null; phone_1: string | null; phone_2: string | null } | null;
}) {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-8">
      <header className="mb-5 border-b border-line pb-3">
        <p className="display text-[15px] text-ink">
          {clinic?.name ?? "Shafiq Medical & Diagnostic Center"}
        </p>
        <p className="data text-[12px] text-ink-3">
          {clinic?.address ?? "Main Road, Kala Kelay, Swat"}
          {clinic?.phone_1 && ` · ${clinic.phone_1}`}
        </p>
      </header>
      {children}
      <p className="mt-8 text-center text-[12px] text-ink-3">
        This link expires and can be withdrawn by the clinic at any time.
      </p>
    </main>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-[6px] border border-line bg-paper">
      <p className="label border-b border-line px-4 py-2.5">{title}</p>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}
