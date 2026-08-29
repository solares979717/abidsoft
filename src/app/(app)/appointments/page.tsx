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
  // "Upcoming" is the default: opening this page must immediately show the
  // next appointment, whether it is tomorrow or two months away. Day/Week/
  // Month are still there for looking at a particular stretch of time.
  const view = sp.view ?? "upcoming";
  const isFollowups = view === "followups";
  const isUpcoming = view === "upcoming";
  const isMissed = view === "missed";

  const anchor = sp.date ? new Date(sp.date) : new Date();
  anchor.setHours(0, 0, 0, 0);

  const end = new Date(anchor);
  if (view === "day") end.setDate(end.getDate() + 1);
  if (view === "week") end.setDate(end.getDate() + 7);
  if (view === "month") end.setMonth(end.getMonth() + 1);

  const sb = await createClient();
  const selectCols = "id, scheduled_at, appt_type, status, notes, patient_id, booking_name, booking_phone, source_visit_id, patients(full_name, patient_no), doctors(full_name)";

  const [appts, doctors, patients] = await Promise.all([
    isUpcoming
      ? sb.from("appointments").select(selectCols)
          .gte("scheduled_at", new Date().toISOString())
          .in("status", ["scheduled", "waiting"])
          .eq("is_deleted", false)
          .order("scheduled_at").limit(200)
    : isMissed
      // Booked, the day passed, and nobody marked them as seen — these are
      // the patients worth phoning.
      ? sb.from("appointments").select(selectCols)
          .lt("scheduled_at", new Date().toISOString())
          .in("status", ["scheduled", "waiting"])
          .eq("is_deleted", false)
          .order("scheduled_at", { ascending: false }).limit(200)
    : isFollowups
      ? sb.from("appointments").select(selectCols)
          .eq("appt_type", "follow_up").in("status", ["scheduled", "waiting"])
          .eq("is_deleted", false)
          .order("scheduled_at")
      : sb.from("appointments").select(selectCols)
          .gte("scheduled_at", anchor.toISOString())
          .lt("scheduled_at", end.toISOString())
          .eq("is_deleted", false)
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
        {[
          { v: "upcoming", label: "Upcoming" },
          { v: "day", label: "Today" },
          { v: "week", label: "Week" },
          { v: "month", label: "Month" },
          { v: "followups", label: "Follow-ups" },
          { v: "missed", label: "Missed" },
        ].map(({ v, label }) => (
          <Link key={v} href={`/appointments?view=${v}`}
            className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium ${
              view === v ? "bg-primary-wash text-primary" : "text-ink-2 hover:bg-canvas"}`}>
            {label}
          </Link>
        ))}
        {!isUpcoming && !isFollowups && !isMissed && (
          <span className="data ml-3 self-center text-[13px] text-ink-3">
            from {fmtDate(anchor)}
          </span>
        )}
      </div>

      {isUpcoming && (
        <p className="text-[13px] text-ink-3">
          Every appointment from now onwards, soonest first — including follow-ups booked weeks ahead.
        </p>
      )}
      {isFollowups && (
        <p className="text-[13px] text-ink-3">
          Follow-ups created automatically when a follow-up was set during a consultation.
        </p>
      )}
      {isMissed && (
        <p className="text-[13px] text-ink-3">
          The appointment time has passed and nobody marked them seen or cancelled — worth a phone call.
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
                const overdue = (isFollowups || isMissed) && new Date(a.scheduled_at) < now;
                // Booked over the phone before this person existed in the system.
                const unregistered = !a.patient_id;
                return (
                  <tr key={a.id} className="h-11 hover:bg-canvas">
                    <td className={`data px-4 text-[13px] ${overdue ? "font-semibold text-danger" : ""}`}>
                      {fmtDate(a.scheduled_at)}{overdue && " · overdue"}
                    </td>
                    <td className="data px-4 text-[13px]">{fmtTime(a.scheduled_at)}</td>
                    <td className="px-4 font-medium">
                      {p?.full_name ?? a.booking_name}
                      {unregistered && (
                        <span className="ml-2 rounded-[3px] bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn">
                          not registered
                        </span>
                      )}
                    </td>
                    <td className="data px-4 text-[13px] text-ink-2">
                      {p?.patient_no ?? a.booking_phone ?? "—"}
                    </td>
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
                      {unregistered ? (
                        <Link
                          href={`/consultation/new?appointment=${a.id}&name=${encodeURIComponent(a.booking_name ?? "")}&phone=${encodeURIComponent(a.booking_phone ?? "")}`}
                          className="text-[13px] font-medium text-primary"
                        >
                          Register &amp; start visit
                        </Link>
                      ) : (
                        <>
                          <Link href={`/consultation/new?patient=${a.patient_id}&appointment=${a.id}`}
                            className="mr-3 text-[13px] font-medium text-primary">Start visit</Link>
                          <Link href={`/patients/${a.patient_id}`} className="text-[13px] text-ink-2">
                            Open profile
                          </Link>
                        </>
                      )}
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
