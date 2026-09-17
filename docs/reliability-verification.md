# Account and voice reliability

## Implemented

- Private reset-password request and completion forms, reachable from sign-in and My account. Mira can open recovery or prepare a reset-email request for explicit confirmation.
- PKCE email callback establishes a signed, HttpOnly, ten-minute recovery proof bound to the authenticated user and session. Completion rejects missing, expired or mismatched proof, claims it once in the database and removes the cookie after success. Replaying a copied original cookie is also rejected.
- Current-password changes explicitly verify the existing credentials. The hosted Auth service ignored the documented `current_password` parameter during a negative test, so the application does not depend on that option.
- Profile updates preserve omitted gender, permit clearing it, and refresh account form values after AI changes.
- Structured receipts show action, appointment reference, doctor, local time and timezone. Moving an appointment also shows its previous time. Reschedule requests explicitly say the existing slot remains reserved.
- Confirmation tokens are single use via a private database claim protected by auth.uid(). After an uncertain network result, inspect current data and prepare a fresh draft; do not replay mutations automatically. The claim occurs before the write and is retained even if the write fails. Claims are capped at 60 per user per hour; old claims are pruned on the user's next claim.
- Voice uses GPT-Realtime-2 by default with low reasoning effort, automatic semantic turn detection, exact-field clarification and explicit tool-result grounding. `OPENAI_REALTIME_MODEL` remains an override.
- Thirty-five-second connection timeout, eight-second transient disconnect grace period, microphone-specific errors, closed-channel handling, duplicate tool-call suppression, stale-call guards and a typing fallback.
- Successful tool results and receipts survive a subsequent text-model failure. UI refresh failures do not turn a completed mutation into a failed-action claim.

## Verification performed

- Unit tests cover receipts, activity privacy, schema validation, permissions and interrupted tool events.
- Browser tests cover forgot-password access, password mismatch, denied microphone, duplicate voice tool events, transient disconnect recovery and closed-channel typing fallback.
- Hosted disposable-account integration tests cover manual and AI registration, optional gender, profile edits, incorrect current-password rejection, new-password login, appointment booking/rescheduling/cancellation receipts and repeated-confirmation rejection.
- Recovery endpoint tests use a server-signed fixture proof bound to a real test session: another user's proof is rejected, a valid proof changes the password, a consumed cookie cannot be reused, and the new password logs in. This simulates the post-email step; it does not claim an email was received.
- A reset request for a nonexistent address returns the non-enumerating response. No actual mailbox delivery was tested.
- Real Hindi microphone audio through GPT-Realtime-2 opened the requested September calendar, responded in selected English, kept the call active and produced no browser errors.
- Disposable test accounts are removed after verification. Existing demo account history is restored by the voice test.

## Hosting setup and limits

Add the deployed `/auth/callback` URL and local test callback URLs to Supabase Auth's allowed redirect URLs. Configure SMTP for reliable reset delivery to non-team addresses. Open PKCE reset links in the browser where the request was made. Email receipt and cross-device reset links have not been verified.

The hosted registration function and single-use confirmation migration are active. Website changes in this pass are local until separately pushed/deployed. No accuracy percentage is claimed; the voice test is one integration scenario, not a broad accent or multilingual benchmark.

Sources: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting), [semantic turn detection](https://developers.openai.com/api/docs/guides/realtime-vad).
