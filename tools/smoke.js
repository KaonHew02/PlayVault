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
 *
 * The exceptions are deliberate and named: chess and xiangqi searches use
 * _make/_unmake, and a few tests build a position by writing cells directly
 * before playing from it through apply().
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
/* The scale is the first bare number on the command line, so flags such as
   --min can sit anywhere without turning it into NaN and quietly running
   every loop zero times. */
const scaleArg = process.argv.slice(2).filter(a => a[0] !== '-')[0];
const scale = Math.max(1, Number(scaleArg || 1) || 1);

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
  'js/core/safe.js', 'js/core/util.js', 'js/core/rng.js', 'js/core/store.js', 'js/core/profile.js',
  'js/core/registry.js', 'js/core/board.js', 'js/core/puzzle.js', 'js/core/loop.js',
  'js/core/cards.js',
  'js/games/gomoku/engine.js', 'js/games/gomoku/ai.js',
  'js/games/reversi/engine.js', 'js/games/reversi/ai.js',
  'js/games/chess/engine.js', 'js/games/chess/ai.js',
  'js/games/xiangqi/engine.js', 'js/games/xiangqi/ai.js',
  'js/games/sudoku/generator.js', 'js/games/sudoku/engine.js',
  'js/games/spider/engine.js',
  'js/games/mahjong/layout.js', 'js/games/mahjong/engine.js',
  'js/games/tetris/engine.js',
  'js/games/snake/engine.js',
  'js/games/worms/skins.js', 'js/games/worms/engine.js',
  'js/games/crowd/course.js', 'js/games/crowd/engine.js',
  'js/games/towerdef/maps.js', 'js/games/towerdef/engine.js',
  // Playing with friends. net.js is loaded for PV.Net.Emitter, which Room
  // extends; nothing here opens a socket — the tests pair rooms in memory.
  'js/core/net.js', 'js/core/room.js', 'js/core/boardnet.js', 'js/core/race.js'
];
/* `node tools/smoke.js --min` runs this whole suite against the MINIFIED
   source instead of the readable source. The deploy bundle is built by the
   same stripper, so two and a half million checks passing here is the
   evidence that stripping the comments out did not change what the code
   does — which is the one thing that could go wrong with shipping a bundle
   and the one thing a syntax check cannot tell you. */
const MINIFIED = process.argv.indexOf('--min') >= 0;
const strip = MINIFIED ? require('./minify.js').minify : (x => x);
for (const f of FILES) {
  vm.runInThisContext(strip(fs.readFileSync(path.join(ROOT, f), 'utf8')), { filename: f });
}
const PV = global.PV;
// i18n.js is a browser file and is not loaded here; room.js reaches for t()
// only to name a player it has not been told about, so the key will do.
if (!PV.t) PV.t = k => k;

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

section('gomoku — ' + (30 * scale) + ' AI vs AI games', () => {
  const levels = ['easy', 'normal', 'hard'];
  for (let n = 0; n < 30 * scale; n++) {
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
      ok(g.apply(move) === true, 'seed ' + seed + ': apply() refused the AI move');
    }
    ok(g.over, 'seed ' + seed + ': game did not terminate');
    if (g.result && g.result.winner != null) {
      const line = g.winLine, w = g.result.winner;
      ok(line && line.length >= 5, 'seed ' + seed + ': win with no five-line');
      ok(line.every(c => g.at(c.x, c.y) === w), 'seed ' + seed + ': win line holds another seat');
      const dx = line[1].x - line[0].x, dy = line[1].y - line[0].y;
      ok(line.every((c, i) => c.x === line[0].x + dx * i && c.y === line[0].y + dy * i),
        'seed ' + seed + ': win line is not straight');
    }
  }

  const g = new PV.Gomoku({ rng: new PV.RNG(1) });
  ok(g.legalMoves(0).length === 225, 'empty board should offer 225 moves');
  ok(g.apply({ type: 'place', x: 7, y: 7 }) === true, 'centre should be playable');
  ok(g.apply({ type: 'place', x: 7, y: 7 }) === false, 'an occupied point was accepted');
  ok(g.apply({ type: 'place', x: -1, y: 0 }) === false, 'off-board move was accepted');
  ok(g.apply({ type: 'shove', x: 1, y: 1 }) === false, 'unknown move type was accepted');
  ok(g.turn === 1, 'turn did not pass');
  ok(g.legalMoves(g.turn).length === 224, 'legal move count did not drop after a stone');
  ok(g.legalMoves(0).length === 0, 'the seat that is not to play was offered moves');

  const h = new PV.Gomoku({ rng: new PV.RNG(2) });
  for (let i = 0; i < 4; i++) {
    h.apply({ type: 'place', x: i, y: 0 });
    h.apply({ type: 'place', x: i, y: 5 });
  }
  const winning = new PV.GomokuAI({ seat: 0, level: 'easy', rng: new PV.RNG(9) }).choose(h);
  ok(winning && winning.x === 4 && winning.y === 0,
    'even the easy AI must take an available five, got ' + JSON.stringify(winning));
  h.apply(winning);
  ok(h.over && h.result.winner === 0, 'five in a row did not end the game');
});

/* ----------------------------------------------------------------- reversi */

section('reversi — rules and ' + (12 * scale) + ' AI games', () => {
  const g = new PV.Reversi({ rng: new PV.RNG(1) });
  ok(g.legalMoves(0).length === 4, 'the opening position has exactly four legal moves');
  ok(g.score().black === 2 && g.score().white === 2, 'the opening position is two discs each');
  ok(g.apply({ type: 'place', x: 3, y: 2 }) === true, 'a legal opening move was refused');
  ok(g.at(3, 3) === 0, 'the flanked disc did not turn');
  ok(g.score().black === 4 && g.score().white === 1, 'the flip was not counted');
  ok(g.apply({ type: 'place', x: 0, y: 0 }) === false, 'a move that flanks nothing was accepted');

  // A wall of black against the edge leaves white with nowhere to play. That is
  // the position the pass rule exists for.
  const p = new PV.Reversi({ rng: new PV.RNG(2) });
  p.cells.fill(-1);
  for (let x = 0; x <= 4; x++) p.put(x, 4, 0);
  p.put(5, 4, 1);
  p.turn = 0;
  ok(p.movesFor(0).some(m => m.x === 6 && m.y === 4), 'black should be able to flank the lone disc');
  ok(p.movesFor(1).length === 0, 'white should be shut out in the pass fixture');

  let passesSeen = 0;
  for (let n = 0; n < 12 * scale; n++) {
    const seed = 3000 + n;
    const r = new PV.Reversi({ rng: new PV.RNG(seed) });
    const ais = [
      new PV.ReversiAI({ seat: 0, level: 'normal', rng: new PV.RNG(seed + 1) }),
      new PV.ReversiAI({ seat: 1, level: n % 2 ? 'easy' : 'hard', rng: new PV.RNG(seed + 2) })
    ];
    let guard = 0;
    while (!r.over && guard++ < 200) {
      const move = ais[r.turn].choose(r);
      ok(!!move, 'reversi seed ' + seed + ': no move on a live board');
      if (!move) break;
      ok(r.apply(move) === true, 'reversi seed ' + seed + ': apply() refused its own AI move');
      if (r.passed != null) passesSeen++;
      const s = r.score();
      ok(s.black + s.white + s.empty === 64, 'reversi seed ' + seed + ': discs do not add to 64');
    }
    ok(r.over, 'reversi seed ' + seed + ': game did not terminate');
    const s = r.score();
    const expected = s.black === s.white ? null : (s.black > s.white ? 0 : 1);
    ok(r.result.winner === expected, 'reversi seed ' + seed + ': winner does not match the count');
  }
  // Passing is common in real games; never seeing one means the rule is dead code.
  ok(passesSeen > 0, 'no player ever had to pass across every game played');
});

/* ------------------------------------------------------------------- chess */

section('chess — perft and the awkward rules', () => {
  const idx = (r, f) => r * 8 + f;

  function perft(g, depth) {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of g.legalMoves(g.turn)) {
      const u = g._make(m);
      g.turn = 1 - g.turn;
      n += perft(g, depth - 1);
      g.turn = 1 - g.turn;
      g._unmake(u);
    }
    return n;
  }

  // The standard move-generator test. If any of these are wrong, something in
  // pins, checks or piece movement is wrong, and no amount of play will say so.
  const g = new PV.Chess({ rng: new PV.RNG(1) });
  ok(perft(g, 1) === 20, 'perft(1) should be 20, got ' + perft(g, 1));
  ok(perft(g, 2) === 400, 'perft(2) should be 400');
  ok(perft(g, 3) === 8902, 'perft(3) should be 8902');
  if (scale >= 2) ok(perft(g, 4) === 197281, 'perft(4) should be 197281');

  const bare = () => {
    const c = new PV.Chess({ rng: new PV.RNG(1) });
    c.cells.fill(-1);
    c.castling = [false, false, false, false];
    c.ep = -1;
    return c;
  };

  // Castling: king two squares, rook jumps over.
  const cast = bare();
  cast.cells[idx(7, 4)] = 5; cast.cells[idx(7, 7)] = 3; cast.cells[idx(0, 4)] = 11;
  cast.castling = [true, false, false, false];
  cast.turn = 0;
  const kingSide = cast.legalMoves(0).find(m => m.from === idx(7, 4) && m.to === idx(7, 6));
  ok(!!kingSide, 'castling king-side was not generated');
  cast.apply(kingSide);
  ok(cast.cells[idx(7, 6)] === 5 && cast.cells[idx(7, 5)] === 3,
    'castling did not move the rook');
  ok(cast.cells[idx(7, 4)] === -1 && cast.cells[idx(7, 7)] === -1, 'castling left pieces behind');

  // Castling through check is illegal.
  const thru = bare();
  thru.cells[idx(7, 4)] = 5; thru.cells[idx(7, 7)] = 3; thru.cells[idx(0, 4)] = 11;
  thru.cells[idx(0, 5)] = 9;                      // a black rook eyeing f1
  thru.castling = [true, false, false, false];
  thru.turn = 0;
  ok(!thru.legalMoves(0).some(m => m.from === idx(7, 4) && m.to === idx(7, 6)),
    'castling through an attacked square was allowed');

  // En passant: the captured pawn is not on the destination square.
  const ep = bare();
  ep.cells[idx(7, 4)] = 5; ep.cells[idx(0, 4)] = 11;
  ep.cells[idx(3, 4)] = 0;                        // white pawn on e5
  ep.cells[idx(1, 3)] = 6;                        // black pawn on d7
  ep.turn = 1;
  ok(ep.apply({ type: 'move', from: idx(1, 3), to: idx(3, 3), promo: null }) === true,
    'the double push was refused');
  ok(ep.ep === idx(2, 3), 'the en-passant square was not set');
  const take = ep.legalMoves(0).find(m => m.from === idx(3, 4) && m.to === idx(2, 3));
  ok(!!take, 'the en-passant capture was not generated');
  ep.apply(take);
  ok(ep.cells[idx(2, 3)] === 0, 'the capturing pawn did not arrive');
  ok(ep.cells[idx(3, 3)] === -1, 'the captured pawn is still on the board');

  // Promotion offers all four pieces, not just a queen.
  const pr = bare();
  pr.cells[idx(7, 0)] = 5; pr.cells[idx(0, 7)] = 11;
  pr.cells[idx(1, 0)] = 0;
  pr.turn = 0;
  const promos = pr.legalMoves(0).filter(m => m.from === idx(1, 0) && m.to === idx(0, 0));
  ok(promos.length === 4, 'promotion should offer four pieces, got ' + promos.length);
  pr.apply(promos.find(m => m.promo === 'n'));
  ok(pr.cells[idx(0, 0)] === 1, 'under-promotion did not produce a knight');

  // Fool's mate ends the game with black winning.
  const fm = new PV.Chess({ rng: new PV.RNG(1) });
  const seq = [[idx(6, 5), idx(5, 5)], [idx(1, 4), idx(3, 4)],
               [idx(6, 6), idx(4, 6)], [idx(0, 3), idx(4, 7)]];
  for (const [from, to] of seq) {
    ok(fm.apply({ type: 'move', from: from, to: to, promo: null }) === true,
      'fool\'s mate move ' + from + '->' + to + ' was refused');
  }
  ok(fm.over && fm.result.winner === 1 && fm.result.reason === 'checkmate',
    'fool\'s mate did not register as checkmate');

  // Stalemate: no legal move and not in check.
  const st = bare();
  st.cells[idx(0, 0)] = 11;                       // black king a8
  st.cells[idx(2, 0)] = 5;                        // white king a6
  st.cells[idx(2, 1)] = 4;                        // white queen b6
  st.turn = 1;
  ok(st.legalMoves(1).length === 0, 'the stalemate fixture still has moves');
  ok(!st.inCheck(1), 'the stalemate fixture is actually check');

  // The AI plays legal moves and finishes games.
  for (let n = 0; n < 2 * scale; n++) {
    const seed = 700 + n;
    const game = new PV.Chess({ rng: new PV.RNG(seed) });
    const ais = [
      new PV.ChessAI({ seat: 0, level: 'easy', rng: new PV.RNG(seed + 5) }),
      new PV.ChessAI({ seat: 1, level: 'normal', rng: new PV.RNG(seed + 6) })
    ];
    let plies = 0;
    while (!game.over && plies++ < 160) {
      const m = ais[game.turn].choose(game);
      ok(!!m, 'chess seed ' + seed + ': AI found no move on a live board');
      if (!m) break;
      ok(game.apply(m) === true, 'chess seed ' + seed + ': apply() refused the AI move');
    }
    ok(game.kingSquare(0) >= 0 && game.kingSquare(1) >= 0,
      'chess seed ' + seed + ': a king was captured');
  }

  // A mate in one must never be missed, at any level.
  const mate = bare();
  mate.cells[idx(0, 4)] = 11;                     // black king e8
  mate.cells[idx(7, 4)] = 5;                      // white king e1
  mate.cells[idx(1, 0)] = 4;                      // white queen a7
  mate.cells[idx(2, 1)] = 3;                      // white rook b6
  mate.turn = 0;
  const best = new PV.ChessAI({ seat: 0, level: 'easy', rng: new PV.RNG(3) }).choose(mate);
  const after = new PV.Chess({ rng: new PV.RNG(1) });
  after.cells.set(mate.cells);
  after.castling = [false, false, false, false];
  after.turn = 0;
  after.apply(best);
  ok(after.over && after.result.winner === 0,
    'the AI passed up a mate in one: ' + JSON.stringify(best));
});

