import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { cookies } from "next/headers";
import { sign } from "@/lib/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if ("redirectType" in data && data.redirectType === "recovery" && data.user) {
        const { data: claims } = await supabase.auth.getClaims();
        if (!claims?.claims.session_id)
          return NextResponse.redirect(
            new URL("/reset-password?expired=1", url.origin),
          );
        (await cookies()).set(
          "careline-recovery",
          sign({
            kind: "recovery",
            userId: data.user.id,
            sessionId: claims.claims.session_id,
            exp: Date.now() + 10 * 60 * 1000,
          }),
          {
            httpOnly: true,
            secure: url.protocol === "https:",
            sameSite: "lax",
            path: "/",
            maxAge: 600,
          },
        );
        return NextResponse.redirect(
          new URL("/reset-password?step=complete", url.origin),
        );
      }
      return NextResponse.redirect(new URL("/", url.origin));
    }
  }
  return NextResponse.redirect(
    new URL("/reset-password?expired=1", url.origin),
  );
}
