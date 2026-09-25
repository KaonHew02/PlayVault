/* 突击小队 / Strike Squad — the HUD.

   Everything drawn on the glass, on the loop harness's own 2D canvas over
   the WebGL one, where the reference puts it: the map top left, the score
   and the clock top middle, the kill feed top right, health bottom left,
   the gun and its rounds bottom right, the skills between them. Markers
   for the objectives float over the world with their distance, and pin to
   the edge of the screen when they are behind you.

   It reads the game and the view's own state and writes nothing back. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const FONT = '"Rajdhani", "Bahnschrift", "Segoe UI", system-ui, sans-serif';
  const TEAM = ['#4C8DF0', '#EC4B40'];
  const FOE = '#E58A3A';
  const D = PV.FpsData;

  function font(c, px, w) { c.font = (w || 700) + ' ' + px.toFixed(1) + 'px ' + FONT; }
  function text(c, s, x, y, px, col, align, edge, w) {
    font(c, px, w);
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    if (edge !== false) {
      c.lineJoin = 'round';
      c.lineWidth = Math.max(2, px * 0.18);
      c.strokeStyle = edge || 'rgba(0,0,0,0.65)';
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
  function panel(c, x, y, w, h, a) {
    c.fillStyle = 'rgba(12,16,22,' + (a == null ? 0.55 : a) + ')';
    rr(c, x, y, w, h, Math.min(8, h / 3));
    c.fill();
  }
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const colorOf = (game, a) => (game.teams ? TEAM[a.team] : (a === game.me ? TEAM[0] : FOE));

  /* ------------------------------------------------------------ minimap */

  const miniCache = Object.create(null);
  /** The map from above, one canvas per map, a few pixels a metre. */
  function miniMap(w) {
    if (miniCache[w.key]) return miniCache[w.key];
    const px = 4, c = document.createElement('canvas');
    c.width = w.W * px; c.height = w.D * px;
    const x = c.getContext('2d');
    x.fillStyle = '#39424c';
    x.fillRect(0, 0, c.width, c.height);
    const CELL = PV.FpsWorld.CELL;
    for (let z = 0; z < w.D; z++) {
      for (let i = 0; i < w.W; i++) {
        const ch = w.ch[z * w.W + i], def = CELL[ch];
        let col;
        if (!def) col = w.ground[z * w.W + i] === 1 ? '#4a535d' : '#434c56';
        else if (def.h >= 3) col = '#aab4bf';
        else if (def.tree) col = '#4f7a45';
        else col = def.h >= 2 ? '#8792a0' : '#65707c';
        x.fillStyle = col;
        x.fillRect(i * px, z * px, px, px);
      }
    }
    for (const r of w.roofs) {
      x.fillStyle = 'rgba(200,210,220,0.18)';
      x.fillRect(r[0] * px, r[1] * px, (r[2] - r[0]) * px, (r[3] - r[1]) * px);
    }
    miniCache[w.key] = { c: c, px: px };
    return miniCache[w.key];
  }

  function minimap(c, game, st, x0, y0, R) {
    const w = game.world, me = game.me, mm = miniMap(w);
    const cx = x0 + R, cy = y0 + R, scale = R / 22;     // 22 m to the edge
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.closePath();
    c.fillStyle = 'rgba(10,14,20,0.6)'; c.fill();
    c.clip();
    c.translate(cx, cy);
    c.rotate(-st.camYaw);
    c.globalAlpha = 0.85;
    c.drawImage(mm.c, -st.camX * scale, -st.camZ * scale, w.W * scale, w.D * scale);
    c.globalAlpha = 1;
    const dot = (x, z, col, r) => {
      c.fillStyle = col;
      c.beginPath(); c.arc((x - st.camX) * scale, (z - st.camZ) * scale, r, 0, TAU); c.fill();
    };
    const letter = (x, z, s, col) => {
      const px = (x - st.camX) * scale, pz = (z - st.camZ) * scale;
      c.save(); c.translate(px, pz); c.rotate(st.camYaw);
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, R * 0.11, 0, TAU); c.fill();
      text(c, s, 0, 1, R * 0.14, '#fff', 'center', false);
      c.restore();
    };
    for (const p of game.points) letter(p.x, p.z, 'ABC'[p.i], p.owner < 0 ? '#8a939c' : TEAM[p.owner]);
    for (const s of game.sites) letter(s.x, s.z, 'AB'[s.i], '#E0A030');
    for (const f of game.flags) dot(f.x, f.z, TEAM[f.team], R * 0.07);
    if (game.bomb && game.bomb.at !== 'carried' && game.bomb.at !== 'blown' && game.bomb.at !== 'defused') dot(game.bomb.x, game.bomb.z, '#ffcc33', R * 0.06);
    const radar = game.actors.some(a => a.alive && !game.enemy(me, a) && a.fx.radar > 0);
    for (const a of game.actors) {
      if (!a.alive || a === me) continue;
      if (!game.enemy(me, a)) { dot(a.x, a.z, TEAM[game.teams ? a.team : 0], R * 0.055); continue; }
      const loud = game.tick - a.noise < 60 && a.noiseR > 20;
      const seen = game.tick - a.spotted < 40 && st.teamSees(a);
      if (radar || loud || seen) dot(a.x, a.z, radar ? '#ff4d4d' : 'rgba(255,80,70,0.9)', R * 0.06);
    }
    c.restore();
    // You, always in the middle, always pointing up.
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(cx, cy - R * 0.09); c.lineTo(cx + R * 0.06, cy + R * 0.06); c.lineTo(cx, cy + R * 0.03); c.lineTo(cx - R * 0.06, cy + R * 0.06);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    text(c, 'N', cx + Math.sin(-st.camYaw) * (R - 7), cy - Math.cos(-st.camYaw) * (R - 7), R * 0.13, 'rgba(255,255,255,0.8)', 'center', false);
  }

  /* ------------------------------------------------------------- pieces */

  function crosshair(c, st, W, H, u) {
    if (st.hideCross) return;
    const cx = W / 2, cy = H / 2;
    const gap = Math.max(u * 0.7, st.spreadPx) + u * 0.4;
    const len = u * 1.3;
    c.lineCap = 'butt';
    for (const pass of [0, 1]) {
      c.strokeStyle = pass ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.55)';
      c.lineWidth = pass ? 2 : 4;
      c.beginPath();
      c.moveTo(cx - gap - len, cy); c.lineTo(cx - gap, cy);
      c.moveTo(cx + gap, cy); c.lineTo(cx + gap + len, cy);
      c.moveTo(cx, cy + gap); c.lineTo(cx, cy + gap + len);
      if (!st.melee) { c.moveTo(cx, cy - gap - len); c.lineTo(cx, cy - gap); }
      c.stroke();
    }
    c.fillStyle = '#fff';
    c.fillRect(cx - 1, cy - 1, 2, 2);
  }

  function hitMarker(c, st, W, H, u) {
    if (st.hitT <= 0) return;
    const k = st.hitT / 0.25, s = u * (1.2 + (1 - k) * 0.6), g = u * 0.6;
    c.strokeStyle = st.hitKill ? 'rgba(255,60,50,' + k + ')' : (st.hitHead ? 'rgba(255,210,80,' + k + ')' : 'rgba(255,255,255,' + k + ')');
    c.lineWidth = st.hitKill ? 3 : 2;
    const cx = W / 2, cy = H / 2;
    c.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.moveTo(cx + sx * g, cy + sy * g); c.lineTo(cx + sx * (g + s), cy + sy * (g + s)); }
    c.stroke();
  }

  function damageArcs(c, st, W, H, u) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.2;
    for (const d of st.hurts) {
      const k = Math.max(0, 1 - d.age / 1.1);
      if (k <= 0) continue;
      const a = d.dir - st.camYaw - Math.PI / 2;
      c.strokeStyle = 'rgba(235,50,40,' + (0.85 * k) + ')';
      c.lineWidth = u * 1.1;
      c.beginPath();
      c.arc(cx, cy, R, a - 0.28, a + 0.28);
      c.stroke();
    }
  }

  function vignette(c, W, H, hp) {
    if (hp > 45) return;
    const k = Math.min(1, (45 - hp) / 45);
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, 'rgba(160,0,0,' + (0.55 * k) + ')');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  function health(c, me, x, y, u) {
    const w = u * 30, h = u * 2.6;
    panel(c, x - u, y - u * 5.2, w + u * 2, u * 9.2);
    text(c, '✚', x + u * 1.2, y - u * 2.4, u * 3, '#fff', 'center');
    text(c, String(Math.ceil(me.hp)), x + u * 3.2, y - u * 2.2, u * 4.2, '#fff', 'left');
    c.fillStyle = 'rgba(255,255,255,0.15)';
    rr(c, x + u * 11, y - u * 3.5, w - u * 11, h, h / 2); c.fill();
    const hp = Math.max(0, me.hp / me.maxHp);
    c.fillStyle = hp > 0.5 ? '#58D26A' : hp > 0.25 ? '#F2C040' : '#F0503E';
    rr(c, x + u * 11, y - u * 3.5, Math.max(h, (w - u * 11) * hp), h, h / 2); c.fill();
    if (me.maxArmor > 0) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      rr(c, x + u * 11, y + u * 0.2, w - u * 11, h * 0.6, h * 0.3); c.fill();
      c.fillStyle = '#5DB8F5';
      rr(c, x + u * 11, y + u * 0.2, Math.max(0, (w - u * 11) * me.armor / me.maxArmor), h * 0.6, h * 0.3); c.fill();
      text(c, '⛨ ' + Math.ceil(me.armor), x + u * 1, y + u * 0.9, u * 2.1, '#9fd6ff', 'left');
    }
    if (me.fx.shield > 0) text(c, t('fps.skill.shield'), x + u * 11, y + u * 2.9, u * 1.8, '#9fd6ff', 'left');
  }

  function ammo(c, game, me, st, x, y, u) {
    const g = me.inv[me.cur];
    if (!g) return;
    const s = g.s, w = u * 34;
    panel(c, x - w, y - u * 7.5, w, u * 11.5);
    const ic = st.icon;
    if (ic) ic(c, g.id, x - w + u * 1.5, y - u * 6.8, u * 15, u * 5.5, { att: s.att, camo: g.camo });
    text(c, g.id.toUpperCase(), x - w + u * 1.5, y + u * 1.8, u * 2.1, 'rgba(255,255,255,0.85)', 'left');
    if (s.cat !== 'melee') {
      const low = g.mag <= Math.ceil(s.mag * 0.25);
      text(c, String(g.mag), x - u * 12, y - u * 3.2, u * 6.5, low ? '#F0503E' : '#fff', 'right');
      text(c, '/ ' + g.res, x - u * 11, y - u * 2.2, u * 3, 'rgba(255,255,255,0.7)', 'left');
      if (me.reloadT > 0) text(c, t('fps.reloading'), x - u * 7, y + u * 1.8, u * 2, '#F2C040', 'center');
      else if (g.mag === 0 && g.res > 0) text(c, t('fps.pressR'), x - u * 7, y + u * 1.8, u * 2, '#F2C040', 'center');
      else if (g.mag + g.res === 0) text(c, t('fps.noAmmo'), x - u * 7, y + u * 1.8, u * 2, '#F0503E', 'center');
    }
    // Grenades.
    for (let i = 0; i < D.NADES; i++) {
      c.fillStyle = i < me.nades ? '#9bb36a' : 'rgba(255,255,255,0.2)';
      c.beginPath(); c.arc(x - u * 2.2 - i * u * 2.6, y - u * 6, u * 0.9, 0, TAU); c.fill();
    }
    // Slots 1 2 3.
    for (let i = 0; i < 3; i++) {
      const has = !!me.inv[i];
      text(c, String(i + 1), x - w + u * 18 + i * u * 3.2, y - u * 5.6, u * 1.8, i === me.cur ? '#FFD35A' : (has ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'), 'center');
    }
  }

  function skills(c, me, st, cx, y, u) {
    const n = me.skills.length;
    if (!n) return;
    const s = u * 5.4, gap = u * 1.2, x0 = cx - (n * s + (n - 1) * gap) / 2;
    me.skills.forEach((sk, i) => {
      const x = x0 + i * (s + gap);
      const def = D.skill(sk.id);
      panel(c, x, y - s, s, s, 0.6);
      text(c, SKILL_ICON[sk.id] || '?', x + s / 2, y - s / 2, s * 0.5, '#fff', 'center', false);
      if (sk.cd > 0) {
        const k = sk.cd / (def.cd * 60);
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.beginPath(); c.moveTo(x + s / 2, y - s / 2);
        c.arc(x + s / 2, y - s / 2, s * 0.7, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.closePath();
        c.save(); rr(c, x, y - s, s, s, 6); c.clip(); c.fill(); c.restore();
        text(c, String(Math.ceil(sk.cd / 60)), x + s / 2, y - s / 2, s * 0.36, '#fff', 'center');
      }
      const on = me.fx[sk.id === 'medkit' ? 'heal' : sk.id] > 0;
      if (on) { c.strokeStyle = '#6FE3A0'; c.lineWidth = 2; rr(c, x, y - s, s, s, 6); c.stroke(); }
      if (!st.touch) text(c, String(4 + i), x + s * 0.18, y - s * 0.82, s * 0.24, '#FFD35A', 'center');
    });
  }
  const SKILL_ICON = { medkit: '✚', stim: '⚡', radar: '◎', shield: '⛨' };

  function killFeed(c, game, st, xr, y, u) {
    let row = 0;
    for (const k of st.feed) {
      if (k.age > 6) continue;
      const a = game.actors[k.a], v = game.actors[k.v];
      if (!v) continue;
      const h = u * 3.2, yy = y + row * (h + u * 0.6);
      font(c, u * 2, 700);
      const an = a && a !== v ? a.name : '', vn = v.name;
      const aw = c.measureText(an).width, vw = c.measureText(vn).width;
      const iw = u * 7.5 + (k.head ? u * 2.4 : 0);
      const w = aw + vw + iw + u * 3;
      const x = xr - w;
      const mine = (a === game.me || v === game.me);
      panel(c, x, yy, w, h, mine ? 0.75 : 0.5);
      if (mine) { c.strokeStyle = 'rgba(255,211,90,0.8)'; c.lineWidth = 1.5; rr(c, x, yy, w, h, 6); c.stroke(); }
      let px = x + u;
      if (an) { text(c, an, px, yy + h / 2, u * 2, colorOf(game, a), 'left', false); px += aw + u * 0.5; }
      if (k.w === 'nade') text(c, '💥', px + u * 3, yy + h / 2, u * 2.2, '#fff', 'center', false);
      else if (k.w === 'bomb') text(c, '💣', px + u * 3, yy + h / 2, u * 2.2, '#fff', 'center', false);
      else if (st.icon && D.W[k.w]) st.icon(c, k.w, px, yy + u * 0.4, u * 6.5, h - u * 0.8, null, '#e8ecf0');
      px += u * 7;
      if (k.head) { text(c, '⌖', px + u, yy + h / 2, u * 2.2, '#FFD35A', 'center', false); px += u * 2.4; }
      text(c, vn, px + u * 0.3, yy + h / 2, u * 2, colorOf(game, v), 'left', false);
      row++;
    }
  }

  /** The score and the clock, top middle, shaped by the mode. */
  function topPanel(c, game, st, W, u) {
    const cx = W / 2, y = u * 2;
    const m = game.modeKey, me = game.me;
    const time = mmss(game.timeLeft);
    if (game.teams) {
      const mine = me.team, s = game.teamScore;
      const bw = u * 11, h = u * 5;
      panel(c, cx - bw * 1.5 - u, y, bw * 3 + u * 2, h + (m === 'snd' || m === 'elim' ? u * 2.6 : 0));
      c.fillStyle = TEAM[mine]; rr(c, cx - bw * 1.5, y + u * 0.5, bw, h - u, 5); c.fill();
      c.fillStyle = TEAM[1 - mine]; rr(c, cx + bw * 0.5, y + u * 0.5, bw, h - u, 5); c.fill();
      text(c, String(s[mine]), cx - bw, y + h / 2, u * 3.6, '#fff', 'center');
      text(c, String(s[1 - mine]), cx + bw, y + h / 2, u * 3.6, '#fff', 'center');
      text(c, time, cx, y + h / 2 - u * 0.4, u * 3, game.timeLeft <= 30 ? '#F0503E' : '#fff', 'center');
      const lim = game.rules.rounds ? t('fps.firstTo', { n: game.rules.limit }) : String(game.rules.limit);
      text(c, lim, cx, y + h - u * 0.5, u * 1.5, 'rgba(255,255,255,0.65)', 'center', false);
      if (m === 'snd' || m === 'elim') {
        const alive = [0, 0], total = [0, 0];
        for (const a of game.actors) { total[a.team]++; if (a.alive) alive[a.team]++; }
        for (const side of [0, 1]) {
          const team = side ? 1 - mine : mine;
          for (let i = 0; i < total[team]; i++) {
            c.fillStyle = i < alive[team] ? TEAM[team] : 'rgba(255,255,255,0.18)';
            const px = side ? cx + bw * 0.6 + i * u * 2 : cx - bw * 0.6 - i * u * 2;
            rr(c, px - u * 0.7, y + h + u * 0.6, u * 1.4, u * 1.6, 3); c.fill();
          }
        }
        if (m === 'snd') {
          const atk = game.attack === mine;
          text(c, t(atk ? 'fps.attack' : 'fps.defend'), cx, y + h + u * 1.5, u * 1.6, '#FFD35A', 'center');
        }
      }
      if (m === 'dom') {
        game.points.forEach((p, i) => {
          const px = cx + (i - 1) * u * 5.4, py = y + h + u * 3.2, r = u * 2;
          c.fillStyle = 'rgba(12,16,22,0.7)'; c.beginPath(); c.arc(px, py, r + 2, 0, TAU); c.fill();
          if (p.owner >= 0) { c.fillStyle = TEAM[p.owner]; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); }
          if (p.cap >= 0 && p.pct < 1 && p.pct > 0) {
            c.strokeStyle = TEAM[p.cap]; c.lineWidth = u * 0.5;
            c.beginPath(); c.arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + TAU * p.pct); c.stroke();
          }
          text(c, 'ABC'[i], px, py + 1, u * 2.2, '#fff', 'center');
        });
      }
      if (m === 'ctf') {
        game.flags.forEach((f, i) => {
          const px = cx + (i === mine ? -1 : 1) * u * 5, py = y + h + u * 3;
          const st2 = f.at === 'home' ? '⚑' : f.at === 'carried' ? '⚐' : '!';
          text(c, st2, px, py, u * 3, TEAM[f.team], 'center');
        });
      }
    } else {
      const rank = game.standings(), place = rank.indexOf(me) + 1, lead = rank[0];
      panel(c, cx - u * 17, y, u * 34, u * 5);
      text(c, time, cx, y + u * 2.5, u * 3, game.timeLeft <= 30 ? '#F0503E' : '#fff', 'center');
      if (m === 'gun') {
        const rung = D.LADDER[Math.min(me.gun, D.LADDER.length - 1)];
        text(c, t('fps.rung', { n: me.gun + 1, of: D.LADDER.length }), cx - u * 15.5, y + u * 2.5, u * 2, '#FFD35A', 'left');
        text(c, rung.toUpperCase(), cx + u * 15.5, y + u * 2.5, u * 2, '#fff', 'right');
      } else {
        text(c, '#' + place + ' · ' + me.stats.k + '/' + game.rules.limit, cx - u * 15.5, y + u * 2.5, u * 2.2, '#FFD35A', 'left');
        text(c, (lead === me ? t('fps.leading') : lead.name + ' ' + lead.stats.k), cx + u * 15.5, y + u * 2.5, u * 2, '#fff', 'right');
      }
    }
  }

  /** Objective markers over the world, pinned to the edge when off screen. */
  function markers(c, game, st, W, H, u) {
    const me = game.me;
    const mark = (x, y, z, label, col, sub) => {
      let p = st.project(x, y, z);
      const m = u * 4;
      let edge = false;
      if (!p || p.x < m || p.x > W - m || p.y < m || p.y > H - m) {
        // Off screen: point at it from the rim of a circle round the middle.
        const a = Math.atan2(x - st.camX, -(z - st.camZ)) - st.camYaw;
        p = { x: W / 2 + Math.sin(a) * W * 0.42, y: H / 2 - Math.cos(a) * H * 0.4 };
        edge = true;
      }
      c.fillStyle = col;
      c.beginPath(); c.arc(p.x, p.y, u * 1.8, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.stroke();
      text(c, label, p.x, p.y + 1, u * 2, '#fff', 'center', false);
      const d = Math.round(Math.hypot(x - me.x, z - me.z));
      if (!edge) text(c, (sub ? sub + ' ' : '') + d + 'm', p.x, p.y + u * 3, u * 1.5, '#fff', 'center');
    };
    for (const p of game.points) mark(p.x, p.y + 2.2, p.z, 'ABC'[p.i], p.owner < 0 ? 'rgba(120,128,138,0.85)' : TEAM[p.owner]);
    if (game.modeKey === 'snd') {
      const atk = game.attack === me.team, B = game.bomb;
      for (const s of game.sites) if (!(B && B.at === 'planted' && B.site !== s.i)) mark(s.x, s.y + 2, s.z, 'AB'[s.i], '#D88A1E', atk ? t('fps.plant') : t('fps.defend'));
      if (B && (B.at === 'dropped' || B.at === 'planted')) mark(B.x, B.y + 1, B.z, '💣', B.at === 'planted' ? '#F0503E' : '#E0A030', B.at === 'planted' ? mmss(Math.ceil(B.t / 60)) : '');
    }
    for (const f of game.flags) {
      if (f.at === 'carried' && f.carrier === me.id) continue;
      const own = f.team === me.team;
      mark(f.x, f.y + 2.8, f.z, '⚑', TEAM[f.team], f.at === 'home' ? (own ? t('fps.defend') : t('fps.take')) : f.at === 'dropped' ? (own ? t('fps.return') : t('fps.take')) : (own ? t('fps.kill') : t('fps.escort')));
    }
    if (me.carry >= 0) {
      const own = game.flags[me.team];
      mark(own.hx, own.hy + 2.5, own.hz, '⌂', TEAM[me.team], t('fps.capture'));
    }
    // Team mates' names over their heads, when in sight.
    for (const a of game.actors) {
      if (a === me || !a.alive || game.enemy(me, a)) continue;
      const p = st.project(a.x, a.y + a.h + 0.35, a.z);
      if (!p || !st.visible(a)) continue;
      const d = Math.hypot(a.x - me.x, a.z - me.z);
      if (d > 45) continue;
      text(c, a.name, p.x, p.y, Math.max(u * 1.4, u * 2.2 - d * 0.02), TEAM[game.teams ? a.team : 0], 'center');
    }
    // An enemy under the crosshair: its name.
    if (st.aimed) {
      const a = st.aimed, p = st.project(a.x, a.y + a.h + 0.35, a.z);
      if (p) text(c, a.name, p.x, p.y, u * 2, '#FF6A5A', 'center');
    }
  }

  function prompts(c, game, st, W, H, u) {
    const me = game.me;
    const lines = [];
    let bar = -1, barCol = '#FFD35A';
    if (game.modeKey === 'snd' && me.alive) {
      const B = game.bomb;
      if (me.hasBomb && game.sites.some(s => Math.hypot(me.x - s.x, me.z - s.z) <= PV.FpsGame.SITE_R)) {
        lines.push(t('fps.holdPlant', { key: st.touch ? '⬇' : 'E' }));
        if (me.plantT > 0) bar = me.plantT / PV.FpsGame.PLANT_T;
      }
      if (B && B.at === 'planted' && me.team !== game.attack && Math.hypot(me.x - B.x, me.z - B.z) < 2.2) {
        lines.push(t('fps.holdDefuse', { key: st.touch ? '⬇' : 'E' }));
        if (me.defuseT > 0) { bar = me.defuseT / PV.FpsGame.DEFUSE_T; barCol = '#5DB8F5'; }
      }
    }
    if (me.alive && st.nearDrop) lines.push(t('fps.pickUp', { key: st.touch ? '⟳' : 'G', gun: st.nearDrop.toUpperCase() }));
    if (game.modeKey === 'dom' && me.alive) {
      const p = game.points.find(q => Math.hypot(q.x - me.x, q.z - me.z) <= PV.FpsGame.CAP_R && Math.abs(q.y - me.y) < 2.5);
      if (p && (p.owner !== me.team || p.pct < 1)) {
        const contested = p.who[0] && p.who[1];
        lines.push(contested ? t('fps.contested') : t('fps.capturing', { p: 'ABC'[p.i] }));
        if (!contested && p.cap === me.team) bar = p.pct;
      }
    }
    lines.forEach((s, i) => text(c, s, W / 2, H * 0.68 + i * u * 3, u * 2.4, '#fff', 'center'));
    if (bar >= 0) {
      const w = u * 26, x = W / 2 - w / 2, y = H * 0.68 + lines.length * u * 3;
      c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, x, y, w, u * 1.4, u * 0.7); c.fill();
      c.fillStyle = barCol; rr(c, x, y, Math.max(u * 1.4, w * bar), u * 1.4, u * 0.7); c.fill();
    }
  }

  function banners(c, game, st, W, H, u) {
    // Medals and points, in the middle, one after another.
    st.medals.forEach((m, i) => {
      const k = Math.min(1, m.age / 0.15), f = m.age > 1.7 ? Math.max(0, 1 - (m.age - 1.7) / 0.4) : 1;
      c.globalAlpha = f;
      const s = u * 3.4 * (1.4 - 0.4 * k);
      text(c, m.text, W / 2, H * 0.27 + i * u * 4.2, s, m.col || '#FFD35A', 'center', 'rgba(60,30,0,0.7)', 800);
      if (m.pts) text(c, '+' + m.pts, W / 2, H * 0.27 + i * u * 4.2 + s * 0.95, u * 2, '#fff', 'center');
      c.globalAlpha = 1;
    });
    for (const p of st.pops) {
      const k = p.age / 0.9;
      if (k >= 1) continue;
      c.globalAlpha = 1 - k;
      text(c, '+' + p.n, W / 2 + u * 5, H / 2 - u * 3 - k * u * 4, u * 2.4, '#FFD35A', 'left');
      c.globalAlpha = 1;
    }
    // The countdown, the round, the result.
    if (game.phase === 'count') {
      const n = Math.max(1, 3 - Math.floor(game.phaseT / 60));
      const r = game.rules.rounds ? t('fps.round', { n: game.round }) : t('fps.mode.' + game.modeKey);
      text(c, r, W / 2, H * 0.3, u * 3.4, '#fff', 'center');
      text(c, String(n), W / 2, H * 0.42, u * 11, '#FFD35A', 'center', 'rgba(60,30,0,0.7)', 800);
      if (game.modeKey === 'snd') text(c, t(game.attack === game.me.team ? 'fps.sndAttack' : 'fps.sndDefend'), W / 2, H * 0.55, u * 2.4, '#fff', 'center');
    } else if (game.phase === 'live' && game.phaseT < 50) {
      c.globalAlpha = 1 - game.phaseT / 50;
      text(c, t('fps.go'), W / 2, H * 0.42, u * 9, '#58D26A', 'center', 'rgba(0,40,10,0.7)', 800);
      c.globalAlpha = 1;
    } else if (game.phase === 'round' && st.lastRound) {
      const won = st.lastRound.w === game.me.team, draw = st.lastRound.w < 0;
      text(c, draw ? t('fps.roundDraw') : t(won ? 'fps.roundWon' : 'fps.roundLost'), W / 2, H * 0.36, u * 6, draw ? '#fff' : (won ? '#58D26A' : '#F0503E'), 'center', 'rgba(0,0,0,0.7)', 800);
      text(c, t('fps.why.' + st.lastRound.why), W / 2, H * 0.45, u * 2.4, '#fff', 'center');
    } else if (game.phase === 'end') {
      const r = game.result;
      text(c, t(r === 'win' ? 'fps.victory' : r === 'draw' ? 'fps.draw' : 'fps.defeat'), W / 2, H * 0.14, u * 7, r === 'win' ? '#FFD35A' : r === 'draw' ? '#fff' : '#F0503E', 'center', 'rgba(0,0,0,0.7)', 800);
    }
  }

  function deathScreen(c, game, st, W, H, u) {
    const me = game.me;
    if (me.alive || game.phase !== 'live') return;
    c.fillStyle = 'rgba(40,0,0,' + Math.min(0.35, me.deadT / 60) + ')';
    c.fillRect(0, 0, W, H);
    const k = game.actors[me.killer];
    const who = k && k !== me ? t('fps.killedBy', { name: k.name }) : t('fps.youDied');
    text(c, who, W / 2, H * 0.3, u * 4, '#fff', 'center');
    if (k && k !== me) {
      const g = k.inv[k.cur];
      if (g && st.icon) st.icon(c, g.id, W / 2 - u * 9, H * 0.34, u * 18, u * 6, { att: g.s.att, camo: g.camo });
      text(c, t('fps.theirHp', { n: Math.max(0, Math.ceil(k.hp)) }), W / 2, H * 0.44, u * 2, '#F2C040', 'center');
    }
    if (me.respawnT > 0) text(c, t('fps.respawnIn', { n: Math.ceil(me.respawnT / 60) }), W / 2, H * 0.52, u * 2.6, '#fff', 'center');
    else if (game.rules.rounds) text(c, t('fps.spectating'), W / 2, H * 0.52, u * 2.4, '#fff', 'center');
  }

  function scoreboard(c, game, W, H, u) {
    const rows = game.teams ? [0, 1].map(tm => game.actors.filter(a => a.team === tm).sort((p, q) => q.stats.score - p.stats.score)) : [game.standings()];
    const w = Math.min(W - u * 4, u * 90), x = (W - w) / 2;
    const rh = u * 3.2;
    const lines = rows.reduce((n, r) => n + r.length + 1.6, 0);
    const h = lines * rh + u * 3;
    let y = Math.max(u * 10, (H - h) / 2);
    panel(c, x, y, w, h, 0.82);
    y += u * 1.5;
    const cols = [0.06, 0.52, 0.64, 0.74, 0.84, 0.95];
    rows.forEach((list, ri) => {
      const col = game.teams ? TEAM[list[0] ? list[0].team : ri] : '#fff';
      const heads = [game.teams ? (list[0] && list[0].team === game.me.team ? t('fps.yourTeam') : t('fps.enemyTeam')) : t('fps.players'),
        t('fps.col.k'), t('fps.col.d'), t('fps.col.a'), game.modeKey === 'gun' ? t('fps.col.rung') : t('fps.col.score'), ''];
      heads.forEach((s, i) => text(c, s, x + w * cols[i], y + rh / 2, u * 1.8, i ? 'rgba(255,255,255,0.7)' : col, i ? 'right' : 'left', false));
      y += rh * 1.2;
      for (const a of list) {
        if (a === game.me) { c.fillStyle = 'rgba(255,211,90,0.15)'; c.fillRect(x + u, y, w - u * 2, rh); }
        const tone = a.alive ? '#fff' : 'rgba(255,255,255,0.45)';
        text(c, a.name + (a.carry >= 0 ? ' ⚑' : '') + (a.hasBomb ? ' 💣' : ''), x + w * cols[0], y + rh / 2, u * 2, a === game.me ? '#FFD35A' : tone, 'left', false);
        text(c, String(a.stats.k), x + w * cols[1], y + rh / 2, u * 2, tone, 'right', false);
        text(c, String(a.stats.d), x + w * cols[2], y + rh / 2, u * 2, tone, 'right', false);
        text(c, String(a.stats.a), x + w * cols[3], y + rh / 2, u * 2, tone, 'right', false);
        text(c, game.modeKey === 'gun' ? String(a.gun + 1) : PV.fmtNum(a.stats.score), x + w * cols[4], y + rh / 2, u * 2, tone, 'right', false);
        y += rh;
      }
      y += rh * 0.4;
    });
  }

  function scope(c, W, H, u, kind) {
    const r = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
    c.fillStyle = '#050607';
    c.beginPath();
    c.rect(0, 0, W, H);
    c.arc(cx, cy, r, 0, TAU, true);
    c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx - r, cy); c.lineTo(cx - u * 1.5, cy); c.moveTo(cx + u * 1.5, cy); c.lineTo(cx + r, cy);
    c.moveTo(cx, cy + u * 1.5); c.lineTo(cx, cy + r);
    if (kind === 'x8') { c.moveTo(cx, cy - r); c.lineTo(cx, cy - u * 1.5); }
    c.stroke();
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx - r * 0.55, cy); c.moveTo(cx + r * 0.55, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy + r * 0.55); c.lineTo(cx, cy + r); c.stroke();
    c.fillStyle = kind === 'x8' ? '#ff3b30' : '#111';
    c.beginPath(); c.arc(cx, cy, 2, 0, TAU); c.fill();
  }

  /** The touch buttons: returned as hit boxes for the view. */
  function touchPad(c, game, st, W, H, u) {
    const out = [];
    const me = game.me;
    const btn = (id, x, y, r, label, on) => {
      c.fillStyle = on ? 'rgba(255,211,90,0.45)' : 'rgba(12,16,22,0.45)';
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.stroke();
      text(c, label, x, y + 1, r * 0.62, '#fff', 'center', false);
      out.push({ id: id, x: x, y: y, r: r * 1.15 });
    };
    const R = u * 6.2;
    btn('fire', W - R * 2.2, H - R * 2.4, R * 1.25, '●', st.touchHeld.fire);
    btn('fire2', R * 5.4, H * 0.5, R * 0.8, '●', st.touchHeld.fire2);
    btn('ads', W - R * 4.6, H - R * 3.6, R * 0.8, '◎', st.touchHeld.ads);
    btn('jump', W - R * 1.1, H - R * 4.6, R * 0.75, '⤒');
    btn('crouch', W - R * 3.4, H - R * 0.95, R * 0.72, '⤓', me.crouching);
    btn('reload', W - R * 4.9, H - R * 1.6, R * 0.68, '↻');
    btn('swap', W - R * 1.1, H - R * 6.4, R * 0.66, '⇄');
    btn('nade', W - R * 2.9, H - R * 5.6, R * 0.66, '✹');
    btn('use', W - R * 5.4, H - R * 5.0, R * 0.66, '⬇', st.touchHeld.use);
    if (st.nearDrop) btn('pick', W / 2 + R * 2.6, H * 0.62, R * 0.66, '⟳');
    me.skills.forEach((s, i) => btn('skill' + i, W / 2 - R * 1.6 + i * R * 1.6, H - R * 3.2, R * 0.62, SKILL_ICON[s.id] || '?'));
    // The move stick, where the thumb put it.
    if (st.stick) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath(); c.arc(st.stick.x0, st.stick.y0, u * 9, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.beginPath(); c.arc(st.stick.x0 + st.stick.dx * u * 9, st.stick.y0 + st.stick.dy * u * 9, u * 4, 0, TAU); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.beginPath(); c.arc(u * 16, H - u * 16, u * 9, 0, TAU); c.fill();
    }
    btn('pause', W - u * 4, u * 4, u * 2.8, 'II');
    return out;
  }

  /* ------------------------------------------------------------ the lot */

  /**
   * Draw the HUD. `st` is the view's state for this frame: camera, icon
   * painter, projection, feed, medals, hits, spread in pixels and so on.
   * Returns the touch buttons, if any were drawn.
   */
  function draw(c, game, geom, st) {
    const W = geom.w, H = geom.h;
    const u = Math.min(W, H) / 100 * (H > W ? 1.25 : 1);
    const me = game.me;
    let pad = null;
    if (game.phase === 'lobby') return null;
    if (st.scoped) scope(c, W, H, u, st.scoped);
    if (me.alive) vignette(c, W, H, me.hp);
    markers(c, game, st, W, H, u);
    if (me.alive && game.phase !== 'end') {
      crosshair(c, st, W, H, u);
      hitMarker(c, st, W, H, u);
      damageArcs(c, st, W, H, u);
    }
    minimap(c, game, st, u * 2, u * 2, u * 12);
    topPanel(c, game, st, W, u);
    killFeed(c, game, st, W - u * 2, u * 2, u);
    if (me.alive) {
      health(c, me, u * 3, H - u * 4, u);
      ammo(c, game, me, st, W - u * 2, H - u * 4, u);
      if (!st.touch) skills(c, me, st, W / 2, H - u * 2.5, u);
    }
    prompts(c, game, st, W, H, u);
    deathScreen(c, game, st, W, H, u);
    banners(c, game, st, W, H, u);
    if (st.touch && me.alive && game.phase === 'live') pad = touchPad(c, game, st, W, H, u);
    if (st.board || game.phase === 'end') scoreboard(c, game, W, H, u);
    if (st.prompt) {
      panel(c, W / 2 - u * 22, H * 0.58 - u * 3, u * 44, u * 6, 0.7);
      text(c, st.prompt, W / 2, H * 0.58, u * 2.6, '#fff', 'center');
    }
    return pad;
  }

  PV.FpsHud = { draw: draw, text: text, panel: panel, rr: rr, TEAM: TEAM, miniMap: miniMap };

})(window.PV);
