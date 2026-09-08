/* 卡丁车 / Kart Racing — view.

   The camera follows the player without rotating. A rotating camera looks
   better in a screenshot and is much harder to drive: with the world fixed,
   "left" on the key is always left on the screen, which is what a top-down
   racer needs on a phone.

   Everything the items do is shown on the road rather than only in the panel —
   the box you drove through, the banana behind the kart in front, the shell
   coming up the inside. A HUD slot alone leaves the player guessing what just
   spun them. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const VIEW = 48;                        // world units across the canvas
  const COLOURS = ['#F6B32B', '#38BDF8', '#F87171', '#34D399', '#C084FC', '#FB923C'];
  const GLYPH = { mushroom: '🍄', banana: '🍌', shell: '🐚', lightning: '⚡' };

  PV.RacingView = function (ctx) {
    const opts = ctx.opts || {};
    let lapEl, posEl, timeEl, bestEl, itemEl, itemName;

    const fmtTicks = n => (n ? PV.fmtTime(Math.round(n / 60 * 1000)) : '—');

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'accel', ArrowDown: 'brake',
        a: 'left', d: 'right', w: 'accel', s: 'brake',
        A: 'left', D: 'right', W: 'accel', S: 'brake',
        Shift: 'drift', z: 'drift', Z: 'drift', ' ': 'item'
      },
      // Steering and the drift have to be held, so those repeat. Firing an
      // item does not: one press, one item.
      repeatable: ['left', 'right', 'accel', 'brake', 'drift'],
      pad: [
        { label: '◀', action: 'left' }, { label: '▲', action: 'accel', aria: 'accelerate' },
        { label: '▶', action: 'right' },
        { label: '⟲', action: 'drift' }, { label: '▼', action: 'brake' },
        { label: '★', action: 'item', aria: 'use item' }
      ],
      padCols: 3,

      create: () => new PV.Racing({
        seed: PV.newSeed(),
        track: opts.track || 'ring',
        laps: Number(opts.laps || 3),
        kart: opts.kart || 'medium',
        rivals: 3
      }),

      fit(availW, availH) {
        const w = Math.max(240, Math.min(availW, 1000));
        return { w: w, h: Math.max(220, Math.min(w * 0.66, availH)) };
      },

      build(api) {
        lapEl = PV.el('b', {}, '1');
        posEl = PV.el('b', {}, '1');
        timeEl = PV.el('b', {}, '0:00');
        bestEl = PV.el('b', {}, '—');
        itemEl = PV.el('div', { class: 'kart-slot' }, '—');
        itemName = PV.el('span', { class: 'muted small' }, t('racing.none'));
        api.side.appendChild(PV.el('div', { class: 'panel-mini' },
          PV.el('span', { class: 'k' }, t('racing.item')), itemEl, itemName));
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
        const it = game.player.item;
        itemEl.textContent = it ? GLYPH[it] : '—';
        itemEl.className = 'kart-slot' + (it ? ' full' : '');
        itemName.textContent = it ? t('racing.' + it) : t('racing.none');
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

        // Item boxes, then what people have thrown out of them.
        for (const box of game.boxes) {
          if (box.at > game.tick) continue;
          c.save();
          c.translate(box.x, box.y);
          c.rotate(game.tick * 0.04);
          c.fillStyle = 'rgba(246,179,43,.92)';
          c.beginPath();
          if (c.roundRect) c.roundRect(-0.55, -0.55, 1.1, 1.1, 0.22);
          else c.rect(-0.55, -0.55, 1.1, 1.1);
          c.fill();
          c.strokeStyle = 'rgba(255,255,255,.7)';
          c.lineWidth = 0.12;
          c.stroke();
          c.restore();
          // The mark stays upright while the box spins, or it is unreadable.
          c.fillStyle = '#3A2A05';
          c.font = '0.9px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('?', box.x, box.y + 0.04);
        }

        for (const h of game.hazards) {
          c.save();
          c.translate(h.x, h.y);
          c.rotate(0.6);
          c.fillStyle = '#F7D308';
          c.beginPath();
          c.ellipse(0, 0, 0.5, 0.22, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = 'rgba(90,70,10,.65)';
          c.lineWidth = 0.08;
          c.stroke();
          c.restore();
        }

        for (const s of game.shells) {
          c.fillStyle = '#42B642';
          c.beginPath();
          c.arc(s.x, s.y, 0.42, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#EAF0F7';
          c.lineWidth = 0.1;
          c.stroke();
        }

        for (const car of game.cars) {
          c.save();
          c.translate(car.x, car.y);
          c.rotate(car.angle);

          if (car.boost > 0) {
            const flick = 0.22 + 0.16 * Math.sin(game.tick * 0.8 + car.i);
            c.fillStyle = 'rgba(246,179,43,.9)';
            c.beginPath();
            c.moveTo(-0.95, -0.3);
            c.lineTo(-1.5 - flick, 0);
            c.lineTo(-0.95, 0.3);
            c.closePath();
            c.fill();
          }
          if (car.charge > 0) {
            // Blue while the mini-turbo is charging, orange once it will pay.
            c.fillStyle = car.charge >= PV.Racing.DRIFT_CHARGE ? '#F97316' : '#7DD3FC';
            for (const sy of [-0.42, 0.42]) {
              c.beginPath();
              c.arc(-0.85, sy, 0.15 + 0.05 * Math.sin(game.tick * 1.3), 0, Math.PI * 2);
              c.fill();
            }
          }

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
