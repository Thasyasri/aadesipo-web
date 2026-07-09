import { type ReactNode } from "react";
import { Link } from "react-router";
import { useDocumentMeta } from "./useDocumentMeta";

/**
 * TODO(launch): replace with a real address you actually monitor before the
 * site is promoted publicly. A privacy policy without a working contact route
 * isn't much of a policy.
 */
const CONTACT_EMAIL = "your-contact@example.com";

const LAST_UPDATED = "9 July 2026";

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: readonly Section[];
}) {
  return (
    <>
      <header className="hero rules-hero">
        <div className="wrap">
          <span className="eyebrow">Legal</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
      </header>

      <section>
        <div className="wrap">
          {sections.map((s) => (
            <section className="rule-sec" id={s.id} key={s.id}>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <p className="muted" style={{ marginTop: "2rem", fontSize: "0.85rem" }}>
            Last updated {LAST_UPDATED}.
          </p>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- privacy */

const PRIVACY_SECTIONS: readonly Section[] = [
  {
    id: "short",
    title: "The short version",
    body: (
      <>
        <p>
          You can play AadesiPo <b>without an account</b>, and if you do, your games and stats stay{" "}
          <b>on your own device</b>. We don’t sell your data, we don’t run ads, and we don’t track
          you across the web.
        </p>
        <p>
          Creating an account is optional. It exists so your stats follow you across devices and so
          you can appear on the leaderboards — nothing more.
        </p>
      </>
    ),
  },
  {
    id: "guest",
    title: "Playing as a guest",
    body: (
      <>
        <p>
          By default you play as a guest. So that online rooms can tell players apart, we create an{" "}
          <b>anonymous session</b> — a random identifier with{" "}
          <b>no name, no email, nothing personal</b> attached.
        </p>
        <p>
          Your saved games, move history and personal stats are stored{" "}
          <b>locally in your browser</b> (IndexedDB). As a guest, they are <b>never uploaded</b>.
          Clearing your browser storage erases them permanently.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "If you create an account",
    body: (
      <>
        <p>Accounts are handled by Supabase Auth. Depending on how you sign in, we receive:</p>
        <ul>
          <li>
            <b>Email + password:</b> your email address. Passwords are stored hashed by Supabase —
            we never see them.
          </li>
          <li>
            <b>Google:</b> your email address, name and avatar image, as provided by Google.
          </li>
        </ul>
        <p>
          We keep a simple profile: <b>display name</b>, <b>avatar URL</b>, and whether you’ve opted
          in to leaderboards. You can change your display name any time on your{" "}
          <Link to="/profile">Profile</Link>.
        </p>
      </>
    ),
  },
  {
    id: "gameplay",
    title: "What we store when you play",
    body: (
      <>
        <ul>
          <li>
            <b>On your device (always):</b> saved games, the move log, and your personal stats.
          </li>
          <li>
            <b>On our servers (only if you’re signed in):</b> a summary of each finished game — game
            mode, whether it was vs-AI or online, win or loss, your final net worth, your rank, how
            many rounds it ran, and which board cities you held.
          </li>
          <li>
            <b>Online games:</b> room membership and the full list of moves, which the server needs
            in order to validate every move and stop cheating.
          </li>
          <li>
            <b>Turn notifications (only if you enable them):</b> a browser push subscription so we
            can tell you it’s your turn.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "leaderboards",
    title: "Leaderboards",
    body: (
      <p>
        You are <b>never</b> listed publicly unless you switch it on yourself in your Profile — it
        is <b>off by default</b>. When on, the board shows your <b>display name</b> and your
        aggregate wins, games and win rate from <b>online games only</b>. Your email is never shown,
        and guests are never ranked.
      </p>
    ),
  },
  {
    id: "analytics",
    title: "Analytics and crash reports",
    body: (
      <>
        <p>
          If enabled for this deployment, we use <b>PostHog</b> for basic product analytics (which
          features get used — e.g. “a game was started”) and <b>Sentry</b> to receive crash reports
          so we can fix bugs. Neither is used for advertising, and neither receives your game
          content or your email.
        </p>
        <p>
          We also store small preferences in your browser, such as your <b>theme</b> and{" "}
          <b>language</b>, and a sign-in token if you have an account. We don’t use advertising
          cookies.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who else touches your data",
    body: (
      <>
        <p>We don’t sell or rent your data. We rely on a small number of providers:</p>
        <ul>
          <li>
            <b>Supabase</b> — accounts, database, and online-game validation.
          </li>
          <li>
            <b>Vercel</b> — hosting and delivery of the site.
          </li>
          <li>
            <b>Google</b> — only if you choose to sign in with Google.
          </li>
          <li>
            <b>PostHog</b> and <b>Sentry</b> — analytics and crash reporting, where enabled.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "control",
    title: "Your choices",
    body: (
      <ul>
        <li>
          <b>Don’t make an account.</b> Guest play is complete and permanent — no feature is locked
          behind signing in, except leaderboards.
        </li>
        <li>
          <b>Leave the leaderboards</b> at any time by switching the toggle off in your Profile.
        </li>
        <li>
          <b>Erase local data</b> by clearing your browser storage for this site.
        </li>
        <li>
          <b>Delete your account and server data</b> by emailing us at {CONTACT_EMAIL}.
        </li>
      </ul>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        AadesiPo is a family-friendly board game, but it isn’t directed at children under 13, and we
        don’t knowingly collect their personal information. If you believe a child has created an
        account, contact us and we’ll remove it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        If this policy changes materially we’ll update the date below and, where it matters, say so
        in the app. Questions, corrections or deletion requests: <b>{CONTACT_EMAIL}</b>.
      </p>
    ),
  },
];

export function Privacy() {
  useDocumentMeta(
    "Privacy — AadesiPo",
    "How AadesiPo handles your data: play as a guest with everything stored on your device, optional accounts, no ads, no data selling.",
  );
  return (
    <LegalPage
      title="Privacy"
      intro="Play as a guest and nothing leaves your device. Make an account and we store only what's needed to sync your stats and rank you. No ads, no selling data."
      sections={PRIVACY_SECTIONS}
    />
  );
}

/* ------------------------------------------------------------------ terms */

const TERMS_SECTIONS: readonly Section[] = [
  {
    id: "short",
    title: "The short version",
    body: (
      <p>
        AadesiPo is a free board game you can play in your browser. Be decent to the people you play
        with, don’t try to break the game, and understand that it’s offered as-is, with no promises
        that it will always be available.
      </p>
    ),
  },
  {
    id: "affiliation",
    title: "Not affiliated with MONOPOLY",
    body: (
      <p>
        AadesiPo is an independent, modern desi property game. It is{" "}
        <b>not affiliated with, endorsed by, sponsored by, or connected to Hasbro, Inc.</b> or the
        MONOPOLY brand. All third-party trademarks belong to their respective owners and are
        referenced, if at all, only descriptively.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p>
          An account is optional. If you make one, you’re responsible for keeping your credentials
          safe, and for what happens under your account.
        </p>
        <p>
          Choose a display name you’d be happy to see on a public leaderboard. We may change or
          remove names that are abusive, impersonating, or otherwise inappropriate.
        </p>
      </>
    ),
  },
  {
    id: "fair-play",
    title: "Fair play",
    body: (
      <>
        <p>Please don’t:</p>
        <ul>
          <li>
            Tamper with the game client, forge results, or try to manipulate the leaderboards.
          </li>
          <li>Harass, abuse or spam other players in online rooms.</li>
          <li>Attempt to disrupt, overload, or reverse-engineer the service.</li>
        </ul>
        <p>
          Leaderboards rank <b>online games only</b>, because those are validated move-by-move on
          the server. We may remove entries, or accounts, that we believe are manipulating results.
        </p>
      </>
    ),
  },
  {
    id: "as-is",
    title: "Provided as-is",
    body: (
      <p>
        The game is provided <b>“as is”</b>, without warranties of any kind. We do our best, but we
        can’t promise it will be uninterrupted, bug-free, or that your saved games will survive
        forever — particularly guest games, which live only in your browser. To the fullest extent
        permitted by law, we aren’t liable for any loss arising from your use of the game.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We may add, change, or remove features, and we may suspend or discontinue the service. Rules
        of the game itself may also be tuned over time — the <Link to="/rules">rulebook</Link>{" "}
        always reflects what the engine actually does.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Email <b>{CONTACT_EMAIL}</b>. See also our{" "}
        <Link to="/privacy">Privacy policy</Link>.
      </p>
    ),
  },
];

export function Terms() {
  useDocumentMeta(
    "Terms — AadesiPo",
    "The terms for using AadesiPo: a free, independent desi property game. Not affiliated with Hasbro or MONOPOLY.",
  );
  return (
    <LegalPage
      title="Terms"
      intro="A free board game, offered as-is. Play fair, be decent to your opponents, and enjoy it."
      sections={TERMS_SECTIONS}
    />
  );
}
