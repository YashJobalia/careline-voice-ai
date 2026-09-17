import type { ActionReceipt, Mutation, Visit } from "./workspace";
import { doctors, formatSlot } from "./clinic";

export function makeReceipt(
  action: Mutation["action"],
  context: {
    id: string;
    slot?: Visit["slot"];
    reference?: string;
    previousSlot?: Visit["slot"];
  },
): ActionReceipt {
  const titles: Record<Mutation["action"], string> = {
    reset_password: "Password reset requested",
    register: "Account created",
    book: "Appointment booked",
    reschedule: "Appointment rescheduled",
    cancel: "Appointment cancelled",
    request_reschedule: "Rescheduling requested",
    update_profile: "Account details updated",
    change_password: "Password changed",
    clear_history: "Conversation history cleared",
    signout: "Signed out",
  };
  const fields: ActionReceipt["fields"] = [];
  if (context.reference)
    fields.push({ label: "Reference", value: context.reference });
  if (context.slot) {
    fields.push({
      label: "Doctor",
      value:
        doctors.find((d) => d.id === context.slot!.doctor_id)?.name ||
        "Your specialist",
    });
    fields.push({
      label: action === "reschedule" ? "New time" : "Appointment",
      value: formatSlot(context.slot),
    });
    fields.push({ label: "Time zone", value: "America/Chicago" });
  }
  if (context.previousSlot)
    fields.push({
      label: "Previous time",
      value: formatSlot(context.previousSlot),
    });
  const summary =
    action === "request_reschedule"
      ? "The request is visible in the patient's appointments. The existing slot stays reserved. No email or SMS was sent."
      : action === "update_profile"
        ? "Your profile changes have been saved."
        : action === "change_password"
          ? "Save your new password privately before leaving this page."
          : action === "cancel"
            ? "This appointment is cancelled and its slot has been released."
            : action === "book" || action === "reschedule"
              ? "Your appointment is confirmed. You can find it in My appointments."
              : titles[action] + ".";
  return { id: context.id, action, title: titles[action], summary, fields };
}
