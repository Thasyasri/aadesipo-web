import { Outlet, useLocation } from "react-router";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { useScrollReveal } from "./motion";
import "./site.css";

/**
 * Premium shell for the browsing pages (Landing, Play setup, Profile, Settings,
 * 404). The `.lp` root establishes the theme-aware "Contemporary Indian Premium"
 * world AND remaps the app's --color-* tokens, so pages built on the app's own
 * components inherit this look automatically. The in-game board is under
 * GameLayout instead, so it keeps the Festival theme until its own reskin step.
 */
export function SiteLayout() {
  useScrollReveal(useLocation().pathname);
  return (
    <div className="lp">
      <SiteHeader />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
