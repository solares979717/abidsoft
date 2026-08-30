"use client";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import * as React from "react";

export function Section({
  index, title, summary, open, onToggle, children,
}: {
  index: number; title: string; summary?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Opening a section can shrink whichever section was open before it,
  // which shifts everything below. Without this the browser's own scroll
  // position ends up in the wrong place and it looks like the page jumped
  // back to the top. Scrolling the opened section into view keeps the
  // doctor exactly where they just clicked.
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <div ref={ref} className="scroll-mt-[70px] rounded-[6px] border border-line bg-paper shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="data w-6 shrink-0 text-[13px] text-ink-3">
          {String(index).padStart(2, "0")}
        </span>
        <span className="display flex-1 text-[15px] text-ink">{title}</span>
        {!open && summary && (
          <span className="hidden truncate text-[13px] text-ink-3 md:block max-w-[46%]">
            {summary}
          </span>
        )}
        <ChevronDown
          size={17}
          className={cn("shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open && <div className="border-t border-line px-4 py-4">{children}</div>}
    </div>
  );
}
