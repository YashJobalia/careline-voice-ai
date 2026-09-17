/** Definitions describe the app, not patient records. Never put user data here. */
export const ontologyVersion = "1.0.0";
export const clinicTimeZone = "America/Chicago";
export const entities = {
  patient: {
    label: "Patient",
    aliases: ["patient account"],
    source: "authenticated account",
    sensitivity: "private",
    freshness: "read current account before edits",
  },
  doctor: {
    label: "Doctor",
    aliases: ["physician", "specialist"],
    source: "clinic directory",
    sensitivity: "public",
    freshness: "current directory",
  },
  specialty: {
    label: "Specialty",
    aliases: ["department"],
    source: "clinic directory",
    sensitivity: "public",
    freshness: "current directory",
  },
  appointment: {
    label: "Appointment",
    aliases: ["visit", "booking", "consultation"],
    source: "permission-scoped database query",
    sensitivity: "private",
    freshness: "read again before every change",
  },
  slot: {
    label: "Time slot",
    aliases: ["opening", "available time"],
    source: "live availability query",
    sensitivity: "public",
    freshness:
      "recheck before draft and confirmation; a read never reserves a slot",
  },
  notes: {
    label: "Appointment notes",
    aliases: ["intake", "doctor message"],
    source: "patient-approved summary stored on appointment",
    sensitivity: "clinical",
    freshness: "preserve existing notes; append messages atomically",
  },
  draft: {
    label: "Action draft",
    aliases: ["proposal"],
    source: "server-signed pending action",
    sensitivity: "private",
    freshness:
      "expires after ten minutes; bound to current identity; single attempt",
  },
  conversation: {
    label: "Conversation",
    aliases: ["chat", "transcript"],
    source: "user-scoped conversation history",
    sensitivity: "private",
    freshness:
      "historical context, never authorization or proof of current records",
  },
} as const;
export type Entity = keyof typeof entities;
export const relationships = [
  {
    from: "patient",
    relation: "books",
    to: "appointment",
    cardinality: "one-to-many",
  },
  {
    from: "appointment",
    relation: "occupies",
    to: "slot",
    cardinality:
      "many-to-one historically; at most one confirmed booking per slot",
  },
  {
    from: "slot",
    relation: "belongs_to",
    to: "doctor",
    cardinality: "many-to-one",
  },
  {
    from: "doctor",
    relation: "practices",
    to: "specialty",
    cardinality: "many-to-one",
  },
  {
    from: "appointment",
    relation: "contains",
    to: "notes",
    cardinality: "one-to-one",
  },
  {
    from: "patient",
    relation: "owns",
    to: "conversation",
    cardinality: "one-to-one",
  },
  {
    from: "draft",
    relation: "authorized_by",
    to: "patient",
    cardinality:
      "many-to-one; guest identity allowed only for permitted guest actions",
  },
] as const satisfies readonly {
  from: Entity;
  relation: string;
  to: Entity;
  cardinality: string;
}[];

export const invariants = [
  "A draft is not a booking and never reserves availability.",
  "An appointment's stored status is confirmed or cancelled. Past/upcoming is derived from the slot time, not a stored status.",
  "Reschedule requested is an independent flag. It does not cancel or move the existing appointment.",
  "A confirmed reschedule changes the slot atomically and preserves the appointment identity and notes.",
  "A doctor is also a patient when booking their own care, but cannot book with themselves.",
  "Only specialties and doctors returned by the clinic directory are offered here. If the needed specialty is absent, explain the limitation; never offer an invented specialty or substitute an unrelated department to complete a booking.",
  "Patient intake and messages are patient-reported information, not a verified diagnosis.",
  "An empty permitted search does not prove that a person or record does not exist.",
  "Saving a doctor message means appending appointment notes, not sending email/SMS, alerting a doctor, or proving it was read.",
  "Only a successful server result establishes completion. Never infer success from a draft, tool invocation, timeout or prior conversation.",
] as const;

export function appointmentState(
  visit: {
    status: "confirmed" | "cancelled";
    slot: { starts_at: string };
    reschedule_requested?: boolean;
  },
  now = Date.now(),
) {
  const startsAt = Date.parse(visit.slot.starts_at);
  const timing = !Number.isFinite(startsAt)
    ? "unknown"
    : startsAt <= now
      ? "past"
      : "upcoming";
  return {
    status: visit.status,
    timing,
    rescheduleRequested: visit.reschedule_requested === true,
    changeable: visit.status === "confirmed" && timing === "upcoming",
  };
}
