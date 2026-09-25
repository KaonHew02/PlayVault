/* 变色躲猫猫 / Blend In — the panels.

   Everything you click, as DOM over the two canvases, laid out as the
   reference lays it out:

   - the BAR along the bottom: [Q] Freecam, [V] Pose, [E] Paint, [F] Lock,
     [O] Menu — a seeker gets the menu only;
   - the PAINT panel on the right: a colour wheel, a brightness bar, the
     colour itself, Pick (a part's colour off the world or anybody), Fill
     (the whole body) and Reset (back to white), the brush size, and the
     last few colours used;
   - POSES, the MENU (mouse speed, the seeker's first or third person
     view, volume, restart), the LOBBY before a round (level, coins, the
     next map, who you play as, the shop), the ROLE card and the TABLE
     at the end.

   It holds no game state. The view hands it callbacks and calls refresh. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const D = PV.HideData;
  const el = (...a) => PV.el(...a);

  /* ------------------------------------------------------------ colour */

  function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    const p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s);
    const c = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i];
    return c.map(x => Math.round(x * 255));
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
    return [h, mx ? d / mx : 0, mx];
  }
  const css = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';

  /* ---------------------------------------------------------- map card */

  const mapCache = Object.create(null);
  /** A map from above: every box, lowest first, in its top's colour. */
  function mapPic(key, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const m = PV.HideMaps.get(key);
    const sx = w / m.mapW, sz = h / m.mapD, s = Math.min(sx, sz);
    const ox = (w - m.mapW * s) / 2, oz = (h - m.mapD * s) / 2;
    x.fillStyle = '#1B2330'; x.fillRect(0, 0, w, h);
    if (!mapCache[key]) {
      const boxes = m.boxes.filter(b => b.x0 < m.mapW && b.z0 < m.mapD && b.y0 < 3.5).slice().sort((p, q) => p.y1 - q.y1);
      mapCache[key] = boxes.map(b => {
        const mat = (b.faces && b.faces.py) || b.mat, px = D.texels(mat);
        let r = 0, g = 0, bl = 0, n = px.length / 3;
        for (let i = 0; i < px.length; i += 3) { r += px[i]; g += px[i + 1]; bl += px[i + 2]; }
        const k = 0.75 + Math.min(0.3, Math.max(0, b.y1) * 0.08);
        return { b: b, col: 'rgb(' + Math.round(r / n * k) + ',' + Math.round(g / n * k) + ',' + Math.round(bl / n * k) + ')' };
      });
    }
    for (const q of mapCache[key]) {
      const b = q.b;
      x.fillStyle = q.col;
      x.fillRect(ox + b.x0 * s, oz + b.z0 * s, Math.max(1, (Math.min(b.x1, m.mapW) - b.x0) * s), Math.max(1, (Math.min(b.z1, m.mapD) - b.z0) * s));
    }
    return c;
  }

  /* ------------------------------------------------------------- panels */

  PV.HideUI = function (o) {
    const root = el('div', { class: 'hide-ui' });
    let color = [214, 88, 122], hsv = rgb2hsv(214, 88, 122), brush = 0.08;
    const recent = [];

    /* ---- the bar ---- */

    function key(k, label, icon, fn) {
      const b = el('button', { class: 'hide-key', type: 'button', onclick: e => { e.preventDefault(); fn(); b.blur(); } },
        el('span', { class: 'k' }, '[' + k + ']'), el('span', { class: 'i' }, icon), el('span', { class: 'l' }, label));
      return b;
    }
    const bar = el('div', { class: 'hide-bar' });
    const keys = {
      free: key('Q', '', '📷', () => o.onKey('free')),
      pose: key('V', '', '🤸', () => o.onKey('pose')),
      paint: key('E', '', '🖌️', () => o.onKey('paint')),
      lock: key('F', '', '🔒', () => o.onKey('lock')),
      menu: key('O', '', '⚙️', () => o.onKey('menu'))
    };
    keys.free.classList.add('red'); keys.pose.classList.add('purple'); keys.paint.classList.add('orange'); keys.lock.classList.add('blue'); keys.menu.classList.add('grey');
    for (const k in keys) bar.appendChild(keys[k]);
    root.appendChild(bar);

    /* ---- paint ---- */

    const wheel = el('canvas', { class: 'hp-wheel', width: 150, height: 150 });
    const val = el('canvas', { class: 'hp-val', width: 16, height: 150 });
    const swatch = el('div', { class: 'hp-swatch' });
    const bPick = el('button', { class: 'hp-btn pick', type: 'button', onclick: () => o.onPick() }, el('b', {}, '💧 '), el('span', { class: 'n' }), el('small', {}));
    const bFill = el('button', { class: 'hp-btn fill', type: 'button', onclick: () => { o.onFill(color); remember(color); } }, el('b', {}, '🪣 '), el('span', { class: 'n' }), el('small', {}));
    const bReset = el('button', { class: 'hp-btn reset', type: 'button', onclick: () => o.onReset() }, el('b', {}, '🧽 '), el('span', { class: 'n' }), el('small', {}));
    const size = el('input', { type: 'range', min: '0.015', max: '0.35', step: '0.005', value: String(brush), class: 'hp-size' });
    const dot = el('span', { class: 'hp-dot' });
    const recentRow = el('div', { class: 'hp-recent' });
    const paint = el('div', { class: 'hide-paint', hidden: true },
      el('div', { class: 'hp-top' }, wheel, val, swatch),
      el('div', { class: 'hp-btns' }, bPick, bFill, bReset),
      el('div', { class: 'hp-brush' }, el('span', { class: 'ic' }, '🖌'), size, el('span', { class: 'hp-dotbox' }, dot)),
      recentRow);
    root.appendChild(paint);

    function drawWheel() {
      const x = wheel.getContext('2d'), n = 150, img = x.createImageData(n, n), r0 = n / 2;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const dx = i + 0.5 - r0, dy = j + 0.5 - r0, r = Math.hypot(dx, dy) / r0;
          const o2 = (j * n + i) * 4;
          if (r > 1) { img.data[o2 + 3] = 0; continue; }
          const h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const c = hsv2rgb(h, r, 1);
          img.data[o2] = c[0]; img.data[o2 + 1] = c[1]; img.data[o2 + 2] = c[2];
          img.data[o2 + 3] = r > 0.985 ? Math.round((1 - r) / 0.015 * 255) : 255;
        }
      }
      x.putImageData(img, 0, 0);
    }
    function drawVal() {
      const x = val.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 150);
      g.addColorStop(0, css(hsv2rgb(hsv[0], hsv[1], 1))); g.addColorStop(1, '#000');
      x.clearRect(0, 0, 16, 150);
      x.fillStyle = g; x.fillRect(0, 0, 16, 150);
      x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
      const y = (1 - hsv[2]) * 146 + 2;
      x.fillRect(0, y - 2, 16, 4); x.strokeRect(0.5, y - 2.5, 15, 5);
    }
    function paintMarks() {
      drawWheel();
      const x = wheel.getContext('2d'), r0 = 75, a = hsv[0] * Math.PI * 2, rr = hsv[1] * r0;
      x.beginPath(); x.arc(r0 + Math.cos(a) * rr, r0 + Math.sin(a) * rr, 5, 0, Math.PI * 2);
      x.lineWidth = 2.5; x.strokeStyle = '#000'; x.stroke(); x.lineWidth = 1.5; x.strokeStyle = '#fff'; x.stroke();
      drawVal();
      swatch.style.background = css(color);
      dot.style.background = css(color);
      const px = Math.round(6 + (brush - 0.015) / (0.35 - 0.015) * 30);
      dot.style.width = dot.style.height = px + 'px';
    }
    function setHSV(h, s, v, quiet) {
      hsv = [h, s, v];
      color = hsv2rgb(h, s, v);
      paintMarks();
      if (!quiet) o.onColor(color);
    }
    function remember(c) {
      const k = c.join();
      const i = recent.findIndex(x => x.join() === k);
      if (i >= 0) recent.splice(i, 1);
      recent.unshift(c.slice());
      if (recent.length > 8) recent.pop();
      PV.clear(recentRow);
      for (const r of recent) recentRow.appendChild(el('button', { class: 'hp-rc', type: 'button', style: { background: css(r) }, title: '#' + r.map(v => v.toString(16).padStart(2, '0')).join(''), onclick: () => api.setColor(r) }));
    }
    function drag(canvas, fn) {
      canvas.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        fn(e);
        const mv = ev => fn(ev);
        const up = () => { canvas.removeEventListener('pointermove', mv); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); remember(color); };
        canvas.addEventListener('pointermove', mv); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      });
    }
    drag(wheel, e => {
      const r = wheel.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width * 150 - 75, dy = (e.clientY - r.top) / r.height * 150 - 75;
      const h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, s = Math.min(1, Math.hypot(dx, dy) / 75);
      setHSV(h, s, hsv[2] || 0.05);
    });
    drag(val, e => {
      const r = val.getBoundingClientRect();
      setHSV(hsv[0], hsv[1], Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
    });
    size.addEventListener('input', () => { brush = Number(size.value); paintMarks(); o.onBrush(brush); });
    paint.addEventListener('pointerdown', e => e.stopPropagation());

    /* ---- poses ---- */

    const poseGrid = el('div', { class: 'hide-poses-grid' });
    const poses = el('div', { class: 'hide-poses', hidden: true }, el('h4', {}, ''), poseGrid);
    root.appendChild(poses);
    poses.addEventListener('pointerdown', e => e.stopPropagation());

    /* ---- the menu ---- */

    const sens = el('input', { type: 'range', min: '0.2', max: '3', step: '0.05' });
    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05' });
    const vFirst = el('button', { class: 'hide-chip', type: 'button', onclick: () => { o.settings.third = false; o.onSettings(); refreshMenu(); } });
    const vThird = el('button', { class: 'hide-chip', type: 'button', onclick: () => { o.settings.third = true; o.onSettings(); refreshMenu(); } });
    const sensV = el('span', { class: 'v' }), volV = el('span', { class: 'v' });
    const bResume = el('button', { class: 'hide-big green', type: 'button', onclick: () => o.onKey('menu') });
    const bRestart = el('button', { class: 'hide-big purple', type: 'button', onclick: () => o.onRestart() });
    const menu = el('div', { class: 'hide-menu', hidden: true },
      el('div', { class: 'hide-card' },
        el('div', { class: 'hide-card-head' }, el('h3', {}, '')),
        el('div', { class: 'hide-rows' },
          el('label', { class: 'hide-row' }, el('span', { class: 'k' }, '🖱 '), sens, sensV),
          el('div', { class: 'hide-row' }, el('span', { class: 'k' }, '👀 '), el('span', { class: 'chips' }, vFirst, vThird)),
          el('label', { class: 'hide-row' }, el('span', { class: 'k' }, '🔊 '), vol, volV)),
        el('p', { class: 'hide-keys' }),
        el('div', { class: 'hide-actions' }, bResume, bRestart)));
    root.appendChild(menu);
    menu.addEventListener('pointerdown', e => e.stopPropagation());
    sens.addEventListener('input', () => { o.settings.sens = Number(sens.value); o.onSettings(); refreshMenu(); });
    vol.addEventListener('input', () => { o.settings.vol = Number(vol.value); o.onSettings(); refreshMenu(); });
    function refreshMenu() {
      sens.value = String(o.settings.sens); vol.value = String(o.settings.vol);
      sensV.textContent = o.settings.sens.toFixed(2) + 'x';
      volV.textContent = Math.round(o.settings.vol * 100) + '%';
      vFirst.classList.toggle('on', !o.settings.third);
      vThird.classList.toggle('on', !!o.settings.third);
    }

    /* ---- the lobby ---- */

    const lvBadge = el('span', { class: 'badge' }), lvBar = el('i'), lvText = el('small'), coins = el('span', { class: 'hide-coins' });
    const nextName = el('b'), nextPic = el('span', { class: 'pic' });
    const roleChips = el('span', { class: 'chips' });
    const shopTabs = el('div', { class: 'hide-tabs' }), shop = el('div', { class: 'hide-shop' });
    const bPlay = el('button', { class: 'hide-play', type: 'button', onclick: () => o.onPlay() });
    const lobbyTip = el('p', { class: 'hide-tip' });
    const lobbyBody = el('div', { class: 'hide-lobby-body' },
      el('div', { class: 'hide-me' }, lvBadge, el('span', { class: 'who' }, lvText, el('span', { class: 'xp' }, lvBar)), coins),
      el('div', { class: 'hide-next' }, nextPic, el('span', { class: 'txt' }, el('small', { class: 'nm' }), nextName)),
      el('div', { class: 'hide-role' }, el('span', { class: 'k' }), roleChips),
      bPlay, shopTabs, shop, lobbyTip);
    const bFold = el('button', { class: 'hide-fold', type: 'button', onclick: () => { lobby.classList.toggle('folded'); refreshLobby(); } });
    const lobby = el('div', { class: 'hide-lobby', hidden: true }, bFold, lobbyBody);
    root.appendChild(lobby);
    lobby.addEventListener('pointerdown', e => e.stopPropagation());
    let tab = 'poses', meta = o.meta;

    function refreshLobby() {
      meta = o.getMeta();
      const lv = D.levelOf(meta.xp);
      lvBadge.textContent = String(lv.level);
      lvBar.style.width = Math.round(lv.pct * 100) + '%';
      lvText.textContent = t('hide.level', { n: lv.level }) + ' · ' + t('hide.xpTo', { n: lv.need - lv.into });
      coins.textContent = '🪙 ' + PV.fmtNum(meta.coins);
      const g = o.game();
      if (g) {
        nextName.textContent = t('hide.map.' + g.mapKey);
        nextName.previousSibling.textContent = t('hide.nextMap');
        PV.clear(nextPic).appendChild(mapPic(g.mapKey, 96, 64));
      }
      bFold.textContent = lobby.classList.contains('folded') ? '▸ ' + t('hide.showPanel') : '◂ ' + t('hide.hidePanel');
      lobbyBody.parentElement.querySelector('.hide-role .k').textContent = t('hide.playAs');
      PV.clear(roleChips);
      const want = o.roleNow ? o.roleNow() : (g && g.roleWant);
      for (const r of ['random', 'hider', 'seeker']) {
        roleChips.appendChild(el('button', {
          class: 'hide-chip' + (want === r ? ' on' : ''), type: 'button',
          onclick: () => { o.onRole(r); refreshLobby(); }
        }, t('hide.role.' + r)));
      }
      bPlay.textContent = '▶ ' + t('hide.play');
      PV.clear(shopTabs);
      for (const k of ['poses', 'guns']) shopTabs.appendChild(el('button', { class: 'hide-tab' + (tab === k ? ' on' : ''), type: 'button', onclick: () => { tab = k; refreshLobby(); } }, t('hide.shop.' + k)));
      PV.clear(shop);
      if (tab === 'poses') {
        for (const p of D.POSES) {
          const own = meta.poses.indexOf(p.id) >= 0;
          shop.appendChild(el('button', {
            class: 'hide-item' + (own ? ' own' : '') + (!own && meta.coins < p.price ? ' poor' : ''), type: 'button',
            onclick: () => { if (!own && o.onBuyPose(p.id)) refreshLobby(); }
          }, el('span', { class: 'big' }, p.icon), el('span', { class: 'nm' }, t('hide.pose.' + p.id)),
          el('small', { class: 'price' }, own ? '✓' : '🪙 ' + p.price)));
        }
      } else {
        for (const b of D.BLASTERS) {
          const own = meta.blasters.indexOf(b.id) >= 0, on = meta.blaster === b.id;
          const sw = el('span', { class: 'gun' }, el('i', { style: { background: b.body } }), el('i', { style: { background: b.tank } }), el('i', { style: { background: b.nozzle } }));
          shop.appendChild(el('button', {
            class: 'hide-item' + (on ? ' on' : '') + (own ? ' own' : '') + (!own && meta.coins < b.price ? ' poor' : ''), type: 'button',
            onclick: () => { if (o.onBlaster(b.id)) refreshLobby(); }
          }, sw, el('span', { class: 'nm' }, t('hide.gun.' + b.id)),
          el('small', { class: 'price' }, on ? t('hide.equipped') : own ? t('hide.equip') : '🪙 ' + b.price)));
        }
      }
      lobbyTip.textContent = t('hide.lobbyTip');
    }

    /* ---- the role card ---- */

    const introPic = el('span', { class: 'pic' }), introMap = el('small'), introTitle = el('h3'), introLines = el('div', { class: 'lines' });
    const intro = el('div', { class: 'hide-intro', hidden: true }, el('div', { class: 'hide-intro-card' }, introPic, el('div', { class: 'txt' }, introMap, introTitle, introLines)));
    root.appendChild(intro);

    /* ---- the table at the end ---- */

    const resHead = el('h3'), resRows = el('div', { class: 'rows' }), resSum = el('div', { class: 'sum' });
    const results = el('div', { class: 'hide-results', hidden: true },
      el('div', { class: 'hide-card res' }, el('div', { class: 'hide-card-head' }, resHead), resRows, resSum));
    root.appendChild(results);

    /* ---- the API ---- */

    const api = {
      node: root,
      get color() { return color; },
      get brush() { return brush; },
      setColor(c) { const h = rgb2hsv(c[0], c[1], c[2]); setHSV(h[0], h[1], h[2], true); color = c.slice(); paintMarks(); o.onColor(color); remember(color); },
      remember: remember,
      /** Which of the bar's keys this player has now. */
      bar(show, which, on) {
        bar.hidden = !show;
        for (const k in keys) { keys[k].hidden = which.indexOf(k) < 0; keys[k].classList.toggle('on', !!on[k]); }
      },
      showPaint(on) { paint.hidden = !on; if (on) paintMarks(); },
      showPoses(on, owned, current) {
        poses.hidden = !on;
        if (!on) return;
        poses.querySelector('h4').textContent = t('hide.posesTitle');
        PV.clear(poseGrid);
        D.POSES.forEach((p, i) => {
          const own = owned.indexOf(p.id) >= 0;
          poseGrid.appendChild(el('button', {
            class: 'hide-pose' + (p.id === current ? ' on' : '') + (own ? '' : ' locked'), type: 'button', disabled: !own,
            onclick: () => o.onPose(p.id)
          }, el('span', { class: 'big' }, p.icon), el('span', { class: 'nm' }, (i < 9 ? (i + 1) + ' · ' : '') + t('hide.pose.' + p.id)), own ? null : el('small', {}, '🪙 ' + p.price)));
        });
      },
      showMenu(on, racing) {
        menu.hidden = !on;
        if (!on) return;
        menu.querySelector('h3').textContent = t('hide.settings');
        vFirst.textContent = t('hide.view.first'); vThird.textContent = t('hide.view.third');
        menu.querySelectorAll('.hide-row .k')[0].textContent = '🖱 ' + t('hide.mouse');
        menu.querySelectorAll('.hide-row .k')[1].textContent = '👀 ' + t('hide.seekerView');
        menu.querySelectorAll('.hide-row .k')[2].textContent = '🔊 ' + t('hide.volume');
        menu.querySelector('.hide-keys').textContent = o.touch ? t('hide.touchHelp') : t('hide.keysHelp');
        bResume.textContent = t('hide.resume');
        bRestart.textContent = t('hide.leave');
        bRestart.hidden = !!racing;
        refreshMenu();
      },
      showLobby(on) { lobby.hidden = !on; if (on) refreshLobby(); },
      refreshLobby: refreshLobby,
      showIntro(on, game) {
        intro.hidden = !on;
        if (!on || !game) return;
        const me = game.me, seeker = me.role === 'seeker';
        PV.clear(introPic).appendChild(mapPic(game.mapKey, 150, 100));
        introMap.textContent = t('hide.mapLabel') + ' · ' + t('hide.map.' + game.mapKey).toUpperCase();
        introTitle.textContent = seeker ? '👀 ' + t('hide.youAreSeeker') : '🎨 ' + t('hide.youAreHider');
        introTitle.className = seeker ? 'seek' : 'hide';
        PV.clear(introLines);
        const secs = Math.round(game.hideTicks / D.HZ);
        const mate = game.seekers().find(a => a !== me);
        const lines = seeker
          ? [t('hide.intro.seek1', { n: game.hiders().length }), mate ? t('hide.intro.seek2', { name: mate.name }) : null, t('hide.intro.seek3', { n: secs })]
          : [t('hide.intro.hide1'), t('hide.intro.hide2', { n: secs }), t('hide.intro.hide3')];
        for (const l of lines) if (l) introLines.appendChild(el('div', {}, l));
      },
      showResults(on, game, bank) {
        results.hidden = !on;
        if (!on || !game) return;
        const hiders = game.hiders(), found = hiders.filter(a => a.found).length;
        resHead.textContent = t('hide.foundOf', { n: found, of: hiders.length });
        PV.clear(resRows);
        for (const a of game.table()) {
          const st = a.role === 'seeker' ? 'seeker' : a.found ? 'found' : 'survived';
          resRows.appendChild(el('div', { class: 'row ' + st + (a === game.me ? ' me' : '') },
            el('span', { class: 'ic' }, st === 'survived' ? '🏆' : '✖'),
            el('span', { class: 'nm' }, a.name + (a.role === 'seeker' && a.stats.finds ? ' · ' + t('hide.finds', { n: a.stats.finds }) : '')),
            el('span', { class: 'st' }, t('hide.st.' + st))));
        }
        PV.clear(resSum);
        if (bank) {
          const lv = D.levelOf(o.getMeta().xp);
          resSum.appendChild(el('div', { class: 'gains' }, el('span', {}, '⭐ +' + bank.xp + ' XP'), el('span', {}, '🪙 +' + bank.coins)));
          resSum.appendChild(el('small', {}, t('hide.level', { n: lv.level }) + ' (' + Math.round(lv.pct * 100) + '%)'));
        }
      },
      relabel() {
        keys.free.querySelector('.l').textContent = t('hide.key.free');
        keys.pose.querySelector('.l').textContent = t('hide.key.pose');
        keys.paint.querySelector('.l').textContent = t('hide.key.paint');
        keys.lock.querySelector('.l').textContent = t('hide.key.lock');
        keys.menu.querySelector('.l').textContent = t('hide.key.menu');
        bPick.querySelector('.n').textContent = t('hide.pick'); bPick.querySelector('small').textContent = t('hide.pickSub');
        bFill.querySelector('.n').textContent = t('hide.fill'); bFill.querySelector('small').textContent = t('hide.charSub');
        bReset.querySelector('.n').textContent = t('hide.reset'); bReset.querySelector('small').textContent = t('hide.charSub');
        if (!lobby.hidden) refreshLobby();
      },
      pickMode(on) { bPick.classList.toggle('on', !!on); }
    };
    paintMarks();
    api.relabel();
    return api;
  };

  PV.HideUI.mapPic = mapPic;
  PV.HideUI.hsv2rgb = hsv2rgb;
  PV.HideUI.rgb2hsv = rgb2hsv;

})(window.PV);
