import { z } from "zod";
import { patientFields } from "./patient";

import { phoneSchema, normalizeContact } from "./phone-number";

export const navigation = z.object({
  page: z.enum([
    "reception",
    "appointments",
    "specialists",
    "account",
    "settings",
    "doctor",
  ]),
  mode: z.enum(["list", "calendar"]).optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  filter: z
    .enum(["all", "upcoming", "past", "cancelled", "requests"])
    .optional(),
  accountSection: z
    .enum(["profile", "password", "signin", "signup", "recovery"])
    .optional(),
  selectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  booking: z.boolean().optional(),
  doctorId: z.string().optional(),
  notesId: z.uuid().optional(),
  behindScenes: z.boolean().optional(),
});
export type Navigation = z.infer<typeof navigation>;
export const accountLookup = z.preprocess(
  normalizeContact,
  z
    .object({
      email: z.string().trim().email().max(254).optional(),
      phone: phoneSchema.optional(),
      originalRequest: z.string().trim().min(1).max(1000).optional(),
    })
    .refine(
      (value) => Boolean(value.email) !== Boolean(value.phone),
      "Provide exactly one full email or international phone number.",
    ),
);
export const signInRequest = z.object({
  email: z.string().trim().email().max(254).optional(),
  mode: z.enum(["signin", "signup"]).default("signin"),
  returnTo: navigation.optional(),
  originalRequest: z.string().trim().min(1).max(1000).optional(),
});
export type Account = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender?: string | null;
  role: "patient" | "doctor";
  doctorId?: string;
  guest?: boolean;
};
export const visitNotes = z.object({
  concern: z.string().trim().min(3),
  duration: z.string().trim().min(1),
  severity: z.string().trim().min(1),
  context: z.string().trim().default(""),
});
export const mutationVariants = [
  z.object({
    action: z.literal("reset_password"),
    email: z.string().trim().email().max(254),
  }),
  patientFields.extend({ action: z.literal("register") }),
  z.object({
    action: z.literal("book"),
    slotId: z.uuid(),
    notes: visitNotes,
  }),
  z.object({
    action: z.literal("reschedule"),
    id: z.uuid(),
    slotId: z.uuid(),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.uuid(),
    reason: z.string().max(600).default(""),
  }),
  z.object({
    action: z.literal("request_reschedule"),
    id: z.uuid(),
    reason: z.string().max(600).default(""),
  }),
  patientFields
    .omit({ email: true })
    .extend({ action: z.literal("update_profile") }),
  z.object({
    action: z.literal("message_doctor"),
    id: z.uuid(),
    summary: z.string().trim().min(3),
  }),
  z.object({ action: z.literal("clear_history") }),
  z.object({ action: z.literal("change_password") }),
  z.object({ action: z.literal("signout") }),
] as const;
export const mutation = z.preprocess(
  normalizeContact,
  z.discriminatedUnion("action", mutationVariants),
);
export type Mutation = z.infer<typeof mutation>;
export type PendingAction = {
  token: string;
  summary: string;
  details: Mutation;
};
export type ActionResult = {
  semantic?: SemanticOutcome;
  receipt?: ActionReceipt;
  ok?: boolean;
  message?: string;
  pending?: PendingAction;
  navigation?: Navigation;
  credentials?: { email: string; password: string };
  signedOut?: boolean;
  authentication?: {
    email?: string;
    returnTo?: Navigation;
    originalRequest?: string;
  };
  [key: string]: unknown;
};
export type ActionReceipt = {
  semantic?: SemanticOutcome;
  id: string;
  title: string;
  action: string;
  summary: string;
  fields: { label: string; value: string }[];
};
export type SemanticOutcome = {
  version: string;
  state: "draft" | "completed";
  code: string;
  entity: string;
};
export type Visit = {
  id: string;
  slot_id: string;
  session_id: string;
  patient_name: string;
  status: "confirmed" | "cancelled";
  appointment_code: string;
  notes: string;
  cancellation_reason: string | null;
  reschedule_requested: boolean;
  reschedule_reason: string | null;
  created_at: string;
  slot: { id: string; doctor_id: string; starts_at: string };
};
