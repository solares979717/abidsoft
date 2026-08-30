import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, money, ageFromDob, fmtDate, fmtTime, addDays, isoDate, titleFromSnake } from "./utils";

describe("cn", () => {
  it("joins truthy class names with a space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("drops false, null, undefined and empty values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });
  it("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("money", () => {
  it("formats a whole number with the Rs prefix and thousands separators", () => {
    expect(money(1000)).toBe("Rs 1,000");
    expect(money(1234567)).toBe("Rs 1,234,567");
  });
  it("rounds off fractions — billing amounts are whole rupees", () => {
    expect(money(499.9)).toBe("Rs 500");
    expect(money(0.4)).toBe("Rs 0");
  });
  it("treats null and undefined as zero rather than throwing or showing NaN", () => {
    expect(money(null)).toBe("Rs 0");
    expect(money(undefined)).toBe("Rs 0");
  });
  it("formats zero and negative numbers", () => {
    expect(money(0)).toBe("Rs 0");
    expect(money(-500)).toBe("Rs -500");
  });
});

describe("ageFromDob", () => {
  afterEach(() => vi.useRealTimers());

  it("returns an em dash when there's no date of birth", () => {
    expect(ageFromDob(null)).toBe("—");
    expect(ageFromDob(undefined)).toBe("—");
    expect(ageFromDob("")).toBe("—");
  });

  it("reports age in months for a baby under one year old", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29"));
    expect(ageFromDob("2026-05-29")).toBe("3 mo");
  });

  it("reports whole years once the child has turned one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29"));
    expect(ageFromDob("2022-08-29")).toBe("4 y");
  });

  it("does not round up before the birthday has actually occurred this year", () => {
    vi.useFakeTimers();
    // birthday is tomorrow relative to "today" — still the earlier age
    vi.setSystemTime(new Date("2026-08-29"));
    expect(ageFromDob("2000-08-30")).toBe("25 y");
  });

  it("rounds up on the exact birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29"));
    expect(ageFromDob("2000-08-29")).toBe("26 y");
  });
});

describe("fmtDate", () => {
  it("returns an em dash for a missing value", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
  });
  it("formats a date as DD Mon YYYY", () => {
    expect(fmtDate("2026-01-05")).toBe("05 Jan 2026");
    expect(fmtDate("2026-12-25")).toBe("25 Dec 2026");
  });
  it("accepts a Date object as well as a string", () => {
    expect(fmtDate(new Date("2026-06-15"))).toBe("15 Jun 2026");
  });
});

describe("fmtTime", () => {
  it("returns an em dash for a missing value", () => {
    expect(fmtTime(null)).toBe("—");
  });
  it("formats a time in 12-hour form", () => {
    // ISO string carries a Z (UTC) suffix so the test is timezone-independent
    expect(fmtTime("2026-01-01T00:00:00Z")).toMatch(/^\d{2}:\d{2}\s?(am|pm|AM|PM)$/);
  });
});

describe("addDays", () => {
  it("adds the given number of days to a fixed date", () => {
    const start = new Date("2026-09-20T00:00:00Z");
    const result = addDays(20, start);
    expect(isoDate(result)).toBe("2026-10-10");
  });
  it("subtracts when given a negative number", () => {
    const start = new Date("2026-01-05T00:00:00Z");
    const result = addDays(-10, start);
    expect(isoDate(result)).toBe("2025-12-26");
  });
  it("does not mutate the date that was passed in", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const copy = new Date(start);
    addDays(5, start);
    expect(start.getTime()).toBe(copy.getTime());
  });
});

describe("isoDate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(isoDate(new Date("2026-03-07T12:00:00Z"))).toBe("2026-03-07");
  });
});

describe("titleFromSnake", () => {
  it("turns snake_case into Title Case", () => {
    expect(titleFromSnake("in_consultation")).toBe("In Consultation");
    expect(titleFromSnake("report_uploaded")).toBe("Report Uploaded");
    expect(titleFromSnake("no_show")).toBe("No Show");
  });
  it("leaves an already-plain word capitalised correctly", () => {
    expect(titleFromSnake("completed")).toBe("Completed");
  });
  it("returns an em dash for empty input rather than a blank label", () => {
    expect(titleFromSnake(null)).toBe("—");
    expect(titleFromSnake(undefined)).toBe("—");
    expect(titleFromSnake("")).toBe("—");
  });

  // This function exists specifically because the app once sent Title Case
  // values ("Waiting", "Report Uploaded") into columns that only accept
  // lowercase snake_case, which silently rejected every write. It stays
  // pure display formatting — it must never be used to decide what value
  // gets sent to the database.
  it("is idempotent-safe: formatting twice gives the same readable label", () => {
    const once = titleFromSnake("follow_up");
    expect(titleFromSnake(once.toLowerCase().replace(/ /g, "_"))).toBe(once);
  });
});
