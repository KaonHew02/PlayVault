/* 卡丁车 / Kart Racing — engine.

   On the real-time contract: a fixed 60 Hz tick, no clock reads, all
   randomness from the seed, so a race replays exactly and two friends could
   later run the same one.

   Progress is measured in centreline NODES, accumulated as a signed total
   rather than as "have we crossed the line yet". A finish line you can only
   trip by driving over it is the classic racing-game bug: reverse over it and
   you gain a lap, cut the last corner and you lose one. Accumulating the
   shortest signed step each tick makes both impossible — going backwards
   subtracts, and a lap is simply a whole loop of nodes.

   Off the asphalt the kart has a much lower speed ceiling and much more drag.
   That is the entire difficulty of the driving, so it is the one number worth
   tuning first.

   On top of the driving sit the three things that make it a kart race:

   - Item boxes on the road, and a roulette weighted by position. The leader
     draws bananas, the tail draws mushrooms and the odd lightning bolt. A
     kart race where the leader also draws the best items is a procession.
   - Drifting. Holding the drift while steering turns tighter, scrubs a little
     speed, and pays a boost once it has been held long enough. That trade —
     slower now for faster in a moment — is the whole skill of the genre.
   - Nobody gets a faster kart for free. A rival's advantage is nerve (a skill
     factor on its speed ceiling); the player's kart class trades acceleration
     against top speed, and rivals drive the medium one. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const ON = { max: 0.46, drag: 0.994 };
  const OFF = { max: 0.19, drag: 0.955 };
  const ACCEL = 0.0105, BRAKE = 0.021, TURN = 0.055;

  /** Kart classes trade the same budget three ways. */
  const KARTS = {
    light: { accel: 1.22, max: 0.94, turn: 1.16 },
    medium: { accel: 1.00, max: 1.00, turn: 1.00 },
    heavy: { accel: 0.82, max: 1.08, turn: 0.88 }
  };

  const BOOST_TICKS = 48;        // a mushroom, or a mini-turbo
  const BOOST_MAX = 1.55;        // ceiling multiplier while boosting
  const BOOST_ACCEL = 2.4;
  const SPIN_TICKS = 45;         // how long a banana or a shell costs you
  const DRIFT_TURN = 1.75;
  const DRIFT_CHARGE = 40;       // ticks of drift that earn a mini-turbo
  const BOX_RESPAWN = 300;
  const SHELL_SPEED = 0.62, SHELL_LIFE = 300;

  const ITEMS = ['mushroom', 'banana', 'shell', 'lightning'];

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
      this.events = [];              // one-tick notes for the view: pickups, hits

      const rivals = o.rivals == null ? 3 : o.rivals;
      for (let i = 0; i <= rivals; i++) {
        const start = this.track.points[(this.track.n - 6 * i) % this.track.n];
        const nrm = this.track.normals[(this.track.n - 6 * i) % this.track.n];
        const lane = (i % 2 ? 1 : -1) * 1.6;
        this.cars.push({
          i: i,
          isPlayer: i === 0,
          kart: KARTS[i === 0 ? (o.kart || 'medium') : 'medium'] || KARTS.medium,
          x: start.x + nrm.x * lane,
          y: start.y + nrm.y * lane,
          angle: Math.atan2(this.track.tangents[0].y, this.track.tangents[0].x),
          speed: 0,
          node: (this.track.n - 6 * i) % this.track.n,
          total: 0,
          lap: 0,
          lapTick: 0,
          best: 0,
          done: false,
          finishTick: 0,
          item: null,
          boost: 0,
          spin: 0,
          drift: false,
          charge: 0,
          // Rivals differ in nerve, not in physics: a skill factor on the speed
          // ceiling and a lane preference. No rival gets a faster kart.
          skill: i === 0 ? 1 : 0.86 + this.rng.next() * 0.12,
          lane: i === 0 ? 0 : (this.rng.next() * 2 - 1) * 2.2
        });
      }
      this.player = this.cars[0];
      this.finished = 0;
      this.steer = 0;
      this.throttle = 0;
      this.driftHold = 0;

      this.buildBoxes();
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

    offTrack(car) {
      const near = PV.RaceTracks.nearest(this.track, car.x, car.y, car.node, 12);
      car.node = near.node;
      return near.dist > this.track.width / 2;
    }

    /** Where a rival is aiming: a point up the road, offset into its lane. */
    aimFor(car) {
      const tk = this.track;
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

    spinCar(car) {
      if (car.done || car.spin > 0) return;
      car.spin = SPIN_TICKS;
      car.speed *= 0.3;
      car.boost = 0;
      car.charge = 0;
      this.events.push({ kind: 'spin', x: car.x, y: car.y });
    }

    useItem(car) {
      if (!car.item || car.spin > 0 || car.done) return false;
      const it = car.item;
      car.item = null;
      const cos = Math.cos(car.angle), sin = Math.sin(car.angle);

      if (it === 'mushroom') {
        car.boost = Math.max(car.boost, BOOST_TICKS + 14);
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
          if (o !== car && !o.done && o.total > car.total) this.spinCar(o);
        }
      }
      this.events.push({ kind: 'use', item: it, x: car.x, y: car.y, player: car.isPlayer });
      return true;
    }

    /** Rivals hold an item until it is worth something, then spend it. */
    aiItem(car) {
      if (!car.item) return;
      const tk = this.track;
      if (car.item === 'banana') {
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
      } else if (this.rng.next() < 0.02) {
        this.useItem(car);
      }
    }

    collect(car) {
      if (car.item) return;
      for (const box of this.boxes) {
        if (box.at > this.tick) continue;
        const dx = box.x - car.x, dy = box.y - car.y;
        if (dx * dx + dy * dy > 1.4 * 1.4) continue;
        box.at = this.tick + BOX_RESPAWN;
        car.item = this.rollItem(this.place(car), this.cars.length);
        this.events.push({ kind: 'pickup', x: box.x, y: box.y, player: car.isPlayer });
        return;
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
          this.spinCar(car);
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
        this.spinCar(car);
        return;
      }
    }

    /* ----------------------------------------------------------- driving */

    driveAI(car) {
      const tk = this.track;
      const aim = this.aimFor(car);
      const want = Math.atan2(aim.y - car.y, aim.x - car.x);
      let err = want - car.angle;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;

      const grip = Math.min(1, car.speed / 0.12);
      car.angle += Math.max(-TURN, Math.min(TURN, err * 1.6)) * grip;

      // Lift off for the corner that is coming, not the one already here.
      const bend = tk.curve[(car.node + 10) % tk.n];
      const cap = ON.max * car.skill * (1 - Math.min(0.55, bend * 2.4));
      if (Math.abs(err) > 0.9 || (car.speed > cap && car.boost === 0)) car.speed -= BRAKE * 0.6;
      else car.speed += ACCEL * (car.boost > 0 ? BOOST_ACCEL : 1);

      this.aiItem(car);
    }

    drivePlayer(car) {
      const drifting = car.drift && this.steer !== 0 && car.speed > 0.17;
      if (this.steer) {
        const grip = Math.min(1, car.speed / 0.12);
        car.angle += this.steer * TURN * car.kart.turn * (drifting ? DRIFT_TURN : 1) * grip;
      }
      if (drifting) {
        car.charge++;
        car.speed *= 0.9965;                    // a drift scrubs a little speed
      } else if (car.charge) {
        // Paid on release, so a drift is a decision with a cost and a reward.
        if (car.charge >= DRIFT_CHARGE) car.boost = Math.max(car.boost, BOOST_TICKS);
        car.charge = 0;
      }
      if (this.throttle > 0) car.speed += ACCEL * car.kart.accel * (car.boost > 0 ? BOOST_ACCEL : 1);
      else if (this.throttle < 0) car.speed -= BRAKE;
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

    step() {
      this.steer = 0;
      this.throttle = 0;
      this.events.length = 0;
      for (const a of this.takeInputs()) {
        if (a === 'left') this.steer -= 1;
        else if (a === 'right') this.steer += 1;
        else if (a === 'accel') this.throttle = 1;
        else if (a === 'brake') this.throttle = -1;
        else if (a === 'drift') this.driftHold = 8;      // refreshed while held
        else if (a === 'item') this.useItem(this.player);
      }
      this.steer = Math.max(-1, Math.min(1, this.steer));
      if (this.driftHold > 0) this.driftHold--;
      this.player.drift = this.driftHold > 0;

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

        if (car.boost > 0) car.boost--;
        const off = this.offTrack(car);
        const limit = (off ? OFF.max : ON.max) * car.skill * car.kart.max
          * (car.boost > 0 ? BOOST_MAX : 1);
        car.speed = Math.min(car.speed, limit);
        car.speed *= off ? OFF.drag : ON.drag;
        if (car.speed < 0) car.speed = Math.max(car.speed, -0.12);

        car.x += Math.cos(car.angle) * car.speed;
        car.y += Math.sin(car.angle) * car.speed;

        const before = car.node;
        const near = PV.RaceTracks.nearest(this.track, car.x, car.y, before, 12);
        car.total += PV.RaceTracks.delta(this.track, before, near.node);
        car.node = near.node;

        this.collect(car);
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
  };

  PV.Racing.ON = ON;
  PV.Racing.OFF = OFF;
  PV.Racing.KARTS = KARTS;
  PV.Racing.ITEMS = ITEMS;
  PV.Racing.DRIFT_CHARGE = DRIFT_CHARGE;

})(window.PV);
