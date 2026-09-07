/* Chess — opponent.

   Negamax with alpha-beta, material plus piece-square tables, and a capture-
   only quiescence search at the leaves.

   The quiescence search is not a refinement, it is the difference between an
   opponent and a liability. Without it the search stops in the middle of an
   exchange and cheerfully "wins" a queen that gets recaptured on the very next
   move — the horizon effect, and the reason a plain depth-3 engine hangs
   pieces to a beginner.

   Difficulty is decision quality, never cheating: same evaluation, shallower
   search and a blunder rate. The AI sees only the board.

   This file is the one place allowed to drive _make/_unmake. Real play still
   goes through apply(). */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const VALUE = [100, 320, 330, 500, 900, 20000];
  const MATE = 100000;

  /* Piece-square tables, from white's point of view, row 0 = black's back rank. */
  const PST = {
    0: [ // pawn
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0],
    1: [ // knight
     -50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50],
    2: [ // bishop
     -20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20],
    3: [ // rook
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0],
    4: [ // queen
     -20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20],
    5: [ // king, middlegame
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20]
  };

  const LEVELS = {
    easy: { depth: 1, qdepth: 0, blunder: 0.50 },
    normal: { depth: 2, qdepth: 3, blunder: 0.14 },
    hard: { depth: 3, qdepth: 4, blunder: 0.00 }
  };

  const kind = p => p % 6;
  const side = p => (p < 6 ? 0 : 1);

  /** Positive is good for `seat`. */
  function evaluate(g, seat) {
    let score = 0;
    for (let s = 0; s < 64; s++) {
      const p = g.cells[s];
      if (p === -1) continue;
      const k = kind(p), white = side(p) === 0;
      // The tables are written from white's side, so black reads them mirrored.
      const pst = PST[k][white ? s : (56 - (s & 56)) + (s & 7)];
      const v = VALUE[k] + pst;
      score += white ? v : -v;
    }
    return seat === 0 ? score : -score;
  }

  function captures(g, seat) {
    const out = [];
    for (const m of g.pseudoMoves(seat)) {
      const target = g.cells[m.to];
      if (target === -1 && !(m.to === g.ep && kind(g.cells[m.from]) === 0)) continue;
      const u = g._make(m);
      if (!g.inCheck(seat)) out.push(m);
      g._unmake(u);
    }
    return out;
  }

  /** Most valuable victim, least valuable attacker — cheap but effective. */
  function order(g, moves) {
    return moves.map(m => {
      const victim = g.cells[m.to];
      const attacker = g.cells[m.from];
      let s = 0;
      if (victim !== -1) s = 10 * VALUE[kind(victim)] - VALUE[kind(attacker)];
      if (m.promo === 'q') s += 8000;
      return { m: m, s: s };
    }).sort((a, b) => b.s - a.s).map(x => x.m);
  }

  function legal(g, seat) {
    const out = [];
    for (const m of g.pseudoMoves(seat)) {
      const u = g._make(m);
      if (!g.inCheck(seat)) out.push(m);
      g._unmake(u);
    }
    return out;
  }

  function quiesce(g, seat, alpha, beta, depth) {
    const stand = evaluate(g, seat);
    if (depth <= 0) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    for (const m of order(g, captures(g, g.turn))) {
      const u = g._make(m);
      g.turn = 1 - g.turn;
      const v = -quiesce(g, 1 - seat, -beta, -alpha, depth - 1);
      g.turn = 1 - g.turn;
      g._unmake(u);
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function negamax(g, seat, depth, alpha, beta, qdepth) {
    const moves = legal(g, g.turn);
    if (!moves.length) {
      // No reply: mate if in check, otherwise a stalemate draw.
      if (g.inCheck(g.turn)) return g.turn === seat ? -MATE - depth : MATE + depth;
      return 0;
    }
    if (depth === 0) return quiesce(g, seat, alpha, beta, qdepth);

    let best = -Infinity;
    for (const m of order(g, moves)) {
      const u = g._make(m);
      g.turn = 1 - g.turn;
      const v = -negamax(g, 1 - seat, depth - 1, -beta, -alpha, qdepth);
      g.turn = 1 - g.turn;
      g._unmake(u);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  PV.ChessAI = class ChessAI {
    constructor(opts) {
      const o = opts || {};
      this.seat = o.seat == null ? 1 : o.seat;
      this.level = LEVELS[o.level] ? o.level : 'normal';
      this.rng = o.rng || new PV.RNG(1);
    }

    choose(g) {
      if (g.over || g.turn !== this.seat) return null;
      const cfg = LEVELS[this.level];
      const moves = order(g, legal(g, this.seat));
      if (!moves.length) return null;

      const scored = moves.map(m => {
        const u = g._make(m);
        g.turn = 1 - g.turn;
        const v = -negamax(g, 1 - this.seat, cfg.depth - 1, -Infinity, Infinity, cfg.qdepth);
        g.turn = 1 - g.turn;
        g._unmake(u);
        return { move: m, score: v };
      });
      scored.sort((a, b) => b.score - a.score);

      // Never blunder away a mate in one — an opponent that walks past that
      // does not read as "easy", it reads as broken.
      if (scored[0].score >= MATE) return scored[0].move;

      let pick = scored[0];
      if (this.rng.chance(cfg.blunder) && scored.length > 1) {
        const span = Math.min(scored.length - 1, Math.max(2, Math.floor(scored.length * 0.4)));
        pick = scored[1 + this.rng.int(span)];
      }
      return pick.move;
    }
  };

  PV.ChessAI.evaluate = evaluate;
  PV.ChessAI.LEVELS = Object.keys(LEVELS);
  PV.ChessAI.MATE = MATE;

})(window.PV);
