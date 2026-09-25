/* 突击小队 / Strike Squad — the world a match is played in.

   A map arrives as rows of characters (maps.js) and leaves here as three
   things the rest of the game can use:

   - BOXES. Every solid cell is merged with its neighbours of the same kind
     into the fewest axis-aligned boxes that cover them. Soldiers collide
     with boxes, bullets stop at them, and the scene draws them. A window is
     two boxes, a sill and a lintel, with the gap between them to shoot
     through; a roof is a box over a building's inside.
   - A HEIGHT MAP for walking: one number per metre cell, the height a
     soldier stands at there, and whether it can be stood on at all. Bots
     find their way over it with a plain A*, jumping up anything a jump can
     clear (1.15 m) and dropping off anything.
   - MARKERS: spawns, the three points, two flags and two bomb sites.

   Collision is swept one axis at a time against the boxes near the
   soldier, with a step-up for anything no higher than a stair: a half-metre
   step is walked up, not jumped. Walking down a stair snaps to it rather
   than falling off it, or every flight would be a string of small falls.

   Nothing here is random and nothing reads the clock: two worlds built
   from one key are the same world. They are cached per key, because a map
   is rebuilt for every match and never changes. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const EPS = 1e-4;
  const STEP = 0.55;               // walked up without a jump
  const CLIMB = 1.15;              // the most a jump gets you onto
  const HS = 4;                    // spatial hash cell, metres
  const ROOF_Y = 3.6;

  /* What each character is. `stand` means its top can be walked on;
     anything else that is solid is a wall to the path finder. */
  const CELL = {
    '#': { h: 4, mat: 'wall' },
    '%': { h: 4, mat: 'wall2' },
    'H': { h: 6, mat: 'wall' },
    'P': { h: 4.6, mat: 'pillar' },
    'w': { h: 4, mat: 'wall', win: true },
    'v': { h: 4, mat: 'wall2', win: true },
    '-': { h: 1, mat: 'wall', stand: true, low: true },
    '=': { h: 1.1, mat: 'sandbag', stand: true, low: true },
    'x': { h: 1, mat: 'crate', stand: true, low: true },
    'X': { h: 2, mat: 'crate', stand: true },
    'o': { h: 1.2, mat: 'barrel', inset: 0.12 },
    't': { h: 1.3, mat: 'hedge' },
    'c': { h: 2.6, mat: 'cont_r', stand: true },
    'k': { h: 2.6, mat: 'cont_b', stand: true },
    'u': { h: 2.6, mat: 'cont_g', stand: true },
    'T': { h: 3.2, mat: 'trunk', inset: 0.3, tree: true }
  };
  for (let n = 1; n <= 8; n++) CELL[String(n)] = { h: n * 0.5, mat: 'plat', stand: true, stair: true };
  const GROUND = { '.': 0, ',': 1, ';': 2 };
  const MARK = 'abs' + 'ABC' + 'FG' + 'QR';
  const SILL = 1.0, LINTEL = 2.1;

  /* --------------------------------------------------------- building */

  function build(key) {
    const map = PV.FpsMaps.get(key);
    const W = map.W, D = map.D, N = W * D;
    const ch = new Array(N);
    const ground = new Uint8Array(N);
    const navH = new Float32Array(N);
    const navOK = new Uint8Array(N);
    const marks = {};

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        let c = map.rows[z][x];
        if (MARK.indexOf(c) >= 0) { (marks[c] = marks[c] || []).push(i); c = '.'; }
        ch[i] = c;
        if (c in GROUND) { ground[i] = GROUND[c]; navOK[i] = 1; continue; }
        const def = CELL[c];
        if (!def) throw new Error('fps map ' + key + ': unknown cell "' + c + '" at ' + x + ',' + z);
        if (def.stand) { navOK[i] = 1; navH[i] = def.h; }
      }
    }

    /* Greedy merge: the widest run along x, then as deep along z as the
       same run repeats. Trees and barrels stay one box a cell — they are
       round things drawn one at a time. */
    const boxes = [];
    const used = new Uint8Array(N);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x, c = ch[i];
        if (used[i] || c in GROUND) continue;
        const def = CELL[c];
        let w = 1, d = 1;
        if (!def.inset) {
          while (x + w < W && ch[i + w] === c && !used[i + w]) w++;
          grow: while (z + d < D) {
            for (let k = 0; k < w; k++) {
              const j = (z + d) * W + x + k;
              if (ch[j] !== c || used[j]) break grow;
            }
            d++;
          }
        }
        for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) used[(z + dz) * W + x + dx] = 1;
        const s = def.inset || 0;
        const base = { x0: x + s, z0: z + s, x1: x + w - s, z1: z + d - s, mat: def.mat, ch: c };
        if (def.win) {
          boxes.push(Object.assign({}, base, { y0: 0, y1: SILL, part: 'sill' }));
          boxes.push(Object.assign({}, base, { y0: LINTEL, y1: def.h, part: 'lintel' }));
        } else {
          boxes.push(Object.assign(base, { y0: 0, y1: def.h }));
        }
      }
    }
    for (const r of map.roofs) {
      boxes.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], y0: ROOF_Y, y1: ROOF_Y + 0.4, mat: 'roof', ch: '^', roof: true });
    }
    boxes.forEach((b, k) => { b.id = k; });

    /* The hash: which boxes touch each HS-metre cell. */
    const GW = Math.ceil(W / HS), GD = Math.ceil(D / HS);
    const hash = [];
    for (let k = 0; k < GW * GD; k++) hash.push([]);
    for (const b of boxes) {
      const gx0 = Math.max(0, Math.floor(b.x0 / HS)), gx1 = Math.min(GW - 1, Math.floor((b.x1 - EPS) / HS));
      const gz0 = Math.max(0, Math.floor(b.z0 / HS)), gz1 = Math.min(GD - 1, Math.floor((b.z1 - EPS) / HS));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) hash[gz * GW + gx].push(b);
    }

    /* Markers, as points to stand on. */
    const pt = i => ({ x: (i % W) + 0.5, z: Math.floor(i / W) + 0.5, y: navH[i], cell: i });
    const one = (c, fx, fz) => (marks[c] && marks[c].length ? pt(marks[c][0]) : { x: fx, z: fz, y: 0, cell: Math.floor(fz) * W + Math.floor(fx) });
    const spawns = {
      a: (marks.a || []).map(pt), b: (marks.b || []).map(pt), s: (marks.s || []).map(pt)
    };
    const cx = W / 2, cz = D / 2;
    for (const k in spawns) for (const s of spawns[k]) s.yaw = Math.atan2(cx - s.x, -(cz - s.z));
    const flags = [one('F', cx, 4), one('G', cx, D - 4)];
    const dom = [one('A', cx, D * 0.25), one('B', cx, cz), one('C', cx, D * 0.75)];
    const sites = [one('Q', W * 0.25, D * 0.8), one('R', W * 0.75, D * 0.7)];

    return {
      key: map.key, W: W, D: D, theme: map.theme, rows: map.rows, roofs: map.roofs,
      ch: ch, ground: ground, navH: navH, navOK: navOK,
      boxes: boxes, hash: hash, GW: GW, GD: GD,
      spawns: spawns, flags: flags, dom: dom, sites: sites
    };
  }

  const cache = Object.create(null);

  /* ------------------------------------------------------------ world */

  class World {
    constructor(key) {
      const k = PV.FpsMaps.KEYS.indexOf(key) >= 0 ? key : PV.FpsMaps.KEYS[0];
      if (!cache[k]) cache[k] = build(k);
      Object.assign(this, cache[k]);
      this._stamp = new Uint32Array(this.boxes.length);
      this._gen = 1;
      this._near = [];
      // A* scratch, sized once.
      const N = this.W * this.D;
      this._g = new Float32Array(N);
      this._par = new Int32Array(N);
      this._seen = new Uint32Array(N);
      this._shut = new Uint32Array(N);
      this._heap = new Int32Array(N * 8 + 8);
      this._f = new Float32Array(N);
      this._search = 1;
      this.hit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
    }

    /* ---- queries on boxes ---- */

    /** Boxes whose hash cells touch the square (x±r, z±r). Deduplicated;
        the array is reused, so copy it to keep it. */
    near(x, z, r) {
      const out = this._near;
      out.length = 0;
      const gen = ++this._gen;
      const gx0 = Math.max(0, Math.floor((x - r) / HS)), gx1 = Math.min(this.GW - 1, Math.floor((x + r) / HS));
      const gz0 = Math.max(0, Math.floor((z - r) / HS)), gz1 = Math.min(this.GD - 1, Math.floor((z + r) / HS));
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const list = this.hash[gz * this.GW + gx];
          for (let k = 0; k < list.length; k++) {
            const b = list[k];
            if (this._stamp[b.id] === gen) continue;
            this._stamp[b.id] = gen;
            out.push(b);
          }
        }
      }
      return out;
    }

    /** Whether a soldier-shaped box at (x, y, z) would be inside anything. */
    blocked(x, y, z, r, h) {
      if (x - r < 0 || z - r < 0 || x + r > this.W || z + r > this.D) return true;
      const list = this.near(x, z, r + 0.1);
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (x + r > b.x0 + EPS && x - r < b.x1 - EPS && z + r > b.z0 + EPS && z - r < b.z1 - EPS
          && y + h > b.y0 + EPS && y < b.y1 - EPS) return true;
      }
      return false;
    }

    /** The highest surface under (x, z) at or below `y` — ground, a crate,
        a platform. For landing, shadows and things dropped on the floor. */
    floorAt(x, z, y, r) {
      const rr = r || 0;
      let best = 0;
      const list = this.near(x, z, rr + 0.1);
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (x + rr > b.x0 && x - rr < b.x1 && z + rr > b.z0 && z - rr < b.z1 && b.y1 <= y + 0.05 && b.y1 > best) best = b.y1;
      }
      return best;
    }

    /* ---- moving a soldier ---- */

    /**
     * Move a body by (dx, dy, dz) against the world. `a` carries x, y, z,
     * r (radius), h (height), ground (was standing last tick). Sets
     * a.ground, and a.bonk when the head hit something. Returns nothing;
     * the position is written back into `a`.
     */
    move(a, dx, dy, dz) {
      a.bonk = false;
      if (dx) this._slide(a, 'x', dx);
      if (dz) this._slide(a, 'z', dz);
      this._fall(a, dy);
    }

    _slide(a, axis, d) {
      const r = a.r, h = a.h;
      let x = a.x, z = a.z;
      if (axis === 'x') x += d; else z += d;
      // The outer edge, before anything else.
      const lo = r + EPS, hiX = this.W - r - EPS, hiZ = this.D - r - EPS;
      if (x < lo) x = lo; if (x > hiX) x = hiX;
      if (z < lo) z = lo; if (z > hiZ) z = hiZ;
      let up = a.y;
      const list = this.near(x, z, r + 0.1).slice();
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (!(x + r > b.x0 + EPS && x - r < b.x1 - EPS && z + r > b.z0 + EPS && z - r < b.z1 - EPS
          && a.y + h > b.y0 + EPS && a.y < b.y1 - EPS)) continue;
        // A step: walk up onto it if there is room to stand there.
        if (a.ground && b.y1 - a.y <= STEP && b.y0 <= a.y + STEP) {
          if (!this.blocked(x, b.y1 + EPS, z, r, h)) { if (b.y1 > up) up = b.y1; continue; }
        }
        if (axis === 'x') x = d > 0 ? Math.min(x, b.x0 - r - EPS) : Math.max(x, b.x1 + r + EPS);
        else z = d > 0 ? Math.min(z, b.z0 - r - EPS) : Math.max(z, b.z1 + r + EPS);
      }
      if (up > a.y && this.blocked(x, up + EPS, z, r, h)) up = a.y;
      a.x = x; a.z = z;
      // `stepped` is how far it was lifted, so the camera can ease up the
      // stair instead of jumping half a metre in one frame.
      if (up > a.y) { const rise = up - a.y; a.y = up; a.stepped = (a.stepped || 0) + rise; }
    }

    _fall(a, d) {
      const r = a.r, h = a.h;
      const list = this.near(a.x, a.z, r + 0.1);
      const inside = b => a.x + r > b.x0 + EPS && a.x - r < b.x1 - EPS && a.z + r > b.z0 + EPS && a.z - r < b.z1 - EPS;
      if (d > 0) {
        let y = a.y + d;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (inside(b) && b.y0 >= a.y + h - EPS && b.y0 < y + h) { y = b.y0 - h - EPS; a.bonk = true; }
        }
        a.y = Math.max(a.y, y);
        a.ground = false;
        return;
      }
      // Going down — or standing still, which is also a check for a floor.
      // A soldier that was standing snaps down a stair's worth.
      const reach = a.ground ? Math.max(-d, STEP) : -d;
      let floor = -Infinity;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (inside(b) && b.y1 <= a.y + EPS && b.y1 >= a.y - reach - EPS && b.y1 > floor) floor = b.y1;
      }
      if (a.y - reach <= EPS && floor < 0) floor = 0;
      if (floor > -Infinity && (a.ground || a.y + d <= floor + EPS)) {
        a.y = Math.max(floor, 0);
        a.ground = true;
      } else {
        a.y = Math.max(0, a.y + d);
        a.ground = a.y <= EPS;
      }
    }

    /* ---- rays ---- */

    /**
     * The first thing along a ray from (ox, oy, oz) in the unit direction
     * (dx, dy, dz), up to maxT. Returns the distance, or maxT when nothing
     * was hit; the face it hit is left in this.hit.
     */
    ray(ox, oy, oz, dx, dy, dz, maxT) {
      const hit = this.hit;
      hit.box = null; hit.nx = 0; hit.ny = 0; hit.nz = 0;
      let best = maxT;
      // The ground plane.
      if (dy < -1e-9) {
        const tg = -oy / dy;
        if (tg >= 0 && tg < best) { best = tg; hit.nx = 0; hit.ny = 1; hit.nz = 0; }
      }
      // Walk the hash cells the ray crosses, in order, stopping once the
      // next cell starts beyond the best hit so far.
      const gen = ++this._gen;
      let gx = Math.floor(ox / HS), gz = Math.floor(oz / HS);
      const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      const tdx = Math.abs(dx) > 1e-12 ? HS / Math.abs(dx) : Infinity;
      const tdz = Math.abs(dz) > 1e-12 ? HS / Math.abs(dz) : Infinity;
      let tmx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (gx + 1) * HS - ox : ox - gx * HS) / Math.abs(dx)) : Infinity;
      let tmz = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (gz + 1) * HS - oz : oz - gz * HS) / Math.abs(dz)) : Infinity;
      let t0 = 0;
      for (let guard = 0; guard < 256; guard++) {
        if (gx >= 0 && gz >= 0 && gx < this.GW && gz < this.GD) {
          const list = this.hash[gz * this.GW + gx];
          for (let k = 0; k < list.length; k++) {
            const b = list[k];
            if (this._stamp[b.id] === gen) continue;
            this._stamp[b.id] = gen;
            this._slab(b, ox, oy, oz, dx, dy, dz, best);
            if (this._t < best) {
              best = this._t;
              hit.nx = this._nx; hit.ny = this._ny; hit.nz = this._nz; hit.box = b;
            }
          }
        } else if ((gx < 0 && stepX < 0) || (gz < 0 && stepZ < 0) || (gx >= this.GW && stepX > 0) || (gz >= this.GD && stepZ > 0)) {
          break;
        }
        t0 = Math.min(tmx, tmz);
        if (t0 > best) break;
        if (tmx < tmz) { gx += stepX; tmx += tdx; } else { gz += stepZ; tmz += tdz; }
      }
      hit.t = best;
      return best;
    }

    /** Ray against one box; leaves the entry distance in this._t. */
    _slab(b, ox, oy, oz, dx, dy, dz, maxT) {
      let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
      this._t = Infinity;
      // x
      if (Math.abs(dx) < 1e-12) { if (ox < b.x0 || ox > b.x1) return; } else {
        let t1 = (b.x0 - ox) / dx, t2 = (b.x1 - ox) / dx, s = -1;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
        if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dy) < 1e-12) { if (oy < b.y0 || oy > b.y1) return; } else {
        let t1 = (b.y0 - oy) / dy, t2 = (b.y1 - oy) / dy, s = -1;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dz) < 1e-12) { if (oz < b.z0 || oz > b.z1) return; } else {
        let t1 = (b.z0 - oz) / dz, t2 = (b.z1 - oz) / dz, s = -1;
        if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (tmin <= 0 && nx === 0 && ny === 0 && nz === 0) { tmin = 0; ny = 1; }  // started inside
      this._t = tmin; this._nx = nx; this._ny = ny; this._nz = nz;
    }

    /** Nothing solid between two points. */
    clear(ax, ay, az, bx, by, bz) {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) return true;
      return this.ray(ax, ay, az, dx / L, dy / L, dz / L, L) >= L - 1e-3;
    }

    /* ---- walking ---- */

    cellOf(x, z) {
      const cx = Math.max(0, Math.min(this.W - 1, Math.floor(x)));
      const cz = Math.max(0, Math.min(this.D - 1, Math.floor(z)));
      return cz * this.W + cx;
    }

    /** The walkable cell nearest (x, z), standing at about height y. */
    navCell(x, z, y) {
      const W = this.W, D = this.D;
      const c = this.cellOf(x, z);
      const yy = y == null ? this.navH[c] : y;
      if (this.navOK[c] && Math.abs(this.navH[c] - yy) < 1.2) return c;
      let best = -1, bd = Infinity;
      const cx = c % W, cz = Math.floor(c / W);
      for (let r = 1; r <= 4 && best < 0; r++) {
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            const x2 = cx + i, z2 = cz + j;
            if (x2 < 0 || z2 < 0 || x2 >= W || z2 >= D) continue;
            const k = z2 * W + x2;
            if (!this.navOK[k]) continue;
            const d = (x2 + 0.5 - x) * (x2 + 0.5 - x) + (z2 + 0.5 - z) * (z2 + 0.5 - z) + Math.abs(this.navH[k] - yy) * 4;
            if (d < bd) { bd = d; best = k; }
          }
        }
      }
      return best < 0 ? c : best;
    }

    /** Can a soldier get from cell a to its neighbour b, and at what cost?
        0 means no. A jump costs extra; a drop a little. */
    _edge(a, b) {
      if (!this.navOK[b]) return 0;
      const dh = this.navH[b] - this.navH[a];
      if (dh > CLIMB) return 0;
      if (dh > STEP) return 2.5;
      if (dh < -STEP) return 0.6;
      return 0.001;
    }

    /**
     * A* from (sx, sz) to (tx, tz). Returns waypoints [{x, z, y, jump}],
     * smoothed so that a bot heads straight across open ground, or null
     * when there is no way.
     */
    path(sx, sz, sy, tx, tz, ty) {
      const W = this.W, D = this.D;
      const s = this.navCell(sx, sz, sy), t = this.navCell(tx, tz, ty);
      if (s === t) return [{ x: tx, z: tz, y: this.navH[t], jump: false }];
      const run = ++this._search;
      const g = this._g, par = this._par, seen = this._seen, shut = this._shut, f = this._f, heap = this._heap;
      let n = 0;
      const tX = t % W, tZ = Math.floor(t / W);
      const hEst = k => {
        const dx = Math.abs((k % W) - tX), dz = Math.abs(Math.floor(k / W) - tZ);
        return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
      };
      const push = k => {
        let i = n++;
        heap[i] = k;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (f[heap[p]] <= f[heap[i]]) break;
          const q = heap[p]; heap[p] = heap[i]; heap[i] = q; i = p;
        }
      };
      const pop = () => {
        const top = heap[0];
        heap[0] = heap[--n];
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < n && f[heap[l]] < f[heap[m]]) m = l;
          if (r < n && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break;
          const q = heap[m]; heap[m] = heap[i]; heap[i] = q; i = m;
        }
        return top;
      };
      g[s] = 0; f[s] = hEst(s); par[s] = -1; seen[s] = run;
      push(s);
      let found = false, iter = 0;
      while (n > 0 && iter++ < W * D * 4) {
        const c = pop();
        if (shut[c] === run) continue;
        shut[c] = run;
        if (c === t) { found = true; break; }
        const cx = c % W, cz = (c - cx) / W;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const x2 = cx + dx, z2 = cz + dz;
            if (x2 < 0 || z2 < 0 || x2 >= W || z2 >= D) continue;
            const k = z2 * W + x2;
            if (shut[k] === run) continue;
            const e = this._edge(c, k);
            if (!e) continue;
            if (dx && dz) {
              // No cutting a corner, and no diagonal up or down a step.
              const k1 = cz * W + x2, k2 = z2 * W + cx;
              if (!this._edge(c, k1) || !this._edge(c, k2) || e > 0.01) continue;
              if (Math.abs(this.navH[k1] - this.navH[c]) > 0.01 || Math.abs(this.navH[k2] - this.navH[c]) > 0.01) continue;
            }
            const cost = g[c] + (dx && dz ? Math.SQRT2 : 1) + e;
            if (seen[k] === run && cost >= g[k]) continue;
            seen[k] = run; g[k] = cost; par[k] = c; f[k] = cost + hEst(k);
            push(k);
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let c = t; c >= 0; c = par[c]) { cells.push(c); if (c === s) break; }
      cells.reverse();
      // String-pull: keep a waypoint only where the straight line from
      // the last kept one stops being flat, open walking.
      const out = [];
      let from = 0;
      for (let i = 1; i < cells.length; i++) {
        const jump = this.navH[cells[i]] - this.navH[cells[i - 1]] > STEP;
        if (jump || i === cells.length - 1 || !this.flat(cells[from], cells[i + 1])) {
          if (jump && i - 1 > from) out.push(this._wp(cells[i - 1], false));
          out.push(this._wp(cells[i], jump));
          from = i;
        }
      }
      const last = out[out.length - 1];
      if (last && this.navOK[this.cellOf(tx, tz)]) { last.x = tx; last.z = tz; }
      return out;
    }

    _wp(c, jump) { return { x: (c % this.W) + 0.5, z: Math.floor(c / this.W) + 0.5, y: this.navH[c], jump: jump }; }

    /** Walkable in a straight line between two cells with no step bigger
        than a stair along it, checked on a fine walk of the line. */
    flat(a, b) {
      const W = this.W;
      const ax = (a % W) + 0.5, az = Math.floor(a / W) + 0.5;
      const bx = (b % W) + 0.5, bz = Math.floor(b / W) + 0.5;
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 0.25));
      let prev = a;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
        // The soldier is 0.35 wide either side of the line: look both sides.
        for (const o of [-0.36, 0.36]) {
          const px = x + (bz - az) / (L || 1) * o, pz = z - (bx - ax) / (L || 1) * o;
          const k = this.cellOf(px, pz);
          if (!this.navOK[k] || Math.abs(this.navH[k] - this.navH[prev]) > STEP) return false;
        }
        const k = this.cellOf(x, z);
        if (!this.navOK[k] || Math.abs(this.navH[k] - this.navH[prev]) > STEP) return false;
        prev = k;
      }
      return true;
    }

    /** A random walkable cell, for a bot with nothing better to do. */
    randomCell(rng, near, within) {
      for (let tries = 0; tries < 60; tries++) {
        let x, z;
        if (near) {
          const a = rng.next() * Math.PI * 2, d = rng.next() * (within || 12);
          x = near.x + Math.sin(a) * d; z = near.z + Math.cos(a) * d;
        } else {
          x = 1 + rng.next() * (this.W - 2); z = 1 + rng.next() * (this.D - 2);
        }
        const c = this.cellOf(x, z);
        if (this.navOK[c] && this.navH[c] < 2.2) return { x: (c % this.W) + 0.5, z: Math.floor(c / this.W) + 0.5, y: this.navH[c] };
      }
      const s = this.spawns.a[0] || { x: this.W / 2, z: this.D / 2, y: 0 };
      return { x: s.x, z: s.z, y: s.y };
    }
  }

  World.STEP = STEP;
  World.CLIMB = CLIMB;
  World.CELL = CELL;
  World.ROOF_Y = ROOF_Y;
  World.SILL = SILL;
  World.LINTEL = LINTEL;
  PV.FpsWorld = World;

})(window.PV);
