# Legal & Cultural Content Review — M10

This is not legal advice, and it is not a substitute for either a lawyer
or a native-speaker cultural reviewer. It exists to make their job
concrete: exactly what to look at, and why, so the review is efficient
rather than "read the whole app and see what you think."

## 1. Trademark / IP review (needs an actual lawyer)

What's already been deliberately designed to differentiate from
Hasbro's Monopoly, for the lawyer to evaluate rather than assume:

- No use of "Monopoly," "Chance," "Community Chest," or any Hasbro
  trademark anywhere in code, copy, or the app name.
- No top-hat/dog/car/wheelbarrow tokens — players are represented by
  colored circles, not licensed-adjacent iconography.
- Board layout is the genre-standard 40-tile square perimeter (a
  mechanical convention, not Hasbro-specific expression), but property
  names are original (desi city references), not "Boardwalk"/"Park
  Place"/etc.
- Marketing copy in this repo's own README and product description
  currently says "Monopoly-inspired" — **flag this specific phrase for
  the lawyer.** Game _mechanics_ (turn order, property acquisition,
  rent, auctions) are generally understood not to be copyrightable,
  but how comfortable to be with "-inspired" language in public-facing
  store listings and marketing is a judgment call a lawyer should make
  with current case law in mind, not something resolved by this app's
  code.
- The economy config, event card structure, and rent-tier formulas
  live in `packages/engine/src/economy/board.ts` and
  `packages/engine/src/events/index.ts` if the lawyer wants to see the
  actual numbers/structure in question.

## 2. Cultural/content review (needs a native reviewer, or several,

across the regions actually being represented)

**What exists today to review:**

- Property names: `packages/engine/src/economy/board.ts` — city/place
  references across the 8 color groups.
- Event card text: `packages/engine/src/events/index.ts` — currently
  only 6 example cards (3 "Chance," 3 "Funny Events"), proving the
  system works. **The full 60-80 card pack this was always scoped to
  ship with hasn't been authored yet** — review the example cards for
  tone/direction, but the real review needs to happen on the full deck
  once it's written, not these placeholders.
- AI personality flavor: "Miser," "Gambler," "Troll" — check these read
  as playful archetypes, not as leaning on any specific cultural
  stereotype.

**Specific questions worth asking a native reviewer**, not just "does
this seem okay":

- Do the property names represent regions proportionately, or does the
  set skew toward one part of India in a way that reads as exclusionary
  to players from other regions?
- Does event-card humor land as affectionate/in-on-the-joke, or does
  any card's premise only work _by_ invoking a stereotype rather than
  gently ribbing a shared cultural experience?
- Are there regional-language words or references used correctly and
  respectfully (not just phonetically approximated)?

## 3. Standard app-store / legal requirements (needs a lawyer, not this checklist)

Not yet drafted anywhere in this repo — needed before any public launch:

- Privacy policy: covers Supabase-stored data (auth identity, gameplay
  history, push subscription endpoints), PostHog analytics events, and
  Sentry error reports (which can include stack traces/breadcrumbs).
- Terms of service.
- Age rating questionnaire answers: relevant fact for whoever fills
  these out is that the economy is play-money only, by design, with no
  real-money purchases or gambling mechanics anywhere in the engine
  (`packages/engine/src/rules/` has no payment/purchase code paths
  outside in-game currency).
- If any user base could include minors: COPPA (US) and equivalent
  regional rules on data collection from children — this app currently
  collects an email/Google identity via Supabase auth with no age
  gate, which a lawyer should weigh in on before launch.

## What this document is not

It's not a compliance sign-off, and nothing in this repo should be
read as one. Treat every claim above ("no Hasbro trademarks used," "no
gambling mechanics") as a starting point for the lawyer/reviewer to
verify against the actual code, not as a guarantee.
