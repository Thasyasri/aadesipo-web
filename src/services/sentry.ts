import * as Sentry from "@sentry/react";

/**
 * Call once, at app startup (see src/main.tsx).
 *
 * VITE_SENTRY_DSN is intentionally optional: local dev without a DSN just
 * skips init rather than throwing, so nobody needs a Sentry account to run
 * `pnpm dev`.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.warn("[sentry] VITE_SENTRY_DSN not set — error tracking disabled locally.");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_RELEASE__, // required for Sentry's crash-free-rate to be meaningful per-release
    // Session tracking itself (what crash-free rate is computed from)
    // is automatic in this SDK version — no opt-in flag exists anymore.
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  });
}
