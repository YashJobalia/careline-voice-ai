import { z } from "zod";
import { authorizeAI, failure, HttpError, sameOrigin } from "@/lib/server";
import { agentInstructions, workspaceTool } from "@/lib/workspace-agent";
import { history, saveHistory, workspaceAction } from "@/lib/workspace-server";
import type { ActionResult } from "@/lib/workspace";
import { decodeToolArguments } from "@/lib/workspace-tool";
import { replyLanguages } from "@/lib/voice-language";
import { actionActivity, type ActionActivity } from "@/lib/action-activity";
export const maxDuration = 60;
export async function POST(req: Request) {
  const effects: ActionResult[] = [];
  const traces: ActionActivity[] = [];
  const started = performance.now();
  try {
    sameOrigin(req);
    const user = await authorizeAI();
    const p = z
      .object({
        message: z.string().trim().min(1).max(3000),
        pendingToken: z.string().optional(),
        replyLanguage: z.enum(replyLanguages).default("English"),
      })
      .parse(await req.json());
    const previous = await history(user);
    const input: unknown[] = [
      ...previous.slice(-40),
      { role: "user", content: p.message },
    ];
    for (let round = 0; round < 8; round++) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          instructions:
            agentInstructions(user, p.replyLanguage) +
            (p.pendingToken
              ? `\nPending draft token from previous turn: ${p.pendingToken}`
              : ""),
          input,
          tools: [workspaceTool],
          parallel_tool_calls: false,
          max_output_tokens: 900,
          store: false,
        }),
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
      });
      if (!r.ok)
        throw new HttpError(
          502,
          "The assistant is unavailable. Try again or use the manual controls.",
        );
      const data = await r.json();
      input.push(...data.output);
      const calls = data.output.filter(
        (item: { type: string }) => item.type === "function_call",
      );
      if (!calls.length) {
        const text =
          data.output
            .flatMap(
              (item: { content?: { type: string; text?: string }[] }) =>
                item.content || [],
            )
            .filter((c: { type: string }) => c.type === "output_text")
            .map((c: { text: string }) => c.text)
            .join("")
            .replace(/[\u2013\u2014]/g, "-") || "Please try again.";
        if (!effects.some((e) => e.signedOut || e.clearedHistory))
          await saveHistory(user, [
            ...previous,
            { role: "user", content: p.message },
            { role: "assistant", content: text },
          ]);
        return Response.json(
          {
            text,
            effects,
            traces,
            totalMs: Math.round(performance.now() - started),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      for (const call of calls) {
        let output;
        let action = "";
        let args: Record<string, unknown> = {};
        const tick = performance.now();
        try {
          if (call.name !== "careline_action") throw new Error("Unknown tool");
          const a = decodeToolArguments(call.arguments);
          action = a.action;
          args = a.args;
          if (
            a.action === "confirm" &&
            (!p.pendingToken || a.token !== p.pendingToken)
          )
            throw new Error(
              "Ask the user to confirm an existing draft first. New drafts cannot be confirmed in the same turn.",
            );
          const effect = await workspaceAction(
            {
              action: a.action,
              args: a.args,
              token: a.token || undefined,
            },
            new URL(req.url).origin,
          );
          effects.push(effect);
          const { credentials, ...safe } = effect;
          output = {
            ...safe,
            ...(credentials ? { credentialsDeliveredPrivately: true } : {}),
          };
        } catch (e) {
          output = { error: e instanceof Error ? e.message : "Action failed" };
        }
        traces.push(
          actionActivity(
            action,
            args,
            output,
            performance.now() - tick,
            "text",
          ),
        );
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
    }
    throw new HttpError(
      502,
      "The assistant could not finish this request. Please try a shorter request.",
    );
  } catch (e) {
    // A model/network failure after a tool succeeds must not hide committed changes.
    if (effects.length)
      return Response.json(
        {
          text: "I could not finish the spoken or written explanation. Please review the action results shown on screen before trying again.",
          effects,
          traces,
          totalMs: Math.round(performance.now() - started),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    return failure(e);
  }
}
