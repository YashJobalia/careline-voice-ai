# Workspace verification - September 17, 2026

## Passed

- 30 deterministic tests, including registration contact validation, unique generated passwords, explicit manual passwords, guest identity preservation, role spoof rejection, and compensation after an auth upgrade failure.
- TypeScript checking and optimized Next.js production build.
- Three browser tests: default voice page and restored history; doctor calendar and notes; manual booking intake and self-doctor exclusion; AI calendar navigation; password/sign-out controls; mobile width.
- Three live hosted integration tests: role and ownership enforcement, signed token tampering and cross-user reuse, visit notes, doctor reschedule requests, atomic moves, cancellation reasons, private history, sign-out, manual and AI-generated password changes.
- Direct Supabase RLS checks: cannot assign oneself doctor access, spoofing editable user metadata has no authorization effect, cannot insert an appointment for another owner, doctor self-booking fails at the database trigger, cannot cancel another patient's appointment or overwrite their transcript.
- Real OpenAI text conversation: asked a follow-up about symptom duration, then prepared a notes-bearing appointment after intake; a later explicit confirmation created the appointment and returned its actual code. Test booking was removed afterward.
- Real Spanish text request navigated to the October calendar.
- Real OpenAI Realtime WebRTC session connected and played an assistant response.
- Synthetic Spanish microphone input triggered a real Realtime tool call and opened the September calendar without ending the call. Reproduced a JSON-string/object tool-argument mismatch, fixed it, and added regression tests. Cancelled/incomplete voice responses cannot execute their tool calls.
- Fresh desktop/mobile browser loads: no console or page errors; no horizontal overflow at 390px. The first screenshot attempt ran before hydration finished and induced Playwright's temporary caret-style mismatch; waiting for the enabled start button eliminated that test artifact.

## Hindi transcription and voice UI refresh

- Realtime input transcription now uses `gpt-4o-transcribe` with Hindi/Hinglish Devanagari guidance. No fixed language code is set. Explicit Urdu requests and other languages remain supported in the instructions.
- A real WebRTC test with synthetic Hindi microphone input produced `मुझे सितंबर 2026 की मेरी अपॉइंटमेंट्स का कैलेंडर दिखाइए।` and opened the September calendar through an actual tool call. The test checks Devanagari presence and absence of Arabic script.
- The Spanish microphone regression also opened the correct calendar. Both calls stayed active through navigation, with no browser errors.
- Voice UI has a contrasting call panel, session state, clickable conversation starters, automatic transcript text direction and responsive spacing. Desktop and 390px mobile screenshots were inspected, with no horizontal overflow. TypeScript and all three workspace browser tests passed.
- Run `npm run eval:realtime -- --live --hindi` for the Hindi check or omit `--hindi` for Spanish. These use paid APIs and restore the demo account's saved history afterward. Synthetic checks do not guarantee accuracy for every speaker or accent.

## Reply language, mobile layout and PWA

- The final behavior uses a Reply language dropdown with English as the default. Input language stays automatic; selected output language is sent to both the text API and Realtime session. Active calls accept instruction updates without reconnecting.
- Phone navigation now sits at the bottom with safe-area padding. Desktop, 390px and 320px layouts were checked with no horizontal overflow.
- All five browser checks passed, including default English, sending selected Hindi with English text, manifest/icons, offline reload, network-only API behavior and online recovery.
- Chrome's `Page.getInstallabilityErrors` returned an empty array in a regular persistent browser profile. Incognito profiles intentionally report `in-incognito`.
- The production build and 30 unit tests passed. Physical iPhone/Android home-screen installation still needs a device check over HTTPS; the website remains local.
- All five browser checks also passed against the production server. Hindi microphone input with English selected produced a Devanagari input transcript, an English spoken response and the correct September calendar, with no browser errors. English microphone input with Hindi selected also produced a Hindi response; that first run exposed a missing favicon, which was added and checked at HTTP 200. A fresh mobile production page reported no browser errors.

## Registration setup resolved

The updated registration Edge Function was subsequently deployed as version 3 and verified with disposable manual and AI-created accounts. See [the latest reliability verification](reliability-verification.md) for account recovery, confirmation replay protection and GPT-Realtime-2 tests.

## Scope

### Call interface refresh

The green call panel now identifies Mira, shows connection-driven elapsed time, displays actual speaking/listening status and includes microphone mute, output-audio mute and end-call controls. The speaking bars are a state indicator, not an amplitude measurement. Desktop and phone screenshots were inspected with no horizontal overflow. The live Hindi microphone verification exercised the timer and both mute controls before navigating to the calendar successfully. All five workspace browser checks and TypeScript passed. Both author credits link to `https://yashjobalia.com` with `target="_blank"` and `rel="noopener noreferrer"`.

Website changes remain local. The owner explicitly authorized resetting hosted accounts. The reset removed 28 old users, their sessions and appointment records, followed by the account/notes/history schema migration and four fresh demo accounts. No Vercel deployment was made during this workspace rebuild.

The Supabase advisor reports no new definer/search-path findings. Anonymous-access notices correspond to owner-bound guest/profile/history policies; the service-only usage table intentionally has no public policy. Guest sessions must retain their own transcript during account upgrade.

Synthetic speech and deterministic tests do not establish production medical suitability or universal language accuracy. No email/SMS delivery is configured; credentials are displayed in the browser and reschedule requests appear in appointments.
