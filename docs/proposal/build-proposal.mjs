/**
 * PlayVault — the Word edition of the project proposal, generated from the
 * one source so the editions can never disagree. Adapted from the generator
 * behind MoneyFlow's and MiniShoppingMall's proposals. It needs two npm
 * packages, so it lives here with its own package.json, and PlayVault
 * itself still has no dependencies.
 *
 *   node build-proposal.mjs [--out=<file.docx>] [--pages=<pages.json>]
 *   (build.ps1 runs it twice and exports the PDF; see README.md here)
 *
 * docs/PROPOSAL.md                              the source — edit this
 *   -> docs/PlayVault-Project-Proposal.docx     cover, contents, numbered sections
 *
 * Figures are the images the Markdown links to in docs/img/. SVG diagrams are
 * rasterised with resvg; screenshots go in as they are.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, ExternalHyperlink, InternalHyperlink, Bookmark,
  TableOfContents, Header, Footer, PageNumber, LevelFormat, PositionalTab, PositionalTabAlignment,
  PositionalTabRelativeTo, PositionalTabLeader, VerticalAlign, HeightRule, TableLayoutType,
} from 'docx';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');                     // docs/proposal -> the repository
const DOCS = join(ROOT, 'docs');
const SRC = join(DOCS, 'PROPOSAL.md');
const NAME = 'PlayVault-Project-Proposal';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
const OUT = arg('out') || join(DOCS, NAME + '.docx');
/* The contents page is a real TOC field, pre-filled. WPS Office — which
   answers for Word.Application on this PC — shows a pre-filled field but
   cannot build one, so the page numbers come from a first layout pass:
   build, export, read where each heading landed from the PDF's bookmarks,
   then build again with --pages. Word can still refresh the field itself. */
const PAGES = arg('pages') ? JSON.parse(readFileSync(arg('pages'), 'utf8')) : null;

const REVISION = '2';
const DATE = '29 September 2026';
const DECIDE_BY = '2 October 2026';
const BASELINE = 'da85e98';
const TAGLINE = 'One Hub. Endless Games.';

// brass on steel, with the brass darkened wherever it carries text on white
const C = {
  ink: '171D26', body: '26303D', accent: '8A5A00', brass: 'B67512', gold: 'F6B32B',
  ground: 'FBF4E4', zebra: 'F6F7F9', rule: 'D5DBE3', muted: '5A6678',
  red: 'C0392B', amber: '9A6C08', green: '1E7F4A', code: '7A4E00', codeBg: 'F7F1E3',
};
// Calibri has no Chinese; Word would substitute anyway, but naming the
// East Asian face keeps 简体中文 in one consistent font in the PDF.
const FONT = { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Calibri', eastAsia: 'Microsoft YaHei' };
const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', cs: 'Consolas', eastAsia: 'Microsoft YaHei' };
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;       // A4, 2 cm margins
const CONTENT_W = PAGE_W - 2 * MARGIN;
const PX_W = Math.round(CONTENT_W / 1440 * 96);             // content width in 96-dpi px

/* ------------------------------------------------------------------ *
 * Markdown — the small subset PROPOSAL.md uses
 * ------------------------------------------------------------------ */

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens
const slug = (text) => text.toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const bookmarkId = (s) => ('s_' + s.replace(/[^a-z0-9]/g, '_')).slice(0, 40);

function inline(s) {
  const out = [];
  let i = 0, bold = false, ital = false, buf = '';
  const flush = () => { if (buf) { out.push({ text: buf, bold, ital }); buf = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { buf += s[i + 1]; i += 2; continue; }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { flush(); out.push({ text: s.slice(i + 1, j), bold, ital, code: true }); i = j + 1; continue; }
    }
    if (c === '*' && s[i + 1] === '*') { flush(); bold = !bold; i += 2; continue; }
    if (c === '*') { flush(); ital = !ital; i += 1; continue; }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(s.slice(i));
      if (m) { flush(); out.push({ text: m[1], bold, ital, href: m[2] }); i += m[0].length; continue; }
    }
    buf += c; i++;
  }
  flush();
  return out;
}
const plain = (s) => inline(s).map((t) => t.text).join('');

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  const out = []; let cur = '', code = false;
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (ch === '\\' && t[k + 1] === '|') { cur += '|'; k++; continue; }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

