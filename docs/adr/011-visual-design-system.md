# ADR-011: Visual design: premium, minimal, expressive type

**Status:** accepted · 2026-11-05

## Context

The first look was the plain shadcn/ui default. The product owner chose a "premium &
minimal" direction, public pages first, with "fonts and titles showing master creativity".
It must stay fast on 4G phones (NFR-1, NFR-6), WCAG 2.1 AA (NFR-9), and work in Hindi.

## Decision

- **Colour:** warm paper white, near-black ink, and **one** accent, deep emerald
  (`--brand`), used only for verification, scores and headline accents. A lighter emerald
  (`--brand-light`) on dark panels. Tokens in `src/app/globals.css`; every text pair meets AA.
- **Type:** Instrument Serif (roman and italic) for display headings, Inter for text, with
  Noto Serif/Sans Devanagari for Hindi. Self-hosted through `next/font` (no requests to
  Google from visitors; CSP `font-src 'self'`); Devanagari files load only for Hindi text.
- **Expressive details, minimal layout:** one accent phrase per display headline (the
  `<em>` in the translation string, rendered as `.display-accent`: serif italic in emerald;
  colour only in Hindi, which has no true italic), balanced headline wrapping, eyebrow labels
  led by a short rule, large italic step numerals, an emerald full stop in the wordmark.
- **Scope:** home, sign-in/sign-up (`AuthShell`) and the public creator profile get the full
  treatment; the signed-in app shares the tokens, fonts and titles but keeps its layouts.

## Consequences

- New pages reuse the tokens and `.eyebrow` / `.display-accent`; no new colours without
  updating this ADR and checking contrast (the accessibility E2E suite checks every page).
- The wordmark is text until a product name and logo exist (X-07).
- Fonts add about 80 KB on an English first visit (Latin faces only; the Devanagari files
  load only on Hindi pages, so language names in the switcher use system fonts).
- The richer pages cost first-paint time on slow phones, so the design avoids expensive
  paint effects (no sticky blurred header, modest shadows) and marks below-the-fold
  sections `.below-fold` (`content-visibility: auto`). The page-speed (NFR-1) and
  page-weight (NFR-6) tests pass; keep them passing when adding sections.
