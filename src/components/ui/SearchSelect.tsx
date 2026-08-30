"use client";
import { Search, Plus } from "lucide-react";
import * as React from "react";

export type Option = { id: string; label: string; sub?: string };

/** Type-to-filter picker with an inline "add new" escape hatch. */
export function SearchSelect({
  options, onPick, onCreate, placeholder = "Search…", createLabel = "Add new",
}: {
  options: Option[];
  onPick: (o: Option) => void;
  onCreate?: (name: string) => void;
  placeholder?: string;
  createLabel?: string;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          className="h-[38px] w-full rounded-[6px] border border-line-strong bg-paper pl-9 pr-3 text-[14px] outline-none placeholder:text-ink-3 focus:border-focus"
        />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-[6px] border border-line bg-paper shadow-[var(--shadow-pop)]">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onPick(o); setQ(""); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] hover:bg-primary-wash"
            >
              <span>{o.label}</span>
              {o.sub && <span className="data text-[12px] text-ink-3">{o.sub}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-ink-3">No match</p>
          )}
          {onCreate && q.trim() && (
            <button
              type="button"
              onClick={() => { onCreate(q.trim()); setQ(""); setOpen(false); }}
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[13px] font-medium text-primary hover:bg-primary-wash"
            >
              <Plus size={14} /> {createLabel}: “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
