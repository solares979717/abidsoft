"use client";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/utils";
import * as React from "react";

type Row = {
  id: string; patient_no: string; full_name: string; phone: string;
  visit_count: number; rx_count: number; inv_count: number; due_total: number;
};

export function GlobalSearch() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const box = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); input.current?.focus(); }
    };
    const c = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", k);
    document.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", c); };
  }, []);

  React.useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const sb = createClient();
      const { data } = await sb.rpc("global_search", { q: q.trim() });
      setRows(((data as { patients?: Row[] })?.patients ?? []));
      setBusy(false);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(id: string) {
    setOpen(false); setQ("");
    router.push(`/patients/${id}`);
  }

  return (
    <div ref={box} className="relative w-full max-w-[480px]">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => rows.length && setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && rows[0]) go(rows[0].id); }}
        placeholder="Search patient, phone or PAT-ID…"
        className="h-9 w-full rounded-[6px] border border-line-strong bg-canvas pl-9 pr-16 text-[14px] outline-none placeholder:text-ink-3 focus:border-focus focus:bg-paper"
      />
      <span className="data absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">
        {busy ? <Loader2 size={13} className="animate-spin" /> : "⌘K"}
      </span>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-[6px] border border-line bg-paper shadow-[var(--shadow-pop)]">
          <p className="label border-b border-line px-3 py-2">Patients</p>
          {rows.length === 0 && !busy && (
            <p className="px-3 py-4 text-[13px] text-ink-3">
              No patient matches “{q}”. Register from Patients → New patient.
            </p>
          )}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              className="flex w-full items-start justify-between gap-4 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-primary-wash"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{r.full_name}</p>
                <p className="data text-[12px] text-ink-3">{r.patient_no} · {r.phone}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="data text-right text-[12px] text-ink-2">
                  <p>{r.visit_count} visits · {r.rx_count} Rx · {r.inv_count} lab</p>
                  {Number(r.due_total) > 0 && (
                    <p className="font-semibold text-danger">{money(r.due_total)} due</p>
                  )}
                </div>
                <span className="flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-primary">
                  Open profile <ArrowRight size={13} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