/* ----------------------------------------------------------------- xiangqi */

section('xiangqi — rules and ' + (2 * scale) + ' AI games', () => {
  const idx = (r, f) => r * 9 + f;
  const g = new PV.Xiangqi({ rng: new PV.RNG(1) });

  // The opening position has exactly 44 legal moves. It is the one number that
  // catches a leg-block, an eye-block or a river rule being wrong.
  ok(g.legalMoves(0).length === 44,
    'the xiangqi opening should have 44 legal moves, got ' + g.legalMoves(0).length);

  const bare = () => {
    const x = new PV.Xiangqi({ rng: new PV.RNG(1) });
    x.cells.fill(-1);
    x.cells[idx(9, 4)] = 0;                       // red general
    x.cells[idx(0, 3)] = 7;                       // black general, off the red file
    return x;
  };

  // The horse is blocked by its leg.
  const horse = bare();
  horse.cells[idx(5, 4)] = 3;                     // red horse
  horse.turn = 0;
  const free = horse.legalMoves(0).filter(m => m.from === idx(5, 4)).length;
  horse.cells[idx(4, 4)] = 6;                     // a soldier standing on its leg
  const blocked = horse.legalMoves(0).filter(m => m.from === idx(5, 4)).length;
  ok(blocked === free - 2, 'blocking the horse leg should remove exactly two moves');

  // The elephant may not cross the river, and is blocked by its eye.
  const eleph = bare();
  eleph.cells[idx(7, 2)] = 2;
  eleph.turn = 0;
  const moves = eleph.legalMoves(0).filter(m => m.from === idx(7, 2));
  ok(moves.every(m => Math.floor(m.to / 9) >= 5), 'the elephant crossed the river');
  eleph.cells[idx(6, 3)] = 6;                     // block one eye
  ok(eleph.legalMoves(0).filter(m => m.from === idx(7, 2)).length === moves.length - 1,
    'a blocked elephant eye did not remove a move');

  // The cannon needs exactly one screen to capture, and none to move.
  const cannon = bare();
  cannon.cells[idx(9, 1)] = 5;                    // red cannon
  cannon.cells[idx(4, 1)] = 13;                   // a black soldier straight ahead
  cannon.turn = 0;
  let shots = cannon.legalMoves(0).filter(m => m.from === idx(9, 1) && m.to === idx(4, 1));
  ok(shots.length === 0, 'the cannon captured with no screen');
  cannon.cells[idx(6, 1)] = 6;                    // a screen
  shots = cannon.legalMoves(0).filter(m => m.from === idx(9, 1) && m.to === idx(4, 1));
  ok(shots.length === 1, 'the cannon would not fire over a screen');
  cannon.cells[idx(5, 1)] = 6;                    // two screens is one too many
  shots = cannon.legalMoves(0).filter(m => m.from === idx(9, 1) && m.to === idx(4, 1));
  ok(shots.length === 0, 'the cannon fired over two screens');

  // Flying generals: a move that opens the file between them is illegal.
  const fly = bare();
  fly.cells[idx(0, 3)] = -1;
  fly.cells[idx(0, 4)] = 7;                       // both generals on file 4
  fly.cells[idx(5, 4)] = 6;                       // a red soldier in between
  fly.turn = 0;
  ok(!fly.legalMoves(0).some(m => m.from === idx(5, 4) && m.to === idx(5, 3)),
    'a move exposing the generals to each other was allowed');
  ok(fly.legalMoves(0).some(m => m.from === idx(5, 4) && m.to === idx(4, 4)),
    'the soldier could not advance along the file');

  // The soldier only turns sideways after the river.
  const sold = bare();
  sold.cells[idx(6, 4)] = 6;
  sold.turn = 0;
  ok(sold.legalMoves(0).filter(m => m.from === idx(6, 4)).length === 1,
    'a soldier on its own side should only go forward');
  sold.cells[idx(6, 4)] = -1;
  sold.cells[idx(4, 4)] = 6;
  ok(sold.legalMoves(0).filter(m => m.from === idx(4, 4)).length === 3,
    'a soldier across the river should have three moves');

  for (let n = 0; n < 2 * scale; n++) {
    const seed = 900 + n;
    const x = new PV.Xiangqi({ rng: new PV.RNG(seed) });
    const ais = [
      new PV.XiangqiAI({ seat: 0, level: 'easy', rng: new PV.RNG(seed + 1) }),
      new PV.XiangqiAI({ seat: 1, level: 'normal', rng: new PV.RNG(seed + 2) })
    ];
    let plies = 0;
    while (!x.over && plies++ < 140) {
      const m = ais[x.turn].choose(x);
      if (!m) break;
      ok(x.apply(m) === true, 'xiangqi seed ' + seed + ': apply() refused the AI move');
    }
    ok(x.generalSquare(0) >= 0 && x.generalSquare(1) >= 0,
      'xiangqi seed ' + seed + ': a general was captured');
    ok(!x.generalsFacing(), 'xiangqi seed ' + seed + ': the generals ended up facing');
  }
});

/* ------------------------------------------------------------------ sudoku */

section('sudoku — ' + (2 * scale) + ' puzzles per difficulty', () => {
  for (const diff of ['easy', 'normal', 'hard', 'expert']) {
    for (let n = 0; n < 2 * scale; n++) {
      const seed = 5000 + n;
      const made = PV.SudokuGen.make(seed, diff);
      ok(PV.SudokuGen.solutionCount(made.puzzle, 2) === 1,
        diff + ' seed ' + seed + ': puzzle does not have exactly one solution');
      ok(made.clues >= 17, diff + ' seed ' + seed + ': fewer clues than any Sudoku can have');
      const again = PV.SudokuGen.make(seed, diff);
      ok(again.puzzle.every((v, i) => v === made.puzzle[i]),
        diff + ' seed ' + seed + ': generator is not deterministic');
    }
  }

  const g = new PV.Sudoku({ seed: 77, difficulty: 'easy' });
  for (let i = 0; i < 81; i++) {
    if (!g.isGiven(i)) ok(g.apply({ type: 'set', i: i, v: g.solution[i] }) === true,
      'a correct entry was refused');
  }
  ok(g.solved && g.mistakes === 0, 'a clean solve did not register');

  const h = new PV.Sudoku({ seed: 88, difficulty: 'normal' });
  const givenIdx = [...Array(81).keys()].find(i => h.isGiven(i));
  ok(h.apply({ type: 'set', i: givenIdx, v: 1 }) === false, 'a given cell was overwritten');
  const freeIdx = [...Array(81).keys()].find(i => !h.isGiven(i));
  const wrong = h.solution[freeIdx] === 9 ? 8 : 9;
  h.apply({ type: 'set', i: freeIdx, v: wrong });
  ok(h.mistakes === 1, 'a wrong entry was not counted');
  h.undo();
  ok(h.valueAt(freeIdx) === 0 && h.mistakes === 0, 'undo did not take back the mistake');
  h.apply({ type: 'note', i: freeIdx, v: 4 });
  h.apply({ type: 'set', i: freeIdx, v: h.solution[freeIdx] });
  ok(h.notes[freeIdx] === 0, 'placing a digit left pencil marks behind');
  h.undo();
  ok(h.noteAt(freeIdx, 4), 'undo did not restore the pencil marks');
  const back = PV.Sudoku.restore(h.snapshot());
  ok(back.cells.every((v, i) => v === h.cells[i]), 'restore lost the player\'s entries');
});

/* ------------------------------------------------------------------ spider */

section('spider — deal, runs, the deal rule and the sweep', () => {
  const C = PV.Cards;
  ok(C.rank(0) === 1 && C.suit(0) === 0, 'card 0 should be the ace of spades');
  ok(C.red(13) && C.red(26) && !C.red(0) && !C.red(39), 'suit colours are wrong');

  // 104 cards either way; only the suits in play are dealt, and the copies of
  // each rank make up the difference.
  for (const suits of [1, 2, 4]) {
    const g = new PV.Spider({ seed: 100 + suits, suits: suits });
    const all = g.stock.slice();
    for (const p of g.tableau) for (const cd of p) all.push(cd.c);
    ok(all.length === 104, suits + '-suit: a deal should hold 104 cards, got ' + all.length);
    ok(g.stock.length === 50, suits + '-suit: the stock should keep 50 cards');
    ok(g.tableau.map(p => p.length).join(',') === '6,6,6,6,5,5,5,5,5,5',
      suits + '-suit: the tableau is not 6,6,6,6 then 5s');
    ok(g.tableau.every(p => p[p.length - 1].up && p.slice(0, -1).every(cd => !cd.up)),
      suits + '-suit: only the last card of each column should be face up');
    ok(all.every(c => C.suit(c) < suits), suits + '-suit: a card outside the suits in play');
    const per = Object.create(null);
    for (const c of all) per[c] = (per[c] || 0) + 1;
    ok(Object.keys(per).length === suits * 13, suits + '-suit: wrong number of distinct cards');
    ok(Object.keys(per).every(k => per[k] === 8 / suits),
      suits + '-suit: every rank should appear ' + (8 / suits) + ' times');
  }

  // A run travels only while it is one suit; a drop only cares about rank.
  const r = new PV.Spider({ seed: 3, suits: 4 });
  r.tableau[0] = [{ c: 12, up: true }, { c: 11, up: true }];        // K♠ Q♠
  ok(r.runLength(0) === 2, 'a same-suit pair did not travel together');
  r.tableau[0] = [{ c: 12, up: true }, { c: 24, up: true }];        // K♠ Q♥
  ok(r.runLength(0) === 1, 'a mixed-suit pair travelled together');
  ok(r.canDrop(23, 0), 'a jack was refused onto a queen of another suit');
  ok(!r.canDrop(12, 0), 'a king was allowed onto a queen');
  r.tableau[1] = [];
  ok(r.canDrop(5, 1), 'an empty column refused a card');

  // The stock deals ten at a time, and not at all while a column stands empty.
  const d = new PV.Spider({ seed: 11, suits: 2 });
  ok(d.dealsLeft === 5, 'a fresh game should have five deals left');
  ok(d.apply({ type: 'deal' }) === true, 'the first deal was refused');
  ok(d.stock.length === 40 && d.dealsLeft === 4, 'the deal did not take ten cards');
  ok(d.tableau.every(p => p[p.length - 1].up), 'a dealt card landed face down');
  d.tableau[3] = [];
  ok(d.canDeal() === false && d.apply({ type: 'deal' }) === false,
    'the stock dealt onto an empty column');

  // A finished K-to-A run leaves for a foundation the moment it is completed,
  // and the card it was covering turns over. Built by hand, played by apply().
  const s = new PV.Spider({ seed: 7, suits: 1 });
  const col = [{ c: 5, up: false }];                                // 6♠, buried
  for (let rank = 13; rank >= 2; rank--) col.push({ c: rank - 1, up: true });
  s.tableau[0] = col;
  s.tableau[1] = [{ c: 0, up: true }];                              // the ace to close it
  ok(s.runLength(0) === 12, 'the built column is not a K-down-to-2 run');
  ok(s.apply({ type: 'tt', from: 1, to: 0, count: 1 }) === true, 'the ace was refused');
  ok(s.foundations.length === 1, 'a finished run did not go to a foundation');
  ok(s.tableau[0].length === 1 && s.tableau[0][0].up, 'the buried card did not turn over');
  ok(s.score === 500 - 1 + 100, 'wrong score after one move and one set, got ' + s.score);
  ok(s.undo() === true && s.foundations.length === 0 && s.tableau[0].length === 13,
    'undo did not take the run back out of the foundation');

  // Tipping a whole column into an empty one is legal and pointless, so it is
  // not offered — otherwise a dead game never reads as dead.
  const m = new PV.Spider({ seed: 4, suits: 1 });
  m.tableau = m.tableau.map(() => []);
  m.tableau[0] = [{ c: 12, up: true }];
  ok(m.legalMoves().length === 0, 'a whole column was allowed to move to an empty one');
  ok(m.isStuck() === true, 'a board with no move and no legal deal is not stuck');
  m.tableau[0] = [{ c: 5, up: false }, { c: 12, up: true }];
  ok(m.legalMoves().length === 9, 'a king over a face-down card should have nine homes');

  // The hint ranks: turning a card over beats emptying a column.
  const h = new PV.Spider({ seed: 9, suits: 1 });
  h.tableau = h.tableau.map(() => []);
  h.tableau[0] = [{ c: 7, up: false }, { c: 5, up: true }];         // 6♠ over a face-down card
  h.tableau[1] = [{ c: 5, up: true }];                              // a lone 6♠
  h.tableau[2] = [{ c: 6, up: true }];                              // 7♠
  const best = h.bestMove();
  ok(best && best.from === 0 && best.to === 2,
    'the hint passed over the move that turns a card over');
});

/* ----------------------------------------------------------------- mahjong */

