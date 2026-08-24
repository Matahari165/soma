# Soma — Product and Development Plan

> Historical implementation plan. The current approved Personal Lab behavior is defined in
> `PERSONAL_LAB.md`, which supersedes this file whenever the two disagree.

> Status: Personal Lab pivot implemented on 22 August 2026
> Product language: English only
> Initial audience: personal production use, built as a multi-user product from day one

## 1. Product vision

Soma is a responsive personal laboratory. It combines physiological data from Google Health with real-life context from Google Calendar and a configurable prior-day journal to find the conditions linked with better Deep Work, focus, energy, sleep, and recovery.

The same application must work on desktop and iPhone:

- Desktop is the primary analytics experience.
- Mobile is optimized for quick checks, alerts, and live workouts.
- There is no separate mobile product or duplicated feature set.

Unlike conventional health dashboards, the main value is not another readiness score. Soma compares the user's own days across life and health, shows interpretable effect sizes, and exposes sample size, timing, stability, and provenance. The product should feel calm, precise, personal, and non-judgmental.

### August 2026 product pivot

- **Home becomes Personal Lab:** one leading finding, today's context, the quick check-in, and evidence coverage.
- **Discoveries replace generic trends:** health-to-life and life-to-health associations are ranked by usefulness and evidence quality.
- **Deep Work comes from Calendar:** timed events explicitly marked `DW` or `Deep Work`; users can correct the daily total.
- **Privacy is structural:** Calendar event names, descriptions, attendees, and locations are never persisted.
- **No false certainty:** at least 14 paired days, at least 5 days per comparison group, split-history direction checks, and association-only language.
- Detailed Sleep, Recovery, and Activity pages remain available as the physiological atlas beneath the Lab.

## 2. Product principles

1. **Useful before impressive.** The most important change appears without requiring the user to search for it.
2. **Calculations before AI.** Deterministic code calculates scores, baselines, anomalies, and correlations. AI explains them in plain language.
3. **Context over comparison.** Scores are based primarily on the user's own history, goals, and needs, with reference ranges as guardrails.
4. **No diagnosis.** Soma is a wellness product, not a medical device. It can flag unusual changes and recommend appropriate next steps, but it must not diagnose illness.
5. **Transparent scores.** Every score must have an explanation showing its inputs, freshness, and main drivers.
6. **Multi-user by design.** Every private record belongs to one authenticated user and is protected at database level.
7. **Consent before action.** Any agent action that writes or changes data is previewed and explicitly confirmed.
8. **Keep the history.** Imported data is retained until the user deletes it. Older dense data may be compressed or archived, never silently discarded.
9. **Accessible color.** Status colors are supportive, never alarming by default, and never the only way information is communicated.

## 3. Confirmed scope

### Version 1 priorities

1. Google sign-in and onboarding.
2. Google Health connection and historical import.
3. Personal Lab home with a leading discovery, daily context, evidence coverage, and quick check-in.
4. Dedicated Sleep, Recovery, and Activity pages.
5. Discoveries across health, focus, energy, mood, Deep Work, and recorded behaviors.
6. Read-only Soma AI coach with side panel and full conversation history.
7. Customizable dashboard widgets.

### Later priorities

1. Workout program builder.
2. Live workout mode with exercise media, sets, repetitions, load, timers, and rest controls.
3. Muscular load model added to the Effort score.
4. Agent-created and agent-edited workout programs, always with confirmation.
5. Optional WHOOP-style journal.
6. Optional notifications outside Soma.

### Explicitly out of scope for the first release

- A single global “Soma score”.
- Medical diagnosis or treatment recommendations.
- Social feed, leaderboards, or public profiles.
- Native iOS application.
- Continuous Bluetooth heart-rate streaming directly from the Fitbit device.
- Automatically importing personal profile fields without confirmation.

## 4. Core experience

### 4.1 Navigation

Desktop navigation:

- Lab
- Sleep
- Recovery
- Activity
- Discoveries
- Coach
- Workouts, shown as “Coming later” until its phase begins
- Settings

