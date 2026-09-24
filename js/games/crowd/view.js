/* 人潮冲锋 / Crowd Rush — view.

   A runner drawn down one vanishing point. Everything the engine holds is a
   distance ahead and a position across a track two units wide; `depth()` maps
   that to a y and a scale, and every gate, saw, rival and stickman goes
   through the same two functions. That is what keeps a gate the crowd is
   about to hit lined up with the gate the engine is about to apply.

   The crowd is drawn as PEOPLE — up to a hundred and forty of them, each with
   a head, a body and legs that swing — because the number is the whole game
   and a bar labelled 128 is not a crowd of 128. Past that cap the drawn crowd
   stops growing and the figure above their heads carries it; a thousand
   stickmen at sixty frames a second buys nothing you can see.

   A crowd packs into a round blob on a sunflower spiral, and each runner
   keeps its place in it by index, so a crowd keeps its shape from frame to
   frame and grows from the outside. The king at the keep is drawn here too:
   the same runner, five times the size, with a crown and a face. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const TAU = Math.PI * 2;
  const CAP = 140;                 // most stickmen we ever draw
  const FAR = 42;                  // metres of track visible ahead

  const THEMES = {
    fields: {
      sky: ['#4CC3F0', '#BDE9FB'], ground: '#43BE6B', ground2: '#4ACB74',
      road: '#F4F7FA', edge: '#D6DEE7', dash: '#C9D4E0', prop: '#2FA85C'
    },
    dunes: {
      sky: ['#63C7F2', '#D9EFFB'], ground: '#E0B564', ground2: '#E8C075',
      road: '#FAF6EE', edge: '#DFD2BC', dash: '#D3C4AA', prop: '#C79B4C'
    },
    keep: {
      sky: ['#3BAFE0', '#C6E9F7'], ground: '#5FC7C9', ground2: '#68D2D4',
      road: '#EFF3F7', edge: '#CFD8E2', dash: '#BFCBD8', prop: '#3FA9AC'
    }
  };

  /* Count Masters' own palette: a near-white road on bright ground, flat
     saturated gates, and chunky blue runners. Nothing here is translucent —
     the reference reads at a glance because everything in it is solid. */
  const GOOD_FACE = '#2DC44E', GOOD_DARK = '#1F9C3A';
  const BAD_FACE = '#EF4444', BAD_DARK = '#C0342F';
  const POST = '#2C3440';
  const MINE = '#3F8EF7', MINE_DARK = '#2463C9', MINE_LIT = '#8FC0FF';
  const THEIRS = '#F2484E', THEIRS_DARK = '#B32A33', THEIRS_LIT = '#FF9AA0';
  const BLUE = { body: MINE, dark: MINE_DARK, lit: MINE_LIT };
  const RED = { body: THEIRS, dark: THEIRS_DARK, lit: THEIRS_LIT };

  function hash(i, salt) {
    let h = Math.imul(i + 17, 374761393) + Math.imul(salt || 1, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function rr(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** The label a gate wears. */
  function gateText(g) {
    if (g.op === 'mul') return '\u00D7' + g.val;
    if (g.op === 'add') return '+' + g.val;
    if (g.op === 'sub') return '\u2212' + g.val;
    return '\u00F7' + g.val;
  }
  function gateGood(g) { return g.op === 'mul' || g.op === 'add'; }

  /* ---------------------------------------------------------- the camera */

  /** One vanishing point, and everything on the track goes through it. */
  function camera(geom) {
    const w = geom.w, h = geom.h;
    const yBase = h * 0.80, yHor = h * 0.30, halfW = w * 0.44;
    return {
      w: w, h: h, cx: w / 2, yBase: yBase, yHor: yHor, halfW: halfW,
      depth(d) { const t = Math.max(0, d) / (Math.max(0, d) + 15); return t; },
      y(d) { return yBase - this.depth(d) * (yBase - yHor); },
      s(d) { return 1 - this.depth(d) * 0.80; },
      x(xt, d) { return this.cx + xt * halfW * this.s(d); }
    };
  }

  /**
   * One runner, feet at (x, y), `hp` pixels tall. Not a stick figure: the
   * reference's crowd is made of chunky blob people — a big round head, a
   * rounded body, stubby limbs and a highlight — and that is most of why it
   * reads as a crowd of characters rather than a scribble.
   *
   * `lod` drops the limbs when there are hundreds on screen. At that size a
   * swinging arm is two pixels nobody can see, and it is 280 fills a frame.
   */
  function runner(c, x, y, hp, phase, skin, lod) {
    const head = hp * 0.30, bw = hp * 0.40;
    const sw = Math.sin(phase), sw2 = -sw;
    const hipY = y - hp * 0.30, topY = y - hp * 0.62;

    if (lod) {
      // Legs first, so the body overlaps where they meet it.
      c.fillStyle = skin.dark;
      for (const s of [sw, sw2]) {
        const lx = x + s * hp * 0.13;
        rr(c, lx - hp * 0.09, hipY - hp * 0.02, hp * 0.18, hp * 0.32 - s * hp * 0.05, hp * 0.09);
        c.fill();
      }
    }
    c.fillStyle = skin.body;
    rr(c, x - bw / 2, topY, bw, hipY - topY + hp * 0.06, bw * 0.42);
    c.fill();
    if (lod) {
      c.fillStyle = skin.body;
      for (const s of [sw2, sw]) {
        const ax = x + (s > 0 ? bw * 0.42 : -bw * 0.42 - hp * 0.12);
        rr(c, ax, topY + hp * 0.04 - s * hp * 0.05, hp * 0.12, hp * 0.24, hp * 0.06);
        c.fill();
      }
    }
    c.fillStyle = skin.body;
    c.beginPath();
    c.arc(x, topY - head * 0.72, head, 0, TAU);
    c.fill();
    // The gloss, up and to the left, the way every one of these games does it.
    c.fillStyle = skin.lit;
    c.beginPath();
    c.ellipse(x - head * 0.30, topY - head * 1.05, head * 0.34, head * 0.24, -0.5, 0, TAU);
    c.fill();
  }

  /** How deep a crowd `width` track units across stands on the ground, in
      metres. The track is two units and about six metres wide, so a ROUND
      crowd is three times its width deep. */
  const depthOf = width => Math.max(0.8, width * 3);

  /**
   * A crowd of `n`, its near edge at distance `d`, centred on `xt`, `width`
   * track units across. Runners pack into a round blob on a sunflower
   * spiral — the shape a crowd runner's mob has, where a random scatter reads
   * as a queue. Runner i keeps its angle whatever the count, so a gate that
   * adds people grows the blob from the outside instead of reshuffling it.
   *
   * `pace` is how fast legs swing: 0 standing, 1 running, more charging.
   * Runners further away than `cut` are not drawn — they have gone in
   * through the castle gate.
   */
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  function crowd(c, cam, n, xt, d, width, tick, skin, salt, pace, cut) {
    const shown = Math.min(CAP, Math.max(1, n));
    const lod = shown <= 70;                 // limbs only while you can see them
    const rx = width / 2, rd = depthOf(width) / 2;
    // A little jitter, a fraction of the spacing, so the packing does not
    // read as a pattern.
    const gap = 1 / Math.sqrt(shown);
    const units = [];
    for (let i = 0; i < shown; i++) {
      const r = Math.sqrt((i + 0.5) / shown);
      const a = i * GOLDEN + salt;
      const jx = (hash(i, salt) - 0.5) * gap * 0.7;
      const jd = (hash(i, salt + 5) - 0.5) * gap * 0.7;
      // Spread AWAY from the camera, never toward it: behind the camera's
      // line everything clamps to one y and one scale and the depth is lost.
      const ud = d + rd + (Math.sin(a) * r + jd) * rd;
      if (cut != null && ud > cut) continue;
      units.push({ x: xt + (Math.cos(a) * r + jx) * rx, d: Math.max(d, ud), i: i });
    }
    units.sort((p, q) => q.d - p.d);
    // One pass of soft shadows under the whole crowd, then the crowd: drawn
    // per figure they stack into a dark smear where the ranks overlap.
    c.fillStyle = 'rgba(20,40,60,.16)';
    for (const u of units) {
      const s = cam.s(u.d), hp = cam.h * 0.052 * s;
      c.beginPath();
      c.ellipse(cam.x(u.x, u.d), cam.y(u.d), hp * 0.34, hp * 0.13, 0, 0, TAU);
      c.fill();
    }
    for (const u of units) {
      const s = cam.s(u.d);
      // Standing still, a runner only breathes; running, its legs swing.
      const bob = pace ? 0 : Math.sin(tick * 0.08 + u.i) * cam.h * 0.002 * s;
      runner(c, cam.x(u.x, u.d), cam.y(u.d) + bob, cam.h * 0.052 * s,
        tick * 0.34 * pace + u.i * 0.9, skin, lod && pace > 0);
    }
  }

  /* A crowd waiting on the course stands still until you are close, then
     runs at you. `dd` is the engine's distance to it, which reaches MEET the
     tick the fight starts; `rest` is where it stands while it waits; `meet`
     is just past the front of your crowd, where the fight is drawn. The
     charge lands exactly on `meet` at MEET, so the fight starts where the
     charge ends and nothing jumps. */
  const MEET = 2.6, RUSH = 9;
  function approach(dd, rest, meet) {
    const u = (dd - MEET) / RUSH;
    if (u >= 1) return { d: rest, pace: 0 };
    const k = Math.max(0, u);
    return { d: meet + (rest - meet) * k * k, pace: 1.7 };
  }

  /** The number over a crowd's heads — the thing the game is actually about. */
  function tally(c, cam, n, xt, d, colour) {
    // Just over the heads of the rank at `d`. Yours is anchored to its near
    // rank — anchored to the back it climbs into whatever gate is coming. A
    // rival's goes over its FAR rank, or the two numbers stack when they meet.
    const s = cam.s(d);
    tallyAt(c, cam.x(xt, d), cam.y(d) - cam.h * 0.13 * s, Math.max(13, cam.h * 0.072 * s), n, colour);
  }

  /** A count in the house style — heavy, with a dark outline — at a point. */
  function tallyAt(c, x, y, size, n, colour) {
    c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = size * 0.28;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,11,16,.85)';
    c.strokeText(String(n), x, y);
    c.fillStyle = colour;
    c.fillText(String(n), x, y);
  }

  /* -------------------------------------------------------- the scenery */

  function ground(c, cam, th, dist) {
    const g = c.createLinearGradient(0, 0, 0, cam.yHor);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, cam.w, cam.yHor);

    c.fillStyle = th.ground;
    c.fillRect(0, cam.yHor, cam.w, cam.h - cam.yHor);

    // Bands of ground, spaced in metres, so the world scrolls under you.
    c.fillStyle = th.ground2;
    const band = 10;
    for (let k = Math.floor(dist / band) * band; k < dist + FAR; k += band) {
      const d0 = k - dist, d1 = d0 + band / 2;
      if (d1 < 0) continue;
      const y0 = cam.y(Math.max(0, d1)), y1 = cam.y(Math.max(0, d0));
      c.fillRect(0, y0, cam.w, Math.max(1, y1 - y0));
    }

    // The track itself: one trapezoid from the far clip to the camera.
    const yFar = cam.y(FAR), sFar = cam.s(FAR);
    c.fillStyle = th.edge;
    c.beginPath();
    c.moveTo(cam.x(-1.16, FAR), yFar); c.lineTo(cam.x(1.16, FAR), yFar);
    c.lineTo(cam.x(1.16, 0), cam.yBase); c.lineTo(cam.x(-1.16, 0), cam.yBase);
    c.closePath(); c.fill();
    c.fillStyle = th.road;
    c.beginPath();
    c.moveTo(cam.x(-1, FAR), yFar); c.lineTo(cam.x(1, FAR), yFar);
    c.lineTo(cam.x(1, 0), cam.yBase); c.lineTo(cam.x(-1, 0), cam.yBase);
    c.closePath(); c.fill();

    // Centre dashes and roadside posts, both pinned to whole metres.
    c.fillStyle = th.dash;
    for (let k = Math.ceil(dist / 6) * 6; k < dist + FAR; k += 6) {
      const d0 = k - dist, d1 = d0 + 2.2;
      const y0 = cam.y(d1), y1 = cam.y(d0), s = cam.s(d0);
      c.globalAlpha = 0.55;
      c.fillRect(cam.cx - cam.halfW * 0.012 * s * 2, y0,
        Math.max(1, cam.halfW * 0.024 * s * 2), Math.max(1, y1 - y0));
      c.globalAlpha = 1;
    }
    c.fillStyle = th.prop;
    for (let k = Math.ceil(dist / 9) * 9; k < dist + FAR; k += 9) {
      const d0 = k - dist, s = cam.s(d0), y = cam.y(d0), hp = cam.h * 0.06 * s;
      for (const side of [-1, 1]) {
        const x = cam.x(side * 1.3, d0);
        c.fillRect(x - hp * 0.12, y - hp, Math.max(1, hp * 0.24), hp);
      }
    }
    // Vanishing haze, so the far clip is not a hard line across the world.
    const haze = c.createLinearGradient(0, yFar - cam.h * 0.06, 0, yFar + cam.h * 0.10);
    haze.addColorStop(0, th.sky[1]);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = haze;
    c.fillRect(0, yFar - cam.h * 0.06, cam.w, cam.h * 0.16);
    void sFar;
  }

  /** A gate pair: two solid slabs on dark posts, the way the reference has
      them. Translucent panels were the other thing making this look homemade —
      a gate you can see the road through does not read as a wall. */
  function gateWall(c, cam, f, dist) {
    const d = f.at - dist;
    const s = cam.s(d), yb = cam.y(d), hp = cam.h * 0.34 * s;
    const post = Math.max(2, hp * 0.075);

    for (const g of f.lanes) {
      const x0 = cam.x(g.x0, d), x1 = cam.x(g.x1, d);
      const good = gateGood(g);
      c.fillStyle = good ? GOOD_FACE : BAD_FACE;
      c.fillRect(x0, yb - hp, x1 - x0, hp);
      // A darker skirt, so the slab sits ON the road instead of floating.
      c.fillStyle = good ? GOOD_DARK : BAD_DARK;
      c.fillRect(x0, yb - hp * 0.16, x1 - x0, hp * 0.16);
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.fillRect(x0, yb - hp, x1 - x0, hp * 0.10);

      const size = Math.max(12, hp * 0.34);
      c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = size * 0.22;
      c.lineJoin = 'round';
      c.strokeStyle = 'rgba(18,24,32,.75)';
      c.strokeText(gateText(g), (x0 + x1) / 2, yb - hp * 0.52);
      c.fillStyle = '#FFFFFF';
      c.fillText(gateText(g), (x0 + x1) / 2, yb - hp * 0.52);
    }

    // The posts go on last: one at each end and one on the split, which is
    // the line the player is actually aiming at.
    c.fillStyle = POST;
    const edges = [f.lanes[0].x0].concat(f.lanes.map(g => g.x1));
    for (const xt of edges) {
      const px = cam.x(xt, d);
      c.fillRect(px - post / 2, yb - hp * 1.06, post, hp * 1.06);
    }
    c.fillStyle = 'rgba(0,0,0,.14)';
    c.fillRect(cam.x(f.lanes[0].x0, d), yb, cam.x(f.lanes[f.lanes.length - 1].x1, d) - cam.x(f.lanes[0].x0, d), Math.max(1, hp * 0.05));
  }

  /** Saw, hammer, spikes — each drawn where the engine says it is this tick. */
  function hazard(c, cam, f, dist, tick) {
    const d = f.at - dist;
    const s = cam.s(d), yb = cam.y(d);
    const hx = PV.CrowdRush.hazardX(f, tick);
    const live = PV.CrowdRush.hazardLive(f, tick);
    const x = cam.x(hx, d);
    const half = (cam.x(hx + f.w / 2, d) - cam.x(hx - f.w / 2, d)) / 2;
    const hp = cam.h * 0.14 * s;

    c.fillStyle = 'rgba(20,40,60,.20)';
    c.beginPath();
    c.ellipse(x, yb, Math.max(2, half), Math.max(1.5, hp * 0.14), 0, 0, TAU);
    c.fill();

    if (f.kind === 'saw') {
      // The teeth stop at the edge of the span the engine actually cuts with:
      // a blade drawn wider than its own hitbox is a blade you dodge wrong.
      const r = Math.max(4, half);
      c.save();
      c.translate(x, yb - r * 0.42);
      c.rotate(tick * 0.22);
      c.fillStyle = '#8A94A6';
      c.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        c.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.42);
        c.lineTo(Math.cos(a + 0.16) * r, Math.sin(a + 0.16) * r * 0.54);
      }
      c.closePath(); c.fill();
      // A rim and a pale face, or a dark disc on a white road reads as a hole.
      c.strokeStyle = '#4A5568';
      c.lineWidth = Math.max(1, r * 0.06);
      c.stroke();
      c.fillStyle = '#CBD3DE';
      c.beginPath(); c.ellipse(0, 0, r * 0.62, r * 0.30, 0, 0, TAU); c.fill();
      c.fillStyle = '#EF4444';
      c.beginPath(); c.ellipse(0, 0, r * 0.26, r * 0.14, 0, 0, TAU); c.fill();
      c.restore();
    } else if (f.kind === 'hammer') {
      const drop = live ? 1 : 0.35;
      const headH = hp * 0.8;
      c.fillStyle = '#8B5E3C';
      c.fillRect(x - Math.max(1, half * 0.10), yb - hp * 2.4, Math.max(2, half * 0.2), hp * 2.4 * (1 - drop * 0.55));
      c.fillStyle = live ? '#EF4444' : '#5A6678';
      rr(c, x - half, yb - headH - hp * 1.5 * (1 - drop), half * 2, headH, headH * 0.22);
      c.fill();
      if (live) {
        c.strokeStyle = 'rgba(255,214,170,.7)';
        c.lineWidth = Math.max(1, s * 3);
        c.beginPath(); c.ellipse(x, yb, half * 1.5, half * 0.4, 0, 0, TAU); c.stroke();
      }
    } else {
      const n = Math.max(3, Math.round(half / 6));
      c.fillStyle = '#5A6678';
      for (let i = 0; i < n; i++) {
        const px = x - half + (i + 0.5) * (half * 2 / n);
        c.beginPath();
        c.moveTo(px - half / n * 0.8, yb);
        c.lineTo(px, yb - hp);
        c.lineTo(px + half / n * 0.8, yb);
        c.closePath(); c.fill();
      }
    }
  }

  /**
   * The king who holds the keep: our own runner, five times the
   * size, in red, with a cape, a plain gold crown and a scowl — he is the one
   * figure on the course with a face, because he is the one who looks at you.
   * His health is the number of runners it takes to bring him down.
   *
   * `fallen` counts ticks since he fell (or -1): he topples, then fades.
   */
  function king(c, cam, d, hp, full, tick, fighting, fallen) {
    const s = cam.s(d), y = cam.y(d);
    const H = cam.h * 0.052 * s * 5;
    let x = cam.cx;
    if (fighting) x += Math.sin(tick * 1.9) * H * 0.025;     // taking hits
    const bw = H * 0.46, head = H * 0.27;
    const hipY = -H * 0.30, topY = -H * 0.64;

    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(20,40,60,.22)';
    c.beginPath(); c.ellipse(0, 0, H * 0.34, H * 0.08, 0, 0, TAU); c.fill();
    if (fallen >= 0) {
      c.rotate(Math.min(1, fallen / 22) * Math.PI * 0.48);
      c.globalAlpha = Math.max(0, 1 - Math.max(0, fallen - 34) / 26);
    }
    // Cape first, so the body stands in front of it.
    c.fillStyle = '#7F1D2A';
    c.beginPath();
    c.moveTo(-bw * 0.46, topY + H * 0.02);
    c.lineTo(bw * 0.46, topY + H * 0.02);
    c.lineTo(bw * 0.72, -H * 0.04);
    c.lineTo(-bw * 0.72, -H * 0.04);
    c.closePath(); c.fill();
    // Legs, planted.
    c.fillStyle = THEIRS_DARK;
    for (const side of [-1, 1]) {
      rr(c, side * bw * 0.24 - H * 0.07, hipY - H * 0.02, H * 0.14, H * 0.32, H * 0.06);
      c.fill();
    }
    // Arms: raised and swinging while he fights, down while he waits.
    for (const side of [-1, 1]) {
      const swing = fighting ? Math.sin(tick * 0.5 + side) * 0.6 - 0.9 : 0.15;
      c.save();
      c.translate(side * bw * 0.5, topY + H * 0.08);
      c.rotate(side * swing);
      c.fillStyle = THEIRS;
      rr(c, -H * 0.06, 0, H * 0.12, H * 0.30, H * 0.06); c.fill();
      c.restore();
    }
    c.fillStyle = THEIRS;
    rr(c, -bw / 2, topY, bw, hipY - topY + H * 0.06, bw * 0.40); c.fill();
    // A belt with a gold buckle.
    c.fillStyle = '#5B1620';
    c.fillRect(-bw / 2, hipY - H * 0.06, bw, H * 0.06);
    c.fillStyle = '#F6B32B';
    c.fillRect(-H * 0.035, hipY - H * 0.065, H * 0.07, H * 0.07);
    // Head, gloss and face.
    const hy = topY - head * 0.72;
    c.fillStyle = THEIRS;
    c.beginPath(); c.arc(0, hy, head, 0, TAU); c.fill();
    c.fillStyle = THEIRS_LIT;
    c.beginPath(); c.ellipse(-head * 0.34, hy - head * 0.38, head * 0.30, head * 0.20, -0.5, 0, TAU); c.fill();
    for (const side of [-1, 1]) {
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.ellipse(side * head * 0.36, hy + head * 0.06, head * 0.19, head * 0.22, 0, 0, TAU); c.fill();
      c.fillStyle = '#1F2430';
      c.beginPath(); c.arc(side * head * 0.32, hy + head * 0.12, head * 0.10, 0, TAU); c.fill();
      // The scowl: each brow slopes down toward the nose.
      c.strokeStyle = '#3A0E14';
      c.lineWidth = Math.max(1.5, head * 0.10);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(side * head * 0.58, hy - head * 0.26);
      c.lineTo(side * head * 0.14, hy - head * 0.12);
      c.stroke();
    }
    // A plain crown: a band and three points, gold, with a red stone.
    const cy = hy - head * 0.80, cw = head * 1.2, ch = head * 0.58;
    c.fillStyle = '#F6B32B';
    c.beginPath();
    c.moveTo(-cw / 2, cy);
    c.lineTo(-cw / 2, cy - ch);
    c.lineTo(-cw / 4, cy - ch * 0.5);
    c.lineTo(0, cy - ch * 1.1);
    c.lineTo(cw / 4, cy - ch * 0.5);
    c.lineTo(cw / 2, cy - ch);
    c.lineTo(cw / 2, cy);
    c.closePath(); c.fill();
    c.fillStyle = '#D9901A';
    c.fillRect(-cw / 2, cy - ch * 0.22, cw, ch * 0.22);
    c.fillStyle = '#EF4444';
    c.beginPath(); c.arc(0, cy - ch * 0.46, ch * 0.13, 0, TAU); c.fill();
    c.restore();

    if (fallen >= 0) return;
    // His health, over the crown: a bar that empties and the number left.
    const barW = H * 0.9, barH = Math.max(4, H * 0.055);
    const by = y - H * 1.46, bx = x - barW / 2;
    c.fillStyle = 'rgba(255,255,255,.9)';
    rr(c, bx - 2, by - 2, barW + 4, barH + 4, (barH + 4) / 2); c.fill();
    c.fillStyle = 'rgba(60,20,26,.35)';
    rr(c, bx, by, barW, barH, barH / 2); c.fill();
    c.fillStyle = BAD_FACE;
    rr(c, bx, by, Math.max(barH, barW * Math.max(0, hp) / Math.max(1, full)), barH, barH / 2); c.fill();
    tallyAt(c, x, by - barH * 1.4, Math.max(13, cam.h * 0.06 * s), hp, '#FECDD3');
  }

  /** The keep at the end of the course. Its flags are the king's until he
      falls, and yours after. */
  function castle(c, cam, d, ours) {
    const s = cam.s(d), yb = cam.y(d);
    const x0 = cam.x(-1.25, d), x1 = cam.x(1.25, d);
    const wallH = cam.h * 0.34 * s;
    c.fillStyle = '#8E99A8';
    c.fillRect(x0, yb - wallH, x1 - x0, wallH);
    c.fillStyle = '#A7B2C0';
    for (let i = 0; i < 9; i++) {
      const bw = (x1 - x0) / 9;
      c.fillRect(x0 + i * bw, yb - wallH - wallH * 0.16, bw * 0.62, wallH * 0.16);
    }
    for (const side of [-1, 1]) {
      const tx = cam.x(side * 1.05, d);
      c.fillStyle = '#76818F';
      c.fillRect(tx - wallH * 0.16, yb - wallH * 1.35, wallH * 0.32, wallH * 1.35);
      c.fillStyle = ours ? MINE : '#F43F5E';
      c.beginPath();
      c.moveTo(tx, yb - wallH * 1.7);
      c.lineTo(tx + wallH * 0.3, yb - wallH * 1.58);
      c.lineTo(tx, yb - wallH * 1.46);
      c.closePath(); c.fill();
      c.fillStyle = '#C8D2DE';
      c.fillRect(tx - wallH * 0.02, yb - wallH * 1.72, wallH * 0.04, wallH * 0.42);
    }
    c.fillStyle = '#3B4452';
    const gw = (x1 - x0) * 0.22;
    rr(c, (x0 + x1) / 2 - gw / 2, yb - wallH * 0.78, gw, wallH * 0.78, gw * 0.5);
    c.fill();
  }

  /** Confetti over a taken keep, placed by hash and moved by the tick, so it
      is the same shower every time and needs no state. */
  const CONFETTI = ['#3F8EF7', '#F6B32B', '#2DC44E', '#EF4444', '#FFFFFF', '#A78BFA'];
  function confetti(c, cam, tick) {
    for (let i = 0; i < 60; i++) {
      const x = hash(i, 11) * cam.w + Math.sin(tick * 0.07 + i) * cam.w * 0.02;
      const fall = cam.h * (0.25 + hash(i, 12) * 0.6);
      const y = -cam.h * 0.1 + ((tick * (2 + hash(i, 13) * 2.5) + hash(i, 14) * cam.h) % (fall + cam.h * 0.1));
      const sz = Math.max(3, cam.h * 0.012);
      c.save();
      c.translate(x, y);
      c.rotate(tick * 0.1 + i);
      c.fillStyle = CONFETTI[i % CONFETTI.length];
      c.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
      c.restore();
    }
  }

  /* ------------------------------------------------------ coins and shop */

  /* What a player has saved and bought, kept between runs. Sealed like the
     profile, so a number typed into devtools is dropped on the next read, and
     rebuilt on every read like every other store. */
  const META = 'crowd.meta';
  const MAX_COINS = 1e9;
  PV.Store.validate(META, v => {
    const m = PV.Safe.obj(v);
    if (!m) return undefined;
    return {
      coins: PV.Safe.int(m.coins, 0, MAX_COINS, 0),
      start: PV.Safe.int(m.start, 0, PV.CrowdRush.BOOSTS.start.max, 0),
      gate: PV.Safe.int(m.gate, 0, PV.CrowdRush.BOOSTS.gate.max, 0),
      // The level you are on. A record from before levels has none: level 1.
      level: PV.Safe.int(m.level, 1, PV.CrowdCourse.MAX_LEVEL, 1)
    };
  });
  const loadMeta = () => PV.Store.get(META, null) || { coins: 0, start: 0, gate: 0, level: 1 };

  /** A gold coin, for the canvas. */
  function coin(c, x, y, r) {
    c.fillStyle = '#C98A0B';
    c.beginPath(); c.arc(x, y + r * 0.12, r, 0, TAU); c.fill();
    c.fillStyle = '#F6B32B';
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#FFE58A';
    c.beginPath(); c.arc(x - r * 0.28, y - r * 0.28, r * 0.34, 0, TAU); c.fill();
  }

  /** A level's number in a disc, for the ends of the progress bar. */
  function badge(c, x, y, r, n, fill, ink) {
    c.fillStyle = 'rgba(12,20,32,.35)';
    c.beginPath(); c.arc(x, y + r * 0.12, r, 0, TAU); c.fill();
    c.fillStyle = fill;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    const s = String(n);
    c.fillStyle = ink;
    c.font = '800 ' + (r * (s.length > 3 ? 0.62 : (s.length > 2 ? 0.8 : 1.05))).toFixed(1) + 'px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(s, x, y + r * 0.06);
  }

  /* ------------------------------------------------------------ the view */

  PV.CrowdRushView = function (ctx) {
    const opts = ctx.opts || {};
    const courseKey = PV.CrowdCourse.COURSES[opts.course] ? opts.course : 'fields';
    const def = PV.CrowdCourse.COURSES[courseKey];
    const diffKey = PV.CrowdRush.DIFFS[opts.difficulty] ? opts.difficulty : 'normal';
    // A race is the same course for everyone: nobody brings upgrades to it,
    // and nobody waits at the line while the others run.
    const racing = !!ctx.race;
    const meta = loadMeta();
    // Levels, unless free run was picked. Never in a race: everyone's level
    // is their own, and a race needs one course for all of them.
    const levels = !racing && opts.play !== 'free';

    let ui = null, countEl, beatEl, goneEl, whereEl, shopEl = null;
    let shopOpen = null;             // the state the shop was last painted in

    /* Puffs where two crowds meet, one per runner lost, drawn and aged per
       frame: they are decoration, and the engine never hears of them. */
    let puffs = [], foe = null, foeN = 0, puffSeq = 0;

    function onMove(e) {
      if (!ui) return;
      const rect = ui.canvas.getBoundingClientRect();
      if (!rect.width) return;
      const lane = ((e.clientX - rect.left) - rect.width / 2) / (rect.width * 0.44);
      ui.input({ lane: Math.max(-1, Math.min(1, lane)) });
    }
    // A press both steers and, at the start line, starts the run.
    function onDown(e) { onMove(e); if (ui) ui.input('go'); }

    function saveMeta() { PV.Store.set(META, meta); }

    /** Where this run is: a level and its scenery, or a course and a difficulty. */
    function whereText(game) {
      if (game.level) return t('crowd.level', { n: game.level }) + ' · ' + t('crowd.' + game.courseKey);
      return t('crowd.' + courseKey) + ' ' + '★'.repeat(def.tier) + ' · ' + t('diff.' + diffKey);
    }

    function buy(kind) {
      const game = ui && ui.game;
      if (!game || !game.ready) return;
      const level = meta[kind], cost = PV.CrowdRush.boostCost(kind, level);
      if (level >= PV.CrowdRush.BOOSTS[kind].max || meta.coins < cost) return;
      meta.coins -= cost;
      meta[kind] = level + 1;
      saveMeta();
      game.setBoost(meta);
      paintShop();
      ui.draw();
    }

    /** The upgrades, in the side panel: open at the start line only. */
    function paintShop() {
      if (!shopEl) return;
      const game = ui && ui.game;
      shopOpen = !!(game && game.ready);
      PV.clear(shopEl);
      shopEl.appendChild(PV.el('div', { class: 'shop-head' },
        PV.el('span', { class: 'k' }, t('crowd.shop')),
        PV.el('b', {}, PV.el('span', { class: 'coin' }), PV.fmtNum(meta.coins))));
      [['start', 'crowd.upStart', 'crowd.upStartFx', l => l * PV.CrowdRush.BOOSTS.start.per],
        ['gate', 'crowd.upGate', 'crowd.upGateFx', l => l * PV.CrowdRush.BOOSTS.gate.per]]
        .forEach(([kind, name, fx, amount]) => {
          const level = meta[kind];
          const top = level >= PV.CrowdRush.BOOSTS[kind].max;
          const cost = PV.CrowdRush.boostCost(kind, level);
          shopEl.appendChild(PV.el('div', { class: 'up-row' },
            PV.el('span', { class: 'nm' }, t(name) + ' · ' + t('crowd.lv', { n: level })),
            PV.el('button', {
              class: 'btn primary small-btn',
              disabled: !shopOpen || top || meta.coins < cost,
              onclick: () => buy(kind)
            }, top ? t('crowd.max') : PV.el('span', {}, PV.el('span', { class: 'coin' }), PV.fmtNum(cost))),
            // What the NEXT level would make it; at the top, what it is.
            PV.el('span', { class: 'fx' }, t(fx, { n: amount(top ? level : level + 1) }))));
        });
      if (!shopOpen) shopEl.appendChild(PV.el('p', { class: 'fx' }, t('crowd.shopLater')));
    }

    /** Coins for a finished run, paid once however often the outcome is read. */
    function pay(game) {
      if (game.paid != null) return game.paid;
      game.paid = game.coins;
      meta.coins = Math.min(MAX_COINS, meta.coins + game.paid);
      saveMeta();
      paintShop();
      return game.paid;
    }

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right',
        A: 'left', D: 'right', ' ': 'go', Enter: 'go'
      },
      sustained: ['left', 'right'],
      pad: [{ label: '\u25C0', action: 'left' }, { label: '\u25B6', action: 'right' }],
      padCols: 2,
      pct: game => Math.min(1, game.dist / game.course.length),

      // A level is always played from its own seed, so a lost level comes
      // back exactly as it was. Winning moves meta.level on (see outcome), so
      // the button after a win builds the next one.
      create: () => (levels
        ? new PV.CrowdRush({ seed: PV.CrowdCourse.seedFor(meta.level), level: meta.level, boost: meta })
        : new PV.CrowdRush({
          seed: ctx.seed(), course: courseKey, difficulty: diffKey,
          autostart: racing, boost: racing ? null : meta
        })),

      onReset(game) {
        puffs = []; foe = null; shopOpen = null;
        if (whereEl) whereEl.textContent = whereText(game);
      },

      fit(availW, availH) {
        let w = Math.max(280, Math.min(availW, 760));
        if (w * 0.78 > availH) w = Math.max(280, availH / 0.78);
        return { w: w, h: w * 0.78 };
      },

      build(api) {
        ui = api;
        countEl = PV.el('b', {}, String(PV.CrowdRush.DIFFS[diffKey].start));
        beatEl = PV.el('b', {}, '0');
        goneEl = PV.el('b', {}, '0%');
        api.side.appendChild(PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('crowd.count')), countEl,
          PV.el('span', { class: 'k' }, t('crowd.beaten')), beatEl,
          PV.el('span', { class: 'k' }, t('crowd.run')), goneEl));
        whereEl = PV.el('div', { class: 'muted small td-where' });
        api.side.appendChild(whereEl);
        if (!racing) {
          shopEl = PV.el('div', { class: 'panel-mini crowd-shop' });
          api.side.appendChild(shopEl);
        }
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('crowd.hint')));
        api.canvas.addEventListener('pointermove', onMove);
        api.canvas.addEventListener('pointerdown', onDown);
      },

      onDestroy() {
        if (!ui) return;
        ui.canvas.removeEventListener('pointermove', onMove);
        ui.canvas.removeEventListener('pointerdown', onDown);
      },

      onRelabel() { paintShop(); },

      onFrame(game) {
        countEl.textContent = PV.fmtNum(game.n);
        beatEl.textContent = PV.fmtNum(game.beaten);
        goneEl.textContent = Math.round(Math.min(1, game.dist / game.course.length) * 100) + '%';
        // The shop opens and closes with the start line.
        if (shopEl && shopOpen !== game.ready) paintShop();
      },

      draw(c, game, geom) {
        const cam = camera(geom);
        // The game's own course: a level picks its scenery from its number.
        const th = THEMES[game.courseKey] || THEMES.fields;
        ground(c, cam, th, game.dist);

        // A fight is drawn just past the front of YOUR crowd, wherever that
        // is: a big crowd is deep, and a rival drawn at a fixed distance
        // would stand inside it.
        const meet = depthOf(game.width) + 0.35;
        const fightingKing = !!(game.clash && game.clash.kind === 'castle');
        const won = game.phase === 'won';
        const walk = won ? game.victory / PV.CrowdRush.VICTORY : 0;
        let gateLine = null;

        const list = game.course.features;
        for (let i = list.length - 1; i >= 0; i--) {
          const f = list[i];
          const d = f.at - game.dist;
          if (f.kind === 'castle') {
            // The keep stands back from where the king meets you, and he
            // walks out of its gate to do it.
            const wall = d + 6;
            if (wall > FAR + 6) continue;
            castle(c, cam, wall, won);
            gateLine = wall - 0.2;
            const at = approach(d, d + 4.5, meet);
            const kd = (fightingKing || won) ? meet + (won ? walk * 2 : 0) : at.d;
            const hp = fightingKing ? game.clash.n : (won ? 0 : f.n);
            king(c, cam, kd, hp, f.n, game.tick, fightingKing, won ? game.victory : -1);
            continue;
          }
          if (d > FAR || d < -2) continue;
          if (f.kind === 'gates') gateWall(c, cam, f, game.dist);
          else if (f.kind === 'rivals') {
            if (i < game.at) continue;       // met already: the fight is drawn below
            const at = approach(d, d, meet);
            const rw = Math.min(1.4, PV.CrowdRush.widthOf(f.n));
            crowd(c, cam, f.n, 0, at.d, rw, game.tick, RED, 31 + i, at.pace);
            tally(c, cam, f.n, 0, at.d + depthOf(rw), '#FECDD3');
          } else hazard(c, cam, f, game.dist, game.tick);
        }

        // The crowd being fought right now, pressed up against yours.
        if (game.clash && !fightingKing) {
          const rw = Math.min(1.4, PV.CrowdRush.widthOf(game.clash.n));
          crowd(c, cam, game.clash.n, 0, meet, rw, game.tick, RED, 5, 1.2);
          tally(c, cam, game.clash.n, 0, meet + depthOf(rw), '#FECDD3');
        }

        // Every runner lost in a fight goes up in a puff where the sides meet.
        if (game.clash) {
          if (foe === game.clash && game.clash.n < foeN) {
            const span = Math.min(game.width, PV.CrowdRush.widthOf(game.clash.n)) / 2;
            for (let k = Math.min(6, foeN - game.clash.n); k > 0; k--) {
              puffSeq++;
              puffs.push({
                x: (fightingKing ? 0 : game.x * 0.5) + (hash(puffSeq, 3) - 0.5) * 2 * span,
                d: meet - 0.2 + hash(puffSeq, 4) * 0.4, life: 18
              });
            }
          }
          foe = game.clash; foeN = game.clash.n;
        } else foe = null;
        for (let k = puffs.length - 1; k >= 0; k--) {
          const p = puffs[k];
          const age = 1 - p.life / 18, r = cam.h * 0.022 * cam.s(p.d) * (0.6 + age * 1.4);
          c.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - age)).toFixed(3) + ')';
          c.beginPath(); c.arc(cam.x(p.x, p.d), cam.y(p.d) - r, r, 0, TAU); c.fill();
          if (--p.life <= 0) puffs.splice(k, 1);
        }

        // Your crowd. After the king falls it closes up and pours in through
        // the gate: anyone past the gate line is inside, and not drawn.
        const pace = game.ready ? 0 : 1;
        crowd(c, cam, game.n, game.x, won ? walk * Math.max(0, (gateLine || 6) - 1) : 0,
          game.width, game.tick, BLUE, 1, pace, won ? gateLine : null);
        if (!won) tally(c, cam, game.n, game.x, 0, '#DBEAFE');
        if (won) confetti(c, cam, game.victory);

        for (const p of game.pops) {
          const k = 1 - p.life / 48;
          c.globalAlpha = Math.max(0, 1 - k * 1.1);
          const size = Math.max(12, cam.h * 0.046);
          c.font = '800 ' + size.toFixed(1) + 'px system-ui, sans-serif';
          c.textAlign = 'center';
          const px = cam.x(p.x, 0), py = cam.yBase - cam.h * (0.24 + k * 0.16);
          c.lineWidth = size * 0.30;
          c.lineJoin = 'round';
          c.strokeStyle = 'rgba(255,255,255,.92)';        // a halo, for a white road
          c.strokeText(p.text, px, py);
          c.fillStyle = p.tone === 'bad' ? '#DC2626' : (p.tone === 'win' ? '#B45309' : '#15A34A');
          c.fillText(p.text, px, py);
          c.globalAlpha = 1;
        }

        // How far along the course you are, with the keep at the end of it.
        const bw = cam.w * 0.62, bx = (cam.w - bw) / 2, by = cam.h * 0.045, bh = Math.max(6, cam.h * 0.018);
        c.fillStyle = 'rgba(255,255,255,.55)';
        rr(c, bx - 2, by - 2, bw + 4, bh + 4, (bh + 4) / 2); c.fill();
        c.fillStyle = 'rgba(31,58,84,.28)';
        rr(c, bx, by, bw, bh, bh / 2); c.fill();
        c.fillStyle = '#F6B32B';
        rr(c, bx, by, Math.max(bh, bw * Math.min(1, game.dist / game.course.length)), bh, bh / 2);
        c.fill();
        if (game.level) {
          // On a level, the bar runs from this level's number to the next's.
          const r = Math.max(9, bh * 1.35), cy = by + bh / 2;
          badge(c, bx - r * 0.35, cy, r, game.level, '#F6B32B', '#3A2600');
          badge(c, bx + bw + r * 0.35, cy, r, game.level + 1,
            won ? '#F6B32B' : '#FFFFFF', won ? '#3A2600' : '#1F2430');
        } else {
          // The keep, at the end of the bar.
          c.fillStyle = '#2C3440';
          c.fillRect(bx + bw - bh * 0.1, by - bh * 0.7, Math.max(2, bh * 0.28), bh * 2.4);
          c.fillStyle = won ? MINE : '#EF4444';
          c.beginPath();
          c.moveTo(bx + bw + bh * 0.16, by - bh * 0.7);
          c.lineTo(bx + bw + bh * 1.1, by - bh * 0.25);
          c.lineTo(bx + bw + bh * 0.16, by + bh * 0.2);
          c.closePath(); c.fill();
        }

        // Coins in hand, top right under the bar. Not in a race: nothing
        // bought with them comes along.
        if (!racing) {
          const cs = Math.max(13, cam.h * 0.042), label = PV.fmtNum(meta.coins);
          c.font = '800 ' + cs.toFixed(1) + 'px system-ui, sans-serif';
          const tw = c.measureText(label).width;
          const pw = tw + cs * 2.1, ph = cs * 1.55;
          const px = cam.w - pw - cam.w * 0.03, py = by + bh + cam.h * 0.03;
          c.fillStyle = 'rgba(12,20,32,.45)';
          rr(c, px, py, pw, ph, ph / 2); c.fill();
          coin(c, px + ph / 2, py + ph / 2, cs * 0.46);
          c.textAlign = 'left';
          c.textBaseline = 'middle';
          c.fillStyle = '#FFFFFF';
          c.fillText(label, px + ph * 0.95, py + ph / 2 + 1);
        }

        // At the start line: the crowd stands, and the screen says how to go.
        if (game.ready) {
          // Up in the sky, clear of the first gate's numbers.
          if (game.level) {
            tallyAt(c, cam.cx, cam.h * 0.19, Math.max(16, cam.h * 0.06),
              t('crowd.level', { n: game.level }), '#FFE58A');
          }
          const pulse = 1 + Math.sin(game.tick * 0.12) * 0.05;
          tallyAt(c, cam.cx, cam.h * 0.47, Math.max(20, cam.h * 0.075) * pulse,
            t('crowd.tapToRun'), '#FFFFFF');
          tallyAt(c, cam.cx, cam.h * 0.55, Math.max(12, cam.h * 0.036),
            '◀  ' + t('crowd.drag') + '  ▶', '#FFFFFF');
        }
      },

      outcome(game) {
        const won = game.overReason === 'stormed';
        const coins = pay(game);
        const lv = game.level;
        // A won level moves you on to the next, once however often this is
        // read. Lost, you stay, and the same level comes back.
        if (lv && won && !game.advanced) {
          game.advanced = true;
          if (meta.level === lv) {
            meta.level = Math.min(PV.CrowdCourse.MAX_LEVEL, lv + 1);
            saveMeta();
          }
        }
        return {
          result: won ? 'win' : 'lose',
          score: game.score,
          xp: Math.round((won ? 130 : Math.max(10, Math.round(game.dist / 6))) * game.diff.xp),
          tone: won ? 'good' : 'bad',
          title: lv ? t(won ? 'crowd.levelDone' : 'crowd.levelFailed', { n: lv })
            : (won ? t('crowd.stormed') : t('crowd.routed')),
          againLabel: lv ? (won ? t('crowd.nextLevel') : t('common.retry')) : undefined,
          lines: [
            lv ? whereText(game) : t('crowd.' + game.courseKey) + ' \u00B7 ' + t('diff.' + game.diff.key),
            t('crowd.count') + ': ' + PV.fmtNum(game.n) + ' \u00B7 ' + t('crowd.peak') + ': ' + PV.fmtNum(game.peak),
            t('crowd.beaten') + ': ' + PV.fmtNum(game.beaten) + ' \u00B7 ' + t('crowd.lost') + ': ' + PV.fmtNum(game.lost),
            t('crowd.earned', { n: PV.fmtNum(coins) }),
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
