# SOMA — PHYSIOLOGICAL ATLAS

Soma is a personal health atlas: a calm, precise place where sleep, recovery, movement, and training become one readable landscape. The interface borrows from field notebooks, physiological charts, and editorial data design instead of generic wellness dashboards.

## Identity

- The symbol is a topographic **S** built from three independent contours. It evokes anatomy, terrain, and several bodily rhythms without using a heart, cross, sparkle, or waveform.
- The mark is monochrome. Domain color belongs to data, never to the logo.
- The wordmark is uppercase and compact. The descriptor is `PERSONAL HEALTH ATLAS`.
- Schibsted Grotesk carries the interface and wordmark.
- Newsreader gives long-form headings an editorial, human voice.
- Azeret Mono is reserved for measures, dates, axes, and technical metadata.

## Color system

- Canvas: warm limestone (`#F2EFE6`).
- Paper: pale mineral (`#FBF8EF`).
- Ink: lichen black (`#1C211A`).
- Sleep: nocturnal cobalt (`#3155A6`).
- Recovery: alpine moss (`#4C6544`).
- Activity: oxidized clay (`#B45A3C`).
- Training: dry ochre (`#B08234`).
- Night mode uses the same pigments on a deep olive-black canvas. It is a true alternate environment, not a color inversion.

## Interface language

- Information is organized as spreads, strips, annotations, and measured plots rather than floating glass cards.
- Corners are restrained: 2 px for data surfaces, 6 px for controls, circular only for explicit round actions.
- Rules and spacing create hierarchy before shadows. Shadows stay neutral and rare.
- Large numbers are part of the composition, but never overlap labels or charts.
- Icons are line-based, optically consistent, and always paired with text when meaning may be ambiguous.

## Motion

- Page content enters with a short vertical reveal.
- Charts draw or rise once when their section appears.
- Controls use small color and position transitions; no perpetual ambient animation.
- Every non-essential animation is removed under `prefers-reduced-motion`.

## Accessibility and responsive behavior

- Body copy remains at least 16 px on narrow screens.
- Interactive controls target at least 44 px on touch layouts.
- Every state remains understandable without color alone.
- The desktop rail becomes a compact mobile header and labelled bottom navigation.
- Dense metric strips become readable stacked rows before they become horizontally scrollable.
