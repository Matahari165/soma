# Backend latency optimizations — 26 September 2026

## Product behavior

- Activity initially reads the three latest workouts. The existing default 30-day filter still applies. Using any workout filter loads the complete 180-day window once, including pagination beyond 500 workouts. All existing period and activity filters operate on that window. A failed history request shows an error and Retry; it never becomes an empty result silently.
- Nutrition streams the recipe library independently. The journal, score, and trends still wait for their required inputs and retain the existing calculations. A recipe failure remains local to the library.
- Settings resolves the profile independently of the health connection. The connection shows its loading state rather than a premature “Not connected” or Connect action.
- The Activity period menu remains above animated sibling sections while open. Streamed recipe sections join scroll reveals only after their client component hydrates.

## Backend work

- Supabase reads project selected JSON fields on the server. Additional fields required for local filters and ordering stay available internally. Full-row fallback preserves strict missing-key/null comparisons.
- Exact compatible counts use HEAD and Content-Range. Unsupported filters retain local counting. Bounded reads paginate across the REST page cap rather than truncating requested ranges.
- Session and user are joined in one live request. The session must exist, have an existing user, and remain unexpired after the request completes. There is no cross-request authentication cache.
- Latest health records, sync diagnostics, and health coverage use server-only SQL aggregate functions. Coverage preserves timezone and wearable-window rules, including Whoop mirrors and later wearable changes. Missing measurements remain distinct from explicit zero.
- Meal cron selects due recoverable failures and expired unmarked purges. Successfully purged failures receive a terminal marker; failed R2 purges remain recoverable. Photo snapshot IDs constrain cleanup, including an explicitly empty snapshot. The queue consumer no longer repeats the cron's retry scan.
- Strongest Effects uses a dedicated matrix path, versioned cache and revision checks. Cache/source/history timing is separate. Secondary persistence runs after the response via Next.js `after`.

## Evidence and limits

The production audit observed 248,774 GET requests to generic storage in a 24-hour window; 214,336 concerned meals and their child tables. Thirty-five expired failed analyses already had no remaining unpurged photos. The implementation addresses this repeated work; these figures are a baseline, not a measured post-deployment improvement.

Local regression tests check bounded opening reads, complete pagination, authenticated ownership, independent recipe loading, storage projections/counts, expired sessions, SQL coverage fixtures, and retry/purge recovery. SQL fixtures run against an isolated Postgres-compatible database. Browser checks use local demo data and synthetic intercepted responses; they do not validate an authenticated production account.

No production data was changed and no production migration was applied. Local development timings include compilation and are not production benchmarks. Production gains must be measured after release.

## Release order and production verification

1. Review and apply `supabase/migrations/20260926133630_backend_read_aggregates.sql` through the approved database workflow. The file creates indexes using normal CREATE INDEX; assess locking and schedule appropriately for the live table. New functions are invoker-security and executable only by service_role.
2. Merge the reviewed application branch after green CI. Soma deploys automatically on Vercel. Do not deploy the application to Cloudflare.
3. Verify matrix cache hit/miss, invalidation after a journal/meal/target change, local-day rollover and all analysis periods. Confirm unchanged results using the same input snapshot.
4. With the existing test account, compare repeated opening and filter requests on Activity, Nutrition, Settings and Analysis. Record cold/warm latency and p50/p95; record Server-Timing for matrix phases. Avoid emitting payloads, identifiers or session data into logs.
5. Compare generic storage request volumes, transferred bytes, timeout/error rates and cron reads against the audit baseline. Confirm expired failures stop recurring after their one-time terminal-marker backfill.

Aggregate RPCs fall back to existing reads if their functions are absent, allowing staged rollout. The SQL revision trigger includes nutrition_targets so changes affecting automatic journal variables invalidate cached matrices.
