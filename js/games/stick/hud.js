/* 火柴人对决 / Stick Clash — the heads-up display.

   Drawn on the same canvas as the fight, over it: two health bars that
   drain toward the middle with a pale trail showing what the last combo
   took, stamina under each (it flashes when a move is refused for want of
   it), the meter with its breaker notch at half and ULT when full, the
   round pips, the clock, the combo counter, and the big words — ROUND,
   FIGHT, K.O., PERFECT — that a fight is punctuated by.

   Sizes are in `u`, a unit that scales with the canvas, so the HUD is the
   same shape on a phone and a monitor. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => PV.t(k, p);
  const D = PV.StickData, A = PV.StickArt, R = D.RULES;
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  function unit(geom) { return Math.max(0.55, Math.min(1.4, geom.w / 960)); }

  function text(c, s, x, y, size, col, align, weight, stroke) {
    c.font = (weight || 800) + ' ' + size + 'px ' + FONT;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    if (stroke) { c.lineWidth = Math.max(2, size * 0.16); c.strokeStyle = stroke; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    c.fillStyle = col;
    c.fillText(s, x, y);
  }

  function nameOf(f) { return PV.I18n && PV.I18n.lang === 'zh' ? f.def.nameZh : f.def.name; }

  /**
   * st: { trail: [hp, hp], tired: [ticks, ticks], combo: [{n, dmg, t}], now }
   */
  function draw(c, g, geom, st) {
    const u = unit(geom), W = geom.w;
    const top = 12 * u, bh = 15 * u, pr = 21 * u;
    const bw = Math.max(60, W / 2 - 62 * u - 40 * u);
    g.f.forEach((f, i) => {
      const left = i === 0;
      const px = left ? 14 * u + pr : W - 14 * u - pr, py = top + pr;
      A.head(c, f.id, f.alt, px, py, pr * 0.62, left ? 1 : -1);
      const x0 = left ? px + pr + 8 * u : W - (px - (W - px)) + 0, bx = left ? x0 : W - 14 * u - 2 * pr - 8 * u - bw;
      const by = top + 12 * u;
      // Name, and who is who.
      const who = g.mode === 'two' ? (left ? 'P1' : 'P2') : (left ? t('common.you') : (g.mode === 'train' ? t('stick.dummy') : 'CPU'));
      text(c, nameOf(f).toUpperCase(), left ? bx : bx + bw, top + 3 * u, 12 * u, '#EAF0F7', left ? 'left' : 'right', 800, 'rgba(0,0,0,.6)');
      text(c, who, left ? bx + bw : bx, top + 3 * u, 10 * u, f.human ? '#F6B32B' : '#8494A8', left ? 'right' : 'left', 800, 'rgba(0,0,0,.6)');
      // Health.
      c.fillStyle = 'rgba(8,10,16,.85)';
      roundRect(c, bx - 2 * u, by - 2 * u, bw + 4 * u, bh + 4 * u, 4 * u); c.fill();
      c.fillStyle = '#3A1418'; c.fillRect(bx, by, bw, bh);
      const frac = Math.max(0, f.hp / f.hpMax), tr = Math.max(frac, st.trail[i] / f.hpMax);
      const fillX = (k) => (left ? bx + bw * (1 - k) : bx);
      c.fillStyle = '#F4F1EA';
      c.fillRect(left ? bx + bw * (1 - tr) : bx, by, bw * tr, bh);
      const hg = c.createLinearGradient(0, by, 0, by + bh);
      const hot = frac < 0.25;
      hg.addColorStop(0, hot ? '#FF6B5A' : '#FFE070'); hg.addColorStop(1, hot ? '#C8261E' : '#F2A21E');
      c.fillStyle = hg;
      c.fillRect(left ? bx + bw * (1 - frac) : bx, by, bw * frac, bh);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(bx, by, bw, bh * 0.35);
      void fillX;
      // Stamina.
      const sy = by + bh + 5 * u, sw = bw * 0.72, sx = left ? bx + bw - sw : bx;
      const tired = st.tired[i] > 0 && Math.floor(st.tired[i] / 4) % 2 === 0;
      c.fillStyle = 'rgba(8,10,16,.85)'; c.fillRect(sx - 1.5 * u, sy - 1.5 * u, sw + 3 * u, 6 * u + 3 * u);
      const sk = Math.max(0, f.sta / R.staMax);
      c.fillStyle = tired ? '#FF4B4B' : sk < 0.25 ? '#E0861E' : '#4CD37A';
      c.fillRect(left ? sx + sw * (1 - sk) : sx, sy, sw * sk, 6 * u);
      // Meter.
      const my = sy + 10 * u, mw = bw * 0.5, mx = left ? bx + bw - mw : bx;
      c.fillStyle = 'rgba(8,10,16,.85)'; c.fillRect(mx - 1.5 * u, my - 1.5 * u, mw + 3 * u, 8 * u + 3 * u);
      const mk = Math.max(0, Math.min(1, f.meter / R.meterMax));
      const full = mk >= 1;
      const mg = c.createLinearGradient(mx, 0, mx + mw, 0);
      mg.addColorStop(0, '#3A7BFF'); mg.addColorStop(1, full ? '#FFD34A' : '#7AB8FF');
      c.fillStyle = mg;
      if (full) { c.save(); c.shadowColor = '#FFD34A'; c.shadowBlur = (8 + Math.sin(st.now * 0.01) * 5) * u; }
      c.fillRect(left ? mx + mw * (1 - mk) : mx, my, mw * mk, 8 * u);
      if (full) c.restore();
      c.fillStyle = 'rgba(8,10,16,.9)'; c.fillRect(mx + mw / 2 - 1 * u, my, 2 * u, 8 * u);
      const label = full ? 'ULT ' + (g.mode === 'two' ? '' : '↓+K') : (f.meter >= R.breaker ? t('stick.hud.breaker') : '');
      if (label) text(c, label, left ? mx - 5 * u : mx + mw + 5 * u, my + 4 * u, 9.5 * u, full ? '#FFD34A' : '#9CC3FF', left ? 'right' : 'left', 900, 'rgba(0,0,0,.7)');
      // Rounds won.
      if (g.need) {
        for (let r = 0; r < g.need; r++) {
          const cx = left ? bx + bw - 7 * u - r * 15 * u : bx + 7 * u + r * 15 * u, cy = my + 18 * u;
          c.fillStyle = 'rgba(8,10,16,.9)'; c.beginPath(); c.arc(cx, cy, 5.5 * u, 0, Math.PI * 2); c.fill();
          c.fillStyle = r < g.wins[i] ? '#F6B32B' : '#2A3648';
          c.beginPath(); c.arc(cx, cy, 4 * u, 0, Math.PI * 2); c.fill();
        }
      }
      // Combo.
      const cb = st.combo[i];
      if (cb && cb.n >= 2 && cb.t > 0) {
        const a = Math.min(1, cb.t / 20);
        c.save(); c.globalAlpha = a;
        const cx = left ? 22 * u : W - 22 * u, cy = geom.h * 0.34, al = left ? 'left' : 'right';
        const pop = 1 + Math.max(0, cb.pop || 0) * 0.3;
        text(c, String(cb.n), cx, cy, 44 * u * pop, '#FFD34A', al, 900, 'rgba(0,0,0,.75)');
        text(c, t('stick.hud.hits'), cx, cy + 30 * u, 15 * u, '#FFFFFF', al, 900, 'rgba(0,0,0,.75)');
        text(c, Math.round(cb.dmg) + ' ' + t('stick.hud.dmg'), cx, cy + 48 * u, 11 * u, '#FFB0A0', al, 800, 'rgba(0,0,0,.75)');
        c.restore();
      }
    });
    // The clock.
    const cw = 50 * u, cx = W / 2;
    c.fillStyle = 'rgba(8,10,16,.85)';
    roundRect(c, cx - cw / 2, top, cw, 36 * u, 6 * u); c.fill();
    c.strokeStyle = '#2A3648'; c.lineWidth = 1.5 * u; c.stroke();
    const secs = g.mode === 'train' ? '∞' : String(Math.ceil(g.clock / D.HZ));
    text(c, secs, cx, top + 18 * u, 24 * u, g.clock > 0 && g.clock < 10 * D.HZ && g.mode !== 'train' ? '#FF6B5A' : '#EAF0F7', 'center', 900);
    if (g.mode !== 'train') text(c, t('stick.hud.round', { n: g.round }), cx, top + 46 * u, 10 * u, '#8494A8', 'center', 800, 'rgba(0,0,0,.6)');
  }

  /** The big words in the middle. b: { text, sub, t, col, life } */
  function banner(c, geom, b) {
    const u = unit(geom);
    const k = b.t / b.life;
    const inK = Math.min(1, b.t / 8), outK = Math.min(1, (b.life - b.t) / 10);
    const a = Math.min(inK, outK);
    if (a <= 0) return;
    const scale = 1 + (1 - inK) * 0.8 + (b.grow ? k * 0.15 : 0);
    c.save();
    c.globalAlpha = a;
    c.translate(geom.w / 2, geom.h * (b.y || 0.42));
    c.scale(scale, scale);
    if (b.band) {
      c.fillStyle = 'rgba(8,10,16,.55)';
      c.fillRect(-geom.w, -34 * u, geom.w * 2, 68 * u + (b.sub ? 22 * u : 0));
    }
    c.shadowColor = b.col || '#F6B32B'; c.shadowBlur = 24 * u;
    text(c, b.text, 0, 0, (b.size || 58) * u, b.col || '#FFE070', 'center', 900, 'rgba(8,10,16,.9)');
    c.shadowBlur = 0;
    if (b.sub) text(c, b.sub, 0, 40 * u, 16 * u, '#EAF0F7', 'center', 800, 'rgba(8,10,16,.9)');
    c.restore();
  }

  /** An ultimate's cut-in: a coloured band across the screen with its name. */
  function cutin(c, geom, ci) {
    const u = unit(geom);
    const k = ci.t / ci.life;
    const a = Math.min(1, ci.t / 5, (ci.life - ci.t) / 8);
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a * 0.55;
    c.fillStyle = '#000'; c.fillRect(0, 0, geom.w, geom.h);
    c.globalAlpha = a;
    const y = geom.h * 0.62, h = 58 * u;
    const slide = (1 - Math.min(1, ci.t / 8)) * geom.w * (ci.side ? 1 : -1);
    c.translate(slide, 0);
    c.fillStyle = ci.col;
    c.beginPath(); c.moveTo(0, y - h / 2 + 10 * u); c.lineTo(geom.w, y - h / 2 - 10 * u); c.lineTo(geom.w, y + h / 2 - 10 * u); c.lineTo(0, y + h / 2 + 10 * u); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 97 + ci.t * 26) % (geom.w + 200)) - 100;
      c.fillRect(ci.side ? geom.w - x : x, y - h / 2, 40 * u, 3 * u);
    }
    text(c, ci.name.toUpperCase(), geom.w / 2 + (ci.side ? -1 : 1) * k * 30 * u, y, 30 * u, '#FFFFFF', 'center', 900, 'rgba(8,10,16,.9)');
    text(c, ci.who.toUpperCase(), geom.w / 2, y - h / 2 - 12 * u, 12 * u, '#FFFFFF', 'center', 900, 'rgba(8,10,16,.9)');
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  PV.StickHud = { draw: draw, banner: banner, cutin: cutin, text: text, unit: unit, nameOf: nameOf };

})(window.PV);
