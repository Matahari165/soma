# Soma Personal Lab — Canonical Product Contract

Status: approved product direction, 24 August 2026  
Product language: English only  
Primary device: desktop (about 70%), with full mobile access (about 30%)

This file is the source of truth for Personal Lab product behavior. When older plans,
screens, tests, or copy disagree with it, update them to this contract unless a later
explicit user decision supersedes it.

## Product thesis

Soma is a personal correlation-analysis laboratory. Its primary job is to combine
Google Health wearable measurements with a configurable daily journal and show which
recorded behaviors or physiological measures are associated with changes in sleep and
recovery.

The product is not a generic descriptive health dashboard. Daily values remain available,
but the relationship matrix is the core product. Calculations are deterministic; Grok
selects and explains calculated findings in concise English.

## Main page

The Personal Lab page follows this order:

1. `Insights`: zero to four morning findings, with no filler.
2. `Today`: Sleep duration, Recovery, and Effort only.
3. `Journal`: a continuously saved daily draft.
4. `Relationships`: the full predictor-by-outcome matrix.

The page title and date may appear above these sections. Do not add motivational copy,
decorative subtitles, generic statistical caveats, or text that does not orient the user,
report a state, explain a value, or enable an action.

## Morning insights

- Generate once each morning after reliable overnight data arrives.
- Until then, show `Waiting for overnight data.`
- Show at most four insights and fewer when fewer findings are useful.
- Repetition is allowed; new or changing trends should also receive attention.
- Mention periods only when they clarify a change, for example a 90-day trend that differs
  from the latest 30 days.
- Grok receives calculated findings and statistical metadata, not raw health records.
- Grok may select, compare, and explain supplied findings but may not invent unsupported
  values or relationships.
- Each insight is persisted in chronological history.
- Each insight can be liked. Likes affect later editorial ranking only, never statistics.
- Each insight links to the exact matrix relation, period, and lag that supports it.

## Today strip

Show exactly these primary values:

- Sleep duration
- Recovery
- Effort

The strip refreshes as wearable data changes during the day. Do not use habit emoji in
this strip. Recovery remains a transparent Soma score and is finalized after the journal,
matrix, and insight experience.

## Daily journal

### Lifecycle

- The default journal is today.
- Every change is persisted immediately as a draft.
- Closing or refreshing the app must not lose draft values.
- `Validate day` finalizes the entry without a missing-field warning or confirmation step.
- Only validated days enter relationship analysis.
- Empty fields remain missing for that variable; they are never converted to zero or false.
- A validated day is locked and cannot be edited.
- Unvalidated drafts remain available for today and the previous four calendar days.
- Soma sends no journal notification.

### Defaults

Defaults are prefilled when a draft is created and count as confirmed when the day is
validated. The user can clear a value to make it missing.

- Numeric and count measures: `0`
- Boolean measures: `No`
- `Dark room`: `Yes`
- Measures without a sensible default, such as dinner end time: missing

### Starter measures and order

The journal is one continuous list. Time-of-day labels and thin separators may orient the
user, but do not place each period in a separate card.

| Order | Period | Measure | Type | Unit | Default |
|---:|---|---|---|---|---|
| 0 | Context | Vacation | Boolean | — | No |
| 1 | Context | Illness | Boolean | — | No |
| 10 | Morning | Breakfast | Boolean | — | No |
| 20 | Morning | WHM | Count | rounds | 0 |
| 30 | Day | Caffeine | Number | mg | 0 |
| 40 | Day | Added sugar | Number | g | 0 |
| 50 | Day | Masturbation | Boolean | — | No |
| 60 | Evening | Alcohol | Count | drinks | 0 |
| 70 | Evening | Dinner end time | Time | — | Missing |
| 80 | Evening | Magnesium | Number | mg | 0 |
| 90 | Before sleep | Breathing exercise | Boolean | — | No |
| 100 | Before sleep | Reading for 30 minutes | Boolean | — | No |
| 110 | Before sleep | Dark room | Boolean | — | Yes |

Bedtime, wake time, exercise, activity, and heart-rate-zone data come from Google Health
when available and are not duplicated as manual fields.

### Custom measures

The user can create a journal measure with:

- name;
- emoji;
- type: Boolean, Number, Count, Time, or Scale;
- unit;
- default value;
- time-of-day period;
- position.

Archiving a measure removes it from future drafts but preserves historical entries and
historical analysis. Field management must not duplicate the complete daily form.

## Metric registry

Every metric received from Google Health appears in metric settings. A metric has a
default role and can be changed to:

- `Influence`
- `Result`
- `Both`
- `Disabled`

Disabled metrics are excluded from the matrix and Grok context. Each metric definition
contains its label, unit, favorable direction, source coverage, display order, and default
role.

### Default outcomes

- Sleep duration
- Sleep efficiency
- Sleep latency
- Restlessness or awakenings
- Deep sleep
- REM sleep
- HRV
- Resting heart rate
- Respiratory rate
- Recovery score, when its final version is ready

### Default automatic influences

- Bedtime
- Wake time
- Steps
- Active minutes
- Exercise minutes
- Heart-rate-zone minutes
- High-intensity minutes
- Effort

Additional received metrics are visible in settings and can be enabled by the user.

