# Soma Personal Lab

Status: current product direction based on stable `main`

Product language: English

Primary experience: desktop, with full mobile access

This document gives the product direction for Personal Lab. The code and tests remain the
reference for implementation details.

## Purpose

Soma is a personal laboratory for understanding how recorded behaviours and physiological
signals are associated with sleep and recovery. It combines Google Health data with a
configurable daily journal.

Soma is not a medical device and does not claim causation. Calculations are deterministic;
AI only selects and explains results that Soma has already calculated.

## Main experience

The Personal Lab page is organized around four priorities:

1. Up to four useful morning insights.
2. Today's Sleep duration, Recovery, and Effort.
3. A daily journal that saves continuously.
4. A complete relationship matrix.

The interface should remain compact, factual, and easy to scan. Explanations and detailed
evidence belong in views opened from the main information.

## Journal and data

- Journal changes are saved as drafts immediately.
- Only validated days enter relationship analysis.
- Empty values remain missing; they are never treated as zero or `No`.
- Validated days can still be edited and recalculated.
- Journal measures can be created, reordered, and archived without losing history.
- Bedtime, wake time, activity, and other available wearable measures come from Google
  Health rather than being duplicated manually.
- WHOOP and Fitbit records form one longitudinal wearable history while source coverage
  remains visible.

## Relationship analysis

- Influences are rows and outcomes are columns.
- Available windows are 15 days, 30 days, 90 days, and all history; 30 days is the default.
- Same-day, next-day, and two-days-later effects are grouped in the same relation cell when
  their chronology is possible.
- Missing values are omitted only from the relationship that needs them.
- Yes/No behaviours compare the average outcome between the two groups.
- Amounts compare exposure with zero and may also show a gradual dose relationship across
  all recorded days, including zero.
- Numeric relationships use a readable personal contrast, such as a bedtime 30 minutes
  later.
- With enough data, Soma checks for thresholds, plateaus, and favourable or unfavourable
  zones instead of forcing every relationship into a straight line.
- Confidence intervals account for repeated daily observations, and Benjamini–Hochberg
  correction limits false discoveries across the tested relationships.
- A highlighted relation must also keep the same direction in at least two of four
  chronological blocks within its selected window. Opposite blocks do not automatically
  disqualify it; the guard prevents a result from being driven by one isolated slice.
- The default matrix shows only reliable, practically meaningful results. Other calculable
  results remain available on request.

These results describe personal associations, not proof that one behaviour caused another.

## Product principles

- Show concrete effects in understandable units and percentages.
- Keep timing, sample size, uncertainty, source coverage, and detected shape accessible.
- Never fabricate data or add filler insights.
- Keep personal health records private and out of logs, AI prompts, and client-visible
  technical data unless strictly required.
- Preserve a dense, restrained laboratory identity with accessible controls on desktop and
  mobile.
