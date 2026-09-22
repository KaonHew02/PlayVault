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

  /* How a kart corners, kept here rather than in the engine because the
     track needs it too: every question this file asks about where to put
     something — is this a corner, is that chord actually quicker — is really
     "how fast can a kart hold this bend". The engine drives on the same two
     numbers, so there is one answer, not two that drift apart. */
  const TURN = 0.055, GRIP_FADE = 1.15;

  /**
   * The fastest a kart can hold a bend, from the radius the curvature implies.
   *
   * `bend` is 1 - cos(the tangent's turn across `span` units), so the angle
   * and the span give a radius; steering rate TURN falling off as
   * 1/(1 + GRIP_FADE·v) then solves for the speed that holds it.
   */
  function speedFor(r) {
    return (Math.sqrt(1 + 4 * GRIP_FADE * TURN * r) - 1) / (2 * GRIP_FADE);
  }

  function holdSpeed(bend, span) {
    const turn = Math.acos(Math.max(-1, Math.min(1, 1 - bend)));
    return turn < 1e-3 ? Infinity : speedFor(span / turn);
  }

  /* What each surface is worth. Here rather than in the engine because the
     track has to know: deciding whether a chord across a corner is actually
     quicker means pricing dirt against asphalt. The engine reads these. */
  const SURFACE = {
    road: { max: 0.46, drag: 0.994 },
    dirt: { max: 0.40, drag: 0.976 },
    grass: { max: 0.19, drag: 0.955 }
  };

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

  /** Seconds-ish to cover the road from node `a` to node `b`, driven properly. */
  function roadTime(tk, a, b) {
    const gap = tk.length / tk.n, span = gap * 8;
    let ticks = 0;
    for (let i = a; ; i = (i + 1) % tk.n) {
      ticks += gap / Math.min(SURFACE.road.max, holdSpeed(tk.curve[i], span));
      if (i === b) break;
    }
    return ticks;
  }

  /**
   * One candidate slip road across the corner at `mid`, `reach` nodes either
   * side, leaving and rejoining along the road's own tangents.
   *
   * It used to be a literal straight chord — the shortest possible line, and
   * the worst one to drive: a straight line between two points fifty degrees
   * apart on the road meets that road at a kink at BOTH ends, and no kart can
   * carry speed through a kink. `join` is how much road the curve is given to
   * straighten out; too little and the whole bend piles up at the ends, which
   * is worse than the kink it replaced.
   */
  function slipRoad(tk, mid, reach, joinFrac) {
    const from = (mid - reach + tk.n) % tk.n;
    const to = (mid + reach) % tk.n;
    const a = tk.points[from], b = tk.points[to];
    const t0 = tk.tangents[from], t1 = tk.tangents[to];
    const m = Math.hypot(b.x - a.x, b.y - a.y) * joinFrac;
    const at = t => {
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      return {
        x: h00 * a.x + h10 * t0.x * m + h01 * b.x + h11 * t1.x * m,
        y: h00 * a.y + h10 * t0.y * m + h01 * b.y + h11 * t1.y * m
      };
    };

    // Walk it at a fixed step, so the dirt is sampled as evenly as the road.
    const fine = [], run = [0];
    for (let i = 0; i <= 400; i++) fine.push(at(i / 400));
    for (let i = 1; i < fine.length; i++) {
      run.push(run[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y));
    }
    const len = run[run.length - 1];
    const steps = Math.max(4, Math.round(len / 2.2));
    const pts = [];
    for (let k = 0, j = 0; k <= steps; k++) {
      const want = len * k / steps;
      while (j < run.length - 2 && run[j + 1] < want) j++;
      const seg = run[j + 1] - run[j] || 1;
      const f = (want - run[j]) / seg;
      pts.push({
        x: fine[j].x + (fine[j + 1].x - fine[j].x) * f,
        y: fine[j].y + (fine[j + 1].y - fine[j].y) * f
      });
    }

    /* How fast the dirt can be taken, point by point, from the radius each
       step actually turns through — not from a window average.
       
       The dirt's whole problem is concentrated in the last couple of units at
       a join: a Hermite whose end tangent has to match a road that is itself
       swinging round crams twenty degrees into one 2.2-unit step, a radius of
       six. Any window wide enough to be smooth averages that straight out, so
       the gate below prices a slip road whose real cost it cannot see, and
       picks the one that hurts most. */
    const gap = len / steps;
    const hold = [];
    let ticks = 0;
    for (let i = 0; i <= steps; i++) {
      const k = Math.max(1, Math.min(steps - 1, i));
      const p = pts[k - 1], q = pts[k], r = pts[k + 1];
      let d = Math.atan2(r.y - q.y, r.x - q.x) - Math.atan2(q.y - p.y, q.x - p.x);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      hold.push(Math.min(SURFACE.dirt.max,
        Math.abs(d) < 1e-4 ? Infinity : speedFor(gap / Math.abs(d))));
      ticks += gap / hold[i];
    }

    return {
      from: from, to: to, points: pts, half: tk.width * 0.33, length: len,
      hold: hold, ticks: ticks, road: roadTime(tk, from, to)
    };
  }

  /**
   * The shortcut, or nothing.
   *
   * Spans and join lengths are tried across the most bent stretch of the lap
   * and the quickest is kept — but only if it actually beats going round. A
   * "shortcut" slower than the corner is a trap, and a chord across a gentle
   * sweep is exactly that: short on paper, but the tight bit at each join
   * costs more than the distance saves. The ring is a rounded octagon with no
   * corner to cut and so ends up with no shortcut, which is the honest answer
   * for it — rivals that took the old one lapped 1.3 s slower than those that
   * did not, and so did anyone who followed them.
   */
  function chordFor(tk) {
    let bestI = 0, bestBend = -1;
    for (let i = 0; i < tk.n; i++) {
      const b = bendAt(tk, i, 10);
      if (b > bestBend) { bestBend = b; bestI = i; }
    }
    const most = Math.min(20, Math.floor(tk.n / 5));
    let best = null;
    for (let reach = 6; reach <= most; reach += 2) {
      for (const join of [0.3, 0.45, 0.6, 0.8]) {
        const cand = slipRoad(tk, bestI, reach, join);
        if (!best || cand.ticks - cand.road < best.ticks - best.road) best = cand;
      }
    }
    return best && best.ticks < best.road * 0.95 ? best : null;
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
      // Which way the road bends here. `tk.curve[c.i] ? 1 : 1` was meant to be
      // this and answered 1 either way, so every slick sat on the +normal side
      // — the inside of half the corners, where nobody drives.
      const a = tk.tangents[(c.i - 5 + tk.n) % tk.n], b = tk.tangents[(c.i + 5) % tk.n];
      const side = (a.x * b.y - a.y * b.x) > 0 ? -1 : 1;
      out.push({ node: c.i, x: p.x + nrm.x * side * 1.7, y: p.y + nrm.y * side * 1.7, r: 1.5 });
      if (out.length === 3) break;
    }
    return out;
  }

  PV.RaceTracks = {
    DEFS: DEFS,
    SURFACE: SURFACE,
    TURN: TURN,
    GRIP_FADE: GRIP_FADE,
    holdSpeed: holdSpeed,
    speedFor: speedFor,
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
      /* A kart that has wandered well off the road can be nearest a node the
         window never looked at — in the infield of the ring, the whole far
         side of the circuit is inside the search radius and none of it is in
         the window. Carrying a wrong node is worse than one full scan: it is
         what a lap count is made of. */
      if (from != null && bestD > track.width * track.width * 4) {
        return PV.RaceTracks.nearest(track, x, y, null, 0);
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
