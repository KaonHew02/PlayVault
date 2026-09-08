/* PlayVault — the shared harness for turn-based board games.

   五子棋, 黑白棋, Chess and 象棋 differ in their rules and in how they are
   drawn. Everything AROUND that is identical: a canvas that resizes with the
   window, a status line, undo, restart, an AI that answers after a beat, and
   the end-of-game record. That part lives here once.

   A game supplies a spec — create(), draw(), hit(), status(), outcome() — and
   gets the rest. It never manages the ticker, the canvas, or the profile.

   Undo replays the move history into a FRESH engine rather than unwinding the
   old one. It is exact by construction, it costs nothing at board-game move
   counts, and it keeps the "engines only ever move forward" rule that the
   online game will depend on. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  PV.cssVar = function (name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  /**
   * spec: {
   *   create()                          -> engine
   *   createAI(level, seat)             -> ai with choose(engine), or null
   *   humanSeat                         default 0
   *   aspect                            canvas height / width, default 1
   *   maxWidth                          default 760
   *   aiDelay                           default 260
   *   undoStep(vsAI)                    plies to take back, default 2 / 1
   *   draw(c, engine, geom, api)        paint; geom = {w, h, unit}
   *   hit(engine, pt, geom, api)        pointer -> move | null (may act itself)
   *   status(engine, state)             -> array of nodes
   *   outcome(engine, state)            -> {result, xp, score?, title, tone, lines}
   * }
   */
  PV.boardHost = function (ctx, spec) {
    const opts = ctx.opts || {};
    const vsAI = opts.mode !== 'hotseat';
    const level = opts.level || 'normal';
    const humanSeat = spec.humanSeat == null ? 0 : spec.humanSeat;
    const aspect = spec.aspect || 1;
    const maxWidth = spec.maxWidth || 760;

    let engine = null, ai = null, aiTimer = null;
    let thinking = false, ended = false, startedAt = Date.now();

    const wrap = PV.el('div', { class: 'g-board' });
    const status = PV.el('div', { class: 'game-status' });
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => reset() }, t('common.restart'));
    const boardBox = PV.el('div', { class: 'board-box' });
    const canvas = PV.el('canvas', { class: 'board-canvas' });
    const extra = PV.el('div', { class: 'board-extra' });

    boardBox.appendChild(canvas);
    wrap.appendChild(PV.el('div', { class: 'game-bar' }, status,
      PV.el('div', { class: 'bar-actions' }, btnUndo, btnNew)));
    wrap.appendChild(boardBox);
    wrap.appendChild(extra);
    ctx.host.appendChild(wrap);

    canvas.addEventListener('pointerdown', onPoint);
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    document.addEventListener('pv:lang', relabel);

    const api = {
      vsAI: vsAI,
      level: level,
      humanSeat: humanSeat,
      extra: extra,
      get engine() { return engine; },
      get thinking() { return thinking; },
      refresh: render,
      play: play
    };

    reset();

    /* ------------------------------------------------------------------ */

    function reset() {
      clearTimeout(aiTimer);
      thinking = false;
      ended = false;
      startedAt = Date.now();
      engine = spec.create();
      ai = vsAI && spec.createAI ? spec.createAI(level, 1 - humanSeat) : null;
      if (spec.onReset) spec.onReset(engine, api);
      render();
      if (vsAI && engine.turn !== humanSeat && !engine.over) scheduleAI();
    }

    function rebuild(history) {
      const fresh = spec.create();
      for (const m of history) {
        const move = Object.assign({}, m);
        delete move.seat;
        fresh.apply(move);
      }
      engine = fresh;
      if (spec.onReset) spec.onReset(engine, api);
    }

    function undo() {
      if (thinking || !engine.history.length) return;
      const back = spec.undoStep ? spec.undoStep(vsAI) : (vsAI ? 2 : 1);
      const n = Math.min(back, engine.history.length);
      // Never leave the board on the AI's turn after an undo.
      let target = engine.history.length - n;
      rebuild(engine.history.slice(0, target));
      while (vsAI && engine.turn !== humanSeat && !engine.over && target > 0) {
        target--;
        rebuild(engine.history.slice(0, target));
      }
      clearTimeout(aiTimer);
      thinking = false;
      ended = false;
      const layer = wrap.querySelector('.over-layer');
      if (layer) layer.remove();
      render();
    }

    /** The only path a move takes, whoever made it. */
    function play(move) {
      if (!move || engine.over) return false;
      if (!engine.apply(move)) return false;
      render();
      if (!engine.over && vsAI && engine.turn !== humanSeat) scheduleAI();
      return true;
    }

    function onPoint(e) {
      if (engine.over || thinking) return;
      if (vsAI && engine.turn !== humanSeat) return;
      const rect = canvas.getBoundingClientRect();
      const geom = geometry(rect.width, rect.height);
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const move = spec.hit(engine, pt, geom, api);
      if (move) play(move);
    }

    function scheduleAI() {
      if (!ai) return;
      thinking = true;
      renderStatus();
      aiTimer = setTimeout(() => {
        thinking = false;
        const move = ai.choose(engine);
        if (move) engine.apply(move);
        render();
        // Reversi and Xiangqi can hand the turn straight back to the computer.
        if (!engine.over && vsAI && engine.turn !== humanSeat) scheduleAI();
      }, spec.aiDelay || 260);
    }

    function render() {
      draw();
      renderStatus();
      btnUndo.disabled = thinking || !engine.history.length;
      if (spec.onRender) spec.onRender(engine, api);
      if (engine.over && !ended) finish();
    }

    function renderStatus() {
      PV.clear(status);
      const nodes = spec.status(engine, { thinking: thinking, vsAI: vsAI, humanSeat: humanSeat }) || [];
      for (const n of nodes) if (n) status.appendChild(n);
    }

    function finish() {
      ended = true;
      const timeMs = Date.now() - startedAt;
      const res = spec.outcome(engine, {
        vsAI: vsAI, level: level, humanSeat: humanSeat, timeMs: timeMs
      });
      const rec = ctx.record({
        result: res.result, score: res.score, timeMs: timeMs, xp: res.xp,
        lowerTimeIsBetter: !!res.lowerTimeIsBetter
      });
      ctx.gameOver({
        title: res.title,
        tone: res.tone,
        lines: (res.lines || []).concat(
          rec.xp.gained ? ['+' + rec.xp.gained + ' ' + t('profile.xp')] : []),
        again: reset
      });
    }

    function geometry(w, h) {
      return { w: w, h: h, unit: Math.min(w, h / aspect) };
    }

    function draw() {
      const box = boardBox.getBoundingClientRect();
      const avail = Math.max(200, Math.min(box.width || 320, maxWidth, PV.stage().w));
      const maxH = PV.stage().h;
      const w = Math.min(avail, maxH / aspect);
      const h = w * aspect;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      spec.draw(c, engine, geometry(w, h), api);
    }

    function relabel() {
      btnUndo.textContent = t('common.undo');
      btnNew.textContent = t('common.restart');
      render();
    }

    return {
      destroy() {
        clearTimeout(aiTimer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('pv:lang', relabel);
        canvas.removeEventListener('pointerdown', onPoint);
        if (spec.onDestroy) spec.onDestroy();
        wrap.remove();
      }
    };
  };

  /* ---- painting helpers shared by the board games ---- */

  PV.boardPaint = {
    /** A disc with a soft top-left highlight, used for stones and discs. */
    disc(c, cx, cy, r, light) {
      const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      if (light) { g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#B9C4D2'); }
      else { g.addColorStop(0, '#4C5666'); g.addColorStop(1, '#0C1016'); }
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    },

    ring(c, cx, cy, r, colour, width) {
      c.strokeStyle = colour;
      c.lineWidth = width;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    }
  };

})(window.PV);
