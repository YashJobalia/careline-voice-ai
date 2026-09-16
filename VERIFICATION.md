# Verification — September 16, 2026

Production: https://careline-sandy.vercel.app

## Hands-free voice

- Browser test used synthetic microphone audio with real Chrome capture, MediaRecorder encoding, and local voice activity detection. Two turns submitted automatically without record-button clicks; mute and end stopped all microphone tracks. Model/transcription endpoints were mocked in this browser-control test.
- A separate funded OpenAI test passed the complete registration-to-booking journey; real transcription passed with a synthetic speech sample.
- TypeScript and the Next.js production build passed. Physical microphone behavior and room-noise thresholds still need user-device testing.

## Guest registration and appointment codes

- Guest start, explicit registration consent, declined/tampered/cross-session confirmation rejection, patient-ID login, code format, code persistence, and cancellation verified in browser/API tests with fictional data.
- Registration UI testing uses a mocked model response; real Supabase Auth, Edge Function, database, signed confirmations, and scheduling APIs are exercised.
- After API funding, a real OpenAI conversation completed guest registration, symptom discussion, availability lookup, appointment proposal, confirmation, and code display. The synthetic voice sample also passed real OpenAI transcription.
- Guest sessions are intentionally permitted, with ownership RLS. The shared demo password is unsuitable for real patient data.

## Single-experience UI update

- Removed the practice/guided selector; conversations use the OpenAI route.
- TypeScript and production build passed.
- Three local browser tests passed: single-experience responsive layout, account booking lifecycle, and booking security/concurrency.

## Previous deployment checks (before single-experience UI update)

- TypeScript strict type checking and Next.js production build.
- Five scheduling conversation tests: booking proposal, department correction, unavailable slot, emergency wording, and name preservation.
- Production browser tests: practice booking/cancellation and responsive layout with no horizontal overflow.
- Production account tests: login, profile update, saved appointment, reload persistence, cancellation, and logout.
- Production privacy tests: a second account cannot read or cancel another account's booking.
- Production concurrency tests: two confirmations for one slot produce exactly one successful booking and one conflict.
- Tampered confirmation tokens, cross-account tokens, unauthenticated appointment access, and cross-origin mutations are rejected.
- Browser console check on the deployed homepage: no errors.
- Runtime production dependency audit: zero reported vulnerabilities at verification time. Development tooling is separate.

## External setup / verification remaining

- Earlier OpenAI quota errors were resolved after funding. Live conversation and synthetic-audio transcription tests passed.
- Supabase Auth confirmation email delivery was not tested using a real mailbox. Configure Site URL and allowed redirect URL for the deployed domain in Supabase Auth settings.
- Real microphone capture and voice quality require a user-device check. Microphone/voice activity detection depends on device and room noise; text input works as a fallback.
- Supabase's leaked-password protection remains disabled in project settings. Row-level security is enabled. The quota table intentionally has no direct public policies; only the bounded authenticated quota function can change it.

The isolated test accounts use `example.test` addresses. Their credentials live only in ignored `.env.test.local`; all test appointments were cancelled. No real patient records were used.

## Request limits removed

The app no longer checks the daily per-visitor or global quota for chat, transcription, or registration. The conversation UI continues beyond 24 messages using a rolling API context window. Technical payload constraints and provider limits still apply.

## Independent text chat

Browser verification passed typing before, during, and after a voice call, preserving the same transcript. Text-only replies do not turn on microphone capture or speech playback.


Voice warmth update: replaced OS speech synthesis with OpenAI Coral TTS. Live local speech endpoint returned 200 audio/mpeg (80,256 bytes). Browser tests passed with real PCM playback: successive hands-free turns, microphone mute/end, and typing before/during/after calls. Prompt now emphasizes specific empathy, natural doctor/time choices and timezone clarification only when needed. Physical microphone and subjective voice quality still require user listening.


Interruption and latency update: synthetic microphone interrupted a 10-second reply; subsequent turns and mute/end passed (21 seconds). Text-chat regression passed. Real OpenAI streaming audio played in Chrome and stopped on end call. Shortened endpointing from 1.4s to 0.85s and microphone startup from 450ms to 80ms; server and supported clients stream MP3 rather than buffer the entire reply. Exact stressed/current-chest-pain prompt returned urgent guidance with no registration or appointment proposal. Initial combined browser run timed out at microphone re-enable during a page reload; isolated rerun passed. Real speaker-to-microphone echo performance remains hardware dependent.
