export const MEDICAL_HISTORY = [
  "Diabetes", "Hypertension", "Asthma", "Heart Disease", "Kidney Disease",
  "Liver Disease", "Previous Surgery", "None", "Other",
];
export const HISTORY_EXCLUSIVE = ["None"];

export const ALLERGY_TYPES = [
  "No Known Allergy", "Medicine Allergy", "Food Allergy", "Other",
];
export const ALLERGY_EXCLUSIVE = ["No Known Allergy"];

export const DURATION_UNITS = ["Hours", "Days", "Weeks", "Months", "Years"];

export const DOSE_OPTIONS = ["1/2", "1", "2", "3", "5 ml", "10 ml", "1 puff", "2 puffs"];
export const FREQUENCY_OPTIONS = ["OD", "BD", "TDS", "QID", "HS", "SOS", "Weekly"];
export const DURATION_OPTIONS = ["3 days", "5 days", "7 days", "10 days", "14 days",
  "1 month", "2 months", "3 months", "Continuous"];
export const ROUTE_OPTIONS = ["Oral", "IM", "IV", "Topical", "Inhaled", "Sublingual",
  "Nasal", "Eye", "Ear"];
export const INSTRUCTION_OPTIONS = ["Before Meal", "After Meal", "With Food",
  "Empty Stomach", "At Bedtime", "Morning", "Evening", "As Needed (PRN)", "Other"];

export const FOLLOWUP_OPTIONS = [7, 14, 20, 30, 45, 60, 90];

export const EXAM_PARTS = [
  { key: "general", label: "General condition" },
  { key: "chest", label: "Chest" },
  { key: "cvs", label: "CVS" },
  { key: "abdomen", label: "Abdomen" },
  { key: "cns", label: "CNS" },
] as const;

export const APPT_STATUS: { value: string; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "waiting", label: "Waiting" },
  { value: "in_consultation", label: "In Consultation" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];
export const APPT_TYPE: { value: string; label: string }[] = [
  { value: "new_patient", label: "New Patient" },
  { value: "follow_up", label: "Follow-up" },
  { value: "walk_in", label: "Walk-in" },
  { value: "custom", label: "Custom" },
];
export const INVESTIGATION_STATUS: { value: string; label: string }[] = [
  { value: "ordered", label: "Ordered" },
  { value: "pending", label: "Pending" },
  { value: "report_uploaded", label: "Report Uploaded" },
  { value: "reviewed", label: "Reviewed" },
];

// Keys are lowercase to match the database exactly (Postgres enums and the
// billing status this app computes are always lowercase). StatusPill looks
// up the tone by lowercasing whatever it's given, so this is the only
// place a status-to-colour mapping needs to exist.
export const STATUS_TONE: Record<string, "warn" | "info" | "ok" | "danger" | "muted"> = {
  waiting: "warn", ordered: "warn", scheduled: "warn", unpaid: "warn", pending: "info",
  in_consultation: "info", report_uploaded: "info", partial: "info", draft: "muted",
  completed: "ok", paid: "ok", sent: "ok", reviewed: "ok", final: "ok", finalized: "ok",
  cancelled: "danger", failed: "danger", missed: "danger",
  no_show: "muted", inactive: "muted",
};
