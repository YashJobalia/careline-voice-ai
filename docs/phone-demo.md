# Phone demo setup

The optional Twilio ConversationRelay adapter uses the same model orchestration,
clinic documents, preference tracking and availability tools as the browser.
It is English-only by default. It does not impersonate a signed-in patient:
registration, private appointment history, booking, cancellation and rescheduling
require the website. Handoffs are explicitly described as previews.

1. Configure a Twilio account with ConversationRelay enabled and an inbound number.
2. Deploy `npm run phone:dev` on a long-running Node host with HTTPS/WebSocket support.
   Set `PHONE_PORT` to the host's listening port. This server is **not** a Vercel
   route handler; a persistent WebSocket connection needs a suitable host.
3. Give that process `OPENAI_API_KEY`, `OPENAI_MODEL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `TWILIO_AUTH_TOKEN` and `TWILIO_RELAY_URL=wss://YOUR-BRIDGE/relay`.
   `/health` returns a simple health check. Do not expose service-role credentials.
4. Give the Next.js app `TWILIO_AUTH_TOKEN`, `TWILIO_RELAY_URL`, and
   `TWILIO_VOICE_WEBHOOK_URL=https://YOUR-APP/api/phone`.
5. Set the number's inbound Voice webhook to that exact URL, method POST.
   Both the webhook and WebSocket upgrade validate Twilio signatures. Preserve
   the public URLs exactly across reverse proxies. Query strings are unsupported.
6. Call your number, ask for clinic hours, request availability, and interrupt a
   response with a correction. Verify that only the heard portion is retained
   after a provider interruption event. Ask to book and verify the agent directs
   you to the website rather than claiming a phone booking succeeded.

No number was provisioned or called by adding this adapter. Twilio and model
charges apply once configured. Each connection keeps its transcript in process
memory and discards it on disconnect. A process restart ends calls; durable call
recovery, authenticated cross-channel handoff, live staff transfers and production
telephony operations are not implemented.

References: [ConversationRelay TwiML](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay),
[WebSocket events](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages),
[signature validation](https://www.twilio.com/docs/usage/security).
