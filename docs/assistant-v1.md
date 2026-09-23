# Soma Assistant V1 — implementation contract

## Product role

Soma is an energetic, motivating and objective coach. It is not flattering by
default: every judgement must be grounded in the user's profile, personal
history, domain-specific history, current goals and—when useful—reliable
external benchmarks. Routine medical disclaimers are forbidden. If a genuinely
concerning situation appears, Soma gives a direct, situation-specific next step
without role-playing a clinician.

Responses use short sentences, useful headings, whitespace and bullets. They
lead with the verdict and the user's output. A data-grounded response always
includes a compact line such as:

> **Analyse :** 12 semaines · 18 courses · sommeil et récupération inclus

Detailed values, calculations, coverage, provenance, freshness and external
benchmarks must be available when the user asks to see them.

## V1 surface

- A dedicated conversation page immediately before `Analyse` in navigation.
- Conversation only: no unsolicited opening brief, background alert or push
  notification.
- Text and private JPEG/PNG/WebP/HEIC photo input are active, up to 4 MB in one
  upload. WebP and HEIC are normalized server-side to a format accepted by
  GPT-6 Luna. Only photos explicitly
  attached to the current message are transmitted to OpenAI; historical photos are
  not resent automatically.
- Responses render safe headings, lists and emphasis. Native charts and tables
  remain outside this conversation-only V1.
- Web search is intentionally disabled in V1. GPT-6 Luna answers from its model
  knowledge and Soma's canonical data tools; no health-derived search query is
  sent to an external search service.

## Goals and plans

- One primary direction and optional secondary directions.
- Unlimited concrete targets beneath them: distance, pace, load, body-mass,
  consistency or another natural-language target.
- A target may include baseline, target, unit, horizon, cadence, constraints and
  success criteria, but none are invented when the user has not supplied them.
- One global plan coordinates specialised running, strength, nutrition, sleep
  and recovery sections.
- The plan contains the long-term phases and only the next 1–3 weeks in precise
  detail.
- Every plan edit creates an immutable version. A direct instruction such as
  `Déplace mardi à mercredi` authorises that exact edit. Ambiguous language
  produces a proposal or one clarifying question.
- Confirmation can be natural language or a UI action. A clear answer such as
  `c'est bon, tu peux enregistrer` after a reviewed summary is sufficient; no
  exact command word is required. A correction, a question about the content,
  or conditional approval is not confirmation; an explicit request to save can
  be phrased as a question. Metrics not yet specified stay unknown, not blocking.

## Memory

- Recent messages form the working context.
- Older conversations are represented by compact summaries.
- Durable memory is structured, sourced, editable and deletable.
- Sensitive or important personal information is immediately usable in the
  current conversation but becomes durable only after confirmation.
- Only confirmed memories, goals and plan versions may be injected into later
  conversations.

## Permitted writes

The V1 assistant may write only:

1. a meal when the user's intent to record it is explicit;
2. confirmed goals;
3. confirmed plan versions;
4. confirmed memories.

All other Soma data is read-only. Meal writes are idempotent, attributable to a
user message and reversible for 24 hours through a typed compensating action.
Goals, plans and memories remain proposals until clear consent from the current
user message activates them. The server binds that consent to the authenticated
message; the assistant must compare any existing draft with the reviewed summary
before selecting it. Neither layer requires a magic phrase.

For meal recording, an omitted date means today in the user's timezone. An
omitted meal slot must be asked; it is never inferred from the current time. A
question about a meal does not record it. An explicit text instruction such as
`Enregistre une omelette pour le déjeuner` records it and exposes an undo
action. Photo-based recording uses only a photo explicitly attached to the
current message.

## Data contract

The model never receives SQL or direct database access. It uses typed tools over
canonical Soma services. Every result declares:

- requested and covered periods;
- total and returned rows;
- `hasMore`, cursor and completeness;
- timezone and units;
- source, provider and algorithm version;
- freshness and coverage;
- explicit `observed`, `partial`, `missing` or `not_calculable` availability.

`null` is never converted to zero. Confirmed, non-skipped meals alone contribute
to nutrition. Existing Soma scores and calculations remain authoritative; the
LLM explains and connects them but does not replace them.

## Agent architecture

One controlled `ToolLoopAgent` orchestrates typed tools. Separate logical roles
cover conversation, data analysis and coaching; V1 does not deploy autonomous
sub-agents. Model selection is deterministic and quality-adaptive:

- `fast`: confirmations and simple conversational work;
- `balanced`: comparisons and ordinary multi-domain analysis;
- `deep`: longitudinal analysis, plan creation and explicit `analyse en
  profondeur` requests.

The assistant uses the explicit OpenAI model identifier `gpt-6-luna`.
Step, token, duration and cost budgets are finite. The
user ID is derived from the authenticated session and is never accepted from
the model or request body.

## Privacy and observability

- Only the minimum relevant data is sent to the model; direct identifiers and
  unrelated fields are excluded from tool results.
- Names, email addresses, provider IDs, tokens and unrelated metadata are
  stripped.
- OpenAI Responses requests use `store: false`; provider-side policy and account settings
  must still be verified before production activation.
- Raw health datasets are not written to logs or tool-call audit rows.
- Logs contain request/run IDs, tool names, period manifests, model, usage,
  duration, status and safe error codes.
- Conversation photos remain private, belong to the conversation and are
  deleted with it. They never become memory automatically.

## Definition of done

- Exact user isolation and no cross-account attachment or parent references.
- No silent truncation across long periods.
- Deterministic preservation of zero, missing, partial and provenance states.
- Free-form questions across nutrition, sleep, recovery and effort, including
  cross-domain questions.
- Persistent conversations, confirmed memory, flexible goals and versioned
  global plans.
- Explicit text meal recording with slot clarification and 24-hour undo.
- Quality routing, bounded tool loops, cost/usage recording and safe failure.
- Automated checks cover contracts, database boundaries, pagination, missing
  data, prompt rules, response idempotence and migration invariants.
- Local UI proof covers 1440×900 and 390×844, including empty, loading,
  unconfigured-key and error states; authenticated production proof remains a
  release step.
