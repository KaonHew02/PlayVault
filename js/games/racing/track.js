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
    const track = {
      key: def.key, width: def.width, points: points, n: n,
      tangents: tangents, normals: normals, curve: curve, length: length
    };

    /* Everything on the road is derived from the centreline, not hand-placed.
       Two reasons: a new circuit is still just a list of control points, and
       every kart sees the same furniture on every run — none of it comes from
       the RNG, so a race still replays from its seed. */
    track.checkpoints = checkpointsFor(track);
    track.shortcut = chordFor(track);
    track.pads = padsFor(track);
    track.coins = coinsFor(track);
    track.oil = oilFor(track);
    return track;
  }

  /** Four gates round the lap. Progress is nodes; these are what a reset uses. */
  function checkpointsFor(tk) {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(Math.round(i * tk.n / 4) % tk.n);
    return out;
  }

  /** How bent the road is over a window, used to find corners and straights. */
  function bendAt(tk, i, span) {
    let sum = 0;
    for (let k = -span; k <= span; k++) sum += tk.curve[(i + k + tk.n) % tk.n];
    return sum;
  }

  /**
   * The shortcut: a straight chord thrown across the sharpest corner.
   *
   * Derived rather than drawn so every circuit gets one, and straight because
   * a chord is by definition shorter than the arc it replaces. It is narrow
   * and it is dirt — quicker only if you hit the entry and hold the line, which
   * is the risk half of a risk-and-reward.
   */
  function chordFor(tk) {
    let bestI = 0, bestBend = -1;
    for (let i = 0; i < tk.n; i++) {
      const b = bendAt(tk, i, 10);
      if (b > bestBend) { bestBend = b; bestI = i; }
    }
    const reach = Math.min(18, Math.floor(tk.n / 6));
    const from = (bestI - reach + tk.n) % tk.n;
    const to = (bestI + reach) % tk.n;
    const a = tk.points[from], b = tk.points[to];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(4, Math.round(len / 2.2));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { from: from, to: to, points: pts, half: tk.width * 0.30, length: len };
  }

  /** Boost pads on the flattest stretch of each quarter of the lap. */
  function padsFor(tk) {
    const out = [];
    for (let q = 0; q < 4; q++) {
      const lo = Math.round(q * tk.n / 4), hi = Math.round((q + 1) * tk.n / 4);
      let flat = lo, best = Infinity;
      for (let i = lo + 6; i < hi - 6; i++) {
        const b = bendAt(tk, i, 6);
        if (b < best) { best = b; flat = i; }
      }
      for (const lane of [-1.5, 1.5]) {
        const p = tk.points[flat % tk.n], nrm = tk.normals[flat % tk.n];
        out.push({ node: flat % tk.n, x: p.x + nrm.x * lane, y: p.y + nrm.y * lane });
      }
    }
    return out;
  }

  /** Coins in short arcs, so collecting them is a line to drive, not a detour. */
  function coinsFor(tk) {
    const out = [];
    const runs = 5, per = 5;
    for (let r = 0; r < runs; r++) {
      const start = Math.round((r + 0.35) * tk.n / runs);
      const lane = (r % 2 ? 1 : -1) * 1.4;
      for (let k = 0; k < per; k++) {
        const i = (start + k * 3) % tk.n;
        const p = tk.points[i], nrm = tk.normals[i];
        out.push({ x: p.x + nrm.x * lane, y: p.y + nrm.y * lane, r: 0.62 });
      }
    }
    return out;
  }

  /** Oil on the outside of the three sharpest corners, where the fast line is. */
  function oilFor(tk) {
    const corners = [];
    for (let i = 0; i < tk.n; i++) corners.push({ i: i, b: bendAt(tk, i, 8) });
    corners.sort((a, b) => b.b - a.b);
    const out = [];
    for (const c of corners) {
      if (out.some(o => Math.abs(PV.RaceTracks.delta(tk, o.node, c.i)) < tk.n / 6)) continue;
      const p = tk.points[c.i], nrm = tk.normals[c.i];
      const side = tk.curve[c.i] ? 1 : 1;
      out.push({ node: c.i, x: p.x + nrm.x * side * 1.7, y: p.y + nrm.y * side * 1.7, r: 1.5 });
      if (out.length === 3) break;
    }
    return out;
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

    /**
     * Where a kart is on the circuit, main road or shortcut.
     *
     * The chord reports its own node by mapping how far along it the kart is
     * onto the arc it replaces, so progress stays one number and the kart on
     * the shortcut simply gains nodes faster than the one going round.
     */
    locate(track, x, y, from, span) {
      const main = PV.RaceTracks.nearest(track, x, y, from, span);
      const s = track.shortcut;
      if (s) {
        let bd = Infinity, bi = 0;
        for (let i = 0; i < s.points.length; i++) {
          const p = s.points[i];
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bd) { bd = d; bi = i; }
        }
        bd = Math.sqrt(bd);
        if (bd < main.dist && bd <= s.half + 1.5) {
          const arc = ((s.to - s.from + track.n) % track.n);
          const node = (s.from + Math.round(arc * (bi / (s.points.length - 1)))) % track.n;
          return { node: node, dist: bd, half: s.half, shortcut: true };
        }
      }
      return { node: main.node, dist: main.dist, half: track.width / 2, shortcut: false };
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
