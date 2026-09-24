/* 人潮冲锋 / Crowd Rush — engine.

   On the real-time contract. Rebuilt 2026-09-24 to play the way the
   reference plays: the crowd is not a number with a width any more, it is
   RUNNERS, every one of them with a place on the road.

   - The crowd packs into a round blob on a hex lattice around its centre
     (SLOTS), each runner easing toward its own place, so the blob flows
     when you steer and closes up when people fall out of it. Past a width
     it grows along the road instead of across it.
   - A gate is taken by the whole crowd: whichever gate its middle is in
     when its front reaches the glass. That is the reference's rule — ×4 at
     27 is 108, not "most of 108".
   - A trap cuts the runners it touches and nobody else, so threading a gap
     between two saws with a crowd too wide for it costs exactly the edges.
   - A red squad is runners too. The two blobs close on each other and every
     pair that touches goes down together, which is the one-for-one trade the
     game is built on, arrived at by contact rather than by a formula.
   - The finish is a staircase climbed as a human tower (×1.0 to ×5.0, the
     bottom row left on each step), or on every third level a needle to stop
     for a bonus and a king to bring down in front of his castle.

   At most CAP runners a side are on the road; the rest wait in a reservoir
   (`extra`) and step in at the back as the front falls. The count is exact
   either way — only the drawing stops growing.

   Everything here is a function of the seed and the inputs, applied on tick
   boundaries, so a run replays exactly. Nothing reads the DOM or the clock. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const C = PV.CrowdCourse;
  const HALF = C.HALF, SP = C.SP, CAP = C.CAP;
  const EDGE = HALF - 0.28;          // how far off centre a runner's middle may stand
  const FORM_HALF = 2.3;             // a crowd wider than this grows along the road
  const RUN = 0.125;                 // metres a tick at speed 1: 7.5 m/s
  const STEER = 0.12;                // metres a tick the middle slides sideways
  const FOLLOW = 0.2;                // how fast a runner closes on its place
  const CONTACT = 0.4;               // two runners this close have met
  const LOOK = 0.5;                  // how far past its reach a runner sees a blade coming
  const DODGE = 0.065;               // how far a tick it can step aside

  const KING_R = 0.78;               // the king is a runner at two and a half times the size
  const SWING = 66, SWING_HIT = 42;  // his swing: wind up, strike on tick 42
  const KING_REACH = KING_R + 1.35;  // who a strike can reach
  const KING_ARC = 1.45;             // either side of where he faces, radians
  const KING_TIME = 300;             // a full ring round him fells him in 5 s

  const HAMMER_L = 3.9, HAMMER_PIVOT = 4.6;   // the pendulum: arm length, pivot height

  const GAUGE_AUTO = 270;            // the needle stops itself after 4.5 s
  const GATHER = 54, STEP_T = 13, CHEST_T = 70, CHEER_T = 80;
  const WON_T = 120, LOST_T = 70;

  const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

  function hash(i, salt) {
    let h = Math.imul(i + 11, 374761393) + Math.imul(salt || 7, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ------------------------------------------------------ formations */

  /* Your crowd: hex lattice points sorted by distance from the middle, so
     the first n of them are a round blob of n, and runner i keeps place i
     whatever the count — a gate grows the blob from the outside. Nothing
     wider than FORM_HALF, so a big crowd lengthens down the road and still
     has room to pick a gate. A little jitter, or it reads as a pattern. */
  const SLOTS = (function () {
    const rowH = SP * Math.sqrt(3) / 2, pts = [];
    for (let r = -40; r <= 40; r++) {
      for (let c = -9; c <= 9; c++) {
        const x = (c + ((r & 1) ? 0.5 : 0)) * SP;
        if (Math.abs(x) > FORM_HALF + 1e-9) continue;
        const z = r * rowH;
        pts.push({ x: x, z: z, d: x * x + z * z });
      }
    }
    pts.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
    const x = new Float64Array(CAP), z = new Float64Array(CAP);
    const front = new Float64Array(CAP + 1), back = new Float64Array(CAP + 1), side = new Float64Array(CAP + 1);
    for (let i = 0; i < CAP; i++) {
      x[i] = pts[i].x + (hash(i, 3) - 0.5) * 0.07;
      z[i] = pts[i].z + (hash(i, 5) - 0.5) * 0.07;
      front[i + 1] = Math.max(front[i], z[i]);
      back[i + 1] = Math.min(back[i], z[i]);
      side[i + 1] = Math.max(side[i], Math.abs(x[i]));
    }
    return { x: x, z: z, front: front, back: back, side: side };
  })();

  /** Where runner i of a red squad of m stands: a block, front row first,
      so the block keeps its shape and slides at you as its front falls. */
  function squadSlot(m, i, out) {
    const n = Math.max(1, Math.min(CAP, m));
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    out.x = (c - (inRow - 1) / 2) * SP;
    out.z = (r - (rows - 1) / 2) * SP;
    return out;
  }

  /* Round the king: rings of places, the side facing the way you came in
     filled first, so the crowd pours round him from the front. */
  const RING = (function () {
    const x = new Float64Array(CAP), z = new Float64Array(CAP);
    let i = 0, first = 0;
    for (let j = 0; i < CAP; j++) {
      const r = KING_R + 0.42 + j * 0.44;
      const k = Math.floor(2 * Math.PI * r / 0.44);
      if (j === 0) first = k;
      const order = [];
      for (let a = 0; a < k; a++) {
        const th = (a / k) * 2 * Math.PI;
        order.push({ th: th > Math.PI ? th - 2 * Math.PI : th });
      }
      order.sort((p, q) => Math.abs(p.th) - Math.abs(q.th) || p.th - q.th);
      for (const o of order) {
        if (i >= CAP) break;
        // th = 0 is the side toward the player (-z).
        x[i] = Math.sin(o.th) * r;
        z[i] = -Math.cos(o.th) * r;
        i++;
      }
    }
    return { x: x, z: z, first: first };
  })();

  /* --------------------------------------------------------- the traps */

  /* Every trap is a pure function of the tick. The view calls these same
     functions, so a blade is drawn exactly where it cuts. */
  function sawX(f, s, tick) {
    return s.amp ? s.x + Math.sin((tick + f.phase) * s.slide) * s.amp : s.x;
  }
  function barAngle(f, tick) { return (tick + f.phase) * f.spin; }
  function hammerX(f, tick) { return Math.sin((tick + f.phase) * f.swing) * f.amp; }
  /** 1 all the way up, 0 all the way down (and lethal). */
  function pressLift(f, b, tick) {
    const p = (((tick + f.phase + b.off) % f.period) + f.period) % f.period / f.period;
    if (p < 0.38) return 1;
    if (p < 0.46) return 1 - (p - 0.38) / 0.08;
    if (p < 0.7) return 0;
    return (p - 0.7) / 0.3;
  }
  /** 1 with the spikes out, 0 with them sunk. */
  function spikesUp(f, tick) {
    const p = (((tick + f.phase) % f.period) + f.period) % f.period / f.period;
    if (p < 0.45) return 0;
    if (p < 0.5) return (p - 0.45) / 0.05;
    if (p < 0.9) return 1;
    return 1 - (p - 0.9) / 0.1;
  }
  /** How far along the road a trap reaches either side of its z. */
  function trapReach(f) {
    if (f.kind === 'bar') return f.len + 0.4;
    if (f.kind === 'saws') return 1.4;
    return (f.d || 1.2) / 2 + 0.3;
  }

  /** Does trap f, at this tick, cut a runner standing at (x, z)? */
  function cuts(f, x, z, tick) {
    const dz = z - f.z;
    if (f.kind === 'saws') {
      for (const s of f.saws) {
        const dx = x - sawX(f, s, tick), r = s.r + 0.13;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    }
    if (f.kind === 'bar') {
      const bx = x - (f.x || 0);
      if (bx * bx + dz * dz < 0.36 * 0.36) return true;        // the post
      const a = barAngle(f, tick), cx = Math.cos(a), cz = Math.sin(a);
      const t = clamp(bx * cx + dz * cz, -f.len, f.len);
      const ex = bx - t * cx, ez = dz - t * cz;
      return ex * ex + ez * ez < 0.24 * 0.24;
    }
    if (f.kind === 'hammer') {
      // It hangs from a pivot above the road, so at the ends of its swing the
      // head is up in the air and only the middle of the road is struck.
      const hx = hammerX(f, tick);
      const hy = HAMMER_PIVOT - HAMMER_L * Math.cos(Math.asin(clamp(hx / HAMMER_L, -1, 1)));
      return hy < 1.15 && Math.abs(x - hx) < 0.72 && Math.abs(dz) < 0.6;
    }
    if (f.kind === 'press') {
      if (Math.abs(dz) > f.d / 2 + 0.05) return false;
      for (const b of f.blocks) {
        if (pressLift(f, b, tick) < 0.12 && Math.abs(x - b.x) < b.w / 2 + 0.05) return true;
      }
      return false;
    }
    if (f.kind === 'spikes') {
      return spikesUp(f, tick) > 0.6 && x > f.x0 && x < f.x1 && Math.abs(dz) < f.d / 2;
    }
    return false;
  }

  /* ----------------------------------------------------------- engine */

  PV.CrowdRush = class CrowdRush extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      // A level brings its own course (worked out from its number); a free
      // run takes a course and a difficulty from the options.
      if (o.level != null) {
        this.spec = C.level(o.level);
        this.level = this.spec.level;
      } else {
        this.courseKey = C.COURSES[o.course] ? o.course : 'ice';
        this.diffKey = ({ easy: 1, normal: 1, hard: 1 })[o.difficulty] ? o.difficulty : 'normal';
        this.spec = C.free(this.courseKey, this.diffKey);
        this.level = null;
      }
      this.course = C.build(this.spec, this.rng);
      this.theme = this.course.theme;
      this.speed = RUN * this.spec.speed;

      // 'ready' stands at the start line with the shop open; 'run' is the
      // road; 'fight' a squad; 'gauge' the needle; 'boss' the king; 'tower'
      // the stairs; 'won' and 'lost' a moment to see it before the card.
      this.phase = o.autostart ? 'run' : 'ready';
      this.z = 0; this.x = 0; this.aim = 0;
      this.lastZ = 0; this.lastX = 0;

      this.ux = new Float64Array(CAP); this.uz = new Float64Array(CAP);
      this.pux = new Float64Array(CAP); this.puz = new Float64Array(CAP);
      this.uid = new Int32Array(CAP); this.born = new Int32Array(CAP);
      // Each runner's place in the blob. Places are not closed up the moment
      // someone falls: a crowd threading past a saw that re-packed toward its
      // middle every tick would pour its survivors into the blade. The gaps
      // close once nothing sharp is near (repack).
      this.uslot = new Int32Array(CAP); this.slotTop = 0;
      this.units = 0; this.extra = 0;

      this.fx = new Float64Array(CAP); this.fz = new Float64Array(CAP);
      this.pfx = new Float64Array(CAP); this.pfz = new Float64Array(CAP);
      this.fid = new Int32Array(CAP);
      this.foes = 0; this.foeExtra = 0;

      this.dead = new Uint8Array(CAP);
      this.fdead = new Uint8Array(CAP);
      this.nextId = 1;

      // One-shot features (gates, squads, boosts) fire in order; traps cut
      // for as long as anyone is standing in them.
      const list = this.course.features;
      this.shots = [];
      this.traps = [];
      list.forEach((f, i) => {
        if (f.kind === 'gates' || f.kind === 'squad' || f.kind === 'boost') this.shots.push(i);
        else this.traps.push(i);
      });
      this.at = 0;
      this.used = Object.create(null);      // feature index -> lane taken (-1 none)
      this.beatenAt = Object.create(null);  // squad index -> true
      this.clash = null;
      this.boostT = 0;

      this.gaugeT = 0; this.gaugeVal = null; this.gaugeWait = 0;
      this.king = null;
      this.tower = null;
      this.mult = 0;
      this.endT = 0;

      this.gained = 0; this.lost = 0; this.beaten = 0;
      this.events = [];                     // for the view; never read here
      this.seq = 0;

      this.boost = { units: 1, income: 1 };
      this.setBoost(o.boost);
      this.peak = this.count;
    }

    /* ---- what the view and the tests read ---- */

    get count() { return this.units + this.extra; }
    get n() { return this.count; }
    get foeCount() { return this.foes + this.foeExtra; }
    get ready() { return this.phase === 'ready'; }
    get fighting() { return !!this.clash; }
    /** How far off centre the middle may go and keep the blob on the road. */
    get reach() { return Math.max(0, EDGE - SLOTS.side[Math.min(this.slotTop, CAP)] - 0.02); }
    get front() { return SLOTS.front[Math.min(this.slotTop, CAP)]; }
    get back() { return SLOTS.back[Math.min(this.slotTop, CAP)]; }
    get progress() { return clamp(this.z / this.course.finish, 0, 1); }

    /** Upgrades, bought at the start line only: a boost that could land
        mid-course would be a different run from the same seed. */
    setBoost(b) {
      if (this.phase !== 'ready' && this.tick > 0) return false;
      if (this.tick > 0) return false;
      const src = b || {};
      this.boost = {
        units: clamp((src.units | 0) || 1, 1, BOOSTS.units.max),
        income: clamp((src.income | 0) || 1, 1, BOOSTS.income.max)
      };
      this.units = 0; this.extra = 0; this.slotTop = 0;
      this.addUnits(this.boost.units);
      this.peak = this.count;
      return true;
    }

    /** What a run pays. The stairs multiply it; the king pays well. */
    get coins() {
      const inc = 1 + 0.1 * (this.boost.income - 1);
      const lv = this.spec.level;
      let base;
      if (this.overReason === 'climbed') base = (24 + lv * 3) * this.mult + (this.tower && this.tower.top ? 40 : 0);
      else if (this.overReason === 'stormed') base = 110 + lv * 10;
      else base = 8 + 30 * this.progress;
      return Math.round(base * inc);
    }

    event(k, x, z, extra) {
      const e = { s: ++this.seq, k: k, x: x, z: z, t: this.tick };
      if (extra) for (const key in extra) e[key] = extra[key];
      this.events.push(e);
      if (this.events.length > 900) this.events.splice(0, 300);
    }

    /* ---- runners in and out ---- */

    /** One more runner, at the back of the blob. The gaps are closed first
        if the places have run out — before counting the newcomer, or it
        would be handed a place one past the last there is. */
    append() {
      if (this.slotTop >= CAP) this.repack();
      const i = this.units++, k = this.slotTop++;
      this.uslot[i] = k;
      const tx = clamp(this.x + SLOTS.x[k], -EDGE, EDGE), tz = this.z + SLOTS.z[k];
      this.ux[i] = this.pux[i] = tx;
      this.uz[i] = this.puz[i] = tz;
      this.uid[i] = this.nextId++;
      this.born[i] = this.tick;
    }

    addUnits(k) {
      let add = Math.max(0, Math.round(k));
      while (add > 0 && this.units < CAP) { this.append(); add--; }
      this.extra += add;
      if (this.count > (this.peak || 0)) this.peak = this.count;
    }

    /** A red gate: the reservoir first, then the outside of the blob. */
    removeUnits(k) {
      let rem = Math.min(Math.max(0, Math.round(k)), this.count);
      const take = Math.min(rem, this.extra);
      this.extra -= take; rem -= take;
      while (rem > 0 && this.units > 0) {
        this.units--;
        this.event('poof', this.ux[this.units], this.uz[this.units], { side: 0 });
        rem--;
      }
      this.slotTop = this.units ? this.uslot[this.units - 1] + 1 : 0;
    }

    /** Close the gaps: runner i takes place i. Runners keep their order, so
        they drift inward from where they stand rather than swapping sides. */
    repack() {
      for (let i = 0; i < this.units; i++) this.uslot[i] = i;
      this.slotTop = this.units;
    }

    /** Close up after deaths marked in `dead`, and refill from the back. */
    compact() {
      let w = 0;
      for (let i = 0; i < this.units; i++) {
        if (this.dead[i]) { this.dead[i] = 0; continue; }
        if (w !== i) {
          this.ux[w] = this.ux[i]; this.uz[w] = this.uz[i];
          this.pux[w] = this.pux[i]; this.puz[w] = this.puz[i];
          this.uid[w] = this.uid[i]; this.born[w] = this.born[i];
          this.uslot[w] = this.uslot[i];
        }
        w++;
      }
      this.units = w;
      this.slotTop = w ? this.uslot[w - 1] + 1 : 0;
    }

    /** The reservoir steps in to fill the blob back up — but never while a
        trap is near: a newcomer is put straight into its place, and a place
        can be on a saw. Topped up there, a big crowd poured its whole
        reserve into one blade. */
    refill() {
      while (this.units < CAP && this.extra > 0) { this.append(); this.extra--; }
    }

    compactFoes() {
      let w = 0;
      for (let i = 0; i < this.foes; i++) {
        if (this.fdead[i]) { this.fdead[i] = 0; continue; }
        if (w !== i) {
          this.fx[w] = this.fx[i]; this.fz[w] = this.fz[i];
          this.pfx[w] = this.pfx[i]; this.pfz[w] = this.pfz[i];
          this.fid[w] = this.fid[i];
        }
        w++;
      }
      this.foes = w;
      const c = this.clash, s = { x: 0, z: 0 };
      while (c && this.foes < CAP && this.foeExtra > 0) {
        const i = this.foes++;
        squadSlot(this.foeCount, i, s);
        this.fx[i] = this.pfx[i] = c.x + s.x;
        this.fz[i] = this.pfz[i] = c.z + s.z;
        this.fid[i] = this.nextId++;
        this.foeExtra--;
      }
    }

    /** Every runner eases toward its place in the blob around (x, z). A
        runner with a blade in its path steps aside instead, as far as it can
        in the time it has — so the crowd parts round a saw, and what a saw
        takes is the middle of the crowd it is too late for. */
    follow(dz, place, blades) {
      for (let i = 0; i < this.units; i++) {
        let tx, tz;
        if (place) { tx = place.x + place.sx[i]; tz = place.z + place.sz[i]; }
        else { const k = this.uslot[i]; tx = this.x + SLOTS.x[k]; tz = this.z + SLOTS.z[k]; }
        tx = clamp(tx, -EDGE, EDGE);
        this.uz[i] += dz;
        const to = blades ? this.dodge(blades, this.ux[i], this.uz[i], i, tx) : null;
        if (to !== null) this.ux[i] = clamp(this.ux[i] + clamp(to[0] - this.ux[i], -to[1], to[1]), -EDGE, EDGE);
        else this.ux[i] += (tx - this.ux[i]) * FOLLOW;
        this.uz[i] += (tz - this.uz[i]) * FOLLOW;
      }
    }

    /** Is any trap within reach of the crowd, or just ahead of it? */
    trapNear() {
      const list = this.course.features;
      const lo = this.z + this.back - 1.5, hi = this.z + this.front + LOOK + 2;
      for (const ti of this.traps) {
        const f = list[ti], r = trapReach(f);
        if (f.z + r < lo) continue;
        return f.z - r <= hi;
      }
      return false;
    }

    /** The saws just ahead of the crowd, where they are this tick. */
    blades() {
      const list = this.course.features, out = [];
      const lo = this.z + this.back - 2, hi = this.z + this.front + LOOK + 1.5;
      for (const ti of this.traps) {
        const f = list[ti];
        if (f.kind !== 'saws') continue;
        if (f.z + 1.5 < lo) continue;
        if (f.z - 1.5 > hi) break;
        for (const s of f.saws) out.push(sawX(f, s, this.tick), f.z, s.r);
      }
      return out.length ? out : null;
    }

    /** Where a runner at (x, z) heading for tx should go instead, and how
        fast, with a blade in its way: [x, most it may move this tick], or
        null if nothing is. A runner in the blade's path steps out of it as
        fast as it can; one already clear holds the edge until the blade has
        gone by, rather than letting its place in the blob pull it back in. */
    dodge(b, x, z, i, tx) {
      for (let k = 0; k < b.length; k += 3) {
        const sx = b[k], sz = b[k + 1], r = b[k + 2] + 0.22;
        const ahead = sz - z;
        if (ahead < -r || ahead > r + LOOK) continue;
        const off = x - sx;
        if (Math.abs(off) < r) {
          // Out the near side, unless the near side is the edge of the road.
          let side = off > 0 ? 1 : (off < 0 ? -1 : ((this.uid[i] & 1) ? 1 : -1));
          if (sx + side * r > EDGE || sx + side * r < -EDGE) side = -side;
          return [sx + side * r, DODGE];
        }
        if (Math.abs(tx - sx) < r) return [sx + (off > 0 ? r : -r), 0.2];
      }
      return null;
    }

    /* -------------------------------------------------------------- tick */

    step() {
      this.lastZ = this.z;
      this.lastX = this.x;
      // Where everyone was, for a view that draws between ticks.
      this.pux.set(this.ux.subarray(0, this.units));
      this.puz.set(this.uz.subarray(0, this.units));
      if (this.foes) {
        this.pfx.set(this.fx.subarray(0, this.foes));
        this.pfz.set(this.fz.subarray(0, this.foes));
      }

      for (const a of this.takeInputs()) {
        // Anything that means "go" starts the run; hovering does not.
        if (this.phase === 'ready' && (a === 'go' || a === 'left' || a === 'right')) this.phase = 'run';
        else if (this.phase === 'gauge' && a === 'go') this.lockGauge();
        if (a && typeof a === 'object' && a.lane != null) this.aim = clamp(+a.lane || 0, -1, 1) * EDGE;
        else if (a === 'left') this.aim = Math.max(-EDGE, Math.min(this.aim, this.x) - STEER * 1.5);
        else if (a === 'right') this.aim = Math.min(EDGE, Math.max(this.aim, this.x) + STEER * 1.5);
      }

      const p = this.phase;
      if (p === 'ready') { if (this.slotTop > this.units) this.repack(); this.follow(0); return; }
      if (p === 'run') this.run();
      else if (p === 'fight') this.fight();
      else if (p === 'gauge') this.gauge();
      else if (p === 'boss') this.bossFight();
      else if (p === 'tower') this.climb();
      else if (p === 'won') {
        this.follow(0, this.king ? this.ringPlace() : null);
        if (++this.endT >= WON_T) this.finish('stormed');
      } else if (p === 'lost') {
        if (++this.endT >= LOST_T) this.finish(this.lossReason || 'wiped');
      }
    }

    lose(reason) {
      this.phase = 'lost';
      this.lossReason = reason;
      this.endT = 0;
      this.clash = null;
    }

    run() {
      const reach = this.reach;
      const want = clamp(this.aim, -reach, reach);
      this.x += clamp(want - this.x, -STEER, STEER);
      let v = this.speed;
      if (this.boostT > 0) { v *= 1.7; this.boostT--; }
      this.z += v;
      const blades = this.blades();
      // Close the crowd's gaps, and call up the reserve, only once nothing
      // sharp is near it.
      if ((this.slotTop > this.units || (this.extra && this.units < CAP)) && !this.trapNear()) {
        this.repack();
        this.refill();
      }
      this.follow(v, null, blades);
      this.cut();
      if (!this.count) { this.lose('wiped'); return; }
      this.fire();
      if (this.phase === 'run' && this.z >= this.course.finish) this.finale();
    }

    /** Gates, squads and boost pads, each once, in order. */
    fire() {
      const list = this.course.features;
      const front = this.z + this.front;
      while (this.at < this.shots.length) {
        const i = this.shots[this.at], f = list[i];
        if (f.kind === 'gates') {
          if (front < f.z) return;
          this.at++;
          this.takeGate(f, i);
          if (!this.count) { this.lose('wiped'); return; }
        } else if (f.kind === 'boost') {
          if (this.z < f.z) return;
          this.at++;
          if (this.x >= f.x0 && this.x <= f.x1) { this.boostT = 70; this.event('boost', this.x, this.z); }
        } else {
          if (front < f.z - f.r) return;
          this.at++;
          this.engage(f, i);
          return;
        }
      }
    }

    takeGate(f, i) {
      let lane = -1;
      f.lanes.forEach((g, k) => { if (this.x >= g.x0 && this.x < g.x1 + (k === f.lanes.length - 1 ? 1e-9 : 0)) lane = k; });
      this.used[i] = lane;
      if (lane < 0) return;
      const g = f.lanes[lane];
      const was = this.count;
      const now = Math.max(0, Math.round(C.apply(g.op, g.val, was)));
      if (now > was) { this.addUnits(now - was); this.gained += now - was; this.score += now - was; }
      else if (now < was) { this.removeUnits(was - now); this.lost += was - now; }
      this.event('gate', this.x, f.z, { i: i, lane: lane, op: g.op, val: g.val, d: now - was });
    }

    /** Traps near the crowd cut whoever is standing in them. */
    cut() {
      const list = this.course.features;
      const lo = this.z + this.back - 1, hi = this.z + this.front + 1;
      let any = false;
      for (const ti of this.traps) {
        const f = list[ti];
        const r = trapReach(f);
        if (f.z + r < lo) continue;
        if (f.z - r > hi) break;
        for (let i = 0; i < this.units; i++) {
          if (this.dead[i]) continue;
          if (cuts(f, this.ux[i], this.uz[i], this.tick)) {
            this.dead[i] = 1;
            any = true;
            this.lost++;
            this.event('die', this.ux[i], this.uz[i], { side: 0, by: f.kind });
          }
        }
      }
      if (any) this.compact();
    }

    /* ----------------------------------------------------------- squads */

    engage(f, i) {
      const m = f.n;
      this.clash = { i: i, f: f, x: 0, z: f.z, was: m };
      this.foes = 0; this.foeExtra = 0;
      const s = { x: 0, z: 0 }, phys = Math.min(m, CAP);
      for (let k = 0; k < phys; k++) {
        squadSlot(m, k, s);
        this.fx[k] = this.pfx[k] = s.x;
        this.fz[k] = this.pfz[k] = f.z + s.z;
        this.fid[k] = this.nextId++;
      }
      this.foes = phys;
      this.foeExtra = m - phys;
      this.phase = 'fight';
      this.event('clash', 0, f.z, { i: i });
    }

    fight() {
      const c = this.clash;
      // Both sides close: yours pushes on, theirs charges, and the middles
      // drift together so the blobs meet square.
      this.x += clamp(c.x - this.x, -STEER * 0.4, STEER * 0.4);
      c.x += clamp(this.x - c.x, -0.03, 0.03);
      const dz = Math.max(0, Math.min(this.speed * 0.3, c.z - this.z - 0.3));
      this.z += dz;
      c.z -= Math.max(0, Math.min(0.045, c.z - this.z - 0.3));
      // In a fight the blob closes up as its front falls, as the reference's
      // does, and the reserve comes forward.
      if (this.slotTop > this.units) this.repack();
      this.refill();
      this.follow(dz);

      const s = { x: 0, z: 0 }, m = this.foeCount;
      for (let i = 0; i < this.foes; i++) {
        squadSlot(m, i, s);
        this.fx[i] += (c.x + s.x - this.fx[i]) * FOLLOW;
        this.fz[i] += (c.z + s.z - this.fz[i]) * FOLLOW;
      }

      this.contacts();
      if (!this.count) { this.lose('overrun'); return; }
      if (!this.foeCount) {
        this.beaten += c.was;
        this.score += c.was * 2;
        this.beatenAt[c.i] = true;
        this.event('beat', this.x, this.z, { i: c.i, n: c.was });
        this.clash = null;
        this.foes = 0;
        this.phase = 'run';
      }
    }

    /** Every pair that touches goes down together. A grid of the squad, so
        this is a look at the cells around each runner, not at every foe. */
    contacts() {
      const CELL = CONTACT, head = new Map(), next = new Int32Array(this.foes);
      const key = (i, j) => (i + 4000) * 20000 + (j + 4000);
      for (let k = 0; k < this.foes; k++) {
        const kk = key(Math.floor(this.fx[k] / CELL), Math.floor(this.fz[k] / CELL));
        next[k] = head.has(kk) ? head.get(kk) : -1;
        head.set(kk, k);
      }
      let any = false;
      const r2 = CONTACT * CONTACT;
      for (let i = 0; i < this.units; i++) {
        const x = this.ux[i], z = this.uz[i];
        const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
        let hit = -1;
        for (let di = -1; di <= 1 && hit < 0; di++) {
          for (let dj = -1; dj <= 1 && hit < 0; dj++) {
            let k = head.has(key(ci + di, cj + dj)) ? head.get(key(ci + di, cj + dj)) : -1;
            while (k >= 0) {
              if (!this.fdead[k]) {
                const dx = this.fx[k] - x, dzz = this.fz[k] - z;
                if (dx * dx + dzz * dzz < r2) { hit = k; break; }
              }
              k = next[k];
            }
          }
        }
        if (hit >= 0) {
          this.dead[i] = 1;
          this.fdead[hit] = 1;
          any = true;
          this.lost++;
          this.event('die', x, z, { side: 0, by: 'fight' });
          this.event('die', this.fx[hit], this.fz[hit], { side: 1, by: 'fight' });
        }
      }
      if (any) { this.compact(); this.compactFoes(); }
    }

    /* ----------------------------------------------------------- finales */

    finale() {
      this.z = this.course.finish;
      if (this.course.boss) {
        this.phase = 'gauge';
        this.gaugeT = 0;
        this.event('gaugeOn', this.x, this.z);
      } else this.startTower();
    }

    /** The needle swings from one end of the dial to the other. */
    needle(t) { return Math.sin(t * 0.075 - Math.PI / 2); }

    lockGauge() {
      if (this.gaugeVal != null) return;
      const v = Math.abs(this.needle(this.gaugeT));
      const g = this.course.gauge;
      this.gaugeVal = v < 0.22 ? g[2] : (v < 0.62 ? g[1] : g[0]);
      this.gaugeLockT = this.gaugeT;
      this.addUnits(this.gaugeVal);
      this.gained += this.gaugeVal;
      this.score += this.gaugeVal;
      this.event('bonus', this.x, this.z, { d: this.gaugeVal });
    }

    gauge() {
      this.x += clamp(-this.x, -STEER * 0.5, STEER * 0.5);
      if (this.slotTop > this.units) this.repack();
      this.refill();
      this.follow(0);
      this.gaugeT++;
      if (this.gaugeVal == null && this.gaugeT >= GAUGE_AUTO) this.lockGauge();
      if (this.gaugeVal != null && ++this.gaugeWait >= 40) {
        this.phase = 'boss';
        this.king = { hp: 1, yaw: Math.PI, t: 0, x: 0, z: this.course.kingZ, hits: 0 };
      }
    }

    /** Places on the rings round the king. */
    ringPlace() {
      const k = this.king;
      return { x: k.x, z: k.z, sx: RING.x, sz: RING.z };
    }

    bossFight() {
      const k = this.king;
      k.t++;
      // Walk up to him, then pour round him.
      const stop = k.z - 2.4;
      const dz = Math.max(0, Math.min(this.speed, stop - this.z));
      this.z += dz;
      this.x += clamp(k.x - this.x, -STEER * 0.5, STEER * 0.5);
      const round = this.z >= stop - 2.5;
      if (round) {
        for (let i = 0; i < this.units; i++) this.uz[i] += dz;
        this.follow(0, this.ringPlace());
      } else this.follow(dz);

      // Everyone touching him hits him.
      let hitting = 0, sx = 0, sz = 0;
      const reach2 = (KING_R + 0.62) * (KING_R + 0.62);
      for (let i = 0; i < this.units; i++) {
        const dx = this.ux[i] - k.x, dzz = this.uz[i] - k.z;
        if (dx * dx + dzz * dzz < reach2) hitting++;
        sx += this.ux[i]; sz += this.uz[i];
      }
      k.hp -= hitting / (RING.first * KING_TIME);

      // He turns toward the crowd between swings, and strikes on the beat.
      if (this.units) {
        const want = Math.atan2(sx / this.units - k.x, sz / this.units - k.z);
        let d = want - k.yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (k.t % SWING < SWING_HIT - 6) k.yaw += clamp(d, -0.06, 0.06);
      }
      if (k.t % SWING === SWING_HIT) this.strike();

      if (k.hp <= 0) {
        k.hp = 0;
        k.down = this.tick;
        this.score += 300 + this.spec.level * 20;
        this.phase = 'won';
        this.endT = 0;
        this.event('kingDown', k.x, k.z);
        return;
      }
      if (!this.count) this.lose('held');
    }

    /** The king's swing: the nearest runners in front of him go flying. */
    strike() {
      const k = this.king, hits = [];
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
      for (let i = 0; i < this.units; i++) {
        const dx = this.ux[i] - k.x, dz = this.uz[i] - k.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > KING_REACH) continue;
        const cosA = (dx * fx + dz * fz) / Math.max(1e-6, d);
        if (cosA < Math.cos(KING_ARC)) continue;
        hits.push({ i: i, d: d });
      }
      hits.sort((a, b) => a.d - b.d || a.i - b.i);
      const kill = Math.min(hits.length, this.course.king.k);
      for (let h = 0; h < kill; h++) {
        const i = hits[h].i;
        this.dead[i] = 1;
        this.lost++;
        const dx = this.ux[i] - k.x, dz = this.uz[i] - k.z, d = Math.max(0.2, hits[h].d);
        this.event('fly', this.ux[i], this.uz[i], { side: 0, dx: dx / d, dz: dz / d });
      }
      k.hits++;
      this.event('swing', k.x, k.z, { n: kill });
      if (kill) { this.compact(); this.refill(); }
    }

    startTower() {
      const n = this.count;
      const w = this.course.towerW || 1;
      const rows = Math.ceil(n / w);
      const reach = Math.min(rows, C.STEPS) - 1;
      this.tower = { n: n, w: w, rows: rows, reach: reach, top: rows > C.STEPS, t: 0 };
      this.mult = C.stepMult(reach);
      this.phase = 'tower';
      this.event('tower', this.x, this.z, { n: n });
    }

    climb() {
      const T = this.tower;
      T.t++;
      const climbed = GATHER + (T.reach + 1) * STEP_T;
      const end = climbed + (T.top ? CHEST_T : 0) + CHEER_T;
      if (T.t === climbed) {
        this.score += Math.round(T.n * this.mult);
        this.event('climbed', 0, this.course.stairs, { mult: this.mult, top: T.top });
      }
      if (T.t >= end) this.finish('climbed');
    }
  };

  const BOOSTS = {
    units: { max: 99 },     // runners at the start line, one a level
    income: { max: 99 }     // +10% coins a level
  };
  /** The reference prices a level at a hundred coins a level. */
  const boostCost = (kind, level) => 100 * Math.max(1, level | 0);

  Object.assign(PV.CrowdRush, {
    CAP: CAP, EDGE: EDGE, RUN: RUN, SP: SP, FORM_HALF: FORM_HALF,
    KING_R: KING_R, SWING: SWING, SWING_HIT: SWING_HIT, HAMMER_L: HAMMER_L, HAMMER_PIVOT: HAMMER_PIVOT,
    GATHER: GATHER, STEP_T: STEP_T, CHEST_T: CHEST_T, CHEER_T: CHEER_T,
    WON_T: WON_T, LOST_T: LOST_T, GAUGE_AUTO: GAUGE_AUTO,
    BOOSTS: BOOSTS, boostCost: boostCost,
    SLOTS: SLOTS, RING: RING, squadSlot: squadSlot,
    sawX: sawX, barAngle: barAngle, hammerX: hammerX,
    pressLift: pressLift, spikesUp: spikesUp, cuts: cuts, hash: hash
  });

})(window.PV);
