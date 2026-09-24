/* 人潮冲锋 / Crowd Rush — the levels.

   A level is one straight road with things on it at distances: gate pairs
   that add, multiply, subtract or divide; red squads standing in a circle;
   traps; and at the end either a staircase to climb as a human tower or a
   king in front of his castle. It is laid out once, from the seed, before
   the run starts, because the size of the king depends on everything before
   him.

   This is the reference's own shape. Its level 1 is gate, squad, gate,
   squad, gate, finish — `+80 | +70`, a squad of 54, `×4 | ×3`, a squad of
   71, `+100 | +40` — and later levels are the same beats with more of them,
   traps in between, and the red squads nearer your own size.

   THE SHADOW RUN, kept from the first version because the arithmetic has not
   changed: gates multiply, so a squad written as a flat number is a
   walkover at the end or a wall at the start. The generator keeps a running
   estimate of what a good player would be holding — it takes the better
   gate of every pair, grazes past every trap — and sizes every squad and
   the king as a SHARE of that. The level ramp moves the share; nothing here
   writes a number by hand. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* The road, in metres. The engine keeps runners inside it and the view
     draws it; one number, not two that drift apart. */
  const HALF = 4.2;
  /* The square spacing of a red squad, and the most runners one side ever
     puts on the road at once (the rest wait in a reservoir, see engine.js).
     Here because a squad's disc is sized from them when the level is laid. */
  const SP = 0.42;
  const CAP = 300;

  const THEMES = ['ice', 'dusk', 'ocean', 'meadow'];
  const STEPS = 21;                  // ×1.0 to ×5.0 in steps of 0.2
  const STEP_DEPTH = 1.3, STEP_RISE = 0.42;

  /* Free run: a course is a scenery and a length. The difficulty says where
     on the level ramp it sits. A free run always ends at the castle, because
     a race needs a finish everybody can lose. */
  const COURSES = {
    ice: { key: 'ice', tier: 1, beats: 4 },
    ocean: { key: 'ocean', tier: 2, beats: 6 },
    dusk: { key: 'dusk', tier: 3, beats: 8 }
  };
  const FREE_AT = { easy: 0.1, normal: 0.42, hard: 0.8 };

  /** A gate's number the way a person would print it on a gate. */
  function nice(v) {
    if (v < 50) return Math.max(5, Math.round(v / 5) * 5);
    if (v < 200) return Math.round(v / 10) * 10;
    return Math.round(v / 50) * 50;
  }

  /** What a gate does to a crowd of n. The whole crowd goes through one. */
  function apply(op, val, n) {
    if (op === 'mul') return n * val;
    if (op === 'add') return n + val;
    if (op === 'sub') return Math.max(0, n - val);
    if (op === 'div') return Math.floor(n / val);
    return n;
  }
  const isGood = op => op === 'mul' || op === 'add';

  /* ------------------------------------------------------------- gates */

  /** A gate worth taking. A multiplier while the crowd is small, a sum once
      it is big — ×6 at one runner is a trap, +100 at a thousand is nothing. */
  function goodOp(shadow, rng) {
    const pMul = shadow < 12 ? 0.35 : shadow < 60 ? 0.55 : shadow < 160 ? 0.4 : 0.25;
    if (rng.chance(pMul)) {
      const top = shadow < 20 ? 6 : shadow < 60 ? 5 : shadow < 120 ? 4 : shadow < 250 ? 3 : 2;
      return ['mul', 2 + rng.int(top - 1)];
    }
    return ['add', nice(Math.min(400, Math.max(20, shadow * (0.5 + rng.next()))))];
  }

  /** A gate to stay out of. Early levels never offer one that wipes you. */
  function badOp(shadow, rng, mercy) {
    if (rng.chance(0.35)) return ['div', rng.chance(0.75) ? 2 : 3];
    let v = nice(Math.max(5, shadow * (0.3 + rng.next() * 0.5)));
    if (mercy && v > shadow * 0.6) v = nice(shadow * 0.5);
    return ['sub', v];
  }

  /** Two gates across the road (or, now and then, one across half of it). */
  function gatePair(shadow, spec, rng, first) {
    let a, b;
    if (first) {
      // The reference opens on a pair of sums, or a sum beside a
      // multiplier that is worth less than it looks at one runner.
      a = ['add', nice(40 + rng.next() * 60)];
      b = rng.chance(0.5) ? ['mul', 2 + rng.int(5)] : ['add', nice(a[1] * (0.5 + rng.next() * 0.35))];
    } else {
      a = goodOp(shadow, rng);
      if (rng.chance(spec.bad)) b = badOp(shadow, rng, spec.level <= 6);
      else {
        b = goodOp(shadow, rng);
        // Two identical gates are not a choice.
        if (b[0] === a[0] && b[1] === a[1]) b = b[0] === 'mul' ? ['add', nice(shadow * 0.8 + 10)] : ['mul', 2];
      }
    }
    const left = rng.chance(0.5);
    const L = left ? a : b, R = left ? b : a;
    const lanes = [
      { x0: -HALF, x1: 0, op: L[0], val: L[1] },
      { x0: 0, x1: HALF, op: R[0], val: R[1] }
    ];
    // Now and then a lone gate over one half: take it or leave it.
    if (!first && spec.level > 3 && rng.chance(0.12)) lanes.splice(rng.int(2), 1);
    let best = shadow;
    for (const g of lanes) best = Math.max(best, apply(g.op, g.val, shadow));
    return { lanes: lanes, best: Math.max(1, Math.round(best)) };
  }

  /* ------------------------------------------------------------- traps */

  /* Every trap is data plus a clock: where a saw is, which way a bar points,
     whether a press is down — all of it a function of the tick, worked out
     in engine.js, so the view draws the blade exactly where it cuts. */
  const TRAPS = [
    // [kind, first level it appears on]
    ['saws', 2], ['boost', 2], ['corridor', 4], ['slider', 5],
    ['bar', 6], ['press', 7], ['hammer', 9], ['spikes', 11]
  ];

  function trap(kind, z, rng) {
    const phase = rng.int(240);
    if (kind === 'saws') {
      // A row of flat blades with gaps between them to thread.
      // Two at the edges leave the middle; one big one leaves the sides;
      // three leave two gaps no big crowd gets through whole.
      const pat = rng.int(3);
      const saws = pat === 0 ? [{ x: -2.75, r: 0.9 }, { x: 2.75, r: 0.9 }]
        : pat === 1 ? [{ x: 0, r: 1.2 }]
          : [{ x: -3.1, r: 0.72 }, { x: 0, r: 0.72 }, { x: 3.1, r: 0.72 }];
      return { items: [{ kind: 'saws', z: z, phase: phase, saws: saws }], len: 3 };
    }
    if (kind === 'corridor') {
      // Blades down both edges: keep to the middle.
      const items = [];
      for (let k = 0; k < 3; k++) {
        items.push({ kind: 'saws', z: z + k * 3.4, phase: phase + k * 20, saws: [{ x: -3.35, r: 0.85 }, { x: 3.35, r: 0.85 }] });
      }
      return { items: items, len: 8 };
    }
    if (kind === 'slider') {
      return { items: [{ kind: 'saws', z: z, phase: phase, saws: [{ x: 0, r: 0.85, amp: 2.6, slide: 0.028 + rng.next() * 0.012 }] }], len: 3 };
    }
    if (kind === 'bar') {
      // A spinning bar over one half of the road: go round the other side.
      const side = rng.chance(0.5) ? -1 : 1;
      return {
        items: [{ kind: 'bar', z: z + 2, x: side * 2.05, phase: phase, len: 2.15,
          spin: (rng.chance(0.5) ? 1 : -1) * (0.035 + rng.next() * 0.015) }], len: 5
      };
    }
    if (kind === 'press') {
      return {
        items: [{ kind: 'press', z: z + 1, phase: phase, period: 110, d: 1.8,
          blocks: [{ x: -2.1, w: 4.0, off: 0 }, { x: 2.1, w: 4.0, off: 55 }] }], len: 4
      };
    }
    if (kind === 'hammer') {
      return { items: [{ kind: 'hammer', z: z + 1, phase: phase, amp: 2.9, swing: 0.03 + rng.next() * 0.01 }], len: 4 };
    }
    if (kind === 'spikes') {
      // A bed of spikes over a third of the road, in and out on a beat.
      const at = (rng.int(3) - 1) * 2.7;
      return {
        items: [{ kind: 'spikes', z: z + 1, phase: phase, period: 120, d: 2.2, x0: at - 1.4, x1: at + 1.4 }], len: 4
      };
    }
    // Boost pads: nothing to fear, just a burst of speed.
    const side = rng.int(3) - 1;
    return { items: [{ kind: 'boost', z: z, d: 2.6, x0: side * 2.1 - 1.6, x1: side * 2.1 + 1.6 }], len: 4 };
  }

  /* ------------------------------------------------------------ levels */

  /* Each knob at level 1 and at level 30; the levels between are a curve
     that eases in, so the first handful stay gentle. Past 30 the squads and
     the king keep creeping up. */
  const RAMP = {
    squad: [0.45, 0.62],     // a red squad, as a share of a good crowd
    bad: [0.1, 0.6],         // chance a pair offers a gate to avoid
    hazard: [0.35, 0.85],    // chance of a trap between beats, from level 2
    speed: [1.0, 1.3],
    king: [0.45, 0.85]       // what the king takes, as a share of a good crowd
  };
  const MAX_LEVEL = 9999;

  function spec(t, past, lv, theme, boss, beats) {
    const at = k => RAMP[k][0] + (RAMP[k][1] - RAMP[k][0]) * t;
    return {
      level: lv, t: t, theme: theme, boss: boss, beats: beats, start: 1,
      squad: Math.min(0.92, at('squad') + past * 0.003),
      bad: at('bad'),
      hazard: lv < 2 ? 0 : at('hazard'),
      speed: Math.min(1.45, at('speed') + past * 0.004),
      king: Math.min(1.1, at('king') + past * 0.006)
    };
  }

  /** Level n, worked out from n alone. Every third level is a king. */
  function level(n) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    const t = Math.pow(Math.min(1, (lv - 1) / 29), 1.2);
    const past = Math.max(0, lv - 30);
    return spec(t, past, lv, THEMES[Math.floor((lv - 1) / 3) % THEMES.length], lv % 3 === 0,
      Math.min(8, 3 + Math.floor(lv / 4)));
  }

  /** A free run: a course and a difficulty, always ending at the castle. */
  function free(course, difficulty) {
    const c = COURSES[course] || COURSES.ice;
    const t = FREE_AT[difficulty] != null ? FREE_AT[difficulty] : FREE_AT.normal;
    const lv = Math.round(1 + t * 29);
    return spec(t, 0, lv, c.key, true, c.beats);
  }

  /** The seed a level is always played from. Never zero. */
  function seedFor(n) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    return ((Math.imul(lv, 2654435761) ^ 0x3c6ef372) >>> 0) || 1;
  }

  /** How far out a squad of n stands, for its disc and for where it is met. */
  function squadRadius(n) {
    const side = Math.ceil(Math.sqrt(Math.max(1, Math.min(CAP, n))));
    return (side - 1) * SP * 0.5 * Math.SQRT2 + 0.9;
  }

  /**
   * Lay a level out. `s` is a spec from level() or free(); rng a PV.RNG.
   * Returns { theme, boss, features, finish, ... } with features sorted by z.
   */
  function build(s, rng) {
    const features = [];
    let z = 16;
    let shadow = Math.max(1, s.start || 1);   // what a good player is holding
    const open = TRAPS.filter(k => s.level >= k[1]).map(k => k[0]);

    for (let b = 0; b < s.beats; b++) {
      const g = gatePair(shadow, s, rng, b === 0);
      features.push({ kind: 'gates', z: z, lanes: g.lanes });
      shadow = g.best;
      z += 15 + rng.next() * 5;

      if (open.length && rng.chance(s.hazard)) {
        const kind = open[rng.int(open.length)];
        const tr = trap(kind, z, rng);
        for (const it of tr.items) features.push(it);
        // A good player loses the edges of the crowd to a trap, not the middle.
        if (kind !== 'boost') shadow = Math.max(1, Math.round(shadow * 0.88));
        z += tr.len + 12;
      }

      if (b < s.beats - 1) {
        const n = Math.max(3, Math.round(shadow * s.squad));
        const r = squadRadius(n);
        features.push({ kind: 'squad', z: z + r + 1, n: n, r: r });
        shadow = Math.max(1, shadow - n);
        z += 2 * r + 15;
      }
    }

    const finish = z + 6;
    const out = {
      theme: s.theme, boss: s.boss, level: s.level,
      features: features, finish: finish, shadow: shadow
    };
    if (s.boss) {
      // The needle at the finish line: +10, +40 or +80, more on later levels.
      const k = 1 + Math.floor(s.level / 9) * 0.5;
      out.gauge = [10, 40, 80].map(v => Math.round(v * k));
      out.plaza = finish + 17;
      out.kingZ = out.plaza + 1.5;
      out.castleZ = out.plaza + 10.5;
      // He falls in about five swings to a full ring round him, so what he
      // kills a swing is what a good crowd can afford to lose over five.
      const expect = shadow + out.gauge[1];
      out.king = { k: Math.max(2, Math.round(expect * s.king / 5)) };
      out.length = out.castleZ + 6;
    } else {
      // How wide the human tower stands. Fixed by the level, never by the
      // crowd: a width that grew with the crowd made 32 runners climb lower
      // than 31 (three wide to four wide), and more must never pay less. A
      // good crowd is about 21 rows of this — the top step, ×5.0.
      out.towerW = Math.max(1, Math.min(8, Math.round(shadow / 22)));
      out.stairs = finish + 9;
      out.top = out.stairs + STEPS * STEP_DEPTH;
      out.chest = out.top + 7;
      out.length = out.chest + 4;
    }
    return out;
  }

  PV.CrowdCourse = {
    HALF: HALF, SP: SP, CAP: CAP,
    THEMES: THEMES, COURSES: COURSES, keys: Object.keys(COURSES),
    STEPS: STEPS, STEP_DEPTH: STEP_DEPTH, STEP_RISE: STEP_RISE,
    MAX_LEVEL: MAX_LEVEL,
    tierOf(key) { return (COURSES[key] || COURSES.ice).tier; },
    /** ×1.0 on the first step, ×5.0 on the last. */
    stepMult(i) { return Math.round((1 + 0.2 * Math.max(0, Math.min(STEPS - 1, i))) * 10) / 10; },
    apply: apply, isGood: isGood, nice: nice,
    level: level, free: free, seedFor: seedFor, squadRadius: squadRadius,
    build: build
  };

})(window.PV);
