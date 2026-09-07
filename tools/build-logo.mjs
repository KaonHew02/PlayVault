#!/usr/bin/env node
/**
 * PlayVault logo generator.
 *
 * This file is the ONLY place the mark is authored. Never hand-edit
 * assets/logo/*.svg — edit here and re-run:
 *
 *   node tools/build-logo.mjs
 *
 * Zero dependencies, SVG only (same rule as CardVerse's tools/build-logo.mjs).
 * assets/logo/preview.html is the contact sheet: it is what catches a mark that
 * dies at 16px, which no amount of reasoning about the geometry will.
 *
 * The mark: a bolted vault split down the middle, doors parted on a seam of
 * light, with the play button bridging both halves. Chosen 2026-09-07 over a
 * closed door, a combination dial and a PV monogram.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'logo');

/* ------------------------------------------------------------------ palettes */

const PALETTES = {
  brass: {                                  // canonical
    label: 'Brass on steel',
    plate: '#171D26', ring: '#2C3644', edge: '#44536A', bolt: '#6A7B93',
    face: '#0D1218', play: '#F6B32B', playHi: '#FFD87A', glow: '#FFC64B',
    ink: '#EAF0F7', sub: '#8494A8', page: '#0B0F14'
  },
  neon: {                                   // alternate, kept for dark-arcade UI
    label: 'Neon vault',
    plate: '#171034', ring: '#2B2263', edge: '#4C3CAB', bolt: '#8776E8',
    face: '#0D0922', play: '#25D8F2', playHi: '#A9F5FF', glow: '#7C5CFF',
    ink: '#EDE9FE', sub: '#9A8FD0', page: '#0A0718'
  }
};

const FONT = 'Segoe UI, system-ui, -apple-system, Inter, Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------------- helpers */

const r2 = n => Math.round(n * 100) / 100;
const polar = (cx, cy, r, deg) => {
  const a = deg * Math.PI / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
};

/** n dots evenly spread over `span` degrees starting at `from`. */
function dots(cx, cy, r, n, rad, fill, from = -90, span = 360) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = polar(cx, cy, r, from + span * i / n);
    s += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
  }
  return s;
}

/** Right-pointing play triangle, corners rounded by stroking with its own fill. */
function playTri(cx, cy, r, fill, round = 8) {
  const apex = `${r2(cx + r * 0.98)} ${r2(cy)}`;
  const top = `${r2(cx - r * 0.72)} ${r2(cy - r * 0.88)}`;
  const bot = `${r2(cx - r * 0.72)} ${r2(cy + r * 0.88)}`;
  return `<path d="M${top} L${apex} L${bot} Z" fill="${fill}" stroke="${fill}" `
       + `stroke-width="${round}" stroke-linejoin="round"/>`;
}

/** The two gradients every cut of the mark uses. */
const seamDefs = (p, u) => `
  <defs>
    <linearGradient id="seam-${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${p.playHi}" stop-opacity=".95"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow-${u}">
      <stop offset="0" stop-color="${p.glow}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

/* --------------------------------------------------------------------- marks */
/* All three cuts draw inside a 128x128 viewBox, centred on (64, 64).          */

/**
 * The full circular mark. Ten bolts, a frame ring, the seam and the play
 * button. This is the logo — use it at 40px and up.
 *
 * The seam has to stay narrow (10px of 128) and the triangle has to overlap
 * BOTH doors. The first cut had a 14px bright slit with the triangle sitting
 * inside it: it read as a vertical bar, and the play button vanished into it.
 */
const markFull = (p, u) => `${seamDefs(p, u)}
  <circle cx="64" cy="64" r="61" fill="${p.ring}"/>
  <circle cx="64" cy="64" r="60" fill="none" stroke="${p.edge}" stroke-width="2" opacity=".55"/>
  <circle cx="64" cy="64" r="56" fill="${p.face}"/>
  <rect x="57" y="13" width="14" height="102" rx="7" fill="url(#seam-${u})"/>
  <path d="M59 12 A52 52 0 0 0 59 116 Z" fill="${p.plate}" stroke="${p.edge}" stroke-width="1.6"/>
  <path d="M69 12 A52 52 0 0 1 69 116 Z" fill="${p.plate}" stroke="${p.edge}" stroke-width="1.6"/>
  ${dots(59, 64, 42, 5, 3.2, p.bolt, 130, 100)}
  ${dots(69, 64, 42, 5, 3.2, p.bolt, -50, 100)}
  <circle cx="64" cy="64" r="44" fill="url(#glow-${u})"/>
  ${playTri(65, 64, 24, p.play, 9)}`;

/**
 * Small-size cut, for 16-32px. Bolts and the inner frame stroke are dropped —
 * at 16px they turn into grey mush around the rim — and the play button grows
 * to fill the space they leave.
 */
const markSimple = (p, u) => `${seamDefs(p, u)}
  <circle cx="64" cy="64" r="62" fill="${p.ring}"/>
  <circle cx="64" cy="64" r="57" fill="${p.face}"/>
  <rect x="56" y="10" width="16" height="108" rx="8" fill="url(#seam-${u})"/>
  <path d="M59 8 A56 56 0 0 0 59 120 Z" fill="${p.plate}"/>
  <path d="M69 8 A56 56 0 0 1 69 120 Z" fill="${p.plate}"/>
  <circle cx="64" cy="64" r="34" fill="url(#glow-${u})"/>
  ${playTri(65, 64, 30, p.play, 8)}`;

/**
 * Square app-icon cut: full bleed, rounded corners, no bolts. Content sits
 * inside the central 80% so it survives an Android maskable crop.
 */
const markIcon = (p, u) => `${seamDefs(p, u)}
  <rect width="128" height="128" rx="28" fill="${p.ring}"/>
  <rect x="4" y="4" width="120" height="120" rx="25" fill="${p.face}"/>
  <rect x="56" y="10" width="16" height="108" rx="8" fill="url(#seam-${u})"/>
  <path d="M59 4 H29 a25 25 0 0 0 -25 25 V99 a25 25 0 0 0 25 25 H59 Z" fill="${p.plate}"/>
  <path d="M69 4 H99 a25 25 0 0 1 25 25 V99 a25 25 0 0 1 -25 25 H69 Z" fill="${p.plate}"/>
  ${dots(59, 64, 43, 3, 3, p.bolt, 145, 70)}
  ${dots(69, 64, 43, 3, 3, p.bolt, -35, 70)}
  <circle cx="64" cy="64" r="38" fill="url(#glow-${u})"/>
  ${playTri(65, 64, 27, p.play, 9)}`;

const CUTS = {
  full: { label: 'Full mark', note: 'The logo. 40px and up.', build: markFull },
  simple: { label: 'Small cut', note: 'Bolts dropped. 16–32px.', build: markSimple },
  icon: { label: 'App icon', note: 'Square, full bleed, maskable-safe.', build: markIcon }
};

/* ------------------------------------------------------------------ assembly */

const svg = (inner, w = 128, h = 128, vb = '0 0 128 128') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" `
  + `role="img" aria-label="PlayVault">${inner}\n</svg>\n`;

