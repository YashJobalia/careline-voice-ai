"use client";
import { useState } from "react";
import type { Account, Mutation } from "@/lib/workspace";
import { RecoveryForm } from "./recovery-form";
export function AccountWorkspace({
  user,
  section,
  initialEmail,
  onAuth,
  onPrepare,
  onPassword,
}: {
  user: Account | null;
  section?: string;
  initialEmail?: string;
  onAuth: (value: Record<string, string>) => Promise<void>;
  onPrepare: (p: Mutation) => void;
  onPassword: (value: Record<string, string>) => Promise<void>;
}) {
  const [signup, setSignup] = useState(section === "signup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState(section === "recovery");
  async function submit(form: HTMLFormElement, password = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = Object.fromEntries(new FormData(form)) as Record<
        string,
        string
      >;
      if (password && data.password !== data.confirmPassword)
        throw new Error("Passwords do not match.");
      await (password
        ? onPassword(data)
        : onAuth({ ...data, action: signup ? "signup" : "signin" }));
      if (password) {
        form.reset();
        setNotice("Password changed.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (recovery)
    return (
      <>
        <button className="secondary-action" onClick={() => setRecovery(false)}>
          Back to account
        </button>
        <RecoveryForm />
      </>
    );
  return (
    <section className="workspace-panel">
      <h2>
        {user
          ? "Account details"
          : signup
            ? "Create your account"
            : "Welcome back"}
      </h2>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!user ? (
        <>
          <div className="segmented">
            <button aria-pressed={!signup} onClick={() => setSignup(false)}>
              Sign in
            </button>
            <button aria-pressed={signup} onClick={() => setSignup(true)}>
              Create account
            </button>
          </div>
          <form
            className="workspace-form inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            {signup && (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={60}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Date of birth
                  <input
                    name="dateOfBirth"
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Phone with country code
                  <input
                    name="phone"
                    type="tel"
                    placeholder="+13125550101"
                    pattern="\+[1-9][0-9]{7,14}"
                    required
                    autoComplete="tel"
                  />
                </label>
              </>
            )}
            {signup && (
              <label>
                Gender (optional)
                <input
                  name="gender"
                  maxLength={60}
                  placeholder="How you describe your gender"
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={initialEmail || ""}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={signup ? 10 : 1}
                maxLength={128}
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            {signup && (
              <p>
                Use fictional details. This creates a patient account. Doctor
                access is assigned separately.
              </p>
            )}
            <button disabled={busy} className="primary-action">
              {busy ? "Please wait..." : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          {!signup && (
            <button
              className="secondary-action"
              onClick={() => setRecovery(true)}
            >
              Forgot password?
            </button>
          )}
        </>
      ) : (
        <>
          <p className="account-role">
            {user.role === "doctor" ? "Doctor and patient" : "Patient"} account
          </p>
          <p>
            <strong>Sign-in email:</strong> {user.email}
          </p>
          <p>
            Keep your contact details up to date. Review changes before saving.
          </p>
          <form
            className="workspace-form inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onPrepare({
                action: "update_profile",
                name: String(f.get("name")),
                dateOfBirth: String(f.get("dateOfBirth")),
                gender: String(f.get("gender") || ""),
                phone: String(f.get("phone")),
              });
            }}
          >
            <label>
              Full name
              <input
                name="name"
                defaultValue={user.name}
                required
                minLength={2}
                maxLength={60}
              />
            </label>
            <label>
              Date of birth
              <input
                name="dateOfBirth"
                type="date"
                defaultValue={user.dateOfBirth}
                required
              />
            </label>
            <label>
              Phone with country code
              <input
                type="tel"
                name="phone"
                defaultValue={user.phone}
                required
                pattern="\+[1-9][0-9]{7,14}"
              />
            </label>
            <label>
              Gender (optional)
              <input
                name="gender"
                maxLength={60}
                defaultValue={user.gender || ""}
                placeholder="How you describe your gender"
              />
              <small>You can leave this blank.</small>
            </label>
            <button className="primary-action">Review profile changes</button>
          </form>
          <details open={section === "password"} className="account-password">
            <summary>Change password</summary>
            <form
              className="workspace-form inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget, true);
              }}
            >
              <label>
                Current password
                <input
                  type="password"
                  name="currentPassword"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  name="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <button disabled={busy} className="primary-action">
                {busy ? "Changing password..." : "Change password"}
              </button>
            </form>
            <button
              className="secondary-action"
              onClick={() => setRecovery(true)}
            >
              Forgot your current password?
            </button>
          </details>
          <div className="workspace-actions">
            <button onClick={() => onPrepare({ action: "clear_history" })}>
              Clear saved conversation
            </button>
            <button onClick={() => onPrepare({ action: "signout" })}>
              Sign out
            </button>
          </div>
        </>
      )}
    </section>
  );
}
