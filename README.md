# Soma

Soma is a personal laboratory that combines Google Health data with a configurable daily
journal to reveal the conditions associated with better sleep and recovery.

The current product direction is summarized in [PERSONAL_LAB.md](./PERSONAL_LAB.md).

## Current product

Soma is a responsive, account-based web application. Its main experience includes:

- Google authentication and Google Health synchronization;
- Sleep, Recovery, and Activity views;
- an autosaved and configurable daily journal;
- within-person relationship analysis across several time windows;
- concise AI explanations grounded only in calculated results;
- account export and deletion.

Soma is a wellness and self-observation product, not a medical device.

## Technology

- Next.js 16 and React 19
- Vercel for the Next.js application
- Supabase for application and analysis data
- Cloudflare R2 for private source archives and meal photos
- Google OAuth and Google Health
- xAI for bounded explanations after deterministic calculations

## Local development

Requirements: Node.js 24 or later and pnpm 11 or later.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Use labelled sample data locally by setting `SOMA_LOCAL_PREVIEW=true`.

## Verification

```bash
CI=true pnpm verify
```

This runs linting, TypeScript checks, tests, and a production build.

## Production

The application is deployed on Vercel at
[soma-neon-phi.vercel.app](https://soma-neon-phi.vercel.app).
Vercel deploys the connected GitHub `main` branch automatically.

```bash
pnpm db:migrate:supabase
```

The Cloudflare Worker commands are retained only for legacy recovery and are
explicitly named `preview:cloudflare` and `deploy:cloudflare`; they are not part
of the normal Soma deployment path.

Deployment credentials and provider secrets must remain outside Git. Never commit
`.env.local`, health exports, OAuth tokens, or private user data.
