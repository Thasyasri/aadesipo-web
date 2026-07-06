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

## Final pre-submission checklist

- [ ] Real Supabase project deployed and smoke-tested (M8 README)
- [ ] Real Sentry DSN + PostHog key set (M9/M11)
- [ ] `docs/LEGAL_AND_CONTENT_REVIEW.md` — trademark review with an
      actual lawyer done, at minimum
- [ ] `docs/BETA_LAUNCH_CHECKLIST.md` cohort run, crash-free rate and
      funnel data reviewed
- [ ] Privacy policy and terms of service actually drafted (referenced
      in both the marketing site footer and the Play Store listing,
      not yet written anywhere in this repo — see the legal review doc)
- [ ] `pnpm check:bundle` passing on the actual deployed build, not
      just locally
- [ ] Real Lighthouse audit run against the deployed URL (never
      verified in this environment — see the M11 summary)
