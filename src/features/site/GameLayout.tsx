import { Outlet } from "react-router";
import { SiteHeader } from "./SiteHeader";
import "./site.css";

/**
 * Chrome for the gameplay routes (game, online, lobby, join, gallery). They get
 * the same premium header for consistent navigation, but the content is left
 * OUTSIDE the `.lp` remap so the in-game board/sheets keep the Festival theme
 * untouched — that reskin is a deliberate later step. No footer here: play stays
 * immersive. The `.lp-bar` variant makes the header a plain top bar (not sticky).
 */
export function GameLayout() {
  return (
    <>
      <div className="lp lp-bar">
        <SiteHeader />
      </div>
      <Outlet />
    </>
  );
}
