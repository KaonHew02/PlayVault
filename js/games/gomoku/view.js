/* 五子棋 / Gomoku — view.

   Stones sit on the intersections, not in the squares, so the geometry is a
   half-step in from each edge. Everything else — sizing, undo, the computer's
   turn, the end-of-game card — comes from PV.boardHost. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const SIZE = 15;
  const STARS = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];

  PV.GomokuView = function (ctx) {
    return PV.boardHost(ctx, {
      humanSeat: 0,

      create: () => new PV.Gomoku({ rng: new PV.RNG(PV.newSeed()) }),
      createAI: (level, seat) =>
        new PV.GomokuAI({ seat: seat, level: level, rng: new PV.RNG(PV.newSeed()) }),

      hit(engine, pt, geom) {
        const step = geom.unit / SIZE;
        return {
          type: 'place',
          x: Math.round((pt.x - step / 2) / step),
          y: Math.round((pt.y - step / 2) / step)
        };
      },

      draw(c, engine, geom) {
        const size = geom.unit, step = size / SIZE;
        const at = i => step / 2 + i * step;

        c.fillStyle = PV.cssVar('--board', '#20262F');
        c.fillRect(0, 0, size, size);

        c.strokeStyle = PV.cssVar('--board-line', '#4A566B');
        c.lineWidth = Math.max(1, step * 0.035);
        c.beginPath();
        for (let i = 0; i < SIZE; i++) {
          c.moveTo(at(0), at(i)); c.lineTo(at(SIZE - 1), at(i));
          c.moveTo(at(i), at(0)); c.lineTo(at(i), at(SIZE - 1));
        }
        c.stroke();

        c.fillStyle = PV.cssVar('--board-line', '#4A566B');
        for (const p of STARS) {
          c.beginPath();
          c.arc(at(p[0]), at(p[1]), Math.max(2, step * 0.09), 0, Math.PI * 2);
          c.fill();
        }

        const r = step * 0.42;
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const v = engine.at(x, y);
            if (v >= 0) PV.boardPaint.disc(c, at(x), at(y), r, v === 1);
          }
        }

        if (engine.lastMove && !engine.winLine) {
          PV.boardPaint.ring(c, at(engine.lastMove.x), at(engine.lastMove.y), r * 0.45,
            PV.cssVar('--accent', '#F6B32B'), Math.max(1.5, step * 0.07));
        }

        if (engine.winLine) {
          const a = engine.winLine[0], b = engine.winLine[engine.winLine.length - 1];
          c.strokeStyle = PV.cssVar('--accent', '#F6B32B');
          c.lineCap = 'round';
          c.lineWidth = Math.max(3, step * 0.16);
          c.globalAlpha = 0.9;
          c.beginPath();
          c.moveTo(at(a.x), at(a.y));
          c.lineTo(at(b.x), at(b.y));
          c.stroke();
          c.globalAlpha = 1;
        }
      },

      status(engine, st) {
        if (engine.over) {
          const w = engine.result.winner;
          return [PV.el('span', { class: 'turn-label' }, w == null ? t('result.draw')
            : t('result.someoneWins', { who: t(w === 0 ? 'gomoku.black' : 'gomoku.white') }))];
        }
        const out = [
          PV.el('span', { class: 'stone-dot ' + (engine.turn === 0 ? 'black' : 'white') }),
          PV.el('span', { class: 'turn-label' }, st.thinking ? t('gomoku.thinking')
            : t('gomoku.turn', { who: t(engine.turn === 0 ? 'gomoku.black' : 'gomoku.white') }))
        ];
        if (st.vsAI) {
          out.push(PV.el('span', { class: 'chip' },
            t('gomoku.youAre', { colour: t('gomoku.black') })));
        }
        return out;
      },

      outcome(engine, st) {
        const w = engine.result.winner;
        const drew = w == null;
        const won = w === st.humanSeat;
        const lines = [t('common.moves') + ': ' + engine.history.length,
                       t('common.time') + ': ' + PV.fmtTime(st.timeMs)];
        if (!st.vsAI) {
          return {
            result: 'played', xp: 15, lines: lines, tone: drew ? 'flat' : 'good',
            title: drew ? t('result.draw')
              : t('result.someoneWins', { who: t(w === 0 ? 'gomoku.black' : 'gomoku.white') })
          };
        }
        if (drew) return { result: 'draw', xp: 15, lines: lines, tone: 'flat', title: t('result.draw') };
        if (won) {
          return {
            result: 'win', xp: { easy: 25, normal: 45, hard: 70 }[st.level] || 45,
            lines: lines, tone: 'good', title: t('result.win')
          };
        }
        return { result: 'lose', xp: 8, lines: lines, tone: 'bad', title: t('result.lose') };
      }
    });
  };

})(window.PV);
