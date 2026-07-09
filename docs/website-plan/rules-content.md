# Rules / How to Play — Content Outline

Content inventory for the **`/rules`** page. Every segment of the game, grounded in
the actual rules engine (`packages/engine`). Where a number is shown, it is the
engine's current value — **the live page should read these from the engine** (mode
configs, prices, event tables) so the rulebook can never drift from the real game,
exactly as the in-game "Event outcomes" sheet already does.

Currency note: the engine stores amounts in units of ₹1,000. The UI shows them as
₹…K / ₹…Lakh / ₹…Crore. Values below are in the ₹ display form.

## Page structure (for wireframes/design later)

- Sticky in-page **table of contents** / section nav (desktop sidebar, mobile top select).
- Each segment is a titled section with anchor links; long ones can be accordions.
- A **search/filter** box to jump to a rule.
- Reuse the engine's data for the event tables, rent tables, mode configs, and house
  rules so it's authoritative and localised for free.
- Cross-links into the game (e.g. "see the full Chance table" opens the same data the
  board's centre emblem shows).

---

## 1. Objective — how you win

- Be the **last player standing** (everyone else bankrupt), **or**
- Have the **highest net worth** when the round cap is reached (round cap varies by mode).
- Net worth = cash + property value (+ buildings) − loans owed.

## 2. Setup

- **2–5 players**; play vs AI, pass-and-play on one device, or online.
- **Starting cash:** by mode (Classic ₹15 Lakh, Quick ₹25 Lakh, Marathon ₹15 Lakh) or a house-rule preset (₹10 / ₹15 / ₹20 / ₹25 Lakh).
- Board = **40 tiles**: 22 properties (8 colour groups), 4 transit stations, 2 utilities, 3 Chance, 3 Sarpanch Gari Dabba (event), 2 taxes, GO, Jail/Just Visiting, Go To Jail, Free Parking.

## 3. Taking a turn — dice & movement

- Roll **two dice**, move that many tiles clockwise, resolve the tile you land on.
- **Doubles → roll again.** But **three doubles in a row → go straight to Jail** (no third move).
- On the board, tiles show a short **code** (e.g. VZG); tap any tile for its full name, price, and rent.

## 4. Passing GO — salary

- Each time you pass or land on GO, collect your **salary** (base **₹2 Lakh**).
- **Salary escalation** (anti-slog): it rises over time, at a pace set by the mode
  (Classic +₹0.5 Lakh every 10 rounds; Quick +₹1 Lakh every 4; Marathon +₹0.25 Lakh every 15).
- _House rule "Double salary on GO":_ landing **exactly** on GO pays double.

## 5. Buying property

- Land on an unowned property/station/utility → **buy at its price**, or **decline**.
- Declining sends it to **auction** (unless the "No auctions" house rule is on, where it just stays unowned).

## 6. Auctions

- **Declined-property auction:** bidding opens at the tile's **list price** and rises from there; the highest bid wins and pays the **bank**. If nobody will meet the price, the tile stays unowned.
- **Sell to auction (your property):** on your turn (or while raising funds) you can auction a property you own. Proceeds go to **you**; the **reserve = its mortgage value**; if nobody bids you keep it. Only building-free, unmortgaged property can be listed, and the seller can't bid.

## 7. Rent

- Land on someone's property → pay them rent (**automatically**). A **mortgaged** property charges **no rent**.
- **Rent does NOT stack** — it's the single amount for the current level.
- **Property:** base rent, or the house/hotel tier you've built. Owning the **entire colour set** (a monopoly) **doubles the base rent** on its unimproved tiles.
- **Transit stations:** rent by how many of the 4 you own (₹25K / ₹50K / ₹1 Lakh / ₹2 Lakh).
- **Utilities:** rent = dice roll × multiplier (×4 with one utility, ×10 with both).

## 8. Houses & hotels

- Build only once you own a **full colour set** (unmortgaged).
- **Build cost** is per colour group; each house raises rent to the next tier; 5th building = a **hotel**.
- _House rule "Build evenly":_ houses must go up (and come down) evenly across the group.
- _House rule "Limited buildings":_ the bank stocks **32 houses / 12 hotels** — they can run out.
- **Sell buildings** back to the bank to raise cash (evenly, if that rule is on).

## 9. Mortgaging

- Mortgage a property for its **mortgage value** (≈ half its price) to raise cash.
- A mortgaged property **collects no rent**; a whole tile greys out on the board.
- **Unmortgage** by paying back the mortgage value **+ 10% interest**.
- You must **sell all its buildings first** before mortgaging.

## 10. Trading

- Propose a trade to any player: **cash + building-free properties + get-out-of-jail cards**, either direction.
- The recipient **accepts or rejects** — there are **no counter-offers** in this version.
- A live value breakdown shows who gains. AI players evaluate and respond.

## 11. Jail

- **You go to Jail** by: landing on **Go To Jail**, rolling **three doubles**, or a **Chance / Sarpanch Gari Dabba** card that sends you.
- **Leaving jail always costs ₹50K bail** — however you got there.
  - **Pay the bail** and walk out, then roll as normal.
  - **Roll doubles** to leave at once and move that roll — you **still pay the bail**.
  - **Serve your time** (up to **3 turns**; on the last one you pay the bail and move).
  - A **get-out-of-jail-free card** is the only way out without paying.
- Can't cover the bail? Raise the funds (mortgage / sell) — or go bankrupt.
- **"Just visiting"** (landing on the Jail tile normally) costs nothing.

## 12. Taxes

Tax is **not a flat fee** — it scales with what you own the moment you land (a bare board is cheap; an empire pays dearly). Paid to the **bank**.

- **Income Tax** — **₹25K per coloured property** you own, plus **₹50K per transit station or utility**.
- **Luxury Tax** — **₹25K per house** you've built and **₹50K per hotel**.
- _House rule "Free Parking jackpot":_ taxes pile up under Free Parking instead of vanishing (see §13).

## 13. Free Parking

- Normally a safe rest tile — nothing happens.
- _With the jackpot house rule:_ taxes accumulate there and you **sweep the whole pot** when you land on it.

## 14. Chance & Sarpanch Gari Dabba (events)

- Landing on a **Chance** or **Sarpanch Gari Dabba** tile triggers an outcome decided by your **exact dice sum** — **deterministic, no random draw**, so the full outcome table is readable up front.
- Effects include: pay/collect cash, collect from or pay every player, advance to a tile/nearest station, go to jail, or get a jail-free card.
- The page shows the **full dice-sum → outcome tables** (sourced from the engine).

## 15. Bank loans (catch-up)

- A trailing player can **borrow against net worth** to catch up: cap = **50% of net worth**.
- The loan is repaid with **10% interest per round**; the balance counts against net worth until repaid.

## 16. Bankruptcy

- If you owe more than your cash, you must **raise funds** (mortgage / sell buildings / sell to auction) — or **declare bankruptcy**.
- On bankruptcy, the **creditor** (or the **bank**, for tax/bail) inherits your assets. Last player standing wins.

## 17. Game modes

| Mode         | Starting cash | Round cap | Salary escalation       |
| ------------ | ------------- | --------- | ----------------------- |
| **Classic**  | ₹15 Lakh      | 40 rounds | +₹0.5 Lakh / 10 rounds  |
| **Quick**    | ₹25 Lakh      | 15 rounds | +₹1 Lakh / 4 rounds     |
| **Marathon** | ₹15 Lakh      | 80 rounds | +₹0.25 Lakh / 15 rounds |

## 18. House rules (toggles at setup)

- **Free Parking jackpot** — taxes pile up under Free Parking; land there to sweep it.
- **No auctions** — a declined property stays unowned instead of going to auction.
- **Double salary on GO** — landing exactly on GO pays double.
- **Limited houses & hotels** — the bank stocks 32 houses / 12 hotels (they can run out).
- **Build evenly** — houses go up and down evenly across a colour group.

---

### Implementation note

Render the numbers, tables, and mode/house-rule descriptions **from the engine's
exported constants and tables** (not hand-typed), so the rulebook stays correct as the
game is rebalanced. The three event tables and rent tables already exist as engine data.
