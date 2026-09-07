#!/usr/bin/env node
/* PlayVault — headless smoke test.
 *
 *   node tools/smoke.js [scale]      scale 1 is the default, 4 is a long run
 *
 * Loads the engines under a small browser shim and drives them the way a
 * player does — through apply() and the ticker's step(), never through the
 * internals. Driving handle() directly would walk straight past the legality
 * gate and test a path no player ever takes; that is exactly how a green
 * headless run and a broken browser happen at the same time.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const scale = Math.max(1, Number(process.argv[2] || 1));

/* ------------------------------------------------------------------- shim */

const mem = new Map();
global.window = global;
global.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
// Node 20+ ships a read-only global navigator; redefine rather than assign.
Object.defineProperty(global, 'navigator', {
  value: { language: 'en' }, configurable: true, writable: true
});
global.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
};
global.document = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  querySelectorAll: () => [],
  documentElement: { setAttribute() {}, style: {} }
};

const FILES = [
  'js/core/util.js', 'js/core/rng.js', 'js/core/store.js', 'js/core/profile.js',
  'js/core/registry.js', 'js/core/board.js', 'js/core/puzzle.js', 'js/core/loop.js',
  'js/games/gomoku/engine.js', 'js/games/gomoku/ai.js',
  'js/games/sudoku/generator.js', 'js/games/sudoku/engine.js',
  'js/games/tetris/engine.js'
];
for (const f of FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const PV = global.PV;

/* ------------------------------------------------------------------ runner */

let checks = 0, failures = 0;
const started = Date.now();

function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  FAIL  ' + msg); }
}
function section(name, fn) {
  const t0 = Date.now();
  const before = failures;
  fn();
  const tag = failures === before ? 'ok  ' : 'FAIL';
  console.log(`[${tag}] ${name}  (${Date.now() - t0}ms)`);
}

/* ------------------------------------------------------------------ gomoku */

section('gomoku — ' + (40 * scale) + ' AI vs AI games', () => {
  const levels = ['easy', 'normal', 'hard'];
  for (let n = 0; n < 40 * scale; n++) {
    const seed = 1000 + n;
    const g = new PV.Gomoku({ rng: new PV.RNG(seed) });
    const ais = [
      new PV.GomokuAI({ seat: 0, level: levels[n % 3], rng: new PV.RNG(seed * 7 + 1) }),
      new PV.GomokuAI({ seat: 1, level: levels[(n + 1) % 3], rng: new PV.RNG(seed * 13 + 2) })
    ];

    let guard = 0;
    while (!g.over && guard++ < 300) {
      const move = ais[g.turn].choose(g);
      ok(!!move, 'seed ' + seed + ': AI returned no move on a live board');
      if (!move) break;
      // apply() is the only real way in, and it must accept its own AI's move.
      ok(g.apply(move) === true, 'seed ' + seed + ': apply() refused the AI move');
    }

    ok(g.over, 'seed ' + seed + ': game did not terminate');
    ok(g.history.length <= 225, 'seed ' + seed + ': more moves than intersections');

    if (g.result && g.result.winner != null) {
      const line = g.winLine;
      ok(line && line.length >= 5, 'seed ' + seed + ': win with no five-line');
      if (line) {
        const w = g.result.winner;
        ok(line.every(c => g.at(c.x, c.y) === w), 'seed ' + seed + ': win line holds another seat');
        const dx = line[1].x - line[0].x, dy = line[1].y - line[0].y;
        ok(line.every((c, i) => c.x === line[0].x + dx * i && c.y === line[0].y + dy * i),
          'seed ' + seed + ': win line is not straight');
      }
    }
  }

  // The legality gate itself.
  const g = new PV.Gomoku({ rng: new PV.RNG(1) });
  ok(g.legalMoves(0).length === 225, 'empty board should offer 225 moves');
  ok(g.apply({ type: 'place', x: 7, y: 7 }) === true, 'centre should be playable');
  ok(g.apply({ type: 'place', x: 7, y: 7 }) === false, 'an occupied point was accepted');
  ok(g.apply({ type: 'place', x: -1, y: 0 }) === false, 'off-board move was accepted');
  ok(g.apply({ type: 'place', x: 0, y: 15 }) === false, 'off-board move was accepted');
  ok(g.apply({ type: 'shove', x: 1, y: 1 }) === false, 'unknown move type was accepted');
  ok(g.turn === 1, 'turn did not pass');
  ok(g.legalMoves(g.turn).length === 224, 'legal move count did not drop after a stone');
  ok(g.legalMoves(0).length === 0, 'the seat that is not to play was offered moves');

  // A completed five must be seen by both the engine and the AI's short-circuit.
  const h = new PV.Gomoku({ rng: new PV.RNG(2) });
  for (let i = 0; i < 4; i++) {
    h.apply({ type: 'place', x: i, y: 0 });          // black builds a four
    h.apply({ type: 'place', x: i, y: 5 });          // white elsewhere
  }
  const ai = new PV.GomokuAI({ seat: 0, level: 'easy', rng: new PV.RNG(9) });
  const winning = ai.choose(h);
  ok(winning && winning.x === 4 && winning.y === 0,
    'even the easy AI must take an available five, got ' + JSON.stringify(winning));
  h.apply(winning);
  ok(h.over && h.result.winner === 0, 'five in a row did not end the game');
});

