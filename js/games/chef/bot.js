/* 街头大厨 / Street Chef — a cook who knows what they are doing.

   next(game) is the one thing a good cook would do now, as an input the
   game accepts (engine.js), or null. The tests play every level with it,
   at a human's pace and at a quick one, which is how the level numbers in
   data.js were set; the view asks it too, for the hand that points the way
   on a truck's first level.

   The order of business:
     1. pick up coins (they hold the place at the window);
     2. throw out anything burnt;
     3. hand over anything that is ready and wanted;
     4. for each thing still wanted, least patient customer first, take the
        next step: claim the plate furthest along toward it, or an empty
        one, and bring the next missing part — from a bin, the hot plate, a
        finished pot — or start one cooking. Whatever is already cooking or
        pouring is claimed by the first order that could use it, so two
        orders never wait on the same pot;
     5. nothing to do? make sure a base is on the heat for who comes next.

   It reads the game and never changes it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.ChefData, HZ = D.HZ;
  const kindOf = D.partKind;
  const layer = p => (D.PARTS[p] && D.PARTS[p].layer) || 0;

  function next(g) {
    if (!g || g.phase !== 'play') return null;
    const tr = g.truck;

    // 1. Coins.
    for (let i = 0; i < g.spots.length; i++) if (g.spots[i].coins) return { a: 'coins', spot: i };

    // 2. Burnt.
    for (let s = 0; s < g.stations.length; s++) {
      const st = g.stations[s];
      for (let i = 0; i < st.slots.length; i++) if (st.slots[i].st === 'burnt') return { a: 'slot', s: s, i: i };
    }

    // 3. Ready and wanted.
    for (let i = 0; i < g.plates.length; i++) {
      const pl = g.plates[i];
      if (pl.parts.length && g.bestCustomer(D.keyOf(pl.parts)) >= 0) return { a: 'plate', i: i };
    }
    for (let s = 0; s < g.stations.length; s++) {
      const st = g.stations[s];
      const ready = st.type === 'drink' ? 'full' : (kindOf(st.makes) === 'side' ? 'done' : null);
      if (!ready) continue;
      for (let i = 0; i < st.slots.length; i++) {
        if (st.slots[i].st === ready && g.bestCustomer(st.makes) >= 0) return { a: 'slot', s: s, i: i };
      }
    }
    for (let i = 0; i < g.warm.length; i++) {
      const p = g.warm[i];
      if (p && kindOf(p) === 'side' && g.bestCustomer(p) >= 0) return { a: 'warm', i: i };
    }

    // 4. What is wanted, in the order it was asked for.
    const needs = [];
    for (const sp of g.spots) {
      const c = sp.c;
      if (!c || (c.st !== 'wait' && c.st !== 'in')) continue;
      for (const it of c.items) if (!it.done) needs.push({ id: c.id, parts: tr.menu[it.m].parts });
    }
    // First come, first served. Sorting by patience left looks smarter and
    // is worse: a customer with three things on the order has more patience
    // than one with one, so the queue reshuffles every time somebody new
    // arrives and a pot cooked for one order is taken by another.
    needs.sort((a, b) => a.id - b.id);

    const slotsUsed = new Set(), warmUsed = new Set(), platesUsed = new Set();
    let stuck = false;
    const acts = [];

    function find(part, state) {
      for (let s = 0; s < g.stations.length; s++) {
        const st = g.stations[s];
        if (st.makes !== part) continue;
        for (let i = 0; i < st.slots.length; i++) {
          const key = s + ':' + i;
          if (st.slots[i].st === state && !slotsUsed.has(key)) return { s: s, i: i, key: key };
        }
      }
      return null;
    }

    /** Bring the next missing part to plate `pi`, or start it cooking. A
        cooked topping is only started once the plate's base is on it or
        ready to go on: a sauce started for a pasta still in the pot waits
        for it, and three of those waiting is a hot plate full and a fourth
        burning. */
    function supply(missing, pi) {
      const pl = g.plates[pi];
      const sorted = missing.slice().sort((a, b) => layer(a) - layer(b));
      let based = pl.parts.length > 0;
      for (const p of sorted) {
        const isBase = kindOf(p) === 'base';
        const fits = g.canAdd(pl, p);
        const to = { k: 'plate', i: pi };
        const b = g.bins.indexOf(p);
        if (b >= 0) { if (fits) return { a: 'bin', b: b, to: to }; continue; }
        const w = g.warm.findIndex((x, i) => x === p && !warmUsed.has(i));
        if (w >= 0) { warmUsed.add(w); if (isBase) based = true; if (fits) return { a: 'warm', i: w, to: to }; continue; }
        const done = find(p, 'done');
        if (done) {
          slotsUsed.add(done.key);
          if (isBase) based = true;
          if (fits) return { a: 'slot', s: done.s, i: done.i, to: to };
          // It cannot go on yet: keep it off the heat if there is room.
          const st = g.stations[done.s];
          const free = g.warm.indexOf(null);
          if (free >= 0 && st.slots[done.i].t > st.burn * 0.4) return { a: 'slot', s: done.s, i: done.i, to: { k: 'warm', i: free } };
          continue;
        }
        const cooking = find(p, 'cook');
        if (cooking) { slotsUsed.add(cooking.key); continue; }
        if (!isBase && !based) return null;
        const empty = find(p, 'empty');
        if (empty) return { a: 'slot', s: empty.s, i: empty.i };
        if (isBase) return null;
      }
      return null;
    }

    for (const n of needs) {
      const first = n.parts[0];
      const kind = kindOf(first);
      if (kind === 'drink' || kind === 'side') {
        const busy = find(first, kind === 'drink' ? 'full' : 'done') || find(first, kind === 'drink' ? 'fill' : 'cook');
        if (busy) { slotsUsed.add(busy.key); continue; }
        const w = g.warm.findIndex((x, i) => x === first && !warmUsed.has(i));
        if (w >= 0) { warmUsed.add(w); continue; }
        const empty = find(first, 'empty');
        if (empty) acts.push({ a: 'slot', s: empty.s, i: empty.i });
        continue;
      }
      let best = -1, most = 0;
      g.plates.forEach((pl, i) => {
        if (!pl.parts.length || platesUsed.has(i)) return;
        if (!pl.parts.every(p => n.parts.indexOf(p) >= 0)) return;
        if (pl.parts.length > most) { most = pl.parts.length; best = i; }
      });
      if (best < 0) {
        best = g.plates.findIndex((pl, i) => !pl.parts.length && !platesUsed.has(i));
        if (best < 0) { stuck = true; continue; }
      }
      platesUsed.add(best);
      const missing = n.parts.filter(p => g.plates[best].parts.indexOf(p) < 0);
      if (!missing.length) continue;
      const act = supply(missing, best);
      if (act) acts.push(act);
    }

    // Every order has had its say; now which first. Food coming off the heat
    // beats everything, the nearest to burning first; then whatever starts
    // something cooking, because that is the step that takes time; then the
    // rest in the order it was asked for. Done one order at a time instead,
    // a sauce finished for the second plate burns while the first is dressed.
    if (acts.length) {
      let pick = null, heat = -1;
      for (const a of acts) {
        if (a.a !== 'slot') continue;
        const st = g.stations[a.s], sl = st.slots[a.i];
        if (sl.st === 'done' && st.type === 'cook' && sl.t / st.burn > heat) { heat = sl.t / st.burn; pick = a; }
      }
      if (pick) return pick;
      for (const a of acts) if (a.a === 'slot' && g.stations[a.s].slots[a.i].st === 'empty') return a;
      return acts[0];
    }

    // A plate nobody can use is in the way of one somebody can.
    if (stuck) {
      for (let i = 0; i < g.plates.length; i++) {
        if (g.plates[i].parts.length && !platesUsed.has(i)) return { a: 'plate', i: i, to: { k: 'trash' } };
      }
    }

    // Something cooked that nobody has claimed is about to burn: a base is
    // safe on a plate, anything else on the hot plate.
    for (let s = 0; s < g.stations.length; s++) {
      const st = g.stations[s];
      if (st.type !== 'cook') continue;
      for (let i = 0; i < st.slots.length; i++) {
        const sl = st.slots[i];
        if (sl.st !== 'done' || slotsUsed.has(s + ':' + i) || sl.t < st.burn * 0.3) continue;
        const kind = kindOf(st.makes);
        const free = g.warm.indexOf(null);
        if (kind === 'base' && g.bestPlate(st.makes) >= 0) return { a: 'slot', s: s, i: i };
        if (free >= 0) return { a: 'slot', s: s, i: i, to: { k: 'warm', i: free } };
        if (kind === 'add' && g.bestPlate(st.makes) >= 0) return { a: 'slot', s: s, i: i };
      }
    }

    // 5. A base on the heat for whoever is next, if there is a plate to put it on.
    const spare = g.plates.some((pl, i) => !pl.parts.length && !platesUsed.has(i));
    if (spare && g.queue.length && g.queue[0].at - g.t < 4 * HZ) {
      for (let s = 0; s < g.stations.length; s++) {
        const st = g.stations[s];
        if (st.type !== 'cook' || kindOf(st.makes) !== 'base') continue;
        if (st.slots.some(x => x.st === 'cook' || x.st === 'done')) continue;
        if (g.warm.indexOf(st.makes) >= 0) continue;
        const i = st.slots.findIndex(x => x.st === 'empty');
        if (i >= 0) return { a: 'slot', s: s, i: i };
      }
    }
    return null;
  }

  /**
   * Play a whole level with the bot, `think` ticks between decisions (a
   * person takes a moment to look). Returns the game at its end. For the
   * tests, and for measuring a level.
   */
  function play(plan, think, maxTicks) {
    const g = new PV.ChefGame({ plan: plan });
    const every = Math.max(1, think | 0);
    const cap = maxTicks || 60 * 60 * HZ;
    let n = 0;
    while (!g.isOver() && n++ < cap) {
      if (g.phase === 'play' && g.t % every === 0) {
        const a = next(g);
        if (a) g.input(a);
      }
      g.advance();
    }
    return g;
  }

  PV.ChefBot = { next: next, play: play };

})(window.PV);
