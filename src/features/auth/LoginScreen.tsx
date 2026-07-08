import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { useToast } from "@/components/Toast";
import { useSession } from "@/state/session";
import { isSupabaseConfigured } from "@/services/supabase";
import { analyticsEvents } from "@/services/analytics";
import { Field } from "./AuthField";

type Tab = "signin" | "signup";

/**
 * The account entry point — sign in or create an email+password account, or
 * continue with Google. Guest-first still holds: signing in is optional and a
 * "keep playing as a guest" escape hatch is always visible.
 */
export function LoginScreen() {
  const { status, signInWithEmail, signUpWithEmail, signInWithGoogle } = useSession();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  // A real (non-guest) account has nothing to do here.
  useEffect(() => {
    if (status === "authenticated") navigate("/profile", { replace: true });
  }, [status, navigate]);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const passwordOk = password.length >= 6;
  const canSubmit = emailOk && passwordOk && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const res =
      tab === "signin"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);
    setBusy(false);
    if (res.ok) {
      analyticsEvents.auth(tab === "signin" ? "sign_in" : "sign_up", "email");
      showToast(res.message ?? "Done.", "success");
      if (tab === "signin") navigate("/profile");
    } else {
      showToast(res.message ?? "Something went wrong. Please try again.", "error");
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}
      <Card>
        <h1 className="mb-1 font-display text-title">
          {tab === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mb-5 text-caption text-text-secondary">
          {tab === "signin"
            ? "Sign in to sync your stats across devices."
            : "Save your progress and appear on the leaderboards — your current games carry over."}
        </p>

        <div className="mb-5 flex rounded-pill bg-bg-base p-1">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`flex-1 rounded-pill px-3 py-2 text-body font-semibold transition-colors ${
                tab === t ? "bg-brand-primary text-[#1A1200]" : "text-text-secondary"
              }`}
            >
              {t === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            type="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
          {tab === "signin" && (
            <Link
              to="/reset"
              className="self-end text-caption font-semibold text-brand-primary-strong hover:underline"
            >
              Forgot password?
            </Link>
          )}
          <Button
            type="submit"
            variant="primary"
            className="mt-1 w-full"
            loading={busy}
            disabled={!canSubmit}
          >
            {tab === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-bg-raised" />
          <span className="text-caption text-text-disabled">or</span>
          <div className="h-px flex-1 bg-bg-raised" />
        </div>

        <Button variant="secondary" className="w-full" onClick={() => void signInWithGoogle()}>
          Continue with Google
        </Button>
      </Card>

      <p className="text-center text-caption text-text-secondary">
        No account needed to play —{" "}
        <Link to="/play" className="font-semibold text-brand-primary-strong hover:underline">
          keep playing as a guest
        </Link>
        .
      </p>
    </div>
  );
}
