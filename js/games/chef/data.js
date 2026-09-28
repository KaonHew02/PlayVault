/* 街头大厨 / Street Chef — the catalogue.

   Everything a truck cooks, sells and upgrades, and the rule that turns a
   truck and a level number into a level. Nothing here draws or keeps
   state; the engine, the save, the bot and the tests all read it.

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
  const LEVELS = 20;
  const LOOKS = 12;                 // how many different customers there are to draw

  /* kind: base (starts a plate), add (goes on one), side, drink.
     layer: the order they are painted in, bottom first. */
  const PARTS = {
    pasta: { kind: 'base', layer: 0 },
    redsauce: { kind: 'add', layer: 1 },
    whitesauce: { kind: 'add', layer: 1 },
    parmesan: { kind: 'add', layer: 3 },
    olives: { kind: 'add', layer: 4 },
    basil: { kind: 'add', layer: 5 },
    coffee: { kind: 'drink', cools: 14 },

    bun: { kind: 'base', layer: 0 },
    patty: { kind: 'add', layer: 1 },
    cheddar: { kind: 'add', layer: 2 },
    onion: { kind: 'add', layer: 3 },
    tomato: { kind: 'add', layer: 4 },
    lettuce: { kind: 'add', layer: 5 },
    fries: { kind: 'side' },
    soda: { kind: 'drink' },

    pizza: { kind: 'base', layer: 0 },
    pepperoni: { kind: 'add', layer: 2 },
    mushroom: { kind: 'add', layer: 2 },
    pepper: { kind: 'add', layer: 3 },
    wings: { kind: 'side' },
    lemonade: { kind: 'drink' },

    shell: { kind: 'base', layer: 0 },
    beef: { kind: 'add', layer: 1 },
    chicken: { kind: 'add', layer: 1 },
    jack: { kind: 'add', layer: 3 },
    salsa: { kind: 'add', layer: 4 },
    guac: { kind: 'add', layer: 5 },
    nachos: { kind: 'side' },
    horchata: { kind: 'drink' },

    rice: { kind: 'base', layer: 0 },
    salmon: { kind: 'add', layer: 1 },
    tuna: { kind: 'add', layer: 1 },
    cucumber: { kind: 'add', layer: 2 },
    avocado: { kind: 'add', layer: 3 },
    roe: { kind: 'add', layer: 4 },
    miso: { kind: 'side' },
    tea: { kind: 'drink', cools: 16 }
  };

  /* A station cooks one thing (type cook) or pours one drink (type drink).
     slots and speed are by upgrade level 1..3; cook, burn and fill are
     seconds at level 1. Burn is how long a cooked thing waits before it
     burns. */
  const TRUCKS = [
    {
      key: 'pasta', price: 0, needs: 0,
      stations: [
        { id: 'pot', type: 'cook', makes: 'pasta', art: 'pot', cook: 4.5, burn: 8, slots: [2, 3, 4], speed: [1, 0.82, 0.68] },
        { id: 'pan', type: 'cook', makes: 'whitesauce', art: 'pan', cook: 3.5, burn: 4, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'espresso', type: 'drink', makes: 'coffee', art: 'espresso', fill: 3, slots: [1, 2, 3], speed: [1, 0.8, 0.62] }
      ],
      bins: ['redsauce', 'parmesan', 'olives', 'basil'],
      menu: [
        { parts: ['pasta', 'redsauce'], price: 10, at: 1 },
        { parts: ['coffee'], price: 6, at: 2 },
        { parts: ['pasta', 'redsauce', 'parmesan'], price: 14, at: 4 },
        { parts: ['pasta', 'whitesauce'], price: 14, at: 6 },
        { parts: ['pasta', 'whitesauce', 'parmesan'], price: 18, at: 8 },
        { parts: ['pasta', 'redsauce', 'olives'], price: 16, at: 10 },
        { parts: ['pasta', 'redsauce', 'parmesan', 'olives'], price: 21, at: 12 },
        { parts: ['pasta', 'whitesauce', 'basil'], price: 19, at: 14 },
        { parts: ['pasta', 'redsauce', 'parmesan', 'basil'], price: 22, at: 16 },
        { parts: ['pasta', 'whitesauce', 'parmesan', 'olives', 'basil'], price: 27, at: 18 }
      ]
    },
    {
      key: 'burger', price: 2500, needs: 8,
      stations: [
        { id: 'grill', type: 'cook', makes: 'patty', art: 'grill', cook: 5, burn: 6.5, slots: [2, 3, 4], speed: [1, 0.82, 0.68] },
        { id: 'fryer', type: 'cook', makes: 'fries', art: 'fryer', cook: 4, burn: 8, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'fountain', type: 'drink', makes: 'soda', art: 'fountain', fill: 2.5, slots: [1, 2, 3], speed: [1, 0.8, 0.62] }
      ],
      bins: ['bun', 'cheddar', 'lettuce', 'tomato', 'onion'],
      menu: [
        { parts: ['bun', 'patty'], price: 10, at: 1 },
        { parts: ['bun', 'patty', 'cheddar'], price: 14, at: 2 },
        { parts: ['fries'], price: 6, at: 3 },
        { parts: ['soda'], price: 5, at: 5 },
        { parts: ['bun', 'patty', 'lettuce'], price: 14, at: 7 },
        { parts: ['bun', 'patty', 'cheddar', 'tomato'], price: 18, at: 9 },
        { parts: ['bun', 'patty', 'lettuce', 'tomato'], price: 18, at: 11 },
        { parts: ['bun', 'patty', 'cheddar', 'onion'], price: 18, at: 13 },
        { parts: ['bun', 'patty', 'cheddar', 'lettuce', 'tomato'], price: 24, at: 15 },
        { parts: ['bun', 'patty', 'cheddar', 'onion', 'tomato', 'lettuce'], price: 28, at: 17 }
      ]
    },
    {
      key: 'pizza', price: 5000, needs: 8,
      stations: [
        { id: 'oven', type: 'cook', makes: 'pizza', art: 'oven', cook: 6, burn: 7, slots: [2, 3, 4], speed: [1, 0.82, 0.68] },
        { id: 'wingfryer', type: 'cook', makes: 'wings', art: 'fryer', cook: 5, burn: 7, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'jug', type: 'drink', makes: 'lemonade', art: 'jug', fill: 3, slots: [1, 2, 3], speed: [1, 0.8, 0.62] }
      ],
      bins: ['pepperoni', 'mushroom', 'pepper', 'olives', 'basil'],
      menu: [
        { parts: ['pizza', 'pepperoni'], price: 12, at: 1 },
        { parts: ['pizza'], price: 9, at: 2 },
        { parts: ['lemonade'], price: 5, at: 3 },
        { parts: ['pizza', 'mushroom'], price: 12, at: 4 },
        { parts: ['pizza', 'pepperoni', 'mushroom'], price: 17, at: 6 },
        { parts: ['wings'], price: 8, at: 8 },
        { parts: ['pizza', 'pepper', 'olives'], price: 17, at: 10 },
        { parts: ['pizza', 'pepperoni', 'pepper'], price: 17, at: 12 },
        { parts: ['pizza', 'mushroom', 'olives', 'basil'], price: 22, at: 14 },
        { parts: ['pizza', 'pepperoni', 'mushroom', 'pepper', 'olives'], price: 26, at: 16 }
      ]
    },
    {
      key: 'taco', price: 8000, needs: 8,
      stations: [
        { id: 'grill', type: 'cook', makes: 'beef', art: 'grill', cook: 4.5, burn: 6, slots: [2, 3, 4], speed: [1, 0.82, 0.68] },
        { id: 'plancha', type: 'cook', makes: 'chicken', art: 'pan', cook: 4, burn: 5, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'chipfryer', type: 'cook', makes: 'nachos', art: 'fryer', cook: 3.5, burn: 7, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'urn', type: 'drink', makes: 'horchata', art: 'urn', fill: 2.8, slots: [1, 2, 3], speed: [1, 0.8, 0.62] }
      ],
      bins: ['shell', 'salsa', 'jack', 'lettuce', 'guac'],
      menu: [
        { parts: ['shell', 'beef', 'salsa'], price: 12, at: 1 },
        { parts: ['shell', 'beef', 'jack'], price: 12, at: 2 },
        { parts: ['horchata'], price: 5, at: 3 },
        { parts: ['shell', 'beef', 'salsa', 'jack'], price: 16, at: 4 },
        { parts: ['nachos'], price: 7, at: 5 },
        { parts: ['shell', 'chicken', 'lettuce'], price: 14, at: 7 },
        { parts: ['shell', 'chicken', 'salsa', 'jack'], price: 18, at: 9 },
        { parts: ['shell', 'beef', 'guac'], price: 16, at: 11 },
        { parts: ['shell', 'chicken', 'lettuce', 'guac'], price: 20, at: 13 },
        { parts: ['shell', 'beef', 'salsa', 'jack', 'guac'], price: 24, at: 15 },
        { parts: ['shell', 'chicken', 'salsa', 'jack', 'lettuce', 'guac'], price: 28, at: 17 }
      ]
    },
    {
      key: 'sushi', price: 12000, needs: 8,
      stations: [
        { id: 'ricer', type: 'cook', makes: 'rice', art: 'ricer', cook: 5, burn: 12, slots: [2, 3, 4], speed: [1, 0.82, 0.68] },
        { id: 'soup', type: 'cook', makes: 'miso', art: 'pot', cook: 4, burn: 8, slots: [1, 2, 3], speed: [1, 0.82, 0.68] },
        { id: 'kettle', type: 'drink', makes: 'tea', art: 'kettle', fill: 2.5, slots: [1, 2, 3], speed: [1, 0.8, 0.62] }
      ],
      bins: ['salmon', 'tuna', 'cucumber', 'avocado', 'roe'],
      menu: [
        { parts: ['rice', 'salmon'], price: 12, at: 1 },
        { parts: ['rice', 'tuna'], price: 12, at: 2 },
        { parts: ['tea'], price: 5, at: 3 },
        { parts: ['miso'], price: 8, at: 4 },
        { parts: ['rice', 'salmon', 'avocado'], price: 16, at: 6 },
        { parts: ['rice', 'tuna', 'cucumber'], price: 15, at: 8 },
        { parts: ['rice', 'salmon', 'roe'], price: 18, at: 10 },
        { parts: ['rice', 'tuna', 'avocado', 'cucumber'], price: 20, at: 12 },
        { parts: ['rice', 'salmon', 'avocado', 'roe'], price: 23, at: 14 },
        { parts: ['rice', 'salmon', 'cucumber', 'avocado', 'roe'], price: 27, at: 16 }
      ]
    }
  ];
  const TRUCK = Object.create(null);
  TRUCKS.forEach((tr, i) => { tr.index = i; TRUCK[tr.key] = tr; });

  /* ------------------------------------------------------------ upgrades */

  /* Each truck keeps its own kitchen. A station starts at level 1 and buys
     2 and 3; the plates the same; the hot plate starts at 0 (none). The
     recipe raises every price on the truck, and each piece of decor makes
     customers wait longer — except the tip jar, which picks up the coins
     for you. Costs grow with the truck: a later street earns more. */
  const COST_K = [1, 1.35, 1.7, 2.1, 2.5];
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
  const costK = truck => COST_K[TRUCK[truck] ? TRUCK[truck].index : 0] || 1;

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
    const count = 5 + Math.ceil(L * 0.72) + Math.min(2, T);
    const gap = Math.max(3.4, 7.2 - L * 0.17 - T * 0.25);
    const patience = Math.max(19, 33 - L * 0.55 - T * 0.9);
    const orderMax = L < 3 ? 1 : (L < 11 ? 2 : 3);
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
