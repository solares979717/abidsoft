"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import * as React from "react";

type Toast = { id: number; text: string; tone: "ok" | "error" };
const Ctx = React.createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "flex items-center gap-2 rounded-[6px] px-4 py-2.5 text-[14px] shadow-[var(--shadow-pop)] " +
              (t.tone === "ok" ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger")
            }
          >
            {t.tone === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
