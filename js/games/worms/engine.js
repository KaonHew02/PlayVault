/* 蠕虫竞技场 / Worm Arena — engine.

   On the real-time contract: a fixed 60 Hz tick, inputs queued and applied on
   tick boundaries, every random draw from the seeded RNG. Nothing here reads
   the clock or the DOM, so a run replays from its seed and its input log.

   The shape of the game: one arena, a crowd of worms, and food. You grow by
   swallowing pellets; you die the moment your head touches anything that is
   not yours — another worm's body, or the wall. When a worm dies its whole
   body turns back into food, which is why running a big worm into your own
   side is worth more than an hour of grazing.

   Two decisions worth naming:

   - A body is a trail of nodes a fixed distance apart, not one node per tick.
     Boosting moves the head further per tick; if nodes were per-tick, a
     boosting worm would grow a coarser, longer-looking body for free.
   - Steering is "turn towards an angle, at most TURN radians a tick". Both the
     keyboard and the mouse feed that same angle, so the two controls cannot
     drift apart and neither can turn faster than the other. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TAU = Math.PI * 2;
  const NODE = 5;               // world units between body nodes
  const BASE_SPEED = 2.0;       // units per tick
  const BOOST_SPEED = 3.7;
  const TURN = 0.072;           // radians per tick
  const START_MASS = 20;
  const BOOST_MIN = 32;         // no dashing below this, or a dash is suicide
  const BOOST_DRAIN = 0.09;
  const TURN_HOLD = 12;         // ticks one key press keeps turning

  const COLOURS = ['#F6B32B', '#34D399', '#38BDF8', '#F87171', '#C084FC',
                   '#F97316', '#22D3EE', '#A3E635', '#FB7185', '#818CF8'];
  const NAMES = ['Wriggler', 'Noodle', 'Fang', 'Slinky', 'Coil', 'Nibbler',
                 'Squiggle', 'Twist', 'Grub', 'Inchy', 'Loop', 'Bendy'];

  /** The shortest way round the circle: always in (-π, π]. */
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  class Worm {
    constructor(id, x, y, angle, colour, name, bot) {
      this.id = id;
      this.x = x; this.y = y;
      this.angle = angle;
      this.aim = angle;
      this.colour = colour;
      this.name = name;
      this.bot = !!bot;
      this.mass = START_MASS;
      this.alive = true;
      this.boosting = false;
      this.boostTicks = 0;
      this.turnHold = 0;
      this.turnDir = 0;
      this.travelled = 0;
      this.nodes = [{ x: x, y: y }];
    }

    get radius() { return 6 + Math.pow(this.mass, 0.40) * 1.7; }
    /** Body length in world units — what the player actually sees of the mass. */
    get length() { return 60 + this.mass * 2.4; }
    get maxNodes() { return Math.max(2, Math.ceil(this.length / NODE)); }
  }

  PV.Worms = class Worms extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.W = 2200;
      this.H = 1600;
      this.botCount = o.bots == null ? 7 : o.bots;
      this.foodCount = o.food == null ? 220 : o.food;
      this.worms = [];
      this.food = [];
      this.pending = [];                    // bots waiting to respawn: {at, colour, name}
      this.nextId = 0;

      const names = this.rng.shuffle(NAMES.slice());
      this.player = this.spawn(false, COLOURS[0], 'You');
      for (let i = 0; i < this.botCount; i++) {
        this.spawn(true, COLOURS[(i + 1) % COLOURS.length], names[i % names.length]);
      }
      while (this.food.length < this.foodCount) this.food.push(this.newFood());
    }

    /* ------------------------------------------------------------ world */

    spawn(bot, colour, name) {
      const m = 140;
      const w = new Worm(this.nextId++,
        m + this.rng.next() * (this.W - m * 2),
        m + this.rng.next() * (this.H - m * 2),
        this.rng.next() * TAU, colour, name, bot);
      this.worms.push(w);
      return w;
    }

    newFood(x, y, v) {
      const m = 30;
      return {
        x: x == null ? m + this.rng.next() * (this.W - m * 2) : x,
        y: y == null ? m + this.rng.next() * (this.H - m * 2) : y,
        v: v == null ? 1 + this.rng.int(2) : v,
        c: COLOURS[this.rng.int(COLOURS.length)]
      };
    }

    /** A dead worm is the best meal in the arena: its body becomes pellets. */
    scatter(w) {
      const step = 2;
      const per = Math.max(1, (w.mass * 0.7) / Math.ceil(w.nodes.length / step));
      for (let i = 0; i < w.nodes.length; i += step) {
        const n = w.nodes[i];
        this.food.push({
          x: PV.clamp(n.x + (this.rng.next() - 0.5) * 14, 10, this.W - 10),
          y: PV.clamp(n.y + (this.rng.next() - 0.5) * 14, 10, this.H - 10),
          v: per, c: w.colour
        });
      }
    }

    kill(w, reason) {
      if (!w.alive) return;
      w.alive = false;
      this.scatter(w);
      if (w === this.player) { this.finish(reason); return; }
      // A bot comes back a couple of seconds later, so the arena never empties.
      this.pending.push({ at: this.tick + 120, colour: w.colour, name: w.name });
    }

    /* ------------------------------------------------------------ moving */

    /** Turn towards the worm's aim, no faster than TURN, and step forward. */
    advanceWorm(w) {
      const want = wrapAngle(w.aim - w.angle);
      w.angle = wrapAngle(w.angle + PV.clamp(want, -TURN, TURN));

      let speed = BASE_SPEED;
      if (w.boosting && w.mass > BOOST_MIN) {
        speed = BOOST_SPEED;
        w.mass -= BOOST_DRAIN;
        // A dash spends mass, and what it spends is left behind for whoever
        // is chasing — which is what makes a chase worth joining.
        if (this.tick % 8 === 0) {
          const back = w.nodes[Math.min(w.nodes.length - 1, 4)] || w;
          this.food.push(this.newFood(back.x, back.y, BOOST_DRAIN * 8));
        }
      } else {
        w.boosting = false;
      }

      w.x += Math.cos(w.angle) * speed;
      w.y += Math.sin(w.angle) * speed;
      w.travelled += speed;
      while (w.travelled >= NODE) {
        w.travelled -= NODE;
        w.nodes.unshift({ x: w.x, y: w.y });
      }
      while (w.nodes.length > w.maxNodes) w.nodes.pop();
    }

    /** Head against the wall, or against anyone else's body. */
    collide(w) {
      const r = w.radius;
      if (w.x < r || w.y < r || w.x > this.W - r || w.y > this.H - r) {
        this.kill(w, 'wall');
        return;
      }
      for (const other of this.worms) {
        if (other === w || !other.alive) continue;
        const reach = other.length + r + other.radius;
        const dx = other.x - w.x, dy = other.y - w.y;
        if (dx * dx + dy * dy > reach * reach) continue;      // nowhere near
        const hit = r + other.radius * 0.9;
        const step = w.bot ? 2 : 1;                            // bots may be a hair coarser
        for (let i = 0; i < other.nodes.length; i += step) {
          const n = other.nodes[i];
          const ex = n.x - w.x, ey = n.y - w.y;
          if (ex * ex + ey * ey < hit * hit) { this.kill(w, 'eaten'); return; }
        }
      }
    }

    eat(w) {
      const reach = w.radius + 9;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i];
        const dx = f.x - w.x, dy = f.y - w.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        w.mass += f.v;
        this.food.splice(i, 1);
      }
    }

    /* --------------------------------------------------------------- ai */

    nearestFood(w, within) {
      let best = null, bestD = within * within;
      for (const f of this.food) {
        const dx = f.x - w.x, dy = f.y - w.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = f; }
      }
      return best;
    }

    /** The closest bit of somebody else inside the cone the bot is heading into. */
    dangerAhead(w, look) {
      const ax = w.x + Math.cos(w.angle) * look;
      const ay = w.y + Math.sin(w.angle) * look;
      let best = null, bestD = look * look;
      for (const other of this.worms) {
        if (other === w || !other.alive) continue;
        for (let i = 0; i < other.nodes.length; i += 3) {
          const n = other.nodes[i];
          const dx = n.x - ax, dy = n.y - ay;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = n; }
        }
      }
      return best;
    }

    /**
     * Bot steering, rerun every third tick — a bot that re-decides sixty times
     * a second costs sixty times as much and does not play any better.
     */
    thinkBot(w) {
      const look = 70 + w.radius * 4;
      const ax = w.x + Math.cos(w.angle) * look;
      const ay = w.y + Math.sin(w.angle) * look;
      let tx, ty;

      if (ax < 90 || ay < 90 || ax > this.W - 90 || ay > this.H - 90) {
        tx = this.W / 2; ty = this.H / 2;                     // turn inward
      } else {
        const danger = this.dangerAhead(w, look);
        if (danger) { tx = w.x - (danger.x - w.x); ty = w.y - (danger.y - w.y); }
        else {
          const f = this.nearestFood(w, 420);
          if (f) { tx = f.x; ty = f.y; }
          else { tx = this.W / 2; ty = this.H / 2; }
        }
      }
      w.aim = Math.atan2(ty - w.y, tx - w.x);

      if (w.boostTicks > 0) w.boostTicks--;
      else if (w.mass > BOOST_MIN + 20 && this.rng.next() < 0.004) w.boostTicks = 30;
      w.boosting = w.boostTicks > 0;
    }

    /* ------------------------------------------------------------- tick */

    step() {
      const p = this.player;

      for (const a of this.takeInputs()) {
        if (a && typeof a === 'object' && a.aim != null) {
          p.aim = a.aim;                    // the mouse, or a thumb on the canvas
          p.turnHold = 0;
        } else if (a === 'left' || a === 'right') {
          p.turnDir = a === 'left' ? -1 : 1;
          p.turnHold = TURN_HOLD;           // one press keeps turning for a moment
        } else if (a === 'boost') {
          p.boostTicks = 8;                 // refreshed while the key is held
        }
      }
      if (p.turnHold > 0) { p.turnHold--; p.aim = wrapAngle(p.aim + p.turnDir * TURN); }
      if (p.boostTicks > 0) p.boostTicks--;
      p.boosting = p.boostTicks > 0 && p.mass > BOOST_MIN;

      for (const w of this.worms) {
        if (!w.alive || !w.bot) continue;
        if (this.tick % 3 === w.id % 3) this.thinkBot(w);
      }

      for (const w of this.worms) {
        if (!w.alive) continue;
        this.advanceWorm(w);
        this.eat(w);
      }
      for (const w of this.worms.slice()) {
        if (w.alive) this.collide(w);
      }

      // Respawns and the food supply, both kept level.
      for (let i = this.pending.length - 1; i >= 0; i--) {
        if (this.pending[i].at > this.tick) continue;
        const r = this.pending.splice(i, 1)[0];
        this.spawn(true, r.colour, r.name);
      }
      this.worms = this.worms.filter(w => w.alive || w === this.player);
      while (this.food.length < this.foodCount) this.food.push(this.newFood());

      this.score = Math.floor(p.mass);
    }

    /** Everyone alive, biggest first. The view shows the top of it. */
    leaderboard() {
      return this.worms.filter(w => w.alive).sort((a, b) => b.mass - a.mass);
    }

    rank() {
      const board = this.leaderboard();
      const at = board.indexOf(this.player);
      return { place: at < 0 ? board.length + 1 : at + 1, of: board.length + (at < 0 ? 1 : 0) };
    }
  };

  PV.Worms.COLOURS = COLOURS;
  PV.Worms.NODE = NODE;
  PV.Worms.BOOST_MIN = BOOST_MIN;

})(window.PV);
