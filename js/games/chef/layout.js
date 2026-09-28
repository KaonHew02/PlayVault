/* 街头大厨 / Street Chef — where everything sits.

   The game is drawn in a logical space and scaled to the canvas: 1000 x 620
   on a screen wider than it is tall, 600 x 1000 on a phone held upright.
   Top to bottom it is the street with the customers, the counter of the
   truck's window where they leave their coins, and the kitchen.

   The kitchen is a row of boxes — the plates, each drink machine, the hot
   plate, each cooker, each bin, the rubbish bin — packed into two rows
   (wide) or four (tall). The boxes keep their order and the rows are split
   where the widest row is narrowest (the painter's partition), so a
   kitchen with more upgrades is the same kitchen, fuller, not a different
   arrangement. A row that is still too wide is scaled down as a whole.

   Everything the view draws and everything a finger can land on comes out
   of build(); hit() answers what is under a point. Nothing here knows the
   rules. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const WIDE = { W: 1000, H: 620, street: 236, counter: 34, rows: 2 };
  const TALL = { W: 600, H: 1000, street: 318, counter: 40, rows: 4 };
  const GAP = 0.08;                                  // between boxes, in row heights

  /** How wide a box is, in row heights. */
  function unitsOf(b) {
    switch (b.kind) {
      case 'plates': return b.n * 0.8 + 0.1;
      case 'drink': return 0.5 + b.n * 0.37 + 0.1;
      case 'warm': return b.n * 0.5 + 0.16;
      case 'cook': return b.n * 0.64 + 0.16;
      case 'bin': return 0.56;
      case 'trash': return 0.5;
    }
    return 1;
  }

  /** Split `ws` (in order) into k contiguous rows, the widest as narrow as it can be. */
  function partition(ws, k) {
    const n = ws.length;
    k = Math.max(1, Math.min(k, n));
    const pre = [0];
    for (const w of ws) pre.push(pre[pre.length - 1] + w + GAP);
    const cost = (i, j) => pre[j] - pre[i] - GAP;
    // best[r][j]: the least possible widest row, putting the first j boxes in r rows.
    const best = [], cut = [];
    for (let r = 0; r <= k; r++) { best.push(new Array(n + 1).fill(Infinity)); cut.push(new Array(n + 1).fill(0)); }
    best[0][0] = 0;
    for (let r = 1; r <= k; r++) {
      for (let j = 1; j <= n; j++) {
        for (let i = r - 1; i < j; i++) {
          const v = Math.max(best[r - 1][i], cost(i, j));
          if (v < best[r][j]) { best[r][j] = v; cut[r][j] = i; }
        }
      }
    }
    const rows = [];
    let j = n;
    for (let r = k; r >= 1; r--) { const i = cut[r][j]; rows.unshift([i, j]); j = i; }
    return rows.filter(([i, jj]) => jj > i);
  }

  /**
   * The whole picture for a game in play (or null before one starts).
   * shape: 'wide' | 'tall'.
   */
  function build(game, shape) {
    const S = shape === 'tall' ? TALL : WIDE;
    const W = S.W, H = S.H;
    const L = { W: W, H: H, tall: shape === 'tall', shape: shape };
    L.street = { x: 0, y: 0, w: W, h: S.street };
    L.counter = { x: 0, y: S.street, w: W, h: S.counter };
    const ky = S.street + S.counter;
    L.kitchen = { x: 0, y: ky, w: W, h: H - ky };

    // The window: four places.
    const n = PV.ChefGame.SPOTS;
    const sw = W / n;
    const k = L.tall ? 0.78 : 0.86;
    L.spots = [];
    for (let i = 0; i < n; i++) {
      const cx = sw * (i + 0.5);
      L.spots.push({
        i: i, cx: cx, x: sw * i, w: sw, scale: k,
        top: S.street - 150 * k,                    // the crown of the head, standing
        base: S.street,                             // where the counter cuts them off
        hit: { x: sw * i + 6, y: 40, w: sw - 12, h: S.street - 40 },
        coins: { x: cx - 44 * k, y: S.street - 6, w: 88 * k, h: S.counter + 10 },
        bubbleY: L.tall ? 58 : 50
      });
    }
    if (!game || !game.spec) { L.boxes = []; return L; }

    // The kitchen's boxes, in order: what you serve from nearest the window.
    const boxes = [];
    boxes.push({ kind: 'plates', n: game.plates.length });
    game.stations.forEach((st, s) => { if (st.type === 'drink') boxes.push({ kind: 'drink', s: s, n: st.slots.length, st: st }); });
    if (game.warm.length) boxes.push({ kind: 'warm', n: game.warm.length });
    game.stations.forEach((st, s) => { if (st.type === 'cook') boxes.push({ kind: 'cook', s: s, n: st.slots.length, st: st }); });
    game.bins.forEach((part, b) => boxes.push({ kind: 'bin', b: b, part: part }));
    boxes.push({ kind: 'trash' });

    const pad = L.tall ? 12 : 14;
    const rowsN = S.rows;
    const rowH = (L.kitchen.h - pad * 2) / rowsN;
    const ws = boxes.map(unitsOf);
    const parts = partition(ws, rowsN);
    const used = parts.length;
    // Rows that are not needed leave room: centre the used ones.
    const top = L.kitchen.y + pad + (rowsN - used) * rowH / 2;
    parts.forEach(([i, j], r) => {
      const units = ws.slice(i, j).reduce((a, b) => a + b, 0) + GAP * (j - i - 1);
      const u = Math.min(rowH * 0.94, (W - pad * 2) / units);
      const rowW = units * u;
      let x = (W - rowW) / 2;
      const y = top + r * rowH + (rowH - u) / 2;
      for (let q = i; q < j; q++) {
        const b = boxes[q];
        b.x = x; b.y = y; b.w = ws[q] * u; b.h = u; b.u = u; b.row = r;
        x += b.w + GAP * u;
      }
    });

    // Inside each box.
    L.plates = []; L.bins = []; L.stations = []; L.warm = []; L.trash = null; L.machines = [];
    for (const b of boxes) {
      const u = b.u;
      if (b.kind === 'plates') {
        for (let i = 0; i < b.n; i++) {
          const x = b.x + 0.05 * u + i * 0.8 * u;
          L.plates.push({ i: i, x: x, y: b.y, w: 0.8 * u, h: u, cx: x + 0.4 * u, cy: b.y + 0.56 * u, r: 0.36 * u });
        }
      } else if (b.kind === 'drink') {
        const m = { s: b.s, x: b.x + 0.04 * u, y: b.y, w: 0.5 * u, h: u };
        L.machines.push(m);
        const slots = [];
        for (let i = 0; i < b.n; i++) {
          const x = b.x + 0.56 * u + i * 0.37 * u;
          slots.push({ s: b.s, i: i, x: x, y: b.y + 0.3 * u, w: 0.37 * u, h: 0.7 * u, cx: x + 0.185 * u, cy: b.y + 0.7 * u, r: 0.16 * u });
        }
        L.stations[b.s] = { s: b.s, box: b, machine: m, slots: slots, art: b.st.def.art };
      } else if (b.kind === 'cook') {
        const slots = [];
        for (let i = 0; i < b.n; i++) {
          const x = b.x + 0.08 * u + i * 0.64 * u;
          slots.push({ s: b.s, i: i, x: x, y: b.y, w: 0.64 * u, h: u, cx: x + 0.32 * u, cy: b.y + 0.52 * u, r: 0.27 * u });
        }
        L.stations[b.s] = { s: b.s, box: b, slots: slots, art: b.st.def.art };
      } else if (b.kind === 'warm') {
        for (let i = 0; i < b.n; i++) {
          const x = b.x + 0.08 * u + i * 0.5 * u;
          L.warm.push({ i: i, x: x, y: b.y, w: 0.5 * u, h: u, cx: x + 0.25 * u, cy: b.y + 0.56 * u, r: 0.2 * u });
        }
        L.warmBox = b;
      } else if (b.kind === 'bin') {
        L.bins.push({ b: b.b, part: b.part, x: b.x, y: b.y, w: b.w, h: u, cx: b.x + b.w / 2, cy: b.y + u * 0.55 });
      } else if (b.kind === 'trash') {
        L.trash = { x: b.x, y: b.y, w: b.w, h: u, cx: b.x + b.w / 2, cy: b.y + u * 0.55 };
      }
    }
    L.boxes = boxes;
    return L;
  }

  const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  /**
   * What is under (x, y), in logical units: one of
   * {k:'coins', i} {k:'spot', i} {k:'slot', s, i} {k:'machine', s}
   * {k:'plate', i} {k:'warm', i} {k:'bin', b} {k:'trash'} — or null.
   */
  function hit(L, game, x, y) {
    if (!L) return null;
    for (const sp of L.spots) {
      if (game && game.spots && game.spots[sp.i] && game.spots[sp.i].coins && inside(sp.coins, x, y)) return { k: 'coins', i: sp.i };
    }
    if (y < L.counter.y + L.counter.h) {
      for (const sp of L.spots) if (inside(sp.hit, x, y)) return { k: 'spot', i: sp.i };
      return null;
    }
    for (const st of (L.stations || [])) {
      if (!st) continue;
      for (const sl of st.slots) if (inside(sl, x, y)) return { k: 'slot', s: sl.s, i: sl.i };
      if (st.machine && inside(st.machine, x, y)) return { k: 'machine', s: st.s };
      if (inside(st.box, x, y)) return { k: 'machine', s: st.s };
    }
    for (const p of (L.plates || [])) if (inside(p, x, y)) return { k: 'plate', i: p.i };
    for (const w of (L.warm || [])) if (inside(w, x, y)) return { k: 'warm', i: w.i };
    for (const b of (L.bins || [])) if (inside(b, x, y)) return { k: 'bin', b: b.b };
    if (inside(L.trash, x, y)) return { k: 'trash' };
    return null;
  }

  PV.ChefLayout = { WIDE: WIDE, TALL: TALL, build: build, hit: hit, partition: partition };

})(window.PV);
