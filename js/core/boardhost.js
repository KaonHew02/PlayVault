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
   online game depends on.

   ONLINE (ctx.room): host authority, and the guest is not a spectator — it
   runs its own engine and applies the host's accepted moves into it. That is
   only sound because these four games are full information and deterministic:
   there is nothing in a chess position a guest is not allowed to see, and
   replaying the same moves into a fresh engine gives the same board every
   time. So a guest gets legalMoves(), move highlighting and the end-of-game
   test for free, and there is no second rendering path to keep in step.

   The rule that makes it authority rather than trust: a move goes out as an
   ASK, never applied locally. The host validates it against its own engine
   through apply() and posts the accepted move back to everyone, itself
   included. Both players therefore take exactly the same path, and a guest
   that disagrees about the position asks for the move list and rebuilds. */
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
    const room = (ctx.room && ctx.room.phase === 'playing') ? ctx.room : null;
    const online = !!room;
    const vsAI = !online && opts.mode !== 'hotseat';
    const level = opts.level || 'normal';
    // Online, the chair is the seat the room gave us: the host opens, the guest
    // answers. Everywhere else the game says which side the player has.
    const humanSeat = online ? (room.seat === 0 ? 0 : 1)
      : (spec.humanSeat == null ? 0 : spec.humanSeat);
    const aspect = spec.aspect || 1;
    const maxWidth = spec.maxWidth || 760;

    let engine = null, ai = null, aiTimer = null, net = null;
    let thinking = false, ended = false, startedAt = Date.now();

    const wrap = PV.el('div', { class: 'g-board' });
    const status = PV.el('div', { class: 'game-status' });
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnNew = PV.el('button', {
      class: 'btn ghost',
      onclick: () => (online ? net.rematch() : reset())
    }, t('common.restart'));
    const boardBox = PV.el('div', { class: 'board-box' });
    const canvas = PV.el('canvas', { class: 'board-canvas' });
    const extra = PV.el('div', { class: 'board-extra' });
    // Undo cannot mean anything with two engines running: taking a move back on
    // one board is exactly the disagreement the resync exists to prevent.
    btnUndo.hidden = online;
    btnNew.hidden = online && !room.isHost;
    if (online) btnNew.textContent = t('room.rematch');

    const roomBar = online ? PV.RoomUI.gameBar(room) : null;
    boardBox.appendChild(canvas);
    if (roomBar) wrap.appendChild(roomBar.node);
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
      online: online,
      level: level,
      humanSeat: humanSeat,
      extra: extra,
      get engine() { return engine; },
      get thinking() { return thinking; },
      refresh: render,
      play: play
    };

    reset();
    if (online) wireRoom();

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
      if (online || thinking || !engine.history.length) return;
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
      // Online a move is a REQUEST. Applying it here as well would mean playing
      // on a board the host has not agreed to, and the two would drift apart
      // the first time a move was refused.
      if (online) return net.request(move);
      if (!engine.apply(move)) return false;
      render();
      if (!engine.over && vsAI && engine.turn !== humanSeat) scheduleAI();
      return true;
    }

    function onPoint(e) {
      if (engine.over || thinking) return;
      if ((vsAI || online) && engine.turn !== humanSeat) return;
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

    /* ------------------------------------------------------------ online */

    /* The wire protocol itself is in boardnet.js, where it can be driven
       headless. This end supplies the four things it needs from a screen. */
    function wireRoom() {
      net = PV.boardNet(room, {
        engine: () => engine,
        rebuild(history) { rebuild(history); ended = false; },
        changed: render,
        restart() { reset(); },
        gone: kind => gone(kind === 'host' ? t('room.hostLeft') : t('room.opponentLeft'))
      });
      room.on('roster', renderStatus);
    }

    /** Nobody left to play. No result is recorded — an abandoned game is not a win. */
    function gone(title) {
      if (ended) return;
      ended = true;
      clearTimeout(aiTimer);
      ctx.gameOver({ title: title, tone: 'flat', lines: [t('room.noResult')], again: false });
    }

    function paintRoom() {
      if (!roomBar) return;
      const values = {};
      for (const m of room.members) {
        values[m.seat] = (!engine.over && m.alive && engine.turn === m.seat)
          ? { text: t('room.toMove'), tone: 'turn' } : {};
      }
      roomBar.players.update(values);
      roomBar.say(engine.over ? t('room.finished')
        : (engine.turn === humanSeat ? t('room.yourTurn')
          : t('room.theirTurn', { name: room.nameFor(1 - humanSeat) })),
        engine.turn === humanSeat && !engine.over ? 'you' : '');
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
      const nodes = spec.status(engine, {
        thinking: thinking, vsAI: vsAI, online: online, humanSeat: humanSeat
      }) || [];
      for (const n of nodes) if (n) status.appendChild(n);
      paintRoom();
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
      btnNew.textContent = online ? t('room.rematch') : t('common.restart');
      render();
    }

    return {
      destroy() {
        clearTimeout(aiTimer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('pv:lang', relabel);
        canvas.removeEventListener('pointerdown', onPoint);
        if (net) net.destroy();
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
