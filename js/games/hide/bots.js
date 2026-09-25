/* 变色躲猫猫 / Blend In — the bots.

   Seven of the eight players. A bot drives its body with the same controls
   a person has — a direction to walk, a jump, a trigger, where to look —
   and paints itself through the same paint a person's brush lays down.

   A HIDING BOT picks a spot from the map's list of places a body can stand
   with something behind it (a wall, a shelf, a train, a floor to lie on, a
   wall to cling to high up), walks there, takes a pose, and then paints
   itself texel by texel with what a seeker standing out in the room would
   see BEHIND each bit of it: a ray from that eye, through the texel, on to
   whatever surface is there. Stripes on the wall come out as stripes on the
   body, lined up — from there. From anywhere else they are a little off,
   which is what a seeker walking past can notice. Then it locks still.

   A SEEKING BOT walks from likely spot to likely spot, looking about, and
   every tenth of a second it LOOKS at each hider in front of it the only
   fair way: twenty points on the hider's body, each one compared with what
   is behind it from the bot's own eye, lit the way the screen lights them.
   A good match at a distance is nothing; a white patch, a wrong stripe,
   somebody walking, close up, builds suspicion; enough of it and the bot
   goes and hoses them. It also sprays places it cannot quite make out,
   as people do, and knows when its water hits somebody.

   Difficulty is the bots' eyes and the bots' brushes: how small a mismatch
   an easy, normal or hard seeker can see, and how carefully an easy,
   normal or hard hider paints. Nobody cheats: a seeker never reads where a
   hider is, only what it could see. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData, B = PV.HideBody, HZ = D.HZ, TAU = Math.PI * 2;
  const W = () => PV.HideWorld;

  /* What each difficulty's bots can do. */
  const SKILL = [
    { see: 0.2, rate: 4.5, aim: 0.07, paintT: 19, noise: 30, comp: 0, sloppy: 0.55, fleeHit: 0.95, panic: 0.35, test: 0.25, look: 1.0 },
    { see: 0.112, rate: 7, aim: 0.035, paintT: 14, noise: 12, comp: 0.6, sloppy: 0.15, fleeHit: 0.8, panic: 0, test: 0.45, look: 1.25 },
    { see: 0.088, rate: 9, aim: 0.016, paintT: 10, noise: 4, comp: 1, sloppy: 0, fleeHit: 0.7, panic: 0, test: 0.65, look: 1.5 }
  ];

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const TP = [0, 0, 0, 0, 0, 0];
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  /** How different two lit colours look, 0 (same) to about 1. */
  function diff(a0, a1, a2, b0, b1, b2) {
    const r = a0 - b0, g = a1 - b1, b = a2 - b2;
    return Math.sqrt(r * r * 0.3 + g * g * 0.55 + b * b * 0.15) / 190;
  }

  /* ------------------------------------------------------ hiding spots */

  const spotCache = Object.create(null);

  /**
   * Every place a body can hide in a map, worked out once: standing with
   * its back to a face tall enough to cover it, curled against one that is
   * lower, clinging to a tall wall, or lying on the floor. Each with the way
   * it faces and how much of the map can see it.
   */
  function spots(world) {
    if (spotCache[world.key]) return spotCache[world.key];
    const w = world, out = [];
    const rng = new PV.RNG(PV.HideMaps.KEYS.indexOf(w.key) * 7919 + 17);
    const tall = (x, y, z, nx, nz, hi) => {
      // Something right behind the body all the way up to `hi`.
      for (let h = 0.25; h <= hi; h += 0.45) {
        if (w.ray(x, y + h, z, -nx, 0, -nz, 0.55) >= 0.55) return false;
      }
      return true;
    };
    for (const b of w.boxes) {
      if (b.y1 - b.y0 < 0.5 || b.y1 <= 0.3 || b.y0 > 2.5) continue;
      if (!w.inMap((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
      const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const f of faces) {
        const nx = f[0], nz = f[1];
        const len = nx ? b.z1 - b.z0 : b.x1 - b.x0;
        if (len < 0.8) continue;
        const n = Math.max(1, Math.floor((len - 0.5) / 0.9));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const fx = nx > 0 ? b.x1 : nx < 0 ? b.x0 : b.x0 + (b.x1 - b.x0) * u;
          const fz = nz > 0 ? b.z1 : nz < 0 ? b.z0 : b.z0 + (b.z1 - b.z0) * u;
          const sx = fx + nx * 0.33, sz = fz + nz * 0.33;
          if (!w.inMap(sx, sz)) continue;
          // What the body would stand on, and a walkable cell right by it
          // at that height to walk in from.
          const y = w.floorAt(sx, sz, b.y0 + 0.55, 0.2);
          if (y < -5) continue;
          const c = w.navCell(sx + nx * 0.4, sz + nz * 0.4, y);
          if (!w.navOK[c] || Math.abs(w.navH[c] - y) > 0.3 || Math.hypot(w.cellX(c) - sx, w.cellZ(c) - sz) > 1.2) continue;
          if (b.y0 > y + 0.1 || b.y1 < y + 0.8) continue;
          if (w.blocked(sx, y + 0.03, sz, 0.28, 1.0)) continue;
          const yaw = Math.atan2(nx, -nz);
          const room = b.y1 - y;
          if (room >= 1.8 && tall(sx, y, sz, nx, nz, 1.75) && !w.blocked(sx, y + 0.03, sz, 0.28, 1.72)) {
            out.push({ x: sx, z: sz, y: y, yaw: yaw, nx: nx, nz: nz, pose: 'stand', kind: 'wall' });
            if (room >= 3.6 && rng.next() < 0.5) {
              const cy = y + 1.1 + rng.next() * Math.min(1.2, room - 3.4);
              out.push({ x: sx, z: sz, y: cy, base: y, yaw: yaw, nx: nx, nz: nz, pose: 'climb', kind: 'climb' });
            }
          } else if (room >= 0.95 && room < 1.8) {
            const pose = room >= 1.4 ? 'crouch' : 'ball';
            if (tall(sx, y, sz, nx, nz, D.POSE[pose].top - 0.1)) out.push({ x: sx, z: sz, y: y, yaw: yaw, nx: nx, nz: nz, pose: pose, kind: 'low' });
          }
        }
      }
    }
    // The floor: lying flat somewhere with room round you.
    for (let i = 0; i < 70; i++) {
      const p = w.randomCell(rng);
      // A floor, not the top of a turnstile.
      if (p.y > 0.05 || (p.y < -0.05 && p.y > -1.1)) continue;
      if (p.y < -0.5 && rng.next() < 0.5) continue;
      if (w.blocked(p.x, p.y + 0.05, p.z, 0.95, 0.4)) continue;
      const yaw = rng.next() * TAU;
      out.push({ x: p.x, z: p.z, y: p.y, yaw: yaw, nx: Math.sin(yaw), nz: -Math.cos(yaw), pose: rng.next() < 0.5 ? 'lie' : 'prone', kind: 'floor' });
    }
    // How exposed each one is: of twenty-four places in the map, how many
    // have a line of sight to it. And how busy what is behind the body is:
    // a plain wall hides you from every side, a poster of cans only from
    // where you painted it.
    const eyes = [];
    for (let i = 0; i < 24; i++) { const p = w.randomCell(rng); eyes.push([p.x, p.y + 1.6, p.z]); }
    const col = [0, 0, 0];
    for (const s of out) {
      let n = 0;
      const cy = s.y + (s.kind === 'floor' ? 0.3 : 1.0);
      for (const e of eyes) if (w.clear(e[0], e[1], e[2], s.x, cy, s.z)) n++;
      s.expo = n / eyes.length;
      s.cell = w.cellOf(s.x, s.z);
      const cs = [];
      const tx = -s.nz, tz = s.nx;
      if (s.kind === 'floor') {
        for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
          const px = s.x + s.nx * i * 0.3 + tx * j * 0.3, pz = s.z + s.nz * i * 0.3 + tz * j * 0.3;
          const c = w.look(px, s.y + 0.5, pz, 0, -1, 0, 1.5, col);
          if (c) cs.push(c.slice());
        }
      }
      let edge = 0, tries = 0;
      if (s.kind !== 'floor') {
        // Behind the body and a metre to either side: the same surface,
        // at the same depth, or a seeker off to the side sees round it.
        const top = s.kind === 'low' ? D.POSE[s.pose].top : 1.7;
        for (let h = 0.15; h <= top; h += 0.3) for (let j = -3; j <= 3; j++) {
          tries++;
          const c = w.look(s.x + tx * j * 0.3, s.y + h, s.z + tz * j * 0.3, -s.nx, 0, -s.nz, 1.2, col);
          if (!c || Math.abs(w.hit.t - 0.33) > 0.25) { edge++; continue; }
          cs.push(c.slice());
        }
      }
      let mr = 0, mg = 0, mb = 0;
      for (const c of cs) { mr += c[0]; mg += c[1]; mb += c[2]; }
      const k = cs.length || 1; mr /= k; mg /= k; mb /= k;
      let v = 0;
      for (const c of cs) v += diff(c[0], c[1], c[2], mr, mg, mb);
      s.busy = (cs.length ? v / k : 1) + (tries ? edge / tries * 0.5 : 0);
    }
    spotCache[world.key] = out;
    return out;
  }

  /* ------------------------------------------------------------- bot */

  class HideBot {
    constructor(game, actor) {
      this.g = game; this.a = actor;
      this.rng = new PV.RNG((game.seed ^ Math.imul(actor.id + 1, 0x9E3779B1)) >>> 0);
      // Every bot a little different from its level.
      this.eye = 0.85 + this.rng.next() * 0.3;
      this.reset();
    }

    /** The level this bot plays at. A game can set the two sides apart
        (seekDiff, hideDiff); the tests do, to measure one against the other. */
    get sk() {
      const g = this.g, d = this.a.role === 'seeker' ? g.seekDiff : g.hideDiff;
      return SKILL[d == null ? g.diff : d];
    }

    reset() {
      this.state = 'idle'; this.path = null; this.wp = 0; this.goal = null;
      this.stuck = 0; this.lastX = this.a.x; this.lastZ = this.a.z; this.wait = 0;
      this.spot = null; this.paintK = 0; this.plan = null;
      this.sus = Object.create(null); this.target = -1; this.seenT = 0; this.lastSeen = null;
      this.lookT = 0; this.scan = 0; this.testT = 0; this.sprayT = 0; this.sprayAt = null;
      this.visited = Object.create(null); this.phase = null; this.seenSeq = 0;
      this.panic = 0;
    }

    /* ---- walking ---- */

    goTo(x, z, y) {
      const a = this.a, w = this.g.world;
      this.path = w.path(a.x, a.z, a.y, x, z, y);
      this.wp = 0; this.goal = { x: x, z: z, y: y }; this.stuck = 0;
      return !!this.path;
    }

    /** Walk the path. Returns true when there. */
    walk(speed) {
      const a = this.a, c = a.ctl, p = this.path;
      c.mx = 0; c.mz = 0; c.jump = false;
      if (!p || this.wp >= p.length) return true;
      let t = p[this.wp];
      let dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
      const last = this.wp === p.length - 1;
      if (d < (last ? 0.12 : 0.45) && Math.abs(a.y - t.y) < 0.6) {
        this.wp++;
        if (this.wp >= p.length) return true;
        t = p[this.wp]; dx = t.x - a.x; dz = t.z - a.z; d = Math.hypot(dx, dz);
      }
      const k = Math.min(1, speed == null ? 1 : speed) * (last && d < 0.8 ? Math.max(0.35, d / 0.8) : 1);
      c.mx = dx / (d || 1) * k; c.mz = dz / (d || 1) * k;
      if (t.y - a.y > W().STEP && d < 1.4 && a.ground) c.jump = true;
      // Stuck: nudge, then give up and re-plan.
      if (this.g.tick % 30 === 0) {
        const moved = Math.hypot(a.x - this.lastX, a.z - this.lastZ);
        this.lastX = a.x; this.lastZ = a.z;
        if (moved < 0.25) {
          this.stuck++;
          if (a.ground && this.stuck >= 2) c.jump = true;
          if (this.stuck >= 4 && this.goal) { const g = this.goal; this.goTo(g.x, g.z, g.y); this.stuck = 0; if (this.rng.next() < 0.4) return true; }
        } else this.stuck = 0;
      }
      return false;
    }

    face(yaw, rate) {
      const a = this.a;
      a.lookYaw = wrap(a.lookYaw + clamp(wrap(yaw - a.lookYaw), -rate / HZ, rate / HZ));
    }

    /* ---- every tick ---- */

    think(g) {
      const a = this.a, c = a.ctl;
      c.mx = c.mz = 0; c.jump = false; c.fire = false; c.up = 0; c.side = 0;
      if (g.phase !== this.phase) { this.phase = g.phase; this.enter(g); }
      if (g.phase === 'lobby' || g.phase === 'intro' || (g.phase === 'hide' && a.role === 'seeker')) { this.mill(g); return; }
      if (g.phase === 'result') return;
      if (a.role === 'hider') this.hider(g);
      else this.seeker(g);
      if (a.role === 'seeker') a.yaw = a.lookYaw;
    }

    enter(g) {
      const a = this.a;
      this.path = null; this.wait = 0;
      if (g.phase === 'hide' && a.role === 'hider') { this.state = 'pick'; this.wait = Math.floor(this.rng.next() * 0.8 * HZ); }
      if (g.phase === 'hunt' && a.role === 'seeker') { this.state = 'patrol'; this.sus = Object.create(null); this.target = -1; this.testT = HZ * (3 + this.rng.next() * 4); this.sprayT = 0; this.sprayAt = null; }
    }

    /** In the warm-up room: wander, stop, look about, sometimes spray. */
    mill(g) {
      const a = this.a, w = g.world;
      if (a.role === 'seeker' && g.phase === 'hide') {
        if (this.sprayT > 0) { this.sprayT--; a.ctl.fire = true; }
        else if (this.rng.next() < 0.004) this.sprayT = Math.floor(HZ * (0.3 + this.rng.next() * 0.6));
      }
      if (this.wait > 0) { this.wait--; this.face(a.lookYaw + Math.sin(g.tick / 40 + a.id) * 0.02, 1); a.yaw = a.role === 'seeker' ? a.lookYaw : a.yaw; return; }
      if (!this.path || this.wp >= this.path.length) {
        const ox = w.lobbyAt[0], oz = w.lobbyAt[1];
        const x = ox + 1.5 + this.rng.next() * 9, z = oz + 2.5 + this.rng.next() * 8;
        this.goTo(x, z, 0);
        this.wait = Math.floor(HZ * (0.5 + this.rng.next() * 2.5));
      }
      if (this.walk(0.6)) this.path = null;
      if (a.role === 'seeker') { const c = a.ctl; if (c.mx || c.mz) this.face(Math.atan2(c.mx, -c.mz), 5); }
    }

    /* ---------------------------------------------------------- hiding */

    hider(g) {
      const a = this.a;
      if (this.wait > 0) { this.wait--; return; }
      const hunt = g.phase === 'hunt';
      // Water on you: somebody knows. Most run for it, after a moment.
      if (hunt && a.soak > 0.01 && this.state !== 'flee' && this.state !== 'go') {
        if (this.rng.next() < this.sk.fleeHit) { this.flee(g); return; }
        this.wait = Math.round(HZ * 0.6);
        return;
      }
      switch (this.state) {
        case 'pick': {
          const s = this.choose(g);
          this.spot = s;
          if (!s) { this.state = 'done'; return; }
          const base = s.kind === 'climb' ? { x: s.x, z: s.z, y: s.base } : s;
          this.goTo(base.x, base.z, base.y);
          this.state = 'go';
          break;
        }
        case 'go':
        case 'flee': {
          a.lock = false;
          if (this.walk()) {
            const s = this.spot;
            if (Math.hypot(a.x - s.x, a.z - s.z) > 0.9) { this.state = 'pick'; return; }
            a.yaw = s.kind === 'climb' ? Math.atan2(-s.nx, s.nz) : s.yaw;
            if (s.kind === 'climb') { a.ctl.jump = true; this.state = 'climb'; this.tries = 0; this.wait = 2; }
            else { g.setPose(a, s.pose); this.state = 'settle'; this.wait = Math.round(0.35 * HZ); }
          }
          break;
        }
        case 'climb': {
          const s = this.spot;
          if (!a.climb) {
            // Lean into the wall and jump at it until we have hold of it.
            this.tries = (this.tries || 0) + 1;
            if (this.tries > 50 || a.y > s.base + 0.8) {
              this.tries = 0;
              this.spot = Object.assign({}, s, { kind: 'wall', pose: 'stand', y: a.y });
              a.yaw = s.yaw; g.setPose(a, 'stand'); this.state = 'settle'; this.wait = 10;
              break;
            }
            a.ctl.mx = -s.nx * 0.4; a.ctl.mz = -s.nz * 0.4;
            if (this.tries % 6 === 0) a.ctl.jump = true;
            break;
          }
          this.tries = 0;
          a.ctl.up = a.y < s.y ? 1 : 0;
          if (a.y >= s.y - 0.02) { this.state = 'settle'; this.wait = 6; }
          break;
        }
        case 'settle':
          a.lock = true;
          this.beginPaint(g);
          this.state = 'paint';
          break;
        case 'paint':
          if (this.paintSome(g)) this.state = 'hidden';
          break;
        case 'hidden':
          // An easy bot loses its nerve when a seeker comes right up to it.
          if (hunt && this.sk.panic && this.threat(g) > 1) {
            if (this.rng.next() < this.sk.panic) { this.flee(g); return; }
            this.wait = HZ * 3;
          }
          break;
        default: break;
      }
    }

    /** How pressing the nearest seeker is: >1 means right on you, looking. */
    threat(g) {
      const a = this.a;
      let worst = 0;
      for (const s of g.actors) {
        if (s.role !== 'seeker') continue;
        const dx = a.x - s.x, dz = a.z - s.z, d = Math.hypot(dx, dz);
        if (d > 6) continue;
        const f = PV.HideGame.dir(s.lookYaw, 0);
        const facing = (f[0] * dx + f[2] * dz) / (d || 1);
        if (facing < 0.8) continue;
        if (!g.world.clear(s.x, g.eye(s), s.z, a.x, a.y + 1, a.z)) continue;
        worst = Math.max(worst, (6 - d) / 3.2 * facing);
      }
      return worst;
    }

    /** Run for another spot: far from the seekers, out of their sight. */
    flee(g) {
      const a = this.a;
      a.lock = false;
      if (a.climb) { a.ctl.jump = true; this.wait = 12; return; }
      const list = spots(g.world);
      let best = null, bs = -Infinity;
      for (let i = 0; i < 40; i++) {
        const s = list[this.rng.int(list.length)];
        if (s.kind === 'climb') continue;
        let near = Infinity, seen = 0;
        for (const o of g.actors) {
          if (o.role !== 'seeker') continue;
          near = Math.min(near, Math.hypot(o.x - s.x, o.z - s.z));
          if (g.world.clear(o.x, g.eye(o), o.z, s.x, s.y + 1, s.z)) seen++;
        }
        const sc = Math.min(near, 16) - Math.hypot(a.x - s.x, a.z - s.z) * 0.2 - seen * 4 - s.busy * 4 + this.rng.next() * 3;
        if (sc > bs) { bs = sc; best = s; }
      }
      if (!best) return;
      this.spot = best;
      this.goTo(best.x, best.z, best.y);
      this.state = 'flee';
    }

    /** Pick a spot: out of sight, away from the seekers' door, apart, and
        with something plain behind it. */
    choose(g) {
      const a = this.a, w = g.world, list = spots(w);
      const sk = w.seek[0];
      const taken = g.actors.filter(o => o !== a && o.role === 'hider' && o.bot && o.bot.spot).map(o => o.bot.spot);
      let best = null, bs = -Infinity;
      const lvl = g.hideDiff == null ? g.diff : g.hideDiff;
      for (let i = 0; i < 90; i++) {
        const s = list[this.rng.int(list.length)];
        if (s.kind === 'climb' && lvl === 0) continue;
        let sc = this.rng.next() * 0.7 + (1 - s.expo) * (0.4 + 0.3 * lvl) + Math.min(1, Math.hypot(s.x - sk[0], s.z - sk[1]) / 14) * 0.35;
        sc -= s.busy * (1.2 + 2.2 * lvl);
        for (const o of taken) if (Math.hypot(o.x - s.x, o.z - s.z) < 3.5) sc -= 1;
        if (s.kind === 'climb') sc += 0.05 * lvl;
        const d = Math.hypot(a.x - s.x, a.z - s.z);
        if (d > 28) sc -= 0.4;
        if (sc > bs) { bs = sc; best = s; }
      }
      return best;
    }

    /**
     * Get ready to paint where the body now stands: pick the eye to paint
     * for — out in front at a standing seeker's height, or over a body
     * lying on the floor, off to one side and looking down — and, for a
     * sloppy painter, the one colour it will smear over most of itself.
     */
    beginPaint(g) {
      const a = this.a, w = g.world, s = this.spot || { nx: Math.sin(a.yaw), nz: -Math.cos(a.yaw), kind: 'wall' };
      this.mats = B.pose(B.newMats(), Object.assign({}, a, { still: true, blend: 1, prev: a.pose }));
      let fx = s.nx, fz = s.nz;
      if (s.kind === 'floor') { const k = this.rng.next() * TAU; fx = Math.sin(k); fz = -Math.cos(k); }
      const base = s.kind === 'climb' ? s.base : a.y;
      const reach = w.ray(a.x, base + 1.2, a.z, fx, 0, fz, 6);
      const dist = Math.max(1.4, Math.min(s.kind === 'floor' ? 3.2 : 5, reach - 0.5));
      const vx = a.x + fx * dist, vz = a.z + fz * dist;
      const vc = w.cellOf(vx, vz);
      this.view = [vx, (w.navOK[vc] ? w.navH[vc] : base) + 1.55, vz];
      this.paintK = 0;
      this.mean = null;
      if (this.sk.sloppy > 0) {
        const m = [0, 0, 0], c = [0, 0, 0];
        let n = 0;
        for (let i = 0; i < B.ALL.length; i += 97) { this.texelColour(g, B.ALL[i], c); m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; n++; }
        this.mean = [m[0] / n, m[1] / n, m[2] / n];
      }
    }

    /** The colour one texel should be, into c. */
    texelColour(g, k, c) {
      const w = g.world, v = this.view, P = TP, sk = this.sk;
      B.texelWorld(this.mats, k, P);
      const ex = v[0] - P[0], ey = v[1] - P[1], ez = v[2] - P[2], el = Math.hypot(ex, ey, ez) || 1;
      const facing = (P[3] * ex + P[4] * ey + P[5] * ez) / el;
      let got = null, nx = 0, ny = 1, nz = 0;
      if (facing < 0.1) {
        // Turned from the eye: whatever it is up against.
        got = w.look(P[0] + P[3] * 0.01, P[1] + P[4] * 0.01, P[2] + P[5] * 0.01, P[3], P[4], P[5], 0.9, c);
        if (got) { nx = w.hit.nx; ny = w.hit.ny; nz = w.hit.nz; }
      }
      if (!got) {
        const dx = -ex / el, dy = -ey / el, dz = -ez / el;
        got = w.look(P[0] + dx * 0.02, P[1] + dy * 0.02, P[2] + dz * 0.02, dx, dy, dz, 25, c);
        if (got) { nx = w.hit.nx; ny = w.hit.ny; nz = w.hit.nz; }
      }
      if (!got) { c[0] = 200; c[1] = 220; c[2] = 240; }
      // Lit the way the screen lights the wall, then unlit the way it
      // lights the body: a careful painter paints a shadowed side lighter.
      const k2 = Math.pow(D.shade(nx, ny, nz) / D.shade(P[3], P[4], P[5]), sk.comp);
      for (let q = 0; q < 3; q++) c[q] *= k2;
      return c;
    }

    /** Paint the next few texels. True when the whole body is done. */
    paintSome(g) {
      const a = this.a, sk = this.sk, c = [0, 0, 0];
      const per = Math.ceil(B.ALL.length / (sk.paintT * HZ));
      const end = Math.min(B.ALL.length, this.paintK + per);
      for (let i = this.paintK; i < end; i++) {
        const k = B.ALL[i];
        this.texelColour(g, k, c);
        if (this.mean) for (let q = 0; q < 3; q++) c[q] += (this.mean[q] - c[q]) * sk.sloppy;
        for (let q = 0; q < 3; q++) a.paint[k * 3 + q] = clamp(Math.round(c[q] + (this.rng.next() - 0.5) * sk.noise), 0, 255);
      }
      this.paintK = end;
      a.paintVer++;
      return this.paintK >= B.ALL.length;
    }

    /* --------------------------------------------------------- seeking */

    seeker(g) {
      const a = this.a, w = g.world, sk = this.sk;
      // What our water hit.
      for (let i = g.events.length - 1; i >= 0; i--) {
        const e = g.events[i];
        if (e.s <= this.seenSeq) break;
        if (e.k === 'hit' && e.a === a.id) { this.sus[e.v] = 2; if (this.target < 0) this.chase(g, e.v); }
      }
      if (g.events.length) this.seenSeq = g.events[g.events.length - 1].s;
      if (g.tick % 6 === a.id % 6) this.perceive(g);
      if (this.target >= 0) { this.hunt(g); return; }

      // Spraying something we could not make out.
      if (this.sprayT > 0 && this.sprayAt) {
        this.sprayT--;
        // Swept across, not held on one point.
        const s = this.sprayAt, k = (this.sweep || 0) / HZ;
        s[0] += Math.cos(a.lookYaw) * k; s[2] += Math.sin(a.lookYaw) * k;
        this.aimAt(s[0], s[1], s[2], 7);
        a.ctl.fire = true;
        return;
      }
      if (this.state === 'look' && this.wait > 0) {
        this.wait--;
        this.aimAt(this.lookAt[0], this.lookAt[1], this.lookAt[2], 3.5 * sk.look);
        return;
      }
      if (!this.path || this.wp >= this.path.length) this.nextPatrol(g);
      const there = this.walk();
      // Look about while walking: along the way, and off to the sides.
      this.scan += 1 / HZ;
      const c = a.ctl;
      const heading = (c.mx || c.mz) ? Math.atan2(c.mx, -c.mz) : a.lookYaw;
      const sweep = Math.sin(this.scan * (1.1 + 0.3 * this.eye)) * 1.0;
      this.face(heading + sweep, 3 * sk.look);
      a.lookPitch += ((0.02 + Math.sin(this.scan * 0.9 + a.id) * 0.3) - a.lookPitch) * 0.05;
      if (there) {
        // Stand and look the spot over before moving on.
        const s = this.patrolSpot;
        if (s) {
          this.state = 'look';
          this.lookAt = [s.x, s.y + (s.kind === 'floor' ? 0.2 : s.kind === 'low' ? 0.6 : 1.0), s.z];
          this.wait = Math.round(HZ * (0.7 + 0.7 * this.rng.next()));
          this.patrolSpot = null;
          this.path = null;
        } else this.nextPatrol(g);
      }
      // Now and then, hose a likely spot near us.
      this.testT--;
      if (this.testT <= 0) {
        this.testT = Math.round(HZ * (5 + this.rng.next() * 7) / (0.5 + sk.test));
        this.testSpray(g);
      }
    }

    nextPatrol(g) {
      const a = this.a, list = spots(g.world);
      let best = null, bs = -Infinity;
      const mate = g.actors.find(o => o.role === 'seeker' && o !== a);
      for (let i = 0; i < 40; i++) {
        const s = list[this.rng.int(list.length)];
        const d = Math.hypot(a.x - s.x, a.z - s.z);
        let sc = this.rng.next() * 2 - Math.abs(d - 9) * 0.12;
        if (this.visited[s.cell]) sc -= 1.5;
        if (mate && Math.hypot(mate.x - s.x, mate.z - s.z) < 6) sc -= 1;
        if (sc > bs) { bs = sc; best = s; }
      }
      if (!best) return;
      this.visited[best.cell] = 1;
      // Stand off the spot a little and look at it.
      const back = 2.2 + this.rng.next() * 1.5;
      let tx = best.x + best.nx * back, tz = best.z + best.nz * back;
      if (!g.world.inMap(tx, tz)) { tx = best.x; tz = best.z; }
      this.goTo(tx, tz, best.kind === 'climb' ? best.base : best.y);
      this.patrolSpot = best;
      this.state = 'patrol';
    }

    /**
     * Hose a bit of the room on a hunch, as people do: a point on whatever
     * surface is out in front, somewhere between three and ten metres, at
     * about body height. The bot does not know where anybody is; if there
     * happens to be a hider on that bit of wall, the water will say so.
     */
    testSpray(g) {
      const a = this.a, w = g.world;
      const ey = g.eye(a);
      for (let i = 0; i < 8; i++) {
        const yaw = a.lookYaw + (this.rng.next() - 0.5) * 1.4;
        const pitch = -0.05 - this.rng.next() * 0.35;
        const d = PV.HideGame.dir(yaw, pitch);
        const t = w.ray(a.x, ey, a.z, d[0], d[1], d[2], 12);
        if (t < 3 || t > 10 || !w.hit.box) continue;
        const x = a.x + d[0] * t, y = ey + d[1] * t, z = a.z + d[2] * t;
        if (!w.inMap(x, z)) continue;
        this.sprayAt = [x, y, z];
        this.sweep = (this.rng.next() - 0.5) * 1.2;
        this.sprayT = Math.round(HZ * (0.2 + 0.2 * this.rng.next()));
        return;
      }
    }

    /**
     * Look at every hider in front of us and judge what we see. Suspicion
     * builds on what stands out; it fades when nothing does.
     */
    perceive(g) {
      const a = this.a, w = g.world, sk = this.sk;
      const ex = a.x, ey = g.eye(a), ez = a.z;
      const L = PV.HideGame.dir(a.lookYaw, a.lookPitch);
      const P = [0, 0, 0, 0, 0, 0], col = [0, 0, 0];
      for (const h of g.actors) {
        if (h.role !== 'hider' || h.found) continue;
        const id = h.id;
        const cx = h.mats[12], cy = h.mats[13], cz = h.mats[14];
        const dx = cx - ex, dy = cy - ey, dz = cz - ez, d = Math.hypot(dx, dy, dz);
        const cos = (dx * L[0] + dy * L[1] + dz * L[2]) / (d || 1);
        let seen = 0;
        if (d < 40 && (cos > 0.45 || d < 2.2)) {
          let n = 0;
          const diffs = [];
          let gapSum = 0;
          for (let q = 0; q < B.SAMPLES.length; q++) {
            const k = B.SAMPLES[q];
            B.texelWorld(h.mats, k, P);
            const vx = P[0] - ex, vy = P[1] - ey, vz = P[2] - ez, vl = Math.hypot(vx, vy, vz);
            if ((P[3] * vx + P[4] * vy + P[5] * vz) / vl > -0.05) continue;       // turned away
            const ux = vx / vl, uy = vy / vl, uz = vz / vl;
            if (w.ray(ex, ey, ez, ux, uy, uz, vl) < vl - 0.04) continue;           // behind something
            const bg = w.look(P[0] + ux * 0.03, P[1] + uy * 0.03, P[2] + uz * 0.03, ux, uy, uz, 30, col);
            let br, bgc, bb, gap;
            if (bg) { const s = D.shade(w.hit.nx, w.hit.ny, w.hit.nz); br = bg[0] * s; bgc = bg[1] * s; bb = bg[2] * s; gap = w.hit.t; }
            else { br = 190; bgc = 215; bb = 240; gap = 30; }
            const ks = D.shade(P[3], P[4], P[5]), o = k * 3;
            diffs.push(diff(h.paint[o] * ks, h.paint[o + 1] * ks, h.paint[o + 2] * ks, br, bgc, bb));
            gapSum += Math.min(1, gap / 3);
            n++;
          }
          if (n) {
            diffs.sort((p, q) => q - p);
            let m = 0; const top = Math.max(1, Math.ceil(n * 0.5));
            for (let q = 0; q < top; q++) m += diffs[q];
            m /= top;
            const motion = h.speed > 0.25 ? Math.min(1, h.speed / 3) : (h.still ? 0 : 0.035);
            const size = clamp(3.6 / d, 0.12, 1.25);
            const centre = clamp((cos - 0.45) / 0.5, 0, 1);
            const conspic = (m * 0.95 + motion * 1.6 + (gapSum / n) * 0.07 + 0.03) * size * (0.4 + 0.6 * centre) * (0.35 + 0.65 * n / B.SAMPLES.length);
            const need = sk.see * this.eye;
            if (HideBot.debug) HideBot.debug(this, h, { m: m, motion: motion, gap: gapSum / n, size: size, centre: centre, vis: n / B.SAMPLES.length, d: d, conspic: conspic, need: need });
            if (conspic > need) {
              seen = 1;
              this.sus[id] = (this.sus[id] || 0) + (conspic - need) * sk.rate * 0.1 * (1 + this.eye * 0.2);
              this.lastSeenPos = [cx, cy, cz];
              if (this.sus[id] >= 1 && this.target < 0) this.chase(g, id);
              else if (this.sus[id] >= 0.3 && this.target < 0 && this.state !== 'look') {
                // Something is off over there: stop and stare at it.
                this.state = 'look'; this.lookAt = [cx, cy + 0.2, cz]; this.wait = Math.round(HZ * (0.8 + 0.6 * this.rng.next()));
                this.path = null;
                if (this.sus[id] >= 0.55 && d < 11 && this.rng.next() < sk.test) { this.sprayAt = [cx, cy, cz]; this.sprayT = Math.round(HZ * 0.4); }
              }
            }
          }
        }
        if (!seen && this.sus[id]) this.sus[id] *= 0.985;
        if (id === this.target) {
          if (seen || (d < 18 && w.clear(ex, ey, ez, cx, cy + 0.3, cz))) { this.seenT = g.tick; this.lastSeen = [h.x, h.y, h.z]; }
        }
      }
    }

    chase(g, id) {
      const h = g.actors[id];
      this.target = id; this.seenT = g.tick; this.lastSeen = [h.x, h.y, h.z];
      this.state = 'chase'; this.path = null;
    }

    /** After a hider we have spotted: close in and hose them. */
    hunt(g) {
      const a = this.a, h = g.actors[this.target], sk = this.sk, w = g.world;
      if (!h || h.found || h.role !== 'hider') { this.target = -1; this.state = 'patrol'; this.path = null; return; }
      const lost = g.tick - this.seenT > HZ * 2.5;
      const tgt = lost ? this.lastSeen : [h.mats[12], h.mats[13], h.mats[14]];
      const d = Math.hypot(tgt[0] - a.x, tgt[2] - a.z);
      if (lost) {
        if (!this.path || this.wp >= this.path.length) {
          if (d < 1.5 || g.tick - this.seenT > HZ * 8) { this.target = -1; this.sus[h.id] = 0.4; this.state = 'patrol'; return; }
          this.goTo(tgt[0], tgt[2], tgt[1]);
        }
        this.walk();
        this.face(Math.atan2(tgt[0] - a.x, -(tgt[2] - a.z)), 4);
        return;
      }
      // Close enough to hit from where we are?
      const sees = w.clear(a.x, g.eye(a), a.z, tgt[0], tgt[1] + 0.2, tgt[2]);
      if (d > 7 || !sees) {
        if (!this.path || this.wp >= this.path.length || g.tick % 45 === 0) this.goTo(h.x, h.z, h.y);
        this.walk();
      } else if (d < 2.2) {
        // Back off a step; too close to hose properly.
        const k = 1 / (d || 1);
        a.ctl.mx = -(tgt[0] - a.x) * k * 0.5; a.ctl.mz = -(tgt[2] - a.z) * k * 0.5;
      }
      const ok = this.aimAt(tgt[0], tgt[1] + (h.pose === 'stand' ? 0.1 : -0.1), tgt[2], 6);
      if (sees && d < 13 && ok < 0.08 + sk.aim * 3) a.ctl.fire = true;
    }

    /**
     * Turn toward a point, allowing for the droplets' fall and the bot's
     * own unsteady hand. Returns how far off the aim still is (radians).
     */
    aimAt(x, y, z, rate) {
      const a = this.a, g = this.g;
      const ey = g.eye(a) - 0.22;
      const dx = x - a.x, dz = z - a.z, dh = Math.hypot(dx, dz), dy = y - ey;
      const v = PV.HideGame.DROP_V, G = PV.HideGame.DROP_G;
      let pitch = Math.atan2(dy, dh);
      const disc = v * v * v * v - G * (G * dh * dh + 2 * dy * v * v);
      if (disc > 0 && dh > 0.3) pitch = Math.atan((v * v - Math.sqrt(disc)) / (G * dh));
      pitch -= 0.035;
      const wob = this.sk.aim * (Math.sin(g.tick * 0.13 + a.id) + Math.sin(g.tick * 0.071 + a.id * 3) * 0.6);
      const yaw = Math.atan2(dx, -dz) + wob;
      this.face(yaw, rate);
      a.lookPitch += clamp(pitch + wob * 0.5 - a.lookPitch, -rate / HZ, rate / HZ);
      return Math.abs(wrap(yaw - a.lookYaw)) + Math.abs(pitch - a.lookPitch);
    }
  }

  HideBot.SKILL = SKILL;
  HideBot.spots = spots;
  HideBot.diff = diff;
  PV.HideBot = HideBot;

})(window.PV);
