import { z } from "zod";
import { appointments, proposal } from "@/lib/scheduling";
import {
  db,
  failure,
  HttpError,
  sameOrigin,
  session,
  verify,
} from "@/lib/server";
export async function GET() {
  try {
    const visitor = await session();
    return Response.json({ appointments: await appointments(visitor.id) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    const p = z
      .object({
        slotId: z.uuid(),
        patientName: z.string().trim().min(2).max(60),
      })
      .parse(await req.json());
    return Response.json({
      proposal: await proposal(p.slotId, p.patientName, visitor),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    await session();
    const { id } = z.object({ id: z.uuid() }).parse(await req.json());
    const cancelled = await db<boolean>("rpc/careline_cancel_booking", {
      method: "POST",
      body: JSON.stringify({ booking_id: id }),
    });
    if (!cancelled)
      throw new HttpError(
        409,
        "This appointment cannot be cancelled. Refresh your appointments.",
      );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    const { token } = z
      .object({ token: z.string().max(2000) })
      .parse(await req.json());
    const p = verify<{
      slotId: string;
      patientName: string;
      sessionId: string;
      exp: number;
    }>(token);
    if (p.sessionId !== visitor.id)
      throw new HttpError(403, "This booking belongs to another session.");
    const result = await db<{ id: string }[]>("careline_appointments", {
      method: "POST",
      body: JSON.stringify({
        slot_id: p.slotId,
        patient_name: p.patientName,
        session_id: visitor.id,
      }),
    });
    return Response.json({ id: result[0].id }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
