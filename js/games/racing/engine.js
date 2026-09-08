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
   the first thing to tune.

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

  const ON = { max: 0.46, drag: 0.994 };
  const DIRT = { max: 0.40, drag: 0.976 };      // the shortcut
  const OFF = { max: 0.19, drag: 0.955 };       // the grass
  const ACCEL = 0.0105, BRAKE = 0.021, TURN = 0.055;

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
  const DRIFT_LEVELS = [40, 95, 165];           // ticks held for mini / super / ultra
  const DRIFT_BOOST = [36, 58, 86];
  const COUNTDOWN = 180;                        // three seconds of lights
  const COIN_CAP = 10, COIN_BONUS = 0.01;       // ten coins, one per cent each
  const COIN_BACK = 420;                        // ticks before a coin comes back
  const SHELL_SPEED = 0.62, SHELL_LIFE = 300;

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

      const rivals = o.rivals == null ? 7 : o.rivals;
      for (let i = 0; i <= rivals; i++) {
        const node = (this.track.n - 5 * i) % this.track.n;
        const start = this.track.points[node];
        const nrm = this.track.normals[node];
        const lane = (i % 2 ? 1 : -1) * 1.7;
        const style = STYLES[GRID_STYLES[(i - 1) % GRID_STYLES.length]] || STYLES.balanced;
        this.cars.push({
          i: i,
          isPlayer: i === 0,
          name: i === 0 ? 'You' : NAMES[(i - 1) % NAMES.length],
          kart: KARTS[i === 0 ? (o.kart || 'medium') : 'medium'] || KARTS.medium,
          x: start.x + nrm.x * lane,
          y: start.y + nrm.y * lane,
          angle: Math.atan2(this.track.tangents[node].y, this.track.tangents[node].x),
          speed: 0,
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
          lane: i === 0 ? 0 : (this.rng.next() * 2 - 1) * 2.2
        });
      }
      this.player = this.cars[0];
      this.finished = 0;
      this.steer = 0;
      this.throttle = 0;
      this.driftHold = 0;

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
      if (near.dist > near.half) return OFF;
      return near.shortcut ? DIRT : ON;
    }

    /** Where a rival is aiming: up the road in its lane, or down the chord. */
    aimFor(car) {
      const tk = this.track, s = tk.shortcut;
      if (car.sc && s) {
        if (PV.RaceTracks.delta(tk, car.node, s.to) <= 1) car.sc = false;
        else {
          const exit = tk.points[s.to];
          return { x: exit.x, y: exit.y, node: s.to };
        }
      }
      const ahead = 7 + Math.round(car.speed * 22);
      const i = (car.node + ahead) % tk.n;
      const p = tk.points[i], nrm = tk.normals[i];
      return { x: p.x + nrm.x * car.lane, y: p.y + nrm.y * car.lane, node: i };
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
          if (car.boost < PAD_BOOST) {
            car.boost = PAD_BOOST;
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
        if (d > 0 && d < 8) car.sc = true;
      }

      const aim = this.aimFor(car);
      const want = Math.atan2(aim.y - car.y, aim.x - car.x);
      let err = want - car.angle;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;

      const grip = Math.min(1, car.speed / 0.12) * (car.slip ? 0.35 : 1);
      car.angle += Math.max(-TURN, Math.min(TURN, err * 1.6)) * grip;

      // Lift off for the corner that is coming, not the one already here.
      const bend = tk.curve[(car.node + 10) % tk.n];
      const cap = ON.max * car.skill * (1 - Math.min(0.55, bend * 2.4));
      if (Math.abs(err) > 0.9 || (car.speed > cap && car.boost === 0)) car.speed -= BRAKE * 0.6;
      else car.speed += ACCEL * (car.boost > 0 ? BOOST_ACCEL : 1);

      this.aiItem(car);
    }

    drivePlayer(car) {
      const drifting = car.drift && this.steer !== 0 && car.speed > 0.17 && !car.slip;
      if (this.steer) {
        const grip = Math.min(1, car.speed / 0.12) * (car.slip ? 0.35 : 1);
        car.angle += this.steer * TURN * car.kart.turn * (drifting ? DRIFT_TURN : 1) * grip;
      }
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
          A.speed *= 0.90; B.speed *= 0.90;
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
      car.sc = false;
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
        car.speed = Math.min(car.speed, limit);
        car.speed *= surface.drag;
        if (car.speed < 0) car.speed = Math.max(car.speed, -0.12);

        car.x += Math.cos(car.angle) * car.speed;
        car.y += Math.sin(car.angle) * car.speed;

        const before = car.node;
        const near = PV.RaceTracks.locate(this.track, car.x, car.y, before, 12);
        car.total += PV.RaceTracks.delta(this.track, before, near.node);
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

      if (this.player.done) this.finish('finished');
      else if (this.tick > 60 * 60 * 8) this.finish('timeout');   // nobody races for eight minutes
    }

    /** Live standings: furthest round the track is first. */
    order() {
      return this.cars.slice().sort((a, b) => {
        if (a.done !== b.done) return a.done ? -1 : 1;
        if (a.done && b.done) return a.finishTick - b.finishTick;
        return b.total - a.total;
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
