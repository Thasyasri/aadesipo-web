import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";
import { BOARD, GAME_MODES, PERSONALITIES, type PersonalityId } from "@aadesipo/engine";
import { formatRupees } from "@/utils/currency";
import { tileCode } from "@/utils/tileCode";
import { placeIcons, featureIcons, PlayIcon, ArrowUpIcon, LotusIcon } from "./icons";

/* ---- live-from-engine derivations (so the page can never drift) ---------- */

const priceByName = new Map<string, number>();
let propertyCount = 0;
for (const tile of BOARD) {
  if (tile.type === "property") {
    priceByName.set(tile.name, tile.price);
    propertyCount++;
  }
}

/** Curated showcase (which tiles + their icon/tone); price is read live. Any
 *  tile no longer on the board is skipped, so a rename can't show a wrong ₹. */
interface Showcase {
  name: string;
  tone: string;
  icon: keyof typeof placeIcons;
}
const BOARD_SHOWCASE: readonly Showcase[] = [
  { name: "Nizamabad", tone: "--p-sand", icon: "building" },
  { name: "Warangal", tone: "--p-sky", icon: "arch" },
  { name: "Kakinada", tone: "--p-mint", icon: "boat" },
  { name: "Visakhapatnam", tone: "--p-gold", icon: "beach" },
  { name: "Tirupati", tone: "--p-coral", icon: "temple" },
  { name: "Jubilee Hills", tone: "--p-olive", icon: "skyline" },
  { name: "Charminar", tone: "--p-lav", icon: "charminar" },
  { name: "Taj Mahal", tone: "--p-slate", icon: "dome" },
];

const HERO_FAN: readonly (Showcase & { slot: string; ring?: boolean })[] = [
  { name: "Visakhapatnam", tone: "--p-sky", icon: "beach", slot: "s1" },
  { name: "Jubilee Hills", tone: "--p-lav", icon: "skyline", slot: "s3" },
  { name: "Charminar", tone: "--p-coral", icon: "charminar", slot: "s2", ring: true },
];

const MODE_COPY: Record<string, { label: string; pill: string; desc: string }> = {
  classic: { label: "Classic", pill: "Balanced", desc: "The full-length game." },
  quick: { label: "Quick", pill: "Fast", desc: "Short game, bigger bankroll." },
  marathon: { label: "Marathon", pill: "Long haul", desc: "Gentle pace, plays to elimination." },
};

// Typed by PersonalityId so adding/removing a personality is a compile error
// here until its card copy is written — the section can't silently fall stale.
const RIVAL_COPY: Record<
  PersonalityId,
  { emoji: string; tag: string; title: string; quote: ReactNode }
> = {
  gambler: {
    emoji: "🎲",
    tag: "The Gambler",
    title: "All in, always",
    quote: "“Fortune favours the reckless, anna.”",
  },
  troll: {
    emoji: "😈",
    tag: "The Troll",
    title: "Chaos merchant",
    quote: (
      <>
        “I didn’t want it. I wanted <em>you</em> to lose it.”
      </>
    ),
  },
  miser: {
    emoji: "💰",
    tag: "The Miser",
    title: "Never overpays",
    quote: "“Patience is the cheapest asset.”",
  },
};
const RIVAL_ORDER: readonly PersonalityId[] = ["gambler", "troll", "miser"];

const FEATURES: readonly { icon: keyof typeof featureIcons; title: string; body: ReactNode }[] = [
  {
    icon: "bolt",
    title: "Guest-first",
    body: (
      <>
        One tap and you’re playing. <b>No account, ever</b> — sign in later only if you want to save
        stats.
      </>
    ),
  },
  {
    icon: "skill",
    title: "Skill, not luck",
    body: (
      <>
        Chance &amp; Sarpanch events follow your <b>exact dice sum</b> — no hidden deck. The whole
        outcome table is readable up front.
      </>
    ),
  },
  {
    icon: "pin",
    title: "Proudly local",
    body: (
      <>
        A board that spans <b>both Telugu states</b>, money in Lakh &amp; Crore, and the Sarpanch
        Gari Dabba where the village head decides your fate.
      </>
    ),
  },
  {
    icon: "people",
    title: "Play your way",
    body: (
      <>
        Smart AI, <b>pass-and-play</b> on one phone, or an online room with friends. Flip house
        rules to taste.
      </>
    ),
  },
];

