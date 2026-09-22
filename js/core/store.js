/* PlayVault — persistence.

   Every persisted value goes through here so that one list, BACKUP_STORES,
   decides what travels in an export. A new persisted store that is not in that
   list is silently left out of every backup — the trap CardVerse documents.

   Settings and language are deliberately NOT backed up: a theme and a UI
   language belong to the device, not to the player.

   Everything READ back out of storage goes through the validator its owner
   registered, not just everything imported. localStorage belongs to whoever
   is sitting at the machine: they can hand-edit it, and whatever they leave
   behind is read on every single load from then on. Validating only on the
   way in would mean one bad value in devtools is a permanently broken app —
   which is exactly the shape of bug that looks like it survived a refresh. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const PREFIX = 'playvault.';
  const mem = Object.create(null);   // fallback when localStorage throws
  let warned = false;

  function readRaw(key) {
    try { return localStorage.getItem(PREFIX + key); }
    catch (e) {
      if (!warned) { warned = true; console.warn('PlayVault: localStorage unavailable, using memory'); }
      return key in mem ? mem[key] : null;
    }
  }
  function writeRaw(key, val) {
    mem[key] = val;
    try { localStorage.setItem(PREFIX + key, val); } catch (e) { /* memory only */ }
  }

  /* key -> (value) => cleaned value, or undefined to reject it outright.
     Registered by whichever module owns the store, next to the code that
     knows what a good value looks like. */
  const VALIDATORS = Object.create(null);

  PV.Store = {
    /** Stores that travel in an export / Drive backup. Add new ones here. */
    BACKUP_STORES: ['profile', 'stats', 'sudoku.saved', 'spider.saved', 'mahjong.saved'],
    FORMAT: 'playvault.backup',

    /** `fn` must REBUILD the value rather than patch it. */
    validate(key, fn) { VALIDATORS[key] = fn; },

    /** The cleaned form of a stored value, or undefined if it is not usable. */
    clean(key, value) {
      const fn = VALIDATORS[key];
      if (fn) { try { return fn(value); } catch (e) { return undefined; } }
      return PV.Safe.plain(value, { nodes: 40000, depth: 8 });
    },

    get(key, fallback) {
      const raw = readRaw(key);
      if (raw == null) return fallback;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { return fallback; }
      const clean = PV.Store.clean(key, parsed);
      return clean === undefined ? fallback : clean;
    },

    set(key, value) { writeRaw(key, JSON.stringify(value)); return value; },

    del(key) {
      delete mem[key];
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    },

    /** The backup envelope. Keep `format` stable — importAll() checks it. */
    exportAll() {
      const data = {};
      for (const k of PV.Store.BACKUP_STORES) {
        const v = PV.Store.get(k, undefined);
        if (v !== undefined) data[k] = v;
      }
      return { format: PV.Store.FORMAT, version: 1, saved: new Date().toISOString(), data };
    },

    /**
     * Returns {ok, error, restored}. Refuses another app's envelope, and
     * rebuilds the one it accepts: a backup file is a file from somewhere
     * else, so nothing in it is adopted as it stands. A store that fails its
     * own validator is skipped, not restored badly.
     */
    importAll(envelope) {
      const env = PV.Safe.obj(PV.Safe.plain(envelope, { nodes: 80000, depth: 10 }));
      if (!env) return { ok: false, error: 'not-json' };
      if (env.format !== PV.Store.FORMAT) return { ok: false, error: 'wrong-format' };
      const data = PV.Safe.obj(env.data);
      if (!data) return { ok: false, error: 'not-json' };
      let restored = 0, skipped = 0;
      for (const k of PV.Store.BACKUP_STORES) {
        if (!PV.Safe.own(data, k)) continue;
        const clean = PV.Store.clean(k, data[k]);
        if (clean === undefined) { skipped++; continue; }
        PV.Store.set(k, clean);
        restored++;
      }
      return { ok: true, restored: restored, skipped: skipped };
    }
  };

})(window.PV);
