import { describe, it, expect } from "vitest";
import { toCsv } from "./backup";

// A backup is only worth having if it can actually be read back. These check
// the CSV survives the things real clinic data contains: commas in addresses,
// quotes in notes, newlines in free text, and empty fields.
describe("toCsv", () => {
  it("returns nothing for an empty table", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header row from the keys, then the values", () => {
    expect(toCsv([{ a: 1, b: "x" }])).toBe("a,b\n1,x");
  });

  it("quotes values containing a comma so columns don't shift", () => {
    const out = toCsv([{ address: "Main Road, Kala Kelay" }]);
    expect(out).toBe('address\n"Main Road, Kala Kelay"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const out = toCsv([{ note: 'said "fine"' }]);
    expect(out).toBe('note\n"said ""fine"""');
  });

  it("quotes values containing a newline", () => {
    const out = toCsv([{ note: "line1\nline2" }]);
    expect(out).toBe('note\n"line1\nline2"');
  });

  it("writes null and undefined as empty, not the words null/undefined", () => {
    expect(toCsv([{ a: null, b: undefined }])).toBe("a,b\n,");
  });

  it("serialises objects and arrays as JSON, correctly escaped for CSV", () => {
    // JSON contains quotes, so a valid CSV cell doubles them and wraps the
    // whole value — Excel shows ["a","b"] when it reads this back.
    const out = toCsv([{ items: ["a", "b"] }]);
    expect(out).toBe('items\n"[""a"",""b""]"');
  });

  it("keeps every row", () => {
    const out = toCsv([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(out.split("\n")).toHaveLength(4); // header + 3
  });
});
