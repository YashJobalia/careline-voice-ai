import { test } from "node:test";
import assert from "node:assert/strict";
import { idleAction, explicitGoodbye } from "../src/lib/call-lifecycle";

test("silence gets one check-in and then an ending, never during speech or a tool", () => {
  assert.equal(idleAction(44_999, false, false), "wait");
  assert.equal(idleAction(45_000, false, false), "check_in");
  assert.equal(idleAction(29_999, true, false), "wait");
  assert.equal(idleAction(30_000, true, false), "end");
  assert.equal(idleAction(120_000, true, true), "wait");
});
test("explicit goodbyes do not match negation or quoted stories", () => {
  for (const text of [
    "Bye!",
    "Thanks, goodbye.",
    "Please hang up",
    "End this call",
    "That's all.",
  ])
    assert.equal(explicitGoodbye(text), true, text);
  for (const text of [
    "Don't hang up",
    "My doctor said goodbye",
    "Bye, can you also book me?",
    "What does hang up mean?",
  ])
    assert.equal(explicitGoodbye(text), false, text);
});
