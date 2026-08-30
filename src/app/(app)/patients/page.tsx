import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtDate, ageFromDob } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";
const PAGE = 25;

export default async function Patients({
  searchParams,
}: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sb = await createClient();

  let query = sb.from("patients")
    .select("id, patient_no, full_name, phone, dob, gender, created_at, doctors(full_name)",
      { count: "exact" })
    .eq("is_deleted", false);
  if (sp.q) query = query.ilike("full_name", `%${sp.q}%`);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);

  const rows = data ?? [];
  const pages = Math.ceil((count ?? 0) / PAGE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-[24px]">Patients</h1>
          <p className="data text-[13px] text-ink-3">{count ?? 0} registered</p>
        </div>
        <Link href="/consultation/new"><Button>New patient</Button></Link>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState message="No patients yet. Register the first one to start." />
        ) : (
          <div className="table-scroll">
            <table className="w-full">
            <thead>
              <tr className="border-b border-line-strong">
                {["Patient ID", "Name", "Phone", "Age", "Gender", "Doctor", "Registered", ""].map((h) => (
                  <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => {
                const d = p.doctors as unknown as { full_name: string } | null;
                return (
                  <tr key={p.id} className="h-11 hover:bg-canvas">
                    <td className="data px-4 text-[13px]">
                      <Link href={`/patients/${p.id}`} className="text-primary">{p.patient_no}</Link>
                    </td>
                    <td className="px-4 font-medium">
                      <Link href={`/patients/${p.id}`}>{p.full_name}</Link>
                    </td>
                    <td className="data px-4 text-[13px] text-ink-2">{p.phone}</td>
                    <td className="data px-4 text-[13px]">{ageFromDob(p.dob)}</td>
                    <td className="px-4 text-[13px]">{p.gender}</td>
                    <td className="px-4 text-[13px] text-ink-2">{d?.full_name ?? "—"}</td>
                    <td className="data px-4 text-[13px] text-ink-3">{fmtDate(p.created_at)}</td>
                    <td className="px-4 text-right whitespace-nowrap">
                      <Link href={`/patients/${p.id}`}
                        className="mr-3 text-[13px] font-medium text-primary">Open</Link>
                      <Link href={`/consultation/new?patient=${p.id}`}
                        className="text-[13px] text-ink-2">New visit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="data text-ink-3">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/patients?page=${page - 1}`}
              className="rounded-[4px] border border-line-strong px-3 py-1.5">Previous</Link>}
            {page < pages && <Link href={`/patients?page=${page + 1}`}
              className="rounded-[4px] border border-line-strong px-3 py-1.5">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
