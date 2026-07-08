import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSession } from "@/state/session";

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
    // Runs once — init() itself guards against re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Outlet />;
}
