/* PlayVault — the player, their level, and per-game records.

   Engines never touch this. A game reports an outcome through
   PV.Profile.record() and the shell decides what that is worth.

   This store lives in localStorage, which belongs to whoever is at the
   keyboard. So both shapes here are rebuilt by a validator on every read (see
   store.js) and every number is clamped. The XP clamp is not cosmetic: the
   level is found by walking one level at a time, and an xp of 1e308 typed
   into devtools would walk about 1e153 of them — a browser that hangs on
   load, for ever, from one bad value. Clamped, that walk is 4,500 steps at
   worst. SECURITY.md says what this does and does not defend against. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);   // lazy — i18n.js may load after this

  /** XP to go from level L to L+1. Gentle, no wall. */
  const stepFor = L => 100 + 50 * (L - 1);

  const MAX_XP = 5e8;              // ~4,470 levels: a bounded walk, always
  const MAX_LEVEL = 5000;
  const MAX_COUNT = 1e9;           // played / won / lost / drawn
  const MAX_SCORE = 1e12;
  const MAX_TIME = 1e10;           // about 115 days of play, per game

  function levelFromXp(xp) {
    const total = PV.Safe.num(xp, 0, MAX_XP, 0);
    let lvl = 1, need = stepFor(1), left = total;
    while (left >= need && lvl < MAX_LEVEL) { left -= need; lvl++; need = stepFor(lvl); }
    return { level: lvl, into: left, need, total: total };
  }

  /** One game's record, rebuilt field by field. Never Object.assign from a
      stored object: an own `__proto__` key in it is copied with [[Set]],
      which swaps the target's prototype instead of adding a key. */
  function cleanGame(g) {
    const src = PV.Safe.obj(g) || {};
    return {
      played: PV.Safe.int(src.played, 0, MAX_COUNT, 0),
      won: PV.Safe.int(src.won, 0, MAX_COUNT, 0),
      lost: PV.Safe.int(src.lost, 0, MAX_COUNT, 0),
      drawn: PV.Safe.int(src.drawn, 0, MAX_COUNT, 0),
      bestScore: PV.Safe.int(src.bestScore, 0, MAX_SCORE, 0),
      bestTimeMs: PV.Safe.int(src.bestTimeMs, 0, MAX_TIME, 0),
      timeMs: PV.Safe.int(src.timeMs, 0, MAX_TIME, 0),
      last: src.last == null ? null : PV.Safe.str(src.last, 32, null)
    };
  }

  PV.Store.validate('profile', v => {
    const p = PV.Safe.obj(v);
    if (!p) return undefined;
    return {
      name: PV.Safe.str(p.name, 24, ''),
      xp: PV.Safe.int(p.xp, 0, MAX_XP, 0),
      created: PV.Safe.str(p.created, 32, new Date().toISOString())
    };
  });

  PV.Store.validate('stats', v => {
    const s = PV.Safe.obj(v);
    if (!s) return undefined;
    const src = PV.Safe.obj(s.games) || {};
    const games = {};
    let n = 0;
    for (const code of Object.keys(src)) {
      if (PV.Safe.BANNED.indexOf(code) >= 0) continue;
      if (++n > 64) break;                       // the roster is twelve long
      const key = PV.Safe.str(code, 24, '');
      if (key) games[key] = cleanGame(src[code]);
    }
    return { games: games };
  });

  function load() {
    const p = PV.Store.get('profile', null);
    if (p) return p;
    return PV.Store.set('profile', {
      name: '', xp: 0, created: new Date().toISOString()
    });
  }

  function loadStats() {
    const s = PV.Store.get('stats', null);
    if (s && s.games) return s;
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
      p.name = PV.Safe.str(n, 24, '');
      PV.Store.set('profile', p);
      document.dispatchEvent(new CustomEvent('pv:profile'));
    },

    level() { return levelFromXp(load().xp || 0); },

    /** The level any xp is worth — for a record that is not this one yet,
        such as a Drive copy being offered in place of this browser's. */
    levelOf: xp => levelFromXp(xp),

    addXp(n) {
      const p = load();
      const before = levelFromXp(p.xp || 0).level;
      p.xp = PV.Safe.int((p.xp || 0) + PV.Safe.int(n, -MAX_XP, MAX_XP, 0), 0, MAX_XP, 0);
      PV.Store.set('profile', p);
      const after = levelFromXp(p.xp).level;
      document.dispatchEvent(new CustomEvent('pv:profile'));
      return { gained: Math.round(n || 0), levelledTo: after > before ? after : 0 };
    },

    /** One game's record, always a full object. */
    forGame(code) {
      const s = loadStats();
      return cleanGame(PV.Safe.own(s.games, code) ? s.games[code] : null);
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
      const g = cleanGame(PV.Safe.own(s.games, code) ? s.games[code] : null);

      g.played++;
      if (o.result === 'win' || o.result === 'solved') g.won++;
      else if (o.result === 'lose') g.lost++;
      else if (o.result === 'draw') g.drawn++;

      const took = PV.Safe.int(o.timeMs, 0, MAX_TIME, 0);
      g.timeMs = PV.Safe.int(g.timeMs + took, 0, MAX_TIME, 0);
      g.last = new Date().toISOString();

      let newBestScore = false, newBestTime = false;
      const score = o.score == null ? null : PV.Safe.int(o.score, -MAX_SCORE, MAX_SCORE, 0);
      if (score != null && score > g.bestScore) { g.bestScore = score; newBestScore = true; }
      if (o.lowerTimeIsBetter && (o.result === 'win' || o.result === 'solved') && took > 0) {
        if (!g.bestTimeMs || took < g.bestTimeMs) { g.bestTimeMs = took; newBestTime = true; }
      }

      const key = PV.Safe.str(code, 24, '');
      if (key) s.games[key] = g;
      PV.Store.set('stats', s);

      const xp = PV.Profile.addXp(o.xp || 0);
      document.dispatchEvent(new CustomEvent('pv:stats'));
      return { newBestScore, newBestTime, xp };
    },

    totals() {
      const s = loadStats();
      let played = 0, timeMs = 0;
      for (const k of Object.keys(s.games)) {
        const g = s.games[k] || {};
        played += g.played || 0;
        timeMs += g.timeMs || 0;
      }
      return { played, timeMs, games: s.games };
    },

    resetStats() {
      PV.Store.set('stats', { games: {} });
      document.dispatchEvent(new CustomEvent('pv:stats'));
    }
  };

})(window.PV);
