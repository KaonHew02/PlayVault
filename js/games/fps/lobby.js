/* 突击小队 / Strike Squad — the lobby.

   What the reference shows before a battle, as a panel over the match
   while it waits for you: your rank and coins across the top, and six
   tabs — Play (the loadout and the Deploy button), Armory (buy a gun,
   upgrade it, fit its attachments, paint it, hang a charm on it), Wardrobe
   (clothes that change your numbers), Skills (three of four, keys 4 5 6),
   Missions (today's, this week's, and the crates) and Settings (the mouse,
   the field of view, the sound).

   Every change goes through PV.FpsMeta and is saved as it is made; the
   panel only ever redraws itself from the record. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const el = PV.el;
  const D = PV.FpsData, M = PV.FpsMeta;

  const TABS = ['play', 'armory', 'wardrobe', 'skills', 'missions', 'settings'];
  const SKILL_ICON = { medkit: '✚', stim: '⚡', radar: '◎', shield: '⛨' };

  /** A canvas with a gun painted side on, sharp on any screen. */
  function gunCanvas(id, w, h, look, cls) {
    const c = el('canvas', { class: cls || 'fps-gun' });
    const r = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.scale(r, r);
    PV.FpsArt.paintGun(x, id, 4, 4, w - 8, h - 8, look);
    return c;
  }

  function bar(label, v, delta) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    return el('div', { class: 'fps-stat' },
      el('span', { class: 'k' }, label),
      el('span', { class: 'track' }, el('i', { style: { width: pct + '%' } }),
        delta ? el('b', { style: { width: Math.round(Math.max(0, Math.min(1, delta)) * 100) + '%' } }) : null));
  }

  /** How a gun rates, 0..1 on each line of the armory card. */
  function ratings(s) {
    return {
      dmg: Math.min(1, s.dmg * s.pellets / 150),
      rate: s.cat === 'melee' ? 0.3 : Math.min(1, s.rpm / 1200),
      range: s.cat === 'melee' ? 0.02 : Math.min(1, s.r1 / 120),
      acc: s.cat === 'melee' ? 1 : Math.max(0.05, Math.min(1, 1 - s.hip * 0.07 - s.kick * 0.18)),
      mob: Math.max(0, Math.min(1, (s.move - 0.8) / 0.3)),
      mag: s.cat === 'melee' ? 0 : Math.min(1, s.mag / 100)
    };
  }

  PV.FpsLobby = function (o) {
    const root = el('div', { class: 'fps-lobby' });
    let tab = 'play', cat = 'ar', sel = null, toast = '', toastT = 0;
    let meta = o.meta;

    function commit(ok, sound) {
      if (ok) { M.save(meta); if (o.audio) o.audio[sound || 'click'](); o.onChange && o.onChange(); }
      else if (o.audio) o.audio.dry();
      render();
    }
    function say(msg) { toast = msg; toastT = Date.now(); render(); }

    function render() {
      PV.clear(root);
      const rk = M.rank(meta);
      root.appendChild(el('div', { class: 'fps-top' },
        el('div', { class: 'fps-rank' },
          el('span', { class: 'badge' }, String(rk.level)),
          el('span', { class: 'who' },
            el('b', {}, t('fps.rank.' + rk.title)),
            el('span', { class: 'xp' }, el('i', { style: { width: Math.round(rk.into / rk.need * 100) + '%' } })),
            el('small', {}, t('fps.xpTo', { n: PV.fmtNum(rk.need - rk.into), lvl: rk.level + 1 })))),
        el('div', { class: 'fps-coins' }, '🪙 ' + PV.fmtNum(meta.coins))));
      const tabs = el('div', { class: 'fps-tabs' });
      for (const k of TABS) {
        const badge = k === 'missions' ? readyCount() : 0;
        tabs.appendChild(el('button', { class: 'fps-tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; render(); } },
          t('fps.tab.' + k), badge ? el('span', { class: 'dot' }, String(badge)) : null));
      }
      root.appendChild(tabs);
      const body = el('div', { class: 'fps-body' });
      ({ play: play, armory: armory, wardrobe: wardrobe, skills: skills, missions: missions, settings: settings })[tab](body);
      root.appendChild(body);
      if (toast && Date.now() - toastT < 3500) root.appendChild(el('div', { class: 'fps-toast' }, toast));
    }

    function readyCount() {
      const ms = M.missions(meta);
      const c = M.crates(meta);
      return ms.daily.concat(ms.weekly).filter(x => x.done && !x.claimed).length + c.killer + c.winner;
    }

    /* ---- play ---- */

    function play(body) {
      const cfg = o.cfg();
      body.appendChild(el('div', { class: 'fps-mission' },
        el('div', { class: 'mode' }, t('fps.mode.' + cfg.mode), el('small', {}, t('fps.map.' + cfg.map) + ' · ' + t('diff.' + cfg.diff))),
        el('p', { class: 'muted small' }, t('fps.modeInfo.' + cfg.mode))));
      const kit = el('div', { class: 'fps-kit' });
      ['primary', 'secondary', 'melee'].forEach((slot, i) => {
        const id = meta.kit[slot], look = { att: meta.fit[id] || {}, camo: (meta.look[id] || {}).camo };
        kit.appendChild(el('button', {
          class: 'fps-slot', onclick: () => { tab = 'armory'; cat = D.W[id].cat; sel = id; render(); }
        }, el('small', {}, t('fps.slot.' + slot) + ' · ' + (i + 1)), gunCanvas(id, 150, 56, look), el('b', {}, id.toUpperCase())));
      });
      body.appendChild(kit);
      const row = el('div', { class: 'fps-row' });
      row.appendChild(el('button', { class: 'fps-slot wide', onclick: () => { tab = 'skills'; render(); } },
        el('small', {}, t('fps.tab.skills')),
        el('span', { class: 'icons' }, meta.kit.skills.length ? meta.kit.skills.map((s, i) => el('span', { class: 'sk' }, SKILL_ICON[s] + ' ' + (4 + i))) : t('fps.none'))));
      row.appendChild(el('button', { class: 'fps-slot wide', onclick: () => { tab = 'wardrobe'; render(); } },
        el('small', {}, t('fps.tab.wardrobe')),
        el('span', {}, D.GEAR_SLOTS.map(s => t('fps.gear.' + meta.wear[s])).join(' · '))));
      body.appendChild(row);
      const gs = D.gearStats(meta.wear);
      const perks = [];
      if (gs.armor) perks.push(t('fps.perk.armor', { n: gs.armor }));
      if (gs.speed) perks.push(t('fps.perk.speed', { n: Math.round(gs.speed * 100) }));
      if (gs.reload) perks.push(t('fps.perk.reload', { n: Math.round(gs.reload * 100) }));
      if (gs.ads) perks.push(t('fps.perk.ads', { n: Math.round(gs.ads * 100) }));
      if (gs.quiet) perks.push(t('fps.perk.quiet'));
      if (perks.length) body.appendChild(el('p', { class: 'fps-perks' }, perks.join(' · ')));
      body.appendChild(el('button', { class: 'btn primary fps-deploy', onclick: () => o.onDeploy() }, t('fps.deploy')));
      body.appendChild(el('p', { class: 'muted small fps-keys' }, o.touch ? t('fps.touchHelp') : t('fps.keysHelp')));
    }

    /* ---- armory ---- */

    function armory(body) {
      const cats = el('div', { class: 'fps-cats' });
      for (const c of D.CATS) cats.appendChild(el('button', { class: 'fps-chip' + (cat === c ? ' on' : ''), onclick: () => { cat = c; sel = null; render(); } }, t('fps.cat.' + c)));
      body.appendChild(cats);
      const ids = D.byCat(cat);
      if (!sel || D.W[sel].cat !== cat) sel = ids.find(id => meta.kit[['primary', 'secondary', 'melee'][D.W[id].slot]] === id) || ids[0];
      const grid = el('div', { class: 'fps-guns' });
      for (const id of ids) {
        const w = D.W[id], owned = meta.weapons.indexOf(id) >= 0;
        const eq = meta.kit[['primary', 'secondary', 'melee'][w.slot]] === id;
        const locked = !owned && !M.unlocked(meta, w.lvl);
        grid.appendChild(el('button', { class: 'fps-card' + (sel === id ? ' on' : '') + (locked ? ' locked' : ''), onclick: () => { sel = id; render(); } },
          gunCanvas(id, 120, 44, owned ? { att: meta.fit[id] || {}, camo: (meta.look[id] || {}).camo } : null, 'fps-gun' + (owned ? '' : ' dim')),
          el('b', {}, id.toUpperCase()),
          el('small', {}, eq ? t('fps.equipped') : owned ? t('fps.owned') : locked ? '🔒 ' + t('fps.rankN', { n: w.lvl }) : '🪙 ' + PV.fmtNum(w.price))));
      }
      body.appendChild(grid);
      if (sel) body.appendChild(detail(sel));
    }

    function detail(id) {
      const w = D.W[id], owned = meta.weapons.indexOf(id) >= 0;
      const slotName = ['primary', 'secondary', 'melee'][w.slot];
      const eq = meta.kit[slotName] === id;
      const own = { up: meta.up[id] || {}, att: meta.fit[id] || {} };
      const s = D.stats(id, own), base = D.stats(id);
      const R = ratings(s), R0 = ratings(base);
      const box = el('div', { class: 'fps-detail' });
      const look = { att: own.att, camo: (meta.look[id] || {}).camo };
      box.appendChild(el('div', { class: 'fps-hero' }, gunCanvas(id, 300, 100, look, 'fps-gun big'),
        el('div', {}, el('h4', {}, id.toUpperCase()), el('small', { class: 'muted' }, t('fps.cat.' + w.cat) + ' · ' + t('fps.fire.' + w.fire)))));
      const bars = el('div', { class: 'fps-bars' },
        bar(t('fps.st.dmg'), R0.dmg, R.dmg), bar(t('fps.st.rate'), R0.rate, R.rate), bar(t('fps.st.range'), R0.range, R.range),
        bar(t('fps.st.acc'), R0.acc, R.acc), bar(t('fps.st.mob'), R0.mob, R.mob));
      if (w.cat !== 'melee') bars.appendChild(bar(t('fps.st.mag') + ' ' + s.mag, R0.mag, R.mag));
      box.appendChild(bars);
      const act = el('div', { class: 'fps-actions' });
      if (!owned) {
        const locked = !M.unlocked(meta, w.lvl);
        act.appendChild(el('button', {
          class: 'btn primary', disabled: locked || meta.coins < w.price ? true : null,
          onclick: () => { const ok = M.shop.buyWeapon(meta, id); if (ok) M.shop.equip(meta, id); commit(ok, 'chime'); if (ok) say(t('fps.bought', { what: id.toUpperCase() })); }
        }, locked ? '🔒 ' + t('fps.rankN', { n: w.lvl }) : t('fps.buyFor', { n: PV.fmtNum(w.price) })));
      } else {
        act.appendChild(el('button', { class: 'btn ' + (eq ? 'ghost' : 'primary'), disabled: eq ? true : null, onclick: () => commit(M.shop.equip(meta, id)) }, eq ? t('fps.equipped') : t('fps.equip')));
      }
      box.appendChild(act);
      if (!owned || w.cat === 'melee') {
        if (owned && w.cat === 'melee') box.appendChild(looks(id));
        return box;
      }
      // Upgrades.
      const ups = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.upgrades')));
      for (const tr of D.TRACKS) {
        const lv = (meta.up[id] || {})[tr] | 0, cost = D.upgradeCost(id, tr, lv);
        const pips = el('span', { class: 'pips' });
        for (let i = 0; i < D.UP_MAX; i++) pips.appendChild(el('i', { class: i < lv ? 'on' : '' }));
        ups.appendChild(el('div', { class: 'fps-up' }, el('span', { class: 'k' }, t('fps.up.' + tr)), pips,
          lv >= D.UP_MAX ? el('span', { class: 'max' }, t('fps.max'))
            : el('button', { class: 'btn ghost sm', disabled: meta.coins < cost ? true : null, onclick: () => commit(M.shop.upgrade(meta, id, tr), 'chime') }, '⬆ ' + PV.fmtNum(cost))));
      }
      box.appendChild(ups);
      // Attachments.
      const at = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.attachments')));
      for (const slot of D.ASLOTS) {
        const opts = D.ATTACH[slot].filter(a => D.fits(id, slot, a.id));
        if (opts.length <= 1 && slot !== 'optic') continue;
        const cur = own.att[slot] || (slot === 'optic' ? (w.optic !== 'iron' ? w.optic : 'iron') : 'none');
        const row = el('div', { class: 'fps-opts' }, el('span', { class: 'k' }, t('fps.slot.' + slot)));
        for (const a of opts) {
          const isDefault = a.price === 0 || (slot === 'optic' && a.id === w.optic);
          const have = isDefault || meta.atts.indexOf(slot + ':' + a.id) >= 0;
          const on = cur === a.id;
          const locked = !have && !M.unlocked(meta, a.lvl);
          row.appendChild(el('button', {
            class: 'fps-chip' + (on ? ' on' : '') + (locked ? ' locked' : ''),
            title: t('fps.att.' + a.id + '.d'),
            onclick: () => {
              if (locked) return say(t('fps.unlockAt', { n: a.lvl }));
              if (!have) { if (M.shop.buyAtt(meta, slot, a.id)) { M.shop.fit(meta, id, slot, a.id); commit(true, 'chime'); } else commit(false); return; }
              commit(M.shop.fit(meta, id, slot, isDefault && slot === 'optic' && a.id === w.optic ? D.ATTACH.optic[0].id : a.id));
            }
          }, t('fps.att.' + a.id) + (have ? '' : locked ? ' 🔒' + a.lvl : ' 🪙' + a.price)));
        }
        at.appendChild(row);
      }
      box.appendChild(at);
      box.appendChild(looks(id));
      return box;
    }

    /** Camo and charm rows for a gun. */
    function looks(id) {
      const cur = meta.look[id] || { camo: 'none', charm: 'none' };
      const sec = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.camo')));
      const sw = el('div', { class: 'fps-swatches' });
      for (const c of D.CAMOS) {
        const have = meta.camos.indexOf(c.id) >= 0, locked = !have && !M.unlocked(meta, c.lvl);
        const chip = el('button', {
          class: 'fps-swatch' + (cur.camo === c.id ? ' on' : '') + (locked ? ' locked' : ''),
          title: t('fps.camo.' + c.id) + (have ? '' : locked ? ' · ' + t('fps.rankN', { n: c.lvl }) : ' · 🪙' + c.price),
          onclick: () => {
            if (locked) return say(t('fps.unlockAt', { n: c.lvl }));
            if (!have) { const ok = M.shop.buyCamo(meta, c.id); if (ok) M.shop.dress(meta, id, 'camo', c.id); commit(ok, 'chime'); return; }
            commit(M.shop.dress(meta, id, 'camo', c.id));
          }
        });
        if (c.cols) {
          chip.style.background = 'linear-gradient(135deg,' + c.cols[0] + ' 0 40%,' + c.cols[1] + ' 40% 70%,' + c.cols[2] + ' 70%)';
        }
        chip.appendChild(el('span', {}, have ? '' : locked ? '🔒' : '🪙'));
        sw.appendChild(chip);
      }
      sec.appendChild(sw);
      sec.appendChild(el('h5', {}, t('fps.charm')));
      const ch = el('div', { class: 'fps-opts' });
      for (const c of D.CHARMS) {
        const have = meta.charms.indexOf(c.id) >= 0, locked = !have && !M.unlocked(meta, c.lvl);
        ch.appendChild(el('button', {
          class: 'fps-chip' + (cur.charm === c.id ? ' on' : '') + (locked ? ' locked' : ''),
          onclick: () => {
            if (locked) return say(t('fps.unlockAt', { n: c.lvl }));
            if (!have) { const ok = M.shop.buyCharm(meta, c.id); if (ok) M.shop.dress(meta, id, 'charm', c.id); commit(ok, 'chime'); return; }
            commit(M.shop.dress(meta, id, 'charm', c.id));
          }
        }, t('fps.charm.' + c.id) + (have ? '' : locked ? ' 🔒' + c.lvl : ' 🪙' + c.price)));
      }
      sec.appendChild(ch);
      return sec;
    }

    /* ---- wardrobe ---- */

    function wardrobe(body) {
      for (const slot of D.GEAR_SLOTS) {
        const sec = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.gearSlot.' + slot)));
        const row = el('div', { class: 'fps-items' });
        for (const g of D.GEAR[slot]) {
          const have = g.price === 0 || meta.gear.indexOf(slot + ':' + g.id) >= 0;
          const on = meta.wear[slot] === g.id, locked = !have && !M.unlocked(meta, g.lvl);
          const bits = [];
          if (g.armor) bits.push(t('fps.perk.armor', { n: g.armor }));
          if (g.speed) bits.push(t(g.speed > 0 ? 'fps.perk.speed' : 'fps.perk.slow', { n: Math.round(Math.abs(g.speed) * 100) }));
          if (g.reload) bits.push(t('fps.perk.reload', { n: Math.round(g.reload * 100) }));
          if (g.ads) bits.push(t('fps.perk.ads', { n: Math.round(g.ads * 100) }));
          if (g.quiet) bits.push(t('fps.perk.quiet'));
          row.appendChild(el('button', {
            class: 'fps-item' + (on ? ' on' : '') + (locked ? ' locked' : ''),
            onclick: () => {
              if (locked) return say(t('fps.unlockAt', { n: g.lvl }));
              if (!have) { const ok = M.shop.buyGear(meta, slot, g.id); if (ok) M.shop.wear(meta, slot, g.id); commit(ok, 'chime'); return; }
              commit(M.shop.wear(meta, slot, g.id));
            }
          }, el('i', { class: 'sw', style: { background: '#' + (PV.FpsArt.GEAR_COL[g.id] || [0.3, 0.3, 0.3]).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') } }),
          el('b', {}, t('fps.gear.' + g.id)),
          el('small', {}, bits.join(' · ') || t('fps.noBonus')),
          el('span', { class: 'price' }, on ? t('fps.worn') : have ? t('fps.owned') : locked ? '🔒 ' + t('fps.rankN', { n: g.lvl }) : '🪙 ' + PV.fmtNum(g.price))));
        }
        sec.appendChild(row);
        body.appendChild(sec);
      }
    }

    /* ---- skills ---- */

    function skills(body) {
      body.appendChild(el('p', { class: 'muted small' }, t('fps.skillsHelp')));
      const row = el('div', { class: 'fps-items' });
      for (const s of D.SKILLS) {
        const have = meta.skills.indexOf(s.id) >= 0, on = meta.kit.skills.indexOf(s.id) >= 0;
        const locked = !have && !M.unlocked(meta, s.lvl);
        row.appendChild(el('button', {
          class: 'fps-item' + (on ? ' on' : '') + (locked ? ' locked' : ''),
          onclick: () => {
            if (locked) return say(t('fps.unlockAt', { n: s.lvl }));
            if (!have) { const ok = M.shop.buySkill(meta, s.id); if (ok) M.shop.toggleSkill(meta, s.id); commit(ok, 'chime'); return; }
            const ok = M.shop.toggleSkill(meta, s.id);
            if (!ok) say(t('fps.threeSkills'));
            commit(ok);
          }
        }, el('span', { class: 'big' }, SKILL_ICON[s.id]),
        el('b', {}, t('fps.skill.' + s.id)),
        el('small', {}, t('fps.skill.' + s.id + '.d') + ' · ' + t('fps.cooldown', { n: s.cd })),
        el('span', { class: 'price' }, on ? t('fps.inKit', { n: 4 + meta.kit.skills.indexOf(s.id) }) : have ? t('fps.owned') : locked ? '🔒 ' + t('fps.rankN', { n: s.lvl }) : '🪙 ' + PV.fmtNum(s.price))));
      }
      body.appendChild(row);
    }

    /* ---- missions and crates ---- */

    function missions(body) {
      const ms = M.missions(meta);
      for (const which of ['daily', 'weekly']) {
        const sec = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.' + which)));
        for (const x of ms[which]) {
          const pct = Math.round(x.have / x.n * 100);
          sec.appendChild(el('div', { class: 'fps-mis' + (x.claimed ? ' done' : '') },
            el('div', { class: 'txt' }, el('b', {}, t('fps.mis.' + x.id, { n: PV.fmtNum(x.n) })),
              el('span', { class: 'xp' }, el('i', { style: { width: pct + '%' } })),
              el('small', {}, PV.fmtNum(x.have) + ' / ' + PV.fmtNum(x.n))),
            x.claimed ? el('span', { class: 'ok' }, '✓')
              : el('button', { class: 'btn ' + (x.done ? 'primary' : 'ghost') + ' sm', disabled: x.done ? null : true,
                onclick: () => { const n = M.claim(meta, x.id, which === 'weekly'); if (n) { say(t('fps.claimed', { n: n })); commit(true, 'chime'); } } }, '🪙 ' + x.reward)));
        }
        body.appendChild(sec);
      }
      const c = M.crates(meta);
      const sec = el('div', { class: 'fps-sec' }, el('h5', {}, t('fps.crates')));
      const row = el('div', { class: 'fps-items' });
      for (const kind of ['killer', 'winner']) {
        const ready = c[kind], every = D.CRATES[kind].every, at = c[kind + 'At'];
        row.appendChild(el('div', { class: 'fps-item crate' + (ready ? ' on' : '') },
          el('span', { class: 'big' }, kind === 'killer' ? '🎯' : '🏆'),
          el('b', {}, t('fps.crate.' + kind)),
          el('small', {}, t('fps.crate.' + kind + '.d', { n: every }) + ' · ' + at + '/' + every),
          el('button', { class: 'btn ' + (ready ? 'primary' : 'ghost') + ' sm', disabled: ready ? null : true, onclick: () => {
            const prize = M.openCrate(meta, kind);
            if (!prize) return;
            say(prize.kind === 'coins' ? t('fps.prize.coins', { n: prize.n }) : t('fps.prize.item', { what: t('fps.' + prize.kind + '.' + prize.id) }));
            commit(true, 'chime');
          } }, ready ? t('fps.open', { n: ready }) : t('fps.locked'))));
      }
      sec.appendChild(row);
      body.appendChild(sec);
    }

    /* ---- settings ---- */

    function settings(body) {
      const S = o.settings;
      const slider = (key, lo, hi, step, fmt) => {
        const v = el('span', { class: 'v' }, fmt(S[key]));
        const input = el('input', { type: 'range', min: lo, max: hi, step: step, value: S[key] });
        input.addEventListener('input', () => { S[key] = +input.value; v.textContent = fmt(S[key]); o.onSettings(S); });
        return el('div', { class: 'fps-set' }, el('span', { class: 'k' }, t('fps.set.' + key)), input, v);
      };
      body.appendChild(slider('sens', 0.2, 3, 0.05, x => x.toFixed(2)));
      body.appendChild(slider('fov', 70, 110, 1, x => x + '°'));
      body.appendChild(slider('vol', 0, 1, 0.05, x => Math.round(x * 100) + '%'));
      const tog = key => el('button', { class: 'fps-chip' + (S[key] ? ' on' : ''), onclick: () => { S[key] = !S[key]; o.onSettings(S); render(); } }, t('fps.set.' + key));
      body.appendChild(el('div', { class: 'fps-opts' }, tog('invert'), tog('mute')));
      body.appendChild(el('p', { class: 'muted small' }, t('fps.keysHelp')));
    }

    render();
    return {
      node: root,
      refresh(m) { if (m) meta = m; render(); },
      show(on) { root.hidden = !on; if (on) render(); }
    };
  };

})(window.PV);