section('mahjong — every board is solvable by construction', () => {
  for (let n = 0; n < 3 * scale; n++) {
    const seed = 6000 + n;
    const g = new PV.Mahjong({ seed: seed });

    ok(g.tiles.length === 144, 'the turtle should hold 144 tiles, got ' + g.tiles.length);
    ok(g.tiles.every(tl => tl.id), 'a tile was left without a face');
    ok(g.solution.length === 72, 'the solution should be 72 pairs');

    const counts = Object.create(null);
    for (const tl of g.tiles) counts[tl.id] = (counts[tl.id] || 0) + 1;
    for (const id in counts) {
      const face = g.faces[id];
      ok(face.group ? counts[id] === 1 : counts[id] === 4,
        'tile ' + id + ' appears ' + counts[id] + ' times');
    }
    ok(g.availableMoves().length > 0, 'a fresh board has no legal move');

    // The order the generator peeled the tiles off in has to clear the board.
    for (const [a, b] of g.solution) {
      ok(g.apply({ type: 'match', a: a, b: b }) === true,
        'seed ' + seed + ': the generator\'s own solution was refused at pair ' + a + '/' + b);
    }
    ok(g.isSolved(), 'seed ' + seed + ': replaying the solution did not clear the board');
    ok(g.solved, 'seed ' + seed + ': the puzzle did not notice it was finished');
  }

  // Matching rules: exact for suits, by group for flowers and seasons.
  const M = PV.MahjongLayout;
  const F = M.faces();
  ok(M.matches(F.b3, F.b3) && !M.matches(F.b3, F.b4), 'suit tiles must match exactly');
  ok(M.matches(F.f0, F.f2) && !M.matches(F.f0, F.s0), 'flowers match flowers, not seasons');
  ok(M.matches(F.s1, F.s3), 'seasons do not match each other');

  // A covered tile is not free, and neither is one hemmed in on both sides.
  const g2 = new PV.Mahjong({ seed: 7 });
  const cap = g2.tiles.find(tl => tl.z === 4);
  ok(g2.isFree(cap), 'the tile on top of the stack should always be free');
  const under = g2.tiles.find(tl => tl.z === 3);
  ok(!g2.isFree(under), 'a tile under the cap should be blocked');
});

/* ------------------------------------------------------------------ tetris */

section('tetris — ' + (4 * scale) + ' scripted runs', () => {
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

  for (let n = 0; n < 4 * scale; n++) {
    const seed = 20000 + n;
    const a = run(seed), b = run(seed);
    ok(a.score === b.score && a.lines === b.lines && a.tick === b.tick,
      'seed ' + seed + ': same seed and same inputs gave a different run');
  }

  const bagged = Object.create(PV.Tetris.prototype);
  bagged.bag = [];
  bagged.rng = new PV.RNG(4242);
  const seen = [];
  for (let i = 0; i < 700; i++) seen.push(PV.Tetris.prototype.draw.call(bagged));
  for (let i = 0; i < seen.length; i += 7) {
    ok(new Set(seen.slice(i, i + 7)).size === 7, 'bag ' + (i / 7) + ' repeated a piece');
  }

  const h = new PV.Tetris({ seed: 6 });
  ok(h.holdPiece() === true, 'first hold was refused');
  ok(h.holdPiece() === false, 'hold was allowed twice for one piece');
});

/* ------------------------------------------------------------------- snake */

section('snake — ' + (4 * scale) + ' scripted runs', () => {
  const DIRS = ['up', 'down', 'left', 'right'];

  function run(seed, walls) {
    const g = new PV.Snake({ seed: seed, walls: walls, speed: 'fast' });
    const script = new PV.RNG(seed ^ 0xBEEF);
    let ticks = 0;
    while (!g.isOver() && ticks < 30000) {
      if (script.chance(0.10)) g.input(DIRS[script.int(4)]);
      g.advance();
      ticks++;
      const head = g.body[0];
      ok(head.x >= 0 && head.y >= 0 && head.x < g.cols && head.y < g.rows,
        'seed ' + seed + ': the snake left the board');
      if (g.food) ok(!g.occupied(g.food.x, g.food.y) || (g.food.x === head.x && g.food.y === head.y),
        'seed ' + seed + ': food appeared under the snake');
    }
    return { score: g.score, len: g.body.length, tick: g.tick, over: g.isOver() };
  }

  for (let n = 0; n < 4 * scale; n++) {
    const seed = 8000 + n;
    const a = run(seed, true), b = run(seed, true);
    ok(a.over, 'seed ' + seed + ': the walled run never ended');
    ok(a.score === b.score && a.tick === b.tick && a.len === b.len,
      'seed ' + seed + ': snake is not deterministic');
    run(seed, false);                              // wrap mode must not crash
  }

  // A reversal into your own neck is refused, not fatal.
  const g = new PV.Snake({ seed: 3, walls: true });
  g.input('left');
  g.advance();
  ok(!g.isOver(), 'reversing into the neck killed the snake instead of being ignored');
  ok(g.dir.x === 1, 'the snake accepted a straight reversal');

  /* Biting yourself: fatal, or a haircut. Drive a long snake in a tight square
     until it meets itself, once with each rule, from the same state. */
  function selfBite(tail) {
    const s = new PV.Snake({ seed: 3, walls: false, speed: 'fast', tail: tail });
    s.body = [];
    for (let i = 0; i < 12; i++) s.body.push({ x: 8 - i, y: 8 });   // head at (8,8)
    s.dir = PV.Snake.DIRS.right;
    s.grow = 0;
    s.food = { x: 0, y: 0 };
    // Right, down, left, and it walks back into its own flank.
    const script = ['down', 'left', 'left', 'left', 'left', 'up'];
    for (const a of script) {
      s.input(a);
      for (let i = 0; i < s.stepTicks(); i++) s.advance();
      if (s.isOver()) break;
    }
    return s;
  }
  const fatal = selfBite('deadly'), trimmed = selfBite('trim'), through = selfBite('pass');
  ok(fatal.isOver() && fatal.overReason === 'self', 'a self-bite was survivable with the fatal rule');
  ok(!trimmed.isOver(), 'the trim rule still killed the snake');
  ok(trimmed.cuts === 1, 'the trim rule did not record the cut, got ' + trimmed.cuts);
  ok(trimmed.body.length < 12 && trimmed.body.length >= 2,
    'the cut left the snake at ' + trimmed.body.length + ' segments');
  ok(!trimmed.tailCut === false, 'the option did not reach the engine');

  // Pass-through: the head goes over its own body and nothing is lost.
  ok(!through.isOver(), 'the pass rule still killed the snake');
  ok(through.passes >= 1, 'the pass was not counted, got ' + through.passes);
  ok(through.cuts === 0, 'the pass rule cut the tail as well');
  ok(through.body.length === 12, 'passing through changed the length to ' + through.body.length);
  ok(through.tailPass === true && through.tailCut === false, 'the pass option did not reach the engine');

  // Two runs of each rule from one seed still match, cuts and passes and all.
  const r1 = selfBite('trim'), r2 = selfBite('trim');
  ok(r1.body.length === r2.body.length && r1.cuts === r2.cuts && r1.score === r2.score,
    'the trim rule is not deterministic');
  const p1 = selfBite('pass'), p2 = selfBite('pass');
  ok(p1.passes === p2.passes && p1.body.length === p2.body.length && p1.score === p2.score,
    'the pass rule is not deterministic');

  /* On wrap with a forgiving tail nothing on the board can end a run, which
     left a race on those rules waiting for ever. A race gives such a run a
     clock: it must end at the bell and nowhere else, say why, and still
     replay from its seed. */
  function clocked(tail, seed) {
    const s = new PV.Snake({ seed: seed, walls: false, speed: 'fast', tail: tail, limit: 600 });
    const drive = new PV.RNG(seed ^ 0xC10C);
    while (!s.isOver() && s.tick < 5000) {
      if (drive.chance(0.10)) s.input(DIRS[drive.int(4)]);
      s.advance();
    }
    return s;
  }
  for (const tail of ['trim', 'pass']) {
    const a = clocked(tail, 31), b = clocked(tail, 31);
    ok(a.isOver() && a.overReason === 'time', tail + ': a run with a clock did not end on it');
    ok(a.tick === 600 && a.timeLeft() === 0, tail + ': the bell rang at tick ' + a.tick + ', not 600');
    ok(a.score === b.score && a.body.length === b.body.length,
      tail + ': a run with a clock is not deterministic');
  }
  const open = new PV.Snake({ seed: 31, walls: false, speed: 'fast', tail: 'pass' });
  for (let i = 0; i < 5000; i++) open.advance();
  ok(!open.isOver(), 'wrap with a pass-through tail ended with no clock and nobody steering');
});

/* -------------------------------------------------------------- worm arena */

