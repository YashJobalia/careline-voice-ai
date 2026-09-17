import { request } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { loadEnvFile } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to test the hosted database with disposable fictional accounts.",
  );
loadEnvFile(".env.local");
const ids: string[] = [];
async function main() {
  const client = await request.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  });
  const email = `careline-test-${randomUUID()}@example.com`;
  const originalPassword = `Test-${randomUUID()}aA1!`;
  const nextPassword = `Next-${randomUUID()}aA1!`;
  const details = {
    name: "Disposable Test Patient",
    email,
    phone: "+13125550999",
    dateOfBirth: "1990-02-03",
    gender: "Non-binary",
  };
  async function post(path: string, data: unknown) {
    const r = await client.post(path, { data });
    assert.equal(r.status(), 200, `${path}: ${r.status()} ${await r.text()}`);
    return r.json();
  }
  async function change(args: unknown) {
    const draft = await post("/api/workspace", { action: "prepare", args });
    const result = await post("/api/workspace", {
      action: "confirm",
      token: draft.pending.token,
    });
    if ((args as { action: string }).action === "update_profile") {
      const replay = await client.post("/api/workspace", {
        data: { action: "confirm", token: draft.pending.token },
      });
      assert.equal(
        replay.status(),
        409,
        "Confirmed profile drafts must be single use",
      );
    }
    return result;
  }
  try {
    await post("/api/auth", {
      action: "signup",
      ...details,
      password: originalPassword,
    });
    let user = (await (await client.get("/api/auth")).json()).user;
    ids.push(user.id);
    assert.equal(user.gender, "Non-binary");
    assert.equal(user.role, "patient");
    const updated = await change({
      action: "update_profile",
      ...details,
      name: "Updated Test Patient",
      gender: "",
    });
    assert.equal(updated.receipt.title, "Account details updated");
    user = (await (await client.get("/api/auth")).json()).user;
    assert.equal(user.name, "Updated Test Patient");
    assert.equal(user.gender, null);
    const bad = await client.post("/api/auth", {
      data: {
        action: "password",
        currentPassword: "Wrong-password!",
        password: nextPassword,
        confirmPassword: nextPassword,
      },
    });
    assert.equal(bad.status(), 400);
    await post("/api/auth", {
      action: "password",
      currentPassword: originalPassword,
      password: nextPassword,
      confirmPassword: nextPassword,
    });
    await post("/api/auth", { action: "signout" });
    await post("/api/auth", {
      action: "signin",
      email,
      password: nextPassword,
    });
    const slots = (await (await client.get("/api/clinic")).json()).slots;
    assert.ok(slots.length >= 2);
    const booked = await change({
      action: "book",
      slotId: slots[0].id,
      notes: {
        concern: "Fictional test",
        duration: "One day",
        severity: "Mild",
        context: "Disposable integration fixture",
      },
    });
    assert.equal(booked.receipt.title, "Appointment booked");
    assert.ok(
      booked.receipt.fields.find(
        (f: { label: string }) => f.label === "Reference",
      ),
    );
    const visits = (
      await post("/api/workspace", {
        action: "list_appointments",
        args: { scope: "mine" },
      })
    ).appointments;
    const moved = await change({
      action: "reschedule",
      id: visits[0].id,
      slotId: slots[1].id,
    });
    assert.equal(moved.receipt.title, "Appointment rescheduled");
    assert.ok(
      moved.receipt.fields.some(
        (f: { label: string }) => f.label === "Previous time",
      ),
    );
    const cancelled = await change({
      action: "cancel",
      id: visits[0].id,
      reason: "Integration test cleanup",
    });
    assert.equal(cancelled.receipt.title, "Appointment cancelled");
    const noProof = await client.post("/api/account/recovery", {
      data: {
        action: "complete",
        password: originalPassword,
        confirmPassword: originalPassword,
      },
    });
    assert.equal(noProof.status(), 401);
    // Exercise the post-email endpoint using a server-signed fixture proof.
    // This checks session binding and one-use cookies, not email delivery.
    const state = await client.storageState();
    const cookieValue = state.cookies
      .filter((c) => /^sb-.*-auth-token(?:\.\d+)?$/.test(c.name))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      )
      .map((c) => c.value)
      .join("");
    const authSession = JSON.parse(
      Buffer.from(cookieValue.slice("base64-".length), "base64url").toString(),
    );
    const claims = JSON.parse(
      Buffer.from(
        authSession.access_token.split(".")[1],
        "base64url",
      ).toString(),
    );
    for (const wrong of [true, false]) {
      const body = Buffer.from(
        JSON.stringify({
          kind: "recovery",
          userId: wrong ? randomUUID() : user.id,
          sessionId: claims.session_id,
          exp: Date.now() + 600000,
        }),
      ).toString("base64url");
      const proof = `${body}.${createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url")}`;
      const recovering = await request.newContext({
        baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
        storageState: {
          ...state,
          cookies: [
            ...state.cookies,
            {
              name: "careline-recovery",
              value: proof,
              domain: "127.0.0.1",
              path: "/",
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
        },
      });
      const recoveryState = await recovering.storageState();
      try {
        const r = await recovering.post("/api/account/recovery", {
          data: {
            action: "complete",
            password: originalPassword,
            confirmPassword: originalPassword,
          },
        });
        assert.equal(r.status(), wrong ? 401 : 200);
        if (!wrong) {
          assert.equal(
            (
              await recovering.post("/api/account/recovery", {
                data: {
                  action: "complete",
                  password: nextPassword,
                  confirmPassword: nextPassword,
                },
              })
            ).status(),
            401,
          );
          const replay = await request.newContext({
            baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
            storageState: recoveryState,
          });
          try {
            assert.equal(
              (
                await replay.post("/api/account/recovery", {
                  data: {
                    action: "complete",
                    password: nextPassword,
                    confirmPassword: nextPassword,
                  },
                })
              ).status(),
              401,
              "Replaying the original recovery cookie must fail",
            );
          } finally {
            await replay.dispose();
          }
        }
      } finally {
        await recovering.dispose();
      }
    }
    await post("/api/auth", {
      action: "signin",
      email,
      password: originalPassword,
    });
    await post("/api/auth", { action: "signout" });
    const generated = await change({
      action: "register",
      ...details,
      email: `careline-test-${randomUUID()}@example.com`,
    });
    assert.ok(generated.credentials.password.length >= 24);
    assert.equal(generated.receipt.title, "Account created");
    ids.push((await (await client.get("/api/auth")).json()).user.id);
    await post("/api/auth", { action: "signout" });
    await post("/api/auth", { action: "signin", ...generated.credentials });
    console.log(
      "PASS: manual/AI registration, profile edits, current-password checks, new-password login, booking/reschedule/cancel receipts, recovery requires proof.",
    );
  } finally {
    await client
      .post("/api/auth", { data: { action: "signout" } })
      .catch(() => {});
    await client.dispose();
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/disposable-account-ids.json", JSON.stringify(ids));
    console.log(JSON.stringify({ disposableAccountIds: ids }));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
