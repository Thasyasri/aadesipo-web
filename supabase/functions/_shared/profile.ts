// Ensures a profile row exists for a user before any insert that FK-references
// profiles(id) — namely rooms.host_id and room_players.user_id.
//
// A brand-new guest signs in anonymously and the *client* creates their profile
// row asynchronously (see src/state/session.ts `ensureProfile`). But the join
// screen fires join-room the instant it mounts, which can beat that write — so
// the seat insert races the profile and dies on the foreign key. Creating the
// row here, server-side, removes the race entirely regardless of client timing.

// Minimal structural shapes for the only two things this helper touches — enough
// to stay fully typed without importing the supabase-js types (which don't
// resolve under the Deno-targeted, stubbed function typecheck) and without an
// `any` escape hatch that the linter (rightly) rejects.
interface ProfileClient {
  from(table: string): {
    upsert(
      values: { id: string; display_name: string | null },
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

interface AuthedUser {
  id: string;
  user_metadata?: { full_name?: string } | null;
}

export async function ensureProfile(
  supabase: ProfileClient,
  user: AuthedUser,
): Promise<{ error?: string }> {
  const fullName = user.user_metadata?.full_name ?? null;
  // ignoreDuplicates → ON CONFLICT DO NOTHING: a no-op if the client already
  // created it, an insert if we got here first. Either way the FK is satisfied.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: fullName }, { onConflict: "id", ignoreDuplicates: true });
  return error ? { error: error.message } : {};
}
