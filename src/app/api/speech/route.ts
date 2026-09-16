import { z } from "zod";
import {
  authorizeAI,
  failure,
  HttpError,
  liveReady,
  sameOrigin,
} from "@/lib/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await authorizeAI();
    if (!liveReady())
      throw new HttpError(503, "The AI receptionist is not configured yet.");
    if (Number(req.headers.get("content-length")) > 20000)
      throw new HttpError(413, "Speech text is too long.");
    const { text } = z
      .object({ text: z.string().trim().min(1).max(4000) })
      .parse(await req.json());
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: text,
        response_format: "mp3",
        instructions:
          "Speak as a warm, calm, approachable clinic receptionist. Use a natural conversational pace, gentle expression and brief pauses. Sound attentive and empathetic, never robotic, overly cheerful, theatrical or rushed. Read the provided words without adding anything. Pronounce doctors' names and appointment times clearly.",
      }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        "Voice playback is unavailable. You can still read and type messages.",
      );
    return new Response(await response.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
