import posthog from "posthog-js";

/**
 * Call once, at app startup (see src/main.tsx).
 *
 * VITE_POSTHOG_KEY is optional for the same reason as the Sentry DSN —
 * local dev shouldn't require a PostHog project to boot the app.
 */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!key) {
    if (import.meta.env.DEV) {
      console.warn("[posthog] VITE_POSTHOG_KEY not set — analytics disabled locally.");
    }
    return;
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    // Funnel events (install -> first game -> D1) get added as those
    // milestones (M6, M8) land — nothing to capture yet in M1.
  });
}

export { posthog };

/**
 * The funnel this milestone was always meant to fill in (see the M1
 * comment this replaces): install -> first game -> completion. Every
 * call is a no-op when PostHog isn't configured, same as the rest of
 * this file — nothing here requires a real key to keep working locally.
 */
export const analyticsEvents = {
  gameStarted: (mode: "vs-ai" | "pass-and-play" | "online", playerCount: number) => {
    posthog.capture("game_started", { mode, player_count: playerCount });
  },
  gameCompleted: (
    mode: "vs-ai" | "pass-and-play" | "online",
    reason: "last-player-standing" | "net-worth-at-cap",
    playerCount: number,
  ) => {
    posthog.capture("game_completed", { mode, reason, player_count: playerCount });
  },
  onlineRoomCreated: () => posthog.capture("online_room_created"),
  onlineRoomJoined: () => posthog.capture("online_room_joined"),
  turnNotificationsEnabled: () => posthog.capture("turn_notifications_enabled"),
};

/**
 * Remote feature flags — demonstrated on the AI's default skill level,
 * directly answering the original design's "remote-configurable economy
 * for live tuning" requirement. Falls back to a sane default so nothing
 * breaks if PostHog isn't configured or the flag doesn't exist yet.
 */
export function getAiDefaultSkillLevel(): number {
  const flagValue = posthog.getFeatureFlagPayload("ai-default-skill-level");
  const parsed = typeof flagValue === "number" ? flagValue : Number(flagValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.85;
}
