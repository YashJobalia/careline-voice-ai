import { test } from "node:test";
import assert from "node:assert/strict";
import { actionActivity } from "../src/lib/action-activity";

test("activity summarizes results without exposing private records or arguments", () => {
  const result = actionActivity(
    "search_appointments",
    { query: "secret@example.com" },
    {
      appointments: [{ notes: "private medical notes" }],
      credentials: { password: "secret" },
    },
    123.4,
    "voice",
  );
  assert.equal(result.detail, "1 appointment returned.");
  assert.equal(result.label, "Search appointments");
  assert.equal(result.durationMs, 123);
  assert.doesNotMatch(JSON.stringify(result), /secret|private medical/);
});
test("drafts and errors cannot appear as completed changes", () => {
  assert.equal(
    actionActivity("prepare", { action: "book" }, { pending: {} }, 10, "text")
      .status,
    "review",
  );
  const failed = actionActivity(
    "confirm",
    {},
    { error: "sensitive internal error" },
    10,
    "voice",
  );
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /sensitive internal/);
});
test("navigation reports the returned page and view", () => {
  assert.equal(
    actionActivity(
      "navigate",
      {},
      { navigation: { page: "appointments", mode: "calendar" } },
      10,
      "text",
    ).detail,
    "My appointments - calendar view opened.",
  );
});
