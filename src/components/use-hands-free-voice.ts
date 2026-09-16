"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  active: boolean;
  paused: boolean;
  onSpeechStart: () => void;
  onAudio: (audio: Blob) => Promise<void>;
  onError: (message: string) => void;
};

/** Local voice activity detection. Silence never triggers a paid transcription. */
export function useHandsFreeVoice(options: Options) {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [listening, setListening] = useState(false);
  const [hearingSpeech, setHearingSpeech] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const requestVersion = useRef(0);
  const discardRecording = useRef<(() => void) | null>(null);
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const stop = useCallback(() => {
    requestVersion.current++;
    discardRecording.current?.();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    setMedia(null);
    setListening(false);
    setHearingSpeech(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    const version = requestVersion.current;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !window.MediaRecorder ||
        !window.AudioContext
      )
        throw new Error("unsupported");
      const audioContext = new AudioContext();
      context.current = audioContext;
      await audioContext.resume();
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (version !== requestVersion.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      setMedia(audio);
    } catch {
      if (version !== requestVersion.current) return;
      stop();
      callbacks.current.onError(
        "Microphone unavailable. Allow microphone access and choose Enable microphone, or continue by typing.",
      );
    }
  }, [stop]);

  useEffect(
    () => () => {
      requestVersion.current++;
      discardRecording.current?.();
      stream.current?.getTracks().forEach((t) => t.stop());
      void context.current?.close().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (!media || !options.active || options.paused || !context.current) {
      setListening(false);
      setHearingSpeech(false);
      media?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      return;
    }
    let cancelled = false;
    let frame = 0;
    let recorder: MediaRecorder | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let accepted = false;
    const discard = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (recorder?.state === "recording") recorder.stop();
      source?.disconnect();
    };
    discardRecording.current = discard;
    // Echo cancellation stays enabled, including during assistant playback.
    const timer = setTimeout(() => {
      if (cancelled || !context.current) return;
      try {
        media.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
        source = context.current.createMediaStreamSource(media);
        const analyser = context.current.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        const begin = () => {
          if (cancelled) return;
          accepted = false;
          const chunks: Blob[] = [];
          const r = new MediaRecorder(media, {
            ...(mimeType ? { mimeType } : {}),
            audioBitsPerSecond: 64000,
          });
          recorder = r;
          const beganAt = performance.now();
          let lastVoiceAt = beganAt;
          let voiceFrames = 0;
          let hasSpeech = false;
          r.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          r.onerror = () => {
            stop();
            callbacks.current.onError(
              "Microphone recording stopped. Enable it again or continue by typing.",
            );
          };
          r.onstop = () => {
            if (cancelled) return;
            if (!accepted) {
              begin();
              return;
            }
            setListening(false);
            setHearingSpeech(false);
            const blob = new Blob(chunks, { type: r.mimeType });
            void callbacks.current.onAudio(blob).catch(() => {
              stop();
              callbacks.current.onError(
                "Could not process that turn. Enable the microphone to retry, or type instead.",
              );
            });
          };
          r.start();
          setListening(true);
          const check = () => {
            if (cancelled || r.state !== "recording") return;
            analyser.getFloatTimeDomainData(samples);
            const rms = Math.sqrt(
              samples.reduce((sum, value) => sum + value * value, 0) /
                samples.length,
            );
            const now = performance.now();
            if (rms > 0.018) {
              voiceFrames++;
              lastVoiceAt = now;
              if (voiceFrames >= 6 && !hasSpeech) {
                hasSpeech = true;
                setHearingSpeech(true);
                callbacks.current.onSpeechStart();
              }
            } else if (!hasSpeech) {
              voiceFrames = 0;
            }
            // A natural pause ends a turn. A long silent room only resets the local buffer.
            if (
              (hasSpeech && now - lastVoiceAt > 850) ||
              now - beganAt > 29000
            ) {
              accepted = hasSpeech;
              r.stop();
              return;
            }
            frame = requestAnimationFrame(check);
          };
          frame = requestAnimationFrame(check);
        };
        begin();
      } catch {
        stop();
        callbacks.current.onError(
          "Automatic listening is unavailable in this browser. Please continue by typing.",
        );
      }
    }, 80);
    return () => {
      clearTimeout(timer);
      discard();
      media.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      if (discardRecording.current === discard) discardRecording.current = null;
    };
  }, [media, options.active, options.paused, stop]);

  return { enabled: Boolean(media), listening, hearingSpeech, start, stop };
}
