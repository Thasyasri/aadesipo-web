import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="frow">
          <Link className="brand" to="/">
            <span className="rupee">₹</span>
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
            <Link to="/profile">Profile</Link>
            <Link to="/settings">Settings</Link>
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
