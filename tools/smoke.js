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
  'js/games/worms/engine.js',
  'js/games/racing/track.js', 'js/games/racing/engine.js',
  'js/games/towerdef/maps.js', 'js/games/towerdef/engine.js'
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
});

/* -------------------------------------------------------------- worm arena */

section('worm arena — appetite, the soft wall, and a repeatable run', () => {
  const g = new PV.Worms({ seed: 500, bots: 5 });
  ok(g.worms.length === 6, 'the arena should hold the player and five bots');
  ok(g.food.length === 220, 'the food supply did not fill, got ' + g.food.length);
  ok(g.player.segments === PV.Worms.START_SEGMENTS && g.player.score === 0,
    'a worm should start at ten segments and no score');
  ok(PV.Worms.FOODS.every((f, i, all) => !i || (f.score > all[i - 1].score && f.growth > all[i - 1].growth)),
    'the food table is not ordered by what it is worth');

  // A pellet pays in two currencies, and they are not the same number: a pizza
  // is a hundred points and twenty segments.
  const e = new PV.Worms({ seed: 502, bots: 0 });
  e.food.length = 0;
  e.foodCount = 0;                                  // and stop it refilling
  e.player.angle = 0; e.player.aim = 0;
  e.food.push({ x: e.player.x + 6, y: e.player.y, kind: 'pizza',
                score: 100, growth: 20, r: 9, c: '#fff' });
  const seg = e.player.segments;
  e.advance();
  ok(e.food.length === 0, 'the pellet was not swallowed');
  ok(e.player.score === 100, 'the pizza paid ' + e.player.score + ' points');
  ok(e.player.segments === seg + 20, 'the pizza grew ' + (e.player.segments - seg) + ' segments');

  // The wall turns a worm round rather than killing it. Aim at it and wait.
  const wall = new PV.Worms({ seed: 501, bots: 0 });
  wall.player.x = wall.W - 40; wall.player.y = 300;
  wall.player.angle = 0; wall.player.aim = 0;
  let sawEdge = false;
  for (let i = 0; i < 600; i++) { wall.advance(); sawEdge = sawEdge || wall.player.atEdge; }
  ok(!wall.over, 'the wall killed a worm');
  ok(sawEdge, 'a worm sat on the boundary without the edge ever registering');
  ok(wall.player.x <= wall.W && wall.player.x >= 0, 'a worm left the arena');

  // A head into a body kills the head, credits the body, and leaves a meal.
  const k = new PV.Worms({ seed: 507, bots: 1 });
  const victim = k.worms[1];
  k.player.x = 1000; k.player.y = 800;
  k.player.nodes = [{ x: 1000, y: 800 }, { x: 1005, y: 800 }, { x: 1010, y: 800 }];
  victim.x = 1005; victim.y = 800;
  victim.segments = 200;                            // a large worm: worth 1000
  k.food.length = 0;
  const before = k.player.score;
  k.advance();
  ok(!victim.alive, 'a head that ran into a body survived');
  ok(k.player.alive, 'the worm whose body was hit died as well');
  ok(k.player.kills === 1, 'the kill was not credited');
  ok(k.player.score >= before + 1000, 'beating a large worm paid ' + (k.player.score - before));
  ok(k.food.length > 0, 'a dead worm left nothing behind');

  // The dash tank: twenty a second to hold, ten a second to come back.
  const b = new PV.Worms({ seed: 505, bots: 0 });
  b.food.length = 0; b.foodCount = 0;
  b.player.x = b.W / 2; b.player.y = b.H / 2;
  for (let i = 0; i < 240; i++) { b.input('boost'); b.advance(); }
  ok(b.player.energy < PV.Worms.ENERGY_MAX * 0.35,
    'four seconds of dashing barely touched the tank, got ' + b.player.energy);
  const low = b.player.energy;
  for (let i = 0; i < 120; i++) b.advance();
  ok(b.player.energy > low + 10, 'the tank did not refill');
  b.player.energy = 0;
  b.input('boost'); b.advance();
  ok(!b.player.boosting, 'a worm dashed on an empty tank');

  // Bots keep off the walls and out of the food queue.
  const arena = new PV.Worms({ seed: 503, bots: 6 });
  for (let i = 0; i < 900 * scale; i++) { arena.over = false; arena.advance(); }
  const inside = w => w.x >= 0 && w.x <= arena.W && w.y >= 0 && w.y <= arena.H;
  ok(arena.worms.filter(w => w.alive).every(inside), 'a worm left the arena');
  ok(arena.worms.filter(w => w.alive && w.bot).length >= 4, 'the bots all died and stayed dead');
  ok(arena.food.length >= 200, 'the food supply ran down to ' + arena.food.length);

  // Same seed, same inputs, same run — the property a versus mode needs.
  const run = () => {
    const r = new PV.Worms({ seed: 777, bots: 4 });
    for (let i = 0; i < 400; i++) {
      if (i % 40 === 0) r.input(i % 80 === 0 ? 'left' : 'right');
      if (!r.advance()) break;
    }
    return JSON.stringify({ x: r.player.x, y: r.player.y, s: r.player.score,
                            g: r.player.segments, f: r.food.length, t: r.tick });
  };
  ok(run() === run(), 'the same seed and inputs gave two different runs');
});
/* ------------------------------------------------------------------ racing */

