import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { NextResponse } from "next/server";

/**
 * WhatsApp integration layer — send one message now.
 * Provider-agnostic: rows are queued by the database (see the
 * queue_appointment_reminder trigger), this endpoint dispatches one.
 * Never called from the browser with credentials.
 */
export async function POST(req: Request) {
  const { message_id } = await req.json();
  const sb = createAdminClient();

  const { data: msg } = await sb.from("whatsapp_messages")
    .select("id, to_number, body, attempts").eq("id", message_id).single();
  if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const result = await sendWhatsAppMessage(msg);
  return NextResponse.json(result);
}
