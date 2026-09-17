import { loadEnvFile } from "node:process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

try {
  loadEnvFile(".env.local");
} catch {}
if (!process.argv.includes("--live"))
  throw new Error(
    "This uses paid speech APIs. Run npm run eval:audio -- --live to generate and transcribe synthetic fixtures.",
  );
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");

const fixtures = [
  {
    id: "english-correction",
    language: "en",
    reference:
      "I would like a dermatology appointment next Tuesday. Actually, make that Wednesday after two.",
    entities: ["dermatology", "wednesday", "two"],
  },
  {
    id: "spanish-hours",
    language: "es",
    reference: "Quiero una cita de dermatología el miércoles por la tarde.",
    entities: ["dermatologia", "miercoles"],
  },
  {
    id: "hindi-time",
    language: "hi",
    reference: "मुझे बुधवार को दोपहर के बाद डॉक्टर से मिलने का समय चाहिए।",
    entities: ["बुधवार", "डॉक्टर"],
  },
];
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
// Entity matching treats the spoken time “two” and its digit spelling as equivalent;
// WER below remains lexical and reports that substitution.
const normalizeEntity = (text: string) =>
  normalize(text).replace(/\btwo\b/g, "2");
function wer(reference: string, hypothesis: string) {
  const a = normalize(reference).split(" "),
    b = normalize(hypothesis).split(" ");
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    previous = row;
  }
  return previous[b.length] / a.length;
}
async function main() {
  mkdirSync("artifacts/audio-eval", { recursive: true });
  const results = [];
  for (const fixture of fixtures) {
    const path = `artifacts/audio-eval/${fixture.id}.wav`;
    if (!process.argv.includes("--reuse")) {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "coral",
          response_format: "wav",
          input: fixture.reference,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          `Fixture speech generation failed (${response.status})`,
        );
      writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    }
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(readFileSync(path))], { type: "audio/wav" }),
      `${fixture.id}.wav`,
    );
    form.set("model", "gpt-4o-mini-transcribe");
    // Automatic language detection matches the application's default.
    const started = performance.now();
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(`Transcription failed (${response.status})`);
    const { text } = (await response.json()) as { text: string };
    const entityRecall =
      fixture.entities.filter((entity) =>
        normalizeEntity(text).includes(normalizeEntity(entity)),
      ).length / fixture.entities.length;
    results.push({
      ...fixture,
      transcript: text,
      wordErrorRate: wer(fixture.reference, text),
      entityRecall,
      transcriptionMs: Math.round(performance.now() - started),
    });
    console.log(
      `${fixture.id}: WER ${wer(fixture.reference, text).toFixed(3)}, entity recall ${entityRecall.toFixed(2)}`,
    );
  }
  writeFileSync(
    "artifacts/evaluation-audio.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        limitations:
          "Synthetic TTS audio only, not real accents, noisy rooms, microphone capture or end-to-end voice latency. Human recordings and listening review remain necessary.",
        results,
      },
      null,
      2,
    ),
  );
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
