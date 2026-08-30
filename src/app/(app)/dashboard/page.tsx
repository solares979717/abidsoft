import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/States";
import { money, fmtTime, fmtDate, titleFromSnake } from "@/lib/utils";
import Link from "next/link";
import { QuickActions } from "@/components/shell/QuickActions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sb = await createClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const [appts, visitsToday, invToday, payToday, dues, followups, missed, dueFollowups] = await Promise.all([
    sb.from("appointments")
      .select("id, scheduled_at, appt_type, status, patient_id, booking_name, booking_phone, doctor_id, patients(full_name, patient_no), doctors(full_name)")
      .gte("scheduled_at", today.toISOString())
      .lt("scheduled_at", tomorrow.toISOString())
      .eq("is_deleted", false)
      .order("scheduled_at"),
    sb.from("visits").select("id", { count: "exact", head: true })
      .gte("visit_date", today.toISOString()),
    sb.from("invoices").select("net_total, paid_total")
      .gte("created_at", today.toISOString()).eq("is_deleted", false),
    // Today's money, split by how it came in — for closing the register.
    sb.from("payments").select("amount, method")
      .gte("paid_at", today.toISOString()),
    sb.from("invoices").select("due_total").gt("due_total", 0).eq("is_deleted", false),
    sb.from("followups").select("id", { count: "exact", head: true })
      .eq("completed", false).lte("follow_up_date", new Date().toISOString().slice(0, 10)),
    // Booked, the time has passed, still not marked seen or cancelled.
    sb.from("appointments").select("id", { count: "exact", head: true })
      .lt("scheduled_at", new Date().toISOString())
      .in("status", ["scheduled", "waiting"]).eq("is_deleted", false),
    // Follow-ups the doctor set that fall due today or earlier and were
    // never completed — the people who should be coming back.
    sb.from("followups")
      .select("id, follow_up_date, patient_id, visit_id, patients(full_name, patient_no, phone)")
      .eq("completed", false)
      .lte("follow_up_date", new Date().toISOString().slice(0, 10))
      .order("follow_up_date").limit(20),
  ]);

  const rows = appts.data ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const revenue = (invToday.data ?? []).reduce((a, i) => a + Number(i.paid_total ?? 0), 0);
  const payRows = payToday.data ?? [];
  const cashToday = payRows.filter((p) => p.method === "cash")
    .reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const onlineToday = payRows.filter((p) => p.method === "online")
    .reduce((a, p) => a + Number(p.amount ?? 0), 0);
  const billedToday = (invToday.data ?? []).reduce((a, i) => a + Number(i.net_total ?? 0), 0);
  const outstanding = (dues.data ?? []).reduce((a, i) => a + Number(i.due_total ?? 0), 0);

  const tiles = [
    { label: "Today's patients", value: String(visitsToday.count ?? 0) },
    { label: "Waiting", value: String(count("waiting")) },
    { label: "In consultation", value: String(count("in_consultation")) },
    { label: "Completed", value: String(count("completed")) },
    { label: "Today's appointments", value: String(rows.length), href: "/appointments" },
    { label: "Today's revenue", value: money(revenue) },
    { label: "Outstanding due", value: money(outstanding), danger: outstanding > 0, href: "/billing" },
    { label: "Pending follow-ups", value: String(followups.count ?? 0), href: "/appointments?view=followups" },
    { label: "Missed appointments", value: String(missed.count ?? 0),
      danger: (missed.count ?? 0) > 0, href: "/appointments?view=missed" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="display text-[24px] text-ink">Dashboard</h1>
        <QuickActions />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const tile = (
            <div className="rounded-[6px] border border-line bg-paper px-4 py-3 transition-colors hover:border-primary/40">
              <p className="label">{t.label}</p>
              <p className={`data mt-1 text-[20px] leading-[26px] ${t.danger ? "text-danger" : "text-ink"}`}>
                {t.value}
              </p>
            </div>
          );
          return t.href
            ? <Link key={t.label} href={t.href}>{tile}</Link>
            : <div key={t.label}>{tile}</div>;
        })}
      </div>

      {payRows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">Today&apos;s money</h2>
            <Link href="/billing" className="text-[13px] font-medium text-primary">Billing</Link>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            {[
              { label: "Cash", value: money(cashToday) },
              { label: "Online", value: money(onlineToday) },
              { label: "Collected", value: money(cashToday + onlineToday) },
              { label: "Billed today", value: money(billedToday) },
            ].map((x) => (
              <div key={x.label} className="bg-paper px-4 py-3">
                <p className="label">{x.label}</p>
                <p className="data mt-0.5 text-[18px]">{x.value}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">
            {payRows.length} payment{payRows.length === 1 ? "" : "s"} today.
            Billed is what was invoiced; collected is what actually came in.
          </p>
        </Card>
      )}

      {(dueFollowups.data ?? []).length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">Follow-ups due</h2>
            <Link href="/appointments?view=followups" className="text-[13px] font-medium text-primary">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {(dueFollowups.data ?? []).map((f) => {
              const p = f.patients as unknown as
                { full_name: string; patient_no: string; phone: string } | null;
              const overdue = new Date(f.follow_up_date) < today;
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{p?.full_name}</p>
                    <p className="data text-[12px] text-ink-3">
                      {p?.patient_no} · {p?.phone}
                      {" · "}
                      <span className={overdue ? "font-semibold text-danger" : ""}>
                        due {fmtDate(f.follow_up_date)}{overdue && " (overdue)"}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-3 text-[13px]">
                    <Link href={`/consultation/new?patient=${f.patient_id}`}
                      className="font-medium text-primary">Start visit</Link>
                    <Link href={`/patients/${f.patient_id}`} className="text-ink-2">Profile</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">Today&apos;s queue</h2>
          <Link href="/appointments" className="text-[13px] font-medium text-primary">
            All appointments
          </Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState message="No appointments today. Add one from Appointments." />
        ) : (
          <div className="table-scroll">
            <table className="w-full">
            <thead>
              <tr className="border-b border-line-strong">
                {["Time", "Patient", "Patient ID", "Doctor", "Type", "Status", ""].map((h) => (
                  <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const p = r.patients as unknown as { full_name: string; patient_no: string } | null;
                const d = r.doctors as unknown as { full_name: string } | null;
                const unregistered = !r.patient_id;
                return (
                  <tr key={r.id} className="h-11 hover:bg-canvas">
                    <td className="data px-4 text-[13px]">{fmtTime(r.scheduled_at)}</td>
                    <td className="px-4 font-medium">
                      {p?.full_name ?? r.booking_name}
                      {unregistered && (
                        <span className="ml-2 rounded-[3px] bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn">
                          not registered
                        </span>
                      )}
                    </td>
                    <td className="data px-4 text-[13px] text-ink-2">
                      {p?.patient_no ?? r.booking_phone ?? "—"}
                    </td>
                    <td className="px-4 text-[13px] text-ink-2">{d?.full_name}</td>
                    <td className="px-4 text-[13px]">{titleFromSnake(r.appt_type)}</td>
                    <td className="px-4"><StatusPill status={r.status} /></td>
                    <td className="px-4 text-right whitespace-nowrap">
                      {unregistered ? (
                        <Link
                          href={`/consultation/new?appointment=${r.id}&name=${encodeURIComponent(r.booking_name ?? "")}&phone=${encodeURIComponent(r.booking_phone ?? "")}`}
                          className="text-[13px] font-medium text-primary">
                          Register &amp; start visit
                        </Link>
                      ) : (
                        <>
                          <Link href={`/consultation/new?patient=${r.patient_id}&appointment=${r.id}`}
                            className="mr-3 text-[13px] font-medium text-primary">Start visit</Link>
                          <Link href={`/patients/${r.patient_id}`}
                            className="text-[13px] text-ink-2">Open profile</Link>
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
