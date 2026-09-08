/* Sudoku — view.

   The grid is built once and updated in place; nothing here rebuilds 81 nodes
   on every keypress.

   An unfinished puzzle is saved after every move under 'sudoku.saved' and
   offered back on return, because the one thing a half-hour Sudoku cannot
   survive is a closed tab. Only the player's work is stored — the deal itself
   is rebuilt from the seed. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const SAVE = 'sudoku.saved';

  PV.SudokuView = function (ctx) {
    const difficulty = (ctx.opts && ctx.opts.difficulty) || 'normal';
    let game, sel = -1, noteMode = false, timer = null, ended = false;

    const wrap = PV.el('div', { class: 'g-sudoku' });
    const bar = PV.el('div', { class: 'game-bar' });
    const meta = PV.el('div', { class: 'game-status' });
    const btnNew = PV.el('button', { class: 'btn ghost', onclick: () => newGame(true) },
      t('common.newGame'));
    bar.appendChild(meta);
    bar.appendChild(PV.el('div', { class: 'bar-actions' }, btnNew));

    const grid = PV.el('div', { class: 'sudoku-grid', role: 'grid' });
    const cells = [];
    for (let i = 0; i < 81; i++) {
      const c = PV.el('div', {
        class: 'sq', role: 'gridcell', tabindex: '-1',
        onclick: (function (idx) { return () => select(idx); })(i)
      });
      cells.push(c);
      grid.appendChild(c);
    }

    const pad = PV.el('div', { class: 'sudoku-pad' });
    const numBtns = [];
    for (let v = 1; v <= 9; v++) {
      const b = PV.el('button', {
        class: 'num', onclick: (function (n) { return () => enter(n); })(v)
      }, String(v));
      numBtns.push(b);
      pad.appendChild(b);
    }

    const btnNotes = PV.el('button', { class: 'btn ghost', onclick: toggleNotes });
    const btnErase = PV.el('button', { class: 'btn ghost', onclick: () => enter(0) }, t('sudoku.erase'));
    const btnUndo = PV.el('button', { class: 'btn ghost', onclick: undo }, t('common.undo'));
    const btnHint = PV.el('button', { class: 'btn ghost', onclick: hint });
    const btnCheck = PV.el('button', { class: 'btn ghost', onclick: check }, t('sudoku.check'));
    const tools = PV.el('div', { class: 'sudoku-tools' }, btnNotes, btnErase, btnUndo, btnHint, btnCheck);
    const toast = PV.el('div', { class: 'game-toast', hidden: true });

    wrap.appendChild(bar);
    wrap.appendChild(PV.el('div', { class: 'board-box' }, grid));
    wrap.appendChild(pad);
    wrap.appendChild(tools);
    wrap.appendChild(toast);
    ctx.host.appendChild(wrap);

    document.addEventListener('keydown', onKey);
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
      const g = (saved && saved.difficulty === difficulty && !saved.solved)
        ? PV.Sudoku.restore(saved) : null;
      game = g || new PV.Sudoku({ seed: ctx.seed(), difficulty: difficulty });
      begin();
    }

    function newGame(discard) {
      if (discard) PV.Store.del(SAVE);
      game = new PV.Sudoku({ seed: ctx.seed(), difficulty: difficulty });
      begin();
    }

    function begin() {
      ended = false;
      sel = -1;
      noteMode = false;
      game.start();
      clearInterval(timer);
      timer = setInterval(() => { if (!ended) renderMeta(); }, 1000);
      render();
    }

    function save() {
      if (ctx.race) return;                 // a race never touches the solo save
      if (game.solved) PV.Store.del(SAVE);
      else PV.Store.set(SAVE, game.snapshot());
    }

    /* ---- input ---- */

    function select(i) { sel = i; render(); }

    function enter(v) {
      if (ended || sel < 0 || game.isGiven(sel)) return;
      const ok = noteMode && v !== 0
        ? game.apply({ type: 'note', i: sel, v: v })
        : game.apply({ type: 'set', i: sel, v: v });
      if (ok) { save(); render(); }
    }

    function toggleNotes() { noteMode = !noteMode; render(); }

    function undo() {
      if (ended) return;
      if (game.undo()) { save(); render(); }
    }

    function hint() {
      if (ended) return;
      const i = game.hint();
      if (i == null) { say(t('sudoku.noHints')); return; }
      sel = i;
      save();
      render();
    }

    function check() {
      const wrong = game.wrongCells();
      say(wrong.length ? t('sudoku.someWrong', { n: wrong.length }) : t('sudoku.allGood'));
      render(wrong);
    }

    function onKey(e) {
      if (ended || !wrap.isConnected) return;
      const k = e.key;
      if (k >= '1' && k <= '9') { enter(Number(k)); e.preventDefault(); return; }
      if (k === '0' || k === 'Backspace' || k === 'Delete') { enter(0); e.preventDefault(); return; }
      if (k === 'n' || k === 'N') { toggleNotes(); return; }
      if (k === 'u' || k === 'U') { undo(); return; }
      if (k.slice(0, 5) !== 'Arrow') return;
      e.preventDefault();
      if (sel < 0) { sel = 40; render(); return; }
      let r = (sel / 9) | 0, c = sel % 9;
      if (k === 'ArrowUp') r = (r + 8) % 9;
      if (k === 'ArrowDown') r = (r + 1) % 9;
      if (k === 'ArrowLeft') c = (c + 8) % 9;
      if (k === 'ArrowRight') c = (c + 1) % 9;
      sel = r * 9 + c;
      render();
    }

    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(say._t);
      say._t = setTimeout(() => { toast.hidden = true; }, 2400);
    }

    /* ---- render ---- */

    function render(markWrong) {
      const selR = sel >= 0 ? (sel / 9) | 0 : -1;
      const selC = sel >= 0 ? sel % 9 : -1;
      const selBr = selR >= 0 ? ((selR / 3) | 0) : -1;
      const selBc = selC >= 0 ? ((selC / 3) | 0) : -1;
      const selV = sel >= 0 ? game.valueAt(sel) : 0;

      for (let i = 0; i < 81; i++) {
        const node = cells[i];
        const r = (i / 9) | 0, c = i % 9;
        const v = game.valueAt(i);
        const cls = ['sq'];
        if (game.isGiven(i)) cls.push('given');
        if (i === sel) cls.push('sel');
        else if (selR >= 0 && (r === selR || c === selC ||
                 (((r / 3) | 0) === selBr && ((c / 3) | 0) === selBc))) cls.push('peer');
        if (v && selV && v === selV) cls.push('same');
        if (markWrong && markWrong.indexOf(i) >= 0) cls.push('wrong');
        node.className = cls.join(' ');

        if (v) {
          if (node.dataset.mode !== 'v' || node.textContent !== String(v)) {
            PV.clear(node);
            node.dataset.mode = 'v';
            node.appendChild(document.createTextNode(String(v)));
          }
        } else if (game.notes[i]) {
          PV.clear(node);
          node.dataset.mode = 'n';
          const box = PV.el('div', { class: 'marks' });
          for (let n = 1; n <= 9; n++) {
            box.appendChild(PV.el('i', {}, game.noteAt(i, n) ? String(n) : ''));
          }
          node.appendChild(box);
        } else if (node.dataset.mode !== '0') {
          PV.clear(node);
          node.dataset.mode = '0';
        }
      }

      btnNotes.className = 'btn ghost' + (noteMode ? ' on' : '');
      btnNotes.textContent = t('sudoku.notes');
      btnHint.textContent = t('common.hint') + ' · ' + game.hintsLeft;
      btnHint.disabled = !game.hintsLeft;
      btnUndo.disabled = !game.canUndo();

      // Grey a digit once all nine are placed.
      const counts = new Array(10).fill(0);
      for (let i = 0; i < 81; i++) counts[game.valueAt(i)]++;
      numBtns.forEach((b, k) => { b.disabled = counts[k + 1] >= 9; });

      renderMeta();
      if (game.solved && !ended) finish();
    }

    function renderMeta() {
      PV.clear(meta);
      meta.appendChild(PV.el('span', { class: 'chip' }, t('diff.' + difficulty)));
      meta.appendChild(PV.el('span', { class: 'chip mono' }, PV.fmtTime(game.elapsedMs)));
      meta.appendChild(PV.el('span', { class: 'chip' + (game.mistakes ? ' bad' : '') },
        t('sudoku.mistakes') + ' ' + game.mistakes));
      meta.appendChild(PV.el('span', { class: 'chip mono dim', title: t('common.seed') },
        game.shareCode));
    }

    function finish() {
      ended = true;
      clearInterval(timer);
      PV.Store.del(SAVE);
      const timeMs = game.elapsedMs;
      const xp = ({ easy: 30, normal: 55, hard: 85, expert: 120 })[difficulty] || 55;
      const rec = ctx.record({
        result: 'solved', timeMs: timeMs, xp: Math.max(10, xp - game.mistakes * 5),
        lowerTimeIsBetter: true
      });
      ctx.gameOver({
        title: t('result.solved'),
        tone: 'good',
        lines: [
          t('common.time') + ': ' + PV.fmtTime(timeMs) + (rec.newBestTime ? ' · ' + t('result.newBest') : ''),
          t('sudoku.mistakes') + ': ' + game.mistakes,
          rec.xp.gained ? '+' + rec.xp.gained + ' ' + t('profile.xp') : null
        ],
        again: () => newGame(true)
      });
    }

    function relabel() {
      btnNew.textContent = t('common.newGame');
      btnErase.textContent = t('sudoku.erase');
      btnUndo.textContent = t('common.undo');
      btnCheck.textContent = t('sudoku.check');
      render();
    }

    return {
      destroy() {
        clearInterval(timer);
        clearTimeout(say._t);
        game.stop();
        save();
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('pv:lang', relabel);
        wrap.remove();
      }
    };
  };

})(window.PV);
