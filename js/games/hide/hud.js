/* 变色躲猫猫 / Blend In — the HUD.

   What is drawn on the glass, on the loop harness's own 2D canvas over the
   WebGL one, where the reference puts it: the countdown banner while the
   hiders hide, the three counters — hiders left, time left, hunters — once
   the hunt is on, the crosshair and the water tank for a seeker, names over
   heads, who found whom, and short notes ("Filled!", "Position locked").
   The panels you click (paint, poses, the menu, the lobby, the table at the
   end) are DOM, in ui.js.

   It reads the game and the view's state and writes nothing back. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const FONT = '"Nunito", "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif';
  const HZ = PV.HideData.HZ;

  function font(c, px, w) { c.font = (w || 800) + ' ' + px.toFixed(1) + 'px ' + FONT; }
  function text(c, s, x, y, px, col, align, edge, w) {
    font(c, px, w);
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    if (edge !== false) {
      c.lineJoin = 'round';
      c.lineWidth = Math.max(2, px * 0.2);
      c.strokeStyle = edge || 'rgba(0,0,0,0.7)';
      c.strokeText(s, x, y);
    }
    c.fillStyle = col;
    c.fillText(s, x, y);
  }
  function rr(c, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + q, y);
    c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q);
    c.closePath();
  }
  /** A chunky pill with a dark rim, the reference's look. */
  function pill(c, x, y, w, h, fill, rim) {
    c.fillStyle = 'rgba(0,0,0,0.55)';
    rr(c, x, y + h * 0.08, w, h, h * 0.28); c.fill();
    c.fillStyle = fill;
    rr(c, x, y, w, h, h * 0.28); c.fill();
    c.lineWidth = Math.max(2, h * 0.06);
    c.strokeStyle = rim || 'rgba(0,0,0,0.85)';
    c.stroke();
  }
  const secs = ticks => Math.max(0, Math.ceil(ticks / HZ));

  function counters(c, game, W, u) {
    const hiders = game.left(), hunters = game.seekers().length;
    const w = u * 11, h = u * 7.4, gap = u * 1.4, y = u * 1.6;
    const x0 = W / 2 - w * 1.5 - gap;
    const cells = [
      [t('hide.hud.hiders'), String(hiders), '#2F63C9'],
      [t('hide.hud.time'), secs(game.clock) + 's', game.clock < 10 * HZ ? '#E0B03A' : '#A7ADB6'],
      [t('hide.hud.hunters'), String(hunters), '#C9373A']
    ];
    cells.forEach((cl, i) => {
      const x = x0 + i * (w + gap);
      pill(c, x, y, w, h, cl[2]);
      text(c, cl[0], x + w / 2, y + h * 0.3, u * 1.55, '#fff', 'center', 'rgba(0,0,0,0.5)');
      text(c, cl[1], x + w / 2, y + h * 0.66, u * 2.9, '#fff', 'center');
    });
  }

  function banner(c, game, W, u, st) {
    const me = game.me;
    const seeker = me.role === 'seeker';
    const w = Math.min(W - u * 4, u * 40), h = u * 8.6, x = W / 2 - w / 2, y = u * 1.6;
    pill(c, x, y, w, h, 'rgba(70,64,120,0.92)', 'rgba(20,18,40,0.9)');
    text(c, seeker ? '👀 ' + t('hide.hud.youSeek') : '🎨 ' + t('hide.hud.hideNow'), W / 2, y + h * 0.36, u * 2.4, '#fff', 'center');
    font(c, u * 1.7, 700);
    const s1 = t('hide.hud.huntIn') + ' ';
    const n = secs(game.clock) + 's';
    const w1 = c.measureText(s1).width;
    font(c, u * 1.9, 900);
    const w2 = c.measureText(n).width;
    const sx = W / 2 - (w1 + w2) / 2;
    text(c, s1, sx, y + h * 0.72, u * 1.7, '#E8E4FF', 'left', false, 700);
    text(c, n, sx + w1, y + h * 0.72, u * 1.9, '#FFD24A', 'left', false, 900);
    if (seeker) toastAt(c, W / 2, st.H - Math.max(u * 15, 104), '👀 ' + t('hide.hud.warmUp'), u);
  }

  function toastAt(c, x, y, s, u, col) {
    font(c, u * 1.7, 800);
    const w = c.measureText(s).width + u * 4, h = u * 4.2;
    pill(c, x - w / 2, y - h / 2, w, h, col || 'rgba(28,30,40,0.92)', 'rgba(255,255,255,0.18)');
    text(c, s, x, y, u * 1.7, '#fff', 'center', false);
  }

  function crosshair(c, W, H, u, st) {
    const x = W / 2, y = H / 2, s = u * 1.1;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = u * 0.55;
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = u * 0.28;
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke();
    if (st.hitT > 0) {
      const k = st.hitT / 0.3, r = u * (1.6 + (1 - k) * 0.8);
      c.strokeStyle = 'rgba(120,200,255,' + k + ')'; c.lineWidth = u * 0.35;
      for (const a of [0.785, 2.356, 3.927, 5.498]) { c.beginPath(); c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(x + Math.cos(a) * (r + u), y + Math.sin(a) * (r + u)); c.stroke(); }
    }
  }

  function tank(c, W, H, u, me, R) {
    const w = u * 2.2, h = u * 12, x = W - u * 4.5, y = H - h - u * 3;
    c.fillStyle = 'rgba(0,0,0,0.45)'; rr(c, x - u * 0.4, y - u * 0.4, w + u * 0.8, h + u * 0.8, u * 0.8); c.fill();
    const k = me.tank / R.tank;
    const g = c.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, '#2F7FE0'); g.addColorStop(1, '#8FD3FF');
    c.fillStyle = g; rr(c, x, y + h * (1 - k), w, h * k, u * 0.5); c.fill();
    text(c, '💧', x + w / 2, y - u * 1.6, u * 1.8, '#fff', 'center', false);
  }

  function tags(c, game, st, u) {
    const me = game.me;
    const showAll = game.phase === 'lobby' || game.phase === 'intro' || game.phase === 'result' || me.found || me.role === 'seeker' && game.phase === 'hide';
    for (const a of game.actors) {
      if (a === me || a.found) continue;
      const seeker = a.role === 'seeker';
      if (!showAll && !seeker) continue;
      if (game.phase === 'hide' && me.role === 'hider' && seeker) continue;
      if (!st.visible(a)) continue;
      const p = st.project(a.x, a.y + (a.climb ? 2.0 : 2.05), a.z);
      if (!p || p.d > 30) continue;
      const px = Math.max(u * 0.9, u * 1.5 * Math.min(1, 8 / p.d));
      font(c, px, 800);
      const w = c.measureText(a.name).width + px * 1.2;
      c.fillStyle = seeker ? 'rgba(170,30,34,0.8)' : 'rgba(20,24,32,0.7)';
      rr(c, p.x - w / 2, p.y - px * 0.8, w, px * 1.6, px * 0.8); c.fill();
      text(c, a.name, p.x, p.y, px, '#fff', 'center', false);
    }
  }

  function feed(c, W, u, list) {
    let y = u * 11;
    for (const f of list) {
      const a = Math.min(1, (4.5 - f.age) * 2);
      if (a <= 0) continue;
      c.globalAlpha = a;
      font(c, u * 1.5, 800);
      const w = c.measureText(f.text).width + u * 2.4;
      c.fillStyle = f.mine ? 'rgba(47,99,201,0.9)' : 'rgba(20,24,32,0.72)';
      rr(c, W - w - u * 1.4, y - u * 1.4, w, u * 2.8, u * 1.4); c.fill();
      text(c, f.text, W - u * 1.4 - w / 2, y, u * 1.5, '#fff', 'center', false);
      c.globalAlpha = 1;
      y += u * 3.4;
    }
  }

  /** Water on the screen: a hider being hosed sees it. */
  function wet(c, W, H, k) {
    if (k <= 0) return;
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(60,140,255,0)');
    g.addColorStop(1, 'rgba(60,140,255,' + (0.45 * k).toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  /**
   * Draw it all. `st` is the view's frame state: project, visible, the
   * feed, the toast, what the brush is over, the prompt.
   */
  function draw(c, game, geom, st) {
    const W = geom.w, H = geom.h, u = Math.max(4.2, Math.min(W, H * 1.6) / 100);
    st.H = H;
    const me = game.me;
    if (st.shade) { c.fillStyle = 'rgba(8,10,16,' + st.shade + ')'; c.fillRect(0, 0, W, H); }
    wet(c, W, H, me.role === 'hider' && !me.found ? Math.min(1, me.soak * 1.3) : 0);
    tags(c, game, st, u);

    if (game.phase === 'hide') banner(c, game, W, u, st);
    else if (game.phase === 'hunt' || game.phase === 'result') counters(c, game, W, u);

    const seeking = me.role === 'seeker' && !me.found && game.phase !== 'intro' && game.phase !== 'result' && game.phase !== 'lobby';
    if (seeking && !st.freecam) { crosshair(c, W, H, u, st); tank(c, W, H, u, me, PV.HideData.RULES); }

    // The brush, over the body; the dropper, over anything.
    if (st.brush) {
      const b = st.brush;
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.beginPath(); c.arc(b.x, b.y, Math.max(3, b.r), 0, Math.PI * 2); c.stroke();
      c.strokeStyle = b.col;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(b.x, b.y, Math.max(3, b.r) + 1.5, 0, Math.PI * 2); c.stroke();
    }
    if (st.dropper) text(c, '💧', st.dropper.x + u * 1.2, st.dropper.y - u * 1.2, u * 2.2, '#fff', 'center', false);

    feed(c, W, u, st.feed);
    if (st.toast) toastAt(c, W / 2, H - Math.max(u * 15, 104) - (game.phase === 'hide' && me.role === 'seeker' ? u * 5 : 0), st.toast.text, u, st.toast.col);
    if (me.found && game.phase === 'hunt') {
      toastAt(c, W / 2, u * 13, '💦 ' + t('hide.hud.youFound', { name: st.foundBy || '' }), u, 'rgba(201,55,58,0.92)');
      text(c, t('hide.hud.spectate'), W / 2, u * 17.5, u * 1.4, '#fff', 'center');
    }
    if (me.lock && !me.found && game.phase !== 'result') text(c, '🔒 ' + t('hide.hud.locked'), u * 2, H - u * 3, u * 1.5, '#FFE27A', 'left');
    if (st.freecam) text(c, '🎥 ' + t('hide.hud.freecam'), u * 2, u * 3, u * 1.6, '#fff', 'left');
    if (st.prompt) toastAt(c, W / 2, H / 2 + u * 7, st.prompt, u, 'rgba(47,99,201,0.92)');
  }

  PV.HideHud = { draw: draw, text: text, rr: rr, pill: pill };

})(window.PV);
