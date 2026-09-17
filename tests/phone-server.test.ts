import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { WebSocket } from "ws";
import twilio from "twilio";

test(
  "phone bridge rejects unsigned upgrades and requires a setup event",
  { timeout: 30000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    reservation.close();
    await once(reservation, "close");
    const relay = "wss://phone.example.test/relay",
      secret = "fixture-token";
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/phone-server.ts"],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          PHONE_PORT: String(port),
          TWILIO_AUTH_TOKEN: secret,
          TWILIO_RELAY_URL: relay,
          OPENAI_API_KEY: "fixture-not-a-key",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture",
        },
      },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (child.exitCode !== null) throw new Error(output);
        try {
          ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
        } catch {}
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.equal(ready, true, output);
      const denied = new WebSocket(`ws://127.0.0.1:${port}/relay`);
      const status = await new Promise<number>((resolve, reject) => {
        denied.on("unexpected-response", (_req, response) => {
          response.resume();
          resolve(response.statusCode!);
          denied.terminate();
        });
        denied.on("error", () => {});
        denied.on("open", () => {
          denied.close();
          reject(new Error("Unsigned connection accepted"));
        });
      });
      assert.equal(status, 403);
      const accepted = new WebSocket(`ws://127.0.0.1:${port}/relay`, {
        headers: {
          "x-twilio-signature": twilio.getExpectedTwilioSignature(
            secret,
            relay,
            {},
          ),
        },
      });
      await once(accepted, "open");
      accepted.send(
        JSON.stringify({ type: "prompt", voicePrompt: "Hello", last: true }),
      );
      const [code] = await once(accepted, "close");
      assert.equal(code, 1008);
    } finally {
      child.kill();
      await once(child, "exit").catch(() => {});
    }
  },
);
