# Soma

Soma is a responsive health and fitness web application that turns Google Health data into clear Sleep, Recovery, and Effort guidance.

The product and architecture are defined in [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md).

## Product status

Soma is a live, account-based application. In production, Google authentication, Google Health ingestion, personal scores, alerts, correlations, Soma Coach, workout persistence, export, and deletion all use the signed-in user's real data. An explicit `SOMA_LOCAL_PREVIEW=true` development mode provides labelled sample data without contacting external services.

## Local setup

Requirements:

- Node.js 24 or later
- pnpm 11 or later

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
pnpm verify
```

This runs linting, TypeScript checks, unit tests, and a production build.

## Production setup

1. Create a Supabase project and configure Google as its only sign-in provider.
2. Apply every file in `supabase/migrations` in filename order. Database functions used by the API are versioned there with their service-role permissions.
3. Add the environment variables from `.env.example` to the deployment; generate `TOKEN_ENCRYPTION_KEY` as a base64-encoded 32-byte key and `CRON_SECRET` as a random value of at least 16 characters.
4. Register these callbacks:
   - Google OAuth client for Supabase Auth: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
   - Supabase redirect allow list: `https://YOUR-DOMAIN/auth/callback`
   - Google Health OAuth: `https://YOUR-DOMAIN/api/health/google/callback`
   - Google Health webhook: `https://YOUR-DOMAIN/api/health/webhook`
5. Add the deployed home, privacy, and terms URLs to Google Auth Platform, publish the OAuth audience to production, and complete the applicable branding and data-access verification.
6. Create a Google Health subscriber with automatic subscriptions for the supported data types. Configure its `endpointAuthorization.secret` to exactly match `GOOGLE_HEALTH_WEBHOOK_SECRET`; the value should include its scheme, for example `Bearer …`.
7. Run `supabase/setup/schedule_sync.sql` after replacing its two placeholders. This uses Supabase Cron every minute. The included Vercel Hobby cron is a free daily safety net because Hobby does not support frequent schedules.

## Architecture

- Next.js 16 and React 19 for one responsive desktop/iPhone web app.
- Supabase Postgres/Auth for the lowest-complexity multi-user foundation.
- Row-level security plus server-side ownership checks for every user resource.
- Encrypted Google OAuth tokens; token tables and Coach action proposals are service-role only.
- Deterministic score and alert engines run before AI explanations.
- OpenAI Responses API with `gpt-5.6-luna`, structured output, `store: false`, and summarized context.
- Every Coach write is stored as a preview and requires explicit confirmation.

## Operational documentation

- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md): product decisions and phased plan.
- [OPERATIONS.md](./OPERATIONS.md): launch, backup, monitoring, incident, and cost checklist.
- [SECURITY.md](./SECURITY.md): security model and reporting guidance.

Never commit `.env.local` or provider secrets.
