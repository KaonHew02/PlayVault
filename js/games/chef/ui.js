/* 街头大厨 / Street Chef — the panels.

   The lobby is DOM over the canvas, as Strike Squad's and Blend In's are:
   the chef's level and experience, coins and gems along the top; the five
   trucks; the selected truck's twenty levels with their stars; and its
   kitchen, where the coins go. A level opens a card that says what the
   level asks, what the stars take, what is new on the menu, and offers the
   boosters, paid in gems, before Play.

   Everything shown is read from the save (meta.js) and the catalogue
   (data.js) at paint time; nothing here keeps a number of its own. The
   pictures are the game's own drawings (art.js) on little canvases. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const D = PV.ChefData, M = PV.ChefMeta, A = PV.ChefArt;
  const el = (...a) => PV.el(...a);
  const fmt = n => PV.fmtNum(Math.round(n));

  /** A small canvas with a drawing on it, sharp on any screen. */
  function pic(w, h, draw, cls) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    if (cls) cv.className = cls;
    const c = cv.getContext('2d');
    if (c) { c.setTransform(dpr, 0, 0, dpr, 0, 0); try { draw(c); } catch (e) { /* a missing drawing is not worth a broken panel */ } }
    return cv;
  }

  const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  /** A dish's name from its parts: "Pasta · Red sauce · Parmesan". */
  function dishName(parts) { return parts.map(p => t('chef.part.' + p)).join(' · '); }

  /** The picture on an upgrade row. */
  function upgradePic(truckKey, up, size) {
    const tr = D.TRUCK[truckKey];
    return pic(size, size, c => {
      const s = size;
      if (up.kind === 'station') {
        const st = up.station;
        if (st.type === 'drink') { A.drink(c, st.makes, s / 2, s * 0.86, s * 0.42, 1, true, 0); return; }
        const slot = { cx: s / 2, cy: s * 0.56, r: s * 0.3 };
        const box = { x: s * 0.06, y: s * 0.12, w: s * 0.88, h: s * 0.8, u: s * 0.8 };
        A.cookBody(c, st.art, box, A.themeOf(truckKey));
        A.cookSlot(c, st.art, st.makes, slot, { work: 1, burn: 1 }, { st: 'done', t: 0 }, 0);
        return;
      }
      if (up.kind === 'plates') { A.dish(c, tr.menu[0].parts, s / 2, s * 0.55, s * 0.4); return; }
      if (up.kind === 'warmer') {
        const b = { x: s * 0.05, y: s * 0.2, w: s * 0.9, h: s * 0.7, u: s * 0.7 };
        A.warmer(c, b, [{ cx: s / 2, cy: s * 0.52, r: s * 0.2 }], [tr.stations[0].makes], 0);
        return;
      }
      if (up.kind === 'recipe') {
        A.rr(c, s * 0.2, s * 0.14, s * 0.6, s * 0.74, s * 0.06); A.paint(c, '#C0392B', '#3A2618', s * 0.04);
        A.rr(c, s * 0.26, s * 0.2, s * 0.48, s * 0.62, s * 0.04); A.paint(c, '#FFF6E0');
        A.star(c, s / 2, s * 0.44, s * 0.16, true);
        for (let i = 0; i < 3; i++) A.line(c, s * 0.34, s * (0.64 + i * 0.06), s * 0.66, s * (0.64 + i * 0.06), '#C9B98E', s * 0.025);
        return;
      }
      const th = A.themeOf(truckKey);
      if (up.key === 'awning') {
        for (let i = 0; i < 5; i++) {
          c.fillStyle = i % 2 ? th.b : th.a;
          c.fillRect(s * (0.1 + i * 0.16), s * 0.25, s * 0.16, s * 0.3);
          c.beginPath(); c.arc(s * (0.18 + i * 0.16), s * 0.55, s * 0.08, 0, Math.PI); c.fill();
        }
        A.line(c, s * 0.1, s * 0.25, s * 0.9, s * 0.25, '#3A2618', s * 0.04);
      } else if (up.key === 'lights') {
        c.beginPath(); c.moveTo(s * 0.08, s * 0.3); c.quadraticCurveTo(s / 2, s * 0.62, s * 0.92, s * 0.3);
        c.strokeStyle = '#3A2618'; c.lineWidth = s * 0.03; c.stroke();
        const cols = ['#FFD447', '#FF6B8A', '#4DB6E8', '#8BD17C', '#FF9F1C'];
        for (let i = 0; i < 5; i++) {
          const x = s * (0.18 + i * 0.16), y = s * 0.3 + Math.sin((i + 0.5) / 5 * Math.PI) * s * 0.16 + s * 0.06;
          A.ell(c, x, y, s * 0.05, s * 0.07); A.paint(c, cols[i], '#3A2618', s * 0.02);
        }
      } else if (up.key === 'music') {
        A.line(c, s * 0.42, s * 0.7, s * 0.42, s * 0.22, '#3A2618', s * 0.06);
        A.line(c, s * 0.7, s * 0.62, s * 0.7, s * 0.16, '#3A2618', s * 0.06);
        A.line(c, s * 0.42, s * 0.24, s * 0.7, s * 0.18, '#3A2618', s * 0.1);
        A.ell(c, s * 0.34, s * 0.72, s * 0.1, s * 0.08, -0.4); A.paint(c, '#8E63D6', '#3A2618', s * 0.03);
        A.ell(c, s * 0.62, s * 0.64, s * 0.1, s * 0.08, -0.4); A.paint(c, '#8E63D6', '#3A2618', s * 0.03);
      } else if (up.key === 'jar') {
        A.rr(c, s * 0.28, s * 0.3, s * 0.44, s * 0.56, s * 0.12); A.paint(c, 'rgba(200,230,255,.7)', '#3A2618', s * 0.04);
        A.rr(c, s * 0.32, s * 0.22, s * 0.36, s * 0.1, s * 0.03); A.paint(c, '#8B6B45', '#3A2618', s * 0.03);
        for (let i = 0; i < 4; i++) A.coin(c, s * (0.4 + (i % 2) * 0.18), s * (0.74 - Math.floor(i / 2) * 0.14), s * 0.08);
      }
    });
  }

  /** What an upgrade does at a level, in words. */
  function effect(up, lv) {
    if (up.kind === 'station') {
      const st = up.station;
      if (lv < 1) return '';
      const n = st.slots[lv - 1];
      const faster = Math.round((1 - st.speed[lv - 1]) * 100);
      return t(st.type === 'drink' ? 'chef.fx.cups' : 'chef.fx.slots', { n: n }) + (faster ? ' · ' + t('chef.fx.faster', { n: faster }) : '');
    }
    if (up.kind === 'plates') return t('chef.fx.plates', { n: [0, 2, 3, 4][lv] });
    if (up.kind === 'warmer') return lv ? t('chef.fx.warmer', { n: [0, 2, 3][lv] }) : t('chef.fx.none');
    if (up.kind === 'recipe') return t('chef.fx.recipe', { n: lv * 15 });
    if (up.key === 'jar') return t('chef.fx.jar');
    return t('chef.fx.calm', { n: Math.round(up.decor.calm * 100) });
  }

  /**
   * opts: {
   *   meta()                         the save, as it is now
   *   play(truck, level, boost)      start a level; returns an error key or null
   *   changed()                      the save changed (a purchase)
   *   sound: { on(), toggle() }
   * }
   */
  PV.ChefUI = function (opts) {
    const node = el('div', { class: 'chef-menu', hidden: true });
    let tab = 'map';
    let card = null;                 // { truck, level, boost }
    let help = false;
    let toastT = 0;

    const top = el('div', { class: 'chef-top' });
    const tabs = el('div', { class: 'chef-tabs' });
    const body = el('div', { class: 'chef-body' });
    const layer = el('div', { class: 'chef-layer', hidden: true });
    const toast = el('div', { class: 'chef-toast', hidden: true });
    node.appendChild(top);
    node.appendChild(tabs);
    node.appendChild(body);
    node.appendChild(layer);
    node.appendChild(toast);

    function meta() { return opts.meta(); }
    function say(text) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastT);
      toastT = setTimeout(() => { toast.hidden = true; }, 2200);
    }

    /* ------------------------------------------------------------- top */

    function paintTop() {
      const m = meta();
      const lv = M.level(m);
      PV.clear(top);
      top.appendChild(el('div', { class: 'chef-rank' },
        el('span', { class: 'badge' }, String(lv.level)),
        el('span', { class: 'who' },
          el('b', {}, t('chef.chefLevel', { n: lv.level })),
          el('span', { class: 'xp' }, el('i', { style: { width: Math.round(lv.into / lv.need * 100) + '%' } })),
          el('small', {}, lv.into + ' / ' + lv.need + ' ' + t('chef.xp')))));
      top.appendChild(el('div', { class: 'chef-purse' },
        el('span', { class: 'coins', title: t('chef.coins') }, pic(18, 18, c => A.coin(c, 9, 9, 7.5)), fmt(m.coins)),
        el('span', { class: 'gems', title: t('chef.gems') }, pic(18, 18, c => A.gem(c, 9, 9, 7.5)), fmt(m.gems)),
        el('button', { class: 'btn sm', title: t('chef.sound'), onclick: () => { opts.sound.toggle(); paintTop(); } }, opts.sound.on() ? '🔊' : '🔇'),
        el('button', { class: 'btn sm', onclick: () => { help = true; paintLayer(); } }, t('chef.howTo'))));
    }

    function paintTabs() {
      PV.clear(tabs);
      for (const k of ['map', 'kitchen']) {
        tabs.appendChild(el('button', { class: 'chef-tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; paint(); } }, t('chef.tab.' + k)));
      }
    }

    /* ---------------------------------------------------------- trucks */

    function paintTrucks() {
      const m = meta();
      const row = el('div', { class: 'chef-trucks' });
      for (const tr of D.TRUCKS) {
        const st = m.trucks[tr.key];
        const on = m.truck === tr.key;
        const blk = st.open ? null : M.openBlock(m, tr.key);
        const lines = [];
        if (st.open) lines.push(el('small', {}, '★ ' + M.starsOn(m, tr.key) + ' / ' + D.LEVELS * 3));
        else if (blk && blk.why === 'level') lines.push(el('small', {}, t('chef.lock.level', { truck: t('chef.truck.' + blk.truck), n: blk.level })));
        else lines.push(el('small', { class: blk ? 'poor' : 'ok' }, pic(13, 13, c => A.coin(c, 6.5, 6.5, 5.5)), ' ' + fmt(tr.price)));
        row.appendChild(el('button', {
          class: 'chef-truck' + (on ? ' on' : '') + (st.open ? '' : ' locked'),
          onclick: () => {
            if (st.open) { M.pick(m, tr.key); opts.changed(); paint(); return; }
            if (!blk) {
              if (M.openTruck(m, tr.key)) { opts.changed(); say(t('chef.opened', { truck: t('chef.truck.' + tr.key) })); paint(); }
              return;
            }
            say(blk.why === 'coins' ? t('chef.needCoins', { n: fmt(blk.need) }) : t('chef.lock.level', { truck: t('chef.truck.' + blk.truck), n: blk.level }));
          }
        },
          pic(112, 68, c => { A.truck(c, tr.key, 6, 10, 100); if (!st.open) { c.fillStyle = 'rgba(30,30,36,.45)'; c.fillRect(0, 0, 112, 68); A.say(c, '🔒', 56, 36, 22, '#fff'); } }),
          el('b', {}, t('chef.truck.' + tr.key)),
          lines));
      }
      return row;
    }

    function paintLevels() {
      const m = meta();
      const key = m.truck;
      const st = m.trucks[key];
      const grid = el('div', { class: 'chef-levels' });
      for (let L = 1; L <= D.LEVELS; L++) {
        const open = M.levelOpen(m, key, L);
        const spec = D.levelSpec(key, L);
        const marks = (spec.noBurn ? '🔥' : '') + (spec.noLoss ? '😊' : '') + (spec.goal.type === 'serve' ? '👥' : '');
        grid.appendChild(el('button', {
          class: 'chef-level' + (open ? '' : ' locked') + (open && !st.stars[L - 1] ? ' next' : ''),
          disabled: !open,
          onclick: () => openCard(key, L)
        },
          el('span', { class: 'n' }, open ? String(L) : '🔒'),
          el('span', { class: 'st' }, open ? stars(st.stars[L - 1]) : ' '),
          marks ? el('span', { class: 'mk' }, marks) : null));
      }
      return grid;
    }

    /* --------------------------------------------------------- kitchen */

    function paintKitchen() {
      const m = meta();
      const key = m.truck;
      const kit = m.trucks[key].kit;
      const list = el('div', { class: 'chef-kit' });
      list.appendChild(el('p', { class: 'muted small' }, t('chef.kitchenOf', { truck: t('chef.truck.' + key) })));
      for (const up of D.upgrades(key)) {
        const lv = kit[up.key];
        const price = M.priceOf(m, key, up);
        const pips = el('span', { class: 'pips' });
        for (let i = up.min === 0 ? 1 : 2; i <= up.max; i++) pips.appendChild(el('i', { class: i <= lv ? 'on' : '' }));
        const name = up.kind === 'station' ? t('chef.st.' + up.station.id) : t('chef.up.' + up.key);
        const now = effect(up, lv), next = price != null ? effect(up, lv + 1) : '';
        list.appendChild(el('div', { class: 'chef-up' },
          upgradePic(key, up, 46),
          el('div', { class: 'what' },
            el('b', {}, name, ' ', pips),
            el('small', {}, now + (next && next !== now ? ' → ' + next : ''))),
          price == null
            ? el('span', { class: 'chef-max' }, t('chef.max'))
            : el('button', {
              class: 'btn sm buy' + (m.coins < price ? ' poor' : ''),
              disabled: m.coins < price,
              onclick: () => { if (M.buy(m, key, up.key)) { opts.changed(); opts.sound.buy(); paint(); } }
            }, pic(14, 14, c => A.coin(c, 7, 7, 6)), ' ' + fmt(price))));
      }
      return list;
    }

    /* ------------------------------------------------------ level card */

    function openCard(key, L) {
      if (!M.levelOpen(meta(), key, L)) return;
      card = { truck: key, level: L, boost: {} };
      paintLayer();
    }

    function paintCard() {
      const m = meta();
      const key = card.truck, L = card.level;
      const tr = D.TRUCK[key];
      const spec = D.levelSpec(key, L);
      const list = D.roster(spec, D.seedFor(key, L));
      const tg = D.targets(spec, list).stars;
      const best = m.trucks[key].stars[L - 1];
      const box = el('div', { class: 'chef-card' });
      box.appendChild(el('div', { class: 'head' },
        el('h3', {}, t('chef.levelN', { n: L }) + ' · ' + t('chef.truck.' + key)),
        el('button', { class: 'btn sm', onclick: () => { card = null; paintLayer(); } }, '✕')));
      const goals = el('ul', { class: 'goals' });
      goals.appendChild(el('li', {}, spec.goal.type === 'serve' ? t('chef.goal.serve', { n: spec.goal.n }) : t('chef.goal.coins', { n: fmt(tg[0]) })));
      if (spec.noBurn) goals.appendChild(el('li', { class: 'warn' }, '🔥 ' + t('chef.goal.noBurn')));
      if (spec.noLoss) goals.appendChild(el('li', { class: 'warn' }, '😊 ' + t('chef.goal.noLoss')));
      goals.appendChild(el('li', { class: 'muted' }, t('chef.goal.meta', { n: spec.count, time: PV.fmtTime(spec.time * 1000) })));
      box.appendChild(goals);
      box.appendChild(el('div', { class: 'stars' },
        [1, 2, 3].map(i => el('span', { class: 'line' + (best >= i ? ' got' : '') }, stars(i).replace(/☆/g, ''), ' ', pic(13, 13, c => A.coin(c, 6.5, 6.5, 5.5)), ' ' + fmt(tg[i - 1])))));
      if (best) box.appendChild(el('p', { class: 'muted small' }, t('chef.best', { s: stars(best), n: fmt(m.trucks[key].best[L - 1]) })));
      if (spec.fresh.length) {
        const nu = el('div', { class: 'fresh' }, el('b', {}, t('chef.newToday')));
        for (const i of spec.fresh) {
          const parts = tr.menu[i].parts;
          nu.appendChild(el('span', { class: 'dish' }, pic(44, 44, c => A.item(c, parts, 22, 20, 17, 0)), el('small', {}, dishName(parts))));
        }
        box.appendChild(nu);
      }
      const bs = el('div', { class: 'boosts' }, el('b', {}, t('chef.boosters')));
      for (const b of D.BOOSTERS) {
        const on = !!card.boost[b.id];
        const cost = M.boostCost(Object.assign({}, card.boost, { [b.id]: true }));
        bs.appendChild(el('button', {
          class: 'chef-boost' + (on ? ' on' : ''),
          disabled: !on && cost > m.gems,
          title: t('chef.boost.' + b.id + '.tip'),
          onclick: () => { card.boost[b.id] = !on; paintLayer(); }
        }, el('span', { class: 'ic' }, { fast: '⚡', calm: '❤️', noburn: '🧯' }[b.id]),
          el('span', { class: 'nm' }, t('chef.boost.' + b.id)),
          el('small', {}, pic(12, 12, c => A.gem(c, 6, 6, 5)), ' ' + b.gems)));
      }
      box.appendChild(bs);
      box.appendChild(el('button', {
        class: 'btn primary wide',
        onclick: () => {
          const err = opts.play(key, L, card.boost);
          if (err) { say(t(err)); return; }
          card = null; paintLayer();
        }
      }, t('chef.play') + (M.boostCost(card.boost) ? ' · ' + M.boostCost(card.boost) + ' 💎' : '')));
      return box;
    }

    function paintHelp() {
      const box = el('div', { class: 'chef-card help' });
      box.appendChild(el('div', { class: 'head' },
        el('h3', {}, t('chef.howTo')),
        el('button', { class: 'btn sm', onclick: () => { help = false; opts.seenHelp(); paintLayer(); } }, '✕')));
      const ol = el('ol', {});
      for (let i = 1; i <= 6; i++) ol.appendChild(el('li', {}, t('chef.help.' + i)));
      box.appendChild(ol);
      box.appendChild(el('button', { class: 'btn primary wide', onclick: () => { help = false; opts.seenHelp(); paintLayer(); } }, t('chef.gotIt')));
      return box;
    }

    function paintLayer() {
      PV.clear(layer);
      const what = help ? paintHelp() : (card ? paintCard() : null);
      layer.hidden = !what;
      if (what) layer.appendChild(what);
    }

    /* ----------------------------------------------------------- paint */

    function paint() {
      paintTop();
      paintTabs();
      PV.clear(body);
      body.appendChild(paintTrucks());
      body.appendChild(tab === 'map' ? paintLevels() : paintKitchen());
      paintLayer();
    }

    layer.addEventListener('click', e => { if (e.target === layer) { card = null; help = false; paintLayer(); } });

    return {
      node: node,
      show(on) { node.hidden = !on; if (on) paint(); },
      get open() { return !node.hidden; },
      /** Straight to a level's card, as after a level ends. */
      openLevel(key, L) { tab = 'map'; paint(); openCard(key, L); },
      help() { help = true; paintLayer(); },
      refresh: paint,
      toast: say,
      destroy() { clearTimeout(toastT); node.remove(); }
    };
  };

  PV.ChefUI.dishName = dishName;
  PV.ChefUI.pic = pic;

})(window.PV);
