import twilio from "twilio";

export function validTwilioSignature(
  token: string,
  signature: string,
  url: string,
  params: Record<string, string>,
) {
  return (
    Boolean(token && signature) &&
    twilio.validateRequest(token, signature, url, params)
  );
}
export function phoneTwiml(websocketUrl: string) {
  const url = new URL(websocketUrl);
  if (
    url.protocol !== "wss:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a public wss URL without credentials, query or fragment.",
    );
  const response = new twilio.twiml.VoiceResponse();
  response.connect().conversationRelay({
    url: url.toString(),
    language: "en-US",
    interruptible: "speech",
    preemptible: true,
    welcomeGreeting:
      "Welcome to CareLine, a fictional clinic with an AI receptionist. I can answer clinic questions and check times. Please use our website to confirm appointments. How can I help?",
  });
  return response.toString();
}
