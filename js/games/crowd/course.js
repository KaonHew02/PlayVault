/* 人潮冲锋 / Crowd Rush — the courses.

   A course is a list of features at distances: gate pairs, obstacles, rival
   crowds, and the keep at the end. It is generated from the seed so a run
   replays, and it is generated ONCE, before the run starts, because the last
   thing it does needs to know everything that came before it.

   The load-bearing trick is the SHADOW RUN. Gates multiply, so a player's
   crowd grows exponentially and a rival crowd written as a flat number is
   either a walkover at the end or a wall at the start. So the generator keeps
   a running estimate of what a good player would be holding at each point —
   it applies its own best gate to that estimate as it lays the course down —
   and sizes every rival and the king as a FRACTION of it. Difficulty moves
   that fraction; it does not write different numbers by hand. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const COURSES = {
    fields: { key: 'fields', tier: 1, length: 300, gap: [30, 40], rivalEvery: 4 },
    dunes: { key: 'dunes', tier: 2, length: 420, gap: [26, 36], rivalEvery: 3 },
    keep: { key: 'keep', tier: 3, length: 540, gap: [22, 32], rivalEvery: 3 }
  };

  /* A gate is an op and a number. Good gates and bad gates are drawn from
     separate tables so a pair can always be one of each — a choice between
     two bad gates is not a choice, it is a tax. */
  const GOOD = [['mul', 2], ['mul', 2], ['mul', 3], ['add', 15], ['add', 30], ['add', 50]];
  const BAD = [['sub', 12], ['sub', 30], ['div', 2], ['sub', 50]];
  const HAZARDS = ['saw', 'hammer', 'spikes'];

  /** How wide a crowd of n stands, in track units (the track is 2 wide). */
  function widthOf(n) { return Math.min(1.5, 0.22 + Math.sqrt(Math.max(1, n)) * 0.055); }

  /** What a gate does to the part of the crowd that runs through it. */
  function apply(op, val, n) {
    if (op === 'mul') return n * val;
    if (op === 'add') return n + val;
    if (op === 'sub') return Math.max(0, n - val);
    if (op === 'div') return Math.floor(n / val);
    return n;
  }

  /* Levels. Level n is a course and a difficulty worked out from n alone, and
     played from a seed worked out from n alone, so level 7 is the same level
     every time: lose it and you meet the same gates again, which is what makes
     a level something to beat rather than a roll of the dice.

     It climbs from gentler than easy at level 1 to past hard at level 25, a
     little further on each step: a longer course, gates closer together,
     rivals and a king nearer the size of what a good run would be holding,
     more red gates and more hazards. Past 25 the course stops changing shape
     and the king keeps growing, until he is bigger than a perfect run with no
     upgrades can beat — which is where the coins saved from earlier levels
     come in. The scenery takes the three courses in turn. */
  const LEVEL_THEMES = ['fields', 'dunes', 'keep'];
  const MAX_LEVEL = 9999;

  /* Each knob at level 1 and at level 25; the levels between are a straight
     line. Level 1 has to be a level a new player cannot really lose: the king
     is sized from a PERFECT run, so at the free run's easy fraction one wrong
     gate early was enough to lose to him. */
  const RAMP = {
    start: [20, 14],
    rival: [0.18, 0.74],
    king: [0.14, 0.97],
    badBias: [0.30, 0.90],
    hazard: [0.10, 0.34],
    speed: [0.95, 1.25],
    length: [200, 520],
    gapLo: [34, 22],
    gapHi: [44, 32],
    xp: [0.6, 1.5],
    coins: [0.8, 1.5]
  };
  /* What the shadow keeps past a hazard, on a level. A free run assumes a
     hazard takes a tenth; here a good player mostly steps round it. */
  const GRAZE = 0.97;
  /* The ramp is eased in, so the first handful of levels stay gentle and the
     climb comes in the middle. */
  const EASE = 1.3;
  /* On the first levels a red gate may hurt but never finish a crowd off: a
     subtraction bigger than this share of what a good player would be
     holding is swapped for halving it. Level 1 used to open on -30 | +50
     at a crowd of twenty, a coin toss before anyone had learnt anything. */
  const MERCY = 0.5, MERCY_UNTIL = 15;

  function level(n) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    const t = Math.pow(Math.min(1, (lv - 1) / 24), EASE);
    const past = Math.max(0, lv - 25);
    const at = k => RAMP[k][0] + (RAMP[k][1] - RAMP[k][0]) * t;
    return {
      level: lv,
      def: {
        key: LEVEL_THEMES[(lv - 1) % LEVEL_THEMES.length],
        tier: 1 + Math.min(2, Math.floor(t * 3)),
        length: Math.round(at('length') + Math.min(100, past * 5)),
        gap: [at('gapLo'), at('gapHi')],
        rivalEvery: lv <= 3 ? 5 : (lv <= 10 ? 4 : 3)
      },
      diff: {
        key: 'level',
        start: Math.round(at('start')),
        rival: at('rival'),
        king: Math.min(1.3, at('king') + past * 0.012),
        badBias: at('badBias'),
        hazard: at('hazard'),
        graze: GRAZE,
        mercy: lv <= MERCY_UNTIL ? MERCY : 0,
        // Faster every level, and still a little faster past 25, to a cap.
        speed: Math.min(1.45, at('speed') + past * 0.01),
        xp: at('xp'),
        coins: at('coins') + Math.min(1, past * 0.01)
      }
    };
  }

  /** The seed a level is always played from. Never zero: a zero seed means
      "pick one at random" to the engine. */
  function seedFor(n) {
    const lv = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    return ((Math.imul(lv, 2654435761) ^ 0x6c8e9cf5) >>> 0) || 1;
  }

  PV.CrowdCourse = {
    COURSES: COURSES,
    keys: Object.keys(COURSES),
    tierOf(key) { return (COURSES[key] || COURSES.fields).tier; },
    apply: apply,
    widthOf: widthOf,
    level: level,
    seedFor: seedFor,
    MAX_LEVEL: MAX_LEVEL,

    /**
     * `course` is a course key, or a course written out (a level's).
     * rng: a PV.RNG. diff: { start, rival, king, badBias, hazard }.
     * Returns { key, tier, length, features, king }.
     */
    build(course, diff, rng) {
      const def = (course && typeof course === 'object') ? course : (COURSES[course] || COURSES.fields);
      const features = [];
      let at = 26;
      let shadow = diff.start;            // what a good player would be holding
      let since = 0;

      while (at < def.length - 46) {
        since++;
        const wantRival = since >= def.rivalEvery;
        if (wantRival) {
          since = 0;
          const n = Math.max(6, Math.round(shadow * diff.rival));
          features.push({ kind: 'rivals', at: at, n: n });
          shadow = Math.max(4, shadow - n);
        } else if (rng.chance(diff.hazard)) {
          const kind = HAZARDS[rng.int(HAZARDS.length)];
          const w = 0.5 + rng.next() * 0.5;
          features.push({
            kind: kind, at: at,
            x: -0.85 + rng.next() * 1.7, w: w,
            phase: rng.int(120), bite: 0.10 + rng.next() * 0.12
          });
          // What the shadow keeps past a hazard. A free run assumes it takes a
          // tenth; a level assumes a good player mostly steps round it, or on a
          // long, busy level the shadow shrinks away from the crowd it stands
          // in for and the king it sizes is a dozen men against five hundred.
          shadow = Math.max(4, Math.round(shadow * (diff.graze || 0.9)));
        } else {
          // A gate pair: the track split down the middle, one side worth
          // taking. Which side is worth taking is the only thing being asked.
          const good = GOOD[rng.int(GOOD.length)];
          let bad = rng.chance(diff.badBias) ? BAD[rng.int(BAD.length)] : GOOD[rng.int(GOOD.length)];
          // No extra draw from the rng here: a free run must lay out exactly
          // the course it always has.
          if (diff.mercy && bad[0] === 'sub' && bad[1] > shadow * diff.mercy) bad = ['div', 2];
          const goodLeft = rng.chance(0.5);
          const lanes = [
            { x0: -1, x1: 0, op: (goodLeft ? good : bad)[0], val: (goodLeft ? good : bad)[1] },
            { x0: 0, x1: 1, op: (goodLeft ? bad : good)[0], val: (goodLeft ? bad : good)[1] }
          ];
          features.push({ kind: 'gates', at: at, lanes: lanes });
          // Even a perfect player cannot funnel a crowd wider than a gate
          // through it: pressed against the outside edge, 1/w of them are
          // inside and the rest take the other gate. The shadow has to pay
          // that too, or the king it sizes will be one no one can beat.
          const w = widthOf(shadow);
          const fg = Math.min(1, 1 / w), fb = 1 - fg;
          // A gate nobody walks through gives nothing. Adding a lane at zero
          // people would hand out its `+30` anyway, and a shadow that gains
          // thirty free runners at every gate ends the course ten times the
          // size of the player it is supposed to be standing in for.
          const mix = (a, b) => apply(a.op, a.val, shadow * fg) + (fb > 0 ? apply(b.op, b.val, shadow * fb) : 0);
          shadow = Math.round(Math.max(mix(lanes[0], lanes[1]), mix(lanes[1], lanes[0])));
        }
        at += def.gap[0] + rng.next() * (def.gap[1] - def.gap[0]);
        shadow = Math.min(shadow, 9000);
      }

      const king = Math.max(12, Math.round(shadow * diff.king));
      features.push({ kind: 'castle', at: def.length - 18, n: king });
      features.sort((a, b) => a.at - b.at);
      return {
        key: def.key, tier: def.tier, length: def.length,
        features: features, king: king, shadow: shadow
      };
    }
  };

})(window.PV);