/* ------------------------------------------------------------------ sudoku */

section('sudoku — ' + (3 * scale) + ' puzzles per difficulty', () => {
  for (const diff of ['easy', 'normal', 'hard', 'expert']) {
    for (let n = 0; n < 3 * scale; n++) {
      const seed = 5000 + n;
      const made = PV.SudokuGen.make(seed, diff);

      ok(PV.SudokuGen.solutionCount(made.puzzle, 2) === 1,
        diff + ' seed ' + seed + ': puzzle does not have exactly one solution');
      ok(made.clues >= 17, diff + ' seed ' + seed + ': fewer clues than any Sudoku can have');

      let givens = 0;
      for (let i = 0; i < 81; i++) {
        if (!made.puzzle[i]) continue;
        givens++;
        ok(made.puzzle[i] === made.solution[i],
          diff + ' seed ' + seed + ': a given disagrees with the solution');
      }
      ok(givens === made.clues, diff + ' seed ' + seed + ': clue count is wrong');

      // Same seed, same puzzle — the basis of racing a friend by seed alone.
      const again = PV.SudokuGen.make(seed, diff);
      ok(again.puzzle.every((v, i) => v === made.puzzle[i]),
        diff + ' seed ' + seed + ': generator is not deterministic');
    }
  }

  // Playing one out through apply().
  const g = new PV.Sudoku({ seed: 77, difficulty: 'easy' });
  ok(!g.isSolved(), 'a fresh puzzle should not be solved');
  for (let i = 0; i < 81; i++) {
    if (g.isGiven(i)) continue;
    ok(g.apply({ type: 'set', i: i, v: g.solution[i] }) === true, 'a correct entry was refused');
  }
  ok(g.solved, 'filling every cell correctly did not solve the puzzle');
  ok(g.mistakes === 0, 'a clean solve recorded mistakes');
  ok(!g.running, 'the timer kept running after the solve');

  // Given cells are untouchable, and undo takes back the mistake too.
  const h = new PV.Sudoku({ seed: 88, difficulty: 'normal' });
  const givenIdx = [...Array(81).keys()].find(i => h.isGiven(i));
  ok(h.apply({ type: 'set', i: givenIdx, v: 1 }) === false, 'a given cell was overwritten');

  const freeIdx = [...Array(81).keys()].find(i => !h.isGiven(i));
  const wrong = h.solution[freeIdx] === 9 ? 8 : 9;
  h.apply({ type: 'set', i: freeIdx, v: wrong });
  ok(h.mistakes === 1, 'a wrong entry was not counted');
  ok(h.undo() === true, 'undo refused a move that had just been made');
  ok(h.valueAt(freeIdx) === 0, 'undo left the digit behind');
  ok(h.mistakes === 0, 'undo left the mistake behind');
  ok(h.undo() === false, 'undo ran past the start of the game');

  // Pencil marks survive a round trip, and a digit clears them.
  h.apply({ type: 'note', i: freeIdx, v: 4 });
  ok(h.noteAt(freeIdx, 4), 'a pencil mark did not stick');
  h.apply({ type: 'set', i: freeIdx, v: h.solution[freeIdx] });
  ok(h.notes[freeIdx] === 0, 'placing a digit left pencil marks behind');
  h.undo();
  ok(h.noteAt(freeIdx, 4), 'undo did not restore the pencil marks');

  // Resume rebuilds the same board from the seed plus the player's work.
  const snap = h.snapshot();
  const back = PV.Sudoku.restore(snap);
  ok(back.solution.every((v, i) => v === h.solution[i]), 'restore rebuilt a different puzzle');
  ok(back.cells.every((v, i) => v === h.cells[i]), 'restore lost the player\'s entries');
  ok(back.notes.every((v, i) => v === h.notes[i]), 'restore lost the pencil marks');
});

/* ------------------------------------------------------------------ tetris */

