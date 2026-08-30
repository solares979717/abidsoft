import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtDate } from "@/lib/utils";
import Link from "next/link";
import { InvestigationRow } from "@/components/investigations/InvestigationRow";

export const dynamic = "force-dynamic";

export default async function Investigations({
  searchParams,
}: { searchParams: Promise<{ category?: string; status?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Investigations belong to a visit and a patient. When either is deleted
  // the test must stop appearing here too, otherwise the list fills up with
  // rows whose patient no longer exists.
  let q = sb.from("visit_investigations")
    .select("id, test_name, category, status, result_text, result_flag, ordered_at, patient_id, visit_id, patients!inner(full_name, patient_no, is_deleted), visits!inner(is_deleted), investigation_reports(id, file_name, storage_path)")
    .eq("patients.is_deleted", false)
    .eq("visits.is_deleted", false);
  if (sp.category) q = q.eq("category", sp.category);
  if (sp.status) q = q.eq("status", sp.status);

  const { data } = await q.order("ordered_at", { ascending: false }).limit(80);
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="display text-[24px]">Investigations</h1>

      <div className="flex flex-wrap gap-1">
        {[["All", ""], ["Laboratory", "Laboratory"], ["Radiology / Imaging", "Radiology"]].map(([l, v]) => (
          <Link key={l} href={v ? `/investigations?category=${v}` : "/investigations"}
            className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium ${
              (sp.category ?? "") === v ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
            {l}
          </Link>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message="No investigations ordered yet." />
        ) : (
          <div className="table-scroll">
            <table className="w-full">
            <thead>
              <tr className="border-b border-line-strong">
                {["Test", "Category", "Patient", "Patient ID", "Ordered", "Status", "Report", "Visit"].map((h) => (
                  <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const p = r.patients as unknown as { full_name: string; patient_no: string } | null;
                const reports = (r.investigation_reports as unknown as
                  { id: string; file_name: string; storage_path: string }[]) ?? [];
                return (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className="px-4 py-2.5 text-[14px]">{r.test_name}</td>
                    <td className="px-4 text-[13px] text-ink-2">{r.category}</td>
                    <td className="px-4 text-[14px]">
                      <Link href={`/patients/${r.patient_id}`}>{p?.full_name}</Link>
                    </td>
                    <td className="data px-4 text-[13px] text-ink-2">{p?.patient_no}</td>
                    <td className="data px-4 text-[13px]">{fmtDate(r.ordered_at)}</td>
                    <td className="px-4">
                      <InvestigationRow id={r.id} status={r.status} reports={reports} />
                    </td>
                    <td className="px-4 text-[13px] text-ink-2">
                      {reports.length ? `${reports.length} file` : "—"}
                    </td>
                    <td className="px-4 text-[13px] whitespace-nowrap">
                      <Link href={`/visits/${r.visit_id}`} className="text-primary">Open visit</Link>
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
