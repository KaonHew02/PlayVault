/* 赛车 / Racing — the circuits.

   A track is a closed centreline plus a width. Control points are written by
   hand and then resampled through a Catmull-Rom spline, so the corners are
   smooth without anyone having to place two hundred points.

   Everything downstream — where the asphalt is, whether a car is off it, where
   the racing line goes, how far round a car has got — is derived from that one
   list of points. There is no separate collision geometry to keep in sync. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /** Catmull-Rom through the control points, closed, at a fixed step. */
  function resample(control, step) {
    const n = control.length;
    const out = [];
    const at = i => control[((i % n) + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const seg = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
            + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
            + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
            + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
            + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    return out;
  }

  const P = (x, y) => ({ x: x, y: y });

  const DEFS = {
    ring: {
      key: 'ring', width: 8,
      control: [P(20, 55), P(20, 30), P(34, 16), P(66, 16), P(80, 30),
                P(80, 55), P(66, 70), P(34, 70)]
    },
    circuit: {
      key: 'circuit', width: 7.4,
      control: [P(16, 62), P(14, 40), P(24, 24), P(42, 22), P(50, 34),
                P(58, 22), P(78, 20), P(88, 34), P(84, 52), P(68, 58),
                P(58, 50), P(48, 58), P(50, 70), P(34, 74), P(20, 72)]
    }
  };

  function build(def) {
    const points = resample(def.control, 2.2);
    const n = points.length;
    const tangents = [], normals = [];
    let length = 0;
    for (let i = 0; i < n; i++) {
      const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const m = Math.hypot(dx, dy) || 1;
      tangents.push({ x: dx / m, y: dy / m });
      normals.push({ x: -dy / m, y: dx / m });
      length += Math.hypot(points[i].x - points[(i - 1 + n) % n].x,
                           points[i].y - points[(i - 1 + n) % n].y);
    }
    // How sharp the bend is at each node, so the AI knows when to lift off.
    const curve = [];
    for (let i = 0; i < n; i++) {
      const a = tangents[(i - 4 + n) % n], b = tangents[(i + 4) % n];
      curve.push(1 - (a.x * b.x + a.y * b.y));
    }
    return {
      key: def.key, width: def.width, points: points, n: n,
      tangents: tangents, normals: normals, curve: curve, length: length
    };
  }

  PV.RaceTracks = {
    DEFS: DEFS,
    keys: Object.keys(DEFS),
    build: key => build(DEFS[key] || DEFS.ring),

    /** Nearest centreline node, searched near `from` so it stays O(1). */
    nearest(track, x, y, from, span) {
      const n = track.n;
      let best = from == null ? 0 : from, bestD = Infinity;
      const lo = from == null ? 0 : from - (span || 10);
      const hi = from == null ? n - 1 : from + (span || 10);
      for (let k = lo; k <= hi; k++) {
        const i = ((k % n) + n) % n;
        const p = track.points[i];
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bestD) { bestD = d; best = i; }
      }
      return { node: best, dist: Math.sqrt(bestD) };
    },

    /** Shortest signed step from node a to node b around the loop. */
    delta(track, a, b) {
      const n = track.n;
      let d = b - a;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return d;
    }
  };

})(window.PV);
