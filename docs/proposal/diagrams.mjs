// The proposal's diagrams, drawn as code so a figure is edited here, never
// by hand. The numbers in them are the proposal's: change one in both places.
//   node diagrams.mjs              writes docs/img/*.svg
//   node diagrams.mjs --preview    ...and .build/previews/*.png to look at
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'img');
const PREVIEW = process.argv.includes('--preview') ? join(HERE, '.build', 'previews') : null;
fs.mkdirSync(OUT, { recursive: true });
if (PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });

// brass on steel, darkened where it has to carry text on white
const K = {
  ink: '#171D26', steel: '#2A3441', tint: '#EEF1F5', brass: '#F6B32B', brassDk: '#8A5A00', brassTint: '#FFF6DD',
  rule: '#C9D1DC', muted: '#566579', text: '#26303D', white: '#FFFFFF', paper: '#FAFBFC',
  board: '#2F5E96', puzzle: '#1F7A6A', arcade: '#A85D00', shared: '#5B6B80', green: '#1E7F4A',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const doc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Segoe UI, Arial, sans-serif">
<defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${K.muted}"/></marker>
  <marker id="ab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${K.brassDk}"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="#FFFFFF"/>
${body}
</svg>`;

const rect = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 8}" fill="${o.fill || 'none'}" ${o.stroke ? `stroke="${o.stroke}" stroke-width="${o.sw || 1.5}"` : ''} ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
// lines: one string or an array; every line is its own tspan so nothing wraps by surprise
const text = (x, y, lines, o = {}) => {
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = o.size || 14, lh = o.lh || Math.round(size * 1.3);
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${o.weight || 400}" fill="${o.fill || K.text}" text-anchor="${o.anchor || 'start'}" ${o.italic ? 'font-style="italic"' : ''} ${o.spacing ? `letter-spacing="${o.spacing}"` : ''}>${arr.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;
};
const line = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || K.muted}" stroke-width="${o.sw || 1.6}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.arrow === false ? '' : `marker-end="url(#${o.brass ? 'ab' : 'ah'})"`}/>`;
const wrap = (s, n) => { const out = []; let cur = ''; for (const w of s.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };

const files = {};

/* ------------------------------------------------------------ 1. architecture */
{
  const W = 820, H = 574;
  let b = '';
  b += rect(16, 16, 584, 548, { fill: K.paper, stroke: K.rule });
  b += text(34, 42, 'THE PAGE  ·  ONE STATIC ORIGIN ON GITHUB PAGES', { size: 12.5, weight: 700, fill: K.muted, spacing: 0.6 });
  // the lock
  b += rect(36, 56, 544, 52, { fill: K.ink });
  b += text(52, 79, 'guard.js — the lock', { size: 16, weight: 700, fill: K.white });
  b += text(52, 98, 'first in the head · its own file, never bundled · off on localhost', { size: 13, fill: '#C9D1DC' });
  b += line(308, 108, 308, 126, { arrow: true });
  // the bundle
  b += rect(36, 126, 544, 338, { fill: K.brassTint, stroke: K.brass, sw: 2 });
  b += text(52, 151, 'playvault.min.js — 122 files, 1.25 MB (about 400 KB gzipped)', { size: 15, weight: 700, fill: K.brassDk });
  const rows = [
    ['Shell', ['js/app.js — lobby, play, stats, settings, friends,', 'and the hash route. It names no game.']],
    ['Games', ['16 folders, js/games/<code>/ — each one registers itself:', 'PV.Registry.add({ family, options, start })']],
    ['Harnesses', ['boardhost · loophost · boardnet · race', 'canvas, resize, full screen, pause, thumb pad, end card']],
    ['Contracts', ['board.js · puzzle.js · loop.js — three engine contracts.', 'Engines never touch the DOM, the profile or Math.random()']],
    ['Core', ['util · safe · rng · store · profile · i18n · icons', 'registry · cards · net · room · drive']],
  ];
  rows.forEach(([name, ls], i) => {
    const y = 166 + i * 58;
    b += rect(48, y, 520, 50, { fill: K.white, stroke: K.rule });
    b += rect(48, y, 96, 50, { fill: i === 1 ? K.arcade : K.steel, r: 8 });
    b += rect(128, y, 16, 50, { fill: i === 1 ? K.arcade : K.steel, r: 0 });
    b += text(96, y + 30, name, { size: 14.5, weight: 700, fill: K.white, anchor: 'middle' });
    b += text(156, y + 21, ls, { size: 13, lh: 18 });
  });
  b += line(308, 464, 308, 480, { arrow: true });
  b += rect(36, 480, 544, 66, { fill: K.tint, stroke: K.rule });
  b += text(52, 504, 'index.html', { size: 15, weight: 700, fill: K.ink });
  b += text(52, 525, 'Content-Security-Policy · SRI hash on PeerJS · the script order', { size: 13 });
  b += text(52, 540, 'The deployed page loads three scripts: the lock, PeerJS, the bundle', { size: 12, fill: K.muted });
  // outside the page
  const ext = [
    [90, 'This browser', ['localStorage, playvault.*', 'records sealed', '11 backup stores'], 'read / write', K.steel],
    [236, 'Google Drive', ['the player’s own', 'optional · off by default', 'playvault-data.json', 'scope: drive.file'], 'To / From Drive', K.board],
    [396, 'PeerJS broker', ['introductions only', 'then WebRTC, straight', 'between browsers'], 'room codes', K.puzzle],
  ];
  ext.forEach(([y, title, ls, tag, col]) => {
    const h = 30 + ls.length * 18 + 10;
    b += rect(636, y, 172, h, { fill: K.white, stroke: col, sw: 2 });
    b += rect(636, y, 172, 28, { fill: col, r: 8 });
    b += rect(636, y + 16, 172, 12, { fill: col, r: 0 });
    b += text(722, y + 19, title, { size: 14.5, weight: 700, fill: K.white, anchor: 'middle' });
    b += text(648, y + 50, ls, { size: 12.5, lh: 18 });
    const cy = y + h / 2;
    b += line(600, cy, 634, cy, { stroke: col, brass: false });
    b += text(617, cy - 6, '', { size: 11 });
  });
  b += rect(636, 516, 172, 38, { stroke: K.muted, dash: '5 4' });
  b += text(722, 540, 'a friend’s browser', { size: 13, anchor: 'middle', fill: K.muted });
  b += line(722, 492, 722, 514, { dash: '4 4' });
  files.architecture = doc(W, H, b);
}

/* ------------------------------------------------------------ 2. three families */
{
  const W = 820, H = 566;
  let b = '';
  const cols = [
    ['Board', '4 games', K.board, [
      ['CONTRACT', ['board.js — two seats,', 'strict alternation']], ['HARNESS', ['boardhost.js']],
      ['THE RULE', ['legalMoves() is the only source', 'of legality; apply() is the', 'only way in']],
      ['GAMES', ['Gomoku · Reversi · Chess', 'Chinese Chess']],
      ['WITH FRIENDS', ['Host authority: two seats,', 'turn by turn (boardnet.js)']]]],
    ['Puzzle', '3 games', K.puzzle, [
      ['CONTRACT', ['puzzle.js — one player,', 'a deal from a seed']], ['HARNESS', ['none — each puzzle draws', 'its own bar']],
      ['THE RULE', ['The deal is a pure function of', '(seed, difficulty); every move', 'returns its own inverse']],
      ['GAMES', ['Sudoku · Spider Solitaire', 'Mahjong Solitaire']],
      ['WITH FRIENDS', ['A race on one seed, ranked', 'by time (race.js)']]]],
    ['Arcade', '9 games', K.arcade, [
      ['CONTRACT', ['loop.js — a canvas and', 'a fixed-timestep loop']], ['HARNESS', ['loophost.js, for all but', 'Tetris, which draws its own']],
      ['THE RULE', ['60 Hz fixed timestep, input on', 'tick boundaries: a run replays', 'from its seed']],
      ['GAMES', ['Tetris · Snake · Worm Arena', 'Tower Defense · Crowd Rush', 'Strike Squad · Blend In', 'Stick Clash · Street Chef']],
      ['WITH FRIENDS', ['A race on one seed, ranked', 'by score (race.js)']]]],
  ];
  cols.forEach(([name, count, col, items], i) => {
    const x = 16 + i * 268, w = 252;
    b += rect(x, 16, w, 466, { fill: K.white, stroke: K.rule });
    b += rect(x, 16, w, 54, { fill: col });
    b += rect(x, 50, w, 20, { fill: col, r: 0 });
    b += text(x + 16, 49, name, { size: 22, weight: 700, fill: K.white });
    b += text(x + w - 16, 49, count, { size: 14, fill: K.white, anchor: 'end' });
    let y = 92;
    items.forEach(([label, ls]) => {
      b += text(x + 16, y, label, { size: 11.5, weight: 700, fill: K.muted, spacing: 0.8 });
      b += text(x + 16, y + 18, ls, { size: 13.5, lh: 18, fill: K.text });
      y += 18 + ls.length * 18 + 14;
    });
  });
  b += rect(16, 496, 788, 58, { fill: K.brassTint, stroke: K.brass, sw: 1.5 });
  b += text(32, 520, 'A new game changes no screen: it lives in js/games/<code>/, and outside it is only listed.', { size: 14.5, weight: 700, fill: K.brassDk });
  b += text(32, 540, 'Its index.js calls PV.Registry.add(); the lobby, statistics, option sheet and save format follow.', { size: 13, fill: K.text });
  files.families = doc(W, H, b);
}

/* ------------------------------------------------------------ 3. friends */
{
  const W = 820, H = 528;
  let b = '';
  b += rect(16, 12, 788, 40, { fill: K.tint, stroke: K.rule });
  b += text(410, 37, 'PeerJS broker: introductions only. After that, everything goes browser to browser — no server holds the game.', { size: 13.5, weight: 600, fill: K.ink, anchor: 'middle' });

  const lane = (y, title, col, boxes, note) => {
    let s = '';
    s += rect(16, y, 788, 216, { fill: K.white, stroke: K.rule });
    s += rect(16, y, 788, 34, { fill: col });
    s += rect(16, y + 20, 788, 14, { fill: col, r: 0 });
    s += text(32, y + 23, title, { size: 15, weight: 700, fill: K.white });
    const n = boxes.length, gap = 30, bw = Math.floor((788 - 32 - gap * (n - 1)) / n);
    boxes.forEach(([h, ls], i) => {
      const x = 32 + i * (bw + gap);
      s += rect(x, y + 52, bw, 92, { fill: K.tint, stroke: K.rule });
      s += text(x + 12, y + 76, h, { size: 14.5, weight: 700, fill: K.ink });
      s += text(x + 12, y + 97, ls, { size: 12.5, lh: 17 });
      if (i < n - 1) s += line(x + bw + 3, y + 98, x + bw + gap - 3, y + 98, { brass: false });
    });
    s += text(32, y + 170, note, { size: 12.5, lh: 18, fill: K.muted });
    return s;
  };
  b += lane(66, 'Board games — host authority', K.board, [
    ['Guest', ['asks: “move #n”', 'never applied locally']],
    ['Host', ['apply() checks', 'legalMoves(): accepts', 'or refuses']],
    ['Everyone, host too', ['post(accepted move,', 'its index) — one path', 'into every board']],
  ], ['A seat is taken from the connection, never from the message. The index is the whole resync protocol:', 'below our history we have it, equal we apply it, above we ask for the list and rebuild.']);
  b += lane(296, 'Puzzle and arcade — one shared seed', K.arcade, [
    ['Host', ['picks the game,', 'options and seed']],
    ['Every player', ['runs their own copy', 'from the same seed']],
    ['Progress line', ['about once a second,', 'and a finishing line']],
    ['Host ranks', ['one table, the same', 'on every screen']],
  ], ['Sixty frames a second over a public broker does not hold up; a seed does. A called race is settled on the score at that moment.', 'A patched client can still claim a score — inherent to peer-to-peer play without an authority, and written down in SECURITY.md.']);
  b += text(410, 494, '', { size: 1 });
  files.friends = doc(W, H, b.replace(/<text[^>]*font-size="1"[^>]*>.*?<\/text>/, ''));
}

/* ------------------------------------------------------------ 4. the lock */
{
  const W = 820, H = 470;
  let b = '';
  const band = (y, num, title, sub, col, rows) => {
    const h = 24 + rows.length * 26 + 10;
    let s = rect(16, y, 788, h, { fill: K.white, stroke: K.rule });
    s += rect(16, y, 210, h, { fill: col });
    s += rect(200, y, 26, h, { fill: col, r: 0 });
    s += text(34, y + 34, num, { size: 30, weight: 700, fill: K.brass });
    s += text(34, y + 60, title, { size: 15, weight: 700, fill: K.white });
    s += text(34, y + 80, sub, { size: 12, lh: 16, fill: '#D5DBE4' });
    s += text(244, y + 20, 'A FRIEND TRIES', { size: 10.5, weight: 700, fill: K.muted, spacing: 0.8 });
    s += text(566, y + 20, 'AND GETS', { size: 10.5, weight: 700, fill: K.muted, spacing: 0.8 });
    rows.forEach(([a, r], i) => {
      const ry = y + 44 + i * 26;
      s += text(244, ry, a, { size: 13 });
      s += text(534, ry, '→', { size: 14, fill: K.brassDk, weight: 700 });
      s += text(566, ry, r, { size: 13, weight: 600, fill: K.ink });
      if (i < rows.length - 1) s += `<line x1="244" y1="${ry + 9}" x2="790" y2="${ry + 9}" stroke="${K.tint}" stroke-width="1"/>`;
    });
    return [s, h];
  };
  let y = 12;
  const bands = [
    ['1', 'The lock', 'guard.js, first in the head', K.ink, [
      ['PV.Profile.addXp(…) pasted in the console', 'PV is undefined'],
      ['localStorage, textContent, .click(), .style …', 'Refused: “PlayVault is locked”'],
      ['Math.random, JSON.stringify or WebGL replaced', 'Frozen — cannot be replaced'],
      ['Elements panel: a number typed over', 'Put back at once, and logged'],
      ['F12, Ctrl+Shift+I, right-click', 'Nothing — a speed bump only']]],
    ['2', 'Seals', 'on every record and every backup', K.steel, [
      ['Edit coins in an export, then Import', 'Refused: the seal does not match'],
      ['Edit a value in the Application tab', 'Dropped on the next read'],
      ['The same edit, on the copy in Drive', 'Refused before it is summarised']]],
    ['3', 'Rebuild, never adopt', 'js/core/safe.js', K.shared, [
      ['A stored record, from any tool', 'Validated and clamped on every read'],
      ['A backup or Drive file', 'Rebuilt field by field; 4 MB cap'],
      ['A message from a peer in a room', 'Fields capped; the host decides']]],
  ];
  bands.forEach(([n, t, sub, col, rows]) => { const [s, h] = band(y, n, t, sub, col, rows); b += s; y += h + 10; });
  b += rect(16, y, 788, 44, { fill: K.brassTint, stroke: K.brass, sw: 1.5 });
  b += text(410, y + 19, 'Around all of it: Content-Security-Policy (no inline script, no eval) · SRI on PeerJS · no-referrer', { size: 13, weight: 600, fill: K.brassDk, anchor: 'middle' });
  b += text(410, y + 36, 'and the page is a picture, never the source of truth — no button trusts its own “disabled”', { size: 12.5, fill: K.text, anchor: 'middle' });
  files.lock = doc(W, y + 56, b);
}

/* ------------------------------------------------------------ 5. commits */
{
  const days = [
    ['7 Sep', 3, 'Hub shell and eleven games — all three engine contracts proven'],
    ['8 Sep', 6, 'Interface sizing · play with friends · Spider Solitaire · Worm Arena'],
    null,
    ['22 Sep', 9, 'Kart racing fixed, then removed · six-map Tower Defense · Crowd Rush · untrusted-input layer · one bundle, sealed records'],
    ['23 Sep', 2, 'Friends on other networks · option-sheet fixes'],
    ['24 Sep', 8, 'Crowd Rush levels, then rebuilt in 3D · Worm Arena rebuilt · playing-with-friends fixes'],
    ['25 Sep', 4, 'Google Drive copy · Strike Squad (first-person shooter) · Blend In (paint to hide)'],
    ['28 Sep', 8, 'Bot difficulty measured and eased · Stick Clash · Street Chef, 680 levels · full screen on every game'],
    ['29 Sep', 4, 'The lock · the project proposal · a save that cannot be written says so · the docs corrected'],
  ];
  const W = 820, rowH = 46, top = 52;
  let b = text(16, 28, '44 commits on 8 working days — bar length is commits that day', { size: 13.5, weight: 700, fill: K.ink });
  let y = top;
  days.forEach((d) => {
    if (!d) { b += rect(16, y + 2, 788, 22, { stroke: K.rule, dash: '4 4', r: 4 }); b += text(410, y + 18, '9 – 21 Sep · no commits', { size: 12.5, fill: K.muted, anchor: 'middle', italic: true }); y += 30; return; }
    const [date, n, note] = d;
    b += text(16, y + 27, date, { size: 14, weight: 700, fill: K.ink });
    b += rect(78, y + 8, n * 22, 26, { fill: K.brass, r: 5 });
    b += text(78 + n * 22 + 8, y + 27, String(n), { size: 14, weight: 700, fill: K.brassDk });
    b += text(318, y + 18, wrap(note, 76), { size: 12.5, lh: 16, fill: K.text });
    b += `<line x1="16" y1="${y + rowH - 3}" x2="804" y2="${y + rowH - 3}" stroke="${K.tint}"/>`;
    y += rowH;
  });
  files.commits = doc(W, y + 12, b);
}

/* ------------------------------------------------------------ 6. codebase */
{
  const items = [
    ['Strike Squad', 8018, 'arcade'], ['Core (js/core/)', 7734, 'shared'], ['Blend In', 5996, 'arcade'], ['Tests and tools', 5172, 'tools'],
    ['Street Chef', 5021, 'arcade'], ['Crowd Rush', 3836, 'arcade'], ['Stick Clash', 3695, 'arcade'], ['Worm Arena', 2861, 'arcade'],
    ['Stylesheet', 1410, 'shared'], ['Tower Defense', 1391, 'arcade'], ['Spider Solitaire', 903, 'puzzle'], ['Chess', 797, 'board'],
    ['Mahjong Solitaire', 733, 'puzzle'], ['Tetris', 707, 'arcade'], ['Chinese Chess', 628, 'board'], ['Sudoku', 627, 'puzzle'],
    ['Shell (js/app.js)', 581, 'shared'], ['Snake', 482, 'arcade'], ['Gomoku', 381, 'board'], ['Reversi', 378, 'board'],
  ];
  const col = { arcade: K.arcade, board: K.board, puzzle: K.puzzle, shared: K.shared, tools: K.ink };
  const W = 820, rowH = 23, top = 62, lx = 170, maxLen = 520;
  let b = text(16, 26, 'Lines by part — 44,783 lines of JavaScript in 123 files, plus the stylesheet, tests and tools', { size: 13.5, weight: 700, fill: K.ink });
  // legend
  [['Arcade', K.arcade], ['Board', K.board], ['Puzzle', K.puzzle], ['Shared', K.shared], ['Tests and tools', K.ink]].reduce((x, [n, c]) => {
    b += rect(x, 38, 12, 12, { fill: c, r: 2 }); b += text(x + 18, 49, n, { size: 12, fill: K.muted }); return x + 18 + n.length * 6.6 + 22;
  }, 16);
  items.forEach(([name, n, g], i) => {
    const y = top + i * rowH, len = Math.max(3, Math.round(n / 8018 * maxLen));
    b += text(lx - 10, y + 15, name, { size: 12.5, anchor: 'end', fill: K.text });
    b += rect(lx, y + 3, len, 16, { fill: col[g], r: 3 });
    b += text(lx + len + 7, y + 15, n.toLocaleString('en-US'), { size: 12, weight: 600, fill: K.ink });
  });
  files.codebase = doc(W, top + items.length * rowH + 14, b);
}

/* ------------------------------------------------------------ 7. phase 4 gantt */
{
  const W = 820, x0 = 214, x1 = 804, weeks = 12, ww = (x1 - x0) / weeks;
  const tasks = [
    ['Friends that connect: a TURN relay', 1, 2, K.puzzle, [['MS-1', 2]]],
    ['CI, Drive for everyone, the Tetris name', 3, 3, K.shared, [['MS-2', 3]]],
    ['Own address: decide on paper', 4, 4, K.board, [['MS-3', 4]]],
    ['Move to the chosen address', 5, 5, K.board, []],
    ['Game 17: a circuit racer', 6, 7, K.arcade, [['MS-4', 7]]],
    ['Sound, touch and contrast pass', 8, 9, K.arcade, [['MS-5', 9]]],
    ['Other browsers and real phones', 10, 10, K.board, []],
    ['Regression and security re-review', 11, 11, K.shared, [['MS-6', 11]]],
    ['Release v1.0 and handover', 12, 12, K.ink, [['MS-7', 12]]],
  ];
  const monthSpans = [['October', 1, 4], ['November', 5, 9], ['December', 10, 12]];
  const startDates = ['5 Oct', '12', '19', '26', '2 Nov', '9', '16', '23', '30', '7 Dec', '14', '21'];
  let b = '';
  monthSpans.forEach(([m, a, z]) => {
    b += rect(x0 + (a - 1) * ww, 12, (z - a + 1) * ww - 2, 24, { fill: K.ink, r: 4 });
    b += text(x0 + (a - 1) * ww + ((z - a + 1) * ww) / 2, 29, m, { size: 13, weight: 700, fill: K.white, anchor: 'middle' });
  });
  for (let w = 1; w <= weeks; w++) {
    b += text(x0 + (w - 0.5) * ww, 54, 'W' + w, { size: 12, weight: 700, fill: K.ink, anchor: 'middle' });
    b += text(x0 + (w - 0.5) * ww, 69, startDates[w - 1], { size: 10.5, fill: K.muted, anchor: 'middle' });
  }
  const rowH = 44, top = 82;
  tasks.forEach(([name, a, z, c, ms], i) => {
    const y = top + i * rowH;
    if (i % 2 === 0) b += rect(16, y, 788, rowH, { fill: K.tint, r: 0 });
    b += text(24, y + (name.length > 30 ? 19 : 26), name.length > 30 ? wrap(name, 30) : name, { size: 12.5, weight: 600, fill: K.ink, lh: 15 });
    b += rect(x0 + (a - 1) * ww + 2, y + 10, (z - a + 1) * ww - 4, 24, { fill: c, r: 5 });
    ms.forEach(([label, w]) => {
      const cx = x0 + w * ww - 10, cy = y + 22;
      b += `<path d="M${cx} ${cy - 9} L${cx + 9} ${cy} L${cx} ${cy + 9} L${cx - 9} ${cy} Z" fill="${K.brass}" stroke="${K.ink}" stroke-width="1.5"/>`;
      // the label sits beside its diamond; the last week has no room on the right
      b += w === weeks ? text(x0 + (a - 1) * ww - 8, cy + 4, label, { size: 11.5, weight: 700, fill: K.ink, anchor: 'end' })
        : text(cx + 16, cy + 4, label, { size: 11.5, weight: 700, fill: K.ink });
    });
  });
  const ly = top + tasks.length * rowH + 22;
  b += `<path d="M24 ${ly - 8} L33 ${ly + 1} L24 ${ly + 10} L15 ${ly + 1} Z" fill="${K.brass}" stroke="${K.ink}" stroke-width="1.5"/>`;
  b += text(42, ly + 5, 'Milestone — MS-1 16 Oct · MS-2 23 Oct · MS-3 30 Oct · MS-4 20 Nov · MS-5 4 Dec · MS-6 18 Dec · MS-7 23 Dec', { size: 12.5, fill: K.text });
  files.phase4 = doc(W, ly + 24, b);
}

for (const [name, svg] of Object.entries(files)) {
  fs.writeFileSync(join(OUT, name + '.svg'), svg);
  if (PREVIEW) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1640 }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
    fs.writeFileSync(join(PREVIEW, name + '.png'), png);
  }
  console.log('wrote', name + '.svg');
}
