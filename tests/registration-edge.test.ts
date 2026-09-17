import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const details = {
  name: "Alex Demo",
  dateOfBirth: "1990-05-12",
  email: "alex@example.com",
  phone: "+13125550101",
  confirmed: true,
};
function fixture(
  options: { insertError?: boolean; updateError?: boolean } = {},
) {
  const written: {
    profile?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    deleted?: boolean;
  } = {};
  let handler: (req: Request) => Promise<Response>;
  const admin = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            is_anonymous: true,
          },
        },
      }),
      admin: {
        updateUserById: async (_id: string, value: Record<string, unknown>) => {
          written.credentials = value;
          return { error: options.updateError ? {} : null };
        },
      },
    },
    from: () => ({
      insert: async (value: Record<string, unknown>) => {
        written.profile = value;
        return { error: options.insertError ? {} : null };
      },
      delete: () => ({
        eq: async () => {
          written.deleted = true;
        },
      }),
    }),
  };
  const source = readFileSync(
    new URL("../supabase/functions/register-patient/index.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\s*/m, "");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  runInNewContext(js, {
    Deno: {
      env: { get: () => "fixture" },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    createClient: () => admin,
    Response,
    crypto,
    Uint8Array,
    Date,
  });
  return {
    written,
    call: (body: unknown) =>
      handler(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: {
            Authorization: "Bearer fixture",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
  };
}
test("registration rejects missing contacts and short manually supplied passwords", async () => {
  for (const body of [
    { ...details, email: undefined },
    { ...details, phone: undefined },
    { ...details, password: "short" },
  ]) {
    const f = fixture();
    assert.equal((await f.call(body)).status, 400);
    assert.equal(f.written.profile, undefined);
  }
});
test("AI registration generates unique passwords and preserves the guest identity", async () => {
  const a = fixture(),
    b = fixture();
  const ar = await (await a.call(details)).json(),
    br = await (
      await b.call({ ...details, email: "robin@example.com" })
    ).json();
  assert.ok(ar.password.length >= 32);
  assert.notEqual(ar.password, br.password);
  assert.equal(
    a.written.profile?.user_id,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(a.written.profile?.account_type, "patient");
  assert.equal(a.written.profile?.phone, details.phone);
  assert.equal(ar.email, details.email);
});
test("manual password is honored and caller-supplied doctor roles are ignored", async () => {
  const f = fixture();
  const r = await (
    await f.call({
      ...details,
      password: "MyChosenPassword!123",
      account_type: "doctor",
      doctor_id: "maya-shah",
    })
  ).json();
  assert.equal(r.password, "MyChosenPassword!123");
  assert.equal(f.written.profile?.account_type, "patient");
  assert.equal(f.written.profile?.doctor_id, undefined);
});
test("failed auth upgrade compensates the profile insert", async () => {
  const f = fixture({ updateError: true });
  assert.equal((await f.call(details)).status, 409);
  assert.equal(f.written.deleted, true);
  const duplicate = fixture({ insertError: true });
  assert.equal((await duplicate.call(details)).status, 409);
  assert.equal(duplicate.written.credentials, undefined);
});
