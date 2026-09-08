/* 蠕虫竞技场 / Worm Arena — view.

   The camera sits on your head and zooms out as you grow, so a big worm can
   see the trap it is about to drive into and a small one cannot. Everything is
   painted in world units inside one transform; the names, the joystick, the
   edge warning and the minimap are drawn back in screen space, because text
   and a minimap that scale with the camera are unreadable at both ends.

   Three controls, one input. A mouse aims from the middle of the canvas and
   holds the left button to dash; a finger drags a joystick; the arrow keys
   turn. All three end up as the engine's "aim at this angle", so none of them
   can out-turn another and a run still replays from its input log.

   Particles live here and nowhere near the engine: they are the only thing in
   the game allowed to be random without a seed, because nothing depends on
   them. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  const OUTSIDE = '#070A10';
  const FIELD = '#101826';
  const GRID = 'rgba(255,255,255,.035)';
  const WALL = '#F6B32B';

  PV.WormsView = function (ctx) {
    const opts = ctx.opts || {};
    const bots = opts.crowd === 'quiet' ? 4 : (opts.crowd === 'busy' ? 11 : 7);
    let scoreEl, lenEl, rankEl, board, energyBar, canvas = null;
    let onMove = null, onDown = null, onUp = null, boostTimer = null;
    let stick = null;                 // the touch joystick, in canvas pixels
    let bits = [];                    // death and eating particles

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right',
        A: 'left', D: 'right', ' ': 'boost'
      },
      repeatable: ['left', 'right', 'boost'],
      pad: [{ label: '◀', action: 'left' }, { label: '⚡', action: 'boost', aria: 'dash' },
            { label: '▶', action: 'right' }],
      padCols: 3,

      create: () => new PV.Worms({ seed: PV.newSeed(), bots: bots }),

      onReset() { bits = []; stick = null; },

      fit(availW, availH) {
        const w = Math.max(260, Math.min(availW, 1040));
        return { w: w, h: Math.max(220, Math.min(availH, w * 0.68)) };
      },

      build(api) {
        canvas = api.canvas;
        scoreEl = PV.el('b', {}, '0');
        lenEl = PV.el('b', {}, String(PV.Worms.START_SEGMENTS));
        rankEl = PV.el('b', {}, '1');
        board = PV.el('ol', { class: 'worm-board' });
        energyBar = PV.el('i');

        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('common.score')), scoreEl,
          PV.el('span', { class: 'k' }, t('worms.length')), lenEl,
          PV.el('span', { class: 'k' }, t('worms.rank')), rankEl));
        api.side.appendChild(PV.el('div', { class: 'panel-mini' },
          PV.el('span', { class: 'k' }, t('worms.energy')),
          PV.el('div', { class: 'energy-bar' }, energyBar)));
        api.side.appendChild(PV.el('div', { class: 'panel-mini' },
          PV.el('span', { class: 'k' }, t('worms.leaders')), board));
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('worms.controls')));

        const aimAt = (px, py, ox, oy) => {
          const dx = px - ox, dy = py - oy;
          if (dx * dx + dy * dy < 100) return;        // a dead zone, or it jitters
          api.input({ aim: Math.atan2(dy, dx) });
        };
        const local = e => {
          const r = canvas.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
        };

        onMove = e => {
          const p = local(e);
          // A finger drags a stick from wherever it went down; a mouse aims
          // from the middle, which is where the camera keeps your head.
          if (stick) { stick.x = p.x; stick.y = p.y; aimAt(p.x, p.y, stick.ox, stick.oy); }
          else aimAt(p.x, p.y, p.w / 2, p.h / 2);
        };

        onDown = e => {
          if (e.button != null && e.button !== 0) return;
          const p = local(e);
          if (e.pointerType === 'touch') {
            stick = { ox: p.x, oy: p.y, x: p.x, y: p.y };
            return;                                    // touch steers; ⚡ dashes
          }
          // Hold the left button to dash. The engine's dash lapses after a few
          // ticks, so holding has to keep saying so — the same trick the
          // harness uses for a held key.
          aimAt(p.x, p.y, p.w / 2, p.h / 2);
          if (boostTimer) return;
          api.input('boost');
          boostTimer = setInterval(() => api.input('boost'), 60);
        };

        onUp = () => {
          stick = null;
          clearInterval(boostTimer);
          boostTimer = null;
        };

        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerleave', onUp);
        canvas.addEventListener('pointercancel', onUp);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('blur', onUp);
      },

      onDestroy() {
        clearInterval(boostTimer);
        boostTimer = null;
        if (!canvas) return;
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerleave', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('blur', onUp);
      },

      onFrame(game) {
        const p = game.player;
        scoreEl.textContent = PV.fmtNum(p.score);
        lenEl.textContent = PV.fmtNum(Math.round(p.segments));
        const r = game.rank();
        rankEl.textContent = r.place + '/' + r.of;

        const pct = Math.max(0, Math.round(p.energy / PV.Worms.ENERGY_MAX * 100));
        energyBar.style.width = pct + '%';
        energyBar.className = pct < 25 ? 'low' : '';

        PV.clear(board);
        game.leaderboard().slice(0, 5).forEach(w => {
          board.appendChild(PV.el('li', { class: w === p ? 'me' : '' },
            PV.el('i', { class: 'swatch', style: { background: w.colour } }),
            PV.el('span', { class: 'nm' }, w === p ? t('worms.you') : w.name),
            PV.el('span', { class: 'mono' }, PV.fmtNum(w.score))));
        });
      },

      draw(c, game, geom) {
        const p = game.player;
        // Zoom out with length, but sublinearly and capped: a thousand-segment
        // worm would otherwise pull the whole arena into the frame.
        const worldW = Math.min(1500, 700 + Math.pow(Math.max(1, p.segments), 0.7) * 14);
        const scale = geom.w / worldW;
        const viewH = geom.h / scale;
        const cam = { x: p.x, y: p.y };

        spawnBits(game);

        c.fillStyle = OUTSIDE;
        c.fillRect(0, 0, geom.w, geom.h);

        c.save();
        c.translate(geom.w / 2, geom.h / 2);
        c.scale(scale, scale);
        c.translate(-cam.x, -cam.y);

        c.fillStyle = FIELD;
        c.fillRect(0, 0, game.W, game.H);

        const grid = 100;
        c.strokeStyle = GRID;
        c.lineWidth = 1 / scale;
        c.beginPath();
        const x0 = Math.max(0, Math.floor((cam.x - worldW / 2) / grid) * grid);
        const x1 = Math.min(game.W, cam.x + worldW / 2 + grid);
        const y0 = Math.max(0, Math.floor((cam.y - viewH / 2) / grid) * grid);
        const y1 = Math.min(game.H, cam.y + viewH / 2 + grid);
        for (let x = x0; x <= x1; x += grid) { c.moveTo(x, y0); c.lineTo(x, y1); }
        for (let y = y0; y <= y1; y += grid) { c.moveTo(x0, y); c.lineTo(x1, y); }
        c.stroke();

        // The soft boundary: a hatched band you get turned around in, and the
        // hard line you cannot cross.
        const e = PV.Worms.EDGE;
        c.strokeStyle = 'rgba(246,179,43,.10)';
        c.lineWidth = e;
        c.strokeRect(e / 2, e / 2, game.W - e, game.H - e);
        c.strokeStyle = WALL;
        c.lineWidth = 6 / scale;
        c.globalAlpha = 0.75;
        c.strokeRect(0, 0, game.W, game.H);
        c.globalAlpha = 1;

        const m = 40;
        const onScreen = (x, y) => x > cam.x - worldW / 2 - m && x < cam.x + worldW / 2 + m
          && y > cam.y - viewH / 2 - m && y < cam.y + viewH / 2 + m;

        for (const f of game.food) if (onScreen(f.x, f.y)) pellet(c, f, game.tick);

        const heads = [];
        for (const w of game.worms) {
          if (!w.alive) continue;
          const far = worldW / 2 + w.bodyLength + 60;
          if (Math.abs(w.x - cam.x) > far || Math.abs(w.y - cam.y) > far + viewH) continue;
          paintWorm(c, w);
          heads.push(w);
        }

        drawBits(c);
        c.restore();

        /* ---- screen-space furniture ---- */

        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        for (const w of heads) {
          const sx = geom.w / 2 + (w.x - cam.x) * scale;
          const sy = geom.h / 2 + (w.y - cam.y) * scale;
          const top = sy - w.radius * scale - 7;
          c.font = '600 11px system-ui, sans-serif';
          label(c, w === p ? t('worms.you') : w.name, sx, top,
            w === p ? '#FFFFFF' : 'rgba(234,240,247,.78)');
          c.font = '600 10px system-ui, sans-serif';
          label(c, PV.fmtNum(w.score), sx, top + 11, w.colour);
        }

        // The dash tank, drawn as a ring round your own head: on the panel it
        // is a number you have to look away to read.
        if (p.alive) {
          const rad = p.radius * scale + 8;
          const frac = Math.max(0, p.energy / PV.Worms.ENERGY_MAX);
          c.lineWidth = 3;
          c.strokeStyle = 'rgba(255,255,255,.13)';
          c.beginPath();
          c.arc(geom.w / 2, geom.h / 2, rad, 0, Math.PI * 2);
          c.stroke();
          if (frac > 0.002) {
            c.strokeStyle = p.boosting ? '#F6B32B' : 'rgba(246,179,43,.5)';
            c.beginPath();
            c.arc(geom.w / 2, geom.h / 2, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            c.stroke();
          }
        }

        if (p.alive && p.atEdge) {
          c.font = '700 13px system-ui, sans-serif';
          c.textBaseline = 'top';
          label(c, '⚠ ' + t('worms.edge'), geom.w / 2, 10, '#F6B32B');
        }

        if (stick) joystick(c, stick);
        minimap(c, game, geom);
      },

      outcome(game, st) {
        const p = game.player;
        const r = game.rank();
        return {
          result: 'over',
          score: p.score,
          xp: 8 + Math.floor(p.score / 200),
          tone: 'flat',
          title: t('worms.eaten'),
          lines: [
            t('common.score') + ': ' + PV.fmtNum(p.score)
              + ' · ' + t('worms.rank') + ' ' + r.place + '/' + r.of,
            t('worms.length') + ': ' + PV.fmtNum(Math.round(p.segments))
              + ' · ' + t('worms.kills') + ': ' + p.kills,
            t('common.time') + ': ' + PV.fmtTime(st.timeMs),
            '@best'
          ]
        };
      }
    });

    /* ---------------------------------------------------------- particles */

    function spawnBits(game) {
      for (const ev of game.events) {
        if (ev.kind === 'death') {
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.4;
            bits.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                        life: 1, r: 2 + Math.random() * (ev.size * 0.28), c: ev.c });
          }
        } else if (ev.kind === 'eat') {
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            bits.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2,
                        life: 0.6, r: 1.5 + Math.random() * 2, c: ev.c });
          }
        }
      }
      if (bits.length > 400) bits.splice(0, bits.length - 400);
    }

    function drawBits(c) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx; b.y += b.vy;
        b.vx *= 0.94; b.vy *= 0.94;
        b.life -= 0.03;
        if (b.life <= 0) { bits.splice(i, 1); continue; }
        c.globalAlpha = Math.max(0, b.life);
        c.fillStyle = b.c;
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  };

  /** One pellet. The six kinds differ in size and colour, plus a tell or two. */
  function pellet(c, f, tick) {
    const r = f.r;
    c.fillStyle = f.c;
    c.globalAlpha = 0.2;
    c.beginPath();
    c.arc(f.x, f.y, r * 2, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(f.x, f.y, r, 0, Math.PI * 2);
    c.fill();

    if (f.kind === 'burger' || f.kind === 'pizza') {
      // A lighter cap, so the two big meals do not read as one big berry.
      c.fillStyle = f.kind === 'pizza' ? '#FDE68A' : '#F3D9A4';
      c.beginPath();
      c.arc(f.x, f.y, r * 0.98, Math.PI, 0);
      c.fill();
    }
    if (f.kind === 'gold') {
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(f.x, f.y, r * (1.2 + 0.08 * Math.sin(tick * 0.08)), 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath();
    c.arc(f.x - r * 0.3, f.y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    c.fill();
  }

  /** Small text with a dark copy behind it, over a board of any colour. */
  function label(c, text, x, y, colour) {
    c.fillStyle = 'rgba(0,0,0,.6)';
    c.fillText(text, x + 1, y + 1);
    c.fillStyle = colour;
    c.fillText(text, x, y);
  }

  /** One worm: a dark outline stroked under the body, then a head with eyes. */
  function paintWorm(c, w) {
    const pts = [{ x: w.x, y: w.y }].concat(w.nodes);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (w.boosting && pts.length > 2) {
      const tail = pts.slice(Math.max(0, pts.length - 12));
      c.strokeStyle = 'rgba(246,179,43,.32)';
      c.lineWidth = w.radius * 3;
      c.beginPath();
      c.moveTo(tail[0].x, tail[0].y);
      for (let i = 1; i < tail.length; i++) c.lineTo(tail[i].x, tail[i].y);
      c.stroke();
    }

    for (const pass of [['rgba(0,0,0,.45)', w.radius * 2 + 4], [w.colour, w.radius * 2]]) {
      c.strokeStyle = pass[0];
      c.lineWidth = pass[1];
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      if (pts.length === 1) c.lineTo(pts[0].x + 0.01, pts[0].y);
      c.stroke();
    }

    // A lighter belly stripe down the middle, so a fat worm does not read as a
    // flat sausage once it fills half the screen.
    c.strokeStyle = 'rgba(255,255,255,.18)';
    c.lineWidth = w.radius * 0.7;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();

    const r = w.radius;
    c.fillStyle = w.colour;
    c.beginPath();
    c.arc(w.x, w.y, r * 1.08, 0, Math.PI * 2);
    c.fill();

    const dx = Math.cos(w.angle), dy = Math.sin(w.angle);
    const px = -dy, py = dx;
    for (const side of [-1, 1]) {
      const ex = w.x + dx * r * 0.34 + px * side * r * 0.46;
      const ey = w.y + dy * r * 0.34 + py * side * r * 0.46;
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.arc(ex, ey, r * 0.34, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#101820';
      c.beginPath();
      c.arc(ex + dx * r * 0.12, ey + dy * r * 0.12, r * 0.17, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** The touch stick, drawn where the finger went down. */
  function joystick(c, s) {
    const reach = 42;
    const dx = s.x - s.ox, dy = s.y - s.oy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, reach / d);
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s.ox, s.oy, reach, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(246,179,43,.75)';
    c.beginPath();
    c.arc(s.ox + dx * k, s.oy + dy * k, 15, 0, Math.PI * 2);
    c.fill();
  }

  /** Where everyone is, in the corner. The arena is far bigger than the view. */
  function minimap(c, game, geom) {
    const w = Math.max(70, geom.w * 0.16), h = w * (game.H / game.W);
    const x = geom.w - w - 10, y = geom.h - h - 10;
    c.fillStyle = 'rgba(7,10,16,.72)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(246,179,43,.45)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (const worm of game.worms) {
      if (!worm.alive) continue;
      const isMe = worm === game.player;
      c.fillStyle = isMe ? '#FFFFFF' : worm.colour;
      const dot = isMe ? 3 : 2;
      c.fillRect(x + (worm.x / game.W) * w - dot / 2, y + (worm.y / game.H) * h - dot / 2, dot, dot);
    }
  }

})(window.PV);