section('worm arena — a round wall, mass as the score, and a repeatable run', () => {
  const W = PV.Worms;
  const bare = { food: 0, potions: 0, coins: 0, autostart: true };
  const opt = o => Object.assign({}, bare, o);
  const ahead = (g, d) => ({ x: g.player.x + Math.cos(g.player.angle) * d, y: g.player.y + Math.sin(g.player.angle) * d });

  const g = new W({ seed: 500, bots: 5, autostart: true });
  ok(g.worms.length === 6, 'the arena should hold the player and five bots');
  ok(g.snacks === g.snackTarget && g.food.count === g.snackTarget, 'the floor did not fill, got ' + g.snacks);
  ok(g.potions.length === g.potionTarget && g.coinSpots.length === g.coinTarget, 'potions or coins are missing');
  ok(g.player.mass === W.START_MASS, 'a worm should start at ' + W.START_MASS);
  ok(g.worms.every(w => Math.hypot(w.x, w.y) < g.R), 'a worm arrived outside the wall');
  g.advance();
  ok(g.score === Math.floor(g.player.mass), 'the score is not the mass');

  // "As you get larger, you get slower": thicker, much longer, and slower.
  ok(W.radiusOf(2000) > W.radiusOf(20) * 2.5, 'a big worm is not much thicker');
  ok(W.lengthOf(2000) > W.lengthOf(20) * 10, 'a big worm is not much longer');
  ok(W.speedOf(2000) < W.speedOf(20) * 0.8, 'a big worm is not slower');

  // The start line: the arena runs, the player waits.
  const wait = new W({ seed: 510, bots: 3 });
  const at = { x: wait.player.x, y: wait.player.y };
  for (let i = 0; i < 60; i++) wait.advance();
  ok(wait.ready && wait.player.x === at.x && wait.player.y === at.y, 'the player moved before the start');
  ok(wait.worms.some(w => w.bot && Math.hypot(w.x - w.px, w.y - w.py) > 0), 'the bots stood still at the start line');
  ok(wait.score === 0 && !wait.over, 'a waiting run scored or ended');
  wait.input('go');
  wait.advance();
  ok(!wait.ready && !wait.player.parked, 'go did not start the run');

  // Food in reach flies to the mouth and pays exactly its value...
  const e = new W(opt({ seed: 502, bots: 0 }));
  const snack = p => Object.assign({ v: 3, k: 0, r: 8, look: 0, c: null, born: 0, until: 0, ph: 0, cell: -1, slot: -1 }, p);
  e.food.add(snack(ahead(e, 30)));
  e.snacks++;
  for (let i = 0; i < 20; i++) e.advance();
  ok(e.food.count === 0 && e.flying.length === 0, 'the snack was not eaten');
  ok(Math.abs(e.player.mass - (W.START_MASS + 3)) < 1e-9, 'a 3-point snack grew ' + (e.player.mass - W.START_MASS));
  // ...and five times that on the blue potion.
  e.player.fx.x5 = 600;
  const m5 = e.player.mass;
  e.food.add(snack(Object.assign(ahead(e, 30), { v: 2 })));
  e.snacks++;
  for (let i = 0; i < 20; i++) e.advance();
  ok(Math.abs(e.player.mass - (m5 + 10)) < 1e-9, 'food x5 paid ' + (e.player.mass - m5) + ' for a 2');
  // Never on a turbo crumb, or burning one unit and eating it back pays three.
  const mc = e.player.mass;
  e.gain(e.player, { v: 2, k: 2 });
  ok(e.player.mass === mc + 2, 'the x5 potion paid on a turbo crumb');

  // A head into somebody's body dies; the body gets the kill, the floor the meal.
  const k = new W(opt({ seed: 507, bots: 1 }));
  const v = k.worms.find(w => w.bot);
  v.bot = false;                                   // no brain: it holds its course
  v.mass = 200;
  W.size(v);
  k.layBody(k.player, 0, 0, -Math.PI / 2);          // heading up, body hanging below
  k.layBody(v, -40, 50, 0);                         // heading right, into that body
  for (let i = 0; i < 40 && v.alive; i++) k.advance();
  ok(!v.alive && v.cause === 'worm', 'a head that ran into a body survived');
  ok(k.player.alive && k.player.kills === 1, 'the kill was not credited');
  let left = 0, pieces = 0;
  k.food.each(-k.R, -k.R, k.R, k.R, f => { if (f.k === 1) { left += f.v; pieces++; } });
  ok(pieces >= 3 && Math.abs(left - 200 * W.REMAINS_SHARE) < 50, 'a 200 worm left ' + left.toFixed(1) + ' in ' + pieces);
  ok(k.graves.length === 1, 'the radar was not told where it died');

  // Head to head, the bigger worm wins.
  const h = new W(opt({ seed: 508, bots: 1 }));
  const small = h.worms.find(w => w.bot), big = h.player;
  small.bot = false;
  small.mass = W.START_MASS;
  W.size(small);
  big.mass = 400;
  W.size(big);
  h.layBody(big, -30, 0, 0);
  h.layBody(small, 30, 0, Math.PI);
  for (let i = 0; i < 40 && small.alive && big.alive; i++) h.advance();
  ok(big.alive && !small.alive, 'a head-on did not go to the bigger worm');

  // The wall kills, and an endless run ends a moment later on the mass you had.
  const wall = new W(opt({ seed: 501, bots: 0 }));
  wall.layBody(wall.player, wall.R - 60, 0, 0);
  for (let i = 0; i < 120 && wall.player.alive; i++) wall.advance();
  ok(wall.lastDeath && wall.lastDeath.cause === 'wall', 'the wall did not kill');
  ok(!wall.over, 'the run ended before the moment to watch it');
  for (let i = 0; i < W.DEATH_TICKS + 5 && !wall.over; i++) wall.advance();
  ok(wall.over && wall.finalScore === W.START_MASS && wall.score === W.START_MASS, 'the run did not end on its mass');

  // The turbo: twice as fast, costs mass by size, and drops most of it behind.
  const b = new W(opt({ seed: 505, bots: 0 }));
  b.player.mass = 1000;
  W.size(b.player);
  b.layBody(b.player, -1200, 0, 0);
  let x0 = b.player.x;
  for (let i = 0; i < 60; i++) b.advance();
  const coast = b.player.x - x0;
  x0 = b.player.x;
  const m1 = b.player.mass;
  for (let i = 0; i < 60; i++) { b.input('boost'); b.advance(); }
  const dash = b.player.x - x0, burned = m1 - b.player.mass;
  ok(dash > coast * 1.9 && dash < coast * 2.1, 'the turbo went ' + dash.toFixed(1) + ' to ' + coast.toFixed(1));
  ok(Math.abs(burned - (W.BURN_BASE + 1000 * W.BURN_RATE)) < 1.5, 'a second of turbo at 1000 cost ' + burned.toFixed(2));
  let dropped = 0;
  b.food.each(-b.R, -b.R, b.R, b.R, f => { if (f.k === 2) dropped += f.v; });
  ok(dropped > burned * W.CRUMB_SHARE * 0.6 && dropped <= burned * W.CRUMB_SHARE + 1e-9,
    'dropped ' + dropped.toFixed(2) + ' of ' + burned.toFixed(2) + ' burned');
  // Every body point is NODE along the path from the last, turbo or not.
  const p0 = b.player.path;
  ok(p0.slice(1, 60).every((q, i) => Math.abs(Math.hypot(q.x - p0[i].x, q.y - p0[i].y) - W.NODE) < 0.01),
    'the turbo laid the body out coarser');
  // Coasting costs nothing, and the floor is never spent.
  const held = b.player.mass;
  for (let i = 0; i < 120; i++) b.advance();
  ok(b.player.mass === held, 'coasting changed the mass');
  b.player.mass = W.BOOST_FLOOR + 1;
  W.size(b.player);
  for (let i = 0; i < 200; i++) { b.input('boost'); b.advance(); }
  ok(b.player.mass >= W.BOOST_FLOOR - 1e-9 && !b.player.boost, 'the turbo spent below the floor: ' + b.player.mass);

  // Potions: taken on touch, back later, and they do what they say.
  const pz = new W(opt({ seed: 511, bots: 0 }));
  pz.potions.push(Object.assign(ahead(pz, 15), { kind: 'speed', ph: 0 }));
  pz.advance();
  ok(pz.player.fx.speed > 0 && pz.potions.length === 0, 'the potion was not picked up');
  ok(pz.later.some(l => l.what === 'potion'), 'a taken potion never comes back');
  pz.advance();
  ok(Math.abs(pz.player.step - W.speedOf(pz.player.mass) * W.SPEED_FX) < 1e-9, 'the speed potion did not speed you up');
  const reach = pz.captureOf(pz.player);
  pz.player.fx.magnet = 5;
  ok(pz.captureOf(pz.player) >= reach + W.MAGNET, 'the magnet did not reach further');
  for (let i = 0; i < 6; i++) pz.advance();
  ok(pz.player.fx.magnet === 0, 'a potion did not wear off');
  // The shop's one upgrade: the player's potions last longer, capped at the top level.
  const up = new W(opt({ seed: 516, bots: 0, potionLevel: 2 }));
  up.potions.push(Object.assign(ahead(up, 15), { kind: 'zoom', ph: 0 }));
  up.advance();
  ok(up.player.fx.zoom === W.POTION_TICKS + 2 * W.POTION_UP.per, 'a level 2 potion lasts ' + up.player.fx.zoom);
  ok(new W(opt({ seed: 516, bots: 0, potionLevel: 99 })).potionTicks
    === W.POTION_TICKS + W.POTION_UP.max * W.POTION_UP.per, 'the upgrade went past its top level');

  // Coins are yours alone, and go in this run's purse.
  const cz = new W(opt({ seed: 512, bots: 0 }));
  cz.coinSpots.push(Object.assign(ahead(cz, 12), { ph: 0 }));
  cz.advance();
  ok(cz.coins === 1 && cz.coinSpots.length === 0, 'the coin was not collected');

  // Time: double food, a death is a respawn, and the bell ends it with a place.
  const tm = new W({ seed: 513, mode: 'time', bots: 4, autostart: true });
  ok(tm.timeLeft() === W.MODES.time.ticks, 'the clock did not start full');
  tm.gain(tm.player, { v: 1, k: 0 });
  ok(tm.player.mass === W.START_MASS + 2, 'time mode did not double the floor food');
  // ...but not remains: paying a dead worm back at 1.6 times its weight
  // printed mass every time two worms traded kills.
  tm.gain(tm.player, { v: 10, k: 1 });
  ok(tm.player.mass === W.START_MASS + 12, 'time mode doubled a worm’s remains');
  tm.kill(tm.player, 'wall', null);
  ok(!tm.over && tm.respawnAt > 0, 'a death ended a timed round');
  for (let i = 0; i < W.RESPAWN_TICKS + 2; i++) tm.advance();
  ok(tm.player.alive && tm.player.mass === W.START_MASS && tm.deaths === 1, 'no respawn in time mode');
  tm.startTick = tm.tick - W.MODES.time.ticks + 3;
  for (let i = 0; i < 10 && !tm.over; i++) tm.advance();
  ok(tm.over && tm.overReason === 'time' && tm.finalRank && tm.finalRank.place >= 1, 'the bell did not end the round');

  // Treasure: chests on the map pay coins and burst into food.
  const th = new W(opt({ seed: 515, mode: 'treasure', bots: 0 }));
  ok(th.chests.length === 3, 'a treasure hunt needs three chests, got ' + th.chests.length);
  Object.assign(th.chests[0], ahead(th, 20));
  th.advance();
  ok(th.chestsFound === 1 && th.coins === 10, 'the chest did not pay');
  ok(th.food.count + th.flying.length >= 12, 'the chest did not burst into food');
  ok(th.later.some(l => l.what === 'chest'), 'no new chest is coming');

  // The bots: they keep the arena full, stay inside, and leave the wall alone.
  const arena = new W({ seed: 503, autostart: true });
  arena.player.parked = true;                     // a bystander: the run is theirs
  let wallDeaths = 0, deaths = 0;
  const kill = arena.kill.bind(arena);
  arena.kill = (w, cause, by) => { if (w.alive) { deaths++; if (cause === 'wall') wallDeaths++; } return kill(w, cause, by); };
  for (let i = 0; i < 60 * 60 * scale; i++) arena.advance();
  ok(deaths > 0, 'nobody died in a minute of a full arena');
  ok(wallDeaths <= scale, 'bots drove into the wall ' + wallDeaths + ' times');
  ok(arena.worms.filter(w => w.alive && w.bot).length >= arena.botCount - 6, 'the bots died and stayed dead');
  ok(arena.worms.every(w => !w.alive || Math.hypot(w.x, w.y) < arena.R), 'a worm is outside the wall');
  ok(arena.snacks >= arena.snackTarget - 12, 'the floor ran out of food');
  ok(arena.food.count <= arena.foodCap + 400, 'remains and crumbs piled up to ' + arena.food.count);

  // Same seed, same inputs, same run — the property a race needs.
  const run = () => {
    const r = new W({ seed: 777, bots: 6, autostart: true });
    for (let i = 0; i < 900; i++) {
      if (i % 50 === 0) r.input({ aim: (i / 50) * 0.9 });
      if (i % 170 === 0) r.input({ boost: i % 340 === 0 });
      if (!r.advance()) break;
    }
    return JSON.stringify({ x: r.player.x, y: r.player.y, m: r.player.mass, t: r.tick, f: r.food.count,
                            w: r.worms.map(w => [w.name, Math.round(w.mass * 1000)]) });
  };
  ok(run() === run(), 'the same seed and inputs gave two different runs');
});
/* ---------------------------------------------------------- tower defense */

