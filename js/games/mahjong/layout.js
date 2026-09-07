/* 麻将连连看 / Mahjong Solitaire — the board and the tile set.

   Positions are in HALF-tile units, because the classic turtle has rows that
   sit half a tile off the grid — the three "wings" on the left and right, and
   the single tile on top of the 2×2 cap. A tile at (x, y) covers x..x+2 and
   y..y+2, so two tiles overlap when their centres are less than a whole tile
   apart in both axes. One coordinate system, no special cases.

   The turtle is 144 tiles: 87 on the bottom layer, then 36, 16, 4 and 1. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  function turtle() {
    const out = [];
    const add = (x, y, z) => out.push({ x: x, y: y, z: z });
    const row = (cols, y, z) => { for (const c of cols) add(c * 2, y, z); };
    const span = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

    // Layer 1 — 87
    row(span(1, 12), 0, 0);
    row(span(3, 10), 2, 0);
    row(span(2, 11), 4, 0);
    row(span(1, 12), 6, 0);
    row(span(1, 12), 8, 0);
    row(span(2, 11), 10, 0);
    row(span(3, 10), 12, 0);
    row(span(1, 12), 14, 0);
    add(-2, 7, 0);                 // the left wing, half a row down
    add(26, 7, 0);                 // and the two on the right
    add(28, 7, 0);

    // Layers 2-4 — 36, 16, 4
    for (let r = 1; r <= 6; r++) row(span(4, 9), r * 2, 1);
    for (let r = 2; r <= 5; r++) row(span(5, 8), r * 2, 2);
    for (let r = 3; r <= 4; r++) row(span(6, 7), r * 2, 3);

    // Layer 5 — the single cap, centred on the 2×2 below it
    add(13, 7, 4);

    return out;
  }

  /* ---- the 144 tiles ---- */

  const SUITS = [
    { key: 'b', mark: '条', colour: '#1E7A45' },
    { key: 'c', mark: '萬', colour: '#B3261E' },
    { key: 'd', mark: '筒', colour: '#1D5FA8' }
  ];
  const WINDS = ['東', '南', '西', '北'];
  const DRAGONS = [
    { id: 'z5', text: '中', colour: '#B3261E' },
    { id: 'z6', text: '發', colour: '#1E7A45' },
    { id: 'z7', text: '白', colour: '#1D5FA8' }
  ];
  const FLOWERS = ['梅', '蘭', '菊', '竹'];
  const SEASONS = ['春', '夏', '秋', '冬'];

  /** Every tile face, keyed by id, with the group that decides matching. */
  function faces() {
    const f = Object.create(null);
    for (const s of SUITS) {
      for (let r = 1; r <= 9; r++) {
        f[s.key + r] = { id: s.key + r, rank: String(r), mark: s.mark, colour: s.colour, group: null };
      }
    }
    WINDS.forEach((w, i) => {
      f['z' + (i + 1)] = { id: 'z' + (i + 1), rank: '', mark: w, colour: '#14181F', group: null };
    });
    for (const d of DRAGONS) f[d.id] = { id: d.id, rank: '', mark: d.text, colour: d.colour, group: null };
    FLOWERS.forEach((x, i) => {
      f['f' + i] = { id: 'f' + i, rank: '', mark: x, colour: '#D9761F', group: 'flower' };
    });
    SEASONS.forEach((x, i) => {
      f['s' + i] = { id: 's' + i, rank: '', mark: x, colour: '#7A3FA0', group: 'season' };
    });
    return f;
  }

  /**
   * The 72 pairs the generator deals out. Every ordinary tile appears four
   * times (two pairs); flowers and seasons appear once each and are paired
   * WITHIN their group, which is why they match each other rather than
   * themselves.
   */
  function pairs() {
    const out = [];
    const F = faces();
    for (const id in F) {
      if (F[id].group) continue;
      out.push([id, id]); out.push([id, id]);
    }
    out.push(['f0', 'f1'], ['f2', 'f3'], ['s0', 's1'], ['s2', 's3']);
    return out;
  }

  PV.MahjongLayout = {
    turtle: turtle,
    faces: faces,
    pairs: pairs,
    /** Two faces match on exact id, or on being in the same bonus group. */
    matches(a, b) {
      if (!a || !b) return false;
      if (a.group || b.group) return a.group === b.group;
      return a.id === b.id;
    }
  };

})(window.PV);
