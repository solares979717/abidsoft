import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[6px] border border-line bg-paper shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function CardHead({
  title, action, sub,
}: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
