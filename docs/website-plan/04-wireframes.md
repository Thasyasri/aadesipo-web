# 04 — Wireframes

Low-fidelity layout decisions per page, in the **Contemporary Indian Premium** system
(see `03-design-system.md`). One page is fully specified at a time — we build it,
then move to the next. **Landing is first** (the new front door).

> **Landing — high-fidelity mockup is live:** the `landing-v1` Artifact realizes the
> section stack below in the full design system (published for review before it lands
> in the codebase).

Notation: `┃` = full-bleed section band · `[ ]` = card · `▸` = CTA · numbers in the
copy are the engine's real values (rendered from engine constants on the live page).

---

## Landing (`/`) — the front door

**Job:** in one screen, make a stranger want to play _right now_, with zero friction
(guest-first, Decision D1). Secondary: convey that this is a premium, distinctly
Indian take on the property game — skill over luck. Every primary CTA routes to
`/play` (or straight into a guest game); nothing demands an account.

**Tone:** committed dark navy world, gold used with restraint, one warm hero moment.
Mobile-first single column; desktop widens hero and switches feature/mode grids to
2–3 columns.

### Section stack (top → bottom)

```
┌─ NAV (sticky, translucent navy, hairline under) ───────────────────────┐
│  ₹ AadesiPo            Play · Rules · About · Gallery        ▸ Play now  │
└────────────────────────────────────────────────────────────────────────┘

┃ HERO ──────────────────────────────────────────────────────────────────
│  greet(mint, serif italic): "Namaskaram! 👋"   eyebrow: PASS-AND-PLAY · VS AI · ONLINE
│  H1 (serif, balance):  Own the [Telugu states](gold). [Bankrupt your friends.](coral)
│  sub:   Buy Charminar, build on Jubilee Hills, hit the beach at Vizag, duck the
│         Sarpanch Gari Dabba. No sign-up, no download — just roll.
│  ▸ Play free   ▸ How to play          assure(mint): Free · Instant · No login
│  ───────────────────────────────────────────────────────────────────────
│  RIGHT / BELOW: hero visual — 3 cream collectible tiles (real cities:
│  Visakhapatnam · Charminar[turn-ring] · Jubilee Hills), gentle float, plus a
│  just-rolled cream die and a floating mint "↑ +₹2,00,000" GO-salary chip.
│  This is the thesis: the collectible unit, live and in motion.
┃─────────────────────────────────────────────────────────────────────────

  STATS BAND (hairline top+bottom; big gold serif tabular numbers)
  [ 22 Telugu cities ] [ 40 board tiles ] [ 3 game modes ] [ 2–5 players ]

  WHY IT'S DIFFERENT  (sec-head, serif + one-line sub)
  [ Guest-first     ] [ Skill, not luck ] [ Proudly local     ] [ Play your way ]
    instant play        deterministic       both Telugu states      AI · local · online
    one tap, no acct     events — the        Sarpanch Gari Dabba,    2–5 players
                         outcome table is     ₹ Lakh/Crore money
                         readable up front

  ── lotus ornament divider ──

  MEET YOUR RIVALS  (personality showcase — fun, memorable)
  [ 🎲 The Gambler   ] [ 😈 The Troll      ] [ 💰 The Miser      ]
    "All in, always"     "Chaos merchant"      "Never overpays"
    + one-line taunt      + one-line taunt      + one-line taunt
  (the three real AI personalities: gambler / troll / miser · easy→hard)

  MODES  (sec-head + "pick your pace")
  [ Classic          ] [ Quick             ] [ Marathon          ]
    ₹15L start           ₹25L start            ₹15L start
    40 rounds            15 rounds             80 rounds
    +₹0.5L / 10 rds      +₹1L / 4 rds          +₹0.25L / 15 rds
    "Full-length game"   "Short, big bankroll" "Long haul to elimination"
  (values from engine GAME_MODES — never hand-typed on the live page)

  ── lotus ornament divider ──

  THE BOARD  (showcase band — REAL tiles only, from the engine)
  row of 8 property tiles, one per colour set, spanning both states + the premium
  tier: Nizamabad · Warangal · Kakinada · Visakhapatnam · Tirupati · Jubilee Hills
  · Charminar · Taj Mahal. Each a cream card: colour band, flat local icon,
  Name (CODE), real ₹ price. caption: 40 tiles · 22 cities · 4 transit · 2 utilities
  · 3 Chance · 3 Sarpanch Gari Dabba.

  HOW IT WORKS  (3 numbered steps — a real sequence, so numbering earns its place)
  1 Pick a mode & house rules   2 Add players (AI, friends, or online)   3 Roll
  pointer: "New here? Read the full rulebook →"  (→ /rules)

┃ FINAL CTA (gold-tinted band) ───────────────────────────────────────────
│  kicker(gold serif): "One more game, anna?"   H2: Your board is waiting.
│                                     ▸ Play as guest   (mint: no login needed)
┃─────────────────────────────────────────────────────────────────────────

┌─ FOOTER ───────────────────────────────────────────────────────────────┐
│  ₹ AadesiPo — a modern desi property game                               │
│  Play · Rules · About · Gallery      Privacy · Terms                     │
│  Made in India · not affiliated with Hasbro/Monopoly                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Decisions captured here

- **Hero = the collectible tile**, not a screenshot of the running game. The tile is
  the brand's smallest memorable unit and shows the palette + local icons instantly.
  Given life with a just-rolled die and a floating GO-salary chip (the two most
  recognisable game moments) rather than static art.
- **Wow + warmth without clichés:** a cheeky ownership headline (gold "own" / coral
  "bankrupt"), a stats band for instant substance, and a **Meet your rivals**
  personality section. Telugu warmth is carried in **romanized / code-mix English**,
  **not Telugu script** (per user: actual script felt awkward): "Namaskaram, rendaam!"
  greeting, "One more game, anna?" final CTA, "anna" in rival taunts, "Made with ❤️ in
  the Telugu states". Keeps within the design-system "tiny Indian touches" rule.
- **Real content only.** All city names + prices come from the engine board
  (`packages/engine/.../board.ts`). Earlier placeholder tiles (Araku Valley, RTC
  Complex, Prasads IMAX) were **removed** — they were never on the board. The live
  page will read board + `GAME_MODES` + AI personalities directly so nothing drifts.
- **State-neutral:** copy and tiles deliberately span **both** Telugu states
  (Warangal/Charminar/Hyderabad + Vizag/Tirupati/Vijayawada); no single state named.
- **Two hero CTAs only** — "Play free" (primary gold) and "How to play" (outline).
  No account CTA anywhere above the fold (D1).
- **Numbered steps** appear **only** in "How it works" because it is a genuine sequence;
  features, rivals, and modes are unordered and use no numerals.
- **Legal footer** carries the non-affiliation line (trademark safety).

### Responsive

- **≤640:** single column; hero visual stacks under copy; feature/mode grids 1-col;
  nav collapses to logo + "Play now" (full menu → later, or a simple wrap).
- **641–1024:** feature grid 2-col, modes 3-col, hero copy left / tiles right.
- **≥1025:** hero max 1080px, generous vertical rhythm, tiles fan slightly.

---

## Next pages (wireframed after Landing ships)

`/play` · `/rules` · `/about` · `/gallery` — each gets its own section here once the
Landing page is built and approved.
