import { loadEnvFile } from "node:process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
try {
  loadEnvFile(".env.local");
} catch {}
if (!process.argv.includes("--live"))
  throw new Error(
    "This uses paid speech APIs and the hosted demo. Pass --live explicitly.",
  );
async function main() {
  mkdirSync("artifacts", { recursive: true });
  const hindi = process.argv.includes("--hindi");
  const english = process.argv.includes("--english-after-hindi");
  const replyHindi = process.argv.includes("--reply-hindi");
  const language = hindi ? "Hindi" : english ? "English" : "Spanish";
  const fixture = resolve(`artifacts/realtime-${language.toLowerCase()}.wav`);
  if (!existsSync(fixture) || !process.argv.includes("--reuse")) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        response_format: "pcm",
        input: english
          ? "Show me my appointment calendar for September twenty twenty six, please."
          : hindi
            ? "मुझे सितंबर दो हज़ार छब्बीस की मेरी अपॉइंटमेंट्स का कैलेंडर दिखाइए।"
            : "Mu\u00e9strame el calendario de mis citas para septiembre de dos mil veintis\u00e9is.",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Fixture speech failed: ${r.status}`);
    const pcm = Buffer.from(await r.arrayBuffer());
    const samples = Buffer.concat([
      Buffer.alloc(24000 * 2 * 10),
      pcm,
      Buffer.alloc(24000 * 2 * 15),
    ]);
    const h = Buffer.alloc(44);
    h.write("RIFF");
    h.writeUInt32LE(36 + samples.length, 4);
    h.write("WAVEfmt ", 8);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(24000, 24);
    h.writeUInt32LE(48000, 28);
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write("data", 36);
    h.writeUInt32LE(samples.length, 40);
    writeFileSync(fixture, Buffer.concat([h, samples]));
  }
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixture}%noloop`,
    ],
  });
  try {
    const context = await browser.newContext({
      permissions: ["microphone"],
      viewport: { width: 1366, height: 900 },
    });
    const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
    const login = await context.request.post(`${base}/api/auth`, {
      data: {
        action: "signin",
        email: "alex.demo@example.com",
        password: "CarelineDemo!2026",
      },
    });
    if (!login.ok()) throw new Error("Demo login failed");
    const original = await (
      await context.request.get(`${base}/api/conversations`)
    ).json();
    const account = (
      await (await context.request.get(`${base}/api/auth`)).json()
    ).user;
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.addInitScript(() => {
      const transcripts: string[] = [];
      const replies: string[] = [];
      let heardSpeech = false;
      Object.assign(window, {
        speechTranscripts: transcripts,
        speechReplies: replies,
      });
      const create = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function (...args) {
        const channel = create.apply(this, args);
        channel.addEventListener("message", (message) => {
          const event = JSON.parse(message.data);
          if (event.type === "input_audio_buffer.speech_started")
            heardSpeech = true;
          if (
            heardSpeech &&
            event.type === "response.output_audio_transcript.done"
          )
            replies.push(event.transcript);
          if (
            event.type ===
            "conversation.item.input_audio_transcription.completed"
          )
            transcripts.push(event.transcript);
        });
        return channel;
      };
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error(`HTTP ${response.status()}: ${response.url()}`);
    });
    try {
      if (english) {
        const seeded = await context.request.post(`${base}/api/conversations`, {
          data: {
            ownerId: account.id,
            messages: [
              {
                role: "user",
                content: "मुझे मेरी अपॉइंटमेंट्स के बारे में बताइए।",
              },
              {
                role: "assistant",
                content:
                  "ज़रूर, मैं आपकी अपॉइंटमेंट्स देखने में मदद कर सकती हूँ।",
              },
            ],
          },
        });
        if (!seeded.ok())
          throw new Error(
            "Could not seed Hindi conversation for language-switch test",
          );
      }
      await page.goto(base);
      await page.locator(".start-call").waitFor();
      await page.waitForFunction(
        () =>
          !(document.querySelector(".start-call") as HTMLButtonElement)
            .disabled,
      );
      await page.getByLabel("Reply language", { exact: true }).click();
      await page
        .getByRole("option", {
          name: replyHindi ? "Hindi" : "English",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Start voice conversation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "End call", exact: true })
        .waitFor();
      await page.waitForFunction(() => {
        const timer = document.querySelector(".call-timer");
        return timer && timer.textContent !== "00:00";
      });
      await page
        .getByRole("button", { name: "Mute speaker", exact: true })
        .click();
      if (
        (await page
          .getByRole("button", { name: "Unmute speaker", exact: true })
          .getAttribute("aria-pressed")) !== "true"
      )
        throw new Error("Speaker mute did not update");
      await page
        .getByRole("button", { name: "Unmute speaker", exact: true })
        .click();
      await page.getByRole("button", { name: "Mute", exact: true }).click();
      await page.getByRole("button", { name: "Unmute", exact: true }).click();
      await page.screenshot({
        path: "artifacts/call-ui-connected.png",
        fullPage: true,
      });
      await page
        .getByRole("heading", { name: "September 2026", exact: true })
        .waitFor({ timeout: 55000 });
      if (
        !(await page
          .getByRole("button", { name: "End call", exact: true })
          .isVisible())
      )
        throw new Error("Navigation stopped the voice call");
      await page.screenshot({
        path: "artifacts/realtime-calendar.png",
        fullPage: true,
      });
      if (hindi) {
        await page.waitForFunction(
          () =>
            (window as unknown as { speechTranscripts: string[] })
              .speechTranscripts.length > 0,
        );
        const heard = await page.evaluate(() =>
          (
            window as unknown as { speechTranscripts: string[] }
          ).speechTranscripts.join(" "),
        );
        if (
          !/\p{Script=Devanagari}/u.test(heard) ||
          /\p{Script=Arabic}/u.test(heard)
        )
          throw new Error(`Hindi script check failed: ${heard}`);
        console.log(`Hindi transcript: ${heard}`);
      }
      if (!replyHindi) {
        await page.waitForFunction(
          () =>
            (
              window as unknown as { speechReplies: string[] }
            ).speechReplies.some((reply) =>
              /calendar|september|appointment/i.test(reply),
            ),
          undefined,
          { timeout: 30000 },
        );
        const reply = await page.evaluate(() =>
          (window as unknown as { speechReplies: string[] }).speechReplies.join(
            " ",
          ),
        );
        if (/\p{Script=Devanagari}|\p{Script=Arabic}/u.test(reply))
          throw new Error(`English reply used the wrong language: ${reply}`);
        console.log(`Selected English reply to ${language} input: ${reply}`);
      } else {
        await page.waitForFunction(() =>
          (window as unknown as { speechReplies: string[] }).speechReplies.some(
            (reply) => /\p{Script=Devanagari}/u.test(reply),
          ),
        );
        console.log(
          "PASS: Selected Hindi reply was delivered for " +
            language +
            " input.",
        );
      }
      await page.getByRole("button", { name: "End call", exact: true }).click();
      if (errors.length) throw new Error(errors.join("\n"));
      console.log(
        `PASS: ${language} microphone audio -> Realtime tool call -> September calendar; call stayed active; no browser errors.`,
      );
    } catch (error) {
      console.error("Voice verification browser errors:", errors);
      console.error(
        "Voice verification page:",
        (await page.locator("body").innerText()).slice(-5000),
      );
      await page.screenshot({
        path: "artifacts/realtime-failure.png",
        fullPage: true,
      });
      throw error;
    } finally {
      await page
        .getByRole("button", { name: "End call", exact: true })
        .click({ timeout: 2000 })
        .catch(() => {});
      await context.request.post(`${base}/api/conversations`, {
        data: { ownerId: account.id, messages: original.messages },
      });
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Verification failed");
  process.exitCode = 1;
});
