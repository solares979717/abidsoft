import { createAdminClient } from "@/lib/supabase/server";

type WaMessage = {
  id: string; to_number: string; body: string; attempts: number | null;
};

/**
 * Sends one queued WhatsApp message and records the result. Shared by the
 * manual send endpoint and the cron sweep so there is exactly one place
 * that knows how to talk to the provider.
 *
 * Without WHATSAPP_API_URL / WHATSAPP_API_TOKEN configured, this marks the
 * message failed with a clear, actionable reason — it never throws, so the
 * rest of the clinic software keeps working with or without WhatsApp set up.
 */
export async function sendWhatsAppMessage(msg: WaMessage) {
  const sb = createAdminClient();
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;

  if (!url || !token) {
    await sb.from("whatsapp_messages").update({
      status: "failed",
      error: "WhatsApp credentials are not configured. Add them in Settings → WhatsApp.",
      attempts: (msg.attempts ?? 0) + 1,
    }).eq("id", msg.id);
    return { ok: false, reason: "not_configured" as const };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to_number,
        type: "text",
        text: { body: msg.body },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Provider returned ${res.status}`);

    await sb.from("whatsapp_messages").update({
      status: "sent", sent_at: new Date().toISOString(),
      provider_msg_id: json?.messages?.[0]?.id ?? null,
      attempts: (msg.attempts ?? 0) + 1, error: null,
    }).eq("id", msg.id);
    return { ok: true as const };
  } catch (e) {
    await sb.from("whatsapp_messages").update({
      status: "failed", error: (e as Error).message,
      attempts: (msg.attempts ?? 0) + 1,
    }).eq("id", msg.id);
    return { ok: false, reason: "provider_error" as const, error: (e as Error).message };
  }
}
