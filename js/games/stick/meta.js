/* 火柴人对决 / Stick Clash — what you keep between fights.

   Coins, the fighters bought with them, the one you fight as, how far up
   the tournament ladder you are, and a tally. One record, `stick.meta`,
   in BACKUP_STORES so it travels in an export, SIGNED (store.js) so coins
   typed in through devtools are refused, and REBUILT on every read by the
   validator below: a fighter that is not in the roster is dropped, a
   count out of range is clamped, and a fighter that is not owned cannot be
   picked.

   Every knockout pays, as in the reference. A win pays more the harder
   the computer was, a tournament fight more the higher up the ladder, a
   perfect round a bonus; a loss pays a little, so nobody is ever stuck.
   Beating the last fight of the tournament pays a champion's purse and
   unlocks the boss, and the ladder starts again. Two players on one
   keyboard, and training, pay nothing: there is nobody to beat.

   Nothing here draws anything; the tests call it without a page. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.StickData, S = PV.Safe;
  const KEY = 'stick.meta';
  const MAX = 1e9;
  const LIFE = ['fights', 'wins', 'losses', 'kos', 'perfects', 'best', 'champs'];

  function fresh() {
    const life = {};
    for (const k of LIFE) life[k] = 0;
    return { coins: 0, owned: ['ink'], pick: 'ink', tour: 0, life: life };
  }

  function clean(v) {
    const m = S.obj(v);
    if (!m) return undefined;
    const out = fresh();
    out.coins = S.int(m.coins, 0, MAX, 0);
    const owned = (Array.isArray(m.owned) ? m.owned : []).filter((x, i, a) => D.isFighter(x) && a.indexOf(x) === i);
    out.owned = ['ink'].concat(owned.filter(x => x !== 'ink')).slice(0, D.KEYS.length);
    out.pick = out.owned.indexOf(m.pick) >= 0 ? m.pick : 'ink';
    out.tour = S.int(m.tour, 0, D.LADDER.length - 1, 0);
    const l = S.obj(m.life) || {};
    for (const k of LIFE) out.life[k] = S.int(l[k], 0, 1e8, 0);
    return out;
  }
  PV.Store.validate(KEY, clean);

  function load() { return PV.Store.get(KEY, null) || fresh(); }
  function save(m) { PV.Store.set(KEY, m); return m; }

  /** What a finished fight is worth. `diff` is the option sheet's key. */
  function rewards(game, diff) {
    const mode = game.mode;
    if (mode === 'two' || mode === 'train') return { coins: 0, champion: false };
    const won = game.winner === 0;
    let coins = D.PAY.loss;
    let champion = false;
    if (won) {
      if (mode === 'tour') {
        const i = game.cfg && typeof game.cfg.tour === 'number' ? game.cfg.tour : 0;
        coins = D.PAY.tour(i);
        if (i >= D.LADDER.length - 1) { coins += D.PAY.champion; champion = true; }
      } else coins = D.PAY.versus[diff] || D.PAY.versus.normal;
      coins += game.perfects[0] * D.PAY.perfect;
    }
    return { coins: coins, champion: champion };
  }

  /** Bank a finished fight. Returns what was added and what changed. */
  function bank(m, game, diff) {
    const r = rewards(game, diff);
    const won = game.winner === 0;
    const me = game.f[0];
    m.coins = Math.min(MAX, m.coins + r.coins);
    let unlocked = null;
    if (game.mode !== 'train') {
      m.life.fights++;
      if (won) m.life.wins++; else if (game.winner === 1) m.life.losses++;
      m.life.kos += game.mode === 'two' ? 0 : countKos(game);
      m.life.perfects += game.mode === 'two' ? 0 : game.perfects[0];
      m.life.best = Math.max(m.life.best, me.stats.best);
    }
    if (game.mode === 'tour' && won) {
      if (r.champion) {
        m.tour = 0;
        m.life.champs++;
        if (m.owned.indexOf('oni') < 0) { m.owned.push('oni'); unlocked = 'oni'; }
      } else m.tour = Math.min(D.LADDER.length - 1, m.tour + 1);
    }
    save(m);
    return { coins: r.coins, champion: r.champion, unlocked: unlocked, tour: m.tour };
  }

  /* Knockouts the first player landed: rounds they won on a KO. The engine
     keeps the rounds as `wins`; a round won on time is not a knockout. */
  function countKos(game) { return game.kos ? game.kos[0] : game.wins[0]; }

  const shop = {
    price: id => (D.isFighter(id) ? D.FIGHTERS[id].price : Infinity),
    buy(m, id) {
      if (!D.isFighter(id) || m.owned.indexOf(id) >= 0 || m.coins < D.FIGHTERS[id].price) return false;
      m.coins -= D.FIGHTERS[id].price;
      m.owned.push(id);
      m.pick = id;
      save(m);
      return true;
    },
    pick(m, id) {
      if (m.owned.indexOf(id) < 0) return false;
      m.pick = id;
      save(m);
      return true;
    }
  };

  PV.StickMeta = { KEY: KEY, fresh: fresh, clean: clean, load: load, save: save, rewards: rewards, bank: bank, shop: shop };

})(window.PV);