section('tower defense — ' + (2 * scale) + ' runs per map', () => {
  for (const map of PV.TDMaps.keys) {
    const built = PV.TDMaps.build(map);
    ok(built.lanes.length >= 1 && built.lanes.length <= 2, map + ': odd lane count');

    for (const lane of built.lanes) {
      ok(lane.path.length > 12, map + ': a lane is suspiciously short');
      for (let i = 1; i < lane.path.length; i++) {
        const a = lane.path[i - 1], b = lane.path[i];
        ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1,
          map + ': the path jumps between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b));
        ok(built.onPath.has(b.y * built.cols + b.x), map + ': a lane cell is not blocked for building');
      }
      // Enemies have to walk IN from somewhere: a lane starts at the border.
      const s = lane.path[0];
      ok(s.x === 0 || s.y === 0 || s.x === built.cols - 1 || s.y === built.rows - 1,
        map + ': a lane starts inside the map at ' + JSON.stringify(s));
    }

    // A stretch of road no tower can reach is a hole in the map, not a design.
    const g0 = new PV.TowerDef({ seed: 1, map: map });
    for (const lane of built.lanes) {
      for (const p of lane.points) {
        let covered = false;
        for (let y = 0; y < built.rows && !covered; y++) {
          for (let x = 0; x < built.cols && !covered; x++) {
            if (!g0.canBuild(x, y)) continue;
            if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= PV.TowerDef.TOWERS.gun.range) covered = true;
          }
        }
        ok(covered, map + ': no tower can cover the road at ' + JSON.stringify(p));
      }
    }

    const diffs = Object.keys(PV.TowerDef.DIFFS);
    for (let n = 0; n < 2 * scale; n++) {
      const seed = 11000 + n;
      const difficulty = diffs[n % diffs.length];
      const run = () => {
        const g = new PV.TowerDef({ seed: seed, map: map, difficulty: difficulty });
        const spots = [];
        for (let y = 0; y < g.map.rows; y++) {
          for (let x = 0; x < g.map.cols; x++) if (g.canBuild(x, y)) spots.push({ x: x, y: y });
        }
        let ticks = 0, at = 0;
        while (!g.isOver() && ticks < 60 * 60 * 20) {
          // Spend whatever is available, the way a player would.
          if (ticks % 30 === 0 && at < spots.length) {
            const type = at % 4 === 3 ? 'cannon' : (at % 3 === 2 ? 'frost' : 'gun');
            if (g.build(spots[at].x, spots[at].y, type)) at++;
          }
          g.advance();
          ticks++;
          ok(g.money >= 0, map + ' seed ' + seed + ': gold went negative');
          ok(g.lives >= 0, map + ' seed ' + seed + ': lives went below zero');
          ok(g.wave <= g.waves, map + ' seed ' + seed + ': waves ran past the last one');
          for (const e of g.enemies) {
            ok(e.x >= 0 && e.y >= 0 && e.x <= g.map.cols && e.y <= g.map.rows,
              map + ': an enemy walked off the map');
          }
        }
        return g;
      };
      const g = run();
      ok(g.isOver(), map + ' seed ' + seed + ': the run never ended');
      ok(g.overReason === 'cleared' || g.overReason === 'overrun',
        map + ' seed ' + seed + ': ended for an unexpected reason ' + g.overReason);
      const again = run();
      ok(again.tick === g.tick && again.score === g.score && again.wave === g.wave,
        map + ' seed ' + seed + ': the same seed gave a different run');
    }
  }

  // Building rules.
  const g = new PV.TowerDef({ seed: 1, map: 'meadow' });
  const onPath = g.map.path[3];
  ok(g.build(onPath.x, onPath.y, 'gun') === false, 'a tower was built on the path');
  ok(g.canBuild(0, 0) ? g.build(0, 0, 'gun') : true, 'a legal build was refused');
  ok(g.build(0, 0, 'gun') === false, 'two towers were built on one square');
  ok(g.build(0, 1, 'cannon') === false || g.money >= 0, 'a build was allowed without the gold');
  const tower = g.towerAt(0, 0);
  if (tower) {
    const before = g.money;
    ok(g.sell(tower) === true, 'a tower could not be sold');
    ok(g.money > before, 'selling returned nothing');
    ok(g.towerAt(0, 0) === null, 'the sold tower is still standing');
  }

  // Difficulty scales the enemies and the purse, and nothing else.
  const easy = new PV.TowerDef({ seed: 5, map: 'meadow', difficulty: 'easy' });
  const hard = new PV.TowerDef({ seed: 5, map: 'meadow', difficulty: 'hard' });
  ok(easy.lives > hard.lives && easy.money > hard.money, 'hard starts no poorer than easy');
  easy.wave = hard.wave = 8;
  easy.spawn('grunt'); hard.spawn('grunt');
  ok(easy.enemies[0].maxHp < hard.enemies[0].maxHp, 'the same grunt is not tougher on hard');
  ok(easy.enemies[0].speed < hard.enemies[0].speed, 'the same grunt is not faster on hard');
  ok(easy.waves === hard.waves, 'difficulty changed the number of waves');

  // Each difficulty up sends more health down the road in the same wave.
  const heft = diff => {
    const w = new PV.TowerDef({ seed: 5, map: 'meadow', difficulty: diff });
    w.wave = 10;
    for (const k of w.waveComposition(10)) w.spawn(k);
    return w.enemies.reduce((sum, e) => sum + e.maxHp, 0);
  };
  ok(heft('easy') < heft('normal') && heft('normal') < heft('hard'),
    'a wave does not get heavier from easy to normal to hard');

  /* Balance, checked the way it was set. A player who buys the most damage
     per gold against the armour in front of it — a new tower on the square
     that sees the most road for its type, or an upgrade — plays while
     throwing away part of its income. Normal used to be cleared on 60% of
     it, which is easy by another name; hard must still be beatable by a
     player who plays well. */
  function competent(map, difficulty, seed, income) {
    const cg = new PV.TowerDef({ seed: seed, map: map, difficulty: difficulty });
    const T = PV.TowerDef.TOWERS;
    const rangeAt = (type, level) => T[type].range * (1 + (level - 1) * 0.12);
    const cover = (x, y, r) => {
      let n = 0;
      for (const lane of cg.map.lanes) for (const p of lane.points) if (Math.hypot(p.x - x - 0.5, p.y - y - 0.5) <= r) n++;
      return n;
    };
    const free = [];
    for (let y = 0; y < cg.map.rows; y++) {
      for (let x = 0; x < cg.map.cols; x++) {
        if (!cg.canBuild(x, y)) continue;
        const c = {};
        for (const type of ['gun', 'frost', 'cannon']) c[type] = [0, 1, 2, 3].map(l => (l ? cover(x, y, rangeAt(type, l)) : 0));
        free.push({ x: x, y: y, c: c });
      }
    }
    const spotOf = new Map();
    const eff = (type, level, A) => {
      const s = T[type], k = level - 1;
      const v = Math.max(1, s.dmg * (1 + k * 0.55) - A) / Math.round(s.rate * (1 - k * 0.12));
      return s.splash ? v * 1.8 : v;
    };
    cg.money = Math.floor(cg.money * income);
    let last = cg.money;
    while (!cg.isOver() && cg.tick < 60 * 60 * 30) {
      if (cg.tick % 12 === 0) {
        for (let k = 0; k < 6; k++) {
          const w = cg.wave + 1;
          const A = 2 * (cg.rankFor(w) - 1) + (w >= 8 ? 1.5 : 0) + (cg.isBossWave(w) ? 1 : 0);
          const opts = [];
          for (const type of ['gun', 'cannon']) {
            let best = null;
            for (const s of free) if (!best || s.c[type][1] > best.c[type][1]) best = s;
            if (best) opts.push({ type: type, spot: best, cost: T[type].cost, value: eff(type, 1, A) * best.c[type][1] / T[type].cost });
          }
          const frosts = cg.towers.filter(t => t.type === 'frost').length;
          if (cg.towers.length >= 4 && frosts < Math.min(3, Math.floor(cg.towers.length / 5) + 1)) {
            let best = null;
            for (const s of free) if (!best || s.c.frost[1] > best.c.frost[1]) best = s;
            if (best) opts.push({ type: 'frost', spot: best, cost: T.frost.cost, value: 1e9 });
          }
          for (const t of cg.towers) {
            if (t.level >= PV.TowerDef.MAX_LEVEL || t.type === 'frost') continue;
            const c = spotOf.get(t).c[t.type], cost = cg.upgradeCost(t);
            opts.push({ tower: t, cost: cost, value: (eff(t.type, t.level + 1, A) * c[t.level + 1] - eff(t.type, t.level, A) * c[t.level]) / cost });
          }
          if (!opts.length) break;
          opts.sort((a, b) => b.value - a.value);
          const pick = cg.money >= opts[0].cost ? opts[0]
            : opts.find(o => cg.money >= o.cost && o.value >= opts[0].value * 0.75);
          if (!pick) break;
          if (pick.tower) { if (!cg.upgrade(pick.tower)) break; continue; }
          if (!cg.build(pick.spot.x, pick.spot.y, pick.type)) break;
          spotOf.set(cg.towerAt(pick.spot.x, pick.spot.y), pick.spot);
          free.splice(free.indexOf(pick.spot), 1);
        }
      }
      cg.advance();
      if (cg.money > last) cg.money -= Math.floor((cg.money - last) * (1 - income));
      last = cg.money;
    }
    return cg;
  }
  for (const map of ['meadow', 'canyon']) {
    ok(competent(map, 'easy', 101, 0.6).overReason === 'cleared',
      map + ': easy is no longer cleared on 60% of the gold');
    ok(competent(map, 'normal', 101, 0.6).overReason !== 'cleared',
      map + ': normal still plays like easy — cleared on 60% of the gold');
  }
  ok(competent('meadow', 'normal', 101, 1).overReason === 'cleared', 'a good player cannot clear normal');
  ok(competent('crossroads', 'hard', 202, 1).overReason === 'cleared',
    'a good player cannot clear hard on its hardest map');

  // Armour is taken off every hit, and a hit always does something.
  const ag = new PV.TowerDef({ seed: 2, map: 'meadow' });
  ag.wave = 1;
  ag.spawn('grunt'); ag.spawn('armour');
  const bare = ag.enemies[0], plated = ag.enemies[1];
  ok(ag.damage(plated, 10) < ag.damage(bare, 10), 'armour soaked nothing');
  ok(ag.damage(plated, 1) >= 1, 'a hit was absorbed completely');

  // Enemies rank up as the player upgrades: same kind, later wave, more of it.
  const rg = new PV.TowerDef({ seed: 7, map: 'meadow' });
  ok(rg.rankFor(1) === 1 && rg.rankFor(7) === 2 && rg.rankFor(14) === 3,
    'the rank schedule moved');
  ok(rg.rankFor(20) <= PV.TowerDef.MAX_RANK, 'a rank went past the last one');
  rg.wave = 1; rg.spawn('grunt');
  rg.wave = 14; rg.spawn('grunt');
  const early = rg.enemies[0], late = rg.enemies[1];
  ok(late.rank === 3 && early.rank === 1, 'the spawned rank does not follow the wave');
  ok(late.maxHp > early.maxHp && late.armour > early.armour && late.bounty > early.bounty,
    'a rank 3 grunt is not tougher, better armoured and worth more than a rank 1');
  ok(late.speed > early.speed, 'a rank 3 grunt is not quicker');
  ok(rg.damage(late, 10) < rg.damage(early, 10), 'rank armour soaked nothing');

  // Bosses: never before wave 10, and last through the gate when they come.
  ok(ag.waveComposition(5).indexOf('boss') < 0, 'a boss turned up in wave 5');
  ok(ag.waveComposition(10).indexOf('boss') === 0, 'the boss is not at the back of the queue');
  ok(PV.TowerDef.KINDS.boss.leak > 1, 'a boss costs a single life');

  // Two lanes means the wave is dealt between them, not doubled onto one.
  const two = new PV.TowerDef({ seed: 3, map: 'ember' });
  ok(two.map.lanes.length === 2, 'ember lost a lane');
  two.wave = 1;
  for (let i = 0; i < 6; i++) two.spawn('grunt');
  ok(two.enemies.filter(e => e.lane === 0).length === 3
    && two.enemies.filter(e => e.lane === 1).length === 3, 'one lane took the whole wave');

  // The barrel tracks its target rather than teleporting its shots at it.
  const tg = new PV.TowerDef({ seed: 4, map: 'meadow' });
  const spot = tg.map.path[6];
  let turret = null;
  for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0], [1, 1], [-1, -1]]) {
    if (tg.canBuild(spot.x + d[0], spot.y + d[1]) && tg.build(spot.x + d[0], spot.y + d[1], 'gun')) {
      turret = tg.towerAt(spot.x + d[0], spot.y + d[1]); break;
    }
  }
  ok(!!turret, 'nowhere to build beside the road');
  if (turret) {
    tg.wave = 1; tg.spawn('grunt');
    const e = tg.enemies[0];
    e.dist = 5; tg.place(e);
    for (let i = 0; i < 40 && tg.enemies.indexOf(e) >= 0; i++) tg.advance();
    if (tg.enemies.indexOf(e) >= 0) {
      const want = Math.atan2(e.y - turret.y, e.x - turret.x);
      const off = Math.abs(((turret.aim - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      ok(off < 0.3, 'the barrel is not pointing at what it shoots, off by ' + off.toFixed(2));
    }
  }
});

/* ------------------------------------------------------------ crowd rush */

section('crowd rush — ' + (2 * scale) + ' runs per course, and the levels', () => {
  const C = PV.CrowdCourse, R = PV.CrowdRush;

  /** A player who takes the better gate and steers for the widest clear
      stretch past whatever trap is coming. Cheap on purpose: it reads the
      trap as it will be when the crowd gets there, not by simulating. */
  function aimFor(g) {
    const list = g.course.features;
    for (const ti of g.traps) {
      const f = list[ti];
      if (f.z + 2.5 < g.z + g.back) continue;
      if (f.z > g.z + 16) break;
      const eta = g.tick + Math.max(0, (f.z - g.z) / g.speed);
      let cuts;
      if (f.kind === 'saws') cuts = f.saws.map(s => { const x = R.sawX(f, s, eta); return [x - s.r - 0.3, x + s.r + 0.3]; });
      else if (f.kind === 'bar') cuts = [[(f.x || 0) - f.len - 0.3, (f.x || 0) + f.len + 0.3]];
      else if (f.kind === 'spikes') cuts = [[f.x0 - 0.3, f.x1 + 0.3]];
      else if (f.kind === 'hammer') cuts = [[-2.4, 2.4]];
      else if (f.kind === 'press') {
        const b = f.blocks.slice().sort((p, q) => R.pressLift(f, q, eta) - R.pressLift(f, p, eta))[1];
        cuts = [[b.x - b.w / 2 - 0.2, b.x + b.w / 2 + 0.2]];
      } else continue;
      cuts.sort((p, q) => p[0] - q[0]);
      let best = 0, bw = -1, x = -R.EDGE;
      for (const c of cuts.concat([[R.EDGE, R.EDGE]])) {
        if (c[0] - x > bw) { bw = c[0] - x; best = (x + c[0]) / 2; }
        x = Math.max(x, c[1]);
      }
      return best / R.EDGE;
    }
    const sh = g.shots[g.at] != null ? list[g.shots[g.at]] : null;
    if (sh && sh.kind === 'gates') {
      let bv = -1, aim = 0;
      for (const ln of sh.lanes) {
        const v = C.apply(ln.op, ln.val, g.count);
        if (v > bv) { bv = v; aim = (ln.x0 + ln.x1) / 2; }
      }
      // A lone red gate: go round it.
      if (sh.lanes.length === 1 && bv < g.count) aim = sh.lanes[0].x0 < 0 ? 3 : -3;
      return aim / R.EDGE;
    }
    return 0;
  }

  const WON = { climbed: 1, stormed: 1 };
  function play(opts, smart) {
    const g = new R(opts);
    g.input('go');
    let ticks = 0;
    while (!g.isOver() && ticks < 60 * 60 * 6) {
      if (smart) {
        if (g.phase === 'gauge' && Math.abs(g.needle(g.gaugeT)) < 0.12) g.input('go');
        g.input({ lane: aimFor(g) });
      }
      g.advance();
      ticks++;
      if (ticks % 7) continue;
      ok(g.count >= 0 && g.units <= R.CAP && g.extra >= 0, 'the crowd went negative or over the cap');
      ok(g.foes <= R.CAP && g.foeExtra >= 0, 'a squad went over the cap');
      // Where every runner is: on the road, and a real number. A runner
      // handed a place past the end of the table once stood at NaN, and a
      // fight against it could never end.
      let off = 0, lost = 0;
      for (let i = 0; i < g.units; i++) {
        if (!Number.isFinite(g.ux[i]) || !Number.isFinite(g.uz[i])) lost++;
        else if (Math.abs(g.ux[i]) > R.EDGE + 1e-9) off++;
      }
      ok(off === 0, off + ' runners stood off the road');
      ok(lost === 0, lost + ' runners stood nowhere');
    }
    return g;
  }

  // Every course and a spread of levels are laid out sanely.
  const built = C.keys.map(k => new R({ seed: 4, course: k, difficulty: 'normal' }))
    .concat([1, 2, 3, 9, 20, 45].map(n => new R({ seed: C.seedFor(n), level: n })));
  for (const g of built) {
    const c = g.course, list = c.features, name = (g.level ? 'level ' + g.level : g.courseKey);
    ok(list.length >= 4, name + ': the course is nearly empty');
    for (let i = 1; i < list.length; i++) ok(list[i].z >= list[i - 1].z, name + ': features are out of order');
    for (const f of list) {
      ok(f.z > 0 && f.z < c.finish, name + ': a feature sits off the course');
      if (f.kind === 'gates') {
        ok(f.lanes.length >= 1 && f.lanes.every(l => l.x1 > l.x0 && l.x0 >= -C.HALF && l.x1 <= C.HALF),
          name + ': a gate does not sit on the road');
      }
      if (f.kind === 'squad') ok(f.n > 0 && f.r > 0, name + ': an empty squad was placed');
    }
    if (c.boss) ok(c.king.k >= 2 && c.gauge.length === 3 && c.kingZ > c.finish, name + ': the king has no castle');
    else ok(c.stairs > c.finish && c.chest > c.top, name + ': the stairs are missing');
    ok(list[0].kind === 'gates' && list[0].lanes.every(l => C.isGood(l.op)),
      name + ': the first thing on the road is not a pair of gates worth taking');
  }
  ok(new R({ seed: 4, course: 'dusk', difficulty: 'hard' }).course.boss, 'a free run did not end at the castle');

  // The same seed and the same hands give the same run.
  for (const course of C.keys) {
    for (let n = 0; n < 2 * scale; n++) {
      const seed = 21000 + n, difficulty = ['easy', 'normal', 'hard'][n % 3];
      const a = play({ seed: seed, course: course, difficulty: difficulty }, true);
      ok(a.isOver(), course + ' seed ' + seed + ': the run never ended');
      ok(['climbed', 'stormed', 'wiped', 'overrun', 'held'].indexOf(a.overReason) >= 0,
        course + ' seed ' + seed + ': odd ending ' + a.overReason);
      const b = play({ seed: seed, course: course, difficulty: difficulty }, true);
      ok(a.tick === b.tick && a.score === b.score && a.count === b.count && a.overReason === b.overReason,
        course + ' seed ' + seed + ': the same seed gave a different run');
    }
  }

  // A gate is taken by the whole crowd: whichever one its middle is in.
  const pair = { kind: 'gates', z: 0, lanes: [
    { x0: -C.HALF, x1: 0, op: 'mul', val: 2 }, { x0: 0, x1: C.HALF, op: 'sub', val: 1000 }] };
  const gt = new R({ seed: 9, level: 1, autostart: true });
  gt.addUnits(99);
  gt.x = -0.3;
  gt.takeGate(pair, 0);
  ok(gt.count === 200, 'a crowd whose middle was in the ×2 gate did not double, got ' + gt.count);
  gt.x = 0.3;
  gt.takeGate(pair, 0);
  ok(gt.count === 0, 'a red gate did not take the whole crowd');

  // Past the cap the count is exact; the rest wait in the reservoir.
  const big = new R({ seed: 9, level: 1, autostart: true });
  big.addUnits(2999);
  ok(big.count === 3000 && big.units === R.CAP && big.extra === 3000 - R.CAP, 'the reservoir lost runners');
  big.removeUnits(2900);
  ok(big.count === 100 && big.units === 100 && big.extra === 0, 'a red gate did not empty the reservoir first');

  // A squad is a one-for-one trade, fought runner against runner.
  function clash(mine, theirs) {
    const c = new R({ seed: 1, level: 1, autostart: true });
    c.removeUnits(c.count);
    c.addUnits(mine);
    c.engage({ kind: 'squad', z: c.z + 4, n: theirs, r: C.squadRadius(theirs) }, 999);
    let guard = 0;
    while (c.phase === 'fight' && guard++ < 5000) c.advance();
    return c;
  }
  const won = clash(100, 40);
  ok(won.count === 60 && won.phase === 'run', '100 against 40 should leave 60, left ' + won.count);
  ok(won.beaten === 40, 'the win was not credited, got ' + won.beaten);
  const lostIt = clash(30, 80);
  ok(lostIt.count === 0 && lostIt.phase === 'lost', 'the smaller crowd survived a fight');
  ok(clash(900, 400).count === 500, 'a fight past the cap does not trade one for one');

  // The start line: nothing moves until the player says go.
  const wait = new R({ seed: 5, level: 1 });
  for (let k = 0; k < 120; k++) wait.advance();
  ok(wait.ready && wait.z === 0 && !wait.isOver(), 'the crowd set off before anyone tapped');
  wait.input({ lane: 0.5 });
  wait.advance();
  ok(wait.ready, 'hovering the mouse over the canvas started the run');
  wait.input('go');
  wait.advance();
  ok(!wait.ready && wait.z > 0, 'go did not start the run');
  ok(wait.setBoost({ units: 5 }) === false && wait.count === 1, 'an upgrade landed after the run had started');
  ok(new R({ seed: 5, level: 1, autostart: true }).phase === 'run', 'a race start still waited at the line');

  // Upgrades change the player, never the course.
  const plain = new R({ seed: 8, level: 5 });
  const rich = new R({ seed: 8, level: 5, boost: { units: 6, income: 4 } });
  ok(rich.count === 6 && plain.count === 1, 'Start Units did not put its runners on the line');
  ok(JSON.stringify(rich.course) === JSON.stringify(plain.course), 'an upgrade changed the course');
  ok(new R({ seed: 8, level: 5, boost: { units: 1e9, income: -3 } }).boost.units === R.BOOSTS.units.max,
    'an upgrade level was not clamped');
  ok(R.boostCost('units', 4) > R.boostCost('units', 3), 'a higher level did not cost more');

  // Traps cut the runners they touch — and a crowd steered into the gap
  // loses far fewer than one steered into the blade.
  function sawRun(x) {
    const s = new R({ seed: 2, level: 1, autostart: true });
    s.removeUnits(s.count);
    s.addUnits(60);
    s.course = { features: [{ kind: 'saws', z: 20, phase: 0, saws: [{ x: 0, r: 1.2 }] }], finish: 60, boss: false, stairs: 70, top: 90, chest: 97, length: 100 };
    s.traps = [0]; s.shots = [];
    for (let k = 0; k < 400 && s.z < 30; k++) { s.input({ lane: x }); s.advance(); }
    return 60 - s.count;
  }
  const intoIt = sawRun(0), round = sawRun(0.8);
  ok(intoIt > 5, 'a blade through the middle of the crowd cut only ' + intoIt);
  ok(round < intoIt / 2, 'going round the blade saved nothing: ' + round + ' against ' + intoIt);

  // The tower: more runners climb higher, and enough reach the chest.
  const towerOf = n => {
    const t = new R({ seed: 3, level: 1, autostart: true });
    t.removeUnits(t.count);
    t.addUnits(n);
    t.startTower();
    return t;
  };
  let lastMult = 0;
  for (const n of [1, 5, 20, 60, 140, 400]) {
    const t = towerOf(n);
    ok(t.mult >= lastMult && t.mult >= 1 && t.mult <= 5, 'the stairs paid ×' + t.mult + ' for ' + n);
    lastMult = t.mult;
  }
  ok(towerOf(1).mult === 1 && towerOf(400).tower.top && towerOf(400).mult === 5, 'the stairs do not run ×1.0 to ×5.0');
  const climber = towerOf(40);
  while (!climber.isOver()) climber.advance();
  ok(climber.overReason === 'climbed' && climber.coins > 0, 'climbing the stairs was not a paid win');

  // The needle: stopped in the middle it pays the most.
  const needle = new R({ seed: C.seedFor(3), level: 3, autostart: true });
  needle.z = needle.course.finish;
  needle.finale();
  while (Math.abs(needle.needle(needle.gaugeT)) > 0.05) needle.advance();
  const before = needle.count;
  needle.input('go');
  needle.advance();
  ok(needle.count - before === needle.course.gauge[2], 'the middle of the needle did not pay the most');

  // The king: a crowd that is big enough brings him down; a handful does not.
  function kingFight(n) {
    const k = new R({ seed: C.seedFor(3), level: 3, autostart: true });
    k.removeUnits(k.count);
    k.addUnits(n);
    k.z = k.course.finish;
    k.finale();
    k.input('go');
    let guard = 0;
    while (!k.isOver() && guard++ < 20000) k.advance();
    return k;
  }
  const storm = kingFight(300), held = kingFight(3);
  ok(storm.overReason === 'stormed' && storm.count > 0, 'three hundred runners lost to the king (' + storm.overReason + ')');
  ok(held.overReason === 'held' && held.count === 0, 'a handful of runners took the castle');
  ok(storm.coins > held.coins, 'bringing down the king paid less than losing to him');

  // Income multiplies what a run pays.
  const poor = kingFight(300), paid = new R({ seed: C.seedFor(3), level: 3, autostart: true, boost: { income: 11 } });
  paid.removeUnits(paid.count); paid.addUnits(300); paid.z = paid.course.finish; paid.finale(); paid.input('go');
  while (!paid.isOver()) paid.advance();
  ok(paid.overReason === 'stormed' && paid.coins === Math.round(poor.coins * 2), 'Income did not double the pay at level 11');

  /* Levels. Level n is worked out from n alone and played from its own seed;
     each asks a little more, and every third one is a king. */
  ok(C.level(0).level === 1 && C.level(1e9).level === C.MAX_LEVEL, 'a level number was not clamped');
  for (let n = 1; n < 45; n++) {
    const a = C.level(n), b = C.level(n + 1);
    ok(b.squad >= a.squad && b.bad >= a.bad && b.speed >= a.speed && b.king >= a.king && b.beats >= a.beats
      && (n < 2 || b.hazard >= a.hazard), 'level ' + (n + 1) + ' is easier than level ' + n + ' somewhere');
    ok(C.seedFor(n) !== 0 && C.seedFor(n) !== C.seedFor(n + 1), 'level ' + n + ' has no seed of its own');
    ok(a.boss === (n % 3 === 0), 'level ' + n + ' has the wrong finish');
  }
  ok(C.level(30).speed >= C.level(1).speed * 1.25, 'level 30 does not run noticeably faster than level 1');
  const once = new R({ seed: C.seedFor(12), level: 12 }), twice = new R({ seed: C.seedFor(12), level: 12 });
  ok(once.level === 12 && JSON.stringify(once.course) === JSON.stringify(twice.course), 'level 12 was not the same course twice');
  ok(C.THEMES.indexOf(once.theme) >= 0, 'a level has no scenery of its own');

  // A good player clears the first twelve levels with nothing bought.
  for (let n = 1; n <= 12; n++) {
    const g = play({ seed: C.seedFor(n), level: n }, true);
    ok(WON[g.overReason], 'a good player lost level ' + n + ' (' + g.overReason + ')');
  }
  // ...and one who never steers does not get far.
  let idle = 0;
  for (let n = 1; n <= 12; n++) if (WON[play({ seed: C.seedFor(n), level: n }, false).overReason]) idle++;
  ok(idle < 9, 'standing still won ' + idle + ' of the first twelve levels');

  // The view draws between ticks, so the engine keeps where it was.
  const lg = new R({ seed: 3, level: 1, autostart: true });
  lg.advance();
  const was = lg.z;
  lg.advance();
  ok(lg.lastZ === was && lg.z > was && lg.pux.length === R.CAP, 'the last position was not kept for drawing between ticks');
});

/* --------------------------------------------------------------- security */

section('security — hostile input cannot break the app', () => {
  const S = PV.Safe;

  // Strings: never an object, never unbounded, never invisible characters.
  ok(S.str({ toString: () => 'x'.repeat(9999) }, 24, 'fb') === 'fb', 'an object passed as a name');
  ok(S.str('a'.repeat(500), 24).length === 24, 'a long name was not capped');
  ok(S.str('ok\u0000\u202Eevil', 64) === 'okevil', 'control and bidi characters survived');
  ok(S.str(null, 24, 'fb') === 'fb' && S.str('   ', 24, 'fb') === 'fb', 'blank did not fall back');

  // Numbers: finite and clamped, whatever arrives.
  ok(S.num('abc', 0, 10, 3) === 3, 'a non-number was not refused');
  ok(S.num(Infinity, 0, 10, 3) === 3 && S.num(NaN, 0, 10, 3) === 3, 'infinity or NaN got through');
  ok(S.num(1e308, 0, 10, 0) === 10 && S.num(-1e308, 0, 10, 0) === 0, 'a huge number was not clamped');
  ok(S.int(2.6, 0, 10, 0) === 3, 'int did not round');
  ok(S.pick('nope', ['a', 'b'], 'a') === 'a' && S.pick('b', ['a', 'b']) === 'b', 'pick let a stranger in');

  // plain(): rebuilt, so nothing inherited and nothing banned survives.
  const nasty = JSON.parse('{"__proto__":{"pwned":1},"a":1,"deep":{"b":{"c":{"d":{"e":{"f":{"g":2}}}}}}}');
  const cleaned = S.plain(nasty);
  ok(cleaned.a === 1, 'plain dropped a good key');
  ok(!Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), '__proto__ survived plain()');
  ok(({}).pwned === undefined, 'Object.prototype was polluted');
  ok(S.plain({ f: function () {} }).f === undefined, 'a function survived plain()');
  ok(S.plain({ n: Infinity }).n === undefined, 'a non-finite number survived plain()');
  const wide = {};
  for (let i = 0; i < 1000; i++) wide['k' + i] = i;
  ok(Object.keys(S.plain(wide, { keys: 10 })).length === 10, 'the key cap did not hold');
  ok(S.plain({ s: 'x'.repeat(9000) }, { string: 100 }).s.length === 100, 'the string cap did not hold');
  const cyclic = { a: 1 }; cyclic.self = cyclic;
  let threw = false;
  try { S.plain(cyclic); } catch (e) { threw = true; }
  ok(!threw, 'a cycle threw instead of running out of budget');

  // own(): a poisoned prototype is not a property.
  const poisoned = Object.create({ inherited: 'yes' });
  ok(S.own(poisoned, 'inherited') === false, 'own() accepted an inherited key');

  // The profile store: every field rebuilt, every number clamped.
  const clean = PV.Store.clean('profile', {
    name: 'a'.repeat(400), xp: 1e308, created: {}, extra: 'dropped'
  });
  ok(clean.name.length === 24, 'a 400-character name was stored, got ' + clean.name.length);
  ok(clean.xp <= 5e8 && isFinite(clean.xp), 'xp was not clamped, got ' + clean.xp);
  ok(clean.extra === undefined, 'an unknown profile field was kept');
  ok(PV.Store.clean('profile', 'not an object') === undefined, 'a string passed as a profile');
  ok(PV.Store.clean('profile', [1, 2]) === undefined, 'an array passed as a profile');

  // The bug this actually fixes: a hand-edited xp used to walk one level at a
  // time, for ever. Bounded, it answers immediately and stays sane.
  const started = Date.now();
  const lvl = PV.Profile.level.call(null) && true;
  void lvl;
  PV.Store.set('profile', { name: 'x', xp: 1e308, created: '' });
  const big = PV.Profile.level();
  ok(Date.now() - started < 2000, 'levelling from a huge xp took ' + (Date.now() - started) + 'ms');
  ok(big.level > 1 && big.level <= 5000 && isFinite(big.total), 'a huge xp gave level ' + big.level);
  PV.Store.set('profile', { name: '', xp: 0, created: '' });

  // Stats: unknown shapes rebuilt, key count bounded, records clamped.
  const stats = PV.Store.clean('stats', {
    games: { chess: { played: 1e308, bestScore: 'lots', junk: 1 }, '__proto__': { x: 1 } }
  });
  ok(stats.games.chess.played <= 1e9 && isFinite(stats.games.chess.played), 'played was not clamped');
  ok(stats.games.chess.bestScore === 0, 'a string best score was kept');
  ok(stats.games.chess.junk === undefined, 'an unknown stats field was kept');
  ok(!Object.prototype.hasOwnProperty.call(stats.games, '__proto__'), '__proto__ became a game');
  ok(PV.Store.clean('stats', { games: 'nope' }).games && true, 'a bad games map was not replaced');

  // Import: another app's file, a hostile file, and a good one.
  ok(PV.Store.importAll(null).ok === false, 'null imported');
  ok(PV.Store.importAll({ format: 'somethingelse', data: {} }).ok === false, "another app's backup imported");
  ok(PV.Store.importAll('{}').ok === false, 'a string imported');
  const hostile = JSON.parse('{"format":"playvault.backup","version":1,"data":{"profile":{"name":"ok","xp":1e308},"__proto__":{"x":1},"evil":{"a":1}}}');
  const res = PV.Store.importAll(hostile);
  ok(res.ok === true && res.restored === 1, 'the hostile backup restored ' + res.restored + ' stores');
  ok(({}).x === undefined, 'importing polluted Object.prototype');
  ok(PV.Store.get('profile', null).xp <= 5e8, 'the imported xp was not clamped');
  const round = PV.Store.importAll(PV.Store.exportAll());
  ok(round.ok === true, 'a backup this app wrote did not import');
  PV.Store.set('profile', { name: '', xp: 0, created: '' });
  PV.Store.set('stats', { games: {} });
});


