/* 变色躲猫猫 / Blend In — the maps.

   Six places to hide in and the warm-up room the seekers wait in, each a
   list of boxes. A box is solid, has a material (data.js) on every face,
   and may carry a different one on some faces: a poster is a thin box with
   a picture on its front, a locker row is a box with doors on the side
   that faces the hall.

   A map is written in metres, x to the east and z to the south, the floor
   at y = 0. The outer walls are inside the map's own rectangle, so every
   coordinate is positive. The warm-up room stands east of the map, walled
   off from it: seekers count down there while the hiders paint, and the
   lobby before a round is the same room.

   What a map is FOR is the thing to get right: a hider needs walls, props
   and floors of every kind of pattern — plain, striped, tiled, busy — to
   match, and corners, tops of things and walls to climb; a seeker needs to
   be able to walk everywhere a hider can stand. The smoke test walks from
   every spawn to every corner to hold the second. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

  function Builder(key, W, D, o) {
    const m = {
      key: key, W: W + 16, D: Math.max(D, 16), mapW: W, mapD: D, boxes: [],
      sky: !!o.sky, skyTop: o.skyTop || '#6FB6EC', skyLow: o.skyLow || '#D6ECF8',
      hide: null, seek: null, lobby: null, lobbyAt: [W + 2.5, 1.5]
    };
    m.box = function (x0, y0, z0, x1, y1, z1, mat, faces) {
      const b = {
        x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
        x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), mat: mat || 'white', faces: null
      };
      if (faces) { b.faces = {}; for (const f of FACES) if (faces[f]) b.faces[f] = faces[f]; }
      m.boxes.push(b);
      return b;
    };
    return m;
  }

  /* ---------------------------------------------------------- helpers */

  /** A floor: a slab whose top is at y. */
  function floor(m, x0, z0, x1, z1, mat, y) { const t = y || 0; return m.box(x0, t - 0.3, z0, x1, t, z1, mat); }

  /** The four outer walls, half a metre thick, inside [0, W] x [0, D]. */
  function shell(m, W, D, h, mat, faces) {
    const f = faces || {};
    m.box(0, 0, 0, W, h, 0.5, mat, f.n ? { pz: f.n } : null);
    m.box(0, 0, D - 0.5, W, h, D, mat, f.s ? { nz: f.s } : null);
    m.box(0, 0, 0.5, 0.5, h, D - 0.5, mat, f.w ? { px: f.w } : null);
    m.box(W - 0.5, 0, 0.5, W, h, D - 0.5, mat, f.e ? { nx: f.e } : null);
  }

  /** A band round the inside of the outer walls, standing 3 cm proud. */
  function band(m, W, D, y0, y1, mat) {
    m.box(0.5, y0, 0.5, W - 0.5, y1, 0.53, mat);
    m.box(0.5, y0, D - 0.53, W - 0.5, y1, D - 0.5, mat);
    m.box(0.5, y0, 0.53, 0.53, y1, D - 0.53, mat);
    m.box(W - 0.53, y0, 0.53, W - 0.5, y1, D - 0.53, mat);
  }

  /**
   * A picture on a wall. `dir` is the way it faces ('pz' looks south, and
   * hangs on a wall whose face is at z = at); a0..a1 run along the wall, y0..y1
   * up it. A frame goes behind it unless frame is false.
   */
  function pic(m, dir, at, a0, a1, y0, y1, mat, frame) {
    const fr = frame === false ? null : (frame || 'darkWood'), e = 0.07;
    const s = dir[0] === 'p' ? 1 : -1;
    const put = (d0, d1, b0, b1, c0, c1, mt, faces) => {
      if (dir[1] === 'z') return m.box(b0, c0, at + s * d0, b1, c1, at + s * d1, mt, faces);
      return m.box(at + s * d0, c0, b0, at + s * d1, c1, b1, mt, faces);
    };
    if (fr) put(0, 0.04, a0 - e, a1 + e, y0 - e, y1 + e, fr);
    const f = {}; f[dir] = mat;
    return put(fr ? 0.04 : 0, fr ? 0.06 : 0.03, a0, a1, y0, y1, fr || mat, f);
  }

  /** Stairs rising along z from z0 to z1 (either way), from y0 by `rise`. */
  function stairsZ(m, x0, x1, z0, z1, y0, rise, n, mat, nose) {
    for (let k = 0; k < n; k++) {
      const za = z0 + (z1 - z0) * k / n, zb = z0 + (z1 - z0) * (k + 1) / n;
      const top = y0 + rise * (k + 1) / n;
      m.box(x0, y0, za, x1, top, zb, mat);
      if (nose) m.box(x0, top, za, x1, top + 0.012, za + (z1 > z0 ? 0.06 : -0.06), nose);
    }
  }
  function stairsX(m, z0, z1, x0, x1, y0, rise, n, mat) {
    for (let k = 0; k < n; k++) {
      const xa = x0 + (x1 - x0) * k / n, xb = x0 + (x1 - x0) * (k + 1) / n;
      m.box(xa, y0, z0, xb, y0 + rise * (k + 1) / n, z1, mat);
    }
  }

  /** A bench: a seat on two legs, long along x or z. */
  function bench(m, x, z, len, alongX, mat, legMat) {
    const L = len / 2, d = 0.22;
    if (alongX) {
      m.box(x - L, 0.42, z - d, x + L, 0.5, z + d, mat);
      m.box(x - L + 0.1, 0, z - d + 0.05, x - L + 0.2, 0.42, z + d - 0.05, legMat || 'dark');
      m.box(x + L - 0.2, 0, z - d + 0.05, x + L - 0.1, 0.42, z + d - 0.05, legMat || 'dark');
    } else {
      m.box(x - d, 0.42, z - L, x + d, 0.5, z + L, mat);
      m.box(x - d + 0.05, 0, z - L + 0.1, x + d - 0.05, 0.42, z - L + 0.2, legMat || 'dark');
      m.box(x - d + 0.05, 0, z + L - 0.2, x + d - 0.05, 0.42, z + L - 0.1, legMat || 'dark');
    }
  }

  /** A table top on four legs. */
  function table(m, x0, z0, x1, z1, h, top, leg) {
    m.box(x0, h - 0.06, z0, x1, h, z1, top);
    const l = 0.07;
    m.box(x0 + 0.04, 0, z0 + 0.04, x0 + 0.04 + l, h - 0.06, z0 + 0.04 + l, leg);
    m.box(x1 - 0.04 - l, 0, z0 + 0.04, x1 - 0.04, h - 0.06, z0 + 0.04 + l, leg);
    m.box(x0 + 0.04, 0, z1 - 0.04 - l, x0 + 0.04 + l, h - 0.06, z1 - 0.04, leg);
    m.box(x1 - 0.04 - l, 0, z1 - 0.04 - l, x1 - 0.04, h - 0.06, z1 - 0.04, leg);
  }

  /** A blocky tree: a trunk and two tiers of leaves. */
  function tree(m, x, z, s) {
    const k = s || 1;
    m.box(x - 0.2 * k, 0, z - 0.2 * k, x + 0.2 * k, 2.2 * k, z + 0.2 * k, 'bark');
    m.box(x - 1.3 * k, 2.0 * k, z - 1.3 * k, x + 1.3 * k, 3.2 * k, z + 1.3 * k, 'leaves');
    m.box(x - 0.85 * k, 3.2 * k, z - 0.85 * k, x + 0.85 * k, 4.0 * k, z + 0.85 * k, 'leaves');
  }

  /** A potted plant. */
  function plant(m, x, z) {
    m.box(x - 0.28, 0, z - 0.28, x + 0.28, 0.55, z + 0.28, 'orange');
    m.box(x - 0.4, 0.55, z - 0.4, x + 0.4, 1.45, z + 0.4, 'leaves');
  }

  /** A paint bucket, standing. */
  function bucket(m, x, z, mat) {
    m.box(x - 0.34, 0, z - 0.34, x + 0.34, 0.72, z + 0.34, mat, { py: 'white' });
    m.box(x - 0.36, 0.62, z - 0.36, x + 0.36, 0.7, z + 0.36, 'white');
  }

  /** Brass posts with a velvet rope between them, along x or z. */
  function ropes(m, a0, a1, at, alongX, step) {
    const n = Math.max(1, Math.round((a1 - a0) / (step || 2)));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      if (alongX) m.box(a - 0.07, 0, at - 0.07, a + 0.07, 1.0, at + 0.07, 'brass');
      else m.box(at - 0.07, 0, a - 0.07, at + 0.07, 1.0, a + 0.07, 'brass');
    }
    if (alongX) m.box(a0, 0.82, at - 0.035, a1, 0.9, at + 0.035, 'rope');
    else m.box(at - 0.035, 0.82, a0, at + 0.035, 0.9, a1, 'rope');
  }

  /** Where hiders and seekers start: a ring round (x, z). */
  function ring(x, z, n, r) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    return out;
  }

  /* ---------------------------------------------------- the warm-up room */

  function lobby(m) {
    const ox = m.lobbyAt[0], oz = m.lobbyAt[1], S = 12;
    floor(m, ox - 0.5, oz - 0.5, ox + S + 0.5, oz + S + 0.5, 'lobbyFloor');
    m.box(ox + 3.5, 0, oz + 3.5, ox + 8.5, 0.02, oz + 8.5, 'lobbyFloor', { py: 'wheel' });
    m.box(ox - 0.5, 0, oz - 0.5, ox + S + 0.5, 5, oz, 'lobbyBrick', { pz: 'treeWall' });
    m.box(ox - 0.5, 0, oz + S, ox + S + 0.5, 3.4, oz + S + 0.5, 'lobbyBrick');
    m.box(ox - 0.5, 0, oz, ox, 3.4, oz + S, 'lobbyBrick');
    m.box(ox + S, 0, oz, ox + S + 0.5, 3.4, oz + S, 'lobbyBrick');
    bucket(m, ox + 1.2, oz + 1.2, 'blue');
    bucket(m, ox + 2.1, oz + 1.0, 'yellow');
    bucket(m, ox + 10.8, oz + 10.8, 'pink');
    // A tipped bucket and its puddle.
    m.box(ox + 3.2, 0, oz + 1.0, ox + 4.0, 0.68, oz + 1.7, 'purple', { px: 'white' });
    m.box(ox + 4.0, 0, oz + 0.9, ox + 6.2, 0.025, oz + 2.0, 'purple');
    m.box(ox + 9.6, 0, oz + 0.6, ox + 11.4, 0.9, oz + 1.6, 'crate');
    m.box(ox + 10.0, 0.9, oz + 0.7, ox + 11.1, 1.6, oz + 1.5, 'crate');
    m.box(ox + 0.4, 0, oz + 9.6, ox + 1.8, 1.2, oz + 11.4, 'hedge');
    m.box(ox + 10.6, 0, oz + 5.4, ox + 11.6, 0.9, oz + 6.6, 'hedge');
    bench(m, ox + 6, oz + 11, 2.4, true, 'wood');
    m.lobby = ring(ox + 6, oz + 6, 8, 3.3);
  }

  /* -------------------------------------------------------------- maps */

  const BUILD = {};

  /* The subway: a tiled concourse, stairs up to the street, a platform
     with green pillars, and a train waiting in a pit you can drop into. */
  BUILD.subway = function () {
    const W = 34, D = 24, H = 4.8;
    const m = Builder('subway', W, D, {});
    floor(m, 0, 0, W, 15, 'checkFloor');
    floor(m, 0, 15, W, 18.2, 'grey');
    m.box(0.5, 0, 17.7, W - 0.5, 0.012, 18.2, 'platEdge');
    floor(m, 0, 18.2, W, D, 'track', -1.2);
    shell(m, W, D, H, 'tileW');
    m.box(0, H, 0, W, H + 0.4, D, 'white');
    band(m, W, D, 1.05, 1.4, 'tileG');
    m.box(0.5, 0, 0.53, W - 0.5, 0.25, 0.56, 'tileDark');
    // The pit's own walls, below the platform edge and round the end.
    m.box(0.5, -1.2, 18.2, W - 0.5, 0, 18.4, 'tileDark');
    m.box(0, -1.2, D - 0.5, W, 0, D, 'tileDark');
    m.box(0, -1.2, 18.2, 0.5, 0, D - 0.5, 'tileDark');
    m.box(W - 0.5, -1.2, 18.2, W, 0, D - 0.5, 'tileDark');
    // Rails, and the train on them.
    for (const z of [19.6, 21.2]) m.box(0.5, -1.2, z - 0.05, W - 0.5, -1.08, z + 0.05, 'steel');
    m.box(4, -1.1, 19.0, 26, 2.7, 22.6, 'train');
    m.box(4, 0.6, 18.97, 26, 1.0, 19.0, 'trainBlue');
    for (let x = 5; x < 25; x += 3.2) m.box(x, 1.2, 18.95, x + 2.0, 2.2, 19.0, 'glassDark');
    m.box(26, -1.1, 19.4, 26.4, 2.4, 22.2, 'dark');
    // Stairs up to the street at the north wall, walled on both sides.
    stairsZ(m, 13, 19, 7.2, 1.2, 0, 3.0, 10, 'grey', 'yellow');
    m.box(13, 0, 0.5, 19, 3.0, 1.2, 'grey');
    m.box(12.5, 0, 0.5, 13, H, 7.2, 'tileW', { px: 'tileW' });
    m.box(19, 0, 0.5, 19.5, H, 7.2, 'tileW');
    m.box(12.47, 1.05, 0.5, 12.5, 1.4, 7.2, 'tileG');
    m.box(19.5, 1.05, 0.5, 19.53, 1.4, 7.2, 'tileG');
    pic(m, 'pz', 0.5, 13.6, 18.4, 3.1, 4.5, 'window', 'white');
    pic(m, 'pz', 7.2, 13.5, 15.5, 3.5, 4.2, 'signBlue', false);
    // Green pillars along the platform.
    for (const x of [5, 11, 17, 23, 29]) m.box(x - 0.5, 0, 15.6, x + 0.5, H, 16.6, 'tileG');
    // Turnstiles and ticket machines.
    for (let i = 0; i < 5; i++) { const x = 22 + i * 1.3; m.box(x, 0, 11.6, x + 0.3, 1.0, 12.6, 'steel'); }
    m.box(28.8, 0, 11.6, 29.2, 1.0, 12.6, 'steel');
    m.box(2.2, 0, 0.5, 3.4, 1.9, 1.3, 'blue', { pz: 'vending' });
    m.box(4.0, 0, 0.5, 5.2, 1.9, 1.3, 'red', { pz: 'vending' });
    m.box(8.4, 0, 0.5, 9.4, 1.5, 1.1, 'trainBlue');
    m.box(9.8, 0, 0.5, 10.8, 1.5, 1.1, 'trainBlue');
    // A kiosk in the corner.
    m.box(28, 0, 0.5, 33.5, 2.4, 3.2, 'shelfA', { pz: 'shelfB' });
    m.box(28, 2.4, 0.5, 33.5, 2.8, 3.6, 'red');
    // Posters and the map.
    pic(m, 'pz', 0.5, 1.6, 3.6, 2.2, 3.8, 'posterSun');
    pic(m, 'pz', 0.5, 6.0, 8.0, 2.2, 3.8, 'posterWave');
    pic(m, 'pz', 0.5, 21.0, 23.0, 2.2, 3.8, 'posterRocket');
    pic(m, 'px', 0.5, 4.0, 7.0, 1.8, 3.4, 'metroMap', 'steel');
    pic(m, 'nx', W - 0.5, 6.0, 8.0, 2.0, 3.6, 'posterMount');
    pic(m, 'nz', D - 0.5, 3.0, 7.0, 2.9, 4.2, 'posterFace');
    pic(m, 'nz', D - 0.5, 27.5, 31.5, 1.4, 3.6, 'posterSun');
    pic(m, 'nz', D - 0.5, 9.0, 13.0, 2.9, 4.2, 'metroMap', 'steel');
    pic(m, 'nx', W - 0.5, 12.5, 14.0, 3.2, 4.2, 'clock', false);
    // Benches and bins on the platform.
    for (const x of [8, 14, 20, 26]) bench(m, x, 16.9, 2.2, true, 'wood');
    for (const x of [2.2, 31.8]) m.box(x - 0.3, 0, 16.6, x + 0.3, 0.95, 17.2, 'green');
    m.box(0.5, 2.9, 15.5, W - 0.5, 3.1, 15.6, 'dark');
    pic(m, 'pz', 15.6, 9.5, 12.5, 3.1, 3.7, 'signGreen', false);
    // A planter bed and luggage-sized blocks in the concourse.
    m.box(4, 0, 7, 8, 0.6, 8.2, 'tileG');
    m.box(4.2, 0.6, 7.2, 7.8, 1.3, 8.0, 'hedge');
    m.box(24, 0, 6, 25.2, 1.6, 7.2, 'boxes');
    m.box(25.2, 0, 6.2, 26.0, 0.9, 7.0, 'boxes');
    m.hide = ring(8, 11, 6, 1.4);
    m.seek = [[15.2, 0.95], [16.8, 0.95]];
    lobby(m);
    return m;
  };

  /* The cinema: a carpeted lobby with a ticket booth, a snack counter,
     posters and ropes, and a screening room with tiers of red seats. */
  BUILD.cinema = function () {
    const W = 34, D = 28, H = 6;
    const m = Builder('cinema', W, D, {});
    floor(m, 0, 0, W, D, 'carpet');
    shell(m, W, D, H, 'cream');
    m.box(0, H, 0, W, H + 0.4, D, 'cream');
    band(m, W, D, 0, 1.25, 'wainscot');
    band(m, W, D, 1.25, 1.35, 'brass');
    // The wall between the lobby and the screen, with two doors.
    const z = 13.5;
    m.box(0.5, 0, z, 4, H, z + 0.5, 'cream');
    m.box(7, 0, z, 27, H, z + 0.5, 'cream', { nz: 'cream', pz: 'black' });
    m.box(30, 0, z, W - 0.5, H, z + 0.5, 'cream');
    m.box(4, 2.6, z, 7, H, z + 0.5, 'cream');
    m.box(27, 2.6, z, 30, H, z + 0.5, 'cream');
    m.box(7, 0, z - 0.03, 27, 1.25, z, 'wainscot');
    pic(m, 'nz', z, 4.6, 6.4, 2.75, 3.25, 'exit', false);
    pic(m, 'nz', z, 27.6, 29.4, 2.75, 3.25, 'exit', false);
    // The ticket booth.
    m.box(13, 0, 0.5, 21, 1.1, 3.2, 'darkWood');
    m.box(13, 1.1, 0.5, 13.2, 2.7, 3.2, 'darkWood');
    m.box(20.8, 1.1, 0.5, 21, 2.7, 3.2, 'darkWood');
    m.box(13.2, 1.1, 2.9, 20.8, 2.6, 3.0, 'frosted');
    m.box(12.8, 2.6, 0.5, 21.2, 3.3, 3.4, 'velvet', { pz: 'signRed' });
    // The snack counter along the west wall.
    m.box(0.5, 0, 3, 3.2, 1.1, 10, 'velvet', { py: 'darkWood' });
    m.box(0.8, 1.1, 4, 2.0, 2.3, 5.4, 'popcorn');
    m.box(0.8, 1.1, 7.6, 1.6, 1.8, 8.4, 'red');
    pic(m, 'px', 0.5, 3.6, 9.4, 2.6, 4.2, 'menu', 'black');
    // Ropes that make a queue in front of the booth.
    ropes(m, 11, 23, 6, true, 2);
    ropes(m, 11, 19, 8.5, true, 2);
    // Posters in their frames, both side walls.
    pic(m, 'nx', W - 0.5, 2.0, 4.2, 1.7, 4.6, 'posterFace', 'brass');
    pic(m, 'nx', W - 0.5, 6.0, 8.2, 1.7, 4.6, 'posterRocket', 'brass');
    pic(m, 'nx', W - 0.5, 10.0, 12.2, 1.7, 4.6, 'posterMount', 'brass');
    pic(m, 'pz', 0.5, 24.0, 26.2, 1.7, 4.6, 'posterSun', 'brass');
    pic(m, 'pz', 0.5, 28.5, 30.7, 1.7, 4.6, 'posterWave', 'brass');
    pic(m, 'pz', 0.5, 6.0, 8.2, 1.7, 4.6, 'posterMount', 'brass');
    plant(m, 11.5, 1.2); plant(m, 22.5, 1.2); plant(m, 32.8, 12.4); plant(m, 5.0, 12.4);
    bench(m, 24, 10.5, 2.4, true, 'velvet', 'brass');
    bench(m, 28.5, 10.5, 2.4, true, 'velvet', 'brass');
    // The screening room: a screen, and tiers of seats climbing south.
    pic(m, 'pz', z + 0.5, 6, 28, 1.4, 5.4, 'screen', 'black');
    m.box(8.5, 0, z + 0.5, 25.5, 0.5, z + 1.5, 'black');
    // Four tiers, each a step up; the rows leave an aisle down each side.
    for (let k = 0; k < 4; k++) {
      const z0 = 17 + k * 2.5, y = k * 0.45;
      if (k) m.box(0.5, 0, z0 - 0.2, W - 0.5, y, D - 0.5, 'carpet');
      m.box(0.5, y - 0.01, z0 - 0.2, W - 0.5, y + 0.005, z0 - 0.14, 'brass');
      // A row: a long seat and a long back, split by arms.
      m.box(4, y, z0 + 0.3, 30, y + 0.45, z0 + 0.95, 'velvet');
      m.box(4, y, z0 + 0.95, 30, y + 1.0, z0 + 1.2, 'velvet');
      for (let x = 4; x <= 30; x += 1.3) m.box(x - 0.05, y, z0 + 0.3, x + 0.05, y + 0.62, z0 + 1.2, 'black');
    }
    m.hide = ring(17, 10.5, 6, 1.2);
    m.seek = [[16, 4.6], [18, 4.6]];
    lobby(m);
    return m;
  };

  /* A school: a hallway of lockers, a classroom with desks and a
     chalkboard, and a library with shelves, beanbags and windows. */
  BUILD.school = function () {
    const W = 32, D = 24, H = 4.2;
    const m = Builder('school', W, D, {});
    floor(m, 0, 0, W, 6.5, 'lino');
    floor(m, 0, 6.5, 16, D, 'wood');
    floor(m, 16, 6.5, W, D, 'lightWood');
    shell(m, W, D, H, 'wallBlue');
    m.box(0, H, 0, W, H + 0.4, D, 'white');
    // Lockers along the hall's north wall.
    m.box(1, 0, 0.5, 13, 2.0, 1.0, 'lockerRow', { py: 'blue' });
    m.box(19, 0, 0.5, 31, 2.0, 1.0, 'lockerRow', { py: 'blue' });
    pic(m, 'pz', 0.5, 14.0, 18.0, 1.3, 2.8, 'corkboard', 'darkWood');
    pic(m, 'pz', 0.5, 15.2, 16.8, 3.1, 3.9, 'clock', false);
    // The wall between the hall and the rooms, with a door to each.
    m.box(0.5, 0, 6.2, 5, H, 6.6, 'white');
    m.box(7, 0, 6.2, 21, H, 6.6, 'white');
    m.box(23, 0, 6.2, W - 0.5, H, 6.6, 'white');
    m.box(5, 2.4, 6.2, 7, H, 6.6, 'white');
    m.box(21, 2.4, 6.2, 23, H, 6.6, 'white');
    for (const s of [[0.5, 5], [7, 21], [23, W - 0.5]]) m.box(s[0], 0, 6.17, s[1], 1.0, 6.2, 'wallBlue');
    // And between the two rooms.
    m.box(15.8, 0, 6.6, 16.2, H, 15, 'white');
    m.box(15.8, 0, 17, 16.2, H, D - 0.5, 'white');
    m.box(15.8, 2.4, 15, 16.2, H, 17, 'white');
    // The classroom: chalkboard, teacher's desk, four rows of desks.
    pic(m, 'nz', D - 0.5, 3.5, 12.5, 1.0, 2.8, 'chalk', 'darkWood');
    m.box(6.0, 0, 20.2, 9.5, 0.85, 21.2, 'darkWood');
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = 2.6 + c * 3.2, zz = 9 + r * 2.5;
        table(m, x, zz, x + 1.3, zz + 0.7, 0.76, 'desk', 'steel');
        m.box(x + 0.35, 0, zz + 0.85, x + 0.95, 0.45, zz + 1.35, 'chairBlue');
        m.box(x + 0.35, 0.45, zz + 1.3, x + 0.95, 0.95, zz + 1.4, 'chairBlue');
      }
    }
    for (let i = 0; i < 3; i++) pic(m, 'px', 0.5, 8.5 + i * 5, 11.5 + i * 5, 1.2, 3.2, 'window', 'white');
    m.box(13.8, 0, 7.2, 15.8, 2.2, 8.2, 'bookshelf');
    pic(m, 'nx', 15.8, 10.5, 12.5, 1.4, 2.8, 'paintDots');
    pic(m, 'nx', 15.8, 18.5, 20.5, 1.4, 2.8, 'posterMount');
    // The library: shelves in rows, a rug, beanbags, windows.
    m.box(18, 0, 9, 18.8, 2.3, 15, 'bookshelf', { nx: 'bookshelf2' });
    m.box(22, 0, 9, 22.8, 2.3, 15, 'bookshelf2', { nx: 'bookshelf' });
    m.box(26, 0, 9, 26.8, 2.3, 15, 'bookshelf', { nx: 'bookshelf2' });
    m.box(W - 1.1, 0, 7, W - 0.5, 2.3, 18, 'bookshelf2');
    m.box(19, 0, 18.5, 27, 0.02, 22.5, 'rubber');
    m.box(19.5, 0, 19, 20.7, 0.6, 20.2, 'orange');
    m.box(22.4, 0, 20.4, 23.6, 0.6, 21.6, 'purple');
    m.box(25, 0, 19, 26.2, 0.6, 20.2, 'teal');
    table(m, 28, 19.5, 30.5, 21.5, 0.72, 'lightWood', 'darkWood');
    for (let i = 0; i < 3; i++) pic(m, 'nz', D - 0.5, 17.5 + i * 4.8, 20.5 + i * 4.8, 1.2, 3.2, 'window', 'white');
    pic(m, 'pz', 6.6, 24.0, 27.0, 1.5, 3.0, 'posterRocket');
    plant(m, 31.0, 23.0);
    m.hide = ring(15, 3.3, 6, 1.4);
    m.seek = [[30, 3.2], [30, 4.6]];
    lobby(m);
    return m;
  };

  /* A supermarket: aisles of shelves packed with colour, fridges along
     the back, fruit stands, stacks of boxes and the checkouts. */
  BUILD.market = function () {
    const W = 34, D = 26, H = 4.6;
    const m = Builder('market', W, D, {});
    floor(m, 0, 0, W, D, 'martFloor');
    shell(m, W, D, H, 'white');
    m.box(0, H, 0, W, H + 0.4, D, 'white');
    band(m, W, D, 2.4, 2.9, 'blue');
    // Fridges along the back wall.
    m.box(2, 0, 0.5, 32, 2.2, 1.4, 'white', { pz: 'fridgeRow' });
    m.box(2, 2.2, 0.5, 32, 2.4, 1.6, 'blue');
    // Four aisles: shelves you can see both sides of.
    const sh = ['shelfA', 'shelfB', 'shelfC', 'shelfA'], sh2 = ['shelfB', 'shelfC', 'shelfA', 'shelfC'];
    [7, 12.5, 18, 23.5].forEach((x, i) => {
      m.box(x, 0, 5, x + 1.2, 2.2, 16, sh[i], { nx: sh2[i], pz: 'shelfEnd', nz: 'shelfEnd', py: 'shelfEnd' });
      pic(m, 'pz', 16, x + 0.1, x + 1.1, 1.2, 1.9, i % 2 ? 'posterWave' : 'posterSun', false);
    });
    for (const x of [7, 12.5, 18, 23.5]) pic(m, 'nz', 5, x - 0.1, x + 1.3, 2.9, 3.4, 'signGreen', false);
    // Fruit and veg on the west side.
    for (let i = 0; i < 3; i++) {
      const z0 = 5.5 + i * 3.4, fruit = ['oranges', 'apples', 'limes'][i];
      m.box(1.6, 0, z0, 4.0, 0.9, z0 + 2.2, 'crate', { py: fruit });
    }
    // Boxes stacked in the east corner.
    m.box(28.5, 0, 3, 31.5, 1.2, 5.5, 'boxes');
    m.box(29.0, 1.2, 3.4, 31.2, 2.2, 5.2, 'boxes');
    m.box(31.8, 0, 2.5, 33.5, 1.0, 4.2, 'boxes');
    m.box(28, 0, 7, 29.4, 1.0, 8.4, 'boxes');
    // The checkouts.
    for (const x of [6, 12, 18]) {
      m.box(x, 0, 19.5, x + 3.4, 1.0, 20.6, 'counter');
      m.box(x + 3.4, 0, 19.5, x + 4.0, 1.3, 20.2, 'dark');
    }
    // Carts, as baskets of steel.
    for (const x of [26, 27.2]) { m.box(x, 0.2, 21, x + 0.9, 1.0, 22.4, 'steel'); }
    pic(m, 'px', 0.5, 17.5, 21.5, 1.4, 3.2, 'posterFace');
    pic(m, 'nx', W - 0.5, 10.0, 14.0, 1.4, 3.2, 'posterMount');
    pic(m, 'nz', D - 0.5, 2.0, 5.0, 1.4, 3.2, 'posterRocket');
    pic(m, 'pz', 0.5, 12.0, 20.0, 3.0, 3.6, 'signBlue', false);
    plant(m, 32.8, 24.8); plant(m, 1.3, 24.8);
    m.hide = ring(15.2, 17.8, 6, 1.2);
    m.seek = [[30, 23.5], [31.2, 23.5]];
    lobby(m);
    return m;
  };

  /* A playground under the sky: grass, a sandpit, a slide on a tower,
     a climbing frame, swings, trees and hedges, walls with graffiti. */
  BUILD.park = function () {
    const W = 34, D = 28, H = 3.2;
    const m = Builder('park', W, D, { sky: true, skyTop: '#5FA8E8', skyLow: '#CFE9F7' });
    floor(m, 0, 0, W, D, 'grass');
    m.box(3, 0, 3, 12, 0.03, 11, 'sand');
    m.box(2.8, 0, 2.8, 12.2, 0.25, 3.0, 'wood'); m.box(2.8, 0, 11, 12.2, 0.25, 11.2, 'wood');
    m.box(2.8, 0, 3, 3, 0.25, 11, 'wood'); m.box(12, 0, 3, 12.2, 0.25, 11, 'wood');
    m.box(16, 0, 3, 28, 0.03, 12, 'rubber');
    m.box(0.5, 0, 13.5, W - 0.5, 0.02, 15.5, 'path');
    shell(m, W, D, H, 'brick', { n: 'graffiti', s: 'graffiti' });
    // The slide: a tower, a ladder up it, a slide down it in steps.
    m.box(18, 0, 4, 20.4, 2.0, 6.4, 'yellow', { py: 'wood' });
    m.box(18, 2.0, 4, 18.15, 4.0, 6.4, 'red'); m.box(20.25, 2.0, 4, 20.4, 4.0, 6.4, 'red');
    m.box(18, 4.0, 4, 20.4, 4.3, 6.4, 'red');
    stairsZ(m, 18.6, 19.8, 8.4, 6.4, 0, 2.0, 5, 'blue');
    stairsX(m, 4.6, 5.8, 25.4, 20.4, 0, 1.9, 8, 'red');
    // The climbing frame: bars.
    for (const x of [22.5, 24.5, 26.5]) for (const zz of [8, 10]) m.box(x - 0.06, 0, zz - 0.06, x + 0.06, 2.4, zz + 0.06, 'blue');
    for (const zz of [8, 10]) m.box(22.44, 2.34, zz - 0.06, 26.56, 2.46, zz + 0.06, 'blue');
    for (const x of [22.5, 24.5, 26.5]) m.box(x - 0.06, 2.34, 7.94, x + 0.06, 2.46, 10.06, 'blue');
    m.box(22.5, 1.2, 7.94, 26.5, 1.3, 8.06, 'yellow'); m.box(22.5, 1.2, 9.94, 26.5, 1.3, 10.06, 'yellow');
    // Swings.
    for (const x of [5, 11]) { m.box(x - 0.1, 0, 17.5, x + 0.1, 2.6, 17.7, 'red'); m.box(x - 0.1, 0, 20.3, x + 0.1, 2.6, 20.5, 'red'); m.box(x - 0.1, 2.4, 17.5, x + 0.1, 2.6, 20.5, 'red'); }
    m.box(4.9, 2.6, 18.9, 11.1, 2.8, 19.1, 'red');
    for (const x of [6.8, 9.2]) {
      m.box(x - 0.35, 0.5, 18.6, x + 0.35, 0.58, 19.4, 'black');
      m.box(x - 0.33, 0.58, 18.97, x - 0.3, 2.6, 19.03, 'steel');
      m.box(x + 0.3, 0.58, 18.97, x + 0.33, 2.6, 19.03, 'steel');
    }
    // Trees, hedges, benches, a picnic table and a shed.
    tree(m, 14, 5); tree(m, 31, 5, 1.1); tree(m, 3.5, 24.5, 1.15); tree(m, 16, 22); tree(m, 29, 20);
    m.box(0.5, 0, 16.2, 13, 1.1, 17.0, 'hedge');
    m.box(21, 0, 16.2, W - 0.5, 1.1, 17.0, 'hedge');
    m.box(13.5, 0, 25.2, 20, 1.3, 26.5, 'hedge');
    bench(m, 15, 12.4, 2.4, true, 'wood');
    bench(m, 22, 12.4, 2.4, true, 'wood');
    table(m, 22, 22, 25, 23.6, 0.78, 'wood', 'wood');
    bench(m, 23.5, 21.4, 3.0, true, 'wood'); bench(m, 23.5, 24.2, 3.0, true, 'wood');
    m.box(28, 0, 23, 32.5, 2.4, 26.5, 'wood', { nz: 'darkWood' });
    m.box(27.7, 2.4, 22.7, 32.8, 2.7, 26.8, 'red');
    m.box(29.5, 0, 22.95, 31, 2.0, 23.0, 'darkWood');
    m.box(0.8, 0, 12.4, 1.4, 1.0, 13.0, 'green');
    m.box(32.6, 0, 12.4, 33.2, 1.0, 13.0, 'green');
    m.hide = ring(17, 14.5, 6, 1.3);
    m.seek = [[30.5, 14.2], [31.8, 14.8]];
    lobby(m);
    return m;
  };

  /* A gallery: white walls and panels hung with paintings, plinths with
     sculptures, and a studio corner with splattered floor and easels. */
  BUILD.gallery = function () {
    const W = 32, D = 26, H = 5;
    const m = Builder('gallery', W, D, {});
    floor(m, 0, 0, W, D, 'parquet');
    m.box(20, 0, 15, 31.5, 0.015, 25.5, 'splat');
    shell(m, W, D, H, 'gallery');
    m.box(0, H, 0, W, H + 0.4, D, 'white');
    m.box(0.5, 0, 0.5, W - 0.5, 0.15, 0.55, 'dark');
    // Paintings round the outer walls.
    pic(m, 'pz', 0.5, 2.5, 5.5, 1.3, 3.6, 'paintGrid');
    pic(m, 'pz', 0.5, 8.0, 12.0, 1.4, 3.4, 'paintSunset');
    pic(m, 'pz', 0.5, 15.0, 18.0, 1.3, 3.8, 'paintRings');
    pic(m, 'pz', 0.5, 21.0, 25.0, 1.4, 3.4, 'paintWaves');
    pic(m, 'px', 0.5, 4.0, 7.0, 1.3, 3.6, 'paintDots');
    pic(m, 'px', 0.5, 10.0, 13.5, 1.4, 3.4, 'paintTree');
    pic(m, 'px', 0.5, 17.0, 20.0, 1.3, 3.6, 'paintGrid');
    pic(m, 'nx', W - 0.5, 3.0, 7.0, 1.4, 3.4, 'paintWaves');
    pic(m, 'nx', W - 0.5, 9.0, 12.0, 1.3, 3.6, 'paintRings');
    // Free-standing panels with a painting each side.
    const panel = (x, z0, z1, a, b) => {
      m.box(x - 0.15, 0, z0, x + 0.15, 3.4, z1, 'gallery');
      pic(m, 'px', x + 0.15, z0 + 0.6, z1 - 0.6, 1.2, 2.9, a);
      pic(m, 'nx', x - 0.15, z0 + 0.6, z1 - 0.6, 1.2, 2.9, b);
    };
    panel(9, 5, 10, 'paintSunset', 'paintDots');
    panel(16, 5, 10, 'paintTree', 'paintGrid');
    panel(23, 5, 10, 'paintRings', 'paintWaves');
    const wall2 = (z, x0, x1, a) => { m.box(x0, 0, z - 0.15, x1, 3.4, z + 0.15, 'gallery'); pic(m, 'pz', z + 0.15, x0 + 0.6, x1 - 0.6, 1.2, 2.9, a); pic(m, 'nz', z - 0.15, x0 + 0.6, x1 - 0.6, 1.2, 2.9, 'paintDots'); };
    wall2(14, 3, 9, 'paintWaves');
    // Plinths and what stands on them.
    const plinth = (x, z, c1, c2) => {
      m.box(x - 0.45, 0, z - 0.45, x + 0.45, 1.0, z + 0.45, 'plinth');
      m.box(x - 0.3, 1.0, z - 0.3, x + 0.3, 1.45, z + 0.3, c1);
      m.box(x - 0.18, 1.45, z - 0.18, x + 0.18, 1.9, z + 0.18, c2);
    };
    plinth(5, 18, 'red', 'yellow'); plinth(9, 22, 'blue', 'white'); plinth(13, 18, 'black', 'pink'); plinth(12.5, 12.5, 'teal', 'orange');
    ropes(m, 3.5, 7, 16.6, true, 1.75);
    bench(m, 16, 13, 3.0, true, 'dark', 'steel');
    bench(m, 16, 20, 3.0, true, 'dark', 'steel');
    // The studio: easels, tins, a trestle table, a big mural.
    pic(m, 'nz', D - 0.5, 20.5, 31.0, 0.6, 4.2, 'graffiti', 'darkWood');
    const easel = (x, z, canvas) => {
      m.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.0, z + 0.05, 'wood');
      m.box(x - 0.55, 0, z + 0.3, x - 0.45, 1.8, z + 0.4, 'wood');
      m.box(x + 0.45, 0, z + 0.3, x + 0.55, 1.8, z + 0.4, 'wood');
      m.box(x - 0.6, 0.8, z + 0.4, x + 0.6, 0.86, z + 0.55, 'wood');
      m.box(x - 0.55, 0.86, z + 0.4, x + 0.55, 1.9, z + 0.46, 'white', { pz: canvas });
    };
    easel(22.5, 17, 'paintSunset'); easel(26, 17.5, 'paintDots'); easel(29.5, 17, 'paintTree');
    table(m, 22, 21.5, 26, 22.8, 0.8, 'splat', 'wood');
    bucket(m, 27.5, 22.2, 'blue'); bucket(m, 28.5, 22.8, 'yellow'); bucket(m, 30.5, 21.8, 'red');
    m.box(29.4, 0, 20.2, 30.2, 0.9, 21.0, 'pink');
    plant(m, 1.3, 24.7); plant(m, 1.3, 1.3);
    m.hide = ring(16, 16.5, 6, 1.2);
    m.seek = [[28.5, 2.2], [29.8, 2.2]];
    lobby(m);
    return m;
  };

  const KEYS = ['subway', 'cinema', 'school', 'market', 'park', 'gallery'];
  const cache = Object.create(null);

  PV.HideMaps = {
    KEYS: KEYS,
    get(key) {
      const k = KEYS.indexOf(key) >= 0 ? key : KEYS[0];
      if (!cache[k]) cache[k] = BUILD[k]();
      return cache[k];
    }
  };

})(window.PV);
