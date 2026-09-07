/* 五子棋 / Gomoku — view.

   Paints from engine state and nothing else. The engine is never asked to
   remember anything for the sake of the screen.

   Undo is done by replaying the move history into a fresh engine rather than by
   giving the engine an undo of its own: it is exact by construction, it costs
   nothing at 225 moves, and it keeps the "engines only move forward" rule that
   the online game will depend on. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const SIZE = 15;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  PV.GomokuView = function (ctx) {
    const opts = ctx.opts || {};
    const vsAI = opts.mode !== 'hotseat';
    const level = opts.level || 'normal';
    const humanSeat = 0;                       // you are always black
    let engine, ai, aiTimer = null, thinking = false, startedAt = Date.now();

    const wrap = PV.el('div', { class: 'g-gomoku' });
    const bar = PV.el('div', { class: 'game-bar' });
    const boardBox = PV.el('div', { class: 'board-box' });
    const canvas = PV.el('canvas', { class: 'board-canvas', 'aria-label': 'Gomoku board' });
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => reset() }, t('common.restart'));
    const status = PV.el('div', { class: 'game-status' });

    boardBox.appendChild(canvas);
    bar.appendChild(status);
    bar.appendChild(PV.el('div', { class: 'bar-actions' }, btnUndo, btnNew));
    wrap.appendChild(bar);
    wrap.appendChild(boardBox);
    ctx.host.appendChild(wrap);

    canvas.addEventListener('pointerdown', onPoint);
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    document.addEventListener('pv:lang', relabel);

    reset();

    /* ------------------------------------------------------------------ */

    function reset() {
      clearTimeout(aiTimer);
      thinking = false;
      startedAt = Date.now();
      engine = new PV.Gomoku({ rng: new PV.RNG(PV.newSeed()) });
      ai = vsAI ? new PV.GomokuAI({ seat: 1, level: level, rng: new PV.RNG(PV.newSeed()) }) : null;
      render();
    }

    function rebuild(history) {
      const fresh = new PV.Gomoku({ rng: new PV.RNG(engine.rng.seed) });
      for (const m of history) fresh.apply({ type: 'place', x: m.x, y: m.y });
      engine = fresh;
    }

    function undo() {
      if (thinking || engine.over && !engine.history.length) return;
      const back = vsAI ? 2 : 1;               // take the AI's reply back too
      if (engine.history.length < back) return;
      rebuild(engine.history.slice(0, engine.history.length - back));
      clearTimeout(aiTimer);
      thinking = false;
      render();
    }

    function onPoint(e) {
      if (engine.over || thinking) return;
      if (vsAI && engine.turn !== humanSeat) return;
      const rect = canvas.getBoundingClientRect();
      const step = rect.width / SIZE;
      const x = Math.round((e.clientX - rect.left - step / 2) / step);
      const y = Math.round((e.clientY - rect.top - step / 2) / step);
      const move = { type: 'place', x: x, y: y };
      if (!engine.apply(move)) return;         // apply() is the only way in
      render();
      if (!engine.over && vsAI) scheduleAI();
    }

    function scheduleAI() {
      thinking = true;
      renderStatus();
      // A beat of delay so a stone does not appear in the same frame as yours.
      aiTimer = setTimeout(() => {
        thinking = false;
        const move = ai.choose(engine);
        if (move) engine.apply(move);
        render();
      }, 260);
    }

    function render() {
      draw();
      renderStatus();
      btnUndo.disabled = thinking || engine.history.length < (vsAI ? 2 : 1);
      if (engine.over) finish();
    }

    function renderStatus() {
      PV.clear(status);
      if (engine.over) {
        const r = engine.result;
        const txt = r.winner == null ? t('result.draw')
          : t('result.someoneWins', { who: t(r.winner === 0 ? 'gomoku.black' : 'gomoku.white') });
        status.appendChild(PV.el('span', { class: 'turn-label' }, txt));
        return;
      }
      const dot = PV.el('span', { class: 'stone-dot ' + (engine.turn === 0 ? 'black' : 'white') });
      const who = t(engine.turn === 0 ? 'gomoku.black' : 'gomoku.white');
      status.appendChild(dot);
      status.appendChild(PV.el('span', { class: 'turn-label' },
        thinking ? t('gomoku.thinking') : t('gomoku.turn', { who: who })));
      if (vsAI) {
        status.appendChild(PV.el('span', { class: 'chip' },
          t('gomoku.youAre', { colour: t('gomoku.black') })));
      }
    }

    function finish() {
      const timeMs = Date.now() - startedAt;
      const won = engine.result.winner === humanSeat;
      const drew = engine.result.winner == null;
      let outcome, title;
      if (!vsAI) {
        outcome = { result: 'played', timeMs: timeMs, xp: 15 };
        title = drew ? t('result.draw')
          : t('result.someoneWins', { who: t(engine.result.winner === 0 ? 'gomoku.black' : 'gomoku.white') });
      } else if (drew) {
        outcome = { result: 'draw', timeMs: timeMs, xp: 15 };
        title = t('result.draw');
      } else if (won) {
        outcome = { result: 'win', timeMs: timeMs, xp: { easy: 25, normal: 45, hard: 70 }[level] || 45 };
        title = t('result.win');
      } else {
        outcome = { result: 'lose', timeMs: timeMs, xp: 8 };
        title = t('result.lose');
      }
      const rec = ctx.record(outcome);
      ctx.gameOver({
        title: title,
        tone: won || (!vsAI && !drew) ? 'good' : (drew ? 'flat' : 'bad'),
        lines: [
          t('common.moves') + ': ' + engine.history.length,
          t('common.time') + ': ' + PV.fmtTime(timeMs),
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: reset
      });
    }

    /* ------------------------------------------------------------------ */

    function draw() {
      const box = boardBox.getBoundingClientRect();
      const css = Math.max(220, Math.min(box.width || 320, 560));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = css + 'px';
      canvas.style.height = css + 'px';
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);

      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const step = css / SIZE, half = step / 2;
      const at = i => half + i * step;

      c.fillStyle = cssVar('--board', '#20262F');
      c.fillRect(0, 0, css, css);

      c.strokeStyle = cssVar('--board-line', '#4A566B');
      c.lineWidth = Math.max(1, step * 0.035);
      c.beginPath();
      for (let i = 0; i < SIZE; i++) {
        c.moveTo(at(0), at(i)); c.lineTo(at(SIZE - 1), at(i));
        c.moveTo(at(i), at(0)); c.lineTo(at(i), at(SIZE - 1));
      }
      c.stroke();

      c.fillStyle = cssVar('--board-line', '#4A566B');
      for (const p of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
        c.beginPath();
        c.arc(at(p[0]), at(p[1]), Math.max(2, step * 0.09), 0, Math.PI * 2);
        c.fill();
      }

      const rStone = step * 0.42;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const v = engine.at(x, y);
          if (v < 0) continue;
          const cx = at(x), cy = at(y);
          const grad = c.createRadialGradient(cx - rStone * 0.35, cy - rStone * 0.4, rStone * 0.1,
                                              cx, cy, rStone);
          if (v === 0) { grad.addColorStop(0, '#4C5666'); grad.addColorStop(1, '#0C1016'); }
          else { grad.addColorStop(0, '#FFFFFF'); grad.addColorStop(1, '#B9C4D2'); }
          c.fillStyle = grad;
          c.beginPath(); c.arc(cx, cy, rStone, 0, Math.PI * 2); c.fill();
        }
      }

      if (engine.lastMove && !engine.winLine) {
        const m = engine.lastMove;
        c.strokeStyle = cssVar('--accent', '#F6B32B');
        c.lineWidth = Math.max(1.5, step * 0.07);
        c.beginPath();
        c.arc(at(m.x), at(m.y), rStone * 0.45, 0, Math.PI * 2);
        c.stroke();
      }

      if (engine.winLine) {
        const a = engine.winLine[0], b = engine.winLine[engine.winLine.length - 1];
        c.strokeStyle = cssVar('--accent', '#F6B32B');
        c.lineCap = 'round';
        c.lineWidth = Math.max(3, step * 0.16);
        c.globalAlpha = 0.9;
        c.beginPath();
        c.moveTo(at(a.x), at(a.y));
        c.lineTo(at(b.x), at(b.y));
        c.stroke();
        c.globalAlpha = 1;
      }
    }

    function relabel() {
      btnUndo.textContent = t('common.undo');
      btnNew.textContent = t('common.restart');
      renderStatus();
    }

    return {
      destroy() {
        clearTimeout(aiTimer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('pv:lang', relabel);
        canvas.removeEventListener('pointerdown', onPoint);
        wrap.remove();
      }
    };
  };

})(window.PV);
