# Verification record - September 17, 2026

This is a development verification record, not a production or clinical certification.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Production build | Passed |
| Unit and phone bridge integration tests | 20 passed |
| Browser tests: new conversation lab, text chat, hands-free voice | 6 passed |
| Real OpenAI/Supabase journey | Registration, booking, explicit rescheduling and cleanup cancellation passed |
| Live model evaluations (`gpt-4o-mini`) | 8/8 passed |
| Synthetic speech evaluations | English, Spanish and Hindi transcribed; target-entity recall 100% in each |
| Production dependency audit | No reported vulnerabilities (`npm audit --omit=dev`) |

The English audio fixture's lexical word error rate was 0.0714: “two” was rendered
as “2”. Spanish and Hindi fixtures had lexical WER 0. Entity matching recognizes
that English number equivalence. These are three synthetic samples, not evidence
of general accent, noise or language accuracy. French is available as a language
hint but was not included in this audio smoke test.

The hands-free browser test verifies capture, successive turns, interruption,
resuming after “mm-hmm” without a model turn, and stopping microphone tracks on
mute/end. Paid endpoints are mocked in that test. Live-model and live-database
checks are separate and are identified above.

The atomic-rescheduling migration was applied to the configured development
Supabase project. Transactional tests, rolled back afterward, verified ownership,
reference-code preservation, retry behavior and preservation of the original
booking when the replacement slot was already occupied. The browser journey also
verified that the original slot remained unchanged until explicit confirmation.

Supabase's advisor reported existing anonymous-read-policy warnings, disabled
leaked-password protection, and the intentionally inaccessible legacy usage
table. No new rescheduling-specific warning was reported. Those existing demo
authentication settings were not changed as part of voice improvements.

Phone validation was exercised locally with fixture credentials: unsigned
WebSocket connections are rejected and a signed connection must supply the
provider setup event before prompts. An actual PSTN call was **not** tested;
Twilio credentials, a number and a public WebSocket deployment are still needed.

Raw reports and screenshots are in the ignored `artifacts/` directory. See
[evaluation instructions](evaluation.md) to reproduce them. Neither subjective
conversational ratings nor real-room acoustic benchmarks have been completed.
