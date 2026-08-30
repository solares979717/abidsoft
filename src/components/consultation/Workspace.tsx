"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Section } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormRow } from "@/components/ui/Field";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { SearchSelect, type Option } from "@/components/ui/SearchSelect";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import {
  MEDICAL_HISTORY, HISTORY_EXCLUSIVE, ALLERGY_TYPES, ALLERGY_EXCLUSIVE,
  DURATION_UNITS, DOSE_OPTIONS, FREQUENCY_OPTIONS, DURATION_OPTIONS,
  ROUTE_OPTIONS, INSTRUCTION_OPTIONS, FOLLOWUP_OPTIONS, EXAM_PARTS,
} from "@/lib/constants";
import { addDays, fmtDate, isoDate, money, ageFromDob } from "@/lib/utils";

export type Doctor = { id: string; full_name: string; consultation_fee: number };
export type Catalogs = {
  complaints: { id: string; name: string }[];
  diagnoses: { id: string; name: string }[];
  medicines: { id: string; name: string; strength: string | null; form: string | null }[];
  investigations: { id: string; name: string; category: string; price: number }[];
};
export type ExistingPatient = {
  id: string; patient_no: string; full_name: string; phone: string;
  whatsapp: string | null; dob: string; gender: string; address: string | null;
  primary_doctor_id: string | null;
};
export type PreviousRx = {
  id: string;
  items: { medicine_id: string | null; medicine_name: string; strength: string | null;
    dose: string | null; frequency: string | null; duration: string | null;
    route: string | null; instructions: string[] }[];
};

export type RxTemplate = {
  id: string; name: string; doctor_id: string | null;
  items: { medicine_id: string | null; medicine_name: string; strength?: string; dose?: string;
    frequency?: string; duration?: string; route?: string; instructions?: string[] }[];
};

type RxItem = {
  key: string; medicine_id: string | null; medicine_name: string; strength: string;
  dose: string; frequency: string; duration: string; route: string;
  instructions: string[]; instruction_other: string;
};
type Complaint = { key: string; complaint: string; duration_value: string; duration_unit: string };
type InvItem = { catalog_id: string | null; test_name: string; category: string; price: number };

const uid = () => Math.random().toString(36).slice(2, 9);

