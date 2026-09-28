/* 街头大厨 / Street Chef — the pictures.

   Everything is drawn, nothing is loaded: the page's policy allows images
   only from itself, and a cartoon kitchen is round shapes with a dark
   outline anyway. Every function takes logical coordinates (layout.js);
   the view scales the canvas.

   - food: a dish is a plate and its parts, built the way the real thing
     is — a pasta is a mound with sauce on top, a burger is a stack
     between two buns, a pizza has its toppings scattered, a taco has its
     fillings showing over the shell, sushi is two nigiri on a slate. The
     same function draws the plate on the counter and the picture in a
     customer's bubble.
   - cooking: a part on the heat is drawn raw-to-done by one number, and
     black with smoke when it burns.
   - the kitchen: each cooker and drink machine has its own body.
   - people: twelve customers from a handful of skin tones, hair and shirts.
   - the street and the truck, in each truck's own colours.

   Scatter (where the olives go) comes from a hash, never from a random
   number: it has to be the same every frame. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TAU = Math.PI * 2;
  const OL = '#3A2618';                       // the outline everything wears
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, sans-serif';

  const THEMES = {
    pasta: { a: '#2E9E5B', b: '#FFF8EA', c: '#D9412B', sky: ['#8FD3F4', '#DDF3FB'], far: '#B9D7C6', near: '#E9C79C', tile: '#EEF2EF', tile2: '#DCE5DF', shelf: '#C5CDD4', trim: '#1E7443' },
    burger: { a: '#E23B3B', b: '#FFD447', c: '#2B2B2B', sky: ['#FFB870', '#FFE7B8'], far: '#E7A77C', near: '#F2C9A2', tile: '#FFF4E2', tile2: '#F6E1C4', shelf: '#C9C9CF', trim: '#A82525' },
    pizza: { a: '#F07A26', b: '#FFF3DC', c: '#2E8B57', sky: ['#9BC8F2', '#E7F2FB'], far: '#D5B79A', near: '#E8B78A', tile: '#FFF6EA', tile2: '#F3E2CE', shelf: '#CDC8C2', trim: '#B8561A' },
    taco: { a: '#14A89E', b: '#FF5C8A', c: '#FFD23F', sky: ['#7FD6E6', '#E6FAF7'], far: '#F2A6B8', near: '#FFD98A', tile: '#EFFBF9', tile2: '#D8F1EE', shelf: '#C3CDD0', trim: '#0C7B73' },
    sushi: { a: '#243B6B', b: '#F4EDE1', c: '#D93A2E', sky: ['#F7A8A0', '#FCE2D8'], far: '#C99AA6', near: '#D8C3A8', tile: '#F5F1E8', tile2: '#E6DED0', shelf: '#BFC3CA', trim: '#162647' }
  };
  const themeOf = key => THEMES[key] || THEMES.pasta;

  /* Pictures added from outside (food.js, stands.js), by what they draw:
     the ware a base is served on, a dish by its base, a part in a bin, a
     part on the heat and its raw-to-done colours, a side, a drink and its
     colour in a machine, a cook station's body and slots, a drink machine.
     The functions below look here first. */
  const FOOD = { ware: {}, dish: {}, part: {}, heat: {}, done: {}, side: {}, drink: {}, liquid: {}, station: {}, machine: {} };

  /* ------------------------------------------------------------ helpers */

  function hash(a, b, c) {
    let h = Math.imul((a | 0) + 0x9E37, 374761393) + Math.imul((b | 0) + 7, 668265263) + Math.imul((c | 0) + 3, 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function strHash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  /** A colour as a number, from '#RRGGBB' or 'rgb(r,g,b)' — mix() returns the second. */
  function rgb(s) {
    if (s[0] === '#') return parseInt(s.slice(1), 16);
    const m = s.match(/\d+/g) || [0, 0, 0];
    return (m[0] << 16) | (m[1] << 8) | (m[2] | 0);
  }
  function mix(a, b, k) {
    const p = rgb(a), q = rgb(b);
    const f = (sh) => Math.round(((p >> sh) & 255) * (1 - k) + ((q >> sh) & 255) * k);
    return 'rgb(' + f(16) + ',' + f(8) + ',' + f(0) + ')';
  }
  function shade(hex, k) { return mix(hex, k < 0 ? '#000000' : '#FFFFFF', Math.abs(k)); }

  function rr(c, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + q, y);
    c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q);
    c.closePath();
  }
  function ell(c, x, y, rx, ry, rot) {
    c.beginPath();
    c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
  }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function paint(c, fill, stroke, w) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(0.6, w || 1); c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, col, w) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke();
  }
  function font(c, size, weight) { c.font = (weight || 800) + ' ' + Math.max(6, size).toFixed(1) + 'px ' + FONT; }
  /** Heavy text with an edge, the house style for numbers on screen. */
  function say(c, text, x, y, size, fill, edge, align, base) {
    font(c, size, 900);
    c.textAlign = align || 'center';
    c.textBaseline = base || 'middle';
    c.lineJoin = 'round';
    if (edge) { c.strokeStyle = edge; c.lineWidth = Math.max(2, size * 0.2); c.strokeText(text, x, y); }
    c.fillStyle = fill;
    c.fillText(text, x, y);
  }

  /** A soft lumpy blob round (x, y): n bumps, smoothed, the same every frame. */
  function blob(c, x, y, rx, ry, n, seed, wob) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, k = 1 + (hash(seed, i) - 0.5) * 2 * (wob || 0.15);
      pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
    }
    c.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % n]);
      c.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    c.closePath();
  }

  /** Points scattered over an ellipse, the same every frame. */
  function scatter(n, seed, rx, ry) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(seed, i, 1) * 1.2;
      const d = 0.25 + 0.7 * Math.sqrt(hash(seed, i, 2));
      out.push({ x: Math.cos(a) * rx * d, y: Math.sin(a) * ry * d, r: hash(seed, i, 3) });
    }
    return out;
  }

  /* ----------------------------------------------------- small toppings */

  function leaf(c, x, y, s, rot, col) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath();
    c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * 0.8, s, 0); c.quadraticCurveTo(0, s * 0.8, -s, 0);
    paint(c, col || '#3FA34D', OL, s * 0.14);
    line(c, -s * 0.7, 0, s * 0.7, 0, 'rgba(255,255,255,.45)', s * 0.12);
    c.restore();
  }
  function olive(c, x, y, s) {
    ell(c, x, y, s, s * 0.8); paint(c, '#2F2A36', OL, s * 0.18);
    ell(c, x, y, s * 0.38, s * 0.3); paint(c, '#7B3F5E');
  }
  function pepperoni(c, x, y, s) {
    circ(c, x, y, s); paint(c, '#C62828', '#7E1616', s * 0.14);
    for (let i = 0; i < 3; i++) { circ(c, x + Math.cos(i * 2.1) * s * 0.45, y + Math.sin(i * 2.1) * s * 0.4, s * 0.16); paint(c, '#8E1B1B'); }
  }
  function mushroom(c, x, y, s) {
    c.beginPath();
    c.moveTo(x - s, y); c.quadraticCurveTo(x - s, y - s * 1.1, x, y - s * 1.1); c.quadraticCurveTo(x + s, y - s * 1.1, x + s, y);
    c.closePath(); paint(c, '#D9C3A0', '#8B6B45', s * 0.14);
    rr(c, x - s * 0.3, y - s * 0.05, s * 0.6, s * 0.7, s * 0.2); paint(c, '#EFE2CB', '#8B6B45', s * 0.12);
  }
  function pepperRing(c, x, y, s, rot) {
    c.beginPath(); c.arc(x, y, s, rot, rot + Math.PI * 1.4);
    c.strokeStyle = '#2F7A2A'; c.lineWidth = s * 0.55; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = '#57B84C'; c.lineWidth = s * 0.3; c.stroke();
  }
  function onionRing(c, x, y, s) {
    ell(c, x, y, s, s * 0.5); c.strokeStyle = '#B889C9'; c.lineWidth = s * 0.28; c.stroke();
    ell(c, x, y, s * 0.6, s * 0.3); c.strokeStyle = '#F4E8F8'; c.lineWidth = s * 0.2; c.stroke();
  }

  /* --------------------------------------------------------------- ware */

  /** What a dish is served on, by its base. (x, y) is the middle, r the half-width. */
  function ware(c, base, x, y, r) {
    if (FOOD.ware[base]) { FOOD.ware[base](c, x, y, r); return; }
    const lw = r * 0.05;
    if (base === 'pizza') {
      ell(c, x, y + r * 0.08, r * 1.02, r * 0.6); paint(c, '#A8703A', OL, lw);
      ell(c, x, y + r * 0.02, r * 0.96, r * 0.55); paint(c, '#C98B4A');
      return;
    }
    if (base === 'rice') {
      rr(c, x - r * 1.0, y - r * 0.18, r * 2.0, r * 0.6, r * 0.12); paint(c, '#2E3238', OL, lw);
      rr(c, x - r * 0.95, y - r * 0.2, r * 1.9, r * 0.5, r * 0.1); paint(c, '#474C55');
      return;
    }
    if (base === 'bun') {
      ell(c, x, y + r * 0.12, r * 0.98, r * 0.5); paint(c, '#E8E3D8', OL, lw);
      ell(c, x, y + r * 0.08, r * 0.86, r * 0.4);
      c.save(); c.clip();
      for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
        if ((i + j) & 1) { c.fillStyle = 'rgba(214,56,56,.55)'; c.fillRect(x + i * r * 0.2, y + r * 0.08 + j * r * 0.14, r * 0.2, r * 0.14); }
      }
      c.restore();
      return;
    }
    ell(c, x, y + r * 0.1, r, r * 0.55); paint(c, '#FFFFFF', OL, lw);
    ell(c, x, y + r * 0.08, r * 0.72, r * 0.38); paint(c, '#EEF1F5');
  }

  /* ------------------------------------------------------------- dishes */

  function pasta(c, parts, x, y, r, tone) {
    const has = p => parts.indexOf(p) >= 0;
    const my = y - r * 0.08;
    // The mound, then the strands on it.
    c.beginPath();
    c.moveTo(x - r * 0.66, my + r * 0.12);
    c.bezierCurveTo(x - r * 0.62, my - r * 0.42, x + r * 0.62, my - r * 0.42, x + r * 0.66, my + r * 0.12);
    c.quadraticCurveTo(x, my + r * 0.32, x - r * 0.66, my + r * 0.12);
    paint(c, tone || '#F3C54F', OL, r * 0.05);
    c.strokeStyle = shade(tone || '#F3C54F', -0.22); c.lineWidth = r * 0.035; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const ox = x - r * 0.45 + i * r * 0.18;
      c.beginPath(); c.arc(ox, my + r * 0.02, r * 0.14, Math.PI * 0.9, Math.PI * 2.1); c.stroke();
    }
    const sauce = has('redsauce') ? ['#D7301F', '#9E1F12'] : (has('whitesauce') ? ['#FBF3DE', '#BFAE7E'] : null);
    if (sauce) {
      // A ladleful: a soft blob on the crown, running down in a few drips,
      // with the noodles still showing round its edge.
      const sy = my - r * 0.12;
      blob(c, x, sy, r * 0.34, r * 0.15, 9, 5, 0.16);
      paint(c, sauce[0], sauce[1], r * 0.04);
      for (const [dx, len] of [[-0.24, 0.1], [0.02, 0.14], [0.22, 0.08]]) {
        rr(c, x + dx * r - r * 0.045, sy, r * 0.09, r * (0.1 + len), r * 0.045); paint(c, sauce[0]);
      }
      ell(c, x - r * 0.1, sy - r * 0.05, r * 0.12, r * 0.04, -0.15); paint(c, 'rgba(255,255,255,.6)');
    }
    if (has('meatball')) {
      for (const [dx, dy] of [[-0.2, -0.1], [0.16, -0.12], [-0.02, -0.24]]) {
        circ(c, x + dx * r, my + dy * r, r * 0.12); paint(c, '#7A3E22', OL, r * 0.035);
        circ(c, x + dx * r - r * 0.04, my + dy * r - r * 0.04, r * 0.035); paint(c, 'rgba(255,255,255,.35)');
      }
    }
    if (has('parmesan')) {
      for (const p of scatter(14, 11, r * 0.4, r * 0.18)) {
        c.fillStyle = p.r > 0.5 ? '#FFF6C9' : '#F5E7A0';
        c.fillRect(x + p.x - r * 0.025, my - r * 0.12 + p.y - r * 0.02, r * 0.06, r * 0.035);
      }
    }
    if (has('olives')) for (const p of scatter(4, 21, r * 0.36, r * 0.14)) olive(c, x + p.x, my - r * 0.14 + p.y, r * 0.075);
    if (has('basil')) { leaf(c, x - r * 0.05, my - r * 0.26, r * 0.13, -0.5); leaf(c, x + r * 0.12, my - r * 0.24, r * 0.12, 0.6); }
  }

  const STACK = {
    patty: { h: 0.17, draw: (c, x, y, w, h, r) => { rr(c, x - w, y - h, w * 2, h, h * 0.45); paint(c, '#6B3B22', OL, r * 0.04); line(c, x - w * 0.6, y - h * 0.5, x - w * 0.3, y - h * 0.5, '#3E2112', r * 0.03); line(c, x + w * 0.1, y - h * 0.5, x + w * 0.45, y - h * 0.5, '#3E2112', r * 0.03); } },
    cheddar: { h: 0.05, draw: (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x - w * 1.02, y - h); c.lineTo(x + w * 1.02, y - h); c.lineTo(x + w * 0.9, y + h * 1.4); c.lineTo(x + w * 0.62, y); c.lineTo(x - w * 0.2, y); c.lineTo(x - w * 0.45, y + h * 1.8); c.lineTo(x - w * 0.7, y); c.lineTo(x - w * 1.02, y); c.closePath(); paint(c, '#FFC61A', '#C98A00', r * 0.03); } },
    onion: { h: 0.05, draw: (c, x, y, w, h, r) => { for (let i = -1; i <= 1; i++) onionRing(c, x + i * w * 0.55, y - h * 0.5, w * 0.34); } },
    tomato: { h: 0.07, draw: (c, x, y, w, h, r) => { for (let i = -1; i <= 1; i += 2) { ell(c, x + i * w * 0.45, y - h * 0.5, w * 0.52, h * 0.7); paint(c, '#E8402E', '#9E2014', r * 0.03); ell(c, x + i * w * 0.45, y - h * 0.5, w * 0.3, h * 0.35); paint(c, '#FF8A73'); } } },
    bacon: { h: 0.06, draw: (c, x, y, w, h, r) => { for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(x - w * 1.02, y - h * (0.4 + i * 0.3)); for (let j = 1; j <= 6; j++) c.quadraticCurveTo(x - w * 1.02 + (j - 0.5) * w * 0.34, y - h * (0.4 + i * 0.3) + (j % 2 ? -h * 0.6 : h * 0.6), x - w * 1.02 + j * w * 0.34, y - h * (0.4 + i * 0.3)); c.strokeStyle = '#8E2F1E'; c.lineWidth = h * 0.8; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#F2B8A0'; c.lineWidth = h * 0.22; c.stroke(); } } },
    lettuce: { h: 0.07, draw: (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x - w * 1.08, y - h * 0.3); for (let i = 0; i <= 10; i++) { const px = x - w * 1.08 + i * w * 0.216; c.quadraticCurveTo(px - w * 0.1, y + h * (i % 2 ? 0.9 : -0.2), px, y - h * 0.3); } c.lineTo(x + w, y - h); c.lineTo(x - w, y - h); c.closePath(); paint(c, '#6CC04A', '#3C7F25', r * 0.03); } }
  };

  function burger(c, parts, x, y, r) {
    const w = r * 0.58;
    let top = y + r * 0.02;
    // bottom bun
    c.beginPath(); c.moveTo(x - w, top - r * 0.08); c.lineTo(x + w, top - r * 0.08);
    c.quadraticCurveTo(x + w, top + r * 0.12, x, top + r * 0.12); c.quadraticCurveTo(x - w, top + r * 0.12, x - w, top - r * 0.08);
    paint(c, '#E7A94F', OL, r * 0.045);
    top -= r * 0.08;
    const order = ['patty', 'bacon', 'cheddar', 'onion', 'tomato', 'lettuce'];
    for (const p of order) {
      if (parts.indexOf(p) < 0) continue;
      const st = STACK[p];
      st.draw(c, x, top, w, st.h * r, r);
      top -= st.h * r;
    }
    // top bun, seeds
    c.beginPath(); c.moveTo(x - w * 1.02, top);
    c.bezierCurveTo(x - w, top - r * 0.46, x + w, top - r * 0.46, x + w * 1.02, top);
    c.closePath(); paint(c, '#F0B35A', OL, r * 0.045);
    ell(c, x - w * 0.35, top - r * 0.22, w * 0.22, r * 0.05, -0.3); paint(c, 'rgba(255,255,255,.35)');
    for (let i = 0; i < 6; i++) { ell(c, x - w * 0.6 + i * w * 0.24, top - r * (0.12 + 0.12 * Math.sin(i * 1.3 + 1)), r * 0.035, r * 0.02, i); paint(c, '#FFF3D6'); }
  }

  function pizza(c, parts, x, y, r, tone) {
    const has = p => parts.indexOf(p) >= 0;
    const cy = y - r * 0.02;
    ell(c, x, cy, r * 0.84, r * 0.5); paint(c, tone || '#E9B45C', OL, r * 0.045);
    ell(c, x, cy, r * 0.7, r * 0.41); paint(c, '#D63A23');
    for (const p of scatter(9, 5, r * 0.55, r * 0.3)) { ell(c, x + p.x, cy + p.y, r * (0.14 + p.r * 0.06), r * 0.08); paint(c, '#FBE38B'); }
    if (has('pepperoni')) for (const p of scatter(6, 31, r * 0.5, r * 0.28)) pepperoni(c, x + p.x, cy + p.y, r * 0.1);
    if (has('mushroom')) for (const p of scatter(5, 41, r * 0.5, r * 0.28)) mushroom(c, x + p.x, cy + p.y + r * 0.04, r * 0.08);
    if (has('pepper')) for (const p of scatter(5, 51, r * 0.5, r * 0.28)) pepperRing(c, x + p.x, cy + p.y, r * 0.07, p.r * TAU);
    if (has('ham')) for (const p of scatter(6, 91, r * 0.5, r * 0.28)) { rr(c, x + p.x - r * 0.07, cy + p.y - r * 0.05, r * 0.14, r * 0.1, r * 0.02); paint(c, '#F29CA3', '#B85C66', r * 0.02); }
    if (has('pineapple')) for (const p of scatter(6, 97, r * 0.5, r * 0.28)) { c.beginPath(); c.moveTo(x + p.x - r * 0.06, cy + p.y + r * 0.04); c.lineTo(x + p.x + r * 0.06, cy + p.y + r * 0.04); c.lineTo(x + p.x, cy + p.y - r * 0.06); c.closePath(); paint(c, '#FFD84A', '#C99A00', r * 0.02); }
    if (has('olives')) for (const p of scatter(6, 61, r * 0.52, r * 0.3)) olive(c, x + p.x, cy + p.y, r * 0.06);
    if (has('basil')) for (const p of scatter(4, 71, r * 0.45, r * 0.25)) leaf(c, x + p.x, cy + p.y, r * 0.1, p.r * 3);
  }

  function taco(c, parts, x, y, r) {
    const has = p => parts.indexOf(p) >= 0;
    const ty = y - r * 0.06, w = r * 0.66;
    // the back of the shell
    c.beginPath(); c.moveTo(x - w, ty); c.bezierCurveTo(x - w * 0.9, ty - r * 0.28, x + w * 0.9, ty - r * 0.28, x + w, ty);
    c.closePath(); paint(c, '#D99A2B', OL, r * 0.04);
    // fillings over the opening, bottom to top
    const bumps = (col, edge, lift, size, seed, n) => {
      for (let i = 0; i < n; i++) {
        const px = x - w * 0.78 + (i + 0.5) * (w * 1.56 / n) + (hash(seed, i) - 0.5) * r * 0.06;
        circ(c, px, ty - r * lift - hash(seed, i, 2) * r * 0.05, r * size); paint(c, col, edge, r * 0.025);
      }
    };
    if (has('beef')) bumps('#7A4526', '#452412', 0.08, 0.1, 3, 7);
    if (has('chicken')) for (let i = 0; i < 5; i++) { rr(c, x - w * 0.7 + i * w * 0.3, ty - r * 0.2, r * 0.2, r * 0.1, r * 0.04); paint(c, '#DDA56A', '#8C5A26', r * 0.025); }
    if (has('lettuce')) bumps('#76C653', '#3C7F25', 0.16, 0.08, 7, 8);
    if (has('jack')) for (let i = 0; i < 9; i++) line(c, x - w * 0.7 + i * w * 0.17, ty - r * 0.2, x - w * 0.62 + i * w * 0.17, ty - r * 0.28, '#FFD23F', r * 0.035);
    if (has('salsa')) { bumps('#E0452F', '#9E2014', 0.22, 0.06, 9, 6); for (let i = 0; i < 4; i++) { circ(c, x - w * 0.5 + i * w * 0.33, ty - r * 0.27, r * 0.025); paint(c, '#3E9B3A'); } }
    if (has('guac')) { ell(c, x + w * 0.1, ty - r * 0.25, w * 0.42, r * 0.1); paint(c, '#9CCB5A', '#5E8A2A', r * 0.03); }
    if (has('jalapeno')) for (let i = 0; i < 4; i++) { circ(c, x - w * 0.55 + i * w * 0.36, ty - r * (0.3 + (i % 2) * 0.04), r * 0.06); paint(c, '#4CAF3F', '#2E6B24', r * 0.025); circ(c, x - w * 0.55 + i * w * 0.36, ty - r * (0.3 + (i % 2) * 0.04), r * 0.025); paint(c, '#E7F5C8'); }
    // the front of the shell
    c.beginPath(); c.moveTo(x - w * 1.02, ty - r * 0.02);
    c.bezierCurveTo(x - w * 0.95, ty + r * 0.5, x + w * 0.95, ty + r * 0.5, x + w * 1.02, ty - r * 0.02);
    c.bezierCurveTo(x + w * 0.7, ty + r * 0.14, x - w * 0.7, ty + r * 0.14, x - w * 1.02, ty - r * 0.02);
    paint(c, '#F2C14E', OL, r * 0.045);
    for (let i = 0; i < 6; i++) { circ(c, x - w * 0.5 + i * w * 0.2, ty + r * (0.22 + 0.04 * Math.sin(i * 2)), r * 0.018); paint(c, '#C98A2B'); }
  }

  function sushi(c, parts, x, y, r, tone) {
    const has = p => parts.indexOf(p) >= 0;
    const fish = has('salmon') ? ['#F58A4B', '#FFD2B0'] : (has('tuna') ? ['#C9303F', '#E98A92'] : null);
    for (const dx of [-0.42, 0.42]) {
      const cx = x + dx * r, cy = y - r * 0.02;
      rr(c, cx - r * 0.3, cy - r * 0.16, r * 0.6, r * 0.28, r * 0.13); paint(c, tone || '#FBFAF4', OL, r * 0.04);
      for (let i = 0; i < 5; i++) { ell(c, cx - r * 0.2 + i * r * 0.1, cy - r * 0.02 + (i % 2) * r * 0.06, r * 0.03, r * 0.018); paint(c, '#E6E2D6'); }
      if (fish) {
        c.beginPath(); c.moveTo(cx - r * 0.36, cy - r * 0.12);
        c.quadraticCurveTo(cx, cy - r * 0.38, cx + r * 0.36, cy - r * 0.14);
        c.quadraticCurveTo(cx, cy - r * 0.06, cx - r * 0.36, cy - r * 0.12);
        paint(c, fish[0], OL, r * 0.04);
        for (let i = 0; i < 3; i++) line(c, cx - r * 0.18 + i * r * 0.14, cy - r * 0.26 + i * r * 0.01, cx - r * 0.1 + i * r * 0.14, cy - r * 0.13, fish[1], r * 0.025);
      }
      if (has('tempura')) {
        blob(c, cx - r * 0.04, cy - r * 0.2, r * 0.3, r * 0.1, 10, 7, 0.25); paint(c, '#F2B84B', '#B67A12', r * 0.03);
        c.beginPath(); c.moveTo(cx + r * 0.24, cy - r * 0.22); c.lineTo(cx + r * 0.38, cy - r * 0.34); c.lineTo(cx + r * 0.36, cy - r * 0.14); c.closePath(); paint(c, '#E8503A', OL, r * 0.02);
      }
      if (has('avocado')) { ell(c, cx, cy - r * 0.3, r * 0.2, r * 0.06, -0.15); paint(c, '#A7D163', '#4E7A22', r * 0.025); }
      if (has('roe')) for (let i = 0; i < 6; i++) { circ(c, cx - r * 0.12 + (i % 3) * r * 0.12, cy - r * (0.36 + Math.floor(i / 3) * 0.06), r * 0.04); paint(c, '#FF7A1A', '#C24A00', r * 0.012); }
    }
    if (has('cucumber')) {
      for (let i = 0; i < 3; i++) {
        const cx = x + r * (0.62 + i * 0.1), cy = y + r * 0.2 - i * r * 0.02;
        ell(c, cx, cy, r * 0.1, r * 0.06); paint(c, '#CFEAA0', '#3E8E3E', r * 0.03);
      }
    }
  }

  /** A plated dish. (x, y) is the plate's middle, r its half-width. */
  function dish(c, parts, x, y, r, noWare) {
    if (!parts || !parts.length) { if (!noWare) ware(c, 'pasta', x, y, r); return; }
    const base = parts[0];
    if (!noWare) ware(c, base, x, y, r);
    if (FOOD.dish[base]) { FOOD.dish[base](c, parts, x, y, r); return; }
    switch (base) {
      case 'pasta': pasta(c, parts, x, y, r); break;
      case 'bun': burger(c, parts, x, y, r); break;
      case 'pizza': pizza(c, parts, x, y, r); break;
      case 'shell': taco(c, parts, x, y, r); break;
      case 'rice': sushi(c, parts, x, y, r); break;
    }
  }

  /* -------------------------------------------------------------- sides */

  function side(c, id, x, y, r, tone) {
    if (FOOD.side[id]) { FOOD.side[id](c, x, y, r, tone); return; }
    if (id === 'fries') {
      for (let i = 0; i < 7; i++) {
        const px = x - r * 0.36 + i * r * 0.12;
        rr(c, px - r * 0.05, y - r * (0.7 + (i % 3) * 0.08), r * 0.1, r * 0.6, r * 0.03); paint(c, tone || '#F8C84A', '#C9912B', r * 0.025);
      }
      c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.28); c.lineTo(x + r * 0.5, y - r * 0.28); c.lineTo(x + r * 0.38, y + r * 0.42); c.lineTo(x - r * 0.38, y + r * 0.42); c.closePath();
      paint(c, '#D8342B', OL, r * 0.05);
      c.beginPath(); c.moveTo(x - r * 0.46, y - r * 0.05); c.lineTo(x + r * 0.46, y - r * 0.05); c.lineTo(x + r * 0.44, y + r * 0.06); c.lineTo(x - r * 0.44, y + r * 0.06); c.closePath(); paint(c, '#FFD447');
      return;
    }
    if (id === 'wings') {
      ell(c, x, y + r * 0.12, r * 0.62, r * 0.32); paint(c, '#A8703A', OL, r * 0.05);
      ell(c, x, y + r * 0.06, r * 0.54, r * 0.24); paint(c, '#F6F0E2');
      for (const [dx, dy, a] of [[-0.25, -0.02, -0.4], [0.2, -0.04, 0.5], [-0.02, -0.14, 0.1]]) {
        ell(c, x + dx * r, y + dy * r, r * 0.2, r * 0.12, a); paint(c, tone || '#C8642B', '#7A3510', r * 0.035);
        ell(c, x + dx * r - r * 0.05, y + dy * r - r * 0.04, r * 0.07, r * 0.03, a); paint(c, 'rgba(255,255,255,.4)');
      }
      return;
    }
    if (id === 'nachos') {
      ell(c, x, y + r * 0.14, r * 0.62, r * 0.3); paint(c, '#FFFFFF', OL, r * 0.05);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, px = x + Math.cos(a) * r * 0.28, py = y - r * 0.02 + Math.sin(a) * r * 0.1;
        c.beginPath(); c.moveTo(px, py - r * 0.18); c.lineTo(px + r * 0.16, py + r * 0.1); c.lineTo(px - r * 0.16, py + r * 0.1); c.closePath();
        paint(c, tone || '#F3B843', '#B67A12', r * 0.025);
      }
      c.beginPath(); c.moveTo(x - r * 0.3, y - r * 0.08);
      c.bezierCurveTo(x - r * 0.1, y + r * 0.1, x + r * 0.1, y - r * 0.2, x + r * 0.3, y - r * 0.02);
      c.strokeStyle = '#FFD84D'; c.lineWidth = r * 0.07; c.lineCap = 'round'; c.stroke();
      return;
    }
    if (id === 'miso') {
      c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.12); c.quadraticCurveTo(x, y + r * 0.7, x + r * 0.5, y - r * 0.12); c.closePath();
      paint(c, '#2B2B2B', OL, r * 0.05);
      ell(c, x, y - r * 0.12, r * 0.5, r * 0.14); paint(c, '#B82E2E', OL, r * 0.04);
      ell(c, x, y - r * 0.11, r * 0.43, r * 0.1); paint(c, tone || '#C98E4F');
      for (let i = 0; i < 3; i++) { rr(c, x - r * 0.24 + i * r * 0.17, y - r * 0.15, r * 0.08, r * 0.06, r * 0.01); paint(c, '#FFFDF4'); }
      for (let i = 0; i < 4; i++) { circ(c, x - r * 0.15 + i * r * 0.1, y - r * 0.07, r * 0.025); paint(c, '#5FB14A'); }
    }
  }

  /* ------------------------------------------------------------- drinks */

  /** A drink. (x, y) is where it stands; r its size; fill 0..1 while pouring. */
  function drink(c, id, x, y, r, fill, hot, t) {
    const f = fill == null ? 1 : Math.max(0, Math.min(1, fill));
    if (FOOD.drink[id]) { FOOD.drink[id](c, x, y, r, f, hot, t || 0); return; }
    const lw = r * 0.05;
    if (id === 'coffee' || id === 'tea') {
      const cup = id === 'coffee' ? '#FFFFFF' : '#6FA37B';
      const liq = id === 'coffee' ? '#6B3E1E' : '#B9D46A';
      if (id === 'coffee') { ell(c, x, y, r * 0.62, r * 0.18); paint(c, '#FFFFFF', OL, lw); }
      c.beginPath(); c.moveTo(x - r * 0.42, y - r * 0.72); c.lineTo(x + r * 0.42, y - r * 0.72);
      c.quadraticCurveTo(x + r * 0.4, y - r * 0.02, x, y - r * 0.02); c.quadraticCurveTo(x - r * 0.4, y - r * 0.02, x - r * 0.42, y - r * 0.72);
      paint(c, cup, OL, lw);
      if (id === 'coffee') { c.beginPath(); c.arc(x + r * 0.46, y - r * 0.44, r * 0.14, -1.4, 1.4); c.strokeStyle = OL; c.lineWidth = lw * 2.2; c.stroke(); c.strokeStyle = '#FFFFFF'; c.lineWidth = lw; c.stroke(); }
      else { for (let i = 0; i < 3; i++) line(c, x - r * 0.3 + i * r * 0.3, y - r * 0.5, x - r * 0.3 + i * r * 0.3, y - r * 0.2, 'rgba(255,255,255,.35)', r * 0.05); }
      if (f > 0.05) { ell(c, x, y - r * (0.1 + 0.58 * f), r * 0.36 * (0.6 + 0.4 * f), r * 0.09); paint(c, liq); }
      if (hot && f >= 1) steam(c, x, y - r * 0.8, r, t || 0);
      return;
    }
    if (id === 'soda') {
      c.beginPath(); c.moveTo(x - r * 0.4, y - r * 0.9); c.lineTo(x + r * 0.4, y - r * 0.9); c.lineTo(x + r * 0.3, y); c.lineTo(x - r * 0.3, y); c.closePath();
      paint(c, '#E23B3B', OL, lw);
      c.beginPath(); c.moveTo(x - r * 0.36, y - r * 0.55); c.quadraticCurveTo(x, y - r * 0.4, x + r * 0.36, y - r * 0.62); c.lineTo(x + r * 0.34, y - r * 0.45); c.quadraticCurveTo(x, y - r * 0.25, x - r * 0.34, y - r * 0.38); c.closePath(); paint(c, '#FFFFFF');
      if (f >= 1) {
        ell(c, x, y - r * 0.92, r * 0.44, r * 0.1); paint(c, '#DDE3EA', OL, lw * 0.8);
        line(c, x + r * 0.08, y - r * 0.92, x + r * 0.22, y - r * 1.3, '#FFFFFF', r * 0.1);
        line(c, x + r * 0.08, y - r * 0.92, x + r * 0.22, y - r * 1.3, '#4DB6E8', r * 0.05);
      } else { ell(c, x, y - r * 0.9, r * 0.4, r * 0.08); paint(c, 'rgba(60,20,10,' + (0.2 + 0.7 * f) + ')'); }
      return;
    }
    // glasses: lemonade, horchata
    const liq = id === 'lemonade' ? '#FFE45C' : '#F3E6CF';
    c.beginPath(); c.moveTo(x - r * 0.36, y - r * 0.95); c.lineTo(x + r * 0.36, y - r * 0.95); c.lineTo(x + r * 0.3, y); c.lineTo(x - r * 0.3, y); c.closePath();
    paint(c, 'rgba(220,240,255,.55)', OL, lw);
    if (f > 0.03) {
      const top = y - r * 0.9 * f;
      c.beginPath(); c.moveTo(x - r * (0.3 + 0.06 * f * 0.95), top); c.lineTo(x + r * (0.3 + 0.06 * f * 0.95), top); c.lineTo(x + r * 0.29, y - r * 0.03); c.lineTo(x - r * 0.29, y - r * 0.03); c.closePath();
      paint(c, liq);
    }
    if (f >= 1) {
      if (id === 'lemonade') {
        rr(c, x - r * 0.18, y - r * 0.6, r * 0.18, r * 0.18, r * 0.04); paint(c, 'rgba(255,255,255,.6)');
        c.beginPath(); c.arc(x + r * 0.32, y - r * 0.95, r * 0.2, Math.PI, TAU); c.closePath(); paint(c, '#FFD21F', '#B08A00', lw * 0.8);
      } else {
        line(c, x - r * 0.1, y - r * 0.4, x + r * 0.12, y - r * 1.2, '#8B4A22', r * 0.09);
        for (let i = 0; i < 4; i++) { circ(c, x - r * 0.12 + i * r * 0.08, y - r * 0.88, r * 0.02); paint(c, '#B77A45'); }
      }
    }
    ell(c, x - r * 0.18, y - r * 0.55, r * 0.04, r * 0.26); paint(c, 'rgba(255,255,255,.5)');
  }

  function steam(c, x, y, r, t) {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = r * 0.07; c.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ph = t * 0.08 + i * 1.7;
      c.beginPath();
      c.moveTo(x + i * r * 0.18, y);
      c.bezierCurveTo(x + i * r * 0.18 + Math.sin(ph) * r * 0.12, y - r * 0.18, x + i * r * 0.18 - Math.sin(ph) * r * 0.12, y - r * 0.3, x + i * r * 0.18, y - r * 0.42);
      c.stroke();
    }
    c.restore();
  }

  /* --------------------------------------------------- anything, as icon */

  /**
   * Whatever a menu entry is — a dish, a side or a drink — at icon size,
   * centred on (x, y) with half-size r.
   */
  function item(c, parts, x, y, r, t) {
    const kind = PV.ChefData.partKind(parts[0]);
    if (kind === 'drink') { drink(c, parts[0], x, y + r * 0.62, r * 0.95, 1, !!PV.ChefData.PARTS[parts[0]].cools, t); return; }
    if (kind === 'side') { side(c, parts[0], x, y + r * 0.12, r * 1.05); return; }
    dish(c, parts, x, y + r * 0.1, r * 0.95);
  }

  /** One part on its own, for a bin or a hot plate. */
  function part(c, id, x, y, r) {
    if (FOOD.part[id]) { FOOD.part[id](c, x, y, r); return; }
    switch (id) {
      case 'redsauce': case 'salsa': {
        const col = id === 'redsauce' ? '#D7301F' : '#E0452F';
        c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.2); c.lineTo(x + r * 0.62, y - r * 0.2); c.quadraticCurveTo(x + r * 0.6, y + r * 0.62, x, y + r * 0.62); c.quadraticCurveTo(x - r * 0.6, y + r * 0.62, x - r * 0.62, y - r * 0.2);
        paint(c, '#E9EEF3', OL, r * 0.07);
        ell(c, x, y - r * 0.2, r * 0.62, r * 0.2); paint(c, col, OL, r * 0.06);
        if (id === 'salsa') for (let i = 0; i < 5; i++) { circ(c, x - r * 0.35 + i * r * 0.18, y - r * 0.2 + (i % 2) * r * 0.06, r * 0.05); paint(c, i % 2 ? '#3E9B3A' : '#FFF1D0'); }
        ell(c, x - r * 0.2, y - r * 0.26, r * 0.14, r * 0.05); paint(c, 'rgba(255,255,255,.5)');
        return;
      }
      case 'whitesauce': {
        c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.2); c.lineTo(x + r * 0.62, y - r * 0.2); c.quadraticCurveTo(x + r * 0.6, y + r * 0.62, x, y + r * 0.62); c.quadraticCurveTo(x - r * 0.6, y + r * 0.62, x - r * 0.62, y - r * 0.2);
        paint(c, '#C9D1D9', OL, r * 0.07);
        ell(c, x, y - r * 0.2, r * 0.62, r * 0.2); paint(c, '#F7EED6', OL, r * 0.06);
        return;
      }
      case 'guac': {
        ell(c, x, y + r * 0.2, r * 0.66, r * 0.4); paint(c, '#2F2A36', OL, r * 0.07);
        ell(c, x, y + r * 0.02, r * 0.58, r * 0.28); paint(c, '#9CCB5A', '#5E8A2A', r * 0.05);
        for (let i = 0; i < 4; i++) { circ(c, x - r * 0.3 + i * r * 0.2, y + r * 0.02, r * 0.05); paint(c, '#6E9E34'); }
        return;
      }
      case 'parmesan': case 'jack': {
        ell(c, x, y + r * 0.2, r * 0.66, r * 0.4); paint(c, '#DCE3EA', OL, r * 0.07);
        for (const p of scatter(18, id === 'jack' ? 3 : 4, r * 0.5, r * 0.22)) line(c, x + p.x - r * 0.07, y + p.y, x + p.x + r * 0.07, y + p.y - r * 0.05, id === 'jack' ? (p.r > 0.5 ? '#FFD23F' : '#F6A623') : (p.r > 0.5 ? '#FFF6C9' : '#EFD98B'), r * 0.07);
        return;
      }
      case 'olives': for (const p of scatter(6, 9, r * 0.42, r * 0.3)) olive(c, x + p.x, y + p.y, r * 0.2); return;
      case 'basil': leaf(c, x - r * 0.2, y, r * 0.4, -0.5); leaf(c, x + r * 0.22, y - r * 0.05, r * 0.36, 0.7); return;
      case 'cheddar':
        for (const [dx, dy, a] of [[-0.12, 0.08, -0.25], [0.1, -0.04, 0.15]]) {
          c.save(); c.translate(x + dx * r, y + dy * r); c.rotate(a);
          rr(c, -r * 0.42, -r * 0.3, r * 0.84, r * 0.6, r * 0.06); paint(c, '#FFC61A', '#C98A00', r * 0.06);
          for (const [hx, hy, hr] of [[-0.2, -0.1, 0.07], [0.15, 0.08, 0.09], [0.05, -0.16, 0.05]]) { circ(c, hx * r, hy * r, hr * r); paint(c, '#F2A900'); }
          c.restore();
        }
        return;
      case 'lettuce':
        for (const [dx, dy, s] of [[-0.22, 0.08, 0.36], [0.2, 0.1, 0.34], [0, -0.1, 0.4]]) {
          blob(c, x + dx * r, y + dy * r, r * s, r * s * 0.7, 11, 3 + dx * 10, 0.22);
          paint(c, '#76C653', '#3C7F25', r * 0.05);
          line(c, x + dx * r - r * s * 0.5, y + dy * r, x + dx * r + r * s * 0.5, y + dy * r, 'rgba(255,255,255,.5)', r * 0.04);
        }
        return;
      case 'tomato': { circ(c, x, y, r * 0.55); paint(c, '#E8402E', '#9E2014', r * 0.06); circ(c, x, y, r * 0.34); paint(c, '#FF8A73'); for (let i = 0; i < 3; i++) { circ(c, x + Math.cos(i * 2.1) * r * 0.18, y + Math.sin(i * 2.1) * r * 0.18, r * 0.06); paint(c, '#FFE39A'); } return; }
      case 'onion': onionRing(c, x - r * 0.2, y, r * 0.36); onionRing(c, x + r * 0.22, y + r * 0.1, r * 0.34); return;
      case 'pepperoni': pepperoni(c, x - r * 0.18, y + r * 0.05, r * 0.32); pepperoni(c, x + r * 0.2, y - r * 0.1, r * 0.3); return;
      case 'mushroom': mushroom(c, x - r * 0.2, y + r * 0.15, r * 0.3); mushroom(c, x + r * 0.22, y + r * 0.05, r * 0.28); return;
      case 'pepper': pepperRing(c, x - r * 0.15, y, r * 0.26, 0.3); pepperRing(c, x + r * 0.18, y + r * 0.08, r * 0.24, 2); return;
      case 'bun': ell(c, x, y + r * 0.1, r * 0.6, r * 0.2); paint(c, '#E7A94F', OL, r * 0.06); c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.05); c.bezierCurveTo(x - r * 0.6, y - r * 0.6, x + r * 0.6, y - r * 0.6, x + r * 0.6, y - r * 0.05); c.closePath(); paint(c, '#F0B35A', OL, r * 0.06); return;
      case 'shell': taco(c, ['shell'], x, y, r * 0.9); return;
      case 'salmon': case 'tuna': {
        const col = id === 'salmon' ? ['#F58A4B', '#FFD2B0'] : ['#C9303F', '#E98A92'];
        rr(c, x - r * 0.6, y - r * 0.28, r * 1.2, r * 0.56, r * 0.16); paint(c, col[0], OL, r * 0.06);
        for (let i = 0; i < 4; i++) line(c, x - r * 0.4 + i * r * 0.26, y - r * 0.2, x - r * 0.3 + i * r * 0.26, y + r * 0.2, col[1], r * 0.05);
        return;
      }
      case 'cucumber': for (let i = 0; i < 3; i++) { ell(c, x - r * 0.3 + i * r * 0.3, y + (i % 2) * r * 0.1, r * 0.24, r * 0.16); paint(c, '#CFEAA0', '#3E8E3E', r * 0.06); } return;
      case 'avocado': ell(c, x, y, r * 0.42, r * 0.56, 0.3); paint(c, '#A7D163', '#355E17', r * 0.08); circ(c, x + r * 0.05, y + r * 0.1, r * 0.2); paint(c, '#8A5A2B'); return;
      case 'roe': for (let i = 0; i < 12; i++) { circ(c, x - r * 0.36 + (i % 4) * r * 0.24, y - r * 0.2 + Math.floor(i / 4) * r * 0.2, r * 0.11); paint(c, '#FF7A1A', '#C24A00', r * 0.03); } return;
      case 'patty': STACK.patty.draw(c, x, y + r * 0.1, r * 0.55, r * 0.26, r); return;
      case 'beef': for (const p of scatter(9, 13, r * 0.4, r * 0.24)) { circ(c, x + p.x, y + p.y, r * 0.14); paint(c, '#7A4526', '#452412', r * 0.03); } return;
      case 'chicken': for (let i = 0; i < 4; i++) { rr(c, x - r * 0.5 + i * r * 0.26, y - r * 0.1 + (i % 2) * r * 0.1, r * 0.22, r * 0.14, r * 0.05); paint(c, '#DDA56A', '#8C5A26', r * 0.03); } return;
      case 'pasta': pasta(c, ['pasta'], x, y + r * 0.1, r * 0.9); return;
      case 'pizza': pizza(c, ['pizza'], x, y, r * 0.9); return;
      case 'rice': ell(c, x, y + r * 0.05, r * 0.6, r * 0.34); paint(c, '#FBFAF4', OL, r * 0.06); for (const p of scatter(10, 17, r * 0.4, r * 0.18)) { ell(c, x + p.x, y + p.y, r * 0.05, r * 0.03); paint(c, '#E6E2D6'); } return;
    }
    const k = PV.ChefData.partKind(id);
    if (k === 'side') side(c, id, x, y, r);
    else if (k === 'drink') drink(c, id, x, y + r * 0.5, r * 0.8);
  }

  /* ------------------------------------------------------------ cooking */

  /* Raw to done, as two colours; the view mixes them by how far it has cooked. */
  const DONENESS = {
    pasta: ['#F6E9B8', '#F3C54F'], whitesauce: ['#FFFFFF', '#F4E6C0'], patty: ['#D9727A', '#6B3B22'],
    fries: ['#FFF1B8', '#F8C84A'], pizza: ['#F3E2BD', '#E9B45C'], wings: ['#F1B8A0', '#C8642B'],
    beef: ['#C9535A', '#7A4526'], chicken: ['#F4C7B6', '#D9A064'], nachos: ['#F7E7B4', '#F3B843'],
    rice: ['#DDEBF2', '#FBFAF4'], miso: ['#E7D2B0', '#C98E4F']
  };

  /** What is on the heat. k: 0 raw to 1 done; burnt draws it black. */
  function onHeat(c, id, x, y, r, k, burnt) {
    const pair = DONENESS[id] || FOOD.done[id] || ['#DDDDDD', '#999999'];
    const col = burnt ? '#2A1E17' : mix(pair[0], pair[1], Math.max(0, Math.min(1, k)));
    if (FOOD.heat[id]) { FOOD.heat[id](c, x, y, r, col, burnt, k); return; }
    switch (id) {
      case 'pasta': pasta(c, ['pasta'], x, y + r * 0.1, r * 0.95, col); break;
      case 'whitesauce': ell(c, x, y, r * 0.66, r * 0.44); paint(c, col, burnt ? '#000' : '#C9B98E', r * 0.05); if (!burnt) for (let i = 0; i < 3; i++) { circ(c, x - r * 0.3 + i * r * 0.3, y + (i % 2) * r * 0.1, r * 0.06); paint(c, 'rgba(255,255,255,.6)'); } break;
      case 'patty': rr(c, x - r * 0.55, y - r * 0.28, r * 1.1, r * 0.56, r * 0.26); paint(c, col, OL, r * 0.06); if (!burnt && k > 0.5) { line(c, x - r * 0.3, y - r * 0.1, x + r * 0.1, y - r * 0.1, 'rgba(40,20,10,.6)', r * 0.06); line(c, x - r * 0.1, y + r * 0.1, x + r * 0.3, y + r * 0.1, 'rgba(40,20,10,.6)', r * 0.06); } break;
      case 'beef': for (const p of scatter(9, 13, r * 0.44, r * 0.3)) { circ(c, x + p.x, y + p.y, r * 0.15); paint(c, col, OL, r * 0.03); } break;
      case 'chicken': for (let i = 0; i < 4; i++) { rr(c, x - r * 0.55 + i * r * 0.28, y - r * 0.12 + (i % 2) * r * 0.12, r * 0.24, r * 0.16, r * 0.06); paint(c, col, OL, r * 0.03); } break;
      // In the fryer basket there is no carton, basket or plate yet: just the food.
      case 'fries':
        for (let i = 0; i < 9; i++) {
          c.save(); c.translate(x - r * 0.4 + i * r * 0.1, y + r * 0.05); c.rotate((hash(i, 5) - 0.5) * 0.9);
          rr(c, -r * 0.05, -r * 0.3, r * 0.1, r * 0.6, r * 0.03); paint(c, col, burnt ? '#000' : '#C9912B', r * 0.03);
          c.restore();
        }
        break;
      case 'wings':
        for (const [dx, dy, a] of [[-0.24, 0.06, -0.4], [0.22, 0.04, 0.5], [0, -0.12, 0.1]]) { ell(c, x + dx * r, y + dy * r, r * 0.26, r * 0.15, a); paint(c, col, burnt ? '#000' : '#7A3510', r * 0.04); }
        break;
      case 'nachos':
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05, px = x + Math.cos(a) * r * 0.26, py = y + Math.sin(a) * r * 0.14;
          c.beginPath(); c.moveTo(px, py - r * 0.2); c.lineTo(px + r * 0.18, py + r * 0.12); c.lineTo(px - r * 0.18, py + r * 0.12); c.closePath();
          paint(c, col, burnt ? '#000' : '#B67A12', r * 0.03);
        }
        break;
      case 'pizza': pizza(c, ['pizza'], x, y, r * 0.95, col); break;
      case 'rice': ell(c, x, y, r * 0.62, r * 0.4); paint(c, col, OL, r * 0.05); for (const p of scatter(10, 17, r * 0.44, r * 0.22)) { ell(c, x + p.x, y + p.y, r * 0.05, r * 0.03); paint(c, burnt ? '#111' : 'rgba(200,196,180,.7)'); } break;
      case 'miso': ell(c, x, y, r * 0.6, r * 0.36); paint(c, col, OL, r * 0.05); if (!burnt) for (let i = 0; i < 3; i++) { rr(c, x - r * 0.3 + i * r * 0.22, y - r * 0.06, r * 0.1, r * 0.08, r * 0.02); paint(c, '#FFFDF4'); } break;
      default: part(c, id, x, y, r);
    }
  }

  function smoke(c, x, y, r, t) {
    c.save();
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.02 + i * 0.25) % 1);
      circ(c, x + Math.sin(ph * 6 + i) * r * 0.2, y - ph * r * 1.4, r * (0.18 + ph * 0.22));
      c.fillStyle = 'rgba(70,70,74,' + (0.55 * (1 - ph)) + ')'; c.fill();
    }
    c.restore();
  }

  function bubbles(c, x, y, r, t) {
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.03 + i * 0.21) % 1);
      circ(c, x + (hash(i, 3) - 0.5) * r * 1.1, y + r * 0.2 - ph * r * 0.5, r * 0.05 * (1 - ph * 0.5));
      c.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)) + ')'; c.fill();
    }
  }

  /** The progress ring round a slot: cooking fills it, a burn warning drains it red. */
  function ring(c, x, y, r, frac, col, w) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.strokeStyle = 'rgba(20,20,24,.35)'; c.lineWidth = w; c.stroke();
    c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, frac)));
    c.strokeStyle = col; c.lineWidth = w * 0.72; c.lineCap = 'round'; c.stroke();
  }

  function tick(c, x, y, r) {
    circ(c, x, y, r); paint(c, '#34C759', '#FFFFFF', r * 0.22);
    c.beginPath(); c.moveTo(x - r * 0.45, y); c.lineTo(x - r * 0.1, y + r * 0.35); c.lineTo(x + r * 0.5, y - r * 0.35);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = r * 0.28; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }

  /* ----------------------------------------------------------- stations */

  function burner(c, x, y, r, on) {
    ell(c, x, y + r * 0.2, r * 1.02, r * 0.5); paint(c, '#2D3036', OL, r * 0.05);
    ell(c, x, y + r * 0.18, r * 0.7, r * 0.3);
    c.strokeStyle = on ? '#FF6A2B' : '#555A63'; c.lineWidth = r * 0.1; c.stroke();
    if (on) { c.save(); c.globalAlpha = 0.35; ell(c, x, y + r * 0.18, r * 0.8, r * 0.36); c.strokeStyle = '#FFB36B'; c.lineWidth = r * 0.14; c.stroke(); c.restore(); }
  }

  /** The body behind a cook station's slots. */
  function cookBody(c, art, box, th) {
    if (FOOD.station[art] && FOOD.station[art].body) { FOOD.station[art].body(c, box, th); return; }
    const { x, y, w, h } = box, u = box.u;
    const lw = u * 0.025;
    if (art === 'oven') {
      rr(c, x, y + h * 0.04, w, h * 0.94, u * 0.1); paint(c, '#B5553A', OL, lw);
      c.save();
      rr(c, x, y + h * 0.04, w, h * 0.94, u * 0.1); c.clip();
      c.strokeStyle = 'rgba(80,25,12,.35)'; c.lineWidth = lw * 0.6;
      for (let r = 0; r < 5; r++) for (let q = -1; q < Math.ceil(w / (u * 0.24)); q++) {
        c.strokeRect(x + q * u * 0.24 + (r % 2) * u * 0.12, y + h * 0.04 + r * h * 0.19, u * 0.24, h * 0.19);
      }
      c.restore();
      return;
    }
    if (art === 'fryer') {
      rr(c, x, y + h * 0.12, w, h * 0.86, u * 0.06); paint(c, '#C8CED6', OL, lw);
      rr(c, x + u * 0.05, y + h * 0.2, w - u * 0.1, h * 0.62, u * 0.04); paint(c, '#D9A441');
      return;
    }
    if (art === 'grill') {
      rr(c, x, y + h * 0.16, w, h * 0.82, u * 0.06); paint(c, '#3A3D44', OL, lw);
      for (let i = 0; i < Math.floor(w / (u * 0.09)); i++) line(c, x + u * 0.06 + i * u * 0.09, y + h * 0.24, x + u * 0.06 + i * u * 0.09, y + h * 0.9, '#23252A', lw * 0.9);
      return;
    }
    if (art === 'ricer') {
      rr(c, x, y + h * 0.5, w, h * 0.48, u * 0.06); paint(c, th.shelf, OL, lw);
      return;
    }
    rr(c, x, y + h * 0.3, w, h * 0.68, u * 0.08); paint(c, '#9AA3AE', OL, lw);
    rr(c, x + u * 0.04, y + h * 0.34, w - u * 0.08, h * 0.12, u * 0.04); paint(c, '#B7BFC8');
  }

  /** One slot of a cook station, as it is now. */
  function cookSlot(c, art, part, slot, st, sl, t) {
    const { cx, cy, r } = slot;
    const k = sl.st === 'cook' ? sl.t / st.work : (sl.st === 'empty' ? 0 : 1);
    const burnt = sl.st === 'burnt';
    const busy = sl.st !== 'empty';
    const custom = FOOD.station[art];
    if (custom && custom.slot) {
      custom.slot(c, part, slot, k, burnt, busy, sl, t);
    } else if (art === 'pot' || art === 'pan') {
      burner(c, cx, cy + r * 0.25, r * 0.95, busy && !burnt && sl.st !== 'done');
      if (art === 'pot') {
        rr(c, cx - r * 0.86, cy - r * 0.1, r * 1.72, r * 0.9, r * 0.2); paint(c, '#AEB6C0', OL, r * 0.06);
        line(c, cx - r * 1.05, cy + r * 0.1, cx - r * 0.86, cy + r * 0.1, OL, r * 0.16);
        line(c, cx + r * 0.86, cy + r * 0.1, cx + r * 1.05, cy + r * 0.1, OL, r * 0.16);
        ell(c, cx, cy - r * 0.1, r * 0.86, r * 0.28); paint(c, '#7E8793', OL, r * 0.05);
        if (busy) {
          ell(c, cx, cy - r * 0.08, r * 0.76, r * 0.22); paint(c, burnt ? '#3A2A20' : (part === 'miso' ? '#D7B084' : '#BFE3F2'));
          c.save(); ell(c, cx, cy - r * 0.08, r * 0.76, r * 0.22); c.clip();
          onHeat(c, part, cx, cy - r * 0.16, r * 0.7, k, burnt);
          c.restore();
          if (sl.st === 'cook') bubbles(c, cx, cy - r * 0.1, r, t);
        }
      } else {
        line(c, cx + r * 0.7, cy + r * 0.05, cx + r * 1.2, cy - r * 0.12, OL, r * 0.2);
        line(c, cx + r * 0.7, cy + r * 0.05, cx + r * 1.2, cy - r * 0.12, '#5A5F68', r * 0.1);
        ell(c, cx, cy + r * 0.05, r * 0.82, r * 0.42); paint(c, '#474C55', OL, r * 0.06);
        ell(c, cx, cy + r * 0.02, r * 0.68, r * 0.32); paint(c, '#5E646E');
        if (busy) onHeat(c, part, cx, cy + r * 0.02, r * 0.66, k, burnt);
      }
    } else if (art === 'grill') {
      if (busy) onHeat(c, part, cx, cy + r * 0.1, r * 1.35, k, burnt);
      else { c.save(); c.globalAlpha = 0.18; onHeat(c, part, cx, cy + r * 0.1, r * 1.35, 0, false); c.restore(); }
    } else if (art === 'fryer') {
      rr(c, cx - r * 0.72, cy - r * 0.36, r * 1.44, r * 1.0, r * 0.12); paint(c, '#E1B24C', OL, r * 0.05);
      c.save(); rr(c, cx - r * 0.72, cy - r * 0.36, r * 1.44, r * 1.0, r * 0.12); c.clip();
      for (let i = 0; i < 6; i++) line(c, cx - r * 0.72 + i * r * 0.28, cy - r * 0.36, cx - r * 0.72 + i * r * 0.28, cy + r * 0.64, 'rgba(90,60,20,.35)', r * 0.05);
      c.restore();
      line(c, cx, cy - r * 0.36, cx, cy - r * 0.78, '#2B2B2B', r * 0.12);
      if (busy) onHeat(c, part, cx, cy + r * 0.05, r * 0.72, k, burnt);
      if (sl.st === 'cook') bubbles(c, cx, cy + r * 0.3, r * 1.2, t);
    } else if (art === 'oven') {
      c.beginPath(); c.moveTo(cx - r * 0.86, cy + r * 0.72); c.lineTo(cx - r * 0.86, cy - r * 0.1); c.arc(cx, cy - r * 0.1, r * 0.86, Math.PI, TAU); c.lineTo(cx + r * 0.86, cy + r * 0.72); c.closePath();
      paint(c, busy && !burnt && sl.st === 'cook' ? '#3B1A0E' : '#2B1A12', OL, r * 0.06);
      if (sl.st === 'cook') { c.save(); c.globalAlpha = 0.5 + 0.2 * Math.sin(t * 0.2); ell(c, cx, cy + r * 0.55, r * 0.7, r * 0.18); c.fillStyle = '#FF7A1A'; c.fill(); c.restore(); }
      if (busy) onHeat(c, part, cx, cy + r * 0.3, r * (part === 'pizza' ? 0.72 : 0.98), k, burnt);
    } else if (art === 'ricer') {
      rr(c, cx - r * 0.78, cy - r * 0.45, r * 1.56, r * 1.25, r * 0.4); paint(c, '#F4F4F2', OL, r * 0.06);
      rr(c, cx - r * 0.5, cy + r * 0.4, r * 1.0, r * 0.2, r * 0.08); paint(c, '#D93A2E');
      if (sl.st === 'cook') {
        ell(c, cx, cy - r * 0.45, r * 0.8, r * 0.26); paint(c, '#DADAD6', OL, r * 0.05);
        steam(c, cx, cy - r * 0.6, r * 0.8, t);
      } else if (busy) {
        ell(c, cx, cy - r * 0.35, r * 0.7, r * 0.3); paint(c, '#CFCFCB', OL, r * 0.04);
        onHeat(c, part, cx, cy - r * 0.35, r * 0.66, k, burnt);
      } else { ell(c, cx, cy - r * 0.45, r * 0.8, r * 0.26); paint(c, '#DADAD6', OL, r * 0.05); }
    }
    if (!busy) {
      // A faint "+" says tap me.
      c.save(); c.globalAlpha = 0.5;
      line(c, cx - r * 0.18, cy - r * 0.02, cx + r * 0.18, cy - r * 0.02, '#FFFFFF', r * 0.1);
      line(c, cx, cy - r * 0.2, cx, cy + r * 0.16, '#FFFFFF', r * 0.1);
      c.restore();
      return;
    }
    const rx = cx + r * 0.78, ry = cy - r * 0.62, rr2 = r * 0.24;
    if (sl.st === 'cook') ring(c, rx, ry, rr2, k, '#FF9F1C', r * 0.12);
    else if (sl.st === 'done') {
      const left = st.burn ? 1 - sl.t / st.burn : 1;
      if (left < 0.45 && Math.floor(t / 8) % 2) { ring(c, rx, ry, rr2, left, '#FF3B30', r * 0.14); }
      else if (left < 0.999) ring(c, rx, ry, rr2, left, left < 0.45 ? '#FF3B30' : '#34C759', r * 0.12);
      tick(c, rx, ry, rr2 * 0.8);
    } else if (burnt) smoke(c, cx, cy - r * 0.3, r, t);
  }

  /** A drink machine: body, and the cups under it. */
  function drinkMachine(c, art, box, m, th, t, busy, id) {
    const u = box.u, { x, y, w, h } = m;
    const lw = u * 0.025;
    rr(c, box.x, y + h * 0.9, box.w, h * 0.1, u * 0.03); paint(c, '#9AA3AE', OL, lw);
    if (FOOD.machine[art]) { FOOD.machine[art](c, box, m, th, t, busy, id); return; }
    if (art === 'espresso') {
      rr(c, x, y + h * 0.12, w, h * 0.8, u * 0.06); paint(c, '#D93A2E', OL, lw);
      rr(c, x + w * 0.12, y + h * 0.22, w * 0.76, h * 0.2, u * 0.03); paint(c, '#E9EEF3');
      circ(c, x + w * 0.35, y + h * 0.32, u * 0.035); paint(c, '#2B2B2B'); circ(c, x + w * 0.65, y + h * 0.32, u * 0.035); paint(c, busy ? '#34C759' : '#2B2B2B');
      rr(c, x + w * 0.3, y + h * 0.5, w * 0.4, h * 0.1, u * 0.02); paint(c, '#2B2B2B');
    } else if (art === 'fountain') {
      rr(c, x, y + h * 0.08, w, h * 0.84, u * 0.06); paint(c, '#2E6FB8', OL, lw);
      for (let i = 0; i < 3; i++) { rr(c, x + w * 0.12, y + h * (0.18 + i * 0.17), w * 0.76, h * 0.12, u * 0.03); paint(c, ['#E23B3B', '#FFD447', '#8BD17C'][i]); }
    } else if (art === 'jug' || art === 'urn') {
      const liq = FOOD.liquid[id] || (art === 'jug' ? '#FFE45C' : '#F3E6CF');
      rr(c, x + w * 0.08, y + h * 0.05, w * 0.84, h * 0.72, u * 0.12); paint(c, 'rgba(220,240,255,.7)', OL, lw);
      rr(c, x + w * 0.12, y + h * 0.25, w * 0.76, h * 0.5, u * 0.1); paint(c, liq);
      if (art === 'jug' && (!id || id === 'lemonade')) {
        // Lemon wheels and ice, scattered — three half-moons in a row read as a face.
        for (const [fx, fy, rr2] of [[0.34, 0.36, 0.065], [0.66, 0.5, 0.055], [0.42, 0.62, 0.05]]) {
          circ(c, x + w * fx, y + h * fy, u * rr2); paint(c, '#FFF3A0', '#D9B400', lw * 0.6);
          for (let q = 0; q < 3; q++) { const a = q * Math.PI / 3; line(c, x + w * fx - Math.cos(a) * u * rr2 * 0.7, y + h * fy - Math.sin(a) * u * rr2 * 0.7, x + w * fx + Math.cos(a) * u * rr2 * 0.7, y + h * fy + Math.sin(a) * u * rr2 * 0.7, '#E6C200', lw * 0.4); }
        }
        rr(c, x + w * 0.56, y + h * 0.28, u * 0.08, u * 0.08, u * 0.02); paint(c, 'rgba(255,255,255,.7)');
      }
      else if (art === 'urn' && (!id || id === 'horchata')) for (let i = 0; i < 4; i++) line(c, x + w * 0.25 + i * w * 0.15, y + h * 0.3, x + w * 0.3 + i * w * 0.15, y + h * 0.36, '#B77A45', lw);
      rr(c, x + w * 0.2, y + h * 0.77, w * 0.6, h * 0.15, u * 0.03); paint(c, th.a, OL, lw);
    } else if (art === 'kettle') {
      rr(c, x + w * 0.1, y + h * 0.7, w * 0.8, h * 0.22, u * 0.04); paint(c, '#474C55', OL, lw);
      c.beginPath(); c.moveTo(x + w * 0.16, y + h * 0.7); c.bezierCurveTo(x + w * 0.1, y + h * 0.2, x + w * 0.9, y + h * 0.2, x + w * 0.84, y + h * 0.7); c.closePath();
      paint(c, '#2E3238', OL, lw);
      line(c, x + w * 0.84, y + h * 0.5, x + w * 1.02, y + h * 0.32, '#2E3238', u * 0.06);
      c.beginPath(); c.arc(x + w * 0.5, y + h * 0.3, w * 0.28, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = '#8B6B45'; c.lineWidth = u * 0.04; c.stroke();
      if (busy) steam(c, x + w * 1.02, y + h * 0.3, u * 0.25, t);
    }
  }

  function drinkSlot(c, id, slot, st, sl, t) {
    const { cx, x, y, w, h } = slot;
    const r = w * 0.52;
    const floorY = y + h * 0.84;
    ell(c, cx, floorY + r * 0.06, r * 0.66, r * 0.14); paint(c, 'rgba(0,0,0,.18)');
    if (sl.st === 'empty') {
      c.save(); c.globalAlpha = 0.28; drink(c, id, cx, floorY, r, 0); c.restore();
      c.save(); c.globalAlpha = 0.5;
      line(c, cx - r * 0.2, floorY - r * 0.45, cx + r * 0.2, floorY - r * 0.45, '#FFFFFF', r * 0.1);
      line(c, cx, floorY - r * 0.65, cx, floorY - r * 0.25, '#FFFFFF', r * 0.1);
      c.restore();
      return;
    }
    const f = sl.st === 'fill' ? sl.t / st.work : 1;
    const cold = st.cools && sl.st === 'full' && sl.age >= st.cools;
    drink(c, id, cx, floorY, r, f, !cold, t);
    if (sl.st === 'fill') {
      const col = FOOD.liquid[id] || (id === 'coffee' ? '#6B3E1E' : (id === 'tea' ? '#B9D46A' : (id === 'soda' ? '#5A2A1A' : (id === 'lemonade' ? '#FFE45C' : '#F3E6CF'))));
      line(c, cx, y, cx, floorY - r * 0.2, col, r * 0.1);
      ring(c, cx + r * 0.55, y + h * 0.1, r * 0.2, f, '#FF9F1C', r * 0.1);
    } else if (cold) {
      say(c, '❄', cx + r * 0.5, y + h * 0.12, r * 0.4, '#4DB6E8', '#FFFFFF');
    }
  }

  function warmer(c, box, slots, parts, t) {
    const u = box.u;
    rr(c, box.x, box.y + box.h * 0.4, box.w, box.h * 0.56, u * 0.06); paint(c, '#474C55', OL, u * 0.025);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      ell(c, s.cx, s.cy + s.r * 0.4, s.r * 1.05, s.r * 0.45); paint(c, '#2B2E33');
      ell(c, s.cx, s.cy + s.r * 0.4, s.r * 0.7, s.r * 0.28); c.strokeStyle = 'rgba(255,90,40,' + (0.55 + 0.2 * Math.sin(t * 0.08 + i)) + ')'; c.lineWidth = s.r * 0.12; c.stroke();
      // Something cooked keeps its cooked look; a side is a side.
      if (parts[i]) {
        if ((DONENESS[parts[i]] || FOOD.done[parts[i]]) && PV.ChefData.partKind(parts[i]) !== 'side') onHeat(c, parts[i], s.cx, s.cy, s.r * 1.15, 1, false);
        else part(c, parts[i], s.cx, s.cy, s.r * 1.1);
      }
    }
  }

  function bin(c, b, id) {
    const { x, y, w, h } = b;
    rr(c, x + w * 0.06, y + h * 0.42, w * 0.88, h * 0.54, h * 0.08); paint(c, '#C8CED6', OL, h * 0.025);
    rr(c, x + w * 0.12, y + h * 0.46, w * 0.76, h * 0.2, h * 0.05); paint(c, '#AEB6C0');
    part(c, id, b.cx, y + h * 0.42, w * 0.42);
  }

  function trash(c, b, lit) {
    const { x, y, w, h } = b;
    c.beginPath(); c.moveTo(x + w * 0.18, y + h * 0.36); c.lineTo(x + w * 0.82, y + h * 0.36); c.lineTo(x + w * 0.74, y + h * 0.96); c.lineTo(x + w * 0.26, y + h * 0.96); c.closePath();
    paint(c, lit ? '#4CC38A' : '#3F8F5E', OL, h * 0.03);
    for (let i = 0; i < 3; i++) line(c, x + w * (0.36 + i * 0.14), y + h * 0.46, x + w * (0.36 + i * 0.14), y + h * 0.86, 'rgba(0,0,0,.25)', h * 0.03);
    c.save(); c.translate(x + w * 0.5, y + h * 0.33); c.rotate(lit ? -0.35 : 0);
    rr(c, -w * 0.38, -h * 0.07, w * 0.76, h * 0.08, h * 0.03); paint(c, '#2E6B45', OL, h * 0.025);
    rr(c, -w * 0.08, -h * 0.12, w * 0.16, h * 0.06, h * 0.02); paint(c, '#2E6B45', OL, h * 0.02);
    c.restore();
  }

  /* ---------------------------------------------------------- customers */

  const SKIN = ['#F9D3B4', '#F1C29B', '#D9A177', '#B97A50', '#8A5634', '#6B4028'];
  const HAIR = ['#2B1D14', '#5B3A1E', '#C98A3B', '#E7C66A', '#A63A22', '#8E8E93', '#1E2530'];
  const SHIRT = ['#E4587A', '#4DB6E8', '#8E63D6', '#4CC38A', '#F2A33A', '#E23B3B', '#2E6FB8', '#F2C94C', '#14A89E', '#6B7A8F', '#FF8B5A', '#A5D34E'];
  const LOOKS = [
    { skin: 0, hair: 2, style: 'long', shirt: 0 }, { skin: 3, hair: 0, style: 'short', shirt: 1 },
    { skin: 1, hair: 4, style: 'bun', shirt: 2 }, { skin: 5, hair: 6, style: 'curly', shirt: 3 },
    { skin: 2, hair: 1, style: 'cap', shirt: 4 }, { skin: 0, hair: 5, style: 'bald', shirt: 5 },
    { skin: 4, hair: 0, style: 'long', shirt: 6 }, { skin: 1, hair: 3, style: 'pony', shirt: 7 },
    { skin: 2, hair: 0, style: 'spiky', shirt: 8 }, { skin: 3, hair: 1, style: 'bun', shirt: 9 },
    { skin: 0, hair: 1, style: 'cap', shirt: 10 }, { skin: 5, hair: 0, style: 'short', shirt: 11 }
  ];

  /**
   * A customer from the waist up, standing at (x, base) where the counter
   * cuts them off. k scales them; mood 0 cross .. 1 delighted; st is what
   * they are doing (in, wait, happy, angry).
   */
  function person(c, look, x, base, k, mood, t, st) {
    const L = LOOKS[((look | 0) % LOOKS.length + LOOKS.length) % LOOKS.length];
    const skin = SKIN[L.skin], hair = HAIR[L.hair], shirt = SHIRT[L.shirt];
    const bob = st === 'happy' ? Math.abs(Math.sin(t * 0.25)) * 6 * k : Math.sin(t * 0.05 + look) * 1.2 * k;
    const hy = base - 104 * k - bob;                 // head centre
    const hr = 30 * k;
    // body
    c.beginPath();
    c.moveTo(x - 46 * k, base + 2); c.bezierCurveTo(x - 46 * k, hy + 44 * k, x - 30 * k, hy + 34 * k, x, hy + 34 * k);
    c.bezierCurveTo(x + 30 * k, hy + 34 * k, x + 46 * k, hy + 44 * k, x + 46 * k, base + 2); c.closePath();
    paint(c, shirt, OL, 2.2 * k);
    c.beginPath(); c.moveTo(x - 12 * k, hy + 34 * k); c.lineTo(x, hy + 48 * k); c.lineTo(x + 12 * k, hy + 34 * k);
    c.strokeStyle = shade(shirt, -0.3); c.lineWidth = 2.4 * k; c.stroke();
    // neck
    rr(c, x - 8 * k, hy + 20 * k, 16 * k, 16 * k, 4 * k); paint(c, shade(skin, -0.12));
    // hair behind
    if (L.style === 'long' || L.style === 'pony') { rr(c, x - hr * 1.08, hy - hr * 0.5, hr * 2.16, hr * 1.9, hr * 0.7); paint(c, hair, OL, 2 * k); }
    // head
    circ(c, x, hy, hr); paint(c, st === 'angry' ? mix(skin, '#E5533D', 0.35) : skin, OL, 2.2 * k);
    ell(c, x - hr * 0.98, hy + 2 * k, hr * 0.16, hr * 0.24); paint(c, skin, OL, 1.8 * k);
    ell(c, x + hr * 0.98, hy + 2 * k, hr * 0.16, hr * 0.24); paint(c, skin, OL, 1.8 * k);
    // hair on top
    c.beginPath();
    switch (L.style) {
      case 'short': case 'long': case 'pony':
        c.arc(x, hy - 2 * k, hr * 1.03, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(x + hr * 0.2, hy - hr * 0.35, x - hr * 1.0, hy - hr * 0.12); break;
      case 'bun':
        c.arc(x, hy - 2 * k, hr * 1.03, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(x, hy - hr * 0.5, x - hr * 1.0, hy - hr * 0.12);
        c.moveTo(x + hr * 0.42, hy - hr * 1.1); c.arc(x, hy - hr * 1.1, hr * 0.42, 0, TAU); break;
      case 'curly':
        for (let i = 0; i < 7; i++) { const a = Math.PI * (1.0 + i / 6); c.moveTo(x + Math.cos(a) * hr * 0.95 + hr * 0.3, hy + Math.sin(a) * hr * 0.95); c.arc(x + Math.cos(a) * hr * 0.95, hy + Math.sin(a) * hr * 0.95, hr * 0.3, 0, TAU); }
        break;
      case 'spiky':
        c.moveTo(x - hr, hy - hr * 0.2);
        for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.05 + i * 0.15); c.lineTo(x + Math.cos(a) * hr * (i % 2 ? 1.45 : 0.95), hy + Math.sin(a) * hr * (i % 2 ? 1.45 : 0.95)); }
        c.lineTo(x + hr, hy - hr * 0.2); c.closePath(); break;
      case 'cap':
        c.arc(x, hy - 3 * k, hr * 1.05, Math.PI, TAU); c.lineTo(x + hr * 1.7, hy - 3 * k); c.lineTo(x + hr * 1.7, hy + 3 * k); c.lineTo(x - hr * 1.05, hy + 3 * k); c.closePath(); break;
      case 'bald':
        c.moveTo(x - hr * 0.8, hy + hr * 0.3); c.quadraticCurveTo(x, hy + hr * 1.35, x + hr * 0.8, hy + hr * 0.3); c.quadraticCurveTo(x, hy + hr * 0.75, x - hr * 0.8, hy + hr * 0.3); break;
    }
    paint(c, L.style === 'cap' ? shade(shirt, -0.25) : hair, OL, 2 * k);
    if (L.style === 'pony') { ell(c, x + hr * 1.05, hy + hr * 0.3, hr * 0.26, hr * 0.6, -0.3); paint(c, hair, OL, 2 * k); }
    // face
    const ey = hy + 2 * k;
    if (st === 'happy') {
      for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * 11 * k, ey + 2 * k, 5 * k, Math.PI * 1.15, Math.PI * 1.85); c.strokeStyle = OL; c.lineWidth = 2.4 * k; c.lineCap = 'round'; c.stroke(); }
    } else {
      for (const s of [-1, 1]) { ell(c, x + s * 11 * k, ey, 3.6 * k, 4.6 * k); paint(c, '#2B1D14'); circ(c, x + s * 11 * k + 1.2 * k, ey - 1.6 * k, 1.2 * k); paint(c, '#FFFFFF'); }
      if (st === 'angry' || mood < 0.3) {
        line(c, x - 17 * k, ey - 9 * k, x - 6 * k, ey - 6 * k, OL, 2.4 * k);
        line(c, x + 17 * k, ey - 9 * k, x + 6 * k, ey - 6 * k, OL, 2.4 * k);
      }
    }
    if (mood > 0.55 || st === 'happy') { circ(c, x - 17 * k, ey + 9 * k, 4.5 * k); paint(c, 'rgba(255,110,110,.35)'); circ(c, x + 17 * k, ey + 9 * k, 4.5 * k); paint(c, 'rgba(255,110,110,.35)'); }
    c.beginPath();
    const my = ey + 14 * k;
    if (st === 'happy' || mood > 0.66) { c.arc(x, my - 3 * k, 8 * k, Math.PI * 0.15, Math.PI * 0.85); }
    else if (st === 'angry' || mood < 0.3) { c.arc(x, my + 6 * k, 7 * k, Math.PI * 1.2, Math.PI * 1.8); }
    else { c.moveTo(x - 6 * k, my); c.lineTo(x + 6 * k, my); }
    c.strokeStyle = OL; c.lineWidth = 2.6 * k; c.lineCap = 'round'; c.stroke();
    if (st === 'angry') {
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.04 + i / 3) % 1);
        circ(c, x + hr * 0.9 + ph * 10 * k, hy - hr * 0.8 - ph * 22 * k, (4 + ph * 5) * k);
        c.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)) + ')'; c.fill();
      }
    }
  }

  /* ----------------------------------------------------------- the scene */

  /** The street: sky, the far side of the road, the pavement. Painted once. */
  function street(c, key, W, H, tall) {
    const th = themeOf(key);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // clouds
    for (let i = 0; i < 4; i++) {
      const cx = W * (0.12 + i * 0.26) + hash(i, 1) * 40, cy = H * (0.18 + hash(i, 2) * 0.12);
      c.fillStyle = 'rgba(255,255,255,.75)';
      for (let j = 0; j < 3; j++) { circ(c, cx + j * 22, cy - (j === 1 ? 10 : 0), 18 + (j === 1 ? 6 : 0)); c.fill(); }
    }
    // far buildings
    let x = -20, i = 0;
    const seed = strHash(key);
    while (x < W + 20) {
      const bw = 70 + hash(seed, i, 1) * 80, bh = H * (0.42 + hash(seed, i, 2) * 0.32);
      const col = mix(th.far, i % 2 ? '#FFFFFF' : '#000000', 0.08 + hash(seed, i, 3) * 0.08);
      rr(c, x, H - bh, bw, bh + 10, 6); paint(c, col);
      c.fillStyle = 'rgba(255,255,255,.45)';
      for (let wy = H - bh + 16; wy < H - 30; wy += 30) for (let wx = x + 12; wx < x + bw - 20; wx += 24) c.fillRect(wx, wy, 12, 16);
      rr(c, x - 4, H - bh - 6, bw + 8, 10, 3); paint(c, shade(col, -0.12));
      x += bw + 6; i++;
    }
    // pavement
    c.fillStyle = th.near; c.fillRect(0, H - 34, W, 34);
    c.fillStyle = 'rgba(0,0,0,.08)';
    for (let px = 0; px < W; px += 60) c.fillRect(px, H - 34, 2, 34);
  }

  /** The truck's window frame and awning, over the street. */
  function frame(c, key, W, streetH, counterH, t) {
    const th = themeOf(key);
    // the awning, scalloped
    const aw = 30;
    const n = Math.ceil(W / 50);
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? th.b : th.a;
      c.fillRect(i * 50, 0, 50, aw);
      c.beginPath(); c.arc(i * 50 + 25, aw, 25, 0, Math.PI); c.fill();
    }
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, aw); c.lineTo(W, aw); c.stroke();
    // side posts
    c.fillStyle = th.trim;
    c.fillRect(0, 0, 10, streetH); c.fillRect(W - 10, 0, 10, streetH);
    // the counter
    const y = streetH;
    const g = c.createLinearGradient(0, y, 0, y + counterH);
    g.addColorStop(0, '#E6EBF0'); g.addColorStop(0.35, '#C3CBD4'); g.addColorStop(1, '#8F99A5');
    c.fillStyle = g; c.fillRect(0, y - 4, W, counterH + 4);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(0, y - 4, W, 3);
    c.fillStyle = th.a; c.fillRect(0, y + counterH - 6, W, 6);
  }

  /** The kitchen's back wall and a shelf under every row. Painted once. */
  function kitchen(c, key, L) {
    const th = themeOf(key);
    const k = L.kitchen;
    c.fillStyle = th.tile; c.fillRect(k.x, k.y, k.w, k.h);
    const ts = L.tall ? 40 : 36;
    c.fillStyle = th.tile2;
    for (let y = k.y, r = 0; y < k.y + k.h; y += ts, r++) for (let x = (r % 2) * ts; x < k.w; x += ts * 2) c.fillRect(x, y, ts, ts);
    c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 1;
    for (let y = k.y; y < k.y + k.h; y += ts) { c.beginPath(); c.moveTo(0, y); c.lineTo(k.w, y); c.stroke(); }
    const rows = {};
    for (const b of L.boxes) {
      if (b.row == null) continue;
      const r = rows[b.row] || (rows[b.row] = { x0: Infinity, x1: -Infinity, y: 0, u: b.u });
      r.x0 = Math.min(r.x0, b.x); r.x1 = Math.max(r.x1, b.x + b.w); r.y = b.y + b.h; r.u = b.u;
    }
    for (const key2 in rows) {
      const r = rows[key2];
      rr(c, r.x0 - r.u * 0.08, r.y - r.u * 0.06, r.x1 - r.x0 + r.u * 0.16, r.u * 0.12, r.u * 0.03);
      paint(c, th.shelf, OL, r.u * 0.02);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(r.x0 - r.u * 0.06, r.y + r.u * 0.06, r.x1 - r.x0 + r.u * 0.12, r.u * 0.04);
    }
  }

  /** A truck from the side, for the map and the menu. (x, y) the top-left; w its length. */
  function truck(c, key, x, y, w, name) {
    const th = themeOf(key);
    const h = w * 0.56, lw = Math.max(1, w * 0.012);
    // body
    rr(c, x, y + h * 0.1, w * 0.74, h * 0.72, w * 0.04); paint(c, th.a, OL, lw);
    // cab
    c.beginPath(); c.moveTo(x + w * 0.74, y + h * 0.3); c.lineTo(x + w * 0.9, y + h * 0.3); c.lineTo(x + w, y + h * 0.52); c.lineTo(x + w, y + h * 0.82); c.lineTo(x + w * 0.74, y + h * 0.82); c.closePath();
    paint(c, shade(th.a, -0.12), OL, lw);
    c.beginPath(); c.moveTo(x + w * 0.78, y + h * 0.35); c.lineTo(x + w * 0.88, y + h * 0.35); c.lineTo(x + w * 0.95, y + h * 0.5); c.lineTo(x + w * 0.78, y + h * 0.5); c.closePath();
    paint(c, '#BFE6F7', OL, lw);
    // serving window, awning
    rr(c, x + w * 0.1, y + h * 0.26, w * 0.52, h * 0.3, w * 0.02); paint(c, '#2B2F36', OL, lw);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? th.b : th.c;
      c.beginPath(); c.moveTo(x + w * (0.08 + i * 0.07), y + h * 0.18); c.lineTo(x + w * (0.15 + i * 0.07), y + h * 0.18);
      c.lineTo(x + w * (0.15 + i * 0.07), y + h * 0.28); c.arc(x + w * (0.115 + i * 0.07), y + h * 0.28, w * 0.035, 0, Math.PI); c.closePath(); c.fill();
    }
    rr(c, x + w * 0.08, y + h * 0.56, w * 0.56, h * 0.05, w * 0.01); paint(c, '#C3CBD4', OL, lw * 0.7);
    // a dish in the window
    const tr = PV.ChefData.TRUCK[key];
    if (tr) item(c, tr.menu[Math.min(2, tr.menu.length - 1)].parts, x + w * 0.36, y + h * 0.44, w * 0.08, 0);
    // sign on top
    rr(c, x + w * 0.12, y - h * 0.08, w * 0.5, h * 0.18, w * 0.03); paint(c, th.b, OL, lw);
    if (name) say(c, name, x + w * 0.37, y + h * 0.01, Math.min(w * 0.07, (w * 0.46) / Math.max(4, name.length) * 1.6), th.trim);
    // stripe, wheels
    c.fillStyle = th.b; c.fillRect(x + lw, y + h * 0.68, w * 0.74 - lw * 2, h * 0.05);
    for (const wx of [0.18, 0.84]) {
      circ(c, x + w * wx, y + h * 0.84, h * 0.13); paint(c, '#23252A', OL, lw);
      circ(c, x + w * wx, y + h * 0.84, h * 0.06); paint(c, '#C3CBD4');
    }
  }

  /* --------------------------------------------------------- little UI */

  function coin(c, x, y, r) {
    circ(c, x, y, r); paint(c, '#FFC933', '#B7791F', r * 0.18);
    circ(c, x, y, r * 0.62); c.strokeStyle = '#E3A21F'; c.lineWidth = r * 0.12; c.stroke();
    ell(c, x - r * 0.25, y - r * 0.3, r * 0.22, r * 0.12, -0.5); paint(c, 'rgba(255,255,255,.7)');
  }
  function coins(c, x, y, r, n) {
    const m = Math.min(5, 1 + Math.floor(n / 25));
    for (let i = 0; i < m; i++) coin(c, x + (i - (m - 1) / 2) * r * 0.9, y - (i % 2) * r * 0.35, r);
  }
  function gem(c, x, y, r) {
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.9, y - r * 0.2); c.lineTo(x, y + r); c.lineTo(x - r * 0.9, y - r * 0.2); c.closePath();
    paint(c, '#3DDC97', '#15855A', r * 0.16);
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.3, y - r * 0.2); c.lineTo(x, y + r); c.lineTo(x - r * 0.3, y - r * 0.2); c.closePath(); paint(c, 'rgba(255,255,255,.3)');
  }
  function star(c, x, y, r, on) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.46 : r;
      if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); else c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    c.closePath();
    paint(c, on ? '#FFC933' : 'rgba(255,255,255,.35)', on ? '#B7791F' : 'rgba(0,0,0,.35)', r * 0.14);
  }
  function clock(c, x, y, r, warn) {
    circ(c, x, y, r); paint(c, warn ? '#FF6B5B' : '#FFFFFF', OL, r * 0.16);
    line(c, x, y, x, y - r * 0.6, OL, r * 0.16); line(c, x, y, x + r * 0.45, y, OL, r * 0.16);
  }
  function head(c, x, y, r) {
    circ(c, x, y - r * 0.25, r * 0.45); paint(c, '#FFFFFF', OL, r * 0.14);
    c.beginPath(); c.arc(x, y + r * 0.8, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); c.closePath(); paint(c, '#FFFFFF', OL, r * 0.14);
  }
  function hand(c, x, y, s, t) {
    const b = Math.sin(t * 0.15) * s * 0.18;
    c.save(); c.translate(x + b * 0.4, y + b); c.rotate(-0.5);
    rr(c, -s * 0.16, 0, s * 0.32, s * 0.7, s * 0.16); paint(c, '#FFFFFF', OL, s * 0.06);
    rr(c, -s * 0.34, s * 0.4, s * 0.68, s * 0.62, s * 0.22); paint(c, '#FFFFFF', OL, s * 0.06);
    c.restore();
  }

  PV.ChefArt = {
    THEMES: THEMES, themeOf: themeOf, LOOKS: LOOKS, FONT: FONT,
    rr: rr, ell: ell, circ: circ, paint: paint, line: line, say: say, font: font, mix: mix, shade: shade,
    ware: ware, dish: dish, side: side, drink: drink, item: item, part: part, onHeat: onHeat,
    cookBody: cookBody, cookSlot: cookSlot, drinkMachine: drinkMachine, drinkSlot: drinkSlot, warmer: warmer,
    bin: bin, trash: trash, person: person, street: street, frame: frame, kitchen: kitchen, truck: truck,
    coin: coin, coins: coins, gem: gem, star: star, clock: clock, head: head, hand: hand, ring: ring, tick: tick, steam: steam, smoke: smoke,
    // For food.js and stands.js: the shapes and the pieces they are made of.
    OL: OL, TAU: TAU, STACK: STACK, DONENESS: DONENESS,
    hash: hash, scatter: scatter, blob: blob, leaf: leaf, olive: olive, onionRing: onionRing, burner: burner, bubbles: bubbles,
    /** Add pictures: { ware, dish, part, heat, done, side, drink, liquid, station, machine } by id. */
    food(spec) { for (const k in spec) { if (FOOD[k]) Object.assign(FOOD[k], spec[k]); } },
    has: (kind, id) => !!(FOOD[kind] && FOOD[kind][id]),
    doneOf: id => DONENESS[id] || FOOD.done[id] || null,
    liquidOf: id => FOOD.liquid[id] || null
  };

})(window.PV);
