/* 人潮冲锋 / Crowd Rush — engine.

   On the real-time contract. You are not a runner, you are a CROWD: one
   number, one position across the track, and everything in the level either
   multiplies that number or takes a bite out of it.

   The gate split is the whole game, so it is modelled honestly. A gate pair
   divides the track down the middle and the crowd is WIDE — wider the more of
   you there are — so the part of the crowd inside each gate takes that gate's
   op and the parts are added back together. Sitting exactly on the line with
   a big crowd really does send half of you through the red gate, which is
   what makes steering early matter and what a "whichever gate the middle of
   the crowd passed" model would quietly throw away.

   A clash is a straight one-for-one trade — the bigger crowd always wins, and
   wins with exactly the difference. The rate scales with the smaller side so
   a fight is about a third of a second whether it is 20 against 10 or 900
   against 400; a fixed rate turns the late game into watching a progress bar.

   Hazards are a function of the tick, not of a timer the engine mutates, so
   the view can draw a saw exactly where the engine will cut with it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const RUN = 0.108;                 // metres per tick — about 6.5 m/s
  const STEER = 0.030;               // track-widths per tick
  const HAZARD_WINDOW = 0.9;         // metres of contact either side
  const HAZARD_BITE = 0.045;         // of the crowd, per tick, fully overlapped

  const DIFFS = {
    easy: { key: 'easy', start: 22, rival: 0.42, king: 0.62, badBias: 0.55, hazard: 0.18, speed: 0.92, xp: 0.7, coins: 0.8 },
    normal: { key: 'normal', start: 16, rival: 0.58, king: 0.80, badBias: 0.75, hazard: 0.26, speed: 1.00, xp: 1.0, coins: 1.0 },
    hard: { key: 'hard', start: 12, rival: 0.72, king: 0.95, badBias: 0.90, hazard: 0.34, speed: 1.08, xp: 1.5, coins: 1.4 }
  };

  /* Upgrades bought with coins between runs: more runners at the start line,
     and more out of every green gate. The course is still sized from the
     difficulty's own starting crowd — the shadow run never sees a boost — so
     what a player buys is a real edge, which is the point of saving up. */
  const BOOSTS = {
    start: { per: 3, max: 40, base: 30, grow: 1.28 },     // runners per level
    gate: { per: 2, max: 25, base: 45, grow: 1.32 }        // runners from each green gate
  };
  const boostCost = (kind, level) =>
    Math.round(BOOSTS[kind].base * Math.pow(BOOSTS[kind].grow, Math.max(0, level)));

  const FIGHT = 0.055;               // a rival fight: about a third of a second
  const KING_FIGHT = 0.02;           // the king is a longer fight, on purpose
  const VICTORY = 72;                // ticks between the king falling and the end

  /* The crowd's width lives in course.js, because the course generator has to
     price it when it decides how big the king is. One formula, not two. */
  function widthOf(n) { return PV.CrowdCourse.widthOf(n); }

  /** Where a saw is at this tick, and whether a hammer is down. Shared with
      the view: one answer, not two that drift apart. */
  function hazardX(f, tick) {
    if (f.kind !== 'saw') return f.x;
    return Math.max(-0.9, Math.min(0.9, f.x + Math.sin((tick + f.phase) * 0.028) * 0.62));
  }
  function hazardLive(f, tick) {
    if (f.kind !== 'hammer') return true;
    return ((tick + f.phase) % 96) < 30;        // down for half a second
  }

  /** How much of [a0,a1] lies inside [b0,b1], as a fraction of the first. */
  function overlap(a0, a1, b0, b1) {
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    return hi <= lo ? 0 : (hi - lo) / Math.max(1e-6, a1 - a0);
  }

  PV.CrowdRush = class CrowdRush extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      // A level brings its own course and difficulty (course.js works both
      // out from the number); a free run takes them from the options.
      if (o.level != null) {
        const lv = PV.CrowdCourse.level(o.level);
        this.level = lv.level;
        this.diff = lv.diff;
        this.courseKey = lv.def.key;
        this.course = PV.CrowdCourse.build(lv.def, lv.diff, this.rng);
      } else {
        this.level = null;
        this.diff = DIFFS[o.difficulty] || DIFFS.normal;
        this.courseKey = PV.CrowdCourse.COURSES[o.course] ? o.course : 'fields';
        this.course = PV.CrowdCourse.build(this.courseKey, this.diff, this.rng);
      }
      // 'ready' waits at the start line for a tap, with the shop open;
      // 'run' is the course; 'won' is the king down and the crowd walking in.
      this.phase = o.autostart ? 'run' : 'ready';
      this.boost = { start: 0, gate: 0 };
      this.n = this.diff.start;
      this.setBoost(o.boost);
      this.victory = 0;
      this.peak = this.n;
      this.x = 0;
      this.aim = 0;                  // where the mouse or a finger wants us
      this.dist = 0;
      this.speed = RUN * this.diff.speed;
      this.at = 0;                   // the next feature that has not fired
      this.clash = null;
      this.clashAcc = 0;
      this.gained = 0;
      this.beaten = 0;
      this.lost = 0;
      this.pops = [];                // view-only: little rising labels
    }

    get width() { return widthOf(this.n); }
    /** How far off centre the crowd may stand and still be on the track. A
        big crowd is wide, so a big crowd has less room to swerve — which is
        the cost of having grown, and it is felt at every gate. */
    get reach() { return Math.max(0, 1 - this.width / 2); }
    get left() { return this.x - this.width / 2; }
    get right() { return this.x + this.width / 2; }
    get feature() { return this.course.features[this.at] || null; }
    get fighting() { return !!this.clash; }
    get ready() { return this.phase === 'ready'; }

    /** Levels bought in the shop. Only before the run starts: a boost that
        could land mid-course would be a different run from the same seed. */
    setBoost(b) {
      if (this.phase !== 'ready' && this.tick > 0) return false;
      const src = b || {};
      this.boost = {
        start: Math.max(0, Math.min(BOOSTS.start.max, src.start | 0)),
        gate: Math.max(0, Math.min(BOOSTS.gate.max, src.gate | 0))
      };
      this.n = this.diff.start + this.boost.start * BOOSTS.start.per;
      this.peak = this.n;
      return true;
    }

    /** What a run pays out. Storming the keep pays for the people who got
        there; falling short still pays for the way you got. */
    get coins() {
      const won = this.overReason === 'stormed';
      const along = Math.min(1, this.dist / this.course.length);
      const base = won
        ? 40 + Math.sqrt(this.n) * 6 + Math.sqrt(this.beaten) * 2
        : 6 + along * 30 + Math.sqrt(this.beaten) * 1.5;
      return Math.round(base * this.diff.coins * (1 + (this.course.tier - 1) * 0.25));
    }

    /** A label that floats up from the crowd — gates, bites, wins. */
    pop(text, tone) {
      this.pops.push({ text: text, tone: tone || 'good', life: 48, x: this.x, dist: this.dist });
      if (this.pops.length > 12) this.pops.shift();
    }

    /* ------------------------------------------------------------ gates */

    /** Every part of the crowd takes the op of the gate it is standing in. */
    runGates(f) {
      let total = 0, claimed = 0, best = null, bw = 0;
      for (const g of f.lanes) {
        const frac = overlap(this.left, this.right, g.x0, g.x1);
        if (frac <= 0) continue;
        claimed += frac;
        const part = this.n * frac;
        let out = PV.CrowdCourse.apply(g.op, g.val, part);
        // The gate bonus: a few more runners out of every GREEN gate, shared by
        // how much of the crowd went through it. Flat, not a share of the
        // gain: a share compounds, gate after gate, and at +120% a crowd of
        // twenty was a hundred thousand by level 45 with a king of seventeen.
        if (out > part) out += this.boost.gate * BOOSTS.gate.per * frac;
        total += out;
        if (frac > bw) { bw = frac; best = g; }
      }
      if (!best) return;                       // squeezed past the edge of both
      // Anyone who met no gate at all simply keeps running.
      total += this.n * Math.max(0, 1 - claimed);
      const was = this.n;
      this.n = Math.max(0, Math.round(total));
      if (this.n > this.peak) this.peak = this.n;
      if (this.n >= was) { this.gained += this.n - was; this.score += this.n - was; }
      else this.lost += was - this.n;
      this.pop((this.n - was >= 0 ? '+' : '') + (this.n - was), this.n >= was ? 'good' : 'bad');
      if (this.n <= 0) this.finish('wiped');
    }

    /* ----------------------------------------------------------- clashes */

    startClash(f) {
      this.clash = { kind: f.kind, n: f.n, was: f.n };
      this.clashAcc = 0;
    }

    fight() {
      const c = this.clash;
      // The rate follows the smaller side, so a fight is about as long
      // whatever the numbers are. The king holds out longer: he is the end
      // of the course, and a boss that folds in a third of a second is not one.
      const rate = c.kind === 'castle' ? KING_FIGHT : FIGHT;
      this.clashAcc += Math.max(0.4, Math.min(this.n, c.n) * rate);
      const hit = Math.floor(this.clashAcc);
      if (hit > 0) {
        this.clashAcc -= hit;
        const take = Math.min(hit, this.n, c.n);
        c.n -= take;
        this.n -= take;
        this.lost += take;
      }
      if (this.n <= 0) { this.n = 0; this.finish(c.kind === 'castle' ? 'held' : 'overrun'); return; }
      if (c.n > 0) return;
      this.beaten += c.was;
      this.score += c.was * 5;
      this.pop('\u2694 ' + c.was, 'win');
      const castle = c.kind === 'castle';
      this.clash = null;
      // The king falls and the crowd walks in under the flags before the
      // result comes up. The score is settled now; the walk is only a walk.
      if (castle) { this.score += this.n * 10; this.phase = 'won'; this.victory = 0; }
    }

    /* -------------------------------------------------------------- tick */

    step() {
      for (const a of this.takeInputs()) {
        // Anything that means "go" starts the run: a tap, space, or a steer.
        // Hovering the mouse over the canvas is not one of them.
        if (this.phase === 'ready' && (a === 'go' || a === 'left' || a === 'right')) this.phase = 'run';
        if (a && typeof a === 'object' && a.lane != null) this.aim = Math.max(-1, Math.min(1, a.lane));
        else if (a === 'left') this.aim = Math.max(-1, this.x - STEER * 2);
        else if (a === 'right') this.aim = Math.min(1, this.x + STEER * 2);
      }

      for (let i = this.pops.length - 1; i >= 0; i--) {
        if (--this.pops[i].life <= 0) this.pops.splice(i, 1);
      }

      // Standing at the start line: the saws already turn, nobody moves.
      if (this.phase === 'ready') return;

      // The king is down: the crowd closes on the middle and walks in.
      if (this.phase === 'won') {
        this.x += Math.max(-STEER, Math.min(STEER, -this.x));
        this.dist += this.speed * 0.6;
        if (++this.victory >= VICTORY) this.finish('stormed');
        return;
      }

      const d = this.aim - this.x;
      this.x += Math.max(-STEER, Math.min(STEER, d));
      this.clampX();

      if (this.clash) { this.fight(); return; }

      this.dist += this.speed;

      // Hazards bite while you are level with them; gates and crowds fire once.
      for (let i = this.at; i < this.course.features.length; i++) {
        const f = this.course.features[i];
        if (f.at > this.dist + HAZARD_WINDOW) break;
        if (f.kind === 'gates') continue;
        if (f.kind === 'rivals' || f.kind === 'castle') continue;
        if (Math.abs(f.at - this.dist) > HAZARD_WINDOW) continue;
        if (!hazardLive(f, this.tick)) continue;
        const hx = hazardX(f, this.tick);
        const frac = overlap(this.left, this.right, hx - f.w / 2, hx + f.w / 2);
        if (frac <= 0) continue;
        const bite = Math.max(1, Math.round(this.n * frac * HAZARD_BITE));
        this.n = Math.max(0, this.n - bite);
        this.lost += bite;
        if (this.tick % 6 === 0) this.pop('-' + bite, 'bad');
        if (this.n <= 0) { this.finish('wiped'); return; }
      }

      while (this.at < this.course.features.length) {
        const f = this.course.features[this.at];
        // A crowd is met a little short of where it stands, so the two sides
        // are drawn facing each other rather than standing in each other.
        const meets = (f.kind === 'rivals' || f.kind === 'castle');
        if (this.dist < f.at - (meets ? 2.6 : 0)) break;
        this.at++;
        if (f.kind === 'gates') this.runGates(f);
        else if (meets) { this.startClash(f); break; }
      }

      // Growing at a gate makes the crowd wider, so the edge it may stand at
      // moves in under it: pull it back on to the track before anyone looks.
      this.clampX();

      if (this.dist >= this.course.length && !this.over) {
        this.score += this.n * 10;
        this.finish('stormed');
      }
    }

    clampX() { this.x = Math.max(-this.reach, Math.min(this.reach, this.x)); }
  };

  PV.CrowdRush.DIFFS = DIFFS;
  PV.CrowdRush.BOOSTS = BOOSTS;
  PV.CrowdRush.boostCost = boostCost;
  PV.CrowdRush.VICTORY = VICTORY;
  PV.CrowdRush.widthOf = widthOf;
  PV.CrowdRush.hazardX = hazardX;
  PV.CrowdRush.hazardLive = hazardLive;
  PV.CrowdRush.RUN = RUN;

})(window.PV);