export function Workspace({
  doctors, catalogs, patient, appointmentId, previousVisitId, previousRx, defaultFee, knownAllergies,
  templates, prefillName, prefillPhone, lastVisit, adviceOptions,
}: {
  doctors: Doctor[];
  catalogs: Catalogs;
  patient: ExistingPatient | null;
  appointmentId?: string;
  previousVisitId?: string;
  previousRx?: PreviousRx | null;
  defaultFee: number;
  knownAllergies?: string[];
  templates?: RxTemplate[];
  /** Name and phone taken over the telephone when the appointment was booked,
   *  before this person was a registered patient. */
  prefillName?: string;
  prefillPhone?: string;
  /** Headline facts from this patient's previous visit. */
  lastVisit?: {
    date: string; doctor: string | null; diagnoses: string[];
    investigations: string[]; medicines: string[];
  } | null;
  /** Standing advice the clinic uses often, ticked instead of typed. */
  adviceOptions?: string[];
}) {
  const sb = createClient();
  const router = useRouter();
  const toast = useToast();
  const isNew = !patient;

  const [open, setOpen] = React.useState<number>(isNew ? 1 : 5);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [catalogError, setCatalogError] = React.useState("");

  // 1 basic
  const [name, setName] = React.useState(patient?.full_name ?? prefillName ?? "");
  const [phone, setPhone] = React.useState(patient?.phone ?? prefillPhone ?? "");
  const [wa, setWa] = React.useState(patient?.whatsapp ?? "");
  const [sameWa, setSameWa] = React.useState(!patient);
  const [dob, setDob] = React.useState(patient?.dob ?? "");
  const [gender, setGender] = React.useState(patient?.gender ?? "");
  // Most people don't know their date of birth but do know roughly how old
  // they are. Typing "36" is stored as a date behind the scenes so the age
  // stays right next year instead of being frozen at 36 forever.
  const [ageYears, setAgeYears] = React.useState("");
  const [address, setAddress] = React.useState(patient?.address ?? "");
  const [doctorId, setDoctorId] = React.useState(
    patient?.primary_doctor_id ?? doctors[0]?.id ?? ""
  );
  const [visitType, setVisitType] = React.useState(
    previousVisitId ? "Follow-up" : "New Consultation"
  );
  const [dupes, setDupes] = React.useState<{ id: string; full_name: string; patient_no: string }[]>([]);

  // 2-4 history
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyOther, setHistoryOther] = React.useState("");
  const [allergies, setAllergies] = React.useState<string[]>([]);
  const [allergyDetail, setAllergyDetail] = React.useState("");
  const [currentMeds, setCurrentMeds] = React.useState<{ id: string | null; name: string }[]>([]);
  const [life, setLife] = React.useState<Record<string, string>>({});

  // 5 complaints
  const [complaints, setComplaints] = React.useState<Complaint[]>([]);

  // 6 vitals
  const [vitals, setVitals] = React.useState<Record<string, string>>({});

  // 7 exam
  const [exam, setExam] = React.useState<Record<string, string>>({});
  const [examOther, setExamOther] = React.useState("");
  const [copiedFrom, setCopiedFrom] = React.useState<string | null>(null);

  // 8 diagnosis
  const [diagnoses, setDiagnoses] = React.useState<{ id: string | null; text: string }[]>([]);

  // 9 investigations
  const [investigations, setInvestigations] = React.useState<InvItem[]>([]);

  // 10 prescription
  const [rx, setRx] = React.useState<RxItem[]>([]);
  const [advice, setAdvice] = React.useState("");
  const [advicePicks, setAdvicePicks] = React.useState<string[]>([]);

  // 11 follow-up
  const [fuDays, setFuDays] = React.useState<number | null>(null);
  const [fuCustom, setFuCustom] = React.useState("");
  const [noFollowUp, setNoFollowUp] = React.useState(false);

  // 12 billing
  const [fee, setFee] = React.useState<string>(String(defaultFee));
  const [invCharge, setInvCharge] = React.useState("0");
  const [otherCharge, setOtherCharge] = React.useState("0");
  const [discount, setDiscount] = React.useState("0");
  const [paid, setPaid] = React.useState("0");
  const [method, setMethod] = React.useState("Cash");
  const [reference, setReference] = React.useState("");

  const [notes, setNotes] = React.useState("");

  /* ------------------------------------------------ duplicate check */
  React.useEffect(() => {
    if (!isNew || phone.replace(/\D/g, "").length < 7) { setDupes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.rpc("global_search", { q: phone.trim() });
      setDupes(((data as { patients?: typeof dupes })?.patients ?? []).slice(0, 3));
    }, 400);
    return () => clearTimeout(t);
  }, [phone, isNew, sb]);

  React.useEffect(() => { if (sameWa) setWa(phone); }, [phone, sameWa]);

  /* ------------------------------------------------ derived */
  const invTotal = investigations.reduce((a, i) => a + Number(i.price || 0), 0);
  const charges = Number(fee || 0) + Number(invCharge || 0) + Number(otherCharge || 0);
  const net = Math.max(charges - Number(discount || 0), 0);
  const due = Math.max(net - Number(paid || 0), 0);
  const fuDate = noFollowUp ? null : fuCustom ? new Date(fuCustom) : fuDays ? addDays(fuDays) : null;

  const rxSummary = rx.length ? `${rx.length} medicine${rx.length > 1 ? "s" : ""}` : "";
  const vitalSummary = [
    vitals.bp_systolic && vitals.bp_diastolic && `BP ${vitals.bp_systolic}/${vitals.bp_diastolic}`,
    vitals.pulse && `Pulse ${vitals.pulse}`,
    vitals.temperature_f && `Temp ${vitals.temperature_f}`,
  ].filter(Boolean).join(" · ");

  /* ------------------------------------------------ catalog creation */
  async function clinicId(): Promise<string | null> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
    return data?.clinic_id ?? null;
  }

  /** Every "add new" catalog action goes through here so a failure is always
   *  visible instead of silently doing nothing. A duplicate name (which the
   *  database rejects) is treated as "already exists" and simply selected. */
  async function withCatalogGuard<T>(
    label: string,
    run: (cid: string) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
    onExisting: () => Promise<T | null>,
    onSuccess: (row: T) => void
  ) {
    setCatalogError("");
    const cid = await clinicId();
    if (!cid) {
      setCatalogError(
        "Your account isn't linked to a clinic yet, so nothing can be added or saved. " +
        "Ask whoever set up the software to add your login to the clinic's team (Settings → Doctors, " +
        "or the profiles step in the setup guide)."
      );
      return;
    }
    const { data, error } = await run(cid);
    if (data) { onSuccess(data); return; }
    if (error?.code === "23505") {
      // unique constraint — this name already exists, so use the existing one
      const existing = await onExisting();
      if (existing) { onSuccess(existing); return; }
    }
    setCatalogError(`Couldn't add "${label}". ${error?.message ?? "Please try again."}`);
  }

  async function createDiagnosis(nameIn: string) {
    await withCatalogGuard(
      nameIn,
      (cid) => sb.from("diagnosis_catalog").insert({ name: nameIn, clinic_id: cid })
        .select("id,name").single(),
      async () => {
        const { data } = await sb.from("diagnosis_catalog").select("id,name")
          .ilike("name", nameIn).maybeSingle();
        return data;
      },
      (data: { id: string; name: string }) => {
        if (!catalogs.diagnoses.some((d) => d.id === data.id)) catalogs.diagnoses.unshift(data);
        setDiagnoses((d) => d.some((x) => x.id === data.id) ? d : [...d, { id: data.id, text: data.name }]);
      }
    );
  }

  async function createMedicine(nameIn: string) {
    await withCatalogGuard(
      nameIn,
      (cid) => sb.from("medicines").insert({ name: nameIn, clinic_id: cid })
        .select("id,name,strength,form").single(),
      async () => {
        const { data } = await sb.from("medicines").select("id,name,strength,form")
          .ilike("name", nameIn).maybeSingle();
        return data;
      },
      (data: { id: string; name: string; strength: string | null; form: string | null }) => {
        if (!catalogs.medicines.some((m) => m.id === data.id)) catalogs.medicines.unshift(data);
        addRx({ id: data.id, label: data.name });
      }
    );
  }

  async function saveAsTemplate() {
    if (rx.length === 0) { toast("Add at least one medicine before saving a template.", "error"); return; }
    const name = (typeof window !== "undefined" ? window.prompt('Template name, e.g. "Flu — adult"') : "")?.trim();
    if (!name) return;
    const cid = await clinicId();
    if (!cid) {
      toast("Your account isn't linked to a clinic yet, so a template can't be saved.", "error");
      return;
    }
    const items = rx.map((r) => ({
      medicine_id: r.medicine_id, medicine_name: r.medicine_name, strength: r.strength,
      dose: r.dose, frequency: r.frequency, duration: r.duration, route: r.route,
      instructions: r.instructions,
    }));
    const { error } = await sb.from("prescription_templates")
      .insert({ clinic_id: cid, doctor_id: doctorId || null, name, items });
    if (error) { toast("Couldn't save the template.", "error"); return; }
    toast(`Saved "${name}" — reuse it from Load template`);
  }

  function loadTemplate(t: RxTemplate) {
    setCopiedFrom(null);
    setRx(t.items.map((i) => ({
      key: uid(), medicine_id: i.medicine_id ?? null, medicine_name: i.medicine_name,
      strength: i.strength ?? "", dose: i.dose ?? "", frequency: i.frequency ?? "",
      duration: i.duration ?? "", route: i.route ?? ROUTE_OPTIONS[0],
      instructions: i.instructions ?? [], instruction_other: "",
    })));
    toast(`Loaded "${t.name}"`);
  }

  async function createTest(nameIn: string, category: string) {
    await withCatalogGuard(
      nameIn,
      (cid) => sb.from("investigation_catalog")
        .insert({ name: nameIn, category, price: 0, clinic_id: cid })
        .select("id,name,category,price").single(),
      async () => {
        const { data } = await sb.from("investigation_catalog").select("id,name,category,price")
          .eq("category", category).ilike("name", nameIn).maybeSingle();
        return data;
      },
      (data: { id: string; name: string; category: string; price: number }) => {
        if (!catalogs.investigations.some((i) => i.id === data.id)) catalogs.investigations.unshift(data);
        setInvestigations((v) => v.some((x) => x.catalog_id === data.id) ? v : [...v,
          { catalog_id: data.id, test_name: data.name, category, price: Number(data.price) }]);
      }
    );
  }

  function addRx(o?: Option) {
    const m = catalogs.medicines.find((x) => x.id === o?.id);
    setRx((r) => [...r, {
      key: uid(), medicine_id: m?.id ?? null, medicine_name: m?.name ?? o?.label ?? "",
      strength: m?.strength ?? "", dose: "1", frequency: "BD", duration: "5 days",
      route: "Oral", instructions: [], instruction_other: "",
    }]);
  }
  function setRxField(key: string, patch: Partial<RxItem>) {
    setRx((r) => r.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function copyPrevious() {
    if (!previousRx) return;
    setCopiedFrom(previousRx.id);
    setRx(previousRx.items.map((i) => ({
      key: uid(), medicine_id: i.medicine_id, medicine_name: i.medicine_name,
      strength: i.strength ?? "", dose: i.dose ?? "", frequency: i.frequency ?? "",
      duration: i.duration ?? "", route: i.route ?? "Oral",
      instructions: i.instructions ?? [], instruction_other: "",
    })));
    toast("Previous prescription copied into a new draft");
  }

  /* ------------------------------------------------ save */
  async function save() {
    setError("");
    if (isNew && !name.trim()) {
      setError("The patient's name is required.");
      setOpen(1); return;
    }
    if (!doctorId) { setError("Select a doctor."); setOpen(1); return; }

    setSaving(true);
    const payload = {
      patient_id: patient?.id ?? null,
      patient: { full_name: name, phone, whatsapp: wa, dob, age_years: ageYears, gender, address },
      doctor_id: doctorId,
      visit_type: visitType,
      appointment_id: appointmentId ?? null,
      previous_visit_id: previousVisitId ?? null,
      private_notes: notes,
      medical_history: history.map((c) => ({
        condition: c, detail: c === "Other" ? historyOther : null,
      })),
      allergies: allergies.map((a) => ({
        allergy_type: a, detail: a === "No Known Allergy" ? null : allergyDetail,
      })),
      current_medicines: currentMeds.map((m) => ({ medicine_id: m.id, medicine_name: m.name })),
      lifestyle: Object.keys(life).length ? life : null,
      complaints: complaints.map((c) => ({
        complaint: c.complaint, duration_value: c.duration_value, duration_unit: c.duration_unit,
      })),
      vitals: Object.keys(vitals).length ? vitals : null,
      examination: { ...exam, other_findings: examOther },
      diagnoses: diagnoses.map((d, i) => ({
        diagnosis_id: d.id, diagnosis_text: d.text, is_primary: i === 0,
      })),
      investigations,
      prescription_items: rx.map((r, i) => ({ ...r, sort_order: i })),
      copied_from_id: copiedFrom,
      advice: [...advicePicks, advice.trim()].filter(Boolean).join(". "),
      followup: noFollowUp
        ? { type: "none" }
        : fuDate
          ? { type: "scheduled", interval_days: fuDays, date: isoDate(fuDate), time: "10:00" }
          : { type: "none" },
      billing: {
        items: [
          { item_type: "Consultation", description: "Consultation fee", quantity: 1,
            unit_price: Number(fee || 0), amount: Number(fee || 0) },
          ...(Number(invCharge) > 0
            ? [{ item_type: "Investigation", description: "Investigation charges", quantity: 1,
                unit_price: Number(invCharge), amount: Number(invCharge) }]
            : []),
          ...(Number(otherCharge) > 0
            ? [{ item_type: "Other", description: "Other charges", quantity: 1,
                unit_price: Number(otherCharge), amount: Number(otherCharge) }]
            : []),
        ],
        discount: Number(discount || 0),
        paid: Number(paid || 0),
        method, reference_no: reference,
      },
    };

    const { data, error } = await sb.rpc("save_visit", { payload });
    if (error) {
      setSaving(false);
      setError(`Couldn't save the visit. Nothing was written — try again. (${error.message})`);
      return;
    }
    const res = data as { patient_id: string; visit_id: string; prescription_id: string | null };
    toast("Visit saved");
    // If a prescription was written, go straight to it — that's the sheet the
    // doctor hands over or sends on WhatsApp, so it saves a step at the exact
    // moment the patient is still sitting there. Otherwise fall back to the
    // patient's visit history.
    router.push(res.prescription_id
      ? `/print/prescription/${res.prescription_id}`
      : `/patients/${res.patient_id}?tab=visits`);
    router.refresh();
  }

  const allergyFlag = [...(knownAllergies ?? []), ...allergies].filter(
    (a) => a && a !== "No Known Allergy"
  );

  return (
    <div className="grid gap-5 overflow-x-auto lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ------------------------------------------------ sections */}
      <div className="min-w-0 space-y-2.5">
        {lastVisit && (
          <div className="rounded-[6px] border border-line bg-primary-wash/40 px-4 py-3">
            <p className="label mb-1.5 text-primary">
              Last visit — {fmtDate(lastVisit.date)}{lastVisit.doctor ? ` · ${lastVisit.doctor}` : ""}
            </p>
            <div className="space-y-0.5 text-[13px] text-ink-2">
              {lastVisit.diagnoses.length > 0 && (
                <p><span className="text-ink-3">Diagnosis:</span> {lastVisit.diagnoses.join(", ")}</p>
              )}
              {lastVisit.medicines.length > 0 && (
                <p><span className="text-ink-3">Medicines:</span> {lastVisit.medicines.join(", ")}</p>
              )}
              {lastVisit.investigations.length > 0 && (
                <p><span className="text-ink-3">Tests:</span> {lastVisit.investigations.join(", ")}</p>
              )}
              {lastVisit.diagnoses.length === 0 && lastVisit.medicines.length === 0 &&
               lastVisit.investigations.length === 0 && (
                <p className="text-ink-3">No diagnosis, medicines or tests were recorded.</p>
              )}
            </div>
          </div>
        )}
        {catalogError && (
          <div className="flex items-start gap-2 rounded-[6px] border border-danger bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">{catalogError}</div>
            <button className="shrink-0 font-medium underline" onClick={() => setCatalogError("")}>Dismiss</button>
          </div>
        )}
        <Section index={1} title="Basic information" open={open === 1} onToggle={() => setOpen(open === 1 ? 0 : 1)}
          summary={name ? `${name} · ${phone}` : ""}>
          {dupes.length > 0 && isNew && (
            <div className="mb-4 rounded-[6px] border border-warn/40 bg-warn-bg p-3">
              <p className="text-[13px] font-medium text-warn">Possible existing patient</p>
              {dupes.map((d) => (
                <div key={d.id} className="mt-2 flex items-center justify-between">
                  <span className="text-[13px]">
                    {d.full_name} <span className="data text-ink-3">{d.patient_no}</span>
                  </span>
                  <a href={`/patients/${d.id}`} className="text-[13px] font-medium text-primary">
                    Open existing
                  </a>
                </div>
              ))}
              <p className="mt-2 text-[12px] text-ink-2">Or carry on to register a new patient.</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <FormRow label="Patient name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isNew} />
            </FormRow>
            <FormRow label="Phone number">
              <Input mono value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX XXXXXXX" />
            </FormRow>
            <FormRow label="WhatsApp number">
              <Input mono value={wa} disabled={sameWa} onChange={(e) => setWa(e.target.value)} />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={sameWa} onChange={(e) => setSameWa(e.target.checked)} />
                Same as phone
              </label>
            </FormRow>
            <FormRow label="Age"
              hint={dob ? `From date of birth: ${ageFromDob(dob)}` : undefined}>
              <div className="flex items-center gap-2">
                <Input mono type="number" min={0} max={120} className="w-24"
                  value={ageYears} disabled={!isNew || !!dob}
                  onChange={(e) => setAgeYears(e.target.value)} placeholder="36" />
                <span className="text-[13px] text-ink-3">years</span>
              </div>
            </FormRow>
            <FormRow label="Date of birth"
              hint={ageYears && !dob ? "Optional — age above is enough" : undefined}>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} disabled={!isNew} />
            </FormRow>
            <FormRow label="Gender">
              <ChipGrid options={["Male", "Female"]} multiple={false}
                value={gender ? [gender] : []} onChange={(v) => setGender(v[0] ?? "")} />
            </FormRow>
            <FormRow label="Doctor" required>
              {doctors.length > 0 ? (
                <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </Select>
              ) : (
                <p className="rounded-[4px] bg-danger-bg px-3 py-2 text-[13px] text-danger">
                  No doctors found for your account. Check Settings → Doctors, or ask whoever set up
                  the software to confirm your login is linked to this clinic.
                </p>
              )}
            </FormRow>
            <FormRow label="Address" className="md:col-span-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
            </FormRow>
            <FormRow label="Visit type" className="md:col-span-2">
              <ChipGrid options={["New Consultation", "Follow-up"]} multiple={false}
                value={[visitType]} onChange={(v) => setVisitType(v[0] ?? "New Consultation")} />
            </FormRow>
          </div>
        </Section>

        <Section index={2} title="Medical history" open={open === 2} onToggle={() => setOpen(open === 2 ? 0 : 2)}
          summary={history.join(", ")}>
          <ChipGrid options={MEDICAL_HISTORY} value={history} onChange={setHistory}
            exclusive={HISTORY_EXCLUSIVE} />
          {history.includes("Other") && (
            <Input className="mt-3" value={historyOther} placeholder="Which condition?"
              onChange={(e) => setHistoryOther(e.target.value)} />
          )}
        </Section>

        <Section index={3} title="Allergies & current medicines" open={open === 3}
          onToggle={() => setOpen(open === 3 ? 0 : 3)}
          summary={[allergies.join(", "), currentMeds.length && `${currentMeds.length} medicines`]
            .filter(Boolean).join(" · ")}>
          <ChipGrid options={ALLERGY_TYPES} value={allergies} onChange={setAllergies}
            exclusive={ALLERGY_EXCLUSIVE} />
          {allergies.some((a) => a !== "No Known Allergy") && (
            <Input className="mt-3" value={allergyDetail} placeholder="Allergy name or detail"
              onChange={(e) => setAllergyDetail(e.target.value)} />
          )}
          <p className="label mt-5 mb-2">Current medicines</p>
          <SearchSelect
            placeholder="Search medicine…"
            createLabel="Add medicine"
            options={catalogs.medicines.map((m) => ({
              id: m.id, label: m.name, sub: m.strength ?? undefined,
            }))}
            onPick={(o) => setCurrentMeds((c) => [...c, { id: o.id, name: o.label }])}
            onCreate={(n) => setCurrentMeds((c) => [...c, { id: null, name: n }])}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {currentMeds.map((m, i) => (
              <span key={i} className="inline-flex h-7 items-center gap-2 rounded-[4px] bg-primary-wash px-2.5 text-[13px] text-primary-deep">
                {m.name}
                <button onClick={() => setCurrentMeds((c) => c.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        </Section>

        <Section index={4} title="Lifestyle" open={open === 4} onToggle={() => setOpen(open === 4 ? 0 : 4)}
          summary={Object.values(life).filter(Boolean).join(" · ")}>
          <div className="grid gap-4 md:grid-cols-2">
            {([
              ["smoking", "Smoking", ["Yes", "No"]],
              ["tobacco", "Tobacco / Naswar", ["Yes", "No"]],
              ["sleep", "Sleep", ["Normal", "Poor"]],
              ["exercise", "Exercise", ["Regular", "Occasional", "None"]],
              ["diet", "Diet", ["Normal", "Poor"]],
            ] as const).map(([key, label, opts]) => (
              <FormRow key={key} label={label}>
                <ChipGrid options={[...opts]} multiple={false} size="sm"
                  value={life[key] ? [life[key]] : []}
                  onChange={(v) => setLife((l) => ({ ...l, [key]: v[0] ?? "" }))} />
              </FormRow>
            ))}
            <FormRow label="Other" className="md:col-span-2">
              <Input value={life.other ?? ""} onChange={(e) => setLife((l) => ({ ...l, other: e.target.value }))} />
            </FormRow>
          </div>
        </Section>

        <Section index={5} title="Chief complaint" open={open === 5} onToggle={() => setOpen(open === 5 ? 0 : 5)}
          summary={complaints.map((c) => `${c.complaint}${c.duration_value ? ` — ${c.duration_value} ${c.duration_unit.toLowerCase()}` : ""}`).join(", ")}>
          <p className="mb-2 text-[13px] text-ink-3">
            Tap a complaint below, or use “Add other complaint” to type your own. Then enter how long
            it has been going on for each one.
          </p>
          <ChipGrid
            options={catalogs.complaints.map((c) => c.name)}
            value={complaints.map((c) => c.complaint)}
            onChange={(v) =>
              setComplaints((prev) => {
                const kept = prev.filter((c) => v.includes(c.complaint));
                const added = v.filter((n) => !prev.some((c) => c.complaint === n))
                  .map((n) => ({ key: uid(), complaint: n, duration_value: "", duration_unit: "Days" }));
                return [...kept, ...added];
              })}
          />
          <div className="mt-3 space-y-2">
            {complaints.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <Input className="w-40 shrink-0" placeholder="Complaint name" value={c.complaint}
                  onChange={(e) => setComplaints((p) => p.map((x) => x.key === c.key
                    ? { ...x, complaint: e.target.value } : x))} />
                <Input mono className="w-24" placeholder="Duration" value={c.duration_value}
                  onChange={(e) => setComplaints((p) => p.map((x) => x.key === c.key
                    ? { ...x, duration_value: e.target.value } : x))} />
                <Select className="w-32" value={c.duration_unit}
                  onChange={(e) => setComplaints((p) => p.map((x) => x.key === c.key
                    ? { ...x, duration_unit: e.target.value } : x))}>
                  {DURATION_UNITS.map((u) => <option key={u}>{u}</option>)}
                </Select>
                <button className="text-ink-3 hover:text-danger"
                  onClick={() => setComplaints((p) => p.filter((x) => x.key !== c.key))}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-3"
            onClick={() => setComplaints((p) => [...p, { key: uid(), complaint: "", duration_value: "", duration_unit: "Days" }])}>
            <Plus size={14} /> Add other complaint
          </Button>
        </Section>

        <Section index={6} title="Vitals" open={open === 6} onToggle={() => setOpen(open === 6 ? 0 : 6)}
          summary={vitalSummary}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormRow label="Blood pressure">
              <div className="flex items-center gap-2">
                <Input mono placeholder="120" value={vitals.bp_systolic ?? ""}
                  onChange={(e) => setVitals((v) => ({ ...v, bp_systolic: e.target.value }))} />
                <span className="text-ink-3">/</span>
                <Input mono placeholder="80" value={vitals.bp_diastolic ?? ""}
                  onChange={(e) => setVitals((v) => ({ ...v, bp_diastolic: e.target.value }))} />
              </div>
            </FormRow>
            {([
              ["pulse", "Pulse (bpm)"], ["temperature_f", "Temperature (°F)"],
              ["weight_kg", "Weight (kg)"], ["height_cm", "Height (cm)"],
              ["spo2", "SpO₂ (%)"], ["resp_rate", "Respiratory rate"],
            ] as const).map(([k, l]) => (
              <FormRow key={k} label={l}>
                <Input mono value={vitals[k] ?? ""}
                  onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))} />
              </FormRow>
            ))}
          </div>
        </Section>

        <Section index={7} title="Physical examination" open={open === 7} onToggle={() => setOpen(open === 7 ? 0 : 7)}
          summary={EXAM_PARTS.filter((p) => exam[p.key]).map((p) => `${p.label} ${exam[p.key]}`).join(" · ")}>
          <div className="grid gap-4 md:grid-cols-2">
            {EXAM_PARTS.map((p) => (
              <FormRow key={p.key} label={p.label}>
                <ChipGrid options={["Normal", "Abnormal"]} multiple={false} size="sm"
                  value={exam[p.key] ? [exam[p.key]] : []}
                  onChange={(v) => setExam((x) => ({ ...x, [p.key]: v[0] ?? "" }))} />
              </FormRow>
            ))}
            <FormRow label="Other findings" className="md:col-span-2">
              <Textarea value={examOther} onChange={(e) => setExamOther(e.target.value)} />
            </FormRow>
          </div>
        </Section>

        <Section index={8} title="Diagnosis" open={open === 8} onToggle={() => setOpen(open === 8 ? 0 : 8)}
          summary={diagnoses.map((d) => d.text).join(", ")}>
          <SearchSelect
            placeholder="Search diagnosis…"
            createLabel="Add diagnosis"
            options={catalogs.diagnoses.map((d) => ({ id: d.id, label: d.name }))}
            onPick={(o) => setDiagnoses((d) => d.some((x) => x.id === o.id) ? d : [...d, { id: o.id, text: o.label }])}
            onCreate={createDiagnosis}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {diagnoses.map((d, i) => (
              <span key={i} className="inline-flex h-8 items-center gap-2 rounded-[4px] border border-primary bg-primary-wash px-3 text-[13px] text-primary-deep">
                {i === 0 && <span className="label text-primary">Primary</span>}
                {d.text}
                <button onClick={() => setDiagnoses((x) => x.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        </Section>

        <Section index={9} title="Investigations" open={open === 9} onToggle={() => setOpen(open === 9 ? 0 : 9)}
          summary={investigations.map((i) => i.test_name).join(", ")}>
          {(["Laboratory", "Radiology"] as const).map((cat) => (
            <div key={cat} className="mb-5">
              <p className="label mb-2">{cat === "Radiology" ? "Radiology / Imaging" : cat}</p>
              <ChipGrid
                size="sm"
                options={catalogs.investigations.filter((i) => i.category === cat).map((i) => i.name)}
                value={investigations.filter((i) => i.category === cat).map((i) => i.test_name)}
                onChange={(v) => {
                  const others = investigations.filter((i) => i.category !== cat);
                  const picked = v.map((n) => {
                    const c = catalogs.investigations.find((i) => i.name === n && i.category === cat)!;
                    return { catalog_id: c.id, test_name: c.name, category: cat, price: Number(c.price) };
                  });
                  setInvestigations([...others, ...picked]);
                }}
              />
              <div className="mt-2">
                <SearchSelect
                  placeholder={`Add a ${cat.toLowerCase()} test not listed…`}
                  createLabel="Add test"
                  options={[]}
                  onPick={() => {}}
                  onCreate={(n) => createTest(n, cat)}
                />
              </div>
            </div>
          ))}
          {invTotal > 0 && (
            <p className="data text-[13px] text-ink-3">
              Reference: catalog price for these tests is {money(invTotal)}. This is not billed
              automatically — enter what to charge in section 12, Billing.
            </p>
          )}
        </Section>

        <Section index={10} title="Prescription" open={open === 10} onToggle={() => setOpen(open === 10 ? 0 : 10)}
          summary={rxSummary}>
          {previousRx && (
            <div className="mb-4 flex items-center justify-between rounded-[6px] border border-line bg-canvas px-3 py-2.5">
              <p className="text-[13px] text-ink-2">
                Previous prescription on record — {previousRx.items.length} medicines
              </p>
              <Button size="sm" variant="secondary" onClick={copyPrevious}>
                Copy previous prescription
              </Button>
            </div>
          )}
          {templates && templates.length > 0 && (
            <div className="mb-3">
              <p className="label mb-1.5">Load template</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => loadTemplate(t)}
                    className="rounded-[4px] border border-line-strong bg-paper px-3 py-1.5 text-[13px] text-ink-2 hover:border-primary hover:text-primary">
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SearchSelect
            placeholder="Search medicine…"
            createLabel="Add new medicine"
            options={catalogs.medicines.map((m) => ({
              id: m.id, label: m.name, sub: [m.strength, m.form].filter(Boolean).join(" · "),
            }))}
            onPick={addRx}
            onCreate={createMedicine}
          />
          <div className="mt-3 space-y-3">
            {rx.map((r, i) => (
              <div key={r.key} className="rounded-[6px] border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[14px] font-medium">
                    <span className="data mr-2 text-ink-3">{i + 1}.</span>
                    {r.medicine_name} {r.strength && <span className="data text-ink-2">{r.strength}</span>}
                  </p>
                  <button className="text-ink-3 hover:text-danger"
                    onClick={() => setRx((x) => x.filter((y) => y.key !== r.key))}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Select value={r.dose} onChange={(e) => setRxField(r.key, { dose: e.target.value })}>
                    <option value="">Dose</option>
                    {DOSE_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                  </Select>
                  <Select value={r.frequency} onChange={(e) => setRxField(r.key, { frequency: e.target.value })}>
                    <option value="">Frequency</option>
                    {FREQUENCY_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                  </Select>
                  <Select value={r.duration} onChange={(e) => setRxField(r.key, { duration: e.target.value })}>
                    <option value="">Duration</option>
                    {DURATION_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                  </Select>
                  <Select value={r.route} onChange={(e) => setRxField(r.key, { route: e.target.value })}>
                    {ROUTE_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                  </Select>
                </div>
                <div className="mt-2">
                  <ChipGrid size="sm" options={INSTRUCTION_OPTIONS} value={r.instructions}
                    onChange={(v) => setRxField(r.key, { instructions: v })} />
                  {r.instructions.includes("Other") && (
                    <Input className="mt-2" placeholder="Instruction" value={r.instruction_other}
                      onChange={(e) => setRxField(r.key, { instruction_other: e.target.value })} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <FormRow label="Advice for the patient" className="mt-4">
            {adviceOptions && adviceOptions.length > 0 && (
              <ChipGrid options={adviceOptions} value={advicePicks} onChange={setAdvicePicks} />
            )}
            <Textarea className="mt-2" rows={2} placeholder="Anything else…"
              value={advice} onChange={(e) => setAdvice(e.target.value)} />
          </FormRow>
          {rx.length > 0 && (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={saveAsTemplate}>
              Save as template
            </Button>
          )}
        </Section>

        <Section index={11} title="Follow-up" open={open === 11} onToggle={() => setOpen(open === 11 ? 0 : 11)}
          summary={noFollowUp ? "No follow-up" : fuDate ? fmtDate(fuDate) : ""}>
          <ChipGrid
            options={[...FOLLOWUP_OPTIONS.map((d) => `${d} days`), "Custom date", "No follow-up"]}
            multiple={false}
            value={noFollowUp ? ["No follow-up"] : fuCustom ? ["Custom date"] : fuDays ? [`${fuDays} days`] : []}
            onChange={(v) => {
              const pick = v[0];
              setNoFollowUp(pick === "No follow-up");
              if (pick === "Custom date") { setFuDays(null); setFuCustom(isoDate(addDays(7))); }
              else if (pick && pick.endsWith("days")) { setFuCustom(""); setFuDays(parseInt(pick)); }
              else { setFuDays(null); setFuCustom(""); }
            }}
          />
          {fuCustom && (
            <Input type="date" className="mt-3 w-52" value={fuCustom}
              onChange={(e) => setFuCustom(e.target.value)} />
          )}
          {fuDate && (
            <p className="data mt-3 text-[14px] text-primary">→ {fmtDate(fuDate)}</p>
          )}
          <p className="mt-2 text-[12px] text-ink-3">
            An appointment is created automatically and linked back to this visit.
          </p>
        </Section>

        <Section index={12} title="Billing" open={open === 12} onToggle={() => setOpen(open === 12 ? 0 : 12)}
          summary={`${money(net)} · ${due > 0 ? money(due) + " due" : "settled"}`}>
          <div className="grid gap-4 md:grid-cols-3">
            <FormRow label="Consultation fee">
              <Input mono value={fee} onChange={(e) => setFee(e.target.value)} />
            </FormRow>
            <FormRow label="Investigation charges">
              <div className="flex gap-2">
                <Input mono value={invCharge} onChange={(e) => setInvCharge(e.target.value)} />
                {invTotal > 0 && (
                  <Button type="button" size="sm" variant="secondary" className="shrink-0"
                    onClick={() => setInvCharge(String(invTotal))}>
                    Use {money(invTotal)}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[12px] text-ink-3">
                Enter what to charge for the tests in section 09. Not filled in automatically.
              </p>
            </FormRow>
            <FormRow label="Other charges">
              <Input mono value={otherCharge} onChange={(e) => setOtherCharge(e.target.value)} />
            </FormRow>
            <FormRow label="Discount">
              <Input mono value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </FormRow>
            <FormRow label="Paid now">
              <Input mono value={paid} onChange={(e) => setPaid(e.target.value)} />
            </FormRow>
            <FormRow label="Payment method">
              <ChipGrid options={["Cash", "Online"]} multiple={false} size="sm"
                value={[method]} onChange={(v) => setMethod(v[0] ?? "Cash")} />
            </FormRow>
            {method === "Online" && (
              <FormRow label="Transaction / reference number" className="md:col-span-3">
                <Input mono value={reference} onChange={(e) => setReference(e.target.value)} />
              </FormRow>
            )}
          </div>
          <div className="mt-4 max-w-sm space-y-1 text-[14px]">
            <Row label="Charges" value={money(charges)} />
            <Row label="Discount" value={"− " + money(Number(discount || 0))} />
            <div className="border-t border-line-strong pt-1">
              <Row label="Net total" value={money(net)} bold />
            </div>
            <Row label="Paid" value={"− " + money(Number(paid || 0))} />
            <div className="border-t border-line-strong pt-1">
              <Row label="Due" value={money(due)} bold danger={due > 0} />
            </div>
          </div>
        </Section>

        <Section index={13} title="Private notes" open={open === 13} onToggle={() => setOpen(open === 13 ? 0 : 13)}
          summary={notes ? "Recorded" : ""}>
          <Textarea value={notes} placeholder="Never shown in the patient portal or on printouts."
            onChange={(e) => setNotes(e.target.value)} />
        </Section>
      </div>

      {/* ------------------------------------------------ rail */}
      <aside className="no-print lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4">
          <p className="label">Patient</p>
          <p className="mt-1 text-[17px] font-semibold text-ink">{name || "New patient"}</p>
          <p className="data text-[13px] text-ink-3">
            {patient?.patient_no ?? "ID assigned on save"}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dob && <Pill>{ageFromDob(dob)}</Pill>}
            {gender && <Pill>{gender}</Pill>}
            <Pill>{doctors.find((d) => d.id === doctorId)?.full_name ?? "—"}</Pill>
          </div>
          {allergyFlag.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-[4px] bg-danger-bg px-2 py-1.5 text-[12px] font-medium text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {allergyFlag.join(", ")}{allergyDetail && ` — ${allergyDetail}`}
            </p>
          )}

          <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]">
            <RailRow label="Complaints" value={complaints.map((c) => c.complaint).join(", ")} />
            <RailRow label="Diagnosis" value={diagnoses.map((d) => d.text).join(", ")} />
            <RailRow label="Investigations" value={investigations.map((i) => i.test_name).join(", ")} />
            <RailRow label="Medicines" value={rx.map((r) => r.medicine_name).join(", ")} />
            <RailRow label="Follow-up" value={noFollowUp ? "None" : fuDate ? fmtDate(fuDate) : ""} />
            <RailRow label="Net total" value={money(net)} mono />
            <RailRow label="Due" value={money(due)} mono danger={due > 0} />
          </div>

          {error && (
            <p className="mt-3 rounded-[4px] bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>
          )}
          <Button className="mt-4 w-full" loading={saving} onClick={save}>Save visit</Button>
          <p className="mt-2 text-center text-[12px] text-ink-3">
            Everything is written in one transaction.
          </p>
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : "text-ink-2"}>{label}</span>
      <span className={`data ${bold ? "font-semibold" : ""} ${danger ? "text-danger" : ""}`}>{value}</span>
    </div>
  );
}
function RailRow({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="label shrink-0">{label}</span>
      <span className={`text-right ${mono ? "data" : ""} ${danger ? "text-danger font-semibold" : "text-ink-2"}`}>
        {value || "—"}
      </span>
    </div>
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[4px] bg-canvas px-2 text-[12px] text-ink-2">
      {children}
    </span>
  );
}
