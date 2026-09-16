import {
  failure,
  HttpError,
  liveReady,
  quota,
  sameOrigin,
  authorizeAI as session,
} from "@/lib/server";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    if (!liveReady())
      throw new HttpError(503, "The AI receptionist is not configured yet.");
    if (Number(req.headers.get("content-length")) > 3_500_000)
      throw new HttpError(
        413,
        "Recording is too large. Please keep it under 30 seconds.",
      );
    const data = await req.formData();
    const file = data.get("audio");
    if (
      !(file instanceof File) ||
      file.size > 3_000_000 ||
      !["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"].includes(
        file.type.split(";")[0],
      )
    )
      throw new HttpError(
        400,
        "Send a short audio recording in a supported format.",
      );
    await quota(visitor.id);
    const form = new FormData();
    form.set("file", file);
    form.set("model", "gpt-4o-mini-transcribe");
    form.set("language", "en");
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok)
      throw new HttpError(
        502,
        "Transcription failed. Please type your message or try again.",
      );
    const result = await response.json();
    return Response.json({ text: result.text });
  } catch (e) {
    return failure(e);
  }
}
