import { useEffect, useState } from "react";
import { useDocumentMeta } from "./useDocumentMeta";

interface Shot {
  file: string;
  caption: string;
  device: "Desktop" | "Mobile";
  theme: "Dark" | "Light";
  w: number;
  h: number;
}

// Real, freshly-captured screenshots of the game (public/gallery/*.webp).
const SHOTS: readonly Shot[] = [
  {
    file: "dark-desktop-board",
    caption: "The board, mid-game",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-mobile-board",
    caption: "Plays great on a phone",
    device: "Mobile",
    theme: "Dark",
    w: 780,
    h: 1640,
  },
  {
    file: "dark-desktop-setup",
    caption: "Set up a game your way",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-desktop-events",
    caption: "Deterministic event tables",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "light-desktop-board",
    caption: "The board in light mode",
    device: "Desktop",
    theme: "Light",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-desktop-trade",
    caption: "Propose a trade",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-mobile-events",
    caption: "Event outcomes on mobile",
    device: "Mobile",
    theme: "Dark",
    w: 780,
    h: 1640,
  },
  {
    file: "dark-desktop-activity",
    caption: "A full activity feed",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "light-desktop-setup",
    caption: "Setup in light mode",
    device: "Desktop",
    theme: "Light",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-desktop-props",
    caption: "Manage your properties",
    device: "Desktop",
    theme: "Dark",
    w: 1600,
    h: 1075,
  },
  {
    file: "dark-mobile-setup",
    caption: "Quick setup on mobile",
    device: "Mobile",
    theme: "Dark",
    w: 780,
    h: 1640,
  },
  {
    file: "light-mobile-board",
    caption: "Light theme on mobile",
    device: "Mobile",
    theme: "Light",
    w: 780,
    h: 1640,
  },
];

export function Gallery() {
  useDocumentMeta(
    "Gallery — AadesiPo",
    "See AadesiPo in play — the board, setup, trades, auctions and event tables, on desktop and mobile, in light and dark.",
  );
  const [lightbox, setLightbox] = useState<Shot | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <>
      <header className="hero gallery-hero">
        <div className="wrap">
          <span className="eyebrow">Gallery</span>
          <h1>See it in play.</h1>
          <p>
            Real screenshots straight from the game — the board, setup, trades and the deterministic
            event tables, across desktop and mobile in both light and dark.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="gmasonry">
            {SHOTS.map((s) => (
              <button
                key={s.file}
                className="gcard"
                onClick={() => setLightbox(s)}
                aria-label={`Enlarge: ${s.caption}`}
              >
                <img
                  src={`/gallery/${s.file}.webp`}
                  alt={`${s.caption} — ${s.device}, ${s.theme} mode`}
                  width={s.w}
                  height={s.h}
                  loading="lazy"
                />
                <div className="gcap">
                  <div className="t">{s.caption}</div>
                  <div className="gbadges">
                    <span className="gbadge dev">{s.device}</span>
                    <span className="gbadge thm">{s.theme}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {lightbox && (
        <div className="lbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className="lbclose" onClick={() => setLightbox(null)} aria-label="Close">
            ✕
          </button>
          <img
            src={`/gallery/${lightbox.file}.webp`}
            alt={`${lightbox.caption} — ${lightbox.device}, ${lightbox.theme} mode`}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="lbcap">
            {lightbox.caption} · {lightbox.device} · {lightbox.theme}
          </div>
        </div>
      )}
    </>
  );
}
