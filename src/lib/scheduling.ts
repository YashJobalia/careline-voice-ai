import { db, HttpError, sign, type Session } from "./server";
import { doctorFor, type Appointment, type Slot } from "./clinic";
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
) {
  const slots = await availableSlots();
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new HttpError(409, "This slot is no longer available.");
  return {
    slot,
    patientName,
    token: sign({
      slotId,
      patientName,
      sessionId: visitor.id,
      exp: Date.now() + 10 * 60 * 1000,
    }),
  };
}
export async function appointments(visitor: string) {
  const rows = await db<
    (Omit<Appointment, "slot"> & { careline_slots: Slot })[]
  >(
    `careline_appointments?select=id,slot_id,patient_name,created_at,status,careline_slots(id,doctor_id,starts_at)&session_id=eq.${encodeURIComponent(visitor)}&order=created_at.desc&limit=100`,
  );
  return rows.map(({ careline_slots, ...row }) => ({
    ...row,
    slot: careline_slots,
  }));
}
