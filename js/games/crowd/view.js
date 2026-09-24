/* 人潮冲锋 / Crowd Rush — view.

   Two canvases, one on top of the other. Underneath, WebGL draws the world
   (scene.js). On top, the loop harness's own 2D canvas carries everything
   that is text or a button, exactly where the reference puts it: the level
   bar and the coins along the top, a count in a pill over every crowd, the
   gate's number floating up as you take it, and at the start line the
   "press space" prompt, the two upgrade cards, the colour wheel and the
   skins. The harness never learns there is a second canvas; it still draws
   its pause veil over the top one.

   Steering is the reference's too: the crowd follows the mouse across the
   road, a finger drags it, and the arrow keys push it. Space or a click
   starts the run and stops the needle before the king. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const TAU = Math.PI * 2;
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, sans-serif';

  /* The crowd colours the wheel steps through; the first is the reference's
     own light blue. Each has a darker partner for the pill over its head. */
  const COLORS = [
    ['#45AFF4', '#1E7FD8'], ['#4CD068', '#23973B'], ['#A36BFF', '#6F35D6'], ['#FFC21F', '#C98A00'],
    ['#FF8B33', '#D0600E'], ['#FF6FAE', '#D63F82'], ['#2DD0C3', '#138F86'], ['#5A74FF', '#2F46CF']
  ];
  const FOE_PILL = '#E0342E';
  const MAX_UP = 99;
  const SKIN_COUNT = 8;              // scene.js draws them; see PV.CrowdScene.SKINS

  /* ---------------------------------------------------- what is saved */

  /* Coins, the two upgrades, the level you are on, your colour and your
     skin, kept between runs. Sealed like the profile (store.js) and rebuilt
     on every read. Before the rebuild the upgrades were `start` (+3 runners
     a level) and `gate` (a gate bonus); what was paid for carries over as
     levels of the two the reference has, Start Units and Income. */
  const META = 'crowd.meta';
  const MAX_COINS = 1e9;
  PV.Store.validate(META, v => {
    const m = PV.Safe.obj(v);
    if (!m) return undefined;
    const units = m.units != null ? PV.Safe.int(m.units, 1, MAX_UP, 1) : 1 + PV.Safe.int(m.start, 0, 40, 0);
    const income = m.income != null ? PV.Safe.int(m.income, 1, MAX_UP, 1) : 1 + PV.Safe.int(m.gate, 0, 25, 0);
    return {
      coins: PV.Safe.int(m.coins, 0, MAX_COINS, 0),
      units: Math.min(MAX_UP, units),
      income: Math.min(MAX_UP, income),
      level: PV.Safe.int(m.level, 1, PV.CrowdCourse.MAX_LEVEL, 1),
      color: PV.Safe.int(m.color, 0, COLORS.length - 1, 0),
      skin: PV.Safe.int(m.skin, 0, SKIN_COUNT - 1, 0)
    };
  });
  const loadMeta = () => PV.Store.get(META, null) || { coins: 0, units: 1, income: 1, level: 1, color: 0, skin: 0 };

  /* A new skin every third level reached, as the reference fills in a
     silhouette a little after every level. Worked out from the level, so
     there is nothing extra to save or to forge. */
  const SKIN_EVERY = 3;
  const skinsAt = level => Math.min(SKIN_COUNT, 1 + Math.floor((Math.max(1, level) - 1) / SKIN_EVERY));

  /* ------------------------------------------------------- 2D helpers */

  function rr(c, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + q, y);
    c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q);
    c.closePath();
  }

  function font(c, size, weight) { c.font = (weight || 900) + ' ' + size.toFixed(1) + 'px ' + FONT; }

  /** Heavy text with a dark edge, the house style for everything on screen. */
  function say(c, text, x, y, size, fill, edge, align) {
    font(c, size);
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    if (edge) {
      c.lineWidth = size * 0.2;
      c.strokeStyle = edge;
      c.strokeText(text, x, y);
    }
    c.fillStyle = fill;
    c.fillText(text, x, y);
  }

  /** A count in a rounded pill with a little tail pointing down at the crowd. */
  function pill(c, x, y, text, bg, size) {
    font(c, size);
    const w = Math.max(size * 1.9, c.measureText(text).width + size * 1.1), h = size * 1.45;
    c.fillStyle = 'rgba(0,0,0,0.18)';
    rr(c, x - w / 2, y - h + size * 0.12, w, h, h / 2); c.fill();
    c.fillStyle = bg;
    rr(c, x - w / 2, y - h, w, h, h / 2); c.fill();
    c.beginPath();
    c.moveTo(x - size * 0.32, y - 1);
    c.lineTo(x + size * 0.32, y - 1);
    c.lineTo(x, y + size * 0.36);
    c.closePath(); c.fill();
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y - h / 2 + size * 0.04);
  }

  function coin(c, x, y, r) {
    c.fillStyle = '#C98A0B';
    c.beginPath(); c.arc(x, y + r * 0.14, r, 0, TAU); c.fill();
    c.fillStyle = '#FFC83A';
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = '#E8A417';
    c.lineWidth = r * 0.16;
    c.beginPath(); c.arc(x, y, r * 0.62, 0, TAU); c.stroke();
  }

  /** A little stickman, for the Start Units card and the skin button. */
  function stickIcon(c, x, y, s, col) {
    c.fillStyle = col;
    c.beginPath(); c.arc(x, y - s * 0.62, s * 0.2, 0, TAU); c.fill();
    rr(c, x - s * 0.15, y - s * 0.42, s * 0.3, s * 0.42, s * 0.14); c.fill();
    c.lineCap = 'round';
    c.strokeStyle = col;
    c.lineWidth = s * 0.1;
    c.beginPath();
    c.moveTo(x - s * 0.08, y - s * 0.04); c.lineTo(x - s * 0.12, y + s * 0.3);
    c.moveTo(x + s * 0.08, y - s * 0.04); c.lineTo(x + s * 0.12, y + s * 0.3);
    c.moveTo(x - s * 0.15, y - s * 0.36); c.lineTo(x - s * 0.3, y - s * 0.08);
    c.moveTo(x + s * 0.15, y - s * 0.36); c.lineTo(x + s * 0.3, y - s * 0.08);
    c.stroke();
  }

  function flagIcon(c, x, y, r) {
    c.save();
    c.beginPath(); c.arc(x, y, r * 0.7, 0, TAU); c.clip();
    const n = 4, q = r * 1.4 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        c.fillStyle = (i + j) % 2 ? '#22262E' : '#FFFFFF';
        c.fillRect(x - r * 0.7 + i * q, y - r * 0.7 + j * q, q, q);
      }
    }
    c.restore();
  }

  function crownIcon(c, x, y, s) {
    c.fillStyle = '#FFC83A';
    c.beginPath();
    c.moveTo(x - s, y + s * 0.5); c.lineTo(x - s, y - s * 0.3); c.lineTo(x - s * 0.5, y + s * 0.1);
    c.lineTo(x, y - s * 0.6); c.lineTo(x + s * 0.5, y + s * 0.1); c.lineTo(x + s, y - s * 0.3);
    c.lineTo(x + s, y + s * 0.5); c.closePath(); c.fill();
  }

  function skull(c, x, y, s) {
    c.fillStyle = '#FFFFFF';
    c.beginPath(); c.arc(x, y - s * 0.1, s * 0.55, 0, TAU); c.fill();
    c.fillRect(x - s * 0.3, y + s * 0.2, s * 0.6, s * 0.3);
    c.fillStyle = '#20242B';
    c.beginPath(); c.arc(x - s * 0.2, y - s * 0.12, s * 0.14, 0, TAU); c.arc(x + s * 0.2, y - s * 0.12, s * 0.14, 0, TAU); c.fill();
  }

  function wheelIcon(c, x, y, r) {
    const cols = ['#FF5252', '#FFB300', '#FFEB3B', '#4CAF50', '#00BCD4', '#3F51B5', '#9C27B0'];
    for (let i = 0; i < cols.length; i++) {
      c.fillStyle = cols[i];
      c.beginPath(); c.moveTo(x, y);
      c.arc(x, y, r, i / cols.length * TAU, (i + 1) / cols.length * TAU);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#FFFFFF';
    c.beginPath(); c.arc(x, y, r * 0.35, 0, TAU); c.fill();
  }

  function fmt(n) { return PV.fmtNum(Math.max(0, Math.round(n))); }

  /* ------------------------------------------------------------ the view */

  PV.CrowdRushView = function (ctx) {
    const opts = ctx.opts || {};
    const racing = !!ctx.race;
    const meta = loadMeta();
    const levels = !racing && opts.play !== 'free';
    const courseKey = PV.CrowdCourse.COURSES[opts.course] ? opts.course : 'ice';
    const diffKey = ({ easy: 1, normal: 1, hard: 1 })[opts.difficulty] ? opts.difficulty : 'normal';
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    let ui = null, scene = null, glCanvas = null, broken = false;
    let hits = [];                   // buttons painted this frame: {x, y, w, h, act}
    let pops = [], seen = 0;         // numbers floating up off the crowd
    let lastNow = 0, roadPx = 0, crowdPx = null;
    let drag = null;                 // a finger steering: {x0, lane0}
    let lane = 0;

    const skinName = () => (PV.CrowdScene.SKINS || ['plain'])[Math.min(meta.skin, skinsAt(meta.level) - 1)] || 'plain';
    const look = { color: PV.CrowdGL.rgb(COLORS[meta.color][0]), skin: skinName() };

    function saveMeta() { PV.Store.set(META, meta); }

    function whereText(game) {
      if (game.level) return t('crowd.level', { n: game.level }) + ' · ' + t('crowd.' + game.theme);
      return t('crowd.' + courseKey) + ' ' + '★'.repeat(PV.CrowdCourse.tierOf(courseKey)) + ' · ' + t('diff.' + diffKey);
    }

    /* ---- the shop, the wheel and the skins, at the start line only ---- */

    function buy(kind) {
      const game = ui && ui.game;
      if (!game || !game.ready || racing) return;
      const lv = meta[kind], cost = PV.CrowdRush.boostCost(kind, lv);
      if (lv >= MAX_UP || meta.coins < cost) return;
      meta.coins -= cost;
      meta[kind] = lv + 1;
      saveMeta();
      game.setBoost(racing ? null : meta);
      ui.draw();
    }
    function recolor() {
      meta.color = (meta.color + 1) % COLORS.length;
      look.color = PV.CrowdGL.rgb(COLORS[meta.color][0]);
      saveMeta();
      if (ui) ui.draw();
    }
    /** The next skin you have, round to the first. */
    function reskin() {
      const have = skinsAt(meta.level);
      meta.skin = (Math.min(meta.skin, have - 1) + 1) % have;
      look.skin = skinName();
      saveMeta();
      if (ui) ui.draw();
    }

    function pay(game) {
      if (game.paid != null) return game.paid;
      game.paid = racing ? 0 : game.coins;
      meta.coins = Math.min(MAX_COINS, meta.coins + game.paid);
      saveMeta();
      return game.paid;
    }

    /* ---- steering ---- */

    function point(e) {
      const rect = ui.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function steerTo(px) {
      const half = roadPx || (ui.canvas.clientWidth * 0.28);
      const cx = crowdPx != null ? crowdPx : ui.canvas.clientWidth / 2;
      lane = Math.max(-1, Math.min(1, (px - cx) / half));
      ui.input({ lane: lane });
    }
    function onMove(e) {
      if (!ui || !ui.game) return;
      const p = point(e);
      if (e.pointerType === 'mouse') { steerTo(p.x); return; }
      if (drag) {
        const half = roadPx || (ui.canvas.clientWidth * 0.28);
        lane = Math.max(-1, Math.min(1, drag.lane0 + (p.x - drag.x0) / half * 1.15));
        ui.input({ lane: lane });
      }
    }
    function onDown(e) {
      if (!ui || !ui.game) return;
      const p = point(e);
      for (const h of hits) {
        if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) { h.act(); return; }
      }
      if (e.pointerType !== 'mouse') {
        drag = { x0: p.x, lane0: ui.game.x / PV.CrowdRush.EDGE };
        try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not ours to capture */ }
      } else steerTo(p.x);
      ui.input('go');
    }
    function onUp() { drag = null; }

    /* ---- painting ---- */

    function sizeGL(geom) {
      if (!glCanvas || !scene) return;
      const w = geom.w, h = geom.h;
      if (glCanvas.style.width !== w + 'px') glCanvas.style.width = w + 'px';
      if (glCanvas.style.height !== h + 'px') glCanvas.style.height = h + 'px';
      scene.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
    }

    /** New events since the last frame: the numbers that float off the crowd. */
    function readPops(game) {
      const ev = game.events;
      let i = ev.length - 1;
      while (i >= 0 && ev[i].s > seen) i--;
      for (i++; i < ev.length; i++) {
        const e = ev[i];
        seen = e.s;
        if (e.k === 'gate') {
          const txt = e.op === 'mul' ? '×' + e.val : e.op === 'add' ? '+' + e.val : e.op === 'sub' ? '−' + e.val : '÷' + e.val;
          pops.push({ text: txt, good: PV.CrowdCourse.isGood(e.op), age: 0 });
        } else if (e.k === 'bonus') {
          pops.push({ text: '+' + e.d, good: true, age: 0, big: true });
        }
      }
      if (pops.length > 6) pops.splice(0, pops.length - 6);
    }

    function hud(c, game, geom, v, dt) {
      // One unit for every size on screen: a hundredth of the short side, a
      // little more on a phone, where a hundredth is under four pixels.
      const W = geom.w, H = geom.h, u = Math.min(W, H) / 100 * (H > W ? 1.18 : 1);
      const P = COLORS[meta.color];
      hits = [];

      // Where the crowd is on screen, and how wide the road is there: the
      // mouse maps onto the road, not onto the whole canvas.
      const at = scene.project(v.x, 0, v.z), edge = scene.project(v.x + PV.CrowdCourse.HALF, 0, v.z);
      const mid = scene.project(0, 0, v.z);
      if (at && edge && mid) { roadPx = Math.abs(edge.x - at.x); crowdPx = mid.x; }

      const phase = game.phase;
      const showCounts = phase !== 'tower' && !(phase === 'won' && !game.king);

      // Red squads' numbers over their heads.
      if (showCounts) {
        const list = game.course.features;
        for (let fi = 0; fi < list.length; fi++) {
          const f = list[fi];
          if (f.kind !== 'squad' || game.beatenAt[fi]) continue;
          if (f.z < v.z - 4 || f.z > v.z + 70) continue;
          const engaged = game.clash && game.clash.i === fi;
          const n = engaged ? game.foeCount : f.n;
          const p = scene.project(engaged ? game.clash.x : 0, 1.9, (engaged ? game.clash.z : f.z) + f.r * 0.3);
          if (p) pill(c, p.x, p.y, fmt(n), FOE_PILL, Math.max(10, u * 3.2 * Math.min(1.2, p.s * 11)));
        }
      }

      // Yours — not at the start line, where the reference shows none.
      if (showCounts && game.count > 0 && phase !== 'ready') {
        let px = v.x, pz = v.z + Math.max(0.3, game.front * 0.3);
        if (game.king && (phase === 'boss' || phase === 'won')) {
          let sx = 0, sz = 0;
          for (let i = 0; i < game.units; i++) { sx += game.ux[i]; sz += game.uz[i]; }
          if (game.units) { px = sx / game.units; pz = sz / game.units; }
        }
        const p = scene.project(px, 1.5, pz);
        if (p) {
          const size = Math.max(11, u * 3.3 * Math.min(1.25, p.s * 11));
          pill(c, p.x, p.y, fmt(game.count), P[1], size);
          // The gate just taken floats up out of the crowd.
          for (const q of pops) {
            q.age += dt;
            const k = q.age / 1.0;
            if (k >= 1) continue;
            c.globalAlpha = Math.min(1, (1 - k) * 2.2);
            say(c, q.text, p.x, p.y - size * 2.1 - k * u * 9, (q.big ? 7 : 5.2) * u * (1 + 0.15 * Math.sin(Math.min(1, k * 4) * Math.PI)),
              q.good ? '#FFFFFF' : '#FF5A5A', q.good ? 'rgba(20,70,130,0.55)' : 'rgba(90,0,0,0.5)');
            c.globalAlpha = 1;
          }
        }
      }
      pops = pops.filter(q => q.age < 1);

      // The king's health.
      if (game.course.boss && (game.king || v.z > game.course.finish - 30) && phase !== 'won') {
        const k = game.king || { x: 0, z: game.course.kingZ, hp: 1 };
        const p = scene.project(k.x, 4.3, k.z);
        if (p) {
          const bw = u * 13, bh = u * 1.7;
          c.fillStyle = 'rgba(255,255,255,0.95)';
          rr(c, p.x - bw / 2 - 2, p.y - bh / 2 - 2, bw + 4, bh + 4, (bh + 4) / 2); c.fill();
          c.fillStyle = '#5B1A1A';
          rr(c, p.x - bw / 2, p.y - bh / 2, bw, bh, bh / 2); c.fill();
          c.fillStyle = '#F4433C';
          rr(c, p.x - bw / 2, p.y - bh / 2, Math.max(bh, bw * Math.max(0, k.hp)), bh, bh / 2); c.fill();
          crownIcon(c, p.x, p.y - bh * 1.5, u * 1.3);
        }
      }

      topBar(c, game, W, u, v);

      if (phase === 'ready') startScreen(c, game, W, H, u, at);
      if (phase === 'gauge') needle(c, game, W, H, u);
      if (game.tower) towerText(c, game, W, H, u);
      if (phase === 'won' && game.king && game.king.down) winText(c, W, H, u, game.endT);
      if (phase === 'lost') {
        const k = Math.min(1, game.endT / 20);
        c.globalAlpha = k;
        say(c, t('crowd.failed'), W / 2, H * 0.3, u * 11 * (0.8 + 0.2 * k), '#FF4B4B', '#FFFFFF');
        c.globalAlpha = 1;
      }
    }

    /** The level bar: this level's number, the run so far, the finish. */
    function topBar(c, game, W, u, v) {
      const ready = game.phase === 'ready';
      const bw = u * 30, bh = u * 2.4, cx = W / 2, y = u * (ready ? 10.5 : 5.5);
      if (ready && game.level) say(c, t('crowd.level', { n: game.level }).toUpperCase(), cx, u * 4.6, u * 4.2, '#FFFFFF', 'rgba(20,40,70,0.6)');
      c.fillStyle = 'rgba(255,255,255,0.92)';
      rr(c, cx - bw / 2 - 3, y - bh / 2 - 3, bw + 6, bh + 6, (bh + 6) / 2); c.fill();
      c.fillStyle = 'rgba(30,50,80,0.25)';
      rr(c, cx - bw / 2, y - bh / 2, bw, bh, bh / 2); c.fill();
      const pct = Math.max(0, Math.min(1, v.z / game.course.finish));
      c.fillStyle = '#2E9BEA';
      rr(c, cx - bw / 2, y - bh / 2, Math.max(bh, bw * pct), bh, bh / 2); c.fill();
      // The squads on the way, as skulls along the bar.
      for (const f of game.course.features) {
        if (f.kind !== 'squad') continue;
        const x = cx - bw / 2 + bw * Math.min(1, f.z / game.course.finish);
        c.fillStyle = 'rgba(25,35,55,0.75)';
        c.beginPath(); c.arc(x, y, u * 1.5, 0, TAU); c.fill();
        skull(c, x, y + u * 0.1, u * 1.2);
      }
      const r = u * 2.6;
      c.fillStyle = '#2E9BEA';
      c.beginPath(); c.arc(cx - bw / 2 - r * 0.6, y, r, 0, TAU); c.fill();
      c.lineWidth = u * 0.5; c.strokeStyle = '#FFFFFF'; c.stroke();
      say(c, game.level ? String(game.level) : '★', cx - bw / 2 - r * 0.6, y + u * 0.1, u * (String(game.level || '').length > 2 ? 2.2 : 2.9), '#FFFFFF');
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(cx + bw / 2 + r * 0.6, y, r, 0, TAU); c.fill();
      c.lineWidth = u * 0.5; c.strokeStyle = '#2E9BEA'; c.stroke();
      if (game.course.boss) crownIcon(c, cx + bw / 2 + r * 0.6, y + u * 0.2, u * 1.5);
      else flagIcon(c, cx + bw / 2 + r * 0.6, y, r);

      if (!racing) {
        // Coins, top right.
        const label = fmt(meta.coins), s = u * 3;
        font(c, s);
        const tw = c.measureText(label).width, pw = tw + s * 2.4, ph = s * 1.6;
        const px = W - pw - u * 2, py = u * 2;
        c.fillStyle = 'rgba(15,25,45,0.42)';
        rr(c, px, py, pw, ph, ph / 2); c.fill();
        coin(c, px + pw - ph * 0.55, py + ph / 2, s * 0.55);
        say(c, label, px + ph * 0.45, py + ph / 2 + 1, s, '#FFFFFF', null, 'left');
      }
    }

    function startScreen(c, game, W, H, u, at) {
      // The prompt, as the reference words it, just over the crowd's head.
      const s = u * 3.1;
      const txt = coarse ? t('crowd.tapStart') : null;
      font(c, s);
      const y = Math.min(H * 0.56, (at ? at.y : H * 0.75) - u * 15);
      if (txt) {
        const w = c.measureText(txt).width + s * 2;
        c.fillStyle = 'rgba(15,25,45,0.45)';
        rr(c, W / 2 - w / 2, y - s, w, s * 2, s); c.fill();
        say(c, txt, W / 2, y + 1, s, '#FFFFFF');
      } else {
        const a = t('crowd.press'), key = t('crowd.space'), b = t('crowd.orClick');
        const wa = c.measureText(a).width, wb = c.measureText(b).width;
        font(c, s * 0.62);
        const wk = c.measureText(key).width + s * 1.1;
        const gap = s * 0.5, w = wa + wk + wb + gap * 2 + s * 1.6;
        const x0 = W / 2 - w / 2;
        c.fillStyle = 'rgba(15,25,45,0.45)';
        rr(c, x0, y - s, w, s * 2, s * 0.6); c.fill();
        let x = x0 + s * 0.8;
        say(c, a, x, y + 1, s, '#FFFFFF', null, 'left'); x += wa + gap;
        c.fillStyle = '#FFFFFF';
        rr(c, x, y - s * 0.5, wk, s, s * 0.25); c.fill();
        say(c, key, x + wk / 2, y + 1, s * 0.62, '#2A3342'); x += wk + gap;
        say(c, b, x, y + 1, s, '#FFFFFF', null, 'left');
      }
      if (racing) return;
      // The two upgrade cards.
      const cw = u * 13, ch = u * 16.5, gap = u * 2;
      const cy = H - ch - u * 2.2;
      card(c, W / 2 - cw - gap / 2, cy, cw, ch, u, 'units');
      card(c, W / 2 + gap / 2, cy, cw, ch, u, 'income');

      // The colour wheel, left.
      const bs = u * 11, bx = u * 2.5, by = H * 0.42;
      c.fillStyle = '#B04BE0';
      rr(c, bx, by, bs, bs * 1.05, u * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      rr(c, bx, by, bs, bs * 0.45, u * 2); c.fill();
      wheelIcon(c, bx + bs / 2, by + bs * 0.42, bs * 0.3);
      say(c, t('crowd.color'), bx + bs / 2, by + bs * 0.88, u * 2.2, '#FFFFFF', 'rgba(60,0,90,0.5)');
      hits.push({ x: bx, y: by, w: bs, h: bs * 1.05, act: recolor });

      // The skin, right: what you are wearing, and when the next one comes.
      const have = skinsAt(meta.level), sx = W - bs - u * 2.5;
      c.fillStyle = '#3DBE55';
      rr(c, sx, by, bs, bs * 1.05, u * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      rr(c, sx, by, bs, bs * 0.45, u * 2); c.fill();
      stickIcon(c, sx + bs / 2, by + bs * 0.55, bs * 0.5, COLORS[meta.color][0]);
      say(c, t('crowd.skin'), sx + bs / 2, by + bs * 0.88, u * 2.2, '#FFFFFF', 'rgba(0,70,20,0.5)');
      say(c, t('crowd.skin.' + look.skin) + ' ' + (Math.min(meta.skin, have - 1) + 1) + '/' + have,
        sx + bs / 2, by + bs * 1.05 + u * 2, u * 1.7, '#FFFFFF', 'rgba(0,0,0,0.45)');
      if (have < SKIN_COUNT) {
        say(c, t('crowd.skinNext', { n: 1 + have * SKIN_EVERY }), sx + bs / 2, by + bs * 1.05 + u * 4.3, u * 1.6,
          'rgba(255,255,255,0.85)', 'rgba(0,0,0,0.45)');
      }
      hits.push({ x: sx, y: by, w: bs, h: bs * 1.05, act: reskin });
    }

    function card(c, x, y, w, h, u, kind) {
      const lv = meta[kind], cost = PV.CrowdRush.boostCost(kind, lv);
      const top = lv >= MAX_UP, can = !top && meta.coins >= cost;
      const units = kind === 'units';
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, units ? '#5AB8FA' : '#FFBE4A');
      g.addColorStop(1, units ? '#2E86E8' : '#FF8F1F');
      c.fillStyle = 'rgba(0,0,0,0.25)';
      rr(c, x, y + u * 0.6, w, h, u * 1.8); c.fill();
      c.fillStyle = g;
      rr(c, x, y, w, h, u * 1.8); c.fill();
      c.lineWidth = u * 0.4; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
      say(c, String(lv), x + u * 2.2, y + u * 2.4, u * 2.7, '#FFFFFF', 'rgba(0,0,0,0.3)');
      say(c, t('crowd.lvl'), x + u * 2.2, y + u * 4.4, u * 1.4, '#FFFFFF');
      if (units) stickIcon(c, x + w / 2, y + h * 0.5, u * 7, '#E9F6FF');
      else {
        coin(c, x + w / 2 - u * 1.8, y + h * 0.43, u * 2.3);
        coin(c, x + w / 2 + u * 1.6, y + h * 0.38, u * 2.3);
        coin(c, x + w / 2, y + h * 0.5, u * 2.7);
      }
      say(c, t(units ? 'crowd.startUnits' : 'crowd.income'), x + w / 2, y + h * 0.68, u * 1.9, '#FFFFFF', 'rgba(0,0,0,0.3)');
      const sh = u * 3.8, sy = y + h - sh;
      c.fillStyle = top ? '#8E99AA' : (can ? '#43C257' : '#8E99AA');
      rr(c, x, sy, w, sh, u * 1.8); c.fill();
      c.fillRect(x, sy, w, sh * 0.4);
      if (top) say(c, t('crowd.max'), x + w / 2, sy + sh / 2, u * 2.3, '#FFFFFF');
      else {
        say(c, '⬆', x + u * 2.2, sy + sh / 2, u * 2, '#FFFFFF');
        say(c, fmt(cost), x + w / 2 + u * 0.4, sy + sh / 2 + 1, u * 2.4, '#FFFFFF');
        coin(c, x + w - u * 2.4, sy + sh / 2, u * 1.1);
      }
      hits.push({ x: x, y: y, w: w, h: h, act: () => buy(kind) });
    }

    /** The needle before the king: stop it on the middle for the most. */
    function needle(c, game, W, H, u) {
      const g = game.course.gauge, cx = W / 2, cy = H * 0.48, r = u * 15;
      const segs = [[-1, -0.6, g[0], '#FFD54F'], [-0.6, -0.22, g[1], '#8BD35A'], [-0.22, 0.22, g[2], '#E9FFD9'],
        [0.22, 0.6, g[1], '#8BD35A'], [0.6, 1, g[0], '#FFD54F']];
      const ang = v => -Math.PI / 2 + v * Math.PI / 2;
      c.fillStyle = 'rgba(15,25,45,0.35)';
      c.beginPath(); c.arc(cx, cy, r + u * 1.2, Math.PI, 0); c.closePath(); c.fill();
      for (const s of segs) {
        c.fillStyle = s[3];
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, ang(s[0]), ang(s[1])); c.closePath(); c.fill();
        const mid = ang((s[0] + s[1]) / 2);
        say(c, '+' + s[2], cx + Math.cos(mid) * r * 0.7, cy + Math.sin(mid) * r * 0.7, u * 2.2, s[3] === '#E9FFD9' ? '#2D6A1E' : '#FFFFFF', s[3] === '#E9FFD9' ? null : 'rgba(0,0,0,0.3)');
      }
      c.fillStyle = 'rgba(15,25,45,0.55)';
      c.beginPath(); c.arc(cx, cy, r * 0.28, Math.PI, 0); c.closePath(); c.fill();
      const nv = game.gaugeVal != null ? game.needle(game.gaugeLockT || game.gaugeT) : game.needle(game.gaugeT);
      const a = ang(nv);
      c.strokeStyle = '#FFFFFF';
      c.lineWidth = u * 1.1;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); c.stroke();
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(cx, cy, u * 1.4, 0, TAU); c.fill();
      if (game.gaugeVal == null) say(c, t('crowd.tapChoose'), cx, cy - r - u * 3.4, u * 3.4, '#FFFFFF', 'rgba(20,40,70,0.6)');
    }

    function towerText(c, game, W, H, u) {
      const T = game.tower, R = PV.CrowdRush;
      const climbed = R.GATHER + (T.reach + 1) * R.STEP_T;
      if (T.t < climbed) return;
      const k = Math.min(1, (T.t - climbed) / 14);
      const big = 1 + 0.25 * Math.sin(k * Math.PI);
      say(c, '×' + game.mult.toFixed(1), W / 2, H * 0.34, u * 9 * big, '#FFD54F', 'rgba(90,50,0,0.6)');
      if (T.top && T.t > climbed + R.CHEST_T * 0.6) winText(c, W, H, u, T.t - climbed - R.CHEST_T * 0.6);
    }

    function winText(c, W, H, u, age) {
      const k = Math.min(1, age / 16);
      const s = u * 12 * (0.6 + 0.4 * k + 0.08 * Math.sin(k * Math.PI));
      c.globalAlpha = k;
      say(c, t('crowd.youWin'), W / 2, H * 0.2, s, '#3BD14E', '#FFFFFF');
      c.globalAlpha = 1;
    }

    /* ---- the harness ---- */

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right', A: 'left', D: 'right',
        ' ': 'go', Enter: 'go'
      },
      sustained: ['left', 'right'],
      pad: null,
      pct: game => game.progress,

      create: () => (levels
        ? new PV.CrowdRush({ seed: PV.CrowdCourse.seedFor(meta.level), level: meta.level, boost: meta })
        : new PV.CrowdRush({
          seed: ctx.seed(), course: courseKey, difficulty: diffKey,
          autostart: racing, boost: racing ? null : meta
        })),

      onReset(game) {
        pops = []; seen = game.seq; drag = null;
        if (scene) scene.reset(game);
        if (ui) ui.status.textContent = whereText(game);
      },

      fit(availW, availH) {
        if (PV.stage().phone) {
          const w = Math.max(280, availW);
          return { w: w, h: Math.round(Math.max(380, Math.min(availH + 70, w * 1.62))) };
        }
        let w = Math.min(availW, 1180), h = w * 0.62;
        if (h > availH) { h = availH; w = h / 0.62; }
        return { w: Math.round(Math.max(320, w)), h: Math.round(Math.max(220, h)) };
      },

      build(api) {
        ui = api;
        // The world goes on a canvas of its own, underneath the harness's.
        const box = api.canvas.parentElement;
        box.style.position = 'relative';
        api.canvas.style.position = 'relative';
        api.canvas.style.zIndex = '1';
        glCanvas = PV.el('canvas', { class: 'crowd-gl' });
        glCanvas.style.position = 'absolute';
        glCanvas.style.left = '1px';
        glCanvas.style.top = '1px';
        glCanvas.style.borderRadius = '9px';
        glCanvas.style.pointerEvents = 'none';
        box.insertBefore(glCanvas, api.canvas);
        try {
          scene = PV.CrowdScene(glCanvas);
        } catch (e) {
          scene = null;
          broken = true;
        }
        glCanvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); broken = true; });
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('crowd.hint')));
        api.canvas.addEventListener('pointermove', onMove);
        api.canvas.addEventListener('pointerdown', onDown);
        api.canvas.addEventListener('pointerup', onUp);
        api.canvas.addEventListener('pointercancel', onUp);
      },

      onDestroy() {
        if (ui) {
          ui.canvas.removeEventListener('pointermove', onMove);
          ui.canvas.removeEventListener('pointerdown', onDown);
          ui.canvas.removeEventListener('pointerup', onUp);
          ui.canvas.removeEventListener('pointercancel', onUp);
        }
        if (scene) scene.destroy();
        scene = null;
        if (glCanvas) glCanvas.remove();
      },

      onRelabel(api) { if (api.game) api.status.textContent = whereText(api.game); },

      draw(c, game, geom, api, alpha) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016;
        lastNow = now;
        c.clearRect(0, 0, geom.w, geom.h);
        if (!scene || broken) {
          c.fillStyle = '#1B2330';
          c.fillRect(0, 0, geom.w, geom.h);
          say(c, t('crowd.noGL'), geom.w / 2, geom.h / 2, Math.max(12, geom.w * 0.028), '#EAF0F7');
          return;
        }
        sizeGL(geom);
        readPops(game);
        const v = scene.frame(game, alpha, dt, look);
        if (game.phase === 'ready') {
          c.fillStyle = 'rgba(20,30,50,0.22)';
          c.fillRect(0, 0, geom.w, geom.h);
        }
        hud(c, game, geom, v, dt);
      },

      outcome(game) {
        const won = game.overReason === 'stormed' || game.overReason === 'climbed';
        const coins = pay(game);
        const lv = game.level;
        let fresh = null;
        if (lv && won && !game.advanced) {
          game.advanced = true;
          if (meta.level === lv) {
            const had = skinsAt(meta.level);
            meta.level = Math.min(PV.CrowdCourse.MAX_LEVEL, lv + 1);
            if (skinsAt(meta.level) > had) {
              // A new skin: put it on, as the reference dresses you at once.
              meta.skin = skinsAt(meta.level) - 1;
              look.skin = skinName();
              fresh = look.skin;
            }
            saveMeta();
          }
        }
        const how = game.overReason === 'climbed'
          ? (game.tower && game.tower.top ? t('crowd.chest') : t('crowd.climbed', { m: game.mult.toFixed(1) }))
          : (game.overReason === 'stormed' ? t('crowd.bossDown') : null);
        return {
          result: won ? 'win' : 'lose',
          score: game.score,
          xp: Math.round((won ? 120 : 20 + 80 * game.progress) * (0.8 + game.spec.t)),
          tone: won ? 'good' : 'bad',
          title: lv ? t(won ? 'crowd.levelDone' : 'crowd.levelFailed', { n: lv })
            : (won ? t('crowd.stormed') : t('crowd.routed')),
          againLabel: lv ? (won ? t('crowd.nextLevel') : t('common.retry')) : undefined,
          lines: [
            whereText(game),
            how,
            t('crowd.count') + ': ' + fmt(game.count) + ' · ' + t('crowd.peak') + ': ' + fmt(game.peak),
            t('crowd.beaten') + ': ' + fmt(game.beaten) + ' · ' + t('crowd.lost') + ': ' + fmt(game.lost),
            racing ? null : t('crowd.earned', { n: fmt(coins) }),
            fresh ? t('crowd.skinNew', { name: t('crowd.skin.' + fresh) }) : null,
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
