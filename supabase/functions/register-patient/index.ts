import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

// Called only after the app displays and confirms a registration draft.
// This function independently validates the guest JWT and never trusts an input user ID.
Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return reply({ error: "Guest session required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return reply({ error: "Guest session expired" }, 401);
  if (user.email) return reply({ error: "An account already exists for this session. Sign in with your patient ID." }, 409);
  try {
    const p = await req.json();
    if (p.confirmed !== true || typeof p.name !== "string" || p.name.trim().length < 2 || p.name.length > 60 || typeof p.dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth)) return reply({ error: "Confirm a valid name and date of birth." }, 400);
    const date = new Date(p.dateOfBirth + "T00:00:00Z");
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== p.dateOfBirth || p.dateOfBirth < "1900-01-01" || p.dateOfBirth > new Date().toISOString().slice(0,10)) return reply({ error: "Invalid date of birth." }, 400);
    const patientId = "CL" + user.id.replaceAll("-", "").toUpperCase();
    const email = patientId.toLowerCase() + "@patients.careline.invalid";
    const password = "Careline@123"; // Fictional demo accounts only; never suitable for real patient data.
    const { error: insertError } = await admin.from("careline_patients").insert({ user_id: user.id, patient_id: patientId, full_name: p.name.trim(), date_of_birth: p.dateOfBirth, consented_at: new Date().toISOString() });
    if (insertError) return reply({ error: "Registration is already in progress. Please retry or sign in." }, 409);
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true, password, user_metadata: { display_name: p.name.trim(), patient_id: patientId } });
    if (updateError) {
      await admin.from("careline_patients").delete().eq("user_id", user.id);
      return reply({ error: "Could not create your account. Please try again." }, 503);
    }
    return reply({ patientId, email, password });
  } catch { return reply({ error: "Invalid registration request" }, 400); }
});
