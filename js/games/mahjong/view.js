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
  const RED = '#B3261E';

  /* Where the pips go, in fractions of the tile's inner box. These are the
     arrangements a real set uses — three dots run on a diagonal, seven is a
     slanted three over a square four — and they live at module scope because
     the view paints during construction, before its own tail has run. */
  const DOT_SPOTS = {
    1: [[.50, .50]],
    2: [[.50, .27], [.50, .73]],
    3: [[.24, .76], [.50, .50], [.76, .24]],
    4: [[.29, .29], [.71, .29], [.29, .71], [.71, .71]],
    5: [[.26, .26], [.74, .26], [.50, .50], [.26, .74], [.74, .74]],
    6: [[.29, .21], [.71, .21], [.29, .50], [.71, .50], [.29, .79], [.71, .79]],
    7: [[.22, .17], [.50, .25], [.78, .33], [.30, .61], [.70, .61], [.30, .85], [.70, .85]],
    8: [[.31, .16], [.69, .16], [.31, .39], [.69, .39], [.31, .62], [.69, .62], [.31, .85], [.69, .85]],
    9: [[.22, .22], [.50, .22], [.78, .22], [.22, .50], [.50, .50], [.78, .50],
        [.22, .78], [.50, .78], [.78, .78]]
  };
  const DOT_R = { 1: .30, 2: .19, 3: .17, 4: .175, 5: .155, 6: .150, 7: .125, 8: .125, 9: .135 };

  const BAMBOO_SPOTS = {
    1: [[.50, .50]],
    2: [[.50, .28], [.50, .72]],
    3: [[.50, .24], [.32, .72], [.68, .72]],
    4: [[.31, .28], [.69, .28], [.31, .72], [.69, .72]],
    5: [[.27, .25], [.73, .25], [.50, .50], [.27, .75], [.73, .75]],
    6: [[.27, .26], [.50, .26], [.73, .26], [.27, .74], [.50, .74], [.73, .74]],
    7: [[.50, .16], [.27, .50], [.50, .50], [.73, .50], [.27, .82], [.50, .82], [.73, .82]],
    8: [[.32, .16], [.68, .16], [.32, .39], [.68, .39], [.32, .62], [.68, .62], [.32, .85], [.68, .85]],
    9: [[.26, .21], [.50, .21], [.74, .21], [.26, .50], [.50, .50], [.74, .50],
        [.26, .79], [.50, .79], [.74, .79]]
  };
  const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

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

    // Dealing yourself a new board mid-race restarts your clock on the same
    // deal, which is a second attempt at everyone else's first.
    if (ctx.race) btnNew.hidden = true;

    resumeOrNew();
    // Racing a friend: the scoreboard reads how far along this board is.
    ctx.progress = () => ({ pct: game ? game.progress : 0 });

    /* ------------------------------------------------------------------ */

    function resumeOrNew() {
      // A race is a fresh deal from the host's seed: resuming a half-finished
      // board would be a different puzzle from everyone else's.
      const saved = ctx.race ? null : PV.Store.get(SAVE, null);
      const g = saved && !saved.done ? PV.Mahjong.restore(saved) : null;
      game = g || new PV.Mahjong({ seed: ctx.seed() });
      begin();
    }

    function newGame() {
      PV.Store.del(SAVE);
      game = new PV.Mahjong({ seed: ctx.seed() });
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
      if (ctx.race) return;                 // a race never touches the solo save
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
      const W = Math.max(280, Math.min(box.width || 320, PV.stage().w, 1120));
      // The turtle spans 16 tiles across and 8 down, plus room for the stack offset.
      const tw = Math.floor(Math.min(W / 16.6, PV.stage().h / 9.4 / 1.32));
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
      if (face) drawFace(c, face, rc);
    }

    /* ---- the faces themselves ----

       Dots are drawn as dots and bamboo as sticks, in the arrangements a real
       set uses, because "5筒" written on a tile is a label for a tile, not a
       tile. Only the character suit carries a numeral. */

    function drawFace(c, face, rc) {
      const { tw, th } = geom;
      const inset = tw * 0.13;
      const box = { x: rc.x + inset, y: rc.y + inset * 1.1,
                    w: tw - inset * 2, h: th - inset * 2.2 };

      if (face.kind === 'dots') return drawDots(c, face, box);
      if (face.kind === 'bamboo') return drawBamboo(c, face, box);
      if (face.kind === 'chars') return drawChars(c, face, rc);
      if (face.kind === 'blank') return drawBlank(c, face, box);

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = face.colour;
      c.font = '700 ' + Math.round(tw * 0.58) + 'px ' + CJK;
      c.fillText(face.text, rc.x + tw / 2, rc.y + th * 0.54);
    }

    function drawDots(c, face, box) {
      const spots = DOT_SPOTS[face.rank];
      const r = DOT_R[face.rank] * Math.min(box.w, box.h);
      spots.forEach((p, i) => {
        const cx = box.x + p[0] * box.w, cy = box.y + p[1] * box.h;
        // The one and the middle of the five are red on a real set.
        const hot = (face.rank === 1) || (face.rank === 5 && i === 2);
        c.fillStyle = hot ? RED : face.colour;
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#F7F1E1';
        c.beginPath(); c.arc(cx, cy, r * 0.46, 0, Math.PI * 2); c.fill();
        c.fillStyle = hot ? RED : face.colour;
        c.beginPath(); c.arc(cx, cy, r * 0.19, 0, Math.PI * 2); c.fill();
      });
    }

    function drawBamboo(c, face, box) {
      const spots = BAMBOO_SPOTS[face.rank];
      const single = face.rank === 1;
      const hh = (single ? 0.36 : 0.16) * box.h;
      const hw = (single ? 0.12 : 0.085) * box.w;
      spots.forEach((p, i) => {
        const cx = box.x + p[0] * box.w, cy = box.y + p[1] * box.h;
        // The middle of the five and the top of the seven are red on a real
        // set. The one is NOT — a lone red bar reads as a mistake.
        const hot = (face.rank === 5 && i === 2) || (face.rank === 7 && i === 0);
        c.fillStyle = hot ? RED : face.colour;
        c.beginPath();
        if (c.roundRect) c.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, hw * 0.8);
        else c.rect(cx - hw, cy - hh, hw * 2, hh * 2);
        c.fill();
        // Knots, so a stick reads as bamboo rather than as a bar.
        c.strokeStyle = '#F7F1E1';
        c.lineWidth = Math.max(0.7, hw * 0.30);
        c.beginPath();
        const knots = single ? [-0.55, 0, 0.55] : [-0.33, 0.33];
        for (const k of knots) {
          c.moveTo(cx - hw, cy + hh * k); c.lineTo(cx + hw, cy + hh * k);
        }
        c.stroke();
      });
    }

    function drawChars(c, face, rc) {
      const { tw, th } = geom;
      c.textAlign = 'center';
      c.fillStyle = face.colour;
      c.textBaseline = 'middle';
      c.font = '700 ' + Math.round(tw * 0.46) + 'px ' + CJK;
      c.fillText(NUMERALS[face.rank], rc.x + tw / 2, rc.y + th * 0.32);
      c.font = '700 ' + Math.round(tw * 0.44) + 'px ' + CJK;
      c.fillText('萬', rc.x + tw / 2, rc.y + th * 0.72);
    }

    function drawBlank(c, face, box) {
      c.strokeStyle = face.colour;
      c.lineWidth = Math.max(1.2, box.w * 0.09);
      c.beginPath();
      if (c.roundRect) c.roundRect(box.x + box.w * 0.06, box.y + box.h * 0.08,
                                   box.w * 0.88, box.h * 0.84, box.w * 0.10);
      else c.rect(box.x, box.y, box.w, box.h);
      c.stroke();
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
