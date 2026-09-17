import { phoneTwiml, validTwilioSignature } from "@/lib/phone";

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const webhookUrl = process.env.TWILIO_VOICE_WEBHOOK_URL;
  const relayUrl = process.env.TWILIO_RELAY_URL;
  if (!token || !webhookUrl || !relayUrl)
    return new Response("Phone demo is not configured.", { status: 503 });
  const body = await req.text();
  if (body.length > 16000)
    return new Response("Request too large", { status: 413 });
  const params = Object.fromEntries(new URLSearchParams(body));
  if (
    new URL(req.url).search ||
    !validTwilioSignature(
      token,
      req.headers.get("x-twilio-signature") || "",
      webhookUrl,
      params,
    )
  )
    return new Response("Invalid signature", { status: 403 });
  return new Response(phoneTwiml(relayUrl), {
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}
