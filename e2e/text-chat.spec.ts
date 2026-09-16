import { test, expect } from "@playwright/test";

test("typing works before, during and after a voice call without losing history", async ({
  page,
}) => {
  let turns = 0;
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  // Short valid PCM audio exercises real browser playback and onended.
  const spoken = Buffer.alloc(44 + 3200);
  spoken.write("RIFF", 0);
  spoken.writeUInt32LE(spoken.length - 8, 4);
  spoken.write("WAVEfmt ", 8);
  spoken.writeUInt32LE(16, 16);
  spoken.writeUInt16LE(1, 20);
  spoken.writeUInt16LE(1, 22);
  spoken.writeUInt32LE(16000, 24);
  spoken.writeUInt32LE(32000, 28);
  spoken.writeUInt16LE(2, 32);
  spoken.writeUInt16LE(16, 34);
  spoken.write("data", 36);
  spoken.writeUInt32LE(3200, 40);
  await page.route("**/api/speech", (r) =>
    r.fulfill({ contentType: "audio/wav", body: spoken }),
  );
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
