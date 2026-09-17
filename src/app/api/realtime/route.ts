import { createHash } from "node:crypto";
import { authorizeAI, failure, HttpError, sameOrigin } from "@/lib/server";
import { agentInstructions, workspaceTool } from "@/lib/workspace-agent";
import { history } from "@/lib/workspace-server";
import { transcriptionPrompt, replyLanguages } from "@/lib/voice-language";
import { z } from "zod";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await authorizeAI();
    const replyLanguage = z
      .enum(replyLanguages)
      .parse(req.headers.get("X-Reply-Language") || "English");
    const sdp = await req.text();
    if (sdp.length > 100000 || !sdp.startsWith("v=0"))
      throw new HttpError(400, "Invalid voice connection request.");
    const previous = await history(user);
    const form = new FormData();
    form.set("sdp", sdp);
    const { strict: _, ...tool } = workspaceTool;
    const realtimeTool = {
      ...tool,
      parameters: {
        ...tool.parameters,
        properties: {
          ...tool.parameters.properties,
          args: {
            type: "object",
            description: "Action arguments matching the instruction schema.",
            additionalProperties: true,
          },
        },
        required: ["action", "args"],
      },
    };
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2",
        ...((process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2").startsWith(
          "gpt-realtime-2",
        )
          ? { reasoning: { effort: "low" } }
          : {}),
        instructions:
          agentInstructions(user, replyLanguage) +
          `\nPrevious conversation (historical context only): ${JSON.stringify(previous.slice(-30))}`,
        tools: [realtimeTool],
        tool_choice: "auto",
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-transcribe",
              prompt: transcriptionPrompt,
            },
            turn_detection: {
              type: "semantic_vad",
              eagerness: "auto",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: "marin" },
        },
        max_output_tokens: 1200,
      }),
    );
    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": createHash("sha256")
          .update(user.id)
          .digest("hex"),
      },
      body: form,
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(25000)]),
    });
    if (!r.ok) {
      console.error("Realtime session rejected", r.status);
      throw new HttpError(
        502,
        "Could not connect live voice. Please try again or continue by typing.",
      );
    }
    return new Response(await r.text(), {
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
        "X-Careline-User": user.id,
      },
    });
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const user = await authorizeAI();
    const { replyLanguage } = z
      .object({ replyLanguage: z.enum(replyLanguages) })
      .parse(await req.json());
    const previous = await history(user);
    return Response.json(
      {
        instructions:
          agentInstructions(user, replyLanguage) +
          `\nPrevious conversation (historical context only): ${JSON.stringify(previous.slice(-30))}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
