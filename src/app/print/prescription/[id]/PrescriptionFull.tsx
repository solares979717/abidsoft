import { UR_FREQUENCY, UR_DURATION, UR_ROUTE, UR_INSTRUCTION, UR_ADVICE, ur } from "@/lib/urdu";
import { fmtDate, ageFromDob } from "@/lib/utils";

type Item = {
  medicine_name: string; strength: string; dose: string; frequency: string;
  duration: string; route: string; instructions: string[];
  instruction_other: string; sort_order: number;
};

/**
 * The full prescription sheet: everything about the visit on one page,
 * laid out the way the doctor asked for it.
 *
 * Findings run down the left (diagnosis, vitals, tests) and the plan runs
 * down the right (complaints, examination, medicines), so the sheet reads
 * as "what we found" beside "what to do".
 *
 * The medicine table carries English and Urdu together in each cell rather
 * than being one language or the other. The pharmacist reads the Latin
 * medicine name off the top line; the patient reads how and when to take it
 * underneath in Urdu. Medicine names are never translated — Urdu spellings
 * of similar drug names are dangerously easy to confuse.
 */
export function PrescriptionFull({
  clinic, doctor, patient, date, vitals, complaints, diagnoses, examination,
  items, tests, advice, followUp, allergies,
}: {
  clinic: { name: string; address: string | null; phone_1: string | null; phone_2: string | null };
  doctor: { full_name: string; qualification: string | null; affiliation: string | null };
  patient: { full_name: string; patient_no: string; dob: string | null; gender: string | null; phone: string | null };
  date: string;
  vitals: Record<string, number | string> | null;
  complaints: { complaint: string; duration_value: number | null; duration_unit: string | null }[];
  diagnoses: string[];
  examination: Record<string, string> | null;
  items: Item[];
  tests: { test_name: string; category: string; result_text: string | null; result_flag: string | null }[];
  advice: string | null;
  followUp: string | null;
  allergies: { allergy_type: string; detail: string | null }[];
}) {
  const vitalRows = vitals ? ([
    ["Pulse", vitals.pulse && `${vitals.pulse} /min`],
    ["Blood Pressure", vitals.bp_systolic && `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`],
    ["Temperature", vitals.temperature && `${vitals.temperature} °${vitals.temp_unit ?? "F"}`],
    ["SpO₂", vitals.spo2 && `${vitals.spo2} %`],
    ["Respiratory rate", vitals.resp_rate && `${vitals.resp_rate} /min`],
    ["Weight", vitals.weight_kg && `${vitals.weight_kg} kg`],
    ["Height", vitals.height_cm && `${vitals.height_cm} cm`],
  ] as const).filter(([, v]) => v) : [];

  const examRows = examination ? ([
    ["General", examination.general],
    ["Chest", examination.chest],
    ["CVS", examination.cvs],
    ["Abdomen", examination.abdomen],
    ["CNS", examination.cns],
  ] as const).filter(([, v]) => v) : [];

  const adviceParts = (advice ?? "").split(".").map((a) => a.trim()).filter(Boolean);

  return (
    <div className="text-black">
      <header className="mb-3 flex items-start justify-between gap-6 border-b-[3px] pb-2"
        style={{ borderColor: "#1656A6" }}>
        <div>
          <h1 className="display text-[18px] font-semibold leading-tight">{clinic.name}</h1>
          <p className="text-[10.5px] text-black/70">{clinic.address}</p>
          <p className="data text-[10.5px] text-black/70">
            {[clinic.phone_1, clinic.phone_2].filter(Boolean).join("   ·   ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold">{doctor.full_name}</p>
          <p className="text-[10.5px] text-black/70">{doctor.qualification}</p>
          <p className="text-[10.5px] text-black/70">{doctor.affiliation}</p>
        </div>
      </header>

      {/* patient strip */}
      <table className="mb-3 w-full border-collapse text-[10.5px]">
        <thead>
          <tr style={{ background: "#F5F7FA" }}>
            {["Patient", "MR No.", "Age", "Gender", "Phone", "Date"].map((h) => (
              <th key={h} className="border border-[#E3E8EF] px-2 py-1 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-[#E3E8EF] px-2 py-1 font-semibold">{patient.full_name}</td>
            <td className="data border border-[#E3E8EF] px-2 py-1">{patient.patient_no}</td>
            <td className="data border border-[#E3E8EF] px-2 py-1">{ageFromDob(patient.dob)}</td>
            <td className="border border-[#E3E8EF] px-2 py-1">{patient.gender ?? "—"}</td>
            <td className="data border border-[#E3E8EF] px-2 py-1">{patient.phone ?? "—"}</td>
            <td className="data border border-[#E3E8EF] px-2 py-1">{fmtDate(date)}</td>
          </tr>
        </tbody>
      </table>

      {allergies.length > 0 && (
        <p className="mb-3 rounded-[3px] border-[1.5px] px-2 py-1 text-[11px] font-semibold"
          style={{ borderColor: "#A81E1E", background: "#FBECEC" }}>
          ⚠ ALLERGY — {allergies.map((a) => [a.allergy_type, a.detail].filter(Boolean).join(": ")).join("; ")}
        </p>
      )}

      <div className="grid grid-cols-[34%_1fr] gap-4">
        {/* ---------------- findings ---------------- */}
        <div className="space-y-3">
          {diagnoses.length > 0 && (
            <Section title="Diagnosis">
              <ul className="space-y-0.5">
                {diagnoses.map((d, i) => (
                  <li key={i} className="text-[11px] font-medium">• {d}</li>
                ))}
              </ul>
            </Section>
          )}

          {vitalRows.length > 0 && (
            <Section title="Vitals">
              <ul className="space-y-0.5">
                {vitalRows.map(([l, v]) => (
                  <li key={l} className="text-[11px]">
                    <span className="text-black/60">{l}:</span>{" "}
                    <span className="data">{v}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tests.length > 0 && (
            <Section title="Lab Tests">
              <ul className="space-y-1">
                {tests.map((t, i) => (
                  <li key={i} className="text-[11px]">
                    • {t.test_name}
                    {t.result_text && (
                      <span className={`data block pl-2 ${
                        t.result_flag === "abnormal" ? "font-semibold" : "text-black/70"}`}>
                        {t.result_text}{t.result_flag === "abnormal" && " (abnormal)"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ---------------- plan ---------------- */}
        <div className="space-y-3">
          {complaints.length > 0 && (
            <Section title="Complaints">
              <p className="text-[11px]">
                {complaints.map((c) =>
                  `${c.complaint}${c.duration_value ? ` — ${c.duration_value} ${c.duration_unit ?? ""}` : ""}`
                ).join(", ")}
              </p>
            </Section>
          )}

          {examRows.length > 0 && (
            <Section title="Examination">
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {examRows.map(([l, v]) => (
                    <tr key={l}>
                      <td className="border border-[#E3E8EF] px-2 py-0.5 text-black/60"
                        style={{ width: "40%" }}>{l}</td>
                      <td className={`border border-[#E3E8EF] px-2 py-0.5 ${
                        v === "abnormal" ? "font-semibold" : ""}`}>{v}</td>
                    </tr>
                  ))}
                  {examination?.other_findings && (
                    <tr>
                      <td className="border border-[#E3E8EF] px-2 py-0.5 text-black/60">Other</td>
                      <td className="border border-[#E3E8EF] px-2 py-0.5">{examination.other_findings}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>
          )}

          {items.length > 0 && (
            <Section title="Medicines" accent>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr style={{ background: "#F5F7FA" }}>
                    {["Medicine", "Duration", "Frequency", "Instructions"].map((h) => (
                      <th key={h} className="border border-[#E3E8EF] px-2 py-1 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((m, i) => (
                    <tr key={i}>
                      <td className="border border-[#E3E8EF] px-2 py-1 align-top">
                        <span className="font-semibold">
                          {i + 1}. {m.medicine_name}{m.strength ? ` (${m.strength})` : ""}
                        </span>
                        {m.dose && <span className="data block text-black/70">{m.dose}</span>}
                      </td>
                      <Bi en={m.duration} ur={ur(UR_DURATION, m.duration)} />
                      <Bi en={m.frequency} ur={ur(UR_FREQUENCY, m.frequency)} />
                      <td className="border border-[#E3E8EF] px-2 py-1 align-top">
                        {[...(m.instructions ?? []), m.instruction_other].filter(Boolean).map((t, j) => (
                          <div key={j}>
                            <span>{t}</span>
                            <span className="urdu-inline block text-[11px] text-black/70">
                              {ur(UR_INSTRUCTION, t)}
                            </span>
                          </div>
                        ))}
                        {m.route && (
                          <div className="mt-0.5 text-black/60">
                            {m.route}
                            <span className="urdu-inline block text-[11px]">{ur(UR_ROUTE, m.route)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {adviceParts.length > 0 && (
            <Section title="Advice">
              <ul className="space-y-0.5">
                {adviceParts.map((a, i) => (
                  <li key={i} className="text-[11px]">
                    • {a}
                    <span className="urdu-inline mr-2 text-black/70"> {ur(UR_ADVICE, a)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      {followUp && (
        <p className="mt-3 inline-block rounded-[3px] px-3 py-1 text-[11px] font-medium"
          style={{ background: "#EAF1FA", color: "#0E3C77" }}>
          Follow-up: <span className="data">{fmtDate(followUp)}</span>
          <span className="urdu-inline mr-2">اگلی ملاقات</span>
        </p>
      )}

      <footer className="mt-10 flex justify-end">
        <div className="w-48 border-t border-black pt-1 text-center text-[10px]">
          {doctor.full_name}
        </div>
      </footer>
    </div>
  );
}

/** One table cell carrying the English value with its Urdu underneath. */
function Bi({ en, ur: urdu }: { en: string; ur: string }) {
  return (
    <td className="border border-[#E3E8EF] px-2 py-1 align-top">
      <span>{en}</span>
      {urdu && urdu !== en && (
        <span className="urdu-inline block text-[11px] text-black/70">{urdu}</span>
      )}
    </td>
  );
}

function Section({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <section>
      <p className="mb-1 border-b pb-0.5 text-[11px] font-semibold"
        style={{ borderColor: accent ? "#1656A6" : "#E3E8EF", color: accent ? "#1656A6" : "#48586B" }}>
        {title}
      </p>
      {children}
    </section>
  );
}
