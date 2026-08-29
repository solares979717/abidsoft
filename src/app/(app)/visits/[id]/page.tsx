import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { money, fmtDate } from "@/lib/utils";
import { ContinueVisit } from "@/components/consultation/ContinueVisit";

export const dynamic = "force-dynamic";

export default async function VisitDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ continue?: string }>;
}) {
  const { id } = await params;
  const { continue: startOpen } = await searchParams;
  const sb = await createClient();

  const { data: v } = await sb.from("visits")
    .select(`*, patients(id, full_name, patient_no, dob, gender, phone),
      doctors(full_name, qualification),
      visit_complaints(complaint, duration_value, duration_unit),
      vitals(*), physical_examinations(*), visit_diagnoses(diagnosis_text, is_primary),
      visit_investigations(id, test_name, category, status, result_text, result_flag),
      prescriptions(id, advice, prescription_items(medicine_name, strength, dose, frequency, duration, route, instructions)),
      followups(follow_up_date, interval_days),
      invoices(id, invoice_no, charges_total, discount, net_total, paid_total, due_total)`)
    .eq("id", id).single();
  if (!v) notFound();

  const [{ data: meds }, { data: adviceRows }] = await Promise.all([
    sb.from("medicines").select("id, name, strength").eq("is_active", true)
      .order("name").limit(600),
    sb.from("advice_catalog").select("text").eq("is_active", true).order("sort_order"),
  ]);

  const p = v.patients as unknown as { id: string; full_name: string; patient_no: string; phone: string };
  const d = v.doctors as unknown as { full_name: string; qualification: string };
  const vitals = (v.vitals as unknown as Record<string, number> [])?.[0];
  const exam = (v.physical_examinations as unknown as Record<string, string>[])?.[0];
  const rx = (v.prescriptions as unknown as { id: string; advice: string; prescription_items: RxItem[] }[])?.[0];
  const inv = (v.invoices as unknown as Record<string, number & string>[])?.[0];
  const fu = (v.followups as unknown as { follow_up_date: string }[])?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-[24px]">Visit — {fmtDate(v.visit_date)}</h1>
          <p className="text-[13px] text-ink-2">
            <Link href={`/patients/${p.id}`} className="text-primary">{p.full_name}</Link>
            <span className="data"> · {p.patient_no}</span> · {d.full_name} · {v.visit_type}
          </p>
        </div>
        <div className="flex gap-3 text-[13px]">
          <Link href={`/print/visit/${v.id}`} className="font-medium text-primary">Print visit summary</Link>
          {rx && <Link href={`/print/prescription/${rx.id}`} className="text-ink-2">Print prescription</Link>}
          {inv && <Link href={`/print/receipt/${inv.id}`} className="text-ink-2">Print receipt</Link>}
        </div>
      </div>

      <ContinueVisit
        visitId={v.id}
        investigations={(v.visit_investigations as unknown as {
          id: string; test_name: string; category: string; status: string;
          result_text: string | null; result_flag: string | null;
        }[]) ?? []}
        medicines={meds ?? []}
        adviceOptions={(adviceRows ?? []).map((a) => a.text)}
        hasPrescription={!!rx}
        startOpen={startOpen === "1"}
        recorded={{
          date: fmtDate(v.visit_date),
          complaints: ((v.visit_complaints as unknown as { complaint: string }[]) ?? [])
            .map((c) => c.complaint),
          diagnoses: ((v.visit_diagnoses as unknown as { diagnosis_text: string }[]) ?? [])
            .map((x) => x.diagnosis_text),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Complaints" />
          <ul className="divide-y divide-line">
            {(v.visit_complaints as unknown as Complaint[] ?? []).map((c, i) => (
              <li key={i} className="px-4 py-2.5 text-[14px]">
                {c.complaint}
                {c.duration_value && (
                  <span className="data text-ink-2"> — {c.duration_value} {c.duration_unit?.toLowerCase()}</span>
                )}
              </li>
            ))}
            {!(v.visit_complaints as unknown[])?.length &&
              <li className="px-4 py-4 text-[13px] text-ink-3">None recorded.</li>}
          </ul>
        </Card>

        <Card>
          <CardHead title="Vitals" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {vitals ? [
              ["BP", vitals.bp_systolic && `${vitals.bp_systolic}/${vitals.bp_diastolic}`],
              ["Pulse", vitals.pulse], ["Temp °F", vitals.temperature_f],
              ["Weight kg", vitals.weight_kg], ["Height cm", vitals.height_cm],
              ["SpO₂ %", vitals.spo2], ["Resp rate", vitals.resp_rate],
            ].map(([l, val]) => (
              <div key={String(l)}>
                <p className="label">{String(l)}</p>
                <p className="data text-[14px]">{val ? String(val) : "—"}</p>
              </div>
            )) : <p className="text-[13px] text-ink-3">None recorded.</p>}
          </div>
        </Card>

        <Card>
          <CardHead title="Examination" />
          <div className="grid grid-cols-2 gap-3 p-4">
            {exam ? ["general_condition", "chest", "cvs", "abdomen", "cns"].map((k) => (
              <div key={k}>
                <p className="label">{k.replace("_", " ")}</p>
                <p className="text-[14px]">{exam[k] ?? "—"}</p>
              </div>
            )) : <p className="text-[13px] text-ink-3">None recorded.</p>}
            {exam?.other_findings && (
              <div className="col-span-2">
                <p className="label">Other findings</p>
                <p className="text-[14px]">{exam.other_findings}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Diagnosis" />
          <ul className="divide-y divide-line">
            {(v.visit_diagnoses as unknown as { diagnosis_text: string; is_primary: boolean }[] ?? [])
              .map((x, i) => (
                <li key={i} className="px-4 py-2.5 text-[14px]">
                  {x.is_primary && <span className="label mr-2 text-primary">Primary</span>}
                  {x.diagnosis_text}
                </li>
              ))}
            {!(v.visit_diagnoses as unknown[])?.length &&
              <li className="px-4 py-4 text-[13px] text-ink-3">None recorded.</li>}
          </ul>
        </Card>

        <Card>
          <CardHead title="Investigations" />
          <ul className="divide-y divide-line">
            {(v.visit_investigations as unknown as { test_name: string; category: string; status: string }[] ?? [])
              .map((x, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5 text-[14px]">
                  <span>{x.test_name}</span>
                  <span className="text-[13px] text-ink-2">{x.status}</span>
                </li>
              ))}
            {!(v.visit_investigations as unknown[])?.length &&
              <li className="px-4 py-4 text-[13px] text-ink-3">None ordered.</li>}
          </ul>
        </Card>

        <Card>
          <CardHead title="Prescription" />
          <ol className="divide-y divide-line">
            {(rx?.prescription_items ?? []).map((m, i) => (
              <li key={i} className="px-4 py-2.5">
                <p className="text-[14px] font-medium">
                  <span className="data mr-2 text-ink-3">{i + 1}.</span>
                  {m.medicine_name} {m.strength && <span className="data text-ink-2">{m.strength}</span>}
                </p>
                <p className="data text-[13px] text-ink-2">
                  {[m.dose, m.frequency, m.duration, m.route].filter(Boolean).join(" · ")}
                </p>
                {m.instructions?.length > 0 && (
                  <p className="text-[13px] italic text-ink-3">{m.instructions.join(", ")}</p>
                )}
              </li>
            ))}
            {!rx && <li className="px-4 py-4 text-[13px] text-ink-3">No prescription.</li>}
          </ol>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Follow-up" />
          <p className="data p-4 text-[14px]">
            {fu ? fmtDate(fu.follow_up_date) : "No follow-up scheduled."}
          </p>
        </Card>
        <Card>
          <CardHead title="Billing" />
          {inv ? (
            <div className="space-y-1 p-4 text-[14px]">
              <Line label="Charges" value={money(Number(inv.charges_total))} />
              <Line label="Discount" value={"− " + money(Number(inv.discount))} />
              <div className="border-t border-line-strong pt-1">
                <Line label="Net total" value={money(Number(inv.net_total))} bold />
              </div>
              <Line label="Paid" value={"− " + money(Number(inv.paid_total))} />
              <div className="border-t border-line-strong pt-1">
                <Line label="Due" value={money(Number(inv.due_total))} bold
                  danger={Number(inv.due_total) > 0} />
              </div>
            </div>
          ) : <p className="p-4 text-[13px] text-ink-3">No invoice.</p>}
        </Card>
      </div>
    </div>
  );
}

type Complaint = { complaint: string; duration_value: number; duration_unit: string };
type RxItem = {
  medicine_name: string; strength: string; dose: string; frequency: string;
  duration: string; route: string; instructions: string[];
};

function Line({ label, value, bold, danger }: {
  label: string; value: string; bold?: boolean; danger?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : "text-ink-2"}>{label}</span>
      <span className={`data ${bold ? "font-semibold" : ""} ${danger ? "text-danger" : ""}`}>{value}</span>
    </div>
  );
}
