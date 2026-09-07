/* 贪吃蛇 / Snake — view. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  PV.SnakeView = function (ctx) {
    const opts = ctx.opts || {};
    let scoreEl, lenEl, lvlEl;

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right'
      },
      pad: [
        { label: '◀', action: 'left' }, { label: '▲', action: 'up' },
        { label: '▼', action: 'down' }, { label: '▶', action: 'right' }
      ],
      padCols: 4,

      create: () => new PV.Snake({
        seed: PV.newSeed(),
        speed: opts.speed || 'normal',
        walls: opts.walls !== 'wrap'
      }),

      fit(availW, availH) {
        const s = Math.max(200, Math.min(availW, availH, 520));
        return { w: s, h: s };
      },

      build(api) {
        scoreEl = PV.el('b', {}, '0');
        lenEl = PV.el('b', {}, '3');
        lvlEl = PV.el('b', {}, '1');
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('common.score')), scoreEl,
          PV.el('span', { class: 'k' }, t('snake.length')), lenEl,
          PV.el('span', { class: 'k' }, t('common.level')), lvlEl));
        api.below.appendChild(PV.el('p', { class: 'muted small hide-sm' }, t('snake.controls')));
      },

      onFrame(game) {
        scoreEl.textContent = PV.fmtNum(game.score);
        lenEl.textContent = String(game.body.length);
        lvlEl.textContent = String(game.level);
      },

      draw(c, game, geom) {
        const cell = geom.w / game.cols;

        c.fillStyle = PV.cssVar('--face', '#0D1218');
        c.fillRect(0, 0, geom.w, geom.h);
        c.strokeStyle = 'rgba(255,255,255,.04)';
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 1; i < game.cols; i++) { c.moveTo(i * cell, 0); c.lineTo(i * cell, geom.h); }
        for (let i = 1; i < game.rows; i++) { c.moveTo(0, i * cell); c.lineTo(geom.w, i * cell); }
        c.stroke();

        if (game.walls) {
          c.strokeStyle = PV.cssVar('--line-2', '#2A3648');
          c.lineWidth = 2;
          c.strokeRect(1, 1, geom.w - 2, geom.h - 2);
        }

        if (game.food) {
          const fx = (game.food.x + 0.5) * cell, fy = (game.food.y + 0.5) * cell;
          c.fillStyle = PV.cssVar('--accent', '#F6B32B');
          c.beginPath(); c.arc(fx, fy, cell * 0.32, 0, Math.PI * 2); c.fill();
        }

        // The head is brightest and the tail fades, so which way it is going is
        // readable at a glance even when the snake doubles back on itself.
        const n = game.body.length;
        for (let i = n - 1; i >= 0; i--) {
          const s = game.body[i];
          const k = 1 - (i / Math.max(1, n)) * 0.55;
          c.fillStyle = i === 0 ? '#6EE7B7' : 'rgba(52, 211, 153,' + k.toFixed(3) + ')';
          const pad = cell * (i === 0 ? 0.06 : 0.12);
          const r = cell * 0.26;
          const x = s.x * cell + pad, y = s.y * cell + pad, w = cell - pad * 2;
          c.beginPath();
          if (c.roundRect) c.roundRect(x, y, w, w, r);
          else c.rect(x, y, w, w);
          c.fill();
        }
      },

      outcome(game, st) {
        return {
          result: 'over',
          score: game.score,
          xp: 8 + Math.floor(game.score / 40),
          tone: game.overReason === 'perfect' ? 'good' : 'flat',
          title: game.overReason === 'perfect' ? t('snake.perfect') : t('result.gameOver'),
          lines: [
            t('common.score') + ': ' + PV.fmtNum(game.score),
            t('snake.length') + ': ' + game.body.length + ' · ' + t('common.time') + ': ' + PV.fmtTime(st.timeMs),
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
