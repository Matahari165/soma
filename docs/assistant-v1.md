# Soma Assistant V1 — implementation contract

## Product role

Soma is an energetic, motivating and objective coach. It is not flattering by
default: every judgement must be grounded in the user's profile, personal
history, domain-specific history, current goals and—when useful—reliable
external benchmarks. Routine medical disclaimers are forbidden. If a genuinely
concerning situation appears, Soma gives a direct, situation-specific next step
without role-playing a clinician.

Responses address the user directly as a coach who has read the data. They
lead with the user's result, give a grounded judgement and name a realistic
next step. A simple opinion stays brief, with very short sentences and no
report headings. When several facts or recommendations matter, it uses short
Markdown bullets, line breaks and selective bold emphasis. Longer responses
may use headings. It avoids automatic caveats and mentions a data limit only
when that limit changes the judgement or next action. The interface
attaches its own data-evidence summary; the model does not repeat an
`Analyse :` line or describe Soma as an outside source.

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
- Voice mode uses GPT-Live 1 for the spoken conversation and client delegation
  to the existing GPT-6 Luna assistant for Soma data, analysis and actions. The
  one-shot dictation control remains a separate flow.
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

Each text turn also receives a server-generated UTC instant, the local date and
time in the profile timezone, and whether that timezone came from the profile
or the Soma default. The model uses this clock to interpret relative dates, then
checks the dates of returned records before assessing a specific event. It must
not silently substitute an older event when the requested one is absent.

`querySomaData` exposes targeted, paginated periods for daily health, scores,
daily confirmed nutrition, individual activities, sleep sessions, and individual
meals. Activity and sleep lookups restrict the health-record read to the
requested dates. Session results carry an ID, start/end times and source
metadata; raw provider payloads are not sent to the model. Meal results omit
photos and storage paths, identify draft or skipped entries, and exclude their
estimates from nutrition conclusions. Recovery is read from the canonical
recovery score together with same-day health metrics; the assistant does not
invent a second recovery calculation.
Activity records flag zone or active minutes that exceed the recorded session
duration; the source values are retained and cannot be used as an intensity
judgement without clarification.

The conversation evidence panel distinguishes the period searched from the
dates containing records. A zero-result search is shown as such, not as a
period of observed data. These checks establish data access and presentation;
they do not by themselves prove a live model will select the correct records
for every phrasing, so date-relative and cross-domain questions remain part of
release evaluation.

## Agent architecture

One controlled `ToolLoopAgent` orchestrates typed tools. Separate logical roles
cover conversation, data analysis and coaching; V1 does not deploy autonomous
sub-agents. Model selection is deterministic and quality-adaptive:

- `fast`: confirmations and simple conversational work;
- `balanced`: comparisons and ordinary multi-domain analysis;
- `deep`: longitudinal analysis, plan creation and explicit `analyse en
  profondeur` requests.

All tiers use GPT-6 Luna. Reasoning effort is `medium` for `fast`, `high` for
`balanced`, and `xhigh` for `deep`. Step and output limits remain smaller for
simple turns.

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

## Live voice backend

- The browser creates a WebRTC offer and sends it with an optional conversation
  ID to the authenticated `POST /api/assistant/live/sessions` route. Soma checks
  conversation ownership, then exchanges the offer with OpenAI's
  `POST /v1/live/sessions` endpoint using `gpt-live-1`, client delegation and
  `store: false`. The browser receives the SDP answer, the Soma conversation ID,
  the Live session ID and a short-lived signed session ticket. The OpenAI key is
  never returned to the browser. For a new chat, the conversation is created
  only after OpenAI accepts the session, so a failed handshake leaves no empty
  conversation behind.
- Both Live POST routes use the same strict Origin check. In the local preview,
  a loopback browser port may differ from Next's internal port; only a matching
  loopback Host or a single, consistent forwarded loopback authority is accepted.
  External and ambiguous origins remain blocked.
- The WebRTC audio connection runs from the browser to OpenAI. Soma does not
  upload or persist the raw audio. The Live session sets `store: false`; this
  disables Live session storage and recording access. Provider retention and
  account controls still need to be reviewed separately, as for Responses.
- The WebRTC data channel is restricted to `session.commentary.append` and
  `session.close` from the browser. Soma allows only the startup, transcript,
  delegation, usage, close, error and info events needed by the interface.
- GPT-Live emits transcript fragments as `session.input_transcript.delta` and
  identifies work with `session.delegation.created`. Those events do not mark a
  complete user turn. The client groups transcript fragments using their
  timeline offsets and the delegation event before submitting backend work.
- The client posts `{ sessionToken, delegationId, transcript }` to the
  authenticated `POST /api/assistant/live/delegations` route. Soma verifies the
  signed ticket and checks that it belongs to the authenticated user. The ticket
  carries the Live session and conversation IDs; the existing assistant flow
  rechecks conversation ownership before accessing it. Luna's user message,
  assistant response, run, tool checks and audit records use the same storage
  path as text chat. A deterministic request ID derived from the Live session
  and delegation ID makes retries idempotent.
- The browser receives only the delegation ID and a spoken handoff capped at
  1,600 UTF-8 bytes; it splits the text into commentary events of at most 350
  UTF-8 bytes each, below GPT-Live's documented 500-token event limit. When
  trimming is needed, Soma prefers a sentence boundary and otherwise cuts at a
  word boundary, then points the user to the complete Luna answer in the
  conversation. The client does not receive tool internals or health data from
  any other user's conversation.
- Configure `OPENAI_LIVE_API_KEY` in the server's `.env.local` or server-side
  deployment settings. It is separate from `OPENAI_API_KEY` (GPT-6 Luna) and
  `OPENAI_TRANSCRIPTION_API_KEY` (recorded dictation). All three stay server
  side and the checked-in `.env.example` values remain blank. The Live SDP offer
  is capped at 96 KiB (128 KiB route/proxy body limit), delegated transcript at
  8,000 characters, and the signed ticket expires after 55 minutes.

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
