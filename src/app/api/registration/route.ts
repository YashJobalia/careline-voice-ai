import { z } from "zod";
import {
  authorizeAI,
  failure,
  HttpError,
  sameOrigin,
  sign,
  session,
  verify,
} from "@/lib/server";
import { supabaseServer } from "@/lib/supabase";
import { patientDetails } from "@/lib/patient";

export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    if (!visitor.guest)
      throw new HttpError(409, "You already have an account.");
    const details = patientDetails.parse(await req.json());
    return Response.json(
      {
        registration: {
          ...details,
          token: sign({
            ...details,
            kind: "registration",
            userId: visitor.id,
            exp: Date.now() + 600000,
          }),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await authorizeAI();
    if (!visitor.guest)
      throw new HttpError(409, "You already have an account.");
    const p = z
      .object({ token: z.string().max(2000), confirmed: z.literal(true) })
      .parse(await req.json());
    const draft = verify<{
      kind: string;
      name: string;
      dateOfBirth: string;
      userId: string;
      exp: number;
    }>(p.token);
    if (draft.kind !== "registration" || draft.userId !== visitor.id)
      throw new HttpError(
        403,
        "This registration belongs to another conversation.",
      );
    const details = patientDetails.parse(draft);
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getSession();
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-patient`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.session!.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...details, confirmed: true }),
        signal: AbortSignal.timeout(20000),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new HttpError(
        response.status,
        result.error || "Registration failed. Please try again.",
      );
    const { error } = await supabase.auth.signInWithPassword({
      email: result.email,
      password: result.password,
    });
    // Return credentials even if the automatic login fails, so registration is recoverable.
    return Response.json(
      {
        patientId: result.patientId,
        password: result.password,
        user: error ? null : await session(),
        needsSignIn: Boolean(error),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
