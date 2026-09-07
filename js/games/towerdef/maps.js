/* 塔防 / Tower Defense — the maps.

   A map is a grid plus a list of waypoints. The path cells are expanded from
   the waypoints rather than typed out, so a map is six lines to write and
   impossible to get subtly wrong — a single missing cell in a hand-typed path
   is a hole enemies walk through and towers can be built in. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DEFS = {
    meadow: {
      key: 'meadow', cols: 16, rows: 10,
      waypoints: [[0, 4], [4, 4], [4, 7], [9, 7], [9, 2], [13, 2], [13, 5], [15, 5]]
    },
    canyon: {
      key: 'canyon', cols: 16, rows: 10,
      waypoints: [[0, 1], [11, 1], [11, 4], [2, 4], [2, 7], [8, 7], [8, 9], [15, 9]]
    }
  };

  /** Expand waypoints into the ordered list of cells the path runs through. */
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
    build(key) {
      const def = DEFS[key] || DEFS.meadow;
      const path = expand(def.waypoints);
      const onPath = new Set(path.map(c => c.y * def.cols + c.x));
      return {
        key: def.key, cols: def.cols, rows: def.rows,
        path: path, onPath: onPath,
        // Cell centres, so an enemy walks down the middle of the road.
        points: path.map(c => ({ x: c.x + 0.5, y: c.y + 0.5 }))
      };
    }
  };

})(window.PV);
