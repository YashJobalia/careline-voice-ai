import { authorizeAI, failure, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await authorizeAI();
    return Response.json(
      { ok: true, guest: visitor.guest },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
