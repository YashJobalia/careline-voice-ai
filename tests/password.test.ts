import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordSchema } from "../src/lib/password";

test("new passwords accept both length boundaries and require every character class", () => {
  for (const value of ["Abcdef1!", "Abcdefghijklm12!"]) {
    assert.equal(passwordSchema.safeParse(value).success, true);
  }
  for (const value of [
    "Abcd1!x",
    "Abcdefghijklmn12!x",
    "abcdef1!",
    "ABCDEF1!",
    "Abcdefg!",
    "Abcdef12",
    "Abcdef1 ",
  ]) {
    assert.equal(passwordSchema.safeParse(value).success, false, value);
  }
});
