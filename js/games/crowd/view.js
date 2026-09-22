/* 人潮冲锋 / Crowd Rush — view.

   A runner drawn down one vanishing point. Everything the engine holds is a
   distance ahead and a position across a track two units wide; `depth()` maps
   that to a y and a scale, and every gate, saw, rival and stickman goes
   through the same two functions. That is what keeps a gate the crowd is
   about to hit lined up with the gate the engine is about to apply.

   The crowd is drawn as PEOPLE — up to a hundred and forty of them, each with
   a head, a body and legs that swing — because the number is the whole game
   and a bar labelled 128 is not a crowd of 128. Past that cap the drawn crowd
   stops growing and the figure above their heads carries it; a thousand
   stickmen at sixty frames a second buys nothing you can see.

   Formation offsets come from a hash of the unit's index, so a crowd keeps
   its shape from frame to frame instead of reshuffling itself every tick. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const TAU = Math.PI * 2;
  const CAP = 140;                 // most stickmen we ever draw
  const FAR = 42;                  // metres of track visible ahead

  const THEMES = {
    fields: {
      sky: ['#1A2E3E', '#2C5066'], ground: '#2B4F37', ground2: '#2F5A3E',
      road: '#7A6B4C', edge: '#5E5238', dash: '#D8C89A', prop: '#3E6B49'
    },
    dunes: {
      sky: ['#3A2A1E', '#7A5330'], ground: '#6E5730', ground2: '#786035',
      road: '#B79A63', edge: '#8A7142', dash: '#EBD9A8', prop: '#8A6E42'
    },
    keep: {
      sky: ['#14161F', '#2A2F44'], ground: '#28303F', ground2: '#2C3547',
      road: '#6A6B78', edge: '#4C4D58', dash: '#C2C4D2', prop: '#3A4152'
    }
  };

  const GOOD_FACE = '#22C55E', BAD_FACE = '#EF4444';
  const MINE = '#3B82F6', MINE_DARK = '#1D4ED8';
  const THEIRS = '#F43F5E', THEIRS_DARK = '#9F1239';

  function hash(i, salt) {
    let h = Math.imul(i + 17, 374761393) + Math.imul(salt || 1, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function rr(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** The label a gate wears. */
  function gateText(g) {
    if (g.op === 'mul') return '\u00D7' + g.val;
    if (g.op === 'add') return '+' + g.val;
    if (g.op === 'sub') return '\u2212' + g.val;
    return '\u00F7' + g.val;
  }
  function gateGood(g) { return g.op === 'mul' || g.op === 'add'; }

  /* ---------------------------------------------------------- the camera */

  /** One vanishing point, and everything on the track goes through it. */
  function camera(geom) {
    const w = geom.w, h = geom.h;
    const yBase = h * 0.80, yHor = h * 0.30, halfW = w * 0.44;
    return {
      w: w, h: h, cx: w / 2, yBase: yBase, yHor: yHor, halfW: halfW,
      depth(d) { const t = Math.max(0, d) / (Math.max(0, d) + 15); return t; },
      y(d) { return yBase - this.depth(d) * (yBase - yHor); },
      s(d) { return 1 - this.depth(d) * 0.80; },
      x(xt, d) { return this.cx + xt * halfW * this.s(d); }
    };
  }

  /** One stickman, feet at (x, y), `hp` pixels tall. */
  function stick(c, x, y, hp, phase, body, dark) {
    const head = hp * 0.26, lw = Math.max(1, hp * 0.11);
    const sw = Math.sin(phase), sw2 = Math.sin(phase + Math.PI);
    c.strokeStyle = body;
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y - hp * 0.52);                       // spine
    c.lineTo(x, y - hp * 0.22);
    c.moveTo(x, y - hp * 0.22);                       // legs
    c.lineTo(x + sw * hp * 0.16, y);
    c.moveTo(x, y - hp * 0.22);
    c.lineTo(x + sw2 * hp * 0.16, y);
    c.moveTo(x, y - hp * 0.46);                       // arms
    c.lineTo(x + sw2 * hp * 0.17, y - hp * 0.30);
    c.moveTo(x, y - hp * 0.46);
    c.lineTo(x + sw * hp * 0.17, y - hp * 0.30);
    c.stroke();
    c.fillStyle = body;
    c.beginPath();
    c.arc(x, y - hp * 0.66, head, 0, TAU);
    c.fill();
    c.fillStyle = dark;
    c.beginPath();
    c.arc(x, y - hp * 0.66, head, Math.PI * 0.15, Math.PI * 0.85);
    c.fill();
  }

  /**
   * A crowd of `n`, centred on `xt` at distance `d`, `width` track units
   * across. Drawn back to front so the near rank overlaps the far one.
   */
  function crowd(c, cam, n, xt, d, width, tick, body, dark, salt) {
    const shown = Math.min(CAP, Math.max(1, n));
    // A crowd needs DEPTH to read as a crowd. Packed into one rank they merge
    // into a single blue slab; spread back over a few metres they overlap the
    // way a running mob does, and the ones at the back are visibly smaller.
    const deep = Math.min(5, 0.9 + width * 2.4);
    const rows = [];
    for (let i = 0; i < shown; i++) {
      const rx = (hash(i, salt) - 0.5) * width;
      // Spread AWAY from the camera. Behind the crowd's own line the camera
      // clamps everything to the same y and scale, so a crowd spread backward
      // is a crowd with no depth at all — which is exactly how it looked.
      const rd = d + hash(i, salt + 99) * deep;
      rows.push({ x: xt + rx, d: rd, i: i });
    }
    rows.sort((a, b) => b.d - a.d);
    for (const u of rows) {
      const s = cam.s(u.d);
      stick(c, cam.x(u.x, u.d), cam.y(u.d), cam.h * 0.052 * s,
        tick * 0.34 + u.i * 0.9, body, dark);
    }
  }

  /** The number over a crowd's heads — the thing the game is actually about. */
  function tally(c, cam, n, xt, d, colour) {
    const s = cam.s(d), y = cam.y(d) - cam.h * 0.115 * s;
    const size = Math.max(13, cam.h * 0.072 * s);
    c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const x = cam.x(xt, d);
    c.lineWidth = size * 0.28;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,11,16,.85)';
    c.strokeText(String(n), x, y);
    c.fillStyle = colour;
    c.fillText(String(n), x, y);
  }

  /* -------------------------------------------------------- the scenery */

  function ground(c, cam, th, dist) {
    const g = c.createLinearGradient(0, 0, 0, cam.yHor);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, cam.w, cam.yHor);

    c.fillStyle = th.ground;
    c.fillRect(0, cam.yHor, cam.w, cam.h - cam.yHor);

    // Bands of ground, spaced in metres, so the world scrolls under you.
    c.fillStyle = th.ground2;
    const band = 10;
    for (let k = Math.floor(dist / band) * band; k < dist + FAR; k += band) {
      const d0 = k - dist, d1 = d0 + band / 2;
      if (d1 < 0) continue;
      const y0 = cam.y(Math.max(0, d1)), y1 = cam.y(Math.max(0, d0));
      c.fillRect(0, y0, cam.w, Math.max(1, y1 - y0));
    }

    // The track itself: one trapezoid from the far clip to the camera.
    const yFar = cam.y(FAR), sFar = cam.s(FAR);
    c.fillStyle = th.edge;
    c.beginPath();
    c.moveTo(cam.x(-1.16, FAR), yFar); c.lineTo(cam.x(1.16, FAR), yFar);
    c.lineTo(cam.x(1.16, 0), cam.yBase); c.lineTo(cam.x(-1.16, 0), cam.yBase);
    c.closePath(); c.fill();
    c.fillStyle = th.road;
    c.beginPath();
    c.moveTo(cam.x(-1, FAR), yFar); c.lineTo(cam.x(1, FAR), yFar);
    c.lineTo(cam.x(1, 0), cam.yBase); c.lineTo(cam.x(-1, 0), cam.yBase);
    c.closePath(); c.fill();

    // Centre dashes and roadside posts, both pinned to whole metres.
    c.fillStyle = th.dash;
    for (let k = Math.ceil(dist / 6) * 6; k < dist + FAR; k += 6) {
      const d0 = k - dist, d1 = d0 + 2.2;
      const y0 = cam.y(d1), y1 = cam.y(d0), s = cam.s(d0);
      c.globalAlpha = 0.55;
      c.fillRect(cam.cx - cam.halfW * 0.012 * s * 2, y0,
        Math.max(1, cam.halfW * 0.024 * s * 2), Math.max(1, y1 - y0));
      c.globalAlpha = 1;
    }
    c.fillStyle = th.prop;
    for (let k = Math.ceil(dist / 9) * 9; k < dist + FAR; k += 9) {
      const d0 = k - dist, s = cam.s(d0), y = cam.y(d0), hp = cam.h * 0.06 * s;
      for (const side of [-1, 1]) {
        const x = cam.x(side * 1.3, d0);
        c.fillRect(x - hp * 0.12, y - hp, Math.max(1, hp * 0.24), hp);
      }
    }
    // Vanishing haze, so the far clip is not a hard line across the world.
    const haze = c.createLinearGradient(0, yFar - cam.h * 0.06, 0, yFar + cam.h * 0.10);
    haze.addColorStop(0, th.sky[1]);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = haze;
    c.fillRect(0, yFar - cam.h * 0.06, cam.w, cam.h * 0.16);
    void sFar;
  }

  function gateWall(c, cam, f, dist) {
    const d = f.at - dist;
    const s = cam.s(d), yb = cam.y(d), hp = cam.h * 0.30 * s;
    for (const g of f.lanes) {
      const x0 = cam.x(g.x0, d), x1 = cam.x(g.x1, d);
      const good = gateGood(g);
      c.fillStyle = good ? 'rgba(34,197,94,.28)' : 'rgba(239,68,68,.28)';
      c.fillRect(x0, yb - hp, x1 - x0, hp);
      c.fillStyle = good ? GOOD_FACE : BAD_FACE;
      c.fillRect(x0, yb - hp - hp * 0.14, x1 - x0, Math.max(2, hp * 0.14));
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.fillRect(x0, yb - hp, Math.max(1, s * 3), hp);
      c.fillRect(x1 - Math.max(1, s * 3), yb - hp, Math.max(1, s * 3), hp);

      const size = Math.max(11, hp * 0.30);
      c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = size * 0.26;
      c.lineJoin = 'round';
      c.strokeStyle = 'rgba(8,11,16,.8)';
      c.strokeText(gateText(g), (x0 + x1) / 2, yb - hp * 0.55);
      c.fillStyle = '#FFFFFF';
      c.fillText(gateText(g), (x0 + x1) / 2, yb - hp * 0.55);
    }
  }

  /** Saw, hammer, spikes — each drawn where the engine says it is this tick. */
  function hazard(c, cam, f, dist, tick) {
    const d = f.at - dist;
    const s = cam.s(d), yb = cam.y(d);
    const hx = PV.CrowdRush.hazardX(f, tick);
    const live = PV.CrowdRush.hazardLive(f, tick);
    const x = cam.x(hx, d);
    const half = (cam.x(hx + f.w / 2, d) - cam.x(hx - f.w / 2, d)) / 2;
    const hp = cam.h * 0.14 * s;

    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath();
    c.ellipse(x, yb, Math.max(2, half), Math.max(1.5, hp * 0.14), 0, 0, TAU);
    c.fill();

    if (f.kind === 'saw') {
      // The teeth stop at the edge of the span the engine actually cuts with:
      // a blade drawn wider than its own hitbox is a blade you dodge wrong.
      const r = Math.max(4, half);
      c.save();
      c.translate(x, yb - r * 0.42);
      c.rotate(tick * 0.22);
      c.fillStyle = '#9AA6B4';
      c.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        c.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.42);
        c.lineTo(Math.cos(a + 0.16) * r, Math.sin(a + 0.16) * r * 0.54);
      }
      c.closePath(); c.fill();
      c.fillStyle = '#4B5563';
      c.beginPath(); c.ellipse(0, 0, r * 0.26, r * 0.14, 0, 0, TAU); c.fill();
      c.restore();
    } else if (f.kind === 'hammer') {
      const drop = live ? 1 : 0.35;
      const headH = hp * 0.8;
      c.fillStyle = '#7C4A2A';
      c.fillRect(x - Math.max(1, half * 0.10), yb - hp * 2.4, Math.max(2, half * 0.2), hp * 2.4 * (1 - drop * 0.55));
      c.fillStyle = live ? '#E0663A' : '#8A94A4';
      rr(c, x - half, yb - headH - hp * 1.5 * (1 - drop), half * 2, headH, headH * 0.22);
      c.fill();
      if (live) {
        c.strokeStyle = 'rgba(255,214,170,.7)';
        c.lineWidth = Math.max(1, s * 3);
        c.beginPath(); c.ellipse(x, yb, half * 1.5, half * 0.4, 0, 0, TAU); c.stroke();
      }
    } else {
      const n = Math.max(3, Math.round(half / 6));
      c.fillStyle = '#B9C2CE';
      for (let i = 0; i < n; i++) {
        const px = x - half + (i + 0.5) * (half * 2 / n);
        c.beginPath();
        c.moveTo(px - half / n * 0.8, yb);
        c.lineTo(px, yb - hp);
        c.lineTo(px + half / n * 0.8, yb);
        c.closePath(); c.fill();
      }
    }
  }

  /** The keep at the end of the course, with the king's banner over the gate. */
  function castle(c, cam, f, dist) {
    const d = f.at - dist;
    const s = cam.s(d), yb = cam.y(d);
    const x0 = cam.x(-1.25, d), x1 = cam.x(1.25, d);
    const wallH = cam.h * 0.34 * s;
    c.fillStyle = '#4A4F5E';
    c.fillRect(x0, yb - wallH, x1 - x0, wallH);
    c.fillStyle = '#5A6070';
    for (let i = 0; i < 9; i++) {
      const bw = (x1 - x0) / 9;
      c.fillRect(x0 + i * bw, yb - wallH - wallH * 0.16, bw * 0.62, wallH * 0.16);
    }
    for (const side of [-1, 1]) {
      const tx = cam.x(side * 1.05, d);
      c.fillStyle = '#3E4351';
      c.fillRect(tx - wallH * 0.16, yb - wallH * 1.35, wallH * 0.32, wallH * 1.35);
      c.fillStyle = '#F43F5E';
      c.beginPath();
      c.moveTo(tx, yb - wallH * 1.7);
      c.lineTo(tx + wallH * 0.3, yb - wallH * 1.58);
      c.lineTo(tx, yb - wallH * 1.46);
      c.closePath(); c.fill();
      c.fillStyle = '#C8D2DE';
      c.fillRect(tx - wallH * 0.02, yb - wallH * 1.72, wallH * 0.04, wallH * 0.42);
    }
    c.fillStyle = '#2A2E38';
    const gw = (x1 - x0) * 0.22;
    rr(c, (x0 + x1) / 2 - gw / 2, yb - wallH * 0.78, gw, wallH * 0.78, gw * 0.5);
    c.fill();
  }

  /* ------------------------------------------------------------ the view */

  PV.CrowdRushView = function (ctx) {
    const opts = ctx.opts || {};
    const courseKey = PV.CrowdCourse.COURSES[opts.course] ? opts.course : 'fields';
    const def = PV.CrowdCourse.COURSES[courseKey];
    const diffKey = PV.CrowdRush.DIFFS[opts.difficulty] ? opts.difficulty : 'normal';

    let ui = null, countEl, beatEl, goneEl, whereEl;

    function onMove(e) {
      if (!ui) return;
      const rect = ui.canvas.getBoundingClientRect();
      if (!rect.width) return;
      const lane = ((e.clientX - rect.left) - rect.width / 2) / (rect.width * 0.44);
      ui.input({ lane: Math.max(-1, Math.min(1, lane)) });
    }

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right',
        A: 'left', D: 'right'
      },
      sustained: ['left', 'right'],
      pad: [{ label: '\u25C0', action: 'left' }, { label: '\u25B6', action: 'right' }],
      padCols: 2,
      pct: game => Math.min(1, game.dist / game.course.length),

      create: () => new PV.CrowdRush({
        seed: ctx.seed(), course: courseKey, difficulty: diffKey
      }),

      fit(availW, availH) {
        let w = Math.max(280, Math.min(availW, 760));
        if (w * 0.78 > availH) w = Math.max(280, availH / 0.78);
        return { w: w, h: w * 0.78 };
      },

      build(api) {
        ui = api;
        countEl = PV.el('b', {}, String(PV.CrowdRush.DIFFS[diffKey].start));
        beatEl = PV.el('b', {}, '0');
        goneEl = PV.el('b', {}, '0%');
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('crowd.count')), countEl,
          PV.el('span', { class: 'k' }, t('crowd.beaten')), beatEl,
          PV.el('span', { class: 'k' }, t('crowd.run')), goneEl));
        whereEl = PV.el('div', { class: 'muted small td-where' },
          t('crowd.' + courseKey) + ' ' + '\u2605'.repeat(def.tier) + ' \u00B7 ' + t('diff.' + diffKey));
        api.side.appendChild(whereEl);
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('crowd.hint')));
        api.canvas.addEventListener('pointermove', onMove);
        api.canvas.addEventListener('pointerdown', onMove);
      },

      onDestroy() {
        if (!ui) return;
        ui.canvas.removeEventListener('pointermove', onMove);
        ui.canvas.removeEventListener('pointerdown', onMove);
      },

      onFrame(game) {
        countEl.textContent = PV.fmtNum(game.n);
        beatEl.textContent = PV.fmtNum(game.beaten);
        goneEl.textContent = Math.round(Math.min(1, game.dist / game.course.length) * 100) + '%';
      },

      draw(c, game, geom) {
        const cam = camera(geom);
        const th = THEMES[courseKey] || THEMES.fields;
        ground(c, cam, th, game.dist);

        const list = game.course.features;
        for (let i = list.length - 1; i >= 0; i--) {
          const f = list[i];
          const d = f.at - game.dist;
          if (d > FAR || d < -2) continue;
          if (f.kind === 'gates') gateWall(c, cam, f, game.dist);
          else if (f.kind === 'castle') {
            castle(c, cam, f, game.dist);
            if (i >= game.at) {
              crowd(c, cam, f.n, 0, Math.max(1.5, d - 2), 1.2, game.tick, THEIRS, THEIRS_DARK, 7 + i);
              tally(c, cam, f.n, 0, Math.max(1.5, d - 2), '#FECDD3');
            }
          } else if (f.kind === 'rivals') {
            if (i < game.at) continue;                  // already fought
            crowd(c, cam, f.n, 0, d, Math.min(1.4, PV.CrowdRush.widthOf(f.n)),
              game.tick, THEIRS, THEIRS_DARK, 31 + i);
            tally(c, cam, f.n, 0, d, '#FECDD3');
          } else hazard(c, cam, f, game.dist, game.tick);
        }

        // The crowd being fought right now, pressed up against yours.
        if (game.clash) {
          const f = list[game.at - 1];
          const d = Math.max(1.2, (f ? f.at : game.dist + 2.5) - game.dist);
          crowd(c, cam, game.clash.n, 0, d,
            Math.min(1.4, PV.CrowdRush.widthOf(game.clash.n)), game.tick, THEIRS, THEIRS_DARK, 5);
          tally(c, cam, game.clash.n, 0, d, '#FECDD3');
          const y = cam.y(d * 0.5);
          c.fillStyle = 'rgba(255,226,170,' + (0.25 + 0.2 * Math.sin(game.tick * 0.4)).toFixed(3) + ')';
          c.beginPath();
          c.ellipse(cam.cx, y, cam.w * 0.16, cam.h * 0.03, 0, 0, TAU);
          c.fill();
        }

        crowd(c, cam, game.n, game.x, 0, game.width, game.tick, MINE, MINE_DARK, 1);
        tally(c, cam, game.n, game.x, 0, '#DBEAFE');

        for (const p of game.pops) {
          const k = 1 - p.life / 48;
          c.globalAlpha = Math.max(0, 1 - k * 1.1);
          const size = Math.max(12, cam.h * 0.045);
          c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
          c.textAlign = 'center';
          c.fillStyle = p.tone === 'bad' ? '#FCA5A5' : (p.tone === 'win' ? '#FDE68A' : '#86EFAC');
          c.fillText(p.text, cam.x(p.x, 0), cam.yBase - cam.h * (0.20 + k * 0.16));
          c.globalAlpha = 1;
        }

        // How far along the course you are, with the keep at the end of it.
        const bw = cam.w * 0.62, bx = (cam.w - bw) / 2, by = cam.h * 0.045, bh = Math.max(5, cam.h * 0.016);
        c.fillStyle = 'rgba(8,11,16,.55)';
        rr(c, bx, by, bw, bh, bh / 2); c.fill();
        c.fillStyle = '#F6B32B';
        rr(c, bx, by, Math.max(bh, bw * Math.min(1, game.dist / game.course.length)), bh, bh / 2);
        c.fill();
        c.fillStyle = '#C8D2DE';
        c.fillRect(bx + bw, by - bh * 0.6, Math.max(2, bh * 0.4), bh * 2.2);
      },

      outcome(game) {
        const won = game.overReason === 'stormed';
        return {
          result: won ? 'win' : 'lose',
          score: game.score,
          xp: Math.round((won ? 130 : Math.max(10, Math.round(game.dist / 6))) * game.diff.xp),
          tone: won ? 'good' : 'bad',
          title: won ? t('crowd.stormed') : t('crowd.routed'),
          lines: [
            t('crowd.' + game.courseKey) + ' \u00B7 ' + t('diff.' + game.diff.key),
            t('crowd.count') + ': ' + PV.fmtNum(game.n) + ' \u00B7 ' + t('crowd.peak') + ': ' + PV.fmtNum(game.peak),
            t('crowd.beaten') + ': ' + PV.fmtNum(game.beaten) + ' \u00B7 ' + t('crowd.lost') + ': ' + PV.fmtNum(game.lost),
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
