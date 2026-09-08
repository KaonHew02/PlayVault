/* Sudoku — engine.

   Sits on the puzzle contract: a deal from a seed, an undo stack the base
   class owns, a timer that stops the moment the grid is solved.

   Every move returns its own inverse. That is the whole of undo — the engine
   never keeps a second copy of the grid, so there is no way for the two to
   drift apart. The inverse carries the pencil marks and the mistake count as
   well as the digit, because undoing a wrong entry should also take back the
   red mark it earned. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.Sudoku = class Sudoku extends PV.PuzzleGame {
    constructor(opts) {
      super(opts);
      this.mistakes = 0;
      this.hintsLeft = (opts && opts.hints != null) ? opts.hints : 3;
      this.deal();
    }

    deal() {
      const made = PV.SudokuGen.make(this.seed, this.difficulty);
      this.solution = made.solution;
      this.given = Uint8Array.from(made.puzzle, v => (v ? 1 : 0));
      this.cells = Int8Array.from(made.puzzle);
      this.notes = new Int16Array(81);        // bit v set == pencil mark v
      this.clues = made.clues;
    }

    isGiven(i) { return this.given[i] === 1; }
    valueAt(i) { return this.cells[i]; }
    noteAt(i, v) { return (this.notes[i] & (1 << v)) !== 0; }
    isWrong(i) { return this.cells[i] !== 0 && this.cells[i] !== this.solution[i]; }

    /**
     * set     { type:'set', i, v }        v 0 erases
     * note    { type:'note', i, v }       toggles one pencil mark
     * restore { type:'restore', i, v, notes, mistakes }   inverse only
     */
    handle(move) {
      if (!move) return null;
      const i = move.i;
      if (!Number.isInteger(i) || i < 0 || i > 80) return null;

      if (move.type === 'restore') {
        this.cells[i] = move.v;
        this.notes[i] = move.notes;
        this.mistakes = move.mistakes;
        return null;                          // an inverse is never itself undone
      }

      if (this.isGiven(i)) return null;
      const inverse = {
        type: 'restore', i: i,
        v: this.cells[i], notes: this.notes[i], mistakes: this.mistakes
      };

      if (move.type === 'note') {
        const v = move.v;
        if (v < 1 || v > 9) return null;
        if (this.cells[i]) return null;       // a filled cell has no pencil marks
        this.notes[i] ^= (1 << v);
        return inverse;
      }

      if (move.type === 'set') {
        const v = move.v | 0;
        if (v < 0 || v > 9) return null;
        if (v === this.cells[i]) return null; // nothing changes, nothing to undo
        this.cells[i] = v;
        this.notes[i] = 0;
        if (v !== 0 && v !== this.solution[i]) this.mistakes++;
        if (v !== 0) this.clearNotesAround(i, v);
        return inverse;
      }

      return null;
    }

    /** Placing a digit rubs out that pencil mark in the row, column and box —
        the bookkeeping every player does by hand anyway. Not undone
        individually; undo restores the whole cell it came from. */
    clearNotesAround(i, v) {
      const r = (i / 9) | 0, c = i % 9;
      const br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
      const bit = ~(1 << v);
      for (let k = 0; k < 9; k++) {
        this.notes[r * 9 + k] &= bit;
        this.notes[k * 9 + c] &= bit;
        this.notes[(br + ((k / 3) | 0)) * 9 + bc + (k % 3)] &= bit;
      }
    }

    /** Fills one empty cell correctly. Costs a hint; counts as a move. */
    hint() {
      if (!this.hintsLeft || this.solved) return null;
      const empty = [];
      for (let i = 0; i < 81; i++) if (!this.isGiven(i) && this.cells[i] !== this.solution[i]) empty.push(i);
      if (!empty.length) return null;
      const i = empty[this.rng.int(empty.length)];
      this.hintsLeft--;
      const before = this.mistakes;
      this.apply({ type: 'set', i: i, v: this.solution[i] });
      this.mistakes = before;                 // a hint is not a mistake
      return i;
    }

    /** Cells the player has filled in wrong. */
    wrongCells() {
      const out = [];
      for (let i = 0; i < 81; i++) if (this.isWrong(i)) out.push(i);
      return out;
    }

    filledCount() {
      let n = 0;
      for (let i = 0; i < 81; i++) if (this.cells[i]) n++;
      return n;
    }

    isSolved() {
      for (let i = 0; i < 81; i++) if (this.cells[i] !== this.solution[i]) return false;
      return true;
    }

    /** Blanks filled in, right or wrong — a race bar, not a correctness check. */
    get progress() {
      let blanks = 0, filled = 0;
      for (let i = 0; i < 81; i++) {
        if (this.given[i]) continue;
        blanks++;
        if (this.cells[i] !== 0) filled++;
      }
      return blanks ? filled / blanks : 1;
    }

    /* ---- resume across reloads ---- */

    snapshot() {
      return {
        seed: this.seed, difficulty: this.difficulty,
        cells: Array.from(this.cells), notes: Array.from(this.notes),
        mistakes: this.mistakes, hintsLeft: this.hintsLeft,
        elapsed: this.elapsedMs, solved: this.solved
      };
    }

    /** The deal is rebuilt from the seed, so a save is only the player's work. */
    static restore(snap) {
      if (!snap || snap.seed == null) return null;
      const g = new Sudoku({ seed: snap.seed, difficulty: snap.difficulty });
      g.cells = Int8Array.from(snap.cells);
      g.notes = Int16Array.from(snap.notes);
      g.mistakes = snap.mistakes | 0;
      g.hintsLeft = snap.hintsLeft | 0;
      g._elapsed = snap.elapsed | 0;
      g.solved = !!snap.solved;
      return g;
    }
  };

})(window.PV);
