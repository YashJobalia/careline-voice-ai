import { supabaseServer } from "./supabase";
import { HttpError } from "./server";
export async function requestPasswordReset(email: string, origin: string) {
  const client = await supabaseServer();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/callback", origin).toString(),
  });
  if (error)
    throw new HttpError(
      error.status === 429 ? 429 : 503,
      error.status === 429
        ? "Too many requests. Wait a few minutes before trying again."
        : "Reset email could not be sent. Please try again later.",
    );
  return {
    ok: true,
    message:
      "If this address has an account, a password reset link has been requested. Check your inbox and spam folder. Open the link in this browser.",
  };
}
