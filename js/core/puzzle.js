/* PlayVault — contract 2 of 3: solo puzzles.

   Serves Sudoku, Solitaire and Mahjong Solitaire. One player, a deal built
   from a seed, an undo stack, hints, a timer, a win test.

   There is no opponent and no turn order, so none of the board contract
   applies. What replaces it:

   - The deal is a pure function of (seed, difficulty). Two people who enter
     the same seed get the same puzzle, which is the whole basis for racing a
     friend later: same deal, times compared, nothing to synchronise.
   - apply() returns an inverse move or null. The base class keeps the undo
     stack, so no puzzle has to reimplement undo.
   - The timer belongs here, not in the view, because it has to survive a
     re-render and stop dead the moment the puzzle is solved. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.PuzzleGame = class PuzzleGame {
    /** opts: { seed, difficulty } */
    constructor(opts) {
      const o = opts || {};
      this.seed = (o.seed >>> 0) || PV.newSeed();
      this.difficulty = o.difficulty || 'normal';
      this.rng = new PV.RNG(this.seed);
      this.undoStack = [];
      this.solved = false;
      this._elapsed = 0;
      this._startedAt = 0;
      this._running = false;
    }

    /* ---- to be provided by the puzzle ---- */
    deal() { throw new Error('deal() not implemented'); }
    /** Return an inverse move to make this undoable, or null to refuse. */
    handle(_move) { throw new Error('handle() not implemented'); }
    isSolved() { throw new Error('isSolved() not implemented'); }

    /* ---- moves ---- */

    apply(move) {
      if (this.solved) return false;
      const inverse = this.handle(move);
      if (!inverse) return false;
      this.undoStack.push(inverse);
      if (this.isSolved()) { this.solved = true; this.stop(); }
      return true;
    }

    undo() {
      if (this.solved || !this.undoStack.length) return false;
      const inv = this.undoStack.pop();
      this.handle(inv);          // an inverse is trusted; it came from us
      return true;
    }

    canUndo() { return !this.solved && this.undoStack.length > 0; }

    /* ---- timer ---- */

    start() {
      if (this._running || this.solved) return;
      this._running = true;
      this._startedAt = Date.now();
    }

    stop() {
      if (!this._running) return;
      this._elapsed += Date.now() - this._startedAt;
      this._running = false;
    }

    get elapsedMs() {
      return this._elapsed + (this._running ? Date.now() - this._startedAt : 0);
    }

    get running() { return this._running; }

    /**
     * How far through, 0 to 1. Only a race scoreboard reads it, so the base
     * class answers honestly rather than usefully; a puzzle that wants a
     * moving bar overrides it.
     */
    get progress() { return this.solved ? 1 : 0; }

    /** Shareable puzzle identity: same code, same puzzle, on any device. */
    get shareCode() { return PV.seedToCode(this.seed); }
  };

})(window.PV);
