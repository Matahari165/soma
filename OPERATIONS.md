# Soma operations

## Launch gate

Production is ready only after these checks use a deployed URL and a real account:

1. Google-only sign-in completes and creates one profile.
2. Google Health consent shows only the documented read-only scopes.
3. A Fitbit synchronization produces raw records, daily metrics, scores, and visible freshness timestamps.
4. A second test account cannot read, update, or delete the first account's rows.
5. Webhook verification returns 204 and one real notification creates an idempotent sync job.
6. Soma Coach cites the correct dates and no write executes before confirmation.
7. Export includes all pages of user data and excludes OAuth token ciphertext.
8. Account deletion removes the Auth user and every cascading user row.
9. Chrome/Safari desktop and iPhone Safari pass the main flows without console errors.

## Deployment

- Use Vercel Hobby for the initial personal, non-commercial beta.
- Use Supabase Free while storage and database limits are sufficient.
- Keep preview deployments in demo mode unless they use an isolated Supabase project.
- Apply database migrations before switching a production build to live mode.
- Keep a copy of the previous deployment and record the migration filename before each release.

## Background synchronization

Google Health webhooks are the primary freshness signal. Supabase Cron calls `/api/cron/sync` every five minutes to process webhook events and resumable backfills. `vercel.json` adds one daily Vercel Hobby reconciliation because its free tier allows only one cron execution per day.

## Backups and recovery

- Before any destructive migration, create and verify a Supabase database backup or logical export.
- Never copy OAuth token ciphertext without also protecting the encryption key separately.
- Test a restore into a non-production project before relying on it.
- User export is not an operational database backup.

## Monitoring

Review daily during the private beta:

- failed or stuck `sync_jobs`;
- failed `webhook_events`;
- provider connections in `expired`, `revoked`, or `error` state;
- Coach 429/503 rates and OpenAI usage;
- database size, especially minute-level heart-rate records;
- account export and deletion failures.

Do not log raw health payloads, authorization headers, cookies, or OAuth tokens.

## Incident procedure

1. Stop the affected integration or switch the deployment back to demo mode.
2. Revoke exposed credentials at Google, Supabase, OpenAI, or Vercel.
3. Preserve sanitized logs and identify affected user IDs and time range.
4. Restore service with rotated secrets and a reviewed patch.
5. Inform affected users clearly if their personal data may have been exposed.
6. Record cause, impact, remediation, and a preventive test.

## Cost controls

- Soma Coach runs only on user request; deterministic briefs do not require AI.
- Coach sends daily summaries, not raw provider payloads.
- Watch Supabase storage before enabling all-history imports for many users.
- Set provider usage alerts before public beta.
- OpenAI is usage-based and is not assumed to be free.

## Known external limits

The repository cannot prove Google approval, real Fitbit data availability, provider credentials, or production callbacks by itself. Those checks require the account owner and deployed secrets.
