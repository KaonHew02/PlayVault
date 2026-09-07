/* 五子棋 / Gomoku — opponent.

   One strategy, three blunder rates. Difficulty is decision quality, never
   cheating: the AI reads only the board every player can see, and a weaker
   level is the same strategy playing a worse move on purpose. Four separate
   strategies would be four things to keep correct, and the weak ones never get
   tested.

   The strategy is threat scoring: what a stone at (x, y) would be worth to me,
   plus most of what it would be worth to my opponent, because taking a point
   away is nearly as good as taking it. An immediate five, mine or theirs,
   short-circuits everything. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const FIVE = 1000000;

  /** Score of a run of `count` stones with `open` free ends. */
  function runScore(count, open) {
    if (count >= 5) return FIVE;
    if (open === 0) return 0;
    if (count === 4) return open === 2 ? 120000 : 12000;
    if (count === 3) return open === 2 ? 9000 : 600;
    if (count === 2) return open === 2 ? 500 : 70;
    return open === 2 ? 30 : 6;
  }

  /** What placing `colour` at (x, y) would be worth, over all four axes. */
  function pointValue(g, x, y, colour) {
    let total = 0;
    for (const d of PV.Gomoku.DIRS) {
      let count = 1, open = 0, i = 1;
      while (g.at(x + d[0] * i, y + d[1] * i) === colour) { count++; i++; }
      if (g.at(x + d[0] * i, y + d[1] * i) === -1) open++;
      let j = 1;
      while (g.at(x - d[0] * j, y - d[1] * j) === colour) { count++; j++; }
      if (g.at(x - d[0] * j, y - d[1] * j) === -1) open++;
      total += runScore(count, open);
    }
    return total;
  }

  const LEVELS = {
    easy: { blunder: 0.40, reach: 1 },
    normal: { blunder: 0.12, reach: 2 },
    hard: { blunder: 0.00, reach: 2 }
  };

  PV.GomokuAI = class GomokuAI {
    constructor(opts) {
      const o = opts || {};
      this.seat = o.seat == null ? 1 : o.seat;
      this.level = LEVELS[o.level] ? o.level : 'normal';
      this.rng = o.rng || new PV.RNG(1);
    }

    /** A move for this.seat, or null if the game is over. */
    choose(g) {
      if (g.over || g.turn !== this.seat) return null;
      const cfg = LEVELS[this.level];
      const me = this.seat, them = g.nextSeat(this.seat);
      const cands = g.candidates(cfg.reach);
      if (!cands.length) return null;

      const scored = cands.map(c => {
        const mine = pointValue(g, c.x, c.y, me);
        const theirs = pointValue(g, c.x, c.y, them);
        // Centre bias only breaks ties on an otherwise empty board.
        const centre = 8 - (Math.abs(c.x - 7) + Math.abs(c.y - 7));
        return { x: c.x, y: c.y, mine: mine, theirs: theirs, score: mine + theirs * 0.9 + centre };
      });

      // Win now; else stop them winning now. Never blunder either of these —
      // an opponent that walks past a completed five is not "easy", it is broken.
      const win = scored.find(s => s.mine >= FIVE);
      if (win) return { type: 'place', x: win.x, y: win.y };
      const block = scored.find(s => s.theirs >= FIVE);
      if (block) return { type: 'place', x: block.x, y: block.y };

      scored.sort((a, b) => b.score - a.score);

      let pick = scored[0];
      if (this.rng.chance(cfg.blunder) && scored.length > 1) {
        // Drop to a mid-table move rather than a random one: a genuinely random
        // stone on the far side of the board reads as a bug, not as a weak player.
        const span = Math.min(scored.length - 1, Math.max(2, Math.floor(scored.length * 0.35)));
        pick = scored[1 + this.rng.int(span)];
      }
      return { type: 'place', x: pick.x, y: pick.y };
    }
  };

  PV.GomokuAI.LEVELS = Object.keys(LEVELS);
  PV.GomokuAI.pointValue = pointValue;

})(window.PV);
