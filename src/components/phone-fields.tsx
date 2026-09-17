"use client";
import { useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  AsYouType,
  type CountryCode,
} from "@/lib/phone-library";
import { normalizePhone } from "@/lib/phone-number";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().sort((a, b) =>
  (names.of(a) || a).localeCompare(names.of(b) || b),
);

export function PhoneFields({ value = "" }: { value?: string }) {
  const saved = parsePhoneNumberFromString(value);
  const [country, setCountry] = useState<CountryCode>(saved?.country || "US");
  const [number, setNumber] = useState(saved?.formatNational() || value);
  const [error, setError] = useState("");
  function format(value: string, region: CountryCode) {
    try {
      const parsed = parsePhoneNumberFromString(normalizePhone(value, region));
      if (parsed?.country) setCountry(parsed.country);
      setNumber(
        parsed?.country
          ? parsed.formatNational()
          : parsed?.formatInternational() || value,
      );
      setError("");
    } catch {
      setNumber(new AsYouType(region).input(value) || value);
      if (value.trim())
        setError(
          "Check the country and digits. You can paste the number in its usual format.",
        );
    }
  }
  return (
    <div className="phone-fields">
      <label>
        Country code
        <select
          aria-label="Country code"
          name="countryCode"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value as CountryCode);
            setError("");
          }}
          autoComplete="tel-country-code"
        >
          {countries.map((code) => (
            <option key={code} value={code}>
              {names.of(code)} (+{getCountryCallingCode(code)})
            </option>
          ))}
        </select>
      </label>
      <label>
        Phone number
        <input
          aria-label="Phone number"
          name="phone"
          type="tel"
          autoComplete="tel-national"
          required
          value={number}
          onChange={(e) => {
            setNumber(e.target.value);
            setError("");
          }}
          onBlur={() => format(number, country)}
        />
        <small>
          {error ||
            "Use your usual format, or paste a full international number."}
        </small>
      </label>
    </div>
  );
}
