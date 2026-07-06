# AadesiPo — Web

A desi-flavored, Monopoly-inspired, mobile-first web game. See project docs
for the full Game Design Summary, feature list, and roadmap (M1–M12).

## Stack

Vite + React 19 + TypeScript (strict) · pnpm workspace · `@aadesipo/engine`
(pure TS rules engine, framework-free) · Tailwind v4 _(M2)_ · Supabase
_(M3+)_ · Cloudflare Pages · Sentry · PostHog.

## Getting started

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
cp .env.example .env.local   # fill in as each milestone needs them
pnpm dev
```

The app runs and is fully navigable with **no Supabase project** — it
shows a banner explaining auth/rooms are disabled until you add
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and everything else (theme,
routing, the component gallery at `/gallery`) works regardless.

### Wiring up Supabase (needed for real auth/rooms, from M3 on)

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: `npx supabase db push` (or paste
   `supabase/migrations/0001_init.sql` into the SQL editor).
3. Enable **anonymous sign-ins**: Authentication → Providers → Anonymous
   Sign-Ins → on. This is what powers guest-first onboarding.
4. Enable **Google** as an OAuth provider: Authentication → Providers →
   Google. You'll need a Google Cloud OAuth client ID/secret — see
   [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
5. Copy the Project URL and anon public key into `.env.local`.

### Deploying the multiplayer backend (M8, needed for Online mode)

The Edge Functions (`supabase/functions/`) can't be tested in this sandbox
— there's no Deno runtime available here, so `pnpm typecheck:functions`
is the closest thing to verification these got before you deploy them
yourself. It runs two checks: a real strict typecheck of
`_shared/gameLogic.ts` (the actual game-validation logic, and the part
that's also covered by real tests in `pnpm test:app`), and a looser
structural check of the four handler files using stub Deno types (catches
typos and obvious mistakes, not a substitute for the real thing).

1. Install the Supabase CLI, then link it to your project:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
2. Push the migrations (including `0002_m8_realtime_and_presence.sql`):
   ```bash
   supabase db push
   ```
3. Deploy the four functions:
   ```bash
   supabase functions deploy create-room
   supabase functions deploy join-room
   supabase functions deploy start-game
   supabase functions deploy validate-action
   ```
4. **The one thing most likely to need debugging**: the functions import
   the engine via a relative path (`../../../packages/engine/src/index.ts`),
   which itself uses `.js`-suffixed specifiers pointing at `.ts` files
   (standard Node/NodeNext style). This resolves correctly in our Vite
   build and in Node/Vitest, and _should_ resolve correctly through
   Supabase's esbuild-based bundler too — but that's the one part of this
   whole milestone I genuinely can't confirm without a live deploy. If
   `supabase functions deploy` or `supabase functions serve` fails on
   module resolution, start there.
5. Test locally first if possible: `supabase functions serve` runs a
   real local Deno runtime, which will catch anything the stub-type
   checks above couldn't.

## Push notifications (M9)

Turn notifications need VAPID keys — generate a pair with
`npx web-push generate-vapid-keys`, then:

1. Add the public key to `.env.local` as `VITE_VAPID_PUBLIC_KEY`.
2. Add both keys as **Edge Function secrets** (not `.env.local` — these
   are server-side): `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com`.
3. Redeploy `validate-action` after setting secrets.

Like the rest of M8/M9's server side, the actual push-sending code has
never run against a real deployment — see the M9 summary.

### Remote feature flags

`getAiDefaultSkillLevel()` (`src/services/analytics.ts`) reads a PostHog
payload flag called `ai-default-skill-level`. Create it in the PostHog
dashboard (Feature Flags → New) as a number payload between 0 and 1; the
app falls back to 0.85 if the flag doesn't exist or PostHog isn't
configured.

## Scripts

| Command                        | Does                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Start the Vite dev server                                                                                   |
| `pnpm build`                   | Typecheck + production build                                                                                |
| `pnpm lint`                    | ESLint across the whole workspace                                                                           |
| `pnpm format` / `format:check` | Prettier                                                                                                    |
| `pnpm typecheck`               | `tsc -b` across app + engine                                                                                |
| `pnpm test`                    | Engine tests + app tests (persistence layer)                                                                |
| `pnpm test:engine`             | Just the engine test suite                                                                                  |
| `pnpm test:app`                | Just the app-level tests (IndexedDB persistence, via fake-indexeddb)                                        |
| `pnpm typecheck:functions`     | Checks the Edge Functions (see the M8 deploy section — this is not a substitute for real Deno verification) |
| `pnpm test:watch`              | Engine tests in watch mode                                                                                  |

## Workspace layout

```
packages/engine/   — pure TypeScript rules engine. No React, no DOM, no I/O.
src/                — the web app (features/, components/, services/, state/, theme/, ...)
supabase/           — Edge Functions + migrations (M3+)
e2e/                — Playwright (added later)
```

`packages/engine` has its own `package.json`/`tsconfig`/tests and is
consumed by the app via the `@aadesipo/engine` workspace alias — see
`vite.config.ts` and `tsconfig.app.json`.

## CI/CD

- **`.github/workflows/ci.yml`** — lint, format check, typecheck, engine
  tests, build. Runs on every PR and on push to `main`.
- **`.github/workflows/deploy.yml`** — builds and deploys to Cloudflare
  Pages via `wrangler pages deploy`. Runs on push to `main` (production)
  and on PRs (preview).

### One-time setup before deploy works

1. Create the Pages project once: `npx wrangler pages project create aadesipo-web`
   (or via the Cloudflare dashboard — Workers & Pages → Create → Pages →
   Direct Upload). Don't also connect Cloudflare's Git integration to the
   same repo — that would double-deploy alongside this workflow.
2. Add two repo secrets in GitHub (Settings → Secrets and variables →
   Actions): `CLOUDFLARE_API_TOKEN` (scoped to "Cloudflare Pages — Edit")
   and `CLOUDFLARE_ACCOUNT_ID`.
3. Push to `main` — the deploy workflow takes it from there.

## Accounts you'll need as milestones land

| Service              | Needed from           | For                      |
| -------------------- | --------------------- | ------------------------ |
| Cloudflare           | M1                    | Hosting/deploy           |
| Sentry               | M1 (optional locally) | Error tracking           |
| PostHog              | M1 (optional locally) | Analytics                |
| Supabase             | M3                    | Auth, database, realtime |
| Google Cloud (OAuth) | M3                    | Google sign-in           |

## Launch (M12)

- **Marketing site**: `marketing/index.html` — a real, self-contained
  landing page using the app's actual design tokens and real product
  content. Structurally validated (well-formed HTML, balanced CSS,
  working anchors) but never viewed in an actual browser — open it
  locally before deploying.
- **App store listings**: draft copy for both stores in
  `docs/APP_STORE_LISTINGS.md`, including an honest flag that a bare
  PWA wrapper is a realistic rejection risk on iOS specifically
  (Apple's Guideline 4.2), even though the same approach is fine on
  Google Play via TWA.
- **Launch checklist**: `docs/LAUNCH_CHECKLIST.md` — TWA/Bubblewrap
  setup for Play Store, and everything else this milestone needs that
  no code in this repo can do for you (real accounts, signing keys,
  submission review).

## Performance & beta (M11)

- **Code-splitting**: the Pixi.js-heavy game screens are now lazy-loaded
  (`src/App.tsx`) — visiting the home screen, profile, or settings no
  longer downloads the board renderer. Measured, not assumed: the entry
  chunk dropped from ~337KB to ~172KB gzipped (confirmed via
  `pnpm check:bundle`, which also runs in CI and fails the build if it
  regresses past 200KB).
- **Crash-free rate**: Sentry now gets a real `release` identifier
  (git short SHA at build time) — without this, individual errors were
  still captured, but Sentry couldn't compute crash-free rate _per
  release_, which is the whole point of using it as a beta-readiness
  gate. See `docs/BETA_LAUNCH_CHECKLIST.md` for how to actually read it.
- **Lighthouse ≥90**: **not verified** — this sandbox has no headless
  Chrome available (same class of limitation as M8's Deno gap). The
  code-splitting and M10 accessibility fixes should move the Performance
  and Accessibility scores in the right direction, but "should" isn't
  "confirmed" — run a real Lighthouse audit against a deployed build
  before treating this as done.
- **Beta cohort**: recruiting 20-30 testers is a product process, not a
  code task — see `docs/BETA_LAUNCH_CHECKLIST.md`.

## Accessibility, localization, legal (M10)

- **Accessibility**: `src/theme/contrast.test.ts` is a real, permanent
  WCAG AA contrast regression test — it caught two actual failures
  (white text on the destructive button and the mortgaged-property
  badge, both under 3:1) that are now fixed. `src/hooks/useFocusTrap.ts`
  is real focus-trapping used by both `Dialog` and `BottomSheet`,
  verified with actual jsdom + Testing Library tests
  (`useFocusTrap.test.tsx`), not just code review.
- **Localization**: `src/i18n/` is real, type-checked string extraction
  infrastructure (adding a locale that's missing a key is a compile
  error) — but only `en.ts` exists, and only `GameLog` and `ActionDock`
  are migrated to prove the pattern end-to-end. The rest of the app's
  strings are still inline; migrating them follows the exact same
  mechanical pattern.
- **Legal & cultural content review**: see
  [`docs/LEGAL_AND_CONTENT_REVIEW.md`](./docs/LEGAL_AND_CONTENT_REVIEW.md)
  — this genuinely needs a lawyer and a native-speaker reviewer; no
  code can substitute for either.

## Coding standards

No `any` in `packages/engine` — enforced by ESLint, not just convention.
Conventional Commits (`feat(engine): add auction FSM`), enforced by
commitlint via a Husky `commit-msg` hook. `pnpm lint` runs on staged files
via a Husky `pre-commit` hook.
