import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test.skip(
  process.env.RUN_LIVE_WORKSPACE !== "1",
  "Opt in to hosted demo permission tests.",
);
test("database policies reject role escalation, foreign records and doctor self-booking", async () => {
  const make = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  const patient = make(),
    doctor = make();
  const { data: p, error: pe } = await patient.auth.signInWithPassword({
    email: "alex.demo@example.com",
    password: "CarelineDemo!2026",
  });
  expect(pe).toBeNull();
  const { data: d, error: de } = await doctor.auth.signInWithPassword({
    email: "maya.demo@example.com",
    password: "CarelineDemo!2026",
  });
  expect(de).toBeNull();
  const { data: profiles, error: profileError } = await patient
    .from("careline_patients")
    .select("*");
  expect(profileError).toBeNull();
  expect(profiles).toHaveLength(1);
  const escalation = await patient
    .from("careline_patients")
    .update({ account_type: "doctor", doctor_id: "ethan-brooks" })
    .eq("user_id", p.user!.id);
  expect(escalation.error).not.toBeNull();
  const spoof = await patient.auth.updateUser({
    data: { account_type: "doctor", role: "doctor", doctor_id: "ethan-brooks" },
  });
  expect(spoof.error).toBeNull();
  const { data: own } = await patient
    .from("careline_appointments")
    .select("session_id");
  expect(own!.every((r) => r.session_id === p.user!.id)).toBe(true);
  const { data: all } = await doctor
    .from("careline_appointments")
    .select("id,session_id");
  expect(all!.some((r) => r.session_id !== d.user!.id)).toBe(true);
  const { data: slots } = await doctor.rpc("careline_get_slots");
  const self = slots.find(
    (s: { doctor_id: string }) => s.doctor_id === "maya-shah",
  );
  const selfBooking = await doctor
    .from("careline_appointments")
    .insert({
      slot_id: self.id,
      session_id: d.user!.id,
      patient_name: "Dr. Maya Shah",
      notes: "Forbidden self visit",
    });
  expect(selfBooking.error?.code).toBe("23514");
  const foreignBooking = await patient
    .from("careline_appointments")
    .insert({
      slot_id: self.id,
      session_id: d.user!.id,
      patient_name: "Foreign patient",
    });
  expect(foreignBooking.error).not.toBeNull();
  const foreign = all!.find((v) => v.session_id !== p.user!.id)!;
  const cancelled = await patient.rpc("careline_manage_visit", {
    booking_id: foreign.id,
    operation: "cancel",
    reason: "Unauthorized",
  });
  expect(cancelled.error?.code).toBe("42501");
  const directHistory = await patient
    .from("careline_conversations")
    .upsert({ user_id: d.user!.id, messages: [] });
  expect(directHistory.error).not.toBeNull();
  const doctorHistory = await doctor
    .from("careline_conversations")
    .select("user_id");
  expect(doctorHistory.data!.every((r) => r.user_id === d.user!.id)).toBe(true);
  await patient.auth.updateUser({
    data: { account_type: null, role: null, doctor_id: null },
  });
  await Promise.all([patient.auth.signOut(), doctor.auth.signOut()]);
});
test("password can change manually and through a confirmed AI action", async ({
  playwright,
}) => {
  const c = await playwright.request.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  });
  await c.post("/api/auth", {
    data: {
      action: "signin",
      email: "robin.demo@example.com",
      password: "CarelineDemo!2026",
    },
  });
  const invalid = await c.post("/api/auth", {
    data: {
      action: "password",
      currentPassword: "Wrong-password!",
      password: "AnotherDemo!2026",
    },
  });
  expect(invalid.status()).toBe(400);
  const draft = await c.post("/api/workspace", {
    data: { action: "prepare", args: { action: "change_password" } },
  });
  expect(draft.status()).toBe(200);
  const token = (await draft.json()).pending.token;
  const changed = await c.post("/api/workspace", {
    data: { action: "confirm", token },
  });
  expect(changed.status(), await changed.text()).toBe(200);
  const generated = (await changed.json()).credentials.password;
  expect(generated.length).toBeGreaterThan(20);
  const restored = await c.post("/api/auth", {
    data: {
      action: "password",
      currentPassword: generated,
      password: "CarelineDemo!2026",
    },
  });
  expect(restored.status(), await restored.text()).toBe(200);
  await c.dispose();
});
