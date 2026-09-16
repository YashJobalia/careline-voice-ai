import { test, expect } from "@playwright/test";
import { formatSlot, type Slot } from "../src/lib/clinic";
import { readFileSync, existsSync } from "node:fs";

test("funded OpenAI guest conversation registers and books with a real code", async ({
  page,
}) => {
  test.skip(process.env.RUN_LIVE_AI_TESTS !== "1", "Paid API opt-in required");
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByRole("button", { name: "Start conversation" }).click();
  const input = page.getByRole("textbox", { name: "Message the receptionist" });
  const send = async (text: string) => {
    await input.fill(text);
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
      { timeout: 65000 },
    );
    await page.getByRole("button", { name: "Send message" }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    return body;
  };
  await send(
    "I am new. Please prepare a demo patient account. My fictional name is Jordan Demo and my date of birth is June 15, 1995.",
  );
  await page
    .getByRole("button", { name: "Confirm account", exact: true })
    .click({ timeout: 30000 });
  await expect(
    page.getByRole("heading", { name: "Your demo patient account" }),
  ).toBeVisible();
  await send(
    "I have had acne on my face for several months. It is a new visit. I would like a Dermatology consultation, please.",
  );
  const availability = await send(
    "Yes, Dermatology. I prefer Dr. Maya Shah. Please check her earliest available appointment.",
  );
  expect(availability.actions).toContain("Checked physician availability");
  const clinic = await (await page.request.get("/api/clinic")).json();
  const slot = clinic.slots.find(
    (s: Slot) => s.doctor_id === "maya-shah",
  ) as Slot;
  await send(
    `I choose Dr. Maya Shah on ${formatSlot(slot)}. Please prepare that appointment for Jordan Demo.`,
  );
  const confirmation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/appointments") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click({ timeout: 30000 });
  const response = await confirmation;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved.code).toMatch(/^[A-Z]{2}\d{3}$/);
  await expect(page.getByRole("status")).toContainText(saved.code);
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await expect(
    page.getByLabel("Appointment code").filter({ hasText: saved.code }),
  ).toBeVisible();
  expect(
    (
      await page.request.delete("/api/appointments", { data: { id: saved.id } })
    ).status(),
  ).toBe(200);
});

test("funded OpenAI transcribes a synthetic voice sample for a guest", async ({
  request,
}) => {
  test.skip(
    process.env.RUN_LIVE_AI_TESTS !== "1" ||
      !existsSync("artifacts/voice-test.wav"),
    "Paid API and synthetic sample required",
  );
  expect((await request.post("/api/session", { data: {} })).ok()).toBe(true);
  const response = await request.post("/api/transcribe", {
    multipart: {
      audio: {
        name: "voice-test.wav",
        mimeType: "audio/wav",
        buffer: readFileSync("artifacts/voice-test.wav"),
      },
    },
    timeout: 35000,
  });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(body.text).toMatch(/appointment|dermatolog|skin/i);
});
