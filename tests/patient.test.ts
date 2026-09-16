import { test } from "node:test";
import assert from "node:assert/strict";
import { patientDetails } from "../src/lib/patient";

test("registration rejects future or impossible dates and accepts a leap birthday", () => {
  for (const dateOfBirth of [
    "2025-02-29",
    "1990-13-01",
    "2999-01-01",
    "1899-01-01",
    "02/03/1990",
  ]) {
    assert.equal(
      patientDetails.safeParse({ name: "Alex Demo", dateOfBirth }).success,
      false,
    );
  }
  assert.equal(
    patientDetails.safeParse({ name: "Alex Demo", dateOfBirth: "2000-02-29" })
      .success,
    true,
  );
});
