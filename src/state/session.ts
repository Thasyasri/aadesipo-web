import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/services/supabase";

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type SessionStatus =
  | "unconfigured" // no Supabase project wired up yet
  | "loading"
  | "guest"
  | "authenticated"
  | "error";

interface SessionState {
  status: SessionStatus;
  user: User | null;
  profile: Profile | null;
  error: string | null;
  init: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
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

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    displayName: data?.display_name ?? fullName,
    avatarUrl: data?.avatar_url ?? null,
  };
}

export const useSession = create<SessionState>((set, get) => ({
  status: isSupabaseConfigured ? "loading" : "unconfigured",
  user: null,
  profile: null,
  error: null,

  init: async () => {
    if (!supabase) return; // status is already "unconfigured"

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const nextStatus: SessionStatus = session.user.is_anonymous ? "guest" : "authenticated";
        ensureProfile(session.user)
          .then((profile) => set({ user: session.user, profile, status: nextStatus }))
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

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null, profile: null, status: "loading" });
    // Re-establish a guest session immediately rather than leaving the
    // player logged out entirely — matches guest-first onboarding.
    await get().continueAsGuest();
  },
}));
