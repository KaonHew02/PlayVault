/* Chess — engine.

   The full game: castling, en passant, promotion, checkmate, stalemate, the
   fifty-move rule, threefold repetition and insufficient material. Leaving any
   of those out is how a chess game gets a reputation for "not working".

   Encoding: cells hold 0-5 for a white pawn/knight/bishop/rook/queen/king and
   6-11 for the same in black; -1 is empty. Index = rank row * 8 + file, with
   row 0 at the top (black's back rank), so white moves toward smaller indices.

   Move generation is pseudo-legal first, then filtered by actually making each
   move and asking whether our own king is attacked. It is the slow way and the
   correct way, and it removes a whole class of pinned-piece bugs.

   _make/_unmake exist for the search. Play still goes through apply() — the
   legality gate — and nothing outside ai.js may touch them. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const P = 0, N = 1, B = 2, R = 3, Q = 4, K = 5;
  const kind = p => p % 6;
  const side = p => (p < 6 ? 0 : 1);
  const idx = (r, f) => r * 8 + f;
  const rowOf = s => s >> 3;
  const fileOf = s => s & 7;

  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK_RAYS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISHOP_RAYS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  const BACK = [R, N, B, Q, K, B, N, R];
  const PROMOS = ['q', 'r', 'b', 'n'];
  const PROMO_KIND = { q: Q, r: R, b: B, n: N };

  PV.Chess = class Chess extends PV.BoardGame {
    constructor(opts) {
      const o = opts || {};
      super({
        cols: 8, rows: 8, rng: o.rng, first: 0,
        seats: [{ key: 'white' }, { key: 'black' }]
      });
      for (let f = 0; f < 8; f++) {
        this.cells[idx(0, f)] = BACK[f] + 6;
        this.cells[idx(1, f)] = P + 6;
        this.cells[idx(6, f)] = P;
        this.cells[idx(7, f)] = BACK[f];
      }
      this.castling = [true, true, true, true];   // wK, wQ, bK, bQ
      this.ep = -1;
      this.halfmove = 0;
      this.lastMove = null;
      this.positions = Object.create(null);
      this.countPosition();
    }

    /* ---------------------------------------------------------- attacks */

    kingSquare(seat) {
      const want = K + seat * 6;
      for (let s = 0; s < 64; s++) if (this.cells[s] === want) return s;
      return -1;
    }

    /** Is `sq` attacked by `by`? Used for check, castling and legality. */
    attacked(sq, by) {
      const r = rowOf(sq), f = fileOf(sq);
      const base = by * 6;

      // Pawns attack toward the opponent: white (0) upward, black (1) downward.
      const dir = by === 0 ? 1 : -1;
      for (const df of [-1, 1]) {
        const rr = r + dir, ff = f + df;
        if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && this.cells[idx(rr, ff)] === base + P) return true;
      }
      for (const d of KNIGHT) {
        const rr = r + d[0], ff = f + d[1];
        if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && this.cells[idx(rr, ff)] === base + N) return true;
      }
      for (const d of KING) {
        const rr = r + d[0], ff = f + d[1];
        if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && this.cells[idx(rr, ff)] === base + K) return true;
      }
      const rays = [[ROOK_RAYS, R], [BISHOP_RAYS, B]];
      for (const [dirs, sliding] of rays) {
        for (const d of dirs) {
          let rr = r + d[0], ff = f + d[1];
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const p = this.cells[idx(rr, ff)];
            if (p !== -1) {
              if (side(p) === by && (kind(p) === sliding || kind(p) === Q)) return true;
              break;
            }
            rr += d[0]; ff += d[1];
          }
        }
      }
      return false;
    }

    inCheck(seat) {
      const ks = this.kingSquare(seat);
      return ks >= 0 && this.attacked(ks, 1 - seat);
    }

    /* ------------------------------------------------------ generation */

    pseudoMoves(seat) {
      const out = [];
      const push = (from, to, promo) => out.push({ type: 'move', from: from, to: to, promo: promo || null });

      for (let s = 0; s < 64; s++) {
        const p = this.cells[s];
        if (p === -1 || side(p) !== seat) continue;
        const r = rowOf(s), f = fileOf(s), k = kind(p);

        if (k === P) {
          const dir = seat === 0 ? -1 : 1;
          const startRow = seat === 0 ? 6 : 1;
          const lastRow = seat === 0 ? 0 : 7;
          const one = idx(r + dir, f);
          if (r + dir >= 0 && r + dir < 8 && this.cells[one] === -1) {
            if (r + dir === lastRow) for (const pr of PROMOS) push(s, one, pr);
            else {
              push(s, one, null);
              const two = idx(r + dir * 2, f);
              if (r === startRow && this.cells[two] === -1) push(s, two, null);
            }
          }
          for (const df of [-1, 1]) {
            const rr = r + dir, ff = f + df;
            if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
            const to = idx(rr, ff);
            const target = this.cells[to];
            if (target !== -1 && side(target) !== seat) {
              if (rr === lastRow) for (const pr of PROMOS) push(s, to, pr);
              else push(s, to, null);
            } else if (to === this.ep && target === -1) {
              push(s, to, null);
            }
          }
          continue;
        }

        if (k === N || k === K) {
          for (const d of (k === N ? KNIGHT : KING)) {
            const rr = r + d[0], ff = f + d[1];
            if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
            const to = idx(rr, ff);
            const target = this.cells[to];
            if (target === -1 || side(target) !== seat) push(s, to, null);
          }
          if (k === K) this.castleMoves(seat, s, push);
          continue;
        }

        const dirs = k === R ? ROOK_RAYS : (k === B ? BISHOP_RAYS : ROOK_RAYS.concat(BISHOP_RAYS));
        for (const d of dirs) {
          let rr = r + d[0], ff = f + d[1];
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const to = idx(rr, ff);
            const target = this.cells[to];
            if (target === -1) push(s, to, null);
            else { if (side(target) !== seat) push(s, to, null); break; }
            rr += d[0]; ff += d[1];
          }
        }
      }
      return out;
    }

    castleMoves(seat, from, push) {
      const home = seat === 0 ? 7 : 0;
      if (from !== idx(home, 4)) return;
      if (this.inCheck(seat)) return;
      const kSide = seat === 0 ? 0 : 2, qSide = seat === 0 ? 1 : 3;
      const rook = R + seat * 6;

      if (this.castling[kSide] && this.cells[idx(home, 7)] === rook
        && this.cells[idx(home, 5)] === -1 && this.cells[idx(home, 6)] === -1
        && !this.attacked(idx(home, 5), 1 - seat) && !this.attacked(idx(home, 6), 1 - seat)) {
        push(from, idx(home, 6), null);
      }
      if (this.castling[qSide] && this.cells[idx(home, 0)] === rook
        && this.cells[idx(home, 1)] === -1 && this.cells[idx(home, 2)] === -1 && this.cells[idx(home, 3)] === -1
        && !this.attacked(idx(home, 3), 1 - seat) && !this.attacked(idx(home, 2), 1 - seat)) {
        push(from, idx(home, 2), null);
      }
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

    /* ------------------------------------------------------ make/unmake */

    /** For the search only. Play goes through apply(). */
    _make(move) {
      const from = move.from, to = move.to;
      const piece = this.cells[from];
      const seat = side(piece);
      const u = {
        move: move, piece: piece, captured: this.cells[to], capturedAt: to,
        castling: this.castling.slice(), ep: this.ep, half: this.halfmove,
        rookFrom: -1, rookTo: -1
      };

      // En passant: the pawn taken is not on the destination square.
      if (kind(piece) === P && to === this.ep && this.cells[to] === -1) {
        u.capturedAt = to + (seat === 0 ? 8 : -8);
        u.captured = this.cells[u.capturedAt];
        this.cells[u.capturedAt] = -1;
      }

      this.cells[to] = move.promo ? (PROMO_KIND[move.promo] + seat * 6) : piece;
      this.cells[from] = -1;

      if (kind(piece) === K && Math.abs(fileOf(to) - fileOf(from)) === 2) {
        const home = rowOf(from);
        u.rookFrom = fileOf(to) === 6 ? idx(home, 7) : idx(home, 0);
        u.rookTo = fileOf(to) === 6 ? idx(home, 5) : idx(home, 3);
        this.cells[u.rookTo] = this.cells[u.rookFrom];
        this.cells[u.rookFrom] = -1;
      }

      if (kind(piece) === K) { this.castling[seat * 2] = false; this.castling[seat * 2 + 1] = false; }
      const clear = sq => {
        if (sq === idx(7, 7)) this.castling[0] = false;
        else if (sq === idx(7, 0)) this.castling[1] = false;
        else if (sq === idx(0, 7)) this.castling[2] = false;
        else if (sq === idx(0, 0)) this.castling[3] = false;
      };
      clear(from); clear(to);

      this.ep = (kind(piece) === P && Math.abs(rowOf(to) - rowOf(from)) === 2)
        ? idx((rowOf(to) + rowOf(from)) / 2, fileOf(from)) : -1;
      this.halfmove = (kind(piece) === P || u.captured !== -1) ? 0 : this.halfmove + 1;

      return u;
    }

    _unmake(u) {
      const from = u.move.from, to = u.move.to;
      this.cells[from] = u.piece;
      this.cells[to] = -1;
      if (u.captured !== -1) this.cells[u.capturedAt] = u.captured;
      if (u.rookFrom >= 0) {
        this.cells[u.rookFrom] = this.cells[u.rookTo];
        this.cells[u.rookTo] = -1;
      }
      this.castling = u.castling;
      this.ep = u.ep;
      this.halfmove = u.half;
    }

    /* ----------------------------------------------------------- rules */

    positionKey() {
      return this.cells.join(',') + '|' + this.turn + '|' + this.castling.join('') + '|' + this.ep;
    }

    countPosition() {
      const k = this.positionKey();
      this.positions[k] = (this.positions[k] || 0) + 1;
      return this.positions[k];
    }

    /** King versus king, king and a minor, or king and bishop each. */
    insufficientMaterial() {
      const minors = [];
      for (let s = 0; s < 64; s++) {
        const p = this.cells[s];
        if (p === -1) continue;
        const k = kind(p);
        if (k === K) continue;
        if (k === P || k === R || k === Q) return false;
        minors.push({ k: k, dark: ((rowOf(s) + fileOf(s)) & 1) === 1, seat: side(p) });
      }
      if (minors.length <= 1) return true;
      if (minors.length === 2 && minors[0].k === B && minors[1].k === B
        && minors[0].seat !== minors[1].seat && minors[0].dark === minors[1].dark) return true;
      return false;
    }

    handle(move) {
      const seat = this.turn;
      this._make(move);
      this.lastMove = { from: move.from, to: move.to, promo: move.promo || null, seat: seat };
      this.turn = 1 - seat;

      const replies = this.legalMoves(this.turn);
      if (!replies.length) {
        if (this.inCheck(this.turn)) this.finish(seat, 'checkmate');
        else this.finish(null, 'stalemate');
        return;
      }
      if (this.halfmove >= 100) { this.finish(null, 'fifty-move'); return; }
      if (this.insufficientMaterial()) { this.finish(null, 'material'); return; }
      if (this.countPosition() >= 3) { this.finish(null, 'repetition'); return; }
    }

    /* --------------------------------------------------------- helpers */

    /** Moves available from a square, for the view's highlighting. */
    movesFrom(sq) { return this.legalMoves(this.turn).filter(m => m.from === sq); }

    material(seat) {
      const VAL = [1, 3, 3, 5, 9, 0];
      let n = 0;
      for (let s = 0; s < 64; s++) {
        const p = this.cells[s];
        if (p !== -1 && side(p) === seat) n += VAL[kind(p)];
      }
      return n;
    }

    snapshot() {
      const s = super.snapshot();
      s.lastMove = this.lastMove;
      s.castling = this.castling.slice();
      s.ep = this.ep;
      s.check = this.inCheck(this.turn);
      return s;
    }
  };

  PV.Chess.P = P; PV.Chess.N = N; PV.Chess.B = B;
  PV.Chess.R = R; PV.Chess.Q = Q; PV.Chess.K = K;
  PV.Chess.kind = kind;
  PV.Chess.side = side;
  PV.Chess.PROMOS = PROMOS;

})(window.PV);
