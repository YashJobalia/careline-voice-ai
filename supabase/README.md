# CareLine Supabase setup

## Hosted project

Created and initialized in **YashJobalia's Org** on 2026-09-16.

- Project: `careline-voice-ai` (`ofdidlumvcgynpdatpre`)
- Region: `us-east-2`
- Dashboard: https://supabase.com/dashboard/project/ofdidlumvcgynpdatpre
- API URL: https://ofdidlumvcgynpdatpre.supabase.co
- Applied migration: `careline_initial_schema`
- Verified: 3 departments, 6 physicians, 360 available slots.
- RLS enabled on all tables. No public policies is intentional for this server-only access model.
- User accounts and RLS policies are now enabled. The application uses a publishable key and each user's authenticated JWT; a server secret key is no longer needed.

## Reproducing in a fresh project

1. Create a free Supabase project named **careline-voice-ai** in your own organization, in a US region near your Vercel deployment.
2. Open the project's SQL editor and run `setup.sql`, then `user-accounts.sql`, then `private-functions.sql`, once each. The hosted project already has these migrations applied. Do not rerun the old bootstrap on the upgraded schema.
3. Verify the final result shows 3 departments, 6 physicians, and available slots (360 on initial setup).
4. Copy the project URL and publishable key into `.env.local` (copy `.env.example` first):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use a publishable key, not a service-role key. Do not send secrets through chat or commit `.env.local`.

The app accesses the Data API from Next.js server routes with the user's JWT. RLS restricts appointments to their owner. Public clinic data and sanitized availability are readable. A partial unique index on `slot_id` prevents double booking of confirmed appointments. Cancellation and quotas validate user identity inside private database functions. All physicians and patient names in this demo must be fictional.

The hosted database and Vercel environment have been configured. Supabase Auth's Site URL and redirect allowlist should include https://careline-sandy.vercel.app and https://careline-sandy.vercel.app/auth/callback for confirmation emails to return to the deployed app.
