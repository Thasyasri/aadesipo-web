# 08 — Phase 2: The Player Platform

> **Status: planned, not yet built.** This is the design/sketch doc for Phase 2.
> It builds on the current-state facts in `README.md` (Decisions Log, roadmap)
> and the shipped Phase-1 shell. Locked decisions are in §1; everything below
> is the plan we build against, sub-phase by sub-phase.

Phase 1 gave AadesiPo a polished public shell around a game that already works.
Phase 2 turns anonymous play into a **player platform**: durable accounts,
persistent stats, a real Profile + Dashboard, and cheat-resistant leaderboards —
**without ever forcing a login** (Decision D1 stands).

---

## 0. The principle & the one insight that shapes everything

**Additive, never subtractive.** A guest today taps Play and is in the game.
That must stay exactly true. Signing in only _adds_ durability, cross-device
sync, and eligibility for leaderboards. No wall, no nag.

**The insight (from the current-state map):** a guest is _already_ an anonymous
Supabase user (`signInAnonymously`), and Supabase **preserves the `user.id`
when an anonymous user links a real identity** (email/password or Google). So:

- Everything — stats, seats, results — is keyed by `user.id` from day one.
- A guest "upgrading" to an account **keeps their whole history**. There is no
  fragile local→server migration to write; linking is the migration.
- Caveat we design around: an _un-linked_ guest's identity is only as durable as
  their browser storage. Their stats live locally regardless (see 2b); the
  server copy + cross-device only begins once they have an account.

---

## 1. Decisions locked for Phase 2

| #      | Decision          | Choice                                                                                                                                                                                                                                                                  |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D4** | Leaderboard trust | **Online-validated only.** Public boards rank _only_ server-validated online games (`validate-action` already replays via the engine). Local vs-AI / pass-and-play count toward your **private** stats and dashboard, never a public board. Honest and cheat-resistant. |
| **D5** | Sign-in           | **Email + password (with reset)**, added alongside the existing Google OAuth. Guests can link either to make their account durable.                                                                                                                                     |
| **D6** | Sequencing        | **Sub-phases 2a → 2b → 2c**, shipped incrementally. Each is usable on its own; we course-correct between them.                                                                                                                                                          |

These extend the Phase-1 Decisions Log (D1–D3a) in `README.md`.

---

## 2. Sub-phase 2a — Durable identity

**Goal:** any player can turn their guest session into a permanent account
(email+password or Google) and keep everything, and a real account area exists.

### Auth surface

- **Email + password**: create account, sign in, and a password-reset flow
  (request link → set new password). Supabase Auth handles the tokens/emails.
- **Google OAuth**: already implemented (`session.ts:signInWithGoogle`) — keep.
- **Guest linking (the important bit):** an anonymous user "upgrades" in place —
  `supabase.auth.updateUser({ email, password })` (or `linkIdentity` for
  Google) on the current anon user, which **preserves `user.id`**. Their online
  history, seats, and (2b) stats carry over with zero data movement.
- **Edge cases to handle:** email already in use by another account (offer sign
  in instead); linking when the anon user already has online games (fine — same
  id); browser storage cleared before linking (the pre-link anon identity and
  its server rows are orphaned — acceptable, and exactly why we nudge sign-in
  _after_ a good game, never before).

### Screens & routes (new)

```
/login      ─ tabbed: [ Sign in | Create account ]  + "Continue with Google"
                       + "Forgot password?" → /reset
/reset      ─ request reset (enter email) → (from email link) set new password
/profile    ─ EXPANDED (see below), replaces today's near-stub
```

### Profile (expanded) — sketch

```
┌─ PROFILE ───────────────────────────────────────────────┐
│  [avatar]  Kartheek                        ✎ Edit        │
│            @kartheek · Signed in (Google)                │
│            ── or ──  Guest · [ Save your progress → ]    │  (guests)
│                                                          │
│  Display name  [ Kartheek________ ]                      │
│  Avatar        ( ◯ pick from set  |  upload )            │
│  Leaderboard   [x] Show me on public leaderboards        │  (opt-in, →2c)
│                                                          │
│  Account       Google · kartheek@… · [ Sign out ]        │
│                Guest:  [ Link email ] [ Link Google ]    │
└──────────────────────────────────────────────────────────┘
```

Headline stats (from 2b) slot in above the account section once 2b lands.