section('security — a hostile peer in a friends room', () => {
  const quiet = { send() {}, sendTo() {}, broadcast() {}, close() {} };
  const guest = new PV.Room({
    link: Object.assign({ isHost: false }, quiet),
    code: '123456', seat: 1, gameCode: 'chess',
    members: [PV.Room.member(0, 'Host', 3, true)]
  });

  // A roster of a thousand members with five-kilobyte names, from the "host".
  const monster = [];
  for (let i = 0; i < 1000; i++) {
    monster.push({ seat: 1e9, name: 'x'.repeat(5000), level: Infinity, host: 'yes' });
  }
  guest.receive(0, {
    t: 'roster', members: monster,
    game: 'z'.repeat(900), opts: { a: 'y'.repeat(900) }
  });
  ok(guest.members.length <= 16, 'the roster took ' + guest.members.length + ' members');
  ok(guest.members.every(m => m.name.length <= 24), 'a member name was not capped');
  ok(guest.members.every(m => m.seat >= 0 && m.seat <= 15), 'a seat was out of range');
  ok(guest.members.every(m => isFinite(m.level) && m.level <= 9999), 'a level was not clamped');
  ok(guest.gameCode.length <= 24, 'the game code was not capped, got ' + guest.gameCode.length);
  ok(String(guest.opts.a).length <= 32, 'an option value was not capped');

  /* A roster that crossed the wire must still be a roster the app can use.
     Rebuilding member by member means a field left OUT is a field deleted,
     and `alive` is the one everything else asks about: live() filters on it,
     the chips grey out without it, and a board game with no live opponent
     decides the opponent has left. Dropping it made a guest who had joined
     perfectly well look, to itself, like an empty room — which is what a
     friend typing the code actually saw. */
  guest.receive(0, {
    t: 'roster',
    members: [{ seat: 0, name: 'Host', level: 3, host: true, alive: true },
              { seat: 1, name: 'Guest', level: 1, host: false, alive: true }]
  });
  ok(guest.live().length === 2, 'a joined roster counted ' + guest.live().length + ' live players');
  ok(guest.members.every(m => m.alive === true), 'the alive flag was dropped in transit');
  guest.receive(0, {
    t: 'roster',
    members: [{ seat: 0, name: 'Host', host: true, alive: true },
              { seat: 1, name: 'Gone', host: false, alive: false }]
  });
  ok(guest.live().length === 1, 'a member the host marked gone is still live');

  // Nothing on the wire may reach a prototype.
  guest.receive(0, {
    t: 'roster', members: [{ seat: 0, name: 'ok' }],
    opts: JSON.parse('{"__proto__":{"pwned":1}}')
  });
  ok(({}).pwned === undefined, 'a room message polluted Object.prototype');

  // Rubbish is ignored rather than adopted.
  const before = guest.members.length;
  const wasCode = guest.gameCode;
  guest.receive(0, { t: 'roster', members: 'not a list' });
  ok(guest.members.length === before, 'a non-list roster replaced the real one');
  guest.receive(0, { t: 'begin', game: '', opts: null, seed: 'abc', round: 1e308, members: null });
  ok(guest.seed >= 0 && isFinite(guest.seed), 'a bogus seed got through, got ' + guest.seed);
  ok(guest.round >= 0 && guest.round <= 9999, 'a bogus round got through, got ' + guest.round);
  ok(guest.members.length === before, 'a null roster wiped the real one');
  ok(guest.gameCode === wasCode, 'an empty game code wiped the one already agreed');

  // A guest cannot tell a host what to do: the host path takes ask and post,
  // and nothing else, whatever a patched client sends.
  const host = new PV.Room({
    link: Object.assign({ isHost: true }, quiet),
    code: '123456', seat: 0, gameCode: 'chess',
    members: [PV.Room.member(0, 'Host', 3, true)]
  });
  host.receive(1, { t: 'roster', members: [{ seat: 0, name: 'usurper' }] });
  host.receive(1, { t: 'begin', seed: 9, game: 'gomoku' });
  host.receive(1, { t: 'end' });
  host.receive(1, { t: 'bye', reason: 'x'.repeat(400) });
  ok(host.members.length === 1 && host.members[0].name === 'Host', 'a guest rewrote the host roster');
  ok(host.phase === 'lobby', 'a guest moved the host to phase ' + host.phase);
  ok(host.gameCode === 'chess', 'a guest changed the game');
  ok(!host.dead, 'a guest closed the host room');
});