Mobile navigation:

- Lab
- Sleep
- Recovery
- Activity
- More

The Coach opens as a side panel on desktop and a full-screen view on mobile. A dedicated Coach page contains the complete conversation history.

### 4.2 Personal Lab home

The first screen follows this order:

1. The strongest current within-person finding, with effect size and evidence quality.
2. A compact row for Sleep, Recovery, Deep Work, and today's check-in.
3. A 30-second check-in for energy, focus, stress, mood, caffeine, alcohol, late meals, and illness.
4. Evidence coverage and connection provenance.
5. Additional discoveries that cleared the display threshold.
6. Links to detailed physiological pages and the Soma Coach.

Detailed health measures remain in Sleep, Recovery, and Activity instead of being repeated on the home screen.

Every primary card shows:

- Score from 0 to 100.
- Plain-language status label.
- Primary metric and target.
- Change versus the relevant personal baseline.
- Data freshness.
- One clear action or next step.
- A link to the detailed page.

### 4.3 Status system

The status system uses calm, non-stigmatizing language:

- **Restorative** — high support for the current goal.
- **Steady** — within the user's expected range.
- **Building** — useful opportunity to improve.
- **Limited data** — not enough reliable data to score.

Color is paired with text, iconography, and score. Exact thresholds will be tuned after validation with real data.

## 5. Score specifications

All algorithms are versioned. When a formula changes, Soma records the algorithm version used for each daily score.

### 5.1 Sleep score

Scale: 0–100.

The score answers: “How much of my estimated sleep need did I achieve, and how supportive was the sleep pattern?”

Initial model:

- Base sleep target: **8 hours of actual sleep**.
- One primary user-defined target.
- Estimated need can reasonably rise above 8 hours when recent sleep debt or unusually high effort justifies it.
- Main factor: actual sleep duration divided by estimated sleep need.
- Supporting factors: sleep efficiency and sleep regularity.
- The score is capped at 100; sleeping longer remains visible but does not create an unlimited reward.

Initial explainable formula for product testing:

```text
estimated_need = 8h + bounded_sleep_debt_adjustment + bounded_effort_adjustment
duration_component = min(actual_sleep / estimated_need, 1)
sleep_score = 100 × (
  0.70 × duration_component +
  0.15 × efficiency_component +
  0.15 × regularity_component
)
```

The exact adjustment limits and weights are calibration parameters, not medical constants. They will be validated against real data before being presented as final.

Sleep regularity initially compares sleep and wake times with the user's recent rolling schedule, using circular time calculations so that midnight does not create false differences.

Bedtime recommendation uses:

- Next planned wake time.
- Estimated sleep need.
- Recent sleep efficiency.
- The bedtime that best preserves regularity.
- A configurable wind-down buffer.

### 5.2 Recovery score

Scale: 0–100.

The score answers: “How ready does my recent physiology appear compared with my own normal range?”

Version 1 inputs:

- Heart-rate variability.
- Resting heart rate.
- Recent sleep score and sleep debt.

Each input is normalized against the user's rolling personal baseline. Population references can provide sensible limits during onboarding, but do not replace the personal baseline.

Respiratory rate, skin temperature, and oxygen saturation may be displayed and used for anomaly alerts when available. They do not affect the first recovery formula until their availability and reliability are validated.

If essential inputs are missing or stale, Soma displays “Limited data” instead of inventing a score.

### 5.3 Effort score

Scale: 0–100 for the current day.

The score answers: “How much effort has accumulated today?” The target answers a separate question: “Is that effort appropriate for my current goal and this week?”

Version 1 effort inputs:

- Time in heart-rate zones.
- Exercise sessions.
- Active energy, when available.
- Steps and general activity as a smaller contribution.

The dashboard shows:

- Daily effort score.
- Today's recommended target zone.
- Weekly target envelope and progress.
- Whether the current day is supporting the weekly objective.

User goals influence the target, not the raw effort calculation:

- One required primary goal.
- One optional secondary goal.
- Initial personal goal: build muscle, selected during onboarding rather than hard-coded.

