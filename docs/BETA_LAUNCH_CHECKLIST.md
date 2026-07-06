# Closed Beta Checklist — M11

Recruiting and running a beta cohort is a product/community process,
not a code task. This is the concrete checklist for it, plus how to
read the metrics once real users are in.

## Before inviting anyone

- [ ] Real Supabase project deployed, migrations pushed, Edge Functions
      deployed and smoke-tested via `supabase functions serve` (see
      the M8 README section) — don't invite testers to a backend
      that's only ever been typechecked, not run.
- [ ] Real Sentry DSN set (`VITE_SENTRY_DSN`) so crash-free rate is
      actually being recorded from the first session, not started
      partway through the beta.
- [ ] Real PostHog key set (`VITE_POSTHOG_KEY`) so the M9 funnel events
      (`game_started`, `game_completed`, etc.) have somewhere to land.
- [ ] `docs/LEGAL_AND_CONTENT_REVIEW.md` at least the cultural-review
      pass done — a closed beta with friends is a reasonable place to
      _get_ that feedback, but the trademark/legal review should
      happen first regardless of audience size.

## Recruiting the cohort (20-30 people)

- Aim for a mix that actually exercises every mode: some pairs/groups
  who'll play Pass & Play in person, some who'll only ever play Online
  with people in other households, a few solo players who'll mostly
  play Vs. AI.
- Recruit people on both Android and iOS — the PWA install flow and
  push notification support genuinely differ by platform (see M9's
  Settings screen copy), and that gap needs real devices, not just
  code review, to catch problems.
- Give every tester the same starting message: what to test, how to
  report a bug (a specific channel — Discord/WhatsApp group, a form,
  whatever you'll actually check), and that it's pre-release software.

## What to actually watch once testers are in

**Crash-free rate (Sentry → Releases)**: every build now tags sessions
with a release identifier (git short SHA, or `v{package.json version}`
as a fallback — see `vite.config.ts`'s `resolveReleaseId()`), so
Sentry's Releases dashboard can show crash-free rate _per release_,
not just an undifferentiated blob. Ship a fix, cut a new build, and
you'll see whether the specific release improved.

**Funnel drop-off (PostHog → Insights)**: build a funnel from
`game_started` → `game_completed` (both fire with a `mode` property —
see `src/services/analytics.ts`) to see where people actually stop
playing, split by vs-ai/pass-and-play/online. A funnel that's healthy
for Vs. AI but leaky for Online is a very different problem than a
uniformly leaky funnel.

**The bundle budget** (`pnpm check:bundle`, also wired into CI) catches
regressions before beta testers ever see them — if a future change
makes the entry chunk balloon back past 200KB gzipped, CI fails before
merge, not after 25 people notice the app got slower to open.

## What this checklist is not

It's not a substitute for actually watching what testers do and
talking to them directly. The metrics above tell you _where_ to look;
they don't replace asking someone "what made you stop playing."
