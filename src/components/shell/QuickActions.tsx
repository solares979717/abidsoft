"use client";
import Link from "next/link";
import { UserPlus, Stethoscope, CalendarPlus, Wallet } from "lucide-react";

const ACTIONS = [
  { href: "/consultation/new", label: "New patient", icon: UserPlus },
  { href: "/patients", label: "New visit", icon: Stethoscope },
  { href: "/appointments?new=1", label: "Appointment", icon: CalendarPlus },
  { href: "/billing", label: "Payment", icon: Wallet },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line-strong bg-paper px-3 text-[13px] font-medium text-ink-2 hover:border-primary hover:text-primary"
        >
          <Icon size={14} /> {label}
        </Link>
      ))}
    </div>
  );
}
