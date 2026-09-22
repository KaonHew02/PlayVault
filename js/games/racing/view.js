/* 卡丁车 / Kart Racing — view.

   The camera turns with the kart, so the road ahead is always straight up the
   screen.

   It used to hold the world still, on the grounds that "left on the key is
   always left on the screen". That is true of a game where the key names a
   direction, like Snake. It is not true here: steering is relative to the
   kart, `car.angle += wheel * TURN`, and half of every lap on both circuits is
   spent heading DOWN the screen — a quarter of it steeply. For all of that, a
   press of left swings the kart visibly right. Turning the camera is what
   makes the controls mean what they look like.

   Everything the track does is drawn on the track — the dirt chord, the pads,
   the coins, the oil, the boxes, the banana somebody left on the apex. A HUD
   alone leaves the player guessing what just spun them, and a shortcut nobody
   can see is not a shortcut.

   The minimap is drawn in screen space, like the lap counter: a map that
   scales with the camera is unreadable at both ends. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const VIEW = 66, VIEW_SM = 46;          // world units across the canvas
  const DROP = 0.70;                      // how far down the screen the kart sits
  const COLOURS = ['#F6B32B', '#38BDF8', '#F87171', '#34D399', '#C084FC',
                   '#FB923C', '#22D3EE', '#A3E635'];
  const GLYPH = { mushroom: '🍄', banana: '🍌', shell: '🐚', shield: '🛡️', lightning: '⚡' };
  const SPARK = ['#7DD3FC', '#F97316', '#C084FC'];   // mini, super, ultra

  PV.RacingView = function (ctx) {
    const opts = ctx.opts || {};
    let lapEl, posEl, timeEl, bestEl, itemEl, itemName, speedEl, coinEl;
    let bounds = null;
    let cam = null;                       // eased position and heading
    let flash = { text: '', until: 0 };

    const fmtTicks = n => (n ? PV.fmtTime(Math.round(n / 60 * 1000)) : '—');

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'accel', ArrowDown: 'brake',
        a: 'left', d: 'right', w: 'accel', s: 'brake',
        A: 'left', D: 'right', W: 'accel', S: 'brake',
        Shift: 'drift', z: 'drift', Z: 'drift', ' ': 'item',
        r: 'reset', R: 'reset'
      },
      // Steering, throttle and the drift are held, not tapped, so they are
      // SUSTAINED: the harness re-queues them on every tick. On the repeat
      // timer they landed on 41% of ticks with a 133 ms hole after each press,
      // which is what made a held left arrow feel like a flinch.
      // Firing an item and resetting do not repeat: one press, one thing.
      sustained: ['left', 'right', 'accel', 'brake', 'drift'],
      pad: [
        { label: '◀', action: 'left' }, { label: '▲', action: 'accel', aria: 'accelerate' },
        { label: '▶', action: 'right' },
        { label: '⟲', action: 'drift' }, { label: '▼', action: 'brake' },
        { label: '★', action: 'item', aria: 'use item' }
      ],
      padCols: 3,

      create: () => new PV.Racing({
        seed: ctx.seed(),
        track: opts.track || 'ring',
        laps: Number(opts.laps || 3),
        kart: opts.kart || 'medium',
        rivals: 7
      }),

      onReset() { bounds = null; cam = null; flash = { text: '', until: 0 }; },

      fit(availW, availH) {
        const w = Math.max(240, Math.min(availW, 1000));
        return { w: w, h: Math.max(220, Math.min(w * 0.66, availH)) };
      },

      build(api) {
        itemEl = PV.el('div', { class: 'kart-slot' }, '—');
        itemName = PV.el('span', { class: 'muted small' }, t('racing.none'));
        lapEl = PV.el('b', {}, '1');
        posEl = PV.el('b', {}, '1');
        speedEl = PV.el('b', {}, '0');
        coinEl = PV.el('b', {}, '0');
        timeEl = PV.el('b', {}, '0:00');
        bestEl = PV.el('b', {}, '—');

        api.side.appendChild(PV.el('div', { class: 'panel-mini' },
          PV.el('span', { class: 'k' }, t('racing.item')), itemEl, itemName));
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('racing.place')), posEl,
          PV.el('span', { class: 'k' }, t('racing.lap')), lapEl,
          PV.el('span', { class: 'k' }, t('racing.speed')), speedEl,
          PV.el('span', { class: 'k' }, t('racing.coins')), coinEl));
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('common.time')), timeEl,
          PV.el('span', { class: 'k' }, t('racing.best')), bestEl));
        api.below.appendChild(PV.el('p', { class: 'muted small hide-sm' }, t('racing.controls')));
      },

      onFrame(game) {
        const p = game.player;
        lapEl.textContent = game.lapNumber + ' / ' + game.laps;
        posEl.textContent = game.place(p) + ' / ' + game.cars.length;
        speedEl.textContent = String(game.kmh);
        /* The cap is on the BONUS, not on the coins: the eleventh coin is
           still worth score, it just stops making you faster. So the HUD is a
           meter that fills and stops, rather than a tally that reads 11 / 10. */
        coinEl.textContent = Math.min(p.coins, PV.Racing.COIN_CAP)
          + ' / ' + PV.Racing.COIN_CAP;
        timeEl.textContent = game.phase === 'countdown' ? '0:00'
          : fmtTicks(game.tick - PV.Racing.COUNTDOWN);
        bestEl.textContent = fmtTicks(p.best);
        const it = p.item;
        itemEl.textContent = it ? GLYPH[it] : (p.shield ? GLYPH.shield : '—');
        itemEl.className = 'kart-slot' + (it || p.shield ? ' full' : '');
        itemName.textContent = it ? t('racing.' + it)
          : (p.shield ? t('racing.shieldOn') : t('racing.none'));

        // One banner slot, so a start grade, a drift level and the final lap
        // never argue over the middle of the screen.
        for (const ev of game.events) {
          if (ev.kind === 'go') {
            flash = { text: ev.start === 'perfect' ? t('racing.perfectStart')
              : ev.start === 'good' ? t('racing.goodStart')
                : ev.start === 'jump' ? t('racing.jumpStart') : t('racing.go'),
              until: game.tick + 90 };
          } else if (ev.kind === 'drift' && ev.level === 3) {
            flash = { text: t('racing.ultra'), until: game.tick + 45 };
          } else if (ev.kind === 'block' && ev.player) {
            flash = { text: t('racing.blocked'), until: game.tick + 45 };
          }
        }
        if (game.finalLap && game.tick < game.player.lapTick + 90) {
          flash = { text: t('racing.finalLap'), until: game.player.lapTick + 90 };
        }
      },

      draw(c, game, geom) {
        const tk = game.track;
        const scale = geom.w / (geom.w < 560 ? VIEW_SM : VIEW);
        const p = game.player;

        /* Follow where the kart is GOING, not where its nose points: in a
           drift those differ by up to twenty-four degrees, and tracking the
           nose makes the whole world twitch sideways every time you flick it
           in. Tracking the travel line instead leaves the kart visibly cocked
           into the corner, which is the part worth seeing. */
        const head = p.angle - p.slide;
        if (!cam) cam = { x: p.x, y: p.y, a: head };
        cam.x += (p.x - cam.x) * 0.22;
        cam.y += (p.y - cam.y) * 0.22;
        if (p.spin === 0) {
          // A spin-out turns the kart two and a half times in three quarters
          // of a second. The camera sits that out and eases back afterwards.
          let d = head - cam.a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          cam.a += d * 0.16;
        }
        // Rotate the world so the kart's heading points up the screen, and sit
        // it low, so most of the canvas is road you have not driven yet.
        const rot = -Math.PI / 2 - cam.a;

        c.fillStyle = '#1B3326';
        c.fillRect(0, 0, geom.w, geom.h);

        c.save();
        c.translate(geom.w / 2, geom.h * DROP);
        c.rotate(rot);
        c.scale(scale, scale);
        c.translate(-cam.x, -cam.y);

        // The dirt chord goes under the asphalt, so the join reads as a fork
        // off the road rather than a stripe painted over it.
        if (tk.shortcut) {
          const s = tk.shortcut;
          c.strokeStyle = '#7A5A38';
          c.lineWidth = s.half * 2;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) c.lineTo(s.points[i].x, s.points[i].y);
          c.stroke();
          c.setLineDash([1.2, 1.6]);
          c.strokeStyle = 'rgba(255,255,255,.22)';
          c.lineWidth = 0.22;
          c.stroke();
          c.setLineDash([]);
        }

        // Kerb first, asphalt on top: one path, two strokes.
        c.beginPath();
        c.moveTo(tk.points[0].x, tk.points[0].y);
        for (let i = 1; i < tk.n; i++) c.lineTo(tk.points[i].x, tk.points[i].y);
        c.closePath();
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.strokeStyle = '#D8D2C4';
        c.lineWidth = tk.width + 1.1;
        c.stroke();
        c.strokeStyle = '#2E3440';
        c.lineWidth = tk.width;
        c.stroke();

        c.setLineDash([2.2, 3.4]);
        c.strokeStyle = 'rgba(255,255,255,.22)';
        c.lineWidth = 0.28;
        c.stroke();
        c.setLineDash([]);

        // Start / finish.
        const p0 = tk.points[0], n0 = tk.normals[0];
        c.strokeStyle = '#EAF0F7';
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(p0.x - n0.x * tk.width / 2, p0.y - n0.y * tk.width / 2);
        c.lineTo(p0.x + n0.x * tk.width / 2, p0.y + n0.y * tk.width / 2);
        c.stroke();

        for (const o of tk.oil) oil(c, o);
        for (const pad of tk.pads) boostPad(c, pad, tk, game.tick);
        for (let i = 0; i < tk.coins.length; i++) {
          if (game.coinBack[i] > game.tick) continue;
          coin(c, tk.coins[i], game.tick);
        }

        for (const box of game.boxes) {
          if (box.at > game.tick) continue;
          itemBox(c, box, game.tick, rot);
        }

        for (const h of game.hazards) banana(c, h);
        for (const s of game.shells) shell(c, s);
        for (const car of game.cars) kart(c, car, game.tick);

        c.restore();

        minimap(c, game, geom, bounds || (bounds = boundsOf(tk)));
        if (game.phase === 'countdown') lights(c, geom, game.light);
        else if (game.tick < flash.until) banner(c, geom, flash.text);
      },

      outcome(game, st) {
        const p = game.player;
        const place = p.place || game.place(p);
        const won = place === 1;
        return {
          result: won ? 'win' : 'lose',
          score: Math.max(0, 10000 - game.tick) + p.coins * 50,
          xp: won ? 90 : Math.max(15, 60 - place * 6),
          tone: won ? 'good' : 'flat',
          title: won ? t('racing.won') : t('racing.placed', { n: place }),
          lines: [
            t('common.time') + ': ' + fmtTicks(game.tick - PV.Racing.COUNTDOWN)
              + ' · ' + t('racing.best') + ': ' + fmtTicks(p.best),
            t('racing.coins') + ': ' + p.coins,      // the total, cap or no cap
            '@best'
          ]
        };
      }
    });
  };

  /* ------------------------------------------------------------- painting */

  function oil(c, o) {
    c.fillStyle = 'rgba(12,14,20,.82)';
    c.beginPath();
    c.ellipse(o.x, o.y, o.r, o.r * 0.7, 0.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(120,180,255,.18)';
    c.beginPath();
    c.ellipse(o.x - o.r * 0.2, o.y - o.r * 0.15, o.r * 0.45, o.r * 0.25, 0.4, 0, Math.PI * 2);
    c.fill();
  }

  function boostPad(c, pad, tk, tick) {
    const tg = tk.tangents[pad.node];
    c.save();
    c.translate(pad.x, pad.y);
    c.rotate(Math.atan2(tg.y, tg.x));
    c.fillStyle = 'rgba(56,189,248,.30)';
    c.fillRect(-1.4, -0.9, 2.8, 1.8);
    c.fillStyle = '#38BDF8';
    for (let i = 0; i < 3; i++) {
      const x = -1.1 + i * 0.8 + ((tick * 0.05 + i) % 3) * 0.06;
      c.beginPath();
      c.moveTo(x, -0.7);
      c.lineTo(x + 0.55, 0);
      c.lineTo(x, 0.7);
      c.lineTo(x + 0.2, 0);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function coin(c, cn, tick) {
    const r = cn.r * (1 + 0.08 * Math.sin(tick * 0.12 + cn.x));
    c.fillStyle = '#F6B32B';
    c.beginPath();
    c.arc(cn.x, cn.y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath();
    c.arc(cn.x - r * 0.25, cn.y - r * 0.25, r * 0.3, 0, Math.PI * 2);
    c.fill();
  }

  function itemBox(c, box, tick, rot) {
    c.save();
    c.translate(box.x, box.y);
    c.rotate(tick * 0.04);
    c.fillStyle = 'rgba(246,179,43,.92)';
    c.beginPath();
    if (c.roundRect) c.roundRect(-0.55, -0.55, 1.1, 1.1, 0.22);
    else c.rect(-0.55, -0.55, 1.1, 1.1);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.lineWidth = 0.12;
    c.stroke();
    c.restore();
    /* The mark stays upright while the box spins, or it is unreadable — and
       upright now means upright ON SCREEN, so it has to undo the camera as
       well as the box. */
    c.save();
    c.translate(box.x, box.y + 0.04);
    c.rotate(-rot);
    c.fillStyle = '#3A2A05';
    c.font = '0.9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', 0, 0);
    c.restore();
  }

  function banana(c, h) {
    c.save();
    c.translate(h.x, h.y);
    c.rotate(0.6);
    c.fillStyle = '#F7D308';
    c.beginPath();
    c.ellipse(0, 0, 0.5, 0.22, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(90,70,10,.65)';
    c.lineWidth = 0.08;
    c.stroke();
    c.restore();
  }

  function shell(c, s) {
    c.fillStyle = '#42B642';
    c.beginPath();
    c.arc(s.x, s.y, 0.42, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#EAF0F7';
    c.lineWidth = 0.1;
    c.stroke();
  }

  function kart(c, car, tick) {
    c.save();
    c.translate(car.x, car.y);
    c.rotate(car.angle);

    if (car.boost > 0) {
      const flick = 0.22 + 0.16 * Math.sin(tick * 0.8 + car.i);
      c.fillStyle = 'rgba(246,179,43,.9)';
      c.beginPath();
      c.moveTo(-0.95, -0.3);
      c.lineTo(-1.5 - flick, 0);
      c.lineTo(-0.95, 0.3);
      c.closePath();
      c.fill();
    }
    if (car.charge > 0 && car.driftLevel > 0) {
      // Blue, orange, purple: the three steps of a charging drift.
      c.fillStyle = SPARK[Math.min(2, car.driftLevel - 1)];
      for (const sy of [-0.42, 0.42]) {
        c.beginPath();
        c.arc(-0.85, sy, 0.15 + 0.05 * Math.sin(tick * 1.3), 0, Math.PI * 2);
        c.fill();
      }
    }

    c.fillStyle = COLOURS[car.i % COLOURS.length];
    c.beginPath();
    if (c.roundRect) c.roundRect(-0.95, -0.55, 1.9, 1.1, 0.28);
    else c.rect(-0.95, -0.55, 1.9, 1.1);
    c.fill();
    c.fillStyle = 'rgba(13,18,24,.55)';
    c.fillRect(-0.15, -0.42, 0.62, 0.84);
    if (car.isPlayer) {
      c.strokeStyle = '#FFFFFF';
      c.lineWidth = 0.14;
      c.stroke();
    }
    if (car.spin > 0) {
      c.strokeStyle = 'rgba(248,113,113,.9)';
      c.lineWidth = 0.16;
      c.beginPath();
      c.arc(0, 0, 1.15, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    if (car.shield) {
      c.strokeStyle = 'rgba(56,189,248,.85)';
      c.lineWidth = 0.16;
      c.beginPath();
      c.arc(car.x, car.y, 1.3 + 0.06 * Math.sin(tick * 0.2), 0, Math.PI * 2);
      c.stroke();
    }
  }

  /* --------------------------------------------------------------- screen */

  function boundsOf(tk) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of tk.points) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const pad = tk.width;
    return { x0: x0 - pad, y0: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }

  function minimap(c, game, geom, b) {
    const w = Math.max(78, geom.w * 0.16), h = w * (b.h / b.w);
    const x = geom.w - w - 10, y = 10;
    const sx = v => x + ((v - b.x0) / b.w) * w;
    const sy = v => y + ((v - b.y0) / b.h) * h;

    c.fillStyle = 'rgba(7,10,16,.72)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(246,179,43,.45)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const tk = game.track;
    c.strokeStyle = 'rgba(234,240,247,.45)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx(tk.points[0].x), sy(tk.points[0].y));
    for (let i = 1; i < tk.n; i += 2) c.lineTo(sx(tk.points[i].x), sy(tk.points[i].y));
    c.closePath();
    c.stroke();

    c.fillStyle = '#EAF0F7';
    c.fillRect(sx(tk.points[0].x) - 2, sy(tk.points[0].y) - 2, 4, 4);
    for (const car of game.cars) {
      if (!car.isPlayer) {
        c.fillStyle = COLOURS[car.i % COLOURS.length];
        c.fillRect(sx(car.x) - 1.5, sy(car.y) - 1.5, 3, 3);
        continue;
      }
      /* An arrow, not a dot. With the world turning under the kart this map
         is the only thing left holding still, so it is what says which way
         round the lap you are pointing. */
      c.save();
      c.translate(sx(car.x), sy(car.y));
      c.rotate(car.angle);
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.moveTo(5, 0);
      c.lineTo(-3.5, -3.5);
      c.lineTo(-1.5, 0);
      c.lineTo(-3.5, 3.5);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  function lights(c, geom, n) {
    c.fillStyle = 'rgba(7,10,16,.35)';
    c.fillRect(0, 0, geom.w, geom.h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '700 ' + Math.round(geom.w * 0.14) + 'px system-ui, sans-serif';
    c.fillStyle = n <= 1 ? '#34D399' : '#F6B32B';
    c.fillText(String(n), geom.w / 2, geom.h / 2);
  }

  function banner(c, geom, text) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '700 ' + Math.round(Math.max(18, geom.w * 0.045)) + 'px system-ui, sans-serif';
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillText(text, geom.w / 2 + 2, geom.h * 0.22 + 2);
    c.fillStyle = '#F6B32B';
    c.fillText(text, geom.w / 2, geom.h * 0.22);
  }

})(window.PV);
