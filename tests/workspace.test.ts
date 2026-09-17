import { test } from "node:test";
import assert from "node:assert/strict";
import { patientDetails } from "../src/lib/patient";
import { mutation, navigation } from "../src/lib/workspace";
import {
  decodeToolArguments,
  completedToolCalls,
} from "../src/lib/workspace-tool";
const details = {
  name: "Alex Demo",
  email: "alex@example.com",
  phone: "+13125550101",
  dateOfBirth: "1990-05-12",
};
test("voice and text tool arguments normalize to the same validated envelope", () => {
  const args = { page: "appointments", mode: "calendar", month: "2026-09" };
  assert.deepEqual(
    decodeToolArguments(JSON.stringify({ action: "navigate", args })),
    decodeToolArguments(
      JSON.stringify({
        action: "navigate",
        args: JSON.stringify(args),
        token: null,
      }),
    ),
  );
  assert.throws(() =>
    decodeToolArguments(
      JSON.stringify({ action: "navigate", args: "not JSON" }),
    ),
  );
  assert.throws(() =>
    decodeToolArguments(JSON.stringify({ action: "navigate", args: [] })),
  );
});
test("interrupted or incomplete voice responses cannot execute tool calls", () => {
  const call = {
    type: "function_call",
    name: "careline_action",
    call_id: "fixture",
    arguments: '{"action":"confirm","args":{}}',
  };
  for (const status of ["cancelled", "incomplete", "failed"]) {
    assert.deepEqual(
      completedToolCalls({
        type: "response.done",
        response: { status, output: [call] },
      }),
      [],
    );
  }
  assert.deepEqual(
    completedToolCalls({ type: "response.function_call_arguments.done" }),
    [],
  );
  assert.deepEqual(
    completedToolCalls({
      type: "response.done",
      response: { status: "completed", output: [call] },
    }),
    [call],
  );
});
test("registration requires DOB, email and an international phone", () => {
  assert.ok(patientDetails.safeParse(details).success);
  for (const key of ["dateOfBirth", "email", "phone"]) {
    const p = { ...details };
    delete p[key as keyof typeof p];
    assert.equal(patientDetails.safeParse(p).success, false);
  }
  assert.equal(
    patientDetails.safeParse({ ...details, phone: "555" }).success,
    false,
  );
  assert.equal(
    patientDetails.safeParse({ ...details, email: "not an email" }).success,
    false,
  );
});
test("booking intake cannot silently omit the concern, duration or severity", () => {
  const draft = {
    action: "book",
    slotId: crypto.randomUUID(),
    notes: {
      concern: "Skin irritation",
      duration: "Three days",
      severity: "Mild",
      context: "",
    },
  };
  assert.ok(mutation.safeParse(draft).success);
  assert.equal(
    mutation.safeParse({ ...draft, notes: { concern: "Skin irritation" } })
      .success,
    false,
  );
  assert.equal(
    mutation.safeParse({ ...draft, slotId: "guessed" }).success,
    false,
  );
});
test("navigation accepts calendar commands and rejects unknown pages and months", () => {
  assert.ok(
    navigation.safeParse({
      page: "appointments",
      mode: "calendar",
      month: "2026-09",
      filter: "past",
    }).success,
  );
  assert.equal(navigation.safeParse({ page: "admin" }).success, false);
  assert.equal(
    navigation.safeParse({ page: "doctor", month: "2026-13" }).success,
    false,
  );
});
test("user input cannot provision a doctor role or replace the profile email", () => {
  const parsed = mutation.parse({
    action: "register",
    ...details,
    account_type: "doctor",
    doctor_id: "maya-shah",
  });
  assert.equal("account_type" in parsed, false);
  const profile = mutation.parse({ action: "update_profile", ...details });
  assert.equal("email" in profile, false);
});
