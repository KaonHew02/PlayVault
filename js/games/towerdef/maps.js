/* 塔防 / Tower Defense — the maps.

   A map is a grid plus one or two lanes, and a lane is a list of waypoints.
   The path cells are expanded from the waypoints rather than typed out, so a
   map is six lines to write and impossible to get subtly wrong — a single
   missing cell in a hand-typed path is a hole enemies walk through and towers
   can be built in.

   A second lane is a real second road, not a decoration: the wave is dealt
   between the lanes, so two roads means the same enemies arrive in two places
   and one wall of towers can only be in one of them. Lanes may cross (the
   crossroads) or merge (the pass) — the cells are unioned for building, so an
   intersection is blocked once and shot at twice.

   `tier` is the map's own difficulty, 1 to 4, and it is honest about what it
   costs the player: a long, switchbacked lane gives a tower many chances at
   the same enemy, and two short lanes give it very few. It is shown as stars
   in the option sheet; it does not scale any enemy stat. Difficulty does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DEFS = {
    meadow: {
      key: 'meadow', cols: 16, rows: 10, tier: 1, theme: 'meadow',
      lanes: [[[0, 4], [4, 4], [4, 7], [9, 7], [9, 2], [13, 2], [13, 5], [15, 5]]]
    },
    canyon: {
      key: 'canyon', cols: 16, rows: 10, tier: 2, theme: 'canyon',
      lanes: [[[0, 1], [11, 1], [11, 4], [2, 4], [2, 7], [8, 7], [8, 9], [15, 9]]]
    },
    glacier: {
      key: 'glacier', cols: 16, rows: 10, tier: 2, theme: 'glacier',
      lanes: [[[0, 8], [3, 8], [3, 2], [6, 2], [6, 8], [9, 8], [9, 2], [12, 2], [12, 6], [15, 6]]]
    },
    dunes: {
      // A spiral, so the base sits in the middle and the last stretch is the
      // one square everything walks past.
      key: 'dunes', cols: 16, rows: 10, tier: 2, theme: 'dunes',
      lanes: [[[0, 1], [13, 1], [13, 8], [3, 8], [3, 4], [9, 4], [9, 6]]]
    },
    crossroads: {
      key: 'crossroads', cols: 16, rows: 10, tier: 3, theme: 'crossroads', bonus: 60,
      lanes: [
        [[0, 0], [2, 0], [2, 6], [7, 6], [7, 0], [12, 0], [12, 6], [15, 6]],
        [[0, 9], [4, 9], [4, 3], [9, 3], [9, 9], [13, 9], [13, 3], [15, 3]]
      ]
    },
    ember: {
      // Two short lanes into one last run. Barely any road to shoot at, which
      // is the whole difficulty — the merge is the only place worth holding.
      key: 'ember', cols: 16, rows: 10, tier: 4, theme: 'ember', bonus: 90,
      lanes: [
        [[0, 0], [6, 0], [6, 5], [15, 5]],
        [[0, 9], [6, 9], [6, 5], [15, 5]]
      ]
    }
  };

  /** Expand waypoints into the ordered list of cells the lane runs through. */
  function expand(waypoints) {
    const cells = [];
    const push = (x, y) => {
      const last = cells[cells.length - 1];
      if (!last || last.x !== x || last.y !== y) cells.push({ x: x, y: y });
    };
    push(waypoints[0][0], waypoints[0][1]);
    for (let i = 1; i < waypoints.length; i++) {
      const [ax, ay] = waypoints[i - 1], [bx, by] = waypoints[i];
      const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      let x = ax, y = ay;
      while (x !== bx || y !== by) { x += dx; y += dy; push(x, y); }
    }
    return cells;
  }

  PV.TDMaps = {
    DEFS: DEFS,
    keys: Object.keys(DEFS),
    tierOf(key) { return (DEFS[key] || DEFS.meadow).tier; },

    build(key) {
      const def = DEFS[key] || DEFS.meadow;
      const onPath = new Set();
      const lanes = def.lanes.map(wp => {
        const path = expand(wp);
        for (const c of path) onPath.add(c.y * def.cols + c.x);
        return {
          path: path,
          // Cell centres, so an enemy walks down the middle of the road.
          points: path.map(c => ({ x: c.x + 0.5, y: c.y + 0.5 })),
          end: path.length - 1
        };
      });
      return {
        key: def.key, cols: def.cols, rows: def.rows,
        tier: def.tier, theme: def.theme || def.key, bonus: def.bonus || 0,
        lanes: lanes, onPath: onPath,
        // Lane 0 under its old names: one-lane maps read the same as before.
        path: lanes[0].path, points: lanes[0].points
      };
    }
  };

})(window.PV);
