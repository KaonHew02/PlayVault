/* PlayVault — the untrusted-input toolkit.

   THE MODEL, stated once so every other file can be short about it.

   This is a static site. Every line of JavaScript in it is downloaded by the
   browser, and anyone can read it, edit it in devtools and re-run it. That is
   not a hole to be plugged — it is what a browser IS. So nothing here tries to
   stop a player editing their own copy of their own game; there is no server
   to lie to and no other player's data to reach. A player who edits their own
   records has cheated at solitaire.

   What this file DOES defend against is the input we genuinely cannot trust:

   1. **Stored data that has been tampered with or corrupted.** Everything read
      back out of localStorage goes through a validator, so a hand-edited value
      cannot crash the app, freeze it, or persist as a broken state that
      survives every refresh.
   2. **A backup file from somewhere else.** Import rebuilds the whole payload
      from scratch: no prototypes, no functions, bounded depth, bounded size.
   3. **Another person's machine.** In a friends room, the roster, the game
      code, the options and the scoreboard all arrive over a wire from someone
      else's browser. Those are the only bytes in this app authored by a person
      who is not the one sitting in front of it, and they are treated that way.

   The rule everywhere: rebuild the value, never adopt it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* Copying one of these into an object with [[Set]] changes its prototype
     rather than adding a key, which is how a JSON file becomes an exploit. */
  const BANNED = ['__proto__', 'constructor', 'prototype'];

  /* Control characters, bidi overrides and zero-width joiners: invisible in a
     name, and a mess in a roster. */
  const CTRL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029\uFEFF]/g;

  function str(v, max, fallback) {
    const fb = fallback == null ? '' : fallback;
    if (typeof v !== 'string') {
      if (typeof v !== 'number' && typeof v !== 'boolean') return fb;
      v = String(v);
    }
    const out = v.replace(CTRL, '').slice(0, max || 64).trim();
    return out || fb;
  }

  function num(v, lo, hi, fallback) {
    const fb = fallback == null ? lo : fallback;
    const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
    if (!isFinite(n)) return fb;
    return Math.min(hi, Math.max(lo, n));
  }

  function int(v, lo, hi, fallback) { return Math.round(num(v, lo, hi, fallback)); }

  function bool(v) { return v === true || v === 'true' || v === 1; }

  /** One of `list`, or the first entry. Anything else is not a choice. */
  function pick(v, list, fallback) {
    return list.indexOf(v) >= 0 ? v : (fallback == null ? list[0] : fallback);
  }

  /**
   * Rebuild a JSON value from scratch: plain objects and arrays, finite
   * numbers, bounded strings, nothing inherited and nothing banned. Returns
   * undefined when the value blows the budget, and the caller treats that as
   * "there was no value" rather than trying to salvage it.
   */
  function plain(v, opts) {
    const o = opts || {};
    const maxDepth = o.depth || 6;
    const maxKeys = o.keys || 256;
    const maxArray = o.array || 5000;
    const maxString = o.string || 4096;
    let budget = o.nodes || 20000;

    function walk(x, depth) {
      if (--budget < 0 || depth > maxDepth) return undefined;
      if (x === null) return null;
      const t = typeof x;
      if (t === 'number') return isFinite(x) ? x : undefined;
      if (t === 'boolean') return x;
      if (t === 'string') return x.length > maxString ? x.slice(0, maxString) : x;
      if (t !== 'object') return undefined;          // function, symbol, undefined
      if (Array.isArray(x)) {
        const out = [];
        const n = Math.min(x.length, maxArray);
        for (let i = 0; i < n; i++) {
          const w = walk(x[i], depth + 1);
          out.push(w === undefined ? null : w);
        }
        return out;
      }
      const out = {};
      let keys = 0;
      for (const k of Object.keys(x)) {
        if (BANNED.indexOf(k) >= 0) continue;        // the whole point
        if (++keys > maxKeys) break;
        const w = walk(x[k], depth + 1);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return walk(v, 0);
  }

  /** An object, or undefined. Arrays and nulls are not objects here. */
  function obj(v) {
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : undefined;
  }

  /** Own property only — never one inherited from a poisoned prototype. */
  function own(o2, k) {
    return !!o2 && Object.prototype.hasOwnProperty.call(o2, k);
  }

  PV.Safe = {
    BANNED: BANNED,
    str: str, num: num, int: int, bool: bool, pick: pick,
    plain: plain, obj: obj, own: own
  };

})(window.PV);