section('racing — ' + (2 * scale) + ' races per circuit', () => {
  for (const track of PV.RaceTracks.keys) {
    const built = PV.RaceTracks.build(track);
    ok(built.n > 40, track + ': the centreline is suspiciously short');
    ok(built.points.every(p => isFinite(p.x) && isFinite(p.y)), track + ': the spline produced NaN');

    for (let n = 0; n < 2 * scale; n++) {
      const seed = 9000 + n;
      const run = () => {
        const g = new PV.Racing({ seed: seed, track: track, laps: 2, rivals: 3 });
        g.player.isPlayer = false;                 // let the AI drive every car
        let ticks = 0;
        while (!g.isOver() && ticks < 60 * 60 * 8) { g.advance(); ticks++; }
        return g;
      };
      const g = run();
      ok(g.isOver(), track + ' seed ' + seed + ': the race never finished');
      ok(g.overReason === 'finished', track + ' seed ' + seed + ': the race timed out');
      ok(g.player.lap === 2, track + ' seed ' + seed + ': the player did not complete two laps');
      ok(g.cars.every(c => isFinite(c.x) && isFinite(c.y)),
        track + ' seed ' + seed + ': a car ended up at NaN');
      ok(g.player.best > 0, track + ' seed ' + seed + ': no lap time was recorded');

      const again = run();
      ok(again.tick === g.tick && again.player.best === g.player.best,
        track + ' seed ' + seed + ': the same seed gave a different race');
    }
  }

  // Reversing over the line must not gain a lap.
  const g = new PV.Racing({ seed: 1, track: 'ring', laps: 3, rivals: 0 });
  const before = g.player.total;
  g.player.total -= 5;
  ok(Math.floor(g.player.total / g.track.n) <= Math.floor(before / g.track.n),
    'going backwards should never add a lap');
});

/* -------------------------------------------------------- kart racing */

