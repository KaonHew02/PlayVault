/* 火柴人对决 / Stick Clash — the panels.

   DOM over the canvas, as in Blend In: the fighter select before a fight,
   the move list during one, and the training dummy's switches.

   THE SELECT is one screen for every mode. You pick your fighter from the
   eight (a locked one shows its price and can be bought where it stands);
   versus picks an opponent from all eight, locked or not, or Random; two
   players pick one each, from the fighters this browser owns; training
   picks a dummy. The tournament picks nobody — the ladder does — and shows
   the ladder instead, with the next fight lit.

   The arrow keys (or A/D, W/S) move through the cards, J or Enter picks,
   and Enter on a picked card fights. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => PV.t(k, p);
  const D = PV.StickData, A = PV.StickArt;

  const nm = f => (PV.I18n && PV.I18n.lang === 'zh' ? f.nameZh : f.name);
  const ttl = f => (PV.I18n && PV.I18n.lang === 'zh' ? f.titleZh : f.title);

  /**
   * h: { mode, meta(), onBuy(id) -> bool, onPick(id), onFight(sel), onDummy(k),
   *      touch, audio }
   */
  PV.StickUI = function (h) {
    const node = PV.el('div', { class: 'stk-ui' });
    // look: a locked fighter being looked at (and maybe bought), not picked.
    const sel = { tab: 0, p2: h.mode === 'train' ? 'ink' : null, focus: 0, look: null };
    let shown = false;

    /* ---- select ---- */
    const title = PV.el('div', { class: 'stk-title' });
    const coins = PV.el('div', { class: 'stk-coins' });
    const tabs = PV.el('div', { class: 'stk-tabs' });
    const grid = PV.el('div', { class: 'stk-grid' });
    const info = PV.el('div', { class: 'stk-info' });
    const ladder = PV.el('div', { class: 'stk-ladder' });
    const keys = PV.el('div', { class: 'stk-keys' });
    const go = PV.el('button', { class: 'stk-go', onclick: fight });
    const select = PV.el('div', { class: 'stk-select', hidden: true },
      PV.el('div', { class: 'stk-top' }, title, coins),
      tabs,
      PV.el('div', { class: 'stk-body' }, grid, info),
      ladder,
      PV.el('div', { class: 'stk-foot' }, keys, go));
    node.appendChild(select);

    /* ---- the move list ---- */
    const movesBody = PV.el('div', { class: 'stk-moves-body' });
    const movesClose = PV.el('button', { class: 'stk-go small', onclick: () => showMoves(false) });
    const moves = PV.el('div', { class: 'stk-moves', hidden: true },
      PV.el('div', { class: 'stk-card-panel' }, movesBody, PV.el('div', { class: 'stk-foot' }, movesClose)));
    node.appendChild(moves);

    /* ---- training ---- */
    const train = PV.el('div', { class: 'stk-train', hidden: true });
    node.appendChild(train);

    const cards = [];
    const big = PV.el('canvas', { class: 'stk-big', width: 150, height: 190 });

    function side() { return sel.tab === 0 ? 'me' : 'foe'; }
    function list() {
      // An opponent can be anybody; Random is the first card.
      return side() === 'foe' && h.mode === 'versus' ? ['random'].concat(D.KEYS) : D.KEYS.slice();
    }
    function current() {
      const m = h.meta();
      if (side() === 'me') return m.pick;
      // A second player fights as somebody this browser owns; until one is picked, a mirror.
      if (h.mode === 'two') return m.owned.indexOf(sel.p2) >= 0 ? sel.p2 : m.pick;
      return sel.p2;
    }

    function build() {
      const m = h.meta();
      const mode = h.mode;
      title.textContent = t('stick.mode.' + mode) + (mode === 'tour' ? ' · ' + t('stick.fightOf', { n: m.tour + 1, of: D.LADDER.length }) : '');
      coins.textContent = '🪙 ' + m.coins;
      coins.hidden = mode === 'two';
      // Tabs.
      tabs.innerHTML = '';
      const names = mode === 'two' ? [t('stick.tab.p1'), t('stick.tab.p2')]
        : mode === 'versus' ? [t('stick.tab.you'), t('stick.tab.foe')]
          : mode === 'train' ? [t('stick.tab.you'), t('stick.tab.dummy')] : [];
      names.forEach((label, i) => {
        tabs.appendChild(PV.el('button', {
          class: 'stk-tab' + (sel.tab === i ? ' on' : ''),
          onclick: () => { sel.tab = i; sel.look = null; sel.focus = Math.max(0, list().indexOf(current() || 'random')); h.audio.click(); build(); }
        }, label));
      });
      tabs.hidden = !names.length;
      // Cards.
      grid.innerHTML = '';
      cards.length = 0;
      list().forEach((id, i) => {
        const cv = PV.el('canvas', { width: 84, height: 100 });
        const owned = id === 'random' || m.owned.indexOf(id) >= 0;
        const needOwn = side() === 'me' || mode === 'two';
        const locked = needOwn && !owned;
        const on = (current() || 'random') === id;
        const card = PV.el('button', {
          class: 'stk-card' + (on ? ' on' : '') + (locked ? ' locked' : '') + (sel.focus === i ? ' focus' : ''),
          onclick: () => choose(id)
        }, cv, PV.el('span', { class: 'nm' }, id === 'random' ? t('stick.random') : nm(D.FIGHTERS[id])),
        locked ? PV.el('span', { class: 'price' }, D.FIGHTERS[id].boss && m.owned.indexOf(id) < 0 ? '🏆 / 🪙' + D.FIGHTERS[id].price : '🪙 ' + D.FIGHTERS[id].price) : null);
        if (id === 'random') drawRandom(cv);
        else A.portrait(cv, id, { locked: locked, alt: side() === 'foe' && id === h.meta().pick });
        grid.appendChild(card);
        cards.push(card);
      });
      // The picked fighter's card.
      drawInfo();
      // The ladder.
      ladder.innerHTML = '';
      ladder.hidden = mode !== 'tour';
      if (mode === 'tour') {
        D.LADDER.forEach((step, i) => {
          const cv = PV.el('canvas', { width: 44, height: 52 });
          A.portrait(cv, step.foe, { dir: -1, alt: step.foe === m.pick });
          ladder.appendChild(PV.el('div', { class: 'stk-rung' + (i < m.tour ? ' done' : '') + (i === m.tour ? ' now' : '') }, cv,
            PV.el('span', {}, step.boss ? '👑' : String(i + 1))));
        });
      }
      keys.textContent = h.touch ? t('stick.selHelpTouch') : t('stick.selHelp');
      go.textContent = t('stick.fight');
      go.disabled = side() === 'me' && m.owned.indexOf(m.pick) < 0;
    }

    function drawRandom(cv) {
      const c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, cv.width, cv.height);
      ['#FF5A4E', '#A77BFF', '#39D5E8', '#5EDB6E', '#FFE14A'].forEach((col, i) => g.addColorStop(i / 4, col));
      c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = 'rgba(13,18,24,.45)'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#fff'; c.font = '900 46px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', cv.width / 2, cv.height / 2 + 2);
    }

    function drawInfo() {
      const m = h.meta();
      const id = sel.look || current() || (side() === 'foe' ? 'random' : 'ink');
      info.innerHTML = '';
      if (id === 'random') {
        drawRandom(big);
        info.appendChild(big);
        info.appendChild(PV.el('h3', {}, t('stick.random')));
        info.appendChild(PV.el('p', { class: 'stk-sub' }, t('stick.randomHint')));
        return;
      }
      const f = D.FIGHTERS[id];
      const needOwn = side() === 'me' || h.mode === 'two';
      const locked = needOwn && m.owned.indexOf(id) < 0;
      A.portrait(big, id, { locked: false, alt: side() === 'foe' && id === m.pick });
      info.appendChild(big);
      info.appendChild(PV.el('h3', {}, nm(f), ' ', PV.el('small', {}, ttl(f))));
      const bars = PV.el('div', { class: 'stk-stats' });
      ['power', 'speed', 'health', 'reach'].forEach((k, i) => {
        const bar = PV.el('span', { class: 'bar' });
        for (let j = 0; j < 5; j++) bar.appendChild(PV.el('i', { class: j < f.stats[i] ? 'on' : '' }));
        bars.appendChild(PV.el('div', { class: 'stk-stat' }, PV.el('span', { class: 'k' }, t('stick.stat.' + k)), bar));
      });
      info.appendChild(bars);
      const sp = PV.el('ul', { class: 'stk-sp' });
      const label = [t('stick.key.sp'), t('stick.key.fwd'), t('stick.key.back'), t('stick.key.ult')];
      f.special.forEach((k, i) => sp.appendChild(PV.el('li', {}, PV.el('b', {}, label[i]), ' ', t('stick.sp.' + k))));
      info.appendChild(sp);
      if (locked) {
        const can = m.coins >= f.price;
        info.appendChild(PV.el('button', {
          class: 'stk-buy', disabled: !can,
          onclick: () => {
            if (!h.onBuy(id)) return;
            sel.look = null;
            if (side() === 'foe') sel.p2 = id;
            build();
          }
        }, t('stick.buy', { n: f.price })));
        if (f.boss) info.appendChild(PV.el('p', { class: 'stk-sub' }, t('stick.bossHint')));
      }
    }

    function choose(id) {
      const m = h.meta();
      h.audio.click();
      sel.focus = Math.max(0, list().indexOf(id));
      const needOwn = side() === 'me' || h.mode === 'two';
      sel.look = needOwn && id !== 'random' && m.owned.indexOf(id) < 0 ? id : null;
      if (side() === 'me') {
        if (m.owned.indexOf(id) >= 0) h.onPick(id);
      } else if (h.mode === 'two') {
        if (m.owned.indexOf(id) >= 0) sel.p2 = id;
      } else sel.p2 = id === 'random' ? null : id;
      if (side() === 'foe' && h.onFoe) h.onFoe(current());
      build();
    }

    function fight() {
      const m = h.meta();
      if (m.owned.indexOf(m.pick) < 0) return;
      h.onFight({ p2: h.mode === 'two' ? current() : sel.p2 });
    }

    /* Keyboard on the select: arrows or WASD move, J or Enter picks, Enter again fights. */
    function key(e) {
      if (!shown) return false;
      const n = list().length, cols = colsNow();
      const k = e.key;
      let f = sel.focus;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') f = (f + n - 1) % n;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') f = (f + 1) % n;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') f = (f + n - cols) % n;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') f = (f + cols) % n;
      else if (k === 'Enter' || k === 'j' || k === 'J' || k === ' ') {
        const id = list()[sel.focus];
        if (id === (current() || 'random') && k === 'Enter') fight(); else choose(id);
        return true;
      } else if (k === 'Tab' && !tabs.hidden) { sel.tab = 1 - sel.tab; sel.look = null; sel.focus = Math.max(0, list().indexOf(current() || 'random')); build(); return true; }
      else return false;
      sel.focus = f;
      cards.forEach((cd, i) => cd.classList.toggle('focus', i === f));
      return true;
    }
    function colsNow() {
      const a = cards[0], b = cards[1];
      if (!a || !b) return 4;
      let n = 1;
      const top = a.offsetTop;
      while (cards[n] && cards[n].offsetTop === top) n++;
      return n;
    }

    function showSelect(on) {
      shown = !!on;
      select.hidden = !on;
      if (on) { sel.focus = Math.max(0, list().indexOf(current() || 'random')); build(); }
    }

    /* ---- move list ---- */
    function showMoves(on, g) {
      moves.hidden = !on;
      if (!on) { if (h.onMoves) h.onMoves(false); return; }
      movesBody.innerHTML = '';
      movesClose.textContent = t('common.close');
      const who = g ? g.f.filter(f => f.human || g.mode === 'train' && f.side === 0) : [];
      const two = h.mode === 'two';
      (who.length ? who : []).forEach(f => {
        const k = two ? (f.side === 0 ? K2P1 : K2P2) : K1;
        const box = PV.el('div', { class: 'stk-movelist' });
        box.appendChild(PV.el('h4', {}, (two ? (f.side ? 'P2 · ' : 'P1 · ') : '') + nm(f.def), ' ', PV.el('small', {}, ttl(f.def))));
        const rows = [
          [k.move, t('stick.mv.move')], [k.jump, t('stick.mv.jump')], [k.block, t('stick.mv.block')],
          [k.atk + ' ' + k.atk + ' ' + k.atk, t('stick.mv.combo')],
          [k.down + ' + ' + k.atk, t('stick.mv.upper')],
          [t('stick.mv.inAir') + ' ' + k.atk, t('stick.mv.air')],
          [k.spc, t('stick.sp.' + f.def.special[0])],
          [k.fwd + ' + ' + k.spc, t('stick.sp.' + f.def.special[1])],
          [k.back + ' + ' + k.spc, t('stick.sp.' + f.def.special[2])],
          [k.down + ' + ' + k.spc, t('stick.sp.' + f.def.special[3]) + ' · ' + t('stick.mv.fullMeter')],
          [k.spc + ' · ' + t('stick.mv.whenHit'), t('stick.mv.breaker')]
        ];
        const tb = PV.el('div', { class: 'stk-rows' });
        rows.forEach(r => tb.appendChild(PV.el('div', { class: 'stk-row' }, PV.el('kbd', {}, r[0]), PV.el('span', {}, r[1]))));
        box.appendChild(tb);
        movesBody.appendChild(box);
      });
      movesBody.appendChild(PV.el('p', { class: 'stk-sub' }, t('stick.tips')));
      if (h.onMoves) h.onMoves(true);
    }

    const K1 = { move: 'A D', jump: 'W', block: 'S', atk: 'J', spc: 'K', fwd: '→', back: '←', down: 'S' };
    const K2P1 = { move: 'A D', jump: 'W', block: 'S', atk: 'F', spc: 'G', fwd: '→', back: '←', down: 'S' };
    const K2P2 = { move: 'J L', jump: 'I', block: 'K', atk: ';', spc: "'", fwd: '→', back: '←', down: 'K' };

    /* ---- training dummy ---- */
    function showTrain(on, now) {
      train.hidden = !on;
      if (!on) return;
      train.innerHTML = '';
      train.appendChild(PV.el('span', { class: 'k' }, t('stick.tab.dummy')));
      PV.StickGame.DUMMY.forEach(k => train.appendChild(PV.el('button', {
        class: 'stk-chip' + (now === k ? ' on' : ''),
        onclick: e => { e.currentTarget.blur(); h.onDummy(k); showTrain(true, k); }
      }, t('stick.dummy.' + k))));
    }

    return {
      node: node,
      showSelect: showSelect,
      showMoves: showMoves,
      showTrain: showTrain,
      movesOpen: () => !moves.hidden,
      selecting: () => shown,
      key: key,
      refresh: () => { if (shown) build(); },
      sel: sel
    };
  };

})(window.PV);
