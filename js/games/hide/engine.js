/* 变色躲猫猫 / Blend In — the rules.

   A round of hide and seek for eight: six hiders and two seekers, you and
   seven bots. It runs as the reference's does:

     lobby   everybody in the warm-up room; paint yourself for fun. A race
             with friends skips it.
     intro   who is what, and which map.
     hide    75 s. Hiders go into the map, paint themselves to match
             something, find a spot and hold still. Seekers wait in the
             warm-up room.
     hunt    120 s. Seekers come in with water guns. Enough water on a
             hider and they are found. Seekers win if nobody is left;
             hiders win if anybody is.
     result  the table, and then the harness's end card.

   Everything is decided here, a tick at a time at 60 Hz, from the seed and
   the inputs: where everybody is, every droplet, every dab of paint. The
   view reads it and draws it; the bots (bots.js) steer their bodies with
   the same controls a person has.

   Controls arrive as inputs: `{hold}` a bit mask of held keys, `{look}`
   how far the mouse moved, `{move}` a thumb stick, taps as strings, and
   painting as `{paint}`, `{fill}` and 'reset'. A dab is given where it
   lands on the REST pose (body.js), so the same stroke paints the same
   texels however you happen to be standing. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData, B = PV.HideBody, R = D.RULES, HZ = D.HZ;
  const DT = 1 / HZ, TAU = Math.PI * 2;
  const HOLD = { fwd: 1, back: 2, left: 4, right: 8, jump: 16, fire: 32, slow: 64 };
  const GRAV = 20, JUMP = 7.4, CLIMB_V = 2.3, EYE = 1.55;
  const SPEED = { hider: 4.6, seeker: 5.0, none: 4.6 };
  const DROP_G = 9, DROP_V = 21, DROP_LIFE = 1.6 * HZ, DROP_R = 0.06;
  const MAXP = 2.2;                       // brush radius ceiling, metres

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  /** Unit vector for a yaw and pitch: yaw 0 looks down -z, pi/2 down +x. */
  function dir(yaw, pitch) { const c = Math.cos(pitch); return [Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c]; }
  const byte = v => clamp(Math.round(num(v)), 0, 255);

  class HideGame extends PV.LoopGame {
    /**
     * opts: { seed, map ('random' or a key), role ('random' | 'hider' |
     *         'seeker'), difficulty, autostart (skip the lobby), name,
     *         poses (the pose ids this player may use) }
     */
    constructor(opts) {
      super(opts);
      const o = opts || {};
      const keys = PV.HideMaps.KEYS;
      this.mapKey = keys.indexOf(o.map) >= 0 ? o.map : keys[this.rng.int(keys.length)];
      this.world = new PV.HideWorld(this.mapKey);
      this.diff = ({ easy: 0, normal: 1, hard: 2 })[o.difficulty];
      if (this.diff == null) this.diff = 1;
      this.roleWant = o.role === 'hider' || o.role === 'seeker' ? o.role : 'random';
      this.poses = Array.isArray(o.poses) ? o.poses.filter(p => D.POSE[p]) : D.FREE_POSES.slice();
      if (this.poses.indexOf('stand') < 0) this.poses.unshift('stand');
      // The clocks. Always the reference's in a game; the tests shorten them.
      this.hideTicks = o.hideTicks > 0 ? Math.round(o.hideTicks) : R.hide;
      this.huntTicks = o.huntTicks > 0 ? Math.round(o.huntTicks) : R.hunt;

      this.phase = o.autostart ? 'intro' : 'lobby';
      this.phaseT = 0;
      this.clock = 0;                       // ticks left in the phase
      this.events = [];
      this.seq = 0;
      this.drops = [];
      this.result = null;                   // 'hiders' | 'seekers'
      this.foundCount = 0;
      this.huntT = 0;

      const names = this.rng.shuffle(D.NAMES.slice());
      this.actors = [];
      this.me = this.addActor({ name: o.name || 'You', human: true });
      for (let i = 1; i < R.players; i++) this.addActor({ name: names.pop() });
      for (const a of this.actors) if (!a.human) a.bot = new PV.HideBot(this, a);
      // The map's hiding places and its colours, worked out now rather than
      // on the first tick of the hide, where they would be a hitch.
      for (const b of this.world.boxes) { D.texels(b.mat); if (b.faces) for (const f in b.faces) D.texels(b.faces[f]); }
      PV.HideBot.spots(this.world);
      this.placeAll('lobby');
      // Bots in the lobby wear splashes of colour, as people there do.
      for (const a of this.actors) if (!a.human) this.splashes(a);
      if (this.phase === 'intro') this.beginIntro();
    }

    addActor(o) {
      const a = {
        id: this.actors.length, name: o.name, human: !!o.human, bot: null, role: 'none',
        x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, r: 0.3, h: 1.75,
        yaw: 0, lookYaw: 0, lookPitch: 0, aim: 0, ground: true, climb: null, bonk: false, stepped: 0,
        pose: 'stand', prev: 'stand', blend: 1, walk: 0, speed: 0, air: false, still: false, lock: false, t: 0,
        paint: B.newPaint(), paintVer: 1, mats: B.newMats(),
        soak: 0, hitT: -9999, found: false, foundT: 0, foundBy: -1,
        tank: R.tank, fireT: 0, refillT: 0,
        hold: 0, stick: [0, 0], jumpTap: false,
        ctl: { mx: 0, mz: 0, jump: false, fire: false, up: 0, side: 0 },
        stats: { finds: 0, hits: 0, shots: 0, survived: 0 }
      };
      this.actors.push(a);
      return a;
    }

    /* ---- helpers the bots and the view use ---- */

    static dir(yaw, pitch) { return dir(yaw, pitch); }
    eye(a) { return a.y + (a.role === 'seeker' ? EYE + 0.1 : EYE); }
    hiders() { return this.actors.filter(a => a.role === 'hider'); }
    seekers() { return this.actors.filter(a => a.role === 'seeker'); }
    left() { let n = 0; for (const a of this.actors) if (a.role === 'hider' && !a.found) n++; return n; }

    emit(e) {
      e.s = ++this.seq;
      this.events.push(e);
      if (this.events.length > 240) this.events.splice(0, this.events.length - 240);
    }

    /* ---- where people stand ---- */

    placeAll(where) {
      const w = this.world;
      const ring = where === 'lobby' ? w.lobbyRing : null;
      this.actors.forEach((a, i) => this.placeAt(a, ring[i % ring.length][0], ring[i % ring.length][1]));
      if (where === 'lobby') {
        const cx = w.lobbyAt[0] + 6, cz = w.lobbyAt[1] + 6;
        for (const a of this.actors) { a.yaw = Math.atan2(cx - a.x, -(cz - a.z)) + Math.PI; a.lookYaw = a.yaw; }
      }
    }

    placeAt(a, x, z) {
      const w = this.world;
      const y = w.floorAt(x, z, 4, 0.05);
      a.x = a.px = x; a.z = a.pz = z; a.y = a.py = Math.max(y, -5);
      a.vx = a.vy = a.vz = 0; a.ground = true; a.climb = null;
      a.pose = a.prev = 'stand'; a.blend = 1; a.lock = false;
    }

    /* ---- the round ---- */

    setPhase(p, ticks) {
      this.phase = p; this.phaseT = 0; this.clock = ticks || 0;
      this.emit({ k: 'phase', p: p });
    }

    beginIntro() {
      // Two seekers: you, if you asked to be one or the draw says so.
      let meSeeks = this.roleWant === 'seeker' || (this.roleWant === 'random' && this.rng.next() < R.seekers / R.players);
      const others = this.actors.filter(a => a !== this.me);
      this.rng.shuffle(others);
      const seekers = meSeeks ? [this.me, others[0]] : [others[0], others[1]];
      for (const a of this.actors) {
        a.role = seekers.indexOf(a) >= 0 ? 'seeker' : 'hider';
        a.soak = 0; a.found = false; a.lock = false; a.tank = R.tank;
        a.stats = { finds: 0, hits: 0, shots: 0, survived: 0 };
        if (!a.human) { B.fill(a.paint, D.WHITE); a.paintVer++; }
      }
      this.setPhase('intro', R.intro);
    }

    beginHide() {
      const w = this.world;
      let i = 0;
      for (const a of this.actors) {
        if (a.role === 'hider') {
          const p = w.hide[i++ % w.hide.length];
          this.placeAt(a, p[0], p[1]);
          a.yaw = a.lookYaw = this.rng.next() * TAU;
        }
      }
      this.setPhase('hide', this.hideTicks);
    }

    beginHunt() {
      const w = this.world;
      let i = 0;
      for (const a of this.actors) {
        if (a.role !== 'seeker') continue;
        const p = w.seek[i++ % w.seek.length];
        this.placeAt(a, p[0], p[1]);
        const h = w.hide[0];
        a.yaw = a.lookYaw = Math.atan2(h[0] - a.x, -(h[1] - a.z));
        a.lookPitch = 0; a.tank = R.tank;
      }
      this.setPhase('hunt', this.huntTicks);
    }

    end(who) {
      if (this.phase === 'result') return;
      this.result = who;
      for (const a of this.actors) if (a.role === 'hider' && !a.found) a.stats.survived = this.huntT;
      this.emit({ k: 'end', w: who });
      this.setPhase('result', R.result);
    }

    /* ---- inputs ---- */

    handle(inp) {
      const me = this.me;
      if (inp === 'start') { if (this.phase === 'lobby') this.beginIntro(); return; }
      if (inp === 'jump') { me.jumpTap = true; return; }
      if (inp === 'lock') { if (me.role !== 'seeker' && !me.found) { me.lock = !me.lock; this.emit({ k: 'lock', a: me.id, on: me.lock }); } return; }
      if (inp === 'reset') { if (this.canPaint(me)) { B.fill(me.paint, D.WHITE); me.paintVer++; this.emit({ k: 'fill', a: me.id }); } return; }
      if (!inp || typeof inp !== 'object') return;
      if ('hold' in inp) { me.hold = clamp(Math.floor(num(inp.hold)), 0, 127); return; }
      if (Array.isArray(inp.look)) {
        me.lookYaw = wrap(me.lookYaw + clamp(num(inp.look[0]), -3, 3));
        me.lookPitch = clamp(me.lookPitch + clamp(num(inp.look[1]), -3, 3), -1.5, 1.5);
        return;
      }
      if (Array.isArray(inp.move)) { me.stick = [clamp(num(inp.move[0]), -1, 1), clamp(num(inp.move[1]), -1, 1)]; return; }
      if (typeof inp.pose === 'string') { this.setPose(me, inp.pose); return; }
      if (typeof inp.role === 'string') {
        if (this.phase === 'lobby' && ['random', 'hider', 'seeker'].indexOf(inp.role) >= 0) this.roleWant = inp.role;
        return;
      }
      if (Array.isArray(inp.fill) && inp.fill.length === 3) {
        if (this.canPaint(me)) { B.fill(me.paint, [byte(inp.fill[0]), byte(inp.fill[1]), byte(inp.fill[2])]); me.paintVer++; this.emit({ k: 'fill', a: me.id }); }
        return;
      }
      if (Array.isArray(inp.paint) && inp.paint.length === 10) {
        const p = inp.paint.map(num);
        if (!this.canPaint(me)) return;
        // Only a point on (or right at) the body, facing some way.
        if (Math.abs(p[0]) > 1.2 || p[1] < -0.3 || p[1] > 2.2 || Math.abs(p[2]) > 1.2) return;
        const nl = Math.hypot(p[3], p[4], p[5]);
        if (nl < 0.5 || nl > 1.5) return;
        const r = clamp(p[6], 0.015, MAXP);
        if (B.dab(me.paint, p[0], p[1], p[2], p[3] / nl, p[4] / nl, p[5] / nl, r, [byte(p[7]), byte(p[8]), byte(p[9])])) me.paintVer++;
      }
    }

    canPaint(a) {
      if (a.found) return false;
      if (this.phase === 'lobby') return true;
      return a.role === 'hider' && (this.phase === 'intro' || this.phase === 'hide' || this.phase === 'hunt');
    }

    setPose(a, id) {
      if (!D.POSE[id] || a.role === 'seeker' || a.found || a.climb) return;
      if (a.human && this.poses.indexOf(id) < 0) return;
      if (a.pose === id) return;
      a.prev = a.pose; a.pose = id; a.blend = 0;
      if (a.human) this.emit({ k: 'pose', a: a.id, p: id });
    }

    /* ---- a tick ---- */

    step() {
      for (const inp of this.takeInputs()) this.handle(inp);
      this.phaseT++;
      if (this.clock > 0) this.clock--;

      switch (this.phase) {
        case 'intro': if (this.clock <= 0) this.beginHide(); break;
        case 'hide':
          if (this.clock > 0 && this.clock <= 5 * HZ && this.clock % HZ === 0) this.emit({ k: 'count', n: this.clock / HZ });
          if (this.clock <= 0) this.beginHunt();
          break;
        case 'hunt':
          this.huntT++;
          if (this.left() === 0) this.end('seekers');
          else if (this.clock <= 0) this.end('hiders');
          else if (this.clock <= 10 * HZ && this.clock % HZ === 0) this.emit({ k: 'count', n: this.clock / HZ, hunt: true });
          break;
        case 'result': if (this.clock <= 0) { this.finish(this.result); return; } break;
      }

      // Everybody's controls: the person's from their keys, the bots' from
      // their heads. The order is shuffled every tick so nobody always goes
      // first.
      const order = this.actors.slice();
      this.rng.shuffle(order);
      for (const a of order) {
        if (a.found) continue;
        if (a.human && !a.bot) this.humanControls(a);
        else if (a.bot) a.bot.think(this);
      }
      for (const a of order) this.body(a);
      this.water();
      for (const a of this.actors) if (!a.found) B.pose(a.mats, a);
    }

    /** The person's keys (or thumb) as a direction on the ground. */
    humanControls(a) {
      const c = a.ctl, h = a.hold;
      let f = (h & HOLD.fwd ? 1 : 0) - (h & HOLD.back ? 1 : 0), s = (h & HOLD.right ? 1 : 0) - (h & HOLD.left ? 1 : 0);
      if (!f && !s) { f = a.stick[1]; s = a.stick[0]; }
      const l = Math.hypot(f, s);
      if (l > 1) { f /= l; s /= l; }
      const k = h & HOLD.slow ? 0.45 : 1;
      const sy = Math.sin(a.lookYaw), cy = Math.cos(a.lookYaw);
      c.mx = (sy * f + cy * s) * k; c.mz = (-cy * f + sy * s) * k;
      c.up = f; c.side = s;
      c.jump = a.jumpTap; a.jumpTap = false;
      c.jumpHeld = !!(h & HOLD.jump);
      c.fire = !!(h & HOLD.fire);
      if (a.role === 'seeker') { a.yaw = a.lookYaw; a.aim = a.lookPitch; }
    }

    /** Move a body by its controls. */
    body(a) {
      const w = this.world, c = a.ctl;
      a.px = a.x; a.py = a.y; a.pz = a.z;
      a.t = this.tick * DT + a.id * 1.37;
      if (a.found) return;
      a.blend = Math.min(1, a.blend + DT / 0.22);
      let mx = c.mx, mz = c.mz;
      const frozen = a.lock || (a.role === 'seeker' && this.phase === 'intro') || this.phase === 'result';
      if (frozen) { mx = 0; mz = 0; }
      const moving = Math.hypot(mx, mz) > 0.05;
      if (moving && a.pose !== 'stand') { a.prev = a.pose; a.pose = 'stand'; a.blend = 0; }
      a.still = a.lock;

      if (a.climb) { this.climbing(a, frozen); }
      else {
        const sp = SPEED[a.role] || SPEED.none;
        const tx = mx * sp, tz = mz * sp;
        const acc = a.ground ? 16 : 4;
        a.vx += (tx - a.vx) * Math.min(1, acc * DT);
        a.vz += (tz - a.vz) * Math.min(1, acc * DT);
        if (c.jump && !frozen) {
          // A wall in front of a hider is a wall to climb.
          const fx = moving ? mx : Math.sin(a.yaw), fz = moving ? mz : -Math.cos(a.yaw);
          const fl = Math.hypot(fx, fz) || 1;
          const wall = a.role === 'hider' ? w.wallFacing(a, fx / fl, fz / fl) : null;
          if (wall && wall.top - a.y > 0.6) {
            a.climb = wall; a.vx = a.vy = a.vz = 0; a.ground = false;
            a.yaw = Math.atan2(-wall.nx, wall.nz);
            if (a.pose !== 'stand') { a.prev = a.pose; a.pose = 'stand'; a.blend = 0; }
            this.emit({ k: 'climb', a: a.id });
          } else if (a.ground) {
            a.vy = JUMP; a.ground = false;
            this.emit({ k: 'jump', a: a.id });
          }
        }
        a.vy -= GRAV * DT;
        const wasGround = a.ground, vy0 = a.vy;
        w.move(a, a.vx * DT, a.vy * DT, a.vz * DT);
        if (a.ground) { if (!wasGround && vy0 < -6) this.emit({ k: 'land', a: a.id }); a.vy = 0; }
        if (a.bonk && a.vy > 0) a.vy = 0;
        if (a.wallX) a.vx = 0;
        if (a.wallZ) a.vz = 0;
        a.air = !a.ground;
        // Face the way you go; a seeker faces where they look.
        if (a.role !== 'seeker' && moving) {
          const want = Math.atan2(mx, -mz);
          a.yaw = wrap(a.yaw + clamp(wrap(want - a.yaw), -12 * DT, 12 * DT));
        }
      }
      a.speed = Math.hypot(a.x - a.px, a.z - a.pz) / DT + (a.climb ? Math.abs(a.y - a.py) / DT : 0);
      a.walk += a.speed * DT * 2.4;
      if (a.y < -10) { const s = this.world.hide[0]; this.placeAt(a, s[0], s[1]); }
      // A seeker's gun.
      if (a.fireT > 0) a.fireT--;
      if (a.refillT > 0) a.refillT--;
      else if (a.tank < R.tank) a.tank = Math.min(R.tank, a.tank + R.refill * DT);
      if (a.role === 'seeker' && c.fire && !frozen && this.phase !== 'intro') this.shoot(a);
    }

    climbing(a, frozen) {
      const w = this.world, c = a.ctl, cl = a.climb;
      a.air = false;
      if (c.jump && !frozen) {
        // Off the wall, away from it.
        a.climb = null;
        a.vx = cl.nx * 3.8; a.vz = cl.nz * 3.8; a.vy = 5.2;
        a.yaw = Math.atan2(cl.nx, -cl.nz);
        this.emit({ k: 'jump', a: a.id });
        return;
      }
      const up = frozen ? 0 : c.up, side = frozen ? 0 : c.side;
      // Right, along the wall, as the body faces it.
      const fx = -cl.nx, fz = -cl.nz, rx = -fz, rz = fx;
      const dy = up * CLIMB_V * DT;
      const ds = side * CLIMB_V * 0.8 * DT;
      a.ground = false;
      const y0 = a.y;
      w.move(a, rx * ds + fx * 0.02, dy, rz * ds + fz * 0.02);
      if (a.ground && dy <= 0) { a.climb = null; return; }
      // Over the top: stand on it if there is room.
      if (a.y + 0.35 >= cl.top && up > 0) {
        const nx = a.x + fx * (a.r + 0.35), nz = a.z + fz * (a.r + 0.35);
        if (!w.blocked(nx, cl.top + 0.02, nz, a.r, a.h)) {
          a.x = nx; a.z = nz; a.y = cl.top; a.climb = null; a.ground = true; a.vx = a.vy = a.vz = 0;
          this.emit({ k: 'mantle', a: a.id });
          return;
        }
        a.y = Math.min(a.y, cl.top - 0.35);
      }
      // Still on a wall? Moving sideways can run off its end.
      const wall = w.wallFacing(a, fx, fz);
      if (!wall) {
        if (a.y > y0 - 1e-6 && up <= 0 && side === 0) return;
        a.climb = null; a.vx = a.vz = 0; a.vy = 0;
        return;
      }
      if (wall.nx !== cl.nx || wall.nz !== cl.nz) { a.climb = null; return; }
      cl.top = wall.top;
      a.vx = a.vy = a.vz = 0;
    }

    /* ---- water ---- */

    shoot(a) {
      if (a.fireT > 0 || a.tank < 1) return;
      a.fireT = Math.max(1, Math.round(HZ / R.rate));
      a.tank -= 1; a.refillT = R.refillDelay;
      a.stats.shots++;
      const yaw = a.lookYaw, pitch = a.lookPitch;
      const sp = 0.022;
      const f = dir(yaw, 0), rx = Math.cos(yaw), rz = Math.sin(yaw);
      const ey = this.eye(a);
      const ox = a.x + f[0] * 0.45 + rx * 0.22, oy = ey - 0.22, oz = a.z + f[2] * 0.45 + rz * 0.22;
      // The stream goes where the crosshair is: from the gun at the hip to
      // the first thing along the line of sight, and a touch above it,
      // because water falls.
      const L = dir(yaw, pitch);
      let T = this.world.ray(a.x, ey, a.z, L[0], L[1], L[2], 40);
      for (const h of this.actors) {
        if (h.role !== 'hider' || h.found) continue;
        const hit = B.rayBody(h.mats, a.x, ey, a.z, L[0], L[1], L[2], T);
        if (hit && hit.t < T) T = hit.t;
      }
      T = Math.max(1.5, T);
      let dx = a.x + L[0] * T - ox, dy = ey + L[1] * T - oy, dz = a.z + L[2] * T - oz;
      const dl = Math.hypot(dx, dy, dz);
      const cy = Math.hypot(dx, dz) / dl;
      const aimYaw = Math.atan2(dx, -dz) + (this.rng.next() - 0.5) * sp * 2;
      const aimPitch = Math.atan2(dy, Math.hypot(dx, dz)) + (this.rng.next() - 0.5) * sp * 2 + 0.035 * cy;
      const d = dir(aimYaw, aimPitch);
      // Start inside the room, never past a wall the muzzle is pressed to.
      const reach = this.world.ray(a.x, ey - 0.22, a.z, ox - a.x, 0, oz - a.z, 1);
      const k = Math.min(1, Math.max(0, reach - 0.05));
      this.drops.push({
        x: a.x + (ox - a.x) * k, y: oy, z: a.z + (oz - a.z) * k,
        vx: d[0] * DROP_V + a.vx * 0.4, vy: d[1] * DROP_V, vz: d[2] * DROP_V + a.vz * 0.4,
        a: a.id, t: 0
      });
      if (this.drops.length > 120) this.drops.shift();
      this.emit({ k: 'spray', a: a.id });
    }

    water() {
      const w = this.world;
      const out = [];
      for (const d of this.drops) {
        d.t++;
        d.vy -= DROP_G * DT;
        const sx = d.vx * DT, sy = d.vy * DT, sz = d.vz * DT;
        const L = Math.sqrt(sx * sx + sy * sy + sz * sz);
        const ux = sx / L, uy = sy / L, uz = sz / L;
        let t = w.ray(d.x, d.y, d.z, ux, uy, uz, L);
        const wallHit = w.hit.box ? { nx: w.hit.nx, ny: w.hit.ny, nz: w.hit.nz } : null;
        // Bodies: every hider still out there.
        let body = null, bodyHit = null;
        if (this.phase === 'hunt') {
          for (const h of this.actors) {
            if (h.role !== 'hider' || h.found) continue;
            const cx = h.mats[12], cy = h.mats[13], cz = h.mats[14];
            const mx = d.x + sx * 0.5 - cx, my = d.y + sy * 0.5 - cy, mz = d.z + sz * 0.5 - cz;
            if (mx * mx + my * my + mz * mz > (1.25 + L) * (1.25 + L)) continue;
            const hit = B.rayBody(h.mats, d.x, d.y, d.z, ux, uy, uz, Math.min(t, L) + DROP_R);
            if (hit && hit.t < t + DROP_R) { t = hit.t; body = h; bodyHit = hit; }
          }
        }
        if (body) {
          this.soakHit(body, this.actors[d.a], bodyHit);
          continue;
        }
        if (t < L) {
          const x = d.x + ux * t, y = d.y + uy * t, z = d.z + uz * t;
          if (this.tick % 2 === 0 || d.a === this.me.id) this.emit({ k: 'splash', x: x, y: y, z: z, nx: wallHit ? wallHit.nx : 0, ny: wallHit ? wallHit.ny : 1, nz: wallHit ? wallHit.nz : 0, a: d.a });
          continue;
        }
        d.x += sx; d.y += sy; d.z += sz;
        if (d.t < DROP_LIFE && d.y > -12) out.push(d);
      }
      this.drops = out;
      // Hiders dry off, slowly, once nobody has hit them for a while.
      for (const h of this.actors) {
        if (h.soak > 0 && this.tick - h.hitT > R.soakHold) h.soak = Math.max(0, h.soak - R.soakDecay * DT);
      }
    }

    soakHit(h, by, hit) {
      h.soak = Math.min(1, h.soak + R.soakPerDrop);
      h.hitT = this.tick;
      const q = hit.rest;
      if (B.dab(h.paint, q[0], q[1], q[2], q[3], q[4], q[5], 0.075, null, 0.5)) h.paintVer++;
      if (by) by.stats.hits++;
      this.emit({ k: 'hit', a: by ? by.id : -1, v: h.id, x: hit.x, y: hit.y, z: hit.z, soak: h.soak });
      if (h.soak >= 1 && !h.found) {
        h.found = true; h.foundT = this.tick; h.foundBy = by ? by.id : -1;
        h.stats.survived = this.huntT;
        h.lock = false; h.climb = null;
        this.foundCount++;
        if (by) by.stats.finds++;
        this.emit({ k: 'found', a: by ? by.id : -1, v: h.id, x: h.x, y: h.y + 0.9, z: h.z });
      }
    }

    /* ---- painting, for the bots ---- */

    /** Random blots of colour: how the bots look in the lobby. */
    splashes(a) {
      const P = ['#E84B3C', '#F2C230', '#3C8DE0', '#35A86B', '#9B59D0', '#EE6FA0', '#F28C2E', '#4DB6E8'].map(D.hex);
      B.fill(a.paint, P[this.rng.int(P.length)]);
      for (let i = 0; i < 14; i++) {
        const k = B.ALL[this.rng.int(B.ALL.length)], o = k * 6;
        B.dab(a.paint, B.T_REST[o], B.T_REST[o + 1], B.T_REST[o + 2], B.T_REST[o + 3], B.T_REST[o + 4], B.T_REST[o + 5], 0.1 + this.rng.next() * 0.14, P[this.rng.int(P.length)]);
      }
      a.paintVer++;
    }

    /* ---- the end ---- */

    /** How the round went for the person, for the view and the tests. */
    myResult() {
      const me = this.me;
      if (!this.result) return null;
      if (me.role === 'hider') return me.found ? 'lose' : 'win';
      return this.result === 'seekers' ? 'win' : 'lose';
    }

    myScore() {
      const me = this.me, s = me.stats;
      if (me.role === 'hider') return Math.round((me.found ? s.survived : this.huntT) / HZ * 10 + (me.found ? 0 : 500));
      return s.finds * 300 + (this.result === 'seekers' ? 500 + Math.round((this.huntTicks - this.huntT) / HZ) * 5 : 0);
    }

    /** Everybody, for the table: hiders who made it first. */
    table() {
      const rank = a => (a.role === 'hider' ? (a.found ? 1 : 0) : 2);
      return this.actors.slice().sort((p, q) => rank(p) - rank(q) || (q.stats.finds - p.stats.finds) || p.id - q.id);
    }
  }

  HideGame.HOLD = HOLD;
  HideGame.EYE = EYE;
  HideGame.GRAV = GRAV;
  HideGame.JUMP = JUMP;
  HideGame.SPEED = SPEED;
  HideGame.DROP_V = DROP_V;
  HideGame.DROP_G = DROP_G;
  HideGame.dir = dir;
  HideGame.wrap = wrap;
  PV.HideGame = HideGame;

})(window.PV);
