/* 接龙 / Klondike Solitaire — view.

   Click a card to pick it up, click a pile to put it down; double-click sends
   a card straight home. No dragging — on a phone a drag across seven fanned
   columns is a coin toss, and click-to-place works identically with a mouse.

   The canvas grows with the tallest column rather than being a fixed shape, so
   a long tableau is never clipped. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const C = () => PV.Cards;
  const SAVE = 'solitaire.saved';

  PV.SolitaireView = function (ctx) {
    const drawCount = (ctx.opts && ctx.opts.draw === '3') ? 3 : 1;
    let game, sel = null, timer = null, ended = false, autoTimer = null;
    let geom = { cw: 60, ch: 84, gap: 8, top: 0, fanUp: 22, fanDown: 10 };
    let hits = [];

    const wrap = PV.el('div', { class: 'g-solitaire' });
    const meta = PV.el('div', { class: 'game-status' });
    const canvas = PV.el('canvas', { class: 'cards-canvas' });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => newGame() }, t('common.newGame'));
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnAuto = PV.el('button', { class: 'btn ghost', onclick: auto }, t('solitaire.auto'));

    wrap.appendChild(PV.el('div', { class: 'game-bar' }, meta,
      PV.el('div', { class: 'bar-actions' }, btnUndo, btnAuto, btnNew)));
    wrap.appendChild(PV.el('div', { class: 'cards-box' }, canvas));
    ctx.host.appendChild(wrap);

    canvas.addEventListener('pointerdown', onPoint);
    canvas.addEventListener('dblclick', onDouble);
    window.addEventListener('resize', layout);
    document.addEventListener('pv:lang', relabel);

    resumeOrNew();

    /* ------------------------------------------------------------------ */

    function resumeOrNew() {
      const saved = PV.Store.get(SAVE, null);
      if (saved && saved.drawCount === drawCount && !saved.done) {
        game = new PV.Solitaire({ seed: saved.seed, drawCount: drawCount, verified: saved.verified });
        game.load(saved.state);
        game._elapsed = saved.elapsed | 0;
        begin();
        return;
      }
      newGame();
    }

    function newGame() {
      PV.Store.del(SAVE);
      clearInterval(autoTimer);
      // Deal until the solver proves one winnable. Most draw-one deals are
      // settled on the first try; the cap keeps a stubborn one from stalling.
      const found = PV.SolitaireSolver.findDeal(new PV.RNG(PV.newSeed()), drawCount,
        { tries: 8, nodes: 12000 });
      game = new PV.Solitaire({ seed: found.seed, drawCount: drawCount, verified: found.verified });
      begin();
    }

    function begin() {
      ended = false;
      sel = null;
      game.start();
      clearInterval(timer);
      timer = setInterval(() => { if (!ended) renderMeta(); }, 1000);
      layout();
    }

    function save() {
      if (game.solved) { PV.Store.del(SAVE); return; }
      PV.Store.set(SAVE, {
        seed: game.seed, drawCount: drawCount, verified: game.verified,
        state: game.snapshot(), elapsed: game.elapsedMs, done: false
      });
    }

    /* ---- actions ---- */

    function play(move) {
      if (ended || !game.apply(move)) return false;
      sel = null;
      save();
      render();
      return true;
    }

    function undo() {
      if (ended) return;
      clearInterval(autoTimer);
      if (game.undo()) { sel = null; save(); render(); }
    }

    function auto() {
      if (ended) return;
      clearInterval(autoTimer);
      // One card every 60ms, so the finish is watchable rather than instant.
      autoTimer = setInterval(() => {
        const moves = game.autoMoves();
        if (!moves.length || game.solved) { clearInterval(autoTimer); render(); return; }
        game.apply(moves[0]);
        save();
        render();
      }, 60);
    }

    /* ---- geometry and hit testing ---- */

    function layout() {
      const box = canvas.parentElement.getBoundingClientRect();
      const W = Math.max(280, Math.min(box.width || 320, 760));
      const gap = Math.max(5, W * 0.016);
      const cw = (W - gap * 6) / 7;
      const ch = cw * 1.42;
      const fanUp = Math.max(14, ch * 0.30);
      const fanDown = Math.max(6, ch * 0.13);
      const top = ch + gap * 2.2;

      let deepest = 0;
      for (const p of game.tableau) {
        let h = 0;
        for (let i = 0; i < p.length; i++) h += (i === p.length - 1) ? ch : (p[i].up ? fanUp : fanDown);
        deepest = Math.max(deepest, h);
      }
      const H = Math.max(top + ch + gap, top + deepest + gap);

      geom = { W: W, H: H, cw: cw, ch: ch, gap: gap, top: top, fanUp: fanUp, fanDown: fanDown };
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      render();
    }

    // A function declaration, not a const arrow: layout() runs from the
    // constructor's own bootstrap, above this line, and a const here would
    // still be in its temporal dead zone when it does.
    function colX(i) { return i * (geom.cw + geom.gap); }

    /** Rebuilt on every paint, walked back-to-front on every click. */
    function buildHits() {
      hits = [];
      const { cw, ch, top, fanUp, fanDown } = geom;
      hits.push({ x: colX(0), y: 0, w: cw, h: ch, what: { kind: 'stock' } });
      hits.push({ x: colX(1), y: 0, w: cw, h: ch, what: { kind: 'waste' } });
      for (let s = 0; s < 4; s++) {
        hits.push({ x: colX(3 + s), y: 0, w: cw, h: ch, what: { kind: 'foundation', suit: s } });
      }
      for (let i = 0; i < 7; i++) {
        const p = game.tableau[i];
        if (!p.length) {
          hits.push({ x: colX(i), y: top, w: cw, h: ch, what: { kind: 'pile', pile: i } });
          continue;
        }
        let y = top;
        for (let j = 0; j < p.length; j++) {
          const last = j === p.length - 1;
          hits.push({
            x: colX(i), y: y, w: cw, h: last ? ch : (p[j].up ? fanUp : fanDown),
            what: { kind: 'card', pile: i, index: j }
          });
          y += last ? ch : (p[j].up ? fanUp : fanDown);
        }
      }
    }

    function pick(pt) {
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (pt.x >= h.x && pt.x <= h.x + h.w && pt.y >= h.y && pt.y <= h.y + h.h) return h.what;
      }
      return null;
    }

    function pointOf(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onPoint(e) {
      if (ended) return;
      clearInterval(autoTimer);
      const target = pick(pointOf(e));
      if (!target) { sel = null; render(); return; }

      if (target.kind === 'stock') { play({ type: 'draw' }); return; }

      if (!sel) {
        if (target.kind === 'waste' && game.waste.length) sel = { kind: 'waste' };
        else if (target.kind === 'foundation' && game.foundations[target.suit].length) sel = target;
        else if (target.kind === 'card' && game.tableau[target.pile][target.index].up) {
          const run = game.tableau[target.pile].length - target.index;
          if (run <= game.runLength(target.pile)) sel = target;
        }
        render();
        return;
      }

      const move = moveFor(sel, target);
      if (move) { play(move); return; }
      sel = null;
      render();
    }

    function onDouble(e) {
      if (ended) return;
      const target = pick(pointOf(e));
      if (!target) return;
      if (target.kind === 'waste') { play({ type: 'wf' }); return; }
      if (target.kind === 'card') {
        const p = game.tableau[target.pile];
        if (target.index === p.length - 1) play({ type: 'tf', pile: target.pile });
      }
    }

    function moveFor(from, to) {
      const destPile = to.kind === 'pile' ? to.pile : (to.kind === 'card' ? to.pile : -1);
      if (from.kind === 'waste') {
        if (to.kind === 'foundation') return { type: 'wf' };
        if (destPile >= 0) return { type: 'wt', pile: destPile };
        return null;
      }
      if (from.kind === 'foundation') {
        if (destPile >= 0) return { type: 'ft', suit: from.suit, pile: destPile };
        return null;
      }
      if (from.kind === 'card') {
        const p = game.tableau[from.pile];
        if (to.kind === 'foundation' && from.index === p.length - 1) {
          return { type: 'tf', pile: from.pile };
        }
        if (destPile >= 0 && destPile !== from.pile) {
          return { type: 'tt', from: from.pile, to: destPile, count: p.length - from.index };
        }
      }
      return null;
    }

    /* ---- painting ---- */

    function card(c, x, y, cardId, faceUp, highlight) {
      const { cw, ch } = geom;
      const r = Math.max(4, cw * 0.10);
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, cw, ch, r); else c.rect(x, y, cw, ch);

      if (!faceUp) {
        c.fillStyle = '#2C3644';
        c.fill();
        c.strokeStyle = '#44536A';
        c.lineWidth = 1.4;
        c.stroke();
        c.fillStyle = 'rgba(246,179,43,.22)';
        c.beginPath();
        c.arc(x + cw / 2, y + ch / 2, Math.min(cw, ch) * 0.22, 0, Math.PI * 2);
        c.fill();
        return;
      }

      c.fillStyle = '#FBFCFE';
      c.fill();
      c.strokeStyle = highlight ? '#F6B32B' : '#B9C4D2';
      c.lineWidth = highlight ? Math.max(2.4, cw * 0.05) : 1.2;
      c.stroke();

      const red = C().red(cardId);
      c.fillStyle = red ? '#D8443B' : '#14181F';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.font = '700 ' + Math.round(cw * 0.30) + 'px system-ui, sans-serif';
      c.fillText(C().label(cardId), x + cw * 0.09, y + ch * 0.06);
      c.font = Math.round(cw * 0.26) + 'px system-ui, sans-serif';
      c.fillText(C().symbol(cardId), x + cw * 0.09, y + ch * 0.30);
      c.textAlign = 'center';
      c.font = Math.round(cw * 0.52) + 'px system-ui, sans-serif';
      c.fillText(C().symbol(cardId), x + cw * 0.62, y + ch * 0.44);
    }

    function slot(c, x, y, glyph) {
      const { cw, ch } = geom;
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, cw, ch, Math.max(4, cw * 0.10)); else c.rect(x, y, cw, ch);
      c.strokeStyle = 'rgba(255,255,255,.16)';
      c.setLineDash([5, 4]);
      c.lineWidth = 1.4;
      c.stroke();
      c.setLineDash([]);
      if (glyph) {
        c.fillStyle = 'rgba(255,255,255,.20)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = Math.round(cw * 0.44) + 'px system-ui, sans-serif';
        c.fillText(glyph, x + cw / 2, y + ch / 2);
      }
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, geom.W, geom.H);

      const { cw, top, fanUp, fanDown } = geom;

      if (game.stock.length) card(c, colX(0), 0, 0, false);
      else slot(c, colX(0), 0, game.waste.length ? '↻' : '');

      const shown = Math.min(game.waste.length, drawCount === 3 ? 3 : 1);
      if (!shown) slot(c, colX(1), 0, '');
      for (let i = 0; i < shown; i++) {
        const id = game.waste[game.waste.length - shown + i];
        const isTop = i === shown - 1;
        card(c, colX(1) + i * cw * 0.22, 0, id, true, isTop && sel && sel.kind === 'waste');
      }

      for (let s = 0; s < 4; s++) {
        const f = game.foundations[s];
        if (!f.length) slot(c, colX(3 + s), 0, C().SUITS[s]);
        else card(c, colX(3 + s), 0, f[f.length - 1], true,
          sel && sel.kind === 'foundation' && sel.suit === s);
      }

      for (let i = 0; i < 7; i++) {
        const p = game.tableau[i];
        if (!p.length) { slot(c, colX(i), top, ''); continue; }
        let y = top;
        for (let j = 0; j < p.length; j++) {
          const picked = sel && sel.kind === 'card' && sel.pile === i && j >= sel.index;
          card(c, colX(i), y, p[j].c, p[j].up, picked);
          y += (j === p.length - 1) ? 0 : (p[j].up ? fanUp : fanDown);
        }
      }

      buildHits();
      btnUndo.disabled = !game.canUndo();
      btnAuto.disabled = !game.autoMoves().length;
      renderMeta();
      if (game.solved && !ended) finish();
    }

    function renderMeta() {
      PV.clear(meta);
      meta.appendChild(PV.el('span', { class: 'chip' }, t('solitaire.draw' + drawCount)));
      meta.appendChild(PV.el('span', { class: 'chip mono' }, PV.fmtTime(game.elapsedMs)));
      meta.appendChild(PV.el('span', { class: 'chip' }, t('common.score') + ' ' + game.score));
      if (game.verified) {
        meta.appendChild(PV.el('span', { class: 'chip', title: t('solitaire.winnableHint') },
          '✓ ' + t('solitaire.winnable')));
      }
      meta.appendChild(PV.el('span', { class: 'chip mono dim', title: t('common.seed') },
        game.shareCode));
    }

    function finish() {
      ended = true;
      clearInterval(timer);
      clearInterval(autoTimer);
      PV.Store.del(SAVE);
      const timeMs = game.elapsedMs;
      const rec = ctx.record({
        result: 'solved', score: game.score, timeMs: timeMs,
        xp: (drawCount === 3 ? 110 : 70), lowerTimeIsBetter: true
      });
      ctx.gameOver({
        title: t('result.solved'),
        tone: 'good',
        lines: [
          t('common.time') + ': ' + PV.fmtTime(timeMs) + (rec.newBestTime ? ' · ' + t('result.newBest') : ''),
          t('common.score') + ': ' + PV.fmtNum(game.score),
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: newGame
      });
    }

    function relabel() {
      btnNew.textContent = t('common.newGame');
      btnUndo.textContent = t('common.undo');
      btnAuto.textContent = t('solitaire.auto');
      render();
    }

    return {
      destroy() {
        clearInterval(timer);
        clearInterval(autoTimer);
        game.stop();
        save();
        canvas.removeEventListener('pointerdown', onPoint);
        canvas.removeEventListener('dblclick', onDouble);
        window.removeEventListener('resize', layout);
        document.removeEventListener('pv:lang', relabel);
        wrap.remove();
      }
    };
  };

})(window.PV);
