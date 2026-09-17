import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth", (r) => r.fulfill({ json: { user: null } }));
  await page.route("**/api/conversations", (r) =>
    r.fulfill({ json: { messages: [] } }),
  );
});
test("confirmed appointment receipts are readable on a phone", async ({
  page,
}) => {
  await page.route("**/api/assistant", (r) =>
    r.fulfill({
      json: {
        text: "Your appointment is confirmed.",
        traces: [],
        totalMs: 100,
        effects: [
          {
            ok: true,
            receipt: {
              id: "fixture",
              action: "book",
              title: "Appointment booked",
              summary:
                "Your appointment is confirmed. You can find it in My appointments.",
              fields: [
                { label: "Reference", value: "AA123" },
                { label: "Doctor", value: "Dr. Maya Shah" },
                {
                  label: "Appointment",
                  value: "Wednesday, October 14 at 11:00 AM",
                },
                { label: "Time zone", value: "America/Chicago" },
              ],
            },
          },
        ],
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  await page.getByLabel("Message the assistant").fill("Yes, confirm");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const receipt = page.getByRole("status", { name: "Action receipt" });
  await expect(receipt.getByText("AA123", { exact: true })).toBeVisible();
  await receipt.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/action-receipt-phone.png" });
  await page.goto("/reset-password");
  await expect(page.getByLabel("Account email")).toBeVisible();
  await page.screenshot({ path: "artifacts/password-recovery-phone.png" });
});
test("forgot password is accessible and never places passwords in chat", async ({
  page,
}) => {
  const sent: unknown[] = [];
  await page.route("**/api/account/recovery", (r) => {
    sent.push(r.request().postDataJSON());
    return r.fulfill({
      json: {
        message:
          "If this address has an account, a reset link has been requested.",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByLabel("Account email", { exact: true })
    .fill("alex@example.com");
  await page.getByRole("button", { name: "Request reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If this address");
  expect(sent).toEqual([{ email: "alex@example.com", action: "request" }]);
  await page.goto("/reset-password?step=complete");
  await page
    .getByLabel("New password", { exact: true })
    .fill("ExamplePassword123!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("DifferentPassword123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert-error")).toHaveText(
    "Passwords do not match.",
  );
  expect(sent).toHaveLength(1);
});
test("microphone denial offers an actionable message and leaves typing usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start voice conversation", exact: true })
    .click();
  await expect(page.locator(".alert-error")).toContainText(
    "Microphone permission was denied",
  );
  await expect(page.getByLabel("Message the assistant")).toBeEnabled();
});
test("voice ignores duplicate tool events and recovers from brief disconnects", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/realtime", (r) =>
    r.fulfill({ body: "v=0\r\n", headers: { "X-Careline-User": "fixture" } }),
  );
  await page.route("**/api/workspace", (r) => {
    calls++;
    return r.fulfill({ json: { specialists: [] } });
  });
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    const track = { enabled: true, stop() {}, onended: null };
    navigator.mediaDevices.getUserMedia = async () =>
      ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }) as unknown as MediaStream;
    w.RTCPeerConnection = class {
      connectionState = "new";
      onconnectionstatechange?: () => void;
      dc = {
        readyState: "open",
        onopen: () => {},
        onmessage: (_e: unknown) => {},
        onclose: () => {},
        send() {},
        close() {},
      };
      constructor() {
        w.testPeer = this;
      }
      addTrack() {}
      createDataChannel() {
        return this.dc;
      }
      async createOffer() {
        return { sdp: "v=0\r\n" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.dc.onopen();
      }
      close() {}
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start voice conversation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "End call", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const p = (window as unknown as Record<string, any>).testPeer;
    const data = JSON.stringify({
      type: "response.done",
      response: {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "careline_action",
            call_id: "same-call",
            arguments: JSON.stringify({ action: "list_specialists", args: {} }),
          },
        ],
      },
    });
    p.dc.onmessage({ data });
    p.dc.onmessage({ data });
    p.connectionState = "disconnected";
    p.onconnectionstatechange();
  });
  await expect.poll(() => calls).toBe(1);
  await expect(
    page
      .getByText("Connection interrupted - trying to recover...", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.evaluate(() => {
    const p = (window as unknown as Record<string, any>).testPeer;
    p.connectionState = "connected";
    p.onconnectionstatechange();
  });
  await expect(
    page.getByRole("button", { name: "End call", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as Record<string, any>).testPeer.dc.onclose(),
  );
  await expect(page.locator(".alert-error")).toContainText(
    "voice connection closed",
  );
  await expect(page.getByLabel("Message the assistant")).toBeEnabled();
  expect(calls).toBe(1);
});
