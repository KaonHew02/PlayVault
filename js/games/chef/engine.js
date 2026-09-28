/* 街头大厨 / Street Chef — the rules of a level.

   Four places at the window. Customers come on the level's own schedule
   (data.js roster), take a free place, and order one to three things: a
   plate, a side, a drink. They wait as long as their patience lasts; every
   thing handed over buys a little more. When the whole order is in they pay
   the bill plus a tip that is bigger the happier they are, and leave the
   coins on the counter. THE COINS HOLD THE PLACE: nobody new can stand
   there until they are picked up, which is the reference's rule and the
   thing that keeps a busy cook from ignoring the till.

   The kitchen is stations, plates, bins and a hot plate. A station has
   slots: tap an empty one and it starts cooking (or pouring); when it is
   done it waits `burn` seconds and then burns, unless it is moved first. A
   cooked thing goes to a plate that can take it, or to the hot plate, where
   nothing burns. A bin puts its part straight onto a plate. A plate with a
   finished dish goes to the customer who wants it — the least patient one
   if several do.

   Every action is an input, applied on a tick, so a level replays from its
   seed. An action may name where it goes (`to`: a plate, a place at the
   window, the hot plate or the bin) — that is a drag — or leave it to the
   engine to pick, which is a tap.

   Phases: menu (the truck is parked and the view's panels are up), ready
   (a short count-in), play, and then the harness's end card. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.ChefData, HZ = D.HZ;
  const SPOTS = 4;
  const READY = Math.round(1.6 * HZ);
  const WALK = Math.round(0.7 * HZ);      // up to the window, and away again
  const JAR = Math.round(1.1 * HZ);       // the tip jar takes coins after this
  const WIND_DOWN = Math.round(0.8 * HZ); // after the last customer, before the card
  const TIP = 0.5;                        // a customer who never waited tips half the bill
  const BUMP = 0.14;                      // patience back for each thing handed over
  const COLD_PAYS = 0.5;                  // a coffee left to go cold

  const kindOf = D.partKind;

  class ChefGame extends PV.LoopGame {
    /** opts: { seed, plan } — no plan starts at the menu. */
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.phase = 'menu';
      this.clock = 0;                 // every tick, for animation only
      this.events = [];
      this.seq = 0;
      this.plan = null;
      this.spec = null;
      if (o.plan) this.setup(o.plan);
    }

    /* ------------------------------------------------------------ setup */

    /**
     * plan: { truck, level, kit, boost: {fast, calm, noburn}, seed }
     * The seed is the level's own unless one is given (a race).
     */
    setup(plan) {
      const p = plan && typeof plan === 'object' ? plan : {};
      const tr = D.TRUCK[p.truck] || D.TRUCKS[0];
      const L = Math.max(1, Math.min(D.LEVELS, Math.round(Number(p.level)) || 1));
      const spec = D.levelSpec(tr.key, L);
      const seed = (Number(p.seed) >>> 0) || D.seedFor(tr.key, L);
      const list = D.roster(spec, seed);
      const kit = D.cleanKit(tr.key, p.kit);
      const fx = D.kitEffects(tr.key, kit);
      const b = p.boost && typeof p.boost === 'object' ? p.boost : {};
      const boost = { fast: !!b.fast, calm: !!b.calm, noburn: !!b.noburn };

      this.plan = { truck: tr.key, level: L, kit: kit, boost: boost, seed: p.seed ? seed : 0 };
      this.rng = new PV.RNG((seed ^ 0x5BD1E995) >>> 0);
      this.truck = tr;
      this.spec = spec;
      this.fx = fx;
      this.boost = boost;
      this.targets = D.targets(spec, list);
      this.menuParts = spec.menu.map(i => tr.menu[i].parts);

      const kitchen = D.kitchenAt(tr.key, L);
      this.stations = kitchen.stations.map(s => {
        const lv = fx.station(s.id);
        const quick = s.speed[lv - 1] * (boost.fast ? 0.65 : 1);
        return {
          id: s.id, def: s, type: s.type, makes: s.makes, level: lv,
          work: Math.max(1, Math.round((s.type === 'cook' ? s.cook : s.fill) * quick * HZ)),
          burn: Math.round((s.burn || 0) * HZ),
          cools: D.PARTS[s.makes].cools ? D.PARTS[s.makes].cools * HZ : 0,
          slots: Array.from({ length: s.slots[lv - 1] }, () => ({ st: 'empty', t: 0, age: 0 }))
        };
      });
      this.bins = kitchen.bins.slice();
      this.plates = Array.from({ length: fx.plates }, () => ({ parts: [] }));
      this.warm = Array.from({ length: fx.warmer }, () => null);
      this.spots = Array.from({ length: SPOTS }, () => ({ c: null, coins: 0, coinT: 0 }));
      this.queue = list.map((c, i) => ({ id: i, at: c.at, items: c.items, patience: c.patience, look: c.look }));
      this.calm = (1 + fx.calm) * (boost.calm ? 1.4 : 1);

      this.limit = spec.time * HZ;
      this.t = 0;
      this.readyT = 0;
      this.endT = 0;
      this.earned = 0;
      this.score = 0;
      this.tips = 0;
      this.served = 0;
      this.lost = 0;
      this.burned = 0;
      this.wasted = 0;
      this.handed = 0;
      this.failed = '';
      this.result = null;
      this.phase = 'ready';
    }

    /** Back to the parked truck, level abandoned. */
    toMenu() {
      this.phase = 'menu';
      this.spec = null;
      this.result = null;
    }

    /* ------------------------------------------------------------- tick */

    step() {
      this.clock++;
      for (const a of this.takeInputs()) this.handle(a);
      if (this.phase === 'ready') {
        if (++this.readyT >= READY) { this.phase = 'play'; this.emit('go'); }
        return;
      }
      if (this.phase !== 'play') return;
      this.t++;
      this.cook();
      if (this.phase !== 'play') return;
      this.arrive();
      this.customers();
      if (this.phase !== 'play') return;
      if (this.t >= this.limit) { this.end('time'); return; }
      const empty = !this.queue.length && this.spots.every(s => !s.c && !s.coins);
      if (empty) { if (++this.endT >= WIND_DOWN) this.end('done'); }
      else this.endT = 0;
    }

    cook() {
      for (let s = 0; s < this.stations.length; s++) {
        const st = this.stations[s];
        for (let i = 0; i < st.slots.length; i++) {
          const sl = st.slots[i];
          if (sl.st === 'cook') {
            if (++sl.t >= st.work) { sl.st = 'done'; sl.t = 0; this.emit('ding', { s: s, i: i }); }
          } else if (sl.st === 'done') {
            if (this.boost.noburn) continue;
            if (++sl.t >= st.burn) {
              sl.st = 'burnt'; sl.t = 0;
              this.burned++;
              this.emit('burn', { s: s, i: i });
              if (this.spec.noBurn) { this.fail('burn'); return; }
            }
          } else if (sl.st === 'fill') {
            if (++sl.t >= st.work) { sl.st = 'full'; sl.t = 0; sl.age = 0; this.emit('poured', { s: s, i: i }); }
          } else if (sl.st === 'full') {
            sl.age++;
          }
        }
      }
    }

    arrive() {
      while (this.queue.length && this.queue[0].at <= this.t) {
        const free = [];
        this.spots.forEach((s, i) => { if (!s.c && !s.coins) free.push(i); });
        if (!free.length) return;
        const i = free[this.rng.int(free.length)];
        const q = this.queue.shift();
        const max = Math.round(q.patience * this.calm);
        this.spots[i].c = {
          id: q.id, look: q.look, st: 'in', t: 0, pat: max, max: max, mood: 1,
          items: q.items.map(m => ({ m: m, key: D.keyOf(this.truck.menu[m].parts), done: false, cold: false }))
        };
        this.emit('arrive', { spot: i });
      }
    }

    customers() {
      for (let i = 0; i < this.spots.length; i++) {
        const s = this.spots[i];
        if (s.coins && this.fx.jar && ++s.coinT >= JAR) this.collect(i);
        const c = s.c;
        if (!c) continue;
        c.t++;
        if (c.st === 'in') {
          if (c.t >= WALK) { c.st = 'wait'; c.t = 0; }
        } else if (c.st === 'wait') {
          if (--c.pat <= 0) {
            c.pat = 0; c.st = 'angry'; c.t = 0; c.mood = 0;
            this.lost++;
            this.emit('angry', { spot: i });
            if (this.spec.noLoss) { this.fail('lost'); return; }
          }
        } else if (c.t >= WALK) {
          s.c = null;
        }
      }
    }

    /* ---------------------------------------------------------- actions */

    handle(a) {
      if (!a || typeof a !== 'object') return;
      if (a.a === 'begin') { if (this.phase === 'menu') this.setup(a.plan); return; }
      if (a.a === 'quit') { if (this.phase !== 'menu') this.toMenu(); return; }
      if (this.phase !== 'play') return;
      const to = this.target(a.to);
      if (a.to && !to) { this.nope(); return; }
      switch (a.a) {
        case 'station': this.onStation(a.s); break;
        case 'slot': this.onSlot(a.s, a.i, to); break;
        case 'bin': this.onBin(a.b, to); break;
        case 'plate': this.onPlate(a.i, to); break;
        case 'warm': this.onWarm(a.i, to); break;
        case 'coins': this.collect(a.spot); break;
      }
    }

    /** A drop target, checked: {k:'plate'|'spot'|'warm', i} or {k:'trash'}. */
    target(to) {
      if (!to || typeof to !== 'object') return null;
      const i = to.i | 0;
      if (to.k === 'trash') return { k: 'trash' };
      if (to.k === 'plate' && i >= 0 && i < this.plates.length) return { k: 'plate', i: i };
      if (to.k === 'spot' && i >= 0 && i < this.spots.length) return { k: 'spot', i: i };
      if (to.k === 'warm' && i >= 0 && i < this.warm.length) return { k: 'warm', i: i };
      return null;
    }

    station(s) { return Number.isInteger(s) && s >= 0 && s < this.stations.length ? this.stations[s] : null; }

    /** The station itself: start in its first free slot. */
    onStation(s) {
      const st = this.station(s);
      if (!st) return;
      const i = st.slots.findIndex(x => x.st === 'empty');
      if (i < 0) { this.nope(); return; }
      this.start(s, i);
    }

    start(s, i) {
      const st = this.stations[s], sl = st.slots[i];
      sl.st = st.type === 'cook' ? 'cook' : 'fill';
      sl.t = 0; sl.age = 0;
      this.emit(st.type === 'cook' ? 'cook' : 'pour', { s: s, i: i });
    }

    onSlot(s, i, to) {
      const st = this.station(s);
      if (!st || !Number.isInteger(i) || i < 0 || i >= st.slots.length) return;
      const sl = st.slots[i];
      if (sl.st === 'empty') { if (!to) this.start(s, i); return; }
      if (sl.st === 'burnt') {
        if (!to || to.k === 'trash') { this.clearSlot(sl); this.emit('trash'); } else this.nope();
        return;
      }
      if (sl.st !== 'done' && sl.st !== 'full') return;
      if (to && to.k === 'trash') { this.clearSlot(sl); this.wasted++; this.emit('trash'); return; }
      const cold = st.cools > 0 && sl.age >= st.cools;
      if (this.place(st.makes, to, st.type === 'cook', cold)) this.clearSlot(sl);
      else this.nope();
    }

    clearSlot(sl) { sl.st = 'empty'; sl.t = 0; sl.age = 0; }

    onBin(b, to) {
      if (!Number.isInteger(b) || b < 0 || b >= this.bins.length) return;
      if (to && to.k === 'trash') return;
      if (!this.place(this.bins[b], to, false, false)) this.nope();
    }

    onPlate(i, to) {
      if (!Number.isInteger(i) || i < 0 || i >= this.plates.length) return;
      const pl = this.plates[i];
      if (!pl.parts.length) return;
      if (to && to.k === 'trash') { pl.parts = []; this.wasted++; this.emit('trash'); return; }
      const key = D.keyOf(pl.parts);
      let spot = -1;
      if (to && to.k === 'spot') spot = to.i;
      else if (!to) spot = this.bestCustomer(key);
      if (spot >= 0 && this.give(spot, key, false)) pl.parts = [];
      else this.nope();
    }

    onWarm(i, to) {
      if (!Number.isInteger(i) || i < 0 || i >= this.warm.length) return;
      const part = this.warm[i];
      if (!part) return;
      if (to && to.k === 'trash') { this.warm[i] = null; this.wasted++; this.emit('trash'); return; }
      if (to && to.k === 'warm') return;
      if (this.place(part, to, false, false)) this.warm[i] = null;
      else this.nope();
    }

    collect(i) {
      if (!Number.isInteger(i) || i < 0 || i >= this.spots.length) return;
      const s = this.spots[i];
      if (!s.coins) return;
      this.earned += s.coins;
      this.score = this.earned;
      this.emit('coins', { spot: i, n: s.coins });
      s.coins = 0; s.coinT = 0;
    }

    /* ---------------------------------------------------------- routing */

    /** Put a part somewhere: where it was dropped, or the best place for it. */
    place(part, to, canWarm, cold) {
      const kind = kindOf(part);
      if (kind === 'side' || kind === 'drink') {
        if (to && to.k === 'spot') return this.give(to.i, part, cold);
        if (to && to.k === 'warm') return kind === 'side' && canWarm && this.toWarm(part, to.i);
        if (to) return false;
        const spot = this.bestCustomer(part);
        if (spot >= 0) return this.give(spot, part, cold);
        return kind === 'side' && canWarm && this.toWarm(part, -1);
      }
      if (to && to.k === 'plate') return this.addTo(to.i, part);
      if (to && to.k === 'warm') return canWarm && this.toWarm(part, to.i);
      if (to) return false;
      const p = this.bestPlate(part);
      if (p >= 0) return this.addTo(p, part);
      return canWarm && this.toWarm(part, -1);
    }

    toWarm(part, i) {
      if (i < 0) i = this.warm.indexOf(null);
      if (i < 0 || i >= this.warm.length || this.warm[i]) return false;
      this.warm[i] = part;
      this.emit('warm', { i: i });
      return true;
    }

    /** Some dish on today's menu has all of these. */
    onMenu(parts) {
      return this.menuParts.some(m => parts.every(p => m.indexOf(p) >= 0));
    }

    canAdd(pl, part) {
      if (kindOf(part) === 'base') return !pl.parts.length && this.onMenu([part]);
      if (!pl.parts.length || pl.parts.indexOf(part) >= 0) return false;
      return this.onMenu(pl.parts.concat(part));
    }

    addTo(i, part) {
      const pl = this.plates[i];
      if (!pl || !this.canAdd(pl, part)) return false;
      pl.parts.push(part);
      this.emit('add', { i: i, part: part });
      return true;
    }

    /** Somebody at the window is waiting on a dish that has all of these. */
    wanted(parts) {
      for (const s of this.spots) {
        const c = s.c;
        if (!c || (c.st !== 'wait' && c.st !== 'in')) continue;
        for (const it of c.items) {
          if (it.done) continue;
          const dish = this.truck.menu[it.m].parts;
          if (parts.every(p => dish.indexOf(p) >= 0)) return true;
        }
      }
      return false;
    }

    /** A base goes on the first empty plate; an add on the first plate that
        someone is waiting for, else the first that can take it at all. */
    bestPlate(part) {
      if (kindOf(part) === 'base') return this.plates.findIndex(p => !p.parts.length);
      let any = -1;
      for (let i = 0; i < this.plates.length; i++) {
        const pl = this.plates[i];
        if (!this.canAdd(pl, part)) continue;
        if (this.wanted(pl.parts.concat(part))) return i;
        if (any < 0) any = i;
      }
      return any;
    }

    /** The least patient customer still waiting for this. */
    bestCustomer(key) {
      let best = -1, low = Infinity;
      for (let i = 0; i < this.spots.length; i++) {
        const c = this.spots[i].c;
        if (!c || c.st !== 'wait') continue;
        if (!c.items.some(it => !it.done && it.key === key)) continue;
        if (c.pat < low) { low = c.pat; best = i; }
      }
      return best;
    }

    /** Hand something over. Pays when it was the last thing on the order. */
    give(spot, key, cold) {
      const s = this.spots[spot];
      const c = s && s.c;
      if (!c || c.st !== 'wait') return false;
      const it = c.items.find(x => !x.done && x.key === key);
      if (!it) return false;
      it.done = true;
      it.cold = !!cold;
      this.handed++;
      c.pat = Math.min(c.max, c.pat + Math.round(c.max * BUMP));
      this.emit('serve', { spot: spot, key: key });
      if (c.items.every(x => x.done)) this.pay(spot);
      return true;
    }

    pay(spot) {
      const s = this.spots[spot], c = s.c;
      let bill = 0;
      for (const it of c.items) {
        const price = this.truck.menu[it.m].price * this.fx.priceK;
        bill += it.cold ? price * COLD_PAYS : price;
      }
      const mood = c.pat / c.max;
      const tip = Math.round(bill * TIP * mood);
      bill = Math.round(bill);
      s.coins += bill + tip;
      s.coinT = 0;
      this.tips += tip;
      this.served++;
      c.st = 'happy'; c.t = 0; c.mood = mood;
      this.emit('pay', { spot: spot, n: bill + tip, tip: tip });
    }

    nope() { this.emit('nope'); }

    /* -------------------------------------------------------------- end */

    fail(why) {
      this.failed = why;
      this.end('failed');
    }

    end(reason) {
      for (let i = 0; i < this.spots.length; i++) this.collect(i);
      const tg = this.targets.stars;
      const goal = this.spec.goal;
      const met = goal.type === 'serve' ? this.served >= goal.n : this.earned >= tg[0];
      const passed = !this.failed && met;
      const stars = passed ? 1 + (this.earned >= tg[1] ? 1 : 0) + (this.earned >= tg[2] ? 1 : 0) : 0;
      this.result = {
        reason: reason, failed: this.failed, passed: passed, stars: stars,
        earned: this.earned, served: this.served, lost: this.lost, tips: this.tips,
        burned: this.burned, wasted: this.wasted, count: this.spec.count, secs: Math.round(this.t / HZ)
      };
      this.phase = 'over';
      this.emit('end');
      this.finish(reason);
    }

    /* ------------------------------------------------------------ reads */

    /** Seconds left on the clock. */
    get left() { return this.spec ? Math.max(0, Math.ceil((this.limit - this.t) / HZ)) : 0; }
    /** How far through the level, for a race's progress line. */
    get progress() { return this.spec ? Math.min(1, this.t / this.limit) : 0; }
    /** Customers not yet come or still at the window. */
    get remaining() { return this.queue ? this.queue.length + this.spots.filter(s => s.c && (s.c.st === 'in' || s.c.st === 'wait')).length : 0; }

    emit(k, data) {
      const e = Object.assign({ k: k, seq: ++this.seq, at: this.clock }, data || {});
      this.events.push(e);
      if (this.events.length > 96) this.events.splice(0, this.events.length - 96);
    }
  }

  ChefGame.SPOTS = SPOTS;
  ChefGame.READY = READY;
  ChefGame.WALK = WALK;
  PV.ChefGame = ChefGame;

})(window.PV);
