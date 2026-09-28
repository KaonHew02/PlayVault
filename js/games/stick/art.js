/* 火柴人对决 / Stick Clash — the pictures.

   Every fighter is the same eleven-bone stick figure, posed by angles and
   drawn with two strokes — a dark outline, then its colour — so it reads
   on any stage. What tells them apart is a colour, a hat and a weapon.

   A POSE is a handful of angles in degrees, in the fighter's own frame
   (facing right, y up, feet on the floor):
     t, h      torso lean from upright (forward is +), head tilt
     a, ae     front arm: upper arm from hanging straight down (forward +),
               then the forearm relative to it; b, be the back arm
     f, fe     front leg: thigh from straight down, shin relative (a bent
               knee is negative); k, ke the back leg
     w         the weapon's angle off the front forearm
     rot       the whole body turned (lying down, tumbling)
   On the ground the lower foot is put on the floor; in the air the hips
   are where the engine says the fighter is.

   An attack is drawn from its `anim`: a wind-up pose and a strike pose.
   The body eases into the wind-up over the startup, snaps to the strike as
   the move goes active, and eases back to its stance over the recovery —
   so every move in data.js animates without a frame drawn by hand.

   The stages are drawn from shapes each frame: a sky, two layers of
   distance that slide slower than the floor, and the floor. Nothing
   random is drawn — a window is lit or not by a hash of where it is — so
   a stage looks the same every frame. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.StickData;
  const RAD = Math.PI / 180;
  const LEN = { torso: 50, shoulder: 46, neck: 15, head: 12, upper: 29, fore: 27, thigh: 40, shin: 40 };
  const LINE = 5.6, OUTLINE = 9.5;

  /* ---------------------------------------------------------- poses */

  const STANCE = { t: 8, h: 0, a: 38, ae: 102, b: 18, be: 112, f: 24, fe: -20, k: -20, ke: -12, w: 0, rot: 0 };

  function P(o) { return Object.assign({}, STANCE, o); }

  const POSE = {
    stance: STANCE,
    block: P({ t: -6, h: -8, a: 62, ae: 112, b: 50, be: 118, f: 30, fe: -40, k: -26, ke: -26, w: -30 }),
    hurt: P({ t: -24, h: -18, a: -10, ae: 40, b: -36, be: 30, f: 12, fe: -10, k: -22, ke: -8, w: -40 }),
    airHurt: P({ t: -34, h: -20, a: 150, ae: 20, b: 130, be: 30, f: 36, fe: -50, k: -8, ke: -52, w: 0 }),
    down: P({ t: 0, h: 10, a: 170, ae: 10, b: 150, be: 20, f: 6, fe: -4, k: -4, ke: -6, rot: -88, w: 20 }),
    jump: P({ t: 6, a: 120, ae: 40, b: 100, be: 50, f: 72, fe: -100, k: 12, ke: -104 }),
    fall: P({ t: 2, a: 100, ae: 50, b: 80, be: 60, f: 34, fe: -40, k: -14, ke: -44 }),
    land: P({ t: 18, a: 50, ae: 80, b: 30, be: 90, f: 50, fe: -80, k: -10, ke: -70 }),
    win: P({ t: -4, h: -10, a: 172, ae: 4, b: 20, be: 100, f: 14, fe: -6, k: -12, ke: -4, w: -8 }),
    lose: P({ t: 30, h: 22, a: 6, ae: 10, b: -6, be: 10, f: 20, fe: -30, k: -14, ke: -20, w: -170 }),
    burst: P({ t: -10, h: -6, a: 130, ae: -10, b: -130, be: 10, f: 34, fe: -10, k: -34, ke: -10 }),
    intro: P({ t: 2, a: 30, ae: 90, b: 14, be: 100, f: 16, fe: -10, k: -14, ke: -6 })
  };

  /* An attack's two key poses. `air` ones are drawn on the jump pose. */
  const ANIM = {
    jab: { wind: { a: 60, ae: 30, t: 4 }, hit: { a: 90, ae: 2, b: 10, be: 100, t: 16, f: 30, k: -26 } },
    cross: { wind: { b: -20, be: 70, t: 0, a: 50, ae: 90 }, hit: { b: 90, be: 0, a: 30, ae: 110, t: 22, f: 32, fe: -30, k: -30 } },
    kick: { wind: { f: 76, fe: -100, t: -6, a: 60, b: 0 }, hit: { f: 90, fe: 0, t: -20, k: -4, ke: -4, a: 30, ae: 60, b: -30 } },
    round: { wind: { f: 60, fe: -110, t: -12, a: 50 }, hit: { f: 122, fe: -4, t: -32, k: 6, ke: -2, a: -20, ae: 70, b: 50 } },
    slashA: { wind: { a: 168, ae: 26, t: -8, b: 10, w: 0 }, hit: { a: 72, ae: 8, t: 22, f: 34, fe: -30, k: -30, b: -20, w: 0 } },
    slashB: { wind: { a: 8, ae: -26, t: 16, w: 10 }, hit: { a: 132, ae: 16, t: -10, f: 26, k: -26, w: 0 } },
    overhead: { wind: { a: 176, ae: 20, b: 150, be: 30, t: -12 }, hit: { a: 98, ae: -12, b: 90, be: 0, t: 30, f: 40, fe: -40, k: -30, w: 0 } },
    thrust: { wind: { a: 34, ae: -70, t: -6, w: 70 }, hit: { a: 90, ae: 0, t: 22, f: 44, fe: -34, k: -38, ke: -4, b: 60, be: 30, w: 0 } },
    upper: { wind: { t: 18, a: 22, ae: 20, f: 54, fe: -86, k: -8, ke: -64 }, hit: { t: -12, h: -12, a: 176, ae: 0, f: 12, fe: -4, k: -12, ke: -2, w: 0 } },
    rise: { wind: { t: 20, a: 10, ae: -10, f: 56, fe: -90, k: -6, ke: -70 }, hit: { t: -14, a: 170, ae: 6, b: 40, f: 30, fe: -60, k: -20, ke: -10, w: 0 } },
    airkick: { air: true, wind: { f: 84, fe: -116, k: -20, ke: -60, t: 4 }, hit: { f: 42, fe: 0, k: -30, ke: -96, t: -16, a: 120, b: 150 } },
    airslash: { air: true, wind: { a: 172, ae: 12, t: -10 }, hit: { a: 60, ae: -12, t: 24, w: 0 } },
    throw: { wind: { a: -44, ae: 70, t: -10, b: 60, be: 40 }, hit: { a: 96, ae: 0, t: 18, b: -20, be: 20, f: 32, k: -28 } },
    cast: { wind: { a: 40, ae: 70, b: 44, be: 70, t: -6 }, hit: { a: 90, ae: 0, b: 86, be: 0, t: 12, f: 30, k: -26 } },
    dash: { wind: { t: 26, a: -30, ae: 30, b: -40, be: 30, f: 40, fe: -70, k: -30, ke: -40 }, hit: { t: 42, a: 96, ae: 0, b: -50, be: 20, f: 56, fe: -46, k: -56, ke: -20, w: 0 } },
    knee: { wind: { t: 6, a: 40, b: -10 }, hit: { f: 104, fe: -126, k: -34, ke: -24, a: 20, ae: 90, b: -30, be: 60, t: -12 } },
    spin: { wind: { a: -60, ae: 20, b: 60, be: 20, t: 6 }, hit: { a: 92, ae: 0, b: -92, be: 0, t: 0, f: 40, fe: -20, k: -40, ke: -20, w: 0 }, spin: true },
    slam: { wind: { a: 176, ae: 8, b: 176, be: 8, t: -16, f: 20, k: -10 }, hit: { a: 104, ae: 0, b: 100, be: 0, t: 42, f: 60, fe: -96, k: -24, ke: -70, w: 0 } }
  };

  /* Flurries: two poses traded while an ultimate holds its target. */
  const FLURRY = {
    flurry: [ANIM.jab.hit, ANIM.cross.hit],
    cuts: [ANIM.slashA.hit, ANIM.slashB.hit],
    reap: [ANIM.cast.hit, ANIM.cast.wind],
    pound: [ANIM.slam.wind, ANIM.slam.hit],
    shadows: [ANIM.jab.hit, ANIM.round.hit],
    storm: [ANIM.cast.hit, POSE.win],
    thrusts: [ANIM.thrust.hit, ANIM.thrust.wind],
    inferno: [ANIM.cast.hit, ANIM.slam.wind]
  };

  /* Where each weapon sits in the hand, off the forearm. */
  const WBASE = { fists: 0, sword: -12, scythe: -6, hammer: -8, daggers: 0, staff: 40, spear: -52, claws: 0 };

  const ease = k => k * k * (3 - 2 * k);
  const easeOut = k => 1 - (1 - k) * (1 - k);
  function mix(p, q, k) {
    const o = {};
    for (const key in STANCE) o[key] = p[key] + (q[key] - p[key]) * k;
    return o;
  }

  /** The pose a fighter is in right now. */
  function poseOf(f, g) {
    const st = f.st;
    switch (f.state) {
      case 'lobby': case 'intro': {
        const k = Math.min(1, st / 50);
        const p = mix(POSE.intro, STANCE, ease(k));
        p.t += Math.sin(st * 0.07) * 1.6;
        return p;
      }
      case 'idle': {
        const p = P({});
        const s = Math.sin(st * 0.075);
        p.t += s * 2; p.a += s * 3; p.b += s * 3; p.fe += s * 3; p.ke += s * 3;
        return p;
      }
      case 'walk': {
        const back = Math.sign(f.vx || 1) !== f.dir;
        const ph = st * 0.24 * (back ? -1 : 1);
        const s = Math.sin(ph), c = Math.cos(ph);
        return P({
          t: back ? 2 : 12,
          f: 22 + 26 * s, fe: -20 - Math.max(0, 34 * c),
          k: -18 - 26 * s, ke: -20 - Math.max(0, -34 * c),
          a: 40 - 8 * s, b: 20 + 8 * s
        });
      }
      case 'block': return POSE.block;
      case 'land': return mix(POSE.land, STANCE, Math.min(1, st / 4));
      case 'jump': case 'fall': {
        const k = Math.max(0, Math.min(1, (6 - f.vy) / 12));
        return mix(POSE.jump, POSE.fall, k);
      }
      case 'hit': case 'held': {
        if (f.air) {
          const p = mix(POSE.airHurt, POSE.airHurt, 0);
          if (f.launched) p.rot = Math.max(-150, -10 - st * 7);
          return p;
        }
        const p = P(POSE.hurt);
        if (f.state === 'held') { p.t += Math.sin(st * 1.3) * 6; p.h += Math.cos(st * 1.7) * 8; }
        return p;
      }
      case 'stun': {
        const p = P(POSE.hurt);
        p.t = -10 + Math.sin(st * 0.18) * 12;
        p.h = Math.sin(st * 0.18 + 1) * 14;
        p.a = 10; p.b = -10;
        return p;
      }
      case 'down': return POSE.down;
      case 'getup': return mix(POSE.down, STANCE, ease(Math.min(1, st / D.RULES.getupTicks)));
      case 'ko':
        if (f.air) { const p = P(POSE.airHurt); p.rot = Math.max(-170, -20 - st * 5); return p; }
        return POSE.down;
      case 'burst': return POSE.burst;
      case 'win': {
        const p = P(POSE.win);
        p.a += Math.sin(st * 0.15) * 6;
        return p;
      }
      case 'lose': return POSE.lose;
      case 'attack': return attackPose(f);
    }
    return STANCE;
  }

  function attackPose(f) {
    const m = f.mv;
    if (!m) return STANCE;
    if (f.lock && m.lock) {
      const pair = FLURRY[m.lock.anim] || FLURRY.flurry;
      const i = Math.floor(f.lock.t / Math.max(1, m.lock.every)) % 2;
      return P(pair[i]);
    }
    const A = ANIM[m.anim] || ANIM.jab;
    const base = A.air || f.air ? POSE.fall : STANCE;
    const wind = Object.assign({}, base, A.wind), hit = Object.assign({}, base, A.hit);
    const su = m.f[0], ac = m.f[1], re = m.f[2], t = f.mt;
    if (t <= su) return mix(base, wind, ease(Math.min(1, t / Math.max(1, Math.min(su, 14)))));
    if (t <= su + ac) return mix(wind, hit, easeOut(Math.min(1, (t - su) / Math.min(ac, 3))));
    return mix(hit, base, ease(Math.min(1, (t - su - ac) / Math.max(1, re))));
  }

  /** Whether the body is drawn turned around this tick (a spin). */
  function spinning(f) {
    const m = f.mv;
    if (f.state !== 'attack' || !m) return false;
    const A = ANIM[m.anim];
    if (!A || !A.spin) return false;
    const su = m.f[0], ac = m.f[1];
    return f.mt > su && f.mt <= su + ac && Math.floor((f.mt - su) / 3) % 2 === 1;
  }

  /* ------------------------------------------------------ skeleton */

  const dirv = a => ({ x: Math.sin(a * RAD), y: -Math.cos(a * RAD) });
  const upv = a => ({ x: Math.sin(a * RAD), y: Math.cos(a * RAD) });
  const add = (p, v, l) => ({ x: p.x + v.x * l, y: p.y + v.y * l });

  /** Joints in the fighter's frame (facing right, y up, feet at 0 on the ground). */
  function joints(p, onGround) {
    const hip = { x: 0, y: 0 };
    const td = upv(p.t);
    const neck = add(hip, td, LEN.torso);
    const sh = add(hip, td, LEN.shoulder);
    const head = add(neck, upv(p.t + p.h), LEN.neck);
    const fe = add(sh, dirv(p.a), LEN.upper), fh = add(fe, dirv(p.a + p.ae), LEN.fore);
    const be = add(sh, dirv(p.b), LEN.upper), bh = add(be, dirv(p.b + p.be), LEN.fore);
    const fk = add(hip, dirv(p.f), LEN.thigh), ff = add(fk, dirv(p.f + p.fe), LEN.shin);
    const kk = add(hip, dirv(p.k), LEN.thigh), kf = add(kk, dirv(p.k + p.ke), LEN.shin);
    const J = { hip: hip, neck: neck, sh: sh, head: head, fe: fe, fh: fh, be: be, bh: bh, fk: fk, ff: ff, kk: kk, kf: kf };
    if (p.rot) {
      const r = -p.rot * RAD, c = Math.cos(r), s = Math.sin(r);
      for (const k in J) { const q = J[k]; J[k] = { x: q.x * c - q.y * s, y: q.x * s + q.y * c }; }
    }
    let lift;
    if (onGround) {
      let low = Infinity;
      for (const k in J) low = Math.min(low, J[k].y - (k === 'head' ? LEN.head : 0));
      lift = -low;
      if (!p.rot) lift = -Math.min(J.ff.y, J.kf.y);
    } else lift = 88;
    for (const k in J) J[k].y += lift;
    J.foreA = p.a + p.ae;
    J.backA = p.b + p.be;
    return J;
  }

  /* ------------------------------------------------------- fighters */

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function colorOf(f) { return f.alt ? f.def.alt : f.def.color; }

  /**
   * Draw a fighter. `v` maps the world to the screen: { x(wx), y(wy), s }.
   * o: { alpha, ghost, glow, flash, noWeapon, t }
   */
  function drawFighter(c, f, v, x, y, o) {
    const opt = o || {};
    const def = f.def;
    const pose = opt.pose || poseOf(f);
    const ground = !f.air && f.state !== 'held';
    const J = joints(pose, ground);
    let dir = f.dir;
    if (spinning(f)) dir = -dir;
    const s = v.s;
    const X = px => v.x(x + px * dir), Y = py => v.y(y + py);
    const col = opt.ghost || colorOf(f);
    const back = opt.ghost || shade(col.charAt(0) === '#' ? col : '#888888', -0.32);
    c.save();
    c.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
    c.lineCap = 'round'; c.lineJoin = 'round';

    const seg = (pts, color, width) => {
      c.strokeStyle = color; c.lineWidth = width * s;
      c.beginPath();
      c.moveTo(X(pts[0].x), Y(pts[0].y));
      for (let i = 1; i < pts.length; i++) c.lineTo(X(pts[i].x), Y(pts[i].y));
      c.stroke();
    };
    const limb = (pts, color) => {
      if (!opt.ghost) seg(pts, 'rgba(8,10,16,.88)', OUTLINE);
      seg(pts, color, LINE);
    };

    if (opt.glow) { c.shadowColor = opt.glow; c.shadowBlur = 16 * s; }
    // Back limbs first, in shadow; then the body; then the front.
    const noW = opt.noWeapon;
    if (!noW && (def.weapon === 'daggers' || def.weapon === 'claws')) drawWeapon(c, def.weapon, J.bh, J.backA, X, Y, s, dir, back, opt, true);
    limb([J.sh, J.be, J.bh], back);
    limb([J.hip, J.kk, J.kf], back);
    limb([J.hip, J.neck], col);
    limb([J.hip, J.fk, J.ff], col);
    // Head.
    const hx = X(J.head.x), hy = Y(J.head.y), hr = LEN.head * s;
    if (!opt.ghost) {
      c.fillStyle = 'rgba(8,10,16,.88)';
      c.beginPath(); c.arc(hx, hy, hr + (OUTLINE - LINE) * 0.5 * s, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = col;
    c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fill();
    if (!opt.ghost) drawHat(c, def.hat, hx, hy, hr, s, dir, pose.t + pose.h + (pose.rot || 0), f, col, opt.t || 0);
    limb([J.sh, J.fe, J.fh], col);
    if (!noW) drawWeapon(c, def.weapon, J.fh, J.foreA + (WBASE[def.weapon] || 0) + (pose.w || 0), X, Y, s, dir, col, opt, false, pose.rot);
    if (opt.flash) {
      c.globalAlpha = opt.flash;
      c.shadowBlur = 0;
      limb([J.hip, J.neck], '#FFFFFF');
      c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    return { tip: weaponTip(def.weapon, J, pose, dir, x, y), head: { x: x + J.head.x * dir, y: y + J.head.y } };
  }

  /** Where the business end of the weapon is, in world units — for the trail. */
  function weaponTip(weapon, J, pose, dir, x, y) {
    const len = { fists: 6, sword: 64, scythe: 84, hammer: 58, daggers: 26, staff: 62, spear: 94, claws: 14 }[weapon] || 10;
    const a = (J.foreA + (WBASE[weapon] || 0) + (pose.w || 0) - (pose.rot || 0));
    const d = dirv(a);
    return { x: x + (J.fh.x + d.x * len) * dir, y: y + J.fh.y + d.y * len };
  }

  function drawWeapon(c, kind, hand, ang, X, Y, s, dir, col, opt, backHand, rot) {
    const a = ang - (rot || 0);
    const d = dirv(a), n = { x: -d.y, y: d.x };           // along, and across
    const P2 = (along, across) => ({ x: X(hand.x + d.x * along + n.x * across), y: Y(hand.y + d.y * along + n.y * across) });
    const line = (p, q, color, w) => { c.strokeStyle = color; c.lineWidth = w * s; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); };
    const dark = 'rgba(8,10,16,.9)';
    const steel = '#E4ECF5', wood = '#8A5A34';
    const glow = opt.hot ? opt.hot : null;
    c.save();
    if (glow) { c.shadowColor = glow; c.shadowBlur = 18 * s; }
    switch (kind) {
      case 'fists': case 'claws': {
        const h = { x: X(hand.x), y: Y(hand.y) };
        const r = (kind === 'claws' ? 8.5 : 6.4) * s;
        c.fillStyle = dark; c.beginPath(); c.arc(h.x, h.y, r + 2 * s, 0, Math.PI * 2); c.fill();
        c.fillStyle = kind === 'claws' ? '#2A2F3A' : col; c.beginPath(); c.arc(h.x, h.y, r, 0, Math.PI * 2); c.fill();
        if (kind === 'claws') {
          for (let i = -1; i <= 1; i++) line(P2(6, i * 4), P2(20, i * 6), steel, 2.4);
        }
        break;
      }
      case 'sword':
        line(P2(-12, 0), P2(64, 0), dark, 7);
        line(P2(0, 0), P2(64, 0), steel, 3.4);
        line(P2(-11, 0), P2(-1, 0), '#3A2A1E', 4.6);
        line(P2(0, -7), P2(0, 7), '#C8A04A', 4);
        break;
      case 'scythe': {
        line(P2(-22, 0), P2(70, 0), dark, 7.5);
        line(P2(-22, 0), P2(70, 0), '#3B3150', 4);
        const s0 = P2(68, 0), s1 = P2(84, -34 * dir * 0 - 30), s2 = P2(56, -52);
        c.fillStyle = dark;
        c.beginPath(); c.moveTo(s0.x, s0.y); c.quadraticCurveTo(s1.x, s1.y, s2.x, s2.y); c.lineTo(P2(64, -10).x, P2(64, -10).y); c.closePath(); c.fill();
        c.fillStyle = steel; c.strokeStyle = dark; c.lineWidth = 1.5 * s;
        c.beginPath(); c.moveTo(s0.x, s0.y); c.quadraticCurveTo(s1.x, s1.y, s2.x, s2.y); c.quadraticCurveTo(P2(72, -22).x, P2(72, -22).y, P2(66, -6).x, P2(66, -6).y); c.closePath(); c.fill();
        break;
      }
      case 'hammer': {
        line(P2(-14, 0), P2(56, 0), dark, 7.5);
        line(P2(-14, 0), P2(56, 0), wood, 4);
        const q = [P2(46, -16), P2(68, -16), P2(68, 16), P2(46, 16)];
        c.fillStyle = dark; c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
        const r = [P2(48, -13), P2(66, -13), P2(66, 13), P2(48, 13)];
        c.fillStyle = '#7C8796'; c.beginPath(); r.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
        line(P2(48, -13), P2(48, 13), '#B8C2CF', 2);
        break;
      }
      case 'daggers':
        line(P2(-4, 0), P2(26, 0), dark, 6);
        line(P2(2, 0), P2(26, 0), steel, 3);
        line(P2(2, -5), P2(2, 5), '#C8A04A', 3);
        break;
      case 'staff': {
        line(P2(-42, 0), P2(62, 0), dark, 7);
        line(P2(-42, 0), P2(62, 0), '#6E4B8E', 3.8);
        const o = P2(66, 0);
        c.shadowColor = '#FFF06A'; c.shadowBlur = 14 * s;
        c.fillStyle = '#FFF4A8'; c.beginPath(); c.arc(o.x, o.y, 7 * s, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'spear': {
        line(P2(-40, 0), P2(84, 0), dark, 7);
        line(P2(-40, 0), P2(84, 0), wood, 3.6);
        const t0 = P2(80, -7), t1 = P2(104, 0), t2 = P2(80, 7);
        c.fillStyle = dark; c.beginPath(); c.moveTo(t0.x, t0.y); c.lineTo(t1.x, t1.y); c.lineTo(t2.x, t2.y); c.closePath(); c.fill();
        const u0 = P2(82, -5), u1 = P2(100, 0), u2 = P2(82, 5);
        c.fillStyle = steel; c.beginPath(); c.moveTo(u0.x, u0.y); c.lineTo(u1.x, u1.y); c.lineTo(u2.x, u2.y); c.closePath(); c.fill();
        line(P2(76, -4), P2(76, 4), '#D34B3E', 3);
        break;
      }
    }
    c.restore();
  }

  function drawHat(c, hat, hx, hy, r, s, dir, tilt, f, col, t) {
    c.save();
    c.translate(hx, hy);
    c.rotate(tilt * RAD * dir);
    c.scale(dir, 1);
    const dark = 'rgba(8,10,16,.9)';
    const trail = Math.max(-1, Math.min(1, -(f.vx || 0) * f.dir / 6));
    const flap = Math.sin(t * 0.25) * 0.25;
    switch (hat) {
      case 'band': {
        c.strokeStyle = '#E0413A'; c.lineWidth = 3.4 * s;
        c.beginPath(); c.arc(0, 0, r * 0.98, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
        c.lineWidth = 2.6 * s;
        c.beginPath(); c.moveTo(-r * 0.9, -r * 0.35); c.quadraticCurveTo(-r * 2, -r * (0.2 + flap), -r * (2.6 + trail), r * (0.2 + flap)); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.9, -r * 0.3); c.quadraticCurveTo(-r * 1.8, r * (0.2 - flap), -r * (2.3 + trail), r * (0.7 - flap)); c.stroke();
        break;
      }
      case 'spikes': {
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(-r * 0.9, -r * 0.3);
        c.lineTo(-r * 2.1, -r * 0.9); c.lineTo(-r * 0.6, -r * 0.8);
        c.lineTo(-r * 1.3, -r * 1.9); c.lineTo(-r * 0.1, -r * 1.05);
        c.lineTo(r * 0.1, -r * 1.9); c.lineTo(r * 0.6, -r * 0.8);
        c.lineTo(r * 0.9, -r * 0.4); c.closePath(); c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-r * 0.8, -r * 0.4);
        c.lineTo(-r * 1.8, -r * 0.9); c.lineTo(-r * 0.6, -r * 0.9);
        c.lineTo(-r * 1.1, -r * 1.7); c.lineTo(-r * 0.1, -r * 1.1);
        c.lineTo(r * 0.1, -r * 1.7); c.lineTo(r * 0.5, -r * 0.9);
        c.lineTo(r * 0.8, -r * 0.45); c.closePath(); c.fill();
        break;
      }
      case 'hood': {
        c.fillStyle = '#2B2140'; c.strokeStyle = dark; c.lineWidth = 2 * s;
        c.beginPath();
        c.moveTo(r * 1.05, r * 0.2);
        c.quadraticCurveTo(r * 1.1, -r * 1.3, -r * 0.2, -r * 1.35);
        c.quadraticCurveTo(-r * 1.9, -r * 1.2, -r * (2.4 + trail * 0.5), r * 0.5);
        c.quadraticCurveTo(-r * 1.2, r * 0.3, -r * 0.8, r * 1.1);
        c.quadraticCurveTo(r * 0.2, r * 0.9, r * 1.05, r * 0.2);
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#120C1E';
        c.beginPath(); c.ellipse(r * 0.35, r * 0.05, r * 0.62, r * 0.72, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#E6B8FF'; c.shadowColor = '#C86BFF'; c.shadowBlur = 8 * s;
        c.fillRect(r * 0.35, -r * 0.1, r * 0.34, r * 0.16);
        break;
      }
      case 'helmet': {
        c.fillStyle = dark;
        c.beginPath(); c.arc(0, -r * 0.05, r * 1.18, Math.PI, Math.PI * 2); c.fill();
        c.fillStyle = '#56606E';
        c.beginPath(); c.arc(0, -r * 0.08, r * 1.05, Math.PI, Math.PI * 2); c.fill();
        c.fillRect(-r * 1.25, -r * 0.2, r * 2.6, r * 0.32);
        c.fillStyle = '#FFB547'; c.fillRect(-r * 0.12, -r * 1.1, r * 0.24, r * 0.9);
        break;
      }
      case 'mask': {
        c.fillStyle = '#1E2A36';
        c.beginPath(); c.ellipse(r * 0.2, r * 0.3, r * 0.95, r * 0.55, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#1E6F8A'; c.lineWidth = 4 * s;
        const w = Math.sin(t * 0.3) * r * 0.3;
        c.beginPath(); c.moveTo(-r * 0.6, r * 0.8);
        c.bezierCurveTo(-r * 2, r * 0.9 + w, -r * 3, r * 0.2 - w, -r * (4 + trail * 1.5), r * 0.6 + w); c.stroke();
        c.fillStyle = '#5CF0FF'; c.fillRect(r * 0.3, -r * 0.25, r * 0.4, r * 0.14);
        break;
      }
      case 'wizard': {
        c.fillStyle = dark;
        c.beginPath(); c.moveTo(-r * 1.5, -r * 0.55); c.lineTo(r * 1.5, -r * 0.55);
        c.lineTo(r * 0.2, -r * 1.2); c.quadraticCurveTo(-r * 0.6, -r * 2.6, -r * (2 + trail * 0.4), -r * 2.9); c.quadraticCurveTo(-r * 0.9, -r * 1.8, -r * 0.8, -r * 1.1); c.closePath(); c.fill();
        c.fillStyle = '#3C2F7A';
        c.beginPath(); c.moveTo(-r * 1.3, -r * 0.65); c.lineTo(r * 1.3, -r * 0.65);
        c.lineTo(r * 0.1, -r * 1.2); c.quadraticCurveTo(-r * 0.6, -r * 2.4, -r * (1.8 + trail * 0.4), -r * 2.7); c.quadraticCurveTo(-r * 0.8, -r * 1.8, -r * 0.7, -r * 1.15); c.closePath(); c.fill();
        c.fillStyle = '#FFE14A'; c.beginPath(); c.arc(-r * 0.2, -r * 1.4, r * 0.18, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'straw': {
        c.fillStyle = dark;
        c.beginPath(); c.moveTo(-r * 2.3, -r * 0.2); c.lineTo(0, -r * 1.55); c.lineTo(r * 2.3, -r * 0.2); c.closePath(); c.fill();
        c.fillStyle = '#D9B864';
        c.beginPath(); c.moveTo(-r * 2.05, -r * 0.35); c.lineTo(0, -r * 1.38); c.lineTo(r * 2.05, -r * 0.35); c.closePath(); c.fill();
        c.strokeStyle = '#A8883F'; c.lineWidth = 1.2 * s;
        c.beginPath(); c.moveTo(-r * 1, -r * 0.55); c.lineTo(0, -r * 1.3); c.lineTo(r * 1, -r * 0.55); c.stroke();
        break;
      }
      case 'horns': {
        const horn = sx => {
          c.fillStyle = dark;
          c.beginPath(); c.moveTo(sx * r * 0.35, -r * 0.8); c.quadraticCurveTo(sx * r * 1.6, -r * 1.2, sx * r * 1.3, -r * 2.3);
          c.quadraticCurveTo(sx * r * 1.05, -r * 1.3, sx * r * 0.75, -r * 0.55); c.closePath(); c.fill();
          c.fillStyle = '#F2E6D0';
          c.beginPath(); c.moveTo(sx * r * 0.42, -r * 0.8); c.quadraticCurveTo(sx * r * 1.45, -r * 1.2, sx * r * 1.25, -r * 2.1);
          c.quadraticCurveTo(sx * r * 1.0, -r * 1.3, sx * r * 0.72, -r * 0.62); c.closePath(); c.fill();
        };
        horn(-1); horn(1);
        c.fillStyle = '#FFD24A'; c.shadowColor = '#FF3D2E'; c.shadowBlur = 8 * s;
        c.fillRect(r * 0.25, -r * 0.18, r * 0.42, r * 0.16);
        break;
      }
    }
    c.restore();
  }

  /* ---------------------------------------------------- thrown things */

  function drawProj(c, p, v, x, y, t) {
    const X = v.x(x), Y = v.y(y), s = v.s;
    const d = p.dir;
    c.save();
    switch (p.kind) {
      case 'ki': {
        const g = c.createRadialGradient(X, Y, 1, X, Y, 22 * s);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, '#9CC3FF'); g.addColorStop(1, 'rgba(80,140,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(X, Y, 22 * s, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(156,195,255,.35)';
        c.beginPath(); c.ellipse(X - d * 20 * s, Y, 22 * s, 8 * s, 0, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'wave': {
        c.strokeStyle = '#FFD8A8'; c.shadowColor = '#FF6A2E'; c.shadowBlur = 18 * s; c.lineWidth = 6 * s; c.lineCap = 'round';
        c.beginPath(); c.ellipse(X, Y, 16 * s, 38 * s, 0, d > 0 ? -Math.PI / 2 : Math.PI / 2, d > 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
        c.strokeStyle = 'rgba(255,120,60,.5)'; c.lineWidth = 12 * s;
        c.beginPath(); c.ellipse(X - d * 8 * s, Y, 14 * s, 34 * s, 0, d > 0 ? -Math.PI / 2 : Math.PI / 2, d > 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
        break;
      }
      case 'scythe': {
        const k = p.big ? 1.9 : 1;
        c.translate(X, Y); c.rotate(t * 0.45 * d); c.scale(k, k);
        c.strokeStyle = 'rgba(8,10,16,.9)'; c.lineWidth = 7 * s; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-30 * s, 0); c.lineTo(30 * s, 0); c.stroke();
        c.strokeStyle = '#3B3150'; c.lineWidth = 4 * s;
        c.beginPath(); c.moveTo(-30 * s, 0); c.lineTo(30 * s, 0); c.stroke();
        c.fillStyle = '#E4ECF5'; c.shadowColor = '#C86BFF'; c.shadowBlur = 14 * s;
        c.beginPath(); c.moveTo(28 * s, 0); c.quadraticCurveTo(40 * s, -30 * s, 6 * s, -40 * s); c.quadraticCurveTo(28 * s, -24 * s, 22 * s, -2 * s); c.closePath(); c.fill();
        break;
      }
      case 'quake': {
        const k = p.big ? 1.6 : 1;
        c.fillStyle = 'rgba(255,190,90,.9)'; c.shadowColor = '#FF9F2E'; c.shadowBlur = 16 * s;
        for (let i = 0; i < 4; i++) {
          const ox = (i - 1.5) * 13 * s * k, h = (18 + ((i * 7 + Math.floor(t / 3)) % 4) * 9) * s * k;
          c.beginPath(); c.moveTo(X + ox - 8 * s * k, v.y(0)); c.lineTo(X + ox, v.y(0) - h); c.lineTo(X + ox + 8 * s * k, v.y(0)); c.closePath(); c.fill();
        }
        c.fillStyle = 'rgba(120,90,60,.6)';
        c.beginPath(); c.ellipse(X, v.y(0), 34 * s * k, 7 * s, 0, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'star': {
        c.translate(X, Y); c.rotate(t * 0.6);
        c.fillStyle = '#DDE6F0'; c.strokeStyle = 'rgba(8,10,16,.9)'; c.lineWidth = 1.6 * s;
        c.beginPath();
        for (let i = 0; i < 8; i++) { const r = (i % 2 ? 3.5 : 11) * s, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill(); c.stroke();
        break;
      }
      case 'orb': {
        const r = 26 * s * (1 + Math.sin(t * 0.4) * 0.08);
        const g = c.createRadialGradient(X, Y, 2, X, Y, r);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.4, '#FFF06A'); g.addColorStop(1, 'rgba(255,220,60,0)');
        c.fillStyle = g; c.beginPath(); c.arc(X, Y, r, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#FFFBD0'; c.lineWidth = 2 * s;
        for (let i = 0; i < 3; i++) {
          const a = t * 0.3 + i * 2.1;
          c.beginPath(); c.moveTo(X, Y);
          c.lineTo(X + Math.cos(a) * r * 0.6, Y + Math.sin(a) * r * 0.5);
          c.lineTo(X + Math.cos(a + 0.4) * r, Y + Math.sin(a + 0.4) * r);
          c.stroke();
        }
        break;
      }
      case 'spear': {
        c.translate(X, Y); c.rotate(Math.atan2(-p.vy, p.vx) * 1);
        c.strokeStyle = 'rgba(8,10,16,.9)'; c.lineWidth = 7 * s; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-50 * s, 0); c.lineTo(40 * s, 0); c.stroke();
        c.strokeStyle = '#8A5A34'; c.lineWidth = 3.6 * s;
        c.beginPath(); c.moveTo(-50 * s, 0); c.lineTo(40 * s, 0); c.stroke();
        c.fillStyle = '#E4ECF5';
        c.beginPath(); c.moveTo(36 * s, -6 * s); c.lineTo(58 * s, 0); c.lineTo(36 * s, 6 * s); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(140,255,122,.4)'; c.lineWidth = 3 * s;
        c.beginPath(); c.moveTo(-50 * s, 0); c.lineTo(-90 * s, 0); c.stroke();
        break;
      }
      case 'fire': {
        const r = 20 * s;
        const g = c.createRadialGradient(X, Y, 1, X, Y, r * 1.4);
        g.addColorStop(0, '#FFF6C8'); g.addColorStop(0.35, '#FFB02E'); g.addColorStop(0.7, '#FF3D2E'); g.addColorStop(1, 'rgba(255,40,20,0)');
        c.fillStyle = g; c.beginPath(); c.arc(X, Y, r * 1.4, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'bolt': {
        const a = p.t < 3 ? 0.3 : Math.max(0, 1 - (p.t - 3) / 22);
        c.globalAlpha = a;
        const col = p.fire ? '#FF6A2E' : '#FFF06A';
        c.strokeStyle = '#FFFFFF'; c.shadowColor = col; c.shadowBlur = 30 * s; c.lineWidth = 7 * s; c.lineJoin = 'round';
        c.beginPath();
        let yy = v.y(420), xx = X;
        c.moveTo(xx, yy);
        for (let i = 0; i < 9; i++) { yy += (v.y(0) - v.y(420)) / 9; xx = X + (((i * 37 + p.id * 11) % 7) - 3) * 7 * s; c.lineTo(xx, yy); }
        c.stroke();
        c.strokeStyle = col; c.lineWidth = 16 * s; c.globalAlpha = a * 0.4; c.stroke();
        c.globalAlpha = a * 0.5;
        c.fillStyle = col; c.beginPath(); c.ellipse(X, v.y(0), 60 * s, 12 * s, 0, 0, Math.PI * 2); c.fill();
        break;
      }
    }
    c.restore();
  }

  /* ----------------------------------------------------------- stages */

  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  /**
   * The stage behind the fight. cam: { x (world centre), s (scale), floor (screen y of the floor) }.
   */
  function drawStage(c, key, cam, w, h, t) {
    const S = STAGE_ART[key] || STAGE_ART.dojo;
    S(c, cam, w, h, t);
  }

  /* Screen x of a world x on a layer that moves `k` as fast as the floor. */
  const lx = (cam, w, wx, k) => w / 2 + (wx - cam.x) * cam.s * k;

  function sky(c, w, h, stops) {
    const g = c.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  function floor(c, cam, w, h, top, bot, line, gap) {
    const fy = cam.floor;
    const g = c.createLinearGradient(0, fy, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    c.fillStyle = g; c.fillRect(0, fy, w, h - fy);
    if (!line) return;
    c.strokeStyle = line; c.lineWidth = 1;
    const step = (gap || 120) * cam.s;
    const x0 = lx(cam, w, 0, 1);
    for (let x = ((x0 % step) + step) % step - step; x < w + step; x += step) {
      c.beginPath(); c.moveTo(x, fy); c.lineTo(w / 2 + (x - w / 2) * 1.8, h); c.stroke();
    }
    c.beginPath(); c.moveTo(0, fy + 0.5); c.lineTo(w, fy + 0.5); c.stroke();
  }

  const STAGE_ART = {
    dojo(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#2A170E'], [0.6, '#4A2A17'], [1, '#2A170E']]);
      const fy = cam.floor, s = cam.s;
      // Back wall: sliding paper doors, lit from behind.
      const wallTop = fy - 330 * s;
      for (let i = -6; i < 20; i++) {
        const x0 = lx(cam, w, i * 150, 0.7), x1 = lx(cam, w, i * 150 + 150, 0.7);
        if (x1 < 0 || x0 > w) continue;
        c.fillStyle = i % 3 === 0 ? '#3A2213' : '#E9C98E';
        c.fillRect(x0, wallTop, x1 - x0, fy - wallTop);
        if (i % 3) {
          const g = c.createRadialGradient((x0 + x1) / 2, fy - 150 * s, 5, (x0 + x1) / 2, fy - 150 * s, 160 * s);
          g.addColorStop(0, 'rgba(255,220,150,.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
          c.fillStyle = g; c.fillRect(x0, wallTop, x1 - x0, fy - wallTop);
          c.strokeStyle = '#5A3620'; c.lineWidth = Math.max(1, 3 * s);
          for (let k = 1; k < 3; k++) { const xx = x0 + (x1 - x0) * k / 3; c.beginPath(); c.moveTo(xx, wallTop); c.lineTo(xx, fy); c.stroke(); }
          for (let k = 1; k < 5; k++) { const yy = wallTop + (fy - wallTop) * k / 5; c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
        }
      }
      c.fillStyle = '#2A170E'; c.fillRect(0, wallTop - 40 * s, w, 44 * s);
      // Lanterns on a rope.
      c.strokeStyle = '#1A0F08'; c.lineWidth = Math.max(1, 2 * s);
      c.beginPath(); c.moveTo(0, wallTop + 30 * s);
      for (let x = 0; x <= w; x += 20) c.lineTo(x, wallTop + 30 * s + Math.sin(x / w * Math.PI * 4 + cam.x * 0.002) * 10 * s);
      c.stroke();
      for (let i = -3; i < 12; i++) {
        const x = lx(cam, w, i * 260 + 60, 0.85);
        if (x < -40 || x > w + 40) continue;
        const y = wallTop + 58 * s + Math.sin(t * 0.03 + i) * 2 * s;
        c.shadowColor = '#FF5A2E'; c.shadowBlur = 22 * s;
        c.fillStyle = '#D8352A'; c.beginPath(); c.ellipse(x, y, 16 * s, 22 * s, 0, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = '#1A0F08'; c.fillRect(x - 9 * s, y - 25 * s, 18 * s, 5 * s); c.fillRect(x - 9 * s, y + 20 * s, 18 * s, 5 * s);
      }
      floor(c, cam, w, h, '#8C5A34', '#4A2A17', 'rgba(40,20,8,.45)', 90);
    },

    rooftop(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#070B22'], [0.55, '#1C1A4A'], [0.85, '#4A2A5E'], [1, '#1A1030']]);
      const fy = cam.floor, s = cam.s;
      c.fillStyle = '#FFF4D6'; c.shadowColor = '#FFE9A8'; c.shadowBlur = 40 * s;
      c.beginPath(); c.arc(lx(cam, w, 1000, 0.05), fy - 330 * s, 42 * s, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
      for (let i = 0; i < 40; i++) {
        const x = (hash(i, 3) * w * 1.3 - cam.x * cam.s * 0.02) % w, y = hash(i, 7) * (fy - 240 * s);
        c.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.5 * hash(i, 9)) + ')';
        c.fillRect((x + w) % w, y, 1.6, 1.6);
      }
      [[0.25, '#15183A', 90, 250], [0.5, '#0E1030', 130, 180]].forEach(([k, col, bw, base], L) => {
        for (let i = -8; i < 26; i++) {
          const x0 = lx(cam, w, i * bw, k), bh = (120 + hash(i, L + 1) * base) * s;
          if (x0 > w || x0 + bw * s * k < 0) continue;
          c.fillStyle = col;
          c.fillRect(x0, fy - 40 * s - bh, bw * cam.s * k - 4, bh + 40 * s);
          for (let yy = 0; yy < bh / (14 * s) - 1; yy++) {
            for (let xx = 0; xx < 4; xx++) {
              if (hash(i * 31 + xx, yy + L * 99) > 0.62) {
                c.fillStyle = hash(i, yy * 7 + xx) > 0.5 ? 'rgba(255,214,120,.8)' : 'rgba(140,200,255,.7)';
                c.fillRect(x0 + 6 + xx * (bw * cam.s * k - 12) / 4, fy - 40 * s - bh + 10 * s + yy * 14 * s, 4 * s * k + 2, 6 * s);
              }
            }
          }
        }
      });
      floor(c, cam, w, h, '#2E3140', '#15161E', 'rgba(255,255,255,.06)', 140);
      c.strokeStyle = '#3F4458'; c.lineWidth = Math.max(1, 3 * s);
      c.beginPath(); c.moveTo(0, fy - 40 * s); c.lineTo(w, fy - 40 * s); c.stroke();
      for (let i = -10; i < 40; i++) {
        const x = lx(cam, w, i * 60, 1);
        if (x < -5 || x > w + 5) continue;
        c.beginPath(); c.moveTo(x, fy - 40 * s); c.lineTo(x, fy); c.stroke();
      }
    },

    bamboo(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#BFE3C8'], [0.5, '#7DB88E'], [1, '#2E5A3A']]);
      const fy = cam.floor, s = cam.s;
      [[0.25, 'rgba(60,110,70,.45)', 70], [0.5, 'rgba(40,90,55,.7)', 95], [0.8, '#1F4A2C', 130]].forEach(([k, col, gap], L) => {
        for (let i = -10; i < 30; i++) {
          const x = lx(cam, w, i * gap + hash(i, L) * 40, k);
          if (x < -20 || x > w + 20) continue;
          const bw = (6 + L * 4) * s;
          c.fillStyle = col; c.fillRect(x, 0, bw, fy);
          c.fillStyle = 'rgba(0,0,0,.18)';
          for (let y = fy - 60 * s; y > 0; y -= (70 + hash(i, 5) * 30) * s) c.fillRect(x - 1, y, bw + 2, 3 * s);
        }
        c.fillStyle = 'rgba(230,245,230,' + (0.12 + L * 0.05) + ')';
        c.fillRect(0, fy - (120 + L * 40) * s, w, 40 * s);
      });
      floor(c, cam, w, h, '#5B7A45', '#2B3D22', 'rgba(20,40,15,.3)', 110);
    },

    temple(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#2C1B4F'], [0.45, '#C4507A'], [0.75, '#F59E5A'], [1, '#F7C77A']]);
      const fy = cam.floor, s = cam.s;
      c.fillStyle = 'rgba(255,230,180,.85)'; c.shadowColor = '#FFD08A'; c.shadowBlur = 50 * s;
      c.beginPath(); c.arc(lx(cam, w, 700, 0.05), fy - 120 * s, 70 * s, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
      const ridge = (k, col, amp, base, seed) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, fy);
        for (let x = 0; x <= w; x += 8) {
          const wx = (x - w / 2) / (cam.s * k) + cam.x;
          const y = fy - base * s - (Math.sin(wx * 0.004 + seed) * 0.6 + Math.sin(wx * 0.011 + seed * 2) * 0.4) * amp * s;
          c.lineTo(x, y);
        }
        c.lineTo(w, fy); c.closePath(); c.fill();
      };
      ridge(0.12, '#7A3E6A', 70, 150, 1);
      ridge(0.3, '#4A2448', 50, 90, 4);
      // A pagoda on the far ridge.
      const px = lx(cam, w, 1100, 0.3), pb = fy - 100 * s;
      c.fillStyle = '#2A1230';
      for (let i = 0; i < 4; i++) {
        const tw = (80 - i * 16) * s, ty = pb - i * 38 * s;
        c.fillRect(px - tw * 0.35, ty - 30 * s, tw * 0.7, 30 * s);
        c.beginPath(); c.moveTo(px - tw * 0.75, ty - 26 * s); c.lineTo(px, ty - 44 * s); c.lineTo(px + tw * 0.75, ty - 26 * s); c.closePath(); c.fill();
      }
      c.fillRect(px - 2 * s, pb - 190 * s, 4 * s, 40 * s);
      floor(c, cam, w, h, '#8A7A74', '#4A3E3C', 'rgba(40,30,30,.35)', 100);
      c.fillStyle = 'rgba(40,30,30,.25)';
      for (let i = -10; i < 40; i++) { const x = lx(cam, w, i * 100, 1); c.fillRect(x, fy + 30 * s, 2, 4); }
    },

    volcano(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#12060A'], [0.5, '#3E0E10'], [0.85, '#8A2412'], [1, '#2A0A08']]);
      const fy = cam.floor, s = cam.s;
      const vx = lx(cam, w, 800, 0.15);
      c.fillStyle = '#1E0A0C';
      c.beginPath(); c.moveTo(vx - 420 * s, fy); c.lineTo(vx - 70 * s, fy - 300 * s); c.lineTo(vx + 70 * s, fy - 300 * s); c.lineTo(vx + 420 * s, fy); c.closePath(); c.fill();
      const glow = c.createRadialGradient(vx, fy - 300 * s, 4, vx, fy - 300 * s, 160 * s);
      glow.addColorStop(0, 'rgba(255,140,40,.9)'); glow.addColorStop(1, 'rgba(255,60,20,0)');
      c.fillStyle = glow; c.fillRect(vx - 200 * s, fy - 470 * s, 400 * s, 340 * s);
      c.strokeStyle = 'rgba(255,110,30,.8)'; c.lineWidth = 4 * s;
      c.beginPath(); c.moveTo(vx - 20 * s, fy - 298 * s); c.quadraticCurveTo(vx - 60 * s, fy - 200 * s, vx - 120 * s, fy - 110 * s); c.stroke();
      [[0.4, '#2A0E0E', 120]].forEach(([k, col, base]) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, fy);
        for (let x = 0; x <= w; x += 10) {
          const wx = (x - w / 2) / (cam.s * k) + cam.x;
          c.lineTo(x, fy - (base * 0.4 + Math.abs(Math.sin(wx * 0.013)) * base * 0.6) * s);
        }
        c.lineTo(w, fy); c.closePath(); c.fill();
      });
      floor(c, cam, w, h, '#3A1A16', '#1A0A08', null);
      c.strokeStyle = 'rgba(255,90,20,' + (0.55 + Math.sin(t * 0.05) * 0.2) + ')'; c.lineWidth = Math.max(1, 2 * s);
      c.shadowColor = '#FF5A1E'; c.shadowBlur = 10 * s;
      for (let i = -6; i < 20; i++) {
        const x = lx(cam, w, i * 170 + 40, 1);
        if (x < -80 || x > w + 80) continue;
        c.beginPath(); c.moveTo(x, fy + 4 * s); c.lineTo(x + 30 * s, fy + 18 * s); c.lineTo(x + 18 * s, fy + 36 * s); c.lineTo(x + 50 * s, fy + 60 * s); c.stroke();
      }
      c.shadowBlur = 0;
    },

    neon(c, cam, w, h, t) {
      sky(c, w, h, [[0, '#0A0420'], [0.6, '#2A0B4A'], [1, '#12052A']]);
      const fy = cam.floor, s = cam.s;
      const sx = lx(cam, w, 700, 0.06), sy = fy - 150 * s, sr = 110 * s;
      const sg = c.createLinearGradient(0, sy - sr, 0, sy + sr);
      sg.addColorStop(0, '#FFD34A'); sg.addColorStop(1, '#FF2E88');
      c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, sr, Math.PI, 0); c.fill();
      c.fillStyle = '#12052A';
      for (let i = 0; i < 6; i++) c.fillRect(sx - sr, sy - sr * 0.55 + i * sr * 0.12, sr * 2, (2 + i * 1.3) * s);
      for (let i = -8; i < 24; i++) {
        const x0 = lx(cam, w, i * 120, 0.4), bh = (80 + hash(i, 2) * 200) * s;
        if (x0 > w || x0 + 110 * s < 0) continue;
        c.fillStyle = '#0D0626'; c.fillRect(x0, fy - bh, 110 * cam.s * 0.4, bh);
        if (hash(i, 4) > 0.55) {
          const col = ['#FF2E88', '#2EF2FF', '#B84CFF', '#FFD34A'][Math.floor(hash(i, 6) * 4)];
          c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 14 * s; c.lineWidth = 2.4 * s;
          c.strokeRect(x0 + 8 * s * 0.4, fy - bh + 16 * s, 70 * cam.s * 0.4, 16 * s);
          c.shadowBlur = 0;
        }
      }
      c.fillStyle = '#0B0420'; c.fillRect(0, fy, w, h - fy);
      c.strokeStyle = '#FF2E88'; c.shadowColor = '#FF2E88'; c.shadowBlur = 8 * s; c.lineWidth = Math.max(1, 1.5 * s);
      const step = 90 * s, x0 = lx(cam, w, 0, 1);
      for (let x = ((x0 % step) + step) % step - step * 8; x < w + step * 8; x += step) {
        c.beginPath(); c.moveTo(x, fy); c.lineTo(w / 2 + (x - w / 2) * 3, h); c.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const y = fy + (h - fy) * Math.pow(i / 6, 1.8);
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      c.shadowBlur = 0;
    }
  };

  /* ----------------------------------------------------- portraits */

  /** A fighter standing in a card, for the select screen. */
  function portrait(canvas, id, o) {
    const opt = o || {};
    const def = D.fighter(id);
    const w = canvas.width, h = canvas.height;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, h * 0.75);
    g.addColorStop(0, opt.locked ? '#2A2F3A' : shade(def.color, -0.35));
    g.addColorStop(1, '#0D1218');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const s = h / 220;
    const v = { s: s, x: wx => w / 2 + (wx - 0) * s, y: wy => h * 0.93 - wy * s };
    const f = { def: def, dir: opt.dir || 1, state: 'idle', st: 0, vx: 0, air: false, alt: !!opt.alt };
    drawFighter(c, f, v, opt.dir === -1 ? 14 : -14, 0, {
      pose: P({ t: 6, a: 44, ae: 96, b: 20, be: 108 }),
      ghost: opt.locked ? '#10141B' : null
    });
    if (opt.locked) {
      c.fillStyle = 'rgba(13,18,24,.35)'; c.fillRect(0, 0, w, h);
    }
  }

  /** A head for the health bar: circle, hat, facing into the bar. */
  function head(c, id, alt, x, y, r, dir) {
    const def = D.fighter(id);
    c.save();
    c.fillStyle = 'rgba(8,10,16,.9)';
    c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = alt ? def.alt : def.color;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    drawHat(c, def.hat, x, y, r, r / LEN.head, dir, 0, { vx: 0, dir: dir }, alt ? def.alt : def.color, 0);
    c.restore();
  }

  PV.StickArt = {
    POSE: POSE, ANIM: ANIM, STANCE: STANCE,
    poseOf: poseOf, joints: joints, drawFighter: drawFighter, drawProj: drawProj,
    drawStage: drawStage, portrait: portrait, head: head, shade: shade, colorOf: colorOf, hash: hash
  };

})(window.PV);
