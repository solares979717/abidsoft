"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormRow } from "@/components/ui/Field";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { useToast } from "@/components/ui/Toast";
import { RecycleBin } from "./RecycleBin";
import { useRouter } from "next/navigation";
import { money } from "@/lib/utils";
import { Plus } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SECTIONS = ["Clinic profile", "Doctors", "Appointment settings", "Medicines",
  "Diagnoses", "Investigations", "Prescription templates", "WhatsApp", "Patient portal",
  "Advice", "Storage", "Backup", "Recycle bin", "Security"];

type Row = Record<string, unknown> | null;
type RxTemplateItem = {
  medicine_id: string | null; medicine_name: string; strength?: string; dose?: string;
  frequency?: string; duration?: string; route?: string; instructions?: string[];
};
type RxTemplate = {
  id: string; name: string; doctor_id: string | null; items: RxTemplateItem[];
  doctors?: { full_name: string } | null;
};

export function SettingsClient({
  clinic, settings, doctors, medicines, diagnoses, investigations, templates, advice,
}: {
  clinic: Row; settings: Row;
  doctors: Record<string, unknown>[];
  medicines: { id: string; name: string; generic_name: string | null; strength: string | null; form: string | null }[];
  diagnoses: { id: string; name: string }[];
  investigations: { id: string; name: string; category: string; price: number }[];
  templates: RxTemplate[];
  advice: { id: string; text: string }[];
}) {
  const [tab, setTab] = React.useState(SECTIONS[0]);
  const [busy, setBusy] = React.useState(false);
  const [usage, setUsage] = React.useState<Record<string, number> | null>(null);
  const [usageError, setUsageError] = React.useState("");
  const [c, setC] = React.useState(clinic ?? {});
  const [s, setS] = React.useState(settings ?? {});
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  const clinicId = (clinic?.id as string) ?? "";

  // Loaded only when the Storage tab is opened — it's a heavier query and
  // most visits to Settings don't need it.
  React.useEffect(() => {
    if (tab !== "Storage" || usage) return;
    sb.rpc("storage_usage").then(({ data, error }) => {
      if (error) setUsageError("Couldn't read storage usage. Run UPGRADE_3.sql if you haven't yet.");
      else setUsage(data as Record<string, number>);
    });
  }, [tab, usage, sb]);

  async function saveClinic() {
    setBusy(true);
    const { error } = await sb.from("clinics").update({
      name: c.name, address: c.address, phone_1: c.phone_1, phone_2: c.phone_2,
    }).eq("id", clinicId);
    setBusy(false);
    if (error) return toast("Couldn't save. Try again.", "error");
    toast("Clinic profile saved");
    router.refresh();
  }

  async function saveSettings() {
    setBusy(true);
    const { error } = await sb.from("clinic_settings").update({
      working_days: s.working_days, opening_time: s.opening_time, closing_time: s.closing_time,
      slot_minutes: Number(s.slot_minutes), default_consultation_fee: Number(s.default_consultation_fee),
      wa_reminder_hours: Number(s.wa_reminder_hours),
      wa_enabled: s.wa_enabled, portal_token_days: Number(s.portal_token_days),
      updated_at: new Date().toISOString(),
    }).eq("clinic_id", clinicId);
    setBusy(false);
    if (error) return toast("Couldn't save. Try again.", "error");
    toast("Settings saved");
    router.refresh();
  }

  async function addDoctor() {
    const name = prompt("Doctor name (for example: Dr. Ali Khan)");
    if (!name) return;
    const qualification = prompt("Qualification") ?? "";
    const { error } = await sb.from("doctors").insert({
      clinic_id: clinicId, full_name: name, qualification,
      consultation_fee: Number(s.default_consultation_fee ?? 1000),
      sort_order: doctors.length + 1,
    });
    if (error) return toast("Couldn't add the doctor.", "error");
    toast("Doctor added — they appear in every dropdown from now on");
    router.refresh();
  }

  async function addCatalog(table: string, payload: Record<string, unknown>, label: string) {
    const { error } = await sb.from(table).insert({ clinic_id: clinicId, ...payload });
    if (error) return toast("Couldn't add the entry.", "error");
    toast(`${label} added`);
    router.refresh();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    const { error } = await sb.from("prescription_templates").delete().eq("id", id);
    if (error) return toast("Couldn't delete the template.", "error");
    toast("Template deleted");
    router.refresh();
  }

  const slots = React.useMemo(() => {
    const open = String(s.opening_time ?? "09:00").slice(0, 5);
    const close = String(s.closing_time ?? "17:00").slice(0, 5);
    const step = Number(s.slot_minutes ?? 15);
    const out: string[] = [];
    let [h, m] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    while (h * 60 + m < ch * 60 + cm && out.length < 60) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += step; h += Math.floor(m / 60); m %= 60;
    }
    return out;
  }, [s.opening_time, s.closing_time, s.slot_minutes]);

  return (
    <div className="space-y-5">
      <h1 className="display text-[24px]">Settings</h1>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {SECTIONS.map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`px-3 py-2.5 text-[14px] ${tab === x
              ? "border-b-2 border-primary font-medium text-primary" : "text-ink-2 hover:text-ink"}`}>
            {x}
          </button>
        ))}
      </div>

      {tab === "Clinic profile" && (
        <Card>
          <CardHead title="Clinic profile" sub="Appears on every prescription and receipt" />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <FormRow label="Clinic name">
              <Input value={String(c.name ?? "")} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </FormRow>
            <FormRow label="Address">
              <Input value={String(c.address ?? "")} onChange={(e) => setC({ ...c, address: e.target.value })} />
            </FormRow>
            <FormRow label="Phone 1">
              <Input mono value={String(c.phone_1 ?? "")} onChange={(e) => setC({ ...c, phone_1: e.target.value })} />
            </FormRow>
            <FormRow label="Phone 2">
              <Input mono value={String(c.phone_2 ?? "")} onChange={(e) => setC({ ...c, phone_2: e.target.value })} />
            </FormRow>
            <div className="md:col-span-2">
              <Button onClick={saveClinic} loading={busy}>Save clinic profile</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "Doctors" && (
        <Card>
          <CardHead title="Doctors" action={<Button size="sm" onClick={addDoctor}>
            <Plus size={14} /> Add doctor</Button>} />
          <ul className="divide-y divide-line">
            {doctors.map((d) => (
              <li key={String(d.id)} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[14px] font-medium">{String(d.full_name)}</p>
                  <p className="text-[13px] text-ink-2">
                    {String(d.qualification ?? "")}{d.affiliation ? ` · ${d.affiliation}` : ""}
                  </p>
                </div>
                <span className="data text-[13px]">{money(Number(d.consultation_fee))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "Appointment settings" && (
        <Card>
          <CardHead title="Clinic days and timings"
            sub="Slots are generated from these values. Custom date and time stays available everywhere." />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <FormRow label="Working days" className="md:col-span-2">
              <ChipGrid
                options={DAYS}
                value={((s.working_days as number[]) ?? []).map((i) => DAYS[i])}
                onChange={(v) => setS({ ...s, working_days: v.map((d) => DAYS.indexOf(d)).sort() })}
              />
            </FormRow>
            <FormRow label="Opening time">
              <Input type="time" value={String(s.opening_time ?? "09:00").slice(0, 5)}
                onChange={(e) => setS({ ...s, opening_time: e.target.value })} />
            </FormRow>
            <FormRow label="Closing time">
              <Input type="time" value={String(s.closing_time ?? "17:00").slice(0, 5)}
                onChange={(e) => setS({ ...s, closing_time: e.target.value })} />
            </FormRow>
            <FormRow label="Slot length (minutes)">
              <Select value={String(s.slot_minutes ?? 15)}
                onChange={(e) => setS({ ...s, slot_minutes: e.target.value })}>
                {[10, 15, 20, 30, 45, 60].map((n) => <option key={n}>{n}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Default consultation fee">
              <Input mono value={String(s.default_consultation_fee ?? 1000)}
                onChange={(e) => setS({ ...s, default_consultation_fee: e.target.value })} />
            </FormRow>
            <div className="md:col-span-2">
              <p className="label mb-2">Generated slots ({slots.length})</p>
              <div className="data flex flex-wrap gap-1.5 text-[12px] text-ink-2">
                {slots.map((t) => (
                  <span key={t} className="rounded-[4px] bg-canvas px-2 py-1">{t}</span>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <Button onClick={saveSettings} loading={busy}>Save appointment settings</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "Medicines" && (
        <CatalogCard
          title="Medicines" count={medicines.length}
          onAdd={() => {
            const name = prompt("Medicine name"); if (!name) return;
            const strength = prompt("Strength (optional)") ?? "";
            const form = prompt("Form (Tablet, Capsule, Syrup…)") ?? "";
            addCatalog("medicines", { name, strength, form }, "Medicine");
          }}
          rows={medicines.map((m) => ({
            id: m.id, main: m.name,
            sub: [m.generic_name, m.strength, m.form].filter(Boolean).join(" · "),
          }))}
        />
      )}

      {tab === "Diagnoses" && (
        <CatalogCard
          title="Diagnoses" count={diagnoses.length}
          onAdd={() => { const name = prompt("Diagnosis"); if (name) addCatalog("diagnosis_catalog", { name }, "Diagnosis"); }}
          rows={diagnoses.map((d) => ({ id: d.id, main: d.name }))}
        />
      )}

      {tab === "Investigations" && (
        <CatalogCard
          title="Investigations" count={investigations.length}
          note="Price here is a reference only — it does not get added to a patient's bill automatically. The doctor enters what to charge during the consultation."
          onAdd={() => {
            const name = prompt("Test name"); if (!name) return;
            const category = prompt("Category — type Laboratory or Radiology") ?? "Laboratory";
            const price = Number(prompt("Price") ?? 0);
            addCatalog("investigation_catalog", { name, category, price }, "Test");
          }}
          rows={investigations.map((i) => ({
            id: i.id, main: i.name, sub: i.category, right: money(Number(i.price)),
          }))}
        />
      )}

      {tab === "Prescription templates" && (
        <Card>
          <CardHead title="Prescription templates" sub={`${templates.length} saved`} />
          <p className="border-b border-line bg-canvas px-4 py-2 text-[12px] text-ink-3">
            Doctors save these from the Prescription section during a consultation, using
            "Save as template". They appear there for reuse on future patients.
          </p>
          {templates.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-3">
              No templates saved yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium">{t.name}</p>
                    <p className="text-[12px] text-ink-3">
                      {t.doctors?.full_name ?? "Any doctor"} · {t.items.length} medicine{t.items.length === 1 ? "" : "s"}
                      {" — "}
                      {t.items.map((i) => i.medicine_name).filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <button className="text-[13px] font-medium text-danger"
                    onClick={() => deleteTemplate(t.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "WhatsApp" && (
        <Card>
          <CardHead title="WhatsApp"
            sub="Messages are queued in the database and sent server-side only." />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <FormRow label="Enabled">
              <ChipGrid options={["On", "Off"]} multiple={false}
                value={[s.wa_enabled ? "On" : "Off"]}
                onChange={(v) => setS({ ...s, wa_enabled: v[0] === "On" })} />
            </FormRow>
            <FormRow label="Reminder sent before appointment (hours)">
              <Input mono value={String(s.wa_reminder_hours ?? 24)}
                onChange={(e) => setS({ ...s, wa_reminder_hours: e.target.value })} />
            </FormRow>
            <p className="text-[13px] text-ink-2 md:col-span-2">
              Provider credentials live in environment variables, not in the database:
              <span className="data"> WHATSAPP_API_URL</span> and
              <span className="data"> WHATSAPP_API_TOKEN</span>. Until they are set, queued
              messages are marked Failed with a retry option, and nothing else in the clinic
              software is affected.
            </p>
            <div className="md:col-span-2">
              <Button onClick={saveSettings} loading={busy}>Save WhatsApp settings</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "Patient portal" && (
        <Card>
          <CardHead title="Patient portal" sub="Private doctor notes are never shared." />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <FormRow label="Default link lifetime (days)">
              <Input mono value={String(s.portal_token_days ?? 14)}
                onChange={(e) => setS({ ...s, portal_token_days: e.target.value })} />
            </FormRow>
            <div className="md:col-span-2">
              <Button onClick={saveSettings} loading={busy}>Save portal settings</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "Advice" && (
        <CatalogCard
          title="Patient advice" count={advice.length}
          note="Ticked during a consultation instead of typing it out each time. Appears on the printed prescription and in the WhatsApp summary."
          onAdd={() => {
            const text = prompt('Advice, e.g. "Avoid cold drinks"');
            if (text) addCatalog("advice_catalog", { text, sort_order: advice.length + 1 }, "Advice");
          }}
          rows={advice.map((a) => ({ id: a.id, main: a.text }))}
        />
      )}

      {tab === "Storage" && (
        <Card>
          <CardHead title="Storage" sub="Supabase free plan limits" />
          {usageError && (
            <p className="border-b border-line bg-danger-bg px-4 py-2 text-[13px] text-danger">
              {usageError}
            </p>
          )}
          {!usage && !usageError && (
            <p className="px-4 py-6 text-center text-[13px] text-ink-3">Reading usage…</p>
          )}
          {usage && (
            <div className="space-y-5 p-4">
              <UsageBar label="Database (patients, visits, prescriptions, billing)"
                used={usage.database_bytes} limit={usage.database_limit_bytes} />
              <UsageBar label="Files (lab reports, imaging, documents)"
                used={usage.files_bytes} limit={usage.files_limit_bytes} />
              <div className="grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
                {[["Patients", usage.patients], ["Visits", usage.visits], ["Files", usage.documents]]
                  .map(([l, v]) => (
                    <div key={l as string}>
                      <p className="label">{l}</p>
                      <p className="data mt-0.5 text-[18px]">{v as number}</p>
                    </div>
                  ))}
              </div>
              <p className="text-[12px] text-ink-3">
                Text records use very little space — the database limit is unlikely to be a problem
                for years. Uploaded files are what fill up, so images are compressed automatically
                before upload.
              </p>
            </div>
          )}
        </Card>
      )}

      {tab === "Backup" && (
        <Card>
          <CardHead title="Backup" sub="A copy of everything, kept outside Supabase" />
          <div className="space-y-4 p-4 text-[14px] text-ink-2">
            <p>
              Every patient, visit, prescription, investigation and payment lives in one
              Supabase project. If that account is ever lost, suspended, or damaged by a
              mistaken query, the whole record goes with it. A backup is the only thing
              that makes that recoverable.
            </p>
            <div className="rounded-[6px] border border-line bg-canvas p-3">
              <p className="label mb-1">Automatic</p>
              <p className="text-[13px]">
                A full backup runs every night at 8pm and is sent wherever
                <span className="data"> BACKUP_WEBHOOK_URL </span>
                points. If that isn&apos;t set, the nightly job still runs but has nowhere to
                deliver to — take manual copies below until it is configured.
              </p>
            </div>
            <div>
              <p className="label mb-1">Right now</p>
              <p className="mb-2 text-[13px]">
                Downloads one CSV file containing every table. Opens in Excel. Keep it on
                the clinic computer or in Google Drive.
              </p>
              <a href="/api/backup" download>
                <Button variant="secondary">Download backup now</Button>
              </a>
            </div>
            <p className="text-[12px] text-ink-3">
              A backup is a copy, not a substitute — it can restore data, but it is not a
              second running system. Take one before any risky change.
            </p>
          </div>
        </Card>
      )}

      {tab === "Recycle bin" && <RecycleBin />}

      {tab === "Security" && (
        <Card>
          <CardHead title="Security" />
          <ul className="space-y-2 p-4 text-[14px] text-ink-2">
            <li>Supabase Auth with email and password. Accounts are created by the administrator.</li>
            <li>Row Level Security is on for every table; a user only ever sees their own clinic.</li>
            <li>The service role key is server-side only and is never sent to the browser.</li>
            <li>Portal links are random, hashed at rest, expiring and revocable.</li>
            <li>Patient, visit, prescription, payment and portal actions are written to the audit log.</li>
            <li>Clinical and financial records are soft-deleted, never destroyed.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function CatalogCard({
  title, count, rows, onAdd, note,
}: {
  title: string; count: number; onAdd: () => void; note?: string;
  rows: { id: string; main: string; sub?: string; right?: string }[];
}) {
  const [q, setQ] = React.useState("");
  const filtered = q
    ? rows.filter((r) => r.main.toLowerCase().includes(q.toLowerCase()))
    : rows;
  return (
    <Card>
      <CardHead title={title} sub={`${count} entries`}
        action={<Button size="sm" onClick={onAdd}><Plus size={14} /> Add</Button>} />
      {note && <p className="border-b border-line bg-canvas px-4 py-2 text-[12px] text-ink-3">{note}</p>}
      <div className="border-b border-line p-3">
        <Input value={q} placeholder={`Filter ${title.toLowerCase()}…`}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
        {filtered.slice(0, 200).map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-[14px]">{r.main}</p>
              {r.sub && <p className="text-[12px] text-ink-3">{r.sub}</p>}
            </div>
            {r.right && <span className="data text-[13px] text-ink-2">{r.right}</span>}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-ink-3">No match.</li>
        )}
      </ul>
    </Card>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 80 ? "bg-danger" : pct >= 60 ? "bg-warn" : "bg-primary";
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] text-ink-2">{label}</span>
        <span className={`data text-[13px] ${pct >= 80 ? "font-semibold text-danger" : "text-ink-2"}`}>
          {mb(used)} of {mb(limit)} · {pct.toFixed(pct < 1 ? 1 : 0)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
      </div>
      {pct >= 80 && (
        <p className="mt-1.5 text-[12px] font-medium text-danger">
          Over 80% full — free up space or upgrade the Supabase plan before uploads start failing.
        </p>
      )}
    </div>
  );
}
