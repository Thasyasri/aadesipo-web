import { Link } from "react-router";
import { PlayIcon } from "./icons";

/** Premium 404 — rendered inside the SiteLayout shell. */
export function NotFound() {
  return (
    <section>
      <div className="wrap" style={{ textAlign: "center", maxWidth: "40ch" }}>
        <div className="eyebrow" style={{ justifyContent: "center" }}>
          Error 404
        </div>
        <h1
          className="serif"
          style={{ fontSize: "var(--s3)", margin: "0.6rem 0 0.5rem", lineHeight: 1.05 }}
        >
          This tile isn’t on the board.
        </h1>
        <p className="muted" style={{ fontSize: "var(--s1)", marginBottom: "1.6rem" }}>
          The page you’re after doesn’t exist — but your board is still waiting.
        </p>
        <div style={{ display: "flex", gap: "0.8rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-gold" to="/play">
            {PlayIcon}
            Play a game
          </Link>
          <Link className="btn btn-ghost" to="/">
            Back home
          </Link>
        </div>
      </div>
    </section>
  );
}
