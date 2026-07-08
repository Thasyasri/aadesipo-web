import { Link, NavLink } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

/**
 * The one header for the whole site — same brand, links, theme toggle, and a
 * single "Play" call-to-action on every page (marketing and app). "Play"
 * appears exactly once (the gold CTA); the section anchors that used to
 * duplicate it are gone.
 */
export function SiteHeader() {
  return (
    <nav className="site-nav">
      <div className="wrap row">
        <Link className="brand" to="/">
          <span className="rupee">₹</span>
          <span className="wm">
            Aadesi<span className="po">Po</span>
          </span>
        </Link>
        <div className="navlinks">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/rules" className={linkClass}>
            Rules
          </NavLink>
          <NavLink to="/about" className={linkClass}>
            About
          </NavLink>
          <NavLink to="/gallery" className={linkClass}>
            Gallery
          </NavLink>
          <NavLink to="/profile" className={linkClass}>
            Profile
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            Settings
          </NavLink>
        </div>
        <div className="nav-right">
          <ThemeToggle />
          <Link className="btn btn-gold btn-sm" to="/play">
            Play
          </Link>
        </div>
      </div>
    </nav>
  );
}
