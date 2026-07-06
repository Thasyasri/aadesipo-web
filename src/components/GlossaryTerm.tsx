import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { GLOSSARY } from "@/constants/glossary";
import { springs } from "@/theme/motion";

interface GlossaryTermProps {
  entryKey: keyof typeof GLOSSARY;
}

/**
 * True long-press is unreliable across touch/mouse/trackpad without a
 * gesture library we don't otherwise need — tap-to-toggle covers touch
 * and click alike, and desktop additionally gets it on hover. Simpler,
 * and satisfies the actual requirement: an unfamiliar word explains
 * itself on the interaction each platform already does naturally.
 */
export function GlossaryTerm({ entryKey }: GlossaryTermProps) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[entryKey];

  if (!entry) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="underline decoration-dotted decoration-text-secondary underline-offset-4"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-expanded={open}
        aria-describedby={`glossary-${entryKey}`}
      >
        {entry.term}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={`glossary-${entryKey}`}
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={springs.snappy}
            className="absolute bottom-full left-1/2 z-30 mb-2 w-48 -translate-x-1/2 rounded-md bg-bg-raised p-3 text-caption text-text-secondary shadow-[var(--shadow-e2)]"
          >
            {entry.definition}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
