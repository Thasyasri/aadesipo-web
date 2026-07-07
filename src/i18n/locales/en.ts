/**
 * The source-of-truth locale. Every other locale file (hi.ts, te.ts,
 * ta.ts, bn.ts, ...) mirrors this exact key structure — TypeScript
 * enforces that via the Catalog type in ../index.ts, so a locale file
 * missing a key is a compile error, not a silent English fallback in
 * production.
 *
 * Values with {placeholders} are interpolated by t() — see index.ts.
 */
export const en = {
  common: {
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    loading: "Loading…",
  },
  home: {
    newGame: "New game",
    vsAi: "Vs. AI",
    passAndPlay: "Pass & Play",
    online: "Online",
    startGame: "Start game",
    aiOpponents: "AI opponents",
    playersCount: "{count} players total",
    resumeGame: "Resume a game",
    resume: "Resume",
    dismiss: "Dismiss",
  },
  hud: {
    roll: "Roll",
    endTurn: "End turn",
    myProperties: "My properties",
    trade: "Trade",
    activity: "Activity",
    undo: "Undo",
    waitingForOthers: "Waiting for other players…",
    inJail: "In jail",
    bankrupt: "Bankrupt",
    payBail: "Pay bail ({amount})",
    useJailFreeCard: "Use jail-free card",
    tryDoubles: "Try to roll doubles",
  },
  gameLog: {
    diceRolled: "{player} rolled {die1} + {die2}",
    landed: "{player} landed on {tile}",
    passedGo: "{player} passed GO and collected {amount}",
    sentToJail: "{player} was sent to jail",
    releasedFromJail: "{player} got out of jail",
    propertyPurchased: "{player} bought {property} for {amount}",
    propertyDeclined: "{player} declined to buy {property}",
    rentPaid: "{from} paid {amount} rent to {to}",
    taxPaid: "{player} paid {amount} tax",
    jackpotCollected: "{player} scooped the {amount} Free Parking jackpot",
    loanTaken: "{player} took a {amount} bank loan",
    loanRepaid: "{player} repaid {amount} of their loan",
    debtIncurred: "{player} must raise {amount} to pay {creditor}",
    eventCard: "{player}: {text}",
    eventCardGain: "{player}: {text} (collected {amount})",
    eventCardLoss: "{player}: {text} (paid {amount})",
    auctionStarted: "Auction started for {property}",
    auctionBid: "{player} bid {amount}",
    auctionPassed: "{player} passed the auction",
    auctionWon: "{player} won {property} at auction for {amount}",
    auctionVoided: "Nobody bid — {property} stays unowned",
    propertyMortgaged: "{player} mortgaged {property} for {amount}",
    propertyUnmortgaged: "{player} paid off the mortgage on {property}",
    houseBuilt: "{player} built {building} on {property}",
    hotel: "a hotel",
    house: "a house",
    houseSold: "{player} sold a building on {property}",
    tradeProposed: "{proposer} offered {recipient} a trade",
    tradeExecuted:
      "{proposer} ↔ {recipient} traded — {proposer} gave {gives}; {recipient} gave {gets}",
    tradeRejected: "A trade offer was declined",
    playerBankrupted: "{player} went bankrupt",
    gameEnded: "{player} won the game!",
  },
  victory: {
    title: "Game over!",
    winnerAnnouncement: "{player} wins! 🎉",
    downloadShareCard: "Download share card",
    playAgain: "Play again",
  },
} as const;
