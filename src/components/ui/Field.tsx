"use client";
import { cn } from "@/lib/utils";
import * as React from "react";

const control =
  "h-[38px] w-full rounded-[6px] border border-line-strong bg-paper px-3 " +
  "text-[14px] text-ink placeholder:text-ink-3 outline-none " +
  "focus:border-focus disabled:bg-canvas disabled:text-ink-3";

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="label mb-1.5 block">
      {children}
      {required && <span className="text-danger"> *</span>}
    </span>
  );
}

export function Input({
  className, mono, ...p
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...p} className={cn(control, mono && "font-mono tnum", className)} />;
}

export function Select({
  className, children, ...p
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn(control, "pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({
  className, ...p
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...p}
      className={cn(control, "h-auto min-h-[76px] py-2 leading-relaxed", className)}
    />
  );
}

export function FormRow({
  label, required, hint, children, className,
}: {
  label?: string; required?: boolean; hint?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}
