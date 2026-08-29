import { createAdminClient } from "@/lib/supabase/server";

/**
 * Daily backup — exports every clinical and financial table as CSV.
 *
 * Everything lives in one Supabase project, so if that account is ever lost,
 * suspended, or damaged by a mistaken query, the whole record goes with it.
 * This puts a copy somewhere else, every night, without anyone remembering to.
 *
 * Called by Vercel Cron (see vercel.json) and protected by CRON_SECRET.
 * The same endpoint can be opened by a signed-in doctor to download a backup
 * on the spot — see /api/backup.
 */

const TABLES = [
  "clinics", "doctors", "patients", "patient_medical_history", "patient_allergies",
  "patient_current_medicines", "patient_lifestyle", "visits", "visit_complaints",
  "vitals", "physical_examinations", "visit_diagnoses", "prescriptions",
  "prescription_items", "visit_investigations", "investigation_reports",
  "appointments", "followups", "invoices", "invoice_items", "payments",
  "documents", "medicines", "diagnosis_catalog", "investigation_catalog",
  "complaint_catalog", "prescription_templates", "clinic_settings",
];

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export async function buildBackup() {
  const sb = createAdminClient();
  const parts: string[] = [];
  let totalRows = 0;

  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select("*").limit(50000);
    if (error) {
      parts.push(`\n===== ${table} =====\nERROR: ${error.message}\n`);
      continue;
    }
    const rows = data ?? [];
    totalRows += rows.length;
    parts.push(`\n===== ${table} (${rows.length} rows) =====\n${toCsv(rows)}\n`);
  }

  const header =
    `Shafiq Medical & Diagnostic Center — full backup\n` +
    `Taken: ${new Date().toISOString()}\n` +
    `Tables: ${TABLES.length}   Rows: ${totalRows}\n` +
    `Each section below is a CSV table. Open in Excel, or keep as-is for restoring.\n`;

  return { body: header + parts.join(""), totalRows };
}