### Nav

Header gains a compact **Sign in** affordance for guests (and the avatar/name
for signed-in players). Everything else in the header stays as Phase 1.

---

## 3. Sub-phase 2b — Stats & "your play"

**Goal:** every finished game leaves a durable record, and Profile + a new
Dashboard show a player their history and trends. Works for guests (local) and
signed-in players (local + synced).

### Capture — where the data comes from

The engine already emits everything we need at game-over; nothing new in the
engine. At `turnPhase === "game-over"` we assemble one **GameResult** for the
local "you" (as built):

```
GameResult {
  id            string   // the engine game id — one row per game (dedup key)
  finishedAt    timestamp
  mode          "classic" | "quick" | "marathon"
  source        "vs-ai" | "online"
  playerCount   number
  won           boolean   // did YOU win (game.winnerId === localPlayerId)
  reason        "last-player-standing" | "net-worth-at-cap"   // win.ts
  netWorth      number    // your final net worth (netWorth(state, you))
  rank          number    // your final standing (1 = winner)
  rounds        number    // game.roundNumber (game length)
  cities        string[]  // real property tiles you held at the end (fav-cities)
  synced        boolean   // pushed to Supabase yet (guests keep it local-only)
}
```

Capture point: `VictoryDialog.tsx`, in the once-per-game block that already
fires the completion analytics — it computes standings via `netWorth()` and
receives a `localPlayerId` from each screen.

