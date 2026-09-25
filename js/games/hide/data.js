/* 变色躲猫猫 / Blend In — the catalogue.

   Everything the other files look up: what every surface in every map is
   painted with, the one light they are all lit by, the poses, the water
   guns, the names, the clock and the rewards.

   SURFACES ARE FUNCTIONS, NOT PICTURES. A material is a pure function of
   (u, v) that returns a colour, sampled once onto a small grid of texels.
   The scene uploads that grid as the texture you see; the engine reads the
   very same grid when a bot paints itself to match a wall, when a bot seeker
   judges whether the thing by the lockers is a locker, and when the colour
   picker's "Pick" is pointed at the floor. One table, three readers, so what
   the bots see can never drift from what you see.

   THE LIGHT is one function too, `shade(normal)`: a sky and a sun from the
   upper right, no shadows. The world's faces and a hider's body are lit by
   it the same way, so a patch of body facing the same way as the wall behind
   it and painted the wall's colour comes out the wall's colour on screen. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const HZ = 60;

  /* ------------------------------------------------------------ colour */

  function hex(h) {
    const v = parseInt(String(h).slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mulC = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const frac = x => x - Math.floor(x);

  /** A hash of two integers and a salt, 0 to 1. */
  function h2(i, j, s) {
    let x = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul((s | 0) + 1013, 2246822519);
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  /** Smooth value noise over a grid of cells `n` to the unit, wrapping. */
  function noise(u, v, n, s) {
    const x = frac(u) * n, y = frac(v) * n;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = k => ((k % n) + n) % n;
    const a = h2(w(i), w(j), s), b = h2(w(i + 1), w(j), s), c = h2(w(i), w(j + 1), s), d = h2(w(i + 1), w(j + 1), s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /* The one light. The sun comes from the upper right and a little in
     front; a face turned from it still gets most of the sky. */
  const SUN = (function () { const v = [0.45, 0.8, 0.38], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  function shade(nx, ny, nz) {
    const d = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
    return 0.7 + 0.22 * (d > 0 ? d : 0) + 0.08 * ny;
  }

  /* ---------------------------------------------------------- patterns */

  /** A grid of tiles `nu` by `nv` to the texture, `g` of grout. */
  function tiles(c, grout, nu, nv, g, vary) {
    const C = hex(c), G = hex(grout);
    return (u, v) => {
      const x = u * nu, y = v * nv, fx = frac(x), fy = frac(y);
      if (fx < g || fy < g) return G;
      return vary ? mulC(C, 1 - vary + vary * 2 * h2(Math.floor(x), Math.floor(y), 7)) : C;
    };
  }
  function checker(a, b, n) {
    const A = hex(a), B = hex(b);
    return (u, v) => ((Math.floor(u * n) + Math.floor(v * n)) & 1 ? B : A);
  }
  function speckle(c, amt, n, s) {
    const C = hex(c);
    return (u, v) => mulC(C, 1 - amt + amt * (0.6 * noise(u, v, n, s) + 0.4 * h2(Math.floor(u * 64), Math.floor(v * 64), s + 3)) * 2);
  }
  function bricks(c, mortar, rows, cols, vary) {
    const C = hex(c), M = hex(mortar);
    return (u, v) => {
      const y = v * rows, row = Math.floor(y);
      const x = u * cols + (row & 1 ? 0.5 : 0), col = Math.floor(x);
      if (frac(y) < 0.1 || frac(x) < 0.05) return M;
      return mulC(C, 1 - vary + vary * 2 * h2(((col % cols) + cols) % cols, row, 11));
    };
  }
  function planks(a, b, n, joints) {
    const A = hex(a), B = hex(b);
    return (u, v) => {
      const y = v * n, row = Math.floor(y);
      const x = u * joints + h2(row, 0, 5) * joints, col = Math.floor(x);
      if (frac(y) < 0.06 || frac(x) < 0.012) return mulC(A, 0.62);
      const k = h2(col, row, 9);
      const grain = 0.94 + 0.06 * Math.sin((frac(y) * 3 + noise(u, v, 8, row) * 2) * Math.PI);
      return mulC(mixC(A, B, k), grain);
    };
  }
  function stripes(cols, n, vertical) {
    const C = cols.map(hex);
    return (u, v) => C[Math.floor((vertical ? u : v) * n) % C.length];
  }
  function carpet() {
    const R = hex('#8E1B28'), R2 = hex('#7A1522'), GOLD = hex('#D2A64E'), NAVY = hex('#2B2C57');
    return (u, v) => {
      // A diamond lattice two to the texture, a navy diamond in each.
      const x = frac(u * 2) - 0.5, y = frac(v * 2) - 0.5;
      const d = Math.abs(x) + Math.abs(y);
      if (Math.abs(d - 0.5) < 0.035) return GOLD;
      if (d < 0.14) return GOLD;
      if (d < 0.26) return NAVY;
      const x2 = frac(u * 2 + 0.5) - 0.5, y2 = frac(v * 2 + 0.5) - 0.5;
      if (Math.abs(x2) + Math.abs(y2) < 0.06) return GOLD;
      return h2(Math.floor(u * 64), Math.floor(v * 64), 4) < 0.1 ? R2 : R;
    };
  }
  function panels(c, frame, n) {
    const C = hex(c), F = hex(frame), E = mulC(hex(c), 0.8);
    return (u, v) => {
      const x = frac(u * n), y = v;
      if (y > 0.9 || y < 0.06) return F;
      if (x < 0.05 || x > 0.95) return F;
      if (x < 0.1 || x > 0.9 || y < 0.14 || y > 0.84) return E;
      return C;
    };
  }
  function products(salt) {
    const P = ['#E84B3C', '#F2C230', '#3C8DE0', '#35A86B', '#F28C2E', '#9B59D0', '#F4F1EA', '#E9669A', '#2C3E66', '#8BC34A', '#FFFFFF', '#C0392B'].map(hex);
    const SHELF = hex('#D9DDE2'), SH = hex('#A5ADB6');
    return (u, v) => {
      // Four shelves to the texture; each a row of packets of their own width.
      const y = v * 4, row = Math.floor(y), fy = frac(y);
      if (fy < 0.1) return fy < 0.04 ? SH : SHELF;
      let x = u * 12, k = 0, start = 0;
      // Packets 0.6 to 1.4 units wide, the same row always cut the same way.
      for (let i = 0; i < 20; i++) {
        const w = 0.6 + h2(i, row, salt) * 0.8;
        if (x < start + w || i === 19) { k = i; break; }
        start += w;
      }
      const top = 0.55 + h2(k, row, salt + 1) * 0.35;
      if (fy > top) return mulC(SHELF, 0.55);
      const col = P[Math.floor(h2(k, row, salt + 2) * P.length)];
      const fx = x - start;
      if (fx < 0.05) return mulC(col, 0.7);
      if (fy > top - 0.1 && fy < top - 0.06) return mulC(col, 0.8);
      const band = h2(k, row, salt + 3);
      if (band > 0.5 && fy > 0.35 && fy < 0.45) return [245, 245, 240];
      return col;
    };
  }
  function books(salt) {
    const P = ['#B83B3B', '#2E5E9E', '#E0A43A', '#3E8E5E', '#7A4FA0', '#D96C3B', '#2F3B4C', '#C9B28A', '#8E2F52', '#4AA3B5'].map(hex);
    const WOOD = hex('#7A5232');
    return (u, v) => {
      const y = v * 3, row = Math.floor(y), fy = frac(y);
      if (fy < 0.1) return WOOD;
      let x = u * 30, k = 0, start = 0;
      for (let i = 0; i < 60; i++) {
        const w = 0.6 + h2(i, row, salt) * 0.7;
        if (x < start + w || i === 59) { k = i; break; }
        start += w;
      }
      const top = 0.62 + h2(k, row, salt + 1) * 0.3;
      if (fy > top) return mulC(WOOD, 0.55);
      const col = P[Math.floor(h2(k, row, salt + 2) * P.length)];
      return fy > top - 0.12 && fy < top - 0.08 ? [230, 214, 160] : col;
    };
  }
  function blobs(base, cols, n, salt) {
    const B = hex(base), C = cols.map(hex);
    return (u, v) => {
      const a = noise(u, v, n, salt), b = noise(u, v, n * 2, salt + 1);
      const m = a * 0.7 + b * 0.3;
      if (m > 0.64) return C[Math.floor(h2(Math.floor(u * n), Math.floor(v * n), salt + 2) * C.length)];
      return mulC(B, 0.94 + 0.12 * noise(u, v, 24, salt + 5));
    };
  }

  /* --------------------------------------------------------- pictures */

  /* A picture covers one face of a box, (u, v) = (0, 0) at its lower left
     as you look at it. */
  const P = {};
  P.wheel = (u, v) => {
    const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y) * 2;
    if (r > 1) return hex('#D9B48A');
    if (r > 0.94) return [240, 238, 232];
    if (r < 0.34) return [214, 214, 208];
    if (r < 0.46) return [238, 236, 230];
    const COLS = ['#4DB6E8', '#8E63D6', '#E4587A', '#EF8A34', '#F2C94C', '#4CC38A'].map(hex);
    const a = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    return COLS[Math.floor(a * 6)];
  };
  function poster(bg, fn) { const B = hex(bg); return (u, v) => { if (u < 0.05 || u > 0.95 || v < 0.04 || v > 0.96) return [245, 244, 238]; return fn(u, v) || B; }; }
  P.posterSun = poster('#F28C38', (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.55);
    if (v < 0.3) return v < 0.18 ? hex('#2B2250') : hex('#5B3A7A');
    if (r < 0.2) return hex('#FFE27A');
    if (Math.floor(v * 14) % 2 && v < 0.5) return hex('#E8663A');
    return null;
  });
  P.posterWave = poster('#1E6FB8', (u, v) => {
    const w = 0.45 + 0.08 * Math.sin(u * 12);
    if (v < w) return v < w - 0.1 ? hex('#0F3F74') : hex('#FFFFFF');
    if (Math.hypot(u - 0.72, v - 0.78) < 0.1) return hex('#FFD23F');
    return null;
  });
  P.posterRocket = poster('#23263A', (u, v) => {
    const x = u - 0.5;
    if (Math.abs(x) < 0.09 && v > 0.3 && v < 0.75) return hex('#E8E4DA');
    if (v >= 0.75 && v < 0.85 && Math.abs(x) < 0.09 * (0.85 - v) / 0.1) return hex('#E2453A');
    if (v > 0.3 && v < 0.42 && Math.abs(x) < 0.16 && Math.abs(x) > 0.09) return hex('#E2453A');
    if (v < 0.3 && v > 0.12 && Math.abs(x) < 0.07 * (v - 0.12) / 0.18 + 0.02) return hex('#F5B82E');
    if (h2(Math.floor(u * 40), Math.floor(v * 60), 3) > 0.97) return [255, 255, 255];
    return null;
  });
  P.posterFace = poster('#F5D547', (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.55);
    if (r < 0.3 && r > 0.26) return hex('#2A2A2A');
    if (Math.hypot(u - 0.4, v - 0.62) < 0.04 || Math.hypot(u - 0.6, v - 0.62) < 0.04) return hex('#2A2A2A');
    if (Math.abs(r - 0.16) < 0.025 && v < 0.52) return hex('#2A2A2A');
    if (v < 0.16) return hex('#E2453A');
    return null;
  });
  P.posterMount = poster('#9FD4EE', (u, v) => {
    const m1 = 0.3 + 0.35 * (1 - Math.abs(u - 0.35) * 2.6), m2 = 0.25 + 0.3 * (1 - Math.abs(u - 0.72) * 3);
    if (v < 0.2) return hex('#4E9A4E');
    if (v < m1) return v > m1 - 0.08 ? [250, 250, 250] : hex('#6E7C91');
    if (v < m2) return hex('#58667C');
    if (Math.hypot(u - 0.78, v - 0.8) < 0.07) return hex('#FFF2A8');
    return null;
  });
  P.paintGrid = (u, v) => {
    // Lines and blocks of primary colour on white.
    const lx = [0.3, 0.72], ly = [0.35, 0.8];
    for (const l of lx) if (Math.abs(u - l) < 0.02) return [20, 20, 24];
    for (const l of ly) if (Math.abs(v - l) < 0.02) return [20, 20, 24];
    if (u < 0.3 && v > 0.8) return hex('#D8322E');
    if (u > 0.72 && v < 0.35) return hex('#2D4FA3');
    if (u > 0.3 && u < 0.72 && v > 0.8) return hex('#F2C230');
    return [244, 242, 236];
  };
  P.paintRings = (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const C = ['#2F4E9E', '#F2A93B', '#D84A5E', '#3FA77A', '#F4EEDC', '#6A3E8E'].map(hex);
    return C[Math.min(C.length - 1, Math.floor(r * 5))];
  };
  P.paintWaves = (u, v) => {
    const C = ['#0E3A5C', '#1F6F9E', '#5DB3D8', '#BFE6F2', '#F4F0E4'].map(hex);
    const k = v * 5 + 0.35 * Math.sin(u * 9 + v * 3);
    return C[((Math.floor(k) % 5) + 5) % 5];
  };
  P.paintDots = (u, v) => {
    const x = frac(u * 6) - 0.5, y = frac(v * 6) - 0.5;
    const i = Math.floor(u * 6), j = Math.floor(v * 6);
    const C = ['#E84B3C', '#F2C230', '#3C8DE0', '#35A86B', '#9B59D0'].map(hex);
    if (Math.hypot(x, y) < 0.32) return C[Math.floor(h2(i, j, 21) * C.length)];
    return hex('#F7EFE2');
  };
  P.paintSunset = (u, v) => {
    if (v < 0.35) return mixC(hex('#2C1E3D'), hex('#5A2E4E'), v / 0.35);
    if (Math.hypot(u - 0.5, v - 0.42) < 0.16) return hex('#FFD166');
    return mixC(hex('#F77F4F'), hex('#FDE3A7'), (v - 0.35) / 0.65);
  };
  P.paintTree = (u, v) => {
    if (v < 0.18) return hex('#6BAA4A');
    if (Math.abs(u - 0.5) < 0.04 && v < 0.55) return hex('#6B4226');
    if (Math.hypot(u - 0.5, v - 0.62) < 0.22) return h2(Math.floor(u * 20), Math.floor(v * 20), 2) < 0.5 ? hex('#3F8C3A') : hex('#4FA646');
    return hex('#BFE3F2');
  };
  P.exit = (u, v) => {
    // A green sign with a running figure and an arrow, in white.
    const W = [245, 250, 245], G = hex('#1E9E4A');
    if (u < 0.03 || u > 0.97 || v < 0.06 || v > 0.94) return [30, 30, 30];
    const x = u * 4, y = v;
    if (x > 2.2 && x < 3.6 && Math.abs(y - 0.5) < 0.08) return W;
    if (x > 3.2 && x < 3.75 && Math.abs(y - 0.5) < 0.28 * (3.75 - x) / 0.55) return W;
    if (Math.hypot(x - 1.1, y - 0.78) < 0.1) return W;
    if (Math.abs(x - 1.0 - (0.62 - y) * 0.6) < 0.09 && y > 0.3 && y < 0.66) return W;
    if (Math.abs(x - 0.7 - (y - 0.1) * 0.9) < 0.08 && y < 0.34) return W;
    if (Math.abs(x - 1.4 + (y - 0.1) * 0.9) < 0.08 && y < 0.34 && y > 0.1) return W;
    return G;
  };
  P.metroMap = (u, v) => {
    if (u < 0.03 || u > 0.97 || v < 0.05 || v > 0.95) return hex('#2C3440');
    const lines = [
      [hex('#E2453A'), y => Math.abs(v - 0.3 - 0.2 * Math.sin(u * 5)) < 0.025],
      [hex('#2F6BD6'), () => Math.abs(u - 0.4) < 0.018 && v > 0.12],
      [hex('#2E9E57'), () => Math.abs(v - 0.7) < 0.022 && u > 0.1],
      [hex('#F2A51E'), () => Math.abs(u - v * 0.8 - 0.05) < 0.02]
    ];
    for (const L of lines) if (L[1]()) return L[0];
    const sx = frac(u * 8), sy = frac(v * 6);
    if (Math.hypot(sx - 0.5, sy - 0.5) < 0.08 && h2(Math.floor(u * 8), Math.floor(v * 6), 8) > 0.6) return [40, 40, 40];
    return [246, 246, 240];
  };
  P.vending = (u, v) => {
    const R = hex('#D8332D');
    if (v > 0.84) return v > 0.88 && v < 0.96 && u > 0.1 && u < 0.9 ? hex('#FFFFFF') : R;
    if (u > 0.74) return v > 0.5 && v < 0.6 && u > 0.8 && u < 0.92 ? [30, 30, 30] : mulC(R, 0.85);
    if (u < 0.05 || v < 0.12) return mulC(R, 0.8);
    // A window of cans, five rows.
    const cx = frac((u - 0.05) / 0.69 * 5), cy = frac((v - 0.12) / 0.72 * 5);
    if (cy < 0.12) return [200, 205, 210];
    const i = Math.floor((u - 0.05) / 0.69 * 5), j = Math.floor((v - 0.12) / 0.72 * 5);
    const C = ['#2F6BD6', '#F2C230', '#35A86B', '#F28C2E', '#E9669A', '#EDEDED'].map(hex);
    if (cx > 0.2 && cx < 0.8 && cy < 0.85) return C[(i + j * 2) % C.length];
    return [40, 44, 52];
  };
  P.chalk = (u, v) => {
    const B = hex('#2F5A43');
    if (u < 0.025 || u > 0.975 || v < 0.05 || v > 0.95) return hex('#8A5A34');
    // Sums and a drawing, in chalk.
    const cw = [235, 240, 232];
    const row = Math.floor(v * 5), fy = frac(v * 5);
    if (u < 0.55 && row >= 1 && row <= 3 && Math.abs(fy - 0.5) < 0.06 && h2(Math.floor(u * 30), row, 4) > 0.3) return cw;
    if (Math.abs(Math.hypot(u - 0.78, v - 0.55) - 0.16) < 0.012) return cw;
    if (Math.abs(v - 0.55) < 0.008 && Math.abs(u - 0.78) < 0.16) return cw;
    return mulC(B, 0.95 + 0.1 * noise(u, v, 10, 3));
  };
  P.screen = (u, v) => {
    if (u < 0.02 || u > 0.98 || v < 0.04 || v > 0.96) return [24, 24, 28];
    const k = 0.9 + 0.1 * (1 - Math.abs(u - 0.5) * 2);
    return mulC([236, 236, 232], k);
  };
  P.window = (u, v) => {
    if (u < 0.05 || u > 0.95 || v < 0.06 || v > 0.94 || Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.5) < 0.03) return [242, 242, 238];
    const sky = mixC(hex('#CFEAF7'), hex('#6DB7E6'), v);
    const c = noise(u * 0.6, v * 0.4, 4, 12);
    return c > 0.62 ? mixC(sky, [255, 255, 255], Math.min(1, (c - 0.62) * 5)) : sky;
  };
  P.menu = (u, v) => {
    if (u < 0.03 || u > 0.97 || v < 0.05 || v > 0.95) return [20, 20, 20];
    const row = Math.floor(v * 6), fy = frac(v * 6), fx = frac(u * 2);
    const C = ['#F2C230', '#E8663A', '#4CC38A', '#4DB6E8', '#E4587A', '#FFFFFF'].map(hex);
    if (fy > 0.3 && fy < 0.7 && fx > 0.1 && fx < 0.1 + 0.6 * h2(row, Math.floor(u * 2), 5) + 0.2) return C[(row + Math.floor(u * 2)) % C.length];
    return hex('#1E2230');
  };
  P.clock = (u, v) => {
    const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y) * 2;
    if (r > 1) return hex('#EDEDEA');
    if (r > 0.88) return [40, 40, 44];
    const a = Math.atan2(x, y);
    if (Math.abs(x) < 0.02 && y > 0 && y < 0.32) return [30, 30, 30];
    if (Math.abs(y + x * 0.1) < 0.02 && x > 0 && x < 0.24) return [30, 30, 30];
    if (r > 0.72 && Math.abs(frac(a / (Math.PI * 2) * 12 + 0.5) - 0.5) < 0.05) return [30, 30, 30];
    return [250, 250, 246];
  };
  P.treeWall = (u, v) => {
    // Brick, with painted trees on it: the warm-up room's wall.
    const b = bricks('#B26448', '#D6A889', 10, 5, 0.06)(frac(u * 3), frac(v * 2));
    const trees = [[0.12, '#45AD8A', 0.15], [0.46, '#79B23A', 0.18], [0.8, '#7B3E91', 0.13], [0.97, '#E4587A', 0.07]];
    for (const tr of trees) {
      const x = u - tr[0];
      if (Math.abs(x) < 0.018 && v < 0.55) return hex(tr[1]);
      const n = noise(u * 2, v * 2, 6, Math.floor(tr[0] * 99));
      if (Math.hypot(x * 1.2, v - 0.68) < tr[2] * (0.8 + 0.4 * n)) return hex(tr[1]);
    }
    return b;
  };
  P.graffiti = (u, v) => {
    const b = bricks('#A9573F', '#C9A48C', 8, 4, 0.07)(frac(u * 2), frac(v * 2));
    const n = noise(u, v, 5, 31);
    if (n > 0.66) return hex('#F2C230');
    if (n > 0.6) return hex('#2B2B2B');
    const m = noise(u + 0.3, v, 4, 37);
    if (m > 0.68) return hex('#3CB7E6');
    if (m > 0.63) return hex('#FFFFFF');
    const k = noise(u, v + 0.2, 6, 41);
    if (k > 0.7) return hex('#E4587A');
    return b;
  };
  P.fridge = (u, v) => {
    if (u < 0.04 || u > 0.96 || v < 0.05 || v > 0.95) return [236, 240, 244];
    if (Math.abs(u - 0.5) < 0.02) return [200, 206, 212];
    // Bottles on four shelves behind the glass.
    const row = Math.floor(v * 4), fy = frac(v * 4), x = u * 10, i = Math.floor(x), fx = frac(x);
    if (fy < 0.06) return [196, 204, 212];
    const C = ['#E84B3C', '#35A86B', '#F2C230', '#3C8DE0', '#F28C2E', '#F4F4F4'].map(hex);
    const h = 0.55 + 0.3 * h2(i, row, 2);
    if (fx > 0.2 && fx < 0.8 && fy < h && !(fy > h - 0.12 && (fx < 0.35 || fx > 0.65))) return C[Math.floor(h2(i, row, 3) * C.length)];
    return [170, 204, 222];
  };
  P.lockerDoor = (u, v) => {
    const B = hex('#3A6FB5');
    if (u < 0.04 || u > 0.96 || v < 0.02 || v > 0.98) return mulC(B, 0.7);
    if (v > 0.78 && v < 0.9 && frac(v * 50) < 0.5 && u > 0.2 && u < 0.8) return mulC(B, 0.6);
    if (u > 0.78 && u < 0.86 && v > 0.45 && v < 0.6) return [200, 205, 212];
    return B;
  };
  P.sign = (bg, fg) => {
    const B = hex(bg), F = hex(fg);
    return (u, v) => (u < 0.04 || u > 0.96 || v < 0.1 || v > 0.9 ? mulC(B, 0.7) : (Math.abs(v - 0.5) < 0.14 && frac(u * 7) > 0.25 ? F : B));
  };

  /* ---------------------------------------------------------- materials */

  /* size: metres per repeat for a tiled surface. `pic` covers a whole face.
     res: texels a side. */
  const MATS = {
    // everywhere
    white: { size: 2, fn: speckle('#ECEBE6', 0.03, 6, 1) },
    grey: { size: 2, fn: speckle('#B7BAB8', 0.05, 8, 2) },
    dark: { size: 2, fn: speckle('#3B3F46', 0.05, 8, 3) },
    black: { size: 2, fn: speckle('#26282C', 0.04, 8, 4) },
    steel: { size: 1, fn: (u, v) => mulC(hex('#A3A9B0'), 0.95 + 0.08 * Math.sin(u * 40)) },
    concrete: { size: 3, fn: speckle('#A9ABA7', 0.08, 10, 5) },
    red: { size: 1, fn: speckle('#D8392F', 0.03, 6, 6) },
    orange: { size: 1, fn: speckle('#EF8A2B', 0.03, 6, 7) },
    yellow: { size: 1, fn: speckle('#F2C12E', 0.03, 6, 8) },
    green: { size: 1, fn: speckle('#3E9E54', 0.03, 6, 9) },
    blue: { size: 1, fn: speckle('#3F7FD6', 0.03, 6, 10) },
    purple: { size: 1, fn: speckle('#8A5CC7', 0.03, 6, 11) },
    pink: { size: 1, fn: speckle('#EE6FA0', 0.03, 6, 12) },
    teal: { size: 1, fn: speckle('#35B3A6', 0.03, 6, 13) },
    cream: { size: 2, fn: (u, v) => mulC(hex('#EFE5CE'), 0.97 + 0.04 * Math.sin(u * 60)) },
    wood: { size: 2, fn: planks('#B77A45', '#A8693A', 3, 1) },
    darkWood: { size: 2, fn: planks('#6A4328', '#5A381F', 3, 1) },
    lightWood: { size: 2, fn: planks('#DDBB86', '#CFAA73', 3, 1) },

    // subway
    tileW: { size: 1, fn: tiles('#ECECE6', '#C8CBC6', 4, 5, 0.05, 0.02) },
    tileG: { size: 1, fn: tiles('#2F8457', '#1F5E3C', 5, 2, 0.05, 0.04) },
    tileDark: { size: 1, fn: tiles('#3D4148', '#23262B', 4, 4, 0.05, 0.03) },
    checkFloor: { size: 2, fn: checker('#D6D7D2', '#5E636C', 2) },
    platEdge: { size: 1, fn: (u, v) => (Math.hypot(frac(u * 8) - 0.5, frac(v * 8) - 0.5) < 0.22 ? hex('#D9A91E') : hex('#F2C230')) },
    track: { size: 2, fn: speckle('#5A534B', 0.2, 16, 14) },
    train: { size: 2, fn: (u, v) => (frac(u * 2) < 0.02 ? hex('#8E949C') : mulC(hex('#C7CCD2'), 0.97 + 0.04 * Math.sin(v * 30))) },
    trainBlue: { size: 2, fn: speckle('#2F5FB3', 0.03, 4, 15) },
    glassDark: { size: 1, fn: (u, v) => mixC(hex('#26303B'), hex('#3B4A5A'), frac(u + v)) },

    // cinema
    carpet: { size: 1.2, fn: carpet() },
    wainscot: { size: 1.2, fn: panels('#7A1F2A', '#5A141C', 1) },
    brass: { size: 1, fn: (u, v) => mulC(hex('#C9A34E'), 0.9 + 0.15 * Math.sin(u * 20)) },
    velvet: { size: 1, fn: (u, v) => mulC(hex('#B3202E'), 0.9 + 0.12 * noise(u, v, 12, 16)) },
    popcorn: { size: 1, fn: stripes(['#E23B3B', '#F6F2EA'], 8, true) },
    frosted: { size: 1, fn: (u, v) => mulC(hex('#B9C6CF'), 0.96 + 0.06 * frac(u * 3)) },

    // classroom
    lockerRow: { size: 1, fn: (u, v) => P.lockerDoor(frac(u * 2), v) },
    bookshelf: { size: 2, fn: books(3) },
    bookshelf2: { size: 2, fn: books(8) },
    desk: { size: 1, fn: planks('#D6B27C', '#CDA66D', 4, 1) },
    chairBlue: { size: 1, fn: speckle('#3E7CC4', 0.03, 4, 17) },
    lino: { size: 2, fn: tiles('#D8D2BF', '#C2BBA6', 4, 4, 0.02, 0.05) },
    wallBlue: { size: 2, fn: speckle('#B9D3E8', 0.03, 6, 18) },
    corkboard: { size: 1, fn: (u, v) => {
      const n = h2(Math.floor(u * 48), Math.floor(v * 48), 19);
      const x = frac(u * 3), y = frac(v * 2), k = Math.floor(u * 3) + Math.floor(v * 2) * 3;
      const C = ['#F7E27A', '#9FD8F5', '#F5A3C0', '#B8E6A0', '#FFFFFF', '#F7C27A'].map(hex);
      if (x > 0.15 && x < 0.8 && y > 0.18 && y < 0.8) return C[k % C.length];
      return mulC(hex('#C49A64'), 0.9 + n * 0.2);
    } },

    // supermarket
    martFloor: { size: 1, fn: tiles('#EFEDE6', '#D3CFC6', 2, 2, 0.03, 0.02) },
    shelfA: { size: 2, fn: products(3) },
    shelfB: { size: 2, fn: products(17) },
    shelfC: { size: 2, fn: products(29) },
    shelfEnd: { size: 1, fn: speckle('#E1E4E8', 0.03, 4, 20) },
    fridgeRow: { size: 1.2, fn: (u, v) => P.fridge(frac(u), v) },
    counter: { size: 1, fn: (u, v) => (v > 0.85 ? hex('#3A3F48') : mulC(hex('#5C8DC9'), 0.95 + 0.05 * Math.sin(u * 30))) },
    oranges: { size: 0.5, fn: (u, v) => { const x = frac(u * 4) - 0.5, y = frac(v * 4) - 0.5; return Math.hypot(x, y) < 0.42 ? mulC(hex('#F28C1E'), 1.05 - Math.hypot(x + 0.15, y - 0.15)) : hex('#6B4A2A'); } },
    apples: { size: 0.5, fn: (u, v) => { const x = frac(u * 4) - 0.5, y = frac(v * 4) - 0.5; return Math.hypot(x, y) < 0.42 ? mulC(hex('#D8322E'), 1.05 - Math.hypot(x + 0.15, y - 0.15)) : hex('#6B4A2A'); } },
    limes: { size: 0.5, fn: (u, v) => { const x = frac(u * 4) - 0.5, y = frac(v * 4) - 0.5; return Math.hypot(x, y) < 0.42 ? mulC(hex('#7DBE3A'), 1.05 - Math.hypot(x + 0.15, y - 0.15)) : hex('#6B4A2A'); } },
    crate: { size: 1, fn: planks('#C9A36A', '#B98F58', 4, 0.5) },
    boxes: { size: 1, fn: (u, v) => (Math.abs(frac(u) - 0.5) < 0.06 ? hex('#D8C08A') : mulC(hex('#C4975C'), 0.95 + 0.08 * noise(u, v, 6, 21))) },

    // playground
    grass: { size: 2, fn: (u, v) => mulC(hex('#6DB24B'), 0.86 + 0.16 * noise(u, v, 16, 22) + 0.08 * h2(Math.floor(u * 64), Math.floor(v * 64), 23)) },
    sand: { size: 2, fn: speckle('#E6CF95', 0.08, 14, 24) },
    rubber: { size: 4, fn: (u, v) => { const C = ['#E0503C', '#3F7FD6', '#46A858', '#F2C12E'].map(hex); const i = Math.floor(u * 4), j = Math.floor(v * 4); if (frac(u * 4) < 0.02 || frac(v * 4) < 0.02) return [60, 60, 60]; return mulC(C[Math.floor(h2(i, j, 25) * 4)], 0.95 + 0.08 * h2(Math.floor(u * 64), Math.floor(v * 64), 26)); } },
    brick: { size: 1, fn: bricks('#B5553A', '#D8C8B0', 8, 4, 0.08) },
    hedge: { size: 1, fn: (u, v) => mulC(hex('#3F8A3A'), 0.8 + 0.35 * noise(u, v, 10, 27)) },
    leaves: { size: 1, fn: (u, v) => mulC(hex('#58A845'), 0.8 + 0.3 * noise(u, v, 8, 28)) },
    bark: { size: 1, fn: (u, v) => mulC(hex('#7A5231'), 0.85 + 0.2 * noise(u * 4, v, 6, 29)) },
    path: { size: 2, fn: tiles('#C9C2B4', '#A89F8E', 2, 3, 0.04, 0.05) },

    // gallery
    gallery: { size: 2, fn: speckle('#F3F1EC', 0.02, 6, 30) },
    parquet: { size: 1, fn: (u, v) => { const x = Math.floor(u * 4), y = Math.floor(v * 4), fx = frac(u * 4), fy = frac(v * 4); const along = (x + y) & 1 ? fx : fy; const C = hex('#B98A55'); if ((x + y) & 1 ? frac(fy * 3) < 0.05 : frac(fx * 3) < 0.05) return mulC(C, 0.75); return mulC(C, 0.92 + 0.1 * Math.sin(along * 18 + h2(x, y, 31) * 6)); } },
    splat: { size: 3, fn: blobs('#C8CACB', ['#E84B3C', '#F2C230', '#3C8DE0', '#35A86B', '#9B59D0', '#EE6FA0'], 7, 32) },
    plinth: { size: 1, fn: speckle('#F7F7F4', 0.02, 4, 33) },
    rope: { size: 1, fn: speckle('#9E1B2A', 0.08, 8, 34) },

    // the warm-up room
    lobbyFloor: { size: 2, fn: tiles('#D9B48A', '#C7A077', 2, 2, 0.02, 0.03) },
    lobbyBrick: { size: 2, fn: bricks('#B26448', '#D6A889', 10, 5, 0.06) },

    // pictures
    wheel: { pic: true, res: 128, fn: P.wheel },
    posterSun: { pic: true, fn: P.posterSun },
    posterWave: { pic: true, fn: P.posterWave },
    posterRocket: { pic: true, fn: P.posterRocket },
    posterFace: { pic: true, fn: P.posterFace },
    posterMount: { pic: true, fn: P.posterMount },
    paintGrid: { pic: true, fn: P.paintGrid },
    paintRings: { pic: true, fn: P.paintRings },
    paintWaves: { pic: true, fn: P.paintWaves },
    paintDots: { pic: true, fn: P.paintDots },
    paintSunset: { pic: true, fn: P.paintSunset },
    paintTree: { pic: true, fn: P.paintTree },
    exit: { pic: true, fn: P.exit },
    metroMap: { pic: true, fn: P.metroMap },
    vending: { pic: true, fn: P.vending },
    chalk: { pic: true, res: 128, fn: P.chalk },
    screen: { pic: true, fn: P.screen },
    window: { pic: true, fn: P.window },
    menu: { pic: true, fn: P.menu },
    clock: { pic: true, fn: P.clock },
    treeWall: { pic: true, res: 128, fn: P.treeWall },
    graffiti: { pic: true, res: 128, fn: P.graffiti },
    fridge: { pic: true, fn: P.fridge },
    signBlue: { pic: true, fn: P.sign('#2F5FB3', '#FFFFFF') },
    signRed: { pic: true, fn: P.sign('#B3202E', '#F6E7C0') },
    signGreen: { pic: true, fn: P.sign('#2F8457', '#FFFFFF') }
  };
  const MAT_KEYS = Object.keys(MATS);
  MAT_KEYS.forEach((k, i) => { MATS[k].id = i; MATS[k].key = k; if (!MATS[k].res) MATS[k].res = MATS[k].pic ? 64 : 64; });

  /* The texel grid of a material, built the first time anyone asks and
     kept: RGB bytes, row 0 at v = 0. */
  function texels(key) {
    const m = MATS[key] || MATS.white;
    if (m.px) return m.px;
    const n = m.res, px = new Uint8Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = m.fn((i + 0.5) / n, (j + 0.5) / n);
        const o = (j * n + i) * 3;
        px[o] = Math.max(0, Math.min(255, Math.round(c[0])));
        px[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
        px[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
      }
    }
    m.px = px;
    return px;
  }

  /** The colour of a material at (u, v), the texel it falls in. `out` is
      filled and returned, so a hot loop allocates nothing. */
  function sample(key, u, v, out) {
    const m = MATS[key] || MATS.white;
    const px = m.px || texels(key), n = m.res;
    let i = Math.floor((m.pic ? Math.min(0.9999, Math.max(0, u)) : frac(u)) * n);
    let j = Math.floor((m.pic ? Math.min(0.9999, Math.max(0, v)) : frac(v)) * n);
    const o = (j * n + i) * 3;
    const r = out || [0, 0, 0];
    r[0] = px[o]; r[1] = px[o + 1]; r[2] = px[o + 2];
    return r;
  }

  /* ------------------------------------------------------------ poses */

  /* Bones: 0 hips, 1 torso, 2 head, 3/4 left arm and forearm, 5/6 right,
     7/8 left thigh and shin, 9/10 right. Each is [pitch, yaw, roll] from
     the rest pose; pitch swings a hanging limb forward, a positive roll
     swings it toward the right (+x). `L` and `R` limbs are written once
     and mirrored: `arm` is the left arm and the right one is its mirror.
     `root` is [drop, pitch, roll] for the whole body: a pose that lies
     down turns the hips; `ground` puts the lowest point on the floor. */
  function pose(o) {
    const z = [0, 0, 0];
    const mir = a => (a ? [a[0], -a[1], -a[2]] : null);
    const b = [];
    b[0] = z; b[1] = o.torso || z; b[2] = o.head || z;
    b[3] = o.armL || o.arm || [0, 0, -0.1]; b[4] = o.foreL || o.fore || [0.15, 0, 0];
    b[5] = o.armR || mir(o.arm) || [0, 0, 0.1]; b[6] = o.foreR || mir(o.fore) || [0.15, 0, 0];
    b[7] = o.thighL || o.thigh || z; b[8] = o.shinL || o.shin || z;
    b[9] = o.thighR || mir(o.thigh) || z; b[10] = o.shinR || mir(o.shin) || z;
    return { id: o.id, bones: b, root: o.root || [0, 0, 0], price: o.price || 0, icon: o.icon, ground: o.ground !== false, low: !!o.low };
  }
  const POSES = [
    pose({ id: 'stand', icon: '🧍' }),
    pose({ id: 'crouch', icon: '🧎', torso: [0.35, 0, 0], head: [-0.2, 0, 0], arm: [0.7, 0, -0.1], fore: [0.9, 0, 0], thigh: [1.45, 0, -0.08], shin: [-1.95, 0, 0], low: true }),
    pose({ id: 'ball', icon: '⚪', torso: [0.95, 0, 0], head: [0.5, 0, 0], arm: [1.25, 0, -0.35], fore: [1.4, 0, 0], thigh: [2.35, 0, -0.1], shin: [-2.45, 0, 0], low: true }),
    pose({ id: 'lie', icon: '🛌', root: [0, 1.57, 0], arm: [0, 0, -0.08], fore: [0, 0, 0], low: true }),
    pose({ id: 'prone', icon: '🏊', root: [0, -1.57, 0], head: [-0.4, 0, 0], arm: [0, 0, -0.08], fore: [0, 0, 0], low: true }),
    pose({ id: 'sit', icon: '🪑', torso: [-0.05, 0, 0], arm: [-0.25, 0, -0.2], fore: [0.2, 0, 0], thigh: [1.57, 0, -0.05], shin: [0, 0, 0], low: true }),
    pose({ id: 'tpose', icon: '✝️', arm: [0, 0, -1.57], fore: [0, 0, 0], price: 60 }),
    pose({ id: 'up', icon: '🙌', arm: [0, 0, -2.95], fore: [0, 0, 0], price: 60 }),
    pose({ id: 'side', icon: '💤', root: [0, 0, 1.57], arm: [0.3, 0, -0.1], thigh: [0.5, 0, 0], shin: [-0.8, 0, 0], low: true, price: 80 }),
    pose({ id: 'star', icon: '⭐', arm: [0, 0, -2.2], fore: [0, 0, 0], thigh: [0, 0, -0.45], price: 120 }),
    pose({ id: 'kneel', icon: '🙇', torso: [0.1, 0, 0], thighL: [1.57, 0, -0.05], shinL: [-1.57, 0, 0], thighR: [0, 0, 0.05], shinR: [-1.57, 0, 0], arm: [0.2, 0, -0.1], price: 120, low: true }),
    pose({ id: 'dab', icon: '🕺', torso: [0.1, 0.2, 0], head: [0.5, -0.4, 0], armL: [-0.2, 0, -2.3], foreL: [0, 0, 0], armR: [1.2, 0.3, -0.4], foreR: [1.8, 0, 0], price: 200 }),
    pose({ id: 'tree', icon: '🧘', arm: [0, 0, -2.95], fore: [0, 0, 0], thighR: [0.2, 0, 1.2], shinR: [-2.2, 0, 0], price: 200 }),
    pose({ id: 'hero', icon: '🦸', armL: [0, 0, -2.9], foreL: [0, 0, 0], armR: [0.3, 0, 0.5], foreR: [1.9, 0, 0], thigh: [0, 0, -0.18], price: 250 })
  ];
  const POSE = Object.create(null);
  POSES.forEach((p, i) => { p.idx = i; POSE[p.id] = p; });
  const FREE_POSES = POSES.filter(p => !p.price).map(p => p.id);

  /* ------------------------------------------------------------ blasters */

  const BLASTERS = [
    { id: 'classic', price: 0, body: '#27B23A', tank: '#E2701F', nozzle: '#D8332D', grip: '#2B5FD6' },
    { id: 'ocean', price: 100, body: '#2F7FE0', tank: '#F4F4F4', nozzle: '#1B3F8A', grip: '#FFD23F' },
    { id: 'lava', price: 150, body: '#2B2B2E', tank: '#F2542D', nozzle: '#FFB020', grip: '#8E1B1B' },
    { id: 'bubble', price: 150, body: '#F07AB0', tank: '#8E63D6', nozzle: '#FFFFFF', grip: '#4CC3D9' },
    { id: 'lemon', price: 200, body: '#F2D23A', tank: '#7FCF3A', nozzle: '#2F2F2F', grip: '#F2F2F2' },
    { id: 'neon', price: 250, body: '#1B1B24', tank: '#39FF9E', nozzle: '#FF3CAC', grip: '#3CC8FF' },
    { id: 'galaxy', price: 400, body: '#2A1B4E', tank: '#7B5CFF', nozzle: '#FFD86B', grip: '#E0E0FF' },
    { id: 'gold', price: 500, body: '#D4A93A', tank: '#F7E7A1', nozzle: '#8C6A18', grip: '#FFF4C8' }
  ];
  const BLASTER = Object.create(null);
  BLASTERS.forEach(b => { BLASTER[b.id] = b; });

  /* -------------------------------------------------------------- rules */

  const RULES = {
    players: 8, seekers: 2,
    intro: 3.5 * HZ, hide: 75 * HZ, hunt: 120 * HZ, result: 4.5 * HZ,
    // Water: droplets a second while the trigger is held, the tank, how
    // quickly it fills again, and how wet a hider gets before they are found.
    rate: 14, tank: 70, refill: 32, refillDelay: 0.45 * HZ,
    soakPerDrop: 0.12, soakDecay: 0.2, soakHold: 1.2 * HZ
  };

  const NAMES = ['Pip', 'Mochi', 'Kiko', 'Nova', 'Ziggy', 'Bea', 'Taro', 'Lulu', 'Remy', 'Juno', 'Otto', 'Suki',
    'Milo', 'Yuki', 'Coco', 'Rex', 'Ivy', 'Poppy', 'Nico', 'Wren', 'Bao', 'Fifi', 'Gus', 'Lemon', 'Pixel', 'Doodle',
    'Sprout', 'Bubbles', 'Noodle', 'Peach', 'Olive', 'Ruby'];

  /* Levels: each needs a little more than the one before. */
  function levelOf(xp) {
    let lvl = 1, need = 80, left = Math.max(0, xp | 0);
    while (left >= need && lvl < 999) { left -= need; lvl++; need = 80 + 40 * (lvl - 1); }
    return { level: lvl, into: left, need: need, pct: left / need };
  }

  PV.HideData = {
    HZ: HZ, RULES: RULES, NAMES: NAMES,
    hex: hex, mixC: mixC, h2: h2, noise: noise,
    SUN: SUN, shade: shade,
    MATS: MATS, MAT_KEYS: MAT_KEYS, texels: texels, sample: sample,
    POSES: POSES, POSE: POSE, FREE_POSES: FREE_POSES,
    BLASTERS: BLASTERS, BLASTER: BLASTER,
    levelOf: levelOf,
    WHITE: [242, 242, 238], SEEKER: [30, 31, 36]
  };

})(window.PV);