const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Pick a mode",
    body: "Classic, Quick or Marathon — then flip house rules like Free Parking jackpot or Build evenly.",
  },
  {
    title: "Add players",
    body: "Fill seats with AI rivals, friends beside you, or an online room — 2 to 5 players.",
  },
  {
    title: "Roll the dice",
    body: "Buy, build, trade, auction, mortgage — outlast everyone or top the net-worth board.",
  },
];

/* ---- small presentational pieces ----------------------------------------- */

function PTile({ name, tone, icon }: Showcase): ReactElement | null {
  const price = priceByName.get(name);
  if (price === undefined) return null; // tile renamed/removed from the board
  return (
    <div className="ptile">
      <div className="band" style={{ background: `var(${tone})` }} />
      <div className="ic" style={{ color: `var(${tone})` }}>
        {placeIcons[icon]}
      </div>
      <div className="nm">
        {name} <span className="code">({tileCode(name)})</span>
      </div>
      <div className="pr">{formatRupees(price)}</div>
    </div>
  );
}

function Ornament() {
  return (
    <div className="wrap">
      <div className="orn">{LotusIcon}</div>
    </div>
  );
}

/* ---- the page ------------------------------------------------------------ */

export function Landing() {
  return (
    <>
      {/* HERO */}
      <header className="hero" id="top">
        <div className="wrap hero-grid">
          <div>
            <div className="greet">Namaskaram! 👋</div>
            <span className="eyebrow">Pass-and-play · Vs AI · Online</span>
            <h1>
              Own the <em>Telugu states</em>. <span className="knock">Bankrupt your friends.</span>
            </h1>
            <p className="sub">
              Buy <b>Charminar</b>, build on <b>Jubilee Hills</b>, hit the beach at <b>Vizag</b>,
              and duck the Sarpanch Gari Dabba. No sign-up, no download — just roll.
            </p>
            <div className="cta-row">
              <Link className="btn btn-gold" to="/play">
                {PlayIcon}
                Play free
              </Link>
              <a className="btn btn-ghost" href="#rules">
                How to play
              </a>
            </div>
            <div className="assure">
              Free
              <span className="dot" />
              Instant
              <span className="dot" />
              No login needed
            </div>
          </div>

          <div className="fan" aria-hidden="true">
            {HERO_FAN.map((t) => (
              <div key={t.name} className={`slot ${t.slot}`}>
                <div className="float">
                  <PTile name={t.name} tone={t.tone} icon={t.icon} />
                </div>
              </div>
            ))}
            <div className="die">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <i key={n} />
              ))}
            </div>
            <div className="salary">
              {ArrowUpIcon}
              +₹2,00,000
            </div>
          </div>
        </div>
      </header>

      {/* STATS BAND */}
      <div className="statband">
        <div className="wrap stats">
          <div className="stat-c">
            <div className="v">{propertyCount}</div>
            <div className="l">Telugu cities</div>
          </div>
          <div className="stat-c">
            <div className="v">{BOARD.length}</div>
            <div className="l">Board tiles</div>
          </div>
          <div className="stat-c">
            <div className="v">{GAME_MODES.length}</div>
            <div className="l">Game modes</div>
          </div>
          <div className="stat-c">
            <div className="v">2–5</div>
            <div className="l">Players</div>
          </div>
        </div>
      </div>

      {/* WHY DIFFERENT */}
      <section id="about">
        <div className="wrap">
          <div className="sec-head">
            <h2>Not another Monopoly clone</h2>
            <span className="k">What makes AadesiPo, AadesiPo</span>
          </div>
          <p className="sec-sub">
            Same dice-and-deeds thrill you grew up with — rebuilt around a board you actually
            recognise, and rules you can out-think.
          </p>
          <div className="feat">
            {FEATURES.map((f) => (
              <div className="card pad" key={f.title}>
                <div className="ficon">{featureIcons[f.icon]}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Ornament />

      {/* MEET YOUR RIVALS */}
      <section id="rivals">
        <div className="wrap">
          <div className="sec-head">
            <h2>Meet your rivals</h2>
            <span className="k">Three personalities · easy → hard</span>
          </div>
          <p className="sec-sub">
            No friends around? The bots have opinions. Each AI plays with a personality — and none
            of them are here to be nice.
          </p>
          <div className="rivals">
            {RIVAL_ORDER.filter((id) => id in PERSONALITIES).map((id) => {
              const r = RIVAL_COPY[id];
              return (
                <div className="card pad rival" key={id}>
                  <div className="av">{r.emoji}</div>
                  <div className="tag">{r.tag}</div>
                  <h3>{r.title}</h3>
                  <p className="quote">{r.quote}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* MODES */}
      <section id="play">
        <div className="wrap">
          <div className="sec-head">
            <h2>Pick your pace</h2>
            <span className="k">Three modes · same board</span>
          </div>
          <p className="sec-sub">
            A lunch-break blitz or a Sunday-long saga — same {BOARD.length} tiles, different tempo.
          </p>
          <div className="modes">
            {GAME_MODES.map((m) => {
              const copy = MODE_COPY[m.id];
              return (
                <div className="card pad mode" key={m.id}>
                  <div className="top">
                    <h3>{copy?.label ?? m.id}</h3>
                    <span className="pill">{copy?.pill}</span>
                  </div>
                  <div className="stat">
                    <span className="lab">Starting cash</span>
                    <span className="val">{formatRupees(m.startingCash)}</span>
                  </div>
                  <div className="stat">
                    <span className="lab">Round cap</span>
                    <span className="val">{m.maxRounds} rounds</span>
                  </div>
                  <div className="stat">
                    <span className="lab">Salary rise</span>
                    <span className="val">
                      +{formatRupees(m.salaryEscalation.increaseBy)} /{" "}
                      {m.salaryEscalation.everyRounds}
                    </span>
                  </div>
                  <p className="desc">{copy?.desc}</p>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: "1.9rem" }}>
            <Link className="btn btn-gold" to="/play">
              {PlayIcon}
              Start a game
            </Link>
          </div>
        </div>
      </section>

      <Ornament />

      {/* THE BOARD */}
      <section id="board">
        <div className="wrap">
          <div className="sec-head">
            <h2>Collect the whole board</h2>
            <span className="k">8 colour sets · Nizamabad to the Taj</span>
          </div>
          <p className="sec-sub">
            Every tile a place you know — the real {BOARD.length}-tile board, priced in Lakh.
          </p>
          <div className="boardstrip">
            {BOARD_SHOWCASE.map((t) => (
              <PTile key={t.name} name={t.name} tone={t.tone} icon={t.icon} />
            ))}
          </div>
          <p className="board-cap">
            <b>{BOARD.length} tiles</b> · {propertyCount} cities · 4 transit stations · 2 utilities
            · 3 Chance · 3 Sarpanch Gari Dabba
          </p>
        </div>
      </section>

      <Ornament />

      {/* HOW IT WORKS */}
      <section id="rules">
        <div className="wrap">
          <div className="sec-head">
            <h2>Playing takes three taps</h2>
            <span className="k">From zero to rolling</span>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="card pad step" key={s.title}>
                <div className="n">{i + 1}</div>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="rules-point">
            New to the game? <a href="#rules">Read the full rulebook →</a>
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <div className="wrap">
        <div className="finalcta">
          <div className="inner">
            <div>
              <span className="kicker">One more game, anna?</span>
              <h2>Your board is waiting.</h2>
            </div>
            <div className="r">
              <Link className="btn btn-gold" to="/play">
                {PlayIcon}
                Play as guest
              </Link>
              <span className="assure" style={{ marginTop: 0 }}>
                <span className="dot" />
                No login needed — start in seconds
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
