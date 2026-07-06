import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Null when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set, so the
 * app can still boot and render (see src/state/session.ts) before anyone's
 * created a Supabase project. Every call site should check
 * `isSupabaseConfigured` first rather than assuming `supabase` is non-null.
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = supabase !== null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — auth and " +
      "realtime features are disabled until you add them to .env.local.",
  );
}
