"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Heart,
  LayoutDashboard,
  LogOut,
  Mic,
  Phone,
  PhoneOff,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  departments,
  doctors,
  doctorFor,
  formatSlot,
  greeting,
  type Appointment,
  type Message,
  type Proposal,
  type Slot,
} from "@/lib/clinic";
type User = { id: string; email: string; name: string };
type View = "reception" | "appointments" | "specialists" | "account";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function CarelineApp() {
  const [view, setView] = useState<View>("reception");
  const [user, setUser] = useState<User | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Proposal>();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [liveReady, setLiveReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [cancelId, setCancelId] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callVersion = useRef(0);
  const sending = useRef(false);
  const refresh = useCallback(async () => {
    const clinic = await api<{ slots: Slot[]; liveReady: boolean }>(
      "/api/clinic",
    );
    setSlots(clinic.slots);
    setLiveReady(clinic.liveReady);
  }, []);
  const refreshBookings = useCallback(async () => {
    const result = await api<{ appointments: Appointment[] }>(
      "/api/appointments",
    );
    setBookings(result.appointments);
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      api<{ user: User | null; liveReady: boolean }>("/api/auth"),
      api<{ slots: Slot[]; liveReady: boolean }>("/api/clinic"),
    ])
      .then(([auth, clinic]) => {
        if (!mounted) return;
        setUser(auth.user);
        setProfileName(auth.user?.name || "");
        setLiveReady(auth.liveReady);
        setSlots(clinic.slots);
        if (auth.user) {
          void refreshBookings().catch((e) => setError(e.message));
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshBookings]);
  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(
    () => () => {
      callVersion.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      window.speechSynthesis?.cancel();
    },
    [],
  );
  function speak(text: string) {
    if (muted || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }
  function endCall() {
    callVersion.current++;
    setActive(false);
    setRecording(false);
    setSpeaking(false);
    setBusy(false);
    sending.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    window.speechSynthesis?.cancel();
    setProposal(undefined);
    setChoices([]);
  }
  function startCall() {
    endCall();
    setActive(true);
    setSeconds(0);
    setMessages([{ role: "assistant", content: greeting }]);
    setChoices([]);
    setError("");
    setNotice("");
    setActions([]);
    speak(greeting);
  }
  function resetConversation() {
    endCall();
    setMessages([]);
    setError("");
    setNotice("");
  }
  function openAuth() {
    setAuthError("");
    dialog.current?.showModal();
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ needsConfirmation: boolean }>(
        "/api/auth",
        "POST",
        {
          action: authMode,
          email: form.get("email"),
          password: form.get("password"),
          ...(authMode === "signup" ? { name: form.get("name") } : {}),
        },
      );
      if (result.needsConfirmation) {
        setAuthError(
          "Check your email to confirm your account, then return here and sign in.",
        );
        setAuthMode("signin");
        return;
      }
      const auth = await api<{ user: User }>("/api/auth");
      setUser(auth.user);
      setProfileName(auth.user.name);
      resetConversation();
      dialog.current?.close();
      await refreshBookings();
      setNotice(
        "You’re signed in. Your appointments will be saved to your account.",
      );
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("/api/auth", "POST", { action: "signout" });
      endCall();
      setUser(null);
      setBookings([]);
      setUnlocked(false);
      setView("reception");
      setNotice("You’ve been signed out.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send(text: string) {
    if (!text.trim() || !active || sending.current) return;
    if (messages.length >= 24) {
      setError(
        "This demo conversation has reached its limit. Start a new call.",
      );
      return;
    }
    sending.current = true;
    const version = callVersion.current;
    setBusy(true);
    setError("");
    setInput("");
    setProposal(undefined);
    setChoices([]);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const updated = [
      ...messages,
      { role: "user" as const, content: text.trim() },
    ];
    setMessages(updated);
    try {
      const result = await api<{
        text: string;
        proposal?: Proposal;
        actions: string[];
      }>("/api/chat", "POST", { messages: updated });
      if (version !== callVersion.current) return;
      setMessages([...updated, { role: "assistant", content: result.text }]);
      setProposal(result.proposal);
      setActions(result.actions);
      speak(result.text);
    } catch (e) {
      if (version === callVersion.current) setError((e as Error).message);
    } finally {
      if (version === callVersion.current) {
        setBusy(false);
        sending.current = false;
      }
    }
  }
  async function confirmBooking() {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/appointments", "POST", { token: proposal.token });
      await Promise.all([refresh(), refreshBookings()]);
      setProposal(undefined);
      setChoices([]);
      const text =
        "Your demo appointment is confirmed and saved to your account. You can find it in My appointments.";
      setMessages((v) => [...v, { role: "assistant", content: text }]);
      setNotice("Appointment confirmed.");
      speak(text);
    } catch (e) {
      setError((e as Error).message);
      void refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function toggleMic() {
    if (recording) {
      if (recorder.current?.state === "recording") recorder.current.stop();
      return;
    }
    if (!active || busy) return;
    setError("");
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const version = callVersion.current;
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version !== callVersion.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        audio.getTracks().forEach((t) => t.stop());
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        setRecording(false);
        if (version !== callVersion.current) return;
        setBusy(true);
        try {
          const type = r.mimeType.split(";")[0];
          const data = new FormData();
          data.set(
            "audio",
            new Blob(chunks, { type }),
            `recording.${type === "audio/mp4" ? "mp4" : type === "audio/ogg" ? "ogg" : "webm"}`,
          );
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: data,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          if (version === callVersion.current) {
            setBusy(false);
            if (result.text?.trim()) await send(result.text);
            else setError("No speech detected. Please try again.");
          }
        } catch (e) {
          if (version === callVersion.current) setError((e as Error).message);
        } finally {
          if (version === callVersion.current) setBusy(false);
        }
      };
      r.start();
      setRecording(true);
      recordingTimer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    } catch {
      setError(
        "Microphone access failed. Allow microphone permission or type your message.",
      );
    }
  }
  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await api("/api/session", "POST", { code });
      setUnlocked(true);
      setCode("");
      setNotice("Your receptionist is ready for the next 30 minutes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelBooking() {
    if (!cancelId) return;
    setBusy(true);
    try {
      await api("/api/appointments", "DELETE", { id: cancelId });
      await Promise.all([refreshBookings(), refresh()]);
      cancelDialog.current?.close();
      setCancelId(undefined);
      setNotice("Appointment cancelled.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visibleBookings = bookings;
  const available = slots;
  const canStart = Boolean(user && liveReady && unlocked);
  const nav = [
    { id: "reception" as const, label: "Reception", icon: Headphones },
    {
      id: "appointments" as const,
      label: "My appointments",
      icon: CalendarDays,
    },
    { id: "specialists" as const, label: "Our specialists", icon: Stethoscope },
    { id: "account" as const, label: "My account", icon: UserRound },
  ];
  const status = recording
    ? "Listening to you"
    : busy
      ? "Finding the right next step"
      : speaking
        ? "Your receptionist is speaking"
        : active
          ? "Ready when you are"
          : "Your receptionist is ready";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CareLine home">
          <span className="brand-mark">
            <Plus size={25} />
          </span>
          careline<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-label">YOUR CARE, CONNECTED</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`nav-item ${view === n.id ? "selected" : ""}`}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {view === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-icon">
            <Heart size={18} />
          </span>
          <h3>
            A little less waiting.
            <br />A little more care.
          </h3>
          <p>Find your specialist, on your schedule.</p>
          <span className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          Portfolio demo<span>v1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            CareLine Clinic <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">FICTIONAL CLINIC</span>
            {user ? (
              <button className="user-pill" onClick={() => setView("account")}>
                <span className="avatar-small">
                  {(user.name || user.email).slice(0, 1).toUpperCase()}
                </span>
                <span>{user.name || "My account"}</span>
              </button>
            ) : (
              <Button variant="outline" size="sm" onClick={openAuth}>
                Sign in <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> MULTISPECIALTY CARE, MADE SIMPLE
              </div>
              <h1>
                {view === "reception" ? (
                  <>
                    Your next appointment
                    <br />
                    <em>starts with a conversation.</em>
                  </>
                ) : view === "appointments" ? (
                  "Your care, all in one place."
                ) : view === "specialists" ? (
                  "A specialist for your next step."
                ) : (
                  "Welcome to your space."
                )}
              </h1>
              <p>
                {view === "reception"
                  ? "Tell us what you need. We’ll help you find the right department, physician, and time."
                  : view === "appointments"
                    ? "Review your upcoming visits and manage your demo appointments."
                    : view === "specialists"
                      ? "Six fictional physicians. Three specialties. One simple conversation."
                      : "Manage your profile and keep your appointments connected."}
              </p>
            </div>
            <span className="heading-seal">
              <ShieldCheck size={18} />
              Thoughtfully connected
            </span>
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert alert-success" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "reception" && (
            <>
              {!user && (
                <div className="inline-banner">
                  <UserRound size={18} />
                  <span>Sign in to save and manage your appointments.</span>
                  <Button size="sm" onClick={openAuth}>
                    Sign in
                  </Button>
                </div>
              )}
              {user && !unlocked && (
                <div className="inline-banner">
                  <Sparkles size={18} />
                  <span>
                    {liveReady
                      ? "Enter the demo access code to start your conversation."
                      : "The AI receptionist is not configured yet. Please contact the demo host."}
                  </span>
                  {liveReady && (
                    <>
                      <input
                        type="password"
                        aria-label="Demo access code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Demo access code"
                      />
                      <Button
                        size="sm"
                        onClick={unlock}
                        disabled={busy || !code}
                      >
                        Unlock
                      </Button>
                    </>
                  )}
                </div>
              )}
              <div className="reception-grid">
                <Card className="call-card">
                  <div className="card-top">
                    <span className="overline">
                      <Headphones size={15} /> YOUR VIRTUAL RECEPTIONIST
                    </span>
                    <span className="availability">
                      <span className="online-dot" />
                      {active ? "Connected" : "Available"}
                    </span>
                  </div>
                  <div className="call-center">
                    <div
                      className={`voice-orbit ${recording || speaking ? "pulsing" : ""}`}
                    >
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="voice-core">
                        <div className="waveform">
                          {[16, 30, 45, 26, 54, 36, 20].map((h, i) => (
                            <i
                              key={i}
                              style={{
                                height: h,
                                animationDelay: `${i * 0.12}s`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="orbit-star">
                        <Sparkles size={17} />
                      </span>
                    </div>
                    <span className="call-name">
                      Meet your CareLine assistant
                    </span>
                    <h2>{status}</h2>
                    <p>
                      {active
                        ? "Speak naturally, or type in the conversation panel."
                        : "A friendly voice to help you find your next appointment."}
                    </p>
                    <div className="call-duration">
                      {active
                        ? `${Math.floor(seconds / 60)
                            .toString()
                            .padStart(
                              2,
                              "0",
                            )}:${(seconds % 60).toString().padStart(2, "0")}`
                        : "No phone number. Just a conversation."}
                    </div>
                    <div className="call-controls">
                      {active ? (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={
                              muted
                                ? "Enable spoken responses"
                                : "Mute spoken responses"
                            }
                            onClick={() => {
                              setMuted((v) => !v);
                              window.speechSynthesis?.cancel();
                              setSpeaking(false);
                            }}
                          >
                            {muted ? (
                              <VolumeX size={20} />
                            ) : (
                              <Volume2 size={20} />
                            )}
                          </Button>
                          <Button
                            className={recording ? "recording-button" : ""}
                            onClick={toggleMic}
                            disabled={busy}
                          >
                            <Mic size={19} />
                            {recording ? "Stop recording" : "Click to speak"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            aria-label="End call"
                            onClick={endCall}
                          >
                            <PhoneOff size={20} />
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={startCall}
                          disabled={!canStart || loading}
                          className="start-call"
                        >
                          <Phone size={18} />
                          Start conversation
                          <ArrowRight size={17} />
                        </Button>
                      )}
                    </div>
                    <span className="audio-note">
                      {active
                        ? "Up to 30 seconds per recording."
                        : "Microphone permission is requested only when you choose to speak."}
                    </span>
                  </div>
                  <div className="call-footer">
                    <ShieldCheck size={16} />
                    <span>
                      Demo only. Use fictional patient details. No medical
                      advice.
                    </span>
                  </div>
                </Card>
                <Card className="conversation-card">
                  <div className="card-top">
                    <h2>Conversation</h2>
                    <span className="transcript-tag">LIVE TRANSCRIPT</span>
                  </div>
                  <div
                    className="transcript"
                    ref={transcript}
                    role="log"
                    aria-live="polite"
                    aria-label="Conversation transcript"
                  >
                    {messages.length === 0 ? (
                      <div className="conversation-empty">
                        <span>
                          <Headphones size={26} />
                        </span>
                        <h3>We’re here to listen.</h3>
                        <p>
                          Start a conversation and your transcript will appear
                          here.
                        </p>
                        <div className="example-query">
                          “I’d like to see a dermatologist.”
                        </div>
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div className={`message ${m.role}`} key={i}>
                          <span className="message-label">
                            {m.role === "assistant" ? "CARELINE" : "YOU"}
                          </span>
                          <p>{m.content}</p>
                        </div>
                      ))
                    )}
                    {busy && (
                      <div className="thinking">
                        <span />
                        <span />
                        <span /> One moment…
                      </div>
                    )}
                    {choices.length > 0 && !busy && (
                      <div className="quick-replies">
                        {choices.map((c) => (
                          <button key={c} onClick={() => void send(c)}>
                            {c}
                            <ArrowRight size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                    {actions.map((a, i) => (
                      <div className="tool-action" key={`${a}-${i}`}>
                        <Check size={13} />
                        {a}
                      </div>
                    ))}
                  </div>
                  <form
                    className="message-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(input);
                    }}
                  >
                    <input
                      aria-label="Message the receptionist"
                      placeholder={
                        active
                          ? "Or type your message…"
                          : "Start a conversation to begin…"
                      }
                      value={input}
                      maxLength={1000}
                      disabled={!active || busy || recording}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Button
                      size="icon"
                      aria-label="Send message"
                      disabled={!active || busy || recording || !input.trim()}
                    >
                      <Send size={17} />
                    </Button>
                  </form>
                </Card>
              </div>
              {proposal && (
                <Card className="proposal">
                  <div className="proposal-icon">
                    <CalendarDays size={25} />
                  </div>
                  <div>
                    <span className="overline">REVIEW YOUR APPOINTMENT</span>
                    <h3>{doctorFor(proposal.slot.doctor_id)?.name}</h3>
                    <p>
                      {formatSlot(proposal.slot)} · {proposal.patientName}
                    </p>
                    <small>
                      Demo booking - saved to your account after confirmation
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setProposal(undefined);
                      setChoices([]);
                      setMessages((v) => [
                        ...v,
                        {
                          role: "assistant",
                          content:
                            "What would you like to change about this appointment?",
                        },
                      ]);
                    }}
                  >
                    Change details
                  </Button>
                  <Button onClick={confirmBooking} disabled={busy}>
                    <Check size={16} />
                    Confirm appointment
                  </Button>
                </Card>
              )}
              <div className="section-heading">
                <h2>Care for every part of you.</h2>
                <button onClick={() => setView("specialists")}>
                  Meet our specialists <ArrowRight size={15} />
                </button>
              </div>
              <div className="department-grid">
                {departments.map((d, i) => (
                  <Card
                    key={d.id}
                    className={`department-card department-${i}`}
                  >
                    <div className="department-title">
                      <span className="department-icon">
                        {i === 0 ? (
                          <Heart size={22} />
                        ) : i === 1 ? (
                          <Activity size={22} />
                        ) : (
                          <Sparkles size={22} />
                        )}
                      </span>
                      <span className="doctor-count">2 physicians</span>
                    </div>
                    <h3>{d.name}</h3>
                    <p>{d.short}</p>
                    <button
                      onClick={() => {
                        setDepartmentFilter(d.id);
                        setView("specialists");
                      }}
                    >
                      Explore specialty <ArrowRight size={16} />
                    </button>
                  </Card>
                ))}
              </div>
            </>
          )}
          {view === "appointments" && (
            <>
              <div className="section-heading">
                <h2>
                  My appointments{" "}
                  <span className="count-badge">{visibleBookings.length}</span>
                </h2>
                <Button onClick={() => setView("reception")}>
                  <Plus size={16} />
                  New appointment
                </Button>
              </div>
              {!user ? (
                <Card className="empty-state">
                  <UserRound size={30} />
                  <h2>Your appointments belong to you.</h2>
                  <p>Sign in to view your saved bookings.</p>
                  <Button onClick={openAuth}>Sign in</Button>
                </Card>
              ) : visibleBookings.length === 0 ? (
                <Card className="empty-state">
                  <CalendarDays size={32} />
                  <h2>Your next chapter of care starts here.</h2>
                  <p>
                    No appointments yet. Our receptionist can help you find a
                    time.
                  </p>
                  <Button onClick={() => setView("reception")}>
                    Talk to the receptionist <ArrowRight size={16} />
                  </Button>
                </Card>
              ) : (
                <div className="appointments-list">
                  {visibleBookings.map((b) => (
                    <Card key={b.id} className="appointment-row">
                      <span className="doctor-avatar">
                        {doctorFor(b.slot.doctor_id)?.initials}
                      </span>
                      <div className="appointment-detail">
                        <h3>{doctorFor(b.slot.doctor_id)?.name}</h3>
                        <p>{doctorFor(b.slot.doctor_id)?.title}</p>
                        <span>
                          <Clock3 size={14} />
                          {formatSlot(b.slot)}
                        </span>
                        <small>Patient: {b.patient_name}</small>
                      </div>
                      <span className={`status-badge ${b.status}`}>
                        {b.status === "confirmed" ? "Confirmed" : "Cancelled"}
                      </span>
                      {b.status === "confirmed" &&
                        new Date(b.slot.starts_at) > new Date() && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCancelId(b.id);
                              cancelDialog.current?.showModal();
                            }}
                          >
                            Cancel appointment
                          </Button>
                        )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "specialists" && (
            <>
              <div className="filter-tabs">
                <button
                  className={departmentFilter === "all" ? "chosen" : ""}
                  onClick={() => setDepartmentFilter("all")}
                >
                  All specialties
                </button>
                {departments.map((d) => (
                  <button
                    key={d.id}
                    className={departmentFilter === d.id ? "chosen" : ""}
                    onClick={() => setDepartmentFilter(d.id)}
                  >
                    {d.id === "ent" ? "ENT" : d.name}
                  </button>
                ))}
              </div>
              <div className="specialist-grid">
                {doctors
                  .filter(
                    (d) =>
                      departmentFilter === "all" ||
                      d.department === departmentFilter,
                  )
                  .map((d) => (
                    <Card key={d.id} className="specialist-card">
                      <div className="specialist-top">
                        <span className="doctor-avatar large">
                          {d.initials}
                        </span>
                        <span className="availability">
                          <span className="online-dot" />
                          Demo physician
                        </span>
                      </div>
                      <h2>{d.name}</h2>
                      <p>{d.title}</p>
                      <div className="specialist-meta">
                        <CalendarDays size={16} />
                        Weekday consultations · 30 minutes
                      </div>
                      <div className="specialist-meta">
                        <Clock3 size={16} />
                        {
                          available.filter((s) => s.doctor_id === d.id).length
                        }{" "}
                        available demo slots
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setView("reception");
                          setNotice(`Ask the receptionist for ${d.name}.`);
                        }}
                      >
                        Book a consultation <ArrowRight size={15} />
                      </Button>
                    </Card>
                  ))}
              </div>
            </>
          )}
          {view === "account" &&
            (user ? (
              <Card className="account-card">
                <span className="doctor-avatar large">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
                <h2>Your profile</h2>
                <p>Your appointments are private to this account.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await api("/api/auth", "POST", {
                        action: "profile",
                        name: profileName,
                      });
                      setUser({ ...user, name: profileName });
                      setNotice("Profile updated.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Display name
                    <input
                      value={profileName}
                      minLength={2}
                      maxLength={60}
                      required
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input value={user.email} disabled />
                  </label>
                  <Button disabled={busy}>Save profile</Button>
                </form>
                <Button variant="ghost" onClick={signOut}>
                  <LogOut size={16} />
                  Sign out
                </Button>
              </Card>
            ) : (
              <Card className="empty-state">
                <Users size={32} />
                <h2>A simpler way to manage your care.</h2>
                <p>
                  Create an account to save bookings and return to them anytime.
                </p>
                <Button onClick={openAuth}>
                  Sign in or create account <ArrowRight size={16} />
                </Button>
              </Card>
            ))}
          <footer className="page-footer">
            <span>
              CARELINE <span className="footer-plus">+</span> A portfolio
              project with care at its heart.
            </span>
            <span>Central time (America/Chicago) · Fictional clinic</span>
          </footer>
        </main>
      </div>
      <dialog ref={dialog} className="auth-dialog">
        <button
          className="dialog-close"
          aria-label="Close sign in"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <span className="brand-mark">
          <Plus size={25} />
        </span>
        <h2>
          {authMode === "signin" ? "Welcome back." : "Your care starts here."}
        </h2>
        <p>
          {authMode === "signin"
            ? "Sign in to manage your CareLine appointments."
            : "Create your account for this fictional clinic demo."}
        </p>
        <form onSubmit={submitAuth}>
          {authMode === "signup" && (
            <label>
              Display name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Alex Morgan"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                authMode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={8}
              maxLength={128}
              placeholder="At least 8 characters"
            />
          </label>
          {authError && (
            <p className="form-error" role="alert">
              {authError}
            </p>
          )}
          <Button disabled={authBusy}>
            {authBusy
              ? "One moment…"
              : authMode === "signin"
                ? "Sign in"
                : "Create account"}
            <ArrowRight size={16} />
          </Button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setAuthMode((v) => (v === "signin" ? "signup" : "signin"));
            setAuthError("");
          }}
        >
          {authMode === "signin"
            ? "New to CareLine? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </dialog>
      <dialog ref={cancelDialog} className="auth-dialog">
        <h2>Cancel this appointment?</h2>
        <p>The slot will become available for another demo booking.</p>
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => cancelDialog.current?.close()}
          >
            Keep appointment
          </Button>
          <Button variant="destructive" disabled={busy} onClick={cancelBooking}>
            Confirm cancellation
          </Button>
        </div>
      </dialog>
    </div>
  );
}
