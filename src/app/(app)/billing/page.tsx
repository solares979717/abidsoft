import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/States";
import { money, fmtDate } from "@/lib/utils";
import Link from "next/link";
import { PaymentButton } from "@/components/billing/PaymentButton";

export const dynamic = "force-dynamic";

export default async function Billing({
  searchParams,
}: { searchParams: Promise<{ filter?: string }> }) {
  const filter = (await searchParams).filter ?? "due";
  const sb = await createClient();

  let q = sb.from("invoices")
    .select("id, invoice_no, created_at, charges_total, discount, net_total, paid_total, due_total, is_void, patient_id, visit_id, patients(full_name, patient_no), doctors(full_name)")
    .eq("is_deleted", false);
  if (filter === "due") q = q.gt("due_total", 0);

  const { data } = await q.order("created_at", { ascending: false }).limit(80);
  const rows = data ?? [];
  const outstanding = rows.reduce((a, r) => a + Number(r.due_total ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="display text-[24px]">Billing</h1>
        <p className="data text-[14px]">
          Outstanding <span className="font-semibold text-danger">{money(outstanding)}</span>
        </p>
      </div>

      <div className="flex gap-1">
        {[["Outstanding", "due"], ["All invoices", "all"]].map(([l, v]) => (
          <Link key={v} href={`/billing?filter=${v}`}
            className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium ${
              filter === v ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
            {l}
          </Link>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message={filter === "due" ? "Nothing outstanding." : "No invoices yet."} />
        ) : (
          <div className="table-scroll">
            <table className="w-full">
            <thead>
              <tr className="border-b border-line-strong">
                {["Invoice", "Date", "Patient", "Net", "Paid", "Due", "Status", ""].map((h) => (
                  <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const p = r.patients as unknown as { full_name: string; patient_no: string } | null;
                return (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className="data px-4 py-2.5 text-[13px]">{r.invoice_no}</td>
                    <td className="data px-4 text-[13px]">{fmtDate(r.created_at)}</td>
                    <td className="px-4 text-[14px]">
                      <Link href={`/patients/${r.patient_id}`}>{p?.full_name}</Link>
                      <span className="data ml-2 text-[12px] text-ink-3">{p?.patient_no}</span>
                    </td>
                    <td className="data px-4 text-[13px]">{money(r.net_total)}</td>
                    <td className="data px-4 text-[13px]">{money(r.paid_total)}</td>
                    <td className={`data px-4 text-[13px] ${Number(r.due_total) > 0 ? "font-semibold text-danger" : ""}`}>
                      {money(r.due_total)}
                    </td>
                    <td className="px-4">
                      <StatusPill status={r.is_void ? "cancelled"
                        : Number(r.due_total) <= 0 ? "paid"
                        : Number(r.paid_total) > 0 ? "partial" : "unpaid"} />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {Number(r.due_total) > 0 && (
                        <PaymentButton invoiceId={r.id} patientId={r.patient_id}
                          due={Number(r.due_total)} />
                      )}
                      {r.visit_id && (
                        <Link href={`/visits/${r.visit_id}`} className="ml-3 text-[13px] text-ink-2">Visit</Link>
                      )}
                      <Link href={`/print/receipt/${r.id}`}
                        className="ml-3 text-[13px] text-ink-2">Receipt</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
