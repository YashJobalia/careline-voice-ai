import { test, expect } from "@playwright/test";

test("guest registration requires consent, isolates drafts, and returns a booking code", async ({
  page,
  playwright,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start conversation" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(
    page.getByRole("button", { name: "Click to speak" }),
  ).toBeVisible();
  const draftResponse = await page.request.put("/api/registration", {
    data: { name: "Fictional Guest", dateOfBirth: "1995-06-15" },
  });
  expect(draftResponse.status(), await draftResponse.text()).toBe(200);
  const { registration } = await draftResponse.json();
  expect((await (await page.request.get("/api/auth")).json()).user).toBeNull();
  expect(
    (
      await page.request.post("/api/registration", {
        data: { token: registration.token, confirmed: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/registration", {
        data: { token: registration.token + "broken", confirmed: true },
      })
    ).status(),
  ).toBe(401);
  const other = await playwright.request.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  });
  await other.post("/api/session", { data: {} });
  expect(
    (
      await other.post("/api/registration", {
        data: { token: registration.token, confirmed: true },
      })
    ).status(),
  ).toBe(403);
  await other.dispose();
  // Exercise the consent UI while keeping this test independent of paid model output.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: {
        text: "Please review your fictional details and confirm.",
        registration,
        actions: [],
      },
    }),
  );
  await page
    .getByRole("textbox", { name: "Message the receptionist" })
    .fill("Please prepare my fictional patient account");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByRole("button", { name: "Confirm account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your demo patient account" }),
  ).toBeVisible();
  const auth = await (await page.request.get("/api/auth")).json();
  expect(auth.user?.patientId).toMatch(/^CL[A-F0-9]{32}$/);
  expect(
    (
      await page.request.post("/api/registration", {
        data: { token: registration.token, confirmed: true },
      })
    ).status(),
  ).toBe(409);
  const clinic = await (await page.request.get("/api/clinic")).json();
  const prepared = await (
    await page.request.put("/api/appointments", {
      data: { slotId: clinic.slots.at(-2).id, patientName: "Fictional Guest" },
    })
  ).json();
  await page.unroute("**/api/chat");
  await page.route("**/api/chat", route => route.fulfill({json:{text:"Please review the doctor and time you chose.",proposal:prepared.proposal,actions:[]}}));
  await page.getByRole("textbox",{name:"Message the receptionist"}).fill("I choose this doctor and time");
  await page.getByRole("button",{name:"Send message"}).click();
  const savedResponse = page.waitForResponse(r => r.url().endsWith("/api/appointments") && r.request().method() === "POST");
  await page.getByRole("button",{name:"Confirm appointment",exact:true}).click();
  const booked = await savedResponse;
  expect(booked.status()).toBe(201);
  const saved = await booked.json();
  expect(saved.code).toMatch(/^[A-Z]{2}\d{3}$/);
  await expect(page.getByRole("status")).toContainText(saved.code);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:"artifacts/guest-registration-mobile.png",fullPage:true});
  await page.request.post("/api/auth", { data: { action: "signout" } });
  const login = await page.request.post("/api/auth", {
    data: {
      action: "signin",
      email: auth.user.patientId,
      password: "Careline@123",
    },
  });
  expect(login.status()).toBe(200);
  const bookings = await (await page.request.get("/api/appointments")).json();
  expect(
    bookings.appointments.find((a: { id: string }) => a.id === saved.id)
      .appointment_code,
  ).toBe(saved.code);
  expect(
    (
      await page.request.delete("/api/appointments", { data: { id: saved.id } })
    ).status(),
  ).toBe(200);
});
