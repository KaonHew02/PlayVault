/* 蜘蛛纸牌 / Spider Solitaire — view.

   Click a run to pick it up, click a column to put it down; double-click sends
   it wherever it does the most good. Click the stock to deal a row. No
   dragging: on a phone a drag across ten fanned columns is a coin toss, and
   click-to-place works identically with a mouse.

   Ten columns is the whole layout problem here. Below a readable card width the
   canvas grows past its box and scrolls sideways instead of shrinking, and a
   column deep enough to run off the screen tightens its fan rather than making
   the page taller than the game. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const C = () => PV.Cards;
  const SAVE = 'spider.saved';
  const COLS = 10;

  PV.SpiderView = function (ctx) {
    const suits = ctx.opts && ctx.opts.suits === '2' ? 2
      : (ctx.opts && ctx.opts.suits === '4' ? 4 : 1);
    let game, sel = null, hint = null, hintTimer = null;
    let timer = null, ended = false;
    let geom = { cw: 48, ch: 68, gap: 5, pad: 6, head: 6, top: 80, fanUp: 19, fanDown: 9 };
    let hits = [];

    const wrap = PV.el('div', { class: 'g-spider' });
    const meta = PV.el('div', { class: 'game-status' });
    const canvas = PV.el('canvas', { class: 'cards-canvas' });
    const toast = PV.el('div', { class: 'game-toast', hidden: true });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => newGame() }, t('common.newGame'));
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnHint = PV.el('button', { class: 'btn ghost', onclick: showHint }, t('common.hint'));

    wrap.appendChild(PV.el('div', { class: 'game-bar' }, meta,
      PV.el('div', { class: 'bar-actions' }, btnHint, btnUndo, btnNew)));
    wrap.appendChild(PV.el('div', { class: 'cards-box' }, canvas));
    wrap.appendChild(toast);
    ctx.host.appendChild(wrap);

    canvas.addEventListener('pointerdown', onPoint);
    canvas.addEventListener('dblclick', onDouble);
    window.addEventListener('resize', layout);
    document.addEventListener('pv:lang', relabel);

    resumeOrNew();

    /* ------------------------------------------------------------------ */

    function resumeOrNew() {
      const saved = PV.Store.get(SAVE, null);
      if (saved && saved.suits === suits && !saved.done) {
        game = new PV.Spider({ seed: saved.seed, suits: suits });
        game.load(saved.state);
        game._elapsed = saved.elapsed | 0;
        begin();
        return;
      }
      newGame();
    }

    function newGame() {
      PV.Store.del(SAVE);
      // No winnable check: proving a spider deal solvable needs a real solver,
      // and four-suit spider is genuinely lost some of the time even when it is
      // played well. The stuck test below is the honest answer instead.
      game = new PV.Spider({ seed: PV.newSeed(), suits: suits });
      begin();
    }

    function begin() {
      ended = false;
      sel = null;
      hint = null;
      game.start();
      clearInterval(timer);
      timer = setInterval(() => { if (!ended) renderMeta(); }, 1000);
      layout();
    }

    function save() {
      if (game.solved) { PV.Store.del(SAVE); return; }
      PV.Store.set(SAVE, {
        seed: game.seed, suits: suits, state: game.snapshot(),
        elapsed: game.elapsedMs, done: false
      });
    }

    /* ---- actions ---- */

    function play(move) {
      if (ended || !game.apply(move)) return false;
      sel = null;
      hint = null;
      save();
      render();
      return true;
    }

    function undo() {
      if (ended) return;
      if (game.undo()) { sel = null; hint = null; save(); render(); }
    }

    function dealRow() {
      if (!game.stock.length) { say(t('spider.noDeals')); return; }
      if (!game.canDeal()) { say(t('spider.emptyColumn')); return; }
      play({ type: 'deal' });
    }

    function showHint() {
      if (ended) return;
      const move = game.bestMove();
      if (!move) {
        say(game.canDeal() ? t('spider.hintDeal') : t('spider.stuck'));
        return;
      }
      hint = move;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint = null; render(); }, 2600);
      render();
    }

    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(say._t);
      say._t = setTimeout(() => { toast.hidden = true; }, 2400);
    }

    /** The best home for one particular run, for the double-click shortcut. */
    function bestFor(pile, count) {
      let best = null, top = -Infinity;
      for (const m of game.legalMoves()) {
        if (m.from !== pile || m.count !== count) continue;
        const s = game.rank(m);
        if (s > top) { top = s; best = m; }
      }
      return best;
    }

    /* ---- geometry and hit testing ---- */

    function layout() {
      const box = canvas.parentElement.getBoundingClientRect();
      const avail = Math.max(280, Math.min(box.width || 320, 980));
      const pad = Math.max(6, avail * 0.012);
      const gap = Math.max(3, avail * 0.008);

      // Ten columns across a phone would leave a 26px card. Below a readable
      // width the board keeps its size and the box scrolls sideways instead.
      const MIN_CARD = 44;
      let cw = (avail - pad * 2 - gap * (COLS - 1)) / COLS;
      let W = avail;
      if (cw < MIN_CARD) { cw = MIN_CARD; W = pad * 2 + cw * COLS + gap * (COLS - 1); }
      const ch = cw * 1.42;
      const head = pad;
      const top = pad + ch + gap * 2.4;

      let fanUp = ch * 0.28, fanDown = ch * 0.14;
      // A spider column can hold twenty cards. Rather than let the canvas grow
      // to a page and a half, the fan tightens until the deepest column fits.
      const spread = deepest(fanUp, fanDown) - ch;
      const room = ch * 6.4;
      if (spread > 0 && ch + spread > room) {
        const k = PV.clamp((room - ch) / spread, 0.40, 1);
        fanUp *= k;
        fanDown *= k;
      }

      const H = top + Math.max(ch, deepest(fanUp, fanDown)) + pad;
      geom = { W: W, H: H, cw: cw, ch: ch, gap: gap, pad: pad,
               head: head, top: top, fanUp: fanUp, fanDown: fanDown };

      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      render();

      /* The tallest column, cards plus fan. Declared inside layout because it
         is only ever asked mid-measurement, with fans that are not geom's yet. */
      function deepest(fu, fd) {
        let out = 0;
        for (const p of game.tableau) {
          let h = p.length ? ch : 0;
          for (let i = 0; i < p.length - 1; i++) h += p[i].up ? fu : fd;
          out = Math.max(out, h);
        }
        return out;
      }
    }

    // A function declaration, not a const arrow: layout() runs from the
    // bootstrap above this line, and a const here would still be in its
    // temporal dead zone when it does.
    function colX(i) { return geom.pad + i * (geom.cw + geom.gap); }

    /** Rebuilt on every paint, walked back-to-front on every click. */
    function buildHits() {
      hits = [];
      const { cw, ch, head, top, fanUp, fanDown } = geom;
      hits.push({ x: colX(0), y: head, w: cw, h: ch, what: { kind: 'stock' } });
      for (let i = 0; i < COLS; i++) {
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
      const target = pick(pointOf(e));
      if (!target) { sel = null; render(); return; }

      if (target.kind === 'stock') { dealRow(); return; }

      if (!sel) {
        if (target.kind === 'card') {
          const p = game.tableau[target.pile];
          if (p[target.index].up && p.length - target.index <= game.runLength(target.pile)) {
            sel = target;
          }
        }
        render();
        return;
      }

      const to = target.kind === 'pile' ? target.pile
        : (target.kind === 'card' ? target.pile : -1);
      if (to >= 0 && to !== sel.pile) {
        const count = game.tableau[sel.pile].length - sel.index;
        if (play({ type: 'tt', from: sel.pile, to: to, count: count })) return;
      }
      sel = null;
      render();
    }

    function onDouble(e) {
      if (ended) return;
      const target = pick(pointOf(e));
      if (!target || target.kind !== 'card') return;
      const p = game.tableau[target.pile];
      const count = p.length - target.index;
      if (!p[target.index].up || count > game.runLength(target.pile)) return;
      const move = bestFor(target.pile, count);
      if (move) play(move);
    }

    /* ---- painting ---- */

    function roundPath(c, x, y, w, h, r) {
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    }

    /** Rank over suit in one corner only — a rotated 9 reads as a 6 at this size. */
    function corner(c, x, y, label, pip, ink) {
      const { cw, ch } = geom;
      c.save();
      c.translate(x, y);
      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.font = '700 ' + Math.round(cw * 0.30) + 'px system-ui, sans-serif';
      c.fillText(label, cw * 0.21, ch * 0.045);
      c.font = Math.round(cw * 0.24) + 'px system-ui, sans-serif';
      c.fillText(pip, cw * 0.21, ch * 0.045 + cw * 0.32);
      c.restore();
    }

    function card(c, x, y, cardId, faceUp, highlight, tone) {
      const { cw, ch } = geom;
      const r = Math.max(3, cw * 0.09);

      c.save();
      c.shadowColor = 'rgba(0,0,0,.45)';
      c.shadowBlur = Math.max(3, cw * 0.10);
      c.shadowOffsetY = Math.max(1, cw * 0.03);
      roundPath(c, x, y, cw, ch, r);
      c.fillStyle = faceUp ? '#FBFCFE' : '#26344A';
      c.fill();
      c.restore();

      if (!faceUp) {
        // A lattice rather than a centred motif: in a fanned pile only the top
        // sliver of a face-down card shows, and a motif in the middle of the
        // card is exactly the part you never see.
        c.save();
        roundPath(c, x + cw * 0.07, y + cw * 0.07, cw * 0.86, ch - cw * 0.14, r * 0.7);
        c.fillStyle = '#31425C';
        c.fill();
        c.clip();
        c.strokeStyle = 'rgba(246,179,43,.30)';
        c.lineWidth = Math.max(1, cw * 0.022);
        const step = Math.max(5, cw * 0.20);
        c.beginPath();
        for (let d = -ch; d < cw + ch; d += step) {
          c.moveTo(x + d, y); c.lineTo(x + d + ch, y + ch);
          c.moveTo(x + d, y + ch); c.lineTo(x + d + ch, y);
        }
        c.stroke();
        c.restore();
        roundPath(c, x, y, cw, ch, r);
        c.strokeStyle = '#5A6C88';
        c.lineWidth = 1.2;
        c.stroke();
        return;
      }

      roundPath(c, x, y, cw, ch, r);
      c.strokeStyle = highlight ? (tone === 'hint' ? '#34D399' : '#F6B32B') : 'rgba(16,23,32,.22)';
      c.lineWidth = highlight ? Math.max(2, cw * 0.05) : 1.1;
      c.stroke();

      const ink = C().red(cardId) ? '#D63B36' : '#141922';
      corner(c, x, y, C().label(cardId), C().symbol(cardId), ink);

      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = Math.round(cw * 0.58) + 'px system-ui, sans-serif';
      c.fillText(C().symbol(cardId), x + cw * 0.62, y + ch * 0.62);
    }

    function slot(c, x, y, glyph, tone) {
      const { cw, ch } = geom;
      roundPath(c, x, y, cw, ch, Math.max(3, cw * 0.09));
      c.fillStyle = 'rgba(0,0,0,.20)';
      c.fill();
      c.strokeStyle = tone === 'hint' ? '#34D399' : 'rgba(255,255,255,.20)';
      c.setLineDash(tone === 'hint' ? [] : [5, 4]);
      c.lineWidth = tone === 'hint' ? 2.2 : 1.3;
      c.stroke();
      c.setLineDash([]);
      if (glyph) {
        c.fillStyle = 'rgba(255,255,255,.24)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = Math.round(cw * 0.42) + 'px system-ui, sans-serif';
        c.fillText(glyph, x + cw / 2, y + ch / 2);
      }
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, geom.W, geom.H);

      const { cw, ch, head, top, fanUp, fanDown } = geom;

      roundPath(c, 0, 0, geom.W, geom.H, Math.max(8, geom.pad));
      c.fillStyle = PV.cssVar('--felt', '#1E5B43');
      c.fill();
      const vig = c.createRadialGradient(geom.W / 2, geom.H * 0.30, geom.W * 0.08,
                                         geom.W / 2, geom.H * 0.5, geom.W * 0.8);
      vig.addColorStop(0, 'rgba(255,255,255,.07)');
      vig.addColorStop(1, 'rgba(0,0,0,.32)');
      c.fillStyle = vig;
      c.fill();

      // The stock is drawn as one back per deal still to come, so "five deals
      // left" is something you see rather than something you read.
      const deals = game.dealsLeft;
      if (!deals) slot(c, colX(0), head, '');
      for (let i = 0; i < deals; i++) {
        card(c, colX(0) + i * cw * 0.09, head + i * ch * 0.03, 0, false);
      }

      // Eight foundations, right-aligned across the head row.
      for (let i = 0; i < 8; i++) {
        const x = colX(COLS - 8 + i);
        const done = game.foundations[i];
        if (done == null) slot(c, x, head, '');
        else card(c, x, head, done * 13 + 12, true);      // the king that closed it
      }

      for (let i = 0; i < COLS; i++) {
        const p = game.tableau[i];
        const lit = hint && hint.to === i;
        if (!p.length) { slot(c, colX(i), top, '', lit ? 'hint' : null); continue; }
        let y = top;
        for (let j = 0; j < p.length; j++) {
          const picked = sel && sel.pile === i && j >= sel.index;
          const hinted = (hint && hint.from === i && j >= p.length - hint.count)
            || (lit && j === p.length - 1);
          card(c, colX(i), y, p[j].c, p[j].up, picked || hinted, hinted && !picked ? 'hint' : null);
          y += (j === p.length - 1) ? 0 : (p[j].up ? fanUp : fanDown);
        }
      }

      buildHits();
      btnUndo.disabled = !game.canUndo();
      renderMeta();
      if (!ended) {
        if (game.solved) finish(true);
        else if (game.isStuck()) finish(false);
      }
    }

    function renderMeta() {
      PV.clear(meta);
      meta.appendChild(PV.el('span', { class: 'chip' }, t('spider.suits' + suits)));
      meta.appendChild(PV.el('span', { class: 'chip mono' }, PV.fmtTime(game.elapsedMs)));
      meta.appendChild(PV.el('span', { class: 'chip' }, t('common.score') + ' ' + game.score));
      meta.appendChild(PV.el('span', { class: 'chip' }, t('common.moves') + ' ' + game.moves));
      meta.appendChild(PV.el('span', { class: 'chip' },
        t('spider.sets') + ' ' + game.foundations.length + '/8'));
      meta.appendChild(PV.el('span', { class: 'chip' },
        t('spider.deals') + ' ' + game.dealsLeft));
      meta.appendChild(PV.el('span', { class: 'chip mono dim', title: t('common.seed') },
        game.shareCode));
    }

    function finish(won) {
      ended = true;
      clearInterval(timer);
      clearTimeout(hintTimer);
      game.stop();
      PV.Store.del(SAVE);
      const timeMs = game.elapsedMs;
      const xp = won ? (suits === 4 ? 200 : suits === 2 ? 130 : 80) : 15;
      const rec = ctx.record({
        result: won ? 'solved' : 'lose',
        score: game.score, timeMs: timeMs, xp: xp, lowerTimeIsBetter: true
      });
      ctx.gameOver({
        title: won ? t('result.solved') : t('result.gameOver'),
        tone: won ? 'good' : 'bad',
        lines: [
          won ? null : t('spider.stuck'),
          t('common.time') + ': ' + PV.fmtTime(timeMs)
            + (rec.newBestTime ? ' · ' + t('result.newBest') : ''),
          t('common.score') + ': ' + PV.fmtNum(game.score)
            + ' · ' + t('common.moves') + ' ' + game.moves,
          t('spider.sets') + ': ' + game.foundations.length + '/8',
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: newGame
      });
    }

    function relabel() {
      btnNew.textContent = t('common.newGame');
      btnUndo.textContent = t('common.undo');
      btnHint.textContent = t('common.hint');
      render();
    }

    return {
      destroy() {
        clearInterval(timer);
        clearTimeout(hintTimer);
        clearTimeout(say._t);
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
