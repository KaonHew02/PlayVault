/* PlayVault — persistence.

   Every persisted value goes through here so that one list, BACKUP_STORES,
   decides what travels in an export. A new persisted store that is not in that
   list is silently left out of every backup — the trap CardVerse documents.

   Settings, language and the Drive switches are deliberately NOT backed up:
   a theme, a UI language and whether this browser auto-saves belong to the
   device, not to the player.

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
  const mem = Object.create(null);   // every value written; the fallback when localStorage throws
  let warned = false;

  /* Keys whose newest value never reached localStorage: the storage is full
     (every app on this origin shares one quota) or takes no writes at all
     (some private windows). This used to be silent, and worse than silent:
     a full storage still READS, so the game read back the older value on
     disk and progress stopped adding up the moment a write failed, not just
     at the next reload. Now a key that failed is read from memory until a
     write of it lands, every write that does land retries the rest, and the
     shell puts a strip over every screen saying progress is not being saved,
     with Export, which reads the same memory. */
  const unsaved = Object.create(null);
  let pending = 0;                   // how many keys are in `unsaved`
  let failure = null;                // 'full' | 'blocked': why the newest write failed
  const state = () => (pending ? 'unsaved:' + failure : 'ok');

  /* Records carry a checksum of themselves. It is a SPEED BUMP and is
     described as one in SECURITY.md: the salt is in the same JavaScript the
     player already has, so anyone who reads it can recompute a sum. What it
     does stop is the thing that actually happens — a number edited in
     devtools, or a save file hand-patched in a text editor — because the
     value no longer matches its own sum and is dropped on the next read
     rather than believed for ever. */
  const SIGNED = ['profile', 'stats', 'crowd.meta', 'worms.meta', 'fps.meta', 'hide.meta', 'stick.meta', 'chef.meta'];
  const SALT = 'pv.1.a7f3';

  function sum(key, json) {
    let h = 0x811c9dc5;
    const s2 = key + '\0' + json + SALT;
    for (let i = 0; i < s2.length; i++) {
      h ^= s2.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  const isSealed = v => !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof v.c === 'string' && 'd' in v;

  /* A backup carries a seal as well, over everything in its envelope. That
     closed the easiest cheat there was, easier than any console: Export,
     change `coins` in a text editor, Import — and the app sealed the edited
     numbers as if it had earned them. Now a file that no longer matches its
     own seal is refused whole, before anything in it is read. The same speed
     bump as the records, for the same reason, and filed as one. */
  function backupSeal(env) {
    return sum('backup', [env.format, env.version, env.saved, JSON.stringify(env.data)].join('\n'));
  }

  function readRaw(key) {
    if (key in unsaved) return mem[key];
    try { return localStorage.getItem(PREFIX + key); }
    catch (e) {
      if (!warned) { warned = true; console.warn('PlayVault: localStorage unavailable, using memory'); }
      return key in mem ? mem[key] : null;
    }
  }

  const isFull = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22 || e.code === 1014);

  /** True when the value reached localStorage. */
  function land(key, val) {
    try { localStorage.setItem(PREFIX + key, val); return true; }
    catch (e) { failure = isFull(e) ? 'full' : 'blocked'; return false; }
  }

  function writeRaw(key, val) {
    const was = state();
    mem[key] = val;
    if (land(key, val)) {
      if (key in unsaved) { delete unsaved[key]; pending--; }
      // There was room for this one: try the ones that failed before it.
      for (const k in unsaved) if (land(k, mem[k])) { delete unsaved[k]; pending--; }
    } else if (!(key in unsaved)) {
      unsaved[key] = true;
      pending++;
    }
    if (state() !== was) told();
  }

  /** Tell the page when saving stops, starts again, or fails another way. */
  function told() {
    try { document.dispatchEvent(new CustomEvent('pv:saving', { detail: PV.Store.saving() })); }
    catch (e) { /* no page to tell */ }
  }

  /* key -> (value) => cleaned value, or undefined to reject it outright.
     Registered by whichever module owns the store, next to the code that
     knows what a good value looks like. */
  const VALIDATORS = Object.create(null);

  PV.Store = {
    /** Stores that travel in an export / Drive backup. Add new ones here. */
    BACKUP_STORES: ['profile', 'stats', 'sudoku.saved', 'spider.saved', 'mahjong.saved', 'crowd.meta',
      'worms.meta', 'fps.meta', 'hide.meta', 'stick.meta', 'chef.meta'],
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
      if (SIGNED.indexOf(key) >= 0) {
        if (!isSealed(parsed)) return fallback;              // unsigned: not ours
        const body = JSON.stringify(parsed.d);
        if (sum(key, body) !== parsed.c) return fallback;    // edited since we wrote it
        parsed = parsed.d;
      }
      const clean = PV.Store.clean(key, parsed);
      return clean === undefined ? fallback : clean;
    },

    set(key, value) {
      const json = JSON.stringify(value);
      if (SIGNED.indexOf(key) >= 0) {
        writeRaw(key, JSON.stringify({ d: value, c: sum(key, json) }));
      } else {
        writeRaw(key, json);
      }
      // Drive's auto-save hears about it from here, and only about what a
      // backup carries. A no-op unless the player has switched it on.
      if (PV.Drive && PV.Store.BACKUP_STORES.indexOf(key) >= 0) PV.Drive.touch();
      return value;
    },

    del(key) {
      const was = state();
      delete mem[key];
      if (key in unsaved) { delete unsaved[key]; pending--; }
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
      if (state() !== was) told();
    },

    /** Whether everything written has reached storage: {ok, reason, keys}.
        `reason` is 'full' or 'blocked' while something has not. */
    saving() {
      return { ok: pending === 0, reason: pending ? failure : null, keys: Object.keys(unsaved) };
    },

    /** The backup envelope. Keep `format` stable — importAll() checks it. */
    exportAll() {
      const data = {};
      for (const k of PV.Store.BACKUP_STORES) {
        const v = PV.Store.get(k, undefined);
        if (v !== undefined) data[k] = v;
      }
      return PV.Store.sealBackup({ format: PV.Store.FORMAT, version: 1, saved: new Date().toISOString(), data });
    },

    /** The envelope with its seal on. exportAll() is the one caller that
        matters; the smoke tests seal a hostile file with it, to prove that
        even a sealed one is rebuilt rather than believed. */
    sealBackup(env) {
      env.seal = backupSeal(env);
      return env;
    },

    /**
     * True when this envelope is exactly what PlayVault wrote. Checked on the
     * envelope as it arrived, before anything rebuilds it: rebuilding caps
     * and trims, and a seal is over what was written, not what survived.
     * A file saved before backups were sealed has no seal, and is refused
     * too — it cannot be told apart from one somebody edited.
     */
    sealed(envelope) {
      try {
        const env = PV.Safe.obj(envelope);
        if (!env || typeof env.seal !== 'string' || !PV.Safe.own(env, 'data')) return false;
        return backupSeal(env) === env.seal;
      } catch (e) { return false; }
    },

    /**
     * Returns {ok, error, restored}. Refuses another app's envelope and one
     * that was changed after PlayVault wrote it (error 'tampered'), and
     * rebuilds the one it accepts: a backup file is a file from somewhere
     * else, so nothing in it is adopted as it stands. A store that fails its
     * own validator is skipped, not restored badly.
     */
    importAll(envelope) {
      const env = PV.Safe.obj(PV.Safe.plain(envelope, { nodes: 80000, depth: 10 }));
      if (!env) return { ok: false, error: 'not-json' };
      if (env.format !== PV.Store.FORMAT) return { ok: false, error: 'wrong-format' };
      if (!PV.Store.sealed(envelope)) return { ok: false, error: 'tampered' };
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

  /* One-time upgrade for records written before they were sealed: read them
     raw, then write them back through set(). After this runs, an unsealed
     value in one of these keys is one that somebody else put there. */
  (function seal() {
    for (const key of SIGNED) {
      const raw = readRaw(key);
      if (raw == null) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      if (isSealed(parsed)) continue;
      const clean = PV.Store.clean(key, parsed);
      if (clean !== undefined) PV.Store.set(key, clean);
    }
  })();

})(window.PV);
