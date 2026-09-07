/* 中国象棋 / Xiangqi — opponent.

   Negamax with alpha-beta over PSEUDO-legal moves. Filtering every move for
   legality at every node means running inCheck() forty times per node, which
   is what makes a xiangqi search crawl. Instead the search lets a bad move be
   played and sees the general captured on the reply — the same answer, an
   order of magnitude cheaper.

   Two things still have to be handled explicitly:
   - Capturing a general ends the line at once, or the search happily plays on
     with a king short.
   - The flying-general rule is not a capture, so a move that exposes the
     generals to each other is skipped outright.

   The root uses legalMoves(), so the move actually returned is always legal. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const MATE = 100000;
  const VALUE = [10000, 200, 200, 400, 900, 450, 100];
  const kind = p => p % 7;
  const side = p => (p < 7 ? 0 : 1);

  const LEVELS = {
    easy: { depth: 1, blunder: 0.45 },
    normal: { depth: 2, blunder: 0.14 },
    hard: { depth: 3, blunder: 0.00 }
  };

  function evaluate(g, seat) {
    let score = 0;
    for (let s = 0; s < 90; s++) {
      const p = g.cells[s];
      if (p === -1) continue;
      const k = kind(p), sd = side(p);
      const row = Math.floor(s / 9);
      let v = VALUE[k];
      // A soldier doubles in value once it is over the river, and a little
      // more the deeper it gets — the whole point of pushing one.
      if (k === PV.Xiangqi.S) {
        const crossed = sd === 0 ? row <= 4 : row >= 5;
        if (crossed) v = 200 + (sd === 0 ? (4 - row) : (row - 5)) * 12;
      }
      // Chariots and cannons want open central files.
      if (k === PV.Xiangqi.C || k === PV.Xiangqi.N) v += (4 - Math.abs((s % 9) - 4)) * 4;
      score += sd === 0 ? v : -v;
    }
    return seat === 0 ? score : -score;
  }

  function order(g, moves) {
    return moves.map(m => {
      const victim = g.cells[m.to];
      return { m: m, s: victim === -1 ? 0 : 10 * VALUE[kind(victim)] - VALUE[kind(g.cells[m.from])] };
    }).sort((a, b) => b.s - a.s).map(x => x.m);
  }

  function search(g, seat, depth, alpha, beta) {
    if (depth === 0) return evaluate(g, seat);
    let best = -Infinity, any = false;

    for (const m of order(g, g.pseudoMoves(g.turn))) {
      const takesGeneral = kind(g.cells[m.to]) === PV.Xiangqi.G && g.cells[m.to] !== -1;
      const u = g._make(m);
      if (g.generalsFacing()) { g._unmake(u); continue; }     // never legal
      any = true;
      let v;
      if (takesGeneral) {
        v = MATE + depth;
      } else {
        g.turn = 1 - g.turn;
        v = -search(g, 1 - seat, depth - 1, -beta, -alpha);
        g.turn = 1 - g.turn;
      }
      g._unmake(u);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    // Nothing playable at all: in xiangqi that is a loss, not a draw.
    return any ? best : -MATE - depth;
  }

  PV.XiangqiAI = class XiangqiAI {
    constructor(opts) {
      const o = opts || {};
      this.seat = o.seat == null ? 1 : o.seat;
      this.level = LEVELS[o.level] ? o.level : 'normal';
      this.rng = o.rng || new PV.RNG(1);
    }

    choose(g) {
      if (g.over || g.turn !== this.seat) return null;
      const cfg = LEVELS[this.level];
      const moves = order(g, g.legalMoves(this.seat));
      if (!moves.length) return null;

      const scored = moves.map(m => {
        const u = g._make(m);
        g.turn = 1 - g.turn;
        const v = -search(g, 1 - this.seat, cfg.depth - 1, -Infinity, Infinity);
        g.turn = 1 - g.turn;
        g._unmake(u);
        return { move: m, score: v };
      });
      scored.sort((a, b) => b.score - a.score);

      if (scored[0].score >= MATE) return scored[0].move;

      let pick = scored[0];
      if (this.rng.chance(cfg.blunder) && scored.length > 1) {
        const span = Math.min(scored.length - 1, Math.max(2, Math.floor(scored.length * 0.4)));
        pick = scored[1 + this.rng.int(span)];
      }
      return pick.move;
    }
  };

  PV.XiangqiAI.evaluate = evaluate;
  PV.XiangqiAI.LEVELS = Object.keys(LEVELS);

})(window.PV);
