import { Outlet } from "react-router";
import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";
import "./site.css";

/**
 * Layout for the public marketing pages (Landing now; About/Rules/Gallery
 * later). The `.lp` root establishes a committed dark-navy "Contemporary
 * Indian Premium" world with its own local tokens — deliberately isolated
 * from the in-app Festival Premium theme so the game is never reskinned by
 * anything here. No ThemeToggle: the marketing site is single-theme by design.
 */
export function SiteLayout() {
  return (
    <div className="lp">
      <SiteNav />
      <Outlet />
      <SiteFooter />
    </div>
  );
}
