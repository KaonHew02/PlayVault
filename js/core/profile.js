/* PlayVault — the player, their level, and per-game records.

   Engines never touch this. A game reports an outcome through
   PV.Profile.record() and the shell decides what that is worth. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);   // lazy — i18n.js may load after this

  /** XP to go from level L to L+1. Gentle, no wall. */
  const stepFor = L => 100 + 50 * (L - 1);

  function levelFromXp(xp) {
    let lvl = 1, need = stepFor(1), left = xp;
    while (left >= need) { left -= need; lvl++; need = stepFor(lvl); }
    return { level: lvl, into: left, need, total: xp };
  }

  const blankGame = () => ({
    played: 0, won: 0, lost: 0, drawn: 0,
    bestScore: 0, bestTimeMs: 0, timeMs: 0, last: null
  });

  function load() {
    const p = PV.Store.get('profile', null);
    if (p && typeof p === 'object') return p;
    return PV.Store.set('profile', {
      name: '', xp: 0, created: new Date().toISOString()
    });
  }

  function loadStats() {
    const s = PV.Store.get('stats', null);
    if (s && typeof s === 'object' && s.games) return s;
    return PV.Store.set('stats', { games: {} });
  }

  PV.Profile = {
    data: load,
    stats: loadStats,

    name() {
      const n = load().name;
      return n && n.trim() ? n.trim() : t('profile.player');
    },

    setName(n) {
      const p = load();
      p.name = String(n || '').slice(0, 24);
      PV.Store.set('profile', p);
      document.dispatchEvent(new CustomEvent('pv:profile'));
    },

    level() { return levelFromXp(load().xp || 0); },

    addXp(n) {
      const p = load();
      const before = levelFromXp(p.xp || 0).level;
      p.xp = Math.max(0, (p.xp || 0) + Math.round(n || 0));
      PV.Store.set('profile', p);
      const after = levelFromXp(p.xp).level;
      document.dispatchEvent(new CustomEvent('pv:profile'));
      return { gained: Math.round(n || 0), levelledTo: after > before ? after : 0 };
    },

    /** One game's record, always a full object. */
    forGame(code) {
      const s = loadStats();
      return Object.assign(blankGame(), s.games[code] || {});
    },

    /**
     * Record an outcome.
     *   result  'win' | 'lose' | 'draw' | 'solved' | 'over'
     *   score   higher is better, optional
     *   timeMs  elapsed play time
     *   lowerTimeIsBetter  true for puzzles, where the record is a time
     *   xp      what this outcome is worth
     * Returns { newBestScore, newBestTime, xp }.
     */
    record(code, outcome) {
      const o = outcome || {};
      const s = loadStats();
      const g = Object.assign(blankGame(), s.games[code] || {});

      g.played++;
      if (o.result === 'win' || o.result === 'solved') g.won++;
      else if (o.result === 'lose') g.lost++;
      else if (o.result === 'draw') g.drawn++;

      g.timeMs += Math.max(0, o.timeMs || 0);
      g.last = new Date().toISOString();

      let newBestScore = false, newBestTime = false;
      if (o.score != null && o.score > g.bestScore) { g.bestScore = o.score; newBestScore = true; }
      if (o.lowerTimeIsBetter && (o.result === 'win' || o.result === 'solved') && o.timeMs > 0) {
        if (!g.bestTimeMs || o.timeMs < g.bestTimeMs) { g.bestTimeMs = o.timeMs; newBestTime = true; }
      }

      s.games[code] = g;
      PV.Store.set('stats', s);

      const xp = PV.Profile.addXp(o.xp || 0);
      document.dispatchEvent(new CustomEvent('pv:stats'));
      return { newBestScore, newBestTime, xp };
    },

    totals() {
      const s = loadStats();
      let played = 0, timeMs = 0;
      for (const k in s.games) { played += s.games[k].played || 0; timeMs += s.games[k].timeMs || 0; }
      return { played, timeMs, games: s.games };
    },

    resetStats() {
      PV.Store.set('stats', { games: {} });
      document.dispatchEvent(new CustomEvent('pv:stats'));
    }
  };

})(window.PV);
