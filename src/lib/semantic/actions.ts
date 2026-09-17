import type { Mutation } from "../workspace";
import type { Entity } from "./ontology";

export type ActorRole = "guest" | "patient" | "doctor";
type Contract = {
  entity: Entity;
  label: string;
  review: string;
  meaning: string;
  aliases: readonly string[];
  roles: readonly ActorRole[];
  outcome: string;
  title: string;
  summary: string;
  access: "self" | "own_appointment" | "own_or_clinic" | "clinic";
  requiresSlot?: boolean;
  requiresAppointment?: boolean;
  requiresUpcoming?: boolean;
};
export const actionContracts = {
  book: {
    entity: "appointment",
    label: "Book an appointment",
    review: "Review appointment booking",
    meaning: "Create a confirmed visit in a currently available slot.",
    aliases: ["book a visit", "schedule a consultation"],
    roles: ["patient", "doctor"],
    access: "self",
    requiresSlot: true,
    outcome: "appointment_booked",
    title: "Appointment booked",
    summary:
      "Your appointment is confirmed. You can find it in My appointments.",
  },
  reschedule: {
    entity: "appointment",
    label: "Reschedule appointment",
    review: "Review appointment reschedule",
    meaning:
      "Atomically move your own upcoming confirmed appointment to an available replacement slot; retain identity and notes.",
    aliases: ["move my appointment", "change my appointment time"],
    roles: ["patient", "doctor"],
    access: "own_appointment",
    requiresSlot: true,
    requiresAppointment: true,
    requiresUpcoming: true,
    outcome: "appointment_rescheduled",
    title: "Appointment rescheduled",
    summary:
      "Your appointment is confirmed. You can find it in My appointments.",
  },
  cancel: {
    entity: "appointment",
    label: "Cancel appointment",
    review: "Review cancellation",
    meaning:
      "Cancel an upcoming confirmed appointment and release its slot. Doctors may manage clinic appointments.",
    aliases: ["cancel my visit"],
    roles: ["patient", "doctor"],
    access: "own_or_clinic",
    requiresAppointment: true,
    requiresUpcoming: true,
    outcome: "appointment_cancelled",
    title: "Appointment cancelled",
    summary: "This appointment is cancelled and its slot has been released.",
  },
  request_reschedule: {
    entity: "appointment",
    label: "Request rescheduling",
    review: "Review rescheduling request",
    meaning:
      "Doctor requests that the patient arrange a different time. Existing slot remains reserved. This does not move the appointment.",
    aliases: ["ask the patient to reschedule"],
    roles: ["doctor"],
    access: "clinic",
    requiresAppointment: true,
    requiresUpcoming: true,
    outcome: "reschedule_requested",
    title: "Rescheduling requested",
    summary:
      "The request is visible in the patient's appointments. The existing slot stays reserved. No email or SMS was sent.",
  },
  message_doctor: {
    entity: "notes",
    label: "Leave message for doctor",
    review: "Review message for your appointment doctor",
    meaning:
      "Append a reviewed patient summary to own appointment notes. Not an urgent contact channel or delivery notification.",
    aliases: ["leave a message for my doctor"],
    roles: ["patient", "doctor"],
    access: "own_appointment",
    requiresAppointment: true,
    outcome: "doctor_message_saved",
    title: "Message left for doctor",
    summary:
      "Saved in the appointment notes for the doctor to review. No email or SMS was sent; this is not an urgent contact channel.",
  },
  register: {
    entity: "patient",
    label: "Create an account",
    review: "Create your patient account",
    meaning:
      "Upgrade the current guest to a patient account. Never grants doctor privileges.",
    aliases: ["create an account", "sign up"],
    roles: ["guest"],
    access: "self",
    outcome: "account_created",
    title: "Account created",
    summary: "Account created.",
  },
  update_profile: {
    entity: "patient",
    label: "Update account details",
    review: "Review account changes",
    meaning:
      "Update own supplied profile details; email and role cannot be changed here.",
    aliases: ["edit my profile"],
    roles: ["patient", "doctor"],
    access: "self",
    outcome: "profile_updated",
    title: "Account details updated",
    summary: "Your profile changes have been saved.",
  },
  reset_password: {
    entity: "patient",
    label: "Request password reset",
    review: "Request a password reset email",
    meaning:
      "Request a recovery email if the address has an account. Does not disclose account existence or guarantee delivery.",
    aliases: ["forgot my password"],
    roles: ["guest", "patient", "doctor"],
    access: "self",
    outcome: "password_reset_requested",
    title: "Password reset requested",
    summary: "Password reset requested.",
  },
  change_password: {
    entity: "patient",
    label: "Change password",
    review: "Generate a new password",
    meaning:
      "Generate an own-account password, delivered only through the private UI.",
    aliases: ["change my password"],
    roles: ["patient", "doctor"],
    access: "self",
    outcome: "password_changed",
    title: "Password changed",
    summary: "Save your new password privately before leaving this page.",
  },
  clear_history: {
    entity: "conversation",
    label: "Clear conversation history",
    review: "Permanently clear saved conversation",
    meaning: "Delete only the current user's saved conversation.",
    aliases: ["clear my chat"],
    roles: ["guest", "patient", "doctor"],
    access: "self",
    outcome: "history_cleared",
    title: "Conversation history cleared",
    summary: "Conversation history cleared.",
  },
  signout: {
    entity: "patient",
    label: "Sign out",
    review: "Sign out of your account",
    meaning: "End the current authenticated session.",
    aliases: ["log out"],
    roles: ["guest", "patient", "doctor"],
    access: "self",
    outcome: "signed_out",
    title: "Signed out",
    summary: "Signed out.",
  },
} as const satisfies Record<Mutation["action"], Contract>;
export type SemanticAction = keyof typeof actionContracts;
export function contractFor(action: SemanticAction): Contract {
  return actionContracts[action];
}
export function actorRole(actor: {
  guest?: boolean;
  role?: string;
}): ActorRole {
  return actor.guest ? "guest" : actor.role === "doctor" ? "doctor" : "patient";
}
export function permittedActions(actor: { guest?: boolean; role?: string }) {
  return (Object.keys(actionContracts) as SemanticAction[]).filter((action) =>
    contractFor(action).roles.includes(actorRole(actor)),
  );
}
/** Vocabulary lookup supplies candidates only. It never executes or authorizes a request. */
export function resolveActionTerm(term: string) {
  const normalized = term
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "");
  return (Object.keys(actionContracts) as SemanticAction[]).filter((action) => {
    const contract = contractFor(action);
    return [action, contract.label, ...contract.aliases].some(
      (alias) => alias.toLowerCase() === normalized,
    );
  });
}
