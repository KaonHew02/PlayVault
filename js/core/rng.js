/* PlayVault — seeded random.

   No engine anywhere may call Math.random(). Everything random goes through an
   RNG built from a seed, so a game can be replayed, a puzzle can be shared with
   a friend by seed alone, and the smoke test can reproduce a failure exactly. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /** mulberry32 — small, fast, good enough, and reproducible across engines. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  PV.RNG = class RNG {
    constructor(seed) {
      this.seed = (seed >>> 0) || 1;
      this.calls = 0;
      this._next = mulberry32(this.seed);
    }
    /** [0, 1) */
    next() { this.calls++; return this._next(); }
    /** [0, n) integer */
    int(n) { return Math.floor(this.next() * n); }
    /** [lo, hi] integer */
    range(lo, hi) { return lo + this.int(hi - lo + 1); }
    pick(arr) { return arr[this.int(arr.length)]; }
    /** Fisher-Yates, in place. */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    chance(p) { return this.next() < p; }
    /** Enough to reproduce this stream from the start. */
    state() { return { seed: this.seed, calls: this.calls }; }
    /** Fast-forward a fresh RNG to a recorded state. */
    static restore(state) {
      const r = new RNG(state.seed);
      for (let i = 0; i < state.calls; i++) r.next();
      return r;
    }
  };

  /** A seed a human can read back to a friend. */
  PV.newSeed = () => Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  PV.seedToCode = s => (s >>> 0).toString(36).toUpperCase().padStart(7, '0');
  PV.codeToSeed = c => parseInt(String(c).trim(), 36) >>> 0;

})(window.PV);
