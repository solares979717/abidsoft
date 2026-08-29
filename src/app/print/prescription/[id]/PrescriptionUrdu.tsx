import { UR, UR_FREQUENCY, UR_DURATION, UR_ROUTE, UR_INSTRUCTION, UR_DOSE,
  UR_ADVICE, ur, urNum, urDate } from "@/lib/urdu";

type Item = {
  medicine_name: string; strength: string; dose: string; frequency: string;
  duration: string; route: string; instructions: string[];
  instruction_other: string; sort_order: number;
};

/**
 * The Urdu face of the prescription.
 *
 * Medicine names stay in Latin script exactly as the doctor entered them —
 * a pharmacist matches them against the box, and Urdu spellings of similar
 * drug names are too easy to confuse. Everything around them (how often,
 * how long, before or after food, the advice) is printed in Urdu from the
 * fixed table in lib/urdu.ts.
 *
 * Free text the doctor typed themselves is reproduced unchanged. Guessing a
 * translation of a doctor's own words is not something this should do.
 */
export function PrescriptionUrdu({
  clinic, doctor, patient, date, vitals, complaints, diagnoses, items, tests,
  advice, followUp, allergies,
}: {
  clinic: { name: string; address: string | null; phone_1: string | null; phone_2: string | null };
  doctor: { full_name: string; qualification: string | null; affiliation: string | null };
  patient: { full_name: string; patient_no: string; age: string; gender: string | null; phone: string | null };
  date: string;
  vitals: Record<string, number | string> | null;
  complaints: { complaint: string; duration_value: number | null; duration_unit: string | null }[];
  diagnoses: string[];
  items: Item[];
  tests: { test_name: string; result_text: string | null; result_flag: string | null }[];
  advice: string | null;
  followUp: string | null;
  allergies: { allergy_type: string; detail: string | null }[];
}) {
  const vitalBits = vitals ? [
    vitals.bp_systolic && `BP ${urNum(String(vitals.bp_systolic))}/${urNum(String(vitals.bp_diastolic))}`,
    vitals.pulse && `نبض ${urNum(String(vitals.pulse))}`,
    vitals.temperature && `درجہ حرارت ${urNum(String(vitals.temperature))}°${vitals.temp_unit ?? "C"}`,
    vitals.weight_kg && `وزن ${urNum(String(vitals.weight_kg))} کلو`,
    vitals.spo2 && `آکسیجن ${urNum(String(vitals.spo2))}%`,
  ].filter(Boolean) as string[] : [];

  // Advice is stored as sentences joined with ". " — translate the ones that
  // came from the standing list, leave anything typed by hand as it is.
  const adviceParts = (advice ?? "")
    .split(".")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => ur(UR_ADVICE, a));

  return (
    <div className="urdu text-black">
      <header className="mb-5 flex items-start justify-between gap-6 border-b-[3px] pb-3"
        style={{ borderColor: "#1656A6" }}>
        <div className="text-right">
          <h1 className="text-[19px] font-semibold leading-tight">{clinic.name}</h1>
          <p className="mt-0.5 text-[12px] text-black/70">{clinic.address}</p>
          <p className="text-[12px] text-black/70" dir="ltr">
            {[clinic.phone_1, clinic.phone_2].filter(Boolean).join("   ·   ")}
          </p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-[15px] font-semibold">{doctor.full_name}</p>
          <p className="text-[12px] text-black/70">{doctor.qualification}</p>
          <p className="text-[12px] text-black/70">{doctor.affiliation}</p>
        </div>
      </header>

      <section className="mb-4 flex items-start justify-between gap-4 rounded-[4px] bg-[#F5F7FA] px-3 py-2.5 text-[12px]">
        <div>
          <p className="text-[14px] font-semibold">{patient.full_name}</p>
          <p className="mt-0.5 text-black/70">
            <span dir="ltr">{patient.patient_no}</span>
            {patient.age && <> · {UR.age} {patient.age}</>}
            {patient.gender && <> · {patient.gender === "male" ? UR.gender_male : UR.gender_female}</>}
          </p>
        </div>
        <div className="text-left">
          <p className="font-medium">{urDate(date)}</p>
          {patient.phone && <p className="mt-0.5 text-black/70" dir="ltr">{patient.phone}</p>}
        </div>
      </section>

      {allergies.length > 0 && (
        <p className="mb-4 rounded-[4px] border-[1.5px] px-3 py-2 text-[12px] font-semibold"
          style={{ borderColor: "#A81E1E", background: "#FBECEC" }}>
          ⚠ {UR.allergy} — {allergies.map((a) => [a.allergy_type, a.detail].filter(Boolean).join(": ")).join("، ")}
        </p>
      )}

      {vitalBits.length > 0 && (
        <p className="mb-3 flex flex-wrap gap-x-4 rounded-[4px] bg-[#F5F7FA] px-3 py-2 text-[12px]">
          {vitalBits.map((t, i) => <span key={i} dir="rtl">{t}</span>)}
        </p>
      )}

      {complaints.length > 0 && (
        <p className="mb-2 text-[12px]">
          <span className="ml-1.5 text-black/60">{UR.complaint}:</span>
          {complaints.map((c) =>
            `${c.complaint}${c.duration_value ? ` (${urNum(String(c.duration_value))} ${ur(UR_DURATION, c.duration_unit ?? "")})` : ""}`
          ).join("، ")}
        </p>
      )}

      {diagnoses.length > 0 && (
        <p className="mb-4 text-[12px]">
          <span className="ml-1.5 text-black/60">{UR.diagnosis}:</span>
          <span className="font-semibold">{diagnoses.join("، ")}</span>
        </p>
      )}

      <div className="mb-2 flex items-center gap-2 border-b-[1.5px] pb-1.5" style={{ borderColor: "#1656A6" }}>
        <span className="text-[22px] font-semibold leading-none" style={{ color: "#1656A6" }} dir="ltr">℞</span>
        <span className="text-[12px] text-black/60">{UR.prescription}</span>
      </div>

      <ol className="mb-5 divide-y divide-[#E3E8EF]">
        {items.map((m, i) => (
          <li key={i} className="py-2.5 first:pt-1">
            {/* The medicine name itself stays in Latin script, left to right. */}
            <p className="text-[13px] font-semibold">
              <span className="ml-2 inline-block w-5 text-black/50">{urNum(i + 1)}.</span>
              <span dir="ltr" style={{ fontFamily: "var(--font-sans)" }}>
                {m.medicine_name}{m.strength ? ` ${m.strength}` : ""}
              </span>
            </p>
            <p className="pr-7 text-[12px] text-black/80">
              {[
                ur(UR_DOSE, m.dose) || m.dose,
                ur(UR_FREQUENCY, m.frequency),
                ur(UR_DURATION, m.duration),
                ur(UR_ROUTE, m.route),
              ].filter(Boolean).join("   ·   ")}
            </p>
            {(m.instructions?.length > 0 || m.instruction_other) && (
              <p className="pr-7 pt-1 text-[11px]">
                {[...(m.instructions ?? []).map((x) => ur(UR_INSTRUCTION, x)), m.instruction_other]
                  .filter(Boolean)
                  .map((tag, j) => (
                    <span key={j} className="ml-1.5 inline-block rounded-[3px] border px-1.5 py-0.5"
                      style={{ borderColor: "#CBD4E1", color: "#48586B" }}>{tag}</span>
                  ))}
              </p>
            )}
          </li>
        ))}
      </ol>

      {tests.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 border-b pb-1" style={{ borderColor: "#1656A6" }}>
            <span className="text-[12px] text-black/60">{UR.investigations}</span>
          </div>
          <ol className="text-[12px]">
            {tests.map((t, i) => (
              <li key={i} className="py-0.5">
                <span className="ml-2 inline-block w-5 text-black/50">{urNum(i + 1)}.</span>
                <span dir="ltr" style={{ fontFamily: "var(--font-sans)" }}>{t.test_name}</span>
                {t.result_text && (
                  <> — <span dir="ltr" className={t.result_flag === "abnormal" ? "font-semibold" : ""}
                    style={{ fontFamily: "var(--font-sans)" }}>{t.result_text}</span></>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {adviceParts.length > 0 && (
        <div className="mb-4 text-[12px]">
          <span className="ml-1.5 text-black/60">{UR.advice}:</span>
          {adviceParts.join("، ")}
        </div>
      )}

      {followUp && (
        <p className="mb-4 inline-block rounded-[4px] px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "#EAF1FA", color: "#0E3C77" }}>
          {UR.followUp}: {urDate(followUp)}
        </p>
      )}

      <footer className="mt-14 flex justify-start">
        <div className="w-48 border-t border-black pt-1 text-center text-[11px]">
          {doctor.full_name}
        </div>
      </footer>
    </div>
  );
}
