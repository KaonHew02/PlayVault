/* 蠕虫竞技场 / Worm Arena — engine.

   On the real-time contract: a fixed 60 Hz tick, inputs queued and applied on
   tick boundaries, every random draw from the seeded RNG. Nothing here reads
   the clock or the DOM, so a run replays from its seed and its input log.

   The loop the whole game hangs off: eat food, grow, make somebody else's head
   run into your body, eat what they drop, climb the board.

   Four decisions worth naming:

   - **Score and length are different numbers.** A pizza is worth a hundred
     points and twenty segments; beating a giant worm is worth five thousand
     points and nothing at all until you go and eat the wreck. Ranking on
     score rather than on size is what makes a kill worth taking.
   - **A body is a trail of nodes a fixed distance apart**, not one node per
     tick. Dashing moves the head further per tick; if nodes were per-tick, a
     dashing worm would grow a coarser, longer-looking body for free.
   - **The wall does not kill.** Inside the edge band a worm is steered back
     in and clamped at the boundary. Dying to the scenery in an arena game is
     just an unfair death; every death here is another worm's doing.
   - **Steering is "turn towards an angle, at most TURN radians a tick".** The
     mouse, the keys and the joystick all feed that same angle, so no control
     scheme can out-turn another. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TAU = Math.PI * 2;
  const NODE = 5;                 // world units between body nodes
  const BASE_SPEED = 2.0;         // 100%
  const BOOST_SPEED = 3.4;        // 170% of base, per the spec
  const TURN = 0.072;             // radians per tick
  const START_SEGMENTS = 10;
  const EDGE = 120;               // the soft boundary band

  /* The dash tank: 100 full, 20 a second to hold, 10 a second to come back.
     Five seconds of dashing, ten to refill it. Nothing else limits a dash —
     no length cost — so the tank is the whole decision. */
  const ENERGY_MAX = 100;
  const ENERGY_DRAIN = 20 / 60;
  const ENERGY_REFILL = 10 / 60;

  /* Food. `score` is points, `growth` is segments; the two are deliberately
     not proportional, so a pizza is a meal and a berry is a snack. `w` is how
     often it turns up. */
  const FOODS = [
    { kind: 'berry', score: 5, growth: 1, r: 4.0, c: '#F87171', w: 46 },
    { kind: 'apple', score: 10, growth: 2, r: 5.0, c: '#EF4444', w: 24 },
    { kind: 'orange', score: 20, growth: 4, r: 6.2, c: '#FB923C', w: 14 },
    { kind: 'burger', score: 50, growth: 10, r: 8.0, c: '#D9A441', w: 9 },
    { kind: 'pizza', score: 100, growth: 20, r: 9.6, c: '#F59E0B', w: 5 },
    { kind: 'gold', score: 250, growth: 50, r: 11.5, c: '#FDE047', w: 2 }
  ];
  const FOOD_TOTAL = FOODS.reduce((n, f) => n + f.w, 0);

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
      this.segments = START_SEGMENTS;
      this.score = 0;
      this.kills = 0;
      this.energy = ENERGY_MAX;
      this.alive = true;
      this.atEdge = false;
      this.boosting = false;
      this.boostTicks = 0;
      this.turnHold = 0;
      this.turnDir = 0;
      this.travelled = 0;
      this.nodes = [{ x: x, y: y }];
    }

    get radius() { return 6 + Math.pow(this.segments, 0.40) * 1.7; }
    /** The body in world units — what the arena sees of all those segments. */
    get bodyLength() { return 60 + this.segments * 2.4; }
    get maxNodes() { return Math.max(2, Math.ceil(this.bodyLength / NODE)); }
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
      this.pending = [];                    // bots waiting to respawn
      this.events = [];                     // one tick of news for the view
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
      const m = 200;
      const w = new Worm(this.nextId++,
        m + this.rng.next() * (this.W - m * 2),
        m + this.rng.next() * (this.H - m * 2),
        this.rng.next() * TAU, colour, name, bot);
      this.worms.push(w);
      return w;
    }

    /** A pellet of one of the six kinds, weighted so pizza stays a find. */
    newFood(x, y) {
      let roll = this.rng.next() * FOOD_TOTAL;
      let pick = FOODS[0];
      for (const f of FOODS) { roll -= f.w; if (roll <= 0) { pick = f; break; } }
      const m = 30;
      return {
        x: x == null ? m + this.rng.next() * (this.W - m * 2) : x,
        y: y == null ? m + this.rng.next() * (this.H - m * 2) : y,
        kind: pick.kind, score: pick.score, growth: pick.growth,
        r: pick.r, c: pick.c
      };
    }

    /**
     * A dead worm is the best meal in the arena, and a big one is a feast:
     * what it drops is a share of everything it had grown.
     */
    scatter(w) {
      const step = 2;
      const count = Math.max(1, Math.ceil(w.nodes.length / step));
      const per = Math.max(1, (w.segments * 0.6) / count);
      for (let i = 0; i < w.nodes.length; i += step) {
        const n = w.nodes[i];
        this.food.push({
          x: PV.clamp(n.x + (this.rng.next() - 0.5) * 14, 10, this.W - 10),
          y: PV.clamp(n.y + (this.rng.next() - 0.5) * 14, 10, this.H - 10),
          kind: 'drop', score: Math.round(per * 3), growth: per,
          r: 4 + Math.min(7, per), c: w.colour
        });
      }
    }

    /** What beating a worm is worth, by how big it had got. */
    killScore(victim) {
      const s = victim.segments;
      if (s < 40) return 200;
      if (s < 120) return 500;
      if (s < 300) return 1000;
      return 5000;
    }

    kill(w, reason, killer) {
      if (!w.alive) return;
      w.alive = false;
      if (killer && killer !== w) {
        killer.kills++;
        killer.score += this.killScore(w);
      }
      this.events.push({ kind: 'death', x: w.x, y: w.y, c: w.colour, size: w.radius });
      this.scatter(w);
      if (w === this.player) { this.finish(reason); return; }
      // A bot comes back a couple of seconds later, so the arena never empties.
      this.pending.push({ at: this.tick + 120, colour: w.colour, name: w.name });
    }

    /* ------------------------------------------------------------ moving */

    /** Turn towards the worm's aim, no faster than TURN, and step forward. */
    advanceWorm(w) {
      // The soft boundary. Inside the band the aim is bent back towards the
      // middle rather than snapped, so it feels like being turned, not like
      // hitting glass; the clamp below is what actually holds the line.
      const inX = w.x < EDGE ? 1 : (w.x > this.W - EDGE ? -1 : 0);
      const inY = w.y < EDGE ? 1 : (w.y > this.H - EDGE ? -1 : 0);
      w.atEdge = !!(inX || inY);
      if (w.atEdge) {
        const want = Math.atan2(inY || 0, inX || 0);
        w.aim = wrapAngle(w.aim + wrapAngle(want - w.aim) * 0.16);
      }

      const want = wrapAngle(w.aim - w.angle);
      w.angle = wrapAngle(w.angle + PV.clamp(want, -TURN, TURN));

      // `boosting` arrives as "wants to dash"; this is the one place that
      // decides whether it can, so every control scheme pays the same price.
      w.boosting = w.boosting && w.energy > 0;
      let speed = BASE_SPEED;
      if (w.boosting) {
        speed = BOOST_SPEED;
        w.energy = Math.max(0, w.energy - ENERGY_DRAIN);
      } else {
        w.energy = Math.min(ENERGY_MAX, w.energy + ENERGY_REFILL);
      }
      if (w.atEdge) speed *= 0.82;                 // the edge drags

      w.x += Math.cos(w.angle) * speed;
      w.y += Math.sin(w.angle) * speed;
      const r = w.radius;
      w.x = PV.clamp(w.x, r, this.W - r);
      w.y = PV.clamp(w.y, r, this.H - r);

      w.travelled += speed;
      while (w.travelled >= NODE) {
        w.travelled -= NODE;
        w.nodes.unshift({ x: w.x, y: w.y });
      }
      while (w.nodes.length > w.maxNodes) w.nodes.pop();
    }

    /**
     * A head against somebody else's body kills the head, and credits the
     * body. Two heads meeting is settled by whoever is checked first; the
     * survivor is the one whose body was there when the other arrived, which
     * is as close to fair as a tie gets.
     */
    collide(w) {
      const r = w.radius;
      for (const other of this.worms) {
        if (other === w || !other.alive) continue;
        const reach = other.bodyLength + r + other.radius;
        const dx = other.x - w.x, dy = other.y - w.y;
        if (dx * dx + dy * dy > reach * reach) continue;      // nowhere near
        const hit = r + other.radius * 0.9;
        // Long worms are sampled coarsely: nodes are five apart and the hit
        // radius is never under ten, so a head cannot slip through the gap.
        const step = Math.max(1, Math.floor(other.nodes.length / 200));
        for (let i = 0; i < other.nodes.length; i += step) {
          const n = other.nodes[i];
          const ex = n.x - w.x, ey = n.y - w.y;
          if (ex * ex + ey * ey < hit * hit) { this.kill(w, 'eaten', other); return; }
        }
      }
    }

    eat(w) {
      const reach = w.radius + 9;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i];
        const dx = f.x - w.x, dy = f.y - w.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        w.segments += f.growth;
        w.score += f.score;
        this.food.splice(i, 1);
        if (w === this.player) this.events.push({ kind: 'eat', x: f.x, y: f.y, c: f.c });
      }
    }

    /* --------------------------------------------------------------- ai */

    nearestFood(w, within) {
      let best = null, bestD = within * within;
      for (const f of this.food) {
        const dx = f.x - w.x, dy = f.y - w.y;
        // Worth more, worth going further for.
        const d = (dx * dx + dy * dy) / (1 + f.growth * 0.12);
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

      if (ax < EDGE || ay < EDGE || ax > this.W - EDGE || ay > this.H - EDGE) {
        tx = this.W / 2; ty = this.H / 2;                     // turn inward
      } else {
        const danger = this.dangerAhead(w, look);
        if (danger) { tx = w.x - (danger.x - w.x); ty = w.y - (danger.y - w.y); }
        else {
          const f = this.nearestFood(w, 460);
          if (f) { tx = f.x; ty = f.y; }
          else { tx = this.W / 2; ty = this.H / 2; }
        }
      }
      w.aim = Math.atan2(ty - w.y, tx - w.x);

      if (w.boostTicks > 0) w.boostTicks--;
      else if (w.energy > 70 && this.rng.next() < 0.004) w.boostTicks = 40;
      w.boosting = w.boostTicks > 0;
    }

    /* ------------------------------------------------------------- tick */

    step() {
      const p = this.player;
      this.events.length = 0;

      for (const a of this.takeInputs()) {
        if (a && typeof a === 'object' && a.aim != null) {
          p.aim = a.aim;                    // the mouse, or a thumb on the stick
          p.turnHold = 0;
        } else if (a === 'left' || a === 'right') {
          p.turnDir = a === 'left' ? -1 : 1;
          p.turnHold = 12;                  // one press keeps turning for a moment
        } else if (a === 'boost') {
          p.boostTicks = 8;                 // refreshed while the button is held
        }
      }
      if (p.turnHold > 0) { p.turnHold--; p.aim = wrapAngle(p.aim + p.turnDir * TURN); }
      if (p.boostTicks > 0) p.boostTicks--;
      p.boosting = p.boostTicks > 0;        // wanting to; advanceWorm decides

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

      this.score = p.score;
    }

    /** Everyone alive, by score. The view shows the top of it. */
    leaderboard() {
      return this.worms.filter(w => w.alive).sort((a, b) => b.score - a.score);
    }

    rank() {
      const board = this.leaderboard();
      const at = board.indexOf(this.player);
      return { place: at < 0 ? board.length + 1 : at + 1, of: board.length + (at < 0 ? 1 : 0) };
    }
  };

  PV.Worms.COLOURS = COLOURS;
  PV.Worms.FOODS = FOODS;
  PV.Worms.NODE = NODE;
  PV.Worms.EDGE = EDGE;
  PV.Worms.ENERGY_MAX = ENERGY_MAX;
  PV.Worms.START_SEGMENTS = START_SEGMENTS;

})(window.PV);
