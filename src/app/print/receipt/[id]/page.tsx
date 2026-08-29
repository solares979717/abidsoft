import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PrintFrame } from "../../PrintFrame";
import { Letterhead } from "../../Letterhead";
import { money, fmtDate, fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: inv } = await sb.from("invoices")
    .select(`*, patients(full_name, patient_no, phone), doctors(full_name, qualification, affiliation),
      invoice_items(description, quantity, unit_price, amount, item_type),
      payments(amount, method, reference_no, paid_at, is_void)`)
    .eq("id", id).single();
  if (!inv) notFound();

  const { data: clinic } = await sb.from("clinics")
    .select("name, address, phone_1, phone_2").limit(1).single();

  const p = inv.patients as unknown as { full_name: string; patient_no: string; phone: string };
  const d = inv.doctors as unknown as { full_name: string; qualification: string; affiliation: string };
  const items = (inv.invoice_items as unknown as Item[]) ?? [];
  const pays = ((inv.payments as unknown as Pay[]) ?? []).filter((x) => !x.is_void);

  return (
    <PrintFrame size="A5">
      <Letterhead clinic={clinic!} doctor={d} />

      <div className="mb-4 flex justify-between text-[11px] text-black">
        <div>
          <p><span className="label">Patient</span> <b>{p.full_name}</b></p>
          <p className="data">{p.patient_no} · {p.phone}</p>
        </div>
        <div className="text-right">
          <p className="data font-semibold">{inv.invoice_no}</p>
          <p className="data">{fmtDate(inv.created_at)} · {fmtTime(inv.created_at)}</p>
        </div>
      </div>

      <table className="mb-4 w-full text-[11px] text-black">
        <thead>
          <tr className="border-b border-black">
            <th className="label py-1 text-left">Description</th>
            <th className="label py-1 text-right">Qty</th>
            <th className="label py-1 text-right">Rate</th>
            <th className="label py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-neutral-300">
              <td className="py-1.5">{it.description}</td>
              <td className="data py-1.5 text-right">{it.quantity}</td>
              <td className="data py-1.5 text-right">{money(Number(it.unit_price))}</td>
              <td className="data py-1.5 text-right">{money(Number(it.amount))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-56 space-y-0.5 text-[11px] text-black">
        <Row label="Charges" value={money(Number(inv.charges_total))} />
        <Row label="Discount" value={"− " + money(Number(inv.discount))} />
        <div className="border-t border-black pt-0.5">
          <Row label="Net total" value={money(Number(inv.net_total))} bold />
        </div>
        <Row label="Paid" value={"− " + money(Number(inv.paid_total))} />
        <div className="border-t border-black pt-0.5">
          <Row label="Due" value={money(Number(inv.due_total))} bold />
        </div>
      </div>

      <div className="mt-5 text-[11px] text-black">
        <p className="label mb-1">Payments</p>
        {pays.length === 0 && <p>No payment recorded.</p>}
        {pays.map((x, i) => (
          <p key={i} className="data">
            {fmtDate(x.paid_at)} · {money(Number(x.amount))} · {x.method}
            {x.reference_no && ` · Ref ${x.reference_no}`}
          </p>
        ))}
      </div>

      <footer className="mt-12 flex justify-between text-[10px] text-black">
        <span>Thank you.</span>
        <div className="w-40 border-t border-black pt-1 text-center">Received by</div>
      </footer>
    </PrintFrame>
  );
}

type Item = { description: string; quantity: number; unit_price: number; amount: number };
type Pay = { amount: number; method: string; reference_no: string | null; paid_at: string; is_void: boolean };

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`data ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
