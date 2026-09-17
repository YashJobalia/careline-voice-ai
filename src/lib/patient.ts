import { z } from "zod";
import { phoneSchema, normalizeContact } from "./phone-number";

export const patientFields = z.object({
  name: z.string().trim().min(2).max(60),
  gender: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  phone: phoneSchema,
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        value >= "1900-01-01" &&
        value <= new Date().toISOString().slice(0, 10)
      );
    }, "Enter a valid date of birth."),
});
export const patientDetails = z.preprocess(normalizeContact, patientFields);
export type Registration = z.infer<typeof patientDetails> & { token: string };
