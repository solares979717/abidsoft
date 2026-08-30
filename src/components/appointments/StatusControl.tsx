"use client";
import { createClient } from "@/lib/supabase/client";
import { APPT_STATUS } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import * as React from "react";

export function StatusControl({ id, status }: { id: string; status: string }) {
  const [value, setValue] = React.useState(status);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();

  async function change(next: string) {
    setBusy(true);
    const prev = value;
    setValue(next);
    const { error } = await createClient().from("appointments")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) { setValue(prev); return toast("Couldn't update the status. Try again.", "error"); }
    toast(`Marked ${next.toLowerCase()}`);
    router.refresh();
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className="h-7 rounded-[4px] border border-line-strong bg-paper px-2 text-[12px] outline-none focus:border-focus"
    >
      {APPT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}
