import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/services/supabase";
import { syncUnsyncedResults } from "@/services/stats";

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Whether this player has opted in to appear on public leaderboards (2c).
   *  Defaults false; resilient to the column not existing pre-migration. */
  leaderboardOptIn: boolean;
}

export type SessionStatus =
  | "unconfigured" // no Supabase project wired up yet
  | "loading"
  | "guest"
  | "authenticated"
  | "error";

/** Result of an auth action, so screens can show inline feedback without
 *  reaching into the store's global `error`. `message` is safe to surface. */
export interface AuthResult {
  ok: boolean;
  message?: string;
}

const NOT_CONFIGURED = "Accounts aren’t available right now.";

interface SessionState {
  status: SessionStatus;
  user: User | null;
  profile: Profile | null;
  error: string | null;
  /** True after arriving from a password-reset email (Supabase fires
   *  PASSWORD_RECOVERY); the /reset screen then shows the set-password form. */
  recoveryMode: boolean;
  init: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Link Google to the current (guest) user in place, preserving user.id. */
  linkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Create a durable email+password account. For a guest this upgrades the
   *  anonymous user IN PLACE (same user.id → history kept); otherwise a fresh
   *  sign-up. May require email confirmation depending on project settings. */
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  /** Set a new password — used from the /reset recovery flow and Profile. */
  updatePassword: (password: string) => Promise<AuthResult>;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  setLeaderboardOptIn: (on: boolean) => Promise<AuthResult>;
}

async function ensureProfile(user: User): Promise<Profile> {
  if (!supabase) throw new Error("Supabase not configured");

  // Insert the profile row if it's missing. We deliberately don't read this
  // upsert's return body: with `ignoreDuplicates` (ON CONFLICT DO NOTHING),
  // PostgREST replies 201 with an EMPTY representation, which made a chained
  // `.single()` throw — silently aborting guest sign-in so `user` never got
  // set. Fetch the row separately instead, with graceful fallbacks.
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: fullName }, { onConflict: "id", ignoreDuplicates: true });
  if (upsertError) throw upsertError;

  // select("*") is deliberate: it tolerates the leaderboard_opt_in column not
  // existing yet (pre-migration-0007) — it just comes back absent → false.
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  return {
    id: user.id,
    displayName: (data?.display_name as string | null | undefined) ?? fullName,
    avatarUrl: (data?.avatar_url as string | null | undefined) ?? null,
    leaderboardOptIn: (data?.leaderboard_opt_in as boolean | undefined) ?? false,
  };
}

export const useSession = create<SessionState>((set, get) => ({
  status: isSupabaseConfigured ? "loading" : "unconfigured",
  user: null,
  profile: null,
  error: null,
  recoveryMode: false,

  init: async () => {
    if (!supabase) return; // status is already "unconfigured"

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") set({ recoveryMode: true });
      if (session?.user) {
        const nextStatus: SessionStatus = session.user.is_anonymous ? "guest" : "authenticated";
        ensureProfile(session.user)
          .then((profile) => {
            set({ user: session.user, profile, status: nextStatus });
            // Newly signed in? Flush any results captured while a guest.
            if (nextStatus === "authenticated") void syncUnsyncedResults();
          })
          .catch((err: Error) => set({ error: err.message, status: "error" }));
      } else {
        set({ user: null, profile: null, status: "loading" });
      }
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      // onAuthStateChange above already fires for this, nothing more to do.
      return;
    }

    // No session at all yet — guest-first onboarding means we don't make
    // the player choose anything before they can play.
    await get().continueAsGuest();
  },

  continueAsGuest: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) set({ error: error.message, status: "error" });
    // Success path resolves via the onAuthStateChange listener above.
  },

  signInWithGoogle: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ error: error.message, status: "error" });
  },

  linkGoogle: async () => {
    if (!supabase) return;
    // linkIdentity attaches Google to the CURRENT user (keeps user.id), unlike
    // signInWithOAuth which would switch to a separate Google user.
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ error: error.message, status: "error" });
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null, profile: null, status: "loading" });
    // Re-establish a guest session immediately rather than leaving the
    // player logged out entirely — matches guest-first onboarding.
    await get().continueAsGuest();
  },

  signUpWithEmail: async (email, password) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const user = get().user;
    // A guest upgrades in place so their user.id (and all history) is kept.
    if (user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser({ email, password });
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: "Almost there — check your email to confirm your account." };
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Almost there — check your email to confirm your account." };
  },

  signInWithEmail: async (email, password) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    // Success resolves via onAuthStateChange (sets user/profile/status).
    return { ok: true };
  },

  sendPasswordReset: async (email) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) return { ok: false, message: error.message };
    // Deliberately vague so we don't reveal which emails have accounts.
    return { ok: true, message: "If that email has an account, a reset link is on its way." };
  },

  updatePassword: async (password) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message };
    set({ recoveryMode: false });
    return { ok: true, message: "Password updated." };
  },

  updateDisplayName: async (name) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const user = get().user;
    if (!user) return { ok: false, message: "You’re not signed in." };
    // Requires an RLS policy letting a user update their own profiles row.
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    if (error) return { ok: false, message: error.message };
    set((s) => ({ profile: s.profile ? { ...s.profile, displayName: name } : s.profile }));
    return { ok: true, message: "Name saved." };
  },

  setLeaderboardOptIn: async (on) => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const user = get().user;
    if (!user) return { ok: false, message: "You’re not signed in." };
    const { error } = await supabase
      .from("profiles")
      .update({ leaderboard_opt_in: on })
      .eq("id", user.id);
    if (error) return { ok: false, message: error.message };
    set((s) => ({ profile: s.profile ? { ...s.profile, leaderboardOptIn: on } : s.profile }));
    return { ok: true, message: on ? "You’re on the leaderboards." : "Removed from leaderboards." };
  },
}));
