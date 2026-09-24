/* 蠕虫竞技场 / Worm Arena — engine.

   Built to play like the crazygames reference (Worms Zone): a round arena
   with a wall that kills, a worm whose score IS its size, a turbo that burns
   that size into food behind you, six potions on the floor, coins to spend
   in the wardrobe, and a crowd of worms that eat, hunt and coil. Its art,
   names and code are not copied; what its own page describes as the game is.

   On the real-time contract: a fixed 60 Hz tick, inputs applied on tick
   boundaries, every random draw from the seeded RNG. Nothing here reads the
   clock or the DOM, so a run replays from its seed and its input log.

   Decisions worth naming:

   - **Mass is the score, and everything follows from it.** Thickness grows
     with the fourth root of mass, length with its 0.6 power, and speed falls
     with its log. A giant is slow, wide and long; a newborn is quick and
     tiny. The reference says exactly this: "as you get larger, you get
     slower".
   - **A worm turns on a circle a couple of body widths across**, not at a
     fixed rate. A fixed rate lets a giant pivot inside its own girth; a
     radius tied to thickness gives it the wide, heavy turn a big worm has,
     and the turning potion tightens it.
   - **The turbo spends mass, faster the bigger you are**, and three quarters
     of what it spends is dropped behind the tail as food. That is the
     reference's bargain: a dash costs the thing you spent the round
     collecting, and it feeds whoever is chasing you.
   - **The body is a trail of points NODE apart along the path the head
     took**, however fast it went. A turbo moves the head further per tick;
     points per tick would give a boosting worm a coarser, longer body free.
   - **Heads only.** A head into anybody else's body dies; your own body is
     safe to cross. Two heads meeting: the bigger worm wins, a tie kills both.
   - **Food the head reaches flies to the mouth** and is committed to that
     worm while it flies. That is the magnet everyone has; the magnet potion
     only widens it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TAU = Math.PI * 2;
  const HZ = 60;

  const START_MASS = 20;
  const BOOST_FLOOR = 10;          // the turbo never spends you below this
  const NODE = 4;                  // world units between committed body points
  const CELL = 80;                 // spatial grid cell

  const BOOST = 2;                 // turbo speed, times base
  const BURN_BASE = 2;             // mass a second the turbo costs...
  const BURN_RATE = 0.012;         // ...plus this share of your mass a second
  const CRUMB_SHARE = 0.75;        // of the burned mass, dropped as food

  const HEAD_HIT = 0.55;           // how far a head may overlap before it counts
  const TURN_MIN = 26;             // the tightest turning circle, world units
  const TURN_K = 1.8;              // ...or this many body radii, if wider

  const SNACK_DENSITY = 1.3e-4;    // floor food per square unit
  const SNACK_VALUES = [1, 1, 1, 1, 1, 1, 2, 2, 2, 3];
  const REMAINS_SHARE = 0.8;       // of a dead worm's mass, left on the floor
  const REMAINS_TICKS = 75 * HZ;
  const CRUMB_TICKS = 25 * HZ;

  /* The six potions from the reference's page, with what each one does
     here. Radar and zoom change what the player SEES, so the engine only
     keeps their clocks. */
  const POTIONS = ['magnet', 'x5', 'radar', 'speed', 'turn', 'zoom'];
  const POTION_TICKS = 20 * HZ;
  /* The reference's shop sells nothing that makes a worm stronger, only
     potions that last longer. Five levels of three seconds each, for the
     player alone, and never in a race. */
  const POTION_UP = { max: 5, per: 3 * HZ, cost: [50, 100, 200, 400, 800] };
  const MAGNET = 150;              // extra reach for food and coins
  const SPEED_FX = 1.45;
  const TURN_FX = 1.7;

  const RESPAWN_TICKS = 150;       // time mode: back in two and a half seconds
  const DEATH_TICKS = 100;         // endless: a moment to watch yourself burst

  /* Infinity, Time and Treasure Hunter, as the reference names them. Time
     is seven minutes at double food and double coins, and a death costs
     your length but not the round. */
  const MODES = {
    endless: { ticks: 0, mult: 1, respawn: false, chests: false },
    time: { ticks: 7 * 60 * HZ, mult: 2, respawn: true, chests: false },
    treasure: { ticks: 0, mult: 1, respawn: false, chests: true }
  };

  /* A busier arena is also a bigger one, so the worms per square unit — and
     so how often you meet one — stays about the same. */
  const CROWDS = {
    quiet: { bots: 14, R: 2400 },
    normal: { bots: 22, R: 2700 },
    busy: { bots: 32, R: 3150 }
  };

  /* Whoever you meet in the arena. None of them is anyone in particular. */
  const NAMES = [
    'Noodle', 'Wiggles', 'Slinky', 'Captain Coil', 'Gummy', 'Twisty', 'Nom Nom',
    'Sir Squirm', 'Lolly', 'Zigzag', 'Pretzel', 'Spaghetti', 'Doodle', 'Mochi',
    'Boba', 'Churro', 'Pickle', 'Biscuit', 'Waffles', 'Sprinkles', 'Jellybean',
    'Tofu', 'Dumpling', 'Nacho', 'Muffin', 'Pudding', 'Ziggy', 'Rocket', 'Blaze',
    'Viper', 'Comet', 'Bolt', 'Nova', 'Echo', 'Pixel', 'Turbo', 'Mango', 'Kiwi',
    'Coco', 'Peanut', 'Bubbles', 'Rex', 'Luna', 'Max', 'Mia', 'Leo', 'Kai',
    'Yuki', 'Aiko', 'Mei', 'Hana', 'Jin', 'Omar', 'Sofia', 'Lucas', 'Emma',
    'Noah', 'Zoe', 'Slurp', 'Munch', 'Gobbler', 'Chomp', '小龙', '团子', '豆豆',
    '阿福', '糯米', '汤圆'
  ];

  /* Bot headings tried when looking for a way through, relative to where it
     is going now. Denser straight ahead, where most answers are. */
  const RAYS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.9, -1.9, 2.6, -2.6];

  const radiusOf = m => Math.min(90, 10 * Math.pow(Math.max(m, 1) / START_MASS, 0.25));
  const lengthOf = m => 100 * Math.pow(Math.max(m, 1) / START_MASS, 0.6);
  const speedOf = m => 2.9 / (1 + 0.055 * Math.log2(1 + Math.max(m, 1) / START_MASS));

  /** The shortest way round the circle: always in (-π, π]. */
  function wrap(a) {
    a %= TAU;
    if (a > Math.PI) a -= TAU;
    else if (a <= -Math.PI) a += TAU;
    return a;
  }

  /** How far along a ray from (x, y) before it leaves the circle `rad`. */
  function rayOut(x, y, cx, cy, rad) {
    const b = x * cx + y * cy, c = x * x + y * y - rad * rad;
    if (c >= 0) return b < 0 ? 1e9 : 0;          // already past it: only inward is open
    return -b + Math.sqrt(b * b - c);
  }

  function size(w) {
    w.r = radiusOf(w.mass);
    w.len = lengthOf(w.mass);
  }

  /* ------------------------------------------------------------ grids */

  /**
   * Every body in the arena, as sample points, rebuilt each tick. Typed
   * arrays and a linked list per cell: thirty worms of up to a few hundred
   * samples each is several thousand inserts a tick, and objects for each
   * one would be the garbage collector's whole afternoon.
   */
  class BodyGrid {
    constructor(R) {
      this.R = R;
      this.cols = Math.ceil((2 * R) / CELL) + 2;
      this.first = new Int32Array(this.cols * this.cols).fill(-1);
      this.n = 0;
      this.cap = 0;
      this.grow(8192);
    }

    grow(cap) {
      const old = this;
      const xs = new Float64Array(cap), ys = new Float64Array(cap), rs = new Float64Array(cap);
      const own = new Int32Array(cap), hd = new Uint8Array(cap), next = new Int32Array(cap);
      if (this.cap) {
        xs.set(old.xs); ys.set(old.ys); rs.set(old.rs);
        own.set(old.own); hd.set(old.hd); next.set(old.next);
      }
      this.xs = xs; this.ys = ys; this.rs = rs; this.own = own; this.hd = hd; this.next = next;
      this.cap = cap;
    }

    clear() { this.first.fill(-1); this.n = 0; }

    cellOf(x, y) {
      const n = this.cols;
      let cx = Math.floor((x + this.R) / CELL) + 1, cy = Math.floor((y + this.R) / CELL) + 1;
      if (cx < 0) cx = 0; else if (cx >= n) cx = n - 1;
      if (cy < 0) cy = 0; else if (cy >= n) cy = n - 1;
      return cy * n + cx;
    }

    add(x, y, r, owner, head) {
      if (this.n === this.cap) this.grow(this.cap * 2);
      const i = this.n++;
      this.xs[i] = x; this.ys[i] = y; this.rs[i] = r;
      this.own[i] = owner; this.hd[i] = head ? 1 : 0;
      const c = this.cellOf(x, y);
      this.next[i] = this.first[c];
      this.first[c] = i;
    }

    /** Every sample in the cells that touch the box round (x, y). */
    near(x, y, rad, out) {
      out.length = 0;
      const n = this.cols;
      const x0 = Math.max(0, Math.floor((x - rad + this.R) / CELL) + 1);
      const x1 = Math.min(n - 1, Math.floor((x + rad + this.R) / CELL) + 1);
      const y0 = Math.max(0, Math.floor((y - rad + this.R) / CELL) + 1);
      const y1 = Math.min(n - 1, Math.floor((y + rad + this.R) / CELL) + 1);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          for (let i = this.first[cy * n + cx]; i >= 0; i = this.next[i]) out.push(i);
        }
      }
      return out;
    }
  }

  /**
   * The food on the floor, bucketed so a head only looks at its own
   * neighbourhood and the view only paints what is on screen. Removal swaps
   * the last item of a cell into the hole, so every item knows its slot.
   */
  class FoodGrid {
    constructor(R) {
      this.R = R;
      this.cols = Math.ceil((2 * R) / CELL) + 2;
      this.cells = new Array(this.cols * this.cols);
      this.count = 0;
    }

    cellOf(x, y) {
      const n = this.cols;
      let cx = Math.floor((x + this.R) / CELL) + 1, cy = Math.floor((y + this.R) / CELL) + 1;
      if (cx < 0) cx = 0; else if (cx >= n) cx = n - 1;
      if (cy < 0) cy = 0; else if (cy >= n) cy = n - 1;
      return cy * n + cx;
    }

    add(f) {
      const c = this.cellOf(f.x, f.y);
      const arr = this.cells[c] || (this.cells[c] = []);
      f.cell = c;
      f.slot = arr.length;
      arr.push(f);
      this.count++;
    }

    remove(f) {
      const arr = this.cells[f.cell];
      if (!arr) return;
      const last = arr.pop();
      if (last !== f) { arr[f.slot] = last; last.slot = f.slot; }
      f.cell = -1;
      this.count--;
    }

    /** Calls fn(item) for everything in the cells that touch the box. */
    each(x0, y0, x1, y1, fn) {
      const n = this.cols;
      const a = Math.max(0, Math.floor((x0 + this.R) / CELL) + 1);
      const b = Math.min(n - 1, Math.floor((x1 + this.R) / CELL) + 1);
      const c = Math.max(0, Math.floor((y0 + this.R) / CELL) + 1);
      const d = Math.min(n - 1, Math.floor((y1 + this.R) / CELL) + 1);
      for (let cy = c; cy <= d; cy++) {
        for (let cx = a; cx <= b; cx++) {
          const arr = this.cells[cy * n + cx];
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) fn(arr[i]);
        }
      }
    }

    /** Everything within `rad` of (x, y), into `out`. */
    near(x, y, rad, out) {
      out.length = 0;
      const r2 = rad * rad;
      this.each(x - rad, y - rad, x + rad, y + rad, f => {
        const dx = f.x - x, dy = f.y - y;
        if (dx * dx + dy * dy <= r2) out.push(f);
      });
      return out;
    }
  }

  /* ------------------------------------------------------------ the game */

  PV.Worms = class Worms extends PV.LoopGame {
    /**
     * opts: { seed, mode, crowd, skin, name, autostart,
     *         and for tests: bots, food, potions, coins, R }
     */
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.modeKey = MODES[o.mode] ? o.mode : 'endless';
      this.mode = MODES[this.modeKey];
      this.crowdKey = CROWDS[o.crowd] ? o.crowd : 'normal';
      const crowd = CROWDS[this.crowdKey];
      this.R = o.R || crowd.R;
      this.botCount = o.bots == null ? crowd.bots : o.bots;
      this.snackTarget = o.food == null ? Math.round(SNACK_DENSITY * Math.PI * this.R * this.R) : o.food;
      this.potionTarget = o.potions == null ? Math.round(this.R / 200) : o.potions;
      this.coinTarget = o.coins == null ? Math.round(this.R / 40) : o.coins;
      this.chestTarget = this.mode.chests ? 3 : 0;
      this.foodCap = Math.max(400, this.snackTarget * 2.2);
      const up = Math.max(0, Math.min(POTION_UP.max, Math.floor(Number(o.potionLevel) || 0)));
      this.potionTicks = POTION_TICKS + up * POTION_UP.per;     // the player's; bots get the base

      this.worms = [];
      this.nextId = 0;
      this.food = new FoodGrid(this.R);
      this.grid = new BodyGrid(this.R);
      this.gridWorms = [];
      this.maxR = 10;
      this.snacks = 0;                 // floor snacks, on the floor or flying
      this.flying = [];                // food on its way into a mouth
      this.potions = [];
      this.coinSpots = [];
      this.chests = [];
      this.pending = [];               // ticks at which a bot comes back
      this.later = [];                 // potions, coins and chests to put back
      this.graves = [];                // where worms died, for the radar
      this.events = [];                // news for the view, drained by it
      this.scratch = [];
      this.scratchFood = [];
      this.dying = [];
      this.culled = false;

      this.ready = true;               // waiting at the start line
      this.startTick = 0;
      this.coins = 0;                  // picked up this run
      this.chestsFound = 0;
      this.deaths = 0;
      this.finalScore = null;
      this.finalRank = null;
      this.finishAt = 0;
      this.respawnAt = 0;
      this.lastDeath = null;
      this.bestRank = 0;

      this.names = this.rng.shuffle(NAMES.slice());
      this.nameAt = 0;

      /* The player waits parked on its spot until the run begins: drawn,
         steered round by the bots, but not yet part of the fight. */
      const skin = PV.WormSkins.get(o.skin == null ? 0 : o.skin);
      this.player = this.makeWorm({ bot: false, name: o.name || 'You', skin: skin.index, mass: START_MASS });
      const home = this.randomPoint(this.R * 0.45);
      this.layBody(this.player, home.x, home.y, Math.atan2(-home.y, -home.x) + (this.rng.next() - 0.5));
      this.player.parked = true;
      this.worms.push(this.player);

      for (let i = 0; i < this.botCount; i++) this.spawnBot(true);
      while (this.snacks < this.snackTarget) this.addSnack();
      while (this.potions.length < this.potionTarget) this.addPotion();
      while (this.coinSpots.length < this.coinTarget) this.addCoin();
      while (this.chests.length < this.chestTarget) this.addChest();
      this.buildGrid();

      if (o.autostart) this.begin();
    }

    /* ------------------------------------------------------------ worms */

    makeWorm(o) {
      const w = {
        id: this.nextId++, bot: !!o.bot, name: o.name, skin: o.skin,
        mass: o.mass, best: o.mass, r: 0, len: 0,
        x: 0, y: 0, px: 0, py: 0, angle: 0, aim: 0, step: 0, since: 0, path: [],
        alive: true, parked: false, kills: 0, cause: null, gi: -1,
        boost: false, wantBoost: false, boostLatch: false, boostHold: 0, turnKey: 0, burn: 0,
        fx: { magnet: 0, x5: 0, radar: 0, speed: 0, turn: 0, zoom: 0 },
        born: this.tick, brain: null
      };
      size(w);
      return w;
    }

    /**
     * Put a worm's head at (x, y) and lay its body out behind it, curling
     * gently so a long one does not arrive as a ruler, and turning back in
     * before it would run out through the wall.
     */
    layBody(w, x, y, angle) {
      w.x = w.px = x; w.y = w.py = y;
      w.angle = w.aim = wrap(angle);
      w.since = 0; w.step = 0;
      w.path = [];
      let px = x, py = y, dir = angle + Math.PI;
      let bend = (this.rng.next() - 0.5) * 0.05;
      const need = Math.ceil(w.len / NODE) + 4;
      const lim = this.R - w.r - 40;
      for (let i = 0; i < need; i++) {
        w.path.push({ x: px, y: py });
        if (i % 12 === 0) bend = PV.clamp(bend + (this.rng.next() - 0.5) * 0.03, -0.045, 0.045);
        dir += bend;
        let nx = px + Math.cos(dir) * NODE, ny = py + Math.sin(dir) * NODE;
        if (nx * nx + ny * ny > lim * lim) {
          dir = Math.atan2(-py, -px) + (this.rng.next() - 0.5) * 0.8;
          nx = px + Math.cos(dir) * NODE; ny = py + Math.sin(dir) * NODE;
        }
        px = nx; py = ny;
      }
    }

    nextName() {
      const used = new Set(this.worms.filter(w => w.alive).map(w => w.name));
      for (let i = 0; i < this.names.length; i++) {
        const n = this.names[(this.nameAt + i) % this.names.length];
        if (!used.has(n)) { this.nameAt = (this.nameAt + i + 1) % this.names.length; return n; }
      }
      return 'Worm ' + this.nextId;
    }

    /** How big a bot turns up. At the start a few are giants already. */
    botMass(initial) {
      const u = this.rng.next(), v = this.rng.next();
      if (initial) {
        if (u < 0.12) return Math.round(1500 + v * 5000);
        if (u < 0.40) return Math.round(250 + v * 1200);
        return Math.round(20 + v * 200);
      }
      if (u < 0.05) return Math.round(600 + v * 1500);
      if (u < 0.25) return Math.round(100 + v * 300);
      return Math.round(20 + v * 60);
    }

    spawnBot(initial) {
      const w = this.makeWorm({
        bot: true, name: this.nextName(),
        skin: this.rng.int(PV.WormSkins.list.length), mass: this.botMass(initial)
      });
      w.brain = {
        skill: 0.35 + this.rng.next() * 0.65,
        aggro: this.rng.next(),
        every: 2 + this.rng.int(3),
        prey: null, food: null, nextLook: 0, nextFood: 0,
        wander: 0, side: 0, boostUntil: 0, blunder: 0
      };
      const s = this.spawnSpot(initial ? 450 : 350, w);
      this.layBody(w, s.x, s.y, s.a);
      this.worms.push(w);
      return w;
    }

    /** A random point in the disc of radius `rad`, uniformly. */
    randomPoint(rad) {
      const a = this.rng.next() * TAU, d = rad * Math.sqrt(this.rng.next());
      return { x: Math.cos(a) * d, y: Math.sin(a) * d };
    }

    /** Nearest body sample or head within `rad` of (x, y); `rad` if none. */
    clearance(x, y, rad, skip) {
      let best = rad * rad;
      const g = this.grid, list = g.near(x, y, rad, this.scratch);
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        if (skip && this.gridWorms[g.own[i]] === skip) continue;
        const dx = g.xs[i] - x, dy = g.ys[i] - y, d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      for (const w of this.worms) {
        if (!w.alive || w === skip) continue;
        const dx = w.x - x, dy = w.y - y, d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    }

    /**
     * Somewhere to arrive: clear of everybody, well inside the wall, and not
     * in the player's face. Takes the roomiest of a few tries if none is
     * perfectly clear.
     */
    spawnSpot(fromPlayer, who) {
      const p = this.player;
      let best = null, bestD = -1;
      for (let i = 0; i < 30; i++) {
        const pt = this.randomPoint(this.R * 0.78);
        if (p && p !== who) {
          const dx = pt.x - p.x, dy = pt.y - p.y;
          if (dx * dx + dy * dy < fromPlayer * fromPlayer) continue;
        }
        const d = this.clearance(pt.x, pt.y, 320, who);
        if (d > bestD) { bestD = d; best = pt; }
        if (d >= 320) break;
      }
      if (!best) best = this.randomPoint(this.R * 0.78);
      // Facing roughly inward, so nothing is born pointed at the wall.
      return { x: best.x, y: best.y, a: Math.atan2(-best.y, -best.x) + (this.rng.next() - 0.5) * 2 };
    }

    /* ------------------------------------------------------------- food */

    addSnack() {
      const pt = this.randomPoint(this.R - 40);
      const v = SNACK_VALUES[this.rng.int(SNACK_VALUES.length)];
      this.food.add({
        x: pt.x, y: pt.y, v: v, k: 0, r: 5.5 + v * 1.8, look: this.rng.int(8), c: null,
        born: this.tick, until: 0, ph: this.rng.next() * TAU, cell: -1, slot: -1
      });
      this.snacks++;
    }

    /** Food of some other kind: remains, a turbo crumb, or a chest's burst. */
    drop(x, y, v, k, c, life) {
      const lim = this.R - 20;
      const d2 = x * x + y * y;
      if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); x *= s; y *= s; }
      this.food.add({
        x: x, y: y, v: v, k: k, r: Math.min(22, (k === 2 ? 3 : 4.5) + Math.sqrt(v) * (k === 2 ? 1.3 : 1.5)),
        look: this.rng.int(8), c: c, born: this.tick, until: this.tick + life + this.rng.int(240),
        ph: this.rng.next() * TAU, cell: -1, slot: -1
      });
    }

    /** A point `s` world units back along a worm's body from its head. */
    bodyAt(w, s) {
      const path = w.path;
      if (!path.length) return { x: w.x, y: w.y };
      if (s <= w.since) {
        const t = w.since > 0 ? s / w.since : 0;
        return { x: w.x + (path[0].x - w.x) * t, y: w.y + (path[0].y - w.y) * t };
      }
      const rest = s - w.since;
      const k = Math.floor(rest / NODE);
      if (k >= path.length - 1) { const e = path[path.length - 1]; return { x: e.x, y: e.y }; }
      const f = (rest - k * NODE) / NODE, a = path[k], b = path[k + 1];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }

    /** How much of a worm's body is actually laid out behind it. */
    bodyLength(w) {
      return Math.min(w.len, w.since + Math.max(0, w.path.length - 1) * NODE);
    }

    /**
     * A dead worm is the best meal in the arena, and a big one is a feast:
     * most of what it weighed, laid along where its body lay, in its colours.
     */
    scatter(w) {
      const skin = PV.WormSkins.get(w.skin);
      const avail = this.bodyLength(w);
      const n = PV.clamp(Math.round(avail / (w.r * 1.15)), 3, 150);
      const each = (w.mass * REMAINS_SHARE) / n;
      const gap = w.r * 0.55;
      for (let i = 0; i < n; i++) {
        const s = (i + 0.5) * avail / n;
        const at = this.bodyAt(w, s);
        this.drop(at.x + (this.rng.next() - 0.5) * w.r * 1.2, at.y + (this.rng.next() - 0.5) * w.r * 1.2,
          each * (0.7 + this.rng.next() * 0.6), 1, PV.WormSkins.colorAt(skin, Math.round(s / gap)),
          REMAINS_TICKS);
      }
    }

    /** What the turbo burns lands behind the tail. */
    dropCrumb(w, v) {
      if (this.food.count > this.foodCap) return;
      const avail = this.bodyLength(w);
      const at = this.bodyAt(w, avail);
      const skin = PV.WormSkins.get(w.skin);
      this.drop(at.x + (this.rng.next() - 0.5) * w.r, at.y + (this.rng.next() - 0.5) * w.r, v, 2,
        PV.WormSkins.colorAt(skin, Math.round(avail / (w.r * 0.55))), CRUMB_TICKS);
    }

    captureOf(w) { return w.r * 1.3 + 14 + (w.fx.magnet > 0 ? MAGNET + w.r * 1.5 : 0); }

    /** Food within reach of a head leaves the floor and flies to it. */
    feed(w) {
      const list = this.food.near(w.x, w.y, this.captureOf(w), this.scratchFood);
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        this.food.remove(f);
        this.flying.push({ f: f, w: w });
      }
    }

    flyFood() {
      const list = this.flying;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const it = list[i], f = it.f, w = it.w;
        if (!w.alive) {                         // the mouth is gone: it falls
          this.food.add(f);
          continue;
        }
        const dx = w.x - f.x, dy = w.y - f.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < w.r * 0.7 + 3) { this.gain(w, f); continue; }
        const go = Math.min(d, 3 + w.step + d * 0.28);
        f.x += (dx / d) * go;
        f.y += (dy / d) * go;
        list[n++] = it;
      }
      list.length = n;
    }

    /**
     * Swallow one piece. Time's double counts only food the ARENA makes —
     * snacks and a chest's burst — because remains were somebody's mass
     * already, and paying them at 1.6 times what the worm weighed printed
     * mass every time two worms traded kills: a seven-minute round ended
     * with a worm of four million. The ×5 potion pays on everything but
     * turbo crumbs, or a worm could burn a unit and eat back three.
     */
    gain(w, f) {
      let v = f.v;
      if (f.k === 0 || f.k === 3) v *= this.mode.mult;
      if (w.fx.x5 > 0 && f.k !== 2) v *= 5;
      w.mass += v;
      if (w.mass > w.best) w.best = w.mass;
      size(w);
      if (f.k === 0) this.snacks--;
      if (w === this.player && f.k !== 0 && f.v >= 4) this.push({ kind: 'gulp', x: f.x, y: f.y, c: f.c });
    }

    /* -------------------------------------------- potions, coins, chests */

    addPotion() {
      const pt = this.randomPoint(this.R - 160);
      this.potions.push({ x: pt.x, y: pt.y, kind: POTIONS[this.rng.int(POTIONS.length)], ph: this.rng.next() * TAU });
    }

    addCoin() {
      const pt = this.randomPoint(this.R - 120);
      this.coinSpots.push({ x: pt.x, y: pt.y, ph: this.rng.next() * TAU });
    }

    /** A chest goes somewhere worth the trip: the furthest of a few tries. */
    addChest() {
      const p = this.player;
      let best = null, bestD = -1;
      for (let i = 0; i < 12; i++) {
        const pt = this.randomPoint(this.R - 220);
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d > bestD) { bestD = d; best = pt; }
        if (d > 900 && this.rng.next() < 0.5) break;
      }
      this.chests.push({ x: best.x, y: best.y, ph: this.rng.next() * TAU });
    }

    pickUps(w) {
      const reach = w.r + 20;
      for (let i = this.potions.length - 1; i >= 0; i--) {
        const p = this.potions[i];
        const dx = p.x - w.x, dy = p.y - w.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        w.fx[p.kind] = w === this.player ? this.potionTicks : POTION_TICKS;
        this.potions.splice(i, 1);
        this.later.push({ at: this.tick + 480 + this.rng.int(480), what: 'potion' });
        if (w === this.player) this.push({ kind: 'potion', potion: p.kind, x: p.x, y: p.y });
      }
      if (w !== this.player) return;               // coins and chests are yours alone

      const cr = w.r + 16 + (w.fx.magnet > 0 ? MAGNET * 0.6 : 0);
      for (let i = this.coinSpots.length - 1; i >= 0; i--) {
        const c = this.coinSpots[i];
        const dx = c.x - w.x, dy = c.y - w.y;
        if (dx * dx + dy * dy > cr * cr) continue;
        this.coins += this.mode.mult;
        this.coinSpots.splice(i, 1);
        this.later.push({ at: this.tick + 600 + this.rng.int(600), what: 'coin' });
        this.push({ kind: 'coin', x: c.x, y: c.y, n: this.mode.mult });
      }

      const hr = w.r + 34;
      for (let i = this.chests.length - 1; i >= 0; i--) {
        const c = this.chests[i];
        const dx = c.x - w.x, dy = c.y - w.y;
        if (dx * dx + dy * dy > hr * hr) continue;
        this.chests.splice(i, 1);
        this.chestsFound++;
        this.coins += 10 * this.mode.mult;
        const colours = ['#FFD54F', '#FF8A65', '#4FC3F7', '#AED581', '#F06292'];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU, d = 40 + this.rng.next() * 70;
          this.drop(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 6, 3, colours[k % colours.length], REMAINS_TICKS);
        }
        this.later.push({ at: this.tick + 240, what: 'chest' });
        this.push({ kind: 'chest', x: c.x, y: c.y, n: 10 * this.mode.mult });
      }
    }

    /* ----------------------------------------------------------- moving */

    turnRate(w, base) {
      const circle = Math.max(TURN_MIN, TURN_K * w.r);
      return (base / circle) * (w.fx.turn > 0 ? TURN_FX : 1);
    }

    /** Steer, spend the turbo, step, and lay the body down behind the head. */
    advanceWorm(w) {
      const base = speedOf(w.mass);
      const om = this.turnRate(w, base);
      if (w.turnKey) {
        w.angle = wrap(w.angle + w.turnKey * om);
        w.aim = w.angle;
        w.turnKey = 0;
      } else {
        const d = wrap(w.aim - w.angle);
        w.angle = wrap(w.angle + (d > om ? om : (d < -om ? -om : d)));
      }

      // Wanting the turbo is not having it: this is the one place that
      // decides, so every control scheme and every bot pays the same price.
      w.boost = w.wantBoost && w.mass > BOOST_FLOOR + 0.5;
      let v = base * (w.fx.speed > 0 ? SPEED_FX : 1);
      if (w.boost) {
        v *= BOOST;
        const loss = Math.min((BURN_BASE + w.mass * BURN_RATE) / HZ, w.mass - BOOST_FLOOR);
        w.mass -= loss;
        w.burn += loss;
        const crumb = Math.max(2, w.mass * 0.004);
        if (w.burn >= crumb) { w.burn -= crumb; this.dropCrumb(w, crumb * CRUMB_SHARE); }
        size(w);
      }

      const ox = w.x, oy = w.y;
      w.px = ox; w.py = oy;
      w.x = ox + Math.cos(w.angle) * v;
      w.y = oy + Math.sin(w.angle) * v;
      w.step = v;

      // Commit a point every NODE along the way, wherever it falls in the step.
      let d = NODE - w.since;
      if (d <= v) {
        const ux = (w.x - ox) / v, uy = (w.y - oy) / v;
        while (d <= v) { w.path.unshift({ x: ox + ux * d, y: oy + uy * d }); d += NODE; }
        w.since = v - (d - NODE);
      } else {
        w.since += v;
      }
      const keep = Math.ceil(Math.max(0, w.len - w.since) / NODE) + 4;
      if (w.path.length > keep) w.path.length = keep;

      const fx = w.fx;
      for (let i = 0; i < POTIONS.length; i++) if (fx[POTIONS[i]] > 0) fx[POTIONS[i]]--;
    }

    /** Every body, as samples a little under a radius apart. */
    buildGrid() {
      const g = this.grid;
      g.clear();
      this.gridWorms.length = 0;
      let maxR = 10;
      for (const w of this.worms) {
        if (!w.alive) continue;
        const o = this.gridWorms.length;
        w.gi = o;
        this.gridWorms.push(w);
        if (w.r > maxR) maxR = w.r;
        g.add(w.x, w.y, w.r, o, true);
        const stride = Math.max(1, Math.round((w.r * 0.7) / NODE));
        const path = w.path;
        for (let j = stride - 1; j < path.length; j += stride) {
          if (w.since + j * NODE > w.len) break;
          g.add(path[j].x, path[j].y, w.r, o, false);
        }
      }
      this.maxR = maxR;
    }

    /**
     * Heads against the wall and against everybody else. Deaths are
     * gathered first and settled after, so the order worms are checked in
     * never decides who lived.
     */
    collide() {
      const g = this.grid, near = this.scratch, dead = this.dying;
      dead.length = 0;
      for (let o = 0; o < this.gridWorms.length; o++) {
        const w = this.gridWorms[o];
        if (w.parked) continue;
        const lim = this.R - w.r * 0.4;
        if (w.x * w.x + w.y * w.y > lim * lim) { dead.push(w, 'wall', null); continue; }
        const reach = w.r * HEAD_HIT;
        g.near(w.x, w.y, reach + this.maxR, near);
        for (let q = 0; q < near.length; q++) {
          const i = near[q];
          const oo = g.own[i];
          if (oo === o) continue;
          const other = this.gridWorms[oo];
          if (other.parked) continue;                 // the player, still at the line
          const dx = g.xs[i] - w.x, dy = g.ys[i] - w.y, hit = g.rs[i] + reach;
          if (dx * dx + dy * dy >= hit * hit) continue;
          // Head to head: the bigger worm shrugs it off.
          const hx = other.x - w.x, hy = other.y - w.y, both = (w.r + other.r) * 0.95;
          if (hx * hx + hy * hy < both * both && w.mass > other.mass) continue;
          dead.push(w, 'worm', other);
          break;
        }
      }
      for (let i = 0; i < dead.length; i += 3) this.kill(dead[i], dead[i + 1], dead[i + 2]);
    }

    kill(w, cause, killer) {
      if (!w.alive) return;
      w.alive = false;
      w.cause = cause;
      this.culled = true;
      if (killer && killer !== w) killer.kills++;
      const skin = PV.WormSkins.get(w.skin);
      this.push({ kind: 'death', x: w.x, y: w.y, r: w.r, c: skin.colors[0], me: w === this.player });
      if (killer === this.player) this.push({ kind: 'kill', name: w.name, mass: Math.floor(w.mass) });
      if (w.mass >= 60) {
        this.graves.push({ x: w.x, y: w.y, v: Math.round(w.mass * REMAINS_SHARE), at: this.tick });
        if (this.graves.length > 24) this.graves.shift();
      }
      this.scatter(w);
      if (w === this.player) {
        this.lastDeath = {
          cause: cause, by: killer ? killer.name : null, at: this.tick,
          x: w.x, y: w.y, mass: Math.floor(w.mass)
        };
        this.deaths++;
        if (this.mode.respawn) this.respawnAt = this.tick + RESPAWN_TICKS;
        else { this.finalScore = Math.floor(w.mass); this.finishAt = this.tick + DEATH_TICKS; }
      } else {
        this.pending.push(this.tick + 60 + this.rng.int(180));
      }
    }

    respawnPlayer() {
      const p = this.player;
      this.respawnAt = 0;
      p.mass = START_MASS;
      size(p);
      p.alive = true;
      p.cause = null;
      p.burn = 0;
      p.boostLatch = false; p.boostHold = 0; p.turnKey = 0;
      for (const k of POTIONS) p.fx[k] = 0;
      const s = this.spawnSpot(0, p);
      this.layBody(p, s.x, s.y, s.a);
      p.born = this.tick;
      this.push({ kind: 'respawn' });
    }

    /* --------------------------------------------------------------- ai */

    pickFood(w) {
      const rad = 340 + w.r * 4;
      const list = this.food.near(w.x, w.y, rad, this.scratchFood);
      const cx = Math.cos(w.angle), cy = Math.sin(w.angle);
      const lim = this.R - 90 - w.r;
      let best = null, bestS = 0;
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f.x * f.x + f.y * f.y > lim * lim) continue;     // not worth the wall
        const dx = f.x - w.x, dy = f.y - w.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        // Ahead is cheaper than behind: a worm cannot stop and turn round.
        const s = (f.v / (d + 60)) * (1.3 + ((dx * cx + dy * cy) / d) * 0.7);
        if (s > bestS) { bestS = s; best = f; }
      }
      return best;
    }

    /** The nearest worm that is not so much bigger it is weather. */
    pickPrey(w) {
      if (w.brain.aggro < 0.25) return null;
      const reach = 260 + w.r * 3;
      let best = null, bestD = reach * reach;
      for (const o of this.worms) {
        if (o === w || !o.alive || o.parked) continue;
        if (o.mass > w.mass * 2.5 + 100) continue;
        const dx = o.x - w.x, dy = o.y - w.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = o; }
      }
      return best && this.rng.next() < w.brain.aggro ? best : null;
    }

    /**
     * A bot decides where it wants to go — a worm to cut off or coil round,
     * the best food in reach, or a wander — and then looks down a fan of
     * headings for the one that is clear and closest to that. Rerun every
     * few ticks: re-deciding sixty times a second plays no better.
     */
    think(w) {
      const b = w.brain, R = this.R;
      const look = (70 + w.r * 3.2 + w.step * 16) * (0.65 + 0.55 * b.skill);
      let want = null;

      if (this.tick >= b.nextLook) {
        b.nextLook = this.tick + 30 + this.rng.int(40);
        b.prey = this.pickPrey(w);
      }
      const o = b.prey;
      if (o && o.alive && !o.parked) {
        const dx = o.x - w.x, dy = o.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 520 + w.r * 4) {
          b.prey = null;
        } else if (w.len > 500 && w.mass > o.mass * 2.5 && d < 200 + w.r * 3) {
          // Coil: go round it a little inside the tangent, so the ring closes.
          if (!b.side) b.side = this.rng.next() < 0.5 ? 1 : -1;
          want = Math.atan2(dy, dx) + b.side * (Math.PI / 2 - 0.4);
        } else {
          // Cut it off: run alongside, get ahead of its head, then turn
          // across. Straight at the head is a head-on, and the bigger wins.
          const lead = d * 0.7 + 60 + o.r * 3;
          want = Math.atan2(o.y + Math.sin(o.angle) * lead - w.y, o.x + Math.cos(o.angle) * lead - w.x);
          const alongside = Math.cos(wrap(w.angle - o.angle)) > 0.5;
          if (alongside && d < 300 && w.mass > 50 && b.aggro > 0.5 && this.rng.next() < 0.3) {
            b.boostUntil = this.tick + 20 + this.rng.int(25);
          }
        }
      } else if (o) {
        b.prey = null;
      }

      if (want == null) {
        let f = b.food;
        if (!f || f.cell < 0 || this.tick >= b.nextFood) {
          f = b.food = this.pickFood(w);
          b.nextFood = this.tick + 20 + this.rng.int(25);
        }
        if (f) {
          want = Math.atan2(f.y - w.y, f.x - w.x);
          if (f.k === 1 && f.v > 6 && w.mass > 60 && this.rng.next() < b.aggro * 0.06) {
            b.boostUntil = this.tick + 15 + this.rng.int(20);
          }
        } else {
          b.wander = PV.clamp(b.wander + (this.rng.next() - 0.5) * 0.5, -1, 1);
          want = w.angle + b.wander * 0.35;
        }
      }

      // Too near the wall, home is the only goal.
      const dc = Math.sqrt(w.x * w.x + w.y * w.y);
      if (dc > R - look * 1.3 - w.r) want = Math.atan2(-w.y, -w.x);

      // A dim bot sometimes stops looking. That is how the arena gets fed.
      if (b.blunder > 0) { b.blunder -= b.every; w.aim = want; return; }
      if (this.rng.next() < (1 - b.skill) * 0.006) b.blunder = 30 + this.rng.int(40);

      const g = this.grid;
      const near = g.near(w.x, w.y, look + this.maxR + w.r, this.scratch);
      // Somebody else's head is not where it is, it is where it is going:
      // three more obstacles laid ahead of it, or two worms meeting head on
      // each see the other as parked and both steer into the same gap.
      const obs = this.obstacles || (this.obstacles = []);
      obs.length = 0;
      for (let q = 0; q < near.length; q++) {
        const i = near[q];
        if (g.own[i] === w.gi) continue;
        obs.push(g.xs[i] - w.x, g.ys[i] - w.y, g.rs[i]);
        if (!g.hd[i]) continue;
        const other = this.gridWorms[g.own[i]];
        const gap = other.step * 7 + other.r * 0.8;
        const ox = Math.cos(other.angle) * gap, oy = Math.sin(other.angle) * gap;
        for (let k = 1; k <= 3; k++) obs.push(g.xs[i] + ox * k - w.x, g.ys[i] + oy * k - w.y, other.r);
      }
      const margin = 6 + w.step * 2;
      // Room to turn away in: anything nearer than a turning circle is
      // already a wall, whatever food is behind it. The circle is the one
      // it is driving on now, and a turbo doubles it.
      const circle = w.step > 0 ? w.step / this.turnRate(w, speedOf(w.mass)) : TURN_MIN;
      const room = circle * 1.4 + w.r + margin;
      let bestDir = want, bestScore = -Infinity, bestClear = look;
      for (let k = 0; k < RAYS.length; k++) {
        const dir = w.angle + RAYS[k];
        const cx = Math.cos(dir), cy = Math.sin(dir);
        let clear = look;
        for (let q = 0; q < obs.length; q += 3) {
          const px = obs[q], py = obs[q + 1], rs = obs[q + 2];
          const t = px * cx + py * cy;
          if (t <= 0 || t - rs > clear) continue;
          const perp = px * cy - py * cx, need = w.r + rs + margin;
          if (perp > need || perp < -need) continue;
          const hitT = t - Math.sqrt(need * need - perp * perp);
          if (hitT < clear) clear = hitT < 0 ? 0 : hitT;
        }
        const wall = rayOut(w.x, w.y, cx, cy, R - w.r - 16);
        if (wall < clear) clear = wall;
        let s = (clear / look) * 1.4 + Math.cos(wrap(dir - want)) * 0.9 - Math.abs(RAYS[k]) * 0.05;
        const tight = Math.max(room, look * 0.35);
        if (clear < tight) s -= 2 + ((tight - clear) / tight) * 4;
        if (s > bestScore) { bestScore = s; bestDir = dir; bestClear = clear; }
      }
      w.aim = wrap(bestDir);
      // Never turbo into a closing gap.
      if (bestClear < look * 0.7) b.boostUntil = 0;
    }

    /* ------------------------------------------------------------- tick */

    push(ev) {
      this.events.push(ev);
      if (this.events.length > 64) this.events.shift();
    }

    /** Leave the start line. The spot it waited on may have been crossed. */
    begin() {
      if (!this.ready) return;
      this.ready = false;
      this.startTick = this.tick;
      const p = this.player;
      if (this.clearance(p.x, p.y, 220, p) < 220) {
        const s = this.spawnSpot(0, p);
        this.layBody(p, s.x, s.y, s.a);
      }
      p.parked = false;
      p.born = this.tick;
      this.push({ kind: 'start' });
    }

    control(a) {
      const p = this.player;
      if (a && typeof a === 'object') {
        if (typeof a.aim === 'number' && isFinite(a.aim)) p.aim = wrap(a.aim);
        if (typeof a.boost === 'boolean') p.boostLatch = a.boost && !this.ready;
      }
      if (this.ready) {
        if (a === 'go' || a === 'boost' || a === 'left' || a === 'right') this.begin();
        return;
      }
      if (a === 'left') p.turnKey = -1;
      else if (a === 'right') p.turnKey = 1;
      else if (a === 'boost') p.boostHold = 1;       // the harness re-sends it every tick it is held
    }

    step() {
      const p = this.player;
      for (const a of this.takeInputs()) this.control(a);

      for (const w of this.worms) {
        if (!w.alive || !w.bot) continue;
        if ((this.tick + w.id) % w.brain.every === 0) this.think(w);
        w.wantBoost = this.tick < w.brain.boostUntil && w.mass > 40;
      }
      if (p.alive && !p.parked) {
        p.wantBoost = p.boostLatch || p.boostHold > 0;
        if (p.boostHold > 0) p.boostHold--;
      }

      for (const w of this.worms) if (w.alive && !w.parked) this.advanceWorm(w);
      this.buildGrid();
      this.collide();
      for (const w of this.worms) {
        if (!w.alive || w.parked) continue;
        this.feed(w);
        this.pickUps(w);
      }
      this.flyFood();

      // Put the arena back the way it was: food, potions, coins, bots.
      if (this.tick % 30 === 0) this.sweep();
      for (let add = Math.min(12, this.snackTarget - this.snacks); add > 0; add--) this.addSnack();
      for (let i = this.later.length - 1; i >= 0; i--) {
        const l = this.later[i];
        if (l.at > this.tick) continue;
        this.later.splice(i, 1);
        if (l.what === 'potion') this.addPotion();
        else if (l.what === 'coin') this.addCoin();
        else if (l.what === 'chest') this.addChest();
      }
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i] > this.tick) continue;
        this.pending.splice(i, 1);
        this.spawnBot(false);
      }
      if (this.culled) {
        this.culled = false;
        this.worms = this.worms.filter(w => w.alive || w === p);
      }

      // The player's own clock: a death, a respawn, the bell.
      if (this.respawnAt && this.tick >= this.respawnAt) this.respawnPlayer();
      if (!this.ready && this.tick % 30 === 0 && p.alive) {
        const r = this.rank().place;
        if (!this.bestRank || r < this.bestRank) this.bestRank = r;
      }
      this.score = this.finalScore != null ? this.finalScore
        : (p.alive && !p.parked ? Math.floor(p.mass) : 0);
      if (this.finishAt && this.tick >= this.finishAt) { this.finish(this.lastDeath ? this.lastDeath.cause : 'dead'); return; }
      if (this.mode.ticks && !this.ready && this.tick - this.startTick >= this.mode.ticks) {
        this.finalScore = p.alive ? Math.floor(p.mass) : 0;
        this.score = this.finalScore;
        this.finalRank = this.rank();
        this.finish('time');
      }
    }

    /** Remains and crumbs do not lie there for ever. */
    sweep() {
      const cells = this.food.cells, now = this.tick;
      for (let c = 0; c < cells.length; c++) {
        const arr = cells[c];
        if (!arr) continue;
        for (let i = arr.length - 1; i >= 0; i--) {
          const f = arr[i];
          if (f.until && f.until <= now) this.food.remove(f);
        }
      }
      while (this.graves.length && now - this.graves[0].at > REMAINS_TICKS) this.graves.shift();
    }

    /* ----------------------------------------------------------- reading */

    /** Everyone in the fight, biggest first. The view shows the top of it. */
    leaderboard() {
      return this.worms.filter(w => w.alive && !w.parked).sort((a, b) => b.mass - a.mass || a.id - b.id);
    }

    rank() {
      const board = this.leaderboard();
      const at = board.indexOf(this.player);
      return { place: at < 0 ? board.length + 1 : at + 1, of: board.length + (at < 0 ? 1 : 0) };
    }

    /** Ticks left on the clock in time mode; 0 in the others. */
    timeLeft() {
      if (!this.mode.ticks) return 0;
      if (this.ready) return this.mode.ticks;
      return Math.max(0, this.mode.ticks - (this.tick - this.startTick));
    }
  };

  Object.assign(PV.Worms, {
    START_MASS: START_MASS, BOOST_FLOOR: BOOST_FLOOR, NODE: NODE, BOOST: BOOST,
    BURN_BASE: BURN_BASE, BURN_RATE: BURN_RATE, CRUMB_SHARE: CRUMB_SHARE,
    POTIONS: POTIONS, POTION_TICKS: POTION_TICKS, POTION_UP: POTION_UP, MAGNET: MAGNET,
    SPEED_FX: SPEED_FX, TURN_FX: TURN_FX, REMAINS_SHARE: REMAINS_SHARE,
    MODES: MODES, CROWDS: CROWDS, RESPAWN_TICKS: RESPAWN_TICKS, DEATH_TICKS: DEATH_TICKS,
    radiusOf: radiusOf, lengthOf: lengthOf, speedOf: speedOf, wrap: wrap, size: size
  });

})(window.PV);
