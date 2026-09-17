import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test.skip(
  process.env.RUN_LIVE_WORKSPACE !== "1",
  "Opt in to hosted account lookup checks.",
);

test("guest lookup returns only exact match status, preserves access restrictions and enforces its budget", async () => {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (
      await client.rpc("careline_lookup_account", {
        contact: "alex.demo@example.com",
        contact_type: "email",
      })
    ).error,
  ).not.toBeNull();
  expect((await client.auth.signInAnonymously()).error).toBeNull();
  try {
    const lookup = (contact: string, contact_type = "email") =>
      client.rpc("careline_lookup_account", { contact, contact_type });
    const found = await lookup(" ALEX.DEMO@EXAMPLE.COM ");
    expect(found.error).toBeNull();
    expect(found.data).toEqual({ status: "found" });
    const phone = await lookup("+1 (312) 555-0101", "phone");
    expect(phone.error).toBeNull();
    expect(phone.data).toEqual({ status: "found" });
    const missing = await lookup("not-a-careline-account@example.invalid");
    expect(missing.error).toBeNull();
    expect(missing.data).toEqual({ status: "not_found" });
    expect((await lookup("alex%")).error).not.toBeNull();
    expect((await lookup("555", "phone")).error).not.toBeNull();
    const profiles = await client.from("careline_patients").select("*");
    expect(profiles.data).toEqual([]);
    expect(
      (
        await client.rpc("careline_search_visits", {
          search_text: "alex.demo@example.com",
          search_scope: "clinic",
        })
      ).error,
    ).not.toBeNull();
    for (let i = 0; i < 7; i++)
      expect(
        (await lookup("not-a-careline-account@example.invalid")).data.status,
      ).toBe("not_found");
    expect((await lookup("alex.demo@example.com")).data).toEqual({
      status: "rate_limited",
    });
  } finally {
    await client.auth.signOut();
  }
});
