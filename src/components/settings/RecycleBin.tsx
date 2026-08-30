"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHead } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/utils";

type Item = { entity: string; id: string; label: string; deleted_at: string };

/**
 * Everything deleted in the last 30 days, and a way to put it back.
 *
 * Deleting from the patient screen only marks a record hidden; this is
 * where a mis-click gets undone. After 30 days items stop being listed —
 * the rows are still in the database, so nothing is ever truly lost, but
 * the clinic isn't shown an endless history of removals either.
 */
export function RecycleBin() {
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const toast = useToast();
  const router = useRouter();
  const sb = createClient();

  const load = React.useCallback(async () => {
    const { data, error } = await sb.rpc("deleted_items");
    if (error) {
      setError("Couldn't read the recycle bin. Run UPGRADE_3.sql if you haven't yet.");
      setItems([]);
      return;
    }
    setItems((data as Item[]) ?? []);
  }, [sb]);

  React.useEffect(() => { load(); }, [load]);

  async function restore(it: Item) {
    setBusy(it.id);
    const { error } = await sb.rpc("restore_deleted", { p_entity: it.entity, p_id: it.id });
    setBusy("");
    if (error) return toast(`Couldn't restore. ${error.message}`, "error");
    toast("Restored");
    await load();
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Recycle bin" sub="Deleted in the last 30 days" />
      {error && (
        <p className="border-b border-line bg-danger-bg px-4 py-2 text-[13px] text-danger">{error}</p>
      )}
      {items === null && (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">Loading…</p>
      )}
      {items?.length === 0 && !error && (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">
          Nothing has been deleted recently.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li key={`${it.entity}-${it.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-medium">{it.label}</p>
                <p className="text-[12px] text-ink-3">
                  {it.entity} · deleted {fmtDate(it.deleted_at)}
                </p>
              </div>
              <Button size="sm" variant="secondary"
                loading={busy === it.id} onClick={() => restore(it)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
