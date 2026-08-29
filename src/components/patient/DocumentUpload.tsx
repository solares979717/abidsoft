"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input, FormRow } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

const TYPES: { value: string; label: string }[] = [
  { value: "lab_report", label: "Lab Report" },
  { value: "imaging", label: "Imaging" },
  { value: "previous_record", label: "Previous Record" },
  { value: "other", label: "Other" },
];

export function DocumentUpload({ patientId, visitId }: { patientId: string; visitId?: string }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState(TYPES[0].value);
  const [desc, setDesc] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  async function upload() {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast("File is larger than 15 MB.", "error");
    setBusy(true);
    const path = `${patientId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await sb.storage.from("documents").upload(path, file);
    if (error) { setBusy(false); return toast("Upload failed. Try again.", "error"); }

    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from("profiles").select("clinic_id").eq("id", user!.id).single();
    const { error: e2 } = await sb.from("documents").insert({
      clinic_id: prof!.clinic_id, patient_id: patientId, visit_id: visitId ?? null,
      doc_type: type, description: desc, storage_path: path,
      file_name: file.name, mime_type: file.type, file_size: file.size, uploaded_by: user!.id,
    });
    setBusy(false);
    if (e2) return toast("Saved the file but not the record. Try again.", "error");
    setFile(null); setDesc("");
    toast("Document uploaded");
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Upload document" sub="PDF, JPG or PNG up to 15 MB" />
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <FormRow label="File" className="md:col-span-2">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-[13px] file:mr-3 file:rounded-[4px] file:border file:border-line-strong file:bg-paper file:px-3 file:py-1.5 file:text-[13px]" />
        </FormRow>
        <FormRow label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormRow>
        <FormRow label="Description">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </FormRow>
        <div className="md:col-span-4">
          <Button onClick={upload} loading={busy} disabled={!file}>Upload document</Button>
        </div>
      </div>
    </Card>
  );
}
