/* PlayVault — a standard 52-card deck.

   A card is one integer, 0-51: suit = card / 13, rank = card % 13 + 1 (ace is
   1, king is 13). Suits run ♠ ♥ ♦ ♣, so red is suit 1 or 2 — one comparison,
   which matters in Klondike where "alternating colours" is checked on every
   move and inside the solver's inner loop. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  PV.Cards = {
    SUITS: SUITS,
    RANKS: RANKS,
    suit: c => (c / 13) | 0,
    rank: c => (c % 13) + 1,
    red: c => { const s = (c / 13) | 0; return s === 1 || s === 2; },
    label: c => RANKS[c % 13],
    symbol: c => SUITS[(c / 13) | 0],
    name: c => RANKS[c % 13] + SUITS[(c / 13) | 0],
    deck: () => Array.from({ length: 52 }, (_, i) => i)
  };

})(window.PV);
