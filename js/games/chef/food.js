/* 街头大厨 / Street Chef — the food of the twelve later streets.

   art.js draws the first five trucks' food and looks here (its FOOD table)
   for everything else, so a new street's food is added without touching
   the old drawings. Same rules as there: logical coordinates, a dark
   outline on round shapes, and scatter from a hash so nothing crawls.

   - ware: what a base is served on (a bun tray, a board, a bowl, a cup)
   - dish: a plate by its base — a hot dog, a sandwich, a stack of
     pancakes, a waffle, a cone, a steak or ribs, a pita, noodles, a
     cupcake, a coffee, ramen, a hot-chicken bun
   - part: one thing in a bin or on the hot plate
   - done / heat: a thing on the heat, raw to done
   - side, drink, liquid: served on their own, and the colour they pour */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const A = PV.ChefArt;
  const { rr, ell, circ, paint, line, mix, shade, hash, scatter, blob, leaf, steam, OL, TAU } = A;

  /* -------------------------------------------------------- small bits */

  function drizzle(c, x, y, w, amp, col, width, seed) {
    c.beginPath();
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const px = x - w / 2 + (i / n) * w, py = y + (i % 2 ? amp : -amp) + (hash(seed || 1, i) - 0.5) * amp * 0.6;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function berry(c, x, y, s) { circ(c, x, y, s); paint(c, '#3F51B5', '#1F2A6B', s * 0.2); circ(c, x - s * 0.3, y - s * 0.3, s * 0.25); paint(c, 'rgba(255,255,255,.45)'); }
  function cherry(c, x, y, s) {
    line(c, x, y - s * 0.8, x + s * 0.5, y - s * 1.8, '#4E7A22', s * 0.22);
    circ(c, x, y, s); paint(c, '#D7263D', '#7E1020', s * 0.18); circ(c, x - s * 0.35, y - s * 0.35, s * 0.25); paint(c, 'rgba(255,255,255,.6)');
  }
  function strawberry(c, x, y, s, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    c.beginPath(); c.moveTo(-s, -s * 0.5); c.quadraticCurveTo(0, -s * 0.9, s, -s * 0.5); c.quadraticCurveTo(s * 0.6, s, 0, s * 1.1); c.quadraticCurveTo(-s * 0.6, s, -s, -s * 0.5);
    paint(c, '#E8384F', '#8E1426', s * 0.14);
    for (let i = 0; i < 5; i++) { circ(c, -s * 0.4 + (i % 3) * s * 0.4, -s * 0.1 + Math.floor(i / 3) * s * 0.45, s * 0.07); paint(c, '#FFE39A'); }
    c.beginPath(); c.moveTo(-s * 0.6, -s * 0.6); c.lineTo(0, -s * 0.9); c.lineTo(s * 0.6, -s * 0.6); c.lineTo(0, -s * 0.45); c.closePath(); paint(c, '#4CAF3F');
    c.restore();
  }
  function banana(c, x, y, s) { ell(c, x, y, s, s * 0.8); paint(c, '#FFF0A8', '#C9A43A', s * 0.14); circ(c, x, y, s * 0.18); paint(c, '#D9B85A'); }
  function friedEgg(c, x, y, s, yolk) {
    blob(c, x, y, s, s * 0.62, 9, Math.round(x + y), 0.18); paint(c, '#FFFFFF', OL, s * 0.07);
    circ(c, x + s * 0.08, y - s * 0.05, s * 0.32); paint(c, yolk || '#FFB02E', '#D88A00', s * 0.05);
    circ(c, x - s * 0.02, y - s * 0.14, s * 0.1); paint(c, 'rgba(255,255,255,.6)');
  }
  function baconStrip(c, x, y, len, w, rot, col) {
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    c.beginPath(); c.moveTo(-len / 2, 0);
    for (let j = 1; j <= 5; j++) c.quadraticCurveTo(-len / 2 + (j - 0.5) * len / 5, j % 2 ? -w * 0.7 : w * 0.7, -len / 2 + j * len / 5, 0);
    c.strokeStyle = col || '#A33A1F'; c.lineWidth = w; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = 'rgba(255,220,200,.75)'; c.lineWidth = w * 0.25; c.stroke();
    c.restore();
  }
  function scoop(c, x, y, s, col, edge) {
    c.beginPath(); c.moveTo(x - s, y + s * 0.2);
    for (let i = 0; i <= 6; i++) c.quadraticCurveTo(x - s + (i + 0.5) * s / 3.5, y + s * 0.45, x - s + (i + 1) * s / 3.5, y + s * 0.2);
    c.bezierCurveTo(x + s * 1.05, y - s * 0.9, x - s * 1.05, y - s * 0.9, x - s, y + s * 0.2);
    paint(c, col, edge, s * 0.09);
    ell(c, x - s * 0.35, y - s * 0.35, s * 0.22, s * 0.12, -0.5); paint(c, 'rgba(255,255,255,.45)');
  }
  function sprinkles(c, x, y, rx, ry, seed, s) {
    const cols = ['#FF5C8A', '#4DB6E8', '#FFD23F', '#8BD17C', '#B983FF'];
    for (const p of scatter(12, seed, rx, ry)) {
      c.save(); c.translate(x + p.x, y + p.y); c.rotate(p.r * TAU);
      rr(c, -s, -s * 0.3, s * 2, s * 0.6, s * 0.3); paint(c, cols[Math.floor(p.r * 5) % 5]);
      c.restore();
    }
  }
  function pickleSlice(c, x, y, s) { ell(c, x, y, s, s * 0.8); paint(c, '#8DBF45', '#4E7A22', s * 0.14); circ(c, x, y, s * 0.5); paint(c, '#C9E28A'); }
  function bowl(c, x, y, r, outer, rim, inner) {
    c.beginPath(); c.moveTo(x - r * 0.9, y - r * 0.12); c.quadraticCurveTo(x - r * 0.84, y + r * 0.6, x, y + r * 0.62); c.quadraticCurveTo(x + r * 0.84, y + r * 0.6, x + r * 0.9, y - r * 0.12); c.closePath();
    paint(c, outer, OL, r * 0.05);
    ell(c, x, y - r * 0.12, r * 0.9, r * 0.28); paint(c, rim, OL, r * 0.045);
    ell(c, x, y - r * 0.1, r * 0.8, r * 0.22); paint(c, inner);
  }
  /** A glass, drawn from its foot at (x, y), r tall-ish; liq fills to f. */
  function glass(c, x, y, r, liq, f, wide) {
    const tw = r * (wide || 0.38), bw = r * (wide ? wide * 0.8 : 0.3);
    c.beginPath(); c.moveTo(x - tw, y - r); c.lineTo(x + tw, y - r); c.lineTo(x + bw, y); c.lineTo(x - bw, y); c.closePath();
    paint(c, 'rgba(220,240,255,.55)', OL, r * 0.05);
    if (f > 0.03) {
      const top = y - r * 0.94 * f, k = (tw - bw) * f * 0.94;
      c.beginPath(); c.moveTo(x - bw - k, top); c.lineTo(x + bw + k, top); c.lineTo(x + bw - r * 0.01, y - r * 0.03); c.lineTo(x - bw + r * 0.01, y - r * 0.03); c.closePath();
      paint(c, liq);
    }
    ell(c, x - tw * 0.5, y - r * 0.55, r * 0.035, r * 0.26); paint(c, 'rgba(255,255,255,.5)');
  }
  function mug(c, x, y, r, cup, liq, f) {
    rr(c, x - r * 0.4, y - r * 0.78, r * 0.8, r * 0.78, r * 0.12); paint(c, cup, OL, r * 0.05);
    c.beginPath(); c.arc(x + r * 0.44, y - r * 0.4, r * 0.16, -1.4, 1.4); c.strokeStyle = OL; c.lineWidth = r * 0.12; c.stroke(); c.strokeStyle = cup; c.lineWidth = r * 0.06; c.stroke();
    if (f > 0.05) { ell(c, x, y - r * (0.1 + 0.6 * f), r * 0.34, r * 0.08); paint(c, liq); }
  }

  /* ------------------------------------------------------------- wares */

  const board = (c, x, y, r, col) => {
    rr(c, x - r, y - r * 0.2, r * 2, r * 0.62, r * 0.14); paint(c, shade(col, -0.15), OL, r * 0.05);
    rr(c, x - r * 0.96, y - r * 0.24, r * 1.92, r * 0.52, r * 0.12); paint(c, col);
    for (let i = 0; i < 3; i++) line(c, x - r * 0.8, y - r * 0.12 + i * r * 0.14, x + r * 0.8, y - r * 0.12 + i * r * 0.14, 'rgba(90,50,20,.18)', r * 0.02);
  };
  const plate = (c, x, y, r, col) => { ell(c, x, y + r * 0.1, r, r * 0.55); paint(c, col || '#FFFFFF', OL, r * 0.05); ell(c, x, y + r * 0.08, r * 0.72, r * 0.38); paint(c, shade(col || '#EEF1F5', -0.04)); };
  const paperTray = (c, x, y, r, col) => {
    c.beginPath(); c.moveTo(x - r, y - r * 0.05); c.lineTo(x + r, y - r * 0.05); c.lineTo(x + r * 0.84, y + r * 0.42); c.lineTo(x - r * 0.84, y + r * 0.42); c.closePath();
    paint(c, col, OL, r * 0.05);
    for (let i = -3; i <= 3; i++) line(c, x + i * r * 0.26, y - r * 0.02, x + i * r * 0.22, y + r * 0.38, 'rgba(255,255,255,.35)', r * 0.04);
  };

  A.food({
    ware: {
      hdbun: (c, x, y, r) => paperTray(c, x, y, r, '#E23B3B'),
      brioche: (c, x, y, r) => paperTray(c, x, y, r, '#F2A91E'),
      toast: (c, x, y, r) => board(c, x, y, r, '#C98B4A'),
      steak: (c, x, y, r) => board(c, x, y, r, '#B07A45'),
      ribs: (c, x, y, r) => board(c, x, y, r, '#B07A45'),
      pita: (c, x, y, r) => paperTray(c, x, y, r, '#F4E7C9'),
      pancake: (c, x, y, r) => plate(c, x, y, r, '#FFFFFF'),
      waffle: (c, x, y, r) => plate(c, x, y, r, '#FFFFFF'),
      cupcake: (c, x, y, r) => { ell(c, x, y + r * 0.2, r * 0.8, r * 0.28); paint(c, '#F6D5E2', OL, r * 0.05); line(c, x, y + r * 0.2, x, y + r * 0.46, OL, r * 0.08); ell(c, x, y + r * 0.46, r * 0.36, r * 0.1); paint(c, '#F6D5E2', OL, r * 0.04); },
      noodles: (c, x, y, r) => bowl(c, x, y + r * 0.08, r * 0.95, '#FFFFFF', '#E9EEF3', '#F2F4F7'),
      ramen: (c, x, y, r) => bowl(c, x, y + r * 0.08, r * 0.98, '#2B2B2B', '#B82E2E', '#3A2A20'),
      shot: (c, x, y, r) => {
        ell(c, x, y + r * 0.26, r * 0.78, r * 0.22); paint(c, '#FFFFFF', OL, r * 0.05);
        ell(c, x, y + r * 0.24, r * 0.5, r * 0.12); paint(c, '#EEF1F5');
        c.beginPath(); c.moveTo(x - r * 0.52, y - r * 0.42); c.lineTo(x + r * 0.52, y - r * 0.42); c.quadraticCurveTo(x + r * 0.5, y + r * 0.26, x, y + r * 0.26); c.quadraticCurveTo(x - r * 0.5, y + r * 0.26, x - r * 0.52, y - r * 0.42);
        paint(c, '#FFFFFF', OL, r * 0.05);
        c.beginPath(); c.arc(x + r * 0.56, y - r * 0.12, r * 0.17, -1.4, 1.4); c.strokeStyle = OL; c.lineWidth = r * 0.12; c.stroke(); c.strokeStyle = '#FFFFFF'; c.lineWidth = r * 0.06; c.stroke();
        ell(c, x, y - r * 0.42, r * 0.52, r * 0.13); paint(c, '#E9EEF3', OL, r * 0.04);
      },
      cone: (c, x, y, r) => { rr(c, x - r * 0.5, y + r * 0.22, r, r * 0.22, r * 0.06); paint(c, '#C3CBD4', OL, r * 0.05); ell(c, x, y + r * 0.24, r * 0.2, r * 0.07); paint(c, '#8F99A5'); }
    },

    /* ------------------------------------------------------------ dishes */
    dish: {
      hdbun(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const w = r * 0.8, by = y + r * 0.02;
        rr(c, x - w, by - r * 0.16, w * 2, r * 0.3, r * 0.15); paint(c, '#D9963F', OL, r * 0.04);
        if (has('sausage')) { rr(c, x - w * 1.12, by - r * 0.3, w * 2.24, r * 0.22, r * 0.11); paint(c, '#B5462E', OL, r * 0.04); line(c, x - w * 0.9, by - r * 0.24, x + w * 0.9, by - r * 0.24, 'rgba(255,255,255,.3)', r * 0.03); }
        const top = by - r * 0.32;
        if (has('cheesesauce')) drizzle(c, x, top + r * 0.04, w * 1.7, r * 0.05, '#F7A51C', r * 0.08, 3);
        if (has('ketchup')) drizzle(c, x, top, w * 1.8, r * 0.06, '#D72C1E', r * 0.05, 5);
        if (has('mustard')) drizzle(c, x, top + r * 0.02, w * 1.8, r * 0.06, '#F5C400', r * 0.04, 9);
        if (has('relish')) for (const p of scatter(10, 13, w * 0.8, r * 0.03)) { rr(c, x + p.x - r * 0.03, top + p.y - r * 0.02, r * 0.06, r * 0.04, r * 0.01); paint(c, '#6BAA2F'); }
        if (has('onion')) for (const p of scatter(10, 17, w * 0.8, r * 0.03)) { rr(c, x + p.x - r * 0.025, top + p.y - r * 0.05, r * 0.05, r * 0.05, r * 0.01); paint(c, '#FFFFFF', '#B8AFC9', r * 0.01); }
        c.beginPath(); c.moveTo(x - w * 1.02, by - r * 0.08); c.quadraticCurveTo(x, by + r * 0.34, x + w * 1.02, by - r * 0.08); c.quadraticCurveTo(x + w, by + r * 0.14, x, by + r * 0.16); c.quadraticCurveTo(x - w, by + r * 0.14, x - w * 1.02, by - r * 0.08);
        paint(c, '#EDB35F', OL, r * 0.045);
      },
      toast(c, parts, x, y, r) { stack(c, parts, x, y, r, TOAST, ['ham', 'egg', 'cheddar', 'avocado', 'tomato', 'lettuce']); },
      brioche(c, parts, x, y, r) { stack(c, parts, x, y, r, BRIOCHE, ['hotchicken', 'hotsauce', 'honey', 'coleslaw', 'pickle']); },
      pancake(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        for (let i = 0; i < 3; i++) { ell(c, x, y + r * (0.06 - i * 0.1), r * 0.56, r * 0.18); paint(c, '#E9A94F', OL, r * 0.04); ell(c, x, y + r * (0.03 - i * 0.1), r * 0.5, r * 0.12); paint(c, '#F4C77A'); }
        const top = y - r * 0.2;
        if (has('bacon')) { baconStrip(c, x + r * 0.62, y + r * 0.1, r * 0.5, r * 0.07, -1.2); baconStrip(c, x + r * 0.74, y + r * 0.06, r * 0.46, r * 0.07, -1.1); }
        if (has('egg')) friedEgg(c, x - r * 0.62, y + r * 0.12, r * 0.24);
        if (has('banana')) for (const p of scatter(4, 23, r * 0.3, r * 0.06)) banana(c, x + p.x, top + p.y, r * 0.07);
        if (has('blueberry')) for (const p of scatter(6, 29, r * 0.32, r * 0.07)) berry(c, x + p.x, top + p.y, r * 0.045);
        if (has('syrup')) { blob(c, x, top, r * 0.3, r * 0.08, 8, 3, 0.2); paint(c, 'rgba(181,101,29,.85)'); rr(c, x + r * 0.22, top, r * 0.06, r * 0.22, r * 0.03); paint(c, 'rgba(181,101,29,.85)'); rr(c, x - r * 0.3, top, r * 0.06, r * 0.16, r * 0.03); paint(c, 'rgba(181,101,29,.85)'); }
        if (has('butter')) { rr(c, x - r * 0.1, top - r * 0.1, r * 0.2, r * 0.12, r * 0.03); paint(c, '#FFE58A', '#D9B400', r * 0.02); }
      },
      waffle(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        wafflePiece(c, x, y, r * 0.62, '#E6A04A');
        const top = y - r * 0.05;
        if (has('syrup')) { blob(c, x, top, r * 0.36, r * 0.12, 9, 5, 0.2); paint(c, 'rgba(181,101,29,.78)'); }
        if (has('choc')) drizzle(c, x, top - r * 0.02, r * 0.8, r * 0.07, '#5A2E1A', r * 0.05, 7);
        if (has('cream')) { blob(c, x, top - r * 0.12, r * 0.2, r * 0.13, 8, 9, 0.25); paint(c, '#FFFDF6', '#D6CDB8', r * 0.03); }
        if (has('strawberry')) { strawberry(c, x - r * 0.3, top - r * 0.06, r * 0.08, -0.4); strawberry(c, x + r * 0.3, top - r * 0.02, r * 0.08, 0.5); }
        if (has('banana')) for (const p of scatter(4, 31, r * 0.34, r * 0.1)) banana(c, x + p.x, top + p.y + r * 0.06, r * 0.07);
      },
      cone(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const cy = y + r * 0.24;
        c.beginPath(); c.moveTo(x - r * 0.3, cy - r * 0.46); c.lineTo(x + r * 0.3, cy - r * 0.46); c.lineTo(x, cy + r * 0.02); c.closePath();
        paint(c, '#E0A458', OL, r * 0.045);
        c.save(); c.clip();
        for (let i = -4; i <= 4; i++) { line(c, x + i * r * 0.1, cy - r * 0.5, x + i * r * 0.1 + r * 0.3, cy, '#B97A35', r * 0.02); line(c, x + i * r * 0.1, cy - r * 0.5, x + i * r * 0.1 - r * 0.3, cy, '#B97A35', r * 0.02); }
        c.restore();
        let top = cy - r * 0.46;
        const flavours = [['vanilla', '#FFF6DC', '#D8C9A0'], ['chocscoop', '#7A4A2E', '#4A2A18'], ['strawscoop', '#FFB3C7', '#D16F8E']];
        for (const [id, col, edge] of flavours) {
          if (!has(id)) continue;
          scoop(c, x, top - r * 0.08, r * 0.3, col, edge);
          top -= r * 0.26;
        }
        if (has('hotfudge')) drizzle(c, x, top + r * 0.14, r * 0.44, r * 0.05, '#4A2413', r * 0.06, 11);
        if (has('sprinkles')) sprinkles(c, x, top + r * 0.1, r * 0.22, r * 0.07, 19, r * 0.025);
        if (has('cherry')) cherry(c, x, top + r * 0.02, r * 0.06);
      },
      steak(c, parts, x, y, r) { meat(c, parts, x, y, r, false); },
      ribs(c, parts, x, y, r) { meat(c, parts, x, y, r, true); },
      pita(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const py = y + r * 0.04, w = r * 0.62;
        c.beginPath(); c.moveTo(x - w, py - r * 0.04); c.quadraticCurveTo(x, py - r * 0.36, x + w, py - r * 0.04); c.closePath(); paint(c, '#D9A866', OL, r * 0.035);
        const bump = (col, edge, lift, size, seed, n) => {
          for (let i = 0; i < n; i++) { const px = x - w * 0.75 + (i + 0.5) * (w * 1.5 / n); circ(c, px, py - r * lift - hash(seed, i) * r * 0.05, r * size); paint(c, col, edge, r * 0.02); }
        };
        if (has('hummus')) bump('#E7CFA0', '#B99A5E', 0.1, 0.09, 3, 6);
        if (has('falafel')) bump('#8B5A2B', '#4E2E12', 0.16, 0.085, 5, 5);
        if (has('shawarma')) for (let i = 0; i < 5; i++) { rr(c, x - w * 0.7 + i * w * 0.3, py - r * 0.24, r * 0.2, r * 0.08, r * 0.03); paint(c, '#B8753A', '#6E3E14', r * 0.02); }
        if (has('lettuce')) bump('#76C653', '#3C7F25', 0.22, 0.07, 7, 7);
        if (has('tomato')) for (let i = 0; i < 3; i++) { circ(c, x - w * 0.45 + i * w * 0.45, py - r * 0.24, r * 0.06); paint(c, '#E8402E', '#9E2014', r * 0.02); }
        if (has('pickle')) for (let i = 0; i < 2; i++) pickleSlice(c, x - w * 0.2 + i * w * 0.5, py - r * 0.28, r * 0.05);
        if (has('tahini')) drizzle(c, x, py - r * 0.3, w * 1.4, r * 0.05, '#F4E7C9', r * 0.05, 13);
        c.beginPath(); c.moveTo(x - w * 1.02, py - r * 0.04); c.bezierCurveTo(x - w * 0.95, py + r * 0.42, x + w * 0.95, py + r * 0.42, x + w * 1.02, py - r * 0.04);
        c.bezierCurveTo(x + w * 0.6, py + r * 0.1, x - w * 0.6, py + r * 0.1, x - w * 1.02, py - r * 0.04);
        paint(c, '#EBC48A', OL, r * 0.04);
        for (let i = 0; i < 5; i++) { circ(c, x - w * 0.5 + i * w * 0.25, py + r * (0.18 + 0.03 * Math.sin(i)), r * 0.018); paint(c, '#B98A4A'); }
      },
      noodles(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const cy = y - r * 0.02;
        const col = has('soysauce') ? '#C98E4F' : '#F2D27A';
        noodleNest(c, x, cy, r * 0.62, col, 11);
        if (has('bokchoy')) { leaf(c, x - r * 0.36, cy - r * 0.08, r * 0.14, -0.4, '#6DBE55'); leaf(c, x - r * 0.24, cy - r * 0.14, r * 0.12, 0.3, '#8BD17C'); }
        if (has('tofu')) for (const [dx, dy] of [[0.18, -0.1], [0.32, -0.02], [0.06, -0.02]]) { rr(c, x + dx * r - r * 0.06, cy + dy * r - r * 0.06, r * 0.12, r * 0.12, r * 0.02); paint(c, '#F4EBD2', '#C9B98E', r * 0.02); }
        if (has('shrimp')) for (const [dx, dy] of [[-0.1, -0.12], [0.2, -0.14]]) shrimpCurl(c, x + dx * r, cy + dy * r, r * 0.1, '#FF8A5C');
        if (has('chili')) for (const p of scatter(8, 37, r * 0.4, r * 0.1)) { circ(c, x + p.x, cy - r * 0.08 + p.y, r * 0.02); paint(c, '#D7301F'); }
        if (has('scallion')) for (const p of scatter(8, 41, r * 0.38, r * 0.1)) { ell(c, x + p.x, cy - r * 0.1 + p.y, r * 0.03, r * 0.02); paint(c, '#5DBB4A', '#2E7A24', r * 0.01); }
      },
      cupcake(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const by = y + r * 0.12;
        c.beginPath(); c.moveTo(x - r * 0.36, by - r * 0.26); c.lineTo(x + r * 0.36, by - r * 0.26); c.lineTo(x + r * 0.26, by + r * 0.12); c.lineTo(x - r * 0.26, by + r * 0.12); c.closePath();
        paint(c, '#7FC8F8', OL, r * 0.04);
        for (let i = 0; i < 6; i++) line(c, x - r * 0.3 + i * r * 0.12, by - r * 0.24, x - r * 0.22 + i * r * 0.09, by + r * 0.1, 'rgba(255,255,255,.55)', r * 0.03);
        ell(c, x, by - r * 0.28, r * 0.38, r * 0.14); paint(c, '#E9B96E', OL, r * 0.035);
        let top = by - r * 0.32;
        const ice = has('icing') ? ['#FF9EC4', '#D1558A'] : (has('chocicing') ? ['#6B3E26', '#3E2112'] : null);
        if (ice) {
          for (let i = 0; i < 3; i++) { ell(c, x, top - i * r * 0.1, r * (0.36 - i * 0.1), r * 0.1); paint(c, ice[0], ice[1], r * 0.03); }
          c.beginPath(); c.moveTo(x - r * 0.08, top - r * 0.3); c.quadraticCurveTo(x, top - r * 0.42, x + r * 0.04, top - r * 0.28); paint(c, ice[0], ice[1], r * 0.03);
          top -= r * 0.28;
        }
        if (has('sprinkles')) sprinkles(c, x, top + r * 0.14, r * 0.26, r * 0.08, 43, r * 0.022);
        if (has('blueberry')) for (const [dx, dy] of [[-0.18, 0.12], [0.18, 0.1], [0.02, 0.16]]) berry(c, x + dx * r, top + dy * r, r * 0.045);
        if (has('cherry')) cherry(c, x, top - r * 0.02, r * 0.06);
      },
      shot(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const top = y - r * 0.42;
        ell(c, x, top, r * 0.46, r * 0.11); paint(c, has('milk') ? '#F0DDBF' : '#4A2A18');
        if (has('milk')) { c.beginPath(); c.moveTo(x, top + r * 0.06); c.bezierCurveTo(x - r * 0.18, top - r * 0.04, x - r * 0.08, top - r * 0.1, x, top - r * 0.02); c.bezierCurveTo(x + r * 0.08, top - r * 0.1, x + r * 0.18, top - r * 0.04, x, top + r * 0.06); paint(c, '#C98E5A'); }
        if (has('caramel')) drizzle(c, x, top - r * 0.02, r * 0.66, r * 0.03, '#C9822B', r * 0.035, 17);
        if (has('choc')) drizzle(c, x, top + r * 0.01, r * 0.62, r * 0.03, '#5A2E1A', r * 0.035, 19);
        if (has('cream')) {
          blob(c, x, top - r * 0.12, r * 0.4, r * 0.18, 9, 11, 0.2); paint(c, '#FFFDF6', '#D6CDB8', r * 0.03);
          blob(c, x, top - r * 0.26, r * 0.22, r * 0.12, 8, 12, 0.2); paint(c, '#FFFDF6', '#D6CDB8', r * 0.03);
          if (has('caramel')) drizzle(c, x, top - r * 0.2, r * 0.4, r * 0.04, '#C9822B', r * 0.035, 21);
          if (has('choc')) drizzle(c, x, top - r * 0.16, r * 0.4, r * 0.04, '#5A2E1A', r * 0.035, 23);
        }
        if (has('cinnamon')) for (const p of scatter(14, 47, r * 0.36, r * 0.07)) { circ(c, x + p.x, top - (has('cream') ? r * 0.2 : 0) + p.y, r * 0.014); paint(c, '#8A4A1E'); }
      },
      ramen(c, parts, x, y, r) {
        const has = p => parts.indexOf(p) >= 0;
        const cy = y - r * 0.02;
        ell(c, x, cy, r * 0.78, r * 0.2); paint(c, '#E8B96A');
        noodleNest(c, x, cy + r * 0.02, r * 0.5, '#F6D98A', 5, 0.7);
        if (has('nori')) { c.save(); c.translate(x + r * 0.46, cy - r * 0.2); c.rotate(0.2); rr(c, -r * 0.1, -r * 0.2, r * 0.2, r * 0.34, r * 0.02); paint(c, '#1F3A2A', '#0C1A12', r * 0.02); c.restore(); }
        if (has('chashu')) for (const dx of [-0.34, -0.14]) { ell(c, x + dx * r, cy - r * 0.04, r * 0.13, r * 0.08); paint(c, '#C98D6A', '#6E3E24', r * 0.025); ell(c, x + dx * r, cy - r * 0.04, r * 0.07, r * 0.04); paint(c, '#F2D6C2'); }
        if (has('softegg')) for (const dx of [0.14, 0.3]) { ell(c, x + dx * r, cy - r * 0.02, r * 0.09, r * 0.07); paint(c, '#FFFFFF', OL, r * 0.02); circ(c, x + dx * r, cy - r * 0.02, r * 0.045); paint(c, '#FF9F1C'); }
        if (has('sweetcorn')) for (const p of scatter(10, 53, r * 0.14, r * 0.05)) { circ(c, x - r * 0.02 + p.x, cy + r * 0.06 + p.y, r * 0.022); paint(c, '#FFD23F', '#C99A00', r * 0.008); }
        if (has('chili')) for (const p of scatter(8, 59, r * 0.4, r * 0.1)) { circ(c, x + p.x, cy + p.y, r * 0.018); paint(c, '#D7301F'); }
        if (has('scallion')) for (const p of scatter(9, 61, r * 0.42, r * 0.1)) { ell(c, x + p.x, cy + p.y, r * 0.028, r * 0.018); paint(c, '#5DBB4A', '#2E7A24', r * 0.008); }
      }
    }
  });

  /* ------------------------------------------------ stacks and friends */

  const TOAST = {
    bottom(c, x, y, w, r) { rr(c, x - w, y - r * 0.1, w * 2, r * 0.16, r * 0.05); paint(c, '#E0A458', OL, r * 0.04); line(c, x - w * 0.9, y - r * 0.05, x + w * 0.9, y - r * 0.05, '#F4DDB0', r * 0.03); return r * 0.1; },
    top(c, x, y, w, r) {
      c.beginPath(); c.moveTo(x - w, y); c.lineTo(x - w, y - r * 0.14); c.quadraticCurveTo(x - w, y - r * 0.28, x - w * 0.6, y - r * 0.28); c.lineTo(x + w * 0.6, y - r * 0.28); c.quadraticCurveTo(x + w, y - r * 0.28, x + w, y - r * 0.14); c.lineTo(x + w, y); c.closePath();
      paint(c, '#E0A458', OL, r * 0.04);
      for (let i = 0; i < 3; i++) line(c, x - w * 0.6 + i * w * 0.6, y - r * 0.24, x - w * 0.4 + i * w * 0.6, y - r * 0.04, '#9E5A22', r * 0.04);
    }
  };
  const BRIOCHE = {
    bottom(c, x, y, w, r) {
      c.beginPath(); c.moveTo(x - w, y - r * 0.08); c.lineTo(x + w, y - r * 0.08); c.quadraticCurveTo(x + w, y + r * 0.12, x, y + r * 0.12); c.quadraticCurveTo(x - w, y + r * 0.12, x - w, y - r * 0.08);
      paint(c, '#E8A33C', OL, r * 0.045);
      return r * 0.08;
    },
    top(c, x, y, w, r) {
      c.beginPath(); c.moveTo(x - w * 1.02, y); c.bezierCurveTo(x - w, y - r * 0.5, x + w, y - r * 0.5, x + w * 1.02, y); c.closePath();
      paint(c, '#D98A2B', OL, r * 0.045);
      ell(c, x - w * 0.3, y - r * 0.26, w * 0.3, r * 0.06, -0.3); paint(c, 'rgba(255,255,255,.5)');
    }
  };
  const LAYERS = {
    ham: { h: 0.07, draw(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x - w * 1.05, y - h * 0.5); for (let i = 0; i <= 8; i++) c.quadraticCurveTo(x - w * 1.05 + (i + 0.5) * w * 0.2625, y + (i % 2 ? h * 0.6 : -h * 0.9), x - w * 1.05 + (i + 1) * w * 0.2625, y - h * 0.5); c.lineTo(x + w * 1.05, y - h); c.lineTo(x - w * 1.05, y - h); c.closePath(); paint(c, '#F29CA3', '#B85C66', r * 0.025); } },
    egg: { h: 0.08, draw(c, x, y, w, h, r) { friedEgg(c, x + w * 0.1, y - h * 0.45, w * 0.7); } },
    avocado: { h: 0.06, draw(c, x, y, w, h, r) { for (let i = -1; i <= 1; i++) { ell(c, x + i * w * 0.6, y - h * 0.5, w * 0.36, h * 0.6, i * 0.2); paint(c, '#B5D96A', '#4E7A22', r * 0.025); } } },
    hotchicken: { h: 0.2, draw(c, x, y, w, h, r) { blob(c, x, y - h * 0.5, w * 1.12, h * 0.62, 12, 5, 0.18); paint(c, '#C8431E', '#6E1E0A', r * 0.04); for (const p of scatter(10, 7, w * 0.9, h * 0.35)) { circ(c, x + p.x, y - h * 0.5 + p.y, r * 0.02); paint(c, '#E8743A'); } } },
    hotsauce: { h: 0.02, draw(c, x, y, w, h, r) { drizzle(c, x, y - r * 0.02, w * 1.8, r * 0.035, '#C1271B', r * 0.035, 3); } },
    honey: { h: 0.02, draw(c, x, y, w, h, r) { drizzle(c, x, y - r * 0.01, w * 1.7, r * 0.03, '#F2A91E', r * 0.04, 5); } },
    coleslaw: { h: 0.07, draw(c, x, y, w, h, r) { blob(c, x, y - h * 0.5, w * 1.02, h * 0.7, 12, 9, 0.2); paint(c, '#F2F0DC', '#BDB89A', r * 0.02); for (const p of scatter(10, 3, w * 0.8, h * 0.3)) { line(c, x + p.x, y - h * 0.5 + p.y, x + p.x + r * 0.05, y - h * 0.5 + p.y, p.r > 0.5 ? '#8BD17C' : '#F2A33A', r * 0.02); } } },
    pickle: { h: 0.04, draw(c, x, y, w, h, r) { for (let i = -1; i <= 1; i++) pickleSlice(c, x + i * w * 0.6, y - h * 0.5, w * 0.25); } }
  };
  function stack(c, parts, x, y, r, bread, order) {
    const w = r * 0.58;
    let top = y + r * 0.04;
    top -= bread.bottom(c, x, top, w, r);
    for (const p of order) {
      if (parts.indexOf(p) < 0) continue;
      const L = LAYERS[p] || A.STACK[p];
      if (!L) continue;
      L.draw(c, x, top, w, L.h * r, r);
      top -= L.h * r;
    }
    bread.top(c, x, top, w, r);
  }

  function wafflePiece(c, x, y, s, col) {
    rr(c, x - s, y - s * 0.5, s * 2, s, s * 0.14); paint(c, col, OL, s * 0.06);
    c.save(); rr(c, x - s, y - s * 0.5, s * 2, s, s * 0.14); c.clip();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { rr(c, x - s * 0.92 + i * s * 0.31, y - s * 0.42 + j * s * 0.3, s * 0.24, s * 0.22, s * 0.04); paint(c, shade(col, -0.18)); }
    c.restore();
  }
  function noodleNest(c, x, y, s, col, seed, flat) {
    const k = flat || 1;
    blob(c, x, y - s * 0.1 * k, s, s * 0.42 * k, 10, seed, 0.12); paint(c, col, OL, s * 0.05);
    c.strokeStyle = shade(col, -0.2); c.lineWidth = s * 0.04; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(x - s * 0.66 + i * s * 0.22, y - s * 0.1 * k, s * 0.14, Math.PI * (0.9 + (i % 2) * 0.2), Math.PI * 2.05); c.stroke(); }
  }
  function shrimpCurl(c, x, y, s, col) {
    c.beginPath(); c.arc(x, y, s, Math.PI * 0.2, Math.PI * 1.7); c.strokeStyle = shade(col, -0.35); c.lineWidth = s * 0.72; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = col; c.lineWidth = s * 0.52; c.stroke();
    for (let i = 0; i < 3; i++) { const a = Math.PI * (0.5 + i * 0.4); line(c, x + Math.cos(a) * s * 0.75, y + Math.sin(a) * s * 0.75, x + Math.cos(a) * s * 1.25, y + Math.sin(a) * s * 1.25, 'rgba(255,255,255,.55)', s * 0.12); }
  }
  function meat(c, parts, x, y, r, ribs) {
    const has = p => parts.indexOf(p) >= 0;
    const cx = x - r * 0.12, cy = y - r * 0.04;
    if (ribs) {
      rr(c, cx - r * 0.5, cy - r * 0.18, r * 0.9, r * 0.3, r * 0.12); paint(c, has('bbqsauce') ? '#7A2A14' : '#8A4424', OL, r * 0.04);
      for (let i = 0; i < 5; i++) { line(c, cx - r * 0.4 + i * r * 0.18, cy - r * 0.26, cx - r * 0.4 + i * r * 0.18, cy + r * 0.16, '#F4EBD2', r * 0.04); }
      if (has('bbqsauce')) { ell(c, cx - r * 0.1, cy - r * 0.1, r * 0.2, r * 0.04); paint(c, 'rgba(255,255,255,.3)'); }
    } else {
      blob(c, cx, cy, r * 0.46, r * 0.22, 10, 3, 0.1); paint(c, '#8A4B2A', OL, r * 0.04);
      for (let i = 0; i < 3; i++) line(c, cx - r * 0.3 + i * r * 0.2, cy - r * 0.14, cx - r * 0.18 + i * r * 0.2, cy + r * 0.12, '#4A2412', r * 0.04);
      if (has('bbqsauce')) { blob(c, cx, cy - r * 0.02, r * 0.3, r * 0.12, 9, 5, 0.2); paint(c, 'rgba(122,42,20,.85)'); }
    }
    if (has('beans')) { ell(c, x + r * 0.6, y + r * 0.02, r * 0.2, r * 0.12); paint(c, '#FFFFFF', OL, r * 0.03); for (const p of scatter(7, 71, r * 0.12, r * 0.05)) { ell(c, x + r * 0.6 + p.x, y + p.y, r * 0.03, r * 0.02); paint(c, '#D9772B', '#8A3E10', r * 0.01); } }
    if (has('coleslaw')) { blob(c, x + r * 0.56, y - r * 0.2, r * 0.16, r * 0.08, 8, 9, 0.3); paint(c, '#F2F0DC', '#BDB89A', r * 0.02); for (const p of scatter(5, 73, r * 0.1, r * 0.04)) line(c, x + r * 0.56 + p.x, y - r * 0.2 + p.y, x + r * 0.6 + p.x, y - r * 0.2 + p.y, p.r > 0.5 ? '#8BD17C' : '#F2A33A', r * 0.02); }
    if (has('pickle')) for (let i = 0; i < 2; i++) { rr(c, x - r * 0.62 + i * r * 0.1, y + r * 0.02, r * 0.26, r * 0.07, r * 0.035); paint(c, '#6E9E2E', '#3C5E14', r * 0.02); }
  }

  /* -------------------------------------------------------------- parts */

  const jar = (c, x, y, r, col, edge, top) => {
    c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.2); c.lineTo(x + r * 0.62, y - r * 0.2); c.quadraticCurveTo(x + r * 0.6, y + r * 0.62, x, y + r * 0.62); c.quadraticCurveTo(x - r * 0.6, y + r * 0.62, x - r * 0.62, y - r * 0.2);
    paint(c, '#E9EEF3', OL, r * 0.07);
    ell(c, x, y - r * 0.2, r * 0.62, r * 0.2); paint(c, col, edge || OL, r * 0.06);
    if (top) top();
    ell(c, x - r * 0.2, y - r * 0.26, r * 0.14, r * 0.05); paint(c, 'rgba(255,255,255,.5)');
  };
  const bottle = (c, x, y, r, col, cap) => {
    rr(c, x - r * 0.28, y - r * 0.5, r * 0.56, r * 1.05, r * 0.16); paint(c, col, OL, r * 0.07);
    rr(c, x - r * 0.12, y - r * 0.82, r * 0.24, r * 0.34, r * 0.06); paint(c, cap, OL, r * 0.06);
    ell(c, x - r * 0.12, y - r * 0.1, r * 0.06, r * 0.26); paint(c, 'rgba(255,255,255,.35)');
  };

  A.food({
    part: {
      hdbun: (c, x, y, r) => { rr(c, x - r * 0.7, y - r * 0.2, r * 1.4, r * 0.4, r * 0.2); paint(c, '#EDB35F', OL, r * 0.06); line(c, x - r * 0.5, y - r * 0.02, x + r * 0.5, y - r * 0.02, '#C9873B', r * 0.05); },
      brioche: (c, x, y, r) => { c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.1); c.bezierCurveTo(x - r * 0.6, y - r * 0.55, x + r * 0.6, y - r * 0.55, x + r * 0.6, y + r * 0.1); c.closePath(); paint(c, '#D98A2B', OL, r * 0.06); ell(c, x - r * 0.18, y - r * 0.2, r * 0.18, r * 0.06, -0.3); paint(c, 'rgba(255,255,255,.5)'); },
      pita: (c, x, y, r) => { c.beginPath(); c.arc(x, y + r * 0.2, r * 0.6, Math.PI, TAU); c.closePath(); paint(c, '#EBC48A', OL, r * 0.06); for (let i = 0; i < 4; i++) { circ(c, x - r * 0.3 + i * r * 0.2, y + r * 0.02, r * 0.03); paint(c, '#B98A4A'); } },
      cone: (c, x, y, r) => { for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(x - r * 0.45 + i * r * 0.3, y - r * 0.4); c.lineTo(x - r * 0.05 + i * r * 0.3, y - r * 0.4); c.lineTo(x - r * 0.25 + i * r * 0.3, y + r * 0.5); c.closePath(); paint(c, '#E0A458', OL, r * 0.05); } },
      ketchup: (c, x, y, r) => bottle(c, x, y, r, '#D72C1E', '#FFFFFF'),
      mustard: (c, x, y, r) => bottle(c, x, y, r, '#F5C400', '#D72C1E'),
      hotsauce: (c, x, y, r) => bottle(c, x, y, r, '#C1271B', '#2B2B2B'),
      honey: (c, x, y, r) => { rr(c, x - r * 0.42, y - r * 0.4, r * 0.84, r * 0.9, r * 0.2); paint(c, '#F2A91E', OL, r * 0.06); rr(c, x - r * 0.3, y - r * 0.58, r * 0.6, r * 0.2, r * 0.05); paint(c, '#8B6B45', OL, r * 0.05); },
      relish: (c, x, y, r) => jar(c, x, y, r, '#6BAA2F', '#3C6E14'),
      cheesesauce: (c, x, y, r) => jar(c, x, y, r, '#F7A51C', '#B8700A'),
      bbqsauce: (c, x, y, r) => jar(c, x, y, r, '#7A2A14'),
      beans: (c, x, y, r) => jar(c, x, y, r, '#D9772B', '#8A3E10', () => { for (const p of scatter(7, 5, r * 0.45, r * 0.12)) { ell(c, x + p.x, y - r * 0.2 + p.y, r * 0.07, r * 0.045); paint(c, '#E88B3E', '#8A3E10', r * 0.02); } }),
      hummus: (c, x, y, r) => jar(c, x, y, r, '#E7CFA0', '#B99A5E', () => { circ(c, x, y - r * 0.2, r * 0.1); paint(c, '#C9A227'); }),
      tahini: (c, x, y, r) => jar(c, x, y, r, '#F4E7C9', '#C9B98E'),
      soysauce: (c, x, y, r) => bottle(c, x, y, r, '#3B2314', '#D72C1E'),
      syrup: (c, x, y, r) => bottle(c, x, y, r, '#B5651D', '#F4E7C9'),
      caramel: (c, x, y, r) => bottle(c, x, y, r, '#C9822B', '#FFFFFF'),
      choc: (c, x, y, r) => bottle(c, x, y, r, '#5A2E1A', '#FFFFFF'),
      milk: (c, x, y, r) => { rr(c, x - r * 0.36, y - r * 0.4, r * 0.72, r * 0.95, r * 0.08); paint(c, '#FFFFFF', OL, r * 0.06); c.beginPath(); c.moveTo(x - r * 0.36, y - r * 0.4); c.lineTo(x, y - r * 0.7); c.lineTo(x + r * 0.36, y - r * 0.4); c.closePath(); paint(c, '#E9EEF3', OL, r * 0.05); rr(c, x - r * 0.36, y - r * 0.05, r * 0.72, r * 0.25, 0); paint(c, '#4DB6E8'); },
      cream: (c, x, y, r) => { jar(c, x, y, r, '#FFFDF6', '#D6CDB8', () => { blob(c, x, y - r * 0.3, r * 0.34, r * 0.18, 8, 3, 0.25); paint(c, '#FFFDF6', '#D6CDB8', r * 0.04); }); },
      cinnamon: (c, x, y, r) => { for (let i = 0; i < 3; i++) { rr(c, x - r * 0.5, y - r * 0.3 + i * r * 0.22, r, r * 0.16, r * 0.08); paint(c, '#9C5A2C', '#5A2E12', r * 0.04); } },
      butter: (c, x, y, r) => { rr(c, x - r * 0.5, y - r * 0.2, r, r * 0.45, r * 0.06); paint(c, '#FFE58A', '#C9A43A', r * 0.06); rr(c, x - r * 0.5, y - r * 0.2, r, r * 0.12, r * 0.04); paint(c, '#FFF3C4'); },
      blueberry: (c, x, y, r) => { for (const p of scatter(8, 11, r * 0.4, r * 0.28)) berry(c, x + p.x, y + p.y, r * 0.15); },
      banana: (c, x, y, r) => { c.beginPath(); c.arc(x, y - r * 0.4, r * 0.7, Math.PI * 0.2, Math.PI * 0.8); c.strokeStyle = OL; c.lineWidth = r * 0.34; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#FFE14D'; c.lineWidth = r * 0.24; c.stroke(); },
      strawberry: (c, x, y, r) => { strawberry(c, x - r * 0.2, y, r * 0.3, -0.3); strawberry(c, x + r * 0.22, y + r * 0.05, r * 0.28, 0.4); },
      cherry: (c, x, y, r) => { cherry(c, x - r * 0.18, y + r * 0.2, r * 0.2); cherry(c, x + r * 0.2, y + r * 0.26, r * 0.2); },
      sprinkles: (c, x, y, r) => { ell(c, x, y + r * 0.1, r * 0.6, r * 0.34); paint(c, '#FFFFFF', OL, r * 0.06); sprinkles(c, x, y + r * 0.06, r * 0.42, r * 0.18, 5, r * 0.06); },
      vanilla: (c, x, y, r) => { ell(c, x, y + r * 0.25, r * 0.66, r * 0.3); paint(c, '#C3CBD4', OL, r * 0.06); scoop(c, x, y, r * 0.5, '#FFF6DC', '#D8C9A0'); },
      chocscoop: (c, x, y, r) => { ell(c, x, y + r * 0.25, r * 0.66, r * 0.3); paint(c, '#C3CBD4', OL, r * 0.06); scoop(c, x, y, r * 0.5, '#7A4A2E', '#4A2A18'); },
      strawscoop: (c, x, y, r) => { ell(c, x, y + r * 0.25, r * 0.66, r * 0.3); paint(c, '#C3CBD4', OL, r * 0.06); scoop(c, x, y, r * 0.5, '#FFB3C7', '#D16F8E'); },
      icing: (c, x, y, r) => { rr(c, x - r * 0.2, y - r * 0.6, r * 0.4, r * 0.9, r * 0.1); paint(c, '#FF9EC4', OL, r * 0.06); c.beginPath(); c.moveTo(x - r * 0.1, y + r * 0.3); c.lineTo(x + r * 0.1, y + r * 0.3); c.lineTo(x, y + r * 0.55); c.closePath(); paint(c, '#C3CBD4', OL, r * 0.04); },
      chocicing: (c, x, y, r) => { rr(c, x - r * 0.2, y - r * 0.6, r * 0.4, r * 0.9, r * 0.1); paint(c, '#6B3E26', OL, r * 0.06); c.beginPath(); c.moveTo(x - r * 0.1, y + r * 0.3); c.lineTo(x + r * 0.1, y + r * 0.3); c.lineTo(x, y + r * 0.55); c.closePath(); paint(c, '#C3CBD4', OL, r * 0.04); },
      coleslaw: (c, x, y, r) => { ell(c, x, y + r * 0.2, r * 0.66, r * 0.4); paint(c, '#FFFFFF', OL, r * 0.06); blob(c, x, y, r * 0.5, r * 0.26, 10, 7, 0.2); paint(c, '#F2F0DC', '#BDB89A', r * 0.04); for (const p of scatter(10, 9, r * 0.36, r * 0.14)) line(c, x + p.x, y + p.y, x + p.x + r * 0.12, y + p.y, p.r > 0.5 ? '#8BD17C' : '#F2A33A', r * 0.05); },
      pickle: (c, x, y, r) => { for (const [dx, dy] of [[-0.2, 0], [0.18, 0.08], [0, -0.14]]) pickleSlice(c, x + dx * r, y + dy * r, r * 0.22); },
      tofu: (c, x, y, r) => { for (const [dx, dy] of [[-0.22, 0.08], [0.2, 0.1], [0, -0.14]]) { rr(c, x + dx * r - r * 0.16, y + dy * r - r * 0.16, r * 0.32, r * 0.32, r * 0.05); paint(c, '#F4EBD2', '#C9B98E', r * 0.05); } },
      bokchoy: (c, x, y, r) => { leaf(c, x - r * 0.1, y, r * 0.45, -0.9, '#6DBE55'); leaf(c, x + r * 0.15, y + r * 0.05, r * 0.42, -0.4, '#8BD17C'); rr(c, x - r * 0.1, y + r * 0.1, r * 0.16, r * 0.4, r * 0.06); paint(c, '#E8F5D8', '#8BAE6E', r * 0.04); },
      chili: (c, x, y, r) => { for (let i = 0; i < 2; i++) { c.save(); c.translate(x - r * 0.15 + i * r * 0.3, y); c.rotate(-0.6 + i * 1.2); c.beginPath(); c.moveTo(0, -r * 0.4); c.quadraticCurveTo(r * 0.22, 0, 0, r * 0.45); c.quadraticCurveTo(-r * 0.1, 0, 0, -r * 0.4); paint(c, '#D7301F', '#7E1616', r * 0.05); line(c, 0, -r * 0.4, r * 0.05, -r * 0.55, '#4E7A22', r * 0.08); c.restore(); } },
      scallion: (c, x, y, r) => { for (const p of scatter(10, 13, r * 0.4, r * 0.28)) { ell(c, x + p.x, y + p.y, r * 0.1, r * 0.07); paint(c, '#5DBB4A', '#2E7A24', r * 0.03); ell(c, x + p.x, y + p.y, r * 0.05, r * 0.03); paint(c, '#D8F5C8'); } },
      nori: (c, x, y, r) => { for (let i = 0; i < 3; i++) { rr(c, x - r * 0.45 + i * r * 0.08, y - r * 0.4 + i * r * 0.1, r * 0.8, r * 0.6, r * 0.04); paint(c, '#1F3A2A', '#0C1A12', r * 0.05); } },
      sweetcorn: (c, x, y, r) => { ell(c, x, y + r * 0.2, r * 0.66, r * 0.4); paint(c, '#FFFFFF', OL, r * 0.06); for (const p of scatter(16, 17, r * 0.44, r * 0.2)) { circ(c, x + p.x, y + r * 0.1 + p.y, r * 0.08); paint(c, '#FFD23F', '#C99A00', r * 0.02); } },
      ham: (c, x, y, r) => { for (let i = 0; i < 3; i++) { ell(c, x - r * 0.1 + i * r * 0.1, y + r * 0.1 - i * r * 0.1, r * 0.5, r * 0.34); paint(c, '#F29CA3', '#B85C66', r * 0.05); } },
      pineapple: (c, x, y, r) => { for (const [dx, dy] of [[-0.2, 0.1], [0.18, 0.12], [0, -0.12]]) { c.beginPath(); c.moveTo(x + dx * r - r * 0.2, y + dy * r + r * 0.14); c.lineTo(x + dx * r + r * 0.2, y + dy * r + r * 0.14); c.lineTo(x + dx * r, y + dy * r - r * 0.18); c.closePath(); paint(c, '#FFD84A', '#C99A00', r * 0.05); } },
      jalapeno: (c, x, y, r) => { for (const p of scatter(6, 23, r * 0.36, r * 0.24)) { circ(c, x + p.x, y + p.y, r * 0.16); paint(c, '#4CAF3F', '#2E6B24', r * 0.04); circ(c, x + p.x, y + p.y, r * 0.07); paint(c, '#E7F5C8'); } }
    }
  });

  /* ---------------------------------------------- on the heat, raw to done */

  A.food({
    done: {
      meatball: ['#D98A7A', '#7A3E22'], garlicbread: ['#F4E3C3', '#E7B35C'], bacon: ['#F2A0A0', '#A33A1F'], churros: ['#F2D6A2', '#D38A3A'],
      tempura: ['#FBEFD0', '#F2B84B'], edamame: ['#B6E0A0', '#6DBE55'], sausage: ['#E89A8A', '#B5462E'], onionrings: ['#F4E1B2', '#E3A33E'],
      toast: ['#F4E3C3', '#E0A458'], egg: ['#F4F4F4', '#FFFFFF'], tomsoup: ['#F08A6E', '#D8432E'], pancake: ['#F7E2B8', '#E9A94F'],
      hashbrown: ['#F2DFAF', '#E0A040'], waffle: ['#F7E0B0', '#E6A04A'], hotfudge: ['#8A5A40', '#4A2413'], steak: ['#C9535A', '#8A4B2A'],
      ribs: ['#D07A6A', '#7A3A1C'], corn: ['#FFF1A8', '#FFD23F'], falafel: ['#A8C46A', '#8B5A2B'], shawarma: ['#E3A38A', '#B8753A'],
      noodles: ['#FFF1C4', '#F2D27A'], shrimp: ['#C9C9D6', '#FF8A5C'], dumplings: ['#FFFFFF', '#F7EBD5'], cupcake: ['#F7E3B5', '#E9B96E'],
      croissant: ['#F4DDAA', '#E0A040'], shot: ['#C9A27A', '#4A2A18'], muffin: ['#EBC99A', '#B87333'], ramen: ['#FFF1C4', '#F6D98A'],
      softegg: ['#F4F4F4', '#FFFFFF'], chashu: ['#E6B1A0', '#C98D6A'], hotchicken: ['#F0C9A8', '#C8431E']
    },
    heat: {
      meatball: (c, x, y, r, col) => { for (const [dx, dy] of [[-0.25, 0.08], [0.22, 0.1], [0, -0.14]]) { circ(c, x + dx * r, y + dy * r, r * 0.24); paint(c, col, OL, r * 0.05); } },
      bacon: (c, x, y, r, col) => { baconStrip(c, x, y - r * 0.15, r * 1.1, r * 0.2, 0, col); baconStrip(c, x, y + r * 0.18, r * 1.1, r * 0.2, 0, col); },
      tempura: (c, x, y, r, col) => { blob(c, x, y, r * 0.6, r * 0.24, 10, 7, 0.25); paint(c, col, OL, r * 0.05); },
      sausage: (c, x, y, r, col, burnt) => { rr(c, x - r * 0.7, y - r * 0.16, r * 1.4, r * 0.32, r * 0.16); paint(c, col, OL, r * 0.05); if (!burnt) line(c, x - r * 0.5, y - r * 0.08, x + r * 0.5, y - r * 0.08, 'rgba(255,255,255,.35)', r * 0.05); },
      toast: (c, x, y, r, col) => { rr(c, x - r * 0.55, y - r * 0.4, r * 1.1, r * 0.8, r * 0.18); paint(c, col, OL, r * 0.05); rr(c, x - r * 0.42, y - r * 0.28, r * 0.84, r * 0.56, r * 0.1); paint(c, mix(col, '#FFFFFF', 0.35)); },
      egg: (c, x, y, r, col, burnt) => friedEgg(c, x, y, r * 0.62, burnt ? '#3A2A20' : null),
      softegg: (c, x, y, r, col, burnt) => { ell(c, x, y, r * 0.4, r * 0.5); paint(c, burnt ? col : '#FFFFFF', OL, r * 0.05); if (!burnt) { ell(c, x, y + r * 0.05, r * 0.2, r * 0.22); paint(c, '#FF9F1C'); } },
      pancake: (c, x, y, r, col) => { ell(c, x, y, r * 0.66, r * 0.4); paint(c, col, OL, r * 0.05); for (const p of scatter(6, 5, r * 0.4, r * 0.2)) { circ(c, x + p.x, y + p.y, r * 0.04); paint(c, shade(col, -0.15)); } },
      waffle: (c, x, y, r, col) => wafflePiece(c, x, y, r * 0.62, col),
      hotfudge: (c, x, y, r, col) => { ell(c, x, y, r * 0.62, r * 0.4); paint(c, col, OL, r * 0.05); ell(c, x - r * 0.2, y - r * 0.1, r * 0.14, r * 0.05); paint(c, 'rgba(255,255,255,.35)'); },
      steak: (c, x, y, r, col, burnt, k) => { blob(c, x, y, r * 0.62, r * 0.36, 10, 3, 0.1); paint(c, col, OL, r * 0.05); if (!burnt && k > 0.5) for (let i = 0; i < 3; i++) line(c, x - r * 0.36 + i * r * 0.3, y - r * 0.24, x - r * 0.22 + i * r * 0.3, y + r * 0.2, 'rgba(40,20,10,.55)', r * 0.06); },
      ribs: (c, x, y, r, col) => { rr(c, x - r * 0.62, y - r * 0.26, r * 1.24, r * 0.52, r * 0.18); paint(c, col, OL, r * 0.05); for (let i = 0; i < 5; i++) line(c, x - r * 0.46 + i * r * 0.23, y - r * 0.32, x - r * 0.46 + i * r * 0.23, y + r * 0.3, '#F4EBD2', r * 0.06); },
      falafel: (c, x, y, r, col) => { for (const [dx, dy] of [[-0.25, 0.1], [0.22, 0.12], [0, -0.14], [0.1, 0.3]]) { circ(c, x + dx * r, y + dy * r, r * 0.2); paint(c, col, OL, r * 0.04); } },
      shawarma: (c, x, y, r, col) => { for (let i = 0; i < 4; i++) { rr(c, x - r * 0.55 + i * r * 0.28, y - r * 0.2 + (i % 2) * r * 0.14, r * 0.24, r * 0.18, r * 0.05); paint(c, col, OL, r * 0.03); } },
      noodles: (c, x, y, r, col) => noodleNest(c, x, y + r * 0.1, r * 0.62, col, 3),
      ramen: (c, x, y, r, col) => noodleNest(c, x, y + r * 0.1, r * 0.62, col, 3),
      shrimp: (c, x, y, r, col) => { shrimpCurl(c, x - r * 0.22, y, r * 0.22, col); shrimpCurl(c, x + r * 0.24, y + r * 0.06, r * 0.22, col); },
      cupcake: (c, x, y, r, col) => { rr(c, x - r * 0.36, y - r * 0.05, r * 0.72, r * 0.4, r * 0.06); paint(c, '#7FC8F8', OL, r * 0.04); ell(c, x, y - r * 0.08, r * 0.4, r * 0.2); paint(c, col, OL, r * 0.04); },
      shot: (c, x, y, r, col) => { rr(c, x - r * 0.34, y - r * 0.3, r * 0.68, r * 0.6, r * 0.08); paint(c, '#FFFFFF', OL, r * 0.05); ell(c, x, y - r * 0.3, r * 0.3, r * 0.08); paint(c, col); },
      chashu: (c, x, y, r, col) => { for (let i = -1; i <= 1; i += 2) { ell(c, x + i * r * 0.28, y, r * 0.3, r * 0.22); paint(c, col, OL, r * 0.05); ell(c, x + i * r * 0.28, y, r * 0.15, r * 0.1); paint(c, mix(col, '#FFFFFF', 0.5)); } },
      hotchicken: (c, x, y, r, col) => { blob(c, x, y, r * 0.62, r * 0.38, 12, 5, 0.18); paint(c, col, OL, r * 0.05); },
      corn: (c, x, y, r, col) => corncob(c, x, y, r * 0.9, col),
      tomsoup: (c, x, y, r, col) => { ell(c, x, y, r * 0.6, r * 0.36); paint(c, col, OL, r * 0.05); },
      edamame: (c, x, y, r, col) => { for (const [dx, dy, a] of [[-0.2, 0, -0.5], [0.2, 0.05, 0.4], [0, -0.18, 0.1]]) pod(c, x + dx * r, y + dy * r, r * 0.3, a, col); },
      dumplings: (c, x, y, r, col) => { for (const dx of [-0.24, 0.24]) dumpling(c, x + dx * r, y + r * 0.05, r * 0.26, col); },
      garlicbread: (c, x, y, r, col) => { for (const dx of [-0.2, 0.2]) garlicSlice(c, x + dx * r, y, r * 0.36, col); },
      churros: (c, x, y, r, col) => { for (let i = -1; i <= 1; i++) churro(c, x + i * r * 0.26, y, r * 0.7, col, i * 0.15); },
      onionrings: (c, x, y, r, col) => { for (const [dx, dy] of [[-0.22, 0.05], [0.22, 0.08], [0, -0.12]]) onionRingFried(c, x + dx * r, y + dy * r, r * 0.26, col); },
      hashbrown: (c, x, y, r, col) => { rr(c, x - r * 0.5, y - r * 0.3, r, r * 0.6, r * 0.26); paint(c, col, OL, r * 0.05); for (const p of scatter(8, 3, r * 0.34, r * 0.16)) line(c, x + p.x, y + p.y, x + p.x + r * 0.1, y + p.y, shade(col, -0.2), r * 0.03); },
      croissant: (c, x, y, r, col) => croissantShape(c, x, y, r * 0.7, col),
      muffin: (c, x, y, r, col) => muffinShape(c, x, y + r * 0.1, r * 0.6, col)
    }
  });

  /* -------------------------------------------------------------- sides */

  function corncob(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.rotate(-0.25);
    rr(c, -s * 0.62, -s * 0.2, s * 1.24, s * 0.4, s * 0.2); paint(c, col, OL, s * 0.05);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { circ(c, -s * 0.5 + i * s * 0.14, -s * 0.08 + j * s * 0.16, s * 0.05); paint(c, shade(col, 0.15)); }
    c.restore();
  }
  function pod(c, x, y, s, a, col) {
    c.save(); c.translate(x, y); c.rotate(a);
    ell(c, 0, 0, s, s * 0.34); paint(c, col, OL, s * 0.08);
    for (let i = -1; i <= 1; i++) { circ(c, i * s * 0.55, 0, s * 0.2); paint(c, shade(col, 0.2)); }
    c.restore();
  }
  function dumpling(c, x, y, s, col) {
    c.beginPath(); c.moveTo(x - s, y + s * 0.3); c.quadraticCurveTo(x - s * 0.9, y - s * 0.8, x, y - s * 0.7); c.quadraticCurveTo(x + s * 0.9, y - s * 0.8, x + s, y + s * 0.3); c.quadraticCurveTo(x, y + s * 0.6, x - s, y + s * 0.3);
    paint(c, col, OL, s * 0.08);
    for (let i = -2; i <= 2; i++) line(c, x + i * s * 0.25, y - s * 0.62, x + i * s * 0.2, y - s * 0.3, 'rgba(160,140,110,.6)', s * 0.06);
  }
  function garlicSlice(c, x, y, s, col) {
    rr(c, x - s * 0.5, y - s * 0.3, s, s * 0.6, s * 0.26); paint(c, col, OL, s * 0.08);
    rr(c, x - s * 0.36, y - s * 0.18, s * 0.72, s * 0.36, s * 0.16); paint(c, '#FFF3C4');
    for (const p of scatter(5, 7, s * 0.25, s * 0.1)) { circ(c, x + p.x, y + p.y, s * 0.05); paint(c, '#4CAF3F'); }
  }
  function churro(c, x, y, s, col, a) {
    c.save(); c.translate(x, y); c.rotate(a);
    rr(c, -s * 0.1, -s * 0.6, s * 0.2, s * 1.2, s * 0.1); paint(c, col, OL, s * 0.05);
    for (let i = 0; i < 5; i++) line(c, -s * 0.06, -s * 0.5 + i * s * 0.24, s * 0.06, -s * 0.38 + i * s * 0.24, shade(col, -0.2), s * 0.03);
    for (const p of scatter(6, 3, s * 0.08, s * 0.5)) { circ(c, p.x, p.y, s * 0.02); paint(c, '#FFFFFF'); }
    c.restore();
  }
  function onionRingFried(c, x, y, s, col) {
    ell(c, x, y, s, s * 0.8); c.strokeStyle = OL; c.lineWidth = s * 0.5; c.stroke();
    c.strokeStyle = col; c.lineWidth = s * 0.38; c.stroke();
  }
  function croissantShape(c, x, y, s, col) {
    for (let i = -2; i <= 2; i++) {
      const w = s * (0.5 - Math.abs(i) * 0.1), px = x + i * s * 0.3, py = y + Math.abs(i) * s * 0.12;
      ell(c, px, py, w * 0.55, w * 0.7, i * 0.35); paint(c, i === 0 ? col : shade(col, -0.08), OL, s * 0.05);
    }
  }
  function muffinShape(c, x, y, s, col) {
    c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.1); c.lineTo(x + s * 0.5, y - s * 0.1); c.lineTo(x + s * 0.38, y + s * 0.5); c.lineTo(x - s * 0.38, y + s * 0.5); c.closePath();
    paint(c, '#F6D5E2', OL, s * 0.06);
    blob(c, x, y - s * 0.2, s * 0.62, s * 0.36, 10, 3, 0.12); paint(c, col, OL, s * 0.06);
    for (const p of scatter(6, 5, s * 0.36, s * 0.16)) { circ(c, x + p.x, y - s * 0.24 + p.y, s * 0.06); paint(c, '#4A2413'); }
  }

  A.food({
    side: {
      garlicbread: (c, x, y, r, tone) => { ell(c, x, y + r * 0.16, r * 0.62, r * 0.3); paint(c, '#FFFFFF', OL, r * 0.05); garlicSlice(c, x - r * 0.18, y, r * 0.44, tone || '#E7B35C'); garlicSlice(c, x + r * 0.2, y - r * 0.06, r * 0.44, tone || '#E7B35C'); },
      churros: (c, x, y, r, tone) => { rr(c, x - r * 0.34, y - r * 0.1, r * 0.68, r * 0.5, r * 0.06); paint(c, '#F2A33A', OL, r * 0.05); for (let i = -1; i <= 1; i++) churro(c, x + i * r * 0.16, y - r * 0.2, r * 0.6, tone || '#D38A3A', i * 0.2); rr(c, x - r * 0.34, y + r * 0.06, r * 0.68, r * 0.34, r * 0.06); paint(c, '#FFFFFF', OL, r * 0.05); line(c, x - r * 0.3, y + r * 0.2, x + r * 0.3, y + r * 0.2, '#E23B3B', r * 0.08); },
      edamame: (c, x, y, r, tone) => { bowl(c, x, y, r * 0.64, '#2B2B2B', '#4A4A4A', '#3A3A3A'); for (const [dx, dy, a] of [[-0.18, -0.12, -0.4], [0.16, -0.1, 0.4], [0, -0.22, 0.1]]) pod(c, x + dx * r, y + dy * r, r * 0.22, a, tone || '#6DBE55'); },
      onionrings: (c, x, y, r, tone) => { rr(c, x - r * 0.42, y - r * 0.05, r * 0.84, r * 0.46, r * 0.06); paint(c, '#E23B3B', OL, r * 0.05); for (const [dx, dy] of [[-0.18, -0.12], [0.18, -0.1], [0, -0.3]]) onionRingFried(c, x + dx * r, y + dy * r, r * 0.2, tone || '#E3A33E'); },
      tomsoup: (c, x, y, r, tone) => { bowl(c, x, y, r * 0.66, '#FFFFFF', '#E9EEF3', tone || '#D8432E'); circ(c, x + r * 0.12, y - r * 0.1, r * 0.06); paint(c, '#FFF6E0'); leaf(c, x - r * 0.12, y - r * 0.11, r * 0.07, 0.4); },
      hashbrown: (c, x, y, r, tone) => { ell(c, x, y + r * 0.16, r * 0.6, r * 0.28); paint(c, '#FFFFFF', OL, r * 0.05); rr(c, x - r * 0.34, y - r * 0.12, r * 0.68, r * 0.34, r * 0.16); paint(c, tone || '#E0A040', OL, r * 0.04); },
      corn: (c, x, y, r, tone) => { ell(c, x, y + r * 0.16, r * 0.62, r * 0.28); paint(c, '#FFFFFF', OL, r * 0.05); corncob(c, x, y, r * 0.7, tone || '#FFD23F'); rr(c, x - r * 0.1, y - r * 0.08, r * 0.2, r * 0.1, r * 0.03); paint(c, '#FFE58A'); },
      dumplings: (c, x, y, r, tone) => { ell(c, x, y + r * 0.12, r * 0.62, r * 0.3); paint(c, '#D9B37A', OL, r * 0.05); ell(c, x, y + r * 0.08, r * 0.52, r * 0.22); paint(c, '#E9C88E'); for (const dx of [-0.26, 0, 0.26]) dumpling(c, x + dx * r, y, r * 0.16, tone || '#F7EBD5'); },
      croissant: (c, x, y, r, tone) => { ell(c, x, y + r * 0.16, r * 0.62, r * 0.28); paint(c, '#FFFFFF', OL, r * 0.05); croissantShape(c, x, y, r * 0.52, tone || '#E0A040'); },
      muffin: (c, x, y, r, tone) => muffinShape(c, x, y, r * 0.66, tone || '#B87333')
    }
  });

  /* ------------------------------------------------------------- drinks */

  A.food({
    liquid: { milkshake: '#FFB3C7', oj: '#FFA726', cocoa: '#6B3A22', icedtea: '#C9782B', minttea: '#D9A441', bubbletea: '#D9B38C', latte: '#C9A27A' },
    drink: {
      milkshake(c, x, y, r, f) {
        glass(c, x, y, r, '#FFB3C7', f, 0.42);
        if (f >= 1) {
          blob(c, x, y - r * 1.02, r * 0.34, r * 0.14, 8, 3, 0.2); paint(c, '#FFFDF6', '#D6CDB8', r * 0.03);
          cherry(c, x + r * 0.05, y - r * 1.14, r * 0.07);
          line(c, x - r * 0.12, y - r * 0.7, x - r * 0.26, y - r * 1.36, '#FFFFFF', r * 0.1); line(c, x - r * 0.12, y - r * 0.7, x - r * 0.26, y - r * 1.36, '#E23B3B', r * 0.05);
        }
      },
      oj(c, x, y, r, f) {
        glass(c, x, y, r, '#FFA726', f);
        if (f >= 1) { c.beginPath(); c.arc(x + r * 0.32, y - r * 0.96, r * 0.2, Math.PI, TAU); c.closePath(); paint(c, '#FFB74D', '#E07B00', r * 0.04); }
      },
      icedtea(c, x, y, r, f) {
        glass(c, x, y, r, '#C9782B', f);
        if (f >= 1) { rr(c, x - r * 0.16, y - r * 0.6, r * 0.18, r * 0.18, r * 0.04); paint(c, 'rgba(255,255,255,.6)'); c.beginPath(); c.arc(x + r * 0.32, y - r * 0.96, r * 0.2, Math.PI, TAU); c.closePath(); paint(c, '#FFE14D', '#C99A00', r * 0.04); }
      },
      minttea(c, x, y, r, f, hot, t) {
        glass(c, x, y, r * 0.8, '#D9A441', f, 0.34);
        if (f >= 1) { leaf(c, x + r * 0.08, y - r * 0.72, r * 0.12, -0.6, '#4CAF3F'); leaf(c, x - r * 0.08, y - r * 0.76, r * 0.1, 0.5, '#6DBE55'); if (hot) steam(c, x, y - r * 0.9, r * 0.8, t); }
      },
      cocoa(c, x, y, r, f, hot, t) {
        mug(c, x, y, r, '#8D4A2B', '#6B3A22', f);
        if (f >= 1) { for (const [dx, dy] of [[-0.12, 0], [0.1, 0.02], [0, -0.04]]) { rr(c, x + dx * r - r * 0.07, y - r * 0.74 + dy * r, r * 0.14, r * 0.1, r * 0.03); paint(c, '#FFFFFF', '#D6CDB8', r * 0.02); } if (hot) steam(c, x, y - r * 0.85, r, t); }
      },
      latte(c, x, y, r, f, hot, t) {
        glass(c, x, y, r * 0.9, '#C9A27A', f, 0.34);
        if (f > 0.4) { rr(c, x - r * 0.26, y - r * 0.32, r * 0.52, r * 0.26, r * 0.02); paint(c, 'rgba(90,50,24,.8)'); }
        if (f >= 1) { ell(c, x, y - r * 0.84, r * 0.3, r * 0.07); paint(c, '#F5E6CC'); if (hot) steam(c, x, y - r * 0.95, r * 0.8, t); }
      },
      bubbletea(c, x, y, r, f) {
        glass(c, x, y, r, '#D9B38C', f, 0.4);
        for (const p of scatter(9, 7, r * 0.2, r * 0.06)) if (f > 0.2) { circ(c, x + p.x, y - r * 0.1 + p.y, r * 0.05); paint(c, '#2B1A12'); }
        if (f >= 1) {
          c.beginPath(); c.arc(x, y - r * 1.0, r * 0.4, Math.PI, TAU); c.closePath(); paint(c, 'rgba(230,240,250,.7)', OL, r * 0.04);
          line(c, x + r * 0.05, y - r * 0.6, x + r * 0.18, y - r * 1.5, '#FF6FAE', r * 0.12);
        }
      }
    }
  });

})(window.PV);
