import { z } from "zod";

export const PASSWORD_HINT =
  "Use 8–16 characters with at least one uppercase letter, one lowercase letter, one number, and one special character.";
export const PASSWORD_PATTERN =
  "(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,16}";

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_HINT)
  .max(16, PASSWORD_HINT)
  .regex(new RegExp(`^(?:${PASSWORD_PATTERN})$`), PASSWORD_HINT);

export const newPasswordAttributes = {
  minLength: 8,
  maxLength: 16,
  pattern: PASSWORD_PATTERN,
  title: PASSWORD_HINT,
} as const;
