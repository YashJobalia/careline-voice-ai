import { z } from "zod";
import { appointments, proposal, availableSlots } from "@/lib/scheduling";
import { assertActionFacts } from "@/lib/semantic/policy";
import { actionOutcome } from "@/lib/semantic/catalog";
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
    if (visitor.guest)
      throw new HttpError(
        403,
        "Confirm your patient registration before booking.",
      );
    return Response.json({ appointments: await appointments(visitor.id) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    if (visitor.guest)
      throw new HttpError(
        403,
        "Confirm your patient registration before booking.",
      );
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
    const visitor = await session();
    const { id } = z.object({ id: z.uuid() }).parse(await req.json());
    const visit = (await appointments(visitor.id)).find((v) => v.id === id);
    assertActionFacts(
      visitor,
      { action: "cancel", id, reason: "" },
      {
        appointment: visit ? { ...visit, session_id: visitor.id } : undefined,
      },
    );
    const cancelled = await db<boolean>("rpc/careline_cancel_booking", {
      method: "POST",
      body: JSON.stringify({ booking_id: id }),
    });
    if (!cancelled)
      throw new HttpError(
        409,
        "This appointment cannot be cancelled. Refresh your appointments.",
      );
    return Response.json({ ok: true, semantic: actionOutcome("cancel") });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    if (visitor.guest)
      throw new HttpError(
        403,
        "Confirm your patient registration before booking.",
      );
    const { token } = z
      .object({ token: z.string().max(2000) })
      .parse(await req.json());
    const p = verify<{
      slotId: string;
      patientName: string;
      sessionId: string;
      exp: number;
      kind?: string;
    }>(token);
    if (p.kind && p.kind !== "booking")
      throw new HttpError(
        400,
        "Use rescheduling confirmation for this proposal.",
      );
    if (p.sessionId !== visitor.id)
      throw new HttpError(403, "This booking belongs to another session.");
    assertActionFacts(
      visitor,
      {
        action: "book",
        slotId: p.slotId,
        notes: {
          concern: "Not provided",
          duration: "Not provided",
          severity: "Not provided",
          context: "",
        },
      },
      {
        availableSlot: (await availableSlots()).find((s) => s.id === p.slotId),
      },
    );
    const result = await db<{ id: string; appointment_code: string }[]>(
      "careline_appointments",
      {
        method: "POST",
        body: JSON.stringify({
          slot_id: p.slotId,
          patient_name: p.patientName,
          session_id: visitor.id,
        }),
      },
    );
    return Response.json(
      {
        id: result[0].id,
        code: result[0].appointment_code,
        semantic: actionOutcome("book"),
      },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const visitor = await session();
    if (visitor.guest) throw new HttpError(403, "Sign in to reschedule.");
    const { token } = z
      .object({ token: z.string().max(2000) })
      .parse(await req.json());
    const p = verify<{
      kind: string;
      sessionId: string;
      replacesId: string;
      oldSlotId: string;
      slotId: string;
      exp: number;
    }>(token);
    if (p.kind !== "reschedule" || p.sessionId !== visitor.id)
      throw new HttpError(403, "Invalid rescheduling confirmation.");
    const [visits, slots] = await Promise.all([
      appointments(visitor.id),
      availableSlots(),
    ]);
    const visit = visits.find((v) => v.id === p.replacesId);
    assertActionFacts(
      visitor,
      { action: "reschedule", id: p.replacesId, slotId: p.slotId },
      {
        appointment: visit ? { ...visit, session_id: visitor.id } : undefined,
        availableSlot: slots.find((s) => s.id === p.slotId),
      },
    );
    if (visit!.slot_id !== p.oldSlotId)
      throw new HttpError(
        409,
        "The appointment changed. Review a new rescheduling proposal.",
      );
    const rows = await db<{ id: string; appointment_code: string }[]>(
      "rpc/careline_reschedule_booking",
      {
        method: "POST",
        body: JSON.stringify({
          booking_id: p.replacesId,
          old_slot_id: p.oldSlotId,
          new_slot_id: p.slotId,
        }),
      },
    );
    if (!rows[0])
      throw new HttpError(
        409,
        "Could not move this appointment. Your original appointment is unchanged.",
      );
    return Response.json({
      id: rows[0].id,
      code: rows[0].appointment_code,
      semantic: actionOutcome("reschedule"),
    });
  } catch (error) {
    return failure(error);
  }
}
