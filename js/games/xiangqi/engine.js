/* 中国象棋 / Xiangqi — engine.

   9 files × 10 ranks, pieces on the intersections. Red (seat 0) starts at the
   bottom and moves first.

   The rules that separate a working xiangqi from a broken one, all here:

   - The horse is blocked by its "leg": the orthogonal square it steps through.
   - The elephant is blocked by its "eye", the midpoint of its two-step
     diagonal, and may never cross the river.
   - The cannon moves like a chariot but may only capture by jumping exactly
     one piece, the screen.
   - The general and advisors never leave the 3×3 palace.
   - A soldier moves only forward until it crosses the river, and may then also
     move sideways — never backwards.
   - The FLYING GENERAL rule: the two generals may not face each other down an
     open file. It is modelled as check, so no move can ever create it.

   With no legal move you LOSE — xiangqi has no stalemate draw. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const G = 0, A = 1, E = 2, H = 3, C = 4, N = 5, S = 6;   // general, advisor,
  // elephant, horse, chariot, cannoN, Soldier
  const COLS = 9, ROWS = 10;
  const kind = p => p % 7;
  const side = p => (p < 7 ? 0 : 1);
  const idx = (r, f) => r * COLS + f;
  const rowOf = s => Math.floor(s / COLS);
  const fileOf = s => s % COLS;

  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const BACK = [C, H, E, A, G, A, E, H, C];

  const inPalace = (r, f, seat) =>
    f >= 3 && f <= 5 && (seat === 0 ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2));
  const ownHalf = (r, seat) => (seat === 0 ? r >= 5 : r <= 4);

  PV.Xiangqi = class Xiangqi extends PV.BoardGame {
    constructor(opts) {
      const o = opts || {};
      super({
        cols: COLS, rows: ROWS, rng: o.rng, first: 0,
        seats: [{ key: 'red' }, { key: 'black' }]
      });
      for (let f = 0; f < COLS; f++) {
        this.cells[idx(0, f)] = BACK[f] + 7;
        this.cells[idx(9, f)] = BACK[f];
      }
      this.cells[idx(2, 1)] = N + 7; this.cells[idx(2, 7)] = N + 7;
      this.cells[idx(7, 1)] = N; this.cells[idx(7, 7)] = N;
      for (const f of [0, 2, 4, 6, 8]) {
        this.cells[idx(3, f)] = S + 7;
        this.cells[idx(6, f)] = S;
      }
      this.idleMoves = 0;
      this.lastMove = null;
      this.positions = Object.create(null);
    }

    generalSquare(seat) {
      const want = G + seat * 7;
      for (let s = 0; s < COLS * ROWS; s++) if (this.cells[s] === want) return s;
      return -1;
    }

    /* ------------------------------------------------------------ attacks */

    attacked(sq, by) {
      const r = rowOf(sq), f = fileOf(sq), base = by * 7;

      // Chariot (first piece down a ray) and cannon (second piece down a ray).
      for (const d of ORTHO) {
        let rr = r + d[0], ff = f + d[1], first = -1;
        while (rr >= 0 && rr < ROWS && ff >= 0 && ff < COLS) {
          const p = this.cells[idx(rr, ff)];
          if (p !== -1) {
            if (first === -1) {
              if (p === base + C) return true;
              first = p;
            } else {
              if (p === base + N) return true;
              break;
            }
          }
          rr += d[0]; ff += d[1];
        }
      }

      // Horses, checked from the horse's square so its leg is the right one.
      for (const d of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
        const hr = r + d[0], hf = f + d[1];
        if (hr < 0 || hr >= ROWS || hf < 0 || hf >= COLS) continue;
        if (this.cells[idx(hr, hf)] !== base + H) continue;
        const leg = Math.abs(d[0]) === 2
          ? idx(hr - Math.sign(d[0]), hf)
          : idx(hr, hf - Math.sign(d[1]));
        if (this.cells[leg] === -1) return true;
      }

      // Soldiers: forward one, and sideways once across the river.
      const fwd = by === 0 ? 1 : -1;              // where the soldier comes FROM
      if (r + fwd >= 0 && r + fwd < ROWS && this.cells[idx(r + fwd, f)] === base + S) return true;
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff < 0 || ff >= COLS) continue;
        if (this.cells[idx(r, ff)] !== base + S) continue;
        if (!ownHalf(r, by)) return true;         // it has crossed, so it may step sideways
      }

      for (const d of DIAG) {
        const ar = r + d[0], af = f + d[1];
        if (ar >= 0 && ar < ROWS && af >= 0 && af < COLS && this.cells[idx(ar, af)] === base + A) return true;
        const er = r + d[0] * 2, ef = f + d[1] * 2;
        if (er >= 0 && er < ROWS && ef >= 0 && ef < COLS && this.cells[idx(er, ef)] === base + E
          && this.cells[idx(r + d[0], f + d[1])] === -1) return true;
      }
      for (const d of ORTHO) {
        const gr = r + d[0], gf = f + d[1];
        if (gr >= 0 && gr < ROWS && gf >= 0 && gf < COLS && this.cells[idx(gr, gf)] === base + G) return true;
      }
      return false;
    }

    /** The two generals staring down an open file. Illegal for whoever caused it. */
    generalsFacing() {
      const a = this.generalSquare(0), b = this.generalSquare(1);
      if (a < 0 || b < 0 || fileOf(a) !== fileOf(b)) return false;
      const f = fileOf(a);
      for (let r = Math.min(rowOf(a), rowOf(b)) + 1; r < Math.max(rowOf(a), rowOf(b)); r++) {
        if (this.cells[idx(r, f)] !== -1) return false;
      }
      return true;
    }

    inCheck(seat) {
      if (this.generalsFacing()) return true;
      const gs = this.generalSquare(seat);
      return gs < 0 || this.attacked(gs, 1 - seat);
    }

    /* --------------------------------------------------------- generation */

    pseudoMoves(seat) {
      const out = [];
      const push = (from, to) => out.push({ type: 'move', from: from, to: to });
      const free = (r, f) => {
        if (r < 0 || r >= ROWS || f < 0 || f >= COLS) return false;
        const p = this.cells[idx(r, f)];
        return p === -1 || side(p) !== seat;
      };

      for (let s = 0; s < COLS * ROWS; s++) {
        const p = this.cells[s];
        if (p === -1 || side(p) !== seat) continue;
        const r = rowOf(s), f = fileOf(s), k = kind(p);

        if (k === G) {
          for (const d of ORTHO) {
            const rr = r + d[0], ff = f + d[1];
            if (inPalace(rr, ff, seat) && free(rr, ff)) push(s, idx(rr, ff));
          }
        } else if (k === A) {
          for (const d of DIAG) {
            const rr = r + d[0], ff = f + d[1];
            if (inPalace(rr, ff, seat) && free(rr, ff)) push(s, idx(rr, ff));
          }
        } else if (k === E) {
          for (const d of DIAG) {
            const rr = r + d[0] * 2, ff = f + d[1] * 2;
            if (rr < 0 || rr >= ROWS || ff < 0 || ff >= COLS) continue;
            if (!ownHalf(rr, seat)) continue;                  // may not cross the river
            if (this.cells[idx(r + d[0], f + d[1])] !== -1) continue;   // eye blocked
            if (free(rr, ff)) push(s, idx(rr, ff));
          }
        } else if (k === H) {
          for (const d of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
            const rr = r + d[0], ff = f + d[1];
            if (rr < 0 || rr >= ROWS || ff < 0 || ff >= COLS) continue;
            const leg = Math.abs(d[0]) === 2 ? idx(r + Math.sign(d[0]), f) : idx(r, f + Math.sign(d[1]));
            if (this.cells[leg] !== -1) continue;              // leg blocked
            if (free(rr, ff)) push(s, idx(rr, ff));
          }
        } else if (k === C || k === N) {
          for (const d of ORTHO) {
            let rr = r + d[0], ff = f + d[1], jumped = false;
            while (rr >= 0 && rr < ROWS && ff >= 0 && ff < COLS) {
              const target = this.cells[idx(rr, ff)];
              if (k === C) {
                if (target === -1) push(s, idx(rr, ff));
                else { if (side(target) !== seat) push(s, idx(rr, ff)); break; }
              } else {
                if (!jumped) {
                  if (target === -1) push(s, idx(rr, ff));
                  else jumped = true;                          // this is the screen
                } else if (target !== -1) {
                  if (side(target) !== seat) push(s, idx(rr, ff));
                  break;
                }
              }
              rr += d[0]; ff += d[1];
            }
          }
        } else if (k === S) {
          const fwd = seat === 0 ? -1 : 1;
          if (free(r + fwd, f)) push(s, idx(r + fwd, f));
          if (!ownHalf(r, seat)) {                             // crossed the river
            for (const df of [-1, 1]) if (free(r, f + df)) push(s, idx(r, f + df));
          }
        }
      }
      return out;
    }

    legalMoves(seat) {
      if (this.over || seat !== this.turn) return [];
      const out = [];
      for (const m of this.pseudoMoves(seat)) {
        const u = this._make(m);
        if (!this.inCheck(seat)) out.push(m);
        this._unmake(u);
      }
      return out;
    }

    /* --------------------------------------------------------- make/unmake */

    /** For the search only. Play goes through apply(). */
    _make(move) {
      const u = {
        move: move, piece: this.cells[move.from],
        captured: this.cells[move.to], idle: this.idleMoves
      };
      this.cells[move.to] = u.piece;
      this.cells[move.from] = -1;
      this.idleMoves = u.captured === -1 ? this.idleMoves + 1 : 0;
      return u;
    }

    _unmake(u) {
      this.cells[u.move.from] = u.piece;
      this.cells[u.move.to] = u.captured;
      this.idleMoves = u.idle;
    }

    positionKey() { return this.cells.join(',') + '|' + this.turn; }

    handle(move) {
      const seat = this.turn;
      this._make(move);
      this.lastMove = { from: move.from, to: move.to, seat: seat };
      this.turn = 1 - seat;

      if (!this.legalMoves(this.turn).length) {
        // No legal move loses in xiangqi — there is no stalemate draw.
        this.finish(seat, this.inCheck(this.turn) ? 'checkmate' : 'stalemate');
        return;
      }
      if (this.idleMoves >= 120) { this.finish(null, 'idle'); return; }
      const k = this.positionKey();
      this.positions[k] = (this.positions[k] || 0) + 1;
      if (this.positions[k] >= 3) this.finish(null, 'repetition');
    }

    movesFrom(sq) { return this.legalMoves(this.turn).filter(m => m.from === sq); }

    material(seat) {
      const VAL = [0, 200, 200, 400, 900, 450, 100];
      let n = 0;
      for (let s = 0; s < COLS * ROWS; s++) {
        const p = this.cells[s];
        if (p !== -1 && side(p) === seat) n += VAL[kind(p)];
      }
      return n;
    }

    snapshot() {
      const s = super.snapshot();
      s.lastMove = this.lastMove;
      s.check = this.inCheck(this.turn);
      return s;
    }
  };

  Object.assign(PV.Xiangqi, {
    G: G, A: A, E: E, H: H, C: C, N: N, S: S,
    COLS: COLS, ROWS: ROWS, kind: kind, side: side, inPalace: inPalace
  });

})(window.PV);
