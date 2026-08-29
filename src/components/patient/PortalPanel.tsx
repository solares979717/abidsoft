"use client";
import * as React from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { useToast } from "@/components/ui/Toast";
import { Copy, MessageCircle } from "lucide-react";

const SHAREABLE: { label: string; value: string }[] = [
  { label: "Clinical Summary", value: "summary" },
  { label: "Prescription", value: "prescription" },
  { label: "Lab Report", value: "lab_report" },
  { label: "Imaging", value: "imaging" },
  { label: "Bill", value: "bill" },
];

export function PortalPanel({ patientId, whatsapp }: { patientId: string; whatsapp: string }) {
  const [labels, setLabels] = React.useState<string[]>(["Clinical Summary", "Prescription"]);
  const [days, setDays] = React.useState(14);
  const [link, setLink] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();

  async function generate() {
    setBusy(true);
    const items = SHAREABLE.filter((s) => labels.includes(s.label)).map((s) => s.value);
    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId, items, days }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Couldn't create the link.", "error");
    setLink(json.url);
    toast("Portal link created");
  }

  async function revoke() {
    await fetch("/api/portal", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId }),
    });
    setLink("");
    toast("All portal links revoked");
  }

  return (
    <Card>
      <CardHead title="Patient portal"
        sub="Private doctor notes are never included, whatever is selected." />
      <div className="space-y-4 p-4">
        <div>
          <p className="label mb-2">Share</p>
          <ChipGrid options={SHAREABLE.map((s) => s.label)} value={labels} onChange={setLabels} />
        </div>
        <div>
          <p className="label mb-2">Link expires after</p>
          <ChipGrid options={["7 days", "14 days", "30 days"]} multiple={false}
            value={[`${days} days`]} onChange={(v) => setDays(parseInt(v[0] ?? "14"))} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} loading={busy}>Create link</Button>
          <Button variant="danger" onClick={revoke}>Revoke all links</Button>
        </div>
        {link && (
          <div className="rounded-[6px] border border-line bg-canvas p-3">
            <p className="data break-all text-[12px] text-ink-2">{link}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary"
                onClick={() => { navigator.clipboard.writeText(link); toast("Link copied"); }}>
                <Copy size={14} /> Copy
              </Button>
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(
                  "Shafiq Medical & Diagnostic Center — your records: " + link)}`}
                target="_blank" rel="noreferrer"
              >
                <Button size="sm" variant="secondary"><MessageCircle size={14} /> Send on WhatsApp</Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
