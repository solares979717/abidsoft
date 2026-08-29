import { createClient } from "@/lib/supabase/server";
import { signProposal } from "@/lib/assistantAuth";
import { classifyWithRegex, parseModelIntent, ASSISTANT_SYSTEM_PROMPT, type Intent } from "@/lib/assistantIntent";
import { NextResponse } from "next/server";

/**
 * Controlled tool layer for the assistant.
 *
 * The model (when ANTHROPIC_API_KEY is set) only ever classifies the
 * doctor's sentence into a small fixed intent shape — it never sees the
 * database and never emits SQL, and it cannot take any action itself.
 * This file is what actually reads or proposes changes, from a short,
 * explicit allow-list of operations.
 *
 * Read-only intents (due, prescriptions, visits, open profile) answer or
 * navigate immediately. The one mutation this assistant supports —
 * updating a patient's phone number — is never applied here. It comes
 * back as a signed `confirm` proposal showing OLD and NEW; only
 * /api/assistant/apply, after the doctor presses Confirm, writes it.
 */

type Patient = {
  id: string; patient_no: string; full_name: string;
  due_total: number; rx_count: number; visit_count: number;
};

async function classify(q: string): Promise<Intent> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return classifyWithRegex(q);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: ASSISTANT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: q }],
      }),
    });
    if (!res.ok) return classifyWithRegex(q);
    const json = await res.json();
    const block = (json.content as { type: string; text?: string }[] | undefined)
      ?.find((c) => c.type === "text");
    if (!block?.text) return classifyWithRegex(q);
    return parseModelIntent(block.text, q);
  } catch {
    // The AI provider being slow, down, or misconfigured must never break
    // the assistant — fall back to the keyword matcher.
    return classifyWithRegex(q);
  }
}

export async function POST(req: Request) {
  const { q } = (await req.json()) as { q: string };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ text: "Not signed in." }, { status: 401 });

  const parsed = await classify(String(q || ""));

  if (!parsed.patient_name) {
    return NextResponse.json({ text: "Tell me a patient name, for example: Afsar ka due kitna hai." });
  }

  const { data } = await sb.rpc("global_search", { q: parsed.patient_name });
  const p = (data as { patients?: Patient[] })?.patients?.[0];
  if (!p) return NextResponse.json({ text: `No patient found matching "${parsed.patient_name}".` });

  switch (parsed.intent) {
    case "due":
      return NextResponse.json({
        text: `${p.full_name} (${p.patient_no}) has ${Number(p.due_total) > 0
          ? "Rs " + Number(p.due_total).toLocaleString() + " outstanding."
          : "no outstanding due."}`,
      });

    case "prescriptions":
      return NextResponse.json({
        text: `Opening prescriptions for ${p.full_name} (${p.rx_count} on record).`,
        navigate: `/patients/${p.id}?tab=prescriptions`,
      });

    case "visits":
      return NextResponse.json({
        text: `Opening visits for ${p.full_name} (${p.visit_count} on record).`,
        navigate: `/patients/${p.id}?tab=visits`,
      });

    case "update_phone": {
      if (!parsed.new_phone) {
        return NextResponse.json({ text: "What should the new number be?" });
      }
      const { data: patientRow } = await sb.from("patients")
        .select("id, phone, patient_no, full_name").eq("id", p.id).single();
      if (!patientRow) return NextResponse.json({ text: "Couldn't find that patient's record." });

      if (patientRow.phone === parsed.new_phone) {
        return NextResponse.json({ text: `${patientRow.full_name}'s phone number is already ${parsed.new_phone}.` });
      }

      const proposal = {
        patient_id: patientRow.id,
        old_phone: patientRow.phone as string,
        new_phone: parsed.new_phone,
      };
      const token = signProposal(proposal);

      return NextResponse.json({
        text: `Ready to update ${patientRow.full_name}'s phone number.`,
        confirm: {
          summary: `Update phone number — ${patientRow.full_name} (${patientRow.patient_no})`,
          before: patientRow.phone ?? "—",
          after: parsed.new_phone,
          endpoint: "/api/assistant/apply",
          body: { ...proposal, token },
        },
      });
    }

    default:
      return NextResponse.json({
        text: `Opening ${p.full_name} (${p.patient_no}).`,
        navigate: `/patients/${p.id}`,
      });
  }
}
