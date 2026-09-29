// Lays the screenshots from screenshots.mjs out into the proposal's four
// photographic figures. The recipe below is the one behind the committed
// figures: which frame of which game, in which order, with which label.
//   node compose.mjs [--out=<dir>]        default: docs/img
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '.build', 'shots');
const outArg = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
const OUT = outArg ? resolve(outArg) : resolve(HERE, '..', 'img');

const NAMES = {
  gomoku: 'Gomoku', reversi: 'Reversi', chess: 'Chess', xiangqi: 'Chinese Chess', sudoku: 'Sudoku',
  spider: 'Spider Solitaire', mahjong: 'Mahjong Solitaire', tetris: 'Tetris', snake: 'Snake',
  worms: 'Worm Arena', crowd: 'Crowd Rush', towerdef: 'Tower Defense', fps: 'Strike Squad',
  hide: 'Blend In', chef: 'Street Chef', stick: 'Stick Clash',
};

// A tile is [shot, label]; with no label it takes the game's name from the
// shot's prefix. Frames: -a is as the game opens, -b after a little play.
const FIGURES = [
  { file: 'lobby.png', duo: ['lobby-dark', 'lobby-phone'] },
  { file: 'screens.png', cols: 3, w: 520, h: 325, tiles: [
    ['lobby-light', 'Lobby, light theme'], ['friends', 'Play with friends'], ['settings', 'Settings, your data']] },
  { file: 'games.png', cols: 4, w: 400, h: 250, tiles: [
    ['gomoku-b'], ['reversi-a'], ['chess-a'], ['xiangqi-a'], ['sudoku-a'], ['spider-a'], ['mahjong-a'], ['tetris-b'],
    ['snake-a'], ['worms-b'], ['crowd-b'], ['towerdef-b'], ['fps-play'], ['hide-b'], ['chef-level'], ['stick-b']] },
  { file: 'arcade3d.png', cols: 3, w: 520, h: 325, tiles: [
    ['fps-play', 'Strike Squad, first person'], ['crowd-b', 'Crowd Rush, in 3D'], ['hide-b', 'Blend In, paint to hide']] },
];

const png = (name) => fs.readFileSync(join(SHOTS, name + '.png'));
const size = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];             // PNG IHDR
const uri = (b) => 'data:image/png;base64,' + b.toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0D1218"/>${body}</svg>`;
const frame = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="#2A3441" stroke-width="1.5"/>`;
const label = (x, y, text) => `<text x="${x}" y="${y}" font-family="Segoe UI" font-size="15" font-weight="600" fill="#EAF0F7">${esc(text)}</text>`;

// A grid of tiles, each screenshot cropped to fill its tile, labelled beneath.
function sheet({ cols, w, h, tiles }) {
  const GAP = 12, LABEL = 26, PAD = 12, rows = Math.ceil(tiles.length / cols);
  const W = PAD * 2 + cols * w + (cols - 1) * GAP, H = PAD * 2 + rows * (h + LABEL) + (rows - 1) * GAP;
  let body = '';
  tiles.forEach(([shot, text], i) => {
    const b = png(shot), [iw, ih] = size(b);
    const x = PAD + (i % cols) * (w + GAP), y = PAD + Math.floor(i / cols) * (h + LABEL + GAP);
    const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    body += `<clipPath id="c${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/></clipPath>`
      + `<image clip-path="url(#c${i})" x="${x + (w - dw) / 2}" y="${y + (h - dh) / 2}" width="${dw}" height="${dh}" xlink:href="${uri(b)}"/>`
      + frame(x, y, w, h) + label(x + 4, y + h + 18, text || NAMES[shot.split('-')[0]] || shot);
  });
  return { svg: svgDoc(W, H, body), scale: 1 };
}

// A desktop screenshot and a phone one side by side, the same height.
function duo([desk, phone]) {
  const d = png(desk), p = png(phone), [dw, dh] = size(d), [pw, ph] = size(p);
  const H = 470, GAP = 28, PAD = 12, CAP = 28;
  const dW = Math.round(H * dw / dh), pW = Math.round(H * pw / ph);
  const W = PAD * 2 + dW + GAP + pW, T = PAD * 2 + H + CAP;
  const img = (b, x, w, id) => `<clipPath id="${id}"><rect x="${x}" y="${PAD}" width="${w}" height="${H}" rx="8"/></clipPath>`
    + `<image clip-path="url(#${id})" x="${x}" y="${PAD}" width="${w}" height="${H}" xlink:href="${uri(b)}"/>` + frame(x, PAD, w, H);
  const px = PAD + dW + GAP;
  const body = img(d, PAD, dW, 'd') + img(p, px, pW, 'p') + label(PAD + 4, PAD + H + 20, 'Desktop') + label(px + 4, PAD + H + 20, 'Phone');
  return { svg: svgDoc(W, T, body), scale: 2 };
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of FIGURES) {
  const { svg, scale } = f.duo ? duo(f.duo) : sheet(f);
  const width = Number(/width="(\d+)"/.exec(svg)[1]) * scale;
  const out = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
  fs.writeFileSync(join(OUT, f.file), out);
  console.log('wrote', join(OUT, f.file), Math.round(out.length / 1024) + ' KB');
}
