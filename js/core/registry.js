/* PlayVault — the game registry.

   A new game touches nothing outside js/games/<code>/. Its index.js calls
   PV.Registry.add(...) and the lobby, the statistics screen and the save
   format all follow. The moment a screen special-cases a game code, the next
   game costs twice as much.

   Games that are not built yet call PV.Registry.stub(...) instead and show up
   greyed in the lobby, so the roster is honest about what exists. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const games = [];
  const byCode = Object.create(null);

  const FAMILIES = ['board', 'puzzle', 'arcade'];

  function register(def, soon) {
    if (byCode[def.code]) throw new Error('PlayVault: duplicate game code ' + def.code);
    if (FAMILIES.indexOf(def.family) < 0) throw new Error('PlayVault: unknown family ' + def.family);
    const g = Object.assign({
      code: '', family: 'board', name: '', nameZh: '', blurb: '', blurbZh: '',
      icon: '', accent: null, options: [], soon: !!soon, start: null
    }, def);
    g.soon = !!soon;
    if (!g.soon && typeof g.start !== 'function') {
      throw new Error('PlayVault: ' + g.code + ' registered without start()');
    }
    games.push(g);
    byCode[g.code] = g;
    return g;
  }

  PV.Registry = {
    FAMILIES,

    /**
     * add({ code, family, name, nameZh, blurb, blurbZh, icon, accent,
     *       options: [{key, label, choices:[{value, label}]}],
     *       start(host, opts) -> { destroy() } })
     */
    add: def => register(def, false),

    /** stub({ code, family, name, nameZh, blurb, blurbZh, icon }) */
    stub: def => register(def, true),

    all: () => games.slice(),
    playable: () => games.filter(g => !g.soon),
    get: code => byCode[code] || null,
    byFamily: fam => games.filter(g => !fam || fam === 'all' || g.family === fam),

    /** Called once at boot and on every language change. Lossless both ways. */
    localize() {
      PV.I18n.localize(games, ['name', 'blurb']);
      // Options are data too: their labels are i18n keys, resolved at read time.
      return games;
    }
  };

})(window.PV);
