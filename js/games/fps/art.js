/* 突击小队 / Strike Squad — the art.

   Everything is made here, from nothing, when it is first needed: the
   textures are painted into small canvases a pixel at a time from tiling
   noise, and every mesh is built from boxes, cylinders, balls and cones. No
   image or model file is fetched — the CSP would not allow one anyway, and
   a game that ships its own art as code cannot lose a file.

   - TEXTURES: twenty-odd surfaces, 256 pixels square, every one of them
     tiling. A texture covers two metres unless `scale` says otherwise.
   - THE SOLDIER: a skinned model with ten bones (hips, chest, head, two
     arms, two thighs, two shins, the gun hand). What a soldier wears —
     cap or helmet, shirt or plate carrier, bare hands or gloves, boots —
     changes the model; the team colour is a uniform, so one model serves
     both sides.
   - THE GUNS: data.js's part lists, with the optic, muzzle device, grip
     and magazine the owner fitted, and the charm on its cord.
   - THE ICON: the same part lists painted side on into any 2D canvas, for
     the armory, the HUD and the kill feed, so a card cannot drift from the
     gun it sells. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const G = PV.FpsGL, M4 = G.M4, rgb = G.rgb;
  const D = PV.FpsData;

  /* ----------------------------------------------------------- noise */

  function hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s | 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** Value noise that repeats every `per` cells, so the texture tiles. */
  function pnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = k => ((k % per) + per) % per;
    const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
    const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /** Fractal tiling noise, 0..1, over a square of `n` pixels. */
  function fbm(px, py, n, base, oct, seed) {
    let s = 0, amp = 0.5, tot = 0, per = base;
    for (let o = 0; o < oct; o++) {
      s += amp * pnoise(px / n * per, py / n * per, per, seed + o * 17);
      tot += amp; amp *= 0.5; per *= 2;
    }
    return s / tot;
  }

  /* -------------------------------------------------------- textures */

  const N = 256;
  function paint(fn) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N), d = img.data;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const o = (py * N + px) * 4;
        const col = fn(px, py);
        d[o] = Math.max(0, Math.min(255, col[0] * 255));
        d[o + 1] = Math.max(0, Math.min(255, col[1] * 255));
        d[o + 2] = Math.max(0, Math.min(255, col[2] * 255));
        d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* Each painter gets pixel coordinates and returns [r, g, b] in 0..1. */
  const PAINT = {
    asphalt: () => {
      const b = rgb('#50545A');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 4, 1), s = hash2(x, y, 3) > 0.92 ? 1.12 : 1;
        return shade(b, (0.82 + n * 0.3) * s);
      };
    },
    slab: () => {
      const b = rgb('#A7A9A6');
      return (x, y) => {
        const n = fbm(x, y, N, 6, 4, 2);
        const seam = (x % 128 < 2 || y % 128 < 2) ? 0.72 : 1;
        const tile = 0.94 + hash2(Math.floor(x / 128), Math.floor(y / 128), 9) * 0.1;
        return shade(b, (0.84 + n * 0.25) * seam * tile);
      };
    },
    concrete: () => {
      const b = rgb('#B9BAB5');
      return (x, y) => {
        const n = fbm(x, y, N, 4, 5, 3), stain = fbm(x, y, N, 2, 3, 30);
        const form = (y % 64 < 2) ? 0.86 : 1;
        return shade(b, (0.8 + n * 0.3 - Math.max(0, stain - 0.6) * 0.4) * form);
      };
    },
    brick: () => {
      const b = rgb('#A2513A'), m = rgb('#CFC7BA');
      return (x, y) => {
        const row = Math.floor(y / 16), off = (row % 2) * 16;
        const bx = Math.floor((x + off) / 32);
        const mortar = y % 16 < 2 || (x + off) % 32 < 2;
        const n = fbm(x, y, N, 16, 3, 4);
        if (mortar) return shade(m, 0.85 + n * 0.2);
        const tone = 0.8 + hash2(bx, row, 5) * 0.35;
        return shade(b, tone * (0.88 + n * 0.22));
      };
    },
    plaster: () => {
      const b = rgb('#E9E1D2');
      return (x, y) => {
        const n = fbm(x, y, N, 4, 5, 6), bl = fbm(x, y, N, 2, 2, 60);
        return shade(b, 0.86 + n * 0.16 - Math.max(0, bl - 0.62) * 0.3);
      };
    },
    sandstone: () => {
      const b = rgb('#D2B384');
      return (x, y) => {
        const row = Math.floor(y / 32), off = (row % 2) * 40;
        const joint = y % 32 < 2 || (x + off) % 80 < 2;
        const n = fbm(x, y, N, 8, 4, 7), layer = 0.95 + 0.08 * Math.sin(y * 0.4 + n * 6);
        return shade(b, (joint ? 0.78 : 1) * (0.86 + n * 0.2) * layer);
      };
    },
    stone: () => {
      const b = rgb('#9C9A94');
      return (x, y) => {
        const row = Math.floor(y / 42), off = (row * 37) % 64;
        const joint = y % 42 < 3 || (x + off) % 64 < 3;
        const n = fbm(x, y, N, 8, 4, 8);
        const tone = 0.85 + hash2(Math.floor((x + off) / 64), row, 11) * 0.25;
        return shade(b, (joint ? 0.62 : tone) * (0.85 + n * 0.25));
      };
    },
    moss: () => {
      const st = PAINT.stone(), g = rgb('#5D8A3C');
      return (x, y) => {
        const c = st(x, y), m = fbm(x, y, N, 4, 4, 12);
        return lerp3(c, shade(g, 0.7 + m * 0.5), Math.max(0, Math.min(1, (m - 0.5) * 3)));
      };
    },
    planks: () => {
      const b = rgb('#9A7048');
      return (x, y) => {
        const p = Math.floor(x / 32), seam = x % 32 < 2;
        const grain = fbm(x * 0.25, y * 2, N, 4, 3, 13 + p);
        const tone = 0.8 + hash2(p, 1, 14) * 0.3;
        return shade(b, seam ? 0.55 : tone * (0.8 + grain * 0.35));
      };
    },
    corrugated: () => (x, y) => {
      const r = 0.78 + 0.18 * Math.sin(x / N * Math.PI * 2 * 16);
      const n = fbm(x, y, N, 8, 3, 15), rust = fbm(x, y, N, 4, 3, 16);
      return [r * (0.9 + n * 0.15) + Math.max(0, rust - 0.7) * 0.4, r * (0.9 + n * 0.15), r * (0.9 + n * 0.15) - Math.max(0, rust - 0.7) * 0.3];
    },
    metal: () => {
      const b = rgb('#8E959C');
      return (x, y) => {
        const n = fbm(x, y * 0.1, N, 16, 3, 17);
        const panel = (x % 128 < 2 || y % 128 < 2) ? 0.7 : 1;
        const rivet = ((x % 128 - 8) ** 2 + (y % 128 - 8) ** 2) < 9 ? 1.2 : 1;
        return shade(b, (0.82 + n * 0.25) * panel * rivet);
      };
    },
    crate: () => {
      const b = rgb('#B1844F');
      return (x, y) => {
        const edge = x < 22 || y < 22 || x > N - 23 || y > N - 23;
        const diag = Math.abs(x - y) < 14 && !edge;
        const plank = Math.floor(y / 42);
        const grain = fbm(x * 2, y * 0.3, N, 4, 3, 18 + plank);
        let k = 0.78 + grain * 0.35;
        if (edge || diag) k *= 0.82; else if (y % 42 < 2) k *= 0.6;
        if ((edge || diag) && (x % 4 === 0 || y % 4 === 0)) k *= 0.98;
        return shade(b, k);
      };
    },
    sandbag: () => {
      const b = rgb('#B8A57A');
      return (x, y) => {
        const row = Math.floor(y / 64), off = (row % 2) * 64;
        const u = ((x + off) % 128) / 128, v = (y % 64) / 64;
        const puff = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        const n = fbm(x, y, N, 32, 2, 19);
        return shade(b, (0.55 + 0.5 * Math.pow(puff, 0.4)) * (0.9 + n * 0.15));
      };
    },
    hedge: () => {
      const b = rgb('#3E6B2E');
      return (x, y) => {
        const n = fbm(x, y, N, 16, 4, 20), s = hash2(x >> 2, y >> 2, 21);
        return shade(b, 0.6 + n * 0.6 + (s > 0.85 ? 0.2 : 0));
      };
    },
    leaves: () => {
      const b = rgb('#4F8A34');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 4, 22), s = hash2(x >> 3, y >> 3, 23);
        return shade(b, 0.65 + n * 0.55 + (s > 0.8 ? 0.15 : 0));
      };
    },
    bark: () => {
      const b = rgb('#6A4A30');
      return (x, y) => {
        const n = fbm(x * 3, y * 0.4, N, 4, 4, 24);
        return shade(b, 0.7 + n * 0.5);
      };
    },
    roof: () => {
      const b = rgb('#6B5A52');
      return (x, y) => {
        const row = Math.floor(y / 24), off = (row % 2) * 16;
        const n = fbm(x, y, N, 8, 3, 25);
        const k = (y % 24 < 3 ? 0.7 : 1) * ((x + off) % 32 < 2 ? 0.8 : 1);
        return shade(b, k * (0.85 + n * 0.25));
      };
    },
    grass: () => {
      const b = rgb('#6EA14A');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 5, 26), bl = hash2(x, y, 27);
        return shade(lerp3(b, rgb('#8DB85A'), n), 0.8 + bl * 0.3);
      };
    },
    sand: () => {
      const b = rgb('#DCC49A');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 5, 28);
        const rip = 0.96 + 0.05 * Math.sin((x + n * 40) / N * Math.PI * 2 * 10);
        return shade(b, (0.88 + n * 0.18) * rip * (hash2(x, y, 29) > 0.97 ? 0.9 : 1));
      };
    },
    dirt: () => {
      const b = rgb('#8C6E4E');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 5, 30), p = hash2(x >> 1, y >> 1, 31) > 0.96;
        return shade(b, (0.8 + n * 0.35) * (p ? 1.2 : 1));
      };
    },
    snow: () => (x, y) => {
      const n = fbm(x, y, N, 4, 5, 32);
      return lerp3(rgb('#E5ECF2'), rgb('#FFFFFF'), n);
    },
    ice: () => (x, y) => {
      const n = fbm(x, y, N, 4, 4, 33), crack = Math.abs(fbm(x, y, N, 8, 2, 34) - 0.5) < 0.012;
      return shade(lerp3(rgb('#BFD8E6'), rgb('#E8F4FA'), n), crack ? 0.8 : 1);
    },
    pavement: () => {
      const b = rgb('#9D9C98');
      return (x, y) => {
        const seam = x % 64 < 2 || y % 64 < 2;
        const n = fbm(x, y, N, 8, 4, 35);
        return shade(b, (seam ? 0.72 : 0.92 + hash2(x >> 6, y >> 6, 36) * 0.1) * (0.88 + n * 0.2));
      };
    },
    tiles: () => {
      const b = rgb('#C77F55');
      return (x, y) => {
        const seam = x % 64 < 3 || y % 64 < 3;
        const n = fbm(x, y, N, 8, 3, 37);
        return seam ? shade(rgb('#E0D6C4'), 0.9) : shade(b, (0.85 + hash2(x >> 6, y >> 6, 38) * 0.2) * (0.9 + n * 0.15));
      };
    },
    cobble: () => {
      const b = rgb('#8E8A82');
      return (x, y) => {
        const cx = Math.floor(x / 32), cy = Math.floor(y / 32);
        let best = 9, sec = 9;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const px = (cx + i) * 32 + 8 + hash2(((cx + i) % 8 + 8) % 8, ((cy + j) % 8 + 8) % 8, 39) * 16;
          const py = (cy + j) * 32 + 8 + hash2(((cx + i) % 8 + 8) % 8, ((cy + j) % 8 + 8) % 8, 40) * 16;
          const d = Math.hypot(x - px, y - py) / 32;
          if (d < best) { sec = best; best = d; } else if (d < sec) sec = d;
        }
        const n = fbm(x, y, N, 8, 3, 41);
        return shade(b, (sec - best < 0.08 ? 0.55 : 0.85 + n * 0.25));
      };
    },
    jungle: () => {
      const b = rgb('#4F6B33');
      return (x, y) => {
        const n = fbm(x, y, N, 8, 5, 42), m = fbm(x, y, N, 3, 3, 43);
        return shade(lerp3(b, rgb('#6E5638'), Math.max(0, Math.min(1, (m - 0.45) * 2.5))), 0.75 + n * 0.4);
      };
    },
    plate: () => {
      const b = rgb('#8F969D');
      return (x, y) => {
        const u = x % 32, v = y % 32;
        const bump = (Math.abs(u - v) < 3 && u < 16) || (Math.abs(u + v - 48) < 3 && u > 16) ? 1.18 : 1;
        const n = fbm(x, y, N, 8, 3, 44);
        return shade(b, (0.82 + n * 0.2) * bump);
      };
    },
    hazard: () => {
      const y1 = rgb('#E8B930'), k = rgb('#2A2A2A');
      return (x, y) => {
        const s = Math.floor((x + y) / 32) % 2;
        const n = fbm(x, y, N, 8, 3, 45);
        return shade(s ? y1 : k, 0.8 + n * 0.3);
      };
    },
    siding: () => PAINT.corrugated()
  };

  const texCache = Object.create(null);
  /** The canvas for a texture name, painted on first use. */
  function textureCanvas(name) {
    const k = PAINT[name] ? name : 'concrete';
    if (!texCache[k]) texCache[k] = paint(PAINT[k]());
    return texCache[k];
  }

  /* What each kind of box wears, per map theme: a texture, a tint, how many
     metres the texture covers. */
  function material(mat, theme) {
    const T = theme || {};
    const M = {
      wall: { tex: T.wall || 'concrete' },
      wall2: { tex: T.wall2 || 'brick' },
      plat: { tex: T.plat || 'concrete' },
      pillar: { tex: 'stone' },
      sandbag: { tex: 'sandbag', scale: 1 },
      crate: { tex: 'crate', scale: 1 },
      barrel: { tex: 'metal', tint: '#3F6FA0' },
      hedge: { tex: 'hedge', scale: 1.5 },
      cont_r: { tex: 'corrugated', tint: '#B5452F', scale: 2.4 },
      cont_b: { tex: 'corrugated', tint: '#2F6BA6', scale: 2.4 },
      cont_g: { tex: 'corrugated', tint: '#4E8A3B', scale: 2.4 },
      trunk: { tex: 'bark' },
      roof: { tex: 'roof' },
      ground: { tex: T.ground || 'asphalt', scale: 3 },
      road: { tex: T.road || 'slab', scale: 3 },
      grass: { tex: T.grass || 'grass', scale: 3 }
    };
    const m = M[mat] || { tex: 'concrete' };
    const tint = m.tint ? rgb(m.tint) : (m.tex === 'corrugated' ? rgb('#9AA2A8') : [1, 1, 1]);
    return { tex: m.tex, tint: tint, scale: m.scale || 2 };
  }

  /* ----------------------------------------------------------- soldier */

  /* Bones. The matrices come from scene.js every frame. */
  const BONE = { hips: 0, chest: 1, head: 2, armR: 3, armL: 4, thighR: 5, shinR: 6, thighL: 7, shinL: 8 };

  const SKIN = rgb('#D9A47C'), DARK = rgb('#2A2D31'), BOOT = rgb('#3B2E25');
  const GEAR_COL = {
    cap: rgb('#2B3A4A'), beret: rgb('#7A1E24'), helmet: rgb('#5B6448'), combat: rgb('#464C3C'), heavy: rgb('#2E3238'),
    vest: rgb('#4E5541'), plate: rgb('#3A3F36'), raider: rgb('#2F3440'),
    gloves: rgb('#26282C'), tactical: rgb('#7A6A52'), pro: rgb('#1E2024'),
    sneakers: rgb('#E6E6E2'), boots: rgb('#4A3626'), runners: rgb('#3B3F46'), ghost: rgb('#1A1B1E')
  };

  const modelCache = Object.create(null);

  /**
   * A soldier's mesh for what it wears. Built facing -z, feet at y = 0,
   * each part in the frame of its own bone (joints at the origin of that
   * bone), so scene.js can swing limbs by rotating bones.
   *   hips origin (0, 0.95, 0), chest origin (0, 1.0, 0) at the waist,
   *   head origin at the neck, arms at the shoulders, thighs at the hip
   *   joints, shins at the knees.
   */
  function soldier(wear) {
    const w = wear || {};
    const key = [w.head, w.body, w.hands, w.feet].join('|');
    if (modelCache[key]) return modelCache[key];
    const g = new G.Geo(), m = M4.create();
    const team = [1, 1, 1];
    const cloth = rgb('#8D8F86');            // takes the team colour as a tint
    const pants = rgb('#3E4238');
    const hand = w.hands && w.hands !== 'bare' ? GEAR_COL[w.hands] : SKIN;
    const boot = GEAR_COL[w.feet] || BOOT;

    // Hips and legs.
    g.box(M4.compose(m, 0, 0.02, 0), 0.36, 0.2, 0.22, pants, 0, BONE.hips);
    g.box(M4.compose(m, 0, 0.1, 0), 0.38, 0.05, 0.24, DARK, 0, BONE.hips);
    for (const side of [1, -1]) {
      const th = side > 0 ? BONE.thighR : BONE.thighL, sh = side > 0 ? BONE.shinR : BONE.shinL;
      g.box(M4.compose(m, 0, -0.22, 0), 0.16, 0.44, 0.18, pants, 0, th);
      g.box(M4.compose(m, 0, -0.2, 0), 0.14, 0.4, 0.16, pants, 0, sh);
      g.box(M4.compose(m, 0, -0.43, -0.04), 0.15, 0.1, 0.26, boot, 0, sh);
      g.box(M4.compose(m, 0, -0.05, -0.1), 0.15, 0.1, 0.03, DARK, 0, sh);
    }
    // Torso: a shirt in the team's colour, and whatever is worn over it.
    g.box(M4.compose(m, 0, 0.24, 0), 0.4, 0.48, 0.23, cloth, 2, BONE.chest);
    if (w.body === 'vest' || w.body === 'plate' || w.body === 'raider') {
      const vc = GEAR_COL[w.body];
      const thick = w.body === 'plate' ? 0.3 : 0.27;
      g.box(M4.compose(m, 0, 0.27, 0), 0.43, 0.36, thick, vc, 0, BONE.chest);
      for (let i = 0; i < 3; i++) g.box(M4.compose(m, -0.12 + i * 0.12, 0.2, -thick / 2 - 0.02), 0.09, 0.12, 0.05, shadeC(vc, 0.8), 0, BONE.chest);
      if (w.body === 'raider') g.box(M4.compose(m, 0, 0.3, 0.16), 0.3, 0.34, 0.12, rgb('#3B4250'), 0, BONE.chest);
    } else {
      g.box(M4.compose(m, 0, 0.3, 0.14), 0.26, 0.3, 0.1, rgb('#5A4A36'), 0, BONE.chest);    // pack
    }
    g.box(M4.compose(m, 0, 0.47, 0), 0.14, 0.06, 0.14, SKIN, 0, BONE.chest);               // neck
    // Head, face toward -z, and its hat.
    g.box(M4.compose(m, 0, 0.13, 0), 0.23, 0.25, 0.24, SKIN, 0, BONE.head);
    g.box(M4.compose(m, 0, 0.16, -0.121), 0.17, 0.05, 0.01, DARK, 0, BONE.head);           // eyes
    g.box(M4.compose(m, 0, 0.05, -0.12), 0.15, 0.07, 0.01, shadeC(SKIN, 0.85), 0, BONE.head);
    hat(g, m, w.head);
    // Arms, bent to hold a rifle across the chest: the right hand at the
    // grip, the left under the barrel.
    for (const side of [1, -1]) {
      const b = side > 0 ? BONE.armR : BONE.armL;
      g.box(M4.compose(m, 0, -0.14, 0, 0, 0.35, 0), 0.12, 0.3, 0.13, cloth, 2, b);
      g.box(M4.compose(m, side * -0.05, -0.28, -0.18, side * 0.4, 1.2, 0), 0.1, 0.28, 0.1, cloth, 2, b);
      g.box(M4.compose(m, side * -0.1, -0.33, -0.36, 0, 0, 0), 0.09, 0.09, 0.11, hand, 0, b);
    }
    const out = { geo: g, key: key };
    modelCache[key] = out;
    return out;
  }
  function shadeC(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

  function hat(g, m, id) {
    const B = BONE.head;
    if (id === 'beret') {
      g.box(M4.compose(m, 0.02, 0.27, 0.01, 0, 0, 0.12), 0.26, 0.06, 0.26, GEAR_COL.beret, 0, B);
    } else if (id === 'helmet' || id === 'combat' || id === 'heavy') {
      const c = GEAR_COL[id];
      g.ball(M4.compose(m, 0, 0.2, 0.01, 0, 0, 0, 1, 0.78, 1.05), 0.16, 10, 6, c, 0, B);
      g.box(M4.compose(m, 0, 0.19, 0.01), 0.3, 0.05, 0.3, c, 0, B);
      if (id === 'combat') {
        g.box(M4.compose(m, 0, 0.23, -0.14), 0.2, 0.06, 0.05, rgb('#1C1E21'), 0, B);
        g.box(M4.compose(m, 0, 0.23, -0.165), 0.16, 0.035, 0.01, rgb('#7FB8D8'), 4, B);
      }
      if (id === 'heavy') {
        g.box(M4.compose(m, 0, 0.12, -0.14), 0.24, 0.12, 0.03, rgb('#1A1C20'), 4, B);
        g.box(M4.compose(m, 0.15, 0.1, 0), 0.04, 0.16, 0.2, c, 0, B);
        g.box(M4.compose(m, -0.15, 0.1, 0), 0.04, 0.16, 0.2, c, 0, B);
      }
    } else {
      g.box(M4.compose(m, 0, 0.27, 0.01), 0.25, 0.06, 0.26, GEAR_COL.cap, 2, B);
      g.box(M4.compose(m, 0, 0.25, -0.15), 0.2, 0.02, 0.1, GEAR_COL.cap, 2, B);
    }
  }

  /* ------------------------------------------------------------- guns */

  const GUNMAT = {
    b: [rgb('#2F3237'), 1], d: [rgb('#1F2124'), 0], p: [rgb('#34363A'), 0], w: [rgb('#7A5234'), 0],
    a: [rgb('#6D6A55'), 0], g: [rgb('#5FA8D8'), 4], s: [rgb('#A7ADB4'), 4]
  };
  /* A gun's own base colour for its body, so the stock guns do not all
     look alike before anybody buys a camo. */
  const BODY = {
    striker: '#2F3237', kodiak: '#3A3530', falcon: '#3B4034', tempest: '#8C7A5A', viper: '#2A2C30',
    hornet: '#303236', vortex: '#3C3F44', bulldog: '#4C5140', breacher: '#2E3033', hurricane: '#3A3C3F',
    marksman: '#5C5A48', longbow: '#4C5A3E', rail: '#373A40', warden: '#35383C', titan: '#2B2D30',
    p9: '#2C2E31', ranger: '#8A8F96', stinger: '#2E3034', magnum: '#8C9299', knife: '#2A2C2F',
    machete: '#2A2C2F', axe: '#6B4A2E'
  };

  function partsOf(wid, att) {
    const w = D.W[wid] || D.W.striker;
    const parts = w.model.map(p => p.slice());
    const A = att || {};
    // A longer magazine for `ext`, two taped together for `fast`.
    if (A.mag && A.mag !== 'none') {
      const mi = parts.findIndex(p => p[0] === 'b' && p[2] < -0.06 && p[7] !== 'p' && p[5] > 0.08 && p !== parts[0]);
      if (mi >= 0) {
        const p = parts[mi];
        if (A.mag === 'ext') { p[5] *= 1.35; p[2] -= p[5] * 0.13; }
        else parts.push(['b', p[1] + p[4] * 1.05, p[2], p[3], p[4], p[5], p[6], p[7], p[8] || 0]);
      }
    }
    const rail = w.rail, mz = w.muzzle, un = w.under;
    const optic = A.optic && A.optic !== 'iron' ? A.optic : (w.optic !== 'iron' ? w.optic : null);
    if (optic === 'dot') {
      parts.push(['b', 0, rail[0] + 0.02, rail[1], 0.03, 0.035, 0.05, 'd']);
      parts.push(['b', 0, rail[0] + 0.03, rail[1] - 0.02, 0.022, 0.022, 0.004, 'g']);
    } else if (optic === 'holo') {
      parts.push(['b', 0, rail[0] + 0.012, rail[1], 0.04, 0.02, 0.08, 'd']);
      parts.push(['b', 0.018, rail[0] + 0.042, rail[1] + 0.025, 0.006, 0.05, 0.03, 'd']);
      parts.push(['b', -0.018, rail[0] + 0.042, rail[1] + 0.025, 0.006, 0.05, 0.03, 'd']);
      parts.push(['b', 0, rail[0] + 0.07, rail[1] + 0.025, 0.042, 0.006, 0.03, 'd']);
      parts.push(['b', 0, rail[0] + 0.042, rail[1] + 0.02, 0.03, 0.04, 0.003, 'g']);
    } else if (optic === 'x4' || optic === 'x8') {
      const L = optic === 'x8' ? 0.3 : 0.22, r = optic === 'x8' ? 0.024 : 0.02;
      parts.push(['b', 0, rail[0] + 0.012, rail[1], 0.02, 0.025, 0.05, 'd']);
      parts.push(['c', 0, rail[0] + 0.045, rail[1], r, L, 'd']);
      parts.push(['c', 0, rail[0] + 0.045, rail[1] + L / 2, r + 0.008, 0.05, 'd']);
      parts.push(['c', 0, rail[0] + 0.045, rail[1] - L / 2, r + 0.006, 0.04, 'd']);
      parts.push(['c', 0, rail[0] + 0.045, rail[1] - L / 2 - 0.021, r * 0.8, 0.002, 'g']);
    }
    if (A.muzzle === 'supp') parts.push(['c', 0, mz[0], mz[1] + 0.085, 0.022, 0.17, 'd']);
    else if (A.muzzle === 'comp') parts.push(['b', 0, mz[0], mz[1] + 0.03, 0.036, 0.034, 0.06, 'd']);
    else if (A.muzzle === 'brake') { parts.push(['b', 0, mz[0], mz[1] + 0.035, 0.06, 0.03, 0.07, 'd']); }
    if (A.grip === 'vert') parts.push(['b', 0, un[0] - 0.06, un[1], 0.03, 0.1, 0.035, 'p']);
    else if (A.grip === 'angled') parts.push(['b', 0, un[0] - 0.03, un[1], 0.03, 0.05, 0.08, 'p', 0.5]);
    else if (A.grip === 'laser') {
      parts.push(['b', 0.035, un[0] + 0.02, un[1], 0.025, 0.03, 0.07, 'd']);
      parts.push(['b', 0.035, un[0] + 0.02, un[1] + 0.036, 0.01, 0.01, 0.002, 'r']);
    }
    return parts;
  }

  /** The eye point for an aimed gun: where the sight line runs, in gun
      space — on the iron sights, or through the middle of an optic. */
  function sightY(wid, att) {
    const w = D.W[wid] || D.W.striker;
    const optic = att && att.optic && att.optic !== 'iron' ? att.optic : (w.optic !== 'iron' ? w.optic : null);
    if (optic === 'dot') return w.rail[0] + 0.03;
    if (optic === 'holo') return w.rail[0] + 0.042;
    if (optic === 'x4' || optic === 'x8') return w.rail[0] + 0.045;
    let top = 0;
    for (const p of w.model) if (p[0] === 'b') top = Math.max(top, p[2] + p[5] / 2);
    return top + 0.004;
  }

  /** A gun mesh. `look` = {att, camo}. Bone 0. */
  function gun(wid, att) {
    const key = 'g:' + wid + ':' + (att ? D.ASLOTS.map(s => att[s] || '').join(',') : '');
    if (modelCache[key]) return modelCache[key];
    const g = new G.Geo(), m = M4.create();
    const body = rgb(BODY[wid] || '#2F3237');
    for (const p of partsOf(wid, att)) {
      const matk = p[0] === 'b' ? p[7] : p[6];
      const gm = matk === 'r' ? [rgb('#FF2A2A'), 3] : (GUNMAT[matk] || GUNMAT.d);
      const col = matk === 'b' ? body : gm[0];
      const mat = matk === 'b' ? 1 : gm[1];
      if (p[0] === 'b') {
        // Gun space has +z toward the muzzle; models face -z, so turn it.
        M4.compose(m, -p[1], p[2], -p[3], 0, -(p[8] || 0), 0);
        g.box(m, p[4], p[5], p[6], col, mat, 0);
      } else {
        M4.compose(m, -p[1], p[2], -p[3], 0, 0, 0);
        g.cyl(m, p[4], p[4], p[5], 10, col, mat, 0);
      }
    }
    const out = { geo: g, key: key };
    modelCache[key] = out;
    return out;
  }

  /** A charm, hung from the origin, for bone 0. */
  function charm(id) {
    const key = 'c:' + id;
    if (modelCache[key]) return modelCache[key];
    const def = D.CHARMS.find(c => c.id === id);
    if (!def || id === 'none') return null;
    const g = new G.Geo(), m = M4.create(), col = rgb(def.col), dk = [0.1, 0.1, 0.12];
    g.box(M4.compose(m, 0, -0.018, 0), 0.002, 0.036, 0.002, dk, 0, 0);
    const y = -0.045, s = 0.016;
    switch (id) {
      case 'dice':
        g.box(M4.compose(m, 0, y, 0, 0.4, 0.3, 0.2), s * 1.3, s * 1.3, s * 1.3, col, 0, 0);
        break;
      case 'star':
        for (let i = 0; i < 5; i++) g.box(M4.compose(m, 0, y, 0, 0, 0, i / 5 * Math.PI * 2), s * 0.45, s * 2.1, s * 0.5, col, 4, 0);
        break;
      case 'heart':
        g.ball(M4.compose(m, -s * 0.45, y + s * 0.2, 0), s * 0.62, 8, 5, col, 0, 0);
        g.ball(M4.compose(m, s * 0.45, y + s * 0.2, 0), s * 0.62, 8, 5, col, 0, 0);
        g.box(M4.compose(m, 0, y - s * 0.25, 0, 0, 0, Math.PI / 4), s * 0.95, s * 0.95, s * 0.8, col, 0, 0);
        break;
      case 'skull':
        g.ball(M4.compose(m, 0, y, 0), s * 0.9, 8, 6, col, 0, 0);
        g.box(M4.compose(m, 0, y - s * 0.8, -s * 0.1), s * 0.9, s * 0.5, s * 0.9, col, 0, 0);
        g.box(M4.compose(m, -s * 0.35, y, -s * 0.85), s * 0.4, s * 0.35, s * 0.1, dk, 0, 0);
        g.box(M4.compose(m, s * 0.35, y, -s * 0.85), s * 0.4, s * 0.35, s * 0.1, dk, 0, 0);
        break;
      case 'bullet':
        g.cyl(M4.compose(m, 0, y, 0, 0, Math.PI / 2, 0), s * 0.45, s * 0.45, s * 1.6, 8, col, 4, 0);
        g.cone(M4.compose(m, 0, y + s * 0.8, 0), s * 0.45, s * 1.0, 8, rgb('#C0703A'), 4, 0);
        break;
      case 'duck':
        g.ball(M4.compose(m, 0, y, 0, 0, 0, 0, 1.2, 0.9, 1), s * 0.9, 8, 6, col, 0, 0);
        g.ball(M4.compose(m, 0, y + s * 1.0, -s * 0.5), s * 0.55, 8, 6, col, 0, 0);
        g.box(M4.compose(m, 0, y + s * 0.95, -s * 1.1), s * 0.4, s * 0.2, s * 0.5, rgb('#F28C28'), 0, 0);
        break;
      case 'cat':
        g.ball(M4.compose(m, 0, y, 0), s * 0.9, 8, 6, col, 0, 0);
        g.cone(M4.compose(m, -s * 0.5, y + s * 0.6, 0), s * 0.35, s * 0.6, 4, col, 0, 0);
        g.cone(M4.compose(m, s * 0.5, y + s * 0.6, 0), s * 0.35, s * 0.6, 4, col, 0, 0);
        g.box(M4.compose(m, -s * 0.35, y + s * 0.1, -s * 0.85), s * 0.25, s * 0.2, s * 0.05, rgb('#9BE35A'), 3, 0);
        g.box(M4.compose(m, s * 0.35, y + s * 0.1, -s * 0.85), s * 0.25, s * 0.2, s * 0.05, rgb('#9BE35A'), 3, 0);
        break;
      case 'grenade':
        g.ball(M4.compose(m, 0, y, 0, 0, 0, 0, 0.9, 1.15, 0.9), s * 0.85, 8, 6, col, 0, 0);
        g.box(M4.compose(m, 0, y + s * 1.05, 0), s * 0.5, s * 0.35, s * 0.5, rgb('#9A9A90'), 4, 0);
        break;
      case 'clover':
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + Math.PI / 4;
          g.ball(M4.compose(m, Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, 0, 0, 0, 0, 1, 1, 0.35), s * 0.55, 8, 5, col, 0, 0);
        }
        break;
      case 'crown':
        g.cyl(M4.compose(m, 0, y, 0, 0, Math.PI / 2, 0), s * 0.8, s * 0.8, s * 0.7, 10, col, 4, 0);
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          g.cone(M4.compose(m, Math.cos(a) * s * 0.7, y + s * 0.35, Math.sin(a) * s * 0.7), s * 0.2, s * 0.55, 4, col, 4, 0);
        }
        break;
      case 'diamond':
        g.cone(M4.compose(m, 0, y, 0), s * 0.9, s * 0.9, 6, col, 4, 0);
        g.cone(M4.compose(m, 0, y, 0, 0, Math.PI, 0), s * 0.9, s * 0.6, 6, col, 4, 0);
        break;
      default:
        g.ball(M4.compose(m, 0, y, 0), s, 8, 6, col, 0, 0);
    }
    const out = { geo: g, key: key };
    modelCache[key] = out;
    return out;
  }

  /** First-person arms for a view model: right hand on the grip, left on
      the handguard, sleeves in the team colour, hands in what is worn. */
  function arms(wid, hands) {
    const key = 'a:' + wid + ':' + (hands || 'bare');
    if (modelCache[key]) return modelCache[key];
    const w = D.W[wid] || D.W.striker;
    const g = new G.Geo(), m = M4.create();
    const cloth = rgb('#8D8F86');
    const hand = hands && hands !== 'bare' ? GEAR_COL[hands] : SKIN;
    const melee = w.cat === 'melee', pistol = w.cat === 'pistol';
    // Right hand round the grip, the forearm running back and down to the
    // bottom right corner of the screen.
    g.box(M4.compose(m, 0.0, -0.07, 0.035, 0, -0.35, 0), 0.056, 0.07, 0.09, hand, 0, 0);
    g.box(M4.compose(m, 0.004, -0.045, 0.0, 0, 0, 0), 0.05, 0.03, 0.05, hand, 0, 0);
    g.box(M4.compose(m, 0.06, -0.14, 0.23, -0.3, 0.35, 0), 0.08, 0.08, 0.42, cloth, 2, 0);
    g.box(M4.compose(m, 0.035, -0.1, 0.1, -0.3, 0.35, 0), 0.07, 0.07, 0.05, shadeC(cloth, 0.7), 2, 0);
    // Left hand under the front of the gun (or wrapped round the right, on a
    // pistol), the forearm coming in from the bottom middle.
    if (!melee) {
      const lz = pistol ? 0.03 : -(w.under[1] - 0.02);
      const ly = pistol ? -0.085 : w.under[0] - 0.012;
      g.box(M4.compose(m, pistol ? 0.022 : -0.004, ly - 0.012, lz, 0, 0, pistol ? 0.3 : -0.25), 0.058, 0.055, 0.11, hand, 0, 0);
      g.box(M4.compose(m, pistol ? -0.02 : -0.06, ly - 0.1, lz + 0.2, 0.55, 0.45, 0), 0.08, 0.08, 0.46, cloth, 2, 0);
    }
    const out = { geo: g, key: key };
    modelCache[key] = out;
    return out;
  }

  /* ------------------------------------------------------------- props */

  /** Trees by kind: `x, z` is the middle of the cell. */
  function tree(g, kind, x, z, h, seed) {
    const m = M4.create();
    const bark = rgb('#6A4A30');
    const r = (k) => hash2(Math.floor(x * 7), Math.floor(z * 7), seed + k);
    if (kind === 'pine') {
      g.cyl(M4.compose(m, x, 1.5, z, 0, Math.PI / 2, 0), 0.16, 0.12, 3, 8, bark, 0, 0);
      const green = rgb('#2F5A3A');
      for (let i = 0; i < 4; i++) g.cone(M4.compose(m, x, 1.6 + i * 1.05, z, r(i) * 3), 1.7 - i * 0.33, 1.7, 9, shadeC(green, 0.9 + i * 0.07), 0, 0);
      g.cone(M4.compose(m, x, 1.8, z), 1.72, 0.25, 9, rgb('#F2F6F8'), 0, 0);
    } else if (kind === 'palm') {
      let px = x, py = 0, pz = z;
      const lean = (r(1) - 0.5) * 0.5;
      for (let i = 0; i < 6; i++) {
        g.cyl(M4.compose(m, px, py + 0.4, pz, 0, Math.PI / 2 + lean * 0.3, lean), 0.14 - i * 0.012, 0.13 - i * 0.012, 0.85, 7, shadeC(rgb('#8C6A45'), 0.85 + (i % 2) * 0.15), 0, 0);
        py += 0.8; px += lean * 0.12;
      }
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + r(2);
        g.box(M4.compose(m, px + Math.sin(a) * 1.0, py - 0.1, pz + Math.cos(a) * 1.0, a, -0.35, 0), 0.45, 0.05, 2.1, rgb('#4E9A3A'), 0, 0);
      }
    } else if (kind === 'jungle') {
      g.cyl(M4.compose(m, x, 2.5, z, 0, Math.PI / 2, 0), 0.26, 0.18, 5, 8, bark, 0, 0);
      const green = rgb('#3D7A2E');
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + r(i);
        g.ball(M4.compose(m, x + Math.sin(a) * 0.9, 5 + r(i + 4) * 0.8, z + Math.cos(a) * 0.9, 0, 0, 0, 1.2, 0.6, 1.2), 1.3, 9, 5, shadeC(green, 0.85 + r(i + 8) * 0.3), 0, 0);
      }
    } else {
      g.cyl(M4.compose(m, x, 1.6, z, 0, Math.PI / 2, 0), 0.2, 0.15, 3.2, 8, bark, 0, 0);
      const green = rgb('#5A8F3A');
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + r(i);
        g.ball(M4.compose(m, x + Math.sin(a) * 0.8, 3.8 + r(i + 3) * 0.9, z + Math.cos(a) * 0.8), 1.15 + r(i + 6) * 0.3, 9, 6, shadeC(green, 0.85 + r(i + 9) * 0.3), 0, 0);
      }
    }
  }

  function barrel(g, x, z, col) {
    const m = M4.create(), c = rgb(col || '#3F6FA0');
    g.cyl(M4.compose(m, x, 0.6, z, 0, Math.PI / 2, 0), 0.37, 0.37, 1.2, 12, c, 0, 0);
    for (const y of [0.25, 0.95]) g.cyl(M4.compose(m, x, y, z, 0, Math.PI / 2, 0), 0.385, 0.385, 0.05, 12, shadeC(c, 0.8), 0, 0, false);
    g.cyl(M4.compose(m, x, 1.2, z, 0, Math.PI / 2, 0), 0.34, 0.34, 0.01, 12, shadeC(c, 0.7), 0, 0);
  }

  /** A flag: a pole and a cloth that the scene waves. Bone 0 the pole,
      bone 1 the cloth. */
  function flagModel() {
    if (modelCache.flag) return modelCache.flag;
    const g = new G.Geo(), m = M4.create();
    g.cyl(M4.compose(m, 0, 1.4, 0, 0, Math.PI / 2, 0), 0.03, 0.025, 2.8, 8, rgb('#C9CDD2'), 4, 0);
    g.ball(M4.compose(m, 0, 2.82, 0), 0.05, 8, 5, rgb('#E8C04A'), 4, 0);
    for (let i = 0; i < 6; i++) g.box(M4.compose(m, 0.1 + i * 0.15, 0, 0), 0.155, 0.62, 0.02, [1, 1, 1], 2, 1);
    const out = { geo: g, key: 'flag' };
    modelCache.flag = out;
    return out;
  }

  function bombModel() {
    if (modelCache.bomb) return modelCache.bomb;
    const g = new G.Geo(), m = M4.create();
    g.box(M4.compose(m, 0, 0.1, 0), 0.34, 0.2, 0.24, rgb('#3A3F2E'), 0, 0);
    g.box(M4.compose(m, 0, 0.21, 0.02), 0.16, 0.03, 0.12, rgb('#1C1E20'), 0, 0);
    for (let i = 0; i < 3; i++) g.cyl(M4.compose(m, -0.1 + i * 0.1, 0.1, -0.13, 0, 0, 0), 0.04, 0.04, 0.04, 8, rgb('#9A4A2A'), 0, 0);
    g.box(M4.compose(m, 0.1, 0.23, -0.04), 0.03, 0.02, 0.03, [1, 0.2, 0.2], 3, 1);
    const out = { geo: g, key: 'bomb' };
    modelCache.bomb = out;
    return out;
  }

  function nadeModel() {
    if (modelCache.nade) return modelCache.nade;
    const g = new G.Geo(), m = M4.create();
    g.ball(M4.compose(m, 0, 0, 0, 0, 0, 0, 0.9, 1.15, 0.9), 0.05, 10, 6, rgb('#4D5A38'), 0, 0);
    g.box(M4.compose(m, 0, 0.06, 0), 0.03, 0.03, 0.03, rgb('#9A9A90'), 4, 0);
    g.box(M4.compose(m, 0.02, 0.05, 0), 0.01, 0.06, 0.012, rgb('#9A9A90'), 4, 0);
    const out = { geo: g, key: 'nade' };
    modelCache.nade = out;
    return out;
  }

  /* -------------------------------------------------------------- icon */

  /** A gun side on, fitted into the box (x, y, w, h) of a 2D canvas.
      `look` = {att, camo}; `tint` overrides every colour (a silhouette). */
  function paintGun(c, wid, x, y, w, h, look, tint) {
    const L = look || {};
    const parts = partsOf(wid, L.att);
    let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of parts) {
      const hz = p[0] === 'b' ? p[6] / 2 : p[5] / 2, hy = p[0] === 'b' ? p[5] / 2 : p[4];
      z0 = Math.min(z0, p[3] - hz); z1 = Math.max(z1, p[3] + hz);
      y0 = Math.min(y0, p[2] - hy); y1 = Math.max(y1, p[2] + hy);
    }
    const s = Math.min(w / (z1 - z0), h / (y1 - y0)) * 0.94;
    const ox = x + w / 2 - (z0 + z1) / 2 * s, oy = y + h / 2 + (y0 + y1) / 2 * s;
    const camo = L.camo && L.camo !== 'none' ? D.CAMOS.find(k => k.id === L.camo) : null;
    const hex = v => '#' + v.map(k => Math.round(Math.max(0, Math.min(1, k)) * 255).toString(16).padStart(2, '0')).join('');
    const order = parts.slice().sort((p, q) => (p[0] === 'c') - (q[0] === 'c'));
    for (const p of order) {
      const matk = p[0] === 'b' ? p[7] : p[6];
      let col;
      if (tint) col = tint;
      else if (matk === 'b') col = camo ? camo.cols[0] : (BODY[wid] || '#2F3237');
      else if (matk === 'r') col = '#FF3030';
      else col = hex((GUNMAT[matk] || GUNMAT.d)[0].map(v => Math.min(1, v * 1.25)));
      c.fillStyle = col;
      c.save();
      if (p[0] === 'b') {
        c.translate(ox + p[3] * s, oy - p[2] * s);
        c.rotate(p[8] || 0);
        c.fillRect(-p[6] / 2 * s, -p[5] / 2 * s, p[6] * s, p[5] * s);
        if (!tint && matk === 'b' && camo) {
          c.fillStyle = camo.cols[1];
          const n = 4;
          for (let i = 0; i < n; i++) {
            const u = hash2(i, wid.length, 5) - 0.5, v = hash2(i, 3, 6) - 0.5;
            c.fillRect(u * p[6] * s * 0.8 - p[6] * s * 0.12, v * p[5] * s * 0.6 - p[5] * s * 0.15, p[6] * s * 0.25, p[5] * s * 0.3);
          }
        }
        if (!tint) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-p[6] / 2 * s, -p[5] / 2 * s, p[6] * s, Math.max(1, p[5] * s * 0.25)); }
      } else {
        c.translate(ox + p[3] * s, oy - p[2] * s);
        c.fillRect(-p[5] / 2 * s, -p[4] * s, p[5] * s, p[4] * 2 * s);
      }
      c.restore();
    }
  }

  PV.FpsArt = {
    textureCanvas: textureCanvas, material: material, PAINT: PAINT,
    BONE: BONE, soldier: soldier, gun: gun, charm: charm, arms: arms, sightY: sightY,
    tree: tree, barrel: barrel, flagModel: flagModel, bombModel: bombModel, nadeModel: nadeModel,
    paintGun: paintGun, hash2: hash2, GEAR_COL: GEAR_COL
  };

})(window.PV);