function parse(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = lines.findIndex((l) => l.startsWith('## '));    // the title block is the cover's job
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const body = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++; blocks.push({ type: 'code', lines: body }); continue;
    }
    const img = IMAGE.exec(line);
    if (img) { blocks.push({ type: 'figure', caption: img[1], src: img[2] }); i++; continue; }
    const h = /^(#{2,3}) (.*)$/.exec(line);
    if (h) { blocks.push({ type: 'h', level: h[1].length - 1, text: h[2] }); i++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      blocks.push({ type: 'table', head: splitRow(rows[0]), body: rows.slice(2).map(splitRow) }); continue;
    }
    if (/^- \[[ x]\] /.test(line)) {
      const items = [];
      while (i < lines.length && /^- \[[ x]\] /.test(lines[i])) items.push(lines[i++].slice(6));
      blocks.push({ type: 'check', items }); continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      blocks.push({ type: 'ul', items }); continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      blocks.push({ type: 'ol', items }); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||```|- |\d+\. |!\[)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const blocks = parse(readFileSync(SRC, 'utf8'));

// Section numbers first, so a link can say where it goes.
const sectionOf = {};
{
  let n1 = 0, n2 = 0;
  for (const b of blocks) {
    if (b.type !== 'h') continue;
    if (b.level === 1) { n1++; n2 = 0; b.num = `${n1}`; } else { n2++; b.num = `${n1}.${n2}`; }
    b.slug = slug(b.text);
    if (sectionOf[b.slug]) throw new Error('Two headings share the anchor #' + b.slug);
    sectionOf[b.slug] = b.num;
  }
}

function runs(s, o = {}) {
  const size = o.size || 21;
  const out = [];
  for (const t of inline(s)) {
    if (t.href) {
      const anchor = t.href.startsWith('#') ? t.href.slice(1) : null;
      const label = anchor && sectionOf[anchor] ? `${t.text} (§${sectionOf[anchor]})` : t.text;
      const run = new TextRun({ text: label, bold: t.bold || o.bold, italics: t.ital || o.ital, size, color: o.linkColor || C.accent, underline: {}, font: FONT });
      if (anchor) {
        if (!sectionOf[anchor]) throw new Error('Broken link #' + anchor);
        out.push(new InternalHyperlink({ anchor: bookmarkId(anchor), children: [run] }));
      } else {
        out.push(new ExternalHyperlink({ link: t.href, children: [run] }));
      }
      continue;
    }
    if (t.code) {
      out.push(new TextRun({
        text: t.text, font: MONO, size: Math.round(size * 0.9), bold: t.bold || o.bold,
        color: o.codeColor || C.code,
        shading: o.noCodeBg ? undefined : { type: ShadingType.CLEAR, color: 'auto', fill: C.codeBg },
      }));
      continue;
    }
    out.push(new TextRun({ text: t.text, bold: t.bold || o.bold, italics: t.ital || o.ital, size, color: o.color || C.body, font: FONT }));
  }
  return out;
}

function statusColor(text) {
  const t = plain(text).toLowerCase();
  if (/^(not met|open)/.test(t)) return C.red;
  if (/^(met|delivered|closed|verified|by design)/.test(t)) return C.green;
  if (/^(partial|accepted|unverified|\d+ of \d+)/.test(t)) return C.amber;
  return null;
}

// Width in Latin letters: a Chinese character takes the room of two.
const CJK = /[⺀-鿿豈-﫿＀-￯]/;
const vlen = (s) => { let n = 0; for (const ch of s) n += CJK.test(ch) ? 2 : 1; return n; };

// The narrowest a column can be without breaking a word in half. A run of
// Chinese is one word here: it may wrap between characters, but a name as
// short as 国际象棋 should not.
function minWidth(cells, header) {
  let longest = 0;
  for (const cell of cells) {
    for (const t of inline(cell || '')) {
      const per = t.code ? 96 : (header ? 112 : 104);
      for (const word of t.text.split(/[\s-]+/)) longest = Math.max(longest, vlen(word) * per);
    }
  }
  return Math.min(Math.max(720, longest + 280), Math.round(CONTENT_W * 0.45));
}

function colWidths(head, body) {
  const n = head.length, all = [head, ...body];
  const weights = [], mins = [];
  for (let c = 0; c < n; c++) {
    const lens = all.map((r) => vlen(plain(r[c] || '')));
    const max = Math.max(...lens);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    weights.push(Math.pow(Math.min(Math.max(0.55 * max + 0.45 * avg, 3), 70), 0.9));
    mins.push(Math.max(minWidth([head[c]], true), minWidth(body.map((r) => r[c]), false)));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let w = weights.map((x) => CONTENT_W * x / total);
  for (let iter = 0; iter < 8; iter++) {
    const deficit = w.reduce((a, x, c) => a + Math.max(0, mins[c] - x), 0);
    if (deficit < 1) break;
    const surplus = w.reduce((a, x, c) => a + Math.max(0, x - mins[c]), 0);
    w = w.map((x, c) => (x < mins[c] ? mins[c] : x - deficit * (x - mins[c]) / surplus));
  }
  const widths = w.map((x) => Math.round(x));
  const big = widths.indexOf(Math.max(...widths));
  widths[big] -= widths.reduce((a, b) => a + b, 0) - CONTENT_W;
  return widths;
}

const thin = { style: BorderStyle.SINGLE, size: 4, color: C.rule };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function table(head, body, o = {}) {
  const keyValue = head.every((h) => !h);
  const widths = o.widths || colWidths(keyValue ? body[0].map(() => '') : head, body);
  const statusCol = head.findIndex((h) => /^status$/i.test(plain(h)));
  const cellMargins = { top: 70, bottom: 70, left: 110, right: 110 };
  const rows = [];
  if (!keyValue) {
    rows.push(new TableRow({
      tableHeader: true, cantSplit: true,
      children: head.map((h, c) => new TableCell({
        width: { size: widths[c], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.ink },
        margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, keepNext: true, children: runs(h, { size: 18, bold: true, color: 'FFFFFF', codeColor: 'FFD27A', noCodeBg: true }) })],
      })),
    }));
  }
  const together = body.length <= 12;
  body.forEach((r, ri) => {
    const blank = r.slice(1).every((x) => !x);
    rows.push(new TableRow({
      cantSplit: true,
      height: blank && o.signing ? { value: 620, rule: HeightRule.ATLEAST } : undefined,
      children: r.map((cell, c) => {
        const isKey = keyValue && c === 0;
        const sc = c === statusCol ? statusColor(cell) : null;
        return new TableCell({
          width: { size: widths[c], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: isKey ? C.ground : (ri % 2 ? C.zebra : 'FFFFFF') },
          margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { before: 0, after: 0, line: 252 }, keepNext: together && ri < body.length - 1,
            children: runs(cell, { size: 18, bold: isKey || !!sc, color: sc || (isKey ? C.ink : C.body) }),
          })],
        });
      }),
    }));
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    // With Word 2007 compatibility (below), Word and WPS both put a table's
    // border one cell margin left of its indent; this puts it on the margin.
    indent: { size: cellMargins.left, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: thin, bottom: thin, left: none, right: none, insideHorizontal: thin, insideVertical: none },
    rows,
  });
}

const spacer = (after = 120) => new Paragraph({ spacing: { before: 0, after }, children: [] });

// An SVG diagram is rasterised at 2.5x its layout width; a screenshot goes in as it is.
function picture(src) {
  const file = join(DOCS, src);
  if (src.endsWith('.svg')) {
    const svg = readFileSync(file, 'utf8');
    const [, w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg).map(Number);
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: Math.round(w * 2.5) },
      font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
    }).render().asPng();
    return { data: png, w, h };
  }
  const data = readFileSync(file);
  return { data, w: data.readUInt32BE(16), h: data.readUInt32BE(20) };  // PNG IHDR
}

let figures = 0;
function figure(b) {
  const n = ++figures;
  const p = picture(b.src);
  const width = PX_W, height = Math.round(width * p.h / p.w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 160, after: 60 }, keepNext: true,
      children: [new ImageRun({
        type: 'png', data: p.data, transformation: { width, height },
        altText: { title: `Figure ${n}`, description: b.caption, name: b.src },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 220 },
      children: [new TextRun({ text: `Figure ${n} — ${b.caption}`, italics: true, size: 18, color: C.muted, font: FONT })],
    }),
  ];
}

// a sentence that introduces a table, figure or list stays on its page
const LEADS = new Set(['table', 'figure', 'code', 'ul', 'ol', 'check']);
// and a short list is not split across two
const together = (items, k) => items.length <= 8 && k < items.length - 1;

let olInstance = 0;
function body() {
  const out = [];
  let prev = null;
  blocks.forEach((b, bi) => {
    const next = blocks[bi + 1];
    // A section starts on a new page, so a spacer before one is worse than
    // useless: when a table ends at the foot of a page, the spacer alone
    // spills onto the next and leaves it blank.
    const beforeSection = !next || (next.type === 'h' && next.level === 1);
    const gap = (after) => { if (!beforeSection) out.push(spacer(after)); };
    switch (b.type) {
      case 'h':
        out.push(new Paragraph({
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          pageBreakBefore: b.level === 1, keepNext: true,
          children: [new Bookmark({ id: bookmarkId(b.slug), children: [new TextRun({ text: `${b.num}  ${plain(b.text)}` })] })],
        }));
        break;
      case 'p':
        out.push(new Paragraph({ spacing: { after: 140, line: 276 }, keepNext: !!next && LEADS.has(next.type), children: runs(b.text) }));
        break;
      case 'ul':
        b.items.forEach((it, k) => out.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80, line: 264 }, keepNext: together(b.items, k), children: runs(it) })));
        gap(60);
        break;
      case 'ol':
        olInstance++;
        b.items.forEach((it, k) => out.push(new Paragraph({ numbering: { reference: 'numbers', level: 0, instance: olInstance }, spacing: { after: 80, line: 264 }, keepNext: together(b.items, k), children: runs(it) })));
        gap(60);
        break;
      case 'check':
        b.items.forEach((it, k) => {
          out.push(new Paragraph({
            indent: { left: 440, hanging: 330 }, spacing: { after: 70 }, keepNext: together(b.items, k),
            children: [new TextRun({ text: '☐ ', size: 22, color: C.accent, font: 'Segoe UI Symbol' }), ...runs(it)],
          }));
        });
        gap(60);
        break;
      case 'code':
        b.lines.forEach((l, k) => {
          out.push(new Paragraph({
            spacing: { before: k === 0 ? 80 : 0, after: k === b.lines.length - 1 ? 180 : 0, line: 240 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.zebra },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.gold, space: 8 } },
            indent: { left: 200, right: 200 },
            keepLines: true, keepNext: k < b.lines.length - 1,
            children: [new TextRun({ text: l || ' ', font: MONO, size: 17, color: C.ink })],
          }));
        });
        break;
      case 'figure':
        out.push(...figure(b));
        break;
      case 'table': {
        const signing = prev && prev.type === 'h' && /sign-off/i.test(prev.text);
        out.push(table(b.head, b.body, signing ? { signing, widths: [2600, 3038, 2200, 1800] } : {}));
        gap(180);
        break;
      }
    }
    prev = b;
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * Front matter
 * ------------------------------------------------------------------ */

const tabRight = () => new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.NONE })] });

function cover() {
  const icon = new Resvg(readFileSync(join(ROOT, 'assets/logo/icon.svg'), 'utf8'), { fitTo: { mode: 'width', value: 512 } }).render().asPng();
  const ask = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, indent: { size: 300, type: WidthType.DXA }, columnWidths: [CONTENT_W], layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.ink },
      margins: { top: 220, bottom: 220, left: 300, right: 300 },
      children: [
        new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'THE ASK', bold: true, size: 17, color: C.gold, characterSpacing: 40, font: FONT })] }),
        new Paragraph({ spacing: { after: 0, line: 288 }, children: [new TextRun({ text: 'Approval for a twelve-week Phase 4 — friends who connect from any network, the Drive copy open to everyone, an address of its own, a seventeenth game, and sound, touch and contrast for a verified v1.0 — with one part-time developer (~120 hours) and RM 0 committed.', size: 22, color: 'FFFFFF', font: FONT })] }),
      ],
    })] })],
  });
  return [
    spacer(700),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: icon, transformation: { width: 124, height: 124 }, altText: { title: 'PlayVault icon', description: 'A bolted vault split down the middle, its doors parted on a seam of light, with a play button bridging both halves', name: 'icon' } })] }),
    new Paragraph({ spacing: { before: 360, after: 60 }, children: [new TextRun({ text: 'PROJECT PROPOSAL', bold: true, size: 22, color: C.accent, characterSpacing: 60, font: FONT })] }),
    new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: 'Play', bold: true, size: 88, color: C.ink, font: FONT }),
      new TextRun({ text: 'Vault', bold: true, size: 88, color: C.brass, font: FONT }),
    ] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Browser Game Hub — Board, Puzzle and Arcade', size: 32, color: C.ink, font: FONT })] }),
    new Paragraph({
      spacing: { after: 480 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.gold, space: 14 } },
      children: [
        new TextRun({ text: TAGLINE, italics: true, size: 24, color: C.muted, font: FONT }),
        tabRight(),
        new TextRun({ text: 'BOARD · PUZZLE · ARCADE', bold: true, size: 20, color: C.accent, characterSpacing: 40, font: FONT }),
      ],
    }),
    table(['', ''], [
      ['Prepared by', 'Kaon — developer and designer'],
      ['Revision', `${REVISION} · ${DATE}`],
      ['Status', 'Submitted for approval'],
      ['Decision requested by', DECIDE_BY],
      ['Live build', '[kaonhew02.github.io/PlayVault](https://kaonhew02.github.io/PlayVault/)'],
      ['Repository', '[github.com/KaonHew02/PlayVault](https://github.com/KaonHew02/PlayVault)'],
    ], { widths: [2600, CONTENT_W - 2600] }),
    spacer(600),
    ask,
  ];
}

const frontHeading = (text, o = {}) => new Paragraph({ style: 'FrontHeading', pageBreakBefore: !!o.pageBreak, children: [new TextRun(text)] });

function control() {
  return [
    frontHeading('Document control'),
    table(['', ''], [
      ['Document', 'PlayVault — Project Proposal'],
      ['Revision', `${REVISION}, ${DATE}`],
      ['Author', 'Kaon'],
      ['Status', `Submitted for approval — decision requested by ${DECIDE_BY}`],
      ['Baseline', `Repository \`KaonHew02/PlayVault\` at commit \`${BASELINE}\` (29 September 2026)`],
      ['Source of truth', '`docs/PROPOSAL.md` in the repository. This Word document and the PDF are generated from it by `docs/proposal/build.ps1`, so they never disagree'],
    ], { widths: [2400, CONTENT_W - 2400] }),
    spacer(240),
    new Paragraph({ style: 'FrontSub', children: [new TextRun('Revision history')] }),
    table(['Rev', 'Date', 'Summary'], [
      ['1', '29 Sep 2026', 'First issue — the case, objectives and players; the sixteen-game roster; architecture, playing with friends, data, and security with the lock of 29 September; design and stack; the plan, testing with that day\'s runs, risks, budget and roadmap; sign-off and glossary. Figures drawn from the source, and screenshots captured from the built bundle'],
      ['2', '29 Sep 2026', 'The silent save, fixed the same day (commit `1b334bc`): O15 met and R6 lowered, a new subsection and figure on a save that cannot be written, and week 3 and MS-2 without it; the repository\'s docs corrected (`da85e98`), so innerHTML again writes only the game icons; every figure refreshed to commit `da85e98` — lines, keys, checks (2,555,907), lock checks (79) and commits (44)'],
    ], { widths: [800, 1500, CONTENT_W - 2300] }),
    spacer(240),
    new Paragraph({ style: 'FrontSub', children: [new TextRun('How to read this proposal')] }),
    new Paragraph({ spacing: { after: 120, line: 276 }, children: runs('Sections 1–4 make the case: what PlayVault is, the problem it answers, and how success is measured. Sections 5–12 are the detail a reviewer needs to trust it — the players, the sixteen games, the architecture, playing with friends, the data, security, the design and the stack. Sections 13–17 are the proposal proper: the plan, how it is tested, what could go wrong, what it costs and what comes after. Section 18 asks for the decision, and section 19 is a glossary.') }),
  ];
}

