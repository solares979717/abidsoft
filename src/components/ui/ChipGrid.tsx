"use client";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import * as React from "react";

/**
 * The core "minimum typing" primitive.
 * Exclusivity is declared in data: selecting an exclusive chip (None,
 * No Known Allergy) clears its siblings and vice versa.
 */
export function ChipGrid({
  options, value, onChange, multiple = true, exclusive = [], size = "md",
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  exclusive?: string[];
  size?: "md" | "sm";
}) {
  function toggle(opt: string) {
    const on = value.includes(opt);
    if (!multiple) return onChange(on ? [] : [opt]);
    if (exclusive.includes(opt)) return onChange(on ? [] : [opt]);
    const next = on ? value.filter((v) => v !== opt) : [...value, opt];
    onChange(next.filter((v) => !exclusive.includes(v)));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = value.includes(opt);
        const blocked =
          !on && exclusive.some((e) => value.includes(e)) && !exclusive.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            onClick={() => toggle(opt)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[4px] border font-medium transition-colors",
              size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]",
              on
                ? "border-primary bg-primary-wash text-primary-deep"
                : "border-line-strong bg-paper text-ink-2 hover:border-primary hover:text-primary",
              blocked && "opacity-40 pointer-events-none"
            )}
          >
            {on && <Check size={13} strokeWidth={3} />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}
