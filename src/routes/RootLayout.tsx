import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSession } from "@/state/session";
import { purgeFinishedGames } from "@/services/db";

/**
 * Top-level wrapper: boots the session once, then renders whichever layout the
 * matched route selected (SiteLayout for browsing pages, GameLayout for
 * gameplay). The visible chrome (header/footer) lives in those layouts now, so
 * every page shares one header and one design system.
 */
export function RootLayout() {
  const init = useSession((s) => s.init);

  useEffect(() => {
    void init();
    // Sweep away the replay data of long-finished games. Best-effort and
    // off the critical path: a failure here costs some disk, nothing else.
    void purgeFinishedGames().catch(() => {});
    // StrictMode invokes this twice in development. init() is idempotent (it
    // memoises its own run), which it genuinely was NOT when this comment first
    // claimed it: two calls meant two anonymous sign-ins and two user ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Outlet />;
}
