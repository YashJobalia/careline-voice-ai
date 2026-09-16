import { z } from "zod";

export const patientDetails = z.object({
  name: z.string().trim().min(2).max(60),
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
export type Registration = z.infer<typeof patientDetails> & { token: string };
