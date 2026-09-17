"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/workspace";
import type { Message } from "@/lib/clinic";
import { completedToolCalls, decodeToolArguments } from "@/lib/workspace-tool";
import { type ReplyLanguage } from "@/lib/voice-language";
import { actionActivity, type ActionActivity } from "@/lib/action-activity";
export function useRealtimeVoice(options: {
  replyLanguage: ReplyLanguage;
  onMessage: (message: Message, ownerId: string) => void;
  onEffect: (effect: ActionResult) => Promise<void>;
  beforeAction: () => Promise<void>;
  onError: (message: string) => void;
  onTrace: (activity: ActionActivity) => void;
}) {
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });
  const [status, setStatus] = useState("Ready when you are");
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [active]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const pending = useRef<{ token: string; turn: number } | null>(null);
  const turn = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    channel.current?.close();
    peer.current?.close();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    peer.current = null;
    stream.current = null;
    channel.current = null;
    audio.current = null;
    pending.current = null;
    setActive(false);
    setConnecting(false);
    setMuted(false);
    setSpeakerMuted(false);
    setElapsedSeconds(0);
    setStatus("Ready when you are");
  }, []);
  useEffect(() => stop, [stop]);
  const send = useCallback((event: unknown) => {
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify(event));
  }, []);
  const start = useCallback(async () => {
    stop();
    const version = generation.current;
    setConnecting(true);
    setStatus("Connecting live voice...");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (version !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const pc = new RTCPeerConnection();
      peer.current = pc;
      const output = new Audio();
      output.autoplay = true;
      audio.current = output;
      pc.ontrack = (e) => {
        output.srcObject = e.streams[0];
        void output
          .play()
          .catch(() =>
            callbacks.current.onError(
              "Audio playback was blocked. End and restart the call.",
            ),
          );
      };
      media.getTracks().forEach((t) => pc.addTrack(t, media));
      let ownerId = "";
      const dc = pc.createDataChannel("oai-events");
      channel.current = dc;
      dc.onopen = () => {
        if (version !== generation.current) return;
        setConnecting(false);
        setActive(true);
        setStatus("Listening - speak in any supported language");
        send({
          type: "response.create",
          response: {
            instructions: `Introduce yourself briefly as Mira, CareLine's voice assistant, in ${callbacks.current.replyLanguage}, their selected reply language. Ask how you can help. Do not take actions yet. Understand input in any language, but keep replies in the selected language.`,
          },
        });
      };
      let chain = Promise.resolve();
      dc.onmessage = (e) => {
        chain = chain
          .then(async () => {
            if (version !== generation.current) return;
            const event = JSON.parse(e.data);
            if (event.type === "input_audio_buffer.speech_started") {
              turn.current++;
              setStatus("Listening...");
            }
            if (event.type === "input_audio_buffer.speech_stopped")
              setStatus("Thinking...");
            if (
              event.type ===
                "conversation.item.input_audio_transcription.completed" &&
              event.transcript
            )
              callbacks.current.onMessage(
                { role: "user", content: event.transcript },
                ownerId,
              );
            if (
              event.type === "response.output_audio_transcript.done" &&
              event.transcript
            )
              callbacks.current.onMessage(
                {
                  role: "assistant",
                  content: event.transcript.replace(/[\u2013\u2014]/g, "-"),
                },
                ownerId,
              );
            if (event.type === "output_audio_buffer.started")
              setStatus("Speaking - you can interrupt");
            if (event.type === "output_audio_buffer.stopped")
              setStatus("Listening...");
            if (event.type === "error")
              callbacks.current.onError(
                event.error?.message || "Voice connection error.",
              );
            const calls = completedToolCalls(event);
            for (const call of calls) {
              const tick = performance.now();
              let result: unknown;
              let action = "";
              let actionArgs: Record<string, unknown> = {};
              try {
                if (call.name !== "careline_action")
                  throw new Error("Unknown action");
                const args = decodeToolArguments(call.arguments);
                action = args.action;
                actionArgs = args.args;
                if (
                  args.action === "confirm" &&
                  (!pending.current ||
                    pending.current.token !== args.token ||
                    turn.current <= pending.current.turn)
                )
                  throw new Error(
                    "Ask for confirmation and wait for the next user turn first.",
                  );
                await callbacks.current.beforeAction();
                const r = await fetch("/api/workspace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: args.action,
                    args: args.args,
                    token: args.token || undefined,
                  }),
                });
                const effect = await r.json();
                if (!r.ok) throw new Error(effect.error);
                if (effect.pending)
                  pending.current = {
                    token: effect.pending.token,
                    turn: turn.current,
                  };
                if (args.action === "confirm") pending.current = null;
                await callbacks.current.onEffect(effect);
                const { credentials, ...safe } = effect;
                result = {
                  ...safe,
                  ...(credentials
                    ? { credentialsDeliveredPrivately: true }
                    : {}),
                };
              } catch (err) {
                result = {
                  error: err instanceof Error ? err.message : "Action failed",
                };
              }
              callbacks.current.onTrace(
                actionActivity(
                  action,
                  actionArgs,
                  result,
                  performance.now() - tick,
                  "voice",
                ),
              );
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: call.call_id,
                  output: JSON.stringify(result),
                },
              });
            }
            if (calls.length) send({ type: "response.create" });
          })
          .catch(() =>
            callbacks.current.onError(
              "Could not process a voice event. Please retry.",
            ),
          );
      };
      pc.onconnectionstatechange = () => {
        if (
          version === generation.current &&
          ["failed", "disconnected"].includes(pc.connectionState)
        ) {
          stop();
          callbacks.current.onError(
            "Voice disconnected. Please start a new call.",
          );
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      abort.current = new AbortController();
      const r = await fetch("/api/realtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "X-Reply-Language": callbacks.current.replyLanguage,
        },
        body: offer.sdp,
        signal: abort.current.signal,
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error);
      }
      ownerId = r.headers.get("X-Careline-User") || "";
      const sdp = await r.text();
      if (version !== generation.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (e) {
      if (version !== generation.current) return;
      stop();
      callbacks.current.onError(
        e instanceof Error ? e.message : "Microphone unavailable.",
      );
    }
  }, [send, stop]);
  function toggleMute() {
    const value = !muted;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
    setMuted(value);
  }
  function setDraft(token?: string) {
    pending.current = token ? { token, turn: turn.current } : null;
  }
  function toggleSpeaker() {
    if (!audio.current) return;
    audio.current.muted = !audio.current.muted;
    setSpeakerMuted(audio.current.muted);
  }
  async function updateReplyLanguage(replyLanguage: ReplyLanguage) {
    if (!active) return;
    const version = generation.current;
    const r = await fetch("/api/realtime", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyLanguage }),
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Could not change the reply language.");
    if (version !== generation.current) return;
    if (channel.current?.readyState !== "open")
      throw new Error(
        "Voice connection is unavailable. Please restart the call.",
      );
    send({
      type: "session.update",
      session: { type: "realtime", instructions: data.instructions },
    });
  }
  return {
    status,
    active,
    connecting,
    muted,
    speakerMuted,
    elapsedSeconds,
    toggleSpeaker,
    start,
    stop,
    toggleMute,
    send,
    setDraft,
    updateReplyLanguage,
  };
}
