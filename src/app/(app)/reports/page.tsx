import { createClient } from "@/lib/supabase/server";
import { Card, CardHead } from "@/components/ui/Card";
import { money, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Reports({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const days = Number((await searchParams).days ?? 30);
  const from = new Date(); from.setDate(from.getDate() - days);
  const sb = await createClient();

  const [patients, newPatients, visits, invoices, payments, diagnoses, invs, doctors] =
    await Promise.all([
      sb.from("patients").select("id", { count: "exact", head: true }).eq("is_deleted", false),
      sb.from("patients").select("id", { count: "exact", head: true })
        .gte("created_at", from.toISOString()),
      sb.from("visits").select("id, doctor_id, patient_id, visit_type, visit_date")
        .gte("visit_date", from.toISOString()).eq("is_deleted", false),
      sb.from("invoices").select("net_total, discount, paid_total, due_total, doctor_id, created_at")
        .gte("created_at", from.toISOString()).eq("is_deleted", false),
      sb.from("payments").select("amount, paid_at, method")
        .gte("paid_at", from.toISOString()).eq("is_void", false),
      sb.from("visit_diagnoses").select("diagnosis_text"),
      sb.from("visit_investigations").select("test_name, category")
        .gte("ordered_at", from.toISOString()),
      sb.from("doctors").select("id, full_name"),
    ]);

  const V = visits.data ?? [], I = invoices.data ?? [], P = payments.data ?? [];
  const revenue = P.reduce((a, p) => a + Number(p.amount), 0);
  const due = I.reduce((a, i) => a + Number(i.due_total), 0);
  const discounts = I.reduce((a, i) => a + Number(i.discount), 0);
  const returning = new Set(V.filter((v) => v.visit_type === "follow_up").map((v) => v.patient_id)).size;

  const top = (arr: string[]) =>
    Object.entries(arr.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 8);

  const byDoctor = (doctors.data ?? []).map((d) => ({
    name: d.full_name,
    visits: V.filter((v) => v.doctor_id === d.id).length,
    patients: new Set(V.filter((v) => v.doctor_id === d.id).map((v) => v.patient_id)).size,
    revenue: I.filter((i) => i.doctor_id === d.id).reduce((a, i) => a + Number(i.paid_total), 0),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="display text-[24px]">Reports</h1>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <a key={d} href={`/reports?days=${d}`}
              className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium ${
                days === d ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
              {d === 365 ? "1 year" : `${d} days`}
            </a>
          ))}
        </div>
      </div>
      <p className="data text-[13px] text-ink-3">From {fmtDate(from)} to {fmtDate(new Date())}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Total patients", String(patients.count ?? 0)],
          ["New patients", String(newPatients.count ?? 0)],
          ["Returning patients", String(returning)],
          ["Visits", String(V.length)],
          ["Revenue collected", money(revenue)],
          ["Outstanding due", money(due)],
          ["Discounts given", money(discounts)],
          ["Investigations", String((invs.data ?? []).length)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-[6px] border border-line bg-paper px-4 py-3">
            <p className="label">{l}</p>
            <p className="data mt-1 text-[20px] leading-[26px]">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Common diagnoses" />
          <ul className="divide-y divide-line">
            {top((diagnoses.data ?? []).map((d) => d.diagnosis_text)).map(([n, c]) => (
              <li key={n} className="flex justify-between px-4 py-2.5 text-[14px]">
                <span>{n}</span><span className="data text-ink-2">{c}</span>
              </li>
            ))}
            {(diagnoses.data ?? []).length === 0 &&
              <li className="px-4 py-6 text-center text-[13px] text-ink-3">No data yet.</li>}
          </ul>
        </Card>

        <Card>
          <CardHead title="Most ordered investigations" />
          <ul className="divide-y divide-line">
            {top((invs.data ?? []).map((i) => i.test_name)).map(([n, c]) => (
              <li key={n} className="flex justify-between px-4 py-2.5 text-[14px]">
                <span>{n}</span><span className="data text-ink-2">{c}</span>
              </li>
            ))}
            {(invs.data ?? []).length === 0 &&
              <li className="px-4 py-6 text-center text-[13px] text-ink-3">No data yet.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHead title="By doctor" />
        <div className="table-scroll">
          <table className="w-full">
          <thead>
            <tr className="border-b border-line-strong">
              {["Doctor", "Visits", "Patients", "Collected"].map((h) => (
                <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {byDoctor.map((d) => (
              <tr key={d.name} className="h-11">
                <td className="px-4 text-[14px]">{d.name}</td>
                <td className="data px-4 text-[13px]">{d.visits}</td>
                <td className="data px-4 text-[13px]">{d.patients}</td>
                <td className="data px-4 text-[13px]">{money(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <a href={`/api/reports/export?days=${days}`}
        className="inline-flex h-[38px] items-center rounded-[6px] border border-line-strong bg-paper px-4 text-[14px] font-medium">
        Download CSV
      </a>
    </div>
  );
}