When workout tracking is added, resistance training volume, intensity, repetitions, load, and perceived exertion will contribute a separate muscular-load model.

## 6. Insights, alerts, and summaries

### 6.1 Deterministic insight engine

The insight engine runs before AI. It detects:

- Large changes from 7-, 30-, and 90-day personal baselines.
- Sustained changes across several days.
- Missing or stale data.
- Target deviations.
- Meaningful positive improvements.
- Multi-signal patterns, such as higher resting heart rate combined with lower HRV and shorter sleep.

Every insight stores:

- Rule and version.
- Metrics used.
- Baseline window.
- Magnitude and direction.
- Confidence level.
- Generated time.
- Whether the user dismissed or acknowledged it.

Alerts should prioritize sustained and multi-signal changes to avoid unnecessary anxiety. A single unusual measurement is normally described as an observation, not an alarm.

### 6.2 Scheduled summaries

- **Morning brief:** generated after the first reliable post-wake synchronization.
- **Evening brief:** generated relative to the recommended bedtime and the current day's effort.
- **Weekly review:** longer summary of sleep, recovery, activity, adherence, and notable correlations.
- **Live dashboard:** refreshes when new data arrives; it does not wait for a scheduled brief.

Version 1 notifications appear only inside Soma.

## 7. Correlations and trends

Initial questions include:

- Bedtime versus next-day recovery.
- Sleep duration versus next-day recovery.
- Sleep regularity versus recovery.
- Daily effort versus following-night sleep.
- Weekly activity versus resting heart rate.

Rules:

- Use paired observations only.
- Show sample size and date range.
- Require a minimum data threshold before displaying a result.
- Test same-day and sensible lagged relationships.
- Prefer Spearman correlation for non-linear or non-normal personal data.
- Label strength cautiously.
- Describe only the observed direction, effect size, sample, and measurement window.
- Never send raw minute-level series to the language model merely to calculate a correlation.

## 8. Soma Coach

### 8.1 Version 1

The first Coach is read-only. It can:

- Explain scores and changes.
- Compare periods.
- Answer questions about trends and correlations.
- Explain why a recommendation was made.
- Suggest a next step based on available data.

The Coach receives structured, minimized context prepared by the backend. It should usually receive derived daily summaries rather than raw minute-level health records.

### 8.2 Action model

Later, the Coach can use application tools to:

- Create or edit a workout program.
- Change a goal.
- Add or rearrange a dashboard widget.
- Schedule a workout.
- Start a workout.

Every write action follows:

```text
User request → proposed change → clear preview → explicit confirmation → execution → receipt
```

### 8.3 AI platform

- xAI Responses API.
- `grok-4.6` for concise interpretation, anomaly surfacing, and prioritization after deterministic calculations.
- Structured outputs for explanations and proposed actions.
- Stable pseudonymous user reference in the supplied context.
- `store: false` for health-related requests.
- No API key in browser code.
- Deterministic fallback text if the model is unavailable.

Model choice and cost are configuration, not hard-coded product assumptions. They must be rechecked before production launch.

## 9. Google Health integration

### 9.1 Data flow

```text
Fitbit device
  → Google Health / Fitbit synchronization
  → Google Health API
  → Soma ingestion service
  → normalized user-owned records
  → score and insight engine
  → dashboard and Coach context
```

Soma cannot promise second-by-second wearable updates. New records become available after the device and Google ecosystem synchronize them.

### 9.2 Authentication and authorization

Google sign-in and Google Health access are separate permissions:

- Google sign-in creates the Soma account.
- Google Health OAuth asks only for the health scopes required by enabled features.
- The connection screen explains why each category is requested.
- Tokens are stored server-side, encrypted, and never exposed to the browser.
- Disconnecting Google Health revokes or deletes stored credentials without deleting the Soma account automatically.

### 9.3 Historical import

During onboarding the user chooses:

- Last 90 days.
- All available history.

For “all history”:

