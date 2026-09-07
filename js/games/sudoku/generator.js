/* Sudoku — the generator.

   The generator is the hard part of this game, not the rules. Two things it
   has to guarantee, and only the second one is obvious:

   1. Exactly one solution. A puzzle with two solutions is not a Sudoku — the
      player reaches a guess they cannot justify and blames the game. Every
      removal here is checked by a solver that counts up to two solutions and
      is put back if it finds them.
   2. The same seed gives the same puzzle, on any device, forever. That is what
      makes "race a friend on seed 7K3QF9X" possible later without any server.

   Solving is bitmask + MRV: pick the empty cell with the fewest candidates
   first, which turns an intractable search into a few thousand nodes. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const boxOf = i => (((i / 27) | 0) * 3) + (((i % 9) / 3) | 0);

  function masksFor(grid) {
    const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      const v = grid[i];
      if (!v) continue;
      const bit = 1 << v;
      rows[(i / 9) | 0] |= bit; cols[i % 9] |= bit; boxes[boxOf(i)] |= bit;
    }
    return { rows, cols, boxes };
  }

  /** How many solutions this grid has, counting no further than `limit`. */
  function solutionCount(grid, limit) {
    const g = Int8Array.from(grid);
    const m = masksFor(g);
    let found = 0;

    (function rec() {
      if (found >= limit) return;
      let best = -1, bestUsed = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const used = m.rows[(i / 9) | 0] | m.cols[i % 9] | m.boxes[boxOf(i)];
        let n = 0;
        for (let v = 1; v <= 9; v++) if (!(used & (1 << v))) n++;
        if (n === 0) return;                     // dead end
        if (n < bestCount) { bestCount = n; best = i; bestUsed = used; if (n === 1) break; }
      }
      if (best < 0) { found++; return; }          // no empty cells left

      const r = (best / 9) | 0, c = best % 9, b = boxOf(best);
      for (let v = 1; v <= 9; v++) {
        const bit = 1 << v;
        if (bestUsed & bit) continue;
        g[best] = v; m.rows[r] |= bit; m.cols[c] |= bit; m.boxes[b] |= bit;
        rec();
        g[best] = 0; m.rows[r] &= ~bit; m.cols[c] &= ~bit; m.boxes[b] &= ~bit;
        if (found >= limit) return;
      }
    })();

    return found;
  }

  /** A complete valid grid, built in a seeded order. */
  function fullGrid(rng) {
    const g = new Int8Array(81);
    const m = masksFor(g);
    const order = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    (function rec(i) {
      if (i === 81) return true;
      const r = (i / 9) | 0, c = i % 9, b = boxOf(i);
      const used = m.rows[r] | m.cols[c] | m.boxes[b];
      rng.shuffle(order);
      for (const v of order) {
        const bit = 1 << v;
        if (used & bit) continue;
        g[i] = v; m.rows[r] |= bit; m.cols[c] |= bit; m.boxes[b] |= bit;
        if (rec(i + 1)) return true;
        g[i] = 0; m.rows[r] &= ~bit; m.cols[c] &= ~bit; m.boxes[b] &= ~bit;
      }
      return false;
    })(0);

    return g;
  }

  /** Clue counts. Fewer clues is not automatically harder, but it is close
      enough for a game that also has a hint button. */
  const TARGET = { easy: 45, normal: 34, hard: 29, expert: 25 };

  PV.SudokuGen = {
    TARGET,
    solutionCount,
    fullGrid,

    /** make(seed, 'normal') -> { puzzle, solution, clues } */
    make(seed, difficulty) {
      const rng = new PV.RNG(seed >>> 0);
      const solution = fullGrid(rng);
      const puzzle = Int8Array.from(solution);
      const target = TARGET[difficulty] || TARGET.normal;

      const order = rng.shuffle(Array.from({ length: 81 }, (_, i) => i));
      let clues = 81;

      for (const i of order) {
        if (clues <= target) break;
        const j = 80 - i;                        // 180° partner: symmetric grids read better
        if (!puzzle[i] && !puzzle[j]) continue;
        const bi = puzzle[i], bj = puzzle[j];
        const removing = (bi ? 1 : 0) + (i !== j && bj ? 1 : 0);
        if (!removing) continue;

        puzzle[i] = 0; puzzle[j] = 0;
        if (solutionCount(puzzle, 2) === 1) clues -= removing;
        else { puzzle[i] = bi; puzzle[j] = bj; }
      }

      return { puzzle, solution, clues };
    }
  };

})(window.PV);