const wordmark = (p, x, y, size, anchor = 'start') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" `
  + `font-weight="700" letter-spacing="${r2(size * -0.024)}"`
  + `><tspan fill="${p.ink}">Play</tspan><tspan fill="${p.play}">Vault</tspan></text>`;

const slogan = (p, x, y, size, anchor = 'start') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" `
  + `font-weight="500" letter-spacing="${r2(size * 0.15)}" fill="${p.sub}">ONE HUB. ENDLESS GAMES.</text>`;

const lockupH = (p, u) => svg(`
  <g transform="translate(4 6)">${markFull(p, u)}</g>
  ${wordmark(p, 152, 72, 50)}
  ${slogan(p, 155, 100, 14.5)}`, 520, 140, '0 0 520 140');

const lockupV = (p, u) => svg(`
  <g transform="translate(86 8)">${markFull(p, u)}</g>
  ${wordmark(p, 150, 184, 46, 'middle')}
  ${slogan(p, 150, 211, 14.5, 'middle')}`, 300, 224, '0 0 300 224');

const wordmarkOnly = p => svg(`${wordmark(p, 0, 50, 64)}${slogan(p, 4, 78, 18)}`,
  420, 96, '0 0 420 96');

/** 1200x630 social / OG card. */
const socialCard = (p, u) => svg(`
  <defs>
    <radialGradient id="bg-${u}" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${p.ring}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${p.page}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${p.page}"/>
  <rect width="1200" height="630" fill="url(#bg-${u})"/>
  <g transform="translate(536 116) scale(1)">${markFull(p, `${u}-mark`)}</g>
  ${wordmark(p, 600, 396, 104, 'middle')}
  ${slogan(p, 600, 452, 26, 'middle')}`, 1200, 630, '0 0 1200 630');

/* --------------------------------------------------------------------- write */

mkdirSync(OUT, { recursive: true });
// Old concept files (door / dial / token) are no longer generated — clear them
// out so assets/logo only ever holds what this script just wrote.
for (const f of readdirSync(OUT)) {
  if (/^(mark|lockup)-(door|dial|token|open)/.test(f)) rmSync(join(OUT, f));
}

const written = [];
const put = (name, body) => { writeFileSync(join(OUT, name), body); written.push(name); };

for (const [pk, p] of Object.entries(PALETTES)) {
  const sfx = pk === 'brass' ? '' : `-${pk}`;
  put(`logo${sfx}.svg`, svg(markFull(p, `full-${pk}`)));
  put(`logo-simple${sfx}.svg`, svg(markSimple(p, `simple-${pk}`)));
  put(`icon${sfx}.svg`, svg(markIcon(p, `icon-${pk}`), 512, 512));
  put(`favicon${sfx}.svg`, svg(markIcon(p, `fav-${pk}`), 32, 32));
  put(`lockup${sfx}.svg`, lockupH(p, `lh-${pk}`));
  put(`lockup-stacked${sfx}.svg`, lockupV(p, `lv-${pk}`));
  put(`wordmark${sfx}.svg`, wordmarkOnly(p));
  put(`social${sfx}.svg`, socialCard(p, `oc-${pk}`));
}

