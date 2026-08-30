import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/consultation/Workspace";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewConsultation({
  searchParams,
}: { searchParams: Promise<{ patient?: string; appointment?: string; name?: string; phone?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const [doctors, complaints, diagnoses, medicines, investigations, settings, templates, adviceRows] = await Promise.all([
    sb.from("doctors").select("id, full_name, consultation_fee")
      .eq("is_active", true).order("sort_order"),
    sb.from("complaint_catalog").select("id, name").eq("is_active", true).order("name"),
    sb.from("diagnosis_catalog").select("id, name").eq("is_active", true).order("name").limit(400),
    sb.from("medicines").select("id, name, strength, form").eq("is_active", true).order("name").limit(600),
    sb.from("investigation_catalog").select("id, name, category, price")
      .eq("is_active", true).order("name"),
    sb.from("clinic_settings").select("default_consultation_fee").single(),
    sb.from("prescription_templates").select("id, name, doctor_id, items").order("name"),
    sb.from("advice_catalog").select("text").eq("is_active", true).order("sort_order"),
  ]);

  let patient = null, previousRx = null, previousVisitId: string | undefined, allergies: string[] = [];
  let lastVisit: {
    date: string; doctor: string | null; diagnoses: string[];
    investigations: string[]; medicines: string[];
  } | null = null;

  if (sp.patient) {
    const { data } = await sb.from("patients")
      .select("id, patient_no, full_name, phone, whatsapp, dob, gender, address, primary_doctor_id")
      .eq("id", sp.patient).eq("is_deleted", false).single();
    if (!data) notFound();
    patient = data;

    // The last visit's headline facts, shown at the top of the workspace so
    // the doctor doesn't have to leave the form to remember what happened
    // last time.
    const { data: last } = await sb.from("visits")
      .select(`id, visit_date, doctors(full_name),
        visit_diagnoses(diagnosis_text), visit_investigations(test_name)`)
      .eq("patient_id", sp.patient).eq("is_deleted", false)
      .order("visit_date", { ascending: false }).limit(1).maybeSingle();
    previousVisitId = last?.id;

    if (last) {
      const { data: rx } = await sb.from("prescriptions")
        .select("id, prescription_items(medicine_id, medicine_name, strength, dose, frequency, duration, route, instructions)")
        .eq("visit_id", last.id).eq("is_deleted", false).maybeSingle();
      if (rx) previousRx = { id: rx.id, items: rx.prescription_items ?? [] };

      const doc = last.doctors as unknown as { full_name: string } | null;
      lastVisit = {
        date: last.visit_date as string,
        doctor: doc?.full_name ?? null,
        diagnoses: ((last.visit_diagnoses as unknown as { diagnosis_text: string }[]) ?? [])
          .map((d) => d.diagnosis_text),
        investigations: ((last.visit_investigations as unknown as { test_name: string }[]) ?? [])
          .map((t) => t.test_name),
        medicines: ((rx?.prescription_items as unknown as { medicine_name: string }[]) ?? [])
          .map((m) => m.medicine_name),
      };
    }

    const { data: al } = await sb.from("patient_allergies")
      .select("allergy_type").eq("patient_id", sp.patient)
      .order("created_at", { ascending: false }).limit(5);
    allergies = [...new Set((al ?? []).map((a) => a.allergy_type))];
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-[24px] text-ink">
          {patient ? `New visit — ${patient.full_name}` : "New patient & first consultation"}
        </h1>
        <p className="text-[13px] text-ink-3">
          Registration, consultation, prescription, follow-up and billing in one save.
        </p>
      </div>
      <Workspace
        doctors={doctors.data ?? []}
        catalogs={{
          complaints: complaints.data ?? [],
          diagnoses: diagnoses.data ?? [],
          medicines: medicines.data ?? [],
          investigations: (investigations.data ?? []).map((i) => ({ ...i, price: Number(i.price) })),
        }}
        patient={patient}
        appointmentId={sp.appointment}
        prefillName={sp.name}
        prefillPhone={sp.phone}
        previousVisitId={previousVisitId}
        previousRx={previousRx}
        lastVisit={lastVisit}
        knownAllergies={allergies}
        defaultFee={Number(settings.data?.default_consultation_fee ?? 1000)}
        templates={templates.data ?? []}
        adviceOptions={(adviceRows.data ?? []).map((a) => a.text)}
      />
    </div>
  );
}
