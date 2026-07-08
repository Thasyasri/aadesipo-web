# 03 — Design System · "Contemporary Indian Premium"

> **Status: implemented in code and live.** Tokens are in `src/index.css` (`@theme`,
> light+dark) and the scoped marketing layer `src/features/site/site.css`. Production
> faces **Fraunces + Manrope** are loaded and applied app-wide.

Locked visual direction (Decision **D3a**), specified by the user. Live style guide:
the `design-system-v1` Artifact. Mood: _a premium digital board game with modern
Indian warmth — clean, collectible, playful, and unmistakably local without clichés._
Blend reference: Monopoly GO (playful) · Apple (minimal) · Tanishq (premium gold) ·
CRED (dark luxury) · Swiggy/Zomato (warm Indian).

**Guiding rule:** less is more. Tiny Indian touches (thin gold dividers, soft floral
geometry, ambient glow), **never** heavy motifs, temple carvings, palace borders, or
giant rangolis. Gold is the brand colour — used with restraint, never everywhere.

---

## 1. Colour tokens

```css
/* core */
--bg: #121726; /* canvas — deep navy, not black */
--surface: #20273a; /* every card / panel / popup / sidebar */
--gold: #e6b54a; /* brand: primary buttons, coins, ₹, active, ownership */
--cream: #f5ebd7; /* property tiles, text on dark, modals, tooltips */
--coral: #ef6a5b; /* ENERGY (semantic): current player, warnings, auction, negative, hot */
--mint: #72c7a6; /* SUCCESS (semantic): completed, owned, positive money, GO reward, safe */
/* neutrals + states */
--gray: #8a92a5; /* muted text */
--border: #2d3650; /* dividers */
--gold-hover: #f3c766; /* button hover */
--gold-press: #c9962d; /* pressed */
--shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
--hairline: rgba(255, 255, 255, 0.06); /* soft card border, no hard lines */
```

Semantic colour (good/warn) is **separate from the gold accent** — coral = attention/negative, mint = success/positive.

### Property tones (softer than Monopoly — collectible, not toy)

```
--p-coral #EF6A5B  --p-gold #E6B54A  --p-mint #72C7A6  --p-sky #7AB6E8
--p-lav   #A991F7  --p-olive #A7BF5D --p-sand #D8B17D  --p-slate #7C8CA8
```

These replace the current saturated group colours on the board and in cards.

---

## 2. Typography

| Role               | Production face                         | Fallback  | Notes                                                 |
| ------------------ | --------------------------------------- | --------- | ----------------------------------------------------- |
| Display / headings | **Fraunces** (or DM Serif Display)      | Georgia   | Characterful serif, used with restraint               |
| Body / UI          | **Manrope** (or Satoshi / General Sans) | system-ui | Clean, humanist, long rules stay readable             |
| Numbers / money    | **Manrope SemiBold**                    | system-ui | `tabular-nums`; **money is always bold** (`₹15 Lakh`) |

- Fonts get **embedded as `@font-face` data-URIs** (the Artifact CSP and the app both block font CDNs — no external links).
- Type scale (`clamp`-based, fluid): captured as `--s0…--s3` in the Artifact; formalise into Tailwind `@theme` on build.
- Headings get `text-wrap: balance`; body target ~65ch; uppercase labels get `.2em` tracking.

---

## 3. Shape, elevation, spacing

- **Radius:** buttons **20px**; cards **18–22px**; tiles/chips 12–14px.
- **Cards:** `background:--surface; border:1px --hairline; box-shadow:--shadow`. **No hard borders** — separation comes from surface + soft shadow.
- **Spacing:** 4px base scale (Tailwind). Generous section rhythm; let flex/grid `gap` do the work.
- Divider = thin gold gradient hairline, not a solid rule.

---

## 4. Components (specs — see Artifact for the live versions)

- **Buttons** — Primary: gold bg, dark text, 20px radius, soft shadow, hover glow. Secondary: transparent, 1.5px gold outline, cream text. Danger: coral bg, dark text. Disabled: 45% opacity.
- **Money** — bold tabular; gain in mint (`+₹2 Lakh`), loss in coral (`−₹27K`).
- **Badges / tags** — Hotel (gold), Owned (mint), Mortgaged (slate), Auction (coral) — soft pill, tinted bg + matching text.
- **Player card** — avatar, name, cash, score. **Current player:** coral name + pulsing gold ring.
- **Tabs** — active = gold text + 2px gold underline.
- **House-rule chips** — surface-2 pill, gold dot = on / gray = off.
- **Property tile** — cream card, colour band (property tone) on top, single-colour flat icon, name, price; the collectible unit.
- **ROLL** — full-width gold-gradient button with a live dice face.
- **Dice** — cream die, dark pips; bounce+spin on roll.

---

## 5. Iconography

Flat, minimal, **single-colour**, one family. Local vocabulary: chai, coconut, mango,
auto-rickshaw, RTC bus, cinema ticket, cricket bat, filter-coffee, etc. Consistent
stroke weight and grid. (Placeholder set drawn in the Artifact; full set authored at build.)

---

## 6. Motion (subtle, not noisy — all respect `prefers-reduced-motion`)

- Gold button: soft glow on hover.
- Dice: quick bounce + spin on roll.
- Money gain: small upward float with mint highlight.
- Property purchase: brief gold outline sweep.
- Player turn: gentle pulse around the avatar.
- Board movement: smooth easing, never abrupt.

---

## 7. Theming & implementation

- **Committed dark world** (premium navy canvas). A light variant can be derived from
  the same tokens later if wanted — the game currently ships a light theme, so we keep
  the token structure theme-swappable even while defaulting to this dark identity.
- Land the tokens in **Tailwind v4 `@theme`** + CSS custom properties, replacing the
  current `src/theme` tokens. The existing components (`Button`, `BottomSheet`, board
  colours, group colours) get re-pointed at the new tokens so the whole game reskins
  from one place.
- The board's Pixi palette (`Board.tsx` hex constants, `groupColors`) maps to the new
  navy/cream/property tones.

### Next

`04-wireframes.md` — lay out Landing / Play / About / Rules / Gallery in this system,
then implement page by page.
