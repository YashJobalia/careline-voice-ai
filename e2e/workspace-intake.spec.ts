import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth", (r) => r.fulfill({ json: { user: null } }));
  await page.route("**/api/clinic", (r) => r.fulfill({ json: { slots: [] } }));
  await page.route("**/api/preferences", (r) =>
    r.fulfill({ json: { appearance: "system" } }),
  );
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { messages: [], ok: true } }),
  );
});

test("signup formats national phone numbers and accepts the new password policy", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .first()
    .click();
  await page.getByLabel("Country code", { exact: true }).selectOption("IN");
  await page.getByLabel("Phone number", { exact: true }).fill("098765 43210");
  await page.getByLabel("Full name").fill("Test Patient");
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
    "098765 43210",
  );
  await page.getByLabel("Date of birth").fill("1990-01-01");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByRole("combobox", { name: "Gender (optional)" })
    .selectOption("Female");
  await page.getByLabel("Password", { exact: true }).fill("Abcdef1!");
  let body: Record<string, string> = {};
  await page.route("**/api/auth", (r) => {
    if (r.request().method() === "POST") body = r.request().postDataJSON();
    return r.fulfill({ json: { user: null, ok: true } });
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await expect.poll(() => body.countryCode).toBe("IN");
  expect(body.phone).toBe("098765 43210");
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/phone-signup-mobile.png",
    fullPage: true,
  });
});

test("activity cards use dark surfaces and readable text", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("**/api/assistant", (r) =>
    r.fulfill({
      json: {
        text: "Here are the available times.",
        effects: [],
        totalMs: 100,
        traces: [
          {
            label: "Check available times",
            detail: "3 available times returned.",
            status: "completed",
            source: "text",
            durationMs: 90,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Message the assistant").fill("Check available times");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByText("Behind the scenes: how this voice AI works", { exact: true })
    .click();
  const card = page.locator(".mira-activity-item").first();
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("background-color", "rgb(32, 45, 56)");
  await expect(card.locator("strong")).toHaveCSS("color", "rgb(231, 238, 239)");
  await page.screenshot({
    path: "artifacts/mira-activity-dark.png",
    fullPage: true,
  });
});

async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const state = {
      sent: [] as Record<string, any>[],
      emit: (_event: unknown) => {},
      stopped: false,
    };
    (window as any).__voice = state;
    const track = {
      enabled: true,
      stop: () => {
        state.stopped = true;
      },
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    });
    class Peer {
      dc: any;
      addTrack() {}
      createDataChannel() {
        this.dc = {
          readyState: "open",
          send: (raw: string) => state.sent.push(JSON.parse(raw)),
          close() {},
        };
        state.emit = (event) =>
          this.dc.onmessage({ data: JSON.stringify(event) });
        return this.dc;
      }
      async createOffer() {
        return { sdp: "v=0\r\n" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.dc.onopen();
      }
      close() {}
    }
    (window as any).RTCPeerConnection = Peer;
  });
  await page.route("**/api/realtime", (r) =>
    r.fulfill({
      body: "v=0\r\n",
      headers: { "X-Careline-User": "11111111-1111-4111-8111-111111111111" },
    }),
  );
  await page.goto("/");
  await page.locator(".start-call").click();
  await expect(
    page.getByRole("button", { name: "End call", exact: true }),
  ).toBeVisible();
}

test("an unanswered call checks in once, then says goodbye and releases the microphone", async ({
  page,
}) => {
  await page.clock.install();
  await fakeVoice(page);
  await page.clock.fastForward(46_000);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__voice.sent.filter((e: any) =>
            e.response?.instructions?.includes("gently ask once"),
          ).length,
      ),
    )
    .toBe(1);
  // The silence countdown resumes after the check-in's audio finishes.
  await page.evaluate(() =>
    (window as any).__voice.emit({
      type: "output_audio_buffer.stopped",
      response_id: "check-in",
    }),
  );
  await page.clock.fastForward(31_000);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__voice.sent.some(
          (e: any) => e.response?.metadata?.purpose === "goodbye",
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const voice = (window as any).__voice;
    voice.emit({
      type: "response.created",
      response: { id: "idle-bye", metadata: { purpose: "goodbye" } },
    });
    voice.emit({
      type: "output_audio_buffer.stopped",
      response_id: "idle-bye",
    });
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__voice.stopped))
    .toBe(true);
});

test("Mira greets on connection and finishes the goodbye audio before disconnecting", async ({
  page,
}) => {
  await fakeVoice(page);
  expect(
    await page.evaluate(
      () => (window as any).__voice.sent[0].response.instructions,
    ),
  ).toContain("Immediately offer a warm greeting");
  await page.evaluate(() =>
    (window as any).__voice.emit({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "Thanks, goodbye.",
    }),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__voice.sent.some(
          (e: any) => e.response?.metadata?.purpose === "goodbye",
        ),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => (window as any).__voice.stopped)).toBe(
    false,
  );
  await page.evaluate(() => {
    const voice = (window as any).__voice;
    voice.emit({
      type: "response.created",
      response: { id: "farewell", metadata: { purpose: "goodbye" } },
    });
    voice.emit({
      type: "response.done",
      response: { id: "farewell", status: "completed" },
    });
  });
  expect(await page.evaluate(() => (window as any).__voice.stopped)).toBe(
    false,
  );
  await page.evaluate(() =>
    (window as any).__voice.emit({
      type: "output_audio_buffer.stopped",
      response_id: "farewell",
    }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__voice.stopped))
    .toBe(true);
});

test("speech events stay responsive while a slow tool is pending", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/workspace", async (r) => {
    requested = true;
    await gate;
    await r.fulfill({ json: { slots: [] } });
  });
  await fakeVoice(page);
  await page.evaluate(() =>
    (window as any).__voice.emit({
      type: "response.done",
      response: {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "careline_action",
            call_id: "slow",
            arguments: JSON.stringify({ action: "availability", args: {} }),
          },
        ],
      },
    }),
  );
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() =>
    (window as any).__voice.emit({ type: "input_audio_buffer.speech_stopped" }),
  );
  await expect(
    page.getByText("Mira is working on it", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).__voice.emit({ type: "input_audio_buffer.speech_started" }),
  );
  await expect(
    page.getByText("Your turn. Mira is listening.", { exact: true }),
  ).toBeVisible();
  release();
});
