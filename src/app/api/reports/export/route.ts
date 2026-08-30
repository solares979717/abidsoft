import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const from = new Date(); from.setDate(from.getDate() - days);
  const sb = await createClient();

  const { data } = await sb.from("invoices")
    .select("invoice_no, created_at, net_total, discount, paid_total, due_total, is_void, patients(full_name, patient_no), doctors(full_name)")
    .gte("created_at", from.toISOString()).eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const head = ["Invoice", "Date", "Patient", "Patient ID", "Doctor",
    "Net", "Discount", "Paid", "Due", "Status"];
  const rows = (data ?? []).map((r) => {
    const p = r.patients as unknown as { full_name: string; patient_no: string } | null;
    const d = r.doctors as unknown as { full_name: string } | null;
    const status = r.is_void ? "Cancelled"
      : Number(r.due_total) <= 0 ? "Paid"
      : Number(r.paid_total) > 0 ? "Partial" : "Unpaid";
    return [r.invoice_no, new Date(r.created_at).toISOString().slice(0, 10),
      p?.full_name ?? "", p?.patient_no ?? "", d?.full_name ?? "",
      r.net_total, r.discount, r.paid_total, r.due_total, status];
  });

  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shafiq-clinic-${days}d.csv"`,
    },
  });
}
