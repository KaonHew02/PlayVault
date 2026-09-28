/* 街头大厨 / Street Chef — view.

   Glue between the loop harness, the rules and the pictures.

   - ONE CANVAS. The street, the window and the kitchen are drawn in a
     logical space (layout.js) and scaled; the parts that never move are
     painted once into an offscreen canvas and copied in each frame.
   - TAP OR DRAG. A tap is the reference's control: tap a pot to cook, tap
     the cooked pasta and it goes to the plate that wants it, tap a finished
     plate and it goes to the customer who ordered it. A drag says where
     instead — this plate, that customer, the hot plate, the bin. Both
     become the same input (engine.js), a drag just names its `to`.
   - THE LOBBY is DOM over the canvas (ui.js), shown while the game is at
     its menu phase. Play pays for the boosters (meta.js) and sends
     `begin`; the end card's Continue goes back to the map with the next
     level's card open, as the reference does.
   - ON A TRUCK'S FIRST LEVEL a hand points at what the bot (bot.js) would
     do next, with a line saying why, until three customers have been
     served.

   A race with friends skips the lobby, plays one level on a kitchen
   everybody has the same of, and banks nothing, as every race here does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => PV.t(k, p);
  const D = PV.ChefData, A = PV.ChefArt, LO = PV.ChefLayout, M = PV.ChefMeta;
  // A level with no rule that ends a run on the spot: a race is ranked on
  // takings, and one customer walking off should cost coins, not the race.
  const RACE_LEVEL = 8;
  const TUTORIAL_SERVES = 3;

  PV.ChefView = function (ctx) {
    const racing = !!ctx.race;
    let meta = M.load();
    const audio = PV.ChefAudio();

    let ui = null, panels = null, mapBtn = null, fullBtn = null, actions = null;
    let shape = 'wide', L = null, lsig = '', bg = null, bgSig = '';
    let plan = null, popup = null;
    let drag = null, fx = [], seen = 0, lastNow = 0;

    function S() { return shape === 'tall' ? LO.TALL : LO.WIDE; }
    function game() { return ui && ui.game; }

    /** The race: the same truck, level and kitchen for everybody, from the room's seed. */
    function racePlan() {
      const seed = ctx.seed();
      const key = D.KEYS[seed % D.KEYS.length];
      const kit = {};
      for (const u of D.upgrades(key)) kit[u.key] = Math.min(u.max, u.min + 1);
      return { truck: key, level: RACE_LEVEL, kit: kit, boost: {}, seed: seed };
    }

    /* -------------------------------------------------------- the lobby */

    function play(key, L2, boost) {
      const g = game();
      if (!g || g.phase !== 'menu') return 'chef.err.busy';
      if (M.boostCost(boost) > meta.gems) return 'chef.err.gems';
      const p = M.begin(meta, key, L2, boost);
      if (!p) return 'chef.err.locked';
      plan = p;
      if (ui.paused) ui.pause();
      ui.input({ a: 'begin', plan: p });
      audio.init();
      audio.play('go');
      return null;
    }

    function toMap() {
      const g = game();
      if (!g || g.phase === 'menu' || g.isOver()) return;
      if (ui.paused) ui.pause();
      popup = { truck: g.truck.key, level: g.spec.level };
      plan = null;
      ui.input({ a: 'quit' });
    }

    function tutorial(g) {
      if (racing || !g.spec || g.spec.level !== 1) return false;
      const tm = meta.trucks[g.truck.key];
      return !!tm && tm.stars[0] === 0 && g.served < TUTORIAL_SERVES;
    }

    /* ------------------------------------------------------ full screen */

    /* The whole host goes full screen, not the canvas alone as in Strike
       Squad: the bar's Map, Pause and Restart have no other home here, and
       a race's table sits in the host too. The canvas takes the stage,
       whatever the bar leaves of the screen (fit). */
    function isFull() { return !!ui && document.fullscreenElement === ctx.host; }

    function toggleFull() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (ctx.host.requestFullscreen) ctx.host.requestFullscreen().catch(() => {});
    }

    function labelFull() {
      if (fullBtn) fullBtn.textContent = '⛶ ' + t(isFull() ? 'chef.fullscreenExit' : 'chef.fullscreen');
    }

    function onFullChange() {
      labelFull();
      if (ui) ui.resize();
    }

    /* ------------------------------------------------------------ input */

    function toLogical(e) {
      const r = ui.canvas.getBoundingClientRect();
      const s = S();
      return { x: (e.clientX - r.left) * s.W / Math.max(1, r.width), y: (e.clientY - r.top) * s.H / Math.max(1, r.height) };
    }

    function slotOf(g, h) { const st = g.stations[h.s]; return st && st.slots[h.i]; }

    function draggable(g, h) {
      if (h.k === 'slot') { const sl = slotOf(g, h); return !!sl && (sl.st === 'done' || sl.st === 'full' || sl.st === 'burnt'); }
      if (h.k === 'plate') return !!g.plates[h.i] && g.plates[h.i].parts.length > 0;
      if (h.k === 'warm') return !!g.warm[h.i];
      return h.k === 'bin';
    }

    /** The input a tap on `h` is. */
    function tapAction(g, h) {
      switch (h.k) {
        case 'coins': return { a: 'coins', spot: h.i };
        case 'spot': return g.spots[h.i] && g.spots[h.i].coins ? { a: 'coins', spot: h.i } : null;
        case 'slot': return { a: 'slot', s: h.s, i: h.i };
        case 'machine': return { a: 'station', s: h.s };
        case 'plate': return { a: 'plate', i: h.i };
        case 'warm': return { a: 'warm', i: h.i };
        case 'bin': return { a: 'bin', b: h.b };
      }
      return null;
    }

    function dropTo(h) {
      if (!h) return null;
      if (h.k === 'plate') return { k: 'plate', i: h.i };
      if (h.k === 'spot' || h.k === 'coins') return { k: 'spot', i: h.i };
      if (h.k === 'warm') return { k: 'warm', i: h.i };
      if (h.k === 'trash') return { k: 'trash' };
      return null;
    }

    const same = (a, b) => !!a && !!b && a.k === b.k && a.i === b.i && a.s === b.s && a.b === b.b;

    function send(a) { if (a) { audio.init(); ui.input(a); } }

    function onDown(e) {
      audio.init();
      const g = game();
      if (!g || g.phase !== 'play' || ui.paused || !L) return;
      const p = toLogical(e);
      const h = LO.hit(L, g, p.x, p.y);
      if (!h) return;
      e.preventDefault();
      if (draggable(g, h)) {
        drag = { from: h, x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, id: e.pointerId };
        try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
        return;
      }
      send(tapAction(g, h));
    }

    function onMove(e) {
      if (!ui) return;
      const p = toLogical(e);
      if (drag && e.pointerId === drag.id) {
        drag.x = p.x; drag.y = p.y;
        if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 12) drag.moved = true;
        return;
      }
      const g = game();
      const h = g && g.phase === 'play' && L ? LO.hit(L, g, p.x, p.y) : null;
      ui.canvas.style.cursor = h && h.k !== 'trash' && (h.k !== 'spot' || (g.spots[h.i] && g.spots[h.i].coins)) ? 'pointer' : 'default';
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      const g = game();
      if (!g || g.phase !== 'play') return;
      const p = toLogical(e);
      const over = LO.hit(L, g, p.x, p.y);
      if (!d.moved || same(over, d.from)) { send(tapAction(g, d.from)); return; }
      const to = dropTo(over);
      if (!to) return;
      const a = tapAction(g, d.from);
      if (a) { a.to = to; send(a); }
    }

    function onCancel() { drag = null; }

    /* ---------------------------------------------------------- drawing */

    function layoutFor(g) {
      const sig = shape + '|' + (g.spec ? [g.truck.key, g.spec.level, g.plates.length, g.warm.length, g.bins.length, g.stations.map(s => s.slots.length).join(',')].join('|') : 'menu');
      if (sig !== lsig) { L = LO.build(g.spec ? g : null, shape); lsig = sig; bg = null; }
      return L;
    }

    function background(g, geom) {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const key = g.spec ? g.truck.key : meta.truck;
      const sig = lsig + '|' + key + '|' + Math.round(geom.w) + '|' + dpr + '|' + (g.spec ? 'level' : 'menu');
      if (bg && bgSig === sig) return bg;
      const s = S();
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(geom.w * dpr)); cv.height = Math.max(1, Math.round(geom.h * dpr));
      const c = cv.getContext('2d');
      c.setTransform(dpr * geom.w / s.W, 0, 0, dpr * geom.w / s.W, 0, 0);
      if (g.spec) {
        A.street(c, key, s.W, L.street.h + 4, L.tall);
        A.frame(c, key, s.W, L.street.h, L.counter.h, 0);
        A.kitchen(c, key, L);
      } else {
        A.street(c, key, s.W, s.H * 0.8, L.tall);
        c.fillStyle = '#6E7580'; c.fillRect(0, s.H * 0.8, s.W, s.H * 0.2);
        c.fillStyle = '#F2F2F2';
        for (let x = 20; x < s.W; x += 90) c.fillRect(x, s.H * 0.9, 46, 6);
        const tw = Math.min(s.W * 0.8, 560);
        A.truck(c, key, (s.W - tw) / 2, s.H * 0.8 - tw * 0.52, tw, t('chef.truck.' + key));
      }
      bg = cv; bgSig = sig;
      return bg;
    }

    function draw(c, g, geom) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016;
      lastNow = now;
      const s = S();
      layoutFor(g);
      const img = background(g, geom);
      c.drawImage(img, 0, 0, geom.w, geom.h);
      c.save();
      c.scale(geom.w / s.W, geom.h / s.H);
      if (g.spec) level(c, g, s, dt);
      c.restore();
    }

    function level(c, g, s, dt) {
      const th = A.themeOf(g.truck.key);
      const walk = PV.ChefGame.WALK;

      // Customers, cut off by the counter.
      c.save();
      c.beginPath(); c.rect(0, 0, s.W, L.counter.y); c.clip();
      for (const sp of L.spots) {
        const cu = g.spots[sp.i].c;
        if (!cu) continue;
        const dir = sp.i < 2 ? -1 : 1;
        let x = sp.cx, alpha = 1;
        if (cu.st === 'in') { const f = 1 - cu.t / walk; x += dir * f * sp.w * 0.7; alpha = 1 - f * 0.7; }
        else if (cu.st === 'happy' || cu.st === 'angry') { const f = cu.t / walk; x += dir * f * sp.w * 0.7; alpha = 1 - f; }
        c.globalAlpha = Math.max(0, alpha);
        A.person(c, cu.look, x, sp.base + 4, sp.scale, cu.st === 'wait' ? cu.pat / cu.max : cu.mood, g.clock, cu.st);
        c.globalAlpha = 1;
      }
      c.restore();

      // Coins on the counter.
      for (const sp of L.spots) {
        const n = g.spots[sp.i].coins;
        if (!n) continue;
        const cy = L.counter.y + L.counter.h * 0.5;
        const pulse = 1 + Math.sin(g.clock * 0.15) * 0.07;
        A.coins(c, sp.cx, cy, (L.tall ? 11 : 12) * pulse, n);
        A.say(c, '+' + n, sp.cx, cy - 24, L.tall ? 15 : 16, '#FFE27A', '#5A3A00');
      }

      // Bubbles.
      const dragging = drag && drag.moved ? dragPart(g, drag.from) : null;
      for (const sp of L.spots) {
        const cu = g.spots[sp.i].c;
        if (!cu || !(cu.st === 'wait' || (cu.st === 'in' && cu.t > walk * 0.5))) continue;
        bubble(c, g, sp, cu, dragging);
      }

      kitchen(c, g, th);

      if (tutorial(g) && g.phase === 'play') guide(c, g, s);
      if (drag && drag.moved) ghost(c, g);
      effects(c, g, dt);
      hud(c, g, s);

      if (g.phase === 'ready') {
        const f = g.readyT / PV.ChefGame.READY;
        c.fillStyle = 'rgba(20,24,32,' + (0.45 * (1 - f * 0.5)) + ')';
        c.fillRect(0, 0, s.W, s.H);
        const big = f < 0.62 ? t('chef.ready') : t('chef.go');
        const k = f < 0.62 ? 1 : 1 + (f - 0.62) * 1.2;
        A.say(c, big, s.W / 2, s.H * 0.42, (L.tall ? 64 : 72) * k, '#FFD447', '#5A3A00');
        A.say(c, goalText(g), s.W / 2, s.H * 0.42 + (L.tall ? 64 : 70), L.tall ? 22 : 24, '#FFFFFF', '#1E2530');
        const ch = challengeText(g);
        if (ch) A.say(c, ch, s.W / 2, s.H * 0.42 + (L.tall ? 100 : 106), L.tall ? 18 : 20, '#FFB4A8', '#1E2530');
      }
    }

    function goalText(g) {
      const goal = g.spec.goal;
      return goal.type === 'serve' ? t('chef.goal.serve', { n: goal.n }) : t('chef.goal.coins', { n: g.targets.stars[0] });
    }
    function challengeText(g) {
      const out = [];
      if (g.spec.noBurn) out.push('🔥 ' + t('chef.goal.noBurn'));
      if (g.spec.noLoss) out.push('😊 ' + t('chef.goal.noLoss'));
      return out.join('   ');
    }

    /** What is being dragged, as parts, for the ghost and for lighting up who wants it. */
    function dragPart(g, h) {
      if (h.k === 'slot') { const st = g.stations[h.s]; return st ? [st.makes] : null; }
      if (h.k === 'plate') return g.plates[h.i] ? g.plates[h.i].parts.slice() : null;
      if (h.k === 'warm') return g.warm[h.i] ? [g.warm[h.i]] : null;
      if (h.k === 'bin') return [g.bins[h.b]];
      return null;
    }

    function bubble(c, g, sp, cu, dragging) {
      const n = cu.items.length;
      const ic = L.tall ? 38 : 44, pad = 7, gap = 4;
      const w = pad * 2 + n * ic + (n - 1) * gap;
      const h = ic + pad * 2 + 10;
      const headTop = sp.base - 138 * sp.scale;
      const y = Math.max(L.tall ? 50 : 44, headTop - h - 14);
      const x = Math.max(6, Math.min(L.W - w - 6, sp.cx - w / 2));
      const key = dragging ? D.keyOf(dragging) : null;
      const wants = key && cu.st === 'wait' && cu.items.some(it => !it.done && it.key === key);
      c.save();
      c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
      A.rr(c, x, y, w, h, 12); A.paint(c, '#FFFFFF');
      c.restore();
      A.rr(c, x, y, w, h, 12); A.paint(c, null, wants ? '#34C759' : '#3A2618', wants ? 3.5 : 2);
      c.beginPath(); c.moveTo(sp.cx - 8, y + h - 1.5); c.lineTo(sp.cx, y + h + 10); c.lineTo(sp.cx + 8, y + h - 1.5);
      c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = wants ? '#34C759' : '#3A2618'; c.lineWidth = 2; c.stroke();
      cu.items.forEach((it, j) => {
        const cx = x + pad + j * (ic + gap) + ic / 2, cy = y + pad + ic / 2;
        if (it.done) c.globalAlpha = 0.3;
        A.item(c, g.truck.menu[it.m].parts, cx, cy, ic * 0.42, g.clock);
        c.globalAlpha = 1;
        if (it.done) A.tick(c, cx + ic * 0.26, cy - ic * 0.22, ic * 0.17);
      });
      const f = cu.st === 'wait' ? cu.pat / cu.max : 1;
      const bx = x + pad, by = y + h - pad - 6, bw = w - pad * 2;
      A.rr(c, bx, by, bw, 7, 3.5); A.paint(c, '#E5E9EE');
      A.rr(c, bx, by, Math.max(7, bw * f), 7, 3.5); A.paint(c, f > 0.5 ? '#34C759' : (f > 0.25 ? '#FFB020' : '#FF3B30'));
    }

    function kitchen(c, g, th) {
      const over = drag && drag.moved ? LO.hit(L, g, drag.x, drag.y) : null;
      const base = g.truck.menu[0].parts[0];
      for (const b of L.boxes) {
        if (b.kind === 'cook') {
          const st = g.stations[b.s], Ls = L.stations[b.s];
          A.cookBody(c, st.def.art, b, th);
          Ls.slots.forEach((sl, i) => A.cookSlot(c, st.def.art, st.makes, sl, st, st.slots[i], g.clock));
        } else if (b.kind === 'drink') {
          const st = g.stations[b.s], Ls = L.stations[b.s];
          A.drinkMachine(c, st.def.art, b, Ls.machine, th, g.clock, st.slots.some(x => x.st === 'fill'), st.makes);
          Ls.slots.forEach((sl, i) => A.drinkSlot(c, st.makes, sl, st, st.slots[i], g.clock));
        } else if (b.kind === 'warm') {
          A.warmer(c, b, L.warm, g.warm, g.clock);
        } else if (b.kind === 'bin') {
          A.bin(c, L.bins[b.b], b.part);
        } else if (b.kind === 'trash') {
          A.trash(c, L.trash, !!over && over.k === 'trash');
        } else if (b.kind === 'plates') {
          for (const p of L.plates) {
            const pl = g.plates[p.i];
            const ready = pl.parts.length && g.bestCustomer(D.keyOf(pl.parts)) >= 0;
            if (ready) {
              c.save(); c.globalAlpha = 0.45 + 0.2 * Math.sin(g.clock * 0.12);
              A.ell(c, p.cx, p.cy + p.r * 0.14, p.r * 1.12, p.r * 0.66); A.paint(c, '#7CF29A');
              c.restore();
            }
            // The plate in your hand is faded where it came from.
            const held = !!drag && drag.moved && drag.from.k === 'plate' && drag.from.i === p.i;
            if (held) c.globalAlpha = 0.35;
            if (pl.parts.length) A.dish(c, pl.parts, p.cx, p.cy, p.r);
            else A.ware(c, base, p.cx, p.cy, p.r);
            c.globalAlpha = 1;
          }
        }
      }
      // Where a drag would land.
      if (over) {
        const r = rectOf(over);
        if (r) { A.rr(c, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); A.paint(c, 'rgba(255,212,71,.14)', '#FFB020', 3); }
      }
    }

    /** The rectangle a hit (or an input's source) stands for. */
    function rectOf(h) {
      if (!h || !L) return null;
      switch (h.k) {
        case 'slot': { const st = L.stations[h.s]; return st && st.slots[h.i]; }
        case 'machine': case 'station': { const st = L.stations[h.s]; return st && (st.machine || st.box); }
        case 'plate': return L.plates[h.i];
        case 'warm': return L.warm[h.i];
        case 'bin': return L.bins.find(b => b.b === h.b);
        case 'trash': return L.trash;
        case 'coins': return L.spots[h.i] && L.spots[h.i].coins;
        case 'spot': return L.spots[h.i] && L.spots[h.i].hit;
      }
      return null;
    }

    function ghost(c, g) {
      const parts = dragPart(g, drag.from);
      if (!parts) return;
      const r = L.tall ? 34 : 38;
      c.save();
      c.globalAlpha = 0.9;
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 10; c.shadowOffsetY = 6;
      if (drag.from.k === 'plate') A.dish(c, parts, drag.x, drag.y, r);
      else if (drag.from.k === 'slot' && g.stations[drag.from.s].type === 'drink') A.drink(c, parts[0], drag.x, drag.y + r * 0.5, r * 0.8, 1);
      else if (drag.from.k === 'slot' && D.partKind(parts[0]) !== 'side') A.onHeat(c, parts[0], drag.x, drag.y, r * 0.8, 1, g.stations[drag.from.s].slots[drag.from.i].st === 'burnt');
      else A.part(c, parts[0], drag.x, drag.y, r * 0.8);
      c.restore();
    }

    /** The hand on a first level, and a line that says what it is pointing at. */
    function guide(c, g, s) {
      const a = PV.ChefBot.next(g);
      if (!a) return;
      let h = null, key = null;
      if (a.a === 'coins') { h = { k: 'coins', i: a.spot }; key = 'coins'; }
      else if (a.a === 'slot') {
        h = { k: 'slot', s: a.s, i: a.i };
        const st = g.stations[a.s], sl = st.slots[a.i];
        key = sl.st === 'empty' ? (st.type === 'drink' ? 'pour' : 'cook') : (sl.st === 'burnt' ? 'burnt' : (sl.st === 'full' || D.partKind(st.makes) === 'side' ? 'give' : 'take'));
      } else if (a.a === 'station') { h = { k: 'machine', s: a.s }; key = g.stations[a.s].type === 'drink' ? 'pour' : 'cook'; }
      else if (a.a === 'bin') { h = { k: 'bin', b: a.b }; key = 'bin'; }
      else if (a.a === 'plate') { h = { k: 'plate', i: a.i }; key = a.to && a.to.k === 'trash' ? 'trash' : 'serve'; }
      else if (a.a === 'warm') { h = { k: 'warm', i: a.i }; key = 'warm'; }
      const r = rectOf(h);
      if (!r) return;
      const pulse = 0.5 + 0.5 * Math.sin(g.clock * 0.14);
      A.rr(c, r.x, r.y, r.w, r.h, 10); A.paint(c, 'rgba(255,255,255,' + (0.08 + 0.1 * pulse) + ')', '#FFD447', 3 + pulse * 2);
      A.hand(c, r.x + r.w * 0.62, r.y + r.h * 0.62, L.tall ? 30 : 34, g.clock);
      const text = t('chef.hint.' + key);
      A.font(c, L.tall ? 17 : 18, 800);
      const tw = c.measureText(text).width + 30;
      const by = L.counter.y - (L.tall ? 34 : 30);
      A.rr(c, (s.W - tw) / 2, by - 16, tw, 32, 16); A.paint(c, 'rgba(24,30,40,.86)', '#FFD447', 2);
      A.say(c, text, s.W / 2, by, L.tall ? 17 : 18, '#FFFFFF');
    }

    function effects(c, g, dt) {
      const goal = goalBar(S());
      fx = fx.filter(f => (f.age += dt) < f.life);
      for (const f of fx) {
        const sp = L.spots[f.spot];
        const k = f.age / f.life;
        if (f.kind === 'text' && sp) {
          c.globalAlpha = 1 - k;
          A.say(c, f.text, sp.cx, L.counter.y - 40 - k * 50, L.tall ? 20 : 22, f.col, '#3A2618');
          c.globalAlpha = 1;
        } else if (f.kind === 'fly' && sp) {
          const e = k * k * (3 - 2 * k);
          const x0 = sp.cx, y0 = L.counter.y + L.counter.h * 0.5;
          const x = x0 + (goal.x + 14 - x0) * e, y = y0 + (goal.y + goal.h / 2 - y0) * e - Math.sin(e * Math.PI) * 60;
          for (let i = 0; i < 3; i++) A.coin(c, x - i * 8 * (1 - e), y + i * 6 * (1 - e), 9);
        } else if (f.kind === 'heart' && sp) {
          const y = sp.base - 150 * sp.scale - k * 30;
          c.globalAlpha = 1 - k;
          A.say(c, '❤', sp.cx + 26, y, 22 + k * 8, '#FF4D6D', '#FFFFFF');
          c.globalAlpha = 1;
        } else if (f.kind === 'burn') {
          const st = L.stations[f.s], sl = st && st.slots[f.i];
          if (sl) { c.globalAlpha = 1 - k; A.say(c, t('chef.fx.burnt'), sl.cx, sl.y - k * 30, 18, '#FF6B5B', '#2A1E17'); c.globalAlpha = 1; }
        }
      }
    }

    function goalBar(s) {
      if (L.tall) return { x: 150, y: 8, w: 330, h: 32 };
      return { x: 300, y: 7, w: 400, h: 30 };
    }

    function pill(c, x, y, w, h) {
      A.rr(c, x, y, w, h, h / 2); A.paint(c, 'rgba(24,30,40,.82)', 'rgba(255,255,255,.85)', 2);
    }

    function hud(c, g, s) {
      const tall = L.tall;
      const fs = tall ? 16 : 16;
      // level
      const lvW = tall ? 132 : 280;
      pill(c, 8, tall ? 8 : 7, lvW, tall ? 32 : 30);
      const label = tall ? t('chef.lv', { n: g.spec.level }) : t('chef.truck.' + g.truck.key) + ' · ' + t('chef.lv', { n: g.spec.level });
      const marks = (g.spec.noBurn ? ' 🔥' : '') + (g.spec.noLoss ? ' 😊' : '');
      A.say(c, label + marks, 8 + lvW / 2, (tall ? 8 : 7) + (tall ? 16 : 15), fs, '#FFFFFF');
      // goal: coins toward three stars
      const b = goalBar(s);
      const tg = g.targets.stars;
      pill(c, b.x, b.y, b.w, b.h);
      const inner = { x: b.x + 34, y: b.y + 8, w: b.w - 46, h: b.h - 16 };
      const f = Math.min(1, g.earned / tg[2]);
      A.rr(c, inner.x, inner.y, inner.w, inner.h, inner.h / 2); A.paint(c, 'rgba(255,255,255,.18)');
      if (f > 0) { A.rr(c, inner.x, inner.y, Math.max(inner.h, inner.w * f), inner.h, inner.h / 2); A.paint(c, '#FFC933'); }
      A.coin(c, b.x + 17, b.y + b.h / 2, 10);
      for (let i = 0; i < 3; i++) {
        const sx = inner.x + inner.w * (tg[i] / tg[2]);
        A.star(c, Math.min(sx, inner.x + inner.w - 4), b.y + b.h / 2, tall ? 11 : 10, g.earned >= tg[i]);
      }
      const goal = g.spec.goal;
      const txt = goal.type === 'serve' ? '👤 ' + g.served + ' / ' + goal.n + '   ' + g.earned : g.earned + ' / ' + tg[0];
      A.say(c, txt, inner.x + inner.w * 0.36, b.y + b.h / 2 + 0.5, tall ? 14 : 14, '#FFFFFF', '#3A2618');
      // time and who is left
      const left = g.left;
      const tw = tall ? 100 : 180;
      const tx = s.W - 8 - tw;
      pill(c, tx, tall ? 8 : 7, tw, tall ? 32 : 30);
      const cy = (tall ? 8 : 7) + (tall ? 16 : 15);
      const warn = left <= 15 && g.phase === 'play';
      A.clock(c, tx + 18, cy, 9, warn && Math.floor(g.clock / 15) % 2 === 0);
      A.say(c, Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'), tx + (tall ? 58 : 58), cy, fs, warn ? '#FF8A7A' : '#FFFFFF', null);
      if (!tall) {
        A.head(c, tx + 112, cy, 10);
        A.say(c, String(g.remaining), tx + 148, cy, fs, '#FFFFFF');
      } else {
        pill(c, s.W - 8 - 70, 46, 70, 26);
        A.head(c, s.W - 8 - 50, 59, 8);
        A.say(c, String(g.remaining), s.W - 8 - 22, 59, 14, '#FFFFFF');
      }
    }

    /* ------------------------------------------------------ the harness */

    return PV.loopHost(ctx, {
      hz: D.HZ,
      keymap: {},
      pad: null,
      fullscreen: false,             // it brings its own ⛶
      pct: g => g.progress,

      create: () => {
        if (racing) return new PV.ChefGame({ plan: racePlan() });
        // A restart pays for the boosters again, or goes without them.
        if (plan) plan = M.begin(meta, plan.truck, plan.level, plan.boost) || M.begin(meta, plan.truck, plan.level, {});
        return new PV.ChefGame({ plan: plan });
      },

      onReset(g) {
        fx = []; seen = g.seq; drag = null;
        if (panels) panels.show(false);
      },

      fit(availW, availH) {
        // Full screen, the room is the stage the CSS leaves under the bar,
        // and nothing caps it: the caps keep a game readable on a page.
        const stage = isFull() ? ui.canvas.parentElement.parentElement : null;
        if (stage) { availW = stage.clientWidth; availH = stage.clientHeight; }
        shape = availW < availH * 0.92 ? 'tall' : 'wide';
        const s = S();
        const ratio = s.H / s.W;
        let w;
        if (stage) {
          w = Math.floor(Math.max(280, Math.min(availW, availH / ratio)));
        } else {
          w = Math.min(availW, shape === 'wide' ? 1180 : 640);
          if (w * ratio > availH) w = Math.max(Math.min(availW, 560), availH / ratio);
          w = Math.round(Math.max(280, Math.min(availW, w)));
        }
        // The lobby is laid out for the logical size, as the kitchen is
        // drawn in it, and grows with the canvas past it.
        if (panels) panels.sharpen(PV.scaleUI(ui.canvas.parentElement, w / s.W));
        return { w: w, h: Math.round(w * ratio) };
      },

      build(api) {
        ui = api;
        const box = api.canvas.parentElement;
        box.classList.add('chef-box');
        panels = PV.ChefUI({
          meta: () => meta,
          play: play,
          changed: () => { /* meta.js saved it already */ },
          seenHelp: () => { if (!meta.tips.first) { meta.tips.first = true; M.save(meta); } },
          sound: { on: audio.on, toggle: audio.toggle, buy: () => { audio.init(); audio.play('buy'); } }
        });
        box.appendChild(panels.node);
        actions = api.status.parentElement.querySelector('.bar-actions');
        mapBtn = PV.el('button', { class: 'btn ghost', onclick: toMap }, t('chef.toMap'));
        if (actions && !racing) actions.insertBefore(mapBtn, actions.firstChild);
        // Last in the bar, so it keeps its place whether the level's buttons
        // show or not. A browser that cannot (an iPhone's) never shows it.
        fullBtn = PV.el('button', { class: 'btn ghost', hidden: !document.fullscreenEnabled, onclick: toggleFull });
        if (actions) actions.appendChild(fullBtn);
        document.addEventListener('fullscreenchange', onFullChange);
        api.canvas.addEventListener('pointerdown', onDown);
        api.canvas.addEventListener('pointermove', onMove);
        api.canvas.addEventListener('pointerup', onUp);
        api.canvas.addEventListener('pointercancel', onCancel);
        api.below.appendChild(PV.el('p', { class: 'muted small chef-hint' }, t('chef.controls')));
      },

      onDestroy() {
        if (ui) {
          ui.canvas.removeEventListener('pointerdown', onDown);
          ui.canvas.removeEventListener('pointermove', onMove);
          ui.canvas.removeEventListener('pointerup', onUp);
          ui.canvas.removeEventListener('pointercancel', onCancel);
        }
        document.removeEventListener('fullscreenchange', onFullChange);
        if (isFull()) document.exitFullscreen().catch(() => {});
        if (panels) panels.destroy();
        audio.destroy();
      },

      onRelabel(api) {
        if (mapBtn) mapBtn.textContent = t('chef.toMap');
        labelFull();
        if (panels && panels.open) panels.refresh();
        const g = api.game;
        if (g) api.status.textContent = g.spec ? t('chef.truck.' + g.truck.key) + ' · ' + t('chef.lv', { n: g.spec.level }) : t('chef.title');
      },

      onFrame(g, api) {
        const menu = g.phase === 'menu';
        if (panels) {
          if (menu && !panels.open) {
            meta = M.load();
            panels.show(true);
            if (popup) { panels.openLevel(popup.truck, popup.level); popup = null; }
            else if (!meta.tips.first) panels.help();
          } else if (!menu && panels.open) panels.show(false);
        }
        // At the menu the bar's Pause and Restart have nothing to act on;
        // in a level, Map is the way back to it. Full screen is for both.
        // A race has no menu, and its Restart is the harness's to hide, so
        // a race is left alone.
        if (actions && !racing) for (const b of actions.children) if (b !== fullBtn) b.hidden = menu;
        if (racing) mapBtn.hidden = true;
        const status = g.spec ? t('chef.truck.' + g.truck.key) + ' · ' + t('chef.lv', { n: g.spec.level }) : t('chef.title');
        if (api.status.textContent !== status) api.status.textContent = status;
        for (const e of g.events) {
          if (e.seq <= seen) continue;
          seen = e.seq;
          switch (e.k) {
            case 'pay': fx.push({ kind: 'text', text: '+' + e.n, spot: e.spot, age: 0, life: 1.1, col: '#FFE27A' }); audio.play('pay'); break;
            case 'coins': fx.push({ kind: 'fly', spot: e.spot, age: 0, life: 0.6 }); audio.play('coins'); break;
            case 'serve': fx.push({ kind: 'heart', spot: e.spot, age: 0, life: 0.8 }); audio.play('serve'); break;
            case 'burn': fx.push({ kind: 'burn', s: e.s, i: e.i, age: 0, life: 1.2 }); audio.play('burn'); break;
            case 'nope': audio.play('nope'); break;
            case 'end': audio.play(g.result && g.result.passed ? 'win' : 'lose'); break;
            default: audio.play(e.k);
          }
        }
      },

      draw(c, g, geom) { draw(c, g, geom); },

      outcome(g) {
        const r = g.result || { passed: false, stars: 0, earned: 0, served: 0, count: 0, failed: '' };
        let b = null;
        if (!racing) {
          meta = M.load();
          b = M.bank(meta, g);
          popup = { truck: g.truck.key, level: r.passed && g.spec.level < D.LEVELS ? g.spec.level + 1 : g.spec.level };
          plan = null;
        }
        const title = r.passed ? t('chef.end.win', { n: g.spec.level })
          : (r.failed ? t('chef.end.fail.' + r.failed) : t('chef.end.lose'));
        const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
        return {
          result: r.passed ? 'win' : 'lose',
          score: r.earned,
          xp: Math.round(15 + r.stars * 20 + r.served * 2),
          tone: r.passed ? 'good' : 'bad',
          title: title,
          againLabel: racing ? undefined : t(r.passed ? 'chef.continue' : 'chef.tryAgain'),
          lines: [
            stars,
            t('chef.truck.' + g.truck.key) + ' · ' + t('chef.lv', { n: g.spec.level }),
            t('chef.line.coins', { n: r.earned, goal: g.targets.stars[0] }) + (r.tips ? ' · ' + t('chef.line.tips', { n: r.tips }) : ''),
            t('chef.line.served', { n: r.served, of: r.count }) + (r.lost ? ' · ' + t('chef.line.lost', { n: r.lost }) : ''),
            r.burned ? t('chef.line.burned', { n: r.burned }) : null,
            b && b.gems ? t('chef.line.gems', { n: b.gems }) : null,
            b && b.levelUp ? t('chef.line.levelUp', { n: b.levelUp, coins: b.bonus }) : null,
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
