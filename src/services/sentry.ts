/**
 * Call once, at app startup (see src/main.tsx).
 *
 * @sentry/react is imported dynamically, and only when a DSN is actually
 * configured — so the SDK is never bundled into the entry chunk that every
 * visitor downloads before the app even boots. An unconfigured build (local
 * dev, or a deploy without VITE_SENTRY_DSN) pays nothing for it.
 *
 * VITE_SENTRY_DSN stays optional either way: no DSN just skips init rather
 * than throwing, so nobody needs a Sentry account to run `pnpm dev`.
 */
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.warn("[sentry] VITE_SENTRY_DSN not set — error tracking disabled locally.");
    }
    return;
  }

  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_RELEASE__, // required for Sentry's crash-free-rate to be meaningful per-release
    // Session tracking itself (what crash-free rate is computed from)
    // is automatic in this SDK version — no opt-in flag exists anymore.
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  });
}
