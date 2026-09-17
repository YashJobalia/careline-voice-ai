export const IDLE_CHECK_IN_MS = 45_000;
export const IDLE_GOODBYE_MS = 30_000;

export function idleAction(elapsed: number, warned: boolean, busy: boolean) {
  if (busy) return "wait";
  if (elapsed >= (warned ? IDLE_GOODBYE_MS : IDLE_CHECK_IN_MS))
    return warned ? "end" : "check_in";
  return "wait";
}

// A narrow fallback for explicit English exits; contextual/multilingual intent
// is handled by Mira's end_call tool rather than matching words inside a story.
export function explicitGoodbye(text: string) {
  return /^(?:(?:ok(?:ay)?|thanks|thank you)[,.! ]+)*(?:(?:please )?(?:hang up|end (?:the |this )?call|disconnect)(?: please)?|bye(?: bye)?|goodbye|that(?:'s| is) all)[.! ]*$/i.test(
    text.trim(),
  );
}
