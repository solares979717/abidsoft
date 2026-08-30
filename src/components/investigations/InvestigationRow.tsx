"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { INVESTIGATION_STATUS } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { compressImage } from "@/lib/compressImage";
import { useRouter } from "next/navigation";
import { Upload, FileText } from "lucide-react";

export function InvestigationRow({
  id, status, reports,
}: {
  id: string; status: string;
  reports: { id: string; file_name: string; storage_path: string }[];
}) {
  const [value, setValue] = React.useState(status);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  async function change(next: string) {
    setBusy(true);
    const { error } = await sb.from("visit_investigations")
      .update({ status: next, ...(next === "reviewed" ? { reviewed_at: new Date().toISOString() } : {}) })
      .eq("id", id);
    setBusy(false);
    if (error) return toast("Couldn't update the status.", "error");
    setValue(next);
    toast(`Marked ${next.replace(/_/g, " ")}`);
    router.refresh();
  }

  async function upload(original: File) {
    setBusy(true);
    // Photographed reports get shrunk; PDFs pass through untouched.
    const file = await compressImage(original);
    const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await sb.storage.from("reports").upload(path, file);
    if (error) { setBusy(false); return toast("Upload failed. Try again.", "error"); }
    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from("profiles").select("clinic_id").eq("id", user!.id).single();
    await sb.from("investigation_reports").insert({
      clinic_id: prof!.clinic_id, investigation_id: id, storage_path: path,
      file_name: file.name, mime_type: file.type, file_size: file.size, uploaded_by: user!.id,
    });
    await sb.from("visit_investigations").update({ status: "report_uploaded" }).eq("id", id);
    setValue("report_uploaded");
    setBusy(false);
    toast("Report uploaded");
    router.refresh();
  }

  async function open(path: string) {
    const { data } = await sb.storage.from("reports").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast("Couldn't open the file.", "error");
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value} disabled={busy}
        onChange={(e) => change(e.target.value)}
        className="h-7 rounded-[4px] border border-line-strong bg-paper px-2 text-[12px] outline-none focus:border-focus"
      >
        {INVESTIGATION_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <label title="Upload report" className="cursor-pointer text-ink-3 hover:text-primary">
        <Upload size={15} />
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {reports.map((r) => (
        <button key={r.id} title={r.file_name} onClick={() => open(r.storage_path)}
          className="text-ink-3 hover:text-primary">
          <FileText size={15} />
        </button>
      ))}
    </div>
  );
}
