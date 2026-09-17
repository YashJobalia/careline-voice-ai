import { HttpError } from "../http-error";
import type { Mutation, Visit } from "../workspace";
import { actorRole, contractFor } from "./actions";
import { appointmentState } from "./ontology";

export type SemanticActor = {
  id: string;
  guest?: boolean;
  role?: string;
  doctorId?: string;
};
export function assertActionRole(
  actor: SemanticActor,
  action: Mutation["action"],
) {
  if (!contractFor(action).roles.includes(actorRole(actor))) {
    if (actor.guest)
      throw new HttpError(401, "Create an account or sign in first.");
    if (action === "register")
      throw new HttpError(409, "You already have an account.");
    throw new HttpError(403, "Only doctors can request a patient reschedule.");
  }
}
/** Facts MUST come from permission-scoped server reads, never model arguments. */
export function assertActionFacts(
  actor: SemanticActor,
  action: Mutation,
  facts: {
    appointment?: Pick<
      Visit,
      "id" | "session_id" | "slot_id" | "status" | "slot"
    >;
    availableSlot?: { id: string; doctor_id: string; starts_at: string };
  },
  now = Date.now(),
) {
  assertActionRole(actor, action.action);
  const contract = contractFor(action.action);
  if (contract.requiresAppointment) {
    const visit = facts.appointment;
    if (!visit || !("id" in action) || action.id !== visit.id)
      throw new HttpError(404, "Appointment not found or not accessible.");
    const clinicAccess =
      actorRole(actor) === "doctor" &&
      ["clinic", "own_or_clinic"].includes(contract.access);
    if (!clinicAccess && visit.session_id !== actor.id)
      throw new HttpError(403, "Choose one of your own appointments.");
    if (contract.requiresUpcoming && !appointmentState(visit, now).changeable)
      throw new HttpError(
        409,
        "Only upcoming confirmed appointments can be changed.",
      );
  }
  if (contract.requiresSlot) {
    const slot = facts.availableSlot;
    if (
      !slot ||
      !("slotId" in action) ||
      slot.id !== action.slotId ||
      !Number.isFinite(Date.parse(slot.starts_at)) ||
      Date.parse(slot.starts_at) <= now
    )
      throw new HttpError(409, "That slot is no longer available.");
    if (slot.doctor_id === actor.doctorId)
      throw new HttpError(
        400,
        "You cannot book yourself. Choose another doctor.",
      );
    if (facts.appointment?.slot_id === slot.id)
      throw new HttpError(409, "Choose a different appointment time.");
  }
}
