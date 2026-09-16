import { test } from "node:test";
import assert from "node:assert/strict";
import { initialPractice, practiceReply } from "../src/lib/practice";
import { practiceSlots } from "../src/lib/clinic";
const slots = practiceSlots(new Date("2026-09-16T12:00:00Z"));
test("department, physician, slot, fictional name produce a reviewable proposal", () => {
  let r = practiceReply("Dermatology", initialPractice, slots);
  assert.equal(r.state.step, "doctor");
  r = practiceReply("Dr. Maya Shah", r.state, slots);
  assert.equal(r.state.step, "slot");
  assert.ok(r.choices?.length);
  r = practiceReply(r.choices![0], r.state, slots);
  assert.equal(r.state.step, "name");
  r = practiceReply("Alex Morgan", r.state, slots);
  assert.equal(r.proposal?.patientName, "Alex Morgan");
  assert.equal(r.proposal?.slot.doctor_id, "maya-shah");
});
test("department correction clears the prior physician selection", () => {
  const r = practiceReply(
    "Actually Cardiology",
    { step: "slot", department: "dermatology", doctorId: "maya-shah" },
    slots,
  );
  assert.equal(r.state.department, "cardiology");
  assert.equal(r.state.doctorId, undefined);
});
test("unavailable slots are not proposed", () => {
  const r = practiceReply(
    "Alex Morgan",
    { step: "name", department: "dermatology", slotId: "missing" },
    slots,
  );
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /no longer available/);
});
test("urgent wording stops routine booking", () => {
  const r = practiceReply(
    "I have chest pain",
    { step: "slot", department: "cardiology" },
    slots,
  );
  assert.equal(r.proposal, undefined);
  assert.match(r.text, /emergency services/);
});
test("name containing a specialty word stays a name", () => {
  const r = practiceReply(
    "Heart Example",
    { step: "name", department: "dermatology", slotId: slots[0].id },
    slots,
  );
  assert.equal(r.proposal?.patientName, "Heart Example");
});
