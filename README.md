# Soma

Soma is a personal laboratory that links Google Health, Google Calendar, and a configurable prior-day journal to reveal the conditions behind better focus, energy, recovery, and Deep Work.

The product and architecture are defined in [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md).

## Product status

Soma is a live, account-based application. In production, Google authentication, Google Health ingestion, read-only Calendar aggregates, daily context, personal discoveries, Soma Coach, workout persistence, export, and deletion use the signed-in user's real data. An explicit `SOMA_LOCAL_PREVIEW=true` development mode provides labelled sample data without contacting external services.

The Personal Lab tests many within-person relationships but only surfaces comparisons with enough paired days, a concrete effect size, and reasonable direction stability.

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
   - Google Calendar OAuth: `https://YOUR-DOMAIN/api/calendar/google/callback`
   - Google Health webhook: `https://YOUR-DOMAIN/api/health/webhook`
5. Add the deployed home, privacy, and terms URLs to Google Auth Platform, publish the OAuth audience to production, and complete the applicable branding and data-access verification.
6. Create a Google Health subscriber with automatic subscriptions for the supported data types. Configure its `endpointAuthorization.secret` to exactly match `GOOGLE_HEALTH_WEBHOOK_SECRET`; the value should include its scheme, for example `Bearer …`.
7. Run `supabase/setup/schedule_sync.sql` after replacing its two placeholders. Supabase Cron polls the worker every five minutes. Google Health reconciliation is scheduled once per hour for every authorized data type, while webhooks can trigger faster targeted imports. Calendar aggregates refresh roughly once a day when the health queue is idle. Both can also be refreshed explicitly.

## Architecture

- Next.js 16 and React 19 for one responsive desktop/iPhone web app.
- Supabase Postgres/Auth for the lowest-complexity multi-user foundation.
- Row-level security plus server-side ownership checks for every user resource.
- Encrypted Google OAuth tokens; token tables and Coach action proposals are service-role only.
- Calendar event content is processed in memory and discarded; Soma stores only daily duration and event-count aggregates from the primary calendar.
- Deterministic score and alert engines run before AI explanations.
- xAI Responses API with `grok-4.6`, structured output, `store: false`, and summarized context.
- Every Coach write is stored as a preview and requires explicit confirmation.

## Operational documentation

- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md): product decisions and phased plan.
- [OPERATIONS.md](./OPERATIONS.md): launch, backup, monitoring, incident, and cost checklist.
- [SECURITY.md](./SECURITY.md): security model and reporting guidance.

Never commit `.env.local` or provider secrets.
