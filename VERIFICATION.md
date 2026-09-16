# Verification — September 16, 2026

Production: https://careline-sandy.vercel.app

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

- OpenAI responded with HTTP 429, `credit_balance_exhausted`. Live AI conversation and API transcription are implemented but not yet verified successfully against a funded account. Add API credit and rerun the live test.
- Supabase Auth confirmation email delivery was not tested using a real mailbox. Configure Site URL and allowed redirect URL for the deployed domain in Supabase Auth settings.
- Real microphone capture and voice quality require a user-device check. Browser speech recognition support varies; text input works as a fallback.
- Supabase's leaked-password protection remains disabled in project settings. Row-level security is enabled. The quota table intentionally has no direct public policies; only the bounded authenticated quota function can change it.

The isolated test accounts use `example.test` addresses. Their credentials live only in ignored `.env.test.local`; all test appointments were cancelled. No real patient records were used.
