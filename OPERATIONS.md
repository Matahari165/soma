# Soma operations

## Launch gate

Production is ready only after these checks use a deployed URL and a real account:

1. Google-only sign-in completes and creates one profile.
2. Google Health consent shows only the documented read-only scopes.
3. A Google Health synchronization produces raw records, daily metrics, scores, and visible freshness timestamps that agree on the same civil dates.
4. A second test account cannot read, update, or delete the first account's rows.
5. The authorized webhook handshake returns 200/201, its unauthenticated challenge returns 401/403, and one signed notification returns 204 after creating an idempotent sync job.
6. Soma Coach cites the correct dates and no write executes before confirmation.
7. Export includes all pages of user data and excludes OAuth token ciphertext.
8. Account deletion removes the Auth user and every cascading user row.
9. Chrome/Safari desktop and iPhone Safari pass the main flows without console errors.

## Deployment

- Use Vercel Hobby for the personal, non-commercial production application.
- Use Supabase Free while storage and database limits are sufficient.
- Preview deployments must use an isolated Supabase project or remain unavailable to users.
- Apply database migrations before deploying application code that depends on them.
- Keep a copy of the previous deployment and record the migration filename before each release.

## Background synchronization

Supabase Cron calls `/api/cron/sync` every five minutes as a lightweight worker. This polling does not contact Google by itself. Soma creates at most one automatic Lab refresh per connection and completed UTC hour. High-volume raw streams are handled by Google Health webhooks and the initial history import; the hourly reconciliation prioritizes sleep, recovery, effort, and the other user-facing metrics. A user-requested manual import starts immediately after the API response and the worker provides retry/recovery.

Apply `supabase/setup/schedule_sync.sql` after every application URL or `CRON_SECRET` rotation. The per-slot database uniqueness constraint in `20260822160000_journal_and_hourly_sync.sql` is the final guard against duplicate automatic imports.

## Backups and recovery

- Before any destructive migration, create and verify a Supabase database backup or logical export.
- Never copy OAuth token ciphertext without also protecting the encryption key separately.
- Test a restore into a non-production project before relying on it.
- User export is not an operational database backup.

## Lossless raw health archives

- Keep the latest 7 days of minute-level heart-rate records online; daily metrics and all other historical series remain in PostgreSQL.
- Archive older heart-rate records by closed-open UTC day as private, lossless `jsonl+gzip` objects in the Cloudflare R2 `soma-health-record-archives` bucket.
- The daily Vercel cron migrates one legacy Supabase Storage archive and archives one eligible live day. Supabase objects remain as safety copies until a separate verified cleanup.
- Run `archive`, then `verify`, then `reclaim` with `scripts/archive-heart-rate.mjs`; never skip the full verification pass.
- Each manifest records the row count, date bounds, compressed and logical SHA-256 hashes, and reclamation time.
- After reclamation, run `VACUUM (FULL, ANALYZE)` on `health_records` during maintenance and verify a representative archive can still be decoded.

## Monitoring

Review daily in production:

- failed or stuck `sync_jobs`;
- failed `webhook_events`;
- provider connections in `expired`, `revoked`, or `error` state;
- Coach 429/503 rates and xAI usage;
- database size, especially minute-level heart-rate records;
- account export and deletion failures.

Do not log raw health payloads, authorization headers, cookies, or OAuth tokens.

## Incident procedure

1. Stop the affected integration or temporarily disable the affected route.
2. Revoke exposed credentials at Google, Supabase, xAI, or Vercel.
3. Preserve sanitized logs and identify affected user IDs and time range.
4. Restore service with rotated secrets and a reviewed patch.
5. Inform affected users clearly if their personal data may have been exposed.
6. Record cause, impact, remediation, and a preventive test.

## Cost controls

- Soma Coach runs only on user request; deterministic briefs do not require AI.
- Coach sends daily summaries, not raw provider payloads.
- Watch Supabase storage before enabling all-history imports for many users.
- Set provider usage alerts before a public launch.
- xAI is usage-based and is not assumed to be free.

## Known external limits

The repository cannot prove Google approval, real Fitbit data availability, provider credentials, or production callbacks by itself. Those checks require the account owner and deployed secrets.
