/* 蠕虫竞技场 / Worm Arena — view.

   The camera sits on your head and zooms out as you grow, so a big worm can
   see the trap it is about to drive into and a small one cannot. Everything is
   painted in world units inside one transform; only the names, the minimap and
   the boost ring are drawn back in screen space, because text and a minimap
   that scale with the camera are unreadable at both ends.

   Steering takes the mouse as well as the keys. Both feed the same "aim at
   this angle" input the engine already has, so neither control can out-turn
   the other and a run still replays from its input log. */
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
    let massEl, lenEl, rankEl, board, canvas = null;
    let onMove = null;

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

      fit(availW, availH) {
        const w = Math.max(260, Math.min(availW, 720));
        return { w: w, h: Math.max(220, Math.min(availH, w * 0.68)) };
      },

      build(api) {
        canvas = api.canvas;
        massEl = PV.el('b', {}, '0');
        lenEl = PV.el('b', {}, '0');
        rankEl = PV.el('b', {}, '1');
        board = PV.el('ol', { class: 'worm-board' });
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('worms.mass')), massEl,
          PV.el('span', { class: 'k' }, t('worms.length')), lenEl,
          PV.el('span', { class: 'k' }, t('worms.rank')), rankEl));
        api.side.appendChild(PV.el('div', { class: 'panel-mini' },
          PV.el('span', { class: 'k' }, t('worms.leaders')), board));
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('worms.controls')));

        // The mouse aims from the middle of the canvas, which is where the
        // camera always keeps your head.
        onMove = e => {
          const r = canvas.getBoundingClientRect();
          const dx = (e.clientX - r.left) - r.width / 2;
          const dy = (e.clientY - r.top) - r.height / 2;
          if (dx * dx + dy * dy < 100) return;          // a dead zone, or it jitters
          api.input({ aim: Math.atan2(dy, dx) });
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onMove);
      },

      onDestroy() {
        if (canvas && onMove) {
          canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerdown', onMove);
        }
      },

      onFrame(game) {
        const p = game.player;
        massEl.textContent = PV.fmtNum(Math.floor(p.mass));
        lenEl.textContent = String(Math.round(p.length));
        const r = game.rank();
        rankEl.textContent = r.place + '/' + r.of;

        PV.clear(board);
        game.leaderboard().slice(0, 5).forEach(w => {
          board.appendChild(PV.el('li', { class: w === p ? 'me' : '' },
            PV.el('i', { class: 'swatch', style: { background: w.colour } }),
            PV.el('span', { class: 'nm' }, w === p ? t('worms.you') : w.name),
            PV.el('span', { class: 'mono' }, String(Math.floor(w.mass)))));
        });
      },

      draw(c, game, geom) {
        const p = game.player;
        // Zoom out with mass: a long worm needs to see the trap before it is in it.
        const worldW = 720 + p.mass * 1.1;
        const scale = geom.w / worldW;
        const viewH = geom.h / scale;
        const cam = { x: p.x, y: p.y };

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

        c.strokeStyle = WALL;
        c.lineWidth = 6 / scale;
        c.globalAlpha = 0.7;
        c.strokeRect(0, 0, game.W, game.H);
        c.globalAlpha = 1;

        /* ---- food ---- */

        const m = 30;
        for (const f of game.food) {
          if (f.x < cam.x - worldW / 2 - m || f.x > cam.x + worldW / 2 + m) continue;
          if (f.y < cam.y - viewH / 2 - m || f.y > cam.y + viewH / 2 + m) continue;
          const r = 3.5 + Math.min(6, f.v * 0.7);
          c.fillStyle = f.c;
          c.globalAlpha = 0.22;
          c.beginPath(); c.arc(f.x, f.y, r * 2.1, 0, Math.PI * 2); c.fill();
          c.globalAlpha = 1;
          c.beginPath(); c.arc(f.x, f.y, r, 0, Math.PI * 2); c.fill();
        }

        /* ---- worms ---- */

        const heads = [];
        for (const w of game.worms) {
          if (!w.alive) continue;
          const far = worldW / 2 + w.length + 60;
          if (Math.abs(w.x - cam.x) > far || Math.abs(w.y - cam.y) > far + viewH) continue;
          paintWorm(c, w, scale);
          heads.push(w);
        }

        c.restore();

        /* ---- screen-space furniture ---- */

        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.font = '600 11px system-ui, sans-serif';
        for (const w of heads) {
          const sx = geom.w / 2 + (w.x - cam.x) * scale;
          const sy = geom.h / 2 + (w.y - cam.y) * scale;
          c.fillStyle = 'rgba(0,0,0,.55)';
          c.fillText(w === p ? t('worms.you') : w.name, sx + 1, sy - w.radius * scale - 5);
          c.fillStyle = w === p ? '#FFFFFF' : 'rgba(234,240,247,.75)';
          c.fillText(w === p ? t('worms.you') : w.name, sx, sy - w.radius * scale - 6);
        }

        if (p.alive && p.boosting) {
          c.strokeStyle = 'rgba(246,179,43,.65)';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(geom.w / 2, geom.h / 2, p.radius * scale + 7, 0, Math.PI * 2);
          c.stroke();
        }

        minimap(c, game, geom);
      },

      outcome(game, st) {
        const p = game.player;
        return {
          result: 'over',
          score: Math.floor(p.mass),
          xp: 8 + Math.floor(p.mass / 25),
          tone: 'flat',
          title: game.overReason === 'wall' ? t('worms.hitWall') : t('worms.eaten'),
          lines: [
            t('worms.mass') + ': ' + PV.fmtNum(Math.floor(p.mass))
              + ' · ' + t('worms.length') + ': ' + Math.round(p.length),
            t('common.time') + ': ' + PV.fmtTime(st.timeMs),
            '@best'
          ]
        };
      }
    });
  };

  /** One worm: a dark outline stroked under the body, then a head with eyes. */
  function paintWorm(c, w, scale) {
    const pts = [{ x: w.x, y: w.y }].concat(w.nodes);
    c.lineCap = 'round';
    c.lineJoin = 'round';
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
    c.beginPath(); c.arc(w.x, w.y, r * 1.08, 0, Math.PI * 2); c.fill();

    const dx = Math.cos(w.angle), dy = Math.sin(w.angle);
    const px = -dy, py = dx;
    for (const side of [-1, 1]) {
      const ex = w.x + dx * r * 0.34 + px * side * r * 0.46;
      const ey = w.y + dy * r * 0.34 + py * side * r * 0.46;
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(ex, ey, r * 0.34, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#101820';
      c.beginPath(); c.arc(ex + dx * r * 0.12, ey + dy * r * 0.12, r * 0.17, 0, Math.PI * 2); c.fill();
    }
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
