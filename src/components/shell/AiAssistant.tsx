"use client";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import * as React from "react";

type Reply = {
  text: string;
  navigate?: string;
  confirm?: { summary: string; before: string; after: string; endpoint: string; body: unknown };
};

/**
 * Read-only queries and navigation execute immediately.
 * Anything that mutates data comes back as a `confirm` block and is only
 * executed after the doctor presses Confirm. The assistant never receives
 * SQL access — /api/assistant exposes a fixed list of allowed operations.
 */
export function AiAssistant() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [log, setLog] = React.useState<{ role: "you" | "ai"; text: string }[]>([]);
  const [pending, setPending] = React.useState<Reply["confirm"] | null>(null);
  const router = useRouter();

  async function ask() {
    const text = q.trim();
    if (!text) return;
    setQ(""); setLog((l) => [...l, { role: "you", text }]); setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text }),
      });
      const r = (await res.json()) as Reply;
      setLog((l) => [...l, { role: "ai", text: r.text }]);
      if (r.confirm) setPending(r.confirm);
      if (r.navigate) { setOpen(false); router.push(r.navigate); }
    } catch {
      setLog((l) => [...l, { role: "ai", text: "Assistant is unavailable. The rest of the app works normally." }]);
    } finally { setBusy(false); }
  }

  async function confirmChange() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(pending.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLog((l) => [...l, { role: "ai", text: r.error ?? "Couldn't make that change. Try again." }]);
      } else {
        setLog((l) => [...l, { role: "ai", text: r.text ?? "Done." }]);
        setPending(null);
        router.refresh();
      }
    } catch {
      setLog((l) => [...l, { role: "ai", text: "Couldn't reach the server. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Assistant"
        className="flex h-8 items-center gap-1.5 rounded-[4px] border border-line-strong px-2.5 text-[13px] text-ink-2 hover:border-primary hover:text-primary"
      >
        <Sparkles size={15} /> <span className="hidden sm:inline">Assistant</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Assistant" width={520}>
        <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
          {log.length === 0 && (
            <p className="text-[13px] text-ink-3">
              Ask in English or Roman Urdu. For example: "Afsar ka profile kholo",
              "Afsar ka due kitna hai", "Afsar ki last prescription dikhao",
              "Afsar ka number 03001234567 update karo".
            </p>
          )}
          {log.map((m, i) => (
            <p key={i} className={m.role === "you" ? "text-[14px] text-ink" : "text-[14px] text-ink-2"}>
              <span className="label mr-2">{m.role === "you" ? "You" : "AI"}</span>{m.text}
            </p>
          ))}
        </div>

        {pending && (
          <div className="mb-3 rounded-[6px] border border-warn/40 bg-warn-bg p-3">
            <p className="text-[13px] font-medium text-warn">{pending.summary}</p>
            <p className="data mt-2 text-[12px] text-ink-2">OLD — {pending.before}</p>
            <p className="data text-[12px] text-ink">NEW — {pending.after}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={busy} onClick={confirmChange}>Confirm</Button>
              <Button size="sm" variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask something…"
            className="h-[38px] flex-1 rounded-[6px] border border-line-strong px-3 text-[14px] outline-none focus:border-focus"
          />
          <Button onClick={ask} loading={busy}>
            {!busy && <Send size={15} />} Ask
          </Button>
        </div>
      </Modal>
    </>
  );
}
