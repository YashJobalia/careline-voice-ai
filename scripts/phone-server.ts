import { createServer } from "node:http";
import { loadEnvFile } from "node:process";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { validTwilioSignature } from "../src/lib/phone";
import {
  runConversation,
  type ConversationServices,
} from "../src/lib/conversation-engine";
import { emptyPreferences } from "../src/lib/conversation";
import { doctorFor, type Message, type Slot } from "../src/lib/clinic";

try {
  loadEnvFile(".env.local");
} catch {}
const token = process.env.TWILIO_AUTH_TOKEN;
const relay = process.env.TWILIO_RELAY_URL;
if (
  !token ||
  !relay ||
  !process.env.OPENAI_API_KEY ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)
  throw new Error(
    "Configure the phone environment described in docs/phone-demo.md.",
  );
const relayUrl = new URL(relay);
if (relayUrl.protocol !== "wss:" || relayUrl.search || relayUrl.hash)
  throw new Error(
    "TWILIO_RELAY_URL must be a wss URL without query or fragment.",
  );
const server = createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404);
  res.end(req.url === "/health" ? "ok" : "Not found");
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 32000 });
server.on("upgrade", (req, socket, head) => {
  const signature = req.headers["x-twilio-signature"];
  if (
    req.url !== relayUrl.pathname ||
    typeof signature !== "string" ||
    !validTwilioSignature(token, signature, relay!, {})
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) =>
    sockets.emit("connection", ws),
  );
});
const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setup"),
    callSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
  }),
  z.object({
    type: z.literal("prompt"),
    voicePrompt: z.string().max(1500),
    last: z.boolean(),
  }),
  z.object({
    type: z.literal("interrupt"),
    utteranceUntilInterrupt: z.string().max(1500),
  }),
  z.object({ type: z.literal("error") }),
]);
sockets.on("connection", (ws) => {
  let history: Message[] = [],
    preferences = emptyPreferences(),
    callId: string | undefined;
  let interrupted = false,
    version = 0,
    abort: AbortController | undefined;
  const say = (text: string) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(
        JSON.stringify({
          type: "text",
          token: text.replace(/[<>]/g, ""),
          last: true,
          interruptible: true,
          preemptible: true,
        }),
      );
  };
  ws.on("close", () => {
    version++;
    abort?.abort();
    history = [];
  });
  ws.on("error", () => {
    abort?.abort();
  });
  ws.on("message", async (raw) => {
    let event: z.infer<typeof eventSchema>;
    try {
      event = eventSchema.parse(JSON.parse(raw.toString()));
    } catch {
      return;
    }
    if (event.type === "setup") {
      if (callId) {
        ws.close(1008);
        return;
      }
      callId = event.callSid;
      return;
    }
    if (!callId) {
      ws.close(1008);
      return;
    }
    if (event.type === "interrupt") {
      interrupted = true;
      version++;
      abort?.abort();
      if (history.at(-1)?.role === "assistant")
        history[history.length - 1] = {
          role: "assistant",
          content:
            event.utteranceUntilInterrupt ||
            "[Response interrupted before playback]",
        };
      return;
    }
    if (event.type !== "prompt" || !event.last || !event.voicePrompt.trim())
      return;
    abort?.abort();
    abort = new AbortController();
    const current = ++version;
    history = [
      ...history,
      { role: "user" as const, content: event.voicePrompt },
    ].slice(-24);
    const services: ConversationServices = {
      user: { id: callId, name: "", guest: true },
      availableSlots: async (department, doctor) => {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/careline_get_slots`,
          {
            method: "POST",
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
              "Content-Type": "application/json",
            },
            body: "{}",
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok) throw new Error("Availability unavailable");
        return ((await response.json()) as Slot[]).filter(
          (s) =>
            (!department ||
              doctorFor(s.doctor_id)?.department === department) &&
            (!doctor || s.doctor_id === doctor),
        );
      },
      proposal: async () => {
        throw new Error("Confirm bookings on the website.");
      },
      prepareRegistration: async () => {
        throw new Error("Register on the website.");
      },
      appointments: async () => {
        throw new Error("Sign in on the website.");
      },
    };
    try {
      const result = await runConversation(history, services, {
        preferences,
        interrupted,
        channel: "phone",
        language: "en",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]),
      });
      if (current !== version || ws.readyState !== WebSocket.OPEN) return;
      preferences = result.preferences;
      interrupted = false;
      history.push({ role: "assistant", content: result.text });
      say(result.text);
    } catch {
      if (current === version)
        say(
          "I couldn't complete that request. Please try again or use the CareLine website.",
        );
    }
  });
});
server.listen(Number(process.env.PHONE_PORT || 3001), () =>
  console.log("CareLine phone bridge listening"),
);
