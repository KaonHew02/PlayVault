/* 赛车 / Racing — engine.

   On the real-time contract: a fixed 60 Hz tick, no clock reads, all
   randomness from the seed, so a race replays exactly and two friends could
   later run the same one.

   Progress is measured in centreline NODES, accumulated as a signed total
   rather than as "have we crossed the line yet". A finish line you can only
   trip by driving over it is the classic racing-game bug: reverse over it and
   you gain a lap, cut the last corner and you lose one. Accumulating the
   shortest signed step each tick makes both impossible — going backwards
   subtracts, and a lap is simply a whole loop of nodes.

   Off the asphalt the car has a much lower speed ceiling and much more drag.
   That is the entire difficulty of the game, so it is the one number worth
   tuning first. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const ON = { max: 0.46, drag: 0.994 };
  const OFF = { max: 0.19, drag: 0.955 };
  const ACCEL = 0.0105, BRAKE = 0.021, TURN = 0.055;

  PV.Racing = class Racing extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.track = PV.RaceTracks.build(o.track || 'ring');
      this.laps = o.laps || 3;
      this.cars = [];

      const rivals = o.rivals == null ? 3 : o.rivals;
      for (let i = 0; i <= rivals; i++) {
        const start = this.track.points[(this.track.n - 6 * i) % this.track.n];
        const nrm = this.track.normals[(this.track.n - 6 * i) % this.track.n];
        const lane = (i % 2 ? 1 : -1) * 1.6;
        this.cars.push({
          i: i,
          isPlayer: i === 0,
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
          // Rivals differ in nerve, not in physics: a skill factor on the speed
          // ceiling and a lane preference. No rival gets a faster car.
          skill: i === 0 ? 1 : 0.86 + this.rng.next() * 0.12,
          lane: i === 0 ? 0 : (this.rng.next() * 2 - 1) * 2.2
        });
      }
      this.player = this.cars[0];
      this.finished = 0;
      this.steer = 0;
      this.throttle = 0;
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
      if (Math.abs(err) > 0.9 || car.speed > cap) car.speed -= BRAKE * 0.6;
      else car.speed += ACCEL;
    }

    drivePlayer(car) {
      if (this.steer) {
        const grip = Math.min(1, car.speed / 0.12);
        car.angle += this.steer * TURN * grip;
      }
      if (this.throttle > 0) car.speed += ACCEL;
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
      for (const a of this.takeInputs()) {
        if (a === 'left') this.steer -= 1;
        else if (a === 'right') this.steer += 1;
        else if (a === 'accel') this.throttle = 1;
        else if (a === 'brake') this.throttle = -1;
      }
      this.steer = Math.max(-1, Math.min(1, this.steer));

      for (const car of this.cars) {
        if (car.done) continue;
        if (car.isPlayer) this.drivePlayer(car); else this.driveAI(car);

        const off = this.offTrack(car);
        const limit = (off ? OFF.max : ON.max) * car.skill;
        car.speed = Math.min(car.speed, limit);
        car.speed *= off ? OFF.drag : ON.drag;
        if (car.speed < 0) car.speed = Math.max(car.speed, -0.12);

        car.x += Math.cos(car.angle) * car.speed;
        car.y += Math.sin(car.angle) * car.speed;

        const before = car.node;
        const near = PV.RaceTracks.nearest(this.track, car.x, car.y, before, 12);
        car.total += PV.RaceTracks.delta(this.track, before, near.node);
        car.node = near.node;

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

})(window.PV);
