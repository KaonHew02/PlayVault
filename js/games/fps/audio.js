/* 突击小队 / Strike Squad — sound.

   A shooter without sound is half a game, and PlayVault's policy is
   `media-src 'none'`: no audio file is ever fetched. So every sound here is
   made on the spot by the Web Audio API — a burst of noise through a
   filter for a gunshot, a falling sine under it for the thump, a pair of
   filtered clicks for a reload, a long low roar for an explosion. Nothing
   is loaded, so there is nothing for the policy to refuse.

   Sounds in the world are placed: quieter with distance, and panned left or
   right by where they came from relative to where you are looking. The
   context is only created on a click or a key (browsers insist), and the
   volume and the mute switch belong to this device, not to the save. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* What each gun sounds like: how long, how bright, how much thump. */
  const GUN = {
    pistol: { len: 0.13, f: 2400, q: 0.8, thump: 150, tg: 0.5, g: 0.55 },
    smg: { len: 0.09, f: 2800, q: 0.9, thump: 170, tg: 0.35, g: 0.45 },
    rifle: { len: 0.16, f: 1800, q: 0.8, thump: 110, tg: 0.6, g: 0.6 },
    heavy: { len: 0.2, f: 1400, q: 0.7, thump: 90, tg: 0.75, g: 0.7 },
    lmg: { len: 0.15, f: 1500, q: 0.8, thump: 100, tg: 0.65, g: 0.6 },
    shotgun: { len: 0.34, f: 900, q: 0.6, thump: 70, tg: 1.0, g: 0.85 },
    sniper: { len: 0.55, f: 1600, q: 0.6, thump: 70, tg: 1.0, g: 0.95 },
    magnum: { len: 0.3, f: 1300, q: 0.7, thump: 90, tg: 0.9, g: 0.8 }
  };

  PV.FpsAudio = function (settings) {
    let ctx = null, master = null, noise = null;
    let vol = settings && settings.vol != null ? settings.vol : 0.7;
    let muted = !!(settings && settings.mute);
    const listener = { x: 0, y: 0, z: 0, yaw: 0 };

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : vol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(ctx.destination);
      const n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, n);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }

    function setVolume(v, mute) {
      vol = Math.max(0, Math.min(1, v));
      muted = !!mute;
      if (master) master.gain.value = muted ? 0 : vol;
    }

    /** Gain and pan for a sound at (x, y, z); null when too far to hear. */
    function place(x, y, z, reach) {
      if (x == null) return { g: 1, pan: 0 };
      const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, y - listener.y, dz);
      const R = reach || 60;
      if (d > R) return null;
      const g = Math.min(1, Math.pow(6 / Math.max(6, d), 1.1)) * (1 - d / R * 0.5);
      const a = Math.atan2(dx, -dz) - listener.yaw;
      return { g: g, pan: Math.max(-0.9, Math.min(0.9, Math.sin(a))) };
    }

    function out(pan) {
      if (!ctx) return null;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan || 0;
        p.connect(master);
        return p;
      }
      return master;
    }

    /** A burst of filtered noise. */
    function burst(t0, len, f, q, gain, dest, type, sweepTo) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const flt = ctx.createBiquadFilter();
      flt.type = type || 'bandpass';
      flt.frequency.setValueAtTime(f, t0);
      if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + len);
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(flt); flt.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 0.5, len + 0.05);
    }

    /** A tone: sine, square, saw or triangle, gliding from f0 to f1. */
    function tone(t0, len, f0, f1, gain, dest, type) {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g); g.connect(dest);
      o.start(t0); o.stop(t0 + len + 0.02);
    }

    const api = {
      init: init,
      setVolume: setVolume,
      get ready() { return !!ctx; },
      listen(x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; },

      shot(kind, quiet, x, y, z, mine) {
        if (!ctx || muted) return;
        const p = mine ? { g: 1, pan: 0.08 } : place(x, y, z, quiet ? 18 : 110);
        if (!p) return;
        const t0 = ctx.currentTime, d = out(p.pan), s = GUN[kind] || GUN.rifle;
        const g = s.g * p.g * (mine ? 1 : 0.8);
        if (quiet) {
          burst(t0, 0.07, 1100, 0.7, g * 0.35, d, 'lowpass');
          tone(t0, 0.06, 180, 70, g * 0.3, d);
          return;
        }
        burst(t0, s.len, s.f, s.q, g, d, 'bandpass', s.f * 0.45);
        burst(t0, s.len * 0.5, 5200, 0.6, g * 0.35, d, 'highpass');
        tone(t0, s.len * 0.8, s.thump, s.thump * 0.4, g * s.tg, d);
        if (kind === 'sniper' || kind === 'shotgun' || kind === 'magnum') burst(t0 + 0.03, s.len * 1.6, 500, 0.5, g * 0.25, d, 'lowpass', 120);
      },
      knife(x, y, z, mine) {
        if (!ctx || muted) return;
        const p = mine ? { g: 1, pan: 0 } : place(x, y, z, 20);
        if (!p) return;
        burst(ctx.currentTime, 0.16, 1800, 1.5, 0.35 * p.g, out(p.pan), 'bandpass', 5200);
      },
      reload(mine, x, y, z, shell) {
        if (!ctx || muted) return;
        const p = mine ? { g: 1, pan: 0.1 } : place(x, y, z, 14);
        if (!p) return;
        const t0 = ctx.currentTime, d = out(p.pan);
        if (shell) { burst(t0, 0.05, 3000, 2, 0.25 * p.g, d); tone(t0, 0.05, 420, 380, 0.08 * p.g, d, 'square'); return; }
        burst(t0 + 0.05, 0.05, 2600, 3, 0.25 * p.g, d);
        burst(t0 + 0.55, 0.06, 1800, 3, 0.3 * p.g, d);
        tone(t0 + 0.55, 0.06, 260, 200, 0.12 * p.g, d, 'square');
      },
      shell() {
        if (!ctx || muted) return;
        const t0 = ctx.currentTime, d = out(0.1);
        burst(t0, 0.04, 3200, 2, 0.25, d);
        burst(t0 + 0.09, 0.05, 2200, 2, 0.25, d);
      },
      dry() { if (!ctx || muted) return; burst(ctx.currentTime, 0.03, 4200, 4, 0.25, out(0.1)); },
      swap() { if (!ctx || muted) return; burst(ctx.currentTime, 0.05, 2400, 2, 0.15, out(0.1)); },
      hit(head, kill) {
        if (!ctx || muted) return;
        const t0 = ctx.currentTime, d = out(0);
        if (kill) { tone(t0, 0.09, 1250, 1250, 0.18, d, 'triangle'); tone(t0 + 0.07, 0.14, 1870, 1870, 0.18, d, 'triangle'); return; }
        if (head) { tone(t0, 0.16, 2600, 2400, 0.2, d); tone(t0, 0.12, 3900, 3700, 0.08, d); return; }
        burst(t0, 0.03, 3400, 3, 0.25, d, 'bandpass');
      },
      hurt() {
        if (!ctx || muted) return;
        const t0 = ctx.currentTime, d = out(0);
        tone(t0, 0.18, 110, 55, 0.35, d);
        burst(t0, 0.12, 500, 0.8, 0.2, d, 'lowpass');
      },
      step(x, y, z, mine, soft) {
        if (!ctx || muted) return;
        const p = mine ? { g: 0.5, pan: 0 } : place(x, y, z, soft ? 7 : 16);
        if (!p) return;
        burst(ctx.currentTime, 0.06, 600 + Math.random() * 300, 1, 0.18 * p.g, out(p.pan), 'lowpass');
      },
      land(mine) { if (!ctx || muted) return; const d = out(0); tone(ctx.currentTime, 0.12, 90, 50, mine ? 0.3 : 0.12, d); burst(ctx.currentTime, 0.08, 400, 1, 0.15, d, 'lowpass'); },
      bounce(x, y, z) {
        if (!ctx || muted) return;
        const p = place(x, y, z, 25);
        if (!p) return;
        tone(ctx.currentTime, 0.07, 1300 + Math.random() * 300, 900, 0.2 * p.g, out(p.pan), 'triangle');
      },
      boom(x, y, z, big) {
        if (!ctx || muted) return;
        const p = place(x, y, z, 160);
        if (!p) return;
        const t0 = ctx.currentTime, d = out(p.pan), g = Math.min(1, p.g * 2.2) * (big ? 1.2 : 1);
        burst(t0, big ? 2.2 : 1.4, 1400, 0.5, g * 0.9, d, 'lowpass', 90);
        tone(t0, big ? 1.4 : 0.9, 70, 30, g * 0.9, d);
        burst(t0, 0.2, 3000, 0.6, g * 0.3, d, 'highpass');
      },
      beep(f, len, g) { if (!ctx || muted) return; tone(ctx.currentTime, len || 0.1, f, f, g || 0.18, out(0), 'square'); },
      chime(up) {
        if (!ctx || muted) return;
        const t0 = ctx.currentTime, d = out(0);
        const notes = up ? [660, 880, 1320] : [880, 660, 440];
        notes.forEach((f, i) => tone(t0 + i * 0.09, 0.22, f, f, 0.14, d, 'triangle'));
      },
      horn(good) {
        if (!ctx || muted) return;
        const t0 = ctx.currentTime, d = out(0);
        const base = good ? 330 : 220;
        [1, 1.25, 1.5].forEach(k => tone(t0, 0.9, base * k, base * k, 0.07, d, 'sawtooth'));
      },
      click() { if (!ctx || muted) return; tone(ctx.currentTime, 0.04, 1500, 1200, 0.1, out(0), 'triangle'); },
      heal() { if (!ctx || muted) return; const t0 = ctx.currentTime, d = out(0); tone(t0, 0.5, 400, 800, 0.08, d, 'sine'); },
      destroy() { if (ctx) { try { ctx.close(); } catch (e) { /* closing a context twice throws */ } } ctx = null; }
    };
    return api;
  };

  /** Which sound a gun makes, from its catalogue entry. */
  PV.FpsAudio.kindOf = function (w) {
    if (!w) return 'rifle';
    return w.snd === 'knife' ? 'knife' : (GUN[w.snd] ? w.snd : 'rifle');
  };

})(window.PV);