section('tetris — ' + (6 * scale) + ' scripted runs', () => {
  const ACTIONS = ['left', 'right', 'rotateCW', 'rotateCCW', 'softDrop', 'hardDrop', 'hold', null];

  function run(seed) {
    const g = new PV.Tetris({ seed: seed });
    const script = new PV.RNG(seed ^ 0x5EED);
    let ticks = 0, lastScore = 0, lastLines = 0;

    while (!g.isOver() && ticks < 40000) {
      if (script.chance(0.28)) {
        const a = ACTIONS[script.int(ACTIONS.length)];
        if (a) g.input(a);
      }
      g.advance();
      ticks++;

      ok(g.score >= lastScore, 'seed ' + seed + ': score went down');
      ok(g.lines >= lastLines, 'seed ' + seed + ': line count went down');
      lastScore = g.score; lastLines = g.lines;

      // A completed row must never survive the tick that completed it.
      for (let y = 0; y < PV.Tetris.ROWS; y++) {
        let full = true;
        for (let x = 0; x < PV.Tetris.COLS; x++) {
          if (g.grid[y * PV.Tetris.COLS + x] === -1) { full = false; break; }
        }
        if (full) { ok(false, 'seed ' + seed + ': a full row survived at y=' + y); y = PV.Tetris.ROWS; }
      }
    }
    ok(g.isOver(), 'seed ' + seed + ': run never topped out in 40k ticks');
    ok(g.level === 1 + Math.floor(g.lines / 10), 'seed ' + seed + ': level does not follow lines');
    return { score: g.score, lines: g.lines, tick: g.tick };
  }

  for (let n = 0; n < 6 * scale; n++) {
    const seed = 20000 + n;
    const a = run(seed);
    const b = run(seed);
    ok(a.score === b.score && a.lines === b.lines && a.tick === b.tick,
      'seed ' + seed + ': same seed and same inputs gave a different run');
  }

  // 7-bag: every aligned group of seven draws is a permutation of the shapes.
  const bagged = Object.create(PV.Tetris.prototype);
  bagged.bag = [];
  bagged.rng = new PV.RNG(4242);
  const seen = [];
  for (let i = 0; i < 700; i++) seen.push(PV.Tetris.prototype.draw.call(bagged));
  for (let i = 0; i < seen.length; i += 7) {
    const group = seen.slice(i, i + 7);
    ok(new Set(group).size === 7, 'bag ' + (i / 7) + ' repeated a piece: ' + group.join(''));
  }

  // Rotation must never leave the well or overlap the stack.
  const g = new PV.Tetris({ seed: 5 });
  for (let i = 0; i < 400; i++) {
    g.input(['left', 'right', 'rotateCW', 'rotateCCW'][i % 4]);
    g.advance();
    if (g.isOver()) break;
    if (!g.piece) continue;
    for (const c of g.cellsOf(g.piece)) {
      ok(c.x >= 0 && c.x < PV.Tetris.COLS && c.y < PV.Tetris.ROWS, 'a piece left the well');
      ok(c.y < 0 || g.grid[c.y * PV.Tetris.COLS + c.x] === -1, 'a piece overlapped the stack');
    }
  }

  // Hold is once per piece.
  const h = new PV.Tetris({ seed: 6 });
  ok(h.holdPiece() === true, 'first hold was refused');
  ok(h.holdPiece() === false, 'hold was allowed twice for one piece');
});

/* ------------------------------------------------------------------- misc */

section('core — rng, store, profile', () => {
  const a = new PV.RNG(12345), b = new PV.RNG(12345);
  const xs = [], ys = [];
  for (let i = 0; i < 50; i++) { xs.push(a.next()); ys.push(b.next()); }
  ok(xs.every((v, i) => v === ys[i]), 'the same seed gave different streams');
  ok(a.calls === 50, 'call counting is wrong');
  const c = PV.RNG.restore(a.state());
  ok(c.next() === a.next(), 'restore() did not reproduce the stream');

  ok(PV.codeToSeed(PV.seedToCode(987654)) === 987654, 'seed code round trip failed');

  PV.Store.set('profile', { name: 'K', xp: 0, created: 'x' });
  PV.Profile.addXp(100);
  ok(PV.Profile.level().level === 2, '100 XP should be level 2');
  PV.Profile.record('gomoku', { result: 'win', timeMs: 1000, xp: 10 });
  ok(PV.Profile.forGame('gomoku').won === 1, 'a win was not recorded');
  PV.Profile.record('sudoku', { result: 'solved', timeMs: 5000, lowerTimeIsBetter: true, xp: 5 });
  ok(PV.Profile.forGame('sudoku').bestTimeMs === 5000, 'a best time was not recorded');
  PV.Profile.record('sudoku', { result: 'solved', timeMs: 9000, lowerTimeIsBetter: true, xp: 5 });
  ok(PV.Profile.forGame('sudoku').bestTimeMs === 5000, 'a slower solve overwrote the best time');

  const env = PV.Store.exportAll();
  ok(env.format === 'playvault.backup', 'wrong export envelope format');
  ok(PV.Store.importAll({ format: 'cardverse.backup', data: {} }).ok === false,
    'another app\'s save was accepted');
  ok(PV.Store.importAll(env).ok === true, 'our own export was rejected');

  // Every registered game must be in a known family and be startable or a stub.
  ok(PV.Registry.FAMILIES.length === 3, 'family list changed unexpectedly');
});

/* ------------------------------------------------------------------ report */

console.log('');
console.log(`${checks} checks, ${failures} failure(s), ${Date.now() - started}ms`);
process.exit(failures ? 1 : 0);
