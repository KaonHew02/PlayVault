/* 变色躲猫猫 / Blend In — the world a round is played in.

   A map (maps.js) arrives as boxes and leaves here as what the rest of the
   game asks of it:

   - SOLIDS. Bodies collide with the boxes, swept one axis at a time, and
     walk up anything no higher than a stair. Droplets and eyes stop at them.
   - COLOUR. A ray that hits a box knows the face it hit and so the colour
     there (data.js): the one question that matters in this game, asked by
     the colour picker, a bot painting itself and a bot looking for you.
   - A WALKING GRID of half-metre cells, each the height a body stands at
     there, for the bots' A*: a stair is walked, a jump clears 1.25 m, and
     anything can be dropped off.
   - WALLS TO CLIMB. A hider pressing into a wall can go up it.

   Nothing here is random and nothing reads the clock. A world is built
   once per map and kept. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData;
  const EPS = 1e-4;
  const STEP = 0.5;                 // walked up without a jump
  const CLIMB = 1.25;               // the most a jump gets you onto
  const HS = 2;                     // hash cell, metres
  const NC = 0.5;                   // walking grid, metres
  const BODY_R = 0.3, BODY_H = 1.75;

  const FACE = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
  function faceKey(nx, ny, nz) {
    if (ny > 0.5) return 'py'; if (ny < -0.5) return 'ny';
    if (nx > 0.5) return 'px'; if (nx < -0.5) return 'nx';
    return nz > 0 ? 'pz' : 'nz';
  }

  /** The material on one face of a box. */
  function matOf(b, f) { return (b.faces && b.faces[f]) || b.mat; }

  /** Texture coordinates of a point on a face. Pictures run 0..1 across
      the face, as you look at it; tiled surfaces run in world metres over
      the material's repeat. The scene uses this very function for its
      vertices, so what is drawn and what is sampled line up. */
  function uvOf(b, f, x, y, z, out) {
    const m = D.MATS[matOf(b, f)] || D.MATS.white;
    const o = out || [0, 0];
    if (m.pic) {
      const w = b.x1 - b.x0 || 1, h = b.y1 - b.y0 || 1, d = b.z1 - b.z0 || 1;
      switch (f) {
        case 'pz': o[0] = (x - b.x0) / w; o[1] = (y - b.y0) / h; break;
        case 'nz': o[0] = (b.x1 - x) / w; o[1] = (y - b.y0) / h; break;
        case 'px': o[0] = (b.z1 - z) / d; o[1] = (y - b.y0) / h; break;
        case 'nx': o[0] = (z - b.z0) / d; o[1] = (y - b.y0) / h; break;
        case 'py': o[0] = (x - b.x0) / w; o[1] = (b.z1 - z) / d; break;
        default: o[0] = (x - b.x0) / w; o[1] = (z - b.z0) / d;
      }
      return o;
    }
    const s = m.size;
    if (f === 'pz' || f === 'nz') { o[0] = x / s; o[1] = y / s; }
    else if (f === 'px' || f === 'nx') { o[0] = z / s; o[1] = y / s; }
    else { o[0] = x / s; o[1] = z / s; }
    return o;
  }

  /* --------------------------------------------------------- building */

  function build(key) {
    const map = PV.HideMaps.get(key);
    const boxes = map.boxes.map((b, k) => Object.assign({}, b, { id: k }));
    const W = map.W, Dp = map.D;
    const GW = Math.ceil(W / HS), GD = Math.ceil(Dp / HS);
    const hash = [];
    for (let k = 0; k < GW * GD; k++) hash.push([]);
    for (const b of boxes) {
      const gx0 = Math.max(0, Math.floor(b.x0 / HS)), gx1 = Math.min(GW - 1, Math.floor((b.x1 - EPS) / HS));
      const gz0 = Math.max(0, Math.floor(b.z0 / HS)), gz1 = Math.min(GD - 1, Math.floor((b.z1 - EPS) / HS));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) hash[gz * GW + gx].push(b);
    }
    return {
      key: key, W: W, D: Dp, mapW: map.mapW, mapD: map.mapD, sky: map.sky, skyTop: map.skyTop, skyLow: map.skyLow,
      boxes: boxes, hash: hash, GW: GW, GD: GD,
      hide: map.hide, seek: map.seek, lobbyRing: map.lobby, lobbyAt: map.lobbyAt
    };
  }

  const cache = Object.create(null);

  /* ------------------------------------------------------------ world */

  class World {
    constructor(key) {
      const k = PV.HideMaps.KEYS.indexOf(key) >= 0 ? key : PV.HideMaps.KEYS[0];
      if (!cache[k]) { cache[k] = build(k); }
      Object.assign(this, cache[k]);
      this._stamp = new Uint32Array(this.boxes.length);
      this._gen = 1;
      this._near = [];
      this.hit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
      if (!cache[k].nav) cache[k].nav = this._nav();
      const nav = cache[k].nav;
      this.NW = nav.NW; this.ND = nav.ND; this.navH = nav.navH; this.navOK = nav.navOK;
      const N = this.NW * this.ND;
      this._g = new Float32Array(N); this._par = new Int32Array(N); this._seen = new Uint32Array(N);
      this._shut = new Uint32Array(N); this._heap = new Int32Array(N * 8 + 8); this._f = new Float32Array(N);
      this._search = 1;
    }

    /* ---- boxes ---- */

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

    /** Whether a body-shaped box at (x, y, z) would be inside anything. */
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

    /** The highest top under (x, z) at or below y. */
    floorAt(x, z, y, r) {
      const rr = r || 0;
      let best = -50;
      const list = this.near(x, z, rr + 0.1);
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (x + rr > b.x0 && x - rr < b.x1 && z + rr > b.z0 && z - rr < b.z1 && b.y1 <= y + 0.05 && b.y1 > best) best = b.y1;
      }
      return best;
    }

    /* ---- moving a body ---- */

    /** Move `a` (x, y, z, r, h, ground) by (dx, dy, dz) against the world. */
    move(a, dx, dy, dz) {
      a.bonk = false;
      a.wallX = 0; a.wallZ = 0;
      if (dx) this._slide(a, 'x', dx);
      if (dz) this._slide(a, 'z', dz);
      this._fall(a, dy);
    }

    _slide(a, axis, d) {
      const r = a.r, h = a.h;
      let x = a.x, z = a.z;
      if (axis === 'x') x += d; else z += d;
      const lo = r + EPS;
      if (x < lo) x = lo; if (x > this.W - lo) x = this.W - lo;
      if (z < lo) z = lo; if (z > this.D - lo) z = this.D - lo;
      let up = a.y;
      const list = this.near(x, z, r + 0.1).slice();
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (!(x + r > b.x0 + EPS && x - r < b.x1 - EPS && z + r > b.z0 + EPS && z - r < b.z1 - EPS
          && a.y + h > b.y0 + EPS && a.y < b.y1 - EPS)) continue;
        if (a.ground && b.y1 - a.y <= STEP && b.y0 <= a.y + STEP) {
          if (!this.blocked(x, b.y1 + EPS, z, r, h)) { if (b.y1 > up) up = b.y1; continue; }
        }
        if (axis === 'x') { x = d > 0 ? Math.min(x, b.x0 - r - EPS) : Math.max(x, b.x1 + r + EPS); a.wallX = d > 0 ? -1 : 1; }
        else { z = d > 0 ? Math.min(z, b.z0 - r - EPS) : Math.max(z, b.z1 + r + EPS); a.wallZ = d > 0 ? -1 : 1; }
      }
      if (up > a.y && this.blocked(x, up + EPS, z, r, h)) up = a.y;
      a.x = x; a.z = z;
      if (up > a.y) { a.stepped = (a.stepped || 0) + up - a.y; a.y = up; }
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
      const reach = a.ground ? Math.max(-d, STEP) : -d;
      let floor = -Infinity;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (inside(b) && b.y1 <= a.y + EPS && b.y1 >= a.y - reach - EPS && b.y1 > floor) floor = b.y1;
      }
      if (floor > -Infinity && (a.ground || a.y + d <= floor + EPS)) { a.y = floor; a.ground = true; }
      else { a.y = Math.max(-20, a.y + d); a.ground = false; }
    }

    /**
     * A wall a body is up against, in the direction (fx, fz): the face's
     * outward normal and how high it goes, or null. For climbing.
     */
    wallFacing(a, fx, fz) {
      const r = a.r + 0.08, list = this.near(a.x, a.z, r + 0.2);
      let best = null, bd = Infinity;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (a.y + 0.3 >= b.y1 || a.y + a.h * 0.8 <= b.y0) continue;
        // Distance from the body's centre to each vertical face, if the body
        // overlaps the face's span along the other axis.
        const inZ = a.z > b.z0 - a.r * 0.6 && a.z < b.z1 + a.r * 0.6, inX = a.x > b.x0 - a.r * 0.6 && a.x < b.x1 + a.r * 0.6;
        const cand = [];
        if (inZ && a.x <= b.x0 + EPS) cand.push([b.x0 - a.x, -1, 0]);
        if (inZ && a.x >= b.x1 - EPS) cand.push([a.x - b.x1, 1, 0]);
        if (inX && a.z <= b.z0 + EPS) cand.push([b.z0 - a.z, 0, -1]);
        if (inX && a.z >= b.z1 - EPS) cand.push([a.z - b.z1, 0, 1]);
        for (const c of cand) {
          if (c[0] > r || c[0] < -EPS) continue;
          // It has to be in front of us: the normal points back at us.
          if (-(c[1] * fx + c[2] * fz) < 0.55) continue;
          if (c[0] < bd) { bd = c[0]; best = { nx: c[1], nz: c[2], top: b.y1, box: b, d: c[0] }; }
        }
      }
      if (!best) return null;
      // The top of the climb is the top of whatever is stacked on that face.
      let top = best.top;
      for (let guard = 0; guard < 6; guard++) {
        const px = a.x - best.nx * (a.r + 0.05), pz = a.z - best.nz * (a.r + 0.05);
        const t = this.ray(px, top - 0.05, pz, -best.nx, 0, -best.nz, 0.2);
        const above = this.ray(px, top + 0.05, pz, -best.nx, 0, -best.nz, 0.2);
        if (above < 0.2 && t < 0.2) { const b2 = this.hit.box; if (b2 && b2.y1 > top) { top = b2.y1; continue; } }
        break;
      }
      best.top = top;
      return best;
    }

    /* ---- rays ---- */

    /** The first thing along a ray; the distance, with the face in this.hit. */
    ray(ox, oy, oz, dx, dy, dz, maxT) {
      const hit = this.hit;
      hit.box = null; hit.nx = 0; hit.ny = 0; hit.nz = 0;
      let best = maxT;
      const gen = ++this._gen;
      let gx = Math.floor(ox / HS), gz = Math.floor(oz / HS);
      const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      const tdx = Math.abs(dx) > 1e-12 ? HS / Math.abs(dx) : Infinity;
      const tdz = Math.abs(dz) > 1e-12 ? HS / Math.abs(dz) : Infinity;
      let tmx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (gx + 1) * HS - ox : ox - gx * HS) / Math.abs(dx)) : Infinity;
      let tmz = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (gz + 1) * HS - oz : oz - gz * HS) / Math.abs(dz)) : Infinity;
      for (let guard = 0; guard < 512; guard++) {
        if (gx >= 0 && gz >= 0 && gx < this.GW && gz < this.GD) {
          const list = this.hash[gz * this.GW + gx];
          for (let k = 0; k < list.length; k++) {
            const b = list[k];
            if (this._stamp[b.id] === gen) continue;
            this._stamp[b.id] = gen;
            this._slab(b, ox, oy, oz, dx, dy, dz, best);
            if (this._t < best) { best = this._t; hit.nx = this._nx; hit.ny = this._ny; hit.nz = this._nz; hit.box = b; }
          }
        } else if ((gx < 0 && stepX < 0) || (gz < 0 && stepZ < 0) || (gx >= this.GW && stepX > 0) || (gz >= this.GD && stepZ > 0)) {
          break;
        }
        const t0 = Math.min(tmx, tmz);
        if (t0 > best) break;
        if (tmx < tmz) { gx += stepX; tmx += tdx; } else { gz += stepZ; tmz += tdz; }
      }
      hit.t = best;
      return best;
    }

    _slab(b, ox, oy, oz, dx, dy, dz, maxT) {
      let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
      this._t = Infinity;
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
      if (tmin <= 0 && nx === 0 && ny === 0 && nz === 0) { tmin = 0; ny = 1; }
      this._t = tmin; this._nx = nx; this._ny = ny; this._nz = nz;
    }

    /** Nothing solid between two points. */
    clear(ax, ay, az, bx, by, bz) {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) return true;
      return this.ray(ax, ay, az, dx / L, dy / L, dz / L, L) >= L - 1e-3;
    }

    /**
     * The colour where the last ray hit, into `out`, and which way the face
     * looked (for its light). Null if it hit nothing.
     */
    colourAt(x, y, z, out) {
      const h = this.hit;
      if (!h.box) return null;
      const f = faceKey(h.nx, h.ny, h.nz);
      const uv = uvOf(h.box, f, x, y, z, UV);
      return D.sample(matOf(h.box, f), uv[0], uv[1], out);
    }

    /** Cast and read the colour in one: [r, g, b] or null, and the
        distance in this.hit.t. */
    look(ox, oy, oz, dx, dy, dz, maxT, out) {
      const t = this.ray(ox, oy, oz, dx, dy, dz, maxT);
      if (!this.hit.box) return null;
      return this.colourAt(ox + dx * t, oy + dy * t, oz + dz * t, out);
    }

    /* ---- walking ---- */

    _nav() {
      const NW = Math.ceil(this.W / NC), ND = Math.ceil(this.D / NC);
      const navH = new Float32Array(NW * ND), navOK = new Uint8Array(NW * ND);
      for (let j = 0; j < ND; j++) {
        for (let i = 0; i < NW; i++) {
          const x = (i + 0.5) * NC, z = (j + 0.5) * NC;
          const tops = [];
          const list = this.near(x, z, 0.05);
          for (const b of list) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 <= 3.4) tops.push(b.y1);
          tops.sort((p, q) => q - p);
          // Anything a stair high inside the body's reach is stepped onto,
          // not walked into, so it does not count against the cell.
          for (const y of tops) {
            if (!this.blocked(x, y + STEP, z, BODY_R - 0.02, BODY_H - STEP - 0.05)) { navH[j * NW + i] = y; navOK[j * NW + i] = 1; break; }
          }
        }
      }
      return { NW: NW, ND: ND, navH: navH, navOK: navOK };
    }

    cellOf(x, z) {
      const cx = Math.max(0, Math.min(this.NW - 1, Math.floor(x / NC)));
      const cz = Math.max(0, Math.min(this.ND - 1, Math.floor(z / NC)));
      return cz * this.NW + cx;
    }
    cellX(c) { return (c % this.NW + 0.5) * NC; }
    cellZ(c) { return (Math.floor(c / this.NW) + 0.5) * NC; }

    /** The walkable cell nearest (x, z) at about height y. */
    navCell(x, z, y) {
      const NW = this.NW, ND = this.ND;
      const c = this.cellOf(x, z);
      const yy = y == null ? this.navH[c] : y;
      if (this.navOK[c] && Math.abs(this.navH[c] - yy) < 1.3) return c;
      let best = -1, bd = Infinity;
      const cx = c % NW, cz = Math.floor(c / NW);
      for (let r = 1; r <= 6 && best < 0; r++) {
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            const x2 = cx + i, z2 = cz + j;
            if (x2 < 0 || z2 < 0 || x2 >= NW || z2 >= ND) continue;
            const k = z2 * NW + x2;
            if (!this.navOK[k]) continue;
            const d = (i * i + j * j) * NC * NC + Math.abs(this.navH[k] - yy) * 4;
            if (d < bd) { bd = d; best = k; }
          }
        }
      }
      return best < 0 ? c : best;
    }

    _edge(a, b) {
      if (!this.navOK[b]) return 0;
      const dh = this.navH[b] - this.navH[a];
      if (dh > CLIMB) return 0;
      if (dh > STEP) return 4;
      if (dh < -3.5) return 0;
      if (dh < -STEP) return 0.8;
      return 0.001;
    }

    /**
     * Every cell reachable from c in one move, as cb(k, cost). The eight
     * neighbours, plus a jump or a drop across one cell a body cannot stand
     * in: the edge of a counter, a crate, a pit. A body stands 0.3 m clear
     * of anything, so the cell next to a box is never walkable and without
     * these the top of every box would be an island.
     */
    links(c, cb) {
      const NW = this.NW, ND = this.ND, cx = c % NW, cz = (c - cx) / NW;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x2 = cx + dx, z2 = cz + dz;
          if (x2 < 0 || z2 < 0 || x2 >= NW || z2 >= ND) continue;
          const k = z2 * NW + x2;
          const e = this._edge(c, k);
          if (!e) continue;
          if (dx && dz) {
            const k1 = cz * NW + x2, k2 = z2 * NW + cx;
            if (!this._edge(c, k1) || !this._edge(c, k2) || e > 0.01) continue;
            if (Math.abs(this.navH[k1] - this.navH[c]) > STEP || Math.abs(this.navH[k2] - this.navH[c]) > STEP) continue;
          }
          cb(k, (dx && dz ? Math.SQRT2 : 1) * NC + e);
        }
      }
      for (let d = 0; d < 4; d++) {
        const dx = d === 0 ? 1 : d === 1 ? -1 : 0, dz = d === 2 ? 1 : d === 3 ? -1 : 0;
        const x2 = cx + dx * 2, z2 = cz + dz * 2;
        if (x2 < 0 || z2 < 0 || x2 >= NW || z2 >= ND) continue;
        if (this.navOK[(cz + dz) * NW + cx + dx]) continue;
        const k = z2 * NW + x2;
        if (!this.navOK[k]) continue;
        const h0 = this.navH[c], h1 = this.navH[k], dh = h1 - h0;
        if (dh > CLIMB || dh < -3.5 || Math.abs(dh) < 0.05) continue;
        const hy = Math.max(h0, h1) + 0.45;
        if (!this.clear(this.cellX(c), hy, this.cellZ(c), this.cellX(k), hy, this.cellZ(k))) continue;
        if (!this.clear(this.cellX(c), hy + 1.1, this.cellZ(c), this.cellX(k), hy + 1.1, this.cellZ(k))) continue;
        cb(k, 2 * NC + (dh > STEP ? 4 : dh < -STEP ? 1 : 0.2));
      }
    }

    /** A* from one point to another: waypoints [{x, z, y, jump}] or null. */
    path(sx, sz, sy, tx, tz, ty) {
      const NW = this.NW, ND = this.ND;
      const s = this.navCell(sx, sz, sy), t = this.navCell(tx, tz, ty);
      if (s === t) return [{ x: tx, z: tz, y: this.navH[t], jump: false }];
      const run = ++this._search;
      const g = this._g, par = this._par, seen = this._seen, shut = this._shut, f = this._f, heap = this._heap;
      let n = 0;
      const tX = t % NW, tZ = Math.floor(t / NW);
      const hEst = k => { const dx = Math.abs((k % NW) - tX), dz = Math.abs(Math.floor(k / NW) - tZ); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * NC; };
      const push = k => { let i = n++; heap[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; const q = heap[p]; heap[p] = heap[i]; heap[i] = q; i = p; } };
      const pop = () => {
        const top = heap[0]; heap[0] = heap[--n];
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < n && f[heap[l]] < f[heap[m]]) m = l;
          if (r < n && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break;
          const q = heap[m]; heap[m] = heap[i]; heap[i] = q; i = m;
        }
        return top;
      };
      g[s] = 0; f[s] = hEst(s); par[s] = -1; seen[s] = run; push(s);
      let found = false, iter = 0;
      while (n > 0 && iter++ < NW * ND * 4) {
        const c = pop();
        if (shut[c] === run) continue;
        shut[c] = run;
        if (c === t) { found = true; break; }
        this.links(c, (k, step) => {
          if (shut[k] === run) return;
          const cost = g[c] + step;
          if (seen[k] === run && cost >= g[k]) return;
          seen[k] = run; g[k] = cost; par[k] = c; f[k] = cost + hEst(k);
          push(k);
        });
      }
      if (!found) return null;
      const cells = [];
      for (let c = t; c >= 0; c = par[c]) { cells.push(c); if (c === s) break; }
      cells.reverse();
      const out = [];
      let from = 0;
      for (let i = 1; i < cells.length; i++) {
        const jump = this.navH[cells[i]] - this.navH[cells[i - 1]] > STEP;
        const drop = this.navH[cells[i]] - this.navH[cells[i - 1]] < -STEP;
        if (jump || drop || i === cells.length - 1 || !this.flat(cells[from], cells[i + 1])) {
          if ((jump || drop) && i - 1 > from) out.push(this._wp(cells[i - 1], false));
          out.push(this._wp(cells[i], jump));
          from = i;
        }
      }
      // The last step, from the last cell to the point itself, when a body
      // can stand there: up against a wall is never a walkable cell.
      const last = out[out.length - 1];
      if (last && Math.hypot(tx - last.x, tz - last.z) < 1.2 && Math.abs(this.floorAt(tx, tz, last.y + 0.3, 0.1) - last.y) < 0.3
        && !this.blocked(tx, last.y + 0.05, tz, BODY_R - 0.03, 1.0)) {
        if (Math.hypot(tx - last.x, tz - last.z) > 0.05) out.push({ x: tx, z: tz, y: last.y, jump: false });
      }
      return out;
    }

    _wp(c, jump) { return { x: this.cellX(c), z: this.cellZ(c), y: this.navH[c], jump: jump }; }

    /** Walkable in a straight line between two cells, no step past a stair. */
    flat(a, b) {
      const ax = this.cellX(a), az = this.cellZ(a), bx = this.cellX(b), bz = this.cellZ(b);
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 0.2));
      let prev = a;
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
        for (const o of [-0.3, 0.3]) {
          const k = this.cellOf(x + (bz - az) / (L || 1) * o, z - (bx - ax) / (L || 1) * o);
          if (!this.navOK[k] || Math.abs(this.navH[k] - this.navH[prev]) > STEP) return false;
        }
        const k = this.cellOf(x, z);
        if (!this.navOK[k] || Math.abs(this.navH[k] - this.navH[prev]) > STEP) return false;
        prev = k;
      }
      return true;
    }

    /** Inside the map proper (not the warm-up room). */
    inMap(x, z) { return x > 0 && x < this.mapW && z > 0 && z < this.mapD; }

    /** A random walkable cell of the map proper. */
    randomCell(rng, near, within) {
      for (let tries = 0; tries < 80; tries++) {
        let x, z;
        if (near) { const a = rng.next() * Math.PI * 2, d = rng.next() * (within || 8); x = near.x + Math.sin(a) * d; z = near.z + Math.cos(a) * d; }
        else { x = 1 + rng.next() * (this.mapW - 2); z = 1 + rng.next() * (this.mapD - 2); }
        if (!this.inMap(x, z)) continue;
        const c = this.cellOf(x, z);
        if (this.navOK[c]) return { x: this.cellX(c), z: this.cellZ(c), y: this.navH[c], cell: c };
      }
      const h = this.hide[0];
      return { x: h[0], z: h[1], y: 0, cell: this.cellOf(h[0], h[1]) };
    }
  }

  World.STEP = STEP;
  World.CLIMB = CLIMB;
  World.NC = NC;
  World.FACE = FACE;
  World.faceKey = faceKey;
  World.matOf = matOf;
  World.uvOf = uvOf;
  World.BODY_R = BODY_R;
  World.BODY_H = BODY_H;
  const UV = [0, 0];
  PV.HideWorld = World;

})(window.PV);
