/* 接龙 / Klondike Solitaire — engine.

   On the puzzle contract. The deal is a pure function of the seed, so a game
   can be handed to a friend as a code.

   Undo is done with whole-state snapshots rather than per-move inverses. Every
   other puzzle here has a tidy inverse; Klondike does not — one tableau move
   can also flip a card, and drawing can recycle the stock — and a "clever"
   inverse for those is exactly where an undo bug hides. A snapshot of eleven
   small arrays is a few hundred bytes, and there are never more than a few
   hundred moves in a game.

   Scoring is standard Klondike: +10 into a foundation, +5 for turning a card
   over, -15 for taking one back out again. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const C = () => PV.Cards;

  PV.Solitaire = class Solitaire extends PV.PuzzleGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.drawCount = o.drawCount === 3 ? 3 : 1;
      this.recycles = 0;
      this.score = 0;
      this.verified = !!o.verified;
      this.deal();
    }

    deal() {
      const deck = this.rng.shuffle(C().deck());
      this.tableau = [];
      let at = 0;
      for (let i = 0; i < 7; i++) {
        const pile = [];
        for (let j = 0; j <= i; j++) pile.push({ c: deck[at++], up: j === i });
        this.tableau.push(pile);
      }
      this.stock = deck.slice(at);
      this.waste = [];
      this.foundations = [[], [], [], []];
    }

    /* ------------------------------------------------------------ rules */

    canToFoundation(card) {
      const s = C().suit(card);
      return C().rank(card) === this.foundations[s].length + 1;
    }

    canToTableau(card, pile) {
      const p = this.tableau[pile];
      if (!p.length) return C().rank(card) === 13;          // only a king starts a pile
      const top = p[p.length - 1];
      if (!top.up) return false;
      return C().rank(top.c) === C().rank(card) + 1 && C().red(top.c) !== C().red(card);
    }

    /** How many cards from the top of `pile` form a movable run. */
    runLength(pile) {
      const p = this.tableau[pile];
      let n = 0;
      for (let i = p.length - 1; i >= 0; i--) {
        if (!p[i].up) break;
        if (i < p.length - 1) {
          const below = p[i], above = p[i + 1];
          if (C().rank(below.c) !== C().rank(above.c) + 1 || C().red(below.c) === C().red(above.c)) break;
        }
        n++;
      }
      return n;
    }

    /** Turn the new top card of a pile face up. Worth 5 points. */
    flipTop(pile) {
      const p = this.tableau[pile];
      if (p.length && !p[p.length - 1].up) { p[p.length - 1].up = true; this.score += 5; }
    }

    /* ------------------------------------------------------------ moves */

    handle(move) {
      if (!move) return null;
      if (move.type === 'restore') { this.load(move.snap); return null; }
      const before = this.snapshot();
      const inverse = { type: 'restore', snap: before };

      if (move.type === 'draw') {
        if (!this.stock.length) {
          if (!this.waste.length) return null;
          this.stock = this.waste.reverse();
          this.waste = [];
          this.recycles++;
          if (this.drawCount === 1) this.score = Math.max(0, this.score - 100);
          return inverse;
        }
        for (let i = 0; i < this.drawCount && this.stock.length; i++) this.waste.push(this.stock.pop());
        return inverse;
      }

      if (move.type === 'wf') {
        const card = this.waste[this.waste.length - 1];
        if (card == null || !this.canToFoundation(card)) return null;
        this.waste.pop();
        this.foundations[C().suit(card)].push(card);
        this.score += 10;
        return inverse;
      }

      if (move.type === 'wt') {
        const card = this.waste[this.waste.length - 1];
        if (card == null || !this.canToTableau(card, move.pile)) return null;
        this.waste.pop();
        this.tableau[move.pile].push({ c: card, up: true });
        this.score += 5;
        return inverse;
      }

      if (move.type === 'tf') {
        const p = this.tableau[move.pile];
        const top = p[p.length - 1];
        if (!top || !top.up || !this.canToFoundation(top.c)) return null;
        p.pop();
        this.foundations[C().suit(top.c)].push(top.c);
        this.score += 10;
        this.flipTop(move.pile);
        return inverse;
      }

      if (move.type === 'tt') {
        const from = this.tableau[move.from];
        const n = move.count;
        if (!n || n > this.runLength(move.from)) return null;
        const card = from[from.length - n].c;
        if (move.from === move.to || !this.canToTableau(card, move.to)) return null;
        const run = from.splice(from.length - n, n);
        for (const cd of run) this.tableau[move.to].push(cd);
        this.flipTop(move.from);
        return inverse;
      }

      if (move.type === 'ft') {
        const f = this.foundations[move.suit];
        const card = f[f.length - 1];
        if (card == null || !this.canToTableau(card, move.pile)) return null;
        f.pop();
        this.tableau[move.pile].push({ c: card, up: true });
        this.score = Math.max(0, this.score - 15);
        return inverse;
      }

      return null;
    }

    /** Every foundation move available right now, for the auto-finish button. */
    autoMoves() {
      const out = [];
      const w = this.waste[this.waste.length - 1];
      if (w != null && this.canToFoundation(w)) out.push({ type: 'wf' });
      for (let i = 0; i < 7; i++) {
        const p = this.tableau[i];
        const top = p[p.length - 1];
        if (top && top.up && this.canToFoundation(top.c)) out.push({ type: 'tf', pile: i });
      }
      return out;
    }

    /** True once nothing is face down and the stock is exhausted: it is won. */
    canAutoFinish() {
      if (this.stock.length || this.waste.length > 1) return false;
      return this.tableau.every(p => p.every(cd => cd.up));
    }

    isSolved() { return this.foundations.every(f => f.length === 13); }

    /* --------------------------------------------------------- snapshot */

    snapshot() {
      return {
        stock: this.stock.slice(),
        waste: this.waste.slice(),
        foundations: this.foundations.map(f => f.slice()),
        tableau: this.tableau.map(p => p.map(cd => ({ c: cd.c, up: cd.up }))),
        score: this.score, recycles: this.recycles
      };
    }

    load(s) {
      this.stock = s.stock.slice();
      this.waste = s.waste.slice();
      this.foundations = s.foundations.map(f => f.slice());
      this.tableau = s.tableau.map(p => p.map(cd => ({ c: cd.c, up: cd.up })));
      this.score = s.score;
      this.recycles = s.recycles;
    }
  };

})(window.PV);
