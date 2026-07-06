/// <reference types="vite/client" />

/** Git short SHA at build time, or `v{package.json version}` as a fallback
 *  when no .git is available. See vite.config.ts's resolveReleaseId(). */
declare const __APP_RELEASE__: string;
