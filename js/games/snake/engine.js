/* 贪吃蛇 / Snake — engine.

   On the real-time contract. The snake moves one cell every `stepTicks` ticks
   rather than every frame, so speed is a whole number of ticks and a run
   replays exactly from its seed.

   Two details that are the difference between this feeling right and feeling
   broken, and both are about the queued input the contract gives us:

   - A turn is only taken at the moment the snake actually moves. Turning twice
     inside one step is how you fold a snake back into its own neck.
   - The illegal reverse is judged against the direction the snake is ACTUALLY
     travelling, not against the last key pressed. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };
  const SPEEDS = { calm: 10, normal: 7, fast: 4 };

  PV.Snake = class Snake extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.cols = o.cols || 20;
      this.rows = o.rows || 20;
      this.walls = o.walls !== false;              // false == wrap around
      this.baseSpeed = SPEEDS[o.speed] || SPEEDS.normal;
      this.dir = DIRS.right;
      this.pending = [];
      this.grow = 2;
      this.eaten = 0;
      this.since = 0;

      const cy = Math.floor(this.rows / 2), cx = Math.floor(this.cols / 3);
      this.body = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
      this.food = this.placeFood();
    }

    /** Ticks between moves. Speeds up every five foods, floored so it stays playable. */
    stepTicks() { return Math.max(2, this.baseSpeed - Math.floor(this.eaten / 5)); }

    occupied(x, y) {
      for (const s of this.body) if (s.x === x && s.y === y) return true;
      return false;
    }

    placeFood() {
      const free = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) if (!this.occupied(x, y)) free.push({ x: x, y: y });
      }
      if (!free.length) return null;              // board full: a perfect game
      return free[this.rng.int(free.length)];
    }

    step() {
      for (const a of this.takeInputs()) {
        if (DIRS[a]) this.pending.push(DIRS[a]);
        if (this.pending.length > 2) this.pending.shift();
      }
      if (++this.since < this.stepTicks()) return;
      this.since = 0;

      // Take at most one turn per move, and never straight back into the neck.
      while (this.pending.length) {
        const d = this.pending.shift();
        if (d.x === -this.dir.x && d.y === -this.dir.y) continue;
        if (d.x === this.dir.x && d.y === this.dir.y) continue;
        this.dir = d;
        break;
      }

      let nx = this.body[0].x + this.dir.x;
      let ny = this.body[0].y + this.dir.y;

      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
        if (this.walls) { this.finish('wall'); return; }
        nx = (nx + this.cols) % this.cols;
        ny = (ny + this.rows) % this.rows;
      }

      // The tail square frees up on the same move, unless we are growing into it.
      const growing = this.grow > 0 || (this.food && nx === this.food.x && ny === this.food.y);
      for (let i = 0; i < this.body.length - (growing ? 0 : 1); i++) {
        if (this.body[i].x === nx && this.body[i].y === ny) { this.finish('self'); return; }
      }

      this.body.unshift({ x: nx, y: ny });
      if (this.food && nx === this.food.x && ny === this.food.y) {
        this.eaten++;
        this.grow += 2;
        this.score += 10 + this.eaten;
        this.food = this.placeFood();
        if (!this.food) { this.finish('perfect'); return; }
      }
      if (this.grow > 0) this.grow--;
      else this.body.pop();
    }

    get level() { return 1 + Math.floor(this.eaten / 5); }
  };

  PV.Snake.SPEEDS = SPEEDS;
  PV.Snake.DIRS = DIRS;

})(window.PV);
