import { test, expect } from "@playwright/test";
const account = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Dr. Maya Shah",
  email: "maya@example.com",
  phone: "+13125550101",
  dateOfBirth: "1985-06-12",
  role: "doctor",
  doctorId: "maya-shah",
};
const slot = {
  id: "22222222-2222-4222-8222-222222222222",
  doctor_id: "oliver-chen",
  starts_at: "2026-10-14T16:00:00Z",
};
test("AI activity shows an empty state then real result summaries", async ({ page }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: {
    text: "Here are the available appointments.", effects: [], totalMs: 1400,
    traces: [
      { label: "Check available times", detail: "3 available times returned.", status: "completed", source: "text", durationMs: 240 },
      { label: "Book an appointment", detail: "Draft ready. Waiting for your confirmation before saving.", status: "review", source: "text", durationMs: 125 },
      { label: "Apply confirmed changes", detail: "Could not complete this action. See Mira's reply for the next step.", status: "failed", source: "voice", durationMs: 1100 },
    ],
  } }));
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  await page.getByText("Behind the scenes: how this voice AI works", { exact: true }).click();
  await expect(page.getByText("No actions yet", { exact: true })).toBeVisible();
  await page.getByLabel("Message the assistant").fill("Check appointments");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const activity = page.getByRole("list", { name: "Recent AI actions" });
  await expect(activity.getByRole("listitem")).toHaveCount(3);
  await expect(activity.getByText("3 available times returned.")).toBeVisible();
  await expect(activity.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await expect(activity.getByText("Unsuccessful", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await activity.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mira-activity-phone.png" });
});
test("language picker searches, has bounded scrolling and supports keyboard selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  const trigger = page.getByRole("button", {
    name: "Reply language",
    exact: true,
  });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Choose reply language" });
  await expect(panel).toBeVisible();
  const height = (await panel.boundingBox())!.height;
  expect(height).toBeLessThanOrEqual(370);
  expect(
    await page
      .getByRole("listbox", { name: "Languages" })
      .evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  const search = page.getByRole("combobox", { name: "Search languages" });
  await expect(search).toBeFocused();
  await search.fill("zzz-language");
  await expect(panel.getByRole("status")).toContainText(
    "No matching languages",
  );
  await search.fill("hindi");
  await expect(panel.getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(trigger).toHaveText("Hindi");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  await trigger.click();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await search.press("Escape");
  await expect(panel).toBeHidden();
});
const visit = {
  id: "33333333-3333-4333-8333-333333333333",
  slot_id: slot.id,
  session_id: account.id,
  patient_name: account.name,
  status: "confirmed",
  appointment_code: "AA123",
  notes: JSON.stringify({
    concern: "Fictional rash",
    duration: "Two days",
    severity: "Mild",
    context: "",
  }),
  reschedule_requested: true,
  reschedule_reason: "Doctor unavailable",
  cancellation_reason: null,
  slot,
};
test("guest sign-in preserves the task and keeps the password out of chat", async ({
  page,
}) => {
  let signedIn = false;
  const chatRequests: { message: string }[] = [];
  await page.route("**/api/auth", (route) => {
    if (route.request().method() === "POST") {
      signedIn = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: { user: signedIn ? { ...account, role: "patient" } : null },
    });
  });
  await page.route("**/api/assistant", (route) => {
    chatRequests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        text: signedIn
          ? "Here is your calendar."
          : "Enter your password privately to continue.",
        effects: signedIn
          ? []
          : [
              {
                authentication: {
                  email: "alex.demo@example.com",
                  originalRequest: "Show my September calendar",
                  returnTo: {
                    page: "appointments",
                    mode: "calendar",
                    month: "2026-09",
                  },
                },
                navigation: { page: "account", accountSection: "signin" },
              },
            ],
        traces: [],
        totalMs: 10,
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  await page
    .getByLabel("Message the assistant")
    .fill("Show my September calendar. My email is alex.demo@example.com");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "alex.demo@example.com",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("PrivatePassword123!");
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Password", { exact: true }) })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Continue your request" }),
  ).toContainText("Show my September calendar");
  await page.getByRole("button", { name: "Continue with Mira" }).click();
  await expect(
    page.getByText("Here is your calendar.", { exact: true }),
  ).toBeVisible();
  expect(chatRequests[1].message).toBe("Show my September calendar");
  expect(JSON.stringify(chatRequests)).not.toContain("PrivatePassword123!");
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth", (r) =>
    r.fulfill({ json: { user: account } }),
  );
  await page.route("**/api/clinic", (r) =>
    r.fulfill({
      json: {
        slots: [
          slot,
          {
            ...slot,
            id: "44444444-4444-4444-8444-444444444444",
            doctor_id: "maya-shah",
          },
        ],
      },
    }),
  );
  await page.route("**/api/conversations", (r) =>
    r.fulfill({
      json: {
        messages: [
          { role: "user", content: "Remember my fictional skin concern." },
          {
            role: "assistant",
            content: "We can discuss it when you are ready.",
          },
        ],
      },
    }),
  );
  await page.route("**/api/workspace", (r) => {
    const p = r.request().postDataJSON();
    return r.fulfill({
      json:
        p.action === "list_appointments"
          ? { appointments: [visit] }
          : p.action === "prepare"
            ? {
                pending: {
                  token: "signed-fixture",
                  summary: "Review change",
                  details: p.args,
                },
              }
            : { ok: true, message: "Changes saved." },
    });
  });
});
test("voice is the default, history restores, and replies default to English", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start voice conversation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Try the voice agent." }),
  ).toBeVisible();
  await expect(
    page.getByText("Remember my fictional skin concern."),
  ).toBeVisible();
  await expect(page.getByLabel("Conversation language")).toHaveCount(0);
  await expect(page.getByLabel("Reply language", { exact: true })).toHaveText(
    "English",
  );
  await expect(page.getByLabel("Pause before sending")).toHaveCount(0);
  await page
    .getByText("Behind the scenes: how this voice AI works", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3. Tools with your permissions" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Remember my fictional skin concern."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("reply selection is sent independently of the typed input language", async ({
  page,
}) => {
  let request: { replyLanguage?: string; message?: string } = {};
  await page.route("**/api/assistant", (route) => {
    request = route.request().postDataJSON();
    return route.fulfill({
      json: { text: "नमस्ते", effects: [], traces: [], totalMs: 10 },
    });
  });
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  await page.getByLabel("Reply language", { exact: true }).click();
  await page.getByRole("option", { name: "Hindi", exact: true }).click();
  await expect(page.getByLabel("Reply language", { exact: true })).toHaveText(
    "Hindi",
  );
  await page
    .getByLabel("Message the assistant")
    .fill("Hello, what can you do?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("नमस्ते", { exact: true })).toBeVisible();
  expect(request).toMatchObject({
    replyLanguage: "Hindi",
    message: "Hello, what can you do?",
  });
});
test("doctor calendar, patient notes, manual booking and self-booking exclusion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Doctor panel", exact: true }).click();
  await expect(page.getByText("AA123", { exact: true })).toBeVisible();
  await page.getByText("Visit notes", { exact: true }).click();
  await expect(page.getByText("Fictional rash", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Book as patient", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Doctor", exact: true })
    .selectOption("oliver-chen");
  await expect(
    dialog
      .getByRole("combobox", { name: "Doctor", exact: true })
      .locator('option[value="maya-shah"]'),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Available time", exact: true })
    .selectOption(slot.id);
  await dialog.getByLabel("Main concern").fill("Fictional rash");
  await dialog.getByLabel("How long has it been happening?").fill("Two days");
  await dialog.getByLabel("How severe is it?").fill("Mild");
  await dialog.getByRole("button", { name: "Review appointment" }).click();
  await expect(
    page.getByRole("region", { name: "Review action" }),
  ).toContainText("Fictional rash");
});
test("AI navigation changes the real calendar and account has password and logout", async ({
  page,
}) => {
  await page.route("**/api/assistant", (r) =>
    r.fulfill({
      json: {
        text: "Here is your October calendar.",
        effects: [
          {
            navigation: {
              page: "appointments",
              mode: "calendar",
              month: "2026-10",
            },
          },
        ],
        traces: [],
        totalMs: 100,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Message the assistant")
    .fill("Show my October calendar");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await expect(page.getByText("AA123", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page.getByText("Change password", { exact: true }).first().click();
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
