/* 街头大厨 / Street Chef — the rules of the catalogue.

   What a truck sells and upgrades (the menu itself is menu.js), and the
   rule that turns a truck and a level number into a level. Nothing here
   draws or keeps state; the engine, the save, the bot and the tests all
   read it.

   A DISH is a set of parts on one plate: one base (pasta, a bun, a pizza,
   a shell, rice) and any number of adds. A side (fries, soup) and a drink
   are served on their own. A plate may only ever hold a set that is part
   of some dish on today's menu, which is what stops two sauces going on
   one pasta, and is also what lets a tap on the cheese find the plate
   that wants it.

   Stations and bins are not listed per level. A station is in the kitchen
   when something on today's menu is made on it, so a menu can never ask
   for a thing the kitchen cannot make. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const HZ = 60;
  const LEVELS = 40;
  const LOOKS = 12;                 // how many different customers there are to draw

  /* The parts and the trucks are menu.js's; here they gain an index and a
     lookup, and every truck opens once the one before it is cleared to
     level NEEDS and its price is paid. */
  const PARTS = PV.ChefMenu.PARTS;
  const TRUCKS = PV.ChefMenu.TRUCKS;
  const NEEDS = 8;
  TRUCKS.forEach(tr => { tr.needs = tr.price ? NEEDS : 0; });
  const TRUCK = Object.create(null);
  TRUCKS.forEach((tr, i) => { tr.index = i; TRUCK[tr.key] = tr; });

  /* A later street sells dearer food, as the reference's do, so its takings
     keep up with its dearer kitchen. menu.js writes the first street's
     prices (kept as `list`); each truck along the chain charges 6% more.
     Worked from the list price, so reading this file twice changes nothing. */
  const PRICE_STEP = 0.06;
  for (const tr of TRUCKS) {
    for (const m of tr.menu) {
      if (m.list == null) m.list = m.price;
      m.price = Math.round(m.list * (1 + PRICE_STEP * tr.index));
    }
  }

  /* ------------------------------------------------------------ upgrades */

  /* Each truck keeps its own kitchen. A station starts at level 1 and buys
     2 and 3; the plates the same; the hot plate starts at 0 (none). The
     recipe raises every price on the truck, and each piece of decor makes
     customers wait longer — except the tip jar, which picks up the coins
     for you. Costs grow with the truck: a later street earns more. */
  const STATION_COST = [0, 0, 420, 1150];         // by the level being bought
  const PLATE_COST = [0, 0, 360, 980];
  const WARMER_COST = [0, 600, 1400];
  const RECIPE_COST = [0, 520, 1250, 2500];
  const WARMER_SLOTS = [0, 2, 3];
  const PLATES = [0, 2, 3, 4];
  const RECIPE_BONUS = 0.15;                      // per level, on every price
  const DECOR = [
    { id: 'awning', cost: 450, calm: 0.1 },
    { id: 'lights', cost: 750, calm: 0.1 },
    { id: 'music', cost: 1100, calm: 0.12 },
    { id: 'jar', cost: 900, calm: 0 }
  ];

  const round5 = n => Math.max(5, Math.round(n / 5) * 5);
  const costK = truck => 1 + 0.07 * (TRUCK[truck] ? TRUCK[truck].index : 0);

  /** Every upgrade a truck offers, in the order the kitchen lists them. */
  function upgrades(truckKey) {
    const tr = TRUCK[truckKey];
    const k = costK(truckKey);
    const out = [];
    for (const s of tr.stations) {
      out.push({ key: s.id, kind: 'station', station: s, min: 1, max: 3, cost: lv => round5(STATION_COST[lv] * k) });
    }
    out.push({ key: 'plates', kind: 'plates', min: 1, max: 3, cost: lv => round5(PLATE_COST[lv] * k) });
    out.push({ key: 'warmer', kind: 'warmer', min: 0, max: 2, cost: lv => round5(WARMER_COST[lv] * k) });
    out.push({ key: 'recipe', kind: 'recipe', min: 0, max: 3, cost: lv => round5(RECIPE_COST[lv] * k) });
    for (const d of DECOR) out.push({ key: d.id, kind: 'decor', decor: d, min: 0, max: 1, cost: () => round5(d.cost * k) });
    return out;
  }

  /** The kitchen as a new truck has it. */
  function freshKit(truckKey) {
    const kit = {};
    for (const u of upgrades(truckKey)) kit[u.key] = u.min;
    return kit;
  }

  /** A kit rebuilt from anything: every key the truck knows, clamped. */
  function cleanKit(truckKey, v) {
    const kit = freshKit(truckKey);
    const src = v && typeof v === 'object' ? v : {};
    for (const u of upgrades(truckKey)) {
      const n = Math.round(Number(src[u.key]));
      if (Number.isFinite(n)) kit[u.key] = Math.max(u.min, Math.min(u.max, n));
    }
    return kit;
  }

  /** What a kit does, as numbers the engine uses. */
  function kitEffects(truckKey, kit) {
    const k = cleanKit(truckKey, kit);
    let calm = 0;
    for (const d of DECOR) if (k[d.id]) calm += d.calm;
    return {
      plates: PLATES[k.plates],
      warmer: WARMER_SLOTS[k.warmer],
      priceK: 1 + RECIPE_BONUS * k.recipe,
      calm: calm,
      jar: !!k.jar,
      station: id => Math.max(1, Math.min(3, k[id] || 1))
    };
  }

  /* ---------------------------------------------------------- boosters */

  /* Bought with gems before a level, for that level only. */
  const BOOSTERS = [
    { id: 'fast', gems: 2 },      // everything cooks and pours 35% quicker
    { id: 'calm', gems: 2 },      // customers wait 40% longer
    { id: 'noburn', gems: 3 }     // nothing burns
  ];

  /* ------------------------------------------------------------ levels */

  const partKind = id => (PARTS[id] ? PARTS[id].kind : null);
  const keyOf = parts => parts.slice().sort().join('+');

  /** Is this menu entry on the menu at level L? */
  const onMenu = (m, L) => m.at <= L;

  /** The stations and bins in the kitchen at level L: those something on the menu needs. */
  function kitchenAt(truckKey, L) {
    const tr = TRUCK[truckKey];
    const used = Object.create(null);
    for (const m of tr.menu) if (onMenu(m, L)) for (const p of m.parts) used[p] = true;
    return {
      stations: tr.stations.filter(s => used[s.makes]),
      bins: tr.bins.filter(b => used[b])
    };
  }

  /**
   * The shape of a level: how many come, how fast, how patient, how much
   * each may order, and what it asks of you. A pure function of the truck
   * and the number, so the level card can say it before the level starts.
   */
  function levelSpec(truckKey, L) {
    const tr = TRUCK[truckKey];
    const T = tr.index;
    L = Math.max(1, Math.min(LEVELS, L | 0));
    const menu = [], fresh = [];
    tr.menu.forEach((m, i) => {
      if (!onMenu(m, L)) return;
      menu.push(i);
      if (m.at === L && L > 1) fresh.push(i);
    });
    // Forty levels, from six unhurried customers to a queue of twenty-odd
    // who want three things each; a later street is a little busier.
    const p = (L - 1) / (LEVELS - 1);
    const count = Math.round(6 + 15 * p) + Math.min(2, Math.floor(T / 4));
    const gap = Math.max(3.3, 7.2 - 3.6 * p - Math.min(0.6, T * 0.04));
    const patience = Math.max(19, 33 - 12 * p - Math.min(3, T * 0.2));
    const orderMax = L < 3 ? 1 : (L < 16 ? 2 : 3);
    const goal = L % 5 === 0
      ? { type: 'serve', n: count - Math.max(2, Math.floor(count / 5)) }
      : { type: 'coins' };
    return {
      truck: truckKey, level: L, menu: menu, fresh: fresh,
      count: count, gap: gap, patience: patience, perItem: 7, orderMax: orderMax,
      time: Math.round((count - 1) * gap + patience + 45),
      goal: goal,
      noBurn: L >= 7 && L % 4 === 3,
      noLoss: L >= 6 && L % 6 === 0
    };
  }

  /** A level's own seed: the same customers every time you play it. */
  function seedFor(truckKey, L) {
    let h = 0x9E3779B9 ^ ((TRUCK[truckKey].index + 1) * 0x85EBCA6B) ^ (L * 0xC2B2AE35);
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
    h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
    return (h ^ (h >>> 15)) >>> 0 || 1;
  }

  /**
   * Who comes, when, and what they order: a pure function of the spec and a
   * seed. A newly added dish is what the first customer asks for, and it
   * comes up more often all level, so a new thing is learned on the level
   * that brings it.
   */
  function roster(spec, seed) {
    const tr = TRUCK[spec.truck];
    const rng = new PV.RNG(seed);
    const weights = spec.menu.map(i => {
      const m = tr.menu[i];
      const k = partKind(m.parts[0]);
      let w = k === 'base' ? 3 : (k === 'side' ? 1.4 : 1.2);
      if (spec.fresh.indexOf(i) >= 0) w *= 2.2;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const draw = () => {
      let r = rng.next() * total;
      for (let j = 0; j < spec.menu.length; j++) { r -= weights[j]; if (r < 0) return spec.menu[j]; }
      return spec.menu[spec.menu.length - 1];
    };
    const out = [];
    let at = 1.2;
    for (let i = 0; i < spec.count; i++) {
      let n = 1;
      if (spec.orderMax >= 2) {
        const r = rng.next();
        n = spec.orderMax >= 3 ? (r < 0.34 ? 1 : (r < 0.8 ? 2 : 3)) : (r < 0.5 ? 1 : 2);
      }
      const items = [];
      if (i === 0 && spec.fresh.length) items.push(spec.fresh[0]);
      while (items.length < n) {
        const m = draw();
        // One drink, one side a customer; a second plate is fine.
        const k = partKind(tr.menu[m].parts[0]);
        if (k !== 'base' && items.some(x => tr.menu[x].parts[0] === tr.menu[m].parts[0])) continue;
        items.push(m);
      }
      // Plates first, then sides, then drinks, as the bubble reads.
      const rank = m => ({ base: 0, side: 1, drink: 2 })[partKind(tr.menu[m].parts[0])];
      items.sort((a, b) => rank(a) - rank(b) || a - b);
      out.push({
        at: Math.round(at * HZ),
        items: items,
        patience: Math.round((spec.patience + (items.length - 1) * spec.perItem) * HZ),
        look: rng.int(LOOKS)
      });
      at += spec.gap * (0.7 + rng.next() * 0.6);
    }
    return out;
  }

  /** What the customers of a level would pay at list price, and the three
      star lines drawn from it. Tips and the recipe are how you beat it. */
  function targets(spec, list) {
    const tr = TRUCK[spec.truck];
    let base = 0;
    for (const c of list) for (const m of c.items) base += tr.menu[m].price;
    return { base: base, stars: [round5(base * 0.8), round5(base * 1.1), round5(base * 1.38)] };
  }

  /* ------------------------------------------------------ chef levels */

  /** Chef experience: a level needs a little more than the last. */
  function levelOf(xp) {
    let lv = 1, need = 80, left = Math.max(0, xp | 0);
    while (left >= need && lv < 99) { left -= need; lv++; need = 80 + (lv - 1) * 45; }
    return { level: lv, into: left, need: need };
  }


  PV.ChefData = {
    HZ: HZ, LEVELS: LEVELS, LOOKS: LOOKS,
    PARTS: PARTS, TRUCKS: TRUCKS, TRUCK: TRUCK,
    KEYS: TRUCKS.map(t => t.key),
    DECOR: DECOR, BOOSTERS: BOOSTERS,
    partKind: partKind, keyOf: keyOf,
    upgrades: upgrades, freshKit: freshKit, cleanKit: cleanKit, kitEffects: kitEffects,
    kitchenAt: kitchenAt, levelSpec: levelSpec, seedFor: seedFor, roster: roster, targets: targets,
    levelOf: levelOf
  };

})(window.PV);
