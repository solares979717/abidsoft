export type Intent = {
  intent: "due" | "prescriptions" | "visits" | "open_profile" | "update_phone" | "unknown";
  patient_name: string | null;
  new_phone: string | null;
};

const STOP = ["ka", "ki", "ke", "kholo", "dikhao", "kitna", "hai", "hain", "show", "open",
  "the", "for", "last", "profile", "patient", "kya", "batao", "number", "phone",
  "update", "karo", "badal", "badlo", "haal", "kaisa", "kaisay", "kese", "what", "is"];

/** Used whenever ANTHROPIC_API_KEY isn't set, or the API call fails for any
 *  reason — the assistant must keep working without it. */
export function classifyWithRegex(q: string): Intent {
  const text = q.toLowerCase();
  const words = q.match(/[A-Za-z\u0600-\u06FF]{3,}/g) ?? [];
  const candidates = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !STOP.includes(w.toLowerCase()));

  // A capitalised word (other than the very first word of the sentence,
  // whose capital is just normal sentence casing) is a strong signal it's
  // a proper noun — prefer that over "longest word wins", which otherwise
  // loses names to ordinary long English words like "outstanding".
  const capitalised = candidates.filter(({ w, i }) => i > 0 && /^[A-Z]/.test(w));
  const pool = capitalised.length > 0 ? capitalised : candidates;
  const name = pool.map(({ w }) => w).sort((a, b) => b.length - a.length)[0] ?? null;

  const phoneMatch = q.match(/(\+?\d[\d\s-]{7,14}\d)/);
  const newPhone = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, "") : null;

  let intent: Intent["intent"] = "unknown";
  if (/number|phone|whatsapp/.test(text) && newPhone) intent = "update_phone";
  else if (/due|paisa|payment|bill/.test(text)) intent = "due";
  else if (/prescription|nuskha|dawa|medicine/.test(text)) intent = "prescriptions";
  else if (/visit|last|history/.test(text)) intent = "visits";
  else if (name) intent = "open_profile";

  return { intent, patient_name: name, new_phone: newPhone };
}

export const ASSISTANT_SYSTEM_PROMPT = `You are a clinic front-desk assistant's language classifier.
You never access a database and never take any action yourself. You only turn
one sentence — in English, Urdu, or Roman Urdu (Urdu written in Latin letters)
— into a structured intent for another system to act on safely.

Respond with ONLY a JSON object, no other text, exactly matching this shape:
{"intent": "due" | "prescriptions" | "visits" | "open_profile" | "update_phone" | "unknown",
 "patient_name": string or null, "new_phone": string or null}

- "due": asking how much a patient owes, or their outstanding balance
- "prescriptions": asking to see a patient's prescriptions or medicines
- "visits": asking to see a patient's visit history
- "open_profile": asking to open or show a patient's profile in general
- "update_phone": asking to change or update a patient's phone or WhatsApp number — put the new number, digits only, in new_phone
- "unknown": anything else, or if no patient name is mentioned at all

Never invent a name or phone number that was not actually in the sentence.
If unsure, prefer "unknown" over guessing.`;

const VALID_INTENTS: Intent["intent"][] =
  ["due", "prescriptions", "visits", "open_profile", "update_phone", "unknown"];

/** Turns whatever JSON the model returned into a safe Intent, falling back
 *  to the regex classifier if the shape doesn't look right. */
export function parseModelIntent(rawText: string, originalQuery: string): Intent {
  try {
    const parsed = JSON.parse(rawText.trim());
    if (!VALID_INTENTS.includes(parsed.intent)) return classifyWithRegex(originalQuery);
    return {
      intent: parsed.intent,
      patient_name: typeof parsed.patient_name === "string" ? parsed.patient_name : null,
      new_phone: typeof parsed.new_phone === "string" ? parsed.new_phone.replace(/[\s-]/g, "") : null,
    };
  } catch {
    return classifyWithRegex(originalQuery);
  }
}
