import { z } from "zod";
// Responses uses strict JSON-string args; Realtime can produce an object.
// Both forms still pass the same action-specific server validation.
export function decodeToolArguments(value: string) {
  const input = z
    .object({
      action: z.string(),
      args: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .default({}),
      token: z.string().nullable().optional(),
    })
    .parse(JSON.parse(value));
  const args =
    typeof input.args === "string" ? JSON.parse(input.args) : input.args;
  return {
    action: input.action,
    args: z.record(z.string(), z.unknown()).parse(args),
    token: input.token || undefined,
  };
}
export function completedToolCalls(event: {
  type: string;
  response?: {
    status?: string;
    output?: {
      type: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }[];
  };
}) {
  if (event.type !== "response.done" || event.response?.status !== "completed")
    return [];
  return (event.response.output || []).filter(
    (
      item,
    ): item is {
      type: string;
      name: string;
      call_id: string;
      arguments: string;
    } =>
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.call_id === "string" &&
      typeof item.arguments === "string",
  );
}
