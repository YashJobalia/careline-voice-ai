import {
  parsePhoneNumberFromString,
  isSupportedCountry,
  type CountryCode,
} from "./phone-library";
import { z } from "zod";

export function normalizePhone(value: string, countryCode?: string): string {
  // NFKC accepts full-width digits. Keep extensions out of the stored login contact.
  let input = value
    .normalize("NFKC")
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/^00/, "+");
  const country = countryCode?.toUpperCase();
  const region =
    country && isSupportedCountry(country)
      ? (country as CountryCode)
      : undefined;
  if (!input.startsWith("+") && !region && countryCode) {
    const callingCode = countryCode.replace(/\D/g, "");
    if (callingCode) input = `+${callingCode} ${input}`;
  }
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: region,
    extract: false,
  });
  if (!phone || !phone.isPossible()) {
    throw new Error(
      "Choose the phone number's country and check the digits. Spaces, brackets and dashes are welcome.",
    );
  }
  return phone.number;
}

export function normalizeContact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const data = value as Record<string, unknown>;
  if (typeof data.phone !== "string") return value;
  try {
    return {
      ...data,
      phone: normalizePhone(
        data.phone,
        typeof data.countryCode === "string" ? data.countryCode : undefined,
      ),
    };
  } catch {
    return value;
  } // The schema returns a field-specific error.
}

export const phoneSchema = z.string().transform((value, ctx) => {
  try {
    return normalizePhone(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});
