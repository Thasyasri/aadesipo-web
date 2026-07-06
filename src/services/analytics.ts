import type { PostHog } from "posthog-js";

/**
 * The live PostHog client, or null until (and unless) initAnalytics() loads it.
 * posthog-js is imported dynamically and only when a key is configured, so it
 * never lands in the entry chunk every visitor downloads. Every helper below
 * no-ops or falls back to a default while this is null — nothing requires a
 * real key to keep the app working (local dev, or a deploy without a key).
 */
let client: PostHog | null = null;

/**
 * Call once, at app startup (see src/main.tsx).
 *
 * VITE_POSTHOG_KEY is optional for the same reason as the Sentry DSN — local
 * dev shouldn't require a PostHog project to boot the app.
 */
export async function initAnalytics(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!key) {
    if (import.meta.env.DEV) {
      console.warn("[posthog] VITE_POSTHOG_KEY not set — analytics disabled locally.");
    }
    return;
  }

  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
  });
  client = posthog;
}

/**
 * The funnel this milestone was always meant to fill in: install -> first game
 * -> completion. Every call is a no-op when PostHog isn't configured (client is
 * null), same as the rest of this file.
 */
export const analyticsEvents = {
  gameStarted: (mode: "vs-ai" | "pass-and-play" | "online", playerCount: number) => {
    client?.capture("game_started", { mode, player_count: playerCount });
  },
  gameCompleted: (
    mode: "vs-ai" | "pass-and-play" | "online",
    reason: "last-player-standing" | "net-worth-at-cap",
    playerCount: number,
  ) => {
    client?.capture("game_completed", { mode, reason, player_count: playerCount });
  },
  onlineRoomCreated: () => client?.capture("online_room_created"),
  onlineRoomJoined: () => client?.capture("online_room_joined"),
  turnNotificationsEnabled: () => client?.capture("turn_notifications_enabled"),
};

/**
 * Remote feature flags — demonstrated on the AI's default skill level,
 * directly answering the original design's "remote-configurable economy
 * for live tuning" requirement. Falls back to a sane default so nothing
 * breaks if PostHog isn't configured (or hasn't loaded yet) or the flag
 * doesn't exist.
 */
export function getAiDefaultSkillLevel(): number {
  const flagValue = client?.getFeatureFlagPayload("ai-default-skill-level");
  const parsed = typeof flagValue === "number" ? flagValue : Number(flagValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.85;
}
