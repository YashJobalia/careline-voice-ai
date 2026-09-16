export const departments = [
  {
    id: "cardiology",
    name: "Cardiology",
    short: "Heart & cardiovascular",
    description: "Specialist consultations and existing cardiac follow-ups.",
    symbol: "♥",
  },
  {
    id: "ent",
    name: "Otorhinolaryngology",
    short: "Ear, nose & throat",
    description: "ENT consultations and hearing-related appointments.",
    symbol: "◉",
  },
  {
    id: "dermatology",
    name: "Dermatology",
    short: "Skin, hair & nails",
    description: "Skin consultations, acne care, and dermatology follow-ups.",
    symbol: "✧",
  },
] as const;
export type Department = (typeof departments)[number]["id"];
export const doctors = [
  {
    id: "maya-shah",
    name: "Dr. Maya Shah",
    department: "dermatology",
    title: "Consultant Dermatologist",
    initials: "MS",
  },
  {
    id: "oliver-chen",
    name: "Dr. Oliver Chen",
    department: "dermatology",
    title: "Consultant Dermatologist",
    initials: "OC",
  },
  {
    id: "amelia-reed",
    name: "Dr. Amelia Reed",
    department: "cardiology",
    title: "Consultant Cardiologist",
    initials: "AR",
  },
  {
    id: "arjun-patel",
    name: "Dr. Arjun Patel",
    department: "cardiology",
    title: "Consultant Cardiologist",
    initials: "AP",
  },
  {
    id: "sophia-morgan",
    name: "Dr. Sophia Morgan",
    department: "ent",
    title: "Consultant Otorhinolaryngologist",
    initials: "SM",
  },
  {
    id: "ethan-brooks",
    name: "Dr. Ethan Brooks",
    department: "ent",
    title: "Consultant Otorhinolaryngologist",
    initials: "EB",
  },
] as const;
export type Slot = { id: string; doctor_id: string; starts_at: string };
export type Appointment = {
  appointment_code?: string;
  id: string;
  slot_id: string;
  patient_name: string;
  created_at: string;
  slot: Slot;
  status: "confirmed" | "cancelled";
};
export type Proposal = { slot: Slot; patientName: string; token?: string };
export type Message = { role: "user" | "assistant"; content: string };
export const clinicTimezone = "America/Chicago";
export function formatSlot(slot: Slot) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: clinicTimezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(slot.starts_at));
}
export function doctorFor(id: string) {
  return doctors.find((d) => d.id === id);
}
export function practiceSlots(now = new Date()): Slot[] {
  const slots: Slot[] = [];
  for (let day = 1; day <= 7; day++) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day),
    );
    if ([0, 6].includes(date.getUTCDay())) continue;
    for (const doctor of doctors)
      for (const hour of [15, 17, 20, 21]) {
        const starts_at = new Date(
          date.getTime() + hour * 3600000,
        ).toISOString();
        slots.push({
          id: `practice-${doctor.id}-${starts_at}`,
          doctor_id: doctor.id,
          starts_at,
        });
      }
  }
  return slots;
}
export const greeting =
  "Hello, welcome to CareLine. I can help you find a doctor and book an appointment. For this demo, please use fictional details. Would you like me to help you create a patient account, or do you have a clinic question?";
