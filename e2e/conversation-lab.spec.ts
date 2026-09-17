import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth", (r) =>
    r.fulfill({ json: { user: null, liveReady: true } }),
  );
  await page.route("**/api/clinic", (r) =>
    r.fulfill({ json: { slots: [], liveReady: true } }),
  );
});

test("language, source cards, memory and diagnostics flow through the UI", async ({
  page,
}) => {
  let round = 0;
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.language).toBe("es");
    if (round++) expect(body.memoryToken).toBe("signed-preferences");
    await route.fulfill({
      json: {
        text: "La clínica abre de lunes a viernes.",
        actions: ["Read clinic reference documents"],
        memoryToken: "signed-preferences",
        preferences: {
          department: "dermatology",
          doctorId: null,
          date: null,
          dateTo: null,
          afterHour: 14,
          beforeHour: null,
        },
        sources: [
          {
            id: "hours",
            title: "Hours and scheduling",
            href: "/clinic-guide#hours",
            text: "Weekdays",
          },
        ],
        diagnostics: {
          requestId: "test-request",
          model: "fixture",
          totalMs: 120,
          inputTokens: 100,
          outputTokens: 20,
          estimatedModelCostUsd: null,
          traces: [
            { name: "search_clinic_knowledge", durationMs: 2, status: "ok" },
          ],
        },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Conversation language").selectOption("es");
  await page.getByLabel("Message the receptionist").fill("¿Cuándo abre?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("link", { name: "Source: Hours and scheduling" }),
  ).toBeVisible();
  await page.getByText("Developer view · 1 measured turns").click();
  await expect(
    page.getByText("Scheduling memory:", { exact: false }),
  ).toContainText("afterHour: 14");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export diagnostics" }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const report = Buffer.concat(chunks).toString();
  expect(report).toContain("test-request");
  expect(report).not.toContain("signed-preferences");
  expect(report).not.toContain("Cuándo");
  await page.getByLabel("Message the receptionist").fill("Gracias");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Developer view · 2 measured turns"),
  ).toBeVisible();
});

test("handoff is visibly a preview and fits a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/chat", (r) =>
    r.fulfill({
      json: {
        text: "I've prepared a demo preview.",
        actions: [],
        sources: [],
        handoff: {
          reason: "Referral",
          summary: "Caller needs referral details",
          unresolved: "Policy not specified",
          preferences: {},
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Message the receptionist").fill("Speak to a human");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "Staff-handoff preview" }),
  ).toBeVisible();
  await expect(
    page.getByText("No staff have been contacted.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/voice-upgrade-mobile.png",
    fullPage: true,
  });
});

test("a new turn immediately removes a stale registration confirmation", async ({
  page,
}) => {
  let round = 0;
  await page.route("**/api/chat", async (r) => {
    if (round++) await new Promise((resolve) => setTimeout(resolve, 500));
    await r.fulfill({
      json: {
        text: "Please review.",
        actions: [],
        ...(round === 1
          ? {
              registration: {
                name: "Test Person",
                dateOfBirth: "1990-01-01",
                token: "old-token",
              },
            }
          : {}),
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Message the receptionist").fill("Prepare my account");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm account", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Message the receptionist")
    .fill("Actually change the date");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm account", exact: true }),
  ).toHaveCount(0);
});

test("rescheduling uses PATCH only after explicit review", async ({ page }) => {
  let moves = 0;
  await page.route("**/api/appointments", (r) => {
    if (r.request().method() === "PATCH") {
      moves++;
      expect(r.request().postDataJSON().token).toBe("move-token");
      return r.fulfill({ json: { id: "test", code: "AB123" } });
    }
    return r.fulfill({ json: { appointments: [] } });
  });
  await page.route("**/api/chat", (r) =>
    r.fulfill({
      json: {
        text: "Please review your move.",
        actions: [],
        proposal: {
          patientName: "Test Person",
          token: "move-token",
          slot: {
            id: "new",
            doctor_id: "maya-shah",
            starts_at: "2030-05-15T20:00:00Z",
          },
          replaces: {
            id: "old",
            slot: {
              id: "previous",
              doctor_id: "maya-shah",
              starts_at: "2030-05-14T20:00:00Z",
            },
          },
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Message the receptionist").fill("Move my appointment");
  await page.getByRole("button", { name: "Send message" }).click();
  const confirm = page.getByRole("button", {
    name: "Confirm reschedule",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  expect(moves).toBe(0);
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("AB123");
  expect(moves).toBe(1);
});
