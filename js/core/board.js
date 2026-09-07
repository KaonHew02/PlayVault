/* PlayVault — contract 1 of 3: turn-based board games.

   Serves Chess, 象棋, 五子棋 and 黑白棋. Two seats, strict alternation,
   a list of legal moves, a terminal test.

   Four rules, all enforced here rather than by convention:

   1. Engines never touch the DOM, the profile, or Math.random(). They take a
      seeded PV.RNG and seat descriptors, and answer legalMoves(seat).
   2. legalMoves() is the single source of legality. Views grey their controls
      from it and apply() refuses anything absent from it.
   3. apply() is the only way in. Never call handle() from a test — it walks
      straight past the legality gate, and then the browser finds what the
      headless audit did not.
   4. An affordance must not carry informational fields. Everything on the
      object legalMoves() returns becomes a hard equality test, so a stray
      `hint: 'centre'` makes that move impossible to play. Fields named in
      IGNORED are the documented exceptions.

   A game whose move space is combinatorial should list a compact affordance
   and override isLegal() to validate the actual move. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const IGNORED = ['type', 'label', 'hint', 'min', 'max'];

  PV.BoardGame = class BoardGame {
    /** opts: { cols, rows, seats:[{id,key}], rng, first } */
    constructor(opts) {
      const o = opts || {};
      this.cols = o.cols | 0;
      this.rows = o.rows | 0;
      this.seats = (o.seats || []).map((s, i) => Object.assign({ id: i }, s));
      this.rng = o.rng || new PV.RNG(1);
      this.cells = new Int8Array(this.cols * this.rows).fill(-1);
      this.turn = o.first || 0;
      this.history = [];
      this.over = false;
      this.result = null;              // { winner: seatId|null, reason: string }
    }

    /* ---- board access ---- */
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    at(x, y) { return this.inBounds(x, y) ? this.cells[y * this.cols + x] : -2; }
    put(x, y, v) { this.cells[y * this.cols + x] = v; }
    isEmpty(x, y) { return this.at(x, y) === -1; }

    /* ---- to be provided by the game ---- */
    legalMoves(_seat) { throw new Error('legalMoves() not implemented'); }
    handle(_move) { throw new Error('handle() not implemented'); }

    /* ---- legality ---- */

    /**
     * Default: the move must structurally equal one of this seat's affordances,
     * ignoring the presentational fields in IGNORED. Override for a
     * combinatorial move space.
     */
    isLegal(move) {
      if (this.over || !move) return false;
      const list = this.legalMoves(this.turn) || [];
      return list.some(aff => {
        for (const k of Object.keys(aff)) {
          if (IGNORED.indexOf(k) >= 0) continue;
          if (!PV.deepEqual(aff[k], move[k])) return false;
        }
        return true;
      });
    }

    /** The only way a move enters the engine. Returns whether it was taken. */
    apply(move) {
      if (!this.isLegal(move)) return false;
      const before = this.turn;
      this.handle(move);
      this.history.push(Object.assign({ seat: before }, move));
      return true;
    }

    pass() { this.turn = this.nextSeat(this.turn); }
    nextSeat(from) { return (from + 1) % this.seats.length; }

    finish(winner, reason) {
      this.over = true;
      this.result = { winner: winner == null ? null : winner, reason: reason || '' };
    }

    status() {
      return { over: this.over, turn: this.turn, result: this.result, moves: this.history.length };
    }

    /* ---- snapshots ----
       snapshot() is the host's private truth and carries the RNG state, which
       reproduces the whole game. Only snapshotFor(viewer) is broadcastable.
       Per-viewer fields must be WRITTEN here, never inherited from the host —
       otherwise every guest is told the host's chair is theirs. */

    snapshot() {
      return {
        cols: this.cols, rows: this.rows,
        cells: Array.from(this.cells),
        seats: this.seats.map(s => Object.assign({}, s)),
        turn: this.turn, over: this.over, result: this.result,
        history: this.history.slice(),
        rng: this.rng.state()
      };
    }

    snapshotFor(viewer) {
      const s = this.snapshot();
      delete s.rng;
      s.viewer = viewer;
      s.seats = s.seats.map(seat => Object.assign({}, seat, { isYou: seat.id === viewer }));
      s.yourTurn = this.turn === viewer && !this.over;
      return s;
    }
  };

})(window.PV);
