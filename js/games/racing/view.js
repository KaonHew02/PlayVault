/* 赛车 / Racing — view.

   The camera follows the player without rotating. A rotating camera looks
   better in a screenshot and is much harder to drive: with the world fixed,
   "left" on the key is always left on the screen, which is what a top-down
   racer needs on a phone. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const VIEW = 48;                        // world units across the canvas
  const COLOURS = ['#F6B32B', '#38BDF8', '#F87171', '#34D399', '#C084FC', '#FB923C'];

  PV.RacingView = function (ctx) {
    const opts = ctx.opts || {};
    let lapEl, posEl, timeEl, bestEl;

    const fmtTicks = n => (n ? PV.fmtTime(Math.round(n / 60 * 1000)) : '—');

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'accel', ArrowDown: 'brake',
        a: 'left', d: 'right', w: 'accel', s: 'brake',
        A: 'left', D: 'right', W: 'accel', S: 'brake'
      },
      // Steering has to be held, so every control repeats.
      repeatable: ['left', 'right', 'accel', 'brake'],
      pad: [
        { label: '◀', action: 'left' }, { label: '▲', action: 'accel', aria: 'accelerate' },
        { label: '▼', action: 'brake' }, { label: '▶', action: 'right' }
      ],
      padCols: 4,

      create: () => new PV.Racing({
        seed: PV.newSeed(),
        track: opts.track || 'ring',
        laps: Number(opts.laps || 3),
        rivals: 3
      }),

      fit(availW, availH) {
        const w = Math.max(240, Math.min(availW, 700));
        return { w: w, h: Math.max(220, Math.min(w * 0.66, availH)) };
      },

      build(api) {
        lapEl = PV.el('b', {}, '1');
        posEl = PV.el('b', {}, '1');
        timeEl = PV.el('b', {}, '0:00');
        bestEl = PV.el('b', {}, '—');
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('racing.lap')), lapEl,
          PV.el('span', { class: 'k' }, t('racing.place')), posEl,
          PV.el('span', { class: 'k' }, t('common.time')), timeEl,
          PV.el('span', { class: 'k' }, t('racing.best')), bestEl));
        api.below.appendChild(PV.el('p', { class: 'muted small hide-sm' }, t('racing.controls')));
      },

      onFrame(game) {
        lapEl.textContent = game.lapNumber + ' / ' + game.laps;
        posEl.textContent = game.place(game.player) + ' / ' + game.cars.length;
        timeEl.textContent = fmtTicks(game.tick);
        bestEl.textContent = fmtTicks(game.player.best);
      },

      draw(c, game, geom) {
        const tk = game.track;
        const scale = geom.w / VIEW;
        const cam = game.player;

        c.fillStyle = '#1B3326';
        c.fillRect(0, 0, geom.w, geom.h);

        c.save();
        c.translate(geom.w / 2 - cam.x * scale, geom.h / 2 - cam.y * scale);
        c.scale(scale, scale);

        // Kerb first, asphalt on top: one path, two strokes.
        c.beginPath();
        c.moveTo(tk.points[0].x, tk.points[0].y);
        for (let i = 1; i < tk.n; i++) c.lineTo(tk.points[i].x, tk.points[i].y);
        c.closePath();
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.strokeStyle = '#D8D2C4';
        c.lineWidth = tk.width + 1.1;
        c.stroke();
        c.strokeStyle = '#2E3440';
        c.lineWidth = tk.width;
        c.stroke();

        c.setLineDash([2.2, 3.4]);
        c.strokeStyle = 'rgba(255,255,255,.22)';
        c.lineWidth = 0.28;
        c.stroke();
        c.setLineDash([]);

        // Start / finish.
        const p0 = tk.points[0], n0 = tk.normals[0];
        c.strokeStyle = '#EAF0F7';
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(p0.x - n0.x * tk.width / 2, p0.y - n0.y * tk.width / 2);
        c.lineTo(p0.x + n0.x * tk.width / 2, p0.y + n0.y * tk.width / 2);
        c.stroke();

        for (const car of game.cars) {
          c.save();
          c.translate(car.x, car.y);
          c.rotate(car.angle);
          c.fillStyle = COLOURS[car.i % COLOURS.length];
          c.beginPath();
          if (c.roundRect) c.roundRect(-0.95, -0.55, 1.9, 1.1, 0.28);
          else c.rect(-0.95, -0.55, 1.9, 1.1);
          c.fill();
          c.fillStyle = 'rgba(13,18,24,.55)';
          c.fillRect(-0.15, -0.42, 0.62, 0.84);
          if (car.isPlayer) {
            c.strokeStyle = '#FFFFFF';
            c.lineWidth = 0.14;
            c.stroke();
          }
          c.restore();
        }

        c.restore();
      },

      outcome(game, st) {
        const place = game.player.place || game.place(game.player);
        const won = place === 1;
        return {
          result: won ? 'win' : 'lose',
          score: Math.max(0, 10000 - game.tick),
          xp: won ? 90 : Math.max(15, 60 - place * 10),
          tone: won ? 'good' : 'flat',
          title: won ? t('racing.won') : t('racing.placed', { n: place }),
          lines: [
            t('common.time') + ': ' + fmtTicks(game.tick),
            t('racing.best') + ': ' + fmtTicks(game.player.best),
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
