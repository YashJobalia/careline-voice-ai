import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { failure, HttpError, sameOrigin, session } from "@/lib/server";

export async function GET() {
  try {
    const user = await session();
    if (user.guest) throw new HttpError(401, "Sign in to sync appearance.");
    const client = await supabaseServer();
    const { data, error } = await client
      .from("careline_patients")
      .select("appearance")
      .eq("user_id", user.id)
      .single();
    if (error) throw new HttpError(503, "Could not load appearance.");
    return Response.json(
      { appearance: data.appearance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    const user = await session();
    if (user.guest) throw new HttpError(401, "Sign in to sync appearance.");
    const { appearance } = z
      .object({ appearance: z.enum(["system", "light", "dark"]) })
      .strict()
      .parse(await request.json());
    const client = await supabaseServer();
    const { data, error } = await client
      .from("careline_patients")
      .update({ appearance })
      .eq("user_id", user.id)
      .select("appearance")
      .single();
    if (error) throw new HttpError(503, "Could not save appearance.");
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
