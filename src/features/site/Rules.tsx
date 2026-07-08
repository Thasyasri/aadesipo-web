import { type ReactNode } from "react";
import { Link } from "react-router";
import { useDocumentMeta } from "./useDocumentMeta";
import {
  BOARD,
  GAME_MODES,
  GO_SALARY,
  JAIL_BAIL_COST,
  MAX_JAIL_TURNS,
  HOUSE_SUPPLY,
  HOTEL_SUPPLY,
  LOAN_MAX_FRACTION,
  LOAN_INTEREST_PER_ROUND,
  STARTING_CASH_PRESETS,
  CHANCE_TABLE,
  FUNNY_TABLE,
  type PropertyTile,
  type TransitTile,
  type UtilityTile,
  type EventEffect,
  type EventOutcome,
} from "@aadesipo/engine";
import { formatRupees } from "@/utils/currency";
import { PlayIcon } from "./icons";

/* ---- everything numeric comes from the engine, so the rulebook can't drift -- */

const props = BOARD.filter((t): t is PropertyTile => t.type === "property");
const transit = BOARD.filter((t): t is TransitTile => t.type === "transit");
const utils = BOARD.filter((t): t is UtilityTile => t.type === "utility");
const chanceCount = BOARD.filter((t) => t.type === "chance").length;
const sarpanchCount = BOARD.filter((t) => t.type === "funny-event").length;
const taxCount = BOARD.filter((t) => t.type === "tax").length;
const transitRents = transit[0]?.rentBySetSize ?? ([25, 50, 100, 200] as const);
const utilMult = utils[0]?.diceMultiplierBySetSize ?? ([4, 10] as const);

const MODE_LABEL: Record<string, string> = {
  classic: "Classic",
  quick: "Quick",
  marathon: "Marathon",
};
const pct = (f: number) => `${Math.round(f * 100)}%`;

const DICE_SUMS = Array.from({ length: 11 }, (_, i) => i + 2); // 2–12

function effectAmountLabel(effect: EventEffect): string | null {
  switch (effect.kind) {
    case "pay-bank":
      return `Pay ${formatRupees(effect.amount)}`;
    case "collect-from-bank":
      return `Collect ${formatRupees(effect.amount)}`;
    case "collect-from-each-player":
      return `Collect ${formatRupees(effect.amount)} from each player`;
    case "pay-each-player":
      return `Pay ${formatRupees(effect.amount)} to each player`;
    case "street-repairs":
      return `Pay ${formatRupees(effect.perHouse)}/house · ${formatRupees(effect.perHotel)}/hotel`;
    case "collect-per-property":
      return `Collect ${formatRupees(effect.amount)} per property from each player`;
    case "advance-to-nearest-transit":
    case "advance-to-tile":
    case "move-back-n-spaces":
    case "go-to-jail":
    case "grant-jail-free-card":
      return null;
  }
}

