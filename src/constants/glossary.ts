export interface GlossaryEntry {
  term: string;
  definition: string;
}

/**
 * A handful of seed entries so the component has something to render.
 * The real dataset gets authored alongside the event content pack (M4)
 * and should live here, keyed by the exact transliteration used in UI
 * copy — nothing about this component cares how many entries exist.
 */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  "pelli-sandadhi": {
    term: "Pelli Sandadhi",
    definition: "Wedding celebrations and family chaos.",
  },
  bava: {
    term: "Bava",
    definition: "Brother-in-law, or a close friend addressed affectionately.",
  },
  jugaad: {
    term: "Jugaad",
    definition: "A clever, resourceful workaround using whatever's on hand.",
  },
  timepass: {
    term: "Timepass",
    definition: "Doing something casually, just to pass the time.",
  },
};
