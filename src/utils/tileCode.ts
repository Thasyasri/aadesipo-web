/**
 * Short 2–4 letter codes for every board tile, keyed by the tile's real name.
 * The board shows ONLY the code; everywhere a name appears in text (activity
 * log, trades, properties, victory) we show `Name (CODE)` so a player can map
 * what they see on the board to its full name. Single source of truth — the
 * board renderer and all text surfaces import from here.
 */
export const TILE_CODES: Readonly<Record<string, string>> = {
  // Properties (22)
  Nizamabad: "NZB",
  Karimnagar: "KRM",
  Khammam: "KMM",
  Nalgonda: "NLG",
  Warangal: "WL",
  Kadapa: "KDP",
  Rajahmundry: "RJM",
  Kakinada: "KKN",
  Nellore: "NLR",
  Guntur: "GNT",
  Visakhapatnam: "VZG",
  Vijayawada: "VJW",
  Tirupati: "TRP",
  Amaravati: "AMR",
  Gachibowli: "GCB",
  "Banjara Hills": "BJH",
  "Jubilee Hills": "JBH",
  Charminar: "CHM",
  "Golconda Fort": "GCF",
  "Hussain Sagar": "HSG",
  "Gateway of India": "GOI",
  "Taj Mahal": "TJM",
  // Transit (4)
  "Secunderabad Junction": "SEC",
  "Kacheguda Station": "KCG",
  "Begumpet Station": "BGP",
  "Falaknuma Station": "FLK",
  // Utilities (2)
  "Telangana Power Grid": "TPG",
  "Godavari Water Board": "GWB",
  // Tax
  "Income Tax": "IT",
  "Luxury Tax": "LT",
  // Corners & event tiles
  GO: "GO",
  "Jail / Just Visiting": "JAIL",
  "Go To Jail": "GTJ",
  "Free Parking": "FP",
  Chance: "?",
  "Sarpanch Gari Dabba": "SGD",
};

/** The short board code for a tile name (falls back to the name itself). */
export function tileCode(name: string): string {
  return TILE_CODES[name] ?? name;
}

/**
 * `Name (CODE)` for text surfaces — e.g. "Kacheguda Station (KCG)". When no
 * code exists, or the code equals the name (short specials), just the name.
 */
export function tileNameWithCode(name: string): string {
  const code = TILE_CODES[name];
  return code && code !== name ? `${name} (${code})` : name;
}
