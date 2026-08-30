import { describe, it, expect } from "vitest";
import { classifyWithRegex, parseModelIntent } from "./assistantIntent";

// This classifier is what actually runs in production whenever
// ANTHROPIC_API_KEY isn't set — which, for a small clinic that hasn't
// wired up an AI key yet, may be all the time. It has to be right on its
// own, not just as a fallback in theory.
describe("classifyWithRegex", () => {
  it("extracts a patient name and defaults to open_profile with nothing else to go on", () => {
    const r = classifyWithRegex("Afsar ka profile kholo");
    expect(r.patient_name).toBe("Afsar");
    expect(r.intent).toBe("open_profile");
    expect(r.new_phone).toBeNull();
  });

  it("recognises a due/balance question in Roman Urdu", () => {
    const r = classifyWithRegex("Afsar ka due kitna hai");
    expect(r.patient_name).toBe("Afsar");
    expect(r.intent).toBe("due");
  });

  it("recognises a due/balance question in English", () => {
    const r = classifyWithRegex("What is the outstanding due for Sadia");
    expect(r.intent).toBe("due");
    expect(r.patient_name).toBe("Sadia");
  });

  it("recognises a request to see prescriptions", () => {
    const r = classifyWithRegex("Afsar ki last prescription dikhao");
    expect(r.intent).toBe("prescriptions");
  });

  it("recognises a request to see visit history", () => {
    const r = classifyWithRegex("Afsar ki visit history dikhao");
    expect(r.intent).toBe("visits");
  });

  it("recognises a phone-number update and extracts the digits", () => {
    const r = classifyWithRegex("Afsar ka number 03001234567 update karo");
    expect(r.intent).toBe("update_phone");
    expect(r.patient_name).toBe("Afsar");
    expect(r.new_phone).toBe("03001234567");
  });

  it("does not treat a phone-number mention as an update without a name", () => {
    const r = classifyWithRegex("03001234567");
    expect(r.patient_name).toBeNull();
  });

  it("falls back to unknown when there is no patient name at all", () => {
    const r = classifyWithRegex("kya haal hai");
    expect(r.patient_name).toBeNull();
    expect(r.intent).toBe("unknown");
  });

  it("picks the longest plausible word as the name when several appear", () => {
    // "kholo", "profile", "ka" are all stop-words and should be excluded
    const r = classifyWithRegex("Muhammad ka profile kholo");
    expect(r.patient_name).toBe("Muhammad");
  });

  it("strips spaces and dashes out of an extracted phone number", () => {
    const r = classifyWithRegex("Update Ali's whatsapp number to 0300-123 4567");
    expect(r.new_phone).toBe("03001234567");
  });
});

// If an AI key is configured, this is what turns the model's raw text
// response into something the rest of the app can trust. The model is
// untrusted input as far as this function is concerned — it must survive
// garbage, wrong shapes, and prose the model wasn't supposed to add.
describe("parseModelIntent", () => {
  it("accepts a well-formed JSON response", () => {
    const r = parseModelIntent(
      '{"intent":"due","patient_name":"Afsar","new_phone":null}',
      "Afsar ka due kitna hai"
    );
    expect(r).toEqual({ intent: "due", patient_name: "Afsar", new_phone: null });
  });

  it("normalises a phone number the model left with spaces", () => {
    const r = parseModelIntent(
      '{"intent":"update_phone","patient_name":"Afsar","new_phone":"0300 123 4567"}',
      "Afsar ka number 0300 123 4567 update karo"
    );
    expect(r.new_phone).toBe("03001234567");
  });

  it("falls back to the regex classifier when the model returns an invalid intent value", () => {
    const r = parseModelIntent(
      '{"intent":"delete_patient","patient_name":"Afsar"}',
      "Afsar ka due kitna hai"
    );
    // must not trust the model's made-up intent — re-derive from the original text instead
    expect(r.intent).toBe("due");
  });

  it("falls back to the regex classifier when the response isn't valid JSON", () => {
    const r = parseModelIntent(
      "Sure! Here is the answer: Afsar owes Rs 500.",
      "Afsar ka due kitna hai"
    );
    expect(r.intent).toBe("due");
    expect(r.patient_name).toBe("Afsar");
  });

  it("falls back safely on a completely empty response", () => {
    const r = parseModelIntent("", "Afsar ka profile kholo");
    expect(r.intent).toBe("open_profile");
  });

  it("treats a non-string patient_name from the model as absent rather than throwing", () => {
    const r = parseModelIntent(
      '{"intent":"open_profile","patient_name":123,"new_phone":null}',
      "kholo"
    );
    expect(r.patient_name).toBeNull();
  });
});
