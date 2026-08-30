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
import { FREQUENCY_OPTIONS, ROUTE_OPTIONS, DURATION_OPTIONS } from "@/lib/constants";
import { Trash2 } from "lucide-react";

type Inv = {
  id: string; test_name: string; category: string; status: string;
  result_text: string | null; result_flag: string | null;
};
type RxRow = {
  key: string; medicine_id: string | null; medicine_name: string; strength: string;
  dose: string; frequency: string; duration: string; route: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * The patient was seen, tests were ordered, and they came back a day or two
 * later with the report. Clinically that is still one consultation, so this
 * adds the results and the prescription to the SAME visit — no second visit
 * in the history, and no second consultation fee.
 */
export function ContinueVisit({
  visitId, investigations, medicines, adviceOptions, hasPrescription, startOpen, recorded, children,
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
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  function addMedicine(o?: { id: string; label: string }) {
    setRx((r) => [...r, {
      key: uid(), medicine_id: o?.id ?? null, medicine_name: o?.label ?? "",
      strength: "", dose: "1", frequency: "BD", duration: "5 days", route: ROUTE_OPTIONS[0],
    }]);
  }
  function setRow(key: string, patch: Partial<RxRow>) {
    setRx((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  async function saveResults() {
    setBusy(true);
    let failed = 0;
    for (const inv of investigations) {
      const r = results[inv.id];
      const changed = (r?.text ?? "") !== (inv.result_text ?? "") ||
                      (r?.flag ?? "") !== (inv.result_flag ?? "");
      if (!changed) continue;
      const { error } = await sb.rpc("set_investigation_result", {
        p_id: inv.id, p_text: r.text, p_flag: r.flag || null,
      });
      if (error) failed++;
    }
    setBusy(false);
    if (failed > 0) return toast(`${failed} result(s) couldn't be saved.`, "error");
    toast("Results saved");
    router.refresh();
  }

  async function addToVisit() {
    if (rx.length === 0 && advice.length === 0 && !adviceOther.trim()) {
      return toast("Add a medicine or some advice first.", "error");
    }
    if (rx.some((r) => !r.medicine_name.trim())) {
      return toast("Every row needs a medicine name.", "error");
    }
    setBusy(true);
    const adviceText = [...advice, adviceOther.trim()].filter(Boolean).join(". ");
    const { data, error } = await sb.rpc("continue_visit", {
      payload: {
        visit_id: visitId,
        prescription_items: rx.map((r, i) => ({ ...r, sort_order: i })),
        advice: adviceText,
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

      {recorded && (
        <div className="border-b border-line bg-canvas px-4 py-2.5 text-[13px] text-ink-2">
          <span className="text-ink-3">Already recorded {recorded.date}:</span>{" "}
          {[recorded.complaints.join(", "), recorded.diagnoses.join(", ")]
            .filter(Boolean).join(" · ") || "nothing yet"}
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
            <Button variant="secondary" size="sm" className="mt-3"
              onClick={saveResults} loading={busy}>
              Save results
            </Button>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <p className="label mb-2">Prescription</p>
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
            {rx.map((r) => (
              <div key={r.key} className="rounded-[6px] border border-line p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input className="flex-1" placeholder="Medicine" value={r.medicine_name}
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

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addToVisit} loading={busy}>Add to this visit</Button>
        </div>
      </div>
    </Card>
  );
}
