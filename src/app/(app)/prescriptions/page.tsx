import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtDate } from "@/lib/utils";
import Link from "next/link";
import { Input } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

export default async function Prescriptions({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const sb = await createClient();

  let ids: string[] | null = null;
  if (q) {
    const { data } = await sb.rpc("global_search", { q });
    ids = ((data as { patients?: { id: string }[] })?.patients ?? []).map((p) => p.id);
  }

  let query = sb.from("prescriptions")
    .select("id, created_at, patient_id, visit_id, patients(full_name, patient_no, phone), doctors(full_name), prescription_items(medicine_name, dose, frequency, duration)")
    .eq("is_deleted", false);
  if (ids) query = query.in("patient_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const { data } = await query.order("created_at", { ascending: false }).limit(60);
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="display text-[24px]">Prescriptions</h1>

      <form className="max-w-md">
        <Input name="q" defaultValue={q}
          placeholder="Search by patient name, phone or PAT-ID, then press Enter" />
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message={q ? `No prescriptions for “${q}”.` : "No prescriptions yet."} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const p = r.patients as unknown as { full_name: string; patient_no: string; phone: string } | null;
              const d = r.doctors as unknown as { full_name: string } | null;
              const items = (r.prescription_items as unknown as
                { medicine_name: string; dose: string; frequency: string; duration: string }[]) ?? [];
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                      <Link href={`/patients/${r.patient_id}`}>{p?.full_name}</Link>
                    </p>
                    <p className="data text-[12px] text-ink-3">
                      {p?.patient_no} · {fmtDate(r.created_at)} · {d?.full_name}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {items.map((i) => `${i.medicine_name} ${i.dose ?? ""} ${i.frequency ?? ""} ${i.duration ?? ""}`.trim())
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[13px] font-medium">
                    <Link href={`/visits/${r.visit_id}`} className="text-ink-2">Open visit</Link>
                    <Link href={`/print/prescription/${r.id}`} className="text-primary">Print</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
