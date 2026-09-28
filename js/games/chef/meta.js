/* 街头大厨 / Street Chef — what you keep between levels.

   Coins to spend on the kitchen, gems for boosters, chef experience and a
   chef level, and for every truck: whether it is open, the stars and best
   takings on each of its levels, and its own kitchen. One record,
   `chef.meta`, sealed like the profile (store.js) and REBUILT on every read
   by the validator below — a truck that is not in the catalogue is
   dropped, a star count is clamped to 0..3, a kitchen is rebuilt from the
   truck's own upgrade list (data.js cleanKit), and a truck that cannot have
   been opened is closed again.

   Coins earned on a level are kept whether it was passed or not, as the
   reference keeps them; stars only ever go up. Nothing here draws. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.ChefData, S = PV.Safe;
  const KEY = 'chef.meta';
  const MAX = 1e9;
  const START_GEMS = 5;
  const XP_SERVED = 3, XP_STAR = 12;
  const LEVEL_GEMS = 2, LEVEL_COINS = 40;

  function freshTruck(key, open) {
    return { open: !!open, stars: new Array(D.LEVELS).fill(0), best: new Array(D.LEVELS).fill(0), kit: D.freshKit(key) };
  }

  function fresh() {
    const trucks = {};
    D.TRUCKS.forEach((tr, i) => { trucks[tr.key] = freshTruck(tr.key, i === 0); });
    return {
      coins: 0, gems: START_GEMS, xp: 0, truck: D.TRUCKS[0].key, trucks: trucks,
      tips: { first: false },
      life: { levels: 0, served: 0, lost: 0, burned: 0, coins: 0 }
    };
  }

  function clean(v) {
    const m = S.obj(v);
    if (!m) return undefined;
    const out = fresh();
    out.coins = S.int(m.coins, 0, MAX, 0);
    out.gems = S.int(m.gems, 0, 1e6, START_GEMS);
    out.xp = S.int(m.xp, 0, MAX, 0);
    const trucks = S.obj(m.trucks) || {};
    D.TRUCKS.forEach((tr, i) => {
      const t = S.obj(S.own(trucks, tr.key) ? trucks[tr.key] : null);
      if (!t) return;
      const o = out.trucks[tr.key];
      o.open = i === 0 || S.bool(t.open);
      const st = Array.isArray(t.stars) ? t.stars : [];
      const be = Array.isArray(t.best) ? t.best : [];
      for (let L = 0; L < D.LEVELS; L++) {
        o.stars[L] = S.int(st[L], 0, 3, 0);
        o.best[L] = S.int(be[L], 0, 1e7, 0);
      }
      o.kit = D.cleanKit(tr.key, S.obj(t.kit));
    });
    // A truck is only open behind one that was cleared far enough.
    for (let i = 1; i < D.TRUCKS.length; i++) {
      const tr = D.TRUCKS[i], prev = out.trucks[D.TRUCKS[i - 1].key];
      if (out.trucks[tr.key].open && !(prev.open && prev.stars[tr.needs - 1] > 0)) out.trucks[tr.key].open = false;
    }
    out.truck = out.trucks[m.truck] && out.trucks[m.truck].open ? m.truck : D.TRUCKS[0].key;
    const tips = S.obj(m.tips) || {};
    out.tips.first = S.bool(tips.first);
    const l = S.obj(m.life) || {};
    for (const k of ['levels', 'served', 'lost', 'burned', 'coins']) out.life[k] = S.int(l[k], 0, MAX, 0);
    return out;
  }
  PV.Store.validate(KEY, clean);

  function load() { return PV.Store.get(KEY, null) || fresh(); }
  function save(m) { PV.Store.set(KEY, m); return m; }

  /* ------------------------------------------------------------- reads */

  const truckOf = (m, key) => m.trucks[key] || m.trucks[D.TRUCKS[0].key];

  /** Level L (1-based) is open when it is the first or the one before it has a star. */
  function levelOpen(m, key, L) {
    const t = truckOf(m, key);
    if (!t.open || L < 1 || L > D.LEVELS) return false;
    return L === 1 || t.stars[L - 2] > 0;
  }

  /** The next level to play on a truck: the first without a star. */
  function nextLevel(m, key) {
    const t = truckOf(m, key);
    const i = t.stars.findIndex(s => s === 0);
    return i < 0 ? D.LEVELS : i + 1;
  }

  const starsOn = (m, key) => truckOf(m, key).stars.reduce((a, b) => a + b, 0);
  const totalStars = m => D.TRUCKS.reduce((n, tr) => n + starsOn(m, tr.key), 0);

  /** Why a truck is shut, or null when it can be opened now. */
  function openBlock(m, key) {
    const tr = D.TRUCK[key];
    if (!tr || tr.index === 0) return null;
    const prev = D.TRUCKS[tr.index - 1];
    const p = truckOf(m, prev.key);
    if (!p.open || p.stars[tr.needs - 1] === 0) return { why: 'level', truck: prev.key, level: tr.needs };
    if (m.coins < tr.price) return { why: 'coins', need: tr.price };
    return null;
  }

  /* ---------------------------------------------------------- the shop */

  function openTruck(m, key) {
    const tr = D.TRUCK[key];
    const t = m.trucks[key];
    if (!tr || !t || t.open || openBlock(m, key)) return false;
    m.coins -= tr.price;
    t.open = true;
    m.truck = key;
    save(m);
    return true;
  }

  /** The price of the next level of an upgrade, or null at the top. */
  function priceOf(m, key, up) {
    const lv = truckOf(m, key).kit[up.key];
    return lv >= up.max ? null : up.cost(lv + 1);
  }

  function buy(m, key, upKey) {
    const t = m.trucks[key];
    if (!t || !t.open) return false;
    const up = D.upgrades(key).find(u => u.key === upKey);
    if (!up) return false;
    const price = priceOf(m, key, up);
    if (price == null || m.coins < price) return false;
    m.coins -= price;
    t.kit[up.key]++;
    save(m);
    return true;
  }

  function pick(m, key) {
    if (!m.trucks[key] || !m.trucks[key].open) return false;
    m.truck = key;
    save(m);
    return true;
  }

  /** What a set of boosters costs in gems. */
  function boostCost(boost) {
    let n = 0;
    for (const b of D.BOOSTERS) if (boost && boost[b.id]) n += b.gems;
    return n;
  }

  /**
   * The plan for a level, with the boosters paid for — or null if the level
   * is shut or the gems are short. Paying happens here, at the start, so a
   * level abandoned half way has still used them.
   */
  function begin(m, key, L, boost) {
    if (!levelOpen(m, key, L)) return null;
    const b = {};
    for (const x of D.BOOSTERS) b[x.id] = !!(boost && boost[x.id]);
    const cost = boostCost(b);
    if (cost > m.gems) return null;
    m.gems -= cost;
    m.truck = key;
    save(m);
    return { truck: key, level: L, kit: Object.assign({}, truckOf(m, key).kit), boost: b };
  }

  /* ---------------------------------------------------------- banking */

  /** Bank a finished level. Returns what changed, for the end card. */
  function bank(m, game) {
    const r = game.result;
    if (!r) return null;
    const key = game.truck.key, L = game.spec.level;
    const t = truckOf(m, key);
    const before = D.levelOf(m.xp).level;
    const had = t.stars[L - 1];
    const xp = r.served * XP_SERVED + r.stars * XP_STAR;
    m.coins = Math.min(MAX, m.coins + r.earned);
    m.xp = Math.min(MAX, m.xp + xp);
    t.stars[L - 1] = Math.max(had, r.stars);
    t.best[L - 1] = Math.max(t.best[L - 1], r.earned);
    let gems = 0, coins = 0;
    if (r.stars === 3 && had < 3) gems++;
    const after = D.levelOf(m.xp).level;
    for (let lv = before + 1; lv <= after; lv++) { gems += LEVEL_GEMS; coins += LEVEL_COINS * lv; }
    m.gems = Math.min(1e6, m.gems + gems);
    m.coins = Math.min(MAX, m.coins + coins);
    m.life.levels++;
    m.life.served += r.served;
    m.life.lost += r.lost;
    m.life.burned += r.burned;
    m.life.coins += r.earned;
    save(m);
    return {
      coins: r.earned, bonus: coins, xp: xp, gems: gems,
      levelUp: after > before ? after : 0,
      better: r.stars > had, firstClear: had === 0 && r.stars > 0,
      opens: L === D.LEVELS ? 0 : (r.stars > 0 ? L + 1 : 0)
    };
  }

  PV.ChefMeta = {
    KEY: KEY, fresh: fresh, clean: clean, load: load, save: save,
    levelOpen: levelOpen, nextLevel: nextLevel, starsOn: starsOn, totalStars: totalStars,
    openBlock: openBlock, openTruck: openTruck, priceOf: priceOf, buy: buy, pick: pick,
    boostCost: boostCost, begin: begin, bank: bank,
    level: m => D.levelOf(m.xp)
  };

})(window.PV);