1. Import the latest 90 days first so the dashboard becomes useful quickly.
2. Import older periods in background jobs.
3. Record progress and errors per period and data type.
4. Make every import idempotent so retries cannot create duplicates.

Google endpoints impose range and rate limits. The importer must paginate, use bounded date windows, retry with backoff, and respect per-user quotas.

### 9.4 Webhooks and freshness

- Subscribe to relevant Google Health webhook events.
- Verify webhook authenticity according to Google's current documentation.
- Store the event once, acknowledge quickly, and process asynchronously.
- Run a low-frequency reconciliation job because webhooks are notifications, not the canonical dataset.
- Display `last synced`, `last measured`, `processing`, `partial`, and `error` states separately.

## 10. Technical architecture

### 10.1 Initial stack

| Layer | Choice | Reason |
|---|---|---|
| Web application | Next.js + TypeScript | One responsive codebase, server routes, mature deployment path |
| Styling | Tailwind CSS + project-owned components | Fast responsive implementation without locking the product into a component vendor |
| Icons | Lucide | Consistent accessible SVG icon set |
| Database | Supabase PostgreSQL | Simple hosted SQL, row-level security, free starting tier |
| Authentication | Supabase Auth with Google | Google-only sign-in and multi-user sessions |
| Storage | Supabase Storage | Exercise media and compressed historical archives later |
| Hosting | Vercel | Simplest deployment for Next.js; free Hobby tier for personal non-commercial use |
| Background jobs | Database-backed jobs + scheduled server route initially | Avoid another paid service before scale requires it |
| AI | xAI Responses API | Structured answers and future tool actions |
| Validation | Zod | Runtime validation at external boundaries |
| Testing | Vitest + Testing Library + Playwright | Unit, component, and real-browser coverage |
| Monitoring | Structured logs first; Sentry later | Keep phase 1 free and simple |

### 10.2 Why this is the initial low-cost choice

Supabase currently provides a $0 tier with PostgreSQL, social OAuth, 500 MB of database space, and 1 GB of file storage. Vercel provides a free Hobby plan for personal non-commercial projects. This is sufficient for development and initial personal production use.

It is not a promise that a multi-user health product will remain free. Dense time-series health data grows quickly. Before opening Soma broadly, estimate storage from real imports and move to a paid plan or a dedicated time-series/archive design when needed.

### 10.3 Application boundaries

```text
Presentation
  pages, responsive layouts, charts, accessibility

Application
  use cases, permissions, Coach tools, sync orchestration

Domain
  normalized metrics, scores, baselines, insights, correlations

Infrastructure
  Supabase, Google Health, xAI, webhooks, scheduled jobs
```

Domain calculations must not import UI, Supabase, Google, or xAI code. This keeps formulas testable and replaceable.

## 11. Data model

All user-owned tables include `user_id`, timestamps, and database row-level security.

### Identity and preferences

- `profiles`: name, timezone, locale, date of birth, height, weight, sex field where required by a calculation, onboarding state.
- `health_goals`: primary goal, optional secondary goal, start date, active state.
- `sleep_preferences`: base target, wake schedule, wind-down buffer.
- `dashboard_layouts`: widget order, size, visibility, version.

### Connections and ingestion

- `provider_connections`: provider, external subject ID, encrypted token reference, scopes, status, expiry, last sync.
- `sync_jobs`: import range, data types, status, progress, attempts, error code.
- `webhook_events`: provider event ID, received time, processing state, deduplication key.
- `ingestion_checkpoints`: latest cursor or time window completed per user and data type.

### Health data

- `sleep_sessions`: start/end, asleep duration, efficiency, stages, source, source record ID.
- `daily_sleep_metrics`: duration, need, debt, regularity, score, algorithm version.
- `heart_rate_samples`: measured time, bpm, source.
- `daily_cardiovascular_metrics`: resting heart rate, HRV, zones, source and coverage.
- `activity_sessions`: type, start/end, energy, distance, heart-rate summary, source record ID.
- `daily_activity_metrics`: steps, active energy, zone minutes, effort score, target bounds.
- `daily_recovery_metrics`: recovery score, normalized inputs, data quality, algorithm version.
- `body_measurements`: weight and other manually entered or imported measurements.