## Relationship matrix

### Structure

- Influences are rows.
- Results are columns.
- Default period: 30 days.
- Other periods: 15 days, 90 days, and all history.
- Desktop shows the complete matrix.
- Mobile preserves the complete matrix with horizontal scrolling; do not replace it with
  a ranked list.
- Keep the header row and predictor column sticky.

### Visibility

- Default view shows only relations with Benjamini–Hochberg-corrected `q < 0.05`.
- If a predictor has no significant relation, hide its row in the default view.
- `Show non-significant` reveals all eligible predictors and calculated relations.
- A non-significant relation uses a quiet dash or muted numbers; it is not presented as a
  conclusion.
- An insufficient relation distinguishes missing coverage from a calculated non-significant
  relation.

### Cell summary

Lead with concrete real-unit effects and keep percentages unambiguous.

Example:

```text
−6% · −32 min
118 mg avg vs 0
```

For a continuous predictor:

```text
+30 min later
Recovery −4 pts
```

Predictor emoji belongs in the row label. Favorable and unfavorable effects use semantic
green/red plus a directional symbol or text; color is never the only cue. Color semantics
follow the outcome definition, not the raw coefficient sign.

### Relation detail

Activating a cell opens a focused detail panel or sheet containing:

- plain-English sentence;
- compared predictor levels or groups;
- group means;
- observed effect in real units and percent where meaningful;
- paired sample size;
- 95% interval;
- raw `p` and corrected `q`;
- analysis period and lag;
- source coverage;
- an appropriate plot;
- quantity-response detail when supported.

## Statistical contract

Soma reports raw within-person comparisons. It does not adjust one journal behavior for
other behaviors. Source handling, missing-data handling, time alignment, repeated-day
dependence, and multiple-testing correction remain mandatory data-quality protections.

### Pairing and lags

Test the behavior or measure against:

- the same calendar day when meaningful;
- the following sleep episode;
- the next day's recovery or physiology;
- J+2.

Labels must describe the actual timing: `same day`, `following night`, `next day`, or
`two days later`.

### Missing data

Pairwise deletion applies: an empty journal field removes that date only from relations
that require that field. It does not invalidate the rest of the day.

### Minimum data

- Boolean comparison: at least five observations in each group.
- Numeric relationship: at least ten paired observations.
- A 15-day view can therefore produce early results, but significance and correction still
  determine visibility.

### Boolean and exposed/unexposed comparisons

Compare the raw outcome means for `Yes` versus `No`, or amount greater than zero versus
zero. Report the difference in outcome units and as a percentage of the zero/No reference
mean when that percentage is meaningful.

For an amount such as caffeine, the main cell reports the average non-zero dose and the
exposed-versus-zero outcome difference. The detail view may additionally show the
quantity-response relation among exposed days.

### Continuous measures

Use a robust monotonic association test and translate it to a meaningful observed contrast,
such as 30 minutes later bedtime. If the observed shape is materially non-linear and has
enough support, describe a best zone or threshold instead of forcing one linear effect.

### Significance

- Calculate a raw two-sided `p` value.
- Correct every eligible relation in the selected period's hypothesis family with
  Benjamini–Hochberg.
- Use `q < 0.05` for the default matrix and Grok-eligible conclusions.
- Keep `p`, `q`, sample size, and intervals in relation details.
- Account for serial dependence in confidence intervals and tests without turning the
  product into a multivariable adjustment model.

### Ranking

Rank eligible findings by:

1. practical effect magnitude;
2. statistical strength;
3. available paired observations.

## Sleep target and Recovery

- Sleep target: 8 h 30.
- Initial acceptable band: 8 h 20 to 8 h 40.
- The target does not change for weekends or vacations.
- Recovery is a transparent Soma score built from personal-baseline HRV, resting heart
  rate, sleep, and reliable supporting inputs.
- Recovery detail must explain its inputs and why the current score has its value.
- Missing essential inputs produce a limited-data state rather than an invented score.

## Visual contract

The interface is a precise, restrained laboratory workbench:

- light canvas;
- high contrast;
- compact sans-serif hierarchy;
- monospaced tabular numbers;
- dense grid and thin rules;
- very few cards and almost no shadow;
- semantic green/red reserved for effects;
- no generic violet, decorative gradients, marketing hero, or ornamental copy;
- restrained corners;
- line icons paired with text when meaning is not obvious.

Emoji are explicitly allowed only for tracked habits and primary relationship effects.
They are not navigation icons and do not appear in the Today strip.

All interactive targets are keyboard accessible, all states work without color alone, and
touch targets meet 44 px on mobile. Validate at 320, 768, 1024, and 1440 px.

## Product acceptance

The Personal Lab is complete when the user can:

- receive up to four useful morning insights after overnight sync;
- see live Sleep, Recovery, and Effort values;
- progressively fill a lossless draft and validate it;
- recover an unvalidated draft up to four days late;
- create and archive typed journal measures;
- explore 15-, 30-, 90-day, and all-history matrices;
- reveal or hide non-significant results;
- understand every relation in real units;
- select the role of every received Google Health metric;
- revisit and like historical insights;
- use the full matrix on desktop and mobile.

The product never fabricates extra insights to make the interface look complete. An honest,
sparse matrix is a valid result.
