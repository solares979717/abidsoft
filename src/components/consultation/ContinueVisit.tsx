"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FormRow } from "@/components/ui/Field";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { FREQUENCY_OPTIONS, ROUTE_OPTIONS, DURATION_OPTIONS, INSTRUCTION_OPTIONS,
  FOLLOWUP_OPTIONS } from "@/lib/constants";
import { addDays, isoDate, fmtDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type Inv = {
  id: string; test_name: string; category: string; status: string;
  result_text: string | null; result_flag: string | null;
};
type RxRow = {
  key: string; medicine_id: string | null; medicine_name: string; strength: string;
  dose: string; frequency: string; duration: string; route: string;
  instructions: string[];
};

const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * The patient was seen, tests were ordered, and they came back a day or two
 * later with the report. Clinically that is still one consultation, so this
 * adds the results and the prescription to the SAME visit — no second visit
 * in the history, and no second consultation fee.
 */
export function ContinueVisit({
  visitId, investigations, medicines, adviceOptions, hasPrescription, startOpen, recorded,
  existing, diagnosisOptions, complaintOptions, children,
}: {
  visitId: string;
  investigations: Inv[];
  medicines: { id: string; name: string; strength: string | null }[];
  adviceOptions: string[];
  hasPrescription: boolean;
  /** Opened straight from the patient's visit list, so skip the prompt. */
  startOpen?: boolean;
  /** A one-line reminder of what was already written at the first visit, so
   *  the doctor can see it without the whole page repeating itself. */
  recorded?: { complaints: string[]; diagnoses: string[]; date: string };
  /** What is already on the visit, so it can be corrected rather than only
   *  added to. The results often change the diagnosis. */
  existing?: {
    complaints: { complaint: string; duration_value: string; duration_unit: string }[];
    diagnoses: string[];
    vitals: Record<string, string>;
    privateNote: string;
    prescriptionId: string | null;
    prescriptionShared: boolean;
    prescriptionItems: RxRow[];
  };
  diagnosisOptions?: { id: string; name: string }[];
  complaintOptions?: string[];
  /** The read-only visit record. Hidden while the panel is open so the
   *  doctor sees one thing at a time instead of the same information twice. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!startOpen);
  const [results, setResults] = React.useState<Record<string, { text: string; flag: string }>>(
    Object.fromEntries(investigations.map((i) => [i.id, {
      text: i.result_text ?? "", flag: i.result_flag ?? "",
    }]))
  );
  const [rx, setRx] = React.useState<RxRow[]>([]);
  const [advice, setAdvice] = React.useState<string[]>([]);
  const [adviceOther, setAdviceOther] = React.useState("");
  // A follow-up decided now that the results are in — the reason the patient
  // came back — belongs on this visit, not on a separate one.
  const [followupDays, setFollowupDays] = React.useState<number | null>(null);
  const [followupDate, setFollowupDate] = React.useState("");

  // Sections already on the visit, loaded so they can be corrected.
  const [editOpen, setEditOpen] = React.useState(false);
  const [cx, setCx] = React.useState(existing?.complaints ?? []);
  const [dx, setDx] = React.useState<string[]>(existing?.diagnoses ?? []);
  const [vitals, setVitals] = React.useState<Record<string, string>>(existing?.vitals ?? {});
  const [note, setNote] = React.useState(existing?.privateNote ?? "");
  // The prescription already written, editable in place.
  const [oldRx, setOldRx] = React.useState<RxRow[]>(existing?.prescriptionItems ?? []);

  const vitalSummary = [
    vitals.bp_systolic && `BP ${vitals.bp_systolic}/${vitals.bp_diastolic ?? "—"}`,
    vitals.pulse && `Pulse ${vitals.pulse}`,
    vitals.temperature && `Temp ${vitals.temperature}°F`,
    vitals.spo2 && `SpO₂ ${vitals.spo2}%`,
    vitals.weight_kg && `Wt ${vitals.weight_kg} kg`,
  ].filter(Boolean) as string[];
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  function addMedicine(o?: { id: string; label: string }) {
    setRx((r) => [...r, {
      key: uid(), medicine_id: o?.id ?? null, medicine_name: o?.label ?? "",
      strength: "", dose: "1", frequency: "BD", duration: "5 days", route: ROUTE_OPTIONS[0],
      instructions: [],
    }]);
  }
  function setRow(key: string, patch: Partial<RxRow>) {
    setRx((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  async function addToVisit() {
    const anyResult = investigations.some((inv) => {
      const r = results[inv.id];
      return (r?.text ?? "") !== (inv.result_text ?? "") ||
             (r?.flag ?? "") !== (inv.result_flag ?? "");
    });
    if (!editOpen && rx.length === 0 && advice.length === 0 && !adviceOther.trim() && !anyResult && !followupDate) {
      return toast("Type a result, or add a medicine, advice or a follow-up.", "error");
    }
    if (rx.some((r) => !r.medicine_name.trim())) {
      return toast("Every row needs a medicine name.", "error");
    }
    setBusy(true);

    // Save any typed results first, so the doctor doesn't have to remember
    // to press two buttons. Nothing typed means nothing to save.
    for (const inv of investigations) {
      const r = results[inv.id];
      const changed = (r?.text ?? "") !== (inv.result_text ?? "") ||
                      (r?.flag ?? "") !== (inv.result_flag ?? "");
      if (!changed) continue;
      await sb.rpc("set_investigation_result", {
        p_id: inv.id, p_text: r?.text ?? "", p_flag: r?.flag || null,
      });
    }

    // Corrections to what was already on the visit go first, so that if the
    // doctor only fixed the diagnosis and added nothing new, it still saves.
    if (editOpen) {
      const { error: editErr } = await sb.rpc("update_visit_details", {
        payload: {
          visit_id: visitId,
          complaints: cx.filter((c) => c.complaint.trim()),
          diagnoses: dx.filter(Boolean).map((t, i) => ({
            diagnosis_text: t, is_primary: i === 0,
          })),
          vitals,
          private_notes: note,
        },
      });
      if (editErr) {
        setBusy(false);
        return toast(`Couldn't save the corrections. ${editErr.message}`, "error");
      }

      // A prescription already written can be corrected in place. If the
      // patient has already been given it, ask first — the paper they are
      // holding will no longer match the record.
      if (existing?.prescriptionId && oldRx.length > 0) {
        if (existing.prescriptionShared &&
            !confirm("This prescription has already been printed or sent to the patient. Change it anyway?")) {
          setBusy(false);
          return;
        }
        const { error: rxErr } = await sb.rpc("replace_prescription_items", {
          payload: {
            prescription_id: existing.prescriptionId,
            items: oldRx.map((r, i) => ({ ...r, sort_order: i })),
          },
        });
        if (rxErr) {
          setBusy(false);
          return toast(`Couldn't update the prescription. ${rxErr.message}`, "error");
        }
      }
    }

    const adviceText = [...advice, adviceOther.trim()].filter(Boolean).join(". ");
    if (rx.length === 0 && !adviceText && !followupDate) {
      setBusy(false);
      toast("Visit updated");
      router.refresh();
      return;
    }

    const { data, error } = await sb.rpc("continue_visit", {
      payload: {
        visit_id: visitId,
        prescription_items: rx.map((r, i) => ({ ...r, sort_order: i })),
        advice: adviceText,
        followup: followupDate
          ? { type: "scheduled", date: followupDate, time: "10:00",
              interval_days: followupDays ?? null }
          : { type: "none" },
      },
    });
    setBusy(false);
    if (error) return toast(`Couldn't add to the visit. ${error.message}`, "error");
    toast("Added to this visit");
    const res = data as { prescription_id: string | null };
    if (res?.prescription_id) router.push(`/print/prescription/${res.prescription_id}`);
    else router.refresh();
  }

  if (!open) {
    return (
      <>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>Continue this visit</Button>
        </div>
        {children}
      </>
    );
  }

  return (
    <Card>
      <CardHead title="Continue this visit"
        action={<button className="text-[13px] text-ink-2" onClick={() => setOpen(false)}>Close</button>} />

      {recorded && !editOpen && (
        <div className="border-b border-line bg-canvas px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1 text-[13px]">
              <p className="text-ink-2">
                <span className="text-ink-3">Recorded {recorded.date}:</span>{" "}
                {[recorded.complaints.join(", "), recorded.diagnoses.join(", ")]
                  .filter(Boolean).join(" · ") || "nothing yet"}
              </p>
              {/* Vitals belong on screen, not behind a button. When a patient
                  comes back with results the first thing the doctor looks for
                  is what the blood pressure was last time. */}
              {vitalSummary.length > 0 ? (
                <p className="data flex flex-wrap gap-x-4 gap-y-0.5 text-ink-2">
                  {vitalSummary.map((t, i) => <span key={i}>{t}</span>)}
                </p>
              ) : (
                <p className="text-[12px] text-ink-3">
                  No vitals were recorded on this visit — add them with “Correct this”.
                </p>
              )}
            </div>
            <button onClick={() => setEditOpen(true)}
              className="shrink-0 text-[13px] font-medium text-primary">Correct this</button>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="space-y-4 border-b border-line bg-canvas px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="label">Correcting what was recorded</p>
            <button onClick={() => setEditOpen(false)} className="text-[13px] text-ink-2">
              Leave unchanged
            </button>
          </div>

          <FormRow label="Complaints">
            {complaintOptions && complaintOptions.length > 0 && (
              <ChipGrid
                options={complaintOptions}
                value={cx.map((c) => c.complaint)}
                onChange={(v) => setCx(v.map((name) => {
                  const had = cx.find((c) => c.complaint === name);
                  return had ?? { complaint: name, duration_value: "", duration_unit: "Days" };
                }))}
              />
            )}
            <div className="mt-2 space-y-2">
              {cx.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="flex-1" placeholder="Complaint" value={c.complaint}
                    onChange={(e) => setCx((p) => p.map((x, j) =>
                      j === i ? { ...x, complaint: e.target.value } : x))} />
                  <Input mono className="w-20" placeholder="How long" value={c.duration_value}
                    onChange={(e) => setCx((p) => p.map((x, j) =>
                      j === i ? { ...x, duration_value: e.target.value } : x))} />
                  <ChipGrid size="sm" multiple={false} options={["Hours","Days","Weeks","Months"]}
                    value={[c.duration_unit]}
                    onChange={(v) => setCx((p) => p.map((x, j) =>
                      j === i ? { ...x, duration_unit: v[0] ?? "Days" } : x))} />
                  <button onClick={() => setCx((p) => p.filter((_, j) => j !== i))}
                    className="text-ink-3 hover:text-danger"><Trash2 size={14} /></button>
                </div>
              ))}
              <Button size="sm" variant="secondary"
                onClick={() => setCx((p) => [...p, { complaint: "", duration_value: "", duration_unit: "Days" }])}>
                Add complaint
              </Button>
            </div>
          </FormRow>

          <FormRow label="Vitals">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["bp_systolic","BP systolic"],["bp_diastolic","BP diastolic"],
                 ["pulse","Pulse"],["temperature","Temp °F"],
                 ["weight_kg","Weight kg"],["spo2","SpO₂ %"]] as const).map(([k, l]) => (
                <div key={k}>
                  <p className="label mb-1">{l}</p>
                  <Input mono value={vitals[k] ?? ""}
                    onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </FormRow>

          <FormRow label="Diagnosis">
            {diagnosisOptions && diagnosisOptions.length > 0 && (
              <ChipGrid options={diagnosisOptions.slice(0, 24).map((d) => d.name)}
                value={dx} onChange={setDx} />
            )}
            <div className="mt-2 space-y-2">
              {dx.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="flex-1" value={t}
                    onChange={(e) => setDx((p) => p.map((x, j) => j === i ? e.target.value : x))} />
                  <button onClick={() => setDx((p) => p.filter((_, j) => j !== i))}
                    className="text-ink-3 hover:text-danger"><Trash2 size={14} /></button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setDx((p) => [...p, ""])}>
                Add diagnosis
              </Button>
            </div>
          </FormRow>

          {existing?.prescriptionId && oldRx.length > 0 && (
            <FormRow label="Prescription already written">
              {existing.prescriptionShared && (
                <p className="mb-2 text-[12px] text-warn">
                  This has already been printed or sent. Changing it means the patient&apos;s
                  copy will not match the record — you will be asked to confirm.
                </p>
              )}
              <div className="space-y-2">
                {oldRx.map((r, i) => (
                  <div key={r.key} className="rounded-[6px] border border-line bg-paper p-2">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="data w-4 text-[12px] text-ink-3">{i + 1}.</span>
                      <Input className="flex-1 !font-semibold" value={r.medicine_name}
                        onChange={(e) => setOldRx((p) => p.map((x, j) =>
                          j === i ? { ...x, medicine_name: e.target.value } : x))} />
                      <Input className="w-24" placeholder="Strength" value={r.strength}
                        onChange={(e) => setOldRx((p) => p.map((x, j) =>
                          j === i ? { ...x, strength: e.target.value } : x))} />
                      <button onClick={() => setOldRx((p) => p.filter((_, j) => j !== i))}
                        className="text-ink-3 hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input mono placeholder="Dose" value={r.dose}
                        onChange={(e) => setOldRx((p) => p.map((x, j) =>
                          j === i ? { ...x, dose: e.target.value } : x))} />
                      <ChipGrid size="sm" multiple={false} options={FREQUENCY_OPTIONS}
                        value={[r.frequency]} onChange={(v) => setOldRx((p) => p.map((x, j) =>
                          j === i ? { ...x, frequency: v[0] ?? "" } : x))} />
                      <ChipGrid size="sm" multiple={false} options={DURATION_OPTIONS}
                        value={[r.duration]} onChange={(v) => setOldRx((p) => p.map((x, j) =>
                          j === i ? { ...x, duration: v[0] ?? "" } : x))} />
                    </div>
                  </div>
                ))}
              </div>
            </FormRow>
          )}

          <FormRow label="Private note"
            hint="Only the clinic sees this. It never appears on the printed sheet or the patient portal.">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Notes for yourself about this patient…" />
          </FormRow>
        </div>
      )}

      <div className="space-y-5 p-4">
        {investigations.length > 0 && (
          <div>
            <p className="label mb-2">Results</p>
            <div className="space-y-3">
              {investigations.map((i) => (
                <div key={i.id} className="rounded-[6px] border border-line p-3">
                  <p className="mb-2 text-[14px] font-medium">
                    {i.test_name}
                    <span className="ml-2 text-[12px] font-normal text-ink-3">{i.category}</span>
                  </p>
                  <div className="flex flex-wrap items-start gap-2">
                    <Input
                      className="min-w-[220px] flex-1"
                      placeholder="e.g. Hb 9.2 g/dL"
                      value={results[i.id]?.text ?? ""}
                      onChange={(e) => setResults((r) => ({
                        ...r, [i.id]: { ...r[i.id], text: e.target.value },
                      }))}
                    />
                    <ChipGrid
                      size="sm" multiple={false}
                      options={["normal", "abnormal"]}
                      value={results[i.id]?.flag ? [results[i.id].flag] : []}
                      onChange={(v) => setResults((r) => ({
                        ...r, [i.id]: { ...r[i.id], flag: v[0] ?? "" },
                      }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">
              Results are saved when you press <b>Save</b> at the bottom — no need to
              press anything here.
            </p>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="label">Prescription</p>
            {/* Written so far, in one line — with three or four medicines the
                rows below are too tall to take in at a glance. */}
            {rx.length > 0 && (
              <p className="text-[13px] text-ink-2">
                {rx.length} medicine{rx.length === 1 ? "" : "s"}:{" "}
                <span className="font-medium text-ink">
                  {rx.map((r) => r.medicine_name.trim() || "(unnamed)").join(", ")}
                </span>
              </p>
            )}
          </div>
          {hasPrescription && (
            <p className="mb-2 text-[12px] text-ink-3">
              This visit already has a prescription. Anything added here becomes a second,
              separate prescription — the first one is not changed.
            </p>
          )}
          <SearchSelect
            options={medicines.map((m) => ({
              id: m.id, label: m.name, sub: m.strength ?? undefined,
            }))}
            onPick={(o) => addMedicine({ id: o.id, label: o.label })}
            onCreate={(n) => addMedicine({ id: "", label: n })}
            placeholder="Search medicine, or type a new name…"
          />

          <div className="mt-3 space-y-2">
            {rx.map((r, idx) => (
              <div key={r.key} className="rounded-[6px] border border-line-strong p-3">
                {/* The name in its own row and in bold — with several medicines
                    on screen the doctor must be able to see at a glance what
                    they have written so far. */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="data w-5 shrink-0 text-[13px] text-ink-3">{idx + 1}.</span>
                  <Input className="flex-1 !text-[15px] !font-semibold" placeholder="Medicine name"
                    value={r.medicine_name}
                    onChange={(e) => setRow(r.key, { medicine_name: e.target.value })} />
                  <Input className="w-28" placeholder="Strength" value={r.strength}
                    onChange={(e) => setRow(r.key, { strength: e.target.value })} />
                  <button onClick={() => setRx((x) => x.filter((y) => y.key !== r.key))}
                    className="text-ink-3 hover:text-danger" aria-label="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input mono placeholder="Dose" value={r.dose}
                    onChange={(e) => setRow(r.key, { dose: e.target.value })} />
                  <ChipGrid size="sm" multiple={false} options={FREQUENCY_OPTIONS}
                    value={[r.frequency]} onChange={(v) => setRow(r.key, { frequency: v[0] ?? "" })} />
                  <ChipGrid size="sm" multiple={false} options={DURATION_OPTIONS}
                    value={[r.duration]} onChange={(v) => setRow(r.key, { duration: v[0] ?? "" })} />
                  <ChipGrid size="sm" multiple={false} options={ROUTE_OPTIONS}
                    value={[r.route]} onChange={(v) => setRow(r.key, { route: v[0] ?? "" })} />
                </div>
                <div className="mt-2">
                  <p className="label mb-1">When to take it</p>
                  <ChipGrid size="sm" options={INSTRUCTION_OPTIONS} value={r.instructions}
                    onChange={(v) => setRow(r.key, { instructions: v })} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <FormRow label="Advice for the patient">
            <ChipGrid options={adviceOptions} value={advice} onChange={setAdvice} />
            <Textarea className="mt-2" rows={2} placeholder="Anything else…"
              value={adviceOther} onChange={(e) => setAdviceOther(e.target.value)} />
          </FormRow>
        </div>

        <div className="border-t border-line pt-4">
          <FormRow label="Follow-up">
            <ChipGrid
              size="sm" multiple={false}
              options={[...FOLLOWUP_OPTIONS.map((d) => `${d} days`), "No follow-up"]}
              value={followupDays ? [`${followupDays} days`] : followupDate ? [] : ["No follow-up"]}
              onChange={(v) => {
                const pick = v[0];
                if (!pick || pick === "No follow-up") {
                  setFollowupDays(null); setFollowupDate("");
                  return;
                }
                const days = Number(pick.split(" ")[0]);
                setFollowupDays(days);
                setFollowupDate(isoDate(addDays(days)));
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <Input type="date" className="w-44" value={followupDate}
                onChange={(e) => { setFollowupDate(e.target.value); setFollowupDays(null); }} />
              {followupDate && (
                <span className="data text-[13px] text-primary">{fmtDate(followupDate)}</span>
              )}
            </div>
          </FormRow>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addToVisit} loading={busy}>Save</Button>
        </div>
      </div>
    </Card>
  );
}
