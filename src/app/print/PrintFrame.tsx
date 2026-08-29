"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function PrintFrame({ children, size = "A5" }: { children: React.ReactNode; size?: "A4" | "A5" }) {
  const router = useRouter();

  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${size}; margin: 12mm; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [size]);

  return (
    <div className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[148mm] items-center justify-between gap-2 px-4">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
          className="flex h-[38px] items-center gap-1.5 rounded-[6px] border border-line-strong bg-paper px-3 text-[14px] font-medium text-ink-2"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={() => window.print()}
          className="h-[38px] rounded-[6px] bg-primary px-4 text-[14px] font-medium text-white">
          Print / Save as PDF
        </button>
      </div>
      <div
        className="print-sheet mx-auto bg-white p-8 shadow-[var(--shadow-card)] print:p-0 print:shadow-none"
        style={{ width: size === "A5" ? "148mm" : "210mm", maxWidth: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}
