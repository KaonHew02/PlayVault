/* 黑白棋 / Reversi — view.

   Legal squares are dotted rather than left for the player to work out. In
   Reversi that is not a hint, it is the rules: a beginner who cannot see where
   a move flanks spends the whole game clicking dead squares. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const N = 8;

  PV.ReversiView = function (ctx) {
    return PV.boardHost(ctx, {
      humanSeat: 0,
      maxWidth: 700,

      create: () => new PV.Reversi({ rng: new PV.RNG(PV.newSeed()) }),
      createAI: (level, seat) =>
        new PV.ReversiAI({ seat: seat, level: level, rng: new PV.RNG(PV.newSeed()) }),

      hit(engine, pt, geom) {
        const cell = geom.unit / N;
        return { type: 'place', x: Math.floor(pt.x / cell), y: Math.floor(pt.y / cell) };
      },

      draw(c, engine, geom, api) {
        const size = geom.unit, cell = size / N;

        c.fillStyle = PV.cssVar('--felt', '#1E5B43');
        c.fillRect(0, 0, size, size);

        c.strokeStyle = 'rgba(0,0,0,.35)';
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 1; i < N; i++) {
          c.moveTo(i * cell, 0); c.lineTo(i * cell, size);
          c.moveTo(0, i * cell); c.lineTo(size, i * cell);
        }
        c.stroke();

        // The four guide dots every physical board has.
        c.fillStyle = 'rgba(0,0,0,.4)';
        for (const p of [[2, 2], [6, 2], [2, 6], [6, 6]]) {
          c.beginPath(); c.arc(p[0] * cell, p[1] * cell, Math.max(1.5, cell * 0.07), 0, Math.PI * 2); c.fill();
        }

        const r = cell * 0.40;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const v = engine.at(x, y);
            if (v < 0) continue;
            PV.boardPaint.disc(c, (x + 0.5) * cell, (y + 0.5) * cell, r, v === 1);
          }
        }

        // Where the player may move. Hidden while the computer is thinking.
        if (!engine.over && !api.thinking && (!api.vsAI || engine.turn === api.humanSeat)) {
          c.fillStyle = engine.turn === 0 ? 'rgba(0,0,0,.30)' : 'rgba(255,255,255,.35)';
          for (const m of engine.movesFor(engine.turn)) {
            c.beginPath();
            c.arc((m.x + 0.5) * cell, (m.y + 0.5) * cell, cell * 0.12, 0, Math.PI * 2);
            c.fill();
          }
        }

        if (engine.lastMove) {
          PV.boardPaint.ring(c, (engine.lastMove.x + 0.5) * cell, (engine.lastMove.y + 0.5) * cell,
            r * 0.5, PV.cssVar('--accent', '#F6B32B'), Math.max(1.5, cell * 0.06));
        }
      },

      status(engine, st) {
        const s = engine.score();
        const out = [
          PV.el('span', { class: 'chip' },
            PV.el('span', { class: 'stone-dot black' }), ' ' + s.black),
          PV.el('span', { class: 'chip' },
            PV.el('span', { class: 'stone-dot white' }), ' ' + s.white)
        ];
        if (engine.over) {
          const w = engine.result.winner;
          out.push(PV.el('span', { class: 'turn-label' }, w == null ? t('result.draw')
            : t('result.someoneWins', { who: t(w === 0 ? 'gomoku.black' : 'gomoku.white') })));
          return out;
        }
        out.push(PV.el('span', { class: 'turn-label' }, st.thinking ? t('gomoku.thinking')
          : t('gomoku.turn', { who: t(engine.turn === 0 ? 'gomoku.black' : 'gomoku.white') })));
        if (engine.passed != null) {
          out.push(PV.el('span', { class: 'chip bad' },
            t('reversi.passed', { who: t(engine.passed === 0 ? 'gomoku.black' : 'gomoku.white') })));
        }
        return out;
      },

      outcome(engine, st) {
        const s = engine.score();
        const w = engine.result.winner;
        const drew = w == null;
        const won = w === st.humanSeat;
        const lines = [s.black + ' – ' + s.white];
        if (!st.vsAI) {
          return {
            result: 'played', xp: 15, lines: lines, tone: drew ? 'flat' : 'good',
            title: drew ? t('result.draw')
              : t('result.someoneWins', { who: t(w === 0 ? 'gomoku.black' : 'gomoku.white') })
          };
        }
        if (drew) return { result: 'draw', xp: 20, lines: lines, tone: 'flat', title: t('result.draw') };
        if (won) {
          return {
            result: 'win', xp: { easy: 25, normal: 45, hard: 70 }[st.level] || 45,
            score: s.black, lines: lines, tone: 'good', title: t('result.win')
          };
        }
        return { result: 'lose', xp: 8, lines: lines, tone: 'bad', title: t('result.lose') };
      }
    });
  };

})(window.PV);
