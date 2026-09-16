import { z } from "zod";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";
import {
  failure,
  HttpError,
  sameOrigin,
  session,
  liveReady,
} from "@/lib/server";
export async function GET() {
  try {
    return Response.json({ user: await session(), liveReady: liveReady() });
  } catch {
    return Response.json({ user: null, liveReady: liveReady() });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const p = z
      .object({
        action: z.enum(["signin", "signup", "signout", "profile"]),
        email: z.email().optional(),
        password: z.string().min(8).max(128).optional(),
        name: z.string().trim().min(2).max(60).optional(),
      })
      .parse(await req.json());
    const supabase = await supabaseServer();
    if (p.action === "signout") {
      await supabase.auth.signOut();
      (await cookies()).delete("careline-ai");
      return Response.json({ ok: true });
    }
    if (p.action === "profile") {
      await session();
      if (!p.name) throw new HttpError(400, "Enter a display name.");
      const { error } = await supabase.auth.updateUser({
        data: { display_name: p.name },
      });
      if (error) throw new HttpError(400, "Could not update your profile.");
      return Response.json({ ok: true });
    }
    if (!p.email || !p.password)
      throw new HttpError(400, "Enter an email and password.");
    const result =
      p.action === "signup"
        ? await supabase.auth.signUp({
            email: p.email,
            password: p.password,
            options: {
              data: { display_name: p.name || "Demo visitor" },
              emailRedirectTo: `${new URL(req.url).origin}/auth/callback`,
            },
          })
        : await supabase.auth.signInWithPassword({
            email: p.email,
            password: p.password,
          });
    if (result.error)
      throw new HttpError(
        result.error.status === 429 ? 429 : 400,
        p.action === "signin"
          ? "Could not sign in. Check your credentials and confirm your email."
          : "Could not create the account. Try again later or sign in if you already have an account.",
      );
    return Response.json({ ok: true, needsConfirmation: !result.data.session });
  } catch (e) {
    return failure(e);
  }
}
