import { contractFor } from "./semantic/actions";
import { ontologyVersion } from "./semantic/ontology";
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
  const contract = contractFor(action);
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
  return {
    id: context.id,
    action,
    title: contract.title,
    summary: contract.summary,
    fields,
    semantic: {
      version: ontologyVersion,
      state: "completed",
      code: contract.outcome,
      entity: contract.entity,
    },
  };
}
