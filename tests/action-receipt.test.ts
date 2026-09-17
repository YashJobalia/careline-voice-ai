import { test } from "node:test";
import assert from "node:assert/strict";
import { makeReceipt } from "../src/lib/action-receipt";
test("booking receipt identifies the actual doctor, reference and local time", () => {
  const receipt = makeReceipt("book", {
    id: "r",
    reference: "AA123",
    slot: {
      id: "s",
      doctor_id: "maya-shah",
      starts_at: "2026-10-14T16:00:00Z",
    },
  });
  assert.equal(receipt.title, "Appointment booked");
  assert.ok(receipt.fields.some((f) => f.value.includes("Maya")));
  assert.ok(receipt.fields.some((f) => f.value === "AA123"));
  assert.ok(receipt.fields.some((f) => f.value === "America/Chicago"));
});
test("rescheduling requests cannot claim the appointment moved or an email was sent", () => {
  const receipt = makeReceipt("request_reschedule", { id: "r" });
  assert.match(receipt.summary, /stays reserved/);
  assert.match(receipt.summary, /No email or SMS/);
});
