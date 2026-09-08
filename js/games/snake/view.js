/* 贪吃蛇 / Snake — view.

   A board in a tray, not a grid of cells: a checkerboard field inside a wooden
   frame, one rounded snake drawn as a single stroke, and an apple.

   The snake is painted a fraction of a cell behind where the engine has it. The
   engine still moves a whole cell at a time — that is what keeps a run
   reproducible — but drawing it mid-step is the whole difference between a
   snake that glides and a snake that teleports. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  const FRAME = '#B4512B';       // the tray the board sits in
  const FIELD_A = '#F6C15A';     // the two checkerboard squares
  const FIELD_B = '#EFAE3C';
  const BODY = '#2F6FE0';
  const BODY_EDGE = '#1B478F';
  const HEAD = '#3C7DF0';

  /** The food, drawn as an apple: a dot is a pixel, an apple is a target. */
  function apple(c, p, cell) {
    const r = cell * 0.34;
    c.fillStyle = '#C62828';
    c.beginPath();
    c.arc(p.x, p.y + r * 0.12, r, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = '#6B4423';
    c.lineWidth = Math.max(1, cell * 0.06);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(p.x, p.y - r * 0.5);
    c.lineTo(p.x + r * 0.14, p.y - r * 1.05);
    c.stroke();

    c.fillStyle = '#3E9B4F';
    c.beginPath();
    c.ellipse(p.x + r * 0.5, p.y - r * 0.92, r * 0.34, r * 0.18, -0.5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath();
    c.ellipse(p.x - r * 0.34, p.y - r * 0.18, r * 0.20, r * 0.13, -0.6, 0, Math.PI * 2);
    c.fill();
  }

  /** The head: rounder than the body, with eyes that turn with it. */
  function head(c, p, dir, cell) {
    c.fillStyle = HEAD;
    c.beginPath();
    c.arc(p.x, p.y, cell * 0.45, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = BODY_EDGE;
    c.lineWidth = Math.max(1, cell * 0.08);
    c.stroke();

    const px = -dir.y, py = dir.x;                 // across the direction of travel
    for (const side of [-1, 1]) {
      const ex = p.x + dir.x * cell * 0.15 + px * side * cell * 0.21;
      const ey = p.y + dir.y * cell * 0.15 + py * side * cell * 0.21;
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.arc(ex, ey, cell * 0.14, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#12203A';
      c.beginPath();
      c.arc(ex + dir.x * cell * 0.05, ey + dir.y * cell * 0.05, cell * 0.07, 0, Math.PI * 2);
      c.fill();
    }
  }

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
        const s = Math.max(200, Math.min(availW, availH, 720));
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
        const frame = Math.max(7, Math.min(geom.w, geom.h) * 0.026);
        const cell = Math.min((geom.w - frame * 2) / game.cols,
                              (geom.h - frame * 2) / game.rows);
        const fieldW = cell * game.cols, fieldH = cell * game.rows;
        const ox = (geom.w - fieldW) / 2, oy = (geom.h - fieldH) / 2;
        const pt = s => ({ x: ox + (s.x + 0.5) * cell, y: oy + (s.y + 0.5) * cell });

        c.fillStyle = FRAME;
        c.beginPath();
        if (c.roundRect) c.roundRect(0, 0, geom.w, geom.h, frame * 1.3);
        else c.rect(0, 0, geom.w, geom.h);
        c.fill();

        for (let y = 0; y < game.rows; y++) {
          for (let x = 0; x < game.cols; x++) {
            c.fillStyle = ((x + y) & 1) ? FIELD_B : FIELD_A;
            // Half a pixel of overlap: at fractional cell sizes the seams
            // between squares otherwise show as a paler grid.
            c.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
          }
        }

        if (!game.walls) {
          // Open edges are worth saying out loud, or the first wrap looks like
          // a bug rather than the option that was chosen.
          c.strokeStyle = 'rgba(255,255,255,.55)';
          c.lineWidth = Math.max(2, cell * 0.10);
          c.setLineDash([cell * 0.45, cell * 0.45]);
          c.strokeRect(ox, oy, fieldW, fieldH);
          c.setLineDash([]);
        }

        if (game.food) apple(c, pt(game.food), cell);

        /* ---- the snake, as one stroked line ---- */

        const b = game.body, n = b.length;
        const prog = PV.clamp(game.since / Math.max(1, game.stepTicks()), 0, 1);
        const adj = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
        const slide = (from, to) => {
          const a = pt(from), z = pt(to);
          return { x: a.x + (z.x - a.x) * prog, y: a.y + (z.y - a.y) * prog };
        };

        const pts = [];
        pts.push(n > 1 && adj(b[0], b[1]) ? slide(b[1], b[0]) : pt(b[0]));
        for (let i = 1; i < n - 1; i++) pts.push(pt(b[i]));
        if (n > 1) {
          // While growing, the tail stays put — sliding it would eat the very
          // segment the snake just gained.
          const still = game.grow > 0 || !adj(b[n - 1], b[n - 2]);
          pts.push(still ? pt(b[n - 1]) : slide(b[n - 1], b[n - 2]));
        }

        // A wrapped snake is two lines, not one line across the whole board.
        const runs = [[pts[0]]];
        for (let i = 1; i < pts.length; i++) {
          const gap = Math.abs(pts[i].x - pts[i - 1].x) > cell * 1.6
            || Math.abs(pts[i].y - pts[i - 1].y) > cell * 1.6;
          if (gap) runs.push([pts[i]]); else runs[runs.length - 1].push(pts[i]);
        }

        c.lineCap = 'round';
        c.lineJoin = 'round';
        for (const pass of [[BODY_EDGE, cell * 0.90], [BODY, cell * 0.74]]) {
          c.strokeStyle = pass[0];
          c.fillStyle = pass[0];
          c.lineWidth = pass[1];
          for (const run of runs) {
            if (run.length < 2) {                       // a one-cell run is a dot
              c.beginPath();
              c.arc(run[0].x, run[0].y, pass[1] / 2, 0, Math.PI * 2);
              c.fill();
              continue;
            }
            c.beginPath();
            c.moveTo(run[0].x, run[0].y);
            for (let i = 1; i < run.length; i++) c.lineTo(run[i].x, run[i].y);
            c.stroke();
          }
        }

        head(c, pts[0], game.dir, cell);
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
