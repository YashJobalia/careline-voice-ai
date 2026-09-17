import { passwordSchema } from "@/lib/password";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { makeReceipt } from "@/lib/action-receipt";
import { patientDetails } from "@/lib/patient";
import { authorizeAI } from "@/lib/server";
import { registerAccount } from "@/lib/workspace-server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";
import {
  failure,
  HttpError,
  sameOrigin,
  session,
  liveReady,
  db,
} from "@/lib/server";
export async function GET() {
  try {
    const visitor = await session();
    return Response.json({
      user: visitor.guest ? null : visitor,
      liveReady: liveReady(),
    });
  } catch {
    return Response.json({ user: null, liveReady: liveReady() });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.json();
    const p = z
      .object({
        action: z.enum(["signin", "signup", "signout", "profile", "password"]),
        email: z.string().trim().min(3).max(254).optional(),
        password: z.string().min(1).max(128).optional(),
        name: z.string().trim().min(2).max(60).optional(),
      })
      .parse(raw);
    const supabase = await supabaseServer();
    if (p.action === "signup") {
      const details = patientDetails.parse(raw);
      const password = passwordSchema.parse(raw.password);
      if (raw.confirmPassword !== undefined && password !== raw.confirmPassword)
        throw new HttpError(400, "Passwords do not match.");
      const visitor = await authorizeAI();
      if (!visitor.guest)
        throw new HttpError(409, "Sign out before creating another account.");
      return Response.json(await registerAccount(details, password), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (p.action === "password") {
      const visitor = await session();
      if (visitor.guest) throw new HttpError(401, "Sign in first.");
      const password = passwordSchema.parse(raw.password);
      if (raw.confirmPassword !== undefined && password !== raw.confirmPassword)
        throw new HttpError(400, "Passwords do not match.");
      const currentPassword = z
        .string()
        .min(1)
        .max(128)
        .parse(raw.currentPassword);
      // Verify explicitly: the hosted Auth version may ignore current_password.
      const { error: check } = await supabase.auth.signInWithPassword({
        email: visitor.email!,
        password: currentPassword,
      });
      if (check) throw new HttpError(400, "Current password is incorrect.");
      const { error } = await supabase.auth.updateUser({
        password,
      });
      if (error)
        throw new HttpError(
          400,
          "Could not change password. Check your current password and choose a different new password.",
        );
      return Response.json(
        {
          ok: true,
          receipt: {
            ...makeReceipt("change_password", { id: randomUUID() }),
            summary: "Your new password is now active.",
          },
          message: "Password changed.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (p.action === "signout") {
      await supabase.auth.signOut();
      (await cookies()).delete("careline-ai");
      return Response.json({ ok: true });
    }
    if (p.action === "profile") {
      const visitor = await session();
      if (visitor.guest) throw new HttpError(401, "Sign in first.");
      if (!p.name) throw new HttpError(400, "Enter a display name.");
      await db(`careline_patients?user_id=eq.${visitor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: p.name }),
      });
      return Response.json({ ok: true });
    }
    if (!p.email || !p.password)
      throw new HttpError(400, "Enter an email and password.");
    const loginEmail = p.email.includes("@")
      ? p.email
      : `${p.email.toLowerCase()}@patients.careline.invalid`;
    const result = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: p.password,
    });
    if (result.error)
      throw new HttpError(
        result.error.status === 429 ? 429 : 400,
        "Could not sign in. Check your email and password.",
      );
    return Response.json({ ok: true, needsConfirmation: !result.data.session });
  } catch (e) {
    return failure(e);
  }
}
