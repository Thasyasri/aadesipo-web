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
    passedGo: "{player} passed GO and collected {amount}",
    sentToJail: "{player} was sent to jail",
    releasedFromJail: "{player} got out of jail",
    propertyPurchased: "{player} bought a property for {amount}",
    rentPaid: "{from} paid {amount} rent to {to}",
    taxPaid: "{player} paid {amount} tax",
    jackpotCollected: "{player} scooped the {amount} Free Parking jackpot",
    loanTaken: "{player} took a {amount} bank loan",
    loanRepaid: "{player} repaid {amount} of their loan",
    debtIncurred: "{player} must raise {amount} to pay {creditor}",
    eventCard: "{player}: {text}",
    auctionStarted: "Auction started",
    auctionWon: "{player} won the auction for {amount}",
    auctionVoided: "Nobody bid — property stays unowned",
    propertyMortgaged: "{player} mortgaged a property for {amount}",
    propertyUnmortgaged: "{player} paid off a mortgage",
    houseBuilt: "{player} built {building}",
    hotel: "a hotel",
    house: "a house",
    houseSold: "{player} sold a building",
    tradeProposed: "{proposer} offered {recipient} a trade",
    tradeExecuted: "A trade was completed",
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