**Only games with a single clear "you" are recorded** — **vs-AI** (the human)
and **online** (your seat). **Pass-and-play is excluded**: it's a shared device
with several humans, so there's no one player's result to attribute. (Those
games still show in the resume list; they just don't feed personal stats.)

### Store — local-first, sync when signed in

- **Dexie v2**: a new `gameResults` table (bump `db.ts` to `version(2)`).
  _Always_ written — guests included, fully offline. This is the source of truth
  for "your stats" on this device.
- **Supabase `game_results`**: when a session exists, the same record is synced
  up (a small write-behind queue handles offline → reconnect). Keyed by
  `user.id`. This powers cross-device stats and (for `source='online'`) the
  leaderboards.
- Online games are _already_ recorded server-side (`games`/`game_actions`); 2b
  adds the summarised `game_results` row so we don't recompute from full logs.

### Stats we compute (v1 set — deliberately small and meaningful)

- **Games played** — total, and split by mode + by type (vs-AI / pass-and-play / online)
- **Win rate** — overall and per mode (wins / games)
- **Net worth** — personal best (peak final net worth), and average
- **Streak** — current win streak + best ever
- **Favourite cities** — most-owned real board tiles across your games _(Telugu flavour — "you love Charminar")_
- **Milestones** — first win, fastest win, longest game

### Screens

**Dashboard** (`/dashboard`) — the signed-in/returning-player home:

```
┌─ DASHBOARD ─────────────────────────────────────────────┐
│  Welcome back, Kartheek.                    [ New game ] │
│                                                          │
│  ▸ Resume            [ Classic · 2 AI · 14 rounds  ▶ ]   │  (from Dexie resume list)
│                      [ Online · Room 8FK2Q3       ▶ ]   │
│                                                          │
│  ▸ Your play         Games 42 · Win rate 31% · Best ₹18Cr│  (stat strip)
│    [ win-rate sparkline ]     [ net-worth-over-time ]    │
│                                                          │
│  ▸ Recent results    ✓ Won  Classic vs Rowdy,Konte  ₹12Cr│  (last N GameResults)
│                      ✗ Lost Quick   vs Pisinari      ₹0  │
└──────────────────────────────────────────────────────────┘
```

**Profile** gains a headline stat block above the account section (games, win
rate, best net worth, favourite city).

---

## 4. Sub-phase 2c — Leaderboards

**Goal:** a public, cheat-resistant ranking that rewards real skill.

### Trust model (D4)

Only **`source='online'`** results — which passed server validation — are
eligible. Local games never appear. This is the whole reason the boards can be
trusted: the server already replays every online action through the shared
engine before recording it.

### Ranking

- **v1 metric:** online **wins** (primary) and **win rate** with a **minimum
  games threshold** (e.g. ≥ 10 online games) so a 1-for-1 player can't top it.
- **Later option:** a proper rating (Glicko-2) once online volume justifies it —
  noted as Phase-2.5 / 3, not built in v1.
- **Time windows:** All-time + a rolling window (e.g. last 30 days) so the board
  stays live.

### Privacy

- **Opt-in only.** A player appears on public boards only if they toggled it on
  in Profile (§2a). Default off.
- Anonymous guests are **never** on the board (they have no online-validated
  identity to rank). Signing in + opting in is the gate.
- Boards show the chosen display name/handle, never email.

### Screen (`/leaderboards`)

```
┌─ LEADERBOARDS ──────────────────────────────────────────┐
│  [ Overall | Classic | Quick | Marathon ]   [All-time|30d]│
│  #   Player            Wins   Win%   Games                │
│  1   RowdyKing         58     41%    141                  │
│  2   @kartheek         39     33%    118    ← you         │
│  …                                                        │
│  (min 10 online games to appear)                          │
└──────────────────────────────────────────────────────────┘
```

Implemented as a Supabase **view/materialised view** aggregating
`game_results WHERE source='online'`, exposed read-only.

---

## 5. Data model (additions)

### Supabase (new migrations)

- **`game_results`** — one row per finished game per player.
  `id, user_id (fk auth.users), game_id (nullable — only for online),
mode, source, result, reason, net_worth, rank, player_count, duration_ms,
finished_at`. **RLS:** a user may read/insert only their own rows.
- **`leaderboard` view** — aggregates `game_results WHERE source='online'` into
  `user_id, display_name, wins, games, win_rate`, joined to `profiles`, filtered
  to opt-in users. Read-only, public-safe (no email/PII).
- **`profiles` additions** — `avatar_url` (exists), plus `handle`,
  `leaderboard_opt_in boolean default false`.

### Dexie (bump to v2)

- **`gameResults`** table (`++id, finishedAt, mode, [mode+result]`), the local
  mirror. Migration keeps existing `gameMeta/gameActions/gameSnapshots` untouched.

---

## 6. Routing & nav changes

| Route           | Sub-phase | Notes                             |
| --------------- | --------- | --------------------------------- |
| `/login`        | 2a        | sign in / create account / Google |
| `/reset`        | 2a        | password reset request + set      |
| `/profile`      | 2a → 2b   | expand stub → identity + stats    |
| `/dashboard`    | 2b        | returning-player home             |
| `/leaderboards` | 2c        | public rankings                   |

Header: add **Sign in** (guests) / avatar+name (signed in) in 2a; add
**Leaderboards** link in 2c. Footer link list gains Dashboard/Leaderboards.

---

## 7. New components (inventory)

`AuthForm` (email+password, mode-tabbed), `GoogleButton` (exists as a control),
`AccountSection`, `AvatarPicker`, `StatCard`, `StatStrip`, `Sparkline`
(net-worth / win-rate trend — Canvas, tiny), `ResultRow`, `ResumeCard`,
`LeaderboardTable`, `OptInToggle`. All on the existing design tokens; no new
visual language.

---

## 8. Analytics additions (PostHog)

`sign_up { method }`, `sign_in { method }`, `account_linked { from: guest }`,
`dashboard_viewed`, `leaderboard_viewed { board }`, `leaderboard_opt_in { on }`.
Fire-and-forget, consistent with today's `analytics.ts`.

---

## 9. Privacy, security, accessibility

- **RLS everywhere** on `game_results`; the leaderboard is a curated read-only
  view exposing only opt-in, non-PII fields.
- **No PII on boards** — display name/handle only, never email.
- **Opt-in by default off** for public visibility.
- **Keyboard + focus** on all auth forms and tables; error messages say what went
  wrong and how to fix it (per the design-system copy rules). Respect
  reduced-motion on sparklines.

---

## 10. Out of scope for Phase 2 (→ Phase 3)

Friends/social graph, tournaments/brackets, in-app messaging, achievements/badges,
and a full rating ladder. Named here so the schema (esp. `game_results`) is
shaped to not block them later, but none are built in Phase 2.

---

## 11. Still to pin down during the build

- Exact **avatar** approach (a curated set of game-themed avatars vs. upload).
- Final **stat list** copy + which few surface on Profile vs. the full Dashboard.
- Reset-email + auth-email **templates** (Supabase Auth email branding).
- Whether the **30-day window** and **min-games** numbers need tuning once real
  online volume exists.
