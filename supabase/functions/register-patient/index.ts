import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

// Portfolio demo only: accounts are activated without email delivery.
// Identity comes from a verified guest JWT; callers cannot assign roles.
Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return reply({ error: "Guest session required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return reply({ error: "Guest session expired" }, 401);
  if (!user.is_anonymous || user.email) return reply({ error: "An account already exists. Sign in with your email." }, 409);
  try {
    const p = await req.json();
    if (p.confirmed !== true || typeof p.name !== "string" || p.name.trim().length < 2 || p.name.length > 60 || typeof p.dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth)) return reply({ error: "Confirm a valid name and date of birth." }, 400);
    if(typeof p.email!=="string" || p.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return reply({error:"A valid email is required."},400);
    if(typeof p.phone!=="string" || !/^\+[1-9]\d{7,14}$/.test(p.phone.trim())) return reply({error:"Phone must include the international country code."},400);
    if(p.password!==undefined && (typeof p.password!=="string" || p.password.length<10 || p.password.length>128)) return reply({error:"Choose a password of 10 to 128 characters."},400);
    const date = new Date(p.dateOfBirth + "T00:00:00Z");
    if(p.gender!==undefined && p.gender!==null && (typeof p.gender!=="string" || p.gender.trim().length>60)) return reply({error:"Gender must be 60 characters or fewer."},400);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== p.dateOfBirth || p.dateOfBirth < "1900-01-01" || p.dateOfBirth > new Date().toISOString().slice(0,10)) return reply({ error: "Invalid date of birth." }, 400);
    const patientId = "CL" + user.id.replaceAll("-", "").toUpperCase();
    const email = p.email.trim().toLowerCase();
    const password = p.password || Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>b.toString(16).padStart(2,"0")).join("")+"aA1!";
    const { error: insertError } = await admin.from("careline_patients").insert({ user_id: user.id, patient_id: patientId, full_name: p.name.trim(), date_of_birth: p.dateOfBirth, gender:p.gender?.trim() || null, email, phone:p.phone.trim(), account_type:"patient", consented_at: new Date().toISOString() });
    if (insertError) return reply({ error: "Registration is already in progress. Please retry or sign in." }, 409);
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true, password, user_metadata: { display_name: p.name.trim(), patient_id: patientId } });
    if (updateError) {
      await admin.from("careline_patients").delete().eq("user_id", user.id);
      return reply({ error: "Could not create this account. If the email is already registered, sign in instead." }, 409);
    }
    return reply({ patientId, email, password });
  } catch { return reply({ error: "Invalid registration request" }, 400); }
});
