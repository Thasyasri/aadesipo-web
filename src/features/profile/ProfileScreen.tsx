import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { useToast } from "@/components/Toast";
import { useSession } from "@/state/session";
import { isSupabaseConfigured } from "@/services/supabase";
import { Field } from "@/features/auth/AuthField";
import { useStats } from "@/features/stats/useStats";
import { StatStrip } from "@/features/stats/StatViews";

export function ProfileScreen() {
  const { status, user, profile, linkGoogle, signOut, updateDisplayName } = useSession();
  const { stats } = useStats();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const { showToast } = useToast();

  // Keep the edit field in sync when the profile loads/changes.
  useEffect(() => {
    setName(profile?.displayName ?? "");
  }, [profile?.displayName]);

  const isGuest = status === "guest";
  const isAuthed = status === "authenticated";
  const email = user?.email ?? null;
  const provider = (user?.app_metadata?.provider as string | undefined) ?? null;
  const displayName = profile?.displayName || (isAuthed ? "Player" : "Guest");
  const initial = displayName.charAt(0).toUpperCase();

  const nameChanged = name.trim().length > 0 && name.trim() !== (profile?.displayName ?? "");

  const saveName = async () => {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    const res = await updateDisplayName(name.trim());
    setSavingName(false);
    showToast(res.message ?? (res.ok ? "Saved." : "Couldn’t save."), res.ok ? "success" : "error");
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}

      <Card>
        <div className="mb-6 flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-primary font-display text-title text-[#1A1200]">
            {initial}
          </div>
          <div>
            <h1 className="font-display text-title">{displayName}</h1>
            <p className="text-caption text-text-secondary">
              {isAuthed
                ? `Signed in${provider && provider !== "email" ? ` · ${provider}` : ""}`
                : "Playing as a guest"}
            </p>
          </div>
        </div>

        {stats && stats.games > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            <StatStrip stats={stats} />
            <Link
              to="/dashboard"
              className="self-start text-caption font-semibold text-brand-primary-strong hover:underline"
            >
              View your dashboard →
            </Link>
          </div>
        )}

        {isGuest && (
          <div className="flex flex-col gap-3">
            <p className="text-caption text-text-secondary">
              Save your progress to sync stats across devices and appear on the leaderboards. Your
              current games carry over — nothing is lost.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/login">
                <Button variant="primary">Save your progress</Button>
              </Link>
              <Button variant="secondary" onClick={() => void linkGoogle()}>
                Link Google
              </Button>
            </div>
          </div>
        )}

        {isAuthed && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Field
                label="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder="Your name"
              />
              <Button
                variant="secondary"
                className="self-start"
                loading={savingName}
                disabled={!nameChanged || savingName}
                onClick={() => void saveName()}
              >
                Save name
              </Button>
            </div>

            <div>
              <p className="mb-2 text-caption text-text-secondary">
                Account{email ? ` · ${email}` : ""}
              </p>
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
