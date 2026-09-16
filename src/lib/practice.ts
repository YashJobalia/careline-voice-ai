import {
  departments,
  doctors,
  formatSlot,
  type Department,
  type Proposal,
  type Slot,
} from "./clinic";
export type PracticeState = {
  department?: Department;
  doctorId?: string;
  slotId?: string;
  patientName?: string;
  step: "department" | "doctor" | "slot" | "name" | "confirm";
};
export const initialPractice: PracticeState = { step: "department" };
export function practiceReply(
  input: string,
  state: PracticeState,
  slots: Slot[],
): {
  state: PracticeState;
  text: string;
  proposal?: Proposal;
  choices?: string[];
} {
  const text = input.trim();
  const lower = text.toLowerCase();
  let next = { ...state };
  if (
    /\b(emergency|chest pain|can't breathe|cannot breathe|suicid|stroke)\b/.test(
      lower,
    )
  )
    return {
      state: initialPractice,
      text: "This demo cannot assess urgent medical needs. If this may be an emergency, contact your local emergency services now. For other symptoms, please contact clinic staff.",
    };
  if (/\b(reset|start over|cancel)\b/.test(lower))
    return {
      state: initialPractice,
      text: "Let’s start again. Which department would you like?",
      choices: departments.map((d) => d.name),
    };
  const department = /dermatolog|\bskin\b|acne/.test(lower)
    ? "dermatology"
    : /cardiolog|\bheart\b/.test(lower)
      ? "cardiology"
      : /otorhinolaryng|\bent\b|\bear\b|\bnose\b|\bthroat\b/.test(lower)
        ? "ent"
        : undefined;
  if (
    department &&
    next.step !== "name" &&
    (next.step === "department" || next.department !== department)
  )
    next = { department, step: "doctor" };
  if (next.step === "department")
    return {
      state: next,
      text: "Please choose Cardiology, ENT, or Dermatology. For help choosing based on symptoms, please contact clinic staff.",
      choices: departments.map((d) => d.name),
    };
  const availableDoctors = doctors.filter(
    (d) => d.department === next.department,
  );
  const selected = availableDoctors.find(
    (d) =>
      lower.includes(d.name.toLowerCase()) ||
      lower.includes(d.name.split(" ").at(-1)!.toLowerCase()),
  );
  if (selected) {
    next.doctorId = selected.id;
    next.slotId = undefined;
    next.step = "slot";
  } else if (
    next.step === "doctor" &&
    /earliest|any|no preference|first available/.test(lower)
  ) {
    next.doctorId = undefined;
    next.step = "slot";
  }
  const matching = slots
    .filter(
      (s) =>
        availableDoctors.some((d) => d.id === s.doctor_id) &&
        (!next.doctorId || s.doctor_id === next.doctorId),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (next.step === "doctor")
    return {
      state: next,
      text: "Do you have a preferred physician, or would you like the earliest available appointment?",
      choices: [...availableDoctors.map((d) => d.name), "Earliest available"],
    };
  if (next.step === "slot") {
    const picked = matching.find(
      (s) =>
        text ===
        `${formatSlot(s)} · ${doctors.find((d) => d.id === s.doctor_id)?.name}`,
    );
    if (picked) {
      next.slotId = picked.id;
      next.step = "name";
      return {
        state: next,
        text: "What fictional name should I put on this demo appointment?",
      };
    }
    return {
      state: next,
      text: matching.length
        ? "Here are the next available appointments. Choose one below. Times are in the clinic’s Central time zone."
        : "There are no matching slots. Try another physician or start over.",
      choices: matching
        .slice(0, 4)
        .map(
          (s) =>
            `${formatSlot(s)} · ${doctors.find((d) => d.id === s.doctor_id)?.name}`,
        ),
    };
  }
  if (next.step === "name") {
    const name = text.replace(/^(my name is|i am|i'm|it's)\s+/i, "").trim();
    if (name.length < 2 || name.length > 60)
      return {
        state: next,
        text: "Please use a fictional name between 2 and 60 characters.",
      };
    const slot = slots.find((s) => s.id === next.slotId);
    if (!slot)
      return {
        state: { department: next.department, step: "doctor" },
        text: "That slot is no longer available. Please choose another physician.",
      };
    next = { ...next, patientName: name, step: "confirm" };
    return {
      state: next,
      text: `Please review your appointment for ${name} with ${doctors.find((d) => d.id === slot.doctor_id)?.name}, ${formatSlot(slot)}. Use Confirm appointment to finish.`,
      proposal: { slot, patientName: name },
    };
  }
  return {
    state: next,
    text: "Use Confirm appointment on the review card to book, or say “start over” to change the details.",
  };
}
