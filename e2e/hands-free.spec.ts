import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test("hands-free microphone submits successive turns and stops on mute/end", async ({
  playwright,
}) => {
  test.setTimeout(60000);
  // Deterministic synthetic audio: initial silence, voice-level tone, then a pause.
  // Chrome loops it. Real browser capture/encoding/VAD run; paid APIs are mocked.
  mkdirSync("artifacts", { recursive: true });
  const rate = 16000,
    seconds = 6,
    length = rate * seconds;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(length * 2, 40);
  for (let n = 0; n < length; n++) {
    const t = n / rate;
    wav.writeInt16LE(
      t > 2 && t < 3.2
        ? Math.round(Math.sin(t * 440 * 2 * Math.PI) * 10000)
        : 0,
      44 + n * 2,
    );
  }
  const path = resolve("artifacts/hands-free-test.wav");
  writeFileSync(path, wav);
  const browser = await playwright.chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path}`,
    ],
  });
  const context = await browser.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  let turns = 0,
    transcriptions = 0;
  await page.addInitScript(() => {
    const originalPause = HTMLMediaElement.prototype.pause;
    (window as unknown as { interruptions: number }).interruptions = 0;
    HTMLMediaElement.prototype.pause = function () {
      if (!this.paused && !this.ended && this.currentTime > 0) {
        (window as unknown as { interruptions: number }).interruptions++;
      }
      return originalPause.call(this);
    };
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks =
        stream.getTracks();
      return stream;
    };
  });
  // Long PCM reply must be interrupted by the synthetic microphone input.
  const spoken = Buffer.alloc(44 + 320000);
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
  spoken.writeUInt32LE(320000, 40);
  await page.route("**/api/speech", (r) =>
    r.fulfill({ contentType: "audio/wav", body: spoken }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true, guest: true } }),
  );
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { user: null, liveReady: true } }),
  );
  await page.route("**/api/transcribe", async (route) => {
    expect(route.request().postDataBuffer()?.length).toBeGreaterThan(1000);
    transcriptions++;
    await route.fulfill({ json: { text: `Spoken turn ${transcriptions}` } });
  });
  await page.route("**/api/chat", async (route) => {
    turns++;
    expect(
      route
        .request()
        .postDataJSON()
        .messages.filter((m: { role: string }) => m.role === "user"),
    ).toHaveLength(turns);
    await route.fulfill({
      json: { text: `I heard turn ${turns}. Please continue.`, actions: [] },
    });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await expect(
      page.getByRole("button", { name: "Mute microphone" }),
    ).toBeVisible();
    // No clicks on any record button: voice pauses submit both turns.
    await expect
      .poll(() => turns, { timeout: 25000 })
      .toBeGreaterThanOrEqual(2);
    expect(
      await page.evaluate(
        () => (window as unknown as { interruptions: number }).interruptions,
      ),
    ).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Mute microphone" }).click();
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { testTracks: MediaStreamTrack[] }
        ).testTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    const mutedTurns = transcriptions;
    await page.waitForTimeout(6500);
    expect(transcriptions).toBe(mutedTurns);
    await page.getByRole("button", { name: "Enable microphone" }).click();
    await expect(
      page.getByRole("button", { name: "Mute microphone" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "End call" }).click();
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { testTracks: MediaStreamTrack[] }
        ).testTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Start conversation" }),
    ).toBeVisible();
  } finally {
    await browser.close();
  }
});
