import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { decodeToolArguments } from "../src/lib/workspace-tool";

test("a model outage after a confirmed write still returns its receipt", async () => {
  const exports: Record<string, any> = {};
  let modelCalls = 0;
  const effect = {
    ok: true,
    receipt: { title: "Appointment booked", fields: [] },
  };
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/app/api/assistant/route.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const modules: Record<string, unknown> = {
    zod: { z },
    "@/lib/server": {
      sameOrigin() {},
      authorizeAI: async () => ({ id: "fixture" }),
      failure: () => Response.json({ error: "failed" }, { status: 500 }),
      HttpError: Error,
    },
    "@/lib/workspace-agent": {
      agentInstructions: () => "fixture",
      workspaceTool: {},
    },
    "@/lib/workspace-server": {
      history: async () => [],
      saveHistory: async () => {},
      workspaceAction: async () => effect,
    },
    "@/lib/workspace-tool": { decodeToolArguments },
    "@/lib/voice-language": { replyLanguages: ["English"] },
    "@/lib/action-activity": {
      actionActivity: () => ({ status: "completed" }),
    },
  };
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    Response,
    URL,
    AbortSignal,
    performance,
    process: { env: {} },
    fetch: async () =>
      ++modelCalls === 1
        ? Response.json({
            output: [
              {
                type: "function_call",
                name: "careline_action",
                call_id: "test",
                arguments: JSON.stringify({
                  action: "confirm",
                  args: {},
                  token: "approved",
                }),
              },
            ],
          })
        : new Response("unavailable", { status: 502 }),
  });
  const r = await exports.POST(
    new Request("http://localhost/api/assistant", {
      method: "POST",
      body: JSON.stringify({
        message: "Yes, confirm",
        pendingToken: "approved",
      }),
    }),
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.effects[0].receipt.title, "Appointment booked");
  assert.match(body.text, /review the action results/);
});
