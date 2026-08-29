import { describe, it, expect } from "vitest";
import {
  ur, urNum, urDate, UR_FREQUENCY, UR_DURATION, UR_ROUTE, UR_INSTRUCTION, UR_ADVICE,
} from "./urdu";
import {
  FREQUENCY_OPTIONS, DURATION_OPTIONS, ROUTE_OPTIONS, INSTRUCTION_OPTIONS,
} from "./constants";

// A prescription is a safety document. A missing translation must never
// silently print a blank, and a wrong one must never be invented.
describe("Urdu prescription translations", () => {
  it("covers every frequency the app can produce", () => {
    for (const f of FREQUENCY_OPTIONS) {
      expect(UR_FREQUENCY[f], `no Urdu for frequency "${f}"`).toBeTruthy();
    }
  });

  it("covers every duration option", () => {
    for (const d of DURATION_OPTIONS) {
      expect(UR_DURATION[d], `no Urdu for duration "${d}"`).toBeTruthy();
    }
  });

  it("covers every route", () => {
    for (const r of ROUTE_OPTIONS) {
      expect(UR_ROUTE[r], `no Urdu for route "${r}"`).toBeTruthy();
    }
  });

  it("covers every instruction", () => {
    for (const i of INSTRUCTION_OPTIONS) {
      expect(UR_INSTRUCTION[i], `no Urdu for instruction "${i}"`).toBeTruthy();
    }
  });

  it("covers the standing advice list seeded by UPGRADE_4", () => {
    const seeded = [
      "Bed rest", "Plenty of water", "Light diet", "Avoid spicy food",
      "Avoid cold drinks", "Reduce salt", "Reduce sugar", "Avoid oily food",
      "Regular walk", "Stop smoking",
      "Complete the full course of medicine",
      "Return immediately if it gets worse",
    ];
    for (const a of seeded) {
      expect(UR_ADVICE[a], `no Urdu for advice "${a}"`).toBeTruthy();
    }
  });

  it("distinguishes the frequencies that must never be confused", () => {
    // Getting BD and TDS the same way round is a dosing error.
    expect(UR_FREQUENCY["OD"]).not.toBe(UR_FREQUENCY["BD"]);
    expect(UR_FREQUENCY["BD"]).not.toBe(UR_FREQUENCY["TDS"]);
    expect(UR_FREQUENCY["TDS"]).not.toBe(UR_FREQUENCY["QID"]);
  });

  it("distinguishes before-meal from after-meal", () => {
    expect(UR_INSTRUCTION["Before Meal"]).not.toBe(UR_INSTRUCTION["After Meal"]);
  });
});

describe("ur()", () => {
  it("returns the fixed translation when one exists", () => {
    expect(ur(UR_FREQUENCY, "BD")).toBe("دن میں دو بار");
  });

  it("returns the original unchanged when there is no translation", () => {
    // A medicine name, or a duration the doctor typed by hand. Printing it
    // as-is is right; inventing an Urdu spelling is not.
    expect(ur(UR_FREQUENCY, "Augmentin 625mg")).toBe("Augmentin 625mg");
    expect(ur(UR_DURATION, "4 days")).toBe("4 days");
  });

  it("returns an empty string for nothing, not the word undefined", () => {
    expect(ur(UR_ROUTE, null)).toBe("");
    expect(ur(UR_ROUTE, undefined)).toBe("");
    expect(ur(UR_ROUTE, "")).toBe("");
  });
});

describe("urNum", () => {
  it("converts Western digits to Urdu digits", () => {
    expect(urNum(625)).toBe("۶۲۵");
    expect(urNum("2026")).toBe("۲۰۲۶");
  });
  it("leaves non-digits alone", () => {
    expect(urNum("5 ml")).toBe("۵ ml");
  });
  it("handles nothing safely", () => {
    expect(urNum(null)).toBe("");
    expect(urNum(undefined)).toBe("");
  });
});

describe("urDate", () => {
  it("writes a date in Urdu with Urdu digits", () => {
    expect(urDate("2026-08-30")).toBe("۳۰ اگست ۲۰۲۶");
  });
  it("returns a dash for a missing or invalid date", () => {
    expect(urDate(null)).toBe("—");
    expect(urDate("not a date")).toBe("—");
  });
});
