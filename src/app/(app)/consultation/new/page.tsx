import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/consultation/Workspace";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewConsultation({
  searchParams,
}: { searchParams: Promise<{ patient?: string; appointment?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const [doctors, complaints, diagnoses, medicines, investigations, settings, templates] = await Promise.all([
    sb.from("doctors").select("id, full_name, consultation_fee")
      .eq("is_active", true).order("sort_order"),
    sb.from("complaint_catalog").select("id, name").eq("is_active", true).order("name"),
    sb.from("diagnosis_catalog").select("id, name").eq("is_active", true).order("name").limit(400),
    sb.from("medicines").select("id, name, strength, form").eq("is_active", true).order("name").limit(600),
    sb.from("investigation_catalog").select("id, name, category, price")
      .eq("is_active", true).order("name"),
    sb.from("clinic_settings").select("default_consultation_fee").single(),
    sb.from("prescription_templates").select("id, name, doctor_id, items").order("name"),
  ]);

  let patient = null, previousRx = null, previousVisitId: string | undefined, allergies: string[] = [];

  if (sp.patient) {
    const { data } = await sb.from("patients")
      .select("id, patient_no, full_name, phone, whatsapp, dob, gender, address, primary_doctor_id")
      .eq("id", sp.patient).single();
    if (!data) notFound();
    patient = data;

    const { data: last } = await sb.from("visits")
      .select("id").eq("patient_id", sp.patient).eq("is_deleted", false)
      .order("visit_date", { ascending: false }).limit(1).maybeSingle();
    previousVisitId = last?.id;

    if (last) {
      const { data: rx } = await sb.from("prescriptions")
        .select("id, prescription_items(medicine_id, medicine_name, strength, dose, frequency, duration, route, instructions)")
        .eq("visit_id", last.id).eq("is_deleted", false).maybeSingle();
      if (rx) previousRx = { id: rx.id, items: rx.prescription_items ?? [] };
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
        previousVisitId={previousVisitId}
        previousRx={previousRx}
        knownAllergies={allergies}
        defaultFee={Number(settings.data?.default_consultation_fee ?? 1000)}
        templates={templates.data ?? []}
      />
    </div>
  );
}
