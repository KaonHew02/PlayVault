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

  PV.CrowdCourse = {
    COURSES: COURSES,
    keys: Object.keys(COURSES),
    tierOf(key) { return (COURSES[key] || COURSES.fields).tier; },
    apply: apply,
    widthOf: widthOf,

    /**
     * rng: a PV.RNG. diff: { start, rival, king, badBias, hazard }.
     * Returns { key, tier, length, features, king }.
     */
    build(key, diff, rng) {
      const def = COURSES[key] || COURSES.fields;
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
          shadow = Math.max(4, Math.round(shadow * 0.9));
        } else {
          // A gate pair: the track split down the middle, one side worth
          // taking. Which side is worth taking is the only thing being asked.
          const good = GOOD[rng.int(GOOD.length)];
          const bad = rng.chance(diff.badBias) ? BAD[rng.int(BAD.length)] : GOOD[rng.int(GOOD.length)];
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
