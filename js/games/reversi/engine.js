/* 黑白棋 / Reversi — engine.

   8×8, black first, a move is only legal where it flanks at least one of the
   opponent's discs. Two rules people get wrong and both are here:

   - A player with no legal move PASSES; the turn does not simply alternate.
     handle() works that out for itself, so no view has to.
   - The game ends when NEITHER side can move, which is usually a full board
     but is not always. Most discs wins; equal is a draw. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const N = 8;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  PV.Reversi = class Reversi extends PV.BoardGame {
    constructor(opts) {
      const o = opts || {};
      super({
        cols: N, rows: N, rng: o.rng, first: 0,
        seats: [{ key: 'black' }, { key: 'white' }]
      });
      this.put(3, 3, 1); this.put(4, 4, 1);
      this.put(3, 4, 0); this.put(4, 3, 0);
      this.lastMove = null;
      this.passed = null;          // seat that had to pass on the last turn
    }

    /** Discs that would turn if `seat` played (x, y). Empty means illegal. */
    flips(x, y, seat) {
      if (!this.isEmpty(x, y)) return [];
      const other = 1 - seat;
      const out = [];
      for (const d of DIRS) {
        const run = [];
        let cx = x + d[0], cy = y + d[1];
        while (this.at(cx, cy) === other) { run.push({ x: cx, y: cy }); cx += d[0]; cy += d[1]; }
        if (run.length && this.at(cx, cy) === seat) out.push.apply(out, run);
      }
      return out;
    }

    movesFor(seat) {
      const out = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (this.isEmpty(x, y) && this.flips(x, y, seat).length) out.push({ type: 'place', x: x, y: y });
        }
      }
      return out;
    }

    legalMoves(seat) {
      if (this.over || seat !== this.turn) return [];
      return this.movesFor(seat);
    }

    isLegal(move) {
      return !this.over && !!move && move.type === 'place'
        && Number.isInteger(move.x) && Number.isInteger(move.y)
        && this.inBounds(move.x, move.y)
        && this.flips(move.x, move.y, this.turn).length > 0;
    }

    handle(move) {
      const seat = this.turn;
      const flipped = this.flips(move.x, move.y, seat);
      this.put(move.x, move.y, seat);
      for (const c of flipped) this.put(c.x, c.y, seat);
      this.lastMove = { x: move.x, y: move.y, seat: seat, flipped: flipped };

      const other = 1 - seat;
      if (this.movesFor(other).length) { this.turn = other; this.passed = null; return; }
      if (this.movesFor(seat).length) { this.passed = other; return; }   // opponent passes

      const s = this.score();
      this.passed = null;
      this.finish(s.black === s.white ? null : (s.black > s.white ? 0 : 1), 'no-moves');
    }

    score() {
      let black = 0, white = 0;
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i] === 0) black++;
        else if (this.cells[i] === 1) white++;
      }
      return { black: black, white: white, empty: N * N - black - white };
    }

    snapshot() {
      const s = super.snapshot();
      s.lastMove = this.lastMove;
      s.passed = this.passed;
      s.score = this.score();
      return s;
    }
  };

  PV.Reversi.SIZE = N;

})(window.PV);
