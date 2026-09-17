import { z } from "zod";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { makeReceipt } from "./action-receipt";
import { createClient } from "@supabase/supabase-js";
import { db, HttpError, session, sign, verify, type Session } from "./server";
import { supabaseServer } from "./supabase";
import { availableSlots } from "./scheduling";
import { doctors, formatSlot } from "./clinic";
import {
  mutation,
  navigation,
  signInRequest,
  accountLookup,
  type Mutation,
  type ActionResult,
  type Visit,
} from "./workspace";
import { patientDetails } from "./patient";
import { miraCapabilities } from "./mira-capabilities";
import { requestPasswordReset } from "./password-recovery";
import { assertActionRole, assertActionFacts } from "./semantic/policy";
import { contractFor } from "./semantic/actions";
import { semanticCatalog } from "./semantic/catalog";
import { appointmentState, ontologyVersion } from "./semantic/ontology";

function describeVisit(visit: Visit) {
  return {
    ...visit,
    doctorName: doctors.find((doctor) => doctor.id === visit.slot.doctor_id)
      ?.name,
    timeLabel: formatSlot(visit.slot),
    timeZone: "America/Chicago",
    timing: appointmentState(visit).timing,
    semanticState: appointmentState(visit),
  };
}

export async function visits(user: Session, clinic = false): Promise<Visit[]> {
  if (user.guest) throw new HttpError(401, "Sign in to see appointments.");
  if (clinic && user.role !== "doctor")
    throw new HttpError(403, "Doctor access required.");
  const rows: Visit[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await db<
      (Omit<Visit, "slot"> & { careline_slots: Visit["slot"] })[]
    >(
      `careline_appointments?select=*,careline_slots(id,doctor_id,starts_at)${clinic ? "" : `&session_id=eq.${user.id}`}&order=created_at.desc,id&limit=500&offset=${offset}`,
    );
    rows.push(
      ...batch.map(({ careline_slots, ...r }) => ({
        ...r,
        slot: careline_slots,
      })),
    );
    if (batch.length < 500) return rows;
  }
}
export async function history(user: Session) {
  const rows = await db<
    { messages: { role: "user" | "assistant"; content: string }[] }[]
  >(`careline_conversations?select=messages&user_id=eq.${user.id}`);
  return rows[0]?.messages || [];
}
export async function saveHistory(
  user: Session,
  messages: { role: "user" | "assistant"; content: string }[],
) {
  await db("careline_conversations?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: user.id,
      messages: messages.slice(-200),
      updated_at: new Date().toISOString(),
    }),
  });
}
async function accessibleVisit(user: Session, id: string, clinic = false) {
  const visit = (await visits(user, clinic)).find((v) => v.id === id);
  if (!visit)
    throw new HttpError(404, "Appointment not found or not accessible.");
  if (!appointmentState(visit).changeable)
    throw new HttpError(
      409,
      "Only upcoming confirmed appointments can be changed.",
    );
  return visit;
}
async function validate(user: Session, p: Mutation) {
  assertActionRole(user, p.action);
  const contract = contractFor(p.action);
  const [appointment, availableSlot] = await Promise.all([
    contract.requiresAppointment && "id" in p
      ? visits(
          user,
          user.role === "doctor" &&
            ["clinic", "own_or_clinic"].includes(contract.access),
        ).then((rows) => rows.find((v) => v.id === p.id))
      : undefined,
    contract.requiresSlot && "slotId" in p
      ? availableSlots().then((rows) => rows.find((s) => s.id === p.slotId))
      : undefined,
  ]);
  assertActionFacts(user, p, { appointment, availableSlot });
}
export async function registerAccount(
  details: z.infer<typeof patientDetails>,
  password?: string,
) {
  const client = await supabaseServer();
  // Optional local adapter, so development does not require an Edge deployment.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const visitor = await session();
    if (!visitor.guest)
      throw new HttpError(409, "You already have an account.");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const generated = password || randomBytes(9).toString("base64url") + "aA1!";
    const patientId = "CL" + visitor.id.replaceAll("-", "").toUpperCase();
    const { error: insertError } = await admin
      .from("careline_patients")
      .insert({
        user_id: visitor.id,
        patient_id: patientId,
        full_name: details.name,
        date_of_birth: details.dateOfBirth,
        gender: details.gender || null,
        email: details.email,
        phone: details.phone,
        consented_at: new Date().toISOString(),
      });
    if (insertError)
      throw new HttpError(
        409,
        "Registration is already in progress. Try again or sign in.",
      );
    const { error: updateError } = await admin.auth.admin.updateUserById(
      visitor.id,
      {
        email: details.email,
        password: generated,
        email_confirm: true,
        user_metadata: { display_name: details.name, patient_id: patientId },
      },
    );
    if (updateError) {
      await admin.from("careline_patients").delete().eq("user_id", visitor.id);
      throw new HttpError(
        409,
        "Could not register this email. Sign in if you already have an account.",
      );
    }
    const { error } = await client.auth.signInWithPassword({
      email: details.email,
      password: generated,
    });
    return {
      ok: true,
      message: error
        ? "Account created. Sign in with your credentials."
        : "Account created. You are signed in.",
      credentials: password
        ? undefined
        : { email: details.email, password: generated },
    };
  }
  const { data } = await client.auth.getSession();
  const r = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-patient`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session?.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...details, password, confirmed: true }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const result = await r.json();
  if (!r.ok)
    throw new HttpError(
      r.status,
      result.error || "Could not create the account.",
    );
  const { error } = await client.auth.signInWithPassword({
    email: result.email,
    password: result.password,
  });
  return {
    ok: true,
    message: error
      ? "Account created. Use your credentials to sign in."
      : "Account created. You are signed in and can continue.",
    credentials: password
      ? undefined
      : { email: result.email, password: result.password },
  };
}
export async function workspaceAction(
  raw: unknown,
  origin?: string,
): Promise<ActionResult> {
  const user = await session();
  const envelope = z
    .object({
      action: z.string(),
      args: z.unknown().optional(),
      token: z.string().optional(),
    })
    .parse(raw);
  const args = envelope.args || {};
  if (envelope.action === "get_ontology")
    return { ontology: semanticCatalog(user) };
  if (envelope.action === "get_capabilities")
    return { capabilities: miraCapabilities(user) };
  if (envelope.action === "lookup_account") {
    const p = accountLookup.parse(args);
    const result = await db<{ status: "found" | "not_found" | "rate_limited" }>(
      "rpc/careline_lookup_account",
      {
        method: "POST",
        body: JSON.stringify({
          contact: p.email || p.phone,
          contact_type: p.email ? "email" : "phone",
        }),
      },
    );
    if (result.status === "rate_limited")
      return {
        accountLookup: result,
        message:
          "Account lookup limit reached. Offer the private sign-in form; do not retry lookup or infer whether an account exists.",
      };
    if (result.status === "found")
      return {
        accountLookup: result,
        ...(user.guest
          ? {
              authentication: {
                email: p.email,
                originalRequest: p.originalRequest,
              },
              navigation: {
                page: "account" as const,
                accountSection: "signin" as const,
              },
            }
          : {}),
        message: user.guest
          ? "An account matches that contact. The private sign-in form is open. Ask the user to enter their password privately; for a phone match they must also enter their login email. No profile or appointment data was disclosed and they are not yet signed in."
          : "An account matches that contact. This does not grant access to it. Use permission-scoped appointment search for authorized records.",
      };
    return {
      accountLookup: result,
      message:
        "No account matched that exact contact. Confirm spelling or country code. Only offer registration if the user confirms they are new and wants to create an account. Do not automatically create an account.",
    };
  }
  const requireAccount = (
    returnTo?: z.infer<typeof navigation>,
  ): ActionResult => ({
    authentication: { returnTo },
    message:
      "An account is needed. Ask whether the user already has one. Offer private sign-in with start_signin or guide a new user through registration. No private records have been read and no change has been made.",
  });
  if (envelope.action === "start_signin") {
    const p = signInRequest.parse(args);
    if (!user.guest)
      return { account: user, message: "You are already signed in." };
    return {
      ...requireAccount(p.returnTo),
      authentication: {
        email: p.email,
        returnTo: p.returnTo,
        originalRequest: p.originalRequest,
      },
      navigation: { page: "account", accountSection: p.mode },
      message:
        "Private account form opened. The email, if supplied, is prefilled. Account existence has not been checked. Ask the user to enter credentials privately, or offer guided registration if they are new.",
    };
  }
  if (envelope.action === "end_call" || envelope.action === "mute")
    return { callControl: envelope.action };
  if (envelope.action === "navigate") {
    const target = navigation.parse(args);
    if (user.guest && ["appointments", "doctor"].includes(target.page))
      return requireAccount(target);
    if (target.page === "doctor" && user.role !== "doctor")
      throw new HttpError(403, "Doctor access required.");
    return {
      navigation: target,
      ...(user.guest && ["appointments", "account"].includes(target.page)
        ? {
            message:
              "The page is open. Sign in or create an account to view private data.",
          }
        : {}),
    };
  }
  if (envelope.action === "get_account") return { account: user };
  if (envelope.action === "search_appointments") {
    if (user.guest) return requireAccount({ page: "appointments" });
    const p = z
      .object({
        query: z.string().trim().min(2).max(254),
        scope: z.enum(["mine", "clinic"]).default("mine"),
      })
      .parse(args);
    if (p.scope === "clinic" && user.role !== "doctor")
      throw new HttpError(403, "Doctor access required.");
    const matched = await db<{ appointment_id: string }[]>(
      "rpc/careline_search_visits",
      {
        method: "POST",
        body: JSON.stringify({ search_text: p.query, search_scope: p.scope }),
      },
    );
    const ids = new Set(matched.slice(0, 100).map((row) => row.appointment_id));
    const results = (await visits(user, p.scope === "clinic")).filter((visit) =>
      ids.has(visit.id),
    );
    return {
      searchResults: results.map(describeVisit),
      scope: p.scope,
      query: p.query,
      truncated: matched.length > 100,
      message: results.length
        ? "Matched only records within your permissions. Clarify which appointment before changing anything."
        : "No matching appointments in your permitted scope. This does not establish whether an account exists.",
    };
  }
  if (envelope.action === "list_appointments") {
    if (user.guest) return requireAccount({ page: "appointments" });
    const p = z
      .object({ scope: z.enum(["mine", "clinic"]).default("mine") })
      .parse(args);
    return {
      appointments: (await visits(user, p.scope === "clinic")).map(
        describeVisit,
      ),
      scope: p.scope,
    };
  }
  if (envelope.action === "list_specialists") return { specialists: doctors };
  if (envelope.action === "availability") {
    const p = z
      .object({ doctorId: z.string().optional(), date: z.string().optional() })
      .parse(args);
    return {
      slots: (await availableSlots(undefined, p.doctorId))
        .filter(
          (s) =>
            s.doctor_id !== user.doctorId &&
            (!p.date ||
              new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Chicago",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(s.starts_at)) === p.date),
        )
        .slice(0, 30)
        .map((s) => ({
          ...s,
          label: formatSlot(s),
          doctor: doctors.find((d) => d.id === s.doctor_id)?.name,
        })),
    };
  }
  if (envelope.action === "prepare") {
    const details = mutation.parse(args);
    if (user.guest && !contractFor(details.action).roles.includes("guest"))
      return requireAccount({
        page: details.action === "book" ? "appointments" : "account",
        ...(details.action === "book" ? { booking: true } : {}),
      });
    await validate(user, details);
    let summary = contractFor(details.action).review;
    if (
      details.action === "cancel" ||
      details.action === "request_reschedule"
    ) {
      const visit = await accessibleVisit(
        user,
        details.id,
        user.role === "doctor",
      );
      summary = `${details.action === "cancel" ? "Cancel" : "Request rescheduling for"} ${visit.appointment_code}: ${doctors.find((d) => d.id === visit.slot.doctor_id)?.name}, ${formatSlot(visit.slot)} (America/Chicago)`;
    }
    if (details.action === "message_doctor") {
      const visit = (await visits(user)).find((v) => v.id === details.id);
      if (!visit)
        throw new HttpError(404, "Appointment not found or not accessible.");
      summary = `Leave a message for ${doctors.find((d) => d.id === visit.slot.doctor_id)?.name} about ${visit.appointment_code}`;
    }
    if (details.action === "book" || details.action === "reschedule") {
      const slot = (await availableSlots()).find(
        (s) => s.id === details.slotId,
      );
      if (!slot) throw new HttpError(409, "That slot is no longer available.");
      summary = `${details.action === "book" ? "Book" : "Move appointment to"} ${doctors.find((d) => d.id === slot.doctor_id)?.name}, ${formatSlot(slot)} (America/Chicago)`;
    }
    return {
      semantic: {
        version: ontologyVersion,
        state: "draft",
        code: "draft_prepared",
        entity: contractFor(details.action).entity,
      },
      pending: {
        details,
        summary,
        token: sign({
          kind: "workspace",
          ontologyVersion,
          userId: user.id,
          details,
          exp: Date.now() + 600000,
        }),
      },
      message: "Prepared for review. Ask for confirmation before committing.",
    };
  }
  if (envelope.action !== "confirm" || !envelope.token)
    throw new HttpError(400, "Unknown action.");
  const signed = verify<{
    kind: string;
    ontologyVersion?: string;
    userId: string;
    details: Mutation;
    exp: number;
  }>(envelope.token);
  if (signed.kind !== "workspace" || signed.userId !== user.id)
    throw new HttpError(403, "This action belongs to another account.");
  if (signed.ontologyVersion !== ontologyVersion)
    throw new HttpError(
      409,
      "The action rules changed. Prepare and review a fresh draft.",
    );
  const p = mutation.parse(signed.details);
  await validate(user, p);
  const claimed = await db<boolean>("rpc/careline_claim_confirmation", {
    method: "POST",
    body: JSON.stringify({
      token_hash: createHash("sha256").update(envelope.token).digest("hex"),
    }),
  });
  if (!claimed)
    throw new HttpError(
      409,
      "This confirmation has already been attempted. Check your current appointments or account details before preparing a new change.",
    );
  const receiptId = randomUUID();
  const oldVisit =
    ["reschedule", "cancel", "request_reschedule"].includes(p.action) &&
    "id" in p
      ? await accessibleVisit(
          user,
          p.id,
          user.role === "doctor" && p.action !== "reschedule",
        )
      : undefined;
  const targetSlot =
    p.action === "book" || p.action === "reschedule"
      ? (await availableSlots()).find((s) => s.id === p.slotId)
      : oldVisit?.slot;
  if ((p.action === "book" || p.action === "reschedule") && !targetSlot)
    throw new HttpError(
      409,
      "That slot is no longer available. Please choose another time.",
    );
  const receipt = makeReceipt(p.action, {
    id: receiptId,
    slot: targetSlot,
    reference: oldVisit?.appointment_code,
    previousSlot: p.action === "reschedule" ? oldVisit?.slot : undefined,
  });
  if (p.action === "reset_password") {
    if (!origin)
      throw new HttpError(400, "Open the password reset form in My account.");
    const result = await requestPasswordReset(p.email, origin);
    return { ...result, receipt: { ...receipt, summary: result.message } };
  }
  if (p.action === "register")
    return { ...(await registerAccount(p)), receipt };
  if (p.action === "book") {
    const rows = await db<{ appointment_code: string }[]>(
      "careline_appointments",
      {
        method: "POST",
        body: JSON.stringify({
          slot_id: p.slotId,
          session_id: user.id,
          patient_name: user.name,
          notes: JSON.stringify(p.notes),
        }),
      },
    );
    return {
      ok: true,
      receipt: makeReceipt("book", {
        id: receiptId,
        slot: targetSlot,
        reference: rows[0].appointment_code,
      }),
      message: `Appointment confirmed with ${doctors.find((d) => d.id === targetSlot!.doctor_id)?.name}, ${formatSlot(targetSlot!)} (America/Chicago). Reference ${rows[0].appointment_code}.`,
    };
  }
  if (p.action === "message_doctor") {
    await db("rpc/careline_message_doctor", {
      method: "POST",
      body: JSON.stringify({ booking_id: p.id, message_summary: p.summary }),
    });
    return {
      ok: true,
      receipt,
      message:
        "Your message is saved in the appointment notes and visible in the doctor panel. This does not confirm it has been read. No email or SMS was sent.",
    };
  }
  if (p.action === "reschedule") {
    const old = await accessibleVisit(user, p.id);
    await db("rpc/careline_reschedule_booking", {
      method: "POST",
      body: JSON.stringify({
        booking_id: p.id,
        old_slot_id: old.slot_id,
        new_slot_id: p.slotId,
      }),
    });
  } else if (p.action === "cancel" || p.action === "request_reschedule") {
    const changed = await db<boolean>("rpc/careline_manage_visit", {
      method: "POST",
      body: JSON.stringify({
        booking_id: p.id,
        operation: p.action,
        reason: p.reason,
      }),
    });
    if (!changed)
      throw new HttpError(
        409,
        "The appointment changed. Refresh and try again.",
      );
  } else if (p.action === "update_profile") {
    await db(`careline_patients?user_id=eq.${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        full_name: p.name,
        date_of_birth: p.dateOfBirth,
        ...(p.gender !== undefined ? { gender: p.gender || null } : {}),
        phone: p.phone,
      }),
    });
  } else if (p.action === "change_password") {
    const password = randomBytes(9).toString("base64url") + "aA1!";
    const { error } = await (
      await supabaseServer()
    ).auth.updateUser({ password });
    if (error)
      throw new HttpError(
        400,
        "Could not change password. Use the account form.",
      );
    return {
      ok: true,
      receipt,
      message:
        "Password changed. Save the new password shown privately on screen.",
      credentials: { email: user.email!, password },
    };
  } else if (p.action === "clear_history") {
    await db(`careline_conversations?user_id=eq.${user.id}`, {
      method: "DELETE",
    });
    return {
      ok: true,
      receipt,
      clearedHistory: true,
      message: "Saved conversation cleared.",
    };
  } else if (p.action === "signout") {
    const { error } = await (await supabaseServer()).auth.signOut();
    if (error) throw new HttpError(503, "Sign out failed. Please retry.");
    return { ok: true, receipt, signedOut: true, message: "Signed out." };
  }
  return {
    ok: true,
    receipt,
    message: `${receipt.title}. ${receipt.fields.map((f) => `${f.label}: ${f.value}`).join(". ")} ${receipt.summary}`,
  };
}
