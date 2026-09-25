/* 突击小队 / Strike Squad — the maps.

   The reference has eight maps built for close fighting; so does this. Each
   is laid out on a grid of one-metre cells by a few lines of placements —
   a rectangle, a hollow building with its doors and windows, a flight of
   stairs — and most are drawn half at a time: every placement north of the
   middle is repeated turned half round in the south, so both sides of a
   team map are the same map. Markers swap sides with it (a spawn of one
   team becomes the other's, flag for flag, point A for point C).

   What each character in a cell means is the world's business (world.js);
   the key, once:

     .  ground        ,  road / path       ;  grass / tiles
     #  wall, 4 m     %  second wall, 4 m  H  high wall, 6 m    P  pillar
     w  window in #   v  window in %      -  low wall, 1 m     =  sandbags
     x  crate, 1 m    X  crates, 2 m      o  barrel            t  hedge
     c k u  shipping containers (red, blue, green)             T  tree
     1-8  a platform or a stair, half a metre a step
     a b  team spawns   s  free-for-all spawn
     A B C  domination points   F G  flags   Q R  bomb sites

   Nothing is ever built over a walkway except a roof, and a roof is only
   ever over the inside of a building: the ground is a height map, which is
   what lets a bot find its way with a plain grid search. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* ------------------------------------------------------------ builder */

  const SWAP = { a: 'b', b: 'a', F: 'G', G: 'F', A: 'C', C: 'A' };

  function Grid(W, D, sym, border) {
    const cells = [];
    for (let z = 0; z < D; z++) {
      const row = [];
      for (let x = 0; x < W; x++) row.push(x === 0 || z === 0 || x === W - 1 || z === D - 1 ? (border || 'H') : '.');
      cells.push(row);
    }
    const roofs = [];
    const g = {
      W: W, D: D, sym: !!sym,
      /** One cell, no mirror. */
      put(x, z, ch) {
        if (x < 0 || z < 0 || x >= W || z >= D) throw new Error('fps map: cell out of range ' + x + ',' + z);
        cells[z][x] = ch;
        return g;
      },
      /** One cell, and its twin if the map is mirrored. */
      cell(x, z, ch) {
        g.put(x, z, ch);
        if (g.sym) g.put(W - 1 - x, D - 1 - z, SWAP[ch] || ch);
        return g;
      },
      rect(x, z, w, d, ch) {
        for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) g.cell(x + i, z + j, ch);
        return g;
      },
      /** A building: walls round the edge, doors and windows cut into
          them, and a roof over the lot if asked for. */
      box(x, z, w, d, ch, o) {
        const opt = o || {};
        for (let i = 0; i < w; i++) { g.cell(x + i, z, ch); g.cell(x + i, z + d - 1, ch); }
        for (let j = 0; j < d; j++) { g.cell(x, z + j, ch); g.cell(x + w - 1, z + j, ch); }
        const win = ch === '%' ? 'v' : 'w';
        (opt.win || []).forEach(p => g.cell(p[0], p[1], win));
        (opt.doors || []).forEach(p => g.cell(p[0], p[1], '.'));
        if (opt.roof) g.roof(x, z, w, d);
        return g;
      },
      roof(x, z, w, d) {
        roofs.push([x, z, x + w, z + d]);
        if (g.sym) roofs.push([W - x - w, D - z - d, W - x, D - z]);
        return g;
      },
      /** A flight going `dir` ('n','s','e','w') from (x, z), `wide` cells
          across, climbing from step `from` to step `to`. */
      stairs(x, z, dir, wide, from, to) {
        const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dz = dir === 's' ? 1 : dir === 'n' ? -1 : 0;
        for (let k = 0; k <= to - from; k++) {
          for (let i = 0; i < wide; i++) {
            const cx = x + dx * k + (dz ? i : 0), cz = z + dz * k + (dx ? i : 0);
            g.cell(cx, cz, String(from + k));
          }
        }
        return g;
      },
      done() { return { rows: cells.map(r => r.join('')), roofs: roofs }; }
    };
    return g;
  }

  /* ------------------------------------------------------------- themes */

  /* How a map looks: the sky, the sun, the haze, and which texture each
     kind of cell wears. The art reads these; the rules never do. */
  const THEMES = {
    depot: {
      sky: ['#5E9FD8', '#CFE4F2'], fog: '#C9DCEA', fogR: [40, 120], sun: [-0.45, 0.78, -0.43], sunCol: '#FFF1D6', amb: 0.52,
      ground: 'asphalt', road: 'slab', grass: 'grass', wall: 'concrete', wall2: 'brick', plat: 'concrete', trim: 'metal',
      tree: 'oak', skyline: 'cranes'
    },
    dust: {
      sky: ['#6FB1E6', '#F3DDB5'], fog: '#EAD8B8', fogR: [45, 130], sun: [0.5, 0.72, -0.48], sunCol: '#FFE3B0', amb: 0.56,
      ground: 'sand', road: 'dirt', grass: 'tiles', wall: 'sandstone', wall2: 'plaster', plat: 'sandstone', trim: 'wood',
      tree: 'palm', skyline: 'dunes'
    },
    village: {
      sky: ['#79B8EA', '#DDEFF8'], fog: '#D3E7F1', fogR: [40, 120], sun: [-0.4, 0.8, 0.45], sunCol: '#FFF6E0', amb: 0.54,
      ground: 'grass', road: 'dirt', grass: 'cobble', wall: 'stone', wall2: 'brick', plat: 'stone', trim: 'wood',
      tree: 'oak', skyline: 'hills'
    },
    frost: {
      sky: ['#9FB6CC', '#E4EBF1'], fog: '#DDE5EC', fogR: [30, 100], sun: [0.35, 0.62, 0.7], sunCol: '#F4F7FF', amb: 0.62,
      ground: 'snow', road: 'ice', grass: 'slab', wall: 'concrete', wall2: 'planks', plat: 'concrete', trim: 'metal',
      tree: 'pine', skyline: 'peaks'
    },
    downtown: {
      sky: ['#433A73', '#F29A6B'], fog: '#C98A78', fogR: [35, 110], sun: [-0.75, 0.3, 0.58], sunCol: '#FFC08A', amb: 0.5,
      ground: 'pavement', road: 'asphalt', grass: 'grass', wall: 'concrete', wall2: 'brick', plat: 'concrete', trim: 'metal',
      tree: 'oak', skyline: 'city'
    },
    factory: {
      sky: ['#7F97AC', '#D5DEE5'], fog: '#C7D0D8', fogR: [35, 110], sun: [0.3, 0.8, -0.52], sunCol: '#FFF4E4', amb: 0.5,
      ground: 'slab', road: 'hazard', grass: 'plate', wall: 'concrete', wall2: 'siding', plat: 'plate', trim: 'metal',
      tree: 'oak', skyline: 'stacks'
    },
    temple: {
      sky: ['#5DAA8E', '#E1F1DA'], fog: '#C7E1C5', fogR: [30, 105], sun: [-0.35, 0.82, -0.45], sunCol: '#FFF5D0', amb: 0.55,
      ground: 'jungle', road: 'dirt', grass: 'cobble', wall: 'moss', wall2: 'stone', plat: 'moss', trim: 'wood',
      tree: 'jungle', skyline: 'canopy'
    },
    yard: {
      sky: ['#6AA9DC', '#D9EAF4'], fog: '#D2E3EE', fogR: [35, 110], sun: [0.55, 0.7, 0.45], sunCol: '#FFF0D2', amb: 0.55,
      ground: 'dirt', road: 'slab', grass: 'grass', wall: 'planks', wall2: 'concrete', plat: 'planks', trim: 'metal',
      tree: 'oak', skyline: 'hills'
    }
  };

  /* --------------------------------------------------------------- maps */

  const BUILD = {
    /* A container port: an office at each base, a warehouse down one side,
       stacked containers down the other, and the crane plinth in the
       middle with the centre point on top of it. */
    depot() {
      const m = Grid(44, 52, true, 'H');
      m.box(1, 1, 10, 8, '%', { doors: [[10, 4], [10, 5], [4, 8], [5, 8]], win: [[10, 2], [7, 8]], roof: true });
      m.cell(3, 3, 'x').cell(8, 3, 'X').cell(3, 6, 'x');
      [[15, 2], [18, 2], [21, 2], [24, 2], [27, 2], [16, 5], [26, 5]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(21, 5, 'F');
      m.rect(32, 2, 7, 2, 'c').rect(35, 5, 7, 2, 'k').cell(40, 2, 'x').cell(40, 3, 'X');
      m.rect(13, 8, 4, 1, '-').rect(27, 8, 4, 1, '-');
      m.put(21, 12, 'A').put(22, 39, 'C');
      m.cell(18, 11, 'x').cell(25, 13, 'x').cell(17, 14, 'X').cell(26, 10, 'X');
      m.rect(2, 12, 2, 6, 'k').rect(6, 15, 2, 6, 'c').cell(2, 20, 'X').cell(3, 20, 'x').cell(9, 11, 'x');
      m.rect(11, 18, 6, 2, 'u').cell(11, 17, 'x');
      m.box(31, 10, 12, 13, '#', {
        doors: [[31, 13], [31, 14], [31, 19], [31, 20], [36, 10], [37, 10], [37, 22], [38, 22]],
        win: [[31, 16], [34, 22], [40, 22], [33, 10], [40, 10]], roof: true
      });
      m.cell(34, 13, 'X').cell(35, 13, 'x').cell(39, 16, 'X').cell(39, 17, 'X').cell(34, 19, 'x').rect(36, 15, 1, 4, '-');
      m.rect(19, 22, 6, 4, '4');
      m.rect(21, 19, 2, 1, '1').rect(21, 20, 2, 1, '2').rect(21, 21, 2, 1, '3');
      m.rect(16, 23, 1, 2, '1').rect(17, 23, 1, 2, '2').rect(18, 23, 1, 2, '3');
      m.put(21, 25, 'B');
      m.rect(12, 24, 3, 1, '=').rect(28, 22, 3, 1, '=');
      m.cell(27, 17, 'o').cell(28, 17, 'o').cell(14, 13, 'o');
      m.put(6, 38, 'Q').put(35, 40, 'R');
      [[12, 10], [30, 24], [4, 24]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* A desert town: a sandstone alley down the west, a road down the
       east, a market round a fountain in the middle, and one tall house
       whose roof you can climb to. */
    dust() {
      const m = Grid(46, 54, true, 'H');
      [[17, 2], [20, 2], [23, 2], [26, 2], [29, 2], [19, 4], [27, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(23, 5, 'F');
      m.box(2, 1, 11, 9, '%', { doors: [[12, 4], [12, 5], [6, 9], [7, 9]], win: [[2, 5], [9, 9], [12, 2]], roof: true });
      m.cell(4, 3, 'x').cell(10, 7, 'X');
      m.box(34, 1, 11, 8, '%', { doors: [[34, 4], [34, 5], [39, 8]], win: [[37, 8], [42, 8]], roof: true });
      m.cell(41, 3, 'X').cell(36, 6, 'x');
      m.rect(14, 8, 3, 1, '-').rect(30, 8, 3, 1, '-');
      m.rect(1, 12, 7, 1, '#').rect(10, 12, 4, 1, '#').rect(13, 13, 1, 9, '#').rect(1, 21, 5, 1, '#');
      m.cell(3, 15, 'x').cell(4, 15, 'x').cell(9, 18, 'X').cell(2, 19, 'o');
      m.rect(7, 14, 1, 5, '-');
      m.put(22, 13, 'A').put(23, 40, 'C');
      m.cell(19, 12, 'x').cell(26, 14, 'x').cell(18, 15, 'o').cell(27, 11, 'T').cell(17, 11, 'T');
      // The tall house with the stair up its side.
      m.rect(34, 12, 8, 6, '8');
      m.stairs(27, 18, 'e', 2, 1, 7);
      m.rect(34, 18, 1, 2, '8').rect(35, 18, 7, 2, '#');
      m.rect(31, 12, 1, 6, '-');
      m.rect(15, 18, 5, 1, '%').rect(15, 19, 1, 3, '%').rect(24, 16, 5, 1, '%').rect(24, 17, 1, 1, '%');
      // The market: stalls round a fountain.
      m.rect(21, 24, 4, 3, '2').put(22, 26, 'B');
      m.cell(17, 23, 'x').cell(17, 24, 'x').cell(28, 25, 'X').cell(18, 26, 'X').cell(27, 22, 'x');
      m.cell(9, 25, 'T').cell(36, 24, 'T').cell(5, 23, 'X');
      m.rect(38, 21, 1, 4, '=');
      m.put(9, 44, 'Q').put(38, 36, 'R');
      [[10, 16], [38, 10], [25, 20]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* A village green: brick cottages with gardens, hedges and old trees,
       a stone wall round each end, and the well in the square. */
    village() {
      const m = Grid(48, 52, true, 'H');
      [[18, 2], [21, 2], [24, 2], [27, 2], [30, 2], [20, 4], [28, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(24, 5, 'F');
      m.rect(1, 7, 12, 1, '-').rect(36, 7, 11, 1, '-');
      m.box(2, 1, 9, 6, '%', { doors: [[10, 3], [5, 6]], win: [[7, 6], [2, 3]], roof: true });
      m.box(37, 1, 9, 6, '%', { doors: [[37, 3], [41, 6]], win: [[43, 6], [45, 3]], roof: true });
      m.rect(14, 9, 1, 6, 't').rect(33, 9, 1, 6, 't').rect(15, 14, 4, 1, 't').rect(29, 14, 4, 1, 't');
      m.cell(5, 11, 'T').cell(42, 12, 'T').cell(10, 17, 'T').cell(24, 10, 'T');
      m.put(24, 12, 'A').put(23, 39, 'C');
      m.box(3, 13, 8, 7, '#', { doors: [[10, 16], [6, 13], [6, 19]], win: [[3, 16], [8, 19], [8, 13]], roof: true });
      m.cell(5, 15, 'x').cell(8, 17, 'X');
      m.box(36, 15, 9, 7, '%', { doors: [[36, 18], [40, 21], [40, 15]], win: [[44, 18], [38, 21], [42, 15]], roof: true });
      m.cell(38, 17, 'x').cell(42, 19, 'x');
      m.rect(17, 19, 3, 1, '=').rect(28, 19, 3, 1, '=').cell(20, 17, 'x').cell(27, 17, 'X');
      m.rect(22, 23, 4, 4, '2').put(23, 25, 'B');
      m.rect(14, 24, 1, 3, '-').rect(33, 22, 1, 3, '-').cell(18, 24, 'o').cell(29, 26, 'o');
      m.cell(3, 24, 'T').cell(44, 25, 'T').rect(8, 23, 3, 1, 't').rect(37, 23, 3, 1, 't');
      m.put(6, 41, 'Q').put(40, 35, 'R');
      [[12, 11], [34, 11], [45, 23]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* A snowed-in outpost: concrete bunkers, pines, crates of stores, and a
       radar mast on a plinth you can climb in the middle. */
    frost() {
      const m = Grid(44, 52, true, 'H');
      [[15, 2], [18, 2], [21, 2], [24, 2], [27, 2], [17, 4], [25, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(21, 6, 'F');
      m.box(2, 2, 9, 7, '#', { doors: [[10, 4], [10, 5], [5, 8]], win: [[2, 5], [7, 8]], roof: true });
      m.cell(4, 4, 'X').cell(8, 6, 'x');
      m.box(32, 1, 10, 6, '#', { doors: [[32, 3], [36, 6], [37, 6]], win: [[40, 6], [32, 5]], roof: true });
      m.cell(39, 3, 'x').cell(40, 3, 'x');
      m.rect(14, 8, 4, 1, '=').rect(26, 8, 4, 1, '=');
      m.cell(13, 3, 'T').cell(30, 5, 'T').cell(5, 12, 'T').cell(38, 11, 'T').cell(11, 20, 'T');
      m.put(21, 13, 'A').put(22, 38, 'C');
      m.cell(18, 12, 'X').cell(25, 14, 'X').cell(19, 16, 'x').cell(24, 11, 'x');
      m.box(28, 14, 9, 8, '%', { doors: [[28, 17], [28, 18], [32, 21], [32, 14]], win: [[36, 17], [34, 21], [30, 14]], roof: true });
      m.cell(30, 16, 'x').cell(34, 19, 'X');
      m.rect(2, 16, 6, 2, 'k').rect(2, 18, 2, 2, 'X');
      m.rect(9, 14, 1, 6, '-');
      m.rect(19, 21, 6, 5, '6');
      m.stairs(21, 18, 's', 2, 1, 5);
      m.stairs(14, 23, 'e', 2, 1, 5);
      m.put(21, 24, 'B');
      m.rect(11, 26, 3, 1, '=').rect(29, 23, 3, 1, '=').cell(38, 24, 'o').cell(39, 24, 'o');
      m.put(9, 43, 'Q').put(39, 37, 'R');
      [[11, 11], [40, 12], [5, 24]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* City blocks at dusk: two streets and a square, shops you can walk
       through, and a parking lot of containers standing in for vans. */
    downtown() {
      const m = Grid(46, 56, true, 'H');
      [[16, 2], [19, 2], [22, 2], [25, 2], [28, 2], [18, 4], [26, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(22, 5, 'F');
      m.rect(1, 8, 44, 3, ',');
      m.rect(10, 11, 3, 34, ',');
      m.box(1, 1, 11, 7, '%', { doors: [[11, 3], [11, 4], [6, 7]], win: [[3, 7], [9, 7], [11, 2]], roof: true });
      m.cell(3, 3, 'x').cell(8, 5, 'x');
      m.box(34, 1, 11, 7, '#', { doors: [[34, 4], [39, 7], [40, 7]], win: [[36, 7], [43, 7], [34, 2]], roof: true });
      m.cell(42, 3, 'X');
      m.box(1, 12, 9, 10, '%', { doors: [[9, 14], [9, 15], [4, 21], [9, 19]], win: [[1, 16], [7, 21], [4, 12]], roof: true });
      m.cell(3, 14, 'X').cell(6, 18, 'x').rect(3, 17, 3, 1, '-');
      m.box(14, 12, 9, 8, '#', { doors: [[22, 14], [22, 15], [17, 19], [18, 19], [14, 16]], win: [[20, 19], [14, 13], [17, 12]], roof: true });
      m.cell(16, 14, 'x').cell(20, 17, 'X');
      m.rect(26, 13, 2, 5, 'c').rect(30, 12, 2, 5, 'k').rect(34, 14, 5, 2, 'u');
      m.put(22, 22, 'A').put(23, 33, 'C');
      m.box(36, 18, 9, 9, '%', { doors: [[36, 21], [36, 22], [40, 26], [40, 18]], win: [[44, 22], [38, 26], [42, 18]], roof: true });
      m.cell(38, 20, 'x').cell(42, 24, 'X');
      m.rect(19, 25, 8, 1, '-').rect(15, 24, 1, 3, '=').cell(30, 24, 'o').cell(31, 24, 'o');
      m.put(22, 27, 'B');
      m.cell(28, 20, 'T').cell(13, 24, 'T');
      m.put(6, 47, 'Q').put(38, 40, 'R');
      [[5, 25], [32, 9], [25, 10]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* A plant: two long halls under roofs, machinery for cover, a gantry
       platform down the middle, and a loading yard at each end. */
    factory() {
      const m = Grid(44, 52, true, 'H');
      [[15, 2], [18, 2], [21, 2], [24, 2], [27, 2], [17, 4], [25, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(21, 5, 'F');
      m.rect(2, 2, 4, 2, 'u').rect(37, 3, 5, 2, 'c').cell(9, 3, 'X').cell(33, 6, 'x');
      m.rect(12, 8, 3, 1, '=').rect(29, 8, 3, 1, '=');
      m.box(1, 10, 18, 14, '#', {
        doors: [[8, 10], [9, 10], [18, 13], [18, 14], [18, 19], [18, 20], [5, 23], [6, 23], [12, 23]],
        win: [[14, 10], [16, 23], [2, 23]], roof: true
      });
      m.rect(4, 13, 4, 3, 'X').rect(11, 13, 3, 2, 'x').rect(4, 18, 2, 3, 'x').rect(10, 17, 5, 2, '-').cell(15, 21, 'o').cell(14, 21, 'o');
      m.box(27, 12, 16, 11, '%', {
        doors: [[27, 15], [27, 16], [27, 19], [33, 12], [34, 12], [36, 22], [37, 22]],
        win: [[42, 16], [30, 12], [40, 22], [30, 22]], roof: true
      });
      m.rect(30, 15, 2, 5, 'X').rect(35, 15, 5, 2, 'x').rect(35, 19, 3, 1, '-').cell(40, 19, 'X');
      m.put(22, 12, 'A').put(21, 39, 'C');
      m.cell(20, 14, 'x').cell(24, 16, 'x').cell(23, 10, 'o');
      m.rect(20, 22, 4, 4, '4');
      m.stairs(21, 19, 's', 2, 1, 3);
      m.put(21, 25, 'B');
      m.rect(24, 24, 3, 1, '=').cell(19, 21, 'x');
      m.put(10, 43, 'Q').put(33, 36, 'R');
      [[23, 8], [8, 25], [40, 25]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* Ruins in the jungle: a stepped pyramid in the middle with stairs
       front and back, broken walls and pillars, and trees everywhere. */
    temple() {
      const m = Grid(48, 52, true, 'H');
      [[18, 2], [21, 2], [24, 2], [27, 2], [30, 2], [20, 4], [28, 4]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(24, 5, 'F');
      m.rect(10, 7, 9, 1, '#').rect(29, 7, 9, 1, '#').rect(10, 3, 1, 4, '#').rect(37, 3, 1, 4, '#');
      m.cell(3, 3, 'T').cell(44, 4, 'T').cell(6, 9, 'T').cell(41, 10, 'T').cell(2, 16, 'T').cell(45, 17, 'T').cell(15, 12, 'T');
      m.rect(4, 5, 3, 1, 't').rect(41, 6, 3, 1, 't');
      m.put(24, 11, 'A').put(23, 40, 'C');
      m.cell(20, 10, 'P').cell(28, 10, 'P').cell(20, 13, 'P').cell(28, 13, 'P').cell(22, 14, 'x');
      m.box(4, 12, 9, 8, '%', { doors: [[12, 15], [12, 16], [7, 12], [8, 19]], win: [[4, 15], [10, 19]], roof: true });
      m.cell(6, 14, 'X').cell(10, 17, 'x');
      m.rect(34, 13, 1, 7, '#').rect(35, 19, 6, 1, '#').rect(41, 13, 1, 5, '#').cell(37, 15, 'X').cell(38, 16, 'x');
      // The pyramid: a metre, then two, then three, stairs north and south.
      m.rect(17, 20, 14, 6, '2');
      m.rect(19, 21, 10, 5, '4');
      m.rect(21, 23, 6, 3, '6');
      m.rect(23, 17, 2, 1, '1').rect(23, 18, 2, 1, '2').rect(23, 19, 2, 1, '2');
      m.rect(23, 20, 2, 1, '3').rect(23, 21, 2, 1, '4').rect(23, 22, 2, 1, '5');
      m.put(23, 24, 'B');
      m.cell(13, 23, 'P').cell(34, 22, 'P').cell(9, 24, 'T').cell(39, 25, 't').cell(40, 25, 't');
      m.put(8, 37, 'Q').put(37, 33, 'R');
      [[14, 17], [44, 12], [5, 24]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    },

    /* A small training yard: plywood walls, sandbags, a container, and a
       tower in the middle. Made for the free-for-alls and the gun race. */
    yard() {
      const m = Grid(32, 36, true, 'H');
      [[11, 2], [14, 2], [17, 2], [20, 2], [13, 4], [18, 4], [8, 3]].forEach(p => m.cell(p[0], p[1], 'a'));
      m.cell(15, 5, 'F');
      m.rect(3, 6, 6, 1, '#').rect(23, 6, 6, 1, '#').rect(3, 7, 1, 3, '#').rect(28, 3, 1, 4, '#');
      m.rect(11, 8, 3, 1, '=').rect(18, 8, 3, 1, '=');
      m.put(15, 10, 'A').put(16, 25, 'C');
      m.cell(6, 11, 'X').cell(7, 11, 'x').cell(24, 10, 'x').cell(25, 12, 'X');
      m.rect(2, 13, 2, 5, 'c').rect(9, 12, 1, 4, '#').rect(22, 13, 1, 4, '#');
      m.rect(14, 15, 4, 3, '4');
      m.stairs(15, 12, 's', 2, 1, 3);
      m.put(15, 17, 'B');
      m.cell(11, 16, 'o').cell(20, 15, 'x').cell(26, 17, 'o');
      m.put(6, 30, 'Q').put(24, 22, 'R');
      [[4, 16], [27, 9], [12, 11]].forEach(p => m.cell(p[0], p[1], 's'));
      return m.done();
    }
  };

  const KEYS = Object.keys(BUILD);
  const cache = Object.create(null);

  /** The laid-out map for a key: rows of characters, roofs and a theme. */
  function get(key) {
    const k = BUILD[key] ? key : KEYS[0];
    if (!cache[k]) {
      const built = BUILD[k]();
      const W = built.rows[0].length;
      built.rows.forEach((r, i) => {
        if (r.length !== W) throw new Error('fps map ' + k + ': row ' + i + ' is ' + r.length + ' wide, not ' + W);
      });
      cache[k] = { key: k, W: W, D: built.rows.length, rows: built.rows, roofs: built.roofs, theme: THEMES[k] };
    }
    return cache[k];
  }

  PV.FpsMaps = { KEYS: KEYS, THEMES: THEMES, get: get };

})(window.PV);
