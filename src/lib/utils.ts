export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return "Rs " + v.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function ageFromDob(dob: string | null | undefined): string {
  if (!dob) return "—";
  const d = new Date(dob), now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  let m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) { y--; m += 12; }
  if (y < 1) return `${m} mo`;
  return `${y} y`;
}

export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function fmtTime(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function addDays(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "in_consultation" -> "In Consultation". For displaying any snake_case
 *  database value (status, type) as a readable label. */
export function titleFromSnake(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
