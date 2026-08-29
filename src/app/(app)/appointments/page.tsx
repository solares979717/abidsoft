import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/States";
import { fmtDate, fmtTime, titleFromSnake } from "@/lib/utils";
import Link from "next/link";
import { NewAppointment } from "@/components/appointments/NewAppointment";
import { StatusControl } from "@/components/appointments/StatusControl";

export const dynamic = "force-dynamic";

export default async function Appointments({
  searchParams,
}: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view = sp.view ?? "day";
  const isFollowups = view === "followups";

  const anchor = sp.date ? new Date(sp.date) : new Date();
  anchor.setHours(0, 0, 0, 0);

  const end = new Date(anchor);
  if (view === "day") end.setDate(end.getDate() + 1);
  if (view === "week") end.setDate(end.getDate() + 7);
  if (view === "month") end.setMonth(end.getMonth() + 1);

  const sb = await createClient();
  const selectCols = "id, scheduled_at, appt_type, status, notes, patient_id, source_visit_id, patients(full_name, patient_no), doctors(full_name)";

  const [appts, doctors, patients] = await Promise.all([
    isFollowups
      ? sb.from("appointments").select(selectCols)
          .eq("appt_type", "follow_up").in("status", ["scheduled", "waiting"])
          .order("scheduled_at")
      : sb.from("appointments").select(selectCols)
          .gte("scheduled_at", anchor.toISOString())
          .lt("scheduled_at", end.toISOString())
          .order("scheduled_at"),
    sb.from("doctors").select("id, full_name").eq("is_active", true).order("sort_order"),
    sb.from("patients").select("id, full_name, patient_no").eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(300),
  ]);

  const rows = appts.data ?? [];
  const now = new Date();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[24px]">Appointments</h1>
        <NewAppointment doctors={doctors.data ?? []} patients={patients.data ?? []} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {["day", "week", "month"].map((v) => (
          <Link key={v} href={`/appointments?view=${v}`}
            className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium capitalize ${
              view === v ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
            {v}
          </Link>
        ))}
        <Link href="/appointments?view=followups"
          className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium ${
            isFollowups ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
          Follow-ups due
        </Link>
        {!isFollowups && (
          <span className="data ml-3 self-center text-[13px] text-ink-3">
            from {fmtDate(anchor)}
          </span>
        )}
      </div>

      {isFollowups && (
        <p className="text-[13px] text-ink-3">
          Every upcoming follow-up across all dates — created automatically whenever a follow-up is
          set during a consultation. Starts a visit directly from here.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState message={isFollowups ? "No follow-ups due." : "No appointments in this range."} />
        ) : (
          <div className="table-scroll">
            <table className="w-full">
            <thead>
              <tr className="border-b border-line-strong">
                {["Date", "Time", "Patient", "Patient ID", "Doctor", "Type", "Status", "", ""].map((h) => (
                  <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => {
                const p = a.patients as unknown as { full_name: string; patient_no: string } | null;
                const d = a.doctors as unknown as { full_name: string } | null;
                const overdue = isFollowups && new Date(a.scheduled_at) < now;
                return (
                  <tr key={a.id} className="h-11 hover:bg-canvas">
                    <td className={`data px-4 text-[13px] ${overdue ? "font-semibold text-danger" : ""}`}>
                      {fmtDate(a.scheduled_at)}{overdue && " · overdue"}
                    </td>
                    <td className="data px-4 text-[13px]">{fmtTime(a.scheduled_at)}</td>
                    <td className="px-4 font-medium">{p?.full_name}</td>
                    <td className="data px-4 text-[13px] text-ink-2">{p?.patient_no}</td>
                    <td className="px-4 text-[13px] text-ink-2">{d?.full_name}</td>
                    <td className="px-4 text-[13px]">{titleFromSnake(a.appt_type)}</td>
                    <td className="px-4"><StatusControl id={a.id} status={a.status} /></td>
                    <td className="px-4 text-[12px]">
                      {a.source_visit_id && (
                        <Link href={`/visits/${a.source_visit_id}`} className="text-ink-3 underline">
                          from visit
                        </Link>
                      )}
                    </td>
                    <td className="px-4 text-right whitespace-nowrap">
                      <Link href={`/consultation/new?patient=${a.patient_id}&appointment=${a.id}`}
                        className="mr-3 text-[13px] font-medium text-primary">Start visit</Link>
                      <Link href={`/patients/${a.patient_id}`} className="text-[13px] text-ink-2">
                        Open profile
                      </Link>
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
