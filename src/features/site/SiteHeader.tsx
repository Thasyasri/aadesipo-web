import { Link, NavLink } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession } from "@/state/session";

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

/**
 * The one header for the whole site — same brand, links, theme toggle, and a
 * single "Play" call-to-action on every page (marketing and app). "Play"
 * appears exactly once (the gold CTA); the section anchors that used to
 * duplicate it are gone.
 */
export function SiteHeader() {
  const { status, profile } = useSession();
  const authed = status === "authenticated";
  const initial = (profile?.displayName || "P").charAt(0).toUpperCase();

  return (
    <nav className="site-nav">
      <div className="wrap row">
        <Link className="brand" to="/">
          <img className="brand-logo" src="/logo-mark.png" alt="" width="34" height="34" />
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
          <NavLink to="/settings" className={linkClass}>
            Settings
          </NavLink>
        </div>
        <div className="nav-right">
          <ThemeToggle />
          {authed ? (
            <Link className="nav-avatar" to="/profile" aria-label="Your profile" title="Profile">
              {initial}
            </Link>
          ) : (
            <Link className="btn btn-ghost btn-sm" to="/login">
              Sign in
            </Link>
          )}
          <Link className="btn btn-gold btn-sm" to="/play">
            Play
          </Link>
        </div>
      </div>
    </nav>
  );
}
