/* 五子棋 / Gomoku — engine.

   Free-style: black moves first, five or more in a row wins, a full board is a
   draw. No forbidden-move rules — they punish the beginner this game is meant
   to be, and every one of them is a rule you have to explain before the first
   stone goes down.

   No DOM, no profile, no Math.random() in here. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const N = 15;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  PV.Gomoku = class Gomoku extends PV.BoardGame {
    constructor(opts) {
      const o = opts || {};
      super({
        cols: N, rows: N, rng: o.rng, first: 0,
        seats: [{ key: 'black', kind: o.blackKind || 'human' },
                { key: 'white', kind: o.whiteKind || 'ai' }]
      });
      this.size = N;
      this.winLine = null;
      this.lastMove = null;
    }

    /**
     * Every empty intersection. The view greys from this list; the AI scores
     * it. It stays a plain {type, x, y} — anything else on an affordance
     * becomes a hard equality test in the base class.
     */
    legalMoves(seat) {
      if (this.over || seat !== this.turn) return [];
      const out = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) if (this.isEmpty(x, y)) out.push({ type: 'place', x: x, y: y });
      }
      return out;
    }

    /** 225 affordances a turn is too many to compare one by one. */
    isLegal(move) {
      return !this.over && !!move && move.type === 'place'
        && Number.isInteger(move.x) && Number.isInteger(move.y)
        && this.inBounds(move.x, move.y) && this.isEmpty(move.x, move.y);
    }

    handle(move) {
      const seat = this.turn;
      this.put(move.x, move.y, seat);
      this.lastMove = { x: move.x, y: move.y, seat: seat };

      const line = this.lineThrough(move.x, move.y, seat);
      if (line) {
        this.winLine = line;
        this.finish(seat, 'five');
        return;
      }
      if (this.history.length + 1 >= N * N) { this.finish(null, 'full'); return; }
      this.pass();
    }

    /** The five-or-more run through (x, y), or null. */
    lineThrough(x, y, colour) {
      for (const d of DIRS) {
        const cells = [{ x: x, y: y }];
        for (let i = 1; this.at(x + d[0] * i, y + d[1] * i) === colour; i++) {
          cells.push({ x: x + d[0] * i, y: y + d[1] * i });
        }
        for (let i = 1; this.at(x - d[0] * i, y - d[1] * i) === colour; i++) {
          cells.unshift({ x: x - d[0] * i, y: y - d[1] * i });
        }
        if (cells.length >= 5) return cells;
      }
      return null;
    }

    /** Cells worth considering: near an existing stone, or the centre. */
    candidates(reach) {
      const r = reach || 2;
      if (!this.history.length) return [{ x: 7, y: 7 }];
      const seen = new Set(), out = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (this.at(x, y) === -1) continue;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx, ny = y + dy;
              if (!this.inBounds(nx, ny) || !this.isEmpty(nx, ny)) continue;
              const k = ny * N + nx;
              if (seen.has(k)) continue;
              seen.add(k);
              out.push({ x: nx, y: ny });
            }
          }
        }
      }
      return out;
    }

    snapshot() {
      const s = super.snapshot();
      s.winLine = this.winLine;
      s.lastMove = this.lastMove;
      return s;
    }
  };

  PV.Gomoku.SIZE = N;
  PV.Gomoku.DIRS = DIRS;

})(window.PV);
