/* 中国象棋 / Xiangqi — view.

   Pieces sit on the intersections, and the river is a gap in the grid rather
   than a row — the vertical lines simply stop at rank 4 and start again at
   rank 5, which is what makes a xiangqi board look like one. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const COLS = 9, ROWS = 10;
  const RED = ['帥', '仕', '相', '馬', '車', '炮', '兵'];
  const BLACK = ['將', '士', '象', '馬', '車', '砲', '卒'];
  const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Heiti SC", serif';

  PV.XiangqiView = function (ctx) {
    let selected = -1, targets = [];

    return PV.boardHost(ctx, {
      humanSeat: 0,
      aspect: ROWS / COLS,
      maxWidth: 640,
      aiDelay: 200,

      create: () => new PV.Xiangqi({ rng: new PV.RNG(PV.newSeed()) }),
      createAI: (level, seat) =>
        new PV.XiangqiAI({ seat: seat, level: level, rng: new PV.RNG(PV.newSeed()) }),

      onReset() { selected = -1; targets = []; },

      hit(engine, pt, geom, api) {
        const step = geom.unit / COLS;
        const f = Math.round(pt.x / step - 0.5), r = Math.round(pt.y / step - 0.5);
        if (f < 0 || f >= COLS || r < 0 || r >= ROWS) return null;
        const sq = r * COLS + f;

        const target = targets.find(m => m.to === sq);
        if (target) { selected = -1; targets = []; return target; }

        const p = engine.cells[sq];
        if (p !== -1 && PV.Xiangqi.side(p) === engine.turn) {
          selected = sq;
          targets = engine.movesFrom(sq);
        } else {
          selected = -1; targets = [];
        }
        api.refresh();
        return null;
      },

      draw(c, engine, geom) {
        const step = geom.unit / COLS;
        const at = i => (i + 0.5) * step;
        const w = geom.unit, h = step * ROWS;

        c.fillStyle = PV.cssVar('--board', '#E3D5B4');
        c.fillRect(0, 0, w, h);

        c.strokeStyle = PV.cssVar('--board-line', '#A38F63');
        c.lineWidth = Math.max(1, step * 0.03);
        c.beginPath();
        for (let r = 0; r < ROWS; r++) { c.moveTo(at(0), at(r)); c.lineTo(at(COLS - 1), at(r)); }
        // Files stop at the river and pick up again on the far bank.
        for (let f = 0; f < COLS; f++) {
          if (f === 0 || f === COLS - 1) { c.moveTo(at(f), at(0)); c.lineTo(at(f), at(ROWS - 1)); }
          else {
            c.moveTo(at(f), at(0)); c.lineTo(at(f), at(4));
            c.moveTo(at(f), at(5)); c.lineTo(at(f), at(ROWS - 1));
          }
        }
        // Palace diagonals.
        for (const top of [0, 7]) {
          c.moveTo(at(3), at(top)); c.lineTo(at(5), at(top + 2));
          c.moveTo(at(5), at(top)); c.lineTo(at(3), at(top + 2));
        }
        c.stroke();

        c.fillStyle = PV.cssVar('--board-line', '#A38F63');
        c.font = '600 ' + Math.round(step * 0.44) + 'px ' + CJK;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('楚 河', at(2), (at(4) + at(5)) / 2);
        c.fillText('漢 界', at(6), (at(4) + at(5)) / 2);

        if (engine.lastMove) {
          c.strokeStyle = PV.cssVar('--accent', '#B67512');
          c.lineWidth = Math.max(1.5, step * 0.05);
          for (const sq of [engine.lastMove.from, engine.lastMove.to]) {
            const x = at(sq % COLS), y = at(Math.floor(sq / COLS));
            c.strokeRect(x - step * 0.46, y - step * 0.46, step * 0.92, step * 0.92);
          }
        }

        const r0 = step * 0.42;
        for (let s = 0; s < COLS * ROWS; s++) {
          const p = engine.cells[s];
          if (p === -1) continue;
          const x = at(s % COLS), y = at(Math.floor(s / COLS));
          const red = PV.Xiangqi.side(p) === 0;
          const ink = red ? '#B3261E' : '#14181F';

          c.fillStyle = '#F6EAD2';
          c.beginPath(); c.arc(x, y, r0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = ink;
          c.lineWidth = Math.max(1.4, step * 0.045);
          c.beginPath(); c.arc(x, y, r0 * 0.86, 0, Math.PI * 2); c.stroke();

          c.fillStyle = ink;
          c.font = '700 ' + Math.round(step * 0.52) + 'px ' + CJK;
          c.fillText((red ? RED : BLACK)[PV.Xiangqi.kind(p)], x, y + step * 0.02);

          if (s === selected) {
            c.strokeStyle = PV.cssVar('--accent', '#B67512');
            c.lineWidth = Math.max(2, step * 0.07);
            c.beginPath(); c.arc(x, y, r0 * 1.02, 0, Math.PI * 2); c.stroke();
          }
        }

        for (const m of targets) {
          const x = at(m.to % COLS), y = at(Math.floor(m.to / COLS));
          if (engine.cells[m.to] !== -1) {
            c.strokeStyle = 'rgba(182,117,18,.95)';
            c.lineWidth = Math.max(2, step * 0.07);
            c.beginPath(); c.arc(x, y, r0 * 1.06, 0, Math.PI * 2); c.stroke();
          } else {
            c.fillStyle = 'rgba(182,117,18,.75)';
            c.beginPath(); c.arc(x, y, step * 0.13, 0, Math.PI * 2); c.fill();
          }
        }
      },

      status(engine, st) {
        const name = seat => t(seat === 0 ? 'xiangqi.red' : 'xiangqi.black');
        if (engine.over) {
          const w = engine.result.winner;
          if (w == null) {
            return [PV.el('span', { class: 'turn-label' }, t('result.draw')),
                    PV.el('span', { class: 'chip' }, t('chess.' + engine.result.reason))];
          }
          return [PV.el('span', { class: 'turn-label' }, t('result.someoneWins', { who: name(w) })),
                  PV.el('span', { class: 'chip' }, t('chess.' + engine.result.reason))];
        }
        const out = [PV.el('span', { class: 'turn-label' }, st.thinking ? t('gomoku.thinking')
          : t('gomoku.turn', { who: name(engine.turn) }))];
        if (engine.inCheck(engine.turn)) out.push(PV.el('span', { class: 'chip bad' }, t('chess.check')));
        return out;
      },

      outcome(engine, st) {
        const name = seat => t(seat === 0 ? 'xiangqi.red' : 'xiangqi.black');
        const w = engine.result.winner;
        const lines = [t('common.moves') + ': ' + Math.ceil(engine.history.length / 2),
                       t('common.time') + ': ' + PV.fmtTime(st.timeMs)];
        if (w == null) {
          return { result: 'draw', xp: 20, tone: 'flat', title: t('result.draw'),
                   lines: lines.concat([t('chess.' + engine.result.reason)]) };
        }
        if (!st.vsAI) {
          return { result: 'played', xp: 20, tone: 'good', lines: lines,
                   title: t('result.someoneWins', { who: name(w) }) };
        }
        if (w === st.humanSeat) {
          return { result: 'win', xp: { easy: 40, normal: 70, hard: 110 }[st.level] || 70,
                   tone: 'good', title: t('result.win'), lines: lines };
        }
        return { result: 'lose', xp: 10, tone: 'bad', title: t('result.lose'), lines: lines };
      }
    });
  };

})(window.PV);
