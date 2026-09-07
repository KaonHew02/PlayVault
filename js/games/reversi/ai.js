/* 黑白棋 / Reversi — opponent.

   Reversi is the game where the obvious strategy is the losing one: taking the
   most discs early leaves you with no safe moves later. So the evaluation is
   almost entirely positional and mobility-based, and disc count only starts to
   matter as the board fills.

   The square weights encode the two things every human learns the hard way —
   corners are permanent, and the squares diagonally next to a corner (the
   X-squares) hand the corner over. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const WEIGHTS = [
    120, -20, 20, 5, 5, 20, -20, 120,
    -20, -40, -5, -5, -5, -5, -40, -20,
     20, -5, 15, 3, 3, 15, -5, 20,
      5, -5, 3, 3, 3, 3, -5, 5,
      5, -5, 3, 3, 3, 3, -5, 5,
     20, -5, 15, 3, 3, 15, -5, 20,
    -20, -40, -5, -5, -5, -5, -40, -20,
    120, -20, 20, 5, 5, 20, -20, 120
  ];

  const LEVELS = {
    easy: { blunder: 0.45, depth: 1 },
    normal: { blunder: 0.12, depth: 2 },
    hard: { blunder: 0.00, depth: 4 }
  };

  /** Positive is good for `seat`. */
  function evaluate(g, seat) {
    const other = 1 - seat;
    let pos = 0, mine = 0, theirs = 0;
    for (let i = 0; i < 64; i++) {
      const v = g.cells[i];
      if (v === seat) { pos += WEIGHTS[i]; mine++; }
      else if (v === other) { pos -= WEIGHTS[i]; theirs++; }
    }
    const empty = 64 - mine - theirs;
    const myMoves = g.movesFor(seat).length, theirMoves = g.movesFor(other).length;
    const mobility = (myMoves - theirMoves) * 12;

    // Discs only become the point once the board is nearly full; before that,
    // holding fewer discs is often better.
    const discs = empty < 12 ? (mine - theirs) * 12 : (mine - theirs) * -0.6;
    return pos + mobility + discs;
  }

  /** Save/restore is cheaper than cloning the engine at every node. */
  function save(g) { return { cells: Int8Array.from(g.cells), turn: g.turn, over: g.over, result: g.result }; }
  function restore(g, s) { g.cells.set(s.cells); g.turn = s.turn; g.over = s.over; g.result = s.result; }

  function search(g, seat, depth, alpha, beta) {
    if (g.over || depth === 0) return evaluate(g, seat);
    const moves = g.movesFor(g.turn);
    if (!moves.length) return evaluate(g, seat);

    const maximising = g.turn === seat;
    let best = maximising ? -Infinity : Infinity;
    for (const m of moves) {
      const s = save(g);
      g.handle(m);                       // inside the search we own the engine
      const v = search(g, seat, depth - 1, alpha, beta);
      restore(g, s);
      if (maximising) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  PV.ReversiAI = class ReversiAI {
    constructor(opts) {
      const o = opts || {};
      this.seat = o.seat == null ? 1 : o.seat;
      this.level = LEVELS[o.level] ? o.level : 'normal';
      this.rng = o.rng || new PV.RNG(1);
    }

    choose(g) {
      if (g.over || g.turn !== this.seat) return null;
      const cfg = LEVELS[this.level];
      const moves = g.movesFor(this.seat);
      if (!moves.length) return null;

      const scored = moves.map(m => {
        const s = save(g);
        g.handle(m);
        const v = search(g, this.seat, cfg.depth - 1, -Infinity, Infinity);
        restore(g, s);
        return { move: m, score: v };
      });
      scored.sort((a, b) => b.score - a.score);

      let pick = scored[0];
      if (this.rng.chance(cfg.blunder) && scored.length > 1) {
        const span = Math.min(scored.length - 1, Math.max(1, Math.floor(scored.length * 0.5)));
        pick = scored[1 + this.rng.int(span)];
      }
      return pick.move;
    }
  };

  PV.ReversiAI.evaluate = evaluate;
  PV.ReversiAI.LEVELS = Object.keys(LEVELS);

})(window.PV);
