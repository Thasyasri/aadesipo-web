import { useEffect, useLayoutEffect, useRef, useState } from "react";

/* Elements (by their existing marketing classes) that fade+rise into view.
   The hook applies the `.reveal` treatment automatically, so pages need no
   extra markup. Grid children get a small stagger. */
const REVEAL_SELECTOR = [
  ".hero-grid > *",
  ".rules-hero .wrap",
  ".about-hero .wrap",
  ".gallery-hero .wrap",
  ".toc",
  ".sec-head",
  ".sec-sub",
  ".feat > *",
  ".rivals > *",
  ".modes > *",
  ".steps > *",
  ".boardstrip > *",
  ".gmasonry > *",
  ".stat-c",
  ".rule-sec",
  ".finalcta",
  ".orn",
  ".board-cap",
  ".rules-point",
].join(",");

const STAGGER_PARENTS = ["feat", "rivals", "modes", "steps", "boardstrip", "gmasonry", "stats"];

/**
 * Scroll-reveal for the marketing pages. Call once (in the layout) with the
 * current path so it re-scans on navigation. Respects prefers-reduced-motion.
 */
export function useScrollReveal(dep: string) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root || root.classList.contains("lp-bar")) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    if (!els.length) return;

    els.forEach((e) => e.classList.add("reveal"));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }

    root.classList.add("reveal-ready");
    els.forEach((e) => {
      const p = e.parentElement;
      if (p && STAGGER_PARENTS.some((c) => p.classList.contains(c))) {
        const i = Array.from(p.children).indexOf(e);
        e.style.transitionDelay = `${Math.min(i, 6) * 55}ms`;
      }
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      // threshold 0 = fire the instant any pixel enters, so tall elements and
      // fast scrolls reveal reliably (no "sometimes it animates" gaps).
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));

    // Safety net: if the observer somehow hasn't fired for on-screen elements
    // shortly after mount (edge cases / very short pages), reveal them anyway.
    const safety = window.setTimeout(() => {
      els.forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) e.classList.add("in");
      });
    }, 900);

    return () => {
      io.disconnect();
      window.clearTimeout(safety);
      root.classList.remove("reveal-ready");
      els.forEach((e) => {
        e.classList.remove("reveal", "in");
        e.style.transitionDelay = "";
      });
    };
  }, [dep]);
}

/** Animate a number from 0 → end when it scrolls into view (eased). */
export function CountUp({ end, className }: { end: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(end);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const dur = 950;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          setN(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end]);

  return (
    <span ref={ref} className={className}>
      {n}
    </span>
  );
}