function EventTable({
  title,
  table,
}: {
  title: string;
  table: Readonly<Record<number, EventOutcome>>;
}) {
  return (
    <div className="etable">
      <h3>{title}</h3>
      {DICE_SUMS.map((sum) => {
        const outcome = table[sum];
        const amount = outcome ? effectAmountLabel(outcome.effect) : null;
        return (
          <div className="erow" key={sum}>
            <span className="esum">Roll {sum}</span>
            <span className="etext">
              {outcome?.text}
              {amount && <span className="eamt"> ({amount})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---- the 18 segments (prose hand-written, numbers from the engine) --------- */

interface Segment {
  id: string;
  title: string;
  body: ReactNode;
}

const SEGMENTS: readonly Segment[] = [
  {
    id: "objective",
    title: "How you win",
    body: (
      <>
        <p>Two ways to take the game:</p>
        <ul>
          <li>
            Be the <b>last player standing</b> — everyone else goes bankrupt, or
          </li>
          <li>
            Hold the <b>highest net worth</b> when the round cap is reached (the cap varies by
            mode).
          </li>
        </ul>
        <p>Net worth = cash + property value (+ buildings) − any loans owed.</p>
      </>
    ),
  },
  {
    id: "setup",
    title: "Setup",
    body: (
      <>
        <p>
          <b>2–5 players</b> — versus AI, pass-and-play on one device, or online with friends.
        </p>
        <p>
          <b>Starting cash</b> is set by your mode, or by a house-rule preset:{" "}
          {STARTING_CASH_PRESETS.map((c) => formatRupees(c)).join(" · ")}.
        </p>
        <p>
          The board is <b>{BOARD.length} tiles</b>: {props.length} properties across 8 colour
          groups, {transit.length} transit stations, {utils.length} utilities, {chanceCount} Chance,{" "}
          {sarpanchCount} Sarpanch Gari Dabba (event) tiles, {taxCount} taxes, plus GO, Jail / Just
          Visiting, Go To Jail and Free Parking.
        </p>
      </>
    ),
  },
  {
    id: "turn",
    title: "Taking a turn",
    body: (
      <>
        <p>
          Roll <b>two dice</b>, move that many tiles clockwise, and resolve the tile you land on.
        </p>
        <ul>
          <li>
            <b>Doubles → roll again.</b> But <b>three doubles in a row → straight to Jail</b> (no
            third move).
          </li>
          <li>
            Tiles show a short <b>code</b> (e.g. VZG). Tap any tile for its full name, price and
            rent.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "salary",
    title: "Passing GO — salary",
    body: (
      <>
        <p>
          Each time you pass or land on GO, collect your salary — base{" "}
          <b>{formatRupees(GO_SALARY)}</b>.
        </p>
        <p>
          To keep long games moving, salary <b>rises over time</b> at a pace set by the mode (see{" "}
          <a href="#modes">Game modes</a>).
        </p>
        <p className="hnote">
          House rule “Double salary on GO”: landing <b>exactly</b> on GO pays double.
        </p>
      </>
    ),
  },
  {
    id: "buying",
    title: "Buying property",
    body: (
      <p>
        Land on an unowned property, station or utility and you may <b>buy it at its price</b> — or{" "}
        <b>decline</b>. Declining sends it to <a href="#auctions">auction</a> (unless the “No
        auctions” house rule is on, where it simply stays unowned).
      </p>
    ),
  },
  {
    id: "auctions",
    title: "Auctions",
    body: (
      <>
        <p>
          <b>Declined-property auction:</b> bidding opens to all players; the highest bid wins and
          pays the <b>bank</b>. No bids → the tile stays unowned.
        </p>
        <p>
          <b>Sell to auction (your own property):</b> on your turn — or while raising funds — you
          can auction a property you own. Proceeds go to <b>you</b>, the{" "}
          <b>reserve is its mortgage value</b>, and if nobody bids you keep it. Only building-free,
          unmortgaged property can be listed, and the seller can’t bid.
        </p>
      </>
    ),
  },
  {
    id: "rent",
    title: "Rent",
    body: (
      <>
        <p>
          Land on someone’s property and you pay them rent <b>automatically</b>. A <b>mortgaged</b>{" "}
          property charges no rent, and rent <b>does not stack</b> — it’s the single amount for the
          current level.
        </p>
        <ul>
          <li>
            <b>Property:</b> base rent, or the house/hotel tier built on it. Owning the{" "}
            <b>entire colour set</b> (a monopoly) <b>doubles the base rent</b> on its unimproved
            tiles.
          </li>
          <li>
            <b>Transit stations:</b> rent by how many of the {transit.length} you own —{" "}
            {transitRents.map((r) => formatRupees(r)).join(" / ")}.
          </li>
          <li>
            <b>Utilities:</b> rent = dice roll × multiplier (×{utilMult[0]} with one utility, ×
            {utilMult[1]} with both).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "buildings",
    title: "Houses & hotels",
    body: (
      <>
        <ul>
          <li>
            Build only once you own a <b>full colour set</b> (unmortgaged). Each house raises rent
            to the next tier; the <b>5th building is a hotel</b>.
          </li>
          <li>
            Build cost is per colour group. <b>Sell buildings</b> back to the bank to raise cash.
          </li>
        </ul>
        <p className="hnote">
          House rules: “Build evenly” forces houses up and down evenly across a group; “Limited
          buildings” stocks the bank with{" "}
          <b>
            {HOUSE_SUPPLY} houses / {HOTEL_SUPPLY} hotels
          </b>{" "}
          — they can run out.
        </p>
      </>
    ),
  },
  {
    id: "mortgaging",
    title: "Mortgaging",
    body: (
      <ul>
        <li>
          Mortgage a property for its <b>mortgage value</b> (≈ half its price) to raise cash. A
          mortgaged property collects no rent and greys out on the board.
        </li>
        <li>
          <b>Unmortgage</b> by paying the mortgage value back <b>+ 10% interest</b>.
        </li>
        <li>You must sell all of a property’s buildings before mortgaging it.</li>
      </ul>
    ),
  },
  {
    id: "trading",
    title: "Trading",
    body: (
      <p>
        Propose a trade to any player:{" "}
        <b>cash + building-free properties + get-out-of-jail cards</b>, either direction. The
        recipient <b>accepts or rejects</b> — there are no counter-offers in this version. A live
        value breakdown shows who gains, and AI players evaluate and respond.
      </p>
    ),
  },
  {
    id: "jail",
    title: "Jail",
    body: (
      <>
        <p>
          You go to Jail by landing on <b>Go To Jail</b>, rolling <b>three doubles</b>, or drawing a
          card that sends you.
        </p>
        <p>
          <b>Getting out:</b> pay <b>{formatRupees(JAIL_BAIL_COST)} bail</b>, roll doubles, use a
          get-out-of-jail-free card, or serve your time — up to <b>{MAX_JAIL_TURNS} turns</b>, then
          you pay and move. Landing on the Jail tile normally is <b>“Just visiting”</b> and costs
          nothing.
        </p>
      </>
    ),
  },
  {
    id: "taxes",
    title: "Taxes",
    body: (
      <p>
        <b>Income Tax</b> and <b>Luxury Tax</b> tiles: pay the stated amount to the <b>bank</b>.
        With the Free Parking jackpot house rule on, those taxes pile up under Free Parking instead
        of vanishing (see below).
      </p>
    ),
  },
  {
    id: "free-parking",
    title: "Free Parking",
    body: (
      <p>
        Normally a safe rest tile — nothing happens. <b>With the jackpot house rule</b>, taxes
        accumulate there and you <b>sweep the whole pot</b> when you land on it.
      </p>
    ),
  },
  {
    id: "events",
    title: "Chance & Sarpanch Gari Dabba",
    body: (
      <>
        <p>
          Landing on a <b>Chance</b> or <b>Sarpanch Gari Dabba</b> tile triggers an outcome decided
          by your <b>exact dice sum</b> — deterministic, no random draw — so the full table is
          readable up front. Effects range from paying or collecting cash, to collecting from every
          player, to advancing to a tile, going to jail, or earning a jail-free card.
        </p>
        <EventTable title="Chance" table={CHANCE_TABLE} />
        <EventTable title="Sarpanch Gari Dabba" table={FUNNY_TABLE} />
      </>
    ),
  },
  {
    id: "loans",
    title: "Bank loans (catch-up)",
    body: (
      <p>
        A trailing player can <b>borrow against net worth</b> to catch up — up to{" "}
        <b>{pct(LOAN_MAX_FRACTION)} of net worth</b>. The loan is repaid with{" "}
        <b>{pct(LOAN_INTEREST_PER_ROUND)} interest per round</b>, and the balance counts against
        your net worth until it’s cleared.
      </p>
    ),
  },
  {
    id: "bankruptcy",
    title: "Bankruptcy",
    body: (
      <p>
        Owe more than your cash and you must <b>raise funds</b> — mortgage, sell buildings, or sell
        to auction — or <b>declare bankruptcy</b>. On bankruptcy the creditor (or the bank, for
        tax/bail) inherits your assets. Last player standing wins.
      </p>
    ),
  },
  {
    id: "modes",
    title: "Game modes",
    body: (
      <>
        <p>Same {BOARD.length}-tile board, three tempos:</p>
        <div className="rtable-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Starting cash</th>
                <th>Round cap</th>
                <th>Salary rise</th>
              </tr>
            </thead>
            <tbody>
              {GAME_MODES.map((m) => (
                <tr key={m.id}>
                  <td>{MODE_LABEL[m.id] ?? m.id}</td>
                  <td>{formatRupees(m.startingCash)}</td>
                  <td>{m.maxRounds} rounds</td>
                  <td>
                    +{formatRupees(m.salaryEscalation.increaseBy)} /{" "}
                    {m.salaryEscalation.everyRounds} rounds
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "house-rules",
    title: "House rules",
    body: (
      <>
        <p>Optional toggles chosen at setup — defaults reproduce classic play exactly.</p>
        <div className="hrule">
          <span className="hname">Free Parking jackpot</span>
          <span className="hdesc">
            Taxes pile up under Free Parking; land there to sweep the pot.
          </span>
        </div>
        <div className="hrule">
          <span className="hname">No auctions</span>
          <span className="hdesc">
            A declined property stays unowned instead of going to auction.
          </span>
        </div>
        <div className="hrule">
          <span className="hname">Double salary on GO</span>
          <span className="hdesc">Landing exactly on GO pays double.</span>
        </div>
        <div className="hrule">
          <span className="hname">Limited houses &amp; hotels</span>
          <span className="hdesc">
            The bank stocks {HOUSE_SUPPLY} houses / {HOTEL_SUPPLY} hotels — they can run out.
          </span>
        </div>
        <div className="hrule">
          <span className="hname">Build evenly</span>
          <span className="hdesc">Houses go up and down evenly across a colour group.</span>
        </div>
      </>
    ),
  },
];

export function Rules() {
  useDocumentMeta(
    "How to play — AadesiPo",
    "The full AadesiPo rulebook — objective, buying, rent, auctions, jail, the Chance & Sarpanch event tables, and game modes, all read straight from the game engine.",
  );

  const toc = (
    <ol>
      {SEGMENTS.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`}>
            <span className="tnum">{i + 1}</span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <header className="hero rules-hero">
        <div className="wrap">
          <span className="eyebrow">How to play</span>
          <h1>Everything, from your first roll to bankruptcy.</h1>
          <p>
            The full rulebook for AadesiPo. Every number here — prices, rents, mode configs and the
            event tables — is read straight from the game engine, so it always matches what you
            play.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap rules-layout">
          {/* Desktop sidebar / mobile collapsible */}
          <nav className="toc" aria-label="Rulebook sections">
            <div className="toc-title">Contents</div>
            <details className="toc-mobile">
              <summary>Jump to a section</summary>
              {toc}
            </details>
            <div className="toc-desktop">{toc}</div>
          </nav>

          <div>
            {SEGMENTS.map((s, i) => (
              <section className="rule-sec" id={s.id} key={s.id}>
                <h2>
                  <span className="rn">{i + 1}</span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}

            <div className="rule-cta">
              <Link className="btn btn-gold" to="/play">
                {PlayIcon}
                Start a game
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
