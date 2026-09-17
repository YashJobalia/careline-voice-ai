# Account and voice workspace

## Demo logins

All four deliberately fictional accounts use password: `CarelineDemo!2026`.

| Email | Account |
| --- | --- |
| alex.demo@example.com | Patient, upcoming dermatology visit and a past visit |
| robin.demo@example.com | Patient, upcoming cardiology follow-up |
| maya.demo@example.com | Dr. Maya Shah, dermatologist and patient of another doctor |
| arjun.demo@example.com | Dr. Arjun Patel, cardiologist |

Doctor accounts can see all clinic appointments in Doctor panel. My appointments always shows that user's own patient appointments. Public signup cannot choose a doctor role.

The optional, explicitly invoked fixture seed is supabase/demo-accounts.sql. It never overwrites existing accounts. The seed uses generated IDs and fictional contacts; its shared published password is only for these four demo fixtures. New AI accounts use cryptographically random passwords.

## Data and permissions

The existing careline_patients table is now the shared account profile table, including account_type and an optional unique doctor_id. Role assignment is protected by column grants; editable auth user_metadata is never trusted for authorization.

Appointments contain concern/duration/severity/context notes, cancellation reason, and a reschedule-request flag/reason. An upcoming requested visit retains its slot until the patient reschedules or someone with permission cancels it. No email or SMS notification is sent; requests appear in the patient's appointment list and calendar.

RLS limits patients to their records and allows doctors to read clinic appointments. A private, narrowly scoped RPC supports cancellation and reschedule requests. A database trigger blocks doctor self-booking, including attempts through older endpoints. The existing atomic move RPC preserves the original appointment if another caller takes the destination slot.

careline_conversations stores up to 200 recent transcript messages per user. Text turns include the last 40 messages as context; Realtime sessions receive the last 30. This is recent conversation continuity, not unlimited or summarized lifetime memory. No raw microphone recordings or generated passwords are saved in conversation history. Passwords are displayed privately in the current browser session. Users can clear their transcript from My account.

The migration 20260917063318_account_roles_conversation_workspace.sql was applied after the user-authorized reset of the old demo accounts and appointments. Its new required contact columns assume an empty profile table; backfill required contact data before applying it to an unrelated populated project.

## Server and client

- src/components/careline-workspace.tsx: voice-first shell, transcript, confirmations, and navigation.
- src/components/use-realtime-voice.ts: WebRTC connection, media cleanup, interruptions, transcripts, and tool events.
- src/components/appointment-workspace.tsx: list/calendar, booking intake, cancellation, and rescheduling.
- src/components/account-workspace.tsx: authentication, profile, password, and sign-out controls.
- src/app/api/realtime/route.ts: server-authenticated SDP exchange. The permanent OpenAI key never reaches the browser.
- src/app/api/assistant/route.ts: text tool loop, prior context, credential redaction, and confirmation gate.
- src/lib/workspace-server.ts: one validated action layer used by manual UI, text AI, and voice AI.
- src/lib/workspace-agent.ts: tool contract, role-aware instructions, language switching, and intake guidance.
- src/app/api/conversations/route.ts: owner-bound transcript persistence.

## Registration setup

Registration supports either a local server-only SUPABASE_SERVICE_ROLE_KEY or the updated supabase/functions/register-patient/index.ts Edge Function. The function derives the user ID from the guest JWT, validates all details, inserts a patient profile, upgrades the existing guest account, and generates a unique password when none is supplied. The Next.js server signs in automatically, preserving the same user ID and conversation.

This portfolio demo activates accounts without email verification or delivery. It is intentionally not a production clinical identity-verification system. Login and user-chosen passwords use private form inputs; asking by voice to change a password generates a new password for the private credential card after confirmation.

## Voice behavior

Browser voice uses GPT-Realtime-2 by default with low reasoning effort and semantic VAD at automatic eagerness. Input language is detected automatically. The Reply language dropdown independently controls spoken and typed replies, with English selected on a fresh page. Changing the dropdown during a call updates the session instructions for subsequent responses. Supported-language quality varies; there is no promise of equal accuracy for every language or accent. WebRTC requires microphone permission and a secure origin (localhost is supported). A browser may require a click to allow microphone access or audio playback; the AI cannot grant those browser permissions.

The model receives audio and produces audio directly. Transcriptions are parallel events for display and history, rather than the primary speech-to-text/model/text-to-speech pipeline. Text input is disabled during a live call to avoid two independent model sessions racing. End the call to continue by typing.

Try: 'Show my October calendar', 'Read the notes for my next appointment', 'Help me book a dermatologist', 'Change my phone number', 'Generate a new password', or 'Sign me out'. Doctors can also say 'Show all clinic appointments' and 'Ask this patient to reschedule'. All saved changes require review and explicit confirmation.
