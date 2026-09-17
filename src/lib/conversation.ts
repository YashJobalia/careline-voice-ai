import { z } from "zod";
import { doctors, type Proposal } from "./clinic";
import type { Registration } from "./patient";

export const languageSchema = z.enum(["auto", "en", "es", "hi", "fr"]);
export type Language = z.infer<typeof languageSchema>;
export const languages: Record<Language, string> = {
  auto: "Automatic",
  en: "English",
  es: "Español",
  hi: "हिन्दी",
  fr: "Français",
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
export const preferenceSchema = z
  .object({
    department: z.enum(["cardiology", "ent", "dermatology"]).nullable(),
    doctorId: z
      .string()
      .refine((id) => doctors.some((d) => d.id === id))
      .nullable(),
    date: date.nullable(),
    dateTo: date.nullable(),
    afterHour: z.number().int().min(0).max(23).nullable(),
    beforeHour: z.number().int().min(0).max(23).nullable(),
  })
  .refine(
    (p) => !p.dateTo || !p.date || p.dateTo >= p.date,
    "Invalid date range",
  )
  .refine(
    (p) =>
      p.afterHour === null ||
      p.beforeHour === null ||
      p.beforeHour > p.afterHour,
    "Invalid time range",
  )
  .refine(
    (p) =>
      !p.doctorId ||
      !p.department ||
      doctors.find((d) => d.id === p.doctorId)?.department === p.department,
    "Doctor and specialty conflict",
  );
export type Preferences = z.infer<typeof preferenceSchema>;
export const emptyPreferences = (): Preferences => ({
  department: null,
  doctorId: null,
  date: null,
  dateTo: null,
  afterHour: null,
  beforeHour: null,
});
export type Trace = {
  name: string;
  durationMs: number;
  status: "ok" | "error";
};
export type Diagnostics = {
  requestId: string;
  model: string;
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedModelCostUsd: number | null;
  traces: Trace[];
};
export type Handoff = {
  reason: string;
  summary: string;
  unresolved: string;
  preferences: Preferences;
};
export type Source = { id: string; title: string; text: string; href: string };
export type ChatResult = {
  text: string;
  actions: string[];
  preferences: Preferences;
  memoryToken?: string;
  proposal?: Proposal;
  registration?: Registration;
  handoff?: Handoff;
  cancellation?: { id: string; label: string };
  sources: Source[];
  diagnostics: Diagnostics;
};
export type TurnMetric = {
  id: string;
  mode: "text" | "voice";
  status: "ok" | "error";
  chatMs: number;
  transcriptionMs?: number;
  endpointMs?: number;
  speechStartMs?: number;
  responseLatencyMs?: number;
  interruptionStopMs?: number;
  diagnostics?: Diagnostics;
};
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
