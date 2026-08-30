/**
 * Urdu for the printed prescription.
 *
 * Every phrase here is a fixed, pre-agreed translation — nothing is
 * translated on the fly by a machine. That matters on a prescription:
 * "BD" must always come out as دن میں دو بار, never as something a
 * translator guessed differently this time.
 *
 * Medicine names are deliberately NOT translated. A pharmacist reads the
 * Latin name off the box, and Urdu spellings of similar drug names
 * (Losartan / Lorazepam) are dangerously easy to confuse. The medicine
 * column stays in English on both versions of the sheet.
 *
 * Anything the doctor types freely — a complaint they wrote themselves,
 * their own advice — is printed exactly as they typed it. Guessing at a
 * translation of a doctor's own words is not something this should do.
 */

export const UR = {
  // headings
  prescription: "نسخہ",
  patient: "مریض",
  age: "عمر",
  gender: "جنس",
  date: "تاریخ",
  phone: "فون",
  complaint: "شکایت",
  diagnosis: "تشخیص",
  vitals: "علامات",
  investigations: "ٹیسٹ",
  advice: "ہدایات",
  followUp: "اگلی ملاقات",
  signature: "دستخط",
  allergy: "الرجی",
  years: "سال",
  months: "ماہ",

  gender_male: "مرد",
  gender_female: "عورت",
} as const;

/** OD / BD / TDS … */
export const UR_FREQUENCY: Record<string, string> = {
  "OD": "دن میں ایک بار",
  "BD": "دن میں دو بار",
  "TDS": "دن میں تین بار",
  "QID": "دن میں چار بار",
  "HS": "رات سوتے وقت",
  "SOS": "ضرورت پڑنے پر",
  "Weekly": "ہفتے میں ایک بار",
};

/** 5 days, 1 month … */
export const UR_DURATION: Record<string, string> = {
  "3 days": "3 دن",
  "5 days": "5 دن",
  "7 days": "7 دن",
  "10 days": "10 دن",
  "14 days": "14 دن",
  "1 month": "ایک ماہ",
  "2 months": "دو ماہ",
  "3 months": "تین ماہ",
  "Continuous": "مسلسل",
};

/** Oral, IM, IV … */
export const UR_ROUTE: Record<string, string> = {
  "Oral": "منہ کے ذریعے",
  "IM": "عضلاتی ٹیکہ",
  "IV": "رگ میں ٹیکہ",
  "Topical": "جلد پر لگائیں",
  "Inhaled": "سانس کے ذریعے",
  "Sublingual": "زبان کے نیچے",
  "Nasal": "ناک میں",
  "Eye": "آنکھ میں",
  "Ear": "کان میں",
};

/** Before meal, after meal … */
export const UR_INSTRUCTION: Record<string, string> = {
  "Before Meal": "کھانے سے پہلے",
  "After Meal": "کھانے کے بعد",
  "With Food": "کھانے کے ساتھ",
  "Empty Stomach": "نہار منہ",
  "At Bedtime": "سوتے وقت",
  "Morning": "صبح",
  "Evening": "شام",
  "As Needed (PRN)": "ضرورت پڑنے پر",
  "Other": "دیگر",
};

/** 1/2, 1, 2, 5 ml … */
export const UR_DOSE: Record<string, string> = {
  "1/2": "آدھی",
  "1": "ایک",
  "2": "دو",
  "3": "تین",
  "5 ml": "5 ملی لیٹر",
  "10 ml": "10 ملی لیٹر",
  "1 puff": "ایک پف",
  "2 puffs": "دو پف",
};

/** The standing advice seeded by UPGRADE_4. */
export const UR_ADVICE: Record<string, string> = {
  "Bed rest": "آرام کریں",
  "Plenty of water": "زیادہ پانی پیئیں",
  "Light diet": "ہلکی غذا لیں",
  "Avoid spicy food": "مرچ مصالحہ سے پرہیز کریں",
  "Avoid cold drinks": "ٹھنڈے مشروبات سے پرہیز کریں",
  "Reduce salt": "نمک کم کریں",
  "Reduce sugar": "چینی کم کریں",
  "Avoid oily food": "تیل والی غذا سے پرہیز کریں",
  "Regular walk": "روزانہ چہل قدمی کریں",
  "Stop smoking": "سگریٹ نوشی ترک کریں",
  "Complete the full course of medicine": "دوا کا مکمل کورس کریں",
  "Return immediately if it gets worse": "طبیعت بگڑنے پر فوراً رابطہ کریں",
};

/**
 * Numbers stay in Western digits on the Urdu sheet too.
 *
 * Arabic-Indic digits (۱۲۳) look correct typographically, but a BP of
 * ۱۲۰/۸۰ or a dose of ۵ is slower to read at a glance and does not match
 * what is printed on medicine boxes, lab reports or the patient's own
 * phone. Numbers are the one thing that must never be misread.
 */
export function urNum(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

const UR_MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون",
  "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];

export function urDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  // Month name in Urdu, day and year in Western digits.
  return `${d.getDate()} ${UR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Looks a phrase up in one of the tables above. Anything not found — a
 * medicine name, a duration the doctor typed by hand, their own wording —
 * comes back unchanged rather than being guessed at.
 */
export function ur(table: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "";
  return table[value] ?? value;
}
