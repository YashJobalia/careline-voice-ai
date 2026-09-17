import { test } from "node:test";
import assert from "node:assert/strict";
import { sign, verify } from "../src/lib/server";

test("signed confirmations reject suffixes that could bypass replay hashes", () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-only-secret-not-for-real-use";
  try {
    const token = sign({ kind: "workspace", exp: Date.now() + 10000 });
    assert.equal(verify<{ kind: string }>(token).kind, "workspace");
    assert.throws(() => verify(token + ".extra"));
    assert.throws(() => verify(token + "."));
    assert.throws(() => verify(sign({ exp: Date.now() - 1000 })));
  } finally {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  }
});