// The library right-aligns page numbers at 9,025 twips; this page is wider.
class Contents extends TableOfContents {
  getTabStopsForLevel(level) { return super.getTabStopsForLevel(level, CONTENT_W); }
}

function contents() {
  const heads = blocks.filter((b) => b.type === 'h');
  if (PAGES && PAGES.length !== heads.length) throw new Error(`--pages has ${PAGES.length} entries for ${heads.length} headings`);
  const cachedEntries = heads.map((b, k) => ({
    title: `${b.num}  ${plain(b.text)}`,
    level: b.level,
    page: PAGES ? PAGES[k] : 88,          // two digits wide, like the real numbers
    href: bookmarkId(b.slug),
  }));
  return [
    frontHeading('Contents', { pageBreak: true }),
    new Contents('Contents', { hyperlink: true, headingStyleRange: '1-2', cachedEntries, beginDirty: false }),
  ];
}

/* ------------------------------------------------------------------ *
 * Document
 * ------------------------------------------------------------------ */

const header = new Header({ children: [new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.rule, space: 6 } },
  children: [
    new TextRun({ text: 'Play', bold: true, size: 17, color: C.ink, font: FONT }),
    new TextRun({ text: 'Vault', bold: true, size: 17, color: C.brass, font: FONT }),
    new TextRun({ text: '  ·  Project Proposal', size: 17, color: C.muted, font: FONT }),
    tabRight(),
    new TextRun({ text: `Revision ${REVISION} · ${DATE}`, size: 17, color: C.muted, font: FONT }),
  ],
})] });

