# Launch Checklist — M12

## Play Store, via TWA (Trusted Web Activity)

AadesiPo is a PWA, not a native app — TWA is Google's supported path
for listing a PWA on Play Store with a thin native wrapper, using the
real web app underneath rather than a rebuild. The manifest is already
TWA-ready (`vite.config.ts`'s `manifest` block: `id`, `name`,
`short_name`, `display: "standalone"`, `theme_color`, icons including
a maskable variant). What's still needed, and can't be done from this
repo alone:

1. **Install Bubblewrap** (Google's TWA packaging CLI):
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://your-deployed-domain.com/manifest.webmanifest
   ```
2. **Generate a signing key** (Bubblewrap can do this, or use an
   existing Play Console key) — this is a real credential to store
   securely, not something to commit to this repo.
3. **Digital Asset Links verification** — Bubblewrap generates
   `assetlinks.json`; it needs to be hosted at
   `https://your-domain.com/.well-known/assetlinks.json` on the _real_
   deployed domain. Without this, the TWA falls back to showing a
   browser address bar instead of a clean full-screen app.
4. **Build the AAB**: `bubblewrap build` produces the Android App
   Bundle Play Console actually accepts.
5. **Play Console → Testing → Closed testing**: create a closed testing
   track, add the beta cohort's Google account emails (see
   `docs/BETA_LAUNCH_CHECKLIST.md`), upload the AAB.

## Apple App Store

See `docs/APP_STORE_LISTINGS.md`'s note on Guideline 4.2 — a bare PWA
wrapper is a realistic rejection risk on iOS specifically. The
realistic near-term path for iOS users is Safari's "Add to Home
Screen," which is already fully supported (manifest + service worker +
push notifications all work this way — see M9). A real App Store
listing is a separate, larger decision than this checklist covers.

## Marketing site

`marketing/index.html` is a real, self-contained landing page (no
build step) using the app's actual Festival Premium design tokens and
real product content — not placeholder copy. It's structurally
validated (well-formed HTML, balanced CSS, working internal anchor
links) but has never been viewed in an actual browser, since none is
available in the environment this was built in. **Open it locally and
look at it before deploying** — structural validation catches broken
markup, not bad visual judgment.

Deploy it to whatever serves the public domain — a static host
(Cloudflare Pages, Netlify, GitHub Pages) works fine since it's
genuinely just one HTML file with embedded CSS and a Google Fonts link.

## Supabase deploy — required before the next release

The QA pass added three migrations and two Edge Functions. The app degrades
without them: online results stop syncing, and a disconnected player still
deadlocks their game.

Apply, in order:

- `0008_lock_room_after_start.sql` — freezes room settings and seating once a
  game starts. Nothing writes those tables from the client, so this is safe to
  apply at any time.
- `0009_verified_online_results.sql` — stops clients inserting `source='online'`
  result rows. **Deploy `record-result` first**, or online results will fail to
  sync (they retry, so nothing is lost). Any pre-existing online rows are
  self-reported; the file ends with the `delete` to clear them.
- `0010_presence_and_takeover.sql` — adds `room_presence`.

Then deploy both functions:

```
supabase functions deploy record-result
supabase functions deploy advance-turn
```

Both need `SUPABASE_SERVICE_ROLE_KEY` in the function environment, as the
existing functions already do.

## Final pre-submission checklist

- [x] Real Supabase project deployed and smoke-tested (M8 README) —
      migrations 0001-0007 applied; sign-in, `profiles` update and the
      `game_results` RLS insert all verified against the live project.
- [x] Migrations 0008-0010 applied and `record-result` + `advance-turn`
      deployed. Verified against the live project: the ledger reads 0001-0010
      applied, `room_presence` answers, and both new functions 401 an
      unauthenticated call. 0006/0007 had been applied via the SQL Editor and
      were never recorded, so they were `migration repair`ed first — a plain
      `db push` would have re-run 0006 and died on its `create policy`.
      **Still to do:** the pre-verification rows, `delete from game_results
      where source = 'online'` (see the end of 0009). They are self-reported.
- [ ] One real two-player online game played end to end. The store logic is
      unit-tested, but no automated test can drive two authenticated clients
      in a room — reconnect, the turn-takeover banner, and result sync have
      never run against the live project. **This is the only thing standing
      between the current build and a beta.**
- [ ] Real Sentry DSN + PostHog key set (M9/M11)
- [ ] `docs/LEGAL_AND_CONTENT_REVIEW.md` — trademark review with an
      actual lawyer done, at minimum
- [ ] `docs/BETA_LAUNCH_CHECKLIST.md` cohort run, crash-free rate and
      funnel data reviewed
- [x] Privacy policy and terms of service actually drafted — live at
      `/privacy` and `/terms`, linked from the site footer.
      **Still to do:** set a real `CONTACT_EMAIL` in
      `src/features/site/Legal.tsx`, and have both reviewed.
- [x] `pnpm check:bundle` passing on the actual deployed build, not
      just locally — deployed entry chunk measured at ~176 KB gzip
      against the 200 KB budget.
- [ ] Real Lighthouse audit run against the deployed URL (never
      verified in this environment — see the M11 summary)
