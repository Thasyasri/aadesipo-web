import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import {
  getPushSupportStatus,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/services/push";
import { analyticsEvents } from "@/services/analytics";

export function SettingsScreen() {
  const { showToast } = useToast();
  const [supportStatus] = useState(getPushSupportStatus);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (supportStatus === "supported") {
      void isPushSubscribed().then(setSubscribed);
    }
  }, [supportStatus]);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        const result = await subscribeToPush();
        if (result.ok) {
          setSubscribed(true);
          analyticsEvents.turnNotificationsEnabled();
        } else {
          showToast(result.error ?? "Couldn't enable notifications", "error");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Card>
        <h1 className="mb-4 font-display text-title">Settings</h1>
        <div className="flex items-center justify-between">
          <span className="text-body">Theme</span>
          <ThemeToggle />
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-display text-heading">Turn notifications</h2>

        {supportStatus === "unsupported" && (
          <p className="text-body text-text-secondary">
            Your browser doesn't support push notifications.
          </p>
        )}

        {supportStatus === "ios-needs-install" && (
          <p className="text-body text-text-secondary">
            On iPhone/iPad, turn notifications only work once AadesiPo is added to your Home Screen:
            tap Share → Add to Home Screen, then open it from there and come back to this setting.
          </p>
        )}

        {supportStatus === "supported" && (
          <>
            <p className="mb-4 text-body text-text-secondary">
              Get notified when it's your turn in an online game. Android gets full support; iOS
              works once installed to your Home Screen.
            </p>
            <Button
              variant={subscribed ? "secondary" : "primary"}
              disabled={busy}
              onClick={() => void handleToggle()}
            >
              {subscribed ? "Turn off notifications" : "Enable turn notifications"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
