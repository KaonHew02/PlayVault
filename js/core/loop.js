/* PlayVault — contract 3 of 3: real-time games.

   Serves Tetris, Snake, Racing and Tower Defense. A canvas and a game loop.
   Nothing here is turn-based, so nothing here uses the board contract.

   The load-bearing decision is the FIXED TIMESTEP. step() advances the world
   by exactly one tick and never sees a delta; the ticker decides how many
   ticks a frame is worth and drops rendering, not simulation, when a frame
   runs long. That is what makes a run reproducible from its seed — and a
   reproducible run is what lets two friends race the same game later by
   agreeing on a seed and exchanging events, instead of trying to synchronise
   sixty frames a second over a public broker.

   Inputs are queued, not applied on arrival, for the same reason: a key press
   lands on a tick boundary, so it lands in the same place on a replay. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.LoopGame = class LoopGame {
    /** opts: { seed } */
    constructor(opts) {
      const o = opts || {};
      this.seed = (o.seed >>> 0) || PV.newSeed();
      this.rng = new PV.RNG(this.seed);
      this.tick = 0;
      this.score = 0;
      this.over = false;
      this._inputs = [];
    }

    /** Called by the view. Never applied here — the tick applies it. */
    input(action) { if (!this.over) this._inputs.push(action); }

    /** Drain the queue inside step(). */
    takeInputs() { const q = this._inputs; this._inputs = []; return q; }

    /* ---- to be provided by the game ---- */
    step() { throw new Error('step() not implemented'); }

    /** One tick, plus the bookkeeping every real-time game needs. */
    advance() {
      if (this.over) return false;
      this.tick++;
      this.step();
      return !this.over;
    }

    isOver() { return this.over; }

    finish(reason) { this.over = true; this.overReason = reason || ''; }
  };

  /**
   * Fixed-timestep driver. onTick() runs at exactly `hz`; onDraw() runs once
   * per animation frame with the leftover fraction, so rendering can be
   * smooth without the simulation ever seeing a variable delta.
   */
  PV.Ticker = class Ticker {
    constructor(opts) {
      const o = opts || {};
      this.hz = o.hz || 60;
      this.onTick = o.onTick || function () {};
      this.onDraw = o.onDraw || function () {};
      this.maxCatchUp = o.maxCatchUp || 5;    // never spiral after a stall
      this._raf = 0;
      this._acc = 0;
      this._last = 0;
      this.running = false;
      this.paused = false;
      this._frame = this._frame.bind(this);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._acc = 0;
      this._raf = PV.raf(this._frame);
    }

    stop() {
      this.running = false;
      if (this._raf) PV.cancelRaf(this._raf);
      this._raf = 0;
    }

    pause(on) {
      this.paused = on == null ? !this.paused : !!on;
      // Drop whatever accumulated while paused, or the world lurches on resume.
      this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._acc = 0;
      return this.paused;
    }

    _frame(now) {
      if (!this.running) return;
      const step = 1000 / this.hz;
      const t = now || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      let dt = t - this._last;
      this._last = t;
      if (dt > 250) dt = step;                 // tab was hidden; do not catch up

      if (!this.paused) {
        this._acc += dt;
        let n = 0;
        while (this._acc >= step && n < this.maxCatchUp) {
          this._acc -= step;
          n++;
          if (this.onTick() === false) { this.stop(); break; }
        }
        if (this._acc > step * this.maxCatchUp) this._acc = 0;
      }
      if (this.running) {
        this.onDraw(this._acc / step);
        this._raf = PV.raf(this._frame);
      }
    }
  };

})(window.PV);
