/* 麻将连连看 / Mahjong Solitaire — view.

   Tiles are drawn back to front — bottom layer first, then up the stack, and
   within a layer top row before bottom — so the near edge of every tile covers
   the far edge of the one behind it. Higher layers are nudged up and right, which
   is what makes a flat canvas read as five stacked layers.

   Hit testing walks the same list backwards, so a click always lands on the
   tile the player can actually see. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const SAVE = 'mahjong.saved';
  const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Heiti SC", serif';

  PV.MahjongView = function (ctx) {
    let game, sel = null, timer = null, ended = false, hint = null, hintTimer = null;
    let geom = { tw: 32, th: 42, ox: 0, oy: 0, dx: 4, dy: 4 };

    const wrap = PV.el('div', { class: 'g-mahjong' });
    const meta = PV.el('div', { class: 'game-status' });
    const canvas = PV.el('canvas', { class: 'tiles-canvas' });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => newGame() }, t('common.newGame'));
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnHint = PV.el('button', { class: 'btn ghost', onclick: showHint }, t('common.hint'));
    const btnShuffle = PV.el('button', { class: 'btn ghost', onclick: reshuffle }, t('mahjong.shuffle'));
    const toast = PV.el('div', { class: 'game-toast', hidden: true });

    wrap.appendChild(PV.el('div', { class: 'game-bar' }, meta,
      PV.el('div', { class: 'bar-actions' }, btnUndo, btnHint, btnShuffle, btnNew)));
    wrap.appendChild(PV.el('div', { class: 'tiles-box' }, canvas));
    wrap.appendChild(toast);
    ctx.host.appendChild(wrap);

    canvas.addEventListener('pointerdown', onPoint);
    window.addEventListener('resize', layout);
    document.addEventListener('pv:lang', relabel);

    resumeOrNew();

    /* ------------------------------------------------------------------ */

    function resumeOrNew() {
      const saved = PV.Store.get(SAVE, null);
      const g = saved && !saved.done ? PV.Mahjong.restore(saved) : null;
      game = g || new PV.Mahjong({ seed: PV.newSeed() });
      begin();
    }

    function newGame() {
      PV.Store.del(SAVE);
      game = new PV.Mahjong({ seed: PV.newSeed() });
      begin();
    }

    function begin() {
      ended = false; sel = null; hint = null;
      game.start();
      clearInterval(timer);
      timer = setInterval(() => { if (!ended) renderMeta(); }, 1000);
      layout();
    }

    function save() {
      if (game.solved) { PV.Store.del(SAVE); return; }
      PV.Store.set(SAVE, Object.assign(game.snapshot(), { done: false }));
    }

    /* ---- actions ---- */

    function undo() {
      if (ended) return;
      if (game.undo()) { sel = null; hint = null; save(); render(); }
    }

    function showHint() {
      const moves = game.availableMoves();
      if (!moves.length) { say(t('mahjong.stuck')); return; }
      hint = moves[game.rng.int(moves.length)];
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint = null; render(); }, 2600);
      render();
    }

    function reshuffle() {
      if (ended) return;
      if (game.reshuffle()) { sel = null; hint = null; save(); render(); say(t('mahjong.shuffled')); }
      else say(t('mahjong.noShuffle'));
    }

    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(say._t);
      say._t = setTimeout(() => { toast.hidden = true; }, 2400);
    }

    /* ---- geometry ---- */

    function layout() {
      const box = canvas.parentElement.getBoundingClientRect();
      const W = Math.max(280, Math.min(box.width || 320, 860));
      // The turtle spans 16 tiles across and 8 down, plus room for the stack offset.
      const tw = Math.floor(Math.min(W / 16.6, (window.innerHeight - 230) / 9.4 / 1.32));
      const size = Math.max(18, tw);
      const th = Math.round(size * 1.32);
      const dx = Math.max(2, Math.round(size * 0.13));
      const dy = Math.max(2, Math.round(size * 0.13));
      const width = size * 16 + dx * 5;
      const height = th * 8 + dy * 5;
      geom = { tw: size, th: th, dx: dx, dy: dy, ox: (Math.min(W, width + 8) - width) / 2 + size,
               oy: dy * 5, W: Math.min(W, width + 8), H: height + 10 };

      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = geom.W + 'px';
      canvas.style.height = geom.H + 'px';
      canvas.width = Math.round(geom.W * dpr);
      canvas.height = Math.round(geom.H * dpr);
      render();
    }

    /** Screen rect for a tile, including its layer offset. */
    function rectOf(tile) {
      const { tw, th, dx, dy, ox, oy } = geom;
      return {
        x: ox + (tile.x / 2) * tw + tile.z * dx,
        y: oy + (tile.y / 2) * th - tile.z * dy,
        w: tw, h: th
      };
    }

    /** Back to front: lower layers first, and within a layer, far rows first. */
    function paintOrder() {
      return game.remaining().slice().sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
    }

    function onPoint(e) {
      if (ended) return;
      const r = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const order = paintOrder();
      let target = null;
      for (let i = order.length - 1; i >= 0; i--) {
        const rc = rectOf(order[i]);
        if (pt.x >= rc.x && pt.x <= rc.x + rc.w && pt.y >= rc.y && pt.y <= rc.y + rc.h) {
          target = order[i];
          break;
        }
      }
      if (!target) { sel = null; render(); return; }
      if (!game.isFree(target)) { say(t('mahjong.blocked')); return; }

      if (!sel) { sel = target; render(); return; }
      if (sel === target) { sel = null; render(); return; }

      if (game.apply({ type: 'match', a: sel.i, b: target.i })) {
        sel = null; hint = null;
        save();
        render();
        if (!game.solved && !game.availableMoves().length) say(t('mahjong.stuck'));
      } else {
        sel = target;
        render();
      }
    }

    /* ---- painting ---- */

    function tileFace(c, tile, rc, state) {
      const { tw, th } = geom;
      const r = Math.max(3, tw * 0.14);
      const lip = Math.max(2, tw * 0.10);

      // The side and bottom edge give the tile its thickness.
      c.fillStyle = '#C9BC9C';
      c.beginPath();
      if (c.roundRect) c.roundRect(rc.x, rc.y + lip * 0.4, tw + lip, th, r); else c.rect(rc.x, rc.y, tw + lip, th);
      c.fill();

      c.fillStyle = state === 'sel' ? '#FFE7A8' : (state === 'hint' ? '#FFF3CF' : '#F7F1E1');
      c.beginPath();
      if (c.roundRect) c.roundRect(rc.x, rc.y, tw, th, r); else c.rect(rc.x, rc.y, tw, th);
      c.fill();
      c.strokeStyle = state ? '#B67512' : 'rgba(0,0,0,.28)';
      c.lineWidth = state ? Math.max(1.8, tw * 0.07) : 1;
      c.stroke();

      const face = game.face(tile);
      if (!face) return;
      c.textAlign = 'center';
      c.fillStyle = face.colour;
      if (face.rank) {
        c.textBaseline = 'alphabetic';
        c.font = '700 ' + Math.round(tw * 0.44) + 'px system-ui, sans-serif';
        c.fillText(face.rank, rc.x + tw / 2, rc.y + th * 0.44);
        c.font = '600 ' + Math.round(tw * 0.40) + 'px ' + CJK;
        c.fillText(face.mark, rc.x + tw / 2, rc.y + th * 0.86);
      } else {
        c.textBaseline = 'middle';
        c.font = '700 ' + Math.round(tw * 0.60) + 'px ' + CJK;
        c.fillText(face.mark, rc.x + tw / 2, rc.y + th * 0.54);
      }
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, geom.W, geom.H);

      for (const tile of paintOrder()) {
        const state = (sel === tile) ? 'sel'
          : (hint && (hint.a === tile.i || hint.b === tile.i)) ? 'hint' : null;
        tileFace(c, tile, rectOf(tile), state);
      }

      btnUndo.disabled = !game.canUndo();
      renderMeta();
      if (game.solved && !ended) finish();
    }

    function renderMeta() {
      PV.clear(meta);
      const left = game.remaining().length;
      meta.appendChild(PV.el('span', { class: 'chip mono' }, PV.fmtTime(game.elapsedMs)));
      meta.appendChild(PV.el('span', { class: 'chip' }, t('mahjong.left') + ' ' + left));
      const moves = game.availableMoves().length;
      meta.appendChild(PV.el('span', { class: 'chip' + (moves ? '' : ' bad') },
        t('mahjong.moves') + ' ' + moves));
      meta.appendChild(PV.el('span', { class: 'chip mono dim', title: t('common.seed') }, game.shareCode));
    }

    function finish() {
      ended = true;
      clearInterval(timer);
      PV.Store.del(SAVE);
      const timeMs = game.elapsedMs;
      const rec = ctx.record({
        result: 'solved', timeMs: timeMs, xp: Math.max(40, 130 - game.shuffles * 20),
        lowerTimeIsBetter: true
      });
      ctx.gameOver({
        title: t('result.solved'),
        tone: 'good',
        lines: [
          t('common.time') + ': ' + PV.fmtTime(timeMs) + (rec.newBestTime ? ' · ' + t('result.newBest') : ''),
          t('mahjong.shuffles') + ': ' + game.shuffles,
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: newGame
      });
    }

    function relabel() {
      btnNew.textContent = t('common.newGame');
      btnUndo.textContent = t('common.undo');
      btnHint.textContent = t('common.hint');
      btnShuffle.textContent = t('mahjong.shuffle');
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
        window.removeEventListener('resize', layout);
        document.removeEventListener('pv:lang', relabel);
        wrap.remove();
      }
    };
  };

})(window.PV);
