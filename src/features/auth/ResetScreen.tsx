import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { useToast } from "@/components/Toast";
import { useSession } from "@/state/session";
import { isSupabaseConfigured } from "@/services/supabase";
import { Field } from "./AuthField";

/**
 * Password reset — two halves in one screen. Normally it's the "email me a
 * link" request form; arriving from that link puts the session in
 * `recoveryMode`, where it becomes the "set a new password" form instead.
 */
export function ResetScreen() {
  const { recoveryMode, sendPasswordReset, updatePassword } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const requestReset = async () => {
    if (!/\S+@\S+\.\S+/.test(email) || busy) return;
    setBusy(true);
    const res = await sendPasswordReset(email);
    setBusy(false);
    if (res.ok) {
      setSent(true);
      showToast(res.message ?? "Check your email.", "success");
    } else {
      showToast(res.message ?? "Something went wrong. Please try again.", "error");
    }
  };

  const setNewPassword = async () => {
    if (password.length < 6 || busy) return;
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.ok) {
      showToast(res.message ?? "Password updated.", "success");
      navigate("/profile");
    } else {
      showToast(res.message ?? "Something went wrong. Please try again.", "error");
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}
      <Card>
        {recoveryMode ? (
          <>
            <h1 className="mb-1 font-display text-title">Set a new password</h1>
            <p className="mb-5 text-caption text-text-secondary">
              Choose a new password for your account.
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void setNewPassword();
              }}
            >
              <Field
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
              <Button
                type="submit"
                variant="primary"
                className="mt-1 w-full"
                loading={busy}
                disabled={password.length < 6 || busy}
              >
                Update password
              </Button>
            </form>
          </>
        ) : sent ? (
          <>
            <h1 className="mb-1 font-display text-title">Check your email</h1>
            <p className="text-caption text-text-secondary">
              If an account exists for <b className="text-text-primary">{email}</b>, a
              password-reset link is on its way. Follow it to set a new password.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1 font-display text-title">Reset your password</h1>
            <p className="mb-5 text-caption text-text-secondary">
              Enter your email and we’ll send you a reset link.
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void requestReset();
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
              <Button
                type="submit"
                variant="primary"
                className="mt-1 w-full"
                loading={busy}
                disabled={!/\S+@\S+\.\S+/.test(email) || busy}
              >
                Send reset link
              </Button>
            </form>
          </>
        )}
      </Card>

      <p className="text-center text-caption text-text-secondary">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-brand-primary-strong hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
