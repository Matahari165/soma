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
8. Account deletion removes the D1 user, sessions, every owned row, and every owned R2 archive.
9. Chrome/Safari desktop and iPhone Safari pass the main flows without console errors.

## Deployment

- Use Cloudflare Workers, D1, and R2 for the personal production application.
- Keep the legacy Vercel project as a redirect-only compatibility endpoint. It must never execute Soma application routes, OAuth callbacks, or scheduled jobs.
- Keep directly analyzed rows in D1 and complete immutable source exports in private R2.
- Preview deployments must use isolated D1/R2 resources or remain unavailable to users.
- Apply `cloudflare/migrations` before deploying application code that depends on them.
- Keep a copy of the previous deployment and record the migration filename before each release.

## Background synchronization

The custom Cloudflare Worker calls `/api/cron/sync` every minute. This polling does not contact Google by itself. Soma creates at most one automatic Lab refresh per connection and completed UTC hour. Google Health webhooks can trigger faster targeted imports, and a user-requested manual import starts immediately after the API response.

After changing the application URL or `CRON_SECRET`, redeploy the Worker and trigger `/cdn-cgi/handler/scheduled` in a non-production environment to verify the scheduled handler.

## Backups and recovery

- Before any destructive migration, export D1 and verify the private R2 source archive and its SHA-256 manifest.
- Never copy OAuth token ciphertext without also protecting the encryption key separately.
- Test a restore into a non-production project before relying on it.
- User export is not an operational database backup.

## Lossless raw health archives

- Keep normalized WHOOP records, daily Google Health metrics, journal entries, and computed results directly queryable in D1.
- Keep the complete original wearable export as a private, immutable `.tar.zst` object in the R2 `soma-health-record-archives` bucket.
- Upload the adjacent `SHA256SUMS`, inventory, and verification report with the archive; verify the local SHA-256 before and after every migration.
- R2 is the lossless source archive, not a substitute for D1 rows used by the Personal Lab. Never delete D1 history merely because an R2 copy exists.

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
2. Revoke exposed credentials at Google, Cloudflare, xAI, or the previous host.
3. Preserve sanitized logs and identify affected user IDs and time range.
4. Restore service with rotated secrets and a reviewed patch.
5. Inform affected users clearly if their personal data may have been exposed.
6. Record cause, impact, remediation, and a preventive test.

## Cost controls

- Soma Coach runs only on user request; deterministic briefs do not require AI.
- Coach sends daily summaries, not raw provider payloads.
- Watch D1 database size and R2 stored bytes before enabling all-history imports for additional users.
- Set provider usage alerts before a public launch.
- xAI is usage-based and is not assumed to be free.

## Known external limits

The repository cannot prove Google approval, real Fitbit data availability, provider credentials, or production callbacks by itself. Those checks require the account owner and deployed secrets.