const footer = new Footer({ children: [new Paragraph({
  children: [
    new TextRun({ text: TAGLINE, italics: true, size: 16, color: C.muted, font: FONT }),
    tabRight(),
    new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES_IN_SECTION], size: 16, color: C.muted, font: FONT }),
  ],
})] });

const page = { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 560, footer: 560 } };
const heading = (size, color, paragraph) => ({ run: { font: FONT, size, bold: true, color }, paragraph });
const h1Rule = { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.gold, space: 8 } };

const doc = new Document({
  // Word 2007 layout rules: WPS Office, which exports the PDF, lays tables
  // out that way whatever the file says, so Word is asked to agree with it.
  compatabilityModeVersion: 12,
  creator: 'Kaon',
  title: 'PlayVault — Project Proposal',
  subject: 'Browser Game Hub — Board, Puzzle and Arcade',
  description: `Project proposal, revision ${REVISION}, ${DATE}`,
  styles: {
    default: {
      document: { run: { font: FONT, size: 21, color: C.body }, paragraph: { spacing: { after: 120, line: 276 } } },
      heading1: heading(36, C.ink, { spacing: { before: 0, after: 240 }, border: h1Rule }),
      heading2: heading(26, C.accent, { spacing: { before: 320, after: 120 } }),
    },
    paragraphStyles: [
      { id: 'FrontHeading', name: 'Front Heading', basedOn: 'Normal', next: 'Normal', ...heading(36, C.ink, { spacing: { before: 0, after: 240 }, border: h1Rule }) },
      { id: 'FrontSub', name: 'Front Sub', basedOn: 'Normal', next: 'Normal', ...heading(26, C.accent, { spacing: { before: 120, after: 120 } }) },
      { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 21, color: C.ink }, paragraph: { spacing: { before: 100, after: 30 } } },
      { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { size: 19, color: C.body }, paragraph: { spacing: { before: 0, after: 6 }, indent: { left: 440 } } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { run: { color: C.brass }, paragraph: { indent: { left: 440, hanging: 280 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { run: { bold: true, color: C.accent }, paragraph: { indent: { left: 440, hanging: 330 } } } }] },
    ],
  },
  sections: [
    { properties: { page }, children: cover() },
    {
      properties: { page: { ...page, pageNumbers: { start: 1 } } },
      headers: { default: header }, footers: { default: footer },
      children: [...control(), ...contents(), ...body()],
    },
  ],
});

writeFileSync(OUT, await Packer.toBuffer(doc));
const heads = blocks.filter((b) => b.type === 'h');
const top = heads.filter((b) => b.level === 1).length;
console.log(`wrote ${OUT}`);
console.log(`  ${top} sections, ${heads.length - top} subsections, ${blocks.filter((b) => b.type === 'table').length} tables, ${figures} figures, contents ${PAGES ? 'with page numbers' : 'with placeholder page numbers'}`);
