/* 火柴人对决 / Stick Clash — view.

   Glue between the loop harness and everything this game draws, hears and
   reads from the player:

   - THE CAMERA follows the middle of the two fighters and pulls back as
     they separate, so both are always on screen; it rises with a fighter
     thrown high, shakes on a heavy hit, and punches in on a knockout and
     on an ultimate's wind-up. The effects the reference is known for —
     shakes, flashes, zooms — all live here, driven by the engine's events,
     so the engine stays a pure function of its inputs.
   - HITS SPARK in the attacker's colour, blocks ring, dashes leave
     after-images, weapons leave a trail through their active frames, and
     a dizzy fighter has stars round their head.
   - KEYS follow the reference: one player on WASD with J to attack and K
     for specials (or the arrows with Z and X); two players share the
     keyboard, WASD F G and IJKL ; '. On a phone the thumb pad under the
     canvas is the first player's controls.

   Coins are banked when a fight ends (meta.js). A race with friends
   skips the select, fights as Ink, and banks nothing, as every race here
   does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => PV.t(k, p);
  const D = PV.StickData, A = PV.StickArt, H = PV.StickHud, R = D.RULES;
  const SETTINGS = 'stick.settings';

  /* The device's own settings: not sealed, not in the backup. */
  PV.Store.validate(SETTINGS, v => {
    const s = PV.Safe.obj(v);
    if (!s) return undefined;
    return { vol: PV.Safe.num(s.vol, 0, 1, 0.7), shake: PV.Safe.bool(s.shake === undefined ? true : s.shake) };
  });
  const loadSettings = () => PV.Store.get(SETTINGS, null) || { vol: 0.7, shake: true };

  function both(map) {
    const out = {};
    for (const k in map) { out[k] = map[k]; if (k.length === 1 && k.toUpperCase() !== k) out[k.toUpperCase()] = map[k]; }
    return out;
  }
  const KEYS1 = both({
    a: 'l1', d: 'r1', w: 'u1', s: 'd1', j: 'a1', k: 's1', z: 'a1', x: 's1',
    ArrowLeft: 'l1', ArrowRight: 'r1', ArrowUp: 'u1', ArrowDown: 'd1', ' ': 'u1'
  });
  const KEYS2 = both({
    a: 'l1', d: 'r1', w: 'u1', s: 'd1', f: 'a1', g: 's1',
    j: 'l2', l: 'r2', i: 'u2', k: 'd2', ';': 'a2', ':': 'a2', "'": 's2', '"': 's2',
    ArrowLeft: 'l2', ArrowRight: 'r2', ArrowUp: 'u2', ArrowDown: 'd2', '.': 'a2', '/': 's2'
  });

  PV.StickView = function (ctx) {
    const opts = ctx.opts || {};
    const racing = !!ctx.race;
    const mode = racing ? 'versus' : (PV.StickGame.MODES.indexOf(opts.mode) >= 0 ? opts.mode : 'tour');
    const diff = D.LEVELS[opts.difficulty] != null ? opts.difficulty : 'normal';
    const rounds = [1, 3, 5].indexOf(+opts.rounds) >= 0 ? +opts.rounds : 3;
    const stageOpt = D.STAGES.indexOf(opts.stage) >= 0 ? opts.stage : 'random';
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const settings = loadSettings();
    const audio = PV.StickAudio(settings);
    let meta = PV.StickMeta.load();

    let ui = null, panels = null, lastCfg = null, bank = null, seen = 0, lastNow = 0, ended = false, pausedByMoves = false;
    const cam = { x: D.ARENA / 2, s: 0.8, shake: 0, zoom: 0, zx: null, flash: 0, flashCol: '#fff', lift: 0 };
    const fx = [];                   // particles and popups
    const ghosts = [];               // after-images
    const trails = [[], []];         // weapon tips
    const st = { trail: [0, 0], tired: [0, 0], combo: [null, null], now: 0 };
    let banners = [], cut = null, lastPhase = null;

    function saveSettings() { PV.Store.set(SETTINGS, settings); audio.setVolume(settings.vol); }

    /* ---- what a fight is started with ---- */

    function cfgFor(p2) {
      meta = PV.StickMeta.load();
      const p1 = meta.owned.indexOf(meta.pick) >= 0 ? meta.pick : 'ink';
      if (racing) return { mode: 'versus', p1: 'ink', p2: null, level: D.LEVELS[diff], stage: stageOpt, rounds: 3 };
      if (mode === 'tour') {
        const L = D.LADDER[meta.tour];
        return { mode: 'tour', p1: p1, p2: L.foe, level: L.lvl, stage: L.stage, rounds: rounds, tour: meta.tour };
      }
      if (mode === 'versus') return { mode: 'versus', p1: p1, p2: p2 || null, level: D.LEVELS[diff], stage: stageOpt, rounds: rounds };
      if (mode === 'two') return { mode: 'two', p1: p1, p2: p2 || p1, stage: stageOpt, rounds: rounds };
      return { mode: 'train', p1: p1, p2: p2 || 'ink', stage: stageOpt, dummy: 'stand' };
    }

    function game() { return ui && ui.game; }

    /* ---- the harness ---- */

    const spec = {
      hz: 60,
      fullscreen: false,             // its own ⛶: the canvas alone, not the host
      get keymap() { return mode === 'two' ? KEYS2 : KEYS1; },
      sustained: ['l1', 'r1', 'd1', 'l2', 'r2', 'd2'],
      pad: [
        { label: '◀', action: 'l1', aria: 'left' },
        { label: '▶', action: 'r1', aria: 'right' },
        { label: '▲', action: 'u1', aria: 'jump' },
        { label: '🛡', action: 'd1', aria: 'block' },
        { label: '👊', action: 'a1', aria: 'attack' },
        { label: '✦', action: 's1', aria: 'special' }
      ],
      padCols: 6,

      create() {
        meta = PV.StickMeta.load();
        // The lobby: your fighter and whoever you would meet, idling behind the menu.
        const g = new PV.StickGame({ seed: ctx.seed(), mode: mode, stage: lobbyStage(), show: [meta.pick, lobbyFoe()] });
        if (racing || lastCfg) g.begin(cfgFor(racing ? null : lastCfg.p2));
        return g;
      },

      onReset(g) {
        seen = g.seq; bank = null; ended = false; lastPhase = null;
        fx.length = 0; ghosts.length = 0; trails[0].length = trails[1].length = 0;
        banners = []; cut = null;
        st.combo = [null, null]; st.tired = [0, 0];
        st.trail = g.f.map(f => f.hp);
        cam.x = D.ARENA / 2; cam.zoom = 0; cam.zx = null; cam.flash = 0; cam.shake = 0;
        if (panels) {
          panels.showMoves(false);
          panels.showSelect(g.phase === 'lobby' && !racing);
          panels.showTrain(g.mode === 'train' && g.phase !== 'lobby', g.dummy);
        }
        relabel();
      },

      fit(availW, availH) {
        const box = ui && ui.canvas.parentElement;
        let w, h;
        // Full screen, the stage is the screen, as in Strike Squad: the
        // fighter select lies over the whole box, so the canvas fills it too.
        if (box && document.fullscreenElement === box) {
          w = window.innerWidth; h = window.innerHeight;
        } else if (PV.stage().phone) {
          w = Math.max(280, availW);
          h = Math.round(Math.max(300, Math.min(availH, w * 0.9)));
        } else {
          w = Math.min(availW, 1180); h = w * 0.5625;
          if (h > availH + 30) { h = availH + 30; w = h / 0.5625; }
          w = Math.round(Math.max(320, w)); h = Math.round(Math.max(240, h));
        }
        // The fighter select and the moves list are laid out for the page's
        // biggest stage, and grow with a canvas past it.
        if (box) PV.scaleUI(box, Math.min(w / 1180, h / 664));
        return { w: w, h: h };
      },

      build(api) {
        ui = api;
        const box = api.canvas.parentElement;
        box.classList.add('stk-box');
        panels = PV.StickUI({
          mode: mode, touch: touch, audio: audio,
          meta: () => meta,
          onBuy: id => { const ok = PV.StickMeta.shop.buy(meta, id); if (ok) { audio.coin(); meta = PV.StickMeta.load(); relobby(); } return ok; },
          onPick: id => { if (PV.StickMeta.shop.pick(meta, id)) { meta = PV.StickMeta.load(); relobby(); } },
          onFight: sel => start(sel.p2),
          onFoe: () => relobby(),
          onDummy: k => { if (ui.game) ui.input({ dummy: k }); },
          onMoves: on => {
            if (on && !ui.paused && game() && game().phase !== 'lobby') { ui.pause(); pausedByMoves = true; }
            if (!on && pausedByMoves && ui.paused) { ui.pause(); pausedByMoves = false; }
          }
        });
        box.appendChild(panels.node);
        const bar = api.status.parentElement.querySelector('.bar-actions');
        const btnMoves = PV.el('button', { class: 'btn ghost stk-btn-moves', onclick: () => toggleMoves() });
        const btnFighters = PV.el('button', { class: 'btn ghost stk-btn-fighters', onclick: () => toLobby() });
        const btnFull = PV.el('button', {
          class: 'btn ghost', onclick: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
          }
        }, '⛶');
        bar.prepend(btnFull);
        bar.prepend(btnFighters);
        bar.prepend(btnMoves);
        if (racing) btnFighters.hidden = true;
        const help = PV.el('p', { class: 'muted small stk-help' });
        const vol = PV.el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.vol), 'aria-label': 'volume' });
        vol.addEventListener('input', () => { settings.vol = +vol.value; saveSettings(); });
        const shake = PV.el('input', { type: 'checkbox' });
        shake.checked = settings.shake !== false;
        shake.addEventListener('change', () => { settings.shake = shake.checked; saveSettings(); });
        const opts2 = PV.el('div', { class: 'stk-settings muted small' },
          PV.el('label', {}, '🔊 ', vol), PV.el('label', {}, shake, ' ', PV.el('span', { class: 'stk-shake-l' })));
        api.below.appendChild(help);
        api.below.appendChild(opts2);
        api.btnMoves = btnMoves; api.btnFighters = btnFighters; api.help = help;
        document.addEventListener('keydown', onKeyDown, true);
        api.canvas.addEventListener('pointerdown', () => audio.init());
      },

      onDestroy() {
        document.removeEventListener('keydown', onKeyDown, true);
        if (document.fullscreenElement && ui && document.fullscreenElement === ui.canvas.parentElement) document.exitFullscreen().catch(() => {});
        audio.destroy();
      },

      onRelabel() { relabel(); },

      draw(c, g, geom, api, alpha) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016;
        lastNow = now;
        st.now = now;
        const frame = dt * 60;
        if (g.phase !== lastPhase) onPhase(g);
        events(g, geom);
        const al = typeof alpha === 'number' ? alpha : 1;
        const P = g.f.map(f => ({ x: f.px + (f.x - f.px) * al, y: f.py + (f.y - f.py) * al }));
        camera(g, geom, P, dt);
        const W = geom.w, Hh = geom.h;
        const floorY = Hh * (PV.stage().phone ? 0.8 : 0.86) + cam.lift;
        const s = cam.s * (1 + cam.zoom);
        const cx = cam.zx != null ? cam.x + (cam.zx - cam.x) * Math.min(1, cam.zoom * 3) : cam.x;
        let ox = 0, oy = 0;
        if (cam.shake > 0.2 && settings.shake !== false) { ox = (Math.random() - 0.5) * cam.shake; oy = (Math.random() - 0.5) * cam.shake; }
        const v = { s: s, x: wx => W / 2 + (wx - cx) * s + ox, y: wy => floorY - wy * s + oy };
        const tick = g.tick;

        c.save();
        A.drawStage(c, g.stage, { x: cx - ox / s, s: s, floor: floorY + oy }, W, Hh, tick);
        ambient(c, g, v, W, Hh, frame);

        // Shadows.
        g.f.forEach((f, i) => {
          if (f.hidden) return;
          const sc = Math.max(0.35, 1 - P[i].y / 400);
          c.fillStyle = 'rgba(0,0,0,' + (0.35 * sc) + ')';
          c.beginPath(); c.ellipse(v.x(P[i].x), v.y(0), 30 * s * sc, 6 * s * sc, 0, 0, Math.PI * 2); c.fill();
        });

        // After-images.
        for (let i = ghosts.length - 1; i >= 0; i--) {
          const gh = ghosts[i];
          gh.life -= frame;
          if (gh.life <= 0) { ghosts.splice(i, 1); continue; }
          A.drawFighter(c, gh.f, v, gh.x, gh.y, { pose: gh.pose, ghost: gh.col, alpha: 0.35 * gh.life / gh.max, noWeapon: false, t: tick });
        }

        // Weapon trails, then the fighters — the one attacking on top.
        const order = [0, 1].sort((a, b) => (g.f[a].state === 'attack') - (g.f[b].state === 'attack'));
        for (const i of order) drawTrail(c, v, i, g.f[i]);
        for (const i of order) {
          const f = g.f[i];
          if (f.hidden) continue;
          const glow = (f.state === 'attack' && f.mv && f.mv.cine) || f.state === 'burst' ? f.def.glow : (f.meter >= R.meterMax && g.phase === 'fight' ? f.def.glow : null);
          const hot = f.active || (f.lock) ? f.def.glow : null;
          const flash = f.state === 'hit' && f.st < 3 ? 0.8 : (f.inv > 0 && f.state !== 'getup' && Math.floor(tick / 3) % 2 ? 0.25 : 0);
          const out = A.drawFighter(c, f, v, P[i].x, P[i].y, { glow: glow, hot: hot, flash: flash, noWeapon: thrownAway(g, f), t: tick });
          if (f.active || f.lock) {
            trails[i].push({ x: out.tip.x, y: out.tip.y, a: 1 });
            if (trails[i].length > 10) trails[i].shift();
          }
          if (f.state === 'stun') stars(c, v, out.head, tick, s);
          if ((f.state === 'attack' && f.mv && f.mv.vx && f.active) || f.state === 'burst') {
            if (tick % 2 === 0) ghosts.push({ f: f, x: P[i].x, y: P[i].y, pose: A.poseOf(f), col: f.def.glow, life: 12, max: 12 });
          }
        }

        // Thrown things.
        for (const p of g.proj) A.drawProj(c, p, v, p.px + (p.x - p.px) * al, p.py + (p.y - p.py) * al, tick + p.id * 5);

        // An ultimate's flurry, drawn where its target is held.
        g.f.forEach(f => { if (f.lock) flurryFx(c, v, f, g.foe(f), tick, s); });

        particles(c, v, frame, s);
        c.restore();

        // Full-screen flash.
        if (cam.flash > 0.01) {
          c.fillStyle = cam.flashCol; c.globalAlpha = Math.min(1, cam.flash);
          c.fillRect(0, 0, W, Hh); c.globalAlpha = 1;
          cam.flash *= Math.pow(0.82, frame);
        }
        if (cut) { cut.t += frame; H.cutin(c, geom, cut); if (cut.t >= cut.life) cut = null; }

        if (g.phase !== 'lobby') {
          for (let i = 0; i < 2; i++) {
            const f = g.f[i];
            if (st.trail[i] < f.hp) st.trail[i] = f.hp;
            else if (f.combo === 0 || f.state === 'down') st.trail[i] = Math.max(f.hp, st.trail[i] - f.hpMax * 0.012 * frame);
            if (st.tired[i] > 0) st.tired[i] -= frame;
            const cb = st.combo[i];
            const foe = g.f[1 - i];
            if (foe.combo >= 2) st.combo[i] = { n: foe.combo, dmg: foe.comboDmg, t: 70, pop: cb && cb.n !== foe.combo ? 1 : (cb ? (cb.pop || 0) * 0.85 : 1) };
            else if (cb) { cb.t -= frame; cb.pop = (cb.pop || 0) * 0.85; if (cb.t <= 0) st.combo[i] = null; }
          }
          H.draw(c, g, geom, st);
        }
        for (let i = banners.length - 1; i >= 0; i--) {
          const b = banners[i];
          b.t += frame;
          if (b.t >= b.life) { banners.splice(i, 1); continue; }
          H.banner(c, geom, b);
        }
        cam.shake *= Math.pow(0.86, frame);
        if (!cut && g.phase !== 'ko') cam.zoom *= Math.pow(0.9, frame);
      },

      outcome(g) {
        if (!bank) bank = racing ? { coins: 0, champion: false, unlocked: null } : PV.StickMeta.bank(meta, g, diff);
        meta = PV.StickMeta.load();
        const res = g.myResult();
        const two = g.mode === 'two';
        const [a, b] = g.f;
        const title = two ? (g.winner === 0 ? t('stick.end.p1') : g.winner === 1 ? t('stick.end.p2') : t('stick.end.draw'))
          : bank.champion ? t('stick.end.champion')
            : res === 'win' ? t('stick.end.win') : res === 'loss' ? t('stick.end.lose') : t('stick.end.draw');
        const lines = [
          H.nameOf(a) + ' ' + g.wins[0] + ' – ' + g.wins[1] + ' ' + H.nameOf(b),
          a.stats.best >= 2 ? t('stick.line.combo', { n: a.stats.best }) : null,
          g.perfects[0] ? t('stick.line.perfect', { n: g.perfects[0] }) : null,
          bank.coins ? t('stick.line.coins', { n: bank.coins }) : null,
          bank.unlocked ? t('stick.line.unlocked', { name: H.nameOf({ def: D.FIGHTERS[bank.unlocked] }) }) : null,
          g.mode === 'tour' && res === 'win' && !bank.champion ? t('stick.line.next', { name: H.nameOf({ def: D.FIGHTERS[D.LADDER[meta.tour].foe] }) }) : null,
          '@best'
        ].filter(Boolean);
        const lvl = g.cfg ? g.cfg.level : 0.4;
        return {
          result: res,
          score: g.score,
          xp: two ? 10 : Math.round(res === 'win' ? 25 + lvl * 50 : 8),
          title: title,
          tone: two ? 'good' : res === 'win' ? 'good' : res === 'loss' ? 'bad' : '',
          lines: lines,
          againLabel: g.mode === 'tour' ? (res === 'win' ? (bank.champion ? t('stick.again.ladder') : t('stick.again.next')) : t('common.retry')) : undefined
        };
      }
    };

    /* ---- starting, and going back ---- */

    function start(p2) {
      audio.init();
      const g = game();
      if (!g) return;
      lastCfg = cfgFor(p2);
      g.input({ start: lastCfg });
      panels.showSelect(false);
      audio.click();
    }

    function toLobby() {
      if (racing) return;
      lastCfg = null;
      const btn = ui.status.parentElement.querySelector('.bar-actions .btn:last-child');
      if (btn) btn.click();
    }

    function lobbyFoe() {
      const p2 = panels && panels.sel.p2;
      if (mode === 'tour') return D.LADDER[meta.tour].foe;
      if (mode === 'two') return meta.owned.indexOf(p2) >= 0 ? p2 : meta.pick;
      return p2 || (mode === 'train' ? 'ink' : 'blaze');
    }
    function lobbyStage() { return mode === 'tour' ? D.LADDER[meta.tour].stage : stageOpt === 'random' ? 'rooftop' : stageOpt; }

    /* Redraw the lobby's fighters after a pick or a purchase. */
    function relobby() {
      const g = game();
      if (g && g.phase === 'lobby') g.input({ show: [meta.pick, lobbyFoe()] });
    }

    function toggleMoves() {
      const g = game();
      if (!g || g.phase === 'lobby') { panels.showMoves(!panels.movesOpen(), fakeGame()); return; }
      panels.showMoves(!panels.movesOpen(), g);
    }
    function fakeGame() {
      const f0 = { side: 0, human: true, def: D.fighter(meta.pick) };
      const f1 = { side: 1, human: mode === 'two', def: D.fighter(panels.sel.p2 || meta.pick) };
      return { mode: mode, f: [f0, f1] };
    }

    function onKeyDown(e) {
      if (!ui || !ui.canvas.isConnected) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      audio.init();
      if (panels.movesOpen()) {
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') { e.preventDefault(); e.stopPropagation(); panels.showMoves(false); }
        return;
      }
      if (panels.selecting()) {
        if (panels.key(e)) { e.preventDefault(); e.stopPropagation(); }
        else if (/^[a-zA-Z;:'".\/ ]$/.test(e.key) || e.key.indexOf('Arrow') === 0) e.stopPropagation();
        return;
      }
      if ((e.key === 'm' || e.key === 'M') && !e.repeat) { e.preventDefault(); toggleMoves(); }
    }

    function relabel() {
      if (!ui) return;
      const g = game();
      const bits = [t('stick.mode.' + mode)];
      if (mode === 'versus' || racing) bits.push(t('diff.' + diff));
      if (g && g.phase !== 'lobby') bits.push(t('stick.stage.' + g.stage));
      ui.status.textContent = bits.join(' · ');
      if (ui.btnMoves) ui.btnMoves.textContent = t('stick.moves');
      if (ui.btnFighters) ui.btnFighters.textContent = t('stick.fighters');
      if (ui.help) ui.help.textContent = touch ? t('stick.touchHelp') : (mode === 'two' ? t('stick.keysHelp2') : t('stick.keysHelp'));
      const sl = ui.below.querySelector('.stk-shake-l');
      if (sl) sl.textContent = t('stick.shake');
      if (panels) panels.refresh();
    }

    /* ---- the camera ---- */

    function camera(g, geom, P, dt) {
      const W = geom.w, Hh = geom.h;
      const phone = PV.stage().phone;
      const floorY = Hh * (phone ? 0.8 : 0.86);
      const dist = Math.abs(P[0].x - P[1].x);
      const vw = Math.max(640, Math.min(1080, dist + 540));
      let s = Math.min(W / vw, floorY / 330);
      const half = W / 2 / s;
      let tx = (P[0].x + P[1].x) / 2;
      tx = half * 2 >= D.ARENA ? D.ARENA / 2 : Math.max(half, Math.min(D.ARENA - half, tx));
      const top = Math.max(P[0].y, P[1].y);
      const lift = Math.max(0, top - 150) * s * 0.55;
      const k = Math.min(1, dt * 7);
      cam.x += (tx - cam.x) * k;
      cam.s += (s - cam.s) * k;
      cam.lift += (lift - cam.lift) * k;
    }

    /* ---- the engine's events: sound, sparks, shakes, words ---- */

    function onPhase(g) {
      lastPhase = g.phase;
      if (panels) {
        panels.showSelect(g.phase === 'lobby' && !racing);
        panels.showTrain(g.mode === 'train' && g.phase !== 'lobby', g.dummy);
      }
      relabel();
    }

    function banner(text, o) { banners.push(Object.assign({ text: text, t: 0, life: 70 }, o || {})); }
    function popup(text, x, y, col, size) { fx.push({ kind: 'text', text: text, x: x, y: y, vx: 0, vy: 1.2, life: 50, max: 50, col: col, size: size || 18 }); }
    function spark(x, y, col, n, speed, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
        fx.push({ kind: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 14 + Math.random() * 12, max: 26, col: col, size: size || 3 });
      }
    }
    function ring(x, y, col, r, life) { fx.push({ kind: 'ring', x: x, y: y, r: r, life: life || 14, max: life || 14, col: col }); }
    function dust(x, n) {
      for (let i = 0; i < n; i++) fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 40, y: 4, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.6, life: 24 + Math.random() * 16, max: 40, col: 'rgba(210,200,180,', size: 6 + Math.random() * 8 });
    }
    function smoke(x, y) {
      for (let i = 0; i < 14; i++) fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 50, y: y + Math.random() * 150, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, life: 26 + Math.random() * 14, max: 40, col: 'rgba(90,80,110,', size: 12 + Math.random() * 10 });
    }

    function events(g, geom) {
      const human = side => g.f[side] && g.f[side].human;
      const panOf = x => (x - cam.x) / 600;
      for (const e of g.events) {
        if (e.seq <= seen) continue;
        seen = e.seq;
        const f = g.f[e.side];
        const col = f ? f.def.glow : '#fff';
        switch (e.k) {
          case 'round':
            banner(e.final ? t('stick.b.final') : t('stick.b.round', { n: e.n }), { col: '#FFE070', life: 60, band: true });
            audio.announce('round');
            break;
          case 'fight':
            banner(t('stick.b.fight'), { col: '#FF6B5A', life: 40, size: 72, grow: true });
            audio.announce('fight');
            break;
          case 'swing': audio.swing(e.heavy, panOf(f.x)); break;
          case 'special': audio.special(panOf(f.x)); break;
          case 'proj': audio.proj(e.kind, panOf(f.x)); break;
          case 'hit': {
            const heavy = e.heavy || e.finale;
            spark(e.x, e.y, col, e.flurry ? 5 : heavy ? 18 : 10, heavy ? 9 : 6, heavy ? 4 : 3);
            spark(e.x, e.y, '#FFFFFF', e.flurry ? 2 : 5, 5, 2);
            ring(e.x, e.y, col, heavy ? 50 : 30, heavy ? 16 : 10);
            fx.push({ kind: 'star', x: e.x, y: e.y, life: 7, max: 7, size: heavy ? 46 : 28, a: Math.random() * 3 });
            cam.shake = Math.max(cam.shake, e.finale ? 22 : heavy ? 12 : e.flurry ? 3 : 5);
            if (e.finale) { cam.flash = 0.55; cam.flashCol = '#FFFFFF'; }
            if (e.counter) popup(t('stick.p.counter'), e.x, e.y + 60, '#FFD34A', 20);
            if (e.behind) popup(t('stick.p.aerial'), e.x, e.y + 60, '#9CC3FF', 20);
            if (e.flurry) audio.flurry(panOf(e.x)); else audio.hit(heavy, panOf(e.x));
            break;
          }
          case 'block':
            spark(e.x, e.y, '#BFE3FF', 7, 5, 2.5);
            ring(e.x, e.y, '#9CC3FF', 26, 10);
            audio.block(panOf(e.x));
            break;
          case 'armor': spark(e.x, e.y, '#FFB547', 8, 6, 3); audio.block(panOf(e.x)); break;
          case 'guardbreak':
            spark(e.x, e.y, '#9CC3FF', 22, 9, 3.5);
            popup(t('stick.p.guardBreak'), e.x, e.y + 40, '#FF6B5A', 22);
            cam.shake = 14;
            audio.guardbreak(panOf(e.x));
            break;
          case 'breaker':
            ring(e.x, e.y, col, 140, 22); ring(e.x, e.y, '#FFFFFF', 90, 16);
            popup(t('stick.p.breaker'), e.x, e.y + 70, col, 24);
            cam.flash = 0.35; cam.flashCol = col; cam.shake = 10;
            audio.breaker(panOf(e.x));
            break;
          case 'ult': {
            const name = t('stick.sp.' + f.def.special[3]);
            // The glow, darkened: white text must read on it, and Ink is white.
            cut = { side: e.side, name: name, who: H.nameOf(f), col: A.shade(f.def.glow, -0.45), t: 0, life: 44 };
            cam.zoom = 0.35; cam.zx = f.x; cam.flash = 0.3; cam.flashCol = f.def.glow;
            audio.ult(panOf(f.x));
            break;
          }
          case 'lock': cam.shake = 8; break;
          case 'ko': {
            const d = g.foe(g.f[e.side]);
            banner(t('stick.b.ko'), { col: '#FF3D2E', life: 110, size: 96, grow: true });
            cam.flash = 0.8; cam.flashCol = '#FFFFFF'; cam.zoom = 0.45; cam.zx = d.x; cam.shake = 26;
            spark(e.x, e.y, col, 30, 12, 4);
            ring(e.x, e.y, '#FFFFFF', 180, 26);
            audio.ko();
            break;
          }
          case 'timeup':
            banner(t('stick.b.time'), { col: '#FFE070', life: 70, size: 80 });
            audio.announce('round');
            break;
          case 'roundEnd': {
            if (e.w < 0) banner(t('stick.b.draw'), { col: '#EAF0F7', life: 100, band: true });
            else {
              const who = g.mode === 'two' ? (e.w ? 'P2' : 'P1') : H.nameOf(g.f[e.w]);
              banner(e.perfect ? t('stick.b.perfect') : t('stick.b.wins', { name: who.toUpperCase() }), {
                col: e.perfect ? '#FFD34A' : (e.w === 0 || g.mode === 'two' ? '#7CFFB0' : '#FF6B5A'), life: 100, band: true,
                sub: e.perfect ? t('stick.b.wins', { name: who.toUpperCase() }) : null
              });
              if (e.perfect) audio.announce('perfect');
            }
            break;
          }
          case 'matchEnd': {
            let txt, col2;
            if (g.mode === 'two') { txt = e.w < 0 ? t('stick.b.draw') : t('stick.b.pWins', { n: e.w + 1 }); col2 = '#FFE070'; }
            else if (e.w === 0) { txt = t('stick.b.youWin'); col2 = '#7CFFB0'; }
            else if (e.w === 1) { txt = t('stick.b.youLose'); col2 = '#FF6B5A'; }
            else { txt = t('stick.b.draw'); col2 = '#EAF0F7'; }
            banner(txt, { col: col2, life: 150, size: 70, band: true });
            audio.announce(e.w === 0 || (g.mode === 'two' && e.w >= 0) ? 'win' : 'lose');
            break;
          }
          case 'down': dust(e.x, e.ko ? 14 : 8); cam.shake = Math.max(cam.shake, e.ko ? 10 : 5); audio.down(panOf(e.x)); break;
          case 'land': dust(e.x, 3); audio.land(panOf(e.x)); break;
          case 'jump': audio.jump(panOf(f.x)); break;
          case 'tele': smoke(e.from, 0); smoke(e.x, e.y); audio.tele(panOf(e.x)); break;
          case 'fizzle': spark(e.x, e.y, '#EAF0F7', 6, 3, 2); break;
          case 'clash': spark(e.x, e.y, '#FFFFFF', 16, 8, 3); ring(e.x, e.y, '#FFFFFF', 60, 14); cam.shake = 8; audio.clash(panOf(e.x)); break;
          case 'wall': dust(e.x, 6); cam.shake = Math.max(cam.shake, 10); audio.down(panOf(e.x)); break;
          case 'tired': if (human(e.side)) { st.tired[e.side] = 30; audio.tired(panOf(f.x)); } break;
        }
      }
    }

    function particles(c, v, frame, s) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.life -= frame;
        if (p.life <= 0) { fx.splice(i, 1); continue; }
        const k = p.life / p.max;
        if (p.kind === 'spark') {
          p.x += p.vx * frame; p.y += p.vy * frame; p.vy -= 0.35 * frame; p.vx *= Math.pow(0.94, frame);
          c.strokeStyle = p.col; c.globalAlpha = k; c.lineWidth = p.size * s; c.lineCap = 'round';
          c.beginPath(); c.moveTo(v.x(p.x), v.y(p.y)); c.lineTo(v.x(p.x - p.vx * 1.6), v.y(p.y - p.vy * 1.6)); c.stroke();
        } else if (p.kind === 'ring') {
          const r = p.r * (1 - k * 0.7);
          c.strokeStyle = p.col; c.globalAlpha = k * 0.9; c.lineWidth = 4 * s * k + 1;
          c.beginPath(); c.arc(v.x(p.x), v.y(p.y), r * s, 0, Math.PI * 2); c.stroke();
        } else if (p.kind === 'star') {
          c.save(); c.translate(v.x(p.x), v.y(p.y)); c.rotate(p.a);
          c.globalAlpha = k; c.fillStyle = '#FFFFFF';
          c.beginPath();
          for (let j = 0; j < 8; j++) { const r = (j % 2 ? 0.22 : 1) * p.size * s * (1.2 - k * 0.4), a = j * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          c.closePath(); c.fill(); c.restore();
        } else if (p.kind === 'dust') {
          p.x += p.vx * frame; p.y += p.vy * frame;
          c.fillStyle = p.col + (0.4 * k) + ')'; c.globalAlpha = 1;
          c.beginPath(); c.arc(v.x(p.x), v.y(p.y), p.size * s * (1.6 - k), 0, Math.PI * 2); c.fill();
        } else if (p.kind === 'text') {
          p.y += p.vy * frame;
          c.globalAlpha = Math.min(1, k * 2);
          H.text(c, p.text, v.x(p.x), v.y(p.y), p.size * Math.max(0.7, s), p.col, 'center', 900, 'rgba(8,10,16,.9)');
        } else if (p.kind === 'leaf' || p.kind === 'ember') {
          p.x += p.vx * frame; p.y += p.vy * frame;
          c.globalAlpha = Math.min(1, k * 3);
          c.fillStyle = p.col;
          if (p.kind === 'leaf') { c.save(); c.translate(v.x(p.x), v.y(p.y)); c.rotate(p.life * 0.08); c.fillRect(-4 * s, -1.5 * s, 8 * s, 3 * s); c.restore(); }
          else { c.beginPath(); c.arc(v.x(p.x), v.y(p.y), p.size * s, 0, Math.PI * 2); c.fill(); }
        }
        c.globalAlpha = 1;
      }
    }

    /* A little life in the stage: leaves in the bamboo, embers off the volcano. */
    function ambient(c, g, v, W, Hh, frame) {
      const want = g.stage === 'bamboo' ? 'leaf' : g.stage === 'volcano' ? 'ember' : null;
      if (!want || fx.length > 160 || Math.random() > 0.12 * frame) return;
      const wx = cam.x + (Math.random() - 0.5) * W / cam.s;
      if (want === 'leaf') fx.push({ kind: 'leaf', x: wx, y: 420, vx: -0.6 - Math.random(), vy: -0.9 - Math.random() * 0.6, life: 400, max: 400, col: 'rgba(120,170,90,.8)' });
      else fx.push({ kind: 'ember', x: wx, y: -10, vx: (Math.random() - 0.5) * 0.6, vy: 0.8 + Math.random() * 1.2, life: 300, max: 300, col: 'rgba(255,' + (90 + Math.floor(Math.random() * 90)) + ',30,.9)', size: 1.5 + Math.random() * 1.5 });
    }

    function drawTrail(c, v, i, f) {
      const tr = trails[i];
      if (!f.active && !f.lock) { for (const p of tr) p.a -= 0.25; while (tr.length && tr[0].a <= 0) tr.shift(); }
      if (tr.length < 2) return;
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 1; k < tr.length; k++) {
        const a = tr[k - 1], b = tr[k];
        c.strokeStyle = f.def.glow;
        c.globalAlpha = Math.max(0, Math.min(a.a, b.a)) * (k / tr.length) * 0.75;
        c.lineWidth = (3 + k * 1.3) * v.s;
        c.beginPath(); c.moveTo(v.x(a.x), v.y(a.y)); c.lineTo(v.x(b.x), v.y(b.y)); c.stroke();
      }
      c.restore();
    }

    function stars(c, v, head, tick, s) {
      for (let i = 0; i < 3; i++) {
        const a = tick * 0.12 + i * 2.09;
        const x = v.x(head.x + Math.cos(a) * 22), y = v.y(head.y + 20 + Math.sin(a) * 6);
        H.text(c, '★', x, y, 13 * s + 4, '#FFE070', 'center', 900, 'rgba(8,10,16,.8)');
      }
    }

    function flurryFx(c, v, f, d, tick, s) {
      const kind = f.mv && f.mv.lock ? f.mv.lock.anim : 'flurry';
      const x = d.x, y = d.y + 90;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const col = f.def.glow;
      if (kind === 'storm' || kind === 'inferno') {
        c.strokeStyle = kind === 'inferno' ? '#FF7A2E' : '#FFF6A0'; c.lineWidth = 4 * s; c.shadowColor = col; c.shadowBlur = 20 * s;
        c.beginPath();
        let yy = 420, xx = x + ((tick * 13) % 30 - 15);
        c.moveTo(v.x(xx), v.y(yy));
        for (let i = 0; i < 7; i++) { yy -= 420 / 7; xx = x + (((tick + i) * 29) % 40 - 20); c.lineTo(v.x(xx), v.y(Math.max(0, yy))); }
        c.stroke();
      } else {
        c.strokeStyle = col; c.lineWidth = 3 * s; c.shadowColor = col; c.shadowBlur = 14 * s;
        for (let i = 0; i < 3; i++) {
          const a = (tick * 0.7 + i * 2.1);
          c.beginPath();
          c.moveTo(v.x(x + Math.cos(a) * 60), v.y(y + Math.sin(a) * 60));
          c.lineTo(v.x(x - Math.cos(a) * 60), v.y(y - Math.sin(a) * 60));
          c.stroke();
        }
      }
      c.restore();
    }

    /* A thrown scythe or spear leaves the hand empty until it comes back. */
    function thrownAway(g, f) {
      if (f.def.weapon !== 'scythe' && f.def.weapon !== 'spear') return false;
      return g.proj.some(p => p.owner === f.side && (p.kind === 'scythe' || p.kind === 'spear') && !p.big);
    }

    return PV.loopHost(ctx, spec);
  };

})(window.PV);
