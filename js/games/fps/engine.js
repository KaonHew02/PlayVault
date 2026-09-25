/* 突击小队 / Strike Squad — engine.

   A match: two squads of five (or eight soldiers each for themselves) on
   one of the eight maps, in one of the reference's seven modes, with bots
   filling every place but yours. It is a PV.LoopGame like every other
   real-time game here: a fixed 60 Hz tick, inputs applied on tick
   boundaries, every random draw from the seeded RNG, and nothing that
   reads the clock or the page — so a match replays from its seed and its
   input log, and the smoke test can play whole matches headless.

   Decisions worth naming:

   - **Hitscan, per pellet, against a head and a body.** A shot is a ray
     from the eye through a cone as wide as the gun's spread right now —
     hip or aimed, moving or still, plus the bloom its last shots left —
     and it stops at the first box or soldier. A soldier is a sphere for a
     head and an upright cylinder for the rest; the lowest two fifths of it
     are legs. Damage falls off between two ranges, per gun.
   - **Recoil is two things.** A kick that throws the aim and comes back on
     its own in a fraction of a second, and a smaller climb that stays, so
     a long burst walks up the wall unless you pull it down. Bots aim
     through the same recoil with the same hands.
   - **Armour soaks half of every hit until it is gone**, and health comes
     back on its own five seconds after the last hit. The medkit is for
     when five seconds is too long.
   - **No friendly fire.** Bullets pass through your own side; a grenade
     only hurts its thrower of the soldiers on its team.
   - **The lobby is a phase of the match**, not a screen before it: the
     world is built and everyone stands at their spawn while you choose a
     loadout, and `start` counts it in. A race skips it.

   Everything the view needs to draw or play a sound for is written to
   `events` with a sequence number; the engine never reads them back. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.FpsData;
  const HZ = 60, DT = 1 / HZ;
  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;

  const SPEED = 5.2;               // metres a second, walking
  const SPRINT = 1.38;
  const CROUCH_SPEED = 0.5;
  const ADS_SPEED = 0.62;
  const GRAVITY = 19;
  const JUMP_V = 6.8;              // a 1.2 m jump: onto a crate, onto sandbags
  const STAND_H = 1.8, CROUCH_H = 1.3;
  const EYE = 1.62, EYE_CROUCH = 1.12;
  const PITCH_MAX = 88 * DEG;
  const RADIUS = 0.35;

  const COUNT_T = 3 * HZ;          // the countdown before a round
  const ROUND_T = 4 * HZ;          // the pause between rounds
  const END_T = 5 * HZ;            // the scoreboard before the result card
  const RESPAWN_T = 3 * HZ;
  const PROTECT_T = 1.5 * HZ;
  const REGEN_DELAY = 5 * HZ, REGEN = 14;
  const DROP_T = 20 * HZ;

  const NADE_FUSE = 2.4 * HZ, NADE_R = 6.5, NADE_DMG = 135;
  const CAP_R = 3.6, CAP_T = 5 * HZ;
  const FLAG_R = 1.8, FLAG_BACK = 20 * HZ;
  const DOM_TICK = 2 * HZ;         // a held point scores once every two seconds
  const PLANT_T = 3 * HZ, DEFUSE_T = 5 * HZ, BOMB_T = 35 * HZ, SITE_R = 2.6, BOMB_R = 9;

  const HOLD = { fwd: 1, back: 2, left: 4, right: 8, sprint: 16, crouch: 32, fire: 64, ads: 128, use: 256 };

  const NAMES = ['Ghost', 'Viper', 'Hawk', 'Nova', 'Blaze', 'Echo', 'Raven', 'Titan', 'Onyx', 'Jinx',
    'Maverick', 'Rogue', 'Sable', 'Kestrel', 'Bishop', 'Havoc', 'Rook', 'Nomad', 'Specter', 'Cobra',
    'Wolf', 'Bandit', 'Ace', 'Tank', 'Mako', 'Dozer', 'Pixel', 'Reaper', 'Saint', 'Jester', 'Bravo', 'Zulu'];

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  /* ------------------------------------------------------------- shapes */

  /** Ray against a sphere; the entry distance or Infinity. */
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = ox - cx, ly = oy - cy, lz = oz - cz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : (c < 0 ? 0 : Infinity);
  }

  /** Ray against an upright cylinder from y0 to y1, capped. */
  function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
    let best = Infinity;
    const lx = ox - cx, lz = oz - cz;
    const a = dx * dx + dz * dz;
    if (a > 1e-12) {
      const b = lx * dx + lz * dz, c = lx * lx + lz * lz - r * r;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0) { const y = oy + dy * t; if (y >= y0 && y <= y1) best = t; }
      }
    }
    if (Math.abs(dy) > 1e-12) {
      for (const py of [y0, y1]) {
        const t = (py - oy) / dy;
        if (t >= 0 && t < best) {
          const x = lx + dx * t, z = lz + dz * t;
          if (x * x + z * z <= r * r) best = t;
        }
      }
    }
    return best;
  }

  /* ------------------------------------------------------------- engine */

  class FpsGame extends PV.LoopGame {
    /**
     * opts: { seed, mode, map, difficulty, autostart, name, loadout,
     *         quick (a quick battle: mode and map drawn from the seed) }
     */
    constructor(opts) {
      super(opts);
      const o = opts || {};
      let mode = D.MODES[o.mode] ? o.mode : 'tdm';
      let map = PV.FpsMaps.KEYS.indexOf(o.map) >= 0 ? o.map : null;
      if (o.mode === 'quick' || !D.MODES[o.mode]) mode = D.QUICK[this.rng.int(D.QUICK.length)];
      if (!map) map = PV.FpsMaps.KEYS[this.rng.int(PV.FpsMaps.KEYS.length)];
      this.modeKey = mode;
      this.rules = D.MODES[mode];
      this.mapKey = map;
      this.world = new PV.FpsWorld(map);
      this.diff = ({ easy: 0, normal: 1, hard: 2 })[o.difficulty];
      if (this.diff == null) this.diff = 1;
      this.teams = !!this.rules.teams;

      this.phase = 'lobby';
      this.phaseT = 0;
      this.events = [];                   // for the view; never read here
      this.seq = 0;
      this.actors = [];
      this.nades = [];
      this.drops = [];
      this.teamScore = [0, 0];
      this.roundWins = [0, 0];
      this.round = 1;
      this.attack = 0;                    // search and destroy: who has the bomb
      this.clock = this.rules.time * HZ;
      this.held = 0;
      this.analog = [0, 0];
      this.result = null;
      this.firstBlood = false;

      /* Soldiers: you, your side, theirs. */
      const names = this.rng.shuffle(NAMES.slice());
      const size = this.rules.size;
      this.me = this.addActor({ name: o.name || 'You', team: 0, human: true, loadout: o.loadout });
      if (this.teams) {
        for (let i = 1; i < size; i++) this.addActor({ name: names.pop(), team: 0 });
        for (let i = 0; i < size; i++) this.addActor({ name: names.pop(), team: 1 });
      } else {
        for (let i = 1; i < size; i++) this.addActor({ name: names.pop(), team: 0 });
        this.actors.forEach(a => { a.team = 10 + a.id; });
      }
      for (const a of this.actors) if (!a.human && PV.FpsBot) a.bot = new PV.FpsBot(this, a);

      /* The objectives. */
      const w = this.world;
      this.points = this.modeKey === 'dom' ? w.dom.map((p, i) => ({ i: i, x: p.x, y: p.y, z: p.z, owner: -1, cap: -1, pct: 0, who: [0, 0] })) : [];
      this.flags = this.modeKey === 'ctf' ? w.flags.map((p, t) => ({
        team: t, hx: p.x, hy: p.y, hz: p.z, x: p.x, y: p.y, z: p.z, at: 'home', carrier: -1, back: 0
      })) : [];
      this.sites = this.modeKey === 'snd' ? w.sites.map((p, i) => ({ i: i, x: p.x, y: p.y, z: p.z })) : [];
      this.bomb = null;

      this.startRound(true);
      if (o.autostart) this.begin();
    }

    /* ---- setup ---- */

    addActor(o) {
      const a = {
        id: this.actors.length, name: o.name, team: o.team, human: !!o.human, bot: null,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, r: RADIUS, h: STAND_H,
        ground: true, crouching: false, crouch: 0, stepped: 0,
        px: 0, py: 0, pz: 0, pyaw: 0, ppitch: 0,
        hp: 100, maxHp: 100, armor: 0, maxArmor: 0, alive: false, deadT: 0, respawnT: -1, protect: 0,
        inv: [null, null, null], cur: 0, swapT: 0, swapLen: 1, reloadT: 0, reloadLen: 1, cool: 0,
        burst: 0, latch: false, autoReload: 0, bloom: 0, kickP: 0, kickY: 0, adsT: 0,
        sprinting: false, sprintBlock: 0, fireT: 999, swingT: 999,
        nades: D.NADES, nadeCool: 0, skills: [], fx: { stim: 0, radar: 0, shield: 0, heal: 0 },
        gear: null, wear: null, lastHurt: -99999, hurtX: 0, hurtZ: 0, dmgBy: Object.create(null),
        lastKill: -99999, chain: 0, killer: -1, nemesis: -1,
        stats: {
          k: 0, d: 0, a: 0, score: 0, hs: 0, streak: 0, best: 0, caps: 0, flags: 0, returns: 0,
          plants: 0, defuses: 0, dmg: 0, melee: 0, nade: 0, kc: {}
        },
        gun: 0, carry: -1, hasBomb: false, plantT: 0, defuseT: 0,
        ctl: { mx: 0, mz: 0, jump: false, crouch: false, sprint: false, fire: false, ads: false, reload: false, slot: -1, nade: false, skill: -1, use: false, pick: false },
        loadout: null, anim: 0, noise: -9999, noiseR: 0, spotted: -9999
      };
      this.actors.push(a);
      this.setKit(a, o.loadout || null);
      return a;
    }

    /** Give a soldier a loadout: a player's, or a bot's drawn from the seed. */
    setKit(a, lo) {
      const L = lo || this.botKit(a);
      a.loadout = L;
      a.gear = D.gearStats(L.gear);
      a.wear = Object.assign({ head: 'cap', body: 'tee', hands: 'bare', feet: 'sneakers' }, L.gear || {});
      a.maxArmor = a.gear.armor;
      a.skills = (L.skills || []).filter(id => D.skill(id)).slice(0, 3).map(id => ({ id: id, cd: 0 }));
      this.arm(a);
    }

    /** Fill the three slots from the loadout — or from the ladder. */
    arm(a) {
      const L = a.loadout;
      const make = (e, fallback) => {
        const id = e && D.W[e.id] ? e.id : fallback;
        const s = D.stats(id, e && e.own);
        return { id: id, s: s, mag: s.mag, res: s.res, camo: (e && e.camo) || 'none', charm: (e && e.charm) || 'none' };
      };
      if (this.modeKey === 'gun') {
        const rung = D.LADDER[Math.min(a.gun, D.LADDER.length - 1)];
        a.inv = [rung === 'knife' ? null : make({ id: rung }, rung), null, make({ id: 'knife', camo: L.melee && L.melee.camo }, 'knife')];
        a.cur = a.inv[0] ? 0 : 2;
      } else {
        a.inv = [make(L.primary, 'striker'), make(L.secondary, 'p9'), make(L.melee, 'knife')];
        if (D.W[a.inv[0].id].slot !== 0) a.inv[0] = make(null, 'striker');
        if (D.W[a.inv[1].id].slot !== 1) a.inv[1] = make(null, 'p9');
        if (D.W[a.inv[2].id].slot !== 2) a.inv[2] = make(null, 'knife');
        a.cur = 0;
      }
      a.swapT = 0; a.reloadT = 0; a.cool = 0; a.burst = 0; a.adsT = 0;
    }

    /** What a bot carries: its class drawn from the seed, harder bots
        with better-kept guns and more armour. */
    botKit(a) {
      const r = this.rng, diff = this.diff;
      const cats = ['ar', 'ar', 'ar', 'smg', 'smg', 'smg', 'lmg', 'shotgun', 'sniper', 'ar', 'smg', 'sniper'];
      const cat = r.pick(cats);
      const pid = r.pick(D.byCat(cat));
      const up = () => {
        const lv = diff === 0 ? 0 : diff === 1 ? r.int(3) : 1 + r.int(4);
        return { dmg: lv, acc: lv, rel: r.int(lv + 1), mag: r.int(lv + 1) };
      };
      const att = {};
      for (const slot of D.ASLOTS) {
        const opts = D.ATTACH[slot].filter(x => D.fits(pid, slot, x.id));
        if (opts.length && r.chance(0.45)) att[slot] = r.pick(opts).id;
      }
      const g = s => D.GEAR[s][Math.min(D.GEAR[s].length - 1, diff === 0 ? r.int(2) : diff === 1 ? r.int(3) : 1 + r.int(3))].id;
      const camo = r.pick(D.CAMOS).id;
      return {
        primary: { id: pid, own: { up: up(), att: att }, camo: camo, charm: 'none' },
        secondary: { id: r.pick(D.byCat('pistol')), own: { up: up() } },
        melee: { id: r.pick(['knife', 'knife', 'machete', 'axe']) },
        skills: r.shuffle(['medkit', 'stim', 'radar', 'shield']).slice(0, 2 + (diff > 0 ? 1 : 0)),
        gear: { head: g('head'), body: g('body'), hands: g('hands'), feet: g('feet') }
      };
    }

    /** In the lobby only: the loadout the player chose there. */
    setLoadout(lo) {
      if (this.phase !== 'lobby' || !lo) return false;
      this.setKit(this.me, lo);
      this.revive(this.me, this.me.x, this.me.y, this.me.z, this.me.yaw);
      return true;
    }

    /* ---- what the view and the tests read ---- */

    get live() { return this.phase === 'live'; }
    get timeLeft() { return Math.max(0, Math.ceil(this.clock / HZ)); }
    weapon(a) { return (a || this.me).inv[(a || this.me).cur]; }
    eyeY(a) { return a.y + EYE + (EYE_CROUCH - EYE) * a.crouch; }
    enemy(a, b) { return a.team !== b.team; }
    teamOf(a) { return this.teams ? a.team : -1; }
    /** Forward, from a yaw and a pitch. */
    static dir(yaw, pitch, out) {
      const o = out || [0, 0, 0], cp = Math.cos(pitch);
      o[0] = Math.sin(yaw) * cp; o[1] = Math.sin(pitch); o[2] = -Math.cos(yaw) * cp;
      return o;
    }
    /** The ranking: team totals, or everyone by kills. */
    standings() {
      return this.actors.slice().sort((p, q) => (q.stats.k - p.stats.k) || (q.gun - p.gun) || (p.stats.d - q.stats.d) || (q.stats.score - p.stats.score) || (p.id - q.id));
    }

    event(k, data) {
      const e = data || {};
      e.s = ++this.seq; e.k = k; e.t = this.tick;
      this.events.push(e);
      if (this.events.length > 1200) this.events.splice(0, 400);
      return e;
    }

    /* ---- the tick ---- */

    step() {
      for (const a of this.actors) {
        a.px = a.x; a.py = a.y; a.pz = a.z; a.pyaw = a.yaw; a.ppitch = a.pitch;
      }
      this.readInputs();
      this.phaseT++;
      if (this.phase === 'lobby') return;
      if (this.phase === 'count') {
        this.frozen();
        if (this.phaseT >= COUNT_T) { this.phase = 'live'; this.phaseT = 0; this.event('go', { r: this.round }); }
      } else if (this.phase === 'live') {
        this.play();
      } else if (this.phase === 'round') {
        this.frozen();
        this.tickNades();
        if (this.phaseT >= ROUND_T) this.startRound(false);
      } else if (this.phase === 'end') {
        this.frozen();
        if (this.phaseT >= END_T) this.finish('end');
      }
      this.score = this.me.stats.score;
    }

    begin() {
      if (this.phase !== 'lobby') return;
      this.phase = 'count';
      this.phaseT = 0;
      this.event('count', { r: this.round });
    }

    readInputs() {
      const me = this.me, c = me.ctl;
      c.jump = c.reload = c.nade = c.pick = false;
      c.slot = -1; c.skill = -1;
      for (const x of this.takeInputs()) {
        if (typeof x === 'string') {
          if (x === 'start') this.begin();
          else if (x === 'skip' && this.phase === 'end') this.phaseT = END_T;
          else if (x === 'jump') c.jump = true;
          else if (x === 'reload') c.reload = true;
          else if (x === 'nade') c.nade = true;
          else if (x === 'pick') c.pick = true;
          else if (x === 'slot0' || x === 'slot1' || x === 'slot2') c.slot = +x[4];
          else if (x === 'next' || x === 'prev') c.slot = this.cycle(me, x === 'next' ? 1 : -1);
          else if (x === 'skill0' || x === 'skill1' || x === 'skill2') c.skill = +x[5];
          continue;
        }
        if (!x || typeof x !== 'object') continue;
        if (x.look && this.phase !== 'lobby') {
          me.yaw = wrap(me.yaw + clamp(num(x.look[0]), -3, 3));
          me.pitch = clamp(me.pitch + clamp(num(x.look[1]), -3, 3), -PITCH_MAX, PITCH_MAX);
        }
        if (x.hold != null) this.held = num(x.hold) | 0;
        if (x.move) this.analog = [clamp(num(x.move[0]), -1, 1), clamp(num(x.move[1]), -1, 1)];
      }
      const h = this.held;
      c.mz = ((h & HOLD.fwd) ? 1 : 0) - ((h & HOLD.back) ? 1 : 0);
      c.mx = ((h & HOLD.right) ? 1 : 0) - ((h & HOLD.left) ? 1 : 0);
      if (this.analog[0] || this.analog[1]) { c.mx = this.analog[0]; c.mz = this.analog[1]; }
      c.sprint = !!(h & HOLD.sprint);
      c.crouch = !!(h & HOLD.crouch);
      c.fire = !!(h & HOLD.fire);
      c.ads = !!(h & HOLD.ads);
      c.use = !!(h & HOLD.use);
    }

    /** The next slot that has something in it. */
    cycle(a, dir) {
      for (let k = 1; k <= 3; k++) {
        const s = ((a.cur + dir * k) % 3 + 3) % 3;
        if (a.inv[s]) return s;
      }
      return -1;
    }

    /** Before a round or after it: nobody moves, the player may look. */
    frozen() {
      for (const a of this.actors) {
        a.vx = a.vz = 0;
        if (a.alive && !a.ground) this.world.move(a, 0, -0.2, 0);
        a.kickP *= 0.85; a.kickY *= 0.85;
        a.fireT++;
      }
    }

    play() {
      // A new order every tick. In a fixed one the first soldier on the
      // list wins every duel that ends on the same tick, and with the
      // squads listed one after the other that was a whole side winning
      // more than its share.
      const order = this.order || (this.order = this.actors.slice());
      this.rng.shuffle(order);
      for (const a of order) if (a.alive && a.bot) a.bot.think();
      for (const a of order) {
        if (a.alive) this.sim(a);
        else this.dead(a);
      }
      this.separate();
      this.tickNades();
      this.tickDrops();
      this.tickMode();
      if (this.phase !== 'live') return;
      if (!(this.bomb && this.bomb.at === 'planted')) this.clock--;
      if (this.clock <= 0) this.timeUp();
    }

    /* ---- a soldier, one tick ---- */

    sim(a) {
      const c = a.ctl, w = this.world;
      if (a.protect > 0) a.protect--;
      a.fireT++; a.swingT++;
      if (a.nadeCool > 0) a.nadeCool--;
      if (a.sprintBlock > 0) a.sprintBlock--;
      for (const k in a.fx) if (a.fx[k] > 0) a.fx[k]--;
      for (const s of a.skills) if (s.cd > 0) s.cd--;
      if (a.fx.heal > 0) a.hp = Math.min(a.maxHp, a.hp + 60 / (2 * HZ));
      if (this.tick - a.lastHurt > REGEN_DELAY && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + REGEN / HZ);

      // Crouch: standing up needs the headroom to.
      if (c.crouch) a.crouching = true;
      else if (a.crouching && !w.blocked(a.x, a.y + 0.01, a.z, a.r, STAND_H)) a.crouching = false;
      a.h = a.crouching ? CROUCH_H : STAND_H;
      a.crouch += ((a.crouching ? 1 : 0) - a.crouch) * 0.22;

      const g = a.inv[a.cur], s = g ? g.s : null;
      const melee = !s || s.cat === 'melee';
      // Aiming down the sights.
      const wantAds = c.ads && a.swapT <= 0 && !melee;
      const adsTicks = Math.max(1, (s ? s.adsT : 0.2) * (1 - a.gear.ads) * HZ);
      a.adsT = wantAds ? Math.min(1, a.adsT + 1 / adsTicks) : Math.max(0, a.adsT - 1.5 / adsTicks);
      a.sprinting = c.sprint && c.mz > 0.3 && !a.crouching && a.adsT < 0.3 && a.sprintBlock <= 0 && !c.fire && a.ground;

      // Moving.
      let speed = SPEED * (s ? s.move : 1) * (1 + a.gear.speed) * (a.fx.stim > 0 ? 1.22 : 1);
      if (a.crouching) speed *= CROUCH_SPEED;
      else if (a.sprinting) speed *= SPRINT;
      speed *= 1 - (1 - ADS_SPEED) * a.adsT;
      if (a.carry >= 0) speed *= 0.92;
      let mx = c.mx, mz = c.mz;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
      const tvx = (sy * mz + cy * mx) * speed, tvz = (-cy * mz + sy * mx) * speed;
      const acc = a.ground ? 12 : 2.2;
      const k = Math.min(1, acc * DT);
      a.vx += (tvx - a.vx) * k;
      a.vz += (tvz - a.vz) * k;
      if (c.jump && a.ground && !a.crouching) {
        a.vy = JUMP_V; a.ground = false;
        this.event('jump', { a: a.id });
      }
      a.vy -= GRAVITY * DT;
      const wasUp = !a.ground, fallV = a.vy;
      w.move(a, a.vx * DT, a.vy * DT, a.vz * DT);
      if (a.ground && a.vy < 0) {
        if (wasUp && fallV < -4) this.event('land', { a: a.id, v: -fallV });
        a.vy = 0;
      }
      if (a.bonk && a.vy > 0) a.vy = 0;
      const moved = Math.hypot(a.x - a.px, a.z - a.pz);
      a.anim += moved * 1.9;

      this.arms(a);

      if (c.nade) this.throwNade(a);
      if (c.skill >= 0) this.useSkill(a, c.skill);
      if (c.pick) this.pickUp(a);
    }

    /* ---- weapons ---- */

    arms(a) {
      const c = a.ctl;
      if (c.slot >= 0 && c.slot !== a.cur && a.inv[c.slot]) this.swap(a, c.slot);
      if (a.swapT > 0) { a.swapT--; a.kickP *= 0.86; a.kickY *= 0.86; return; }
      const g = a.inv[a.cur];
      if (!g) { const s2 = this.cycle(a, 1); if (s2 >= 0) this.swap(a, s2); return; }
      const s = g.s;
      a.kickP *= 0.86; a.kickY *= 0.86;
      if (a.fireT > 6) a.bloom = Math.max(0, a.bloom - s.back / HZ);
      if (a.cool > 0) a.cool -= 1;

      if (s.fire === 'melee') {
        if (c.fire && a.cool <= 0) { this.swing(a, g); a.cool = Math.max(0, a.cool) + s.interval; }
        if (a.cool < 0) a.cool = 0;
        return;
      }

      // Reloading. A shotgun loading shell by shell stops to fire.
      if (a.reloadT > 0) {
        if (s.shell && c.fire && g.mag > 0 && !a.latch) a.reloadT = 0;
        else {
          a.reloadT--;
          if (a.reloadT === 0) this.reloaded(a, g);
          if (a.cool < 0) a.cool = 0;
          if (!c.fire) a.latch = false;
          return;
        }
      }
      if (a.autoReload > 0 && --a.autoReload === 0 && g.mag === 0 && g.res > 0) this.reload(a, g);
      if (c.reload && g.mag < s.mag && g.res > 0) { this.reload(a, g); return; }

      if (!c.fire) a.latch = false;
      if (g.mag <= 0) {
        if (c.fire && !a.latch) {
          a.latch = true;
          this.event('dry', { a: a.id });
          if (g.res > 0) this.reload(a, g);
          else { const s2 = a.inv[1] && a.cur !== 1 ? 1 : -1; if (s2 >= 0) this.swap(a, s2); }
        }
        if (a.cool < 0) a.cool = 0;
        return;
      }
      let want = false;
      if (s.fire === 'auto') want = c.fire;
      else if (s.fire === 'burst') {
        if (c.fire && !a.latch && a.burst === 0 && a.cool <= 0) { a.burst = s.burst; a.latch = true; }
        want = a.burst > 0;
      } else want = c.fire && !a.latch;
      if (want && a.cool <= 0 && !a.sprinting) {
        this.shoot(a, g, s);
        if (s.fire === 'burst') {
          a.burst--;
          a.cool = Math.max(0, a.cool) + s.interval + (a.burst === 0 ? s.gap * HZ : 0);
        } else {
          a.cool = Math.max(0, a.cool) + s.interval;
          if (s.fire !== 'auto') a.latch = true;
        }
        if (g.mag === 0) { a.burst = 0; if (g.res > 0) a.autoReload = 10; }
      } else if (a.cool < 0) a.cool = 0;
    }

    swap(a, slot) {
      const g = a.inv[slot];
      if (!g) return;
      a.cur = slot;
      a.swapT = a.swapLen = Math.max(4, Math.round(g.s.equip * HZ));
      a.reloadT = 0; a.adsT = 0; a.burst = 0; a.latch = true; a.cool = 0;
      this.event('swap', { a: a.id, w: g.id });
    }

    reload(a, g) {
      const s = g.s;
      if (s.cat === 'melee' || g.res <= 0 || g.mag >= s.mag || a.reloadT > 0) return;
      const f = (1 - a.gear.reload) * (a.fx.stim > 0 ? 0.75 : 1);
      const secs = s.shell ? s.reload * (g.mag === 0 ? 1.6 : 1) : s.reload * (g.mag === 0 ? 1.15 : 1);
      a.reloadT = a.reloadLen = Math.max(6, Math.round(secs * f * HZ));
      a.adsT = Math.min(a.adsT, 0.5);
      a.burst = 0;
      this.event('reload', { a: a.id, w: g.id, shell: !!s.shell });
    }

    reloaded(a, g) {
      const s = g.s;
      if (s.shell) {
        g.mag++; g.res--;
        this.event('shell', { a: a.id });
        if (g.mag < s.mag && g.res > 0) {
          const f = (1 - a.gear.reload) * (a.fx.stim > 0 ? 0.75 : 1);
          a.reloadT = a.reloadLen = Math.max(6, Math.round(s.reload * f * HZ));
        }
        return;
      }
      const take = Math.min(s.mag - g.mag, g.res);
      g.mag += take; g.res -= take;
    }

    /** How wide the cone is right now, in degrees. */
    spread(a, s) {
      let sp = s.hip + (s.ads - s.hip) * a.adsT;
      const mv = Math.min(1.2, Math.hypot(a.vx, a.vz) / SPEED);
      sp += s.walk * mv * (1 - 0.6 * a.adsT);
      if (!a.ground) sp += s.air;
      if (a.crouching && a.ground) sp *= 0.8;
      return sp + a.bloom;
    }

    shoot(a, g, s) {
      g.mag--;
      a.fireT = 0;
      a.sprintBlock = 18;
      a.protect = 0;
      a.noise = this.tick;
      a.noiseR = s.quiet ? 14 : (s.cat === 'sniper' ? 80 : 50);
      const sp = this.spread(a, s) * DEG;
      const yaw = a.yaw + a.kickY * DEG, pitch = clamp(a.pitch + a.kickP * DEG, -PITCH_MAX, PITCH_MAX);
      const f = FpsGame.dir(yaw, pitch);
      const r = [Math.cos(yaw), 0, Math.sin(yaw)];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const ox = a.x, oy = this.eyeY(a), oz = a.z;
      let end = null;
      for (let p = 0; p < s.pellets; p++) {
        const th = Math.tan(sp * Math.sqrt(this.rng.next())), ph = this.rng.next() * TAU;
        const cx = Math.cos(ph) * th, cy = Math.sin(ph) * th;
        let dx = f[0] + r[0] * cx + u[0] * cy, dy = f[1] + r[1] * cx + u[1] * cy, dz = f[2] + r[2] * cx + u[2] * cy;
        const L = Math.hypot(dx, dy, dz);
        dx /= L; dy /= L; dz /= L;
        const t = this.bullet(a, g, s, ox, oy, oz, dx, dy, dz);
        if (!end || p === 0) end = [ox + dx * t, oy + dy * t, oz + dz * t];
      }
      this.event('shot', { a: a.id, w: g.id, x: ox, y: oy, z: oz, tx: end[0], ty: end[1], tz: end[2], q: !!s.quiet });
      a.bloom = Math.min(s.bmax, a.bloom + s.bloom);
      a.kickP += s.kick * (0.85 + this.rng.next() * 0.3);
      a.kickY += (this.rng.next() - 0.5) * 2 * s.kickH;
      a.pitch = clamp(a.pitch + s.kick * 0.3 * DEG, -PITCH_MAX, PITCH_MAX);
    }

    /** One pellet. Returns how far it went. */
    bullet(a, g, s, ox, oy, oz, dx, dy, dz) {
      const w = this.world;
      const tw = w.ray(ox, oy, oz, dx, dy, dz, 220);
      const hn = [w.hit.nx, w.hit.ny, w.hit.nz], hb = w.hit.box;
      let best = tw, victim = null, zone = 0;
      for (const b of this.actors) {
        if (b === a || !b.alive || !this.enemy(a, b)) continue;
        const t = this.hitTest(b, ox, oy, oz, dx, dy, dz, best);
        if (t < best) { best = t; victim = b; zone = this._zone; }
      }
      if (victim) {
        const k = zone === 1 ? s.head : zone === 2 ? s.leg : 1;
        const dmg = s.dmg * this.falloff(s, best) * k;
        this.hurt(victim, a, dmg, { w: g.id, head: zone === 1, how: 'gun', x: ox + dx * best, y: oy + dy * best, z: oz + dz * best });
      } else if (tw < 220) {
        this.event('impact', {
          x: ox + dx * tw, y: oy + dy * tw, z: oz + dz * tw, nx: hn[0], ny: hn[1], nz: hn[2],
          m: hb ? hb.mat : 'ground', a: a.id
        });
      }
      return best;
    }

    /** Ray against a soldier: head, body or legs. Sets this._zone. */
    hitTest(b, ox, oy, oz, dx, dy, dz, maxT) {
      const headY = b.y + b.h - 0.2, bodyTop = b.y + b.h * 0.79;
      const th = raySphere(ox, oy, oz, dx, dy, dz, b.x, headY, b.z, 0.19);
      const tb = rayCyl(ox, oy, oz, dx, dy, dz, b.x, b.z, 0.31, b.y, bodyTop);
      if (th < maxT && th <= tb) { this._zone = 1; return th; }
      if (tb < maxT) {
        const y = oy + dy * tb - b.y;
        this._zone = y < b.h * 0.42 ? 2 : 0;
        return tb;
      }
      return Infinity;
    }

    falloff(s, d) {
      if (d <= s.r0) return 1;
      if (d >= s.r1) return s.far;
      return 1 - (1 - s.far) * (d - s.r0) / (s.r1 - s.r0);
    }

    /** A blade: the nearest enemy in front, within reach, not through a wall. */
    swing(a, g) {
      const s = g.s;
      a.swingT = 0; a.fireT = 0; a.protect = 0;
      const f = FpsGame.dir(a.yaw, 0);
      let best = null, bd = Infinity;
      const ey = this.eyeY(a);
      for (const b of this.actors) {
        if (b === a || !b.alive || !this.enemy(a, b)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > s.reach + 0.3 || Math.abs(b.y - a.y) > 1.5) continue;
        const cos = d > 1e-6 ? (dx * f[0] + dz * f[2]) / d : 1;
        if (cos < Math.cos(s.arc * DEG) && d > 0.8) continue;
        if (!this.world.clear(a.x, ey, a.z, b.x, b.y + 1.0, b.z)) continue;
        if (d < bd) { bd = d; best = b; }
      }
      this.event('melee', { a: a.id, w: g.id, hit: !!best });
      if (!best) return;
      const bf = FpsGame.dir(best.yaw, 0);
      const dx = a.x - best.x, dz = a.z - best.z, d = Math.hypot(dx, dz) || 1;
      const behind = (bf[0] * dx + bf[2] * dz) / d < -0.4;
      // The gun race ends on a blade, and that blade kills in one.
      const last = this.modeKey === 'gun' && D.LADDER[a.gun] === 'knife';
      const dmg = last ? 999 : s.dmg * (behind ? s.back2 : 1);
      this.hurt(best, a, dmg, { w: g.id, head: false, how: 'melee', back: behind, x: best.x, y: best.y + 1.1, z: best.z });
    }

    /* ---- damage ---- */

    hurt(v, a, dmg0, info) {
      if (!v.alive || this.phase !== 'live') return;
      if (v.protect > 0) return;
      if (a && a !== v && !this.enemy(a, v)) return;
      let dmg = dmg0;
      if (v.fx.shield > 0) dmg *= 0.5;
      if (v.armor > 0) {
        const soak = Math.min(v.armor, dmg * 0.5);
        v.armor -= soak; dmg -= soak;
      }
      v.hp -= dmg;
      v.lastHurt = this.tick;
      if (a) {
        v.hurtX = a.x; v.hurtZ = a.z;
        if (a !== v) {
          v.dmgBy[a.id] = (v.dmgBy[a.id] || 0) + dmg;
          a.stats.dmg += dmg;
          a.spotted = this.tick;
        }
      }
      this.event('hit', { a: a ? a.id : -1, v: v.id, d: dmg0, head: !!info.head, how: info.how, x: info.x, y: info.y, z: info.z, left: Math.max(0, v.hp) });
      if (v.hp <= 0) this.kill(v, a, info);
    }

    kill(v, a, info) {
      this.lastHow = info.how;              // the gun race's blade rule reads it
      v.alive = false;
      v.hp = 0;
      v.deadT = 0;
      v.killer = a ? a.id : -1;
      v.respawnT = this.rules.respawn ? (this.rules.wait || 3) * HZ : -1;
      v.stats.d++;
      v.stats.streak = 0;
      v.chain = 0;
      v.reloadT = 0; v.adsT = 0;
      const how = info.how;
      const g = D.W[info.w];
      if (a && a !== v) {
        const st = a.stats;
        st.k++; st.streak++; st.best = Math.max(st.best, st.streak);
        let pts = 100;
        if (info.head) { st.hs++; pts += 25; }
        if (how === 'melee') { st.melee++; pts += 50; }
        if (how === 'nade') st.nade++;
        const cat = how === 'nade' ? 'nade' : (g ? g.cat : 'ar');
        st.kc[cat] = (st.kc[cat] || 0) + 1;
        st.score += pts;
        // Medals.
        a.chain = this.tick - a.lastKill <= 4 * HZ ? a.chain + 1 : 1;
        a.lastKill = this.tick;
        const medals = [];
        if (!this.firstBlood) { this.firstBlood = true; medals.push('first'); }
        if (a.chain === 2) medals.push('double'); else if (a.chain === 3) medals.push('triple'); else if (a.chain >= 4) medals.push('multi');
        if (st.streak === 5 || st.streak === 10 || st.streak === 15 || st.streak === 20) medals.push('s' + st.streak);
        if (info.head) medals.push('head');
        if (how === 'melee') medals.push(info.back ? 'back' : 'blade');
        if (a.nemesis === v.id) { medals.push('revenge'); a.nemesis = -1; }
        if (how === 'gun' && info.x != null && Math.hypot(info.x - a.x, info.z - a.z) > 40) medals.push('long');
        for (const m of medals) { this.event('medal', { a: a.id, m: m }); if (m === 'revenge' || m === 'long') st.score += 50; }
        v.nemesis = a.id;
        // Everyone else who drew blood.
        for (const id in v.dmgBy) {
          const h = this.actors[+id];
          if (!h || h === a || v.dmgBy[id] < 25) continue;
          h.stats.a++; h.stats.score += 50;
          this.event('assist', { a: h.id, v: v.id });
        }
      } else if (a === v) {
        v.stats.score = Math.max(0, v.stats.score - 50);
      }
      v.dmgBy = Object.create(null);
      this.event('kill', { a: a ? a.id : -1, v: v.id, w: how === 'nade' ? 'nade' : (how === 'bomb' ? 'bomb' : info.w), head: !!info.head, how: how });

      // What it was carrying goes on the floor.
      const pg = v.inv[0];
      if (pg && this.modeKey !== 'gun' && pg.mag + pg.res > 0) {
        this.drops.push({ id: pg.id, s: pg.s, mag: pg.mag, res: pg.res, camo: pg.camo, charm: pg.charm, x: v.x, y: this.world.floorAt(v.x, v.z, v.y + 0.5), z: v.z, t: DROP_T, spin: this.rng.next() * TAU });
        if (this.drops.length > 24) this.drops.shift();
      }
      if (v.carry >= 0) this.dropFlag(v);
      if (v.hasBomb) this.dropBomb(v);
      v.plantT = v.defuseT = 0;
      this.onKill(v, a, info);
    }

    dead(a) {
      a.deadT++;
      if (a.respawnT > 0 && --a.respawnT === 0) this.respawn(a);
    }

    respawn(a) {
      const p = this.spawnPoint(a);
      this.arm(a);
      this.revive(a, p.x, p.y, p.z, p.yaw);
      a.protect = PROTECT_T;
      this.event('spawn', { a: a.id });
    }

    revive(a, x, y, z, yaw) {
      a.x = a.px = x; a.y = a.py = y; a.z = a.pz = z;
      a.yaw = a.pyaw = yaw || 0; a.pitch = a.ppitch = 0;
      a.vx = a.vy = a.vz = 0;
      a.alive = true; a.hp = a.maxHp; a.armor = a.maxArmor;
      a.ground = true; a.crouching = false; a.crouch = 0; a.h = STAND_H;
      a.nades = D.NADES; a.fx.stim = a.fx.radar = a.fx.shield = a.fx.heal = 0;
      a.bloom = 0; a.kickP = a.kickY = 0; a.adsT = 0; a.fireT = 999; a.burst = 0; a.latch = true;
      a.carry = -1; a.hasBomb = false; a.plantT = a.defuseT = 0;
      a.respawnT = -1; a.deadT = 0;
      for (const s of a.skills) s.cd = 0;
      if (a.bot) a.bot.reset();
    }

    /** Where to come back: your side's spawns, the one furthest from the
        enemy and out of their sight, never on top of somebody. */
    spawnPoint(a) {
      const W = this.world;
      let list;
      if (!this.teams) list = W.spawns.a.concat(W.spawns.b, W.spawns.s);
      else {
        const side = this.modeKey === 'snd' ? (a.team === this.attack ? 'a' : 'b') : (a.team === 0 ? 'a' : 'b');
        list = W.spawns[side];
      }
      if (!list.length) list = [{ x: W.W / 2, y: 0, z: W.D / 2, yaw: 0 }];
      let best = list[0], bs = -Infinity;
      for (const p of list) {
        let near = 60, seen = 0, crowd = false;
        for (const b of this.actors) {
          if (b === a || !b.alive) continue;
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d < 1.2) crowd = true;
          if (!this.enemy(a, b)) continue;
          if (d < near) near = d;
          if (d < 45 && W.clear(b.x, this.eyeY(b), b.z, p.x, p.y + 1.5, p.z)) seen++;
        }
        const sc = (crowd ? -100 : 0) + near - seen * 25 + this.rng.next() * 4;
        if (sc > bs) { bs = sc; best = p; }
      }
      return best;
    }

    /** Soldiers do not stand inside each other. */
    separate() {
      const A = this.actors, w = this.world;
      for (let i = 0; i < A.length; i++) {
        const p = A[i];
        if (!p.alive) continue;
        for (let j = i + 1; j < A.length; j++) {
          const q = A[j];
          if (!q.alive || Math.abs(p.y - q.y) > 1.6) continue;
          const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz, m = p.r + q.r;
          if (d2 >= m * m) continue;
          const d = Math.sqrt(d2) || 1e-3, push = (m - d) / 2;
          const nx = d2 > 1e-9 ? dx / d : 1, nz = d2 > 1e-9 ? dz / d : 0;
          w.move(p, -nx * push, 0, -nz * push);
          w.move(q, nx * push, 0, nz * push);
        }
      }
    }

    /* ---- grenades, skills, pickups ---- */

    throwNade(a) {
      if (a.nades <= 0 || a.nadeCool > 0 || a.swapT > 0) return;
      a.nades--;
      a.nadeCool = 50;
      a.protect = 0;
      const f = FpsGame.dir(a.yaw, clamp(a.pitch + 7 * DEG, -PITCH_MAX, PITCH_MAX));
      const ey = this.eyeY(a);
      this.nades.push({
        x: a.x + f[0] * 0.4, y: ey - 0.1 + f[1] * 0.4, z: a.z + f[2] * 0.4,
        vx: f[0] * 17 + a.vx * 0.4, vy: f[1] * 17 + 2.4, vz: f[2] * 17 + a.vz * 0.4,
        fuse: NADE_FUSE, owner: a.id, team: a.team, rest: false, spin: 0
      });
      a.noise = this.tick; a.noiseR = 12;
      this.event('nade', { a: a.id });
    }

    tickNades() {
      const w = this.world;
      for (let i = this.nades.length - 1; i >= 0; i--) {
        const n = this.nades[i];
        n.px = n.x; n.py = n.y; n.pz = n.z;
        if (!n.rest) {
          n.vy -= GRAVITY * DT;
          const sp = Math.hypot(n.vx, n.vy, n.vz);
          const step = sp * DT;
          if (step > 1e-6) {
            const dx = n.vx / sp, dy = n.vy / sp, dz = n.vz / sp;
            const t = w.ray(n.x, n.y, n.z, dx, dy, dz, step + 0.07);
            if (t < step + 0.07) {
              const nx = w.hit.nx, ny = w.hit.ny, nz = w.hit.nz;
              const back = Math.max(0, t - 0.07);
              n.x += dx * back; n.y += dy * back; n.z += dz * back;
              const vn = n.vx * nx + n.vy * ny + n.vz * nz;
              n.vx -= 1.45 * vn * nx; n.vy -= 1.45 * vn * ny; n.vz -= 1.45 * vn * nz;
              n.vx *= 0.72; n.vz *= 0.72; n.vy *= 0.72;
              if (Math.abs(vn) > 2.5) this.event('bounce', { x: n.x, y: n.y, z: n.z });
              if (ny > 0.7 && Math.hypot(n.vx, n.vy, n.vz) < 1.2) { n.rest = true; n.vx = n.vy = n.vz = 0; }
            } else {
              n.x += n.vx * DT; n.y += n.vy * DT; n.z += n.vz * DT;
            }
          }
          n.spin += sp * DT * 3;
          if (n.y < 0.05) { n.y = 0.05; n.vy = Math.abs(n.vy) * 0.3; n.vx *= 0.7; n.vz *= 0.7; if (Math.hypot(n.vx, n.vz) < 0.8 && n.vy < 1) n.rest = true; }
        }
        if (--n.fuse <= 0) {
          this.nades.splice(i, 1);
          this.explode(n.x, n.y, n.z, NADE_R, NADE_DMG, this.actors[n.owner], 'nade');
        }
      }
    }

    explode(x, y, z, R, maxDmg, owner, how) {
      this.event('boom', { x: x, y: y, z: z, r: R, big: how === 'bomb' });
      for (const b of this.actors) {
        if (!b.alive) continue;
        const cy = b.y + 0.9;
        const d = Math.hypot(b.x - x, cy - y, b.z - z);
        if (d > R) continue;
        const w = this.world;
        if (!w.clear(x, y + 0.2, z, b.x, cy, b.z) && !w.clear(x, y + 0.2, z, b.x, b.y + b.h - 0.2, b.z)) continue;
        let dmg = maxDmg * Math.pow(1 - d / R, 1.25) + 8;
        if (b === owner) dmg *= 0.5;
        this.hurt(b, how === 'bomb' ? null : owner, dmg, { w: how, how: how, x: b.x, y: cy, z: b.z });
      }
    }

    useSkill(a, i) {
      const sk = a.skills[i];
      if (!sk || sk.cd > 0) return;
      const def = D.skill(sk.id);
      if (sk.id === 'medkit') { if (a.hp >= a.maxHp) return; a.fx.heal = def.dur * HZ; }
      else a.fx[sk.id] = def.dur * HZ;
      sk.cd = def.cd * HZ;
      this.event('skill', { a: a.id, s: sk.id });
    }

    tickDrops() {
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        if (--d.t <= 0) { this.drops.splice(i, 1); continue; }
        for (const a of this.actors) {
          if (!a.alive || !a.inv[0] || a.inv[0].id !== d.id) continue;
          if (Math.hypot(a.x - d.x, a.z - d.z) > 1.3 || Math.abs(a.y - d.y) > 1.5) continue;
          const g = a.inv[0], cap = g.s.res + g.s.mag;
          if (g.res >= cap) continue;
          g.res = Math.min(cap, g.res + d.mag + d.res);
          this.drops.splice(i, 1);
          this.event('ammo', { a: a.id, w: d.id });
          break;
        }
      }
    }

    /** G: take the gun on the floor in place of your own. */
    pickUp(a) {
      if (this.modeKey === 'gun') return;
      let best = -1, bd = 2.2;
      this.drops.forEach((d, i) => {
        const dist = Math.hypot(a.x - d.x, a.z - d.z);
        if (dist < bd && Math.abs(a.y - d.y) < 1.6 && (!a.inv[0] || d.id !== a.inv[0].id)) { bd = dist; best = i; }
      });
      if (best < 0) return;
      const d = this.drops[best];
      const old = a.inv[0];
      a.inv[0] = { id: d.id, s: d.s, mag: d.mag, res: d.res, camo: d.camo, charm: d.charm };
      this.drops.splice(best, 1);
      if (old) this.drops.push({ id: old.id, s: old.s, mag: old.mag, res: old.res, camo: old.camo, charm: old.charm, x: a.x, y: this.world.floorAt(a.x, a.z, a.y + 0.5), z: a.z, t: DROP_T, spin: this.rng.next() * TAU });
      this.swap(a, 0);
      this.event('pickup', { a: a.id, w: d.id });
    }

    /* ---- the modes ---- */

    /** A round (or the whole match, for the modes without rounds) from the
        top: everyone at their spawns, full health, full magazines. */
    startRound(first) {
      if (!first) this.round++;
      if (this.modeKey === 'snd') this.attack = this.round <= 3 ? 0 : 1;
      this.nades = [];
      if (!first) this.drops = [];
      const used = new Set();
      const side = a => {
        if (!this.teams) return 'all';
        if (this.modeKey === 'snd') return a.team === this.attack ? 'a' : 'b';
        return a.team === 0 ? 'a' : 'b';
      };
      const W = this.world;
      for (const a of this.actors) {
        const s = side(a);
        const list = s === 'all' ? W.spawns.a.concat(W.spawns.b, W.spawns.s) : W.spawns[s];
        let p = null;
        for (let k = 0; k < list.length; k++) {
          const q = list[(a.id * 3 + k) % list.length];
          if (!used.has(q)) { p = q; break; }
        }
        if (!p) p = list.length ? this.rng.pick(list) : { x: W.W / 2, y: 0, z: W.D / 2, yaw: 0 };
        used.add(p);
        if (this.modeKey !== 'gun') this.arm(a);
        this.revive(a, p.x, p.y, p.z, p.yaw);
      }
      if (this.rules.rounds) this.clock = this.rules.time * HZ;
      if (this.modeKey === 'snd') {
        const atk = this.actors.filter(a => a.team === this.attack);
        const c = this.rng.pick(atk);
        c.hasBomb = true;
        this.bomb = { at: 'carried', carrier: c.id, x: c.x, y: c.y, z: c.z, t: 0, site: -1 };
      }
      if (!first) {
        this.phase = 'count';
        this.phaseT = 0;
        this.event('count', { r: this.round });
      }
    }

    onKill(v, a) {
      const m = this.modeKey;
      if (m === 'tdm' && a && a !== v) {
        this.teamScore[a.team]++;
        if (this.teamScore[a.team] >= this.rules.limit) this.endMatch(a.team);
      } else if (m === 'ffa' && a && a !== v) {
        if (a.stats.k >= this.rules.limit) this.endMatch(a.id);
      } else if (m === 'gun' && a && a !== v) {
        const g = this.actors[a.id];
        const onKnife = D.LADDER[g.gun] === 'knife';
        if (v && this.lastHow === 'melee' && !onKnife) {
          v.gun = Math.max(0, v.gun - 1);
          this.event('demote', { a: a.id, v: v.id });
        } else {
          g.gun++;
          if (g.gun >= D.LADDER.length) { g.stats.score += 300; this.endMatch(g.id); return; }
          const rung = D.LADDER[g.gun];
          this.arm(g);
          if (rung === 'knife') g.cur = 2;
          this.swap(g, g.cur);
          this.event('rung', { a: g.id, w: rung, n: g.gun });
        }
      } else if (this.rules.rounds) {
        this.checkRound();
      }
    }

    tickMode() {
      const m = this.modeKey;
      if (m === 'dom') this.tickPoints();
      else if (m === 'ctf') this.tickFlags();
      else if (m === 'snd') this.tickBomb();
    }

    tickPoints() {
      const tick = this.tick;
      for (const p of this.points) {
        const n = [0, 0], who = [];
        for (const a of this.actors) {
          if (!a.alive) continue;
          if (Math.hypot(a.x - p.x, a.z - p.z) <= CAP_R && Math.abs(a.y - p.y) < 2.5) { n[a.team]++; who.push(a); }
        }
        p.who = n;
        if (n[0] && n[1]) continue;                 // contested
        const t = n[0] ? 0 : n[1] ? 1 : -1;
        if (t < 0) { if (p.owner < 0 && p.pct > 0) p.pct = Math.max(0, p.pct - 0.5 / CAP_T); continue; }
        if (p.owner === t) { p.pct = 1; p.cap = t; continue; }
        const rate = (1 + 0.5 * (Math.min(3, n[t]) - 1)) / CAP_T;
        if (p.cap !== t) {
          p.pct -= rate * 2;
          if (p.pct <= 0) { p.pct = 0; p.cap = t; }
          continue;
        }
        p.pct += rate;
        if (p.pct >= 1) {
          p.pct = 1; p.owner = t;
          for (const a of who) { a.stats.caps++; a.stats.score += 150; }
          this.event('cap', { p: p.i, t: t });
        }
      }
      if (tick % DOM_TICK === 0) {
        for (const p of this.points) if (p.owner >= 0) this.teamScore[p.owner]++;
        for (const t of [0, 1]) if (this.teamScore[t] >= this.rules.limit) { this.endMatch(t); return; }
      }
    }

    tickFlags() {
      for (const f of this.flags) {
        if (f.at === 'carried') {
          const c = this.actors[f.carrier];
          if (!c || !c.alive) { f.at = 'dropped'; f.back = FLAG_BACK; continue; }
          f.x = c.x; f.y = c.y; f.z = c.z;
          continue;
        }
        if (f.at === 'dropped' && --f.back <= 0) {
          f.at = 'home'; f.x = f.hx; f.y = f.hy; f.z = f.hz;
          this.event('flag', { f: f.team, k: 'back' });
          continue;
        }
        for (const a of this.actors) {
          if (!a.alive) continue;
          if (Math.hypot(a.x - f.x, a.z - f.z) > FLAG_R || Math.abs(a.y - f.y) > 1.8) continue;
          if (a.team !== f.team) {
            if (a.carry >= 0) continue;
            f.at = 'carried'; f.carrier = a.id; a.carry = f.team;
            a.stats.score += 50;
            this.event('flag', { f: f.team, k: 'take', a: a.id });
            break;
          } else if (f.at === 'dropped') {
            f.at = 'home'; f.x = f.hx; f.y = f.hy; f.z = f.hz;
            a.stats.returns++; a.stats.score += 100;
            this.event('flag', { f: f.team, k: 'return', a: a.id });
            break;
          }
        }
      }
      // A carrier home with its own flag in place scores.
      for (const a of this.actors) {
        if (!a.alive || a.carry < 0) continue;
        const own = this.flags[a.team];
        if (own.at !== 'home' || Math.hypot(a.x - own.hx, a.z - own.hz) > FLAG_R + 0.4 || Math.abs(a.y - own.hy) > 1.8) continue;
        const theirs = this.flags[a.carry];
        theirs.at = 'home'; theirs.x = theirs.hx; theirs.y = theirs.hy; theirs.z = theirs.hz; theirs.carrier = -1;
        a.carry = -1;
        a.stats.flags++; a.stats.score += 300;
        this.teamScore[a.team]++;
        this.event('flag', { f: theirs.team, k: 'cap', a: a.id });
        if (this.teamScore[a.team] >= this.rules.limit) { this.endMatch(a.team); return; }
      }
    }

    dropFlag(a) {
      const f = this.flags[a.carry];
      a.carry = -1;
      if (!f) return;
      f.at = 'dropped'; f.carrier = -1; f.back = FLAG_BACK;
      f.x = a.x; f.y = this.world.floorAt(a.x, a.z, a.y + 0.5); f.z = a.z;
      this.event('flag', { f: f.team, k: 'drop', a: a.id });
    }

    tickBomb() {
      const B = this.bomb;
      if (!B) return;
      if (B.at === 'carried') {
        const c = this.actors[B.carrier];
        if (c && c.alive) {
          B.x = c.x; B.y = c.y; B.z = c.z;
          // Planting: hold use at a site, standing still.
          let site = -1;
          this.sites.forEach((s, i) => { if (Math.hypot(c.x - s.x, c.z - s.z) <= SITE_R && Math.abs(c.y - s.y) < 1.6) site = i; });
          const still = Math.hypot(c.vx, c.vz) < 1.2;
          if (site >= 0 && c.ctl.use && still && c.ground) {
            if (c.plantT === 0) this.event('bomb', { k: 'planting', a: c.id });
            if (++c.plantT >= PLANT_T) {
              c.plantT = 0; c.hasBomb = false;
              B.at = 'planted'; B.t = BOMB_T; B.site = site; B.carrier = -1;
              B.x = c.x; B.y = c.y; B.z = c.z;
              c.stats.plants++; c.stats.score += 200;
              this.event('bomb', { k: 'plant', a: c.id, site: site });
            }
          } else c.plantT = 0;
        }
      } else if (B.at === 'dropped') {
        for (const a of this.actors) {
          if (!a.alive || a.team !== this.attack) continue;
          if (Math.hypot(a.x - B.x, a.z - B.z) > 1.3 || Math.abs(a.y - B.y) > 1.8) continue;
          B.at = 'carried'; B.carrier = a.id; a.hasBomb = true;
          this.event('bomb', { k: 'take', a: a.id });
          break;
        }
      } else if (B.at === 'planted') {
        if (B.t % 60 === 0 || (B.t < 10 * HZ && B.t % 20 === 0)) this.event('beep', { x: B.x, y: B.y, z: B.z });
        let anyone = false;
        for (const a of this.actors) {
          if (!a.alive || a.team === this.attack) { a.defuseT = 0; continue; }
          const near = Math.hypot(a.x - B.x, a.z - B.z) <= 1.8 && Math.abs(a.y - B.y) < 1.6;
          if (near && a.ctl.use && a.ground) {
            if (a.defuseT === 0) this.event('bomb', { k: 'defusing', a: a.id });
            anyone = true;
            if (++a.defuseT >= DEFUSE_T) {
              a.stats.defuses++; a.stats.score += 250;
              B.at = 'defused';
              this.event('bomb', { k: 'defuse', a: a.id });
              this.endRound(1 - this.attack, 'defused');
              return;
            }
          } else a.defuseT = 0;
        }
        B.defusing = anyone;
        if (--B.t <= 0) {
          B.at = 'blown';
          this.explode(B.x, B.y + 0.3, B.z, BOMB_R, 400, null, 'bomb');
          this.event('bomb', { k: 'boom' });
          this.endRound(this.attack, 'bomb');
        }
      }
    }

    dropBomb(a) {
      a.hasBomb = false;
      const B = this.bomb;
      if (!B || B.at !== 'carried') return;
      B.at = 'dropped'; B.carrier = -1;
      B.x = a.x; B.y = this.world.floorAt(a.x, a.z, a.y + 0.5); B.z = a.z;
      this.event('bomb', { k: 'drop', a: a.id });
    }

    /** Rounds: a side with nobody standing loses it — unless a planted
        bomb is still ticking, which the defenders must still stop. */
    checkRound() {
      if (this.phase !== 'live') return;
      const alive = [0, 0];
      for (const a of this.actors) if (a.alive) alive[a.team]++;
      if (this.modeKey === 'snd') {
        const def = 1 - this.attack;
        if (!alive[def]) { this.endRound(this.attack, 'wiped'); return; }
        if (!alive[this.attack] && !(this.bomb && this.bomb.at === 'planted')) this.endRound(def, 'wiped');
        return;
      }
      if (!alive[0] || !alive[1]) this.endRound(alive[0] ? 0 : alive[1] ? 1 : -1, 'wiped');
    }

    endRound(t, why) {
      if (this.phase !== 'live') return;
      if (t >= 0) this.roundWins[t]++;
      this.teamScore = this.roundWins.slice();
      for (const a of this.actors) if (a.alive && a.team === t) a.stats.score += 50;
      this.event('round', { w: t, why: why, n: this.round });
      const lim = this.rules.limit;
      if (this.roundWins[0] >= lim || this.roundWins[1] >= lim || this.round >= lim * 2 - 1) {
        this.endMatch(this.roundWins[0] === this.roundWins[1] ? -1 : (this.roundWins[0] > this.roundWins[1] ? 0 : 1));
        return;
      }
      this.phase = 'round';
      this.phaseT = 0;
    }

    timeUp() {
      if (this.rules.rounds) {
        if (this.modeKey === 'snd') { this.endRound(1 - this.attack, 'time'); return; }
        const alive = [0, 0], hp = [0, 0];
        for (const a of this.actors) if (a.alive) { alive[a.team]++; hp[a.team] += a.hp; }
        const t = alive[0] !== alive[1] ? (alive[0] > alive[1] ? 0 : 1) : (hp[0] !== hp[1] ? (hp[0] > hp[1] ? 0 : 1) : -1);
        this.endRound(t, 'time');
        return;
      }
      if (this.teams) {
        const s = this.teamScore;
        this.endMatch(s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1));
      } else {
        this.endMatch(this.standings()[0].id);
      }
    }

    /** `w` is the winning team, or the winning soldier's id in a free-for-
        all, or -1 for a draw. */
    endMatch(w) {
      if (this.phase === 'end') return;
      this.phase = 'end';
      this.phaseT = 0;
      if (this.teams) this.result = w < 0 ? 'draw' : (w === this.me.team ? 'win' : 'lose');
      else this.result = w === this.me.id ? 'win' : 'lose';
      this.winner = w;
      const place = this.standings().indexOf(this.me) + 1;
      this.place = place;
      if (this.result === 'win') this.me.stats.score += 500;
      this.event('end', { w: w, result: this.result });
    }
  }

  FpsGame.HZ = HZ;
  FpsGame.HOLD = HOLD;
  FpsGame.SPEED = SPEED;
  FpsGame.EYE = EYE;
  FpsGame.EYE_CROUCH = EYE_CROUCH;
  FpsGame.STAND_H = STAND_H;
  FpsGame.CAP_R = CAP_R;
  FpsGame.SITE_R = SITE_R;
  FpsGame.PLANT_T = PLANT_T;
  FpsGame.DEFUSE_T = DEFUSE_T;
  FpsGame.BOMB_T = BOMB_T;
  FpsGame.CAP_T = CAP_T;
  FpsGame.RESPAWN_T = RESPAWN_T;
  FpsGame.NADE_R = NADE_R;
  FpsGame.raySphere = raySphere;
  FpsGame.rayCyl = rayCyl;
  PV.FpsGame = FpsGame;

})(window.PV);
