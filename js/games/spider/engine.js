/* 蜘蛛纸牌 / Spider Solitaire — engine.

   On the puzzle contract. Two decks, 104 cards, ten columns, eight completed
   K-to-A runs to win. The deal is a pure function of (seed, suits), so a game
   can be handed to a friend as a code.

   Only the suits in play are dealt: one suit is eight of every rank, two suits
   four each, four suits two each. That is what makes the option a difficulty
   rather than a skin — the tableau is the same size either way, but a run only
   travels as a unit while it is all one suit.

   Undo is whole-state snapshots rather than per-move inverses, for the reason
   Klondike gives: one move can also flip a card and can also send thirteen
   cards to a foundation, and a "clever" inverse for that is exactly where an
   undo bug hides.

   Scoring is the familiar one: 500 to start, a point per move, +100 for every
   completed suit. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const C = () => PV.Cards;
  const COLS = 10;

  PV.Spider = class Spider extends PV.PuzzleGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.suits = (o.suits === 2 || o.suits === 4) ? o.suits : 1;
      this.score = 500;
      this.moves = 0;
      this.deal();
    }

    deal() {
      // 104 cards drawn only from the suits in play. Suit order is spade,
      // heart, diamond, club, so two-suit play is one black and one red —
      // telling the two apart is the whole point of that level.
      const copies = 8 / this.suits;
      const cards = [];
      for (let s = 0; s < this.suits; s++) {
        for (let r = 0; r < 13; r++) {
          for (let n = 0; n < copies; n++) cards.push(s * 13 + r);
        }
      }
      const deck = this.rng.shuffle(cards);

      this.tableau = [];
      let at = 0;
      for (let i = 0; i < COLS; i++) {
        const n = i < 4 ? 6 : 5;              // 54 cards down, 50 left in stock
        const pile = [];
        for (let j = 0; j < n; j++) pile.push({ c: deck[at++], up: j === n - 1 });
        this.tableau.push(pile);
      }
      this.stock = deck.slice(at);
      this.foundations = [];                  // the suit of each completed run
    }

    /* ------------------------------------------------------------ rules */

    /** How many cards from the top of `pile` travel together: one suit, descending. */
    runLength(pile) {
      const p = this.tableau[pile];
      let n = 0;
      for (let i = p.length - 1; i >= 0; i--) {
        if (!p[i].up) break;
        if (i < p.length - 1) {
          const below = p[i], above = p[i + 1];
          if (C().rank(below.c) !== C().rank(above.c) + 1) break;
          if (C().suit(below.c) !== C().suit(above.c)) break;
        }
        n++;
      }
      return n;
    }

    /** Any card may start an empty column; otherwise rank alone decides. */
    canDrop(card, pile) {
      const p = this.tableau[pile];
      if (!p.length) return true;
      const top = p[p.length - 1];
      return top.up && C().rank(top.c) === C().rank(card) + 1;
    }

    /** The stock deals ten at a time, and refuses while a column stands empty. */
    canDeal() {
      if (!this.stock.length) return false;
      return this.tableau.every(p => p.length > 0);
    }

    get dealsLeft() { return Math.ceil(this.stock.length / COLS); }

    flipTop(pile) {
      const p = this.tableau[pile];
      if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
    }

    /**
     * Send any finished run home.
     *
     * Thirteen cards of one suit descending can only be K-to-A: thirteen
     * consecutive ranks that stay above zero have to start at the king. The
     * length is the whole test, so there is no separate check for the king.
     */
    collect() {
      for (let i = 0; i < COLS; i++) {
        if (this.runLength(i) !== 13) continue;
        const p = this.tableau[i];
        const run = p.splice(p.length - 13, 13);
        this.foundations.push(C().suit(run[0].c));
        this.score += 100;
        this.flipTop(i);
      }
    }

    /* ------------------------------------------------------------ moves */

    handle(move) {
      if (!move) return null;
      if (move.type === 'restore') { this.load(move.snap); return null; }
      const inverse = { type: 'restore', snap: this.snapshot() };

      if (move.type === 'deal') {
        if (!this.canDeal()) return null;
        for (let i = 0; i < COLS; i++) this.tableau[i].push({ c: this.stock.pop(), up: true });
        this.spend();
        this.collect();
        return inverse;
      }

      if (move.type === 'tt') {
        const from = this.tableau[move.from];
        const n = move.count | 0;
        if (move.from === move.to || n < 1 || n > this.runLength(move.from)) return null;
        const card = from[from.length - n].c;
        if (!this.canDrop(card, move.to)) return null;
        const run = from.splice(from.length - n, n);
        for (const cd of run) this.tableau[move.to].push(cd);
        this.flipTop(move.from);
        this.spend();
        this.collect();
        return inverse;
      }

      return null;
    }

    spend() { this.moves++; this.score = Math.max(0, this.score - 1); }

    /* ------------------------------------------------------- what is open */

    /**
     * Every tableau move on the board.
     *
     * Tipping a whole column into an empty one is skipped: it is legal, it
     * changes nothing, and leaving it in would keep a dead game alive forever.
     */
    legalMoves() {
      const out = [];
      for (let from = 0; from < COLS; from++) {
        const p = this.tableau[from];
        const run = this.runLength(from);
        for (let n = 1; n <= run; n++) {
          const card = p[p.length - n].c;
          for (let to = 0; to < COLS; to++) {
            if (to === from) continue;
            if (!this.tableau[to].length && n === p.length) continue;
            if (!this.canDrop(card, to)) continue;
            out.push({ type: 'tt', from: from, to: to, count: n });
          }
        }
      }
      return out;
    }

    /**
     * What a move is worth to a player. Ranked, not searched — searching a
     * spider position properly is a solver, and a hint button does not need one
     * to point at the move in front of you.
     */
    rank(move) {
      const from = this.tableau[move.from], to = this.tableau[move.to];
      const moved = from[from.length - move.count];
      const joins = to.length > 0 && C().suit(to[to.length - 1].c) === C().suit(moved.c);
      let s = move.count * 2;                                              // prefer the bigger lift
      if (joins && this.runLength(move.to) + move.count === 13) s += 1000; // finishes a suit
      if (from.length > move.count && !from[from.length - move.count - 1].up) s += 200;
      if (from.length === move.count && to.length) s += 150;               // empties a column
      if (joins) s += 60;                                                  // keeps the run travelling
      if (!to.length) s -= 40;                                             // an empty column is worth keeping
      return s;
    }

    /** The move a hint should point at, or null. Pass a pile to ask only about it. */
    bestMove(fromPile) {
      let best = null, bestScore = -Infinity;
      for (const m of this.legalMoves()) {
        if (fromPile != null && m.from !== fromPile) continue;
        const s = this.rank(m);
        if (s > bestScore) { bestScore = s; best = m; }
      }
      return best;
    }

    /** Nothing to move and nothing to deal: the game is lost, not merely hard. */
    isStuck() {
      if (this.solved) return false;
      if (this.canDeal()) return false;
      return this.legalMoves().length === 0;
    }

    isSolved() { return this.foundations.length === 8; }

    /* --------------------------------------------------------- snapshot */

    snapshot() {
      return {
        stock: this.stock.slice(),
        tableau: this.tableau.map(p => p.map(cd => ({ c: cd.c, up: cd.up }))),
        foundations: this.foundations.slice(),
        score: this.score, moves: this.moves
      };
    }

    load(s) {
      this.stock = s.stock.slice();
      this.tableau = s.tableau.map(p => p.map(cd => ({ c: cd.c, up: cd.up })));
      this.foundations = s.foundations.slice();
      this.score = s.score;
      this.moves = s.moves;
    }
  };

})(window.PV);
