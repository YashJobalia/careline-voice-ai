import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import * as workspace from "../src/lib/workspace";
import * as policy from "../src/lib/semantic/policy";
import * as actions from "../src/lib/semantic/actions";
import * as ontology from "../src/lib/semantic/ontology";
import * as catalog from "../src/lib/semantic/catalog";
import * as receipts from "../src/lib/action-receipt";
import * as clinic from "../src/lib/clinic";
import * as patient from "../src/lib/patient";
import * as capabilities from "../src/lib/mira-capabilities";
import { HttpError } from "../src/lib/http-error";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/workspace-server.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const slot = {
  id: "22222222-2222-4222-8222-222222222222",
  doctor_id: "maya-shah",
  starts_at: "2099-01-02T16:00:00Z",
};
const details = {
  action: "book",
  slotId: slot.id,
  notes: {
    concern: "Follow-up",
    duration: "One week",
    severity: "Mild",
    context: "Patient reported",
  },
};

function harness() {
  const state = {
    available: true,
    writes: 0,
    claims: new Set<string>(),
    guest: false,
  };
  const modules: Record<string, unknown> = {
    zod: { z },
    "node:crypto": crypto,
    "./workspace": workspace,
    "./semantic/policy": policy,
    "./semantic/actions": actions,
    "./semantic/ontology": ontology,
    "./semantic/catalog": catalog,
    "./action-receipt": receipts,
    "./clinic": clinic,
    "./patient": patient,
    "./mira-capabilities": capabilities,
    "@supabase/supabase-js": {},
    "./supabase": {},
    "./password-recovery": {},
    "./scheduling": {
      availableSlots: async () => (state.available ? [slot] : []),
    },
    "./server": {
      HttpError,
      session: async () => ({
        id: "fixture-user",
        name: "Test Patient",
        role: "patient",
        guest: state.guest,
      }),
      sign: (value: unknown) => JSON.stringify(value),
      verify: (value: string) => JSON.parse(value),
      db: async (path: string, options?: { body?: string }) => {
        if (path === "rpc/careline_claim_confirmation") {
          const hash = JSON.parse(options!.body!).token_hash;
          if (state.claims.has(hash)) return false;
          state.claims.add(hash);
          return true;
        }
        if (path === "careline_appointments") {
          state.writes++;
          return [{ appointment_code: "TEST123" }];
        }
        throw new Error(`Unexpected database access: ${path}`);
      },
    },
  };
  const exports: Record<string, any> = {};
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    Date,
    Intl,
    process: { env: {} },
  });
  return {
    state,
    execute: exports.workspaceAction as (
      raw: unknown,
    ) => Promise<workspace.ActionResult>,
  };
}

test("actual workspace handler produces a draft without writes, executes once, and returns a semantic receipt", async () => {
  const { state, execute } = harness();
  const draft = await execute({ action: "prepare", args: details });
  assert.equal(draft.semantic?.code, "draft_prepared");
  assert.equal(state.writes, 0);
  const completed = await execute({
    action: "confirm",
    token: draft.pending!.token,
  });
  assert.equal(completed.receipt?.semantic?.code, "appointment_booked");
  assert.equal(state.writes, 1);
  await assert.rejects(
    execute({ action: "confirm", token: draft.pending!.token }),
    /already been attempted/,
  );
  assert.equal(state.writes, 1);
});

test("actual confirmation rejects stale availability, changed actor and old ontology before writes", async () => {
  const { state, execute } = harness();
  const draft = await execute({ action: "prepare", args: details });
  state.available = false;
  await assert.rejects(
    execute({ action: "confirm", token: draft.pending!.token }),
    /no longer available/,
  );
  state.available = true;
  state.guest = true;
  await assert.rejects(
    execute({ action: "confirm", token: draft.pending!.token }),
    /sign in/,
  );
  state.guest = false;
  const old = { ...JSON.parse(draft.pending!.token), ontologyVersion: "0.0.0" };
  await assert.rejects(
    execute({ action: "confirm", token: JSON.stringify(old) }),
    /rules changed/,
  );
  assert.equal(state.writes, 0);
  assert.equal(state.claims.size, 0);
});

test("guest ontology reads return definitions without querying records, and booking preparation opens authentication", async () => {
  const { state, execute } = harness();
  state.guest = true;
  const result = await execute({ action: "get_ontology" });
  assert.ok(result.ontology);
  assert.doesNotMatch(JSON.stringify(result.ontology), /fixture-user|TEST123/);
  const draft = await execute({ action: "prepare", args: details });
  assert.ok(draft.authentication);
  assert.equal(draft.pending, undefined);
  assert.equal(state.writes, 0);
});
