"use client";
import { X } from "lucide-react";
import * as React from "react";

export function Modal({
  open, onClose, title, children, footer, width = 560,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-6">
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="mt-12 max-w-full rounded-[8px] bg-paper shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="display text-[16px] text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
