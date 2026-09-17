import { test, expect, type APIRequestContext } from "@playwright/test";
test.skip(
  process.env.RUN_LIVE_WORKSPACE !== "1",
  "Opt in to hosted demo integration tests.",
);
test("real accounts enforce roles, ownership, notes, rescheduling and private memory", async ({
  playwright,
}) => {
  test.setTimeout(120000);
  const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const contexts: APIRequestContext[] = [];
  async function login(email: string) {
    const c = await playwright.request.newContext({ baseURL });
    contexts.push(c);
    const r = await c.post("/api/auth", {
      data: { action: "signin", email, password: "CarelineDemo!2026" },
    });
    expect(r.status(), await r.text()).toBe(200);
    return c;
  }
  const patient = await login("alex.demo@example.com"),
    other = await login("robin.demo@example.com"),
    doctor = await login("maya.demo@example.com");
  async function action(
    c: APIRequestContext,
    action: string,
    args?: unknown,
    token?: string,
  ) {
    return c.post("/api/workspace", { data: { action, args, token } });
  }
  async function prepare(c: APIRequestContext, args: unknown) {
    const r = await action(c, "prepare", args);
    expect(r.status(), await r.text()).toBe(200);
    return (await r.json()).pending.token as string;
  }
  const me = (await (await patient.get("/api/auth")).json()).user;
  expect(
    (await action(patient, "list_appointments", { scope: "clinic" })).status(),
  ).toBe(403);
  expect((await action(patient, "navigate", { page: "doctor" })).status()).toBe(
    403,
  );
  const clinic = (
    await (
      await action(doctor, "list_appointments", { scope: "clinic" })
    ).json()
  ).appointments;
  expect(clinic.length).toBeGreaterThanOrEqual(4);
  expect(
    clinic.some((v: { notes: string }) => v.notes.includes("Skin irritation")),
  ).toBe(true);
  const slots = (await (await patient.get("/api/clinic")).json()).slots;
  const ownDoctorSlot = slots.find(
    (s: { doctor_id: string }) => s.doctor_id === "maya-shah",
  );
  const notes = {
    concern: "Integration fixture",
    duration: "Two days",
    severity: "Mild",
    context: "Automated fictional test",
  };
  expect(
    (
      await action(doctor, "prepare", {
        action: "book",
        slotId: ownDoctorSlot.id,
        notes,
      })
    ).status(),
  ).toBe(400);
  const selected = slots
    .filter((s: { doctor_id: string }) => s.doctor_id === "oliver-chen")
    .slice(-2);
  const draft = await prepare(patient, {
    action: "book",
    slotId: selected[0].id,
    notes,
  });
  expect((await action(other, "confirm", undefined, draft)).status()).toBe(403);
  expect(
    (await action(patient, "confirm", undefined, draft + "tamper")).status(),
  ).toBe(401);
  const booked = await action(patient, "confirm", undefined, draft);
  expect(booked.status(), await booked.text()).toBe(200);
  const all = (
    await (await action(patient, "list_appointments", { scope: "mine" })).json()
  ).appointments;
  const visit = all.find(
    (v: { slot_id: string }) => v.slot_id === selected[0].id,
  );
  expect(JSON.parse(visit.notes)).toEqual(notes);
  expect(
    (
      await action(other, "prepare", { action: "cancel", id: visit.id })
    ).status(),
  ).toBe(404);
  expect(
    (
      await action(patient, "prepare", {
        action: "request_reschedule",
        id: visit.id,
      })
    ).status(),
  ).toBe(403);
  const request = await prepare(doctor, {
    action: "request_reschedule",
    id: visit.id,
    reason: "Demo schedule change",
  });
  expect((await action(doctor, "confirm", undefined, request)).status()).toBe(
    200,
  );
  const requested = (
    await (await action(patient, "list_appointments", { scope: "mine" })).json()
  ).appointments.find((v: { id: string }) => v.id === visit.id);
  expect(requested.reschedule_requested).toBe(true);
  expect(requested.status).toBe("confirmed");
  const move = await prepare(patient, {
    action: "reschedule",
    id: visit.id,
    slotId: selected[1].id,
  });
  expect((await action(patient, "confirm", undefined, move)).status()).toBe(
    200,
  );
  const moved = (
    await (await action(patient, "list_appointments", { scope: "mine" })).json()
  ).appointments.find((v: { id: string }) => v.id === visit.id);
  expect(moved.slot_id).toBe(selected[1].id);
  expect(moved.reschedule_requested).toBe(false);
  expect(moved.notes).toBe(visit.notes);
  const cancel = await prepare(doctor, {
    action: "cancel",
    id: visit.id,
    reason: "Integration test cleanup",
  });
  expect((await action(doctor, "confirm", undefined, cancel)).status()).toBe(
    200,
  );
  const oldHistory = await (await patient.get("/api/conversations")).json();
  expect(
    (
      await patient.post("/api/conversations", {
        data: {
          ownerId: me.id,
          messages: [{ role: "user", content: "Private integration marker" }],
        },
      })
    ).status(),
  ).toBe(200);
  expect((await other.get("/api/conversations")).status()).toBe(200);
  expect(
    JSON.stringify(await (await other.get("/api/conversations")).json()),
  ).not.toContain("Private integration marker");
  expect(
    (
      await other.post("/api/conversations", {
        data: { ownerId: me.id, messages: [] },
      })
    ).status(),
  ).toBe(403);
  await patient.post("/api/conversations", {
    data: { ownerId: me.id, messages: oldHistory.messages },
  });
  const signedOut = await prepare(patient, { action: "signout" });
  expect(
    (await action(patient, "confirm", undefined, signedOut)).status(),
  ).toBe(200);
  expect((await (await patient.get("/api/auth")).json()).user).toBeNull();
  await Promise.all(contexts.map((c) => c.dispose()));
});
