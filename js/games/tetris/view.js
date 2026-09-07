/* Tetris — view.

   The ticker owns the clock; this file only paints and collects input. Key
   repeat (DAS/ARR) lives here rather than in the engine so the engine keeps
   seeing one discrete action per tick, which is what keeps a run reproducible.

   The on-screen buttons are not a fallback. On a phone they are the only
   controls, so they are laid out for thumbs and they repeat while held, the
   same as the keyboard. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  const COLOURS = {
    I: '#38BDF8', J: '#5B7CFA', L: '#F59E0B', O: '#FACC15',
    S: '#34D399', T: '#C084FC', Z: '#F87171'
  };
  const DAS = 160, ARR = 40;   // ms before repeat, ms between repeats

  PV.TetrisView = function (ctx) {
    let game, ticker, ended = false, paused = false;
    // Declared up here, not beside sizeCanvas(): reset() runs before the tail of
    // this closure, and a `let` further down would still be in its dead zone.
    let cell = 22;
    const held = Object.create(null);

    const wrap = PV.el('div', { class: 'g-tetris' });
    const canvas = PV.el('canvas', { class: 'well-canvas', 'aria-label': 'Tetris well' });

    const scoreEl = PV.el('b', {}, '0');
    const linesEl = PV.el('b', {}, '0');
    const levelEl = PV.el('b', {}, '1');
    const holdCv = PV.el('canvas', { class: 'mini-canvas', width: 96, height: 72 });
    const nextCv = PV.el('canvas', { class: 'mini-canvas tall', width: 96, height: 216 });

    const btnPause = PV.el('button', { class: 'btn ghost', onclick: togglePause });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => reset() }, t('common.restart'));

    const side = PV.el('div', { class: 'tetris-side' },
      PV.el('div', { class: 'panel-mini' }, PV.el('span', { class: 'k' }, t('tetris.hold')), holdCv),
      PV.el('div', { class: 'panel-mini' }, PV.el('span', { class: 'k' }, t('tetris.next')), nextCv),
      PV.el('div', { class: 'panel-mini stats' },
        PV.el('span', { class: 'k' }, t('common.score')), scoreEl,
        PV.el('span', { class: 'k' }, t('tetris.lines')), linesEl,
        PV.el('span', { class: 'k' }, t('common.level')), levelEl)
    );

    const padBtn = (label, action, aria) => {
      const b = PV.el('button', { class: 'tpad', 'aria-label': aria || action }, label);
      b.addEventListener('pointerdown', e => { e.preventDefault(); press(action); });
      b.addEventListener('pointerup', () => release(action));
      b.addEventListener('pointercancel', () => release(action));
      b.addEventListener('pointerleave', () => release(action));
      return b;
    };
    const pad = PV.el('div', { class: 'tetris-pad' },
      padBtn('◀', 'left', 'left'), padBtn('▼', 'softDrop', 'soft drop'), padBtn('▶', 'right', 'right'),
      padBtn('⟳', 'rotateCW', 'rotate'), padBtn('⤓', 'hardDrop', 'hard drop'), padBtn('⇄', 'hold', 'hold'));

    const bar = PV.el('div', { class: 'game-bar' },
      PV.el('div', { class: 'game-status' },
        PV.el('span', { class: 'chip hide-sm' }, t('tetris.controls'))),
      PV.el('div', { class: 'bar-actions' }, btnPause, btnNew));

    wrap.appendChild(bar);
    wrap.appendChild(PV.el('div', { class: 'tetris-stage' },
      PV.el('div', { class: 'well-box' }, canvas), side));
    wrap.appendChild(pad);
    ctx.host.appendChild(wrap);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pv:lang', relabel);
    window.addEventListener('resize', sizeCanvas);
    window.addEventListener('blur', releaseAll);

    reset();

    /* ------------------------------------------------------------------ */

    function reset() {
      releaseAll();
      if (ticker) ticker.stop();
      ended = false; paused = false;
      game = new PV.Tetris({ seed: PV.newSeed() });
      sizeCanvas();
      ticker = new PV.Ticker({
        hz: 60,
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
      if (ended) return;
      paused = ticker.pause();
      relabel();
      draw();
    }

    /* ---- input ---- */

    function press(action) {
      if (ended) return;
      if (paused && action !== 'pause') return;
      game.input(action);
      if (action === 'left' || action === 'right' || action === 'softDrop') {
        if (held[action]) return;
        held[action] = { das: setTimeout(() => {
          held[action].arr = setInterval(() => game.input(action), ARR);
        }, DAS) };
      }
    }

    function release(action) {
      const h = held[action];
      if (!h) return;
      clearTimeout(h.das);
      clearInterval(h.arr);
      delete held[action];
    }

    function releaseAll() { for (const k in held) release(k); }

    const KEYMAP = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'softDrop',
      ArrowUp: 'rotateCW', x: 'rotateCW', X: 'rotateCW',
      z: 'rotateCCW', Z: 'rotateCCW',
      ' ': 'hardDrop', Spacebar: 'hardDrop', c: 'hold', C: 'hold'
    };

    function onKeyDown(e) {
      if (!wrap.isConnected) return;
      if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
      // e.key for the space bar is ' ' in modern browsers but 'Spacebar' in a
      // few, and some automation reports neither — fall back to e.code.
      const a = KEYMAP[e.key] || (e.code === 'Space' ? 'hardDrop' : null);
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;                    // our own DAS handles repeat
      press(a);
    }

    function onKeyUp(e) {
      const a = KEYMAP[e.key] || (e.code === 'Space' ? 'hardDrop' : null);
      if (a) release(a);
    }

    /* ---- painting ---- */

    function sizeCanvas() {
      // Measure the row, not the well: .well-box is sized BY the canvas, so
      // asking it how wide it is gives back last frame's answer (or zero).
      const visRows = game ? game.visibleRows() : 20;
      const rowW = wrap.getBoundingClientRect().width || 320;
      const sideW = side.getBoundingClientRect().width || 112;
      const availW = Math.max(120, rowW - sideW - 14);
      const maxH = Math.max(300, window.innerHeight - 250);
      cell = Math.floor(Math.min(availW / PV.Tetris.COLS, maxH / visRows));
      cell = PV.clamp(cell, 10, 34);
      const dpr = window.devicePixelRatio || 1;
      const w = cell * PV.Tetris.COLS, h = cell * visRows;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    }

    function block(c, x, y, colour, alpha) {
      c.globalAlpha = alpha == null ? 1 : alpha;
      c.fillStyle = colour;
      c.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      c.globalAlpha = (alpha == null ? 1 : alpha) * 0.35;
      c.fillStyle = '#FFFFFF';
      c.fillRect(x + 1, y + 1, cell - 2, Math.max(1, cell * 0.14));
      c.globalAlpha = 1;
    }

    function draw() {
      if (!game) return;
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const visRows = game.visibleRows();
      const w = cell * PV.Tetris.COLS, h = cell * visRows;

      c.fillStyle = '#0D1218';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.045)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 1; x < PV.Tetris.COLS; x++) { c.moveTo(x * cell, 0); c.lineTo(x * cell, h); }
      for (let y = 1; y < visRows; y++) { c.moveTo(0, y * cell); c.lineTo(w, y * cell); }
      c.stroke();

      for (let y = PV.Tetris.HIDDEN; y < PV.Tetris.ROWS; y++) {
        for (let x = 0; x < PV.Tetris.COLS; x++) {
          const v = game.grid[y * PV.Tetris.COLS + x];
          if (v < 0) continue;
          block(c, x * cell, (y - PV.Tetris.HIDDEN) * cell, COLOURS[PV.Tetris.KEYS[v]]);
        }
      }

      const p = game.piece;
      if (p) {
        const gy = game.ghostY();
        for (const cellPos of game.cellsOf({ type: p.type, rot: p.rot, x: p.x, y: gy })) {
          if (cellPos.y < PV.Tetris.HIDDEN) continue;
          block(c, cellPos.x * cell, (cellPos.y - PV.Tetris.HIDDEN) * cell, COLOURS[p.type], 0.18);
        }
        for (const cellPos of game.cellsOf(p)) {
          if (cellPos.y < PV.Tetris.HIDDEN) continue;
          block(c, cellPos.x * cell, (cellPos.y - PV.Tetris.HIDDEN) * cell, COLOURS[p.type]);
        }
      }

      if (paused) {
        c.fillStyle = 'rgba(11,15,20,.78)';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#EAF0F7';
        c.font = '600 ' + Math.max(14, cell * 0.8) + 'px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText(t('common.pause'), w / 2, h / 2);
      }

      drawMini(holdCv, game.hold ? [game.hold] : []);
      drawMini(nextCv, game.queue.slice(0, 3));
      scoreEl.textContent = PV.fmtNum(game.score);
      linesEl.textContent = String(game.lines);
      levelEl.textContent = String(game.level);
    }

    function drawMini(cv, types) {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      const slot = 72, unit = 14;
      types.forEach((type, n) => {
        const cells = PV.Tetris.SHAPES[type][0];
        let minX = 9, maxX = -9, minY = 9, maxY = -9;
        for (const s of cells) {
          minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
          minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
        }
        const ox = (cv.width - (maxX - minX + 1) * unit) / 2 - minX * unit;
        const oy = n * slot + (slot - (maxY - minY + 1) * unit) / 2 - minY * unit;
        c.fillStyle = COLOURS[type];
        for (const s of cells) {
          c.fillRect(ox + s.x * unit + 1, oy + s.y * unit + 1, unit - 2, unit - 2);
        }
      });
    }

    /* ---- end ---- */

    function finish() {
      if (ended) return;
      ended = true;
      releaseAll();
      ticker.stop();
      draw();
      const rec = ctx.record({
        result: 'over', score: game.score, timeMs: Math.round(game.tick / 60 * 1000), xp: 10 + Math.floor(game.score / 250)
      });
      ctx.gameOver({
        title: t('result.gameOver'),
        tone: 'flat',
        lines: [
          t('common.score') + ': ' + PV.fmtNum(game.score) + (rec.newBestScore ? ' · ' + t('result.newBest') : ''),
          t('tetris.lines') + ': ' + game.lines + ' · ' + t('common.level') + ' ' + game.level,
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: reset
      });
    }

    function relabel() {
      btnPause.textContent = paused ? t('common.resume') : t('common.pause');
      btnNew.textContent = t('common.restart');
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
        wrap.remove();
      }
    };
  };

})(window.PV);
