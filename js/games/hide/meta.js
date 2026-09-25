/* 变色躲猫猫 / Blend In — what you keep between rounds.

   Experience and a level, as the reference's end card shows them, coins
   to spend, the poses and water guns bought with them, and a tally of
   rounds. One record, `hide.meta`, sealed like the profile (store.js) and
   REBUILT on every read by the validator below: a pose or a gun that is
   not in the catalogue is dropped, a count out of range is clamped, and a
   gun that is not owned cannot be carried.

   Nothing here draws anything; the lobby panel shows what it returns and
   the tests call it without a page. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData, S = PV.Safe;
  const KEY = 'hide.meta';
  const MAX = 1e9;

  function fresh() {
    return {
      xp: 0, coins: 0,
      poses: D.FREE_POSES.slice(), blasters: ['classic'], blaster: 'classic',
      life: { rounds: 0, survived: 0, caught: 0, finds: 0, wins: 0 }
    };
  }

  const list = (v, ok, max) => (Array.isArray(v) ? v : []).filter((x, i, a) => typeof x === 'string' && ok(x) && a.indexOf(x) === i).slice(0, max || 64);

  function clean(v) {
    const m = S.obj(v);
    if (!m) return undefined;
    const out = fresh();
    out.xp = S.int(m.xp, 0, MAX, 0);
    out.coins = S.int(m.coins, 0, MAX, 0);
    out.poses = D.FREE_POSES.concat(list(m.poses, id => !!D.POSE[id] && D.FREE_POSES.indexOf(id) < 0, 40));
    out.blasters = ['classic'].concat(list(m.blasters, id => !!D.BLASTER[id] && id !== 'classic', 20));
    out.blaster = out.blasters.indexOf(m.blaster) >= 0 ? m.blaster : 'classic';
    const l = S.obj(m.life) || {};
    for (const k of ['rounds', 'survived', 'caught', 'finds', 'wins']) out.life[k] = S.int(l[k], 0, 1e8, 0);
    return out;
  }
  PV.Store.validate(KEY, clean);

  function load() { return PV.Store.get(KEY, null) || fresh(); }
  function save(m) { PV.Store.set(KEY, m); return m; }

  /** What a round is worth, from how it went: never more for losing. */
  function rewards(game) {
    const me = game.me, HZ = D.HZ;
    const k = [0.8, 1, 1.3][game.diff] || 1;
    let xp = 0, coins = 0;
    if (me.role === 'hider') {
      const secs = (me.found ? me.stats.survived : game.huntT) / HZ;
      if (me.found) { xp = 10 + Math.floor(secs / 6); coins = 5 + Math.floor(secs / 8); }
      else { xp = 40 + Math.floor(game.huntTicks / HZ / 6); coins = 30 + Math.floor(game.huntTicks / HZ / 8); }
    } else if (me.role === 'seeker') {
      xp = 5 + me.stats.finds * 20; coins = me.stats.finds * 12;
      if (game.result === 'seekers') { xp += 30; coins += 25; }
    }
    return { xp: Math.round(xp * k), coins: Math.round(coins * k) };
  }

  /** Bank a finished round. Returns what was added and any new level. */
  function bank(m, game) {
    const r = rewards(game);
    const before = D.levelOf(m.xp).level;
    m.xp = Math.min(MAX, m.xp + r.xp);
    m.coins = Math.min(MAX, m.coins + r.coins);
    const me = game.me;
    m.life.rounds++;
    if (me.role === 'hider') { if (me.found) m.life.caught++; else m.life.survived++; }
    m.life.finds += me.stats.finds;
    if (game.myResult() === 'win') m.life.wins++;
    save(m);
    const after = D.levelOf(m.xp).level;
    return { xp: r.xp, coins: r.coins, levelUp: after > before ? after : 0 };
  }

  const shop = {
    buyPose(m, id) {
      const p = D.POSE[id];
      if (!p || m.poses.indexOf(id) >= 0 || m.coins < p.price) return false;
      m.coins -= p.price; m.poses.push(id); save(m);
      return true;
    },
    buyBlaster(m, id) {
      const b = D.BLASTER[id];
      if (!b || m.blasters.indexOf(id) >= 0 || m.coins < b.price) return false;
      m.coins -= b.price; m.blasters.push(id); m.blaster = id; save(m);
      return true;
    },
    equip(m, id) {
      if (m.blasters.indexOf(id) < 0) return false;
      m.blaster = id; save(m);
      return true;
    }
  };

  PV.HideMeta = { KEY: KEY, fresh: fresh, clean: clean, load: load, save: save, rewards: rewards, bank: bank, shop: shop, level: m => D.levelOf(m.xp) };

})(window.PV);
