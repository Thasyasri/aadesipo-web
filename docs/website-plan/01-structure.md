# 01 — Website Structure (Sitemap, Routing, Global Layout)

Status: drafted for review. Scope reflects **D2 (public shell first)** and
**D1 (guest-first, optional accounts)**.

---

## 1. Sitemap

### Phase 1 — build now (public shell)

```
Landing (/)                     ← new front door: hero, what it is, Play CTA
├── Play Now (/play)            ← today's game-setup (vs AI / Pass & Play / Online)
├── About (/about)              ← story, how it plays, the desi twist
├── Rules / How to Play (/rules)← the complete rulebook: every segment of the game
├── Gallery (/gallery)          ← real screenshots / feature highlights (promote dev-only)
├── 404 (*)                     ← on-brand not-found
└── Legal
    ├── Privacy (/privacy)      ← stub now, fill before public launch
    └── Terms (/terms)          ← stub now

Game surfaces (exist, reskinned to the new system — not rebuilt)
├── Active game (/game/:id)
├── Lobby (/room/:roomId)
├── Join (/join/:roomCode)
└── Online game (/online/:roomId)

Settings (/settings)            ← exists; light polish only in Phase 1
```

### Phase 2 — player platform (planned, not now)

```
Auth (/login, /register, /reset)   ← optional accounts (Supabase Auth: email + Google)
Profile (/profile)                 ← exists; expand with real identity + stats
Dashboard (/dashboard)             ← resume games, recent activity, stats overview
Leaderboards (/leaderboards)       ← rankings
```

### Evaluated & deferred (add only when there's a real need)

FAQ, Contact/Support (lightweight, likely late Phase 1) · News/Updates ·
Achievements · Tournaments · Messaging · Admin dashboard · Maintenance page · i18n.

Rationale: each deferred item is cost without payoff until players/traffic justify it.
Leaderboards, FAQ, 404, and Privacy/Terms are **recommended keepers**; Admin,
Messaging, Tournaments are **deferred**.

---

## 2. Routing map (current → target)

| Today                             | Target                                              | Change                                                            |
| --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `/` = game setup + resume         | `/` = **Landing**                                   | Setup moves to `/play`; Landing becomes the marketing front door  |
| —                                 | `/play`                                             | New route hosting the existing `NewGameSetup` + `ResumeGamesList` |
| `/gallery` (dev-only)             | `/gallery` (public)                                 | Promote to a real, curated page                                   |
| `/profile`                        | `/profile`                                          | Keep; expands in Phase 2                                          |
| `/settings`                       | `/settings`                                         | Keep                                                              |
| `/game`,`/room`,`/join`,`/online` | unchanged                                           | Keep; reskin only                                                 |
| —                                 | `/about`, `/rules`, `/privacy`, `/terms`, `*` (404) | New                                                               |

**Key product decision (flagged):** today the first screen _is_ instant play (zero
friction). Moving setup to `/play` adds one hop. Mitigations to decide in IA (doc 02):
a prominent hero **"Play"** button that deep-links straight to `/play` (or even a
"Quick play vs AI" one-click on the hero), and remembering returning players to keep
play fast. We keep play one tap away from the Landing.

---

## 3. Global layout

### Header / top navigation (public pages)

- **Left:** AadesiPo logo/wordmark → Landing.
- **Center/right:** Play · About · Gallery (+ Leaderboards in Phase 2).
- **Far right:** Theme toggle; **Play** primary CTA; **Sign in** appears in Phase 2 (guest-first: hidden/secondary until accounts ship).
- **Mobile:** collapses to a hamburger drawer; Play CTA stays visible.
- In-game routes use **minimal chrome** (the game needs the screen) — no marketing nav over the board.

### Footer (public pages)

- Brand blurb + logo.
- Columns: Play/Product · Company (About, Contact) · Legal (Privacy, Terms) · Social.
- Small print: © AadesiPo, build/version, "Made with ♥".
- Hidden on in-game routes.

### Navigation model

- Public shell: persistent header + footer via the existing `RootLayout`.
- Game/lobby: focused layout, no footer, minimal header (back + essentials).

---

## 4. Responsive system (baseline — refined in the design system)

Breakpoints (Tailwind v4 defaults we already use):

| Name  | Min width | Target device           |
| ----- | --------- | ----------------------- |
| base  | 0         | small phones            |
| `sm`  | 640       | large phones            |
| `md`  | 768       | tablets / small laptops |
| `lg`  | 1024      | laptops / desktop       |
| `xl`  | 1280      | large desktop           |
| `2xl` | 1536      | wide displays           |

- **Mobile-first**, as the app already is. Content column `max-w` caps (~`max-w-6xl`) on large screens so line lengths stay readable.
- **Spacing:** Tailwind's 4px scale (existing). The design system will fix a vertical rhythm and section spacing scale.
- **Grid:** 12-col fluid for marketing sections; single-column stacks on mobile.
- The game board keeps its own square, viewport-aware sizing (unchanged).

---

## 5. Open items to resolve next (doc 02 — Information Architecture)

1. Landing hero: message, primary/secondary CTA, and how "instant play" is preserved.
2. Play page: keep the current setup UX as-is under new skin, or restructure.
3. About/Gallery content inventory (what media/screenshots we have vs. need).
4. Exact nav labels + order; footer link set.
