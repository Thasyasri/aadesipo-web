# AadesiPo — Website Plan

This folder is the single source of truth for turning AadesiPo from a game-focused
single-page app into a complete, professional website. **Planning and design come
before code.** Each numbered document covers one area; nothing is implemented until
its section is decided, designed, and documented here.

Philosophy: **quality over quantity, one step at a time.** We would rather perfect a
single page, flow, or component than rush several unfinished ones. Every decision —
architecture down to the smallest micro-interaction — is intentional and recorded.

---

## Shipped — live at https://aadesipo-web.vercel.app

Phase 1 (public site shell + premium redesign) is essentially **built and deployed**.
Auto-deploys from `main` via Vercel.

- **Pages:** Landing (`/`), Play setup (`/play`), Rules (`/rules`), About (`/about`),
  Gallery (`/gallery`), Profile (`/profile`), Settings (`/settings`), premium 404, plus
  the gameplay routes.
- **Shell:** one shared premium header (single Play CTA, Home/Rules/About/Gallery/
  Profile/Settings, theme toggle) + footer across every page.
- **Design system:** "Contemporary Indian Premium" tokens landed in the app's Tailwind
  `@theme` + a scoped marketing layer, **light + dark** site-wide, typography unified on
  **Fraunces + Manrope**. The in-game board, HUD and sheets are reskinned to match.
- **Engine-sourced content:** the Rules page and the Landing/About stat bands read
  prices, rents, mode configs and the Chance/Sarpanch event tables straight from
  `packages/engine`, so they can't drift from the real game.
- **SEO & social:** per-page titles/descriptions, Open Graph/Twitter cards, `og.png`,
  `robots.txt` + `sitemap.xml`.
- **Polish pass:** softened both themes (eased-on-the-eyes, no glare), a two-layer
  ambient **colour aurora** on every marketing page, universal micro-interactions
  (hover/press/reveal, light + dark), and a **"Why this is ours"** local-flavour band
  (filter-coffee · RTC depots · first-day-first-show — state-neutral, festival-free).
  AI rivals carry Telugu-audience tags (Rowdy / Konte / Pisinari).

Phase 1 is complete. Next: the **player platform** (Phase 2) and a queued **game-engine
batch** (dynamic taxes, auction-opens-at-price, per-seat AI difficulty, scrollable log).

---

## Decisions Log

Locked decisions that shape everything downstream. Date: 2026-07-07.

| #       | Decision           | Choice                                              | Why                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | Accounts & auth    | **Guest-first + optional accounts**                 | Preserve the app's biggest strength — zero-friction instant play — while adding optional Supabase Auth (email + Google) so players _can_ save stats, appear on leaderboards, and sync across devices. No forced login.                                                                                                                              |
| **D2**  | Phase-1 scope      | **Public site shell first**                         | Build the polished, presentable wrapper (landing, play, about, gallery, nav/footer, 404, design system) around the game that already works, before deepening the player platform. Fastest path to a complete, high-quality result.                                                                                                                  |
| **D3**  | Visual direction   | **Bolder redesign**                                 | Establish a fresh, more premium visual identity (new palette, typography, mood, motion) rather than only evolving the current desi/marigold theme.                                                                                                                                                                                                  |
| **D3a** | Design language    | **"Contemporary Indian Premium"** (user-specified)  | Monopoly GO (playful) × Apple (minimal) × Tanishq (premium gold) × CRED (dark luxury) × Swiggy/Zomato (warm Indian). Navy canvas `#121726`, surface `#20273A`, gold `#E6B54A`, cream `#F5EBD7`, coral (energy) `#EF6A5B`, mint (success) `#72C7A6`. Tiny Indian touches, not heavy motifs. Fully specified by the user — see `03-design-system.md`. |
| **D4**  | Leaderboard trust  | **Online-validated games only**                     | Local vs-AI / pass-and-play results are client-computed and trivially spoofable; online games are already server-validated (`validate-action` replays via the engine). Public boards rank only online games; local play feeds private stats. Honest and cheat-resistant. See `08-phase-2-player-platform.md`.                                       |
| **D5**  | Sign-in method     | **Email + password (with reset) + existing Google** | Give players a familiar, provider-independent account option alongside Google. Guests link either in place (Supabase preserves `user.id`), so history carries over with no migration.                                                                                                                                                               |
| **D6**  | Phase-2 sequencing | **Sub-phases 2a → 2b → 2c**                         | Identity → stats/profile/dashboard → leaderboards. Each ships independently and is usable on its own, so we course-correct between them.                                                                                                                                                                                                            |

