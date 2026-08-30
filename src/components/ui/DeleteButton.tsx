"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Removes a clinical or financial record.
 *
 * Nothing is actually destroyed — the row is marked deleted and stops
 * appearing, but stays recoverable for 30 days from Settings. That matters
 * here: a prescription or an invoice is part of a patient's medical and
 * financial history, and a mis-click at a busy desk must not be permanent.
 *
 * The confirmation spells out what else disappears, because deleting a
 * patient also hides every visit, prescription and bill attached to them.
 */
export function DeleteButton({
  table, id, label, warning, redirectTo, small,
}: {
  /** Table the row lives in. */
  table: "patients" | "visits" | "prescriptions" | "invoices" | "appointments" | "documents";
  id: string;
  /** What the doctor is deleting, e.g. "Afsar (PAT-000001)". */
  label: string;
  /** Extra line shown in the confirmation, for records that take others with them. */
  warning?: string;
  /** Where to go afterwards. Stay put if not given. */
  redirectTo?: string;
  small?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();

  async function remove() {
    const lines = [
      `Delete ${label}?`,
      warning,
      "",
      "It stops appearing straight away, but can be restored for 30 days from Settings → Recycle bin.",
    ].filter(Boolean).join("\n");
    if (!confirm(lines)) return;

    setBusy(true);
    const sb = createClient();
    // Deleting a patient has to take their whole record with it — visits,
    // prescriptions, invoices, appointments and documents — otherwise those
    // keep appearing in the module lists with no patient attached.
    const { error } = table === "patients"
      ? await sb.rpc("delete_patient", { p_patient: id })
      : await sb.from(table).update({ is_deleted: true }).eq("id", id);
    setBusy(false);

    if (error) return toast(`Couldn't delete. ${error.message}`, "error");
    toast("Deleted — restorable for 30 days from Settings");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className={`inline-flex items-center gap-1 font-medium text-danger disabled:opacity-50 ${
        small ? "text-[13px]" : "text-[14px]"
      }`}
    >
      <Trash2 size={small ? 14 : 16} />
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
