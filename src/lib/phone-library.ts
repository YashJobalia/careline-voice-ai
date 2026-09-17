// Explicit metadata also works with the project's TSX/CommonJS test loader.
import metadata from "libphonenumber-js/metadata.min.json";
import {
  parsePhoneNumberFromString as parse,
  getCountries as countries,
  getCountryCallingCode as callingCode,
  isSupportedCountry as supported,
  AsYouType as Formatter,
  type CountryCode,
} from "libphonenumber-js/core";
export type { CountryCode } from "libphonenumber-js/core";
export const parsePhoneNumberFromString = (
  value: string,
  options: { defaultCountry?: CountryCode; extract?: boolean } = {},
) => parse(value, options, metadata);
export const getCountries = () => countries(metadata);
export const getCountryCallingCode = (country: CountryCode) =>
  callingCode(country, metadata);
export const isSupportedCountry = (country: string) =>
  supported(country as CountryCode, metadata);
export class AsYouType extends Formatter {
  constructor(country?: CountryCode) {
    super(country, metadata);
  }
}
