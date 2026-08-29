import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled sweep — runs every 15 minutes (see vercel.json). Sends every
 * WhatsApp message that is due, across every clinic. Reminders are queued
 * automatically by the database the moment an appointment is created; this
 * is the only piece that actually dispatches them.
 *
 * Protected by CRON_SECRET so it can't be triggered by an outside request.
 * If CRON_SECRET isn't set, the endpoint refuses to run rather than sending
 * with no protection at all.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data: due } = await sb.from("whatsapp_messages")
    .select("id, to_number, body, attempts")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 3)
    .order("scheduled_for")
    .limit(25);

  const rows = due ?? [];
  let sent = 0, failed = 0;
  for (const msg of rows) {
    const result = await sendWhatsAppMessage(msg);
    if (result.ok) sent++; else failed++;
  }

  return NextResponse.json({ checked: rows.length, sent, failed });
}
