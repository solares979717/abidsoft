"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, CalendarDays, Pill, FlaskConical,
  Receipt, BarChart3, Settings as Cog, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILD_ID } from "@/lib/buildInfo";
import * as React from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/prescriptions", label: "Prescriptions", icon: Pill },
  { href: "/investigations", label: "Investigations", icon: FlaskConical },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Cog },
];

export function Sidebar() {
  const path = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar") === "1");
  }, []);
  function toggle() {
    setCollapsed((c) => { localStorage.setItem("sidebar", c ? "0" : "1"); return !c; });
  }

  return (
    <aside
      className={cn(
        "no-print fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col bg-primary-deep lg:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] bg-white/15 text-[13px] font-semibold text-white">
          S
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">Shafiq Medical</p>
            <p className="truncate text-[11px] text-white/60">Kala Kelay, Swat</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-[6px] px-3 text-[14px] transition-colors",
                active ? "bg-white/12 font-medium text-white" : "text-white/75 hover:bg-white/8 hover:text-white"
              )}
            >
              {active && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r bg-white" />}
              <Icon size={17} className="shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        className="flex h-11 items-center gap-3 border-t border-white/10 px-4 text-[13px] text-white/60 hover:text-white"
      >
        {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
      </button>
      {!collapsed && (
        <p className="data border-t border-white/10 px-4 py-1.5 text-[10px] text-white/30">
          build {BUILD_ID}
        </p>
      )}
    </aside>
  );
}
