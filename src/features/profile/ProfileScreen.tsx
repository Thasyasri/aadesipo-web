import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { useSession } from "@/state/session";
import { isSupabaseConfigured } from "@/services/supabase";

export function ProfileScreen() {
  const { status, profile, signInWithGoogle, signOut } = useSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}

      <Card>
        <h1 className="mb-4 font-display text-title">Profile</h1>
        <p className="mb-1 text-body">
          Name: <span className="text-text-secondary">{profile?.displayName ?? "Guest"}</span>
        </p>
        <p className="mb-6 text-body">
          Status: <span className="text-text-secondary">{status}</span>
        </p>

        {status === "guest" && (
          <div>
            <p className="mb-3 text-caption text-text-secondary">
              Playing as a guest — sign in to keep your profile across devices. No progress is lost
              either way; per the game design, there's nothing to lose (no XP, no inventory).
            </p>
            <Button variant="primary" onClick={() => void signInWithGoogle()}>
              Sign in with Google
            </Button>
          </div>
        )}

        {status === "authenticated" && (
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        )}
      </Card>
    </div>
  );
}
