import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PrintFrame } from "../../PrintFrame";
import { Letterhead } from "../../Letterhead";
import { money, fmtDate, ageFromDob } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PrintVisit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: v } = await sb.from("visits")
    .select(`*, patients(full_name, patient_no, dob, gender, phone),
      doctors(full_name, qualification, affiliation),
      visit_complaints(complaint, duration_value, duration_unit),
      vitals(*), physical_examinations(*), visit_diagnoses(diagnosis_text),
      visit_investigations(test_name, category, result_text, result_flag),
      prescriptions(advice, prescription_items(medicine_name, strength, dose, frequency, duration, instructions)),
      followups(follow_up_date),
      invoices(net_total, paid_total, due_total)`)
    .eq("id", id).single();
  if (!v) notFound();

  const { data: clinic } = await sb.from("clinics")
    .select("name, address, phone_1, phone_2").limit(1).single();

  // Allergies live on the patient, not the visit — they must appear on every
  // printed sheet the doctor might hand over or file.
  const { data: allergyRows } = await sb.from("patient_allergies")
    .select("allergy_type, detail").eq("patient_id", v.patient_id);
  const allergies = (allergyRows ?? [])
    .filter((a) => a.allergy_type && a.allergy_type !== "No Known Allergy");

  const p = v.patients as unknown as { full_name: string; patient_no: string; dob: string; gender: string; phone: string };
  const d = v.doctors as unknown as { full_name: string; qualification: string; affiliation: string };
  const vt = (v.vitals as unknown as Record<string, number>[])?.[0];
  const ex = (v.physical_examinations as unknown as Record<string, string>[])?.[0];
  const rx = (v.prescriptions as unknown as { advice: string; prescription_items: Med[] }[])?.[0];
  const inv = (v.invoices as unknown as Record<string, number>[])?.[0];
  const fu = (v.followups as unknown as { follow_up_date: string }[])?.[0];

  const complaints = (v.visit_complaints as unknown as C[]) ?? [];
  const diagnoses = (v.visit_diagnoses as unknown as { diagnosis_text: string }[]) ?? [];
  const investigations = (v.visit_investigations as unknown as
    { test_name: string; result_text: string | null; result_flag: string | null }[]) ?? [];
  const meds = rx?.prescription_items ?? [];

  const waSummary = [
    clinic?.name,
    `${p.full_name} (${p.patient_no}) · ${fmtDate(v.visit_date)}`,
    complaints.length > 0
      ? `\nComplaint: ${complaints.map((c) =>
          `${c.complaint}${c.duration_value ? ` (${c.duration_value} ${c.duration_unit ?? ""})` : ""}`
        ).join(", ")}` : "",
    diagnoses.length > 0
      ? `Diagnosis: ${diagnoses.map((x) => x.diagnosis_text).join(", ")}` : "",
    investigations.length > 0
      ? `\nInvestigations: ${investigations.map((t) => t.test_name).join(", ")}` : "",
    meds.length > 0
      ? "\nPrescription:\n" + meds.map((m, i) =>
          `${i + 1}. ${m.medicine_name}${m.strength ? " " + m.strength : ""} — ` +
          [m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")
        ).join("\n") : "",
    fu ? `\nFollow-up: ${fmtDate(fu.follow_up_date)}` : "",
    inv ? `\nNet ${money(Number(inv.net_total))} · Paid ${money(Number(inv.paid_total))}` +
          (Number(inv.due_total) > 0 ? ` · Due ${money(Number(inv.due_total))}` : "") : "",
    `\n— ${d.full_name}`,
  ].filter(Boolean).join("\n");

  return (
    <PrintFrame size="A4" whatsapp={p.phone} summary={waSummary}
      backTo={`/patients/${v.patient_id}?tab=visits`}>
      <Letterhead clinic={clinic!} doctor={d} />
      <h2 className="display mb-4 text-[16px] font-semibold text-black">Visit summary</h2>

      <div className="mb-5 flex items-start justify-between rounded-[4px] bg-[#F5F7FA] px-3 py-2.5 text-[11px] text-black">
        <div>
          <p className="text-[13px] font-semibold">{p.full_name}</p>
          <p className="data mt-0.5 text-black/70">{p.patient_no} · {ageFromDob(p.dob)} · {p.gender}</p>
        </div>
        <p className="data text-right text-black/70">
          {fmtDate(v.visit_date)}<br />{v.visit_type.replace(/_/g, " ")}
        </p>
      </div>

      {allergies.length > 0 && (
        <p className="mb-4 rounded-[4px] border-[1.5px] px-3 py-2 text-[11px] font-semibold text-black"
          style={{ borderColor: "#A81E1E", background: "#FBECEC" }}>
          ⚠ ALLERGY — {allergies.map((a) => [a.allergy_type, a.detail].filter(Boolean).join(": ")).join("; ")}
        </p>
      )}

      <Block title="Complaints">
        {(v.visit_complaints as unknown as C[] ?? []).length > 0 ? (
          <ul className="space-y-1">
            {(v.visit_complaints as unknown as C[]).map((c, i) => (
              <li key={i}>
                {c.complaint}
                {c.duration_value ? <span className="data text-black/60"> — {c.duration_value} {c.duration_unit?.toLowerCase()}</span> : ""}
              </li>
            ))}
          </ul>
        ) : <p className="text-black/50">Not recorded.</p>}
      </Block>

      <Block title="Vitals">
        {vt ? (
          <p className="data flex flex-wrap gap-x-4 gap-y-1">
            {[vt.bp_systolic && `BP ${vt.bp_systolic}/${vt.bp_diastolic}`,
              vt.pulse && `Pulse ${vt.pulse}`,
              vt.temperature && `Temp ${vt.temperature}°${vt.temp_unit ?? "C"}`,
              vt.weight_kg && `Wt ${vt.weight_kg} kg`, vt.spo2 && `SpO₂ ${vt.spo2}%`,
            ].filter(Boolean).map((s, i) => <span key={i}>{s}</span>)}
          </p>
        ) : <p className="text-black/50">Not recorded.</p>}
      </Block>

      <Block title="Examination">
        {ex ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {[["General", ex.general], ["Chest", ex.chest], ["CVS", ex.cvs],
              ["Abdomen", ex.abdomen], ["CNS", ex.cns]]
              .filter(([, val]) => val)
              .map(([label, val]) => (
                <span key={label as string}>
                  {label}: <span className={val === "abnormal" ? "font-semibold" : ""}>{val}</span>
                </span>
              ))}
            {ex.other_findings && <span className="w-full">{ex.other_findings}</span>}
          </p>
        ) : <p className="text-black/50">Not recorded.</p>}
      </Block>

      <Block title="Diagnosis" accent>
        <p className="font-medium">{(v.visit_diagnoses as unknown as { diagnosis_text: string }[] ?? [])
          .map((x) => x.diagnosis_text).join(", ") || "Not recorded."}</p>
      </Block>

      <Block title="Investigations">
        {investigations.length === 0 ? <p className="text-black/50">None ordered.</p> : (
          <ul className="space-y-0.5">
            {investigations.map((t, i) => (
              <li key={i}>
                {t.test_name}
                {t.result_text && (
                  <>
                    {" — "}
                    <span className={t.result_flag === "abnormal" ? "font-semibold" : ""}>
                      {t.result_text}
                    </span>
                    {t.result_flag === "abnormal" && <span className="font-semibold"> (abnormal)</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Prescription" accent>
        {(rx?.prescription_items ?? []).length > 0 ? (
          <ol className="space-y-1.5">
            {(rx?.prescription_items ?? []).map((m, i) => (
              <li key={i} className="data">
                <span className="mr-1 text-black/50">{i + 1}.</span>
                <span className="font-medium">{m.medicine_name} {m.strength}</span>
                {" — "}{[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")}
                {m.instructions?.length ? <span className="text-black/60"> ({m.instructions.join(", ")})</span> : ""}
              </li>
            ))}
          </ol>
        ) : <p className="text-black/50">No prescription.</p>}
      </Block>

      <Block title="Follow-up">
        <p className="data">{fu ? fmtDate(fu.follow_up_date) : "None scheduled."}</p>
      </Block>

      <Block title="Billing">
        {inv ? (
          <p className="data">
            Net {money(Number(inv.net_total))} &nbsp;·&nbsp; Paid {money(Number(inv.paid_total))}
            {Number(inv.due_total) > 0 && (
              <span className="font-semibold" style={{ color: "#A81E1E" }}> &nbsp;·&nbsp; Due {money(Number(inv.due_total))}</span>
            )}
          </p>
        ) : <p className="text-black/50">No invoice.</p>}
      </Block>

      <footer className="mt-12 flex justify-end">
        <div className="w-48 border-t border-black pt-1 text-center text-[10px] text-black">
          {d.full_name}
        </div>
      </footer>
    </PrintFrame>
  );
}

type C = { complaint: string; duration_value: number; duration_unit: string };
type Med = { medicine_name: string; strength: string; dose: string; frequency: string; duration: string; instructions: string[] };

function Block({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className="mb-4 text-[11.5px] text-black">
      <p className="mb-1.5 border-b pb-1 text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ borderColor: accent ? "#1656A6" : "#E3E8EF", color: accent ? "#1656A6" : "#5B6876" }}>
        {title}
      </p>
      {children}
    </section>
  );
}
