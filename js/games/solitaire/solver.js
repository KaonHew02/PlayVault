/* 接龙 / Klondike Solitaire — the solver.

   Klondike deals are not all winnable, and a dead deal is the most annoying
   thing a solitaire can hand you, because it looks exactly like a deal you are
   playing badly. So deals are checked before they are dealt: the generator
   tries seeds until one is proved winnable, and the board shows a mark when it
   is.

   Depth-first with three things that make it finish in milliseconds instead of
   never:

   - SAFE AUTOPLAY. A card that can never be needed to receive another card is
     sent to its foundation without branching. That collapses most of the tree.
   - A visited set keyed on the whole position, which is what stops the stock
     being cycled forever.
   - Move ordering: uncover a face-down card first, then play from the waste,
     then draw. Drawing is last because it is the move that does nothing.

   A node cap means a "no" can be a "did not find one in time". The caller
   treats an unproven deal as unverified rather than as unwinnable. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const C = () => PV.Cards;

  function fromEngine(g) {
    return {
      stock: g.stock.slice(),
      waste: g.waste.slice(),
      f: g.foundations.map(f => f.length),
      t: g.tableau.map(p => p.map(cd => ({ c: cd.c, up: cd.up }))),
      draw: g.drawCount
    };
  }

  function key(s) {
    return s.f.join(',') + '|'
      + s.t.map(p => p.map(cd => (cd.up ? '' : 'x') + cd.c).join('.')).join('/') + '|'
      + s.stock.join('.') + '|' + s.waste.join('.');
  }

  const clone = s => ({
    stock: s.stock.slice(), waste: s.waste.slice(), f: s.f.slice(),
    t: s.t.map(p => p.map(cd => ({ c: cd.c, up: cd.up }))), draw: s.draw
  });

  const won = s => s.f[0] === 13 && s.f[1] === 13 && s.f[2] === 13 && s.f[3] === 13;

  const toFoundation = (s, card) => C().rank(card) === s.f[C().suit(card)] + 1;

  function toTableau(s, card, pile) {
    const p = s.t[pile];
    if (!p.length) return C().rank(card) === 13;
    const top = p[p.length - 1];
    return top.up && C().rank(top.c) === C().rank(card) + 1 && C().red(top.c) !== C().red(card);
  }

  function runLength(s, pile) {
    const p = s.t[pile];
    let n = 0;
    for (let i = p.length - 1; i >= 0; i--) {
      if (!p[i].up) break;
      if (i < p.length - 1) {
        const below = p[i], above = p[i + 1];
        if (C().rank(below.c) !== C().rank(above.c) + 1 || C().red(below.c) === C().red(above.c)) break;
      }
      n++;
    }
    return n;
  }

  /**
   * A card is safe to send home when no lower card of the opposite colour can
   * still need it as a resting place. Playing these can never lose a game, so
   * the search does them for free.
   */
  function safeToPlay(s, card) {
    const r = C().rank(card);
    if (r <= 2) return true;
    const red = C().red(card);
    const opp = red ? [s.f[0], s.f[3]] : [s.f[1], s.f[2]];
    return Math.min(opp[0], opp[1]) >= r - 1;
  }

  function applyForced(s) {
    let moved = true;
    while (moved) {
      moved = false;
      const w = s.waste[s.waste.length - 1];
      if (w != null && toFoundation(s, w) && safeToPlay(s, w)) {
        s.waste.pop(); s.f[C().suit(w)]++; moved = true; continue;
      }
      for (let i = 0; i < 7; i++) {
        const p = s.t[i];
        const top = p[p.length - 1];
        if (top && top.up && toFoundation(s, top.c) && safeToPlay(s, top.c)) {
          p.pop();
          s.f[C().suit(top.c)]++;
          if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
          moved = true;
          break;
        }
      }
    }
    return s;
  }

  /** Ordered so that the moves that make progress come first. */
  function moves(s) {
    const out = [];
    const hidden = pile => s.t[pile].filter(cd => !cd.up).length;

    for (let from = 0; from < 7; from++) {
      const n = runLength(s, from);
      if (!n) continue;
      const card = s.t[from][s.t[from].length - n].c;
      const uncovers = s.t[from].length - n > 0 && !s.t[from][s.t[from].length - n - 1].up;
      for (let to = 0; to < 7; to++) {
        if (to === from || !toTableau(s, card, to)) continue;
        // Shuffling a whole pile into an empty column gains nothing.
        if (!s.t[to].length && !hidden(from)) continue;
        out.push({ k: 'tt', from: from, to: to, n: n, pri: uncovers ? 0 : 3 });
      }
    }

    for (let i = 0; i < 7; i++) {
      const p = s.t[i];
      const top = p[p.length - 1];
      if (top && top.up && toFoundation(s, top.c)) out.push({ k: 'tf', pile: i, pri: 2 });
    }

    const w = s.waste[s.waste.length - 1];
    if (w != null) {
      if (toFoundation(s, w)) out.push({ k: 'wf', pri: 1 });
      for (let i = 0; i < 7; i++) if (toTableau(s, w, i)) out.push({ k: 'wt', pile: i, pri: 1 });
    }

    if (s.stock.length || s.waste.length > 1) out.push({ k: 'draw', pri: 4 });

    return out.sort((a, b) => a.pri - b.pri);
  }

  function apply(s, m) {
    if (m.k === 'draw') {
      if (!s.stock.length) { s.stock = s.waste.reverse(); s.waste = []; }
      for (let i = 0; i < s.draw && s.stock.length; i++) s.waste.push(s.stock.pop());
      return s;
    }
    if (m.k === 'wf') { const c = s.waste.pop(); s.f[C().suit(c)]++; return s; }
    if (m.k === 'wt') { s.t[m.pile].push({ c: s.waste.pop(), up: true }); return s; }
    if (m.k === 'tf') {
      const p = s.t[m.pile], top = p.pop();
      s.f[C().suit(top.c)]++;
      if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
      return s;
    }
    const from = s.t[m.from];
    const run = from.splice(from.length - m.n, m.n);
    for (const cd of run) s.t[m.to].push(cd);
    if (from.length && !from[from.length - 1].up) from[from.length - 1].up = true;
    return s;
  }

  PV.SolitaireSolver = {
    /** {won, nodes, capped} — `capped` means the answer is "do not know". */
    solve(engine, opts) {
      const o = opts || {};
      const cap = o.nodes || 30000;
      const seen = new Set();
      let nodes = 0, capped = false;

      function dfs(s) {
        if (won(s)) return true;
        if (nodes++ >= cap) { capped = true; return false; }
        const k = key(s);
        if (seen.has(k)) return false;
        seen.add(k);
        for (const m of moves(s)) {
          if (capped) return false;
          const next = applyForced(apply(clone(s), m));
          if (dfs(next)) return true;
        }
        return false;
      }

      const start = applyForced(fromEngine(engine));
      const result = dfs(start);
      return { won: result, nodes: nodes, capped: capped && !result };
    },

    /**
     * A seed whose deal is proved winnable. Falls back to the first seed tried
     * and reports verified:false rather than dealing forever.
     */
    findDeal(rng, drawCount, opts) {
      const o = opts || {};
      const tries = o.tries || 14;
      const cap = o.nodes || (drawCount === 3 ? 24000 : 30000);
      let first = null;
      for (let i = 0; i < tries; i++) {
        const seed = rng.int(0xFFFFFFF) >>> 0;
        if (first === null) first = seed;
        const probe = new PV.Solitaire({ seed: seed, drawCount: drawCount });
        if (PV.SolitaireSolver.solve(probe, { nodes: cap }).won) {
          return { seed: seed, verified: true, tried: i + 1 };
        }
      }
      return { seed: first, verified: false, tried: tries };
    }
  };

})(window.PV);
