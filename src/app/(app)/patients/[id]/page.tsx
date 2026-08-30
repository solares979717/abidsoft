import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { EmptyState } from "@/components/ui/States";
import { money, fmtDate, fmtTime, ageFromDob, titleFromSnake } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { PortalPanel } from "@/components/patient/PortalPanel";
import { DocumentUpload } from "@/components/patient/DocumentUpload";

export const dynamic = "force-dynamic";

const TABS = ["overview", "history", "visits", "prescriptions", "investigations",
  "documents", "appointments", "billing", "portal"] as const;
const LABELS: Record<string, string> = {
  overview: "Overview", history: "Medical history", visits: "Visits",
  prescriptions: "Prescriptions", investigations: "Investigations",
  documents: "Documents", appointments: "Appointments", billing: "Billing",
  portal: "Patient portal",
};

export default async function PatientProfile({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  const sb = await createClient();

  const { data: p } = await sb.from("patients")
    .select("*, doctors(full_name)").eq("id", id).eq("is_deleted", false).single();
  if (!p) notFound();

  const [visits, rxs, invs, appts, invoices, docs, allergies, history, meds] = await Promise.all([
    sb.from("visits")
      .select("id, visit_date, visit_type, doctors(full_name), visit_diagnoses(diagnosis_text)")
      .eq("patient_id", id).eq("is_deleted", false).order("visit_date", { ascending: false }),
    sb.from("prescriptions")
      .select("id, created_at, visit_id, doctors(full_name), prescription_items(medicine_name)")
      .eq("patient_id", id).eq("is_deleted", false).order("created_at", { ascending: false }),
    sb.from("visit_investigations")
      .select("id, test_name, category, status, ordered_at")
      .eq("patient_id", id).order("ordered_at", { ascending: false }),
    sb.from("appointments").select("id, scheduled_at, appt_type, status, source_visit_id, doctors(full_name)")
      .eq("patient_id", id).eq("is_deleted", false).order("scheduled_at", { ascending: false }),
    sb.from("invoices").select("id, invoice_no, created_at, net_total, paid_total, due_total, is_void")
      .eq("patient_id", id).eq("is_deleted", false).order("created_at", { ascending: false }),
    sb.from("documents").select("id, file_name, doc_type, description, uploaded_at, storage_path")
      .eq("patient_id", id).eq("is_deleted", false).order("uploaded_at", { ascending: false }),
    sb.from("patient_allergies").select("allergy_type, detail, created_at")
      .eq("patient_id", id).order("created_at", { ascending: false }),
    sb.from("patient_medical_history").select("condition, detail, created_at")
      .eq("patient_id", id).order("created_at", { ascending: false }),
    sb.from("patient_current_medicines").select("medicine_name")
      .eq("patient_id", id).eq("is_active", true),
  ]);

  const due = (invoices.data ?? []).reduce((a, i) => a + Number(i.due_total ?? 0), 0);
  const activeAllergies = [...new Set((allergies.data ?? [])
    .filter((a) => a.allergy_type !== "No Known Allergy").map((a) => a.allergy_type))];
  const conditions = [...new Set((history.data ?? []).map((h) => h.condition))]
    .filter((c) => c !== "None");
  const upcomingStatuses = new Set(["scheduled", "waiting"]);
  const nextAppt = (appts.data ?? [])
    .filter((a) => new Date(a.scheduled_at) > new Date() && upcomingStatuses.has(a.status))
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  const doctor = p.doctors as unknown as { full_name: string } | null;

  return (
    <div className="grid gap-5 overflow-x-auto lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="display text-[24px] text-ink">{p.full_name}</h1>
          <p className="data text-[13px] text-ink-3">{p.patient_no}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip>{ageFromDob(p.dob)}</Chip>
            <Chip>{p.gender}</Chip>
            <Chip>{doctor?.full_name ?? "No doctor"}</Chip>
            {activeAllergies.length > 0 && (
              <span className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-danger-bg px-2 text-[12px] font-medium text-danger">
                <AlertTriangle size={12} /> {activeAllergies.join(", ")}
              </span>
            )}
            {due > 0 && (
              <span className="data inline-flex h-6 items-center rounded-[4px] bg-danger-bg px-2 text-[12px] font-semibold text-danger">
                {money(due)} due
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-line">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/patients/${id}?tab=${t}`}
              className={`whitespace-nowrap px-3 py-2.5 text-[14px] ${
                tab === t
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {LABELS[t]}
            </Link>
          ))}
        </nav>

        {tab === "overview" && (
          <Card className="p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Phone" value={p.phone} mono />
              <Info label="WhatsApp" value={p.whatsapp ?? "—"} mono />
              <Info label="Date of birth" value={fmtDate(p.dob)} mono />
              <Info label="Age" value={ageFromDob(p.dob)} mono />
              <Info label="Address" value={p.address ?? "—"} />
              <Info label="Registered" value={fmtDate(p.created_at)} mono />
              <Info label="Total visits" value={String(visits.data?.length ?? 0)} mono />
              <Info label="Last visit" value={visits.data?.[0] ? fmtDate(visits.data[0].visit_date) : "—"} mono />
              <Link href={`/patients/${id}?tab=appointments`} className="block hover:opacity-80">
                <Info label="Next appointment"
                  value={nextAppt ? `${fmtDate(nextAppt.scheduled_at)} ${fmtTime(nextAppt.scheduled_at)}` : "—"} mono />
              </Link>
              <Info label="Allergies" value={activeAllergies.join(", ") || "No known allergy"} />
              <Info label="Current medicines"
                value={(meds.data ?? []).map((m) => m.medicine_name).join(", ") || "—"} />
              <Info label="Known conditions" value={conditions.join(", ") || "—"} />
            </div>
          </Card>
        )}

        {tab === "history" && (
          <Card>
            {(history.data ?? []).length === 0 ? (
              <EmptyState message="No medical history recorded yet." />
            ) : (
              <ul className="divide-y divide-line">
                {history.data!.map((h, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-3">
                    <span className="text-[14px]">{h.condition}{h.detail && ` — ${h.detail}`}</span>
                    <span className="data text-[12px] text-ink-3">{fmtDate(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "visits" && (
          <Card>
            {(visits.data ?? []).length === 0 ? (
              <EmptyState message="No visits yet." />
            ) : (
              <ul className="divide-y divide-line">
                {visits.data!.map((v) => {
                  const d = v.doctors as unknown as { full_name: string } | null;
                  const dx = (v.visit_diagnoses as unknown as { diagnosis_text: string }[] ?? [])
                    .map((x) => x.diagnosis_text).join(", ");
                  // The prescription written during this specific visit, so the
                  // doctor can print or send it without opening the visit first.
                  const visitRx = (rxs.data ?? []).find((r) => r.visit_id === v.id);
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="data text-[14px] font-medium">{fmtDate(v.visit_date)}</p>
                        <p className="text-[13px] text-ink-2 break-words">
                          {d?.full_name} · {v.visit_type}
                          {dx && <> · Diagnosis: {dx}</>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[13px]">
                        <Link href={`/visits/${v.id}?continue=1`}
                          className="font-medium text-primary">Continue</Link>
                        <Link href={`/visits/${v.id}`} className="text-ink-2">Open</Link>
                        {visitRx && (
                          <Link href={`/print/prescription/${visitRx.id}`} className="text-ink-2">
                            Prescription
                          </Link>
                        )}
                        <Link href={`/print/visit/${v.id}`} className="text-ink-2">Full summary</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "prescriptions" && (
          <Card>
            {(rxs.data ?? []).length === 0 ? (
              <EmptyState message="No prescriptions yet." />
            ) : (
              <ul className="divide-y divide-line">
                {rxs.data!.map((r) => {
                  const items = (r.prescription_items as unknown as { medicine_name: string }[]) ?? [];
                  const d = r.doctors as unknown as { full_name: string } | null;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="data text-[14px] font-medium">{fmtDate(r.created_at)}</p>
                        <p className="text-[13px] text-ink-2 break-words">
                          {d?.full_name} · {items.map((i) => i.medicine_name).join(", ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[13px]">
                        <Link href={`/print/prescription/${r.id}`}
                          className="font-medium text-primary">Open / Print / Send</Link>
                        <Link href={`/visits/${r.visit_id}`} className="text-ink-2">Open visit</Link>
                        <DeleteButton table="prescriptions" id={r.id} small
                          label={`the prescription of ${fmtDate(r.created_at)}`} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "investigations" && (
          <Card>
            {(invs.data ?? []).length === 0 ? (
              <EmptyState message="No investigations ordered." />
            ) : (
              <ul className="divide-y divide-line">
                {invs.data!.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[14px]">{i.test_name}</p>
                      <p className="data text-[12px] text-ink-3">
                        {i.category} · {fmtDate(i.ordered_at)}
                      </p>
                    </div>
                    <StatusPill status={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "documents" && (
          <div className="space-y-4">
            <DocumentUpload patientId={id} />
            <Card>
              {(docs.data ?? []).length === 0 ? (
                <EmptyState message="No documents uploaded." />
              ) : (
                <ul className="divide-y divide-line">
                  {docs.data!.map((d) => (
                    <li key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-[14px]">{d.file_name}</p>
                        <p className="text-[12px] text-ink-3">
                          {titleFromSnake(d.doc_type)}{d.description && ` · ${d.description}`}
                        </p>
                      </div>
                      <span className="data text-[12px] text-ink-3">{fmtDate(d.uploaded_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "appointments" && (
          <Card>
            {(appts.data ?? []).length === 0 ? (
              <EmptyState message="No appointments." />
            ) : (
              <ul className="divide-y divide-line">
                {appts.data!.map((a) => {
                  const d = a.doctors as unknown as { full_name: string } | null;
                  return (
                    <li key={a.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="data text-[14px]">
                          {fmtDate(a.scheduled_at)} · {fmtTime(a.scheduled_at)}
                        </p>
                        <p className="text-[13px] text-ink-2">
                          {titleFromSnake(a.appt_type)} · {d?.full_name}
                          {a.source_visit_id && (
                            <> · <Link href={`/visits/${a.source_visit_id}`} className="text-primary underline">from visit</Link></>
                          )}
                        </p>
                      </div>
                      <StatusPill status={a.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "billing" && (
          <Card>
            {(invoices.data ?? []).length === 0 ? (
              <EmptyState message="No invoices." />
            ) : (
              <div className="table-scroll">
                <table className="w-full">
                <thead>
                  <tr className="border-b border-line-strong">
                    {["Invoice", "Date", "Net", "Paid", "Due", "Status", ""].map((h) => (
                      <th key={h} className="label px-4 py-2.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.data!.map((i) => (
                    <tr key={i.id} className="h-11">
                      <td className="data px-4 text-[13px]">{i.invoice_no}</td>
                      <td className="data px-4 text-[13px]">{fmtDate(i.created_at)}</td>
                      <td className="data px-4 text-[13px]">{money(i.net_total)}</td>
                      <td className="data px-4 text-[13px]">{money(i.paid_total)}</td>
                      <td className={`data px-4 text-[13px] ${Number(i.due_total) > 0 ? "font-semibold text-danger" : ""}`}>
                        {money(i.due_total)}
                      </td>
                      <td className="px-4">
                        <StatusPill status={i.is_void ? "cancelled"
                          : Number(i.due_total) <= 0 ? "paid"
                          : Number(i.paid_total) > 0 ? "partial" : "unpaid"} />
                      </td>
                      <td className="px-4 text-right whitespace-nowrap">
                        <DeleteButton table="invoices" id={i.id} small
                          label={`invoice ${i.invoice_no}`}
                          warning="Any payments recorded against it are hidden too." />
                        <span className="mx-2 text-line-strong">|</span>
                        <Link href={`/print/receipt/${i.id}`}
                          className="text-[13px] font-medium text-primary">Receipt</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        )}

        {tab === "portal" && <PortalPanel patientId={id} whatsapp={p.whatsapp ?? p.phone} />}
      </div>

      <aside className="no-print lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4">
          <p className="label mb-3">Quick actions</p>
          <div className="space-y-2">
            <Link href={`/consultation/new?patient=${id}`} className="block">
              <Button className="w-full">New visit</Button>
            </Link>
            <Link href={`/appointments?new=1&patient=${id}`} className="block">
              <Button variant="secondary" className="w-full">Appointment</Button>
            </Link>
            <Link href={`/patients/${id}?tab=billing`} className="block">
              <Button variant="secondary" className="w-full">Payment</Button>
            </Link>
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]">
            <Info label="Visits" value={String(visits.data?.length ?? 0)} mono small />
            <Info label="Prescriptions" value={String(rxs.data?.length ?? 0)} mono small />
            <Info label="Investigations" value={String(invs.data?.length ?? 0)} mono small />
            <Info label="Outstanding" value={money(due)} mono small danger={due > 0} />
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <DeleteButton
              table="patients" id={id} small
              label={`${p.full_name} (${p.patient_no})`}
              warning={`This also hides their ${visits.data?.length ?? 0} visit(s), ${rxs.data?.length ?? 0} prescription(s) and all billing.`}
              redirectTo="/patients"
            />
          </div>
        </Card>
      </aside>
    </div>
  );
}

function Info({ label, value, mono, small, danger }: {
  label: string; value: string; mono?: boolean; small?: boolean; danger?: boolean;
}) {
  if (small) {
    return (
      <div className="flex justify-between">
        <span className="label">{label}</span>
        <span className={`${mono ? "data" : ""} ${danger ? "font-semibold text-danger" : "text-ink-2"}`}>
          {value}
        </span>
      </div>
    );
  }
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-0.5 text-[14px] ${mono ? "data" : ""} ${danger ? "text-danger" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[4px] bg-canvas px-2 text-[12px] text-ink-2">
      {children}
    </span>
  );
}
