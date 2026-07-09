import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="frow">
          <Link className="brand" to="/">
            <img className="brand-logo" src="/logo-mark.png" alt="" width="34" height="34" />
            <span className="wm">
              Aadesi<span className="po">Po</span>
            </span>
          </Link>
          <div className="flinks">
            <Link to="/">Home</Link>
            <Link to="/play">Play</Link>
            <Link to="/rules">Rules</Link>
            <Link to="/about">About</Link>
            <Link to="/gallery">Gallery</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/leaderboards">Leaderboards</Link>
            <Link to="/profile">Profile</Link>
            <Link to="/settings">Settings</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
        <p className="fine">
          Made with ❤️ in the Telugu states · A modern desi property game · Not affiliated with,
          endorsed by, or connected to Hasbro or the MONOPOLY brand.
        </p>
      </div>
    </footer>
  );
}