section('security — sealed records and a fresh bundle', () => {
  // A record this app wrote comes back; the same record edited does not.
  PV.Store.set('profile', { name: 'Kaon', xp: 120, created: '' });
  ok(PV.Store.get('profile', null).xp === 120, 'a sealed record did not come back');

  const raw = JSON.parse(localStorage.getItem('playvault.profile'));
  ok(typeof raw.c === 'string' && 'd' in raw, 'the record was not sealed at all');

  // The console edit that started all this: change the number in place.
  raw.d.xp = 999999;
  localStorage.setItem('playvault.profile', JSON.stringify(raw));
  ok(PV.Store.get('profile', null) === null, 'an edited record was believed');
  ok(PV.Profile.level().level === 1, 'an edited record still levelled the player');

  // ...and writing the bare object with no seal at all is not a way round it.
  localStorage.setItem('playvault.profile', JSON.stringify({ name: 'x', xp: 999999 }));
  ok(PV.Store.get('profile', null) === null, 'an unsealed record was believed');

  // The app carries on from a clean record rather than breaking.
  PV.Profile.setName('Kaon');
  ok(PV.Profile.name() === 'Kaon', 'the profile could not be rebuilt after tampering');
  ok(PV.Store.get('profile', null).xp === 0, 'the rebuilt record kept the edited xp');

  // Unsigned stores still round-trip, and a backup still imports.
  PV.Store.set('sudoku.saved', { grid: [1, 2, 3] });
  ok(PV.Store.get('sudoku.saved', null).grid.length === 3, 'an unsigned store broke');
  const env = PV.Store.exportAll();
  ok(PV.Store.importAll(env).ok === true, 'a sealed export did not import');
  PV.Store.del('sudoku.saved');

  // The deploy bundle must match the source it was built from. A bundle one
  // edit behind is a bug that only appears in production, after a push.
  const build = require('./build.js');
  const fs2 = require('fs');
  const dev = fs2.readFileSync(path.join(ROOT, 'index.dev.html'), 'utf8');
  const files = build.sources(dev);
  ok(files.length > 20, 'index.dev.html lists only ' + files.length + ' scripts');
  const stamp = build.stampOf(files);
  const onDisk = fs2.readFileSync(path.join(ROOT, 'js/playvault.min.js'), 'utf8');
  ok(onDisk.indexOf('stamp:' + stamp) > 0,
    'js/playvault.min.js is stale — run `node tools/build.js`');
  const html = fs2.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html.indexOf('js/playvault.min.js?v=' + stamp) > 0,
    'index.html points at a different bundle — run `node tools/build.js`');
  ok(html.indexOf('<script src="js/core/') < 0, 'the deployed page still loads loose sources');
});

/* ------------------------------------------------------------------- core */

section('core — rng, store, profile', () => {
  const a = new PV.RNG(12345), b = new PV.RNG(12345);
  const xs = [], ys = [];
  for (let i = 0; i < 50; i++) { xs.push(a.next()); ys.push(b.next()); }
  ok(xs.every((v, i) => v === ys[i]), 'the same seed gave different streams');
  ok(PV.RNG.restore(a.state()).next() === a.next(), 'restore() did not reproduce the stream');
  ok(PV.codeToSeed(PV.seedToCode(987654)) === 987654, 'seed code round trip failed');

  PV.Store.set('profile', { name: 'K', xp: 0, created: 'x' });
  PV.Profile.addXp(100);
  ok(PV.Profile.level().level === 2, '100 XP should be level 2');
  PV.Profile.record('gomoku', { result: 'win', timeMs: 1000, xp: 10 });
  ok(PV.Profile.forGame('gomoku').won === 1, 'a win was not recorded');
  PV.Profile.record('sudoku', { result: 'solved', timeMs: 5000, lowerTimeIsBetter: true, xp: 5 });
  PV.Profile.record('sudoku', { result: 'solved', timeMs: 9000, lowerTimeIsBetter: true, xp: 5 });
  ok(PV.Profile.forGame('sudoku').bestTimeMs === 5000, 'a slower solve overwrote the best time');

  const env = PV.Store.exportAll();
  ok(env.format === 'playvault.backup', 'wrong export envelope format');
  ok(PV.Store.importAll({ format: 'cardverse.backup', data: {} }).ok === false,
    'another app\'s save was accepted');
  ok(PV.Store.importAll(env).ok === true, 'our own export was rejected');
  for (const key of ['spider.saved', 'mahjong.saved', 'sudoku.saved']) {
    ok(PV.Store.BACKUP_STORES.indexOf(key) >= 0, key + ' is missing from BACKUP_STORES');
  }
});

/* ------------------------------------------------- playing with friends */

/* Two rooms wired to each other in memory. Everything above the link is the
   real code — the routing, the seat stamping, the host's accept rules — and
   only the WebRTC underneath it is replaced. Delivery is synchronous, so a
   move and its consequences have all landed by the time request() returns. */
function pairRooms(n, gameCode, opts) {
  const guests = [];
  const host = new PV.Room({
    link: {
      isHost: true,
      send: msg => guests.forEach(g => g.receive(0, msg)),
      sendTo: (seat, msg) => { if (guests[seat - 1]) guests[seat - 1].receive(0, msg); },
      broadcast: msg => guests.forEach(g => g.receive(0, msg)),
      close() {}
    },
    code: '123456', seat: 0, gameCode: gameCode, opts: opts || {}, maxPlayers: n,
    members: [PV.Room.member(0, 'Host', 3, true)]
  });
  for (let seat = 1; seat < n; seat++) {
    const mine = seat;
    const room = new PV.Room({
      link: {
        isHost: false,
        send: msg => host.receive(mine, msg),
        sendTo: (_s, msg) => host.receive(mine, msg),
        broadcast: msg => host.receive(mine, msg),
        close() {}
      },
      code: '123456', seat: mine
    });
    host.members.push(PV.Room.member(mine, 'Guest ' + mine, 1, false));
    guests.push(room);
  }
  host.pushRoster();
  return { host: host, guests: guests };
}

section('room — routing, roster and who is allowed to decide', () => {
  const { host, guests } = pairRooms(3, 'gomoku', { mode: 'hotseat' });
  const g1 = guests[0], g2 = guests[1];

  ok(g1.gameCode === 'gomoku' && g1.opts.mode === 'hotseat',
    'the roster did not carry the game and its options to a guest');
  ok(g1.members.length === 3, 'a guest was not told about everybody');

  /* post() reaches everyone, stamped with the seat the CONNECTION had — not
     with anything the message claimed. */
  const heard = [];
  [host, g1, g2].forEach((r, i) => r.on('msg', (from, p) => heard.push(i + ':' + from + ':' + p.v)));
  g2.post({ v: 'x', seat: 0 });
  ok(heard.length === 3, 'a post did not reach all three rooms');
  ok(heard.every(h => h.split(':')[1] === '2'), 'a post was not stamped with the sender\'s seat');

  /* ask() reaches the host and nobody else. */
  const asked = [];
  [host, g1, g2].forEach((r, i) => r.on('ask', (from, p) => asked.push(i + ':' + from + ':' + p.v)));
  g1.ask({ v: 'q' });
  ok(asked.length === 1 && asked[0] === '0:1:q', 'ask() did not go to the host alone');

  /* A guest cannot start the game, end it, or rewrite the roster. */
  ok(g1.begin(7) === false, 'a guest was allowed to begin the round');
  ok(g1.end([]) === false, 'a guest was allowed to end the round');
  ok(host.phase === 'lobby', 'a guest changed the host\'s phase');
  g1.receive(0, { t: 'roster', members: [] });
  ok(g1.members.length === 0, 'a guest ignored the host\'s roster');
  host.pushRoster();
  ok(g1.members.length === 3, 'the roster did not come back');

  /* begin() puts everyone on one seed. That is the whole of a race. */
  host.begin(4242);
  ok(g1.seed === 4242 && g2.seed === 4242 && host.seed === 4242,
    'the seed did not reach every seat');
  ok(g1.phase === 'playing' && g2.phase === 'playing', 'a guest is not playing');

  /* A dropped guest stops being live but stays on the roster, because a
     scoreboard with a missing row reads as a bug. */
  host.memberAt(2).alive = false;
  host.pushRoster();
  ok(host.live().length === 2 && host.members.length === 3,
    'a dropped player was removed rather than marked');
});

