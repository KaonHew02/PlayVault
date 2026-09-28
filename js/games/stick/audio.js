/* 火柴人对决 / Stick Clash — sound.

   Made, never loaded: the page's policy is `media-src 'none'`, so every
   sound is noise and oscillators from the Web Audio API, as in the other
   arcade games. A swing is a quick band-passed whoosh; a hit a thump
   under a crack, heavier for a heavy hit; a block a short metallic ring;
   a knockout a boom and a falling tone. The context is only made on a
   click or a key, because browsers insist. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.StickAudio = function (settings) {
    let ctx = null, master = null, noise = null;
    let vol = settings && settings.vol != null ? settings.vol : 0.7;

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = vol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctx.destination);
      const n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, n);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }

    function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; }

    function pan(p) {
      if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = Math.max(-0.8, Math.min(0.8, p || 0)); s.connect(master); return s; }
      return master;
    }

    function hiss(len, f, q, gain, sweep, p, type) {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const flt = ctx.createBiquadFilter();
      flt.type = type || 'bandpass'; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, len * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(flt); flt.connect(g); g.connect(pan(p));
      src.start(t0, Math.random() * 0.5); src.stop(t0 + len + 0.05);
    }

    function tone(f0, f1, len, gain, type, p, delay) {
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(pan(p));
      o.start(t0); o.stop(t0 + len + 0.05);
    }

    const on = fn => function () { if (!ctx || !vol) return; try { fn.apply(null, arguments); } catch (e) { /* a dropped sound is fine */ } };

    return {
      init: init,
      setVolume: setVolume,
      swing: on((heavy, p) => hiss(heavy ? 0.2 : 0.12, heavy ? 900 : 1500, 1.2, heavy ? 0.28 : 0.2, heavy ? 300 : 600, p)),
      hit: on((heavy, p) => {
        tone(heavy ? 120 : 170, heavy ? 45 : 70, heavy ? 0.22 : 0.12, heavy ? 0.9 : 0.6, 'sine', p);
        hiss(heavy ? 0.16 : 0.08, heavy ? 1800 : 2600, 0.8, heavy ? 0.6 : 0.4, 500, p);
      }),
      flurry: on(p => { tone(210, 90, 0.07, 0.35, 'triangle', p); hiss(0.05, 3000, 1, 0.25, 900, p); }),
      block: on(p => { tone(900, 700, 0.12, 0.22, 'square', p); tone(1350, 1200, 0.1, 0.12, 'triangle', p); hiss(0.05, 4000, 2, 0.2, 2500, p); }),
      special: on(p => { tone(300, 900, 0.22, 0.2, 'sawtooth', p); hiss(0.25, 800, 1, 0.2, 3000, p); }),
      proj: on((kind, p) => {
        if (kind === 'quake') { tone(70, 40, 0.4, 0.8, 'sine', p); hiss(0.4, 200, 0.7, 0.5, 80, p, 'lowpass'); }
        else if (kind === 'bolt') { hiss(0.5, 3000, 0.5, 0.7, 300, p); tone(90, 40, 0.5, 0.6, 'sawtooth', p); }
        else if (kind === 'star') hiss(0.1, 5000, 3, 0.25, 3000, p);
        else { tone(500, 1200, 0.18, 0.18, 'triangle', p); hiss(0.2, 2000, 1.5, 0.15, 600, p); }
      }),
      jump: on(p => hiss(0.08, 700, 1, 0.12, 1400, p)),
      land: on(p => tone(90, 50, 0.08, 0.3, 'sine', p)),
      down: on(p => { tone(80, 40, 0.25, 0.8, 'sine', p); hiss(0.2, 300, 0.8, 0.4, 100, p, 'lowpass'); }),
      tele: on(p => { tone(1200, 300, 0.15, 0.15, 'sine', p); hiss(0.15, 2500, 2, 0.15, 800, p); }),
      guardbreak: on(p => { tone(700, 200, 0.35, 0.4, 'square', p); hiss(0.35, 3500, 0.6, 0.5, 600, p); }),
      breaker: on(p => { tone(200, 900, 0.18, 0.4, 'sawtooth', p); hiss(0.3, 1200, 0.8, 0.5, 4000, p); }),
      ult: on(p => { tone(110, 880, 0.6, 0.35, 'sawtooth', p); tone(220, 1760, 0.6, 0.15, 'square', p); hiss(0.6, 400, 0.6, 0.3, 5000, p); }),
      ko: on(() => { tone(160, 30, 1.1, 1, 'sine'); hiss(0.9, 900, 0.5, 0.7, 60, 0, 'lowpass'); tone(440, 110, 1.2, 0.2, 'triangle', 0, 0.1); }),
      tired: on(p => tone(220, 160, 0.12, 0.12, 'triangle', p)),
      clash: on(p => { tone(1500, 900, 0.18, 0.25, 'triangle', p); hiss(0.12, 3000, 1.5, 0.3, 1200, p); }),
      announce: on(kind => {
        if (kind === 'fight') { tone(330, 330, 0.12, 0.3, 'square'); tone(660, 660, 0.25, 0.3, 'square', 0, 0.12); }
        else if (kind === 'round') tone(440, 440, 0.18, 0.22, 'square');
        else if (kind === 'win') { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 0.22, 'triangle', 0, i * 0.12)); }
        else if (kind === 'lose') { [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.3, 0.22, 'triangle', 0, i * 0.18)); }
        else if (kind === 'perfect') { [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.15, 0.2, 'square', 0, i * 0.08)); }
      }),
      click: on(() => tone(900, 700, 0.05, 0.12, 'triangle')),
      coin: on(() => { tone(988, 988, 0.08, 0.2, 'square'); tone(1319, 1319, 0.18, 0.2, 'square', 0, 0.08); }),
      destroy() { if (ctx && ctx.close) ctx.close().catch(() => {}); ctx = null; }
    };
  };

})(window.PV);
