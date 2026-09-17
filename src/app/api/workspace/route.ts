import { authorizeAI, failure, sameOrigin } from "@/lib/server";
import { workspaceAction } from "@/lib/workspace-server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await authorizeAI();
    return Response.json(
      await workspaceAction(await req.json(), new URL(req.url).origin),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