### Analysis and Coach

- `insights`: type, severity, status, evidence payload, rule version, generated text.
- `correlation_results`: variables, lag, method, coefficient, sample size, date range, quality status.
- `briefs`: morning, evening, or weekly; deterministic facts and optional AI explanation.
- `coach_threads`: title, timestamps.
- `coach_messages`: role, minimized context reference, content, model metadata.
- `agent_action_proposals`: tool, arguments, preview, confirmation state, execution receipt.

### Retention strategy

- Keep normalized daily records in PostgreSQL.
- Keep recent detailed series readily queryable.
- Preserve older detailed series in compressed, user-partitioned archives if database size becomes a constraint.
- Never delete or downsample the only copy silently.
- Provide export and deletion controls before a public launch.

## 12. Security and privacy baseline

- Row-level security on every user-owned table.
- Server-only provider tokens and API keys.
- Least-privilege Google Health scopes.
- Encryption in transit and at rest through the hosting providers.
- Additional application-level encryption for refresh tokens or a managed secret store before live Google Health use.
- No sensitive values in logs, analytics events, error messages, or client bundles.
- CSRF/state and PKCE protections for OAuth flows.
- Signed or verified webhooks and replay protection.
- Idempotency keys for imports and agent writes.
- Explicit export, disconnect, and account deletion workflows.
- Audit trail for consent, imports, and agent actions.
- No health data used for advertising.
- No selling or transferring health data.
- Review Google Health policy and required verification before external users are invited.

## 13. Data quality rules

Every analytical surface distinguishes:

- Measurement time from ingestion time.
- Fresh from stale data.
- Zero from missing data.
- Complete from partial-day data.
- Device-measured from manually entered data.
- Current algorithm from historical algorithm versions.
- Observation from interpretation.

A score is withheld when required data coverage is below its defined threshold. The interface explains what is missing and how to fix it.

## 14. Design system

### Visual direction

- Light-first, with dark mode support planned in the foundation.
- Warm neutral canvas, crisp white or softly tinted surfaces.
- Deep ink text, restrained teal accent, calm blue/green status colors.
- No neon gradients, glass overload, or aggressive red health states.
- Rounded but not childish.
- Compact data density on desktop; comfortable touch targets on mobile.
- Charts optimized for interpretation, not decoration.

### Typography and layout

- Clear sans-serif interface font.
- Tabular numerals for metrics.
- Minimum 16 px body text on mobile.
- 44 px minimum touch targets.
- Responsive checks at 375, 768, 1024, and 1440 px.
- Keyboard-visible focus and full keyboard navigation.
- Reduced-motion support.
- WCAG AA contrast target.

### Charts

- Line chart for trends.
- Range band for target zones and baselines.
- Dot/strip plot for sleep regularity.
- Scatter plot with cautious trend line for correlations.
- Stacked duration bar for sleep stages.
- Never use a gauge when a number plus target comparison is clearer.

## 15. Development phases

### Phase 1 — Foundation and dashboard shell

Goal: a production-shaped application that can be opened on desktop and iPhone, even before external credentials exist.

Deliverables:

- Next.js/TypeScript project and quality tooling.
- English design tokens and responsive application shell.
- Desktop sidebar and mobile bottom navigation.
- Today dashboard with the three fixed score cards, Soma summary, insights, and honest empty states before the first import.
- Source/freshness/data-quality states represented in the UI model.
- Initial domain types and score contracts.
- Supabase client boundaries and environment template.
- First multi-user SQL migration with profiles and row-level security.
- Automated unit checks and a clean production build.
- README with local setup and credential checklist.

Exit criteria:

- Works at 375 px and 1440 px without horizontal overflow.
- All visible product copy is English.
- Keyboard navigation and focus indicators work.
- No illustrative health values are shipped in the user-facing application.
- `lint`, type checking, tests, and production build pass.

