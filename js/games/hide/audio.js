/* 变色躲猫猫 / Blend In — sound.

   Made, never loaded, as in Strike Squad: the page's policy is
   `media-src 'none'`, so every sound is noise and oscillators from the Web
   Audio API. A squirt is a short hiss through a band-pass filter; a splash
   a wetter one with a drop in pitch; being found a pop and a falling
   chime; a brush stroke a soft swish. Sounds in the world are quieter with
   distance and panned by where they come from.

   The context is only made on a click or a key (browsers insist). The
   volume belongs to this device, not to the save. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.HideAudio = function (settings) {
    let ctx = null, master = null, noise = null;
    let vol = settings && settings.vol != null ? settings.vol : 0.7;
    const L = { x: 0, y: 0, z: 0, yaw: 0 };
    let lastSpray = 0, lastSplash = 0, lastSwish = 0;

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = vol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 5;
      master.connect(comp); comp.connect(ctx.destination);
      const n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, n);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }

    function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; }

    function place(x, y, z, reach) {
      if (x == null) return { g: 1, pan: 0 };
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, y - L.y, dz), R = reach || 40;
      if (d > R) return null;
      const g = Math.min(1, Math.pow(4 / Math.max(4, d), 1.1));
      const a = Math.atan2(dx, -dz) - L.yaw;
      return { g: g, pan: Math.max(-0.85, Math.min(0.85, Math.sin(a))) };
    }
    function out(pan) {
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan || 0; p.connect(master); return p; }
      return master;
    }
    function hiss(t0, len, f, q, gain, dest, sweep) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
      if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(flt); flt.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 0.5, len + 0.05);
    }
    function tone(t0, f0, f1, len, gain, dest, type) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(dest);
      o.start(t0); o.stop(t0 + len + 0.05);
    }
    const ready = () => !!ctx && ctx.state === 'running';

    return {
      init: init,
      setVolume: setVolume,
      listen(x, y, z, yaw) { L.x = x; L.y = y; L.z = z; L.yaw = yaw; },
      spray(x, y, z, mine) {
        if (!ready()) return;
        const now = ctx.currentTime;
        if (now - lastSpray < 0.05) return;
        lastSpray = now;
        const p = place(x, y, z); if (!p) return;
        hiss(now, 0.09, 2600 + Math.random() * 600, 1.2, (mine ? 0.18 : 0.12) * p.g, out(p.pan));
      },
      splash(x, y, z) {
        if (!ready()) return;
        const now = ctx.currentTime;
        if (now - lastSplash < 0.06) return;
        lastSplash = now;
        const p = place(x, y, z, 25); if (!p) return;
        hiss(now, 0.16, 1400, 0.9, 0.12 * p.g, out(p.pan), 500);
      },
      hit(x, y, z) {
        if (!ready()) return;
        const p = place(x, y, z); if (!p) return;
        const now = ctx.currentTime, o = out(p.pan);
        hiss(now, 0.2, 900, 0.8, 0.3 * p.g, o, 300);
        tone(now, 520, 260, 0.12, 0.12 * p.g, o, 'triangle');
      },
      found(x, y, z) {
        if (!ready()) return;
        const p = place(x, y, z, 80) || { g: 0.3, pan: 0 };
        const now = ctx.currentTime, o = out(p.pan);
        hiss(now, 0.45, 700, 0.6, 0.45 * Math.max(0.4, p.g), o, 200);
        tone(now, 880, 1320, 0.1, 0.18, master, 'square');
        tone(now + 0.1, 1320, 660, 0.3, 0.14, master, 'triangle');
      },
      swish() {
        if (!ready()) return;
        const now = ctx.currentTime;
        if (now - lastSwish < 0.07) return;
        lastSwish = now;
        hiss(now, 0.12, 3200 + Math.random() * 1500, 2.5, 0.05, master, 1800);
      },
      fill() { if (ready()) { const n = ctx.currentTime; hiss(n, 0.35, 1800, 1.5, 0.1, master, 700); } },
      pick() { if (ready()) { const n = ctx.currentTime; tone(n, 1500, 2200, 0.08, 0.1, master, 'sine'); } },
      click() { if (ready()) { const n = ctx.currentTime; tone(n, 900, 700, 0.05, 0.08, master, 'triangle'); } },
      step(x, y, z) {
        if (!ready()) return;
        const p = place(x, y, z, 18); if (!p) return;
        hiss(ctx.currentTime, 0.05, 500, 0.9, 0.05 * p.g, out(p.pan));
      },
      beep(f, len, gain) { if (ready()) tone(ctx.currentTime, f, 0, len || 0.1, gain || 0.12, master, 'square'); },
      horn(good) {
        if (!ready()) return;
        const n = ctx.currentTime, a = good ? [523, 659, 784] : [392, 330, 262];
        a.forEach((f, i) => tone(n + i * 0.12, f, 0, 0.22, 0.12, master, 'triangle'));
      },
      destroy() { if (ctx) { try { ctx.close(); } catch (e) { /* already closed */ } } ctx = null; }
    };
  };

})(window.PV);
