import { cookies } from "next/headers";
import { z } from "zod";
import {
  equal,
  failure,
  HttpError,
  liveReady,
  sameOrigin,
  session,
  sign,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await session();
    if (!liveReady())
      throw new HttpError(
        503,
        "The AI receptionist is not configured yet. Please contact the demo host.",
      );
    const { code } = z
      .object({ code: z.string().max(100) })
      .parse(await req.json());
    if (!equal(code, process.env.DEMO_ACCESS_CODE!))
      throw new HttpError(401, "Incorrect demo access code.");
    const jar = await cookies();
    jar.set("careline-ai", sign({ id: user.id, exp: Date.now() + 1800000 }), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1800,
      path: "/",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
