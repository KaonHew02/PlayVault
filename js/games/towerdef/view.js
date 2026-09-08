/* 塔防 / Tower Defense — view.

   Two clicks and nothing else: pick a tower in the shop, tap a green square.
   Tapping a tower you already own selects it instead, and the shop turns into
   its upgrade and sell panel — no separate mode, no modifier key.

   Range is drawn while a tower is selected and while a shop item is armed, so
   you can see what a square covers before you spend the money on it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const KEYS = ['gun', 'frost', 'cannon'];

  PV.TowerDefView = function (ctx) {
    const opts = ctx.opts || {};
    let armed = 'gun', chosen = null, hover = null;
    let shop, info, hud, waveEl, livesEl, moneyEl, waveBtn;

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: { ' ': 'next', Enter: 'next', '1': 'pick1', '2': 'pick2', '3': 'pick3' },

      create: () => new PV.TowerDef({ seed: PV.newSeed(), map: opts.map || 'meadow' }),

      onReset() { armed = 'gun'; chosen = null; hover = null; },

      fit(availW, availH) {
        const w = Math.max(260, Math.min(availW, 1000));
        return { w: w, h: Math.min(w * 10 / 16, availH) };
      },

      build(api) {
        waveEl = PV.el('b', {}, '0');
        livesEl = PV.el('b', {}, '20');
        moneyEl = PV.el('b', {}, '220');
        hud = PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('td.wave')), waveEl,
          PV.el('span', { class: 'k' }, t('td.lives')), livesEl,
          PV.el('span', { class: 'k' }, t('td.money')), moneyEl);

        waveBtn = PV.el('button', { class: 'btn primary wide', onclick: () => api.input('next') },
          t('td.startWave'));

        shop = PV.el('div', { class: 'td-shop' });
        info = PV.el('div', { class: 'td-info' });
        api.side.appendChild(hud);
        api.side.appendChild(waveBtn);
        api.below.appendChild(shop);
        api.below.appendChild(info);
        paintShop(api);
      },

      onPointer(game, pt, geom, api) {
        const cell = geom.w / game.map.cols;
        const cx = Math.floor(pt.x / cell), cy = Math.floor(pt.y / cell);
        if (!game.inGrid(cx, cy)) return;

        const existing = game.towerAt(cx, cy);
        if (existing) { chosen = existing; paintShop(api); return; }
        chosen = null;
        if (armed) game.build(cx, cy, armed);
        paintShop(api);
      },

      onFrame(game, api) {
        waveEl.textContent = game.wave + ' / ' + game.waves;
        livesEl.textContent = String(game.lives);
        moneyEl.textContent = String(game.money);
        waveBtn.disabled = !game.building || !!game.queue.length || !!game.enemies.length;
        waveBtn.textContent = game.rest > 0
          ? t('td.startIn', { n: Math.ceil(game.rest / 60) })
          : t('td.startWave');
        if (chosen && game.towers.indexOf(chosen) < 0) { chosen = null; paintShop(api); }
      },

      draw(c, game, geom) {
        const map = game.map;
        const cell = geom.w / map.cols;

        c.fillStyle = '#24402C';
        c.fillRect(0, 0, geom.w, geom.h);
        c.strokeStyle = 'rgba(255,255,255,.05)';
        c.lineWidth = 1;
        c.beginPath();
        for (let x = 1; x < map.cols; x++) { c.moveTo(x * cell, 0); c.lineTo(x * cell, geom.h); }
        for (let y = 1; y < map.rows; y++) { c.moveTo(0, y * cell); c.lineTo(geom.w, y * cell); }
        c.stroke();

        c.fillStyle = '#6B5A44';
        for (const p of map.path) c.fillRect(p.x * cell, p.y * cell, cell, cell);

        // Entrance and exit, so it is obvious which way they come from.
        const first = map.path[0], last = map.path[map.path.length - 1];
        c.fillStyle = 'rgba(248,113,113,.55)';
        c.fillRect(first.x * cell, first.y * cell, cell, cell);
        c.fillStyle = 'rgba(52,211,153,.45)';
        c.fillRect(last.x * cell, last.y * cell, cell, cell);

        for (const tw of game.towers) {
          const st = game.statsOf(tw);
          if (tw === chosen) {
            c.fillStyle = 'rgba(246,179,43,.12)';
            c.beginPath(); c.arc(tw.x * cell, tw.y * cell, st.range * cell, 0, Math.PI * 2); c.fill();
          }
          c.fillStyle = st.spec.colour;
          c.beginPath();
          c.arc(tw.x * cell, tw.y * cell, cell * 0.32, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#0D1218';
          c.font = '700 ' + Math.round(cell * 0.34) + 'px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(tw.level), tw.x * cell, tw.y * cell + cell * 0.02);
          if (tw === chosen) {
            c.strokeStyle = '#F6B32B';
            c.lineWidth = Math.max(2, cell * 0.06);
            c.beginPath(); c.arc(tw.x * cell, tw.y * cell, cell * 0.38, 0, Math.PI * 2); c.stroke();
          }
        }

        for (const s of game.shots) {
          c.strokeStyle = s.colour;
          c.globalAlpha = s.life / 6;
          c.lineWidth = Math.max(1.5, cell * 0.07);
          c.beginPath();
          c.moveTo(s.x1 * cell, s.y1 * cell);
          c.lineTo(s.x2 * cell, s.y2 * cell);
          c.stroke();
          c.globalAlpha = 1;
        }

        for (const e of game.enemies) {
          const p = game.positionAt(e.dist);
          const spec = PV.TowerDef.KINDS[e.kind];
          const r = cell * (e.kind === 'tank' ? 0.30 : 0.22);
          c.fillStyle = e.slowFor > 0 ? '#7DD3FC' : spec.colour;
          c.beginPath(); c.arc(p.x * cell, p.y * cell, r, 0, Math.PI * 2); c.fill();

          const w = cell * 0.6, h = Math.max(2, cell * 0.08);
          c.fillStyle = 'rgba(0,0,0,.55)';
          c.fillRect(p.x * cell - w / 2, p.y * cell - r - h * 1.8, w, h);
          c.fillStyle = '#34D399';
          c.fillRect(p.x * cell - w / 2, p.y * cell - r - h * 1.8, w * Math.max(0, e.hp / e.maxHp), h);
        }
      },

      outcome(game, st) {
        const cleared = game.overReason === 'cleared';
        return {
          result: cleared ? 'win' : 'lose',
          score: game.score,
          xp: cleared ? 140 : Math.max(10, game.wave * 6),
          tone: cleared ? 'good' : 'bad',
          title: cleared ? t('td.cleared') : t('td.overrun'),
          lines: [
            t('td.wave') + ': ' + game.wave + ' / ' + game.waves,
            t('td.killed') + ': ' + game.killed + ' · ' + t('td.leaked') + ': ' + game.leaked,
            '@best'
          ]
        };
      }
    });

    /** The shop doubles as the selected tower's panel — one place, two states. */
    function paintShop(api) {
      const game = api.game;
      PV.clear(shop);
      PV.clear(info);

      if (chosen) {
        const st = game.statsOf(chosen);
        info.appendChild(PV.el('span', { class: 'chip' }, t('td.' + chosen.type)
          + ' · ' + t('common.level') + ' ' + chosen.level));
        info.appendChild(PV.el('span', { class: 'chip' }, t('td.damage') + ' ' + Math.round(st.dmg)));
        info.appendChild(PV.el('span', { class: 'chip' }, t('td.range') + ' ' + st.range.toFixed(1)));
        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          disabled: chosen.level >= 3 || game.money < game.upgradeCost(chosen),
          onclick: () => { game.upgrade(chosen); paintShop(api); api.draw(); }
        }, chosen.level >= 3 ? t('td.maxLevel') : t('td.upgrade') + ' · ' + game.upgradeCost(chosen)));
        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          onclick: () => { game.sell(chosen); chosen = null; paintShop(api); api.draw(); }
        }, t('td.sell')));
        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          onclick: () => { chosen = null; paintShop(api); api.draw(); }
        }, t('common.close')));
        return;
      }

      for (const key of KEYS) {
        const spec = PV.TowerDef.TOWERS[key];
        shop.appendChild(PV.el('button', {
          class: 'btn ghost td-buy' + (armed === key ? ' on' : ''),
          onclick: () => { armed = key; paintShop(api); }
        },
          PV.el('i', { class: 'swatch', style: { background: spec.colour } }),
          t('td.' + key) + ' · ' + spec.cost));
      }
      info.appendChild(PV.el('span', { class: 'muted small' }, t('td.hint')));
    }
  };

})(window.PV);
