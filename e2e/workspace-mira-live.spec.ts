import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.skip(
  process.env.RUN_LIVE_WORKSPACE !== "1",
  "Opt in to hosted permission checks.",
);
test("Mira contact search enforces permission boundaries at the database", async () => {
  const make = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  const patient = make(),
    doctor = make(),
    guest = make();
  try {
    expect(
      (
        await patient.auth.signInWithPassword({
          email: "alex.demo@example.com",
          password: "CarelineDemo!2026",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await doctor.auth.signInWithPassword({
          email: "maya.demo@example.com",
          password: "CarelineDemo!2026",
        })
      ).error,
    ).toBeNull();
    const own = await patient.rpc("careline_search_visits", {
      search_text: "alex.demo@example.com",
      search_scope: "mine",
    });
    expect(own.error).toBeNull();
    expect(own.data.length).toBeGreaterThan(0);
    const foreign = await patient.rpc("careline_search_visits", {
      search_text: "robin.demo@example.com",
      search_scope: "mine",
    });
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
    expect(
      (
        await patient.rpc("careline_search_visits", {
          search_text: "robin.demo@example.com",
          search_scope: "clinic",
        })
      ).error?.code,
    ).toBe("42501");
    const clinic = await doctor.rpc("careline_search_visits", {
      search_text: "alex.demo@example.com",
      search_scope: "clinic",
    });
    expect(clinic.error).toBeNull();
    expect(clinic.data).toEqual(own.data);
    const profile = await patient
      .from("careline_patients")
      .select("phone")
      .single();
    expect(profile.error).toBeNull();
    const phone = await doctor.rpc("careline_search_visits", {
      search_text: profile.data!.phone.replace(/(\d{3})/g, "$1 "),
      search_scope: "clinic",
    });
    expect(phone.error).toBeNull();
    expect(phone.data).toEqual(own.data);
    expect(
      (
        await guest.rpc("careline_search_visits", {
          search_text: "alex.demo@example.com",
          search_scope: "mine",
        })
      ).error,
    ).not.toBeNull();
    const literal = await doctor.rpc("careline_search_visits", {
      search_text: "%_' OR 1=1 --",
      search_scope: "clinic",
    });
    expect(literal.error).toBeNull();
    expect(literal.data).toEqual([]);
  } finally {
    await patient.auth.signOut();
    await doctor.auth.signOut();
  }
});
