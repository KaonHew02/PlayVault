/* 突击小队 / Strike Squad — bots.

   The reference is online-only but "some of the games include bots"; here
   every place but yours is a bot, so they have to be worth fighting.

   A bot has the same body, the same guns and the same recoil as you. What
   it does not have is sight through walls: it only knows where an enemy is
   by seeing it (a ray from its eyes to the head or the chest), by hearing
   it (a gunshot carries 50 m, a suppressed one 14, footsteps 5), by being
   shot from somewhere, or by a radar sweep. What it knows it remembers for
   a while and goes looking.

   Difficulty changes the hands, not the rules:

                reaction   turn       first error   head aim
     easy       0.63 s     195°/s     7°            8%
     normal     0.40 s     320°/s     4.5°          18%
     hard       0.20 s     490°/s     2°            30%

   and each bot is up to fifteen per cent either side of its level, so a
   squad is not five copies of one player. Measured, one bot against a
   player standing in the open fifteen metres away: easy takes about two
   seconds to kill, hard under one.

   Everything a bot does goes through the controls a player has — move,
   look, fire, aim, jump, crouch, reload, switch, throw, use — and every
   random choice is drawn from the match's own RNG, so a match with bots in
   it still replays from its seed. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DEG = Math.PI / 180, TAU = Math.PI * 2, DT = 1 / 60;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  /* The range each class likes to fight at. */
  const PREFER = { ar: 18, smg: 9, shotgun: 6, sniper: 34, lmg: 20, pistol: 11, melee: 1.2 };

  class Bot {
    constructor(game, a) {
      this.g = game;
      this.a = a;
      const d = game.diff, r = game.rng;
      const v = 0.85 + r.next() * 0.3;
      this.react = Math.round([38, 24, 12][d] * v);
      this.turn = [3.4, 5.6, 8.5][d] / v;
      this.err0 = [7, 4.5, 2][d] * v;
      this.decay = [0.972, 0.965, 0.94][d];
      this.shake = [1.3, 0.85, 0.35][d];   // the error that never settles
      this.head = [0.08, 0.18, 0.3][d];
      this.nadeRate = [0.004, 0.009, 0.014][d];
      this.jumpy = [0, 0.004, 0.008][d];
      this.role = a.id % 3;
      // One guard a side stays home in capture the flag: the last of its
      // squad. Everyone else goes for the other flag.
      const mates = game.actors.filter(b => b.team === a.team);
      this.guard = mates.length > 2 && mates[mates.length - 1] === a;
      this.reset();
    }

    reset() {
      this.target = -1;
      this.acquired = 0;
      this.seen = -9999;
      this.mem = Object.create(null);    // enemy id -> {x, y, z, t}
      this.path = null;
      this.pi = 0;
      this.goal = null;
      this.goalT = 0;
      this.repath = 0;
      this.stuck = 0;
      this.checkT = 0;
      this.lx = this.a.x; this.lz = this.a.z;
      this.strafe = this.g.rng.next() < 0.5 ? -1 : 1;
      this.strafeT = 0;
      this.ex = 0; this.ey = 0;           // aim error, degrees
      this.aimHead = false;
      this.semi = 0;
      this.burstT = 0;
      this.crouchT = 0;
      this.hurtSeen = -9999;
      this.idleYaw = this.a.yaw;
      this.laneAt = null;
      this.fought = null;
    }

    /* ---- one tick ---- */

    think() {
      const g = this.g, a = this.a, c = a.ctl;
      c.mx = c.mz = 0;
      c.jump = c.fire = c.ads = c.reload = c.nade = c.pick = c.sprint = c.use = false;
      c.slot = -1; c.skill = -1;
      c.crouch = this.crouchT > 0;
      if (this.crouchT > 0) this.crouchT--;

      if ((g.tick + a.id) % 3 === 0) this.sense();
      // Shot from somewhere it cannot see: turn and look.
      if (a.lastHurt > this.hurtSeen) {
        this.hurtSeen = a.lastHurt;
        if (this.target < 0) this.lookAt = Math.atan2(a.hurtX - a.x, -(a.hurtZ - a.z));
      }

      const t = this.target >= 0 ? g.actors[this.target] : null;
      const sees = t && t.alive && g.tick - this.seen < 20;
      if (sees) {
        this.fight(t);
        // Carrying a flag or a bomb, or on the way to one: keep going and
        // shoot on the move rather than stopping to trade. A blade has to
        // get there, and the way there is not always a straight line.
        const blade = a.inv[a.cur] && a.inv[a.cur].s.cat === 'melee';
        const goal = blade ? { x: t.x, y: t.y, z: t.z, r: 0.8, push: true } : this.objective();
        if (goal && goal.push) {
          const sprint = c.sprint;
          c.mx = c.mz = 0;
          this.travel(goal, true);
          if (blade) c.sprint = sprint;
        }
        this.fought = g.tick;
      } else {
        this.travel(this.objective(), false);
      }
      this.upkeep(sees);
    }

    /** Who can it see or hear? Every third tick, staggered by id. */
    sense() {
      const g = this.g, a = this.a, w = g.world;
      const ey = g.eyeY(a);
      const fx = Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      const radar = g.actors.some(m => m.alive && !g.enemy(a, m) && m.fx.radar > 0);
      let best = null, bs = Infinity;
      for (const b of g.actors) {
        if (!b.alive || !g.enemy(a, b)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
        if (radar) this.remember(b);
        if (d > 80) continue;
        const cos = (dx * fx + dz * fz) / d;
        const loud = g.tick - b.noise < 40 && d < b.noiseR;
        const steps = d < (b.gear && b.gear.quiet ? 2.5 : 5) && !b.crouching && Math.hypot(b.vx, b.vz) > 1.5;
        if (cos < 0.45 && !loud && !steps && b.id !== this.target) continue;
        const see = w.clear(a.x, ey, a.z, b.x, b.y + b.h - 0.2, b.z) || w.clear(a.x, ey, a.z, b.x, b.y + b.h * 0.5, b.z);
        if (!see) { if (loud || steps) this.remember(b); continue; }
        this.remember(b);
        b.spotted = g.tick;
        const sc = d + (cos < 0.45 ? 15 : 0) - (b.id === this.target ? 10 : 0) - (b.carry >= 0 || b.hasBomb ? 12 : 0);
        if (sc < bs) { bs = sc; best = b; }
      }
      if (best) {
        if (best.id !== this.target) {
          this.target = best.id;
          this.acquired = g.tick;
          const r = g.rng;
          this.ex = (r.next() * 2 - 1) * this.err0;
          this.ey = (r.next() * 2 - 1) * this.err0 * 0.6;
          this.aimHead = r.next() < this.head;
        }
        this.seen = g.tick;
      } else if (this.target >= 0 && g.tick - this.seen > 90) {
        this.target = -1;
      }
    }

    remember(b) { this.mem[b.id] = { x: b.x, y: b.y, z: b.z, t: this.g.tick }; }

    /* ---- fighting ---- */

    fight(t) {
      const g = this.g, a = this.a, c = a.ctl;
      const gun = a.inv[a.cur], s = gun ? gun.s : null;
      if (!s) return;
      const ey = g.eyeY(a);
      const aimY = this.aimHead ? t.y + t.h - 0.2 : t.y + t.h * 0.58;
      const dx = t.x - a.x, dz = t.z - a.z, dy = aimY - ey;
      const d = Math.hypot(dx, dz) || 1e-3;
      // Where it should point, less whatever the recoil is doing to it.
      const wantYaw = Math.atan2(dx, -dz) + this.ex * DEG - a.kickY * DEG;
      const wantPitch = Math.atan2(dy, d) + this.ey * DEG - a.kickP * DEG;
      // The target running across its view throws its aim a little, and
      // no hand is ever perfectly still.
      const lat = Math.abs(t.vx * Math.cos(a.yaw) + t.vz * Math.sin(a.yaw));
      this.ex = this.ex * this.decay + (g.rng.next() - 0.5) * (lat * 0.06 * (3 - g.diff) + this.shake * 0.35);
      this.ey = this.ey * this.decay + (g.rng.next() - 0.5) * this.shake * 0.2;
      this.turnTo(wantYaw, wantPitch, this.turn);

      // Fire when the gun is on the target and the reaction has passed.
      const aimYaw = a.yaw + a.kickY * DEG, aimPitch = a.pitch + a.kickP * DEG;
      const offYaw = Math.abs(wrap(aimYaw - Math.atan2(dx, -dz)));
      const offPitch = Math.abs(aimPitch - Math.atan2(t.y + t.h * 0.6 - ey, d));
      const tol = Math.atan2(0.42, d) + 0.25 * DEG;
      const ready = g.tick - this.acquired >= this.react;
      const inRange = s.cat === 'melee' ? d < s.reach + 0.2 : (s.cat === 'shotgun' ? d < s.r1 * 1.3 : d < 90);
      let shoot = ready && inRange && offYaw < tol * 1.6 && offPitch < tol * 1.6;
      const gunHas = s.cat === 'melee' || gun.mag > 0;

      // Aim down the sights past close range, and always with a scope.
      c.ads = s.cat === 'sniper' || (d > 12 && s.cat !== 'shotgun' && s.cat !== 'melee');
      if (s.cat === 'sniper' && a.adsT < 0.85) shoot = false;

      // Auto guns fire in bursts at range, so the bloom has time to settle.
      if (s.fire === 'auto' && d > 22) {
        this.burstT = (this.burstT + 1) % 34;
        if (this.burstT > 16) shoot = false;
      }
      if (shoot && gunHas) {
        if (s.fire === 'auto' || s.fire === 'burst' || s.fire === 'melee') c.fire = true;
        else {
          if (this.semi <= 0) { c.fire = true; this.semi = Math.max(6, Math.round(s.interval + this.react * 0.25)); }
        }
      }
      if (this.semi > 0) this.semi--;

      // Close enough to cut, or nothing left to shoot.
      if (d < 2.4 && a.cur !== 2 && a.inv[2] && (g.rng.next() < 0.02 || !gunHas)) c.slot = 2;
      else if (!gunHas && gun.res <= 0 && a.cur === 0 && a.inv[1]) c.slot = 1;
      else if (a.cur === 2 && d > 4 && a.inv[0] && (a.inv[0].mag + a.inv[0].res > 0)) c.slot = 0;

      // Moving while fighting: close in or back off to its range, and
      // step side to side.
      const pref = PREFER[s.cat] || 15;
      if (d > pref * 1.35) c.mz = 1;
      else if (d < pref * 0.55 && s.cat !== 'melee' && s.cat !== 'shotgun') c.mz = -0.7;
      if (s.cat === 'melee') { c.mz = 1; c.sprint = !c.fire && d > 3; }
      if (--this.strafeT <= 0) {
        this.strafe = -this.strafe;
        this.strafeT = 24 + g.rng.int(55);
      }
      const probe = 0.9;
      const rx = Math.cos(a.yaw) * this.strafe, rz = Math.sin(a.yaw) * this.strafe;
      if (g.world.blocked(a.x + rx * probe, a.y + 0.3, a.z + rz * probe, a.r, 1.2)) { this.strafe = -this.strafe; this.strafeT = 30; }
      c.mx = this.strafe * (s.cat === 'sniper' && d > 25 ? 0.3 : 1);
      if (g.diff > 0 && d > 14 && g.rng.next() < 0.006 * g.diff) this.crouchT = 40 + g.rng.int(60);
      if (this.jumpy && g.rng.next() < this.jumpy && d < 18) c.jump = true;

      // A grenade over the top, when it is in throwing range.
      if (a.nades > 0 && d > 6.5 && d < 15 && g.rng.next() < this.nadeRate) {
        const v = 17, grav = 19;
        const th = 0.5 * Math.asin(clamp(d * grav / (v * v), 0, 1));
        a.pitch = clamp(th - 7 * DEG, -1, 1.2);
        c.nade = true;
      }
      this.remember(t);
      this.lookAt = null;
    }

    /** Turn toward a yaw and pitch at no more than `rate` radians a second. */
    turnTo(yaw, pitch, rate) {
      const a = this.a, m = rate * DT;
      a.yaw = wrap(a.yaw + clamp(wrap(yaw - a.yaw), -m, m));
      a.pitch = clamp(a.pitch + clamp(pitch - a.pitch, -m, m), -1.5, 1.5);
    }

    /* ---- going places ---- */

    /** Follow the way to `goal`. `fighting`: the aim belongs to the fight,
        so only the legs move — and nothing is planted or defused under fire. */
    travel(goal, fighting) {
      const g = this.g, a = this.a, c = a.ctl, w = g.world;
      if (!goal) return;
      const moved = !this.goal || Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 2.5;
      if (moved) { this.goal = goal; this.path = null; }
      else { this.goal.hold = goal.hold; this.goal.use = goal.use; this.goal.r = goal.r; }
      // Straight after a fight it is wherever the fight pushed it, which is
      // not on the old path: find the way again from here.
      if (!fighting && this.fought != null && g.tick - this.fought < 2) this.path = null;
      const gd = Math.hypot(this.goal.x - a.x, this.goal.z - a.z);
      const there = gd < (this.goal.r || 1.2) && Math.abs(this.goal.y - a.y) < 1.3;

      if (there) {
        this.path = null;
        if (fighting) return;
        if (this.goal.use) c.use = true;
        // Hold the spot, watching the way trouble would come from.
        const look = this.lookAt != null ? this.lookAt : this.watchYaw();
        this.turnTo(look, 0, 2.5);
        if (!this.goal.hold && !this.goal.use) this.goalT = 0;
        return;
      }
      if (!this.path || --this.repath <= 0) {
        this.path = w.path(a.x, a.z, a.y, this.goal.x, this.goal.z, this.goal.y);
        this.pi = 0;
        this.repath = 100 + g.rng.int(80);
        if (!this.path) { this.goal = null; this.goalT = 0; return; }
      }
      let wp = this.path[this.pi];
      while (wp && Math.hypot(wp.x - a.x, wp.z - a.z) < 0.55 && Math.abs(wp.y - a.y) < 0.6) {
        this.pi++;
        wp = this.path[this.pi];
      }
      if (!wp) { this.path = null; return; }
      const dx = wp.x - a.x, dz = wp.z - a.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, -dz);
      const off = Math.abs(wrap(want - a.yaw));
      // Look where it is going unless something turned its head.
      if (!fighting) {
        if (this.lookAt != null && g.tick - this.hurtSeen < 60) this.turnTo(this.lookAt, 0, this.turn);
        else this.turnTo(want, 0, 6);
      }
      // Walk in the direction of the waypoint, relative to where it faces.
      const rel = wrap(want - a.yaw);
      c.mz = Math.cos(rel);
      c.mx = Math.sin(rel);
      c.sprint = !fighting && off < 0.5 && g.tick - this.seen > 120 && d > 3;
      if (wp.jump && d < 1.4) c.jump = true;
      // Stuck: jump, sidestep, and in the end find another way.
      if (++this.checkT >= 30) {
        this.checkT = 0;
        const prog = Math.hypot(a.x - this.lx, a.z - this.lz);
        this.lx = a.x; this.lz = a.z;
        if (prog < 0.35) {
          this.stuck++;
          c.jump = true;
          if (this.stuck > 2) { this.path = null; this.goal = null; this.stuck = 0; this.strafe = -this.strafe; }
        } else this.stuck = 0;
      }
      if (this.stuck > 0) c.mx += this.strafe * 0.6;
    }

    /** Which way to watch while holding a spot: toward the enemy's side. */
    watchYaw() {
      const g = this.g, a = this.a;
      if ((g.tick + a.id * 17) % 150 === 0) {
        const m = this.lastMemory(12 * 60);
        if (m) this.idleYaw = Math.atan2(m.x - a.x, -(m.z - a.z));
        else this.idleYaw = wrap(this.idleYaw + (g.rng.next() - 0.5) * 2.4);
      }
      return this.idleYaw;
    }

    lastMemory(within) {
      const g = this.g;
      let best = null;
      for (const id in this.mem) {
        const m = this.mem[id], b = g.actors[+id];
        if (!b || !b.alive || g.tick - m.t > within) continue;
        if (!best || m.t > best.t) best = m;
      }
      return best;
    }

    /* ---- what the mode wants ---- */

    /** Where to go now: {x, y, z, r, hold, use}. */
    objective() {
      const g = this.g, a = this.a, w = g.world, r = g.rng;
      const m = g.modeKey;
      const at = (p, rad, hold, use, push) => ({ x: p.x, y: p.y || 0, z: p.z, r: rad || 1.2, hold: !!hold, use: !!use, push: !!push });
      const around = (p, rad) => {
        const q = w.randomCell(r, p, rad);
        return { x: q.x, y: q.y, z: q.z, r: 1.2, hold: true };
      };
      const keep = () => this.goal && this.goalT-- > 0 ? this.goal : null;

      if (m === 'dom') {
        const mine = g.points.filter(p => p.owner === a.team && p.who[1 - a.team] === 0);
        const want = g.points.filter(p => p.owner !== a.team || p.who[1 - a.team] > 0);
        const standing = g.points.find(p => Math.hypot(p.x - a.x, p.z - a.z) < 3.2 && (p.owner !== a.team || p.pct < 1));
        if (standing) return at(standing, 1.6, true);
        if (want.length) {
          want.sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
          const pick = want[Math.min(want.length - 1, this.role === 2 ? want.length - 1 : 0)];
          return at(pick, 2.2, true, false, Math.hypot(pick.x - a.x, pick.z - a.z) < 14);
        }
        if (mine.length) return keep() || (this.goalT = 300, around(mine[this.role % mine.length], 4));
      }

      if (m === 'ctf') {
        const own = g.flags[a.team], theirs = g.flags[1 - a.team];
        if (a.carry >= 0) return at({ x: own.hx, y: own.hy, z: own.hz }, 0.8, false, false, true);
        if (own.at === 'carried') { const c = g.actors[own.carrier]; return at(c, 1); }
        if (own.at === 'dropped') return at(own, 0.6, false, false, true);
        if (theirs.at === 'carried' && !this.guard) {
          const c = g.actors[theirs.carrier];
          return keep() || (this.goalT = 90, around(c, 4));
        }
        if (this.guard) return keep() || (this.goalT = 360, around({ x: own.hx, y: own.hy, z: own.hz }, 6));
        const lane = this.lane(theirs);
        if (lane) { lane.push = this.role === 1; return lane; }
        return at(theirs, 0.6, false, false, true);
      }

      if (m === 'snd') {
        const B = g.bomb;
        const plan = this.plan();
        if (a.team === g.attack) {
          if (a.hasBomb) { const s = g.sites[plan]; return at(s, 1.2, true, true, Math.hypot(s.x - a.x, s.z - a.z) < 18); }
          if (B && B.at === 'dropped') return at(B, 0.6, false, false, true);
          if (B && B.at === 'planted') return keep() || (this.goalT = 300, around(B, 6));
          const s = g.sites[plan];
          const lane = this.lane(s);
          if (lane) return lane;
          const carrier = B && B.at === 'carried' ? g.actors[B.carrier] : null;
          if (carrier && carrier.alive && Math.hypot(carrier.x - s.x, carrier.z - s.z) > 12) return keep() || (this.goalT = 60, around(carrier, 4));
          return keep() || (this.goalT = 240, around(s, 6));
        }
        if (B && B.at === 'planted') return at(B, 1.1, true, true, Math.hypot(B.x - a.x, B.z - a.z) > 3);
        const s = g.sites[(a.id + g.round) % 2];
        return keep() || (this.goalT = 360, around(s, 6));
      }

      // Hunting: the freshest sighting, else somewhere worth looking.
      const mem = this.lastMemory(10 * 60);
      if (mem) return at(mem, 1.5);
      if (g.teams) {
        const side = a.team === 0 ? w.spawns.b : w.spawns.a;
        const aim = side.length ? side[this.role % side.length] : { x: w.W / 2, z: w.D / 2, y: 0 };
        const mid = { x: (aim.x + w.W / 2) / 2, z: (aim.z + w.D / 2) / 2, y: 0 };
        return keep() || (this.goalT = 400, around(this.role === 1 ? aim : mid, 10));
      }
      return keep() || (this.goalT = 400, around(null, 0));
    }

    /** On the way to the far side: go by the left, the middle or the right,
        by role, until past half way. Everybody taking the one shortest
        line is how a match turns into a queue for the middle. Null once
        past it. */
    lane(dest) {
      const g = this.g, a = this.a, w = g.world;
      const mid = w.D / 2;
      if ((a.z - mid) * (dest.z - mid) > 0 || Math.abs(a.z - mid) < 4) return null;
      if (!this.laneAt) {
        const xs = [w.W * 0.14, w.W * 0.5, w.W * 0.86];
        const c = w.navCell(xs[(this.role + a.stats.d) % 3], mid, 0);
        this.laneAt = { x: (c % w.W) + 0.5, z: Math.floor(c / w.W) + 0.5, y: w.navH[c], done: false };
      }
      const L = this.laneAt;
      if (L.done || Math.hypot(L.x - a.x, L.z - a.z) < 3) { L.done = true; return null; }
      return { x: L.x, y: L.y, z: L.z, r: 2.5, hold: false, use: false, push: false };
    }

    /** Search and destroy: the site the attackers are going for, one pick
        per round for the whole side. */
    plan() {
      const g = this.g;
      if (!g.botPlan || g.botPlan.round !== g.round) g.botPlan = { round: g.round, site: g.rng.int(2) };
      return g.botPlan.site;
    }

    /* ---- the rest ---- */

    upkeep(fighting) {
      const g = this.g, a = this.a, c = a.ctl;
      const gun = a.inv[a.cur];
      if (!fighting) {
        if (gun && gun.s.cat !== 'melee' && gun.mag < gun.s.mag * 0.45 && gun.res > 0) c.reload = true;
        if (a.cur !== 0 && a.inv[0] && a.inv[0].mag + a.inv[0].res > 0 && a.swapT <= 0) c.slot = 0;
      }
      if (a.skills.length && (g.tick + a.id * 7) % 20 === 0) {
        a.skills.forEach((s, i) => {
          if (s.cd > 0 || c.skill >= 0) return;
          if (s.id === 'medkit' && a.hp < 50 && !fighting) c.skill = i;
          else if (s.id === 'shield' && fighting && a.hp < 70) c.skill = i;
          else if (s.id === 'stim' && !fighting && this.path && this.path.length > 4 && g.rng.next() < 0.3) c.skill = i;
          else if (s.id === 'radar' && !fighting && g.rng.next() < 0.08) c.skill = i;
        });
      }
    }
  }

  PV.FpsBot = Bot;

})(window.PV);
