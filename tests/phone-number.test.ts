import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib/phone-number";
import { patientDetails } from "../src/lib/patient";
import { accountLookup, mutation, visitNotes } from "../src/lib/workspace";

test("country-aware phone normalization accepts pasted and national formats", () => {
  for (const [input, country, expected] of [
    ["(312) 555-0101", "US", "+13125550101"],
    ["+1 (312) 555-0101", "IN", "+13125550101"],
    ["098765 43210", "IN", "+919876543210"],
    ["98765-43210", "+91", "+919876543210"],
    ["020 7946 0958", "GB", "+442079460958"],
    ["0044 20 7946 0958", "US", "+442079460958"],
    ["0412 345 678", "AU", "+61412345678"],
    ["+٣١ ٦ ١٢٣٤٥٦٧٨", "NL", "+31612345678"],
  ])
    assert.equal(normalizePhone(input, country), expected);
  assert.throws(() => normalizePhone("3125550101"));
  assert.throws(() => normalizePhone("555", "US"));
});

test("manual signup, voice drafts and account lookup normalize identically", () => {
  const details = {
    name: "Test Patient",
    email: "test@example.com",
    dateOfBirth: "1990-01-01",
    countryCode: "IN",
    phone: "098765 43210",
  };
  assert.equal(patientDetails.parse(details).phone, "+919876543210");
  const registration = mutation.parse({ ...details, action: "register" });
  assert.equal(
    registration.action === "register" && registration.phone,
    "+919876543210",
  );
  assert.equal(
    accountLookup.parse({ phone: details.phone, countryCode: "IN" }).phone,
    "+919876543210",
  );
});

test("notes retain long summaries and explicit declined answers", () => {
  const notes = {
    concern: "Patient-reported concern. ".repeat(150).trim(),
    duration: "Not provided",
    severity: "Not provided",
    context: "Patient prefers to discuss further with the doctor.",
  };
  assert.deepEqual(visitNotes.parse(notes), notes);
});