### Phase 2 — Authentication and onboarding

Deliverables:

- Google-only sign-in through Supabase.
- Protected routes and session handling.
- Manual profile form.
- Primary and optional secondary fitness goal.
- Sleep target and wake schedule.
- Historical import choice: 90 days or all history.
- Consent and privacy screens.

Exit criteria:

- Two test users cannot read or modify each other's records.
- Onboarding is usable on iPhone and desktop.
- Missing profile fields degrade calculations safely.

### Phase 3 — Google Health ingestion

Deliverables:

- Separate Google Health OAuth connection.
- Token lifecycle and secure storage.
- Initial 90-day import.
- Background full-history import.
- Webhook receiver and reconciliation job.
- Normalization, deduplication, checkpoints, and sync status.
- Real data filling the existing empty-state contracts.

Exit criteria:

- Retry does not duplicate records.
- Revoked authorization produces a clear reconnect state.
- The dashboard reports measurement and sync freshness accurately.
- A complete personal import is reconciled against sample Google responses.

### Phase 4 — Scores and detailed health pages

Deliverables:

- Versioned Sleep, Recovery, and Effort engines.
- Sleep need, debt, regularity, and bedtime recommendation.
- Personal baselines and data-quality thresholds.
- Detailed Sleep, Recovery, and Activity pages.
- Explanations showing score drivers.

Exit criteria:

- Formula tests cover normal, missing, extreme, and timezone cases.
- Scores can be reproduced from stored inputs.
- No score is shown from insufficient data.

### Phase 5 — Insights, briefs, and correlations

Deliverables:

- Deterministic anomaly and positive-change rules.
- In-app insight inbox.
- Morning, evening, and weekly briefs.
- Correlation computation with lag and sample-size rules.
- Trend and correlation visualizations.

Exit criteria:

- No duplicate alert from the same evidence window.
- Single noisy readings do not create high-severity alerts by default.
- Every correlation shows method, sample size, window, and limitation.

### Phase 6 — Soma Coach

Deliverables:

- Desktop side panel, mobile full-screen Coach, full history page.
- Responses API integration using minimized structured context.
- Read-only analysis tools.
- Citations back to Soma metrics and dates.
- Model failure, timeout, and cost controls.

Exit criteria:

- Coach answers are grounded in stored Soma evidence.
- The model cannot access another user's context.
- The interface clearly separates calculated facts from AI interpretation.

### Phase 7 — Custom dashboard

Deliverables:

- Widget catalogue.
- Reorder, hide, restore, and resize supporting widgets.
- Layout synchronized per user.
- Agent layout proposals with confirmation.

### Phase 8 — Workout builder and live mode

Deliverables:

- Exercise library with licensed or original media.
- Programs, exercises, sets, repetitions, weight, rest, and notes.
- Mobile live workout mode with timer, pause, add/subtract time, and progress.
- Session history and personal records.
- Muscular-load contribution to effort targets.
- Coach tools for program creation and editing with preview and confirmation.

### Phase 9 — Production readiness

Deliverables:

- Real-account browser test on desktop Safari/Chrome and iPhone Safari.
- Privacy policy, terms, consent history, export, and deletion.
- Google verification and policy review.
- Backups, monitoring, error reporting, and incident procedure.
- Storage and AI cost budgets.
- Accessibility and security review.

## 16. Testing strategy

- **Unit tests:** score formulas, baselines, correlations, date/time logic, validation.
- **Database tests:** constraints, idempotency, and row-level security between two users.
- **Contract tests:** saved Google Health response fixtures and xAI structured-output schemas.
- **Component tests:** score states, missing data, stale data, and interactions.
- **End-to-end tests:** onboarding, connection state, dashboard, widget changes, Coach confirmation.
- **Visual tests:** 375, 768, 1024, and 1440 px; light and dark themes when enabled.
- **Real integration checks:** real Google account, real synchronized Fitbit data, deployed callback URLs.

Mock tests are necessary but never sufficient proof that OAuth, webhooks, or real device synchronization work.

