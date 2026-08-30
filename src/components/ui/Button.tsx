"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[6px] font-medium " +
  "transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-deep",
  secondary: "bg-paper text-ink border border-line-strong hover:bg-canvas",
  ghost: "text-primary hover:bg-primary-wash",
  danger: "bg-paper text-danger border border-danger hover:bg-danger-bg",
};
const sizes: Record<Size, string> = {
  md: "h-[38px] px-4 text-[14px]",
  sm: "h-8 px-3 text-[13px]",
};

export function Button({
  variant = "primary", size = "md", loading, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}
