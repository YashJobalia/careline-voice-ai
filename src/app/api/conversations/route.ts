import { z } from "zod";
import { session, failure, sameOrigin, HttpError } from "@/lib/server";
import { history, saveHistory } from "@/lib/workspace-server";
export async function GET() {
  try {
    return Response.json(
      { messages: await history(await session()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await session();
    const p = z
      .object({
        ownerId: z.uuid(),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(6000),
            }),
          )
          .max(200),
      })
      .parse(await req.json());
    if (p.ownerId !== user.id)
      throw new HttpError(403, "Conversation belongs to another session.");
    await saveHistory(user, p.messages);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
