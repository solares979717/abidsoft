import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const sb = await createClient();
  const [clinic, settings, doctors, medicines, diagnoses, investigations, templates] = await Promise.all([
    sb.from("clinics").select("*").limit(1).single(),
    sb.from("clinic_settings").select("*").limit(1).single(),
    sb.from("doctors").select("*").order("sort_order"),
    sb.from("medicines").select("id, name, generic_name, strength, form").order("name").limit(500),
    sb.from("diagnosis_catalog").select("id, name").order("name").limit(500),
    sb.from("investigation_catalog").select("id, name, category, price").order("name"),
    sb.from("prescription_templates").select("id, name, doctor_id, items, doctors(full_name)")
      .order("name"),
  ]);

  return (
    <SettingsClient
      clinic={clinic.data}
      settings={settings.data}
      doctors={doctors.data ?? []}
      medicines={medicines.data ?? []}
      diagnoses={diagnoses.data ?? []}
      investigations={investigations.data ?? []}
      templates={(templates.data ?? []).map((t) => ({
        ...t,
        doctors: Array.isArray(t.doctors) ? (t.doctors[0] ?? null) : t.doctors,
      }))}
    />
  );
}
