/* 卡丁车 / Kart Racing — engine.

   On the real-time contract: a fixed 60 Hz tick, no clock reads, all
   randomness from the seed, so a race replays exactly and two friends could
   later run the same one.

   Progress is measured in centreline NODES, accumulated as a signed total
   rather than as "have we crossed the line yet". A finish line you can only
   trip by driving over it is the classic racing-game bug: reverse over it and
   you gain a lap, cut the last corner and you lose one. Accumulating the
   shortest signed step each tick makes both impossible — going backwards
   subtracts, a lap is a whole loop of nodes, and the shortcut simply hands out
   its nodes faster than the long way round.

   Surfaces are the difficulty: asphalt is fast, the dirt chord is a little
   slower but much shorter, and the grass is punishing. Those three numbers are
   the first thing to tune and they live in track.js — the track has to price
   dirt against asphalt to work out whether its own shortcut is worth having.

   What makes it a kart race rather than a driving model:

   - **Drifting pays, in three steps.** Hold the drift through a corner and the
     sparks go blue, then orange, then purple; let go and you get a boost worth
     what you charged. Slower now for faster in a moment is the whole skill.
   - **Item boxes, weighted by position.** The leader draws bananas and
     shields; the tail draws mushrooms and the only lightning. A kart race
     where the leader also draws the best items is a procession.
   - **Nobody gets a faster kart for free.** A rival's advantage is nerve and a
     small catch-up allowance; the player's kart class trades acceleration
     against top speed, and rivals drive the medium one. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const ON = PV.RaceTracks.SURFACE.road;
  const DIRT = PV.RaceTracks.SURFACE.dirt;      // the shortcut
  const OFF = PV.RaceTracks.SURFACE.grass;      // the grass
  const ACCEL = 0.0105, BRAKE = 0.021;
  // Steering rate and its fade are shared with track.js, which needs them to
  // tell a corner from a sweep and a shortcut from a trap.
  const TURN = PV.RaceTracks.TURN, GRIP_FADE = PV.RaceTracks.GRIP_FADE;
  const STEER_EASE = 0.22;                      // how fast the wheel reaches lock
  const GRIP_IN = 0.12;                         // speed at which steering bites
  const LIMIT_EASE = 0.12;                      // ticks it takes to lose a surface
  const GRID_ROW = 3;                           // nodes between rows on the grid
  const NODE_STEP = 2;                          // most nodes a tick can be worth
  const CRAWL = 0.15;                           // slowest a rival will ever go

  /** Kart classes trade the same budget three ways. */
  const KARTS = {
    light: { accel: 1.22, max: 0.94, turn: 1.16 },
    medium: { accel: 1.00, max: 1.00, turn: 1.00 },
    heavy: { accel: 0.82, max: 1.08, turn: 0.88 }
  };

  const BOOST_MAX = 1.55;                       // ceiling multiplier while boosting
  const BOOST_ACCEL = 2.4;
  const PAD_BOOST = 55;
  const SPIN_TICKS = 45;                        // a banana, a shell or a bolt
  const SLIP_TICKS = 42;                        // oil: you keep going, you just cannot steer
  const DRIFT_TURN = 1.75;
  const DRIFT_SLIP = 0.42;                      // radians a drift travels wide
  const SLIP_EASE = 0.14;
  const DRIFT_LEVELS = [40, 95, 165];           // ticks held for mini / super / ultra
  const DRIFT_BOOST = [36, 58, 86];
  const COUNTDOWN = 180;                        // three seconds of lights
  const COIN_CAP = 10, COIN_BONUS = 0.01;       // ten coins, one per cent each
  const COIN_BACK = 420;                        // ticks before a coin comes back
  const SHELL_SPEED = 0.62, SHELL_LIFE = 300;
  const BANANA_LIFE = 60 * 45, HAZARD_CAP = 14;
  const PAD_QUIET = 30;                         // ticks between two pad flashes
  const RESET_STALL = 30;                       // the price of asking for a tow

  const ITEMS = ['mushroom', 'banana', 'shell', 'shield', 'lightning'];

  /* Rivals differ in nerve and habits, never in machinery. */
  const STYLES = {
    beginner: { skill: 0.86, item: 0.010, shortcut: false },
    balanced: { skill: 0.93, item: 0.020, shortcut: false },
    aggressive: { skill: 0.97, item: 0.035, shortcut: true },
    expert: { skill: 1.00, item: 0.030, shortcut: true }
  };
  const GRID_STYLES = ['expert', 'aggressive', 'balanced', 'expert',
                       'aggressive', 'balanced', 'beginner'];
  const NAMES = ['Rocket', 'Turbo', 'Flash', 'Shadow', 'Speedy', 'Thunder', 'Rookie'];

  PV.Racing = class Racing extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.track = PV.RaceTracks.build(o.track || 'ring');
      this.laps = o.laps || 3;
      this.cars = [];
      this.shells = [];
      this.hazards = [];
      this.boxes = [];
      this.events = [];              // one tick of news for the view
      this.phase = 'countdown';
      this.startTick = -1;
      this.startKind = '';

      /* Two abreast, three nodes between rows, and the player on the back row.
         Single file five nodes apart strung eight karts over eighty units of a
         forty-eight unit screen: half the field started out of sight, and the
         player started on pole with nothing to overtake. A short grid puts the
         whole race on screen at the lights and gives the item weighting — which
         exists to arm the tail — something to do. */
      const rivals = o.rivals == null ? 7 : o.rivals;
      const field = rivals + 1;
      for (let i = 0; i < field; i++) {
        const slot = i === 0 ? field - 1 : i - 1;
        const node = (this.track.n - Math.floor(slot / 2) * GRID_ROW) % this.track.n;
        const start = this.track.points[node];
        const nrm = this.track.normals[node];
        const lane = (slot % 2 ? 1 : -1) * 1.7;
        const style = STYLES[GRID_STYLES[slot % GRID_STYLES.length]] || STYLES.balanced;
        this.cars.push({
          i: i,
          grid: slot,                  // decides the standings while all are level
          isPlayer: i === 0,
          name: i === 0 ? 'You' : NAMES[(i - 1) % NAMES.length],
          kart: KARTS[i === 0 ? (o.kart || 'medium') : 'medium'] || KARTS.medium,
          x: start.x + nrm.x * lane,
          y: start.y + nrm.y * lane,
          angle: Math.atan2(this.track.tangents[node].y, this.track.tangents[node].x),
          speed: 0,
          wheel: 0,                    // where the steering actually is
          slide: 0,                    // radians the kart is travelling wide
          ceiling: 0,                  // the speed the surface is letting you keep
          padAt: 0,
          node: node,
          total: 0,
          lap: 0,
          lapTick: 0,
          best: 0,
          done: false,
          finishTick: 0,
          item: null,
          shield: false,
          coins: 0,
          boost: 0,
          spin: 0,
          slip: 0,
          stall: 0,
          drift: false,
          charge: 0,
          driftLevel: 0,
          sc: false,
          onShortcut: false,
          // The player carries a style it never uses, so that a test (or a
          // demo mode) can hand its car to the AI without a null.
          style: i === 0 ? STYLES.balanced : style,
          skill: i === 0 ? 1 : style.skill * (0.97 + this.rng.next() * 0.06),
          lane: i === 0 ? 0
            : (this.rng.next() * 2 - 1) * Math.min(1.6, this.track.width / 2 - 2)
        });
      }
      this.player = this.cars[0];
      this.finished = 0;
      this.steer = 0;
      this.throttle = 0;
      this.driftHold = 0;

      // `curve` measures the tangent's turn across eight nodes; this is how
      // many units of road that is, which turns a curve value into a radius.
      this.curveSpan = this.track.length / this.track.n * 8;

      this.buildBoxes();
      this.coinBack = new Int32Array(this.track.coins.length);
    }

    /** Six rows of three across the road, so every line through them is even. */
    buildBoxes() {
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const node = Math.round((r + 0.5) * this.track.n / rows) % this.track.n;
        for (const lane of [-1.9, 0, 1.9]) {
          const p = this.track.points[node], nrm = this.track.normals[node];
          this.boxes.push({
            node: node, x: p.x + nrm.x * lane, y: p.y + nrm.y * lane, at: 0
          });
        }
      }
    }

    /* ---------------------------------------------------------- surfaces */

    /** Road, the dirt chord, or the grass — and the node that goes with it. */
    surfaceOf(car) {
      const near = PV.RaceTracks.locate(this.track, car.x, car.y, car.node, 12);
      car.node = near.node;
      car.onShortcut = near.shortcut;
      car.offRoad = near.dist > near.half;
      if (car.offRoad) return OFF;
      return near.shortcut ? DIRT : ON;
    }

    /**
     * How much of the steering reaches the road.
     *
     * Two terms, and the second one is new: grip ramps IN off the line, so a
     * stopped kart cannot pirouette, and washes OUT with speed, so a kart at
     * full chat runs a wider arc than one picking its way out of a spin. Flat
     * grip is what made the kart handle like a turret — the same 189 deg/s
     * whether it was crawling or flying.
     */
    gripOf(car) {
      return Math.min(1, car.speed / GRIP_IN)
        / (1 + Math.max(0, car.speed) * GRIP_FADE)
        * (car.slip ? 0.35 : 1);
    }

    /**
     * The fastest a kart can hold a bend of this curvature — the same model
     * the track uses to place its furniture, rather than a tuned multiplier.
     *
     * The multiplier it replaces, `1 - min(0.62, bend * 2.4)`, saturated for
     * any bend past 0.26, which on the ring is the whole lap: the field
     * pinned itself to 38% of top speed all the way round a circuit it could
     * have taken flat, then crawled off the road, because a kart doing 0.16
     * cannot steer either.
     */
    cornerSpeed(bend, span) {
      return PV.RaceTracks.holdSpeed(bend, span || this.curveSpan);
    }

    /** Where a rival is aiming: up the road in its lane, or down the chord. */
    aimFor(car) {
      const tk = this.track, s = tk.shortcut;
      if (car.sc && s) {
        /* Follow the chord, do not aim at the end of it. A single target fifty
           units away is a straight line from wherever the kart happens to be,
           so the first metre of dirt threw it into the grass — and once off,
           the exit node never arrived, `sc` never cleared, and the kart drove
           at that exit across the infield for the rest of the race. Every
           rival stranded in the middle of the ring was this one branch.

           The entry and the exit both get a lead: aim a little way DOWN the
           dirt while still approaching it, and up the road past the exit
           before running out of it. A kart that arrives at either end still
           pointing the old way has to turn fifty-odd degrees on the spot, and
           at full lock that takes long enough to put it in the grass. */
        const last = s.points.length - 1;
        const togo = PV.RaceTracks.delta(tk, car.node, s.from);
        const lead = 2 + Math.round(car.speed * 4);
        if (togo > 0) {
          /* Still short of the mouth. The dirt now leaves the circuit along
             the road's own tangent, so aiming up the road IS aiming at its
             entry: no special case, and nothing cutting across the grass to
             get there early. */
          const i = (car.node + 4 + Math.round(car.speed * 6)) % tk.n;
          const q = tk.points[i];
          return { x: q.x, y: q.y, node: i };
        }
        let bi = 0, bd = Infinity;
        for (let k = 0; k <= last; k++) {
          const q = s.points[k];
          const d = (q.x - car.x) * (q.x - car.x) + (q.y - car.y) * (q.y - car.y);
          if (d < bd) { bd = d; bi = k; }
        }
        const reach = s.half + 4;
        if (bd > reach * reach) {
          car.sc = false;                        // lost the dirt: back to the road
        } else if (bi + lead >= last) {
          if (bi >= last - 1) car.sc = false;
          const j = (s.to + 5) % tk.n;
          const q = tk.points[j];
          return { x: q.x, y: q.y, node: j };
        } else {
          car.scIdx = bi;                        // the dirt's own bend, for the cap
          const q = s.points[bi + lead];
          return { x: q.x, y: q.y, node: s.to };
        }
      }

      /* Look further up the road the faster you are going, but much less far
         through a bend, and shorten right up when you are already in the grass.
         A look-ahead fixed to speed alone aims across the inside of a corner,
         and a straight line to a point that is off the road puts you off the
         road: that one number had the field spending a third of every race —
         and one rival four fifths of it — on the infield. */
      const bend = tk.curve[(car.node + 3) % tk.n] + tk.curve[(car.node + 7) % tk.n]
        + tk.curve[(car.node + 11) % tk.n];
      const lost = car.offRoad;
      const ahead = lost ? 4
        : Math.max(3, Math.round((4 + car.speed * 8) / (1 + bend * 2.6)));

      /* A slick on the line ahead: the quick ones go round it, the slow ones
         find out. Every rival used to drive through every patch about once a
         lap, and oil was far and away the commonest reason one of them was in
         the grass — not a mistake it made, just one it never saw coming. */
      const edge = tk.width / 2 - 1;
      let lane = lost ? 0 : car.lane;
      if (!lost && car.skill > 0.92) {
        for (const o of tk.oil) {
          const d = PV.RaceTracks.delta(tk, car.node, o.node);
          if (d < 0 || d > ahead + 6) continue;
          const q = tk.points[o.node], qn = tk.normals[o.node];
          const at = (o.x - q.x) * qn.x + (o.y - q.y) * qn.y;
          if (Math.abs(at - lane) > o.r + 1.1) continue;     // not on our line
          lane = Math.max(-edge, Math.min(edge, at - (at < 0 ? -1 : 1) * (o.r + 1.5)));
          break;
        }
      }
      const i = (car.node + ahead) % tk.n;
      const p = tk.points[i], nrm = tk.normals[i];
      return { x: p.x + nrm.x * lane, y: p.y + nrm.y * lane, node: i };
    }

    /* ------------------------------------------------------------- items */

    /**
     * The roulette, weighted by how far back you are: 0 is the leader, 1 the
     * tail. Lightning only exists for the back half of the field.
     */
    rollItem(place, of) {
      const back = (place - 1) / Math.max(1, of - 1);
      const weights = [
        1 + back * 3.2,                       // mushroom
        3 - back * 2.2,                       // banana
        2,                                    // shell
        1.4,                                  // shield
        back > 0.55 ? 0.9 : 0                 // lightning
      ];
      let total = 0;
      for (const w of weights) total += w;
      let roll = this.rng.next() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return ITEMS[i];
      }
      return 'mushroom';
    }

    /** A hit, unless a shield eats it. That is the whole point of a shield. */
    spinCar(car, kind) {
      if (car.done) return false;
      if (car.shield) {
        car.shield = false;
        this.events.push({ kind: 'block', x: car.x, y: car.y, player: car.isPlayer });
        return false;
      }
      if (car.spin > 0) return false;
      car.spin = SPIN_TICKS;
      car.speed *= 0.3;
      car.boost = 0;
      car.charge = 0;
      this.events.push({ kind: 'spin', x: car.x, y: car.y, why: kind || 'hit' });
      return true;
    }

    useItem(car) {
      if (!car.item || car.spin > 0 || car.done) return false;
      const it = car.item;
      car.item = null;
      const cos = Math.cos(car.angle), sin = Math.sin(car.angle);

      if (it === 'mushroom') {
        car.boost = Math.max(car.boost, 62);
      } else if (it === 'shield') {
        car.shield = true;
      } else if (it === 'banana') {
        this.hazards.push({ x: car.x - cos * 1.7, y: car.y - sin * 1.7, owner: car.i, at: this.tick });
        // A five-lap race otherwise ends with forty bananas nobody dropped
        // this minute still sitting on the apexes.
        if (this.hazards.length > HAZARD_CAP) this.hazards.shift();
      } else if (it === 'shell') {
        this.shells.push({
          x: car.x + cos * 1.6, y: car.y + sin * 1.6,
          angle: car.angle, node: car.node, owner: car.i, life: SHELL_LIFE
        });
      } else if (it === 'lightning') {
        // Everyone in front, and only in front — the bolt is the tail's weapon.
        for (const o of this.cars) {
          if (o !== car && !o.done && o.total > car.total) this.spinCar(o, 'bolt');
        }
      }
      this.events.push({ kind: 'use', item: it, x: car.x, y: car.y, player: car.isPlayer });
      return true;
    }

    /** Rivals hold an item until it is worth something, then spend it. */
    aiItem(car) {
      if (!car.item) return;
      const tk = this.track;
      if (car.item === 'shield') {
        this.useItem(car);                                   // always worth wearing
      } else if (car.item === 'banana') {
        if (this.rng.next() < 0.02) this.useItem(car);
      } else if (car.item === 'mushroom') {
        if (tk.curve[(car.node + 8) % tk.n] < 0.05 && car.spin === 0) this.useItem(car);
      } else if (car.item === 'shell') {
        const inFront = this.cars.some(o => {
          if (o === car || o.done) return false;
          const d = PV.RaceTracks.delta(tk, car.node, o.node);
          return d > 2 && d < 45;
        });
        if (inFront) this.useItem(car);
      } else if (this.rng.next() < car.style.item) {
        this.useItem(car);
      }
    }

    /* ------------------------------------------------- things on the road */

    collect(car) {
      if (car.item) return;
      for (const box of this.boxes) {
        if (box.at > this.tick) continue;
        const dx = box.x - car.x, dy = box.y - car.y;
        if (dx * dx + dy * dy > 1.4 * 1.4) continue;
        box.at = this.tick + 300;
        car.item = this.rollItem(this.place(car), this.cars.length);
        this.events.push({ kind: 'pickup', x: box.x, y: box.y, player: car.isPlayer });
        return;
      }
    }

    /** Pads, coins and oil, all read straight off the track's own furniture. */
    roadside(car) {
      for (const pad of this.track.pads) {
        const dx = pad.x - car.x, dy = pad.y - car.y;
        if (dx * dx + dy * dy < 1.5 * 1.5) {
          if (car.boost < PAD_BOOST) car.boost = PAD_BOOST;
          // Sitting on a pad keeps topping the boost up, but it should not
          // announce itself sixty times a second while it does.
          if (this.tick >= car.padAt) {
            car.padAt = this.tick + PAD_QUIET;
            this.events.push({ kind: 'pad', x: pad.x, y: pad.y, player: car.isPlayer });
          }
          break;
        }
      }

      const coins = this.track.coins;
      for (let i = 0; i < coins.length; i++) {
        if (this.coinBack[i] > this.tick) continue;
        const dx = coins[i].x - car.x, dy = coins[i].y - car.y;
        if (dx * dx + dy * dy > 1.2 * 1.2) continue;
        this.coinBack[i] = this.tick + COIN_BACK;
        car.coins++;
        this.events.push({ kind: 'coin', x: coins[i].x, y: coins[i].y, player: car.isPlayer });
      }

      if (car.slip === 0 && car.spin === 0) {
        for (const o of this.track.oil) {
          const dx = o.x - car.x, dy = o.y - car.y;
          if (dx * dx + dy * dy > o.r * o.r) continue;
          car.slip = SLIP_TICKS;
          car.charge = 0;
          this.events.push({ kind: 'slip', x: car.x, y: car.y, player: car.isPlayer });
          break;
        }
      }
    }

    /** A shell follows the road, which is what makes it worth firing at all. */
    moveShells() {
      for (let i = this.shells.length - 1; i >= 0; i--) {
        const s = this.shells[i];
        const tk = this.track;
        const near = PV.RaceTracks.nearest(tk, s.x, s.y, s.node, 14);
        s.node = near.node;
        const target = tk.points[(s.node + 6) % tk.n];
        let err = Math.atan2(target.y - s.y, target.x - s.x) - s.angle;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        s.angle += Math.max(-0.14, Math.min(0.14, err));
        s.x += Math.cos(s.angle) * SHELL_SPEED;
        s.y += Math.sin(s.angle) * SHELL_SPEED;

        let hit = false;
        for (const car of this.cars) {
          if (car.done || car.spin > 0) continue;
          if (car.i === s.owner && s.life > SHELL_LIFE - 25) continue;   // not your own, at first
          const dx = car.x - s.x, dy = car.y - s.y;
          if (dx * dx + dy * dy > 1.0) continue;
          this.spinCar(car, 'shell');
          hit = true;
          break;
        }
        if (hit || --s.life <= 0 || near.dist > this.track.width) this.shells.splice(i, 1);
      }
    }

    hitHazards(car) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        if (h.owner === car.i && this.tick - h.at < 30) continue;        // your own, just dropped
        const dx = h.x - car.x, dy = h.y - car.y;
        if (dx * dx + dy * dy > 0.85 * 0.85) continue;
        this.hazards.splice(i, 1);
        this.spinCar(car, 'banana');
        return;
      }
    }

    /* ----------------------------------------------------------- driving */

    driveAI(car) {
      const tk = this.track;
      // Only the bold take the chord, and only when its entry is right there.
      if (car.style.shortcut && !car.sc && tk.shortcut) {
        const d = PV.RaceTracks.delta(tk, car.node, tk.shortcut.from);
        if (d > 0 && d < 6) car.sc = true;
      }

      const aim = this.aimFor(car);
      const want = Math.atan2(aim.y - car.y, aim.x - car.x);
      let err = want - car.angle;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;

      // Rivals run the player's physics, grip fade included. An AI that could
      // turn harder than you can is not a rival, it is a cheat.
      car.angle += Math.max(-TURN, Math.min(TURN, err * 1.6)) * this.gripOf(car);

      /* Lift off for the corner that is coming, over a window rather than one
         sample: a single node ahead means the brakes come on at the apex and
         come off again halfway round. */
      let cap;
      const sc = car.sc && tk.shortcut && tk.shortcut.hold ? tk.shortcut : null;
      if (sc) {
        // On the dirt, read the dirt: it carries its own limit, worked out
        // from the radius of every step along it. Reading the road's
        // curvature at a node the kart is nowhere near is how it used to
        // arrive at the slip road flat out.
        const h = sc.hold, ci = car.scIdx || 0, end = h.length - 1;
        cap = Math.min(h[Math.min(end, ci)], h[Math.min(end, ci + 3)]) * car.skill;
      } else {
        let bend = 0;
        for (let k = 4; k <= 16; k += 4) bend = Math.max(bend, tk.curve[(car.node + k) % tk.n]);
        cap = Math.min(ON.max, this.cornerSpeed(bend) * 0.92) * car.skill;
      }
      const wide = Math.abs(err) > 0.9;
      if (wide || (car.speed > cap && car.boost === 0)) {
        car.speed -= BRAKE * (car.speed > cap * 1.25 ? 1 : 0.5);
      } else {
        car.speed += ACCEL * (car.boost > 0 ? BOOST_ACCEL : 1);
      }

      /* Rivals never reverse, and never stop. Braking with no floor put a kart
         that had run wide into a deadlock: too slow to steer, so the heading
         error never closed, so it never stopped braking — it drove the rest of
         the race backwards at -0.12 while still collecting nodes. A kart that
         has lost the road should crawl forward and turn round, which is what a
         player would do. */
      if (car.speed < CRAWL) car.speed = Math.min(CRAWL, car.speed + ACCEL * 2);

      this.aiItem(car);
    }

    drivePlayer(car) {
      const drifting = car.drift && this.steer !== 0 && car.speed > 0.17 && !car.slip;

      /* The wheel takes a moment to reach lock and a moment to come back. The
         engine used to put the steering straight into the heading on the tick
         the key went down, which is why the kart read as a twitch rather than
         a weight — and why it snapped straight the instant you let go. */
      car.wheel += (this.steer - car.wheel) * STEER_EASE;
      if (Math.abs(car.wheel) < 0.004) car.wheel = 0;
      if (car.wheel) {
        car.angle += car.wheel * TURN * car.kart.turn
          * (drifting ? DRIFT_TURN : 1) * this.gripOf(car);
      }

      /* A drifting kart travels wide of where its nose is pointing. That slide
         is what the boost is paying for: without it the drift was simply a
         free tighter turn with a prize at the end, so there was no reason not
         to hold it everywhere. */
      const slip = drifting ? car.wheel * DRIFT_SLIP : 0;
      car.slide += (slip - car.slide) * SLIP_EASE;

      if (drifting) {
        car.charge++;
        car.speed *= 0.9965;                    // a drift scrubs a little speed
        car.driftLevel = this.chargeLevel(car.charge);
      } else if (car.charge) {
        // Paid on release, in three steps, so a longer drift is worth holding.
        const lvl = this.chargeLevel(car.charge);
        if (lvl) {
          car.boost = Math.max(car.boost, DRIFT_BOOST[lvl - 1]);
          this.events.push({ kind: 'drift', level: lvl, x: car.x, y: car.y, player: true });
        }
        car.charge = 0;
        car.driftLevel = 0;
      }
      if (car.stall > 0) return;                // a jumped start costs the getaway
      if (this.throttle > 0) car.speed += ACCEL * car.kart.accel * (car.boost > 0 ? BOOST_ACCEL : 1);
      else if (this.throttle < 0) car.speed -= BRAKE;
    }

    chargeLevel(charge) {
      let lvl = 0;
      for (let i = 0; i < DRIFT_LEVELS.length; i++) if (charge >= DRIFT_LEVELS[i]) lvl = i + 1;
      return lvl;
    }

    separate() {
      for (let a = 0; a < this.cars.length; a++) {
        for (let b = a + 1; b < this.cars.length; b++) {
          const A = this.cars[a], B = this.cars[b];
          const dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy);
          if (d > 1.7 || d === 0) continue;
          const push = (1.7 - d) / 2;
          A.x -= (dx / d) * push; A.y -= (dy / d) * push;
          B.x += (dx / d) * push; B.y += (dy / d) * push;
          // A scrape costs a little speed. At ten per cent a tick, a second
          // of contact in the pack was a standing start.
          A.speed *= 0.975; B.speed *= 0.975;
        }
      }
    }

    /** Back onto the centreline where you are, stopped and facing forward. */
    resetCar(car) {
      if (car.done) return;
      const p = this.track.points[car.node], tg = this.track.tangents[car.node];
      car.x = p.x; car.y = p.y;
      car.angle = Math.atan2(tg.y, tg.x);
      car.speed = 0;
      car.spin = 0;
      car.slip = 0;
      car.charge = 0;
      car.wheel = 0;
      car.slide = 0;
      car.ceiling = 0;
      car.sc = false;
      // A tow is not free. Without this, hopping back to the centreline beat
      // driving off it, so the road's edges stopped mattering.
      car.stall = RESET_STALL;
      this.events.push({ kind: 'reset', x: p.x, y: p.y, player: car.isPlayer });
    }

    /* -------------------------------------------------------- the lights */

    /** 3, 2, 1, GO — and what the throttle was doing when the lights went out. */
    get light() {
      if (this.phase !== 'countdown') return this.tick < COUNTDOWN + 60 ? 0 : -1;
      return Math.max(1, Math.ceil((COUNTDOWN - this.tick) / 60));
    }

    startLine() {
      this.phase = 'race';
      const d = this.startTick < 0 ? Infinity : COUNTDOWN - this.startTick;
      if (d <= 20) { this.player.boost = 74; this.startKind = 'perfect'; }
      else if (d <= 55) { this.player.boost = 36; this.startKind = 'good'; }
      else if (d === Infinity) { this.startKind = 'none'; }
      else { this.player.stall = 45; this.startKind = 'jump'; }
      // Rivals get a getaway of their own, from the seed, never from nothing.
      for (const car of this.cars) {
        if (car.isPlayer) continue;
        if (this.rng.next() < 0.35) car.boost = 30;
      }
      this.events.push({ kind: 'go', start: this.startKind });
    }

    /* --------------------------------------------------------------- tick */

    readInputs() {
      this.steer = 0;
      this.throttle = 0;
      for (const a of this.takeInputs()) {
        if (a === 'left') this.steer -= 1;
        else if (a === 'right') this.steer += 1;
        else if (a === 'accel') this.throttle = 1;
        else if (a === 'brake') this.throttle = -1;
        else if (a === 'drift') this.driftHold = 8;      // refreshed while held
        else if (a === 'item') this.useItem(this.player);
        else if (a === 'reset') this.resetCar(this.player);
      }
      this.steer = Math.max(-1, Math.min(1, this.steer));
      if (this.driftHold > 0) this.driftHold--;
      this.player.drift = this.driftHold > 0;
    }

    step() {
      this.events.length = 0;

      if (this.phase === 'countdown') {
        this.readInputs();
        if (this.throttle > 0 && this.startTick < 0) this.startTick = this.tick;
        if (this.tick >= COUNTDOWN) this.startLine();
        return;
      }

      this.readInputs();
      const leader = this.order()[0];

      for (const car of this.cars) {
        if (car.done) continue;

        if (car.spin > 0) {
          car.spin--;
          car.angle += 0.36;                             // the classic spin-out
          car.speed *= 0.93;
        } else if (car.isPlayer) {
          this.drivePlayer(car);
        } else {
          this.driveAI(car);
        }
        if (car.slip > 0) { car.slip--; car.speed *= 0.995; }
        if (car.stall > 0) car.stall--;
        if (car.boost > 0) car.boost--;

        const surface = this.surfaceOf(car);
        // A small catch-up allowance for rivals only, and only from behind:
        // the field stays in the race without ever teleporting up the road.
        const behind = car.isPlayer ? 0
          : Math.min(0.05, Math.max(0, (leader.total - car.total) / 400) * 0.05);
        const coins = 1 + Math.min(COIN_CAP, car.coins) * COIN_BONUS;
        const limit = surface.max * (car.skill + behind) * car.kart.max * coins
          * (car.boost > 0 ? BOOST_MAX : 1);

        /* The ceiling chases the limit: instantly when the limit RISES, and
           over about a third of a second when it falls. A bare clamp made the
           grass a wall — cross the white line and two thirds of your speed was
           gone on one tick, with no deceleration to read and nothing to catch.
           Easing keeps the punishment and gives it a shape you can drive out
           of, and it doubles as the boost fading rather than snapping off.
           Clamping to the ceiling rather than easing the speed itself is what
           stops the throttle from simply outrunning it. */
        car.ceiling = limit > car.ceiling ? limit
          : car.ceiling + (limit - car.ceiling) * LIMIT_EASE;
        car.speed = Math.min(car.speed, car.ceiling);
        car.speed *= surface.drag;
        if (car.speed < 0) car.speed = Math.max(car.speed, -0.12);

        // Drifters travel wide of their nose; everyone else goes where they point.
        const heading = car.angle - car.slide;
        car.x += Math.cos(heading) * car.speed;
        car.y += Math.sin(heading) * car.speed;

        /* A kart covers at most a third of a node per tick, so anything much
           larger is the node search jumping rather than progress made. Off in
           the infield the nearest node is genuinely ambiguous, and one
           unclamped jump was worth up to half a lap — which is how a rival
           posted a 5.85 s lap on a circuit whose theoretical best is 6.8. */
        const before = car.node;
        const near = PV.RaceTracks.locate(this.track, car.x, car.y, before, 12);
        const step = PV.RaceTracks.delta(this.track, before, near.node);
        car.total += Math.max(-NODE_STEP, Math.min(NODE_STEP, step));
        car.node = near.node;

        this.collect(car);
        this.roadside(car);
        this.hitHazards(car);

        const lap = Math.floor(car.total / this.track.n);
        if (lap > car.lap) {
          const split = this.tick - car.lapTick;
          car.best = car.best ? Math.min(car.best, split) : split;
          car.lapTick = this.tick;
          car.lap = lap;
          if (car.lap >= this.laps) {
            car.done = true;
            car.finishTick = this.tick;
            car.place = ++this.finished;
          }
        }
      }

      this.moveShells();
      this.separate();
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        if (this.tick - this.hazards[i].at > BANANA_LIFE) this.hazards.splice(i, 1);
      }

      if (this.player.done) this.finish('finished');
      else if (this.tick > 60 * 60 * 8) this.finish('timeout');   // nobody races for eight minutes
    }

    /** Live standings: furthest round the track is first. */
    order() {
      return this.cars.slice().sort((a, b) => {
        if (a.done !== b.done) return a.done ? -1 : 1;
        if (a.done && b.done) return a.finishTick - b.finishTick;
        if (b.total !== a.total) return b.total - a.total;
        return a.grid - b.grid;        // level on distance: the grid decides
      });
    }

    place(car) { return this.order().indexOf(car) + 1; }
    get lapNumber() { return Math.min(this.laps, this.player.lap + 1); }
    get finalLap() { return this.player.lap === this.laps - 1; }
    /** Something to put on a speedometer. Not a real unit, and it never was. */
    get kmh() { return Math.round(Math.max(0, this.player.speed) * 430); }
  };

  PV.Racing.ON = ON;
  PV.Racing.OFF = OFF;
  PV.Racing.DIRT = DIRT;
  PV.Racing.KARTS = KARTS;
  PV.Racing.ITEMS = ITEMS;
  PV.Racing.DRIFT_LEVELS = DRIFT_LEVELS;
  PV.Racing.COUNTDOWN = COUNTDOWN;
  PV.Racing.COIN_CAP = COIN_CAP;

})(window.PV);
