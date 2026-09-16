import { test, expect } from "@playwright/test";

test("typing works before, during and after a voice call without losing history", async ({
  page,
}) => {
  let turns = 0;
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        speak(u: SpeechSynthesisUtterance) {
          setTimeout(
            () => u.onend?.(new Event("end") as SpeechSynthesisEvent),
            1,
          );
        },
      },
    });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { ok: true, guest: true } }),
  );
  await page.route("**/api/chat", async (r) => {
    turns++;
    expect(
      r
        .request()
        .postDataJSON()
        .messages.filter((m: { role: string }) => m.role === "user"),
    ).toHaveLength(turns);
    await r.fulfill({ json: { text: `Reply number ${turns}`, actions: [] } });
  });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Message the receptionist" });
  const send = async (text: string) => {
    await expect(input).toBeEnabled();
    await input.fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText(`Reply number ${turns || 1}`, { exact: true }),
    ).toBeVisible();
  };
  await send("Hello before the call");
  await expect(
    page.getByRole("button", { name: "Start conversation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page.getByRole("button", { name: "End call" })).toBeVisible();
  await send("Hello during the call");
  await page.getByRole("button", { name: "End call" }).click();
  await send("Hello after the call");
  expect(turns).toBe(3);
});