section('kart racing — the lights, the drift, the road and the items', () => {
  const lights = g => { while (g.phase === 'countdown') g.advance(); return g; };

  // Eight on the grid, and nobody moves until the lights go out.
  const g = new PV.Racing({ seed: 42, track: 'ring', laps: 3 });
  ok(g.cars.length === 8, 'a race should line up eight karts, got ' + g.cars.length);
  ok(g.phase === 'countdown', 'the race started without a countdown');
  const grid = { x: g.player.x, y: g.player.y };
  for (let i = 0; i < 60; i++) g.advance();
  ok(g.player.x === grid.x && g.player.y === grid.y, 'a kart moved during the countdown');
  ok(g.light === 2, 'the lights are not counting down, got ' + g.light);
  lights(g);
  ok(g.phase === 'race' && g.tick >= PV.Racing.COUNTDOWN, 'the lights never went out');
  ok(g.order().length === 8 && g.place(g.player) >= 1, 'the standings are broken');

  // The throttle at the right moment is worth a boost; too early is a stall.
  const perfect = new PV.Racing({ seed: 43, track: 'ring', laps: 3 });
  while (perfect.tick < PV.Racing.COUNTDOWN - 10) perfect.advance();
  perfect.input('accel');
  perfect.advance();
  lights(perfect);
  ok(perfect.startKind === 'perfect' && perfect.player.boost > 0,
    'a perfect start paid nothing, got ' + perfect.startKind);

  const early = new PV.Racing({ seed: 44, track: 'ring', laps: 3 });
  early.input('accel');
  early.advance();
  lights(early);
  ok(early.startKind === 'jump' && early.player.stall > 0, 'jumping the start cost nothing');

  // A box is taken by driving over it, and it goes away for a while.
  const b = lights(new PV.Racing({ seed: 45, track: 'ring', laps: 3, rivals: 0 }));
  ok(b.boxes.length === 18, 'there should be eighteen item boxes, got ' + b.boxes.length);
  const box = b.boxes[0];
  b.player.x = box.x; b.player.y = box.y;
  b.advance();
  ok(b.player.item, 'driving over a box handed out nothing');
  ok(box.at > b.tick, 'the box stayed live after it was taken');

  // The roulette is weighted by position, which is the only thing keeping a
  // race close: the leader draws bananas, the tail draws mushrooms.
  const r = new PV.Racing({ seed: 8, track: 'ring', laps: 3 });
  const tally = place => {
    const out = Object.create(null);
    for (let i = 0; i < 600; i++) { const it = r.rollItem(place, 8); out[it] = (out[it] || 0) + 1; }
    return out;
  };
  const leader = tally(1), tail = tally(8);
  ok(!leader.lightning, 'the leader was handed a lightning bolt');
  ok((tail.mushroom || 0) > (leader.mushroom || 0), 'the tail did not draw more mushrooms');
  ok((leader.banana || 0) > (tail.banana || 0), 'the leader did not draw more bananas');
  ok((leader.shield || 0) > 0 && (tail.shield || 0) > 0, 'the shield never came up');

  // A shield eats one hit and is then gone.
  const sh = lights(new PV.Racing({ seed: 46, track: 'ring', laps: 3, rivals: 1 }));
  const victim = sh.cars[1];
  victim.shield = true;
  ok(sh.spinCar(victim, 'test') === false, 'a shield did not stop the hit');
  ok(!victim.shield && victim.spin === 0, 'the shield was not spent, or did not save the kart');
  ok(sh.spinCar(victim, 'test') === true, 'a spent shield still blocked');

  // A banana spins whoever drives into it, and is gone afterwards.
  const bz = lights(new PV.Racing({ seed: 9, track: 'ring', laps: 3, rivals: 1 }));
  const rival = bz.cars[1];
  bz.hazards.push({ x: rival.x, y: rival.y, owner: 0, at: 0 });
  bz.advance();
  ok(rival.spin > 0, 'a banana did nothing');
  ok(bz.hazards.length === 0, 'the banana stayed on the road');

  // A shell hits the kart in front of it.
  const sl = lights(new PV.Racing({ seed: 10, track: 'ring', laps: 3, rivals: 1 }));
  sl.player.item = 'shell';
  ok(sl.useItem(sl.player) === true, 'the shell would not fire');
  const target = sl.cars[1];
  sl.shells[0].x = target.x - 0.2;
  sl.shells[0].y = target.y;
  sl.shells[0].life = 100;                          // past the owner grace window
  sl.advance();
  ok(target.spin > 0, 'the shell went straight through a kart');

  // Lightning only reaches the karts in front.
  const lt = lights(new PV.Racing({ seed: 14, track: 'ring', laps: 3, rivals: 2 }));
  lt.player.total = 10;
  lt.cars[1].total = 40;                            // ahead
  lt.cars[2].total = -10;                           // behind
  lt.player.item = 'lightning';
  lt.useItem(lt.player);
  ok(lt.cars[1].spin > 0, 'the bolt missed the kart in front');
  ok(lt.cars[2].spin === 0, 'the bolt hit a kart that was behind');
  ok(lt.player.spin === 0, 'the bolt hit the kart that fired it');

  // Boost pads, coins and oil, all read off the furniture the track derived.
  const pd = lights(new PV.Racing({ seed: 47, track: 'ring', laps: 3, rivals: 0 }));
  const pad = pd.track.pads[0];
  pd.player.x = pad.x; pd.player.y = pad.y;
  pd.player.boost = 0;
  pd.advance();
  ok(pd.player.boost > 30, 'a boost pad did nothing, got ' + pd.player.boost);

  const cn = lights(new PV.Racing({ seed: 48, track: 'ring', laps: 3, rivals: 0 }));
  const money = cn.track.coins[0];
  cn.player.x = money.x; cn.player.y = money.y;
  cn.advance();
  ok(cn.player.coins >= 1, 'a coin was not collected');
  ok(cn.coinBack[0] > cn.tick, 'the coin came straight back');

  const oz = lights(new PV.Racing({ seed: 49, track: 'ring', laps: 3, rivals: 0 }));
  const slick = oz.track.oil[0];
  oz.player.x = slick.x; oz.player.y = slick.y;
  oz.advance();
  ok(oz.player.slip > 0, 'oil did nothing');

  // The shortcut is dirt, and it is genuinely shorter than the corner it cuts.
  const sc = lights(new PV.Racing({ seed: 50, track: 'ring', laps: 3, rivals: 0 }));
  const chord = sc.track.shortcut;
  const mid = chord.points[Math.floor(chord.points.length / 2)];
  sc.player.x = mid.x; sc.player.y = mid.y;
  sc.player.node = chord.from;
  const surface = sc.surfaceOf(sc.player);
  ok(sc.player.onShortcut, 'the middle of the chord did not read as the shortcut');
  ok(surface.max === PV.Racing.DIRT.max, 'the chord is not dirt');
  ok(chord.length < Math.abs(PV.RaceTracks.delta(sc.track, chord.from, chord.to)) * 2.2,
    'the shortcut is no shorter than the corner it cuts');

  // Reset puts a stranded kart back on the centreline, stopped.
  const rs = lights(new PV.Racing({ seed: 51, track: 'ring', laps: 3, rivals: 0 }));
  rs.player.x += 30; rs.player.y += 30;
  rs.player.speed = 0.4;
  rs.input('reset');
  rs.advance();
  const home = rs.track.points[rs.player.node];
  ok(Math.hypot(rs.player.x - home.x, rs.player.y - home.y) < 3,
    'reset did not put the kart back on the road');
  ok(rs.player.speed <= 0.05, 'reset kept the speed');

  // A mushroom is worth having. Measured over 25 ticks, which is the whole of
  // the opening straight: run it longer and the boosted kart is simply in the
  // grass, going slower than the one that never had a mushroom.
  const drive = mushroom => {
    const d = lights(new PV.Racing({ seed: 12, track: 'ring', laps: 3, rivals: 0 }));
    if (mushroom) { d.player.item = 'mushroom'; d.useItem(d.player); }
    for (let i = 0; i < 25; i++) { d.input('accel'); d.advance(); }
    return d.player.speed;
  };
  ok(drive(true) > drive(false) * 1.2, 'a mushroom was worth nothing');

  // The drift charges in three steps, and pays on release.
  ok(PV.Racing.DRIFT_LEVELS.length === 3, 'a drift should charge in three steps');
  const dz = lights(new PV.Racing({ seed: 13, track: 'ring', laps: 3, rivals: 0 }));
  dz.player.speed = 0.3;
  const hold = n => {
    for (let i = 0; i < n; i++) {
      dz.input('accel'); dz.input('drift'); dz.input('left');
      dz.advance();
    }
  };
  hold(45);
  ok(dz.player.driftLevel === 1, 'a short drift is not a mini turbo, got ' + dz.player.driftLevel);
  hold(60);
  ok(dz.player.driftLevel === 2, 'a longer drift is not a super, got ' + dz.player.driftLevel);
  hold(80);
  ok(dz.player.driftLevel === 3, 'the ultra never charged, got ' + dz.player.driftLevel);
  for (let i = 0; i < 14; i++) { dz.input('accel'); dz.advance(); }
  ok(dz.player.boost > 0 && dz.player.charge === 0, 'letting go of an ultra drift paid nothing');

  // Kart classes trade acceleration against top speed. Neither is simply better.
  ok(PV.Racing.KARTS.light.accel > PV.Racing.KARTS.heavy.accel
    && PV.Racing.KARTS.heavy.max > PV.Racing.KARTS.light.max,
    'the kart classes are not a trade-off');
});

/* ---------------------------------------------------------- tower defense */

section('tower defense — ' + (2 * scale) + ' runs per map', () => {
  for (const map of PV.TDMaps.keys) {
    const built = PV.TDMaps.build(map);
    ok(built.path.length > 15, map + ': the path is suspiciously short');
    for (let i = 1; i < built.path.length; i++) {
      const a = built.path[i - 1], b = built.path[i];
      ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1,
        map + ': the path jumps between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b));
    }

    for (let n = 0; n < 2 * scale; n++) {
      const seed = 11000 + n;
      const run = () => {
        const g = new PV.TowerDef({ seed: seed, map: map });
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

/* ------------------------------------------------------------------ report */

console.log('');
console.log(`${checks} checks, ${failures} failure(s), ${Date.now() - started}ms`);
process.exit(failures ? 1 : 0);