Future decisions get appended here as we make them.

---

## Current state (what we build ON, not from scratch)

- **Stack:** React 19 + TypeScript, Vite, Tailwind v4, PixiJS board, Zustand, React Router, Dexie (IndexedDB), Supabase (edge functions) for online rooms, PWA (service worker), PostHog analytics, Sentry.
- **Rules engine:** `packages/engine` — pure, framework-free, 132 tests. The game logic is solid and stays as-is.
- **Routes (now):** `/` (Landing), `/play` (game setup + resume list), `/rules`, `/about`, `/profile`, `/settings`, `/game/:id`, `/room/:roomId`, `/join/:roomCode`, `/online/:roomId`, `*` (404), `/gallery` (dev-only). The old game-setup home moved from `/` to `/play`.
- **Auth (as of Phase 2a):** guest-first anonymous sessions, upgradable to a durable account via **email+password (with reset)** or **Google** — linked in place so `user.id` (and history) is preserved. `/login` + `/reset` screens; header Sign-in / avatar.
- **Theming:** dark + light, theme-aware (premium palette). PWA installable.

---

## Phase roadmap

- **Phase 1 — Public site shell + bolder design system** (**shipped, complete**)
  ✅ Landing · Play · About · **Rules / How to Play** · Gallery · global nav + footer ·
  404 · design system (light+dark, Fraunces+Manrope, softened palette + ambient aurora ·
  micro-interactions) · SEO & social-sharing · game reskinned to match.
- **Phase 2 — Player platform** (**planned** — see `08-phase-2-player-platform.md`)
  Additive to guest-first (D1). Three sub-phases:
  - **2a Durable identity** (**built**) — email+password (+reset) alongside Google; guest→account linking (keeps `user.id`); expanded Profile; header Sign-in. Routes `/login`, `/reset`.
  - **2b Stats & your play** (**built**) — persist a `game_result` at game-over (Dexie v2 local-first + synced when signed in); personal stats (win rate by mode, best net worth, streak, favourite cities); Profile stat strip + a `/dashboard` (resume + your play + recent results). vs-AI + online only (pass-and-play excluded). Needs Supabase migration `0006_game_results.sql`.
  - **2c Leaderboards** (**built**) — online-validated rankings only (D4), opt-in and privacy-aware. `/leaderboards` (mode tabs + all-time/30-day) reads a `security definer` `leaderboard()` RPC (min 5 online games); Profile has the opt-in toggle. Needs Supabase migration `0007_leaderboard.sql`.
- **Phase 3 — Community & scale**
  Achievements, news/updates, tournaments, messaging, i18n, admin — only as needed.

---

## Document index (built as we go)

| Doc                              | Area                                                             | Status                                   |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `01-structure.md`                | Sitemap, routing map, global nav/footer, breakpoints             | **implemented**                          |
| `rules-content.md`               | Full rulebook content for the `/rules` page (from the engine)    | **built & live** at `/rules`             |
| `02-information-architecture.md` | Per-page purpose, content hierarchy, flows, CTAs                 | pending                                  |
| `03-design-system.md`            | "Contemporary Indian Premium" — tokens, type, components, motion | **implemented** (light+dark, in code)    |
| `04-wireframes.md`               | Low-fi layouts per page, in the new system                       | **Landing built**; others shipped ad-hoc |
| `05-component-library.md`        | Reusable components + states                                     | pending                                  |
| `06-technical-architecture.md`   | Routing, state, auth, data, perf, SEO, deploy                    | pending                                  |
| `07-accessibility.md`            | Keyboard, focus, semantics, WCAG, contrast                       | pending                                  |
| `08-phase-2-player-platform.md`  | Phase 2 plan: identity, stats, profile/dashboard, leaderboards   | **planned** (design sketch, pre-build)   |

Maps onto the 14-section brief: structure → IA → wireframes → design system →
branding → UX → motion → media → components → responsive → technical → perf/a11y →
scalability → workflow.
