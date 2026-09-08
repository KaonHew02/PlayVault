/* PlayVault — the shared harness for real-time games.

   Snake, Racing and Tower Defense all need the same scaffolding: a canvas that
   resizes, a fixed-timestep ticker, pause and restart, keyboard bindings, a
   thumb pad on phones, and the end-of-run record. That lives here once.

   Key repeat stays in the harness, not in the engine: the engine keeps seeing
   one discrete action per tick, which is what keeps a run reproducible from its
   seed — the property a versus mode between two friends will be built on.

   The pad is not a fallback. On a phone it is the only control, so its buttons
   repeat while held exactly as the keyboard does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const DAS = 160, ARR = 40;

  /**
   * spec: {
   *   create()                     -> game (a PV.LoopGame)
   *   hz                           default 60
   *   fit(availW, availH)          -> {w, h}; default a square
   *   draw(c, game, geom, api)
   *   keymap                       { 'ArrowLeft': 'left', ... }
   *   repeatable                   ['left','right'] actions that auto-repeat
   *   pad                          [{label, action, aria}] or null
   *   build(api)                   optional: add side panels / HUD to api.side
   *   onFrame(game, api)           optional: called once per painted frame
   *   onPointer(game, pt, geom, api)  optional
   *   outcome(game, {timeMs})      -> {result, xp, score, title, tone, lines}
   * }
   */
  PV.loopHost = function (ctx, spec) {
    let game = null, ticker = null, ended = false, paused = false;
    const held = Object.create(null);

    const wrap = PV.el('div', { class: 'g-loop' });
    const canvas = PV.el('canvas', { class: 'loop-canvas' });
    const side = PV.el('div', { class: 'loop-side' });
    const below = PV.el('div', { class: 'loop-below' });
    const btnPause = PV.el('button', { class: 'btn ghost', onclick: togglePause });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => reset() }, t('common.restart'));
    const bar = PV.el('div', { class: 'game-bar' },
      PV.el('div', { class: 'game-status' }),
      PV.el('div', { class: 'bar-actions' }, btnPause, btnNew));
    const status = bar.querySelector('.game-status');

    const pad = PV.el('div', { class: 'loop-pad' });
    (spec.pad || []).forEach(b => {
      const node = PV.el('button', { class: 'tpad', 'aria-label': b.aria || b.action }, b.label);
      node.addEventListener('pointerdown', e => { e.preventDefault(); press(b.action); });
      node.addEventListener('pointerup', () => release(b.action));
      node.addEventListener('pointercancel', () => release(b.action));
      node.addEventListener('pointerleave', () => release(b.action));
      pad.appendChild(node);
    });
    if (spec.pad && spec.pad.length) pad.style.gridTemplateColumns = 'repeat(' + (spec.padCols || 3) + ', 1fr)';

    wrap.appendChild(bar);
    wrap.appendChild(PV.el('div', { class: 'loop-stage' },
      PV.el('div', { class: 'loop-box' }, canvas), side));
    wrap.appendChild(below);
    if (spec.pad && spec.pad.length) wrap.appendChild(pad);
    ctx.host.appendChild(wrap);

    const api = {
      side: side, below: below, status: status, canvas: canvas,
      get game() { return game; },
      get paused() { return paused; },
      resize: sizeCanvas,
      draw: draw,
      input: a => { if (game && !ended && !paused) game.input(a); },
      finish: finish,
      pause: togglePause
    };

    if (spec.build) spec.build(api);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pv:lang', relabel);
    window.addEventListener('resize', sizeCanvas);
    window.addEventListener('blur', releaseAll);
    canvas.addEventListener('pointerdown', onPointer);

    let cell = 1, geom = { w: 1, h: 1 };
    let startedAt = Date.now();

    reset();

    /* ------------------------------------------------------------------ */

    function reset() {
      releaseAll();
      if (ticker) ticker.stop();
      ended = false; paused = false;
      startedAt = Date.now();
      game = spec.create();
      if (spec.onReset) spec.onReset(game, api);
      sizeCanvas();
      ticker = new PV.Ticker({
        hz: spec.hz || 60,
        onTick: () => {
          if (!game.advance()) { finish(); return false; }
          return true;
        },
        onDraw: draw
      });
      ticker.start();
      relabel();
    }

    function togglePause() {
      if (ended || !ticker) return;
      paused = ticker.pause();
      relabel();
      draw();
    }

    /* ---- input ---- */

    function press(action) {
      if (ended || paused || !game) return;
      game.input(action);
      if ((spec.repeatable || []).indexOf(action) < 0) return;
      if (held[action]) return;
      held[action] = {
        das: setTimeout(() => {
          held[action].arr = setInterval(() => game.input(action), ARR);
        }, DAS)
      };
    }

    function release(action) {
      const h = held[action];
      if (!h) return;
      clearTimeout(h.das);
      clearInterval(h.arr);
      delete held[action];
    }

    function releaseAll() { for (const k in held) release(k); }

    function actionFor(e) {
      const map = spec.keymap || {};
      // e.key for the space bar is ' ' in modern browsers but 'Spacebar' in a
      // few, and some automation reports neither — fall back to e.code.
      return map[e.key] || (e.code === 'Space' ? map[' '] : null) || null;
    }

    function onKeyDown(e) {
      if (!wrap.isConnected) return;
      if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
      const a = actionFor(e);
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;                   // the harness owns repeat
      press(a);
    }

    function onKeyUp(e) {
      const a = actionFor(e);
      if (a) release(a);
    }

    function onPointer(e) {
      if (!spec.onPointer || !game) return;
      const rect = canvas.getBoundingClientRect();
      spec.onPointer(game, { x: e.clientX - rect.left, y: e.clientY - rect.top }, geom, api);
      draw();
    }

    /* ---- painting ---- */

    function sizeCanvas() {
      const box = canvas.parentElement.parentElement.getBoundingClientRect();
      const stage = PV.stage();
      // Below the stacking breakpoint the side panel sits UNDER the canvas, so
      // its width is not the canvas's to give up. Subtracting it anyway is what
      // pinned every real-time game to its floor size on a phone.
      const sideW = (!stage.phone && side.childNodes.length)
        ? side.getBoundingClientRect().width : 0;
      const availW = Math.max(140,
        Math.min(box.width || 320, stage.w) - sideW - (sideW ? 14 : 0));
      const availH = stage.h;
      const size = spec.fit ? spec.fit(availW, availH)
        : { w: Math.min(availW, availH), h: Math.min(availW, availH) };
      geom = { w: size.w, h: size.h, unit: Math.min(size.w, size.h) };
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = size.w + 'px';
      canvas.style.height = size.h + 'px';
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      draw();
    }

    function draw() {
      if (!game) return;
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      spec.draw(c, game, geom, api);
      if (paused) {
        c.fillStyle = 'rgba(11,15,20,.78)';
        c.fillRect(0, 0, geom.w, geom.h);
        c.fillStyle = '#EAF0F7';
        c.font = '600 ' + Math.max(16, geom.w * 0.06) + 'px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText(t('common.pause'), geom.w / 2, geom.h / 2);
      }
      if (spec.onFrame) spec.onFrame(game, api);
    }

    /* ---- end ---- */

    function finish() {
      if (ended) return;
      ended = true;
      releaseAll();
      if (ticker) ticker.stop();
      draw();
      const timeMs = Date.now() - startedAt;
      const res = spec.outcome(game, { timeMs: timeMs });
      const rec = ctx.record({
        result: res.result, score: res.score, timeMs: timeMs, xp: res.xp,
        lowerTimeIsBetter: !!res.lowerTimeIsBetter
      });
      ctx.gameOver({
        title: res.title,
        tone: res.tone,
        lines: (res.lines || []).map(line =>
          line === '@best' ? (rec.newBestScore || rec.newBestTime ? t('result.newBest') : null) : line)
          .concat(rec.xp.gained ? ['+' + rec.xp.gained + ' ' + t('profile.xp')] : []),
        again: reset
      });
    }

    function relabel() {
      btnPause.textContent = paused ? t('common.resume') : t('common.pause');
      btnNew.textContent = t('common.restart');
      if (spec.onRelabel) spec.onRelabel(api);
    }

    return {
      destroy() {
        releaseAll();
        if (ticker) ticker.stop();
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('pv:lang', relabel);
        window.removeEventListener('resize', sizeCanvas);
        window.removeEventListener('blur', releaseAll);
        canvas.removeEventListener('pointerdown', onPointer);
        if (spec.onDestroy) spec.onDestroy();
        wrap.remove();
      }
    };
  };

})(window.PV);
