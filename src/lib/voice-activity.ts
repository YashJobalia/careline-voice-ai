/** Acoustic endpointing only: this does not claim to understand semantic turn ends. */
export class VoiceActivity {
  private noise = 0.003;
  private candidateAt: number | null = null;
  private lastVoiceAt: number;
  private started = false;
  constructor(
    private beganAt: number,
    private pauseMs = 1000,
    private minSpeechMs = 160,
  ) {
    this.lastVoiceAt = beganAt;
  }
  update(rms: number, now: number) {
    const threshold = Math.max(0.014, Math.min(0.06, this.noise * 3));
    const voiced = rms > threshold;
    let speechStart = false;
    if (voiced) {
      this.candidateAt ??= now;
      this.lastVoiceAt = now;
      if (!this.started && now - this.candidateAt >= this.minSpeechMs) {
        this.started = true;
        speechStart = true;
      }
    } else {
      if (!this.started) {
        this.candidateAt = null;
        this.noise = this.noise * 0.96 + rms * 0.04;
      }
    }
    return {
      speechStart,
      done:
        (this.started && now - this.lastVoiceAt >= this.pauseMs) ||
        now - this.beganAt >= 29000,
      accepted: this.started,
      endedAt: this.lastVoiceAt,
      endpointMs: now - this.lastVoiceAt,
    };
  }
}

export function isBackchannel(text: string) {
  // Only used for a short turn that interrupted active assistant playback.
  return /^(?:mm[ -]?hmm|mhm|uh[ -]?huh|hmm|ajá|hum)[.!?,\s]*$/iu.test(
    text.trim(),
  );
}
