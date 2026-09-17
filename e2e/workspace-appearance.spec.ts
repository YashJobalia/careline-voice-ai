import { test, expect } from "@playwright/test";

test("guest appearance follows the system, persists, and syncs tabs", async ({ page, context }) => {
  await page.route("**/api/auth", r => r.fulfill({ json: { user: null } }));
  await page.route("**/api/clinic", r => r.fulfill({ json: { slots: [] } }));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: /Dark/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const second = await context.newPage();
  await second.goto("/");
  await page.getByRole("radio", { name: /Light/ }).check();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: /Dark/ }).check();
  await page.screenshot({ path: "artifacts/appearance-dark-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("radio", { name: /Dark/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/appearance-dark-mobile.png", fullPage: true });
  await second.close();
});

test("invalid and unavailable storage falls back to system", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();
  await page.getByRole("radio", { name: /Light/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByText("Applied for this visit. Browser storage is unavailable.")).toBeVisible();
});

test("live account preference crosses browser sessions and rejects invalid writes", async ({ browser, request }) => {
  test.skip(process.env.RUN_LIVE_WORKSPACE !== "1", "Opt in to hosted demo integration tests.");
  const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  let original = "system";
  try {
    for (const context of [first, second]) {
      const response = await context.request.post("/api/auth", { data: { action: "signin", email: "alex.demo@example.com", password: "CarelineDemo!2026" } });
      expect(response.status(), await response.text()).toBe(200);
    }
    const before = await first.request.get("/api/preferences");
    expect(before.status()).toBe(200);
    original = (await before.json()).appearance;
    await first.request.put("/api/preferences", { data: { appearance: "system" } });
    const page = await first.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("radio", { name: /Dark/ })).toBeEnabled();
    await expect(page.locator(".user-pill")).toContainText("Alex");
    await expect(page.getByRole("radio", { name: /Dark/ })).toBeEnabled();
    await page.getByRole("radio", { name: /Dark/ }).check();
    await expect(page.getByText("Saved to your account and this browser.")).toBeVisible();
    const otherPage = await second.newPage();
    await otherPage.goto("/");
    await expect(otherPage.locator("html")).toHaveAttribute("data-theme", "dark");
    expect((await (await second.request.get("/api/preferences")).json()).appearance).toBe("dark");
    expect((await first.request.put("/api/preferences", { data: { appearance: "invalid" } })).status()).toBe(400);
    expect((await request.put("/api/preferences", { data: { appearance: "dark" } })).status()).toBe(401);
    expect((await first.request.put("/api/preferences", { headers: { Origin: "https://unrelated.example" }, data: { appearance: "light" } })).status()).toBe(403);
  } finally {
    await first.request.put("/api/preferences", { data: { appearance: original } });
    await first.close();
    await second.close();
  }
});
