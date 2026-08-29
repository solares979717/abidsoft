"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormRow } from "@/components/ui/Field";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { useToast } from "@/components/ui/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import { isoDate } from "@/lib/utils";
import { APPT_TYPE } from "@/lib/constants";

export function NewAppointment({
  doctors, patients,
}: {
  doctors: { id: string; full_name: string }[];
  patients: { id: string; full_name: string; patient_no: string }[];
}) {
  const params = useSearchParams();
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const [patient, setPatient] = React.useState<{ id: string; label: string } | null>(
    (() => {
      const id = params.get("patient");
      const p = patients.find((x) => x.id === id);
      return p ? { id: p.id, label: p.full_name } : null;
    })()
  );
  const [doctorId, setDoctorId] = React.useState(doctors[0]?.id ?? "");
  const [date, setDate] = React.useState(isoDate(new Date()));
  const [time, setTime] = React.useState("10:00");
  const [type, setType] = React.useState("new_patient");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();

  async function create() {
    if (!patient) return toast("Choose a patient first.", "error");
    setBusy(true);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from("profiles").select("clinic_id").eq("id", user!.id).single();
    const { error } = await sb.from("appointments").insert({
      clinic_id: prof!.clinic_id, patient_id: patient.id, doctor_id: doctorId,
      scheduled_at: new Date(`${date}T${time}`).toISOString(),
      appt_type: type, status: "scheduled", notes, created_by: user!.id,
    });
    setBusy(false);
    if (error) return toast(`Couldn't create the appointment. ${error.message}`, "error");
    toast("Appointment created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New appointment</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New appointment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={busy}>Create appointment</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormRow label="Patient" required>
            {patient ? (
              <div className="flex items-center justify-between rounded-[6px] border border-line-strong px-3 py-2">
                <span className="text-[14px]">{patient.label}</span>
                <button className="text-[13px] text-primary" onClick={() => setPatient(null)}>Change</button>
              </div>
            ) : (
              <SearchSelect
                options={patients.map((p) => ({ id: p.id, label: p.full_name, sub: p.patient_no }))}
                onPick={(o) => setPatient({ id: o.id, label: o.label })}
                placeholder="Search patient by name…"
              />
            )}
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Doctor" required>
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {APPT_TYPE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormRow>
            <FormRow label="Time" required>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </FormRow>
          </div>
          <FormRow label="Quick times">
            <ChipGrid size="sm" multiple={false} value={[time]} onChange={(v) => setTime(v[0] ?? time)}
              options={["09:00", "10:00", "11:00", "12:00", "15:00", "16:00", "17:00"]} />
          </FormRow>
          <FormRow label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormRow>
        </div>
      </Modal>
    </>
  );
}
