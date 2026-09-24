/* 人潮冲锋 / Crowd Rush — the 3D scene.

   Everything the reference shows, built from boxes, capsules and lathes:
   a pale road on a floating causeway with raised white rails; glass gates
   on dark posts; squads of red runners standing in a pink disc; flat saw
   blades, spinning bars, a pendulum hammer, presses and spike beds; a
   rainbow staircase to a treasure chest, or a round plaza before a castle
   with orange onion domes and a king in a crown.

   The world is baked once per level into two buffers (the road, with its
   chevrons, and everything else that never moves) and redrawn every frame
   with the things that do: traps, glass, runners, splats and sparks. The
   runners are one instanced draw call however many there are.

   Where things are comes from the engine and nowhere else — a blade is drawn
   by the same function the engine cuts with, a runner where the engine has
   it, between the last two ticks. The effects (splats, fliers, puffs,
   confetti, the chest's coins) are this file's own and never read back. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const G = PV.CrowdGL, M4 = G.M4, Mesh = G.Mesh, rgb = G.rgb;
  const C = PV.CrowdCourse;
  const HALF = C.HALF;
  const TAU = Math.PI * 2;
  const MAXI = 1600;                 // most runners drawn in one frame
  const MAXP = 1200;                 // most particles
  const MAXQ = 400;                  // most textured quads
  const FOG = [45, 150];             // where the haze starts, and where it is total
  const BODY = 1.2;                  // a runner's size: 1.08 m, chunky like the reference's

  /* Four sceneries, taken from the reference's own levels: ice spires over a
     misty drop; a lavender dusk with snowy peaks and a slate road; a pink road
     over caustic sea; and a meadow far below. */
  const THEMES = {
    ice: {
      sky: ['#7CC5EC', '#D2ECF8'], fog: '#CDE8F6', road: '#EDF2F6', alt: '#E2E9EF',
      rail: '#FFFFFF', side: '#A9BDCD', plaza: '#E9EEF3',
      rock: ['#5DB5E4', '#7CC7EE', '#DCF3FC'], kind: 'crystal'
    },
    dusk: {
      sky: ['#8C89C7', '#D6D3EE'], fog: '#C9C5E6', road: '#4D4968', alt: '#55516F',
      rail: '#EEECF7', side: '#383550', plaza: '#4A4664',
      rock: ['#8A86B6', '#A29FCA', '#F4F3FA'], kind: 'peak'
    },
    ocean: {
      sky: ['#5DB8F2', '#C2E6FB'], fog: '#B9E0F7', road: '#F8DCD6', alt: '#F2D0C9',
      rail: '#FFFFFF', side: '#E2B2A9', plaza: '#F6E4E0',
      water: ['#2E93E6', '#8ED8FF'], rock: ['#9A8C7C', '#B7AA98', '#D8CEC0'], kind: 'sea'
    },
    meadow: {
      sky: ['#78C3F1', '#D8F0FB'], fog: '#D0EBF8', road: '#F2F2EE', alt: '#E7E8E2',
      rail: '#FFFFFF', side: '#CBC5B4', plaza: '#EFEFEA',
      grass: '#79C653', rock: ['#3FA34D', '#57B85C', '#8B5A2B'], kind: 'meadow'
    }
  };

  const STEP_COLS = ['#FFD54F', '#9CCC65', '#FFB74D', '#B39DDB'];
  const GLASS_GOOD = '#5ED0FA', GLASS_BAD = '#FF5A5A';
  const POST = '#3E4653';
  const FOE = '#EF3E3A';

  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const ease = t => (t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t)));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------------------------------------- the runner */

  /* A runner is a big round head on a small body with capsule limbs — the
     reference's stickman, 0.9 m tall. Part numbers let the shader swing each
     limb about its joint; the joints in the shader are these numbers. */
  function runnerParts(skin) {
    const P = new G.Parts(), m = M4.create();
    P.add(Mesh.sphere(0.155, 14, 9), M4.compose(m, 0, 0.745, 0), 0);
    P.add(Mesh.capsule(0.112, 0.18, 12, 3), M4.compose(m, 0, 0.385, 0), 0);
    for (const side of [-1, 1]) {
      P.add(Mesh.capsule(0.043, 0.2, 8, 2), M4.compose(m, side * 0.125, 0.555, 0, 0, 0, Math.PI + side * 0.1), side < 0 ? 1 : 2);
      P.add(Mesh.capsule(0.052, 0.29, 8, 2), M4.compose(m, side * 0.062, 0.36, 0, 0, 0, Math.PI), side < 0 ? 3 : 4);
    }
    if (skin) hat(P, m, skin);
    return P;
  }

  /* The skins: something on the head, the way the reference's store dresses
     its runners. Each keeps its own colours whatever colour the crowd is.
     The head is a ball of 0.155 at y 0.745; its crown is at 0.9. */
  const SKINS = ['plain', 'cap', 'viking', 'crown', 'tophat', 'wizard', 'bunny', 'halo'];
  function hat(P, m, skin) {
    const y0 = 0.765;
    if (skin === 'cap') {
      const red = rgb('#E53935');
      P.add(Mesh.lathe([[0.166, 0], [0.16, 0.06], [0.12, 0.12], [0.06, 0.148], [0, 0.153]], 14), M4.compose(m, 0, y0, 0), 0, red);
      P.add(Mesh.box(0.22, 0.022, 0.15), M4.compose(m, 0, y0 + 0.012, 0.15, 0, 0.14), 0, red);
      P.add(Mesh.sphere(0.02, 6, 4), M4.compose(m, 0, y0 + 0.153, 0), 0, rgb('#FFFFFF'));
    } else if (skin === 'viking') {
      P.add(Mesh.lathe([[0.172, 0], [0.166, 0.05], [0.13, 0.12], [0.07, 0.158], [0, 0.168]], 14), M4.compose(m, 0, y0, 0), 0, rgb('#B0BEC5'));
      P.add(Mesh.cylinder(0.176, 0.176, 0.035, 14), M4.compose(m, 0, y0 - 0.005, 0), 0, rgb('#8D6E63'));
      for (const side of [-1, 1]) {
        P.add(Mesh.cylinder(0.035, 0, 0.16, 8), M4.compose(m, side * 0.15, y0 + 0.07, 0, 0, 0, -side * 0.85), 0, rgb('#FFF3E0'));
      }
    } else if (skin === 'crown') {
      const gold = rgb('#FFC107');
      P.add(Mesh.cylinder(0.12, 0.13, 0.06, 14), M4.compose(m, 0, 0.865, 0), 0, gold);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        P.add(Mesh.cylinder(0.035, 0, 0.08, 6), M4.compose(m, Math.sin(a) * 0.105, 0.92, Math.cos(a) * 0.105), 0, gold);
      }
    } else if (skin === 'tophat') {
      const black = rgb('#263238');
      P.add(Mesh.cylinder(0.2, 0.2, 0.02, 16), M4.compose(m, 0, 0.87, 0), 0, black);
      P.add(Mesh.cylinder(0.115, 0.12, 0.22, 16), M4.compose(m, 0, 0.87, 0), 0, black);
      P.add(Mesh.cylinder(0.122, 0.122, 0.045, 16), M4.compose(m, 0, 0.895, 0), 0, rgb('#E53935'));
    } else if (skin === 'wizard') {
      const purple = rgb('#7E57C2');
      P.add(Mesh.cylinder(0.21, 0.21, 0.015, 16), M4.compose(m, 0, 0.865, 0), 0, purple);
      P.add(Mesh.cylinder(0.14, 0, 0.38, 12), M4.compose(m, 0, 0.87, 0, 0, -0.12), 0, purple);
      P.add(Mesh.sphere(0.03, 6, 4), M4.compose(m, 0, 1.22, -0.04), 0, rgb('#FFD54F'));
    } else if (skin === 'bunny') {
      for (const side of [-1, 1]) {
        P.add(Mesh.capsule(0.036, 0.2, 8, 2), M4.compose(m, side * 0.06, 0.86, 0, 0, 0, -side * 0.18), 0, rgb('#FFFFFF'));
        P.add(Mesh.capsule(0.018, 0.17, 6, 2), M4.compose(m, side * 0.063, 0.88, 0.022, 0, 0, -side * 0.18), 0, rgb('#F8BBD0'));
      }
    } else if (skin === 'halo') {
      P.add(Mesh.lathe([[0.11, -0.012], [0.145, -0.012], [0.145, 0.012], [0.11, 0.012], [0.11, -0.012]], 18), M4.compose(m, 0, 1.0, 0), 0, rgb('#FFD54F'));
    }
  }

  /** Where the king's right hand is, for the hammer he holds: the same
      swing the shader gives his arm, in plain JS. */
  function kingHand(k, armAngle, scale) {
    // Shoulder (0.125, 0.555); the hand hangs 0.25 below it. Swung about x
    // by the arm angle, then out about z by 0.18, exactly as the shader does.
    const vx = 0.02, vy = -0.25 * Math.cos(armAngle), vz = -0.25 * Math.sin(armAngle);
    const cb = Math.cos(0.18), sb = Math.sin(0.18);
    const hx = vx * cb - vy * sb + 0.125, hy = vx * sb + vy * cb + 0.555, hz = vz;
    const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
    const x = hx * scale, y = hy * scale, z = hz * scale;
    return { x: k.x + x * c + z * s, y: y, z: k.z - x * s + z * c };
  }

  /* ------------------------------------------------------------- textures */

  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, sans-serif';

  /** Four paint splats and the squad disc, white, on one texture. */
  function atlas() {
    const cv = canvas2d(512, 128), c = cv.getContext('2d');
    const rnd = lcg(99);
    for (let k = 0; k < 4; k++) {
      const cx = k * 128 + 64, cy = 64;
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU, r = 26 + rnd() * 16;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.fill();
      for (let i = 0; i < 16; i++) {
        const a = rnd() * TAU, d = 30 + rnd() * 30, r = 2 + rnd() * 7;
        c.beginPath();
        c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, TAU);
        c.fill();
      }
    }
    return cv;
  }
  function discTexture() {
    const cv = canvas2d(256, 256), c = cv.getContext('2d');
    const g = c.createRadialGradient(128, 128, 20, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(128, 128, 127, 0, TAU); c.fill();
    return cv;
  }
  /** A word or a number, white with a soft edge, for a gate or a step. */
  function labelCanvas(text, italic, edge) {
    const cv = canvas2d(512, 256), c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let size = 170;
    c.font = (italic ? 'italic ' : '') + '900 ' + size + 'px ' + FONT;
    const w = c.measureText(text).width;
    if (w > 470) { size = Math.floor(size * 470 / w); c.font = (italic ? 'italic ' : '') + '900 ' + size + 'px ' + FONT; }
    c.lineJoin = 'round';
    c.lineWidth = size * 0.12;
    c.strokeStyle = edge || 'rgba(20,70,120,0.45)';
    c.strokeText(text, 256, 136);
    c.fillStyle = '#FFFFFF';
    c.fillText(text, 256, 136);
    return cv;
  }

  function gateText(g) {
    if (g.op === 'mul') return '×' + g.val;
    if (g.op === 'add') return '+' + g.val;
    if (g.op === 'sub') return '−' + g.val;
    return '÷' + g.val;
  }

  /* ---------------------------------------------------------------- scene */

  PV.CrowdScene = function (canvas) {
    const R = G.Renderer(canvas);
    const gl = R.gl, P = R.progs;

    const runners = SKINS.map(k => R.mesh(runnerParts(k === 'plain' ? null : k)));
    const quad = R.buffer(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1]));
    const skyBuf = R.buffer(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]));

    const inst = new Float32Array(MAXI * 12), instBuf = R.buffer(inst, true);
    const shad = new Float32Array(MAXI * 4), shadBuf = R.buffer(shad, true);
    const pts = new Float32Array(MAXP * 8), ptsBuf = R.buffer(pts, true);
    const qd = new Float32Array(MAXQ * 6 * 9), qdBuf = R.buffer(qd, true);

    const atlasTex = R.texture(atlas(), true);
    const discTex = R.texture(discTexture(), true);
    const labels = new Map();
    function label(text, italic, edge) {
      const key = (italic ? 'i' : 'n') + (edge || '') + text;
      if (!labels.has(key)) labels.set(key, R.texture(labelCanvas(text, italic, edge), true));
      return labels.get(key);
    }

    // Pieces of the moving world, built once.
    const mesh = {};
    function piece(name, build) { mesh[name] = R.mesh(build(new G.Batch(), M4.create())); }
    piece('saw', (b, m) => b.add(Mesh.saw(1, 22, 0.08), M4.compose(m, 0, 0, 0), rgb('#8FB2D6'))
      .add(Mesh.cylinder(0.3, 0.3, 0.1, 18), M4.compose(m, 0, 0.0, 0), rgb('#E8453C'))
      .add(Mesh.cylinder(0.12, 0.12, 0.14, 12), M4.compose(m, 0, 0.0, 0), rgb('#FFFFFF')));
    piece('bar', (b, m) => b.add(Mesh.box(2, 0.24, 0.24), M4.compose(m, 0, 0, 0), rgb('#FF7043'))
      .add(Mesh.box(0.26, 0.26, 0.26), M4.compose(m, 0.6, 0, 0), rgb('#FFFFFF'))
      .add(Mesh.box(0.26, 0.26, 0.26), M4.compose(m, -0.6, 0, 0), rgb('#FFFFFF')));
    piece('post', (b, m) => b.add(Mesh.cylinder(0.26, 0.22, 0.75, 14), M4.compose(m, 0, 0, 0), rgb('#56606E'))
      .add(Mesh.sphere(0.2, 12, 6), M4.compose(m, 0, 0.75, 0), rgb('#FF7043')));
    piece('hammer', (b, m) => b.add(Mesh.box(0.14, 3.4, 0.14), M4.compose(m, 0, -1.7, 0), rgb('#6D4C41'))
      .add(Mesh.cylinder(0.55, 0.55, 1.3, 18), M4.compose(m, -0.65, -3.9, 0, 0, 0, -Math.PI / 2), rgb('#E53935'))
      .add(Mesh.cylinder(0.58, 0.58, 0.14, 18), M4.compose(m, -0.66, -3.9, 0, 0, 0, -Math.PI / 2), rgb('#37474F'))
      .add(Mesh.cylinder(0.58, 0.58, 0.14, 18), M4.compose(m, 0.52, -3.9, 0, 0, 0, -Math.PI / 2), rgb('#37474F')));
    piece('press', (b, m) => b.add(Mesh.box(1, 1, 1), M4.compose(m, 0, 0.5, 0), rgb('#78909C'))
      .add(Mesh.box(1.02, 0.14, 1.02), M4.compose(m, 0, 0.07, 0), rgb('#E53935')));
    piece('spike', (b, m) => b.add(Mesh.cylinder(0.13, 0, 0.55, 8, true), M4.compose(m, 0, 0, 0), rgb('#CFD8DC')));
    piece('crown', (b, m) => {
      b.add(Mesh.cylinder(0.2, 0.22, 0.12, 16), M4.compose(m, 0, 0, 0), rgb('#FFC107'));
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        b.add(Mesh.cylinder(0.06, 0, 0.16, 6, true), M4.compose(m, Math.sin(a) * 0.17, 0.11, Math.cos(a) * 0.17), rgb('#FFC107'));
        b.add(Mesh.sphere(0.03, 6, 4), M4.compose(m, Math.sin(a) * 0.17, 0.28, Math.cos(a) * 0.17), rgb('#E53935'));
      }
      return b;
    });
    piece('maul', (b, m) => b.add(Mesh.box(0.07, 0.95, 0.07), M4.compose(m, 0, -0.35, 0), rgb('#6D4C41'))
      .add(Mesh.box(0.52, 0.3, 0.3), M4.compose(m, 0, -0.85, 0), rgb('#546E7A'))
      .add(Mesh.box(0.56, 0.08, 0.34), M4.compose(m, 0, -0.85, 0), rgb('#FFC107')));
    // The chest lid, hinged along its back edge: the origin is the hinge.
    piece('lid', (b, m) => b.add(Mesh.box(1.46, 0.3, 0.92), M4.compose(m, 0, 0.15, -0.46), rgb('#FFB300'))
      .add(Mesh.box(1.22, 0.2, 0.94), M4.compose(m, 0, 0.15, -0.46), rgb('#C62828'))
      .add(Mesh.box(0.2, 0.32, 0.96), M4.compose(m, 0, 0.15, -0.46), rgb('#FFB300')));
    piece('glass', (b, m) => b.add(Mesh.box(1, 1, 1), M4.compose(m, 0, 0, 0), [1, 1, 1]));
    piece('flag', (b, m) => b.add(Mesh.box(0.9, 0.55, 0.04), M4.compose(m, 0.45, 0, 0), [1, 1, 1]));

    let world = null;                // the baked level
    const VP = M4.create(), PROJ = M4.create(), VIEW = M4.create(), MODEL = M4.create();
    let W = 1, H = 1, dpr = 1, tanFov = 0.4;
    const cam = { eye: [0, 8, -8], at: [0, 0, 6], mode: '', from: null, since: 0, shake: 0 };

    /* Effects: this file's own, and nothing in the engine reads them. */
    let splats = [], fliers = [], parts = [], seen = 0;
    let time = 0;

    /* ------------------------------------------------------------ baking */

    function bake(game) {
      drop();
      const course = game.course, th = THEMES[course.theme] || THEMES.ice;
      const S = new G.Batch(), road = new G.Batch(), m = M4.create();
      const rnd = lcg(Math.floor(course.finish * 1000) ^ (course.level || 7) * 7919);
      const start = -34, end = course.length + 30;
      const col = k => rgb(th[k]);

      // The road top (drawn with its chevrons) and the causeway under it.
      const roadTo = course.boss ? course.plaza : course.stairs;
      for (let z = start; z < roadTo; z += 24) {
        const z1 = Math.min(roadTo, z + 24);
        road.add(Mesh.plane(HALF * 2, z1 - z), M4.compose(m, 0, 0, (z + z1) / 2), col('road'));
      }
      S.add(Mesh.box(HALF * 2 + 0.7, 1.6, roadTo - start), M4.compose(m, 0, -0.81, (start + roadTo) / 2), col('side'));
      // Raised white rails down both edges, as the reference has them.
      for (const s of [-1, 1]) {
        S.add(Mesh.box(0.36, 0.2, roadTo - start), M4.compose(m, s * (HALF + 0.17), 0.1, (start + roadTo) / 2), col('rail'));
      }

      // The finish line: a strip of black and white squares.
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 2; j++) {
          const x = -HALF + (i + 0.5) * (HALF * 2 / 20);
          S.add(Mesh.plane(HALF * 2 / 20, 0.42), M4.compose(m, x, 0.012, course.finish + (j - 0.5) * 0.42),
            rgb((i + j) % 2 ? '#20242B' : '#FFFFFF'));
        }
      }

      // Gate posts. The glass and its number are drawn per frame: a gate
      // taken shatters and is gone.
      for (const f of course.features) {
        if (f.kind === 'gates') {
          const xs = [];
          for (const g of f.lanes) { if (xs.indexOf(g.x0) < 0) xs.push(g.x0); if (xs.indexOf(g.x1) < 0) xs.push(g.x1); }
          for (const x of xs) {
            const px = Math.max(-HALF - 0.05, Math.min(HALF + 0.05, x));
            S.add(Mesh.box(0.28, 2.25, 0.3), M4.compose(m, px, 1.125, f.z), rgb(POST));
            S.add(Mesh.box(0.32, 0.08, 0.34), M4.compose(m, px, 2.25, f.z), rgb('#5B6573'));
          }
        } else if (f.kind === 'boost') {
          const w = f.x1 - f.x0;
          S.add(Mesh.box(w, 0.05, f.d), M4.compose(m, (f.x0 + f.x1) / 2, 0.025, f.z), rgb('#FFC21A'));
          for (let k = 0; k < 3; k++) {
            for (const s of [-1, 1]) {
              S.add(Mesh.box(w * 0.36, 0.02, 0.18), M4.compose(m, (f.x0 + f.x1) / 2 + s * w * 0.16, 0.06,
                f.z - f.d * 0.3 + k * f.d * 0.3, s * 0.55), rgb('#F57C00'));
            }
          }
        } else if (f.kind === 'hammer') {
          // The gantry the pendulum hangs from.
          for (const s of [-1, 1]) S.add(Mesh.box(0.3, 4.9, 0.3), M4.compose(m, s * (HALF + 0.45), 2.45, f.z), rgb('#455A64'));
          S.add(Mesh.box(HALF * 2 + 1.2, 0.34, 0.34), M4.compose(m, 0, 4.75, f.z), rgb('#455A64'));
        } else if (f.kind === 'press') {
          for (const s of [-1, 1]) S.add(Mesh.box(0.34, 3.6, 0.34), M4.compose(m, s * (HALF + 0.35), 1.8, f.z), rgb('#455A64'));
          S.add(Mesh.box(HALF * 2 + 1.0, 0.3, f.d + 0.2), M4.compose(m, 0, 3.55, f.z), rgb('#455A64'));
          S.add(Mesh.box(HALF * 2, 0.02, f.d), M4.compose(m, 0, 0.011, f.z), rgb('#FFC107'));
        } else if (f.kind === 'spikes') {
          S.add(Mesh.box(f.x1 - f.x0, 0.06, f.d), M4.compose(m, (f.x0 + f.x1) / 2, 0.03, f.z), rgb('#607D8B'));
        } else if (f.kind === 'saws') {
          for (const s of f.saws) {
            if (s.amp) S.add(Mesh.box(s.amp * 2 + s.r * 2, 0.02, 0.5), M4.compose(m, s.x, 0.011, f.z), rgb('#9AA5B1'));
          }
        }
      }

      if (course.boss) bakeCastle(S, road, m, course, th);
      else bakeStairs(S, m, course, th);
      bakeScenery(S, m, course, th, rnd, start, end);

      const water = th.water ? R.mesh(new G.Batch().add(Mesh.plane(460, end - start + 300), M4.compose(m, 0, -2.4, (start + end) / 2), rgb(th.water[0]))) : null;
      const grass = th.grass ? R.mesh(new G.Batch().add(Mesh.plane(460, end - start + 300), M4.compose(m, 0, -9, (start + end) / 2), rgb(th.grass))) : null;

      world = {
        th: th, course: course,
        stat: R.mesh(S), road: R.mesh(road), water: water, grass: grass,
        roadAlt: rgb(th.alt), sky: [rgb(th.sky[0]), rgb(th.sky[1])], fog: rgb(th.fog),
        waterAlt: th.water ? rgb(th.water[1]) : null
      };
    }

    function bakeStairs(S, m, course, th) {
      const z0 = course.stairs;
      // The road runs on to the foot of the stairs.
      S.add(Mesh.box(HALF * 2 + 0.7, 1.6, 2), M4.compose(m, 0, -0.81, z0 - 1), rgb(th.side));
      for (let k = 0; k < C.STEPS; k++) {
        const top = (k + 1) * C.STEP_RISE, z = z0 + (k + 0.5) * C.STEP_DEPTH;
        const h = top + 1.6;
        S.add(Mesh.box(7.6, h, C.STEP_DEPTH), M4.compose(m, 0, top - h / 2, z), rgb(STEP_COLS[k % 4]));
      }
      // The purple walk to the chest, and its round two-tier pedestal.
      const top = C.STEPS * C.STEP_RISE, zt = course.top;
      S.add(Mesh.box(4.4, top + 1.6, course.chest - zt + 1), M4.compose(m, 0, top - (top + 1.6) / 2, (zt + course.chest + 1) / 2), rgb('#B96BC9'));
      for (const s of [-1, 1]) S.add(Mesh.box(0.24, 0.16, course.chest - zt + 1), M4.compose(m, s * 2.2, top + 0.08, (zt + course.chest + 1) / 2), rgb('#F4E6F7'));
      S.add(Mesh.cylinder(2.3, 2.3, top + 1.6, 28), M4.compose(m, 0, -1.6, course.chest), rgb('#B96BC9'));
      S.add(Mesh.cylinder(1.9, 1.9, 0.28, 28), M4.compose(m, 0, top, course.chest), rgb('#5C6BC0'));
      S.add(Mesh.cylinder(1.45, 1.45, 0.26, 28), M4.compose(m, 0, top + 0.28, course.chest), rgb('#3F51B5'));
      // The chest's body; its lid opens per frame.
      const cy = top + 0.54;
      S.add(Mesh.box(1.44, 0.8, 0.9), M4.compose(m, 0, cy + 0.4, course.chest), rgb('#FFB300'));
      S.add(Mesh.box(1.2, 0.62, 0.92), M4.compose(m, 0, cy + 0.4, course.chest), rgb('#C62828'));
      S.add(Mesh.box(0.18, 0.84, 0.94), M4.compose(m, 0, cy + 0.4, course.chest), rgb('#FFB300'));
      S.add(Mesh.box(0.26, 0.3, 0.1), M4.compose(m, 0, cy + 0.58, course.chest - 0.5), rgb('#FFE082'));
    }

    function bakeCastle(S, road, m, course, th) {
      const pz = course.plaza, cz = course.castleZ;
      // The road runs into a round plaza with a rail round it.
      S.add(Mesh.cylinder(9.4, 9.4, 1.6, 48), M4.compose(m, 0, -1.6, pz), rgb(th.side));
      S.add(Mesh.cylinder(9.0, 9.0, 0.02, 48), M4.compose(m, 0, -0.01, pz), rgb(th.plaza));
      S.add(Mesh.lathe([[9.0, 0], [9.0, 0.2], [9.4, 0.2], [9.4, 0]], 48), M4.compose(m, 0, 0, pz), rgb(th.rail));
      S.add(Mesh.box(HALF * 2 + 0.7, 1.6, 12), M4.compose(m, 0, -0.81, cz + 1), rgb(th.side));
      S.add(Mesh.box(12.5, 0.04, 9), M4.compose(m, 0, 0.0, cz + 1.5), rgb(th.plaza));

      const wall = rgb('#5E6AC8'), lite = rgb('#7C88DA'), dome = rgb('#FF9A1F'), gold = rgb('#FFD54F');
      // Curtain wall with battlements, and a dark arched gate.
      S.add(Mesh.box(10, 4.2, 1.6), M4.compose(m, 0, 2.1, cz), wall);
      for (let i = 0; i < 9; i++) S.add(Mesh.box(0.62, 0.55, 1.7), M4.compose(m, -4.4 + i * 1.1, 4.45, cz), lite);
      S.add(Mesh.box(2.3, 2.6, 0.2), M4.compose(m, 0, 1.3, cz - 0.8), rgb('#2B3040'));
      S.add(Mesh.cylinder(1.15, 1.15, 0.2, 20), M4.compose(m, 0, 2.6, cz - 0.7, 0, Math.PI / 2, 0), rgb('#2B3040'));
      // Four towers with onion domes, the back two taller.
      const towers = [[-5.2, cz, 1.35, 6.2], [5.2, cz, 1.35, 6.2], [-2.6, cz + 3.2, 1.6, 8.2], [2.6, cz + 3.2, 1.6, 8.2]];
      for (const t of towers) {
        const [x, z, r, h] = t;
        S.add(Mesh.cylinder(r, r, h, 22), M4.compose(m, x, 0, z), wall);
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU;
          S.add(Mesh.box(0.42, 0.45, 0.42), M4.compose(m, x + Math.sin(a) * r * 0.92, h + 0.2, z + Math.cos(a) * r * 0.92, a), lite);
        }
        S.add(Mesh.cylinder(r * 1.02, r * 1.02, 0.3, 22), M4.compose(m, x, h - 0.1, z), lite);
        const d = [[0, 0], [r * 0.95, 0.15], [r * 1.18, 0.75], [r * 1.02, 1.45], [r * 0.55, 2.05], [r * 0.18, 2.45], [0, 2.7]];
        S.add(Mesh.lathe(d, 22), M4.compose(m, x, h + 0.3, z), dome);
        S.add(Mesh.cylinder(0.08, 0, 0.9, 8, true), M4.compose(m, x, h + 2.95, z), gold);
        S.add(Mesh.sphere(0.14, 10, 6), M4.compose(m, x, h + 2.95, z), gold);
        // Windows.
        S.add(Mesh.box(0.4, 0.8, 0.1), M4.compose(m, x, h * 0.62, z - r - 0.02), rgb('#2B3040'));
      }
    }

    function bakeScenery(S, m, course, th, rnd, start, end) {
      const kind = th.kind;
      if (kind === 'crystal' || kind === 'peak') {
        const body = rgb(th.rock[0]), light = rgb(th.rock[1]), cap = rgb(th.rock[2]);
        for (let z = start - 20; z < end + 90; z += 3.2) {
          for (const s of [-1, 1]) {
            if (rnd() < 0.2) continue;
            const x = s * (7.5 + rnd() * 28), r = 1.8 + rnd() * 3;
            const top = kind === 'peak' ? -8 + rnd() * 9 : -11 + rnd() * 9 + Math.min(4, (Math.abs(x) - 7) * 0.12);
            const zz = z + rnd() * 3;
            if (Math.abs(zz - course.plaza) < 14 && Math.abs(x) < 16 && course.boss) continue;
            const c = rnd() < 0.5 ? body : light;
            if (kind === 'crystal') {
              S.add(Mesh.lathe([[r, -44], [r, top], [r * 0.72, top + r * 0.28], [0, top + r * 0.34]], 6, true),
                M4.compose(m, x, 0, zz, rnd() * TAU), c);
              S.add(Mesh.lathe([[r * 0.73, top + r * 0.27], [r * 0.5, top + r * 0.34], [0, top + r * 0.36]], 6, true),
                M4.compose(m, x, 0.02, zz, rnd() * TAU), cap);
            } else {
              const tip = top + r * 2.4;
              S.add(Mesh.lathe([[r, -44], [r, top], [0, tip]], 5, true), M4.compose(m, x, 0, zz, rnd() * TAU), c);
              S.add(Mesh.lathe([[r * 0.34, tip - r * 0.8], [0, tip + 0.02]], 5, true), M4.compose(m, x, 0.01, zz, rnd() * TAU), cap);
            }
          }
        }
        // Far spires, big and pale, for a skyline in the haze.
        for (let z = start; z < end + 160; z += 14) {
          for (const s of [-1, 1]) {
            const x = s * (40 + rnd() * 50), r = 5 + rnd() * 7, top = 4 + rnd() * 18;
            S.add(Mesh.lathe([[r, -60], [r, top], [0, top + r * (kind === 'peak' ? 2.2 : 0.4)]], 6, true), M4.compose(m, x, 0, z + rnd() * 10, rnd() * TAU), light);
          }
        }
      } else if (kind === 'sea') {
        const a = rgb(th.rock[0]), b = rgb(th.rock[1]);
        for (let z = start; z < end + 120; z += 9) {
          for (const s of [-1, 1]) {
            if (rnd() < 0.45) continue;
            const x = s * (9 + rnd() * 50), r = 0.8 + rnd() * 2.2;
            S.add(Mesh.sphere(r, 7, 4), M4.compose(m, x, -2.5, z + rnd() * 9, rnd() * TAU, 0, 0, 1, 0.55, 1), rnd() < 0.5 ? a : b);
          }
        }
        // Pillars holding the causeway up out of the sea.
        for (let z = start; z < course.length; z += 18) {
          for (const s of [-1, 1]) S.add(Mesh.box(0.9, 3, 0.9), M4.compose(m, s * (HALF - 0.6), -2.3, z), rgb(th.side));
        }
      } else {
        const leaf = rgb(th.rock[0]), leaf2 = rgb(th.rock[1]), trunk = rgb(th.rock[2]);
        for (let z = start; z < end + 120; z += 5) {
          for (const s of [-1, 1]) {
            if (rnd() < 0.35) continue;
            const x = s * (8 + rnd() * 45), hgt = 2.5 + rnd() * 3, zz = z + rnd() * 5;
            const y = -9;
            S.add(Mesh.cylinder(0.3, 0.25, hgt * 0.45, 6), M4.compose(m, x, y, zz), trunk);
            S.add(Mesh.cylinder(1.4 + rnd(), 0, hgt, 7, true), M4.compose(m, x, y + hgt * 0.35, zz), rnd() < 0.5 ? leaf : leaf2);
          }
        }
        for (let z = start; z < end + 160; z += 22) {
          for (const s of [-1, 1]) {
            S.add(Mesh.sphere(10 + rnd() * 12, 12, 6), M4.compose(m, s * (30 + rnd() * 40), -12, z + rnd() * 20, 0, 0, 0, 1, 0.45, 1), rgb('#6DBB4B'));
          }
        }
        for (let z = start; z < course.length; z += 16) {
          for (const s of [-1, 1]) S.add(Mesh.box(0.8, 8, 0.8), M4.compose(m, s * (HALF - 0.7), -5, z), rgb(th.side));
        }
      }
    }

    function drop() {
      if (!world) return;
      R.drop(world.stat); R.drop(world.road); R.drop(world.water); R.drop(world.grass);
      world = null;
      for (const t of labels.values()) gl.deleteTexture(t);
      labels.clear();
    }

    /* ----------------------------------------------------------- the camera */

    /**
     * Where the camera wants to be for what is happening. On the road it is
     * the reference's: behind and above, looking down the track, the road
     * held in the middle of the screen. At the stairs it swings round to the
     * left to watch the tower; at the castle it stands off at three quarters.
     */
    function wanted(game, v) {
      const course = game.course;
      if (game.phase === 'tower' || (game.tower && game.phase !== 'ready')) {
        const T = v.tower;
        const y = T ? T.camY : 3, z = T ? T.camZ : course.stairs, b = T ? T.camBack : 0;
        // From the right and behind, as the reference films it: the stairs
        // climb away to the upper right, the tower in front of them. A tall
        // tower pulls the camera back to keep it in frame.
        return { mode: 'tower', eye: [8.5 + b * 0.5, y + 3.2, z - 10 - b], at: [0, y + 0.2, z + 2.2] };
      }
      if (game.king || game.phase === 'boss') {
        const k = game.king || { x: 0, z: course.kingZ };
        const orbit = game.phase === 'won' ? Math.min(1, game.endT / 120) * 0.5 : 0;
        const ex = 10.5 * Math.cos(orbit) + 3 * Math.sin(orbit), ez = -12.5 * Math.cos(orbit);
        // Three quarters from the right: the plaza in front, the castle and
        // its domes behind the king, as the reference frames the fight.
        return { mode: 'boss', eye: [k.x + ex, 9.6, k.z + ez], at: [k.x * 0.5 + 0.8, 2.2, k.z + 1.8] };
      }
      const x = v.x * 0.1;
      return { mode: 'run', eye: [x, 6.6, v.z - 8.0], at: [x * 0.6, 0, v.z + 6.0] };
    }

    function aim(game, v, dt) {
      const w = wanted(game, v);
      if (w.mode !== cam.mode) {
        cam.from = cam.mode ? { eye: cam.eye.slice(), at: cam.at.slice() } : null;
        cam.mode = w.mode;
        cam.since = 0;
      }
      cam.since += dt;
      const t = cam.from ? ease(Math.min(1, cam.since / 1.3)) : 1;
      for (let i = 0; i < 3; i++) {
        cam.eye[i] = cam.from ? lerp(cam.from.eye[i], w.eye[i], t) : w.eye[i];
        cam.at[i] = cam.from ? lerp(cam.from.at[i], w.at[i], t) : w.at[i];
      }
      if (t >= 1) cam.from = null;
      if (cam.shake > 0) {
        cam.shake = Math.max(0, cam.shake - dt * 2.5);
        const s = cam.shake * 0.18;
        cam.eye[0] += Math.sin(time * 71) * s; cam.eye[1] += Math.cos(time * 53) * s;
      }
      // Wide enough to show the road on a phone held upright.
      const aspect = W / H;
      const needH = (HALF + 1.1) / 10.4;              // tan of half the width we must see
      const tanV = Math.max(Math.tan(26 * Math.PI / 180), needH / aspect);
      tanFov = tanV;
      M4.perspective(PROJ, 2 * Math.atan(tanV), aspect, 0.3, 420);
      M4.lookAt(VIEW, cam.eye[0], cam.eye[1], cam.eye[2], cam.at[0], cam.at[1], cam.at[2]);
      M4.multiply(VP, PROJ, VIEW);
    }

    /* ------------------------------------------------------------ drawing */

    let ni = 0;
    /** One runner: where, which way it faces, its stride, size, pose, colour. */
    function put(x, y, z, yaw, ph, sw, sc, pose, c, flash) {
      if (ni >= MAXI) return;
      const o = ni * 12;
      inst[o] = x; inst[o + 1] = y; inst[o + 2] = z; inst[o + 3] = yaw;
      inst[o + 4] = ph; inst[o + 5] = sw; inst[o + 6] = sc; inst[o + 7] = pose;
      inst[o + 8] = c[0]; inst[o + 9] = c[1]; inst[o + 10] = c[2]; inst[o + 11] = flash || 0;
      const s = ni * 4;
      shad[s] = x; shad[s + 1] = Math.max(0.012, groundAt(x, z) + 0.012); shad[s + 2] = z; shad[s + 3] = 0.3 * sc;
      ni++;
    }

    /** How high the ground is at (x, z): the road, or a step. */
    function groundAt(x, z) {
      const course = world && world.course;
      if (!course || course.boss) return 0;
      if (z < course.stairs) return 0;
      if (z < course.top) return Math.floor((z - course.stairs) / C.STEP_DEPTH + 1) * C.STEP_RISE;
      return C.STEPS * C.STEP_RISE;
    }

    let np = 0;
    function particle(x, y, z, size, c, a) {
      if (np >= MAXP) return;
      const o = np * 8;
      pts[o] = x; pts[o + 1] = y; pts[o + 2] = z; pts[o + 3] = size;
      pts[o + 4] = c[0]; pts[o + 5] = c[1]; pts[o + 6] = c[2]; pts[o + 7] = a;
      np++;
    }

    let nq = 0;
    function quadAt(corners, u0, v0, u1, v1, c, a) {
      if (nq >= MAXQ) return;
      const uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const order = [0, 1, 2, 0, 2, 3];
      let o = nq * 6 * 9;
      for (const k of order) {
        const p = corners[k];
        qd[o++] = p[0]; qd[o++] = p[1]; qd[o++] = p[2];
        qd[o++] = uv[k][0]; qd[o++] = uv[k][1];
        qd[o++] = c[0]; qd[o++] = c[1]; qd[o++] = c[2]; qd[o++] = a;
      }
      nq++;
    }
    /** A flat decal on the ground, turned by `rot`. */
    function groundQuad(x, y, z, r, rot, u0, u1, c, a) {
      const cs = Math.cos(rot) * r, sn = Math.sin(rot) * r;
      quadAt([[x - cs + sn, y, z - sn - cs], [x + cs + sn, y, z + sn - cs], [x + cs - sn, y, z + sn + cs], [x - cs - sn, y, z - sn + cs]],
        u0, 0, u1, 1, c, a);
    }

    function useLit() {
      gl.useProgram(P.lit.prog);
      const u = P.lit.uni;
      gl.uniformMatrix4fv(u.uVP, false, VP);
      lightUniforms(u);
      gl.uniform1f(u.uTime, time);
      return u;
    }
    function lightUniforms(u) {
      gl.uniform3f(u.uSun, 0.36, 0.84, -0.41);
      gl.uniform3fv(u.uFog, world.fog);
      gl.uniform2f(u.uFogR, FOG[0], FOG[1]);
      gl.uniform3f(u.uEye, cam.eye[0], cam.eye[1], cam.eye[2]);
    }
    function drawMesh(u, msh, model, tint, a, mode) {
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniform4f(u.uTint, tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1, a == null ? 1 : a);
      gl.uniform1f(u.uMode, mode || 0);
      R.bind(P.lit, [['aPos', msh.buf, 3, 9, 0], ['aNrm', msh.buf, 3, 9, 3], ['aCol', msh.buf, 3, 9, 6]]);
      gl.drawArrays(gl.TRIANGLES, 0, msh.count);
    }

    const IDENT = M4.create();

    /* ------------------------------------------------------------ effects */

    function splat(x, z, c, big) {
      const y = groundAt(x, z) + 0.014 + splats.length * 0.00001;
      splats.push({ x: x, y: y, z: z, c: c, r: (big ? 0.75 : 0.42) + Math.random() * 0.25, rot: Math.random() * TAU, k: Math.floor(Math.random() * 4), t: time });
      if (splats.length > 160) splats.shift();
    }
    function puff(x, y, z, c, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = (0.6 + Math.random()) * (speed || 1.4);
        parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.2, vz: Math.sin(a) * s,
          c: c, size: 0.12 + Math.random() * 0.1, life: 0.5 + Math.random() * 0.3, age: 0, g: 7, sq: false });
      }
      if (parts.length > MAXP) parts.splice(0, parts.length - MAXP);
    }

    /** Read what the engine has done since the last frame into effects. */
    function events(game, look) {
      const ev = game.events;
      let i = ev.length - 1;
      while (i >= 0 && ev[i].s > seen) i--;
      const mine = look.color, foe = rgb(FOE);
      for (i++; i < ev.length; i++) {
        const e = ev[i];
        seen = e.s;
        const c = e.side ? foe : mine;
        if (e.k === 'die') {
          splat(e.x, e.z, c, false);
          puff(e.x, 0.5, e.z, c, 3, 1.2);
        } else if (e.k === 'poof') {
          puff(e.x, 0.5, e.z, [1, 1, 1], 4, 1.0);
        } else if (e.k === 'fly') {
          fliers.push({ x: e.x, y: 0.1, z: e.z, vx: e.dx * (5 + Math.random() * 3), vy: 6 + Math.random() * 3,
            vz: e.dz * (5 + Math.random() * 3), spin: 0, c: c, age: 0 });
          puff(e.x, 0.6, e.z, [1, 1, 1], 3, 2);
        } else if (e.k === 'gate') {
          const f = game.course.features[e.i], g = f.lanes[e.lane];
          const glass = rgb(C.isGood(g.op) ? GLASS_GOOD : GLASS_BAD);
          for (let k = 0; k < 26; k++) {
            const x = g.x0 + Math.random() * (g.x1 - g.x0);
            parts.push({ x: x, y: 0.3 + Math.random() * 1.6, z: f.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3,
              vz: 2 + Math.random() * 4, c: glass, size: -(0.08 + Math.random() * 0.1), life: 0.7, age: 0, g: 9, sq: true });
          }
        } else if (e.k === 'swing') {
          cam.shake = Math.min(1, cam.shake + 0.55);
        } else if (e.k === 'kingDown') {
          confetti(e.x, 3, e.z, 160);
        } else if (e.k === 'climbed' && e.top) {
          // the chest's coins go when the lid opens, in draw()
        }
      }
    }

    function confetti(x, y, z, n) {
      const cols = ['#FF5252', '#FFD740', '#69F0AE', '#40C4FF', '#E040FB', '#FFFFFF'].map(rgb);
      for (let i = 0; i < n; i++) {
        parts.push({ x: x + (Math.random() - 0.5) * 6, y: y + Math.random() * 3, z: z + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 5,
          c: cols[i % cols.length], size: -(0.1 + Math.random() * 0.08), life: 2.4, age: 0, g: 5, sq: true, drag: true });
      }
    }

    function stepEffects(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.vy -= p.g * dt;
        if (p.drag) { p.vx *= 0.985; p.vz *= 0.985; if (p.vy < -2) p.vy = -2; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      for (let i = fliers.length - 1; i >= 0; i--) {
        const f = fliers[i];
        f.age += dt;
        f.vy -= 16 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        f.spin += dt * 9;
        const onRoad = Math.abs(f.x) < 9 && f.y <= 0;
        if (onRoad && f.vy < 0) { splat(f.x, f.z, f.c, true); fliers.splice(i, 1); continue; }
        if (f.y < -30) fliers.splice(i, 1);
      }
    }

    /* ------------------------------------------------------------ one frame */

    /**
     * Draw the game at `alpha` of the way between its last two ticks. `look`
     * is { color: [r,g,b] } for the player's crowd. `dt` is real seconds
     * since the last frame, for the camera and the effects only.
     */
    function frame(game, alpha, dt, look) {
      if (!world || world.course !== game.course) bake(game);
      time += dt;
      const a = Math.max(0, Math.min(1, alpha));
      const tick = Math.max(0, game.tick - 1 + a);
      const v = {
        x: game.lastX + (game.x - game.lastX) * a,
        z: game.lastZ + (game.z - game.lastZ) * a,
        tower: null
      };
      const course = game.course, th = world.th;
      const mine = look.color, foe = rgb(FOE);
      const stride = 0.3 * game.speed / PV.CrowdRush.RUN;

      events(game, look);
      stepEffects(dt);

      // Where the tower is, before the camera needs it.
      if (game.tower) v.tower = towerState(game, a);
      aim(game, v, dt);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(world.fog[0], world.fog[1], world.fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Sky.
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(P.sky.prog);
      gl.uniform3fv(P.sky.uni.uTop, world.sky[0]);
      gl.uniform3fv(P.sky.uni.uBottom, world.sky[1]);
      R.bind(P.sky, [['aPos', skyBuf, 3, 3, 0]]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);

      const u = useLit();
      gl.uniform3fv(u.uAlt, world.roadAlt);
      drawMesh(u, world.stat, IDENT);
      drawMesh(u, world.road, IDENT, null, 1, 1);
      if (world.water) { gl.uniform3fv(u.uAlt, world.waterAlt); drawMesh(u, world.water, IDENT, null, 1, 2); }
      if (world.grass) drawMesh(u, world.grass, IDENT);

      // Traps, where the engine has them this instant.
      const near = v.z - 12, far = v.z + 95;
      for (const f of course.features) {
        if (f.z < near - 6 || f.z > far) continue;
        if (f.kind === 'saws') {
          for (const s of f.saws) {
            const x = PV.CrowdRush.sawX(f, s, tick);
            drawMesh(u, mesh.saw, M4.compose(MODEL, x, 0.07, f.z, tick * 0.35, 0, 0, s.r, 1, s.r));
          }
        } else if (f.kind === 'bar') {
          const ang = PV.CrowdRush.barAngle(f, tick);
          drawMesh(u, mesh.post, M4.compose(MODEL, f.x || 0, 0, f.z));
          drawMesh(u, mesh.bar, M4.compose(MODEL, f.x || 0, 0.42, f.z, -ang, 0, 0, f.len, 1, 1));
        } else if (f.kind === 'hammer') {
          const hx = PV.CrowdRush.hammerX(f, tick);
          const th2 = Math.asin(Math.max(-1, Math.min(1, hx / PV.CrowdRush.HAMMER_L)));
          drawMesh(u, mesh.hammer, M4.compose(MODEL, 0, 4.6, f.z, 0, 0, th2));
        } else if (f.kind === 'press') {
          for (const b of f.blocks) {
            const lift = PV.CrowdRush.pressLift(f, b, tick);
            drawMesh(u, mesh.press, M4.compose(MODEL, b.x, lift * 2.3, f.z, 0, 0, 0, b.w - 0.1, 1.0, f.d));
          }
        } else if (f.kind === 'spikes') {
          const up = PV.CrowdRush.spikesUp(f, tick);
          const y = -0.55 + up * 0.6;
          for (let x = f.x0 + 0.25; x < f.x1 - 0.1; x += 0.46) {
            for (let z = f.z - f.d / 2 + 0.25; z < f.z + f.d / 2 - 0.1; z += 0.46) {
              drawMesh(u, mesh.spike, M4.compose(MODEL, x, y, z));
            }
          }
        }
      }

      // The chest's lid, and the king's crown and maul.
      let kingDraw = null;
      if (!course.boss) {
        const T = v.tower, open = T ? T.lid : 0;
        const top = C.STEPS * C.STEP_RISE + 0.54 + 0.8;
        drawMesh(u, mesh.lid, M4.compose(MODEL, 0, top, course.chest + 0.45, 0, open * 1.9, 0));
      } else {
        kingDraw = kingPose(game, tick, a);
        const k = kingDraw;
        if (!k.gone) {
          const headY = (0.745 + 0.09) * k.scale;
          const cx = Math.sin(k.yaw), cz = Math.cos(k.yaw);
          if (k.fall > 0) {
            // Knocked flat: the crown rolls off beside him.
            drawMesh(u, mesh.crown, M4.compose(MODEL, k.x - cx * 1.9 * k.fall, 0.12, k.z - cz * 1.9 * k.fall, k.yaw, 0, 1.3 * k.fall, k.scale));
          } else {
            drawMesh(u, mesh.crown, M4.compose(MODEL, k.x, headY + k.lift, k.z, k.yaw, 0, 0, k.scale));
            const hand = kingHand(k, k.arm, k.scale);
            drawMesh(u, mesh.maul, M4.compose(MODEL, hand.x, hand.y + k.lift, hand.z, k.yaw, k.arm, 0, k.scale * 0.9));
          }
        }
        // Flags over the castle: his until he falls.
        const won = game.phase === 'won' && game.king && game.king.down;
        const flagC = won ? mine : rgb('#E53935');
        for (const t of [[-2.6, course.castleZ + 3.2, 8.2], [2.6, course.castleZ + 3.2, 8.2]]) {
          const wave = Math.sin(time * 3 + t[0]) * 0.15;
          drawMesh(u, mesh.flag, M4.compose(MODEL, t[0], t[2] + 3.9, t[1], wave), flagC);
        }
      }

      // Chest coins spilling out once it is open.
      if (v.tower && v.tower.lid > 0.6 && !v.tower.coinsOut) {
        v.tower.coinsOut = true;
      }

      /* ---- the runners ---- */
      ni = 0;
      const ph0 = tick * stride;
      const mode = game.phase;
      if (v.tower) drawTower(game, v.tower, mine, tick, stride);
      else {
        const pose = mode === 'ready' || mode === 'gauge' ? 1 : (mode === 'boss' ? 2 : (mode === 'won' ? 5 : 0));
        const k = game.king;
        for (let i = 0; i < game.units; i++) {
          const x = game.pux[i] + (game.ux[i] - game.pux[i]) * a;
          const z = game.puz[i] + (game.uz[i] - game.puz[i]) * a;
          const id = game.uid[i];
          let yaw = 0, p = pose;
          if (k && (mode === 'boss' || mode === 'won')) {
            yaw = Math.atan2(k.x - x, k.z - z);
            const d = Math.hypot(k.x - x, k.z - z);
            if (mode === 'boss' && d > 1.6) p = 0;
          }
          // A runner born this instant grows in from nothing.
          const born = Math.min(1, (tick - game.born[i]) / 8 + 0.2);
          put(x, 0, z, yaw, ph0 + id * 1.7, p === 1 ? 0 : 0.75, born * BODY, p, mine);
        }
      }

      // Everyone before this is yours, and wears your skin.
      const nMine = ni;

      // Red squads: standing in their discs until met; the one being fought
      // is the engine's.
      const fight = game.clash;
      for (let fi = 0; fi < course.features.length; fi++) {
        const f = course.features[fi];
        if (f.kind !== 'squad' || game.beatenAt[fi]) continue;
        if (f.z < near || f.z > far + 20) continue;
        if (fight && fight.i === fi) {
          for (let i = 0; i < game.foes; i++) {
            const x = game.pfx[i] + (game.fx[i] - game.pfx[i]) * a;
            const z = game.pfz[i] + (game.fz[i] - game.pfz[i]) * a;
            put(x, 0, z, Math.PI, ph0 * 1.1 + game.fid[i] * 1.3, 0.75, BODY, 0, foe);
          }
        } else {
          const s = { x: 0, z: 0 }, n = Math.min(f.n, PV.CrowdRush.CAP);
          for (let i = 0; i < n; i++) {
            PV.CrowdRush.squadSlot(f.n, i, s);
            put(s.x, 0, f.z + s.z, Math.PI, time * 3 + i * 0.7, 0, BODY, 1, foe);
          }
        }
      }

      // The king himself.
      if (kingDraw && !kingDraw.gone) {
        const k = kingDraw;
        put(k.x, k.lift, k.z, k.yaw, k.fall > 0 ? k.fall * 1.45 : k.arm, 0, k.scale, k.fall > 0 ? 7 : 6, rgb('#E53935'), k.flash);
      }

      // Runners the king sent flying.
      for (const fl of fliers) put(fl.x, fl.y, fl.z, 0, fl.spin, 0, BODY, 3, fl.c);

      /* ---- shadows and decals under everyone ---- */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -2);

      // Discs under the squads, and paint where people fell.
      nq = 0;
      for (let fi = 0; fi < course.features.length; fi++) {
        const f = course.features[fi];
        if (f.kind !== 'squad' || game.beatenAt[fi]) continue;
        if (f.z < near || f.z > far + 20) continue;
        const c = fight && fight.i === fi ? fight : null;
        groundQuad(c ? c.x : 0, 0.01, c ? c.z : f.z, f.r + 0.6, 0, 0, 1, rgb('#FF5C6C'), 0.9);
      }
      drawQuads(discTex);
      nq = 0;
      for (const s of splats) {
        const age = time - s.t, fade = age > 14 ? Math.max(0, 1 - (age - 14) / 3) : 1;
        if (fade <= 0) continue;
        groundQuad(s.x, s.y, s.z, s.r, s.rot, s.k * 0.25, s.k * 0.25 + 0.25, s.c, 0.92 * fade);
      }
      drawQuads(atlasTex);

      if (ni) {
        gl.useProgram(P.shadow.prog);
        gl.uniformMatrix4fv(P.shadow.uni.uVP, false, VP);
        gl.uniform4f(P.shadow.uni.uShade, 0.10, 0.16, 0.26, 0.16);
        R.upload(shadBuf, shad, ni * 4);
        R.bind(P.shadow, [['aPos', quad, 3, 3, 0], ['iShadow', shadBuf, 4, 4, 0, 1]]);
        R.drawInst(gl.TRIANGLES, 0, 6, ni);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);

      /* ---- the crowd, all of it, in one call ---- */
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      if (ni) {
        gl.useProgram(P.crowd.prog);
        gl.uniformMatrix4fv(P.crowd.uni.uVP, false, VP);
        lightUniforms(P.crowd.uni);
        R.upload(instBuf, inst, ni * 12);
        const skin = Math.max(0, SKINS.indexOf(look.skin));
        drawRunners(runners[skin], 0, nMine);
        drawRunners(runners[0], nMine, ni - nMine);
      }

      /* ---- glass, numbers and sparks over the top ---- */
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      const u2 = useLit();
      // Far gates first, so nearer glass blends over farther.
      const gates = [];
      for (let fi = 0; fi < course.features.length; fi++) {
        const f = course.features[fi];
        if (f.kind === 'gates' && f.z > near && f.z < far) gates.push(fi);
      }
      gates.sort((p, q) => course.features[q].z - course.features[p].z);
      for (const fi of gates) {
        const f = course.features[fi];
        const used = game.used[fi];
        f.lanes.forEach((g, li) => {
          if (used === li) return;                 // taken: shattered
          const good = C.isGood(g.op);
          const w = g.x1 - g.x0 - 0.3, cx = (g.x0 + g.x1) / 2;
          drawMesh(u2, mesh.glass, M4.compose(MODEL, cx, 1.0, f.z, 0, 0, 0, w, 1.8, 0.09), rgb(good ? GLASS_GOOD : GLASS_BAD), 0.62, 4);
          drawMesh(u2, mesh.glass, M4.compose(MODEL, cx, 1.93, f.z, 0, 0, 0, w, 0.07, 0.11), rgb(good ? '#D6F4FF' : '#FFD6D6'), 0.9, 4);
        });
      }
      for (const fi of gates) {
        const f = course.features[fi];
        const used = game.used[fi];
        f.lanes.forEach((g, li) => {
          if (used === li) return;
          const good = C.isGood(g.op);
          const cx = (g.x0 + g.x1) / 2, w = Math.min(3.2, g.x1 - g.x0 - 0.6), h = w * 0.5;
          nq = 0;
          const z = f.z - 0.07, y = 1.02;
          quadAt([[cx - w / 2, y - h / 2, z], [cx + w / 2, y - h / 2, z], [cx + w / 2, y + h / 2, z], [cx - w / 2, y + h / 2, z]],
            0, 0, 1, 1, [1, 1, 1], 1);
          drawQuads(label(gateText(g), false, good ? 'rgba(10,80,140,0.55)' : 'rgba(140,20,20,0.55)'));
        });
      }
      // The multipliers on the steps.
      if (!course.boss && (v.z > course.finish - 40 || game.tower)) {
        for (let k = 0; k < C.STEPS; k++) {
          const top = (k + 1) * C.STEP_RISE + 0.012, z = course.stairs + (k + 0.5) * C.STEP_DEPTH;
          nq = 0;
          const w = 2.4, d = 1.1;
          quadAt([[-w / 2, top, z - d / 2], [w / 2, top, z - d / 2], [w / 2, top, z + d / 2], [-w / 2, top, z + d / 2]], 0, 0, 1, 1, [1, 1, 1], 0.95);
          drawQuads(label('x' + C.stepMult(k).toFixed(1), true, 'rgba(90,60,20,0.35)'));
        }
      }

      // Sparks, puffs, glass and confetti.
      np = 0;
      for (const p of parts) {
        const k = 1 - p.age / p.life;
        particle(p.x, p.y, p.z, p.size * (p.sq ? 1 : 1 + (1 - k) * 1.5), p.c, p.sq ? Math.min(1, k * 2) : k * 0.8);
      }
      if (np) {
        gl.useProgram(P.points.prog);
        gl.uniformMatrix4fv(P.points.uni.uVP, false, VP);
        gl.uniform1f(P.points.uni.uPx, canvas.height * 0.5 / tanFov);
        R.upload(ptsBuf, pts, np * 8);
        R.bind(P.points, [['aPos', ptsBuf, 3, 8, 0], ['aSize', ptsBuf, 1, 8, 3], ['aCol', ptsBuf, 4, 8, 4]]);
        gl.drawArrays(gl.POINTS, 0, np);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      return v;
    }

    /** `count` runners from instance `first` on, in one mesh. WebGL has no
        base instance, so the instance attributes start `first` in. */
    function drawRunners(msh, first, count) {
      if (count <= 0) return;
      const o = first * 12;
      R.bind(P.crowd, [
        ['aPos', msh.buf, 3, 11, 0], ['aNrm', msh.buf, 3, 11, 3], ['aPart', msh.buf, 1, 11, 6], ['aVcol', msh.buf, 4, 11, 7],
        ['iPos', instBuf, 4, 12, o, 1], ['iAnim', instBuf, 4, 12, o + 4, 1], ['iCol', instBuf, 4, 12, o + 8, 1]
      ]);
      R.drawInst(gl.TRIANGLES, 0, msh.count, count);
    }

    function drawQuads(tex) {
      if (!nq) return;
      gl.useProgram(P.decal.prog);
      const u = P.decal.uni;
      gl.uniformMatrix4fv(u.uVP, false, VP);
      gl.uniform3fv(u.uFog, world.fog);
      gl.uniform2f(u.uFogR, FOG[0], FOG[1]);
      gl.uniform3f(u.uEye, cam.eye[0], cam.eye[1], cam.eye[2]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uTex, 0);
      R.upload(qdBuf, qd, nq * 6 * 9);
      R.bind(P.decal, [['aPos', qdBuf, 3, 9, 0], ['aUV', qdBuf, 2, 9, 3], ['aCol', qdBuf, 4, 9, 5]]);
      gl.drawArrays(gl.TRIANGLES, 0, nq * 6);
      nq = 0;
    }

    /* ------------------------------------------------------------ the king */

    function kingPose(game, tick, a) {
      const course = game.course;
      const k = game.king || { x: 0, z: course.kingZ, yaw: Math.PI, t: 0 };
      const R2 = PV.CrowdRush;
      const t = (game.king ? k.t - 1 + a : 0);
      // His arm: raised through the wind-up, down hard on the strike.
      const c = ((t % R2.SWING) + R2.SWING) % R2.SWING;
      let arm;
      if (!game.king) arm = 0.15 + Math.sin(time * 1.5) * 0.05;
      else if (c < R2.SWING_HIT - 16) arm = lerp(0.2, -2.6, ease(c / (R2.SWING_HIT - 16)));
      else if (c < R2.SWING_HIT) arm = lerp(-2.6, 0.9, ease((c - (R2.SWING_HIT - 16)) / 16));
      else arm = lerp(0.9, 0.2, ease((c - R2.SWING_HIT) / (R2.SWING - R2.SWING_HIT)));
      const down = game.phase === 'won' && k.down ? Math.min(1, (game.endT - 1 + a) / 26) : 0;
      const flash = game.king && c > R2.SWING_HIT - 3 && c < R2.SWING_HIT + 3 ? 0.0 : 0;
      return {
        x: k.x, z: k.z, yaw: k.yaw, arm: arm, scale: 2.6 * BODY, lift: 0, fall: down, flash: flash,
        gone: false
      };
    }

    /* ----------------------------------------------------------- the tower */

    /**
     * Where the human tower is. Rows 0..k-1 have been left on the steps they
     * reached; the rest are a column of `w` wide climbing onto step k.
     */
    function towerState(game, a) {
      const T = game.tower, course = game.course, R2 = PV.CrowdRush;
      const t = T.t - 1 + a;
      const gather = Math.min(1, Math.max(0, t / R2.GATHER));
      const c = Math.max(0, (t - R2.GATHER) / R2.STEP_T);    // steps climbed, fractional
      const steps = T.reach + 1;
      const s = Math.min(steps, Math.floor(c));
      const f = Math.min(1, c - Math.floor(c));
      const climbing = c < steps;
      // The base of the moving column: from the foot of the stairs up step by step.
      const stepZ = k => course.stairs + (k + 0.5) * C.STEP_DEPTH;
      const stepY = k => (k + 1) * C.STEP_RISE;
      let baseZ, baseY;
      if (c <= 0) { baseZ = course.stairs - 1.4; baseY = 0; }
      else if (climbing) {
        const pz = s === 0 ? course.stairs - 1.4 : stepZ(s - 1), py = s === 0 ? 0 : stepY(s - 1);
        baseZ = lerp(pz, stepZ(s), ease(f));
        baseY = lerp(py, stepY(s), ease(f)) + Math.sin(f * Math.PI) * 0.35;
      } else { baseZ = stepZ(steps - 1); baseY = stepY(steps - 1); }
      const left = climbing ? s : steps;                       // rows standing on steps
      const rowH = 0.7 * BODY;
      const rows = Math.min(T.rows, left + 34);
      const colH = Math.max(0, rows - left) * rowH;
      // After the top, the rest run on to the chest.
      const tChest = t - (R2.GATHER + steps * R2.STEP_T);
      const lid = T.top ? ease((tChest - R2.CHEST_T * 0.6) / 18) : 0;
      return {
        gather: gather, c: c, s: s, baseZ: baseZ, baseY: baseY, left: left, rows: rows, rowH: rowH,
        climbing: climbing, tChest: tChest, lid: lid,
        camZ: climbing ? baseZ : stepZ(steps - 1), camY: climbing ? baseY + colH * 0.42 : stepY(steps - 1) + 1,
        camBack: climbing ? Math.min(12, colH * 0.35) : 0,
        coinsOut: false
      };
    }

    let chestBurst = false;
    function drawTower(game, S, mine, tick, stride) {
      const T = game.tower, course = game.course;
      const w = T.w, gap = 0.36 * BODY;
      const stepZ = k => course.stairs + (k + 0.5) * C.STEP_DEPTH;
      const stepY = k => (k + 1) * C.STEP_RISE;
      let drawn = 0;
      for (let r = 0; r < S.rows; r++) {
        const inRow = r === T.rows - 1 ? T.n - r * w : w;
        for (let c = 0; c < inRow; c++) {
          const x = (c - (inRow - 1) / 2) * gap;
          let px, py, pz, pose = 4, yaw = 0, ph = tick * 0.12 + r + c;
          if (r < S.left) {
            // Left on step r: they stand and cheer.
            px = x; py = stepY(r); pz = stepZ(r); pose = 5;
          } else {
            px = x;
            py = S.baseY + (r - S.left) * S.rowH;
            pz = S.baseZ;
            if (!S.climbing && T.top) {
              // Over the top: the rest run to the chest in a line.
              const k = r - S.left;
              const run = Math.max(0, S.tChest) * 0.11;
              px = x * 0.5;
              py = C.STEPS * C.STEP_RISE;
              pz = Math.min(course.chest - 1.3 - k * 0.3, course.top + run - k * 0.45);
              pose = S.tChest > PV.CrowdRush.CHEST_T * 0.6 ? 5 : 0;
              if (k > 6) continue;
            }
          }
          if (S.gather < 1 && drawn < game.units) {
            // Still walking in from where they stood in the crowd.
            const i = drawn;
            const g = ease(Math.min(1, S.gather * 1.3 - (r / Math.max(1, S.rows)) * 0.3));
            px = lerp(game.ux[i], px, g); pz = lerp(game.uz[i], pz, g); py = lerp(0, py, g);
            if (g < 1) pose = 0;
          }
          put(px, py, pz, yaw, ph * (pose === 0 ? stride / 0.12 : 1), pose === 0 ? 0.75 : 0, BODY, pose, mine);
          drawn++;
        }
      }
      if (S.lid > 0.5 && !chestBurst) {
        chestBurst = true;
        const top = C.STEPS * C.STEP_RISE + 1.2;
        for (let i = 0; i < 70; i++) {
          parts.push({ x: (Math.random() - 0.5) * 0.8, y: top, z: course.chest, vx: (Math.random() - 0.5) * 3,
            vy: 5 + Math.random() * 6, vz: (Math.random() - 0.5) * 3, c: rgb('#FFC83A'), size: 0.2, life: 1.6, age: 0, g: 9, sq: false });
        }
        confetti(0, top + 2, course.chest, 90);
      }
    }

    /* ------------------------------------------------------------ public */

    return {
      /** Start over for a new game: new world, no leftover effects. */
      reset(game) {
        splats = []; fliers = []; parts = [];
        seen = game.seq;
        chestBurst = false;
        cam.mode = ''; cam.from = null; cam.shake = 0;
        bake(game);
      },
      frame: frame,
      resize(w, h, ratio) {
        W = w; H = h; dpr = ratio;
        const cw = Math.max(1, Math.round(w * ratio)), ch = Math.max(1, Math.round(h * ratio));
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      },
      /** Where a point in the world lands on the canvas, in CSS pixels. */
      project(x, y, z) {
        const o = M4.apply(VP, x, y, z);
        if (o[3] <= 0.05) return null;
        return { x: (o[0] / o[3] * 0.5 + 0.5) * W, y: (1 - (o[1] / o[3] * 0.5 + 0.5)) * H, s: 1 / o[3] };
      },
      get lost() { return gl.isContextLost(); },
      destroy() {
        drop();
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  };

  PV.CrowdScene.THEMES = THEMES;
  PV.CrowdScene.SKINS = SKINS;
  PV.CrowdScene.FOE = FOE;

})(window.PV);
