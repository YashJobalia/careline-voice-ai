"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  APPEARANCE_KEY,
  isAppearance,
  type Appearance,
} from "@/lib/appearance";

const AppearanceContext = createContext<{
  appearance: Appearance;
  busy: boolean;
  status: string;
  setAccountId: (id: string | null) => void;
  choose: (value: Appearance) => void;
} | null>(null);

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const revision = useRef(0);
  const owner = useRef(accountId);
  owner.current = accountId;

  function apply(value: Appearance) {
    setAppearance(value);
    const dark =
      value === "dark" ||
      (value === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  function persist(value: Appearance) {
    try {
      localStorage.setItem(APPEARANCE_KEY, value);
      return true;
    } catch {
      return false;
    }
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem(APPEARANCE_KEY);
      apply(isAppearance(saved) ? saved : "system");
    } catch {
      apply("system");
    }
    const storage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null) {
        revision.current++;
        apply(isAppearance(event.newValue) ? event.newValue : "system");
      }
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (appearance === "system") apply("system");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++revision.current;
    setStatus("");
    setBusy(Boolean(accountId));
    if (accountId) {
      void fetch("/api/preferences", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !isAppearance(data.appearance)) throw new Error();
          if (revision.current === current && owner.current === accountId) {
            apply(data.appearance);
            persist(data.appearance);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus(
              "Couldn't load your account preference. Using this browser's appearance.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }
    return () => controller.abort();
  }, [accountId]);
  async function choose(value: Appearance) {
    const current = ++revision.current;
    apply(value);
    const saved = persist(value);
    setStatus(
      saved
        ? "Saved in this browser."
        : "Applied for this visit. Browser storage is unavailable.",
    );
    if (!accountId) return;
    const savingFor = accountId;
    setBusy(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: value }),
      });
      if (!response.ok) throw new Error();
      if (revision.current === current && owner.current === savingFor)
        setStatus("Saved to your account and this browser.");
    } catch {
      if (revision.current === current && owner.current === savingFor)
        setStatus(
          saved
            ? "Saved in this browser, but account sync failed. Choose the option again to retry."
            : "Applied for this visit, but saving failed. Choose the option again to retry.",
        );
    } finally {
      if (owner.current === savingFor) setBusy(false);
    }
  }
  return (
    <AppearanceContext.Provider
      value={{ appearance, busy, status, setAccountId, choose }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider is required");
  return context;
}
