import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PrintFrame } from "../../PrintFrame";
import { Letterhead } from "../../Letterhead";
import { fmtDate, ageFromDob } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PrintPrescription({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: rx } = await sb.from("prescriptions")
    .select(`id, created_at, advice, visit_id, patient_id,
      patients(full_name, patient_no, dob, gender, phone),
      doctors(full_name, qualification, affiliation),
      prescription_items(medicine_name, strength, dose, frequency, duration, route, instructions, instruction_other, sort_order)`)
    .eq("id", id).single();
  if (!rx) notFound();

  const { data: clinic } = await sb.from("clinics")
    .select("name, address, phone_1, phone_2").limit(1).single();

  const [{ data: dx }, { data: fu }, { data: allergy }, { data: cc }, { data: tests }] =
    await Promise.all([
      sb.from("visit_diagnoses").select("diagnosis_text").eq("visit_id", rx.visit_id),
      sb.from("followups").select("follow_up_date").eq("visit_id", rx.visit_id).maybeSingle(),
      sb.from("patient_allergies").select("allergy_type, detail").eq("patient_id", rx.patient_id),
      sb.from("visit_complaints").select("complaint, duration_value, duration_unit")
        .eq("visit_id", rx.visit_id).order("sort_order"),
      sb.from("visit_investigations").select("test_name, category").eq("visit_id", rx.visit_id),
    ]);

  const p = rx.patients as unknown as { full_name: string; patient_no: string; dob: string; gender: string; phone: string };
  const d = rx.doctors as unknown as { full_name: string; qualification: string; affiliation: string };
  const items = ((rx.prescription_items as unknown as Item[]) ?? [])
    .sort((a, b) => a.sort_order - b.sort_order);
  const allergies = (allergy ?? []).filter((a) => a.allergy_type !== "No Known Allergy");

  // Plain-text version of this sheet, for sending on WhatsApp. Deliberately
  // mirrors what's printed so the patient gets the same information either way.
  const waSummary = [
    clinic?.name,
    `${p.full_name} (${p.patient_no}) · ${fmtDate(rx.created_at)}`,
    (cc ?? []).length > 0
      ? `\nComplaint: ${(cc ?? []).map((c) =>
          `${c.complaint}${c.duration_value ? ` (${c.duration_value} ${c.duration_unit ?? ""})` : ""}`
        ).join(", ")}` : "",
    (dx ?? []).length > 0
      ? `Diagnosis: ${(dx ?? []).map((x) => x.diagnosis_text).join(", ")}` : "",
    items.length > 0
      ? "\nPrescription:\n" + items.map((m, i) =>
          `${i + 1}. ${m.medicine_name}${m.strength ? " " + m.strength : ""} — ` +
          [m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")
        ).join("\n") : "",
    (tests ?? []).length > 0
      ? `\nInvestigations advised:\n` + (tests ?? []).map((t, i) =>
          `${i + 1}. ${t.test_name}`).join("\n") : "",
    rx.advice ? `\nAdvice: ${rx.advice}` : "",
    fu ? `\nFollow-up: ${fmtDate(fu.follow_up_date)}` : "",
    `\n— ${d.full_name}`,
  ].filter(Boolean).join("\n");

  return (
    <PrintFrame size="A5" whatsapp={p.phone} summary={waSummary}
      backTo={`/patients/${rx.patient_id}?tab=visits`}>
      <Letterhead clinic={clinic!} doctor={d} />

      <section className="mb-4 flex items-start justify-between gap-4 rounded-[4px] bg-[#F5F7FA] px-3 py-2.5 text-[11px] text-black">
        <div>
          <p className="text-[13px] font-semibold">{p.full_name}</p>
          <p className="data mt-0.5 text-black/70">{p.patient_no} · {ageFromDob(p.dob)} · {p.gender}</p>
        </div>
        <div className="text-right">
          <p className="data font-medium">{fmtDate(rx.created_at)}</p>
          <p className="data mt-0.5 text-black/70">{p.phone}</p>
        </div>
      </section>

      {allergies.length > 0 && (
        <p className="mb-4 rounded-[4px] border-[1.5px] px-3 py-2 text-[11px] font-semibold text-black"
          style={{ borderColor: "#A81E1E", background: "#FBECEC" }}>
          ⚠ ALLERGY — {allergies.map((a) => [a.allergy_type, a.detail].filter(Boolean).join(": ")).join("; ")}
        </p>
      )}

      {(cc ?? []).length > 0 && (
        <p className="mb-2 text-[11px] text-black">
          <span className="label mr-1.5 text-black/60">Complaint</span>
          {(cc ?? []).map((c) =>
            `${c.complaint}${c.duration_value ? ` — ${c.duration_value} ${c.duration_unit ?? ""}` : ""}`
          ).join(", ")}
        </p>
      )}

      {(dx ?? []).length > 0 && (
        <p className="mb-4 text-[11px] text-black">
          <span className="label mr-1.5 text-black/60">Diagnosis</span>
          <span className="font-medium">{(dx ?? []).map((x) => x.diagnosis_text).join(", ")}</span>
        </p>
      )}

      <div className="mb-2 flex items-center gap-2 border-b-[1.5px] pb-1.5" style={{ borderColor: "#1656A6" }}>
        <span className="text-[22px] font-semibold leading-none" style={{ color: "#1656A6" }}>℞</span>
        <span className="label text-black/60">Prescription</span>
      </div>
      <ol className="mb-5 divide-y divide-[#E3E8EF]">
        {items.map((m, i) => (
          <li key={i} className="py-2.5 text-black first:pt-1">
            <p className="text-[13px] font-semibold">
              <span className="data mr-2 inline-block w-4 text-black/50">{i + 1}.</span>
              {m.medicine_name}{m.strength ? ` ${m.strength}` : ""}
            </p>
            <p className="data pl-6 text-[11.5px] text-black/80">
              {[m.dose, m.frequency, m.duration, m.route].filter(Boolean).join("   ·   ")}
            </p>
            {(m.instructions?.length > 0 || m.instruction_other) && (
              <p className="pl-6 pt-1 text-[10.5px]">
                {[...(m.instructions ?? []), m.instruction_other].filter(Boolean).map((tag, j) => (
                  <span key={j} className="mr-1.5 inline-block rounded-[3px] border px-1.5 py-0.5"
                    style={{ borderColor: "#CBD4E1", color: "#48586B" }}>{tag}</span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>

      {(tests ?? []).length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 border-b pb-1" style={{ borderColor: "#1656A6" }}>
            <span className="label text-black/60">Investigations advised</span>
          </div>
          <ol className="text-[11.5px] text-black">
            {(tests ?? []).map((t, i) => (
              <li key={i} className="py-0.5">
                <span className="data mr-2 inline-block w-4 text-black/50">{i + 1}.</span>
                {t.test_name}
                <span className="text-black/50"> · {t.category}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {rx.advice && (
        <p className="mb-3 text-[11px] text-black">
          <span className="label mr-1.5 text-black/60">Advice</span> {rx.advice}
        </p>
      )}

      {fu && (
        <p className="mb-4 inline-block rounded-[4px] px-3 py-1.5 text-[11px] font-medium"
          style={{ background: "#EAF1FA", color: "#0E3C77" }}>
          Follow-up: <span className="data">{fmtDate(fu.follow_up_date)}</span>
        </p>
      )}

      <footer className="mt-14 flex justify-end">
        <div className="w-48 border-t border-black pt-1 text-center text-[10px] text-black">
          {d.full_name}
        </div>
      </footer>
    </PrintFrame>
  );
}

type Item = {
  medicine_name: string; strength: string; dose: string; frequency: string;
  duration: string; route: string; instructions: string[]; instruction_other: string;
  sort_order: number;
};