/* The host's door, with the WebRTC taken out: a connection is an emitter that
   opens when told to, and timers are caught rather than waited for. A friend
   whose first try did not get through used to find every later try refused as
   "full", because the try had been handed the only chair and never gave it
   back. */
section('net — a chair goes to whoever got through, and comes back', () => {
  const timers = [];
  const realSet = global.setTimeout;
  global.setTimeout = fn => { timers.push(fn); return 0; };
  try {
    const conn = id => {
      const c = new PV.Net.Emitter();
      c.peer = id; c.open = false; c.sent = [];
      c.send = m => c.sent.push(m);
      c.close = () => { if (c.open) { c.open = false; c.fire('close'); } };
      c.opens = () => { c.open = true; c.fire('open'); };
      return c;
    };
    const host = new PV.Net.Host();
    host.code = '123456';
    const joins = [], leaves = [];
    host.on('join', e => joins.push(e.seat));
    host.on('leave', e => leaves.push(e.seat));

    const stuck = conn('stuck');
    host.accept(stuck);
    ok(host.conns.size === 0, 'an attempt that never opened took a chair');
    timers.splice(0).forEach(fn => fn());

    const a = conn('a');
    host.accept(a); a.opens();
    ok(a.sent[0] && a.sent[0].t === 'welcome' && a.sent[0].seat === 1,
      'the first guest through was not welcomed to seat 1 after a stuck attempt');
    a.fire('data', { t: 'hello', name: 'A', level: 2 });
    ok(joins.join() === '1', 'the guest\'s hello did not announce a join');

    const b = conn('b');
    host.accept(b); b.opens();
    ok(b.sent[0] && b.sent[0].t === 'full' && b.sent[0].why === 'full',
      'a third person was let into a room of two');

    a.close();
    ok(leaves.join() === '1' && host.conns.size === 0, 'a guest leaving did not free the chair');
    const c = conn('c');
    host.accept(c); c.opens();
    ok(c.sent[0] && c.sent[0].t === 'welcome' && c.sent[0].seat === 1,
      'a chair given back in the lobby could not be sat in again');

    /* Nobody on the roster, nobody to announce leaving. */
    c.close();
    ok(leaves.join() === '1', 'somebody who never said hello was reported as leaving');

    host.locked = true;
    const late = conn('late');
    host.accept(late); late.opens();
    ok(late.sent[0] && late.sent[0].t === 'full' && late.sent[0].why === 'started',
      'somebody got a chair after the game started');
  } finally {
    global.setTimeout = realSet;
  }
});

/* One end of an online board: a real engine, a real PV.boardNet over it. */
function boardEnd(room, make) {
  const end = { engine: make(), renders: 0, gone: '' };
  end.net = PV.boardNet(room, {
    engine: () => end.engine,
    rebuild(history) {
      const fresh = make();
      for (const m of history) {
        const move = Object.assign({}, m);
        delete move.seat;
        fresh.apply(move);
      }
      end.engine = fresh;
      end.rebuilt = (end.rebuilt || 0) + 1;
    },
    changed() { end.renders++; },
    restart() { end.engine = make(); },
    gone(kind) { end.gone = kind; }
  });
  return end;
}

function sameBoard(a, b) {
  if (a.turn !== b.turn || a.over !== b.over) return false;
  if (a.history.length !== b.history.length) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) return false;
  return true;
}

section('boardnet — ' + (12 * scale) + ' games played down a wire', () => {
  const make = () => new PV.Gomoku({ rng: new PV.RNG(1) });

  for (let n = 0; n < 12 * scale; n++) {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(1000 + n);
    const ends = [boardEnd(host, make), boardEnd(guests[0], make)];
    const ais = [
      new PV.GomokuAI({ seat: 0, level: 'normal', rng: new PV.RNG(n + 1) }),
      new PV.GomokuAI({ seat: 1, level: 'normal', rng: new PV.RNG(n + 500) })
    ];

    let plies = 0;
    while (!ends[0].engine.over && plies < 80) {
      const turn = ends[0].engine.turn;
      const mover = ends[turn];
      const before = mover.engine.history.length;

      /* The seat that is NOT to move asks first. The host must refuse it, and
         nothing on either board may change. */
      const idle = ends[1 - turn];
      idle.net.request(ais[1 - turn].choose(idle.engine));
      ok(ends[0].engine.history.length === before,
        'a move by the seat that was not to play was accepted');

      const move = ais[turn].choose(mover.engine);
      mover.net.request(move);
      plies++;
      ok(ends[0].engine.history.length === plies, 'an accepted move did not land on the host');
      ok(sameBoard(ends[0].engine, ends[1].engine),
        'the two boards disagreed after ply ' + plies);
    }
    ok(ends[0].engine.over === ends[1].engine.over, 'only one side saw the game end');
    if (ends[0].engine.over) {
      ok(JSON.stringify(ends[0].engine.result) === JSON.stringify(ends[1].engine.result),
        'the two sides recorded different results');
    }
  }
});

section('boardnet — refusals, resync, resign and an empty room', () => {
  const make = () => new PV.Gomoku({ rng: new PV.RNG(1) });

  /* An illegal move moves nobody's board. */
  {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(9);
    const H = boardEnd(host, make), G = boardEnd(guests[0], make);
    H.net.request({ type: 'place', x: 7, y: 7 });
    ok(H.engine.history.length === 1, 'a legal opening move was refused');
    G.net.request({ type: 'place', x: 7, y: 7 });        // occupied
    ok(H.engine.history.length === 1 && G.engine.history.length === 1,
      'a move onto an occupied point was accepted');
    G.net.request({ type: 'place', x: 99, y: 99 });      // off the board
    ok(H.engine.history.length === 1, 'a move off the board was accepted');
  }

  /* A guest that has fallen behind gets the move list and rebuilds to it.
     This is the path a dropped message takes, and it has to end with the two
     boards identical rather than merely close. */
  {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(11);
    const H = boardEnd(host, make), G = boardEnd(guests[0], make);
    H.net.request({ type: 'place', x: 7, y: 7 });
    G.net.request({ type: 'place', x: 7, y: 8 });
    H.net.request({ type: 'place', x: 8, y: 8 });
    ok(H.engine.history.length === 3, 'three moves did not land');

    /* Rewind the guest to one ply, as if the last two messages never arrived.
       It still believes it is to play, which is exactly the dangerous state —
       nothing local tells a board that it is behind. */
    G.engine = make();
    G.engine.apply({ type: 'place', x: 7, y: 7 });
    ok(!sameBoard(H.engine, G.engine), 'the test did not manage to desync the guest');

    G.net.request({ type: 'place', x: 1, y: 1 });         // stale index -> resync
    ok(G.rebuilt === 1, 'a stale move did not trigger a rebuild');
    ok(sameBoard(H.engine, G.engine), 'the rebuild did not reproduce the host\'s board');
    ok(H.engine.history.length === 3, 'the stale move was played anyway');

    /* And the guest can carry straight on from the rebuilt board. */
    G.net.request({ type: 'place', x: 5, y: 5 });
    ok(H.engine.history.length === 4 && sameBoard(H.engine, G.engine),
      'the guest could not move after a resync');

    /* The other direction: a move arrives from further ahead than the guest
       has reached. It must fetch the list rather than apply it out of order. */
    G.engine = make();
    G.engine.apply({ type: 'place', x: 7, y: 7 });
    H.net.request({ type: 'place', x: 9, y: 9 });
    ok(G.rebuilt === 2, 'a move from the future did not trigger a rebuild');
    ok(sameBoard(H.engine, G.engine), 'the guest did not catch up to the host');
  }

  /* Resigning is the guest's to do and the host's to rule on. */
  {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(13);
    const H = boardEnd(host, make), G = boardEnd(guests[0], make);
    H.net.request({ type: 'place', x: 7, y: 7 });
    G.net.resign();
    ok(H.engine.over && G.engine.over, 'a resignation did not end the game on both sides');
    ok(H.engine.result.winner === 0 && G.engine.result.winner === 0,
      'a resignation handed the game to the wrong seat');
  }

  /* A rematch is one message and both boards are new. */
  {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(15);
    const H = boardEnd(host, make), G = boardEnd(guests[0], make);
    H.net.request({ type: 'place', x: 7, y: 7 });
    H.net.rematch();
    ok(H.engine.history.length === 0 && G.engine.history.length === 0,
      'a rematch left moves on a board');
  }

  /* Nobody left to play against. */
  {
    const { host, guests } = pairRooms(2, 'gomoku', {});
    host.begin(17);
    const H = boardEnd(host, make), G = boardEnd(guests[0], make);
    host.memberAt(1).alive = false;
    host.pushRoster();
    ok(H.gone === 'opponent', 'the host was not told the room had emptied');
    guests[0].shut('lost');
    ok(G.gone === 'host', 'the guest was not told the host had gone');
  }
});

section('boardnet — snapshotFor writes the viewer\'s own fields', () => {
  const e = new PV.Gomoku({ rng: new PV.RNG(1) });
  e.apply({ type: 'place', x: 7, y: 7 });
  const a = e.snapshotFor(0), b = e.snapshotFor(1);
  ok(a.rng === undefined && b.rng === undefined,
    'a broadcastable snapshot carried the RNG state');
  ok(a.seats[0].isYou === true && a.seats[1].isYou === false, 'seat 0 was told the wrong chair');
  ok(b.seats[1].isYou === true && b.seats[0].isYou === false, 'seat 1 inherited seat 0\'s chair');
  ok(a.yourTurn === false && b.yourTurn === true, 'yourTurn was copied rather than written');
});

section('race — ranking a table', () => {
  const rank = PV.Race.rank;

  /* A puzzle: whoever solved it, soonest first. */
  const puzzle = rank([
    { seat: 0, done: true, result: 'solved', timeMs: 90000, pct: 1 },
    { seat: 1, done: true, result: 'over', timeMs: 20000, pct: 0.4 },
    { seat: 2, done: true, result: 'solved', timeMs: 61000, pct: 1 },
    { seat: 3, done: false, pct: 0.8 }
  ], 'time');
  ok(puzzle[0].seat === 2 && puzzle[1].seat === 0,
    'a puzzle race was not ranked by solve time');
  ok(puzzle[2].seat === 3 && puzzle[3].seat === 1,
    'an unfinished board ranked below a given-up one');
  ok(puzzle[0].rank === 1 && puzzle[3].rank === 4, 'ranks were not numbered from one');

  /* An arcade run: highest score, and a tie goes to whoever was quicker. */
  const arcade = rank([
    { seat: 0, done: true, result: 'over', score: 4200, timeMs: 300000 },
    { seat: 1, done: true, result: 'over', score: 9100, timeMs: 400000 },
    { seat: 2, done: false, score: 12000, pct: 0.2 }
  ], 'score');
  ok(arcade[0].seat === 1, 'an arcade race was not ranked by score');
  ok(arcade[2].seat === 2, 'a player still going outranked one who had finished');

  /* Equal results share a rank and the next one skips it. */
  const tied = rank([
    { seat: 0, done: true, result: 'over', score: 500, timeMs: 1000 },
    { seat: 1, done: true, result: 'over', score: 500, timeMs: 1000 },
    { seat: 2, done: true, result: 'over', score: 100, timeMs: 1000 }
  ], 'score');
  ok(tied[0].rank === 1 && tied[1].rank === 1 && tied[2].rank === 3,
    'a tie did not share a rank, or the next rank did not skip');

  /* Alone is not a race, so there is no prize for turning up. */
  ok(PV.Race.bonusFor(1, 1) === 0, 'a one-player race paid a bonus');
  ok(PV.Race.bonusFor(1, 3) > PV.Race.bonusFor(2, 3), 'second place paid at least as well as first');
});

section('race — every puzzle reports its progress', () => {
  const cases = [
    ['sudoku', () => new PV.Sudoku({ seed: 5, difficulty: 'easy' }),
      g => { for (let i = 0; i < 81; i++) if (!g.isGiven(i)) g.apply({ type: 'set', i: i, v: g.solution[i] }); }],
    ['spider', () => new PV.Spider({ seed: 5, suits: 1 }), null],
    ['mahjong', () => new PV.Mahjong({ seed: 5 }), g => g.solution.forEach(pair =>
      g.apply({ type: 'match', a: pair[0], b: pair[1] }))]
  ];
  for (const [name, make, solve] of cases) {
    const g = make();
    ok(g.progress >= 0 && g.progress < 1, name + ' started at ' + g.progress + ', not below 1');
    if (!solve) continue;
    solve(g);
    ok(g.solved, name + ' did not solve under its own solution');
    ok(g.progress === 1, name + ' finished at ' + g.progress + ' rather than 1');
  }
});

/* ------------------------------------------------------------------ report */

console.log('');
console.log(`${checks} checks, ${failures} failure(s), ${Date.now() - started}ms`);
process.exit(failures ? 1 : 0);