## 17. Environments and deployment

- `local`: local development against an isolated Supabase project.
- `preview`: one Vercel deployment per branch or pull request, isolated from production data.
- `production`: personal application with live credentials and explicit access control.

Environment variables are documented in `.env.example`. Secrets are configured only in local untracked files and provider dashboards.

Database changes are versioned as migrations. Production migrations require backup and rollback planning once real health data exists.

## 18. Cost plan

### Initial expected fixed cost

- Supabase Free: $0/month within current limits.
- Vercel Hobby: $0/month for personal, non-commercial use within current limits.
- GitHub: $0/month for the current repository plan if within GitHub limits.
- xAI API: usage-based and not assumed to be free.
- Domain: optional and paid separately.

### Cost controls

- Keep AI analysis on demand or on meaningful events, not every measurement.
- Cache briefs and explanations.
- Send derived daily summaries instead of dense raw data.
- Limit context by relevant date range.
- Track tokens and estimated cost per feature.
- Compress old dense measurements while preserving them.
- Add a hard monthly AI budget before enabling scheduled AI summaries.

Pricing and free-tier limits can change and must be rechecked before launch.

## 19. Major risks and mitigations

| Risk | Mitigation |
|---|---|
| Google Health scopes or approval block access | Validate one real account early in Phase 3; keep fixtures and provider boundary isolated |
| Wearable sync is not truly real time | Show measurement and sync freshness; use webhooks plus reconciliation; avoid “live” claims |
| Free database fills with dense heart-rate data | Measure bytes per imported day; partition and compress older detailed records; budget paid storage before a multi-user release |
| Scores appear medically authoritative | Explain inputs and uncertainty; version formulas; withhold low-quality scores; use wellness language |
| AI hallucinates causes or advice | Ground it in structured facts, label interpretation, restrict tools, and provide deterministic fallbacks |
| Too many alerts create anxiety | Require magnitude, duration, confidence, and prioritization; support dismiss and feedback |
| Timezones break sleep days | Store instants in UTC and user timezone separately; test daylight-saving transitions and travel |
| “All history” makes onboarding slow | Load 90 days first, backfill in background, show progress, make jobs resumable |
| Exercise media creates licensing risk | Use original, licensed, or clearly reusable media with stored provenance |

## 20. Decisions still open, but not blocking Phase 1

- Exact score weights and thresholds after testing with real personal data.
- Exact sleep-debt and effort adjustment limits.
- Which Bryan Johnson/Blueprint habits are evidence-supported enough to become optional recommendations. They will not define the core physiological scores without independent validation.
- Whether old minute-level samples stay in PostgreSQL or move to compressed object archives after storage measurement.
- Dark mode launch timing.
- External notification channels.
- Commercial pricing and public launch requirements.

## 21. Definition of the first useful release

The first useful private release is complete when one real user can:

1. Sign in with Google.
2. Enter profile and goals manually.
3. Connect Google Health with explicit consent.
4. Import 90 days or all available history.
5. See fresh Sleep, Recovery, and Effort scores with understandable drivers.
6. Receive useful in-app changes and morning/evening summaries.
7. Explore trends and cautious correlations.
8. Ask the Soma Coach questions grounded in their own data.
9. Export or delete their data.

The architecture must also prove, with two accounts, that one user cannot access another user's data.

## 22. Primary technical references

- [Google Health API overview](https://developers.google.com/health/about)
- [Google Health data types](https://developers.google.com/health/data-types)
- [Google Health webhooks](https://developers.google.com/health/webhooks)
- [Google Health setup](https://developers.google.com/health/setup)
- [Google Health rate limits](https://developers.google.com/health/rate-limits)
- [Google Health developer data policy](https://developers.google.com/health/policies/health-api-developer-user-data-policy)
- [xAI Grok 4.6](https://docs.x.ai/developers/models/grok-4-6)
- [xAI Responses API](https://docs.x.ai/developers/api-reference/responses)
- [Supabase pricing](https://supabase.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [AASM adult sleep duration consensus](https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf)
