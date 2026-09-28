/* 街头大厨 / Street Chef — sound.

   Made, never loaded, as in the other games here: the page's policy is
   `media-src 'none'`, so every sound is an oscillator or a burst of noise
   from the Web Audio API. A bell when something is cooked, a sizzle when
   it goes on, a pour, a till for a paid bill and a coin for a pick-up, a
   pop for a plate handed over, a grumble when somebody walks off, a buzz
   for a tap that does nothing.

   The context is made on the first tap (browsers insist). On or off is
   this device's, not the save's. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const KEY = 'chef.settings';
  PV.Store.validate(KEY, v => {
    const s = PV.Safe.obj(v);
    return s ? { sound: s.sound !== false } : undefined;
  });

  PV.ChefAudio = function () {
    const settings = PV.Store.get(KEY, null) || { sound: true };
    let ctx = null, master = null, noise = null;
    const last = Object.create(null);

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, n);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }

    /** Not the same sound twice inside `gap` ms: a burst of coins is one chime. */
    function ready(name, gap) {
      if (!settings.sound || !ctx) return false;
      const now = ctx.currentTime * 1000;
      if (last[name] && now - last[name] < gap) return false;
      last[name] = now;
      return true;
    }

    function tone(f, len, type, gain, at, slide) {
      const t0 = ctx.currentTime + (at || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + len);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + len + 0.02);
    }

    function hiss(len, f, q, gain, sweep) {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + len + 0.02);
    }

    const SOUNDS = {
      tap: () => ready('tap', 40) && tone(880, 0.05, 'triangle', 0.12),
      cook: () => ready('cook', 90) && hiss(0.35, 3200, 0.8, 0.18),
      pour: () => ready('pour', 90) && hiss(0.5, 900, 1.2, 0.16, 1600),
      ding: () => ready('ding', 120) && (tone(1320, 0.5, 'sine', 0.22), tone(1980, 0.35, 'sine', 0.1, 0.01)),
      poured: () => ready('poured', 120) && tone(1175, 0.25, 'sine', 0.14),
      add: () => ready('add', 50) && tone(520, 0.08, 'triangle', 0.16, 0, 760),
      serve: () => ready('serve', 60) && tone(660, 0.12, 'sine', 0.22, 0, 1100),
      pay: () => ready('pay', 120) && (tone(1568, 0.12, 'square', 0.08), tone(2093, 0.25, 'square', 0.07, 0.08)),
      coins: () => ready('coins', 80) && (tone(1760, 0.08, 'triangle', 0.18), tone(2349, 0.16, 'triangle', 0.14, 0.06)),
      angry: () => ready('angry', 200) && tone(330, 0.45, 'sawtooth', 0.1, 0, 180),
      burn: () => ready('burn', 200) && (hiss(0.6, 600, 0.6, 0.25), tone(160, 0.5, 'square', 0.08, 0, 90)),
      nope: () => ready('nope', 150) && tone(140, 0.16, 'square', 0.1),
      trash: () => ready('trash', 100) && (hiss(0.18, 400, 0.7, 0.2), tone(110, 0.15, 'sine', 0.2)),
      warm: () => ready('warm', 80) && tone(440, 0.1, 'triangle', 0.14),
      arrive: () => ready('arrive', 300) && (tone(988, 0.18, 'sine', 0.1), tone(1319, 0.3, 'sine', 0.09, 0.12)),
      go: () => ready('go', 300) && (tone(784, 0.14, 'triangle', 0.2), tone(1175, 0.3, 'triangle', 0.2, 0.14)),
      win: () => ready('end', 500) && [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, i * 0.12)),
      lose: () => ready('end', 500) && [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, i * 0.16)),
      buy: () => ready('buy', 100) && [880, 1320, 1760].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, i * 0.07))
    };

    return {
      init: init,
      play(name) { if (SOUNDS[name]) try { SOUNDS[name](); } catch (e) { /* sound is never worth an error */ } },
      on: () => settings.sound,
      toggle() { settings.sound = !settings.sound; PV.Store.set(KEY, settings); if (settings.sound) { init(); SOUNDS.tap(); } },
      destroy() { if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* already closed */ } } ctx = null; }
    };
  };

})(window.PV);
