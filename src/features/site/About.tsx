import { type ReactNode } from "react";
import { Link } from "react-router";
import { useDocumentMeta } from "./useDocumentMeta";
import { CountUp } from "./motion";
import { BOARD, GAME_MODES } from "@aadesipo/engine";
import { featureIcons, PlayIcon, LotusIcon } from "./icons";

const cityCount = BOARD.filter((t) => t.type === "property").length;

const ShieldIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

interface Value {
  icon: ReactNode;
  title: string;
  body: ReactNode;
}
const VALUES: readonly Value[] = [
  {
    icon: featureIcons.skill,
    title: "Skill over luck",
    body: (
      <>
        Chance and Sarpanch outcomes come from your <b>exact dice sum</b> — no hidden deck. The
        whole table is readable up front, so the sharper player wins more often.
      </>
    ),
  },
  {
    icon: featureIcons.bolt,
    title: "Yours in seconds",
    body: (
      <>
        No sign-up, no download. One tap and you’re playing — it runs <b>offline</b> and installs
        like an app. Accounts are optional, never a toll gate.
      </>
    ),
  },
  {
    icon: featureIcons.pin,
    title: "Proudly local, lightly worn",
    body: (
      <>
        Telugu warmth in the details, not clichés — real cities, money in <b>Lakh and Crore</b>, and
        a board that simply feels like home.
      </>
    ),
  },
  {
    icon: ShieldIcon,
    title: "Honest by design",
    body: (
      <>
        The rulebook and this whole site read their numbers from the game’s own engine — so nothing
        you read here can ever <b>lie about what happens in play</b>.
      </>
    ),
  },
];

export function About() {
  useDocumentMeta(
    "About — AadesiPo",
    "What AadesiPo is and why we made it — a property game for the Telugu states, built skill-first, guest-first, and honest by design.",
  );

  return (
    <>
      <header className="hero about-hero">
        <div className="wrap">
          <span className="eyebrow">About</span>
          <h1>Your world belongs on the board.</h1>
          <p>
            AadesiPo is a property game built for the two Telugu states — real places, money in Lakh
            and Crore, and rules you can actually out-think. Here’s what it is, and why we made it
            this way.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <h2>The idea</h2>
          </div>
          <p className="sec-sub" style={{ maxWidth: "68ch", fontSize: "var(--s1)" }}>
            Most of us grew up trading Boardwalk and Park Place — a brilliant game, on someone
            else’s map. AadesiPo keeps everything you love about rolling, buying and bankrupting
            your friends, and sets it where you actually live: from{" "}
            <b style={{ color: "var(--ink)" }}>Charminar</b> to the{" "}
            <b style={{ color: "var(--ink)" }}>Vizag</b> coast, Warangal to Tirupati. You collect
            cities you know, pay rent in Lakh, and when you land on the{" "}
            <b style={{ color: "var(--ink)" }}>Sarpanch Gari Dabba</b>, the village head decides
            your fate.
          </p>
        </div>
      </section>

      {/* engine-sourced stats */}
      <div className="statband">
        <div className="wrap stats">
          <div className="stat-c">
            <div className="v">
              <CountUp end={cityCount} />
            </div>
            <div className="l">Telugu cities</div>
          </div>
          <div className="stat-c">
            <div className="v">
              <CountUp end={BOARD.length} />
            </div>
            <div className="l">Board tiles</div>
          </div>
          <div className="stat-c">
            <div className="v">
              <CountUp end={GAME_MODES.length} />
            </div>
            <div className="l">Game modes</div>
          </div>
          <div className="stat-c">
            <div className="v">2–5</div>
            <div className="l">Players</div>
          </div>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <h2>What we believe</h2>
            <span className="k">Four principles the game is built on</span>
          </div>
          <div className="feat">
            {VALUES.map((v) => (
              <div className="card pad" key={v.title}>
                <div className="ficon">{v.icon}</div>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="orn">{LotusIcon}</div>
      </div>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <h2>Built to be fair</h2>
          </div>
          <p className="sec-sub" style={{ maxWidth: "68ch" }}>
            Under the hood is a <b style={{ color: "var(--ink)" }}>pure rules engine</b> — the same
            logic whether you play offline, pass-and-play, or online. It’s thoroughly tested, and
            it’s the single source of truth: the mode configs, rent tables and event outcomes on the
            Rules page are the exact ones the game runs.
          </p>
          <p className="rules-point" style={{ textAlign: "left", marginTop: "0.4rem" }}>
            <Link to="/rules">Read the full rulebook →</Link>
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head">
            <h2>Independent &amp; desi</h2>
          </div>
          <p className="sec-sub" style={{ maxWidth: "68ch" }}>
            AadesiPo is an independent, made-with-❤️ take on the classic property game — a tribute
            to countless family evenings around a board. It is{" "}
            <b style={{ color: "var(--ink)" }}>not affiliated with, endorsed by, or connected to</b>{" "}
            Hasbro or the MONOPOLY brand; every place name and event here is our own.
          </p>
        </div>
      </section>

      <div className="wrap">
        <div className="finalcta">
          <div className="inner">
            <div>
              <span className="kicker">Let’s play, anna.</span>
              <h2>Come see your world on the board.</h2>
            </div>
            <div className="r">
              <Link className="btn btn-gold" to="/play">
                {PlayIcon}
                Play as guest
              </Link>
              <span className="assure" style={{ marginTop: 0 }}>
                <span className="dot" />
                Free · no login needed
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
