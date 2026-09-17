import { db, HttpError, sign, type Session } from "./server";
import { doctorFor, type Appointment, type Slot } from "./clinic";
import { assertActionFacts } from "./semantic/policy";
import { appointmentState } from "./semantic/ontology";
export async function availableSlots(department?: string, doctorId?: string) {
  const slots = await db<Slot[]>("rpc/careline_get_slots", {
    method: "POST",
    body: "{}",
  });
  return slots.filter(
    (s) =>
      (!department || doctorFor(s.doctor_id)?.department === department) &&
      (!doctorId || s.doctor_id === doctorId),
  );
}
export async function proposal(
  slotId: string,
  patientName: string,
  visitor: Session,
  replacesId?: string,
) {
  if (visitor.guest)
    throw new HttpError(403, "Confirm your patient registration first.");
  const slots = await availableSlots();
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new HttpError(409, "This slot is no longer available.");
  const replaces = replacesId
    ? (await appointments(visitor.id)).find(
        (a) => a.id === replacesId && appointmentState(a).changeable,
      )
    : undefined;
  if (replacesId && !replaces)
    throw new HttpError(409, "The original appointment cannot be rescheduled.");
  assertActionFacts(
    visitor,
    replacesId
      ? { action: "reschedule", id: replacesId, slotId }
      : {
          action: "book",
          slotId,
          notes: {
            concern: "Not provided",
            duration: "Not provided",
            severity: "Not provided",
            context: "",
          },
        },
    {
      availableSlot: slot,
      appointment: replaces
        ? { ...replaces, session_id: visitor.id }
        : undefined,
    },
  );
  return {
    slot,
    patientName,
    ...(replaces ? { replaces: { id: replaces.id, slot: replaces.slot } } : {}),
    token: sign({
      kind: replaces ? "reschedule" : "booking",
      slotId,
      patientName,
      sessionId: visitor.id,
      ...(replaces
        ? { replacesId: replaces.id, oldSlotId: replaces.slot_id }
        : {}),
      exp: Date.now() + 10 * 60 * 1000,
    }),
  };
}
export async function appointments(visitor: string) {
  const rows = await db<
    (Omit<Appointment, "slot"> & { careline_slots: Slot })[]
  >(
    `careline_appointments?select=id,slot_id,patient_name,created_at,status,appointment_code,careline_slots(id,doctor_id,starts_at)&session_id=eq.${encodeURIComponent(visitor)}&order=created_at.desc&limit=100`,
  );
  return rows.map(({ careline_slots, ...row }) => ({
    ...row,
    slot: careline_slots,
  }));
}
