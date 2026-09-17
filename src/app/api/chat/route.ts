import { z } from "zod";
import {
  authorizeAI,
  failure,
  HttpError,
  sameOrigin,
  sign,
  verify,
} from "@/lib/server";
import { availableSlots, proposal, appointments } from "@/lib/scheduling";
import { runConversation } from "@/lib/conversation-engine";
import {
  languageSchema,
  preferenceSchema,
  type Preferences,
} from "@/lib/conversation";

export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await authorizeAI();
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 60000)
      throw new HttpError(413, "Conversation is too long. Start a new call.");
    const body = z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(1500),
            }),
          )
          .min(1)
          .max(24),
        language: languageSchema.default("auto"),
        memoryToken: z.string().max(4000).optional(),
        interrupted: z.boolean().default(false),
      })
      .parse(JSON.parse(raw));
    let preferences: Preferences | undefined;
    if (body.memoryToken) {
      const memory = verify<{
        kind: string;
        userId: string;
        preferences: Preferences;
        exp: number;
      }>(body.memoryToken);
      if (memory.kind !== "conversation" || memory.userId !== user.id)
        throw new HttpError(403, "Conversation belongs to another session.");
      preferences = preferenceSchema.parse(memory.preferences);
    }
    const result = await runConversation(
      body.messages,
      {
        user,
        availableSlots,
        proposal: (slotId, patientName, replacesId) =>
          proposal(slotId, patientName, user, replacesId),
        appointments: () => appointments(user.id),
        prepareRegistration: async (details) => ({
          ...details,
          token: sign({
            ...details,
            kind: "registration",
            userId: user.id,
            exp: Date.now() + 10 * 60 * 1000,
          }),
        }),
      },
      {
        preferences,
        language: body.language,
        interrupted: body.interrupted,
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(55000)]),
      },
    );
    return Response.json(
      {
        ...result,
        memoryToken: sign({
          kind: "conversation",
          userId: user.id,
          preferences: result.preferences,
          exp: Date.now() + 2 * 60 * 60 * 1000,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof SyntaxError)
      return failure(new HttpError(400, "Send a valid conversation request."));
    return failure(error);
  }
}
