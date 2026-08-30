"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

export function PrintFrame({
  children, size = "A5", whatsapp, summary, backTo, langSwitch,
}: {
  children: React.ReactNode;
  size?: "A4" | "A5";
  /** Patient's WhatsApp/phone number. When present, a Send on WhatsApp button appears. */
  whatsapp?: string | null;
  /** Plain-text version of this sheet, sent as the message body. */
  summary?: string;
  /** Where Back should go. Needed because after saving a consultation the
   *  browser's own history would send the doctor back into the half-filled
   *  form, which is never what they want. */
  backTo?: string;
  /** Shows an English / اردو toggle. The doctor picks which one to hand over. */
  langSwitch?: { current: "en" | "ur" };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${size}; margin: 12mm; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [size]);

  // Pakistani numbers are stored as 03xxxxxxxxx; WhatsApp needs 92xxxxxxxxxx.
  function waLink() {
    if (!whatsapp) return null;
    const digits = whatsapp.replace(/\D/g, "");
    const intl = digits.startsWith("0") ? "92" + digits.slice(1)
      : digits.startsWith("92") ? digits
      : digits;
    return `https://wa.me/${intl}?text=${encodeURIComponent(summary ?? "")}`;
  }
  const link = waLink();

  return (
    <div className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <div
        className="no-print mx-auto mb-4 flex flex-wrap items-center justify-between gap-2 px-4"
        style={{ maxWidth: size === "A5" ? "148mm" : "210mm" }}
      >
        <button
          onClick={() => (backTo ? router.push(backTo)
            : window.history.length > 1 ? router.back() : router.push("/dashboard"))}
          className="flex h-[38px] items-center gap-1.5 rounded-[6px] border border-line-strong bg-paper px-3 text-[14px] font-medium text-ink-2"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex flex-wrap gap-2">
          {langSwitch && (
            <div className="flex overflow-hidden rounded-[6px] border border-line-strong">
              {([["en", "English"], ["ur", "اردو"]] as const).map(([code, label]) => {
                const next = new URLSearchParams(params.toString());
                if (code === "en") next.delete("lang"); else next.set("lang", code);
                const href = `${pathname}${next.toString() ? `?${next}` : ""}`;
                const active = langSwitch.current === code;
                return (
                  <a key={code} href={href}
                    className={`flex h-[38px] items-center px-3 text-[14px] font-medium ${
                      active ? "bg-primary text-white" : "bg-paper text-ink-2"}`}>
                    {label}
                  </a>
                );
              })}
            </div>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[38px] items-center gap-1.5 rounded-[6px] border border-ok bg-ok-bg px-3 text-[14px] font-medium text-ok"
            >
              <MessageCircle size={16} /> Send on WhatsApp
            </a>
          )}
          <button onClick={() => window.print()}
            className="h-[38px] rounded-[6px] bg-primary px-4 text-[14px] font-medium text-white">
            Print / Save as PDF
          </button>
        </div>
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
