# App Store Listing Copy — Drafts

Ready to use as a starting point, not a final sign-off — screenshots,
final character-count trims, and platform-specific keyword research
still need a human pass.

## Google Play Store

**App name** (30 char max): `AadesiPo — Desi Monopoly Game`

**Short description** (80 char max):
`A desi-flavored Monopoly-style party game. Play with friends, free.`

**Full description**:

> Game night in your pocket.
>
> AadesiPo is a desi-flavored, Monopoly-inspired party game built for
> however your evening's actually going:
>
> 🎲 PASS & PLAY — Everyone's in the same room, sharing one phone. A
> privacy screen shows between turns, so nobody peeks at the next
> player's move.
>
> 🔗 ONLINE ROOMS — Create a room, send the link. Friends join from
> anywhere and play in real time.
>
> 🤖 VS. AI — Three genuinely different AI personalities are always up
> for a game: the cautious Miser, the reckless Gambler, and the Troll
> who'd rather block you than win cleanly.
>
> The rules: roll and move, buy properties or let them go to auction,
> build your color group into houses and a hotel, and trade your way
> out of a tight spot before you run out of moves.
>
> No real money, ever — every rupee on the board is play money. There's
> nothing to buy your way out of.
>
> FEATURES
> • 2-5 players, any combination of local and online
> • Full offline play against AI — no connection required
> • Games save automatically — close the tab, pick up right where you left off
> • Light and dark themes

**Category**: Board / Family
**Content rating questionnaire notes**: no real-money gambling, no
in-app purchases in this version, no user-generated text content
(emotes only, no free-text chat) — see `docs/LEGAL_AND_CONTENT_REVIEW.md`
before finalizing the actual questionnaire answers.

## Apple App Store

**Important**: Apple's App Store review guideline 4.2 (Minimum
Functionality) generally rejects apps that are just a wrapped website
with no substantial native functionality. A bare PWA/TWA-style wrapper
— which is what this app is today — is a realistic rejection risk on
iOS specifically, even though the identical approach is fine on Google
Play. iOS users can still install AadesiPo via Safari's "Add to Home
Screen" (already the app's documented path for push notifications —
see the M9 Settings screen), but an actual App Store _listing_ likely
needs either substantially more native integration or a Capacitor-based
wrapper with real native APIs used, not just a splash screen around
the web app. Confirm this with a developer familiar with current App
Store review outcomes before spending time on a submission that's
likely to bounce.

**Subtitle** (30 char max, if pursuing a listing regardless):
`Desi Monopoly with friends`

**Promotional text** (170 char max):
`Play pass-and-play, online with friends, or against three very
different AI opponents. No real money, ever — just bragging rights.`

(Full description would mirror the Play Store version above.)
