/* PlayVault — persistence.

   Every persisted value goes through here so that one list, BACKUP_STORES,
   decides what travels in an export. A new persisted store that is not in that
   list is silently left out of every backup — the trap CardVerse documents.

   Settings and language are deliberately NOT backed up: a theme and a UI
   language belong to the device, not to the player. */
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

  PV.Store = {
    /** Stores that travel in an export / Drive backup. Add new ones here. */
    BACKUP_STORES: ['profile', 'stats', 'sudoku.saved', 'spider.saved', 'mahjong.saved'],
    FORMAT: 'playvault.backup',

    get(key, fallback) {
      const raw = readRaw(key);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
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

    /** Returns {ok, error, restored}. Refuses another app's envelope. */
    importAll(envelope) {
      if (!envelope || typeof envelope !== 'object') return { ok: false, error: 'not-json' };
      if (envelope.format !== PV.Store.FORMAT) return { ok: false, error: 'wrong-format' };
      const data = envelope.data || {};
      let restored = 0;
      for (const k of PV.Store.BACKUP_STORES) {
        if (k in data) { PV.Store.set(k, data[k]); restored++; }
      }
      return { ok: true, restored };
    }
  };

})(window.PV);
