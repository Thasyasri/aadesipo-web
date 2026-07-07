import { Link } from "react-router";

/** Marketing top nav. In-page anchors for sections that don't have their own
 *  route yet (Rules/Rivals/Board/About); the primary CTAs go to `/play`. */
export function SiteNav() {
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
          <Link to="/play">Play</Link>
          <a href="#rules">Rules</a>
          <a href="#rivals">Rivals</a>
          <a href="#board">Board</a>
          <a href="#about">About</a>
        </div>
        <Link className="btn btn-gold btn-sm nav-cta" to="/play">
          Play now
        </Link>
      </div>
    </nav>
  );
}