/* ------------------------------------------------------------- contact sheet */

const SIZES = [128, 64, 40, 32, 24, 16];

function sheet() {
  const cols = Object.entries(CUTS).map(([key, c]) => {
    const rows = Object.entries(PALETTES).map(([pk, p]) => {
      const sizes = SIZES.map(s =>
        `<div class="s"><div class="box">${svg(c.build(p, `sh-${key}-${pk}-${s}`), s, s)}</div><b>${s}</b></div>`
      ).join('');
      return `<div class="pal"><span class="tag">${p.label}${pk === 'brass' ? ' · canonical' : ''}</span>`
           + `<div class="sizes">${sizes}</div></div>`;
    }).join('');
    return `<section class="col"><h2>${c.label}<code>${key}</code></h2><p>${c.note}</p>${rows}</section>`;
  }).join('');

  const onWhite = Object.entries(CUTS).map(([k, c]) =>
    `<div style="text-align:center">${svg(c.build(PALETTES.brass, `w-${k}`), 72, 72)}
     <div style="font-size:11px;color:#5E6D80">${c.label}</div></div>`).join('');

  return `<!doctype html>
<meta charset="utf-8">
<title>PlayVault — logo</title>
<link rel="icon" href="favicon.svg">
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:28px; background:#0B0F14; color:#EAF0F7;
         font:14px/1.5 "Segoe UI", system-ui, -apple-system, Inter, sans-serif; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.4px }
  .lede { color:#8494A8; margin:0 0 26px }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:18px }
  .col { background:#111721; border:1px solid #1E2836; border-radius:14px; padding:16px }
  .col h2 { font-size:15px; margin:0 0 4px; display:flex; align-items:center; gap:8px }
  .col h2 code { font:11px/1 ui-monospace,monospace; color:#8494A8; background:#0B0F14;
                 border:1px solid #1E2836; border-radius:6px; padding:4px 6px }
  .col p { color:#8494A8; font-size:12.5px; margin:0 0 14px }
  .pal { margin-bottom:14px }
  .tag { font-size:11px; letter-spacing:1.2px; text-transform:uppercase; color:#5E6D80 }
  .sizes { display:flex; align-items:flex-end; gap:12px; margin-top:8px; flex-wrap:wrap }
  .s { text-align:center }
  .s b { display:block; font-size:10px; color:#5E6D80; font-weight:500; margin-top:5px }
  .box { display:flex; align-items:center; justify-content:center }
  h3 { font-size:13px; letter-spacing:1.4px; text-transform:uppercase; color:#5E6D80;
       margin:30px 0 12px; border-top:1px solid #1E2836; padding-top:20px }
  .locks { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px }
  .lock { background:#111721; border:1px solid #1E2836; border-radius:14px; padding:12px;
          display:flex; align-items:center; justify-content:center }
  .lock svg { width:100%; height:auto; max-width:460px }
  .onwhite { background:#F4F6FA; border-radius:14px; padding:16px; display:flex; gap:26px;
             align-items:center; flex-wrap:wrap }
  .swatches { display:flex; gap:10px; flex-wrap:wrap }
  .sw { border-radius:10px; padding:10px 12px; font:11px/1.4 ui-monospace,monospace;
        border:1px solid #1E2836; min-width:104px }
</style>
<h1>PlayVault — logo</h1>
<p class="lede">One Hub. Endless Games. &nbsp;·&nbsp; Generated by <code>tools/build-logo.mjs</code> — never hand-edit the SVGs.</p>
<div class="grid">${cols}</div>
<h3>On a light surface</h3>
<div class="onwhite">${onWhite}</div>
<h3>Lockups</h3>
<div class="locks">
  <div class="lock">${lockupH(PALETTES.brass, 'p-lh')}</div>
  <div class="lock">${lockupV(PALETTES.brass, 'p-lv')}</div>
  <div class="lock">${wordmarkOnly(PALETTES.brass)}</div>
  <div class="lock">${lockupH(PALETTES.neon, 'p-lhn')}</div>
</div>
<h3>Social card — social.svg, 1200×630</h3>
<div class="lock" style="max-width:none">${socialCard(PALETTES.brass, 'p-oc')}</div>
<h3>Palette</h3>
<div class="swatches">
  ${Object.entries(PALETTES.brass).filter(([k]) => /^#/.test(String(PALETTES.brass[k])))
    .map(([k, v]) => `<div class="sw" style="background:${v};color:${
      ['play', 'playHi', 'glow', 'ink'].includes(k) ? '#0B0F14' : '#EAF0F7'}">${k}<br>${v}</div>`).join('')}
</div>
`;
}

put('preview.html', sheet());

console.log(`PlayVault logo · wrote ${written.length} files to assets/logo/`);
for (const f of written) console.log('  ' + f);
