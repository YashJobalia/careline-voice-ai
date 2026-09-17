import { z } from "zod";
import { patientDetails } from "./patient";

export const navigation = z.object({
  page: z.enum([
    "reception",
    "appointments",
    "specialists",
    "account",
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
    .enum(["profile", "password", "signin", "signup"])
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
export const accountLookup = z
  .object({
    email: z.string().trim().email().max(254).optional(),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s().-]/g, ""))
      .pipe(z.string().regex(/^\+[1-9][0-9]{7,14}$/))
      .optional(),
    originalRequest: z.string().trim().min(1).max(1000).optional(),
  })
  .refine(
    (value) => Boolean(value.email) !== Boolean(value.phone),
    "Provide exactly one full email or international phone number.",
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
  concern: z.string().trim().min(3).max(600),
  duration: z.string().trim().min(1).max(200),
  severity: z.string().trim().min(1).max(200),
  context: z.string().trim().max(800).default(""),
});
export const mutation = z.discriminatedUnion("action", [
  patientDetails.extend({ action: z.literal("register") }),
  z.object({ action: z.literal("book"), slotId: z.uuid(), notes: visitNotes }),
  z.object({ action: z.literal("reschedule"), id: z.uuid(), slotId: z.uuid() }),
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
  patientDetails
    .omit({ email: true })
    .extend({ action: z.literal("update_profile") }),
  z.object({ action: z.literal("clear_history") }),
  z.object({ action: z.literal("change_password") }),
  z.object({ action: z.literal("signout") }),
]);
export type Mutation = z.infer<typeof mutation>;
export type PendingAction = {
  token: string;
  summary: string;
  details: Mutation;
};
export type ActionResult = {
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
