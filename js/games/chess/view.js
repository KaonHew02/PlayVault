/* Chess — view.

   Select a piece and its legal destinations are dotted; captures get a ring
   instead of a dot. The list comes straight from legalMoves(), so a pinned
   piece simply shows nothing — the board never offers a move the engine would
   refuse.

   Promotion asks. Auto-queening is right about 95% of the time and infuriating
   the other 5%, and under-promotion to a knight is a real move. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const GLYPH = ['♟', '♞', '♝', '♜', '♛', '♚'];
  const FONT = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';

  PV.ChessView = function (ctx) {
    let selected = -1, targets = [], pending = null;

    return PV.boardHost(ctx, {
      humanSeat: 0,
      maxWidth: 760,
      aiDelay: 200,

      create: () => new PV.Chess({ rng: new PV.RNG(PV.newSeed()) }),
      createAI: (level, seat) =>
        new PV.ChessAI({ seat: seat, level: level, rng: new PV.RNG(PV.newSeed()) }),

      onReset(engine, api) {
        selected = -1; targets = []; pending = null;
        PV.clear(api.extra);
      },

      hit(engine, pt, geom, api) {
        const cell = geom.unit / 8;
        const f = Math.floor(pt.x / cell), r = Math.floor(pt.y / cell);
        if (f < 0 || f > 7 || r < 0 || r > 7) return null;
        const sq = r * 8 + f;

        const hits = targets.filter(m => m.to === sq);
        if (hits.length === 1) { clearSel(api); return hits[0]; }
        if (hits.length > 1) { askPromotion(hits, api); return null; }

        const piece = engine.cells[sq];
        if (piece !== -1 && PV.Chess.side(piece) === engine.turn) {
          selected = sq;
          targets = engine.movesFrom(sq);
        } else {
          selected = -1; targets = [];
        }
        PV.clear(api.extra);
        pending = null;
        api.refresh();
        return null;
      },

      draw(c, engine, geom) {
        const size = geom.unit, cell = size / 8;
        const light = PV.cssVar('--sq-light', '#E9E2D0');
        const dark = PV.cssVar('--sq-dark', '#7E8AA0');

        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            c.fillStyle = ((r + f) & 1) ? dark : light;
            c.fillRect(f * cell, r * cell, cell, cell);
          }
        }

        const lm = engine.lastMove;
        if (lm) {
          c.fillStyle = 'rgba(246,179,43,.28)';
          for (const sq of [lm.from, lm.to]) {
            c.fillRect((sq & 7) * cell, (sq >> 3) * cell, cell, cell);
          }
        }

        if (selected >= 0) {
          c.fillStyle = 'rgba(246,179,43,.42)';
          c.fillRect((selected & 7) * cell, (selected >> 3) * cell, cell, cell);
        }

        // A king in check is the one thing that must never be missed.
        if (!engine.over && engine.inCheck(engine.turn)) {
          const ks = engine.kingSquare(engine.turn);
          if (ks >= 0) {
            c.fillStyle = 'rgba(216,69,59,.45)';
            c.fillRect((ks & 7) * cell, (ks >> 3) * cell, cell, cell);
          }
        }

        c.font = Math.round(cell * 0.78) + 'px ' + FONT;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let s = 0; s < 64; s++) {
          const p = engine.cells[s];
          if (p === -1) continue;
          const x = (s & 7) * cell + cell / 2, y = (s >> 3) * cell + cell * 0.54;
          const white = PV.Chess.side(p) === 0;
          // Stroke FIRST, then fill over it. The other way round, the outline's
          // inner half covers the glyph's thin interior and every piece comes
          // out the colour of the outline — white and black look identical.
          c.lineWidth = Math.max(1.5, cell * 0.06);
          c.lineJoin = 'round';
          c.strokeStyle = white ? '#20293A' : '#05080C';
          c.strokeText(GLYPH[PV.Chess.kind(p)], x, y);
          c.fillStyle = white ? '#FFFFFF' : '#1B2230';
          c.fillText(GLYPH[PV.Chess.kind(p)], x, y);
        }

        for (const m of targets) {
          const x = (m.to & 7) * cell + cell / 2, y = (m.to >> 3) * cell + cell / 2;
          if (engine.cells[m.to] !== -1) {
            c.strokeStyle = 'rgba(246,179,43,.9)';
            c.lineWidth = Math.max(2, cell * 0.07);
            c.beginPath(); c.arc(x, y, cell * 0.40, 0, Math.PI * 2); c.stroke();
          } else {
            c.fillStyle = 'rgba(246,179,43,.75)';
            c.beginPath(); c.arc(x, y, cell * 0.14, 0, Math.PI * 2); c.fill();
          }
        }
      },

      status(engine, st) {
        if (engine.over) {
          const w = engine.result.winner;
          if (w == null) {
            return [PV.el('span', { class: 'turn-label' }, t('result.draw')),
                    PV.el('span', { class: 'chip' }, t('chess.' + engine.result.reason))];
          }
          return [PV.el('span', { class: 'turn-label' },
            t('result.someoneWins', { who: t(w === 0 ? 'chess.white' : 'chess.black') })),
            PV.el('span', { class: 'chip' }, t('chess.checkmate'))];
        }
        const out = [
          PV.el('span', { class: 'stone-dot ' + (engine.turn === 0 ? 'white' : 'black') }),
          PV.el('span', { class: 'turn-label' }, st.thinking ? t('gomoku.thinking')
            : t('gomoku.turn', { who: t(engine.turn === 0 ? 'chess.white' : 'chess.black') }))
        ];
        if (engine.inCheck(engine.turn)) out.push(PV.el('span', { class: 'chip bad' }, t('chess.check')));
        const diff = engine.material(0) - engine.material(1);
        if (diff) out.push(PV.el('span', { class: 'chip' }, (diff > 0 ? '+' : '') + diff));
        return out;
      },

      outcome(engine, st) {
        const w = engine.result.winner;
        const lines = [t('common.moves') + ': ' + Math.ceil(engine.history.length / 2),
                       t('common.time') + ': ' + PV.fmtTime(st.timeMs)];
        if (w == null) {
          return {
            result: 'draw', xp: 20, tone: 'flat',
            title: t('result.draw'), lines: lines.concat([t('chess.' + engine.result.reason)])
          };
        }
        if (!st.vsAI) {
          return {
            result: 'played', xp: 20, tone: 'good', lines: lines,
            title: t('result.someoneWins', { who: t(w === 0 ? 'chess.white' : 'chess.black') })
          };
        }
        if (w === st.humanSeat) {
          return {
            result: 'win', xp: { easy: 40, normal: 70, hard: 110 }[st.level] || 70,
            tone: 'good', title: t('result.win'), lines: lines
          };
        }
        return { result: 'lose', xp: 10, tone: 'bad', title: t('result.lose'), lines: lines };
      }
    });

    function clearSel(api) {
      selected = -1; targets = []; pending = null;
      PV.clear(api.extra);
    }

    function askPromotion(hits, api) {
      pending = hits;
      PV.clear(api.extra);
      const row = PV.el('div', { class: 'promo-row' },
        PV.el('span', { class: 'k' }, t('chess.promote')));
      for (const m of hits) {
        row.appendChild(PV.el('button', {
          class: 'btn ghost promo',
          onclick: () => { clearSel(api); api.play(m); }
        }, GLYPH[{ q: 4, r: 3, b: 2, n: 1 }[m.promo]]));
      }
      api.extra.appendChild(row);
      api.refresh();
    }
  };

})(window.PV);
