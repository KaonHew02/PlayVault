/* 塔防 / Tower Defense — engine.

   On the real-time contract. Twenty waves; survive them all and you win.

   An enemy's position is ONE number: how far it has walked along its lane, in
   cells. Everything else — its x and y, which tower can reach it, which of two
   enemies is closer to the exit — is derived from that. Storing x and y and
   moving them by hand is how enemies end up drifting off the road when a slow
   effect changes their speed mid-corner. The derived position is cached once
   per tick, in the move pass, because otherwise every tower walks the path
   again for every enemy it considers.

   Towers always shoot the enemy that has walked FURTHEST. That is the one
   about to cost a life, and it is what a player expects without being told.
   On a two-lane map "furthest" is measured as a FRACTION of the lane, or a
   short lane's leader would never be shot at while a long lane still has
   anyone on it.

   Difficulty scales the enemies and the purse, never the rules: the same
   twenty waves arrive in the same order, with more health and less change in
   your pocket. Armour is the one exception worth knowing — it is subtracted
   from every hit, so the gun's twelve small bites do far less to an armoured
   enemy than the cannon's one big one, and mixing towers is the answer.

   Enemies RANK UP as the waves go on, 1 to 3, on the same schedule and with
   the same badge as a tower's levels — because the player is upgrading too,
   and a wave 15 grunt that is merely a wave 1 grunt with more health does not
   read as the game answering back. A rank is worth health, armour, a little
   speed and a bigger bounty, and it is drawn on the enemy. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TOWERS = {
    gun: { key: 'gun', cost: 60, dmg: 9, range: 2.5, rate: 22, colour: '#38BDF8' },
    frost: { key: 'frost', cost: 85, dmg: 4, range: 2.2, rate: 30, colour: '#A5F3FC', slow: 0.55, slowFor: 90 },
    cannon: { key: 'cannon', cost: 130, dmg: 30, range: 2.9, rate: 70, colour: '#F59E0B', splash: 1.25 }
  };

  const MAX_LEVEL = 3;

  /* `armour` is flat damage soaked per hit, `leak` the lives it costs if it
     gets through, `ramp` how hard its health follows the wave number. */
  const KINDS = {
    grunt: { key: 'grunt', hp: 42, speed: 0.020, bounty: 5, colour: '#F87171', size: 0.22 },
    runner: { key: 'runner', hp: 26, speed: 0.038, bounty: 6, colour: '#FBBF24', size: 0.19 },
    tank: { key: 'tank', hp: 150, speed: 0.012, bounty: 16, colour: '#C084FC', size: 0.30 },
    armour: { key: 'armour', hp: 105, speed: 0.017, bounty: 15, colour: '#94A3B8', size: 0.26, armour: 3 },
    boss: {
      key: 'boss', hp: 620, speed: 0.010, bounty: 85, colour: '#F43F5E', size: 0.40,
      armour: 6, leak: 4, ramp: 0.5
    }
  };

  const DIFFS = {
    easy: { key: 'easy', lives: 25, money: 300, hp: 0.78, ramp: 0.25, speed: 0.92, bounty: 1.3, count: 0.85, rest: 360, xp: 0.7, score: 0.8 },
    normal: { key: 'normal', lives: 20, money: 220, hp: 1.00, ramp: 0.30, speed: 1.00, bounty: 1.0, count: 1.00, rest: 300, xp: 1.0, score: 1.0 },
    hard: { key: 'hard', lives: 12, money: 190, hp: 1.25, ramp: 0.30, speed: 1.10, bounty: 0.95, count: 1.15, rest: 240, xp: 1.5, score: 1.4 }
  };

  const WAVES = 20;
  const TURN = 0.24;                 // barrel swing per tick, in radians
  const MAX_RANK = 3;
  const RANK_AT = [7, 14];           // the waves rank 2 and rank 3 turn up

  /** Shortest way round from a to b, clamped to `max`, wrapped to ±π. */
  function turnToward(a, b, max) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    if (d > max) d = max; else if (d < -max) d = -max;
    let out = a + d;
    if (out > Math.PI) out -= Math.PI * 2;
    if (out < -Math.PI) out += Math.PI * 2;
    return out;
  }

  PV.TowerDef = class TowerDef extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.mapKey = o.map || 'meadow';
      this.map = PV.TDMaps.build(this.mapKey);
      this.diff = DIFFS[o.difficulty] || DIFFS.normal;
      this.money = this.diff.money + this.map.bonus;
      this.lives = this.diff.lives;
      this.wave = 0;
      this.towers = [];
      this.enemies = [];
      this.shots = [];
      this.blasts = [];
      this.queue = [];
      this.spawnEvery = 34;
      this.sinceSpawn = 0;
      this.nextLane = 0;
      this.rest = Math.round(this.diff.rest * 0.8);   // quiet before wave 1
      this.leaked = 0;
      this.killed = 0;
    }

    /* ---------------------------------------------------------- building */

    inGrid(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.map.cols && cy < this.map.rows; }
    onPath(cx, cy) { return this.map.onPath.has(cy * this.map.cols + cx); }
    towerAt(cx, cy) { return this.towers.find(tw => tw.cx === cx && tw.cy === cy) || null; }
    canBuild(cx, cy) { return this.inGrid(cx, cy) && !this.onPath(cx, cy) && !this.towerAt(cx, cy); }

    build(cx, cy, type) {
      const spec = TOWERS[type];
      if (!spec || !this.canBuild(cx, cy) || this.money < spec.cost) return false;
      this.money -= spec.cost;
      this.towers.push({
        cx: cx, cy: cy, x: cx + 0.5, y: cy + 0.5,
        type: type, level: 1, cooldown: 0, spent: spec.cost,
        // Point it at the nearest road on the day it is built, so a new tower
        // is never caught facing the scenery.
        aim: this.facingRoad(cx + 0.5, cy + 0.5), flash: 0, shots: 0, dealt: 0
      });
      return true;
    }

    /** The bearing from a square to the closest cell of any lane. */
    facingRoad(x, y) {
      let best = null, bd = Infinity;
      for (const lane of this.map.lanes) {
        for (const p of lane.points) {
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bd) { bd = d; best = p; }
        }
      }
      return best ? Math.atan2(best.y - y, best.x - x) : 0;
    }

    upgradeCost(tower) { return Math.round(TOWERS[tower.type].cost * 0.8 * tower.level); }

    upgrade(tower) {
      if (!tower || tower.level >= MAX_LEVEL || this.money < this.upgradeCost(tower)) return false;
      this.money -= this.upgradeCost(tower);
      tower.spent += this.upgradeCost(tower);
      tower.level++;
      return true;
    }

    /** Selling returns two thirds — enough to fix a mistake, not enough to churn. */
    sell(tower) {
      const i = this.towers.indexOf(tower);
      if (i < 0) return false;
      this.money += Math.floor(tower.spent * 0.66);
      this.towers.splice(i, 1);
      return true;
    }

    statsOf(tower) {
      const spec = TOWERS[tower.type];
      const step = tower.level - 1;
      return {
        dmg: spec.dmg * (1 + step * 0.55),
        range: spec.range * (1 + step * 0.12),
        rate: Math.round(spec.rate * (1 - step * 0.12)),
        spec: spec
      };
    }

    /* ------------------------------------------------------------- waves */

    isBossWave(n) { return n >= 10 && n % 5 === 0; }

    waveComposition(n) {
      const d = this.diff;
      const out = [];
      const grunts = Math.max(4, Math.round((6 + n * 1.6) * d.count));
      for (let i = 0; i < grunts; i++) out.push('grunt');
      if (n >= 3) for (let i = 0; i < Math.floor(n * 0.8 * d.count); i++) out.push('runner');
      if (n >= 5) for (let i = 0; i < Math.floor(n / 4); i++) out.push('tank');
      if (n >= 8) for (let i = 0; i < Math.floor((n - 5) / 3); i++) out.push('armour');
      const mob = this.rng.shuffle(out);
      const bosses = [];
      if (this.isBossWave(n)) {
        bosses.push('boss');
        if (d.key === 'hard' && n >= WAVES) bosses.push('boss');
      }
      // The queue is popped from the END, so a boss at the front walks in last.
      return bosses.concat(mob);
    }

    startWave() {
      if (this.queue.length || this.enemies.length || this.wave >= WAVES) return false;
      // Starting early pays: the whole point of the quiet gap is the choice.
      if (this.rest > 0) this.money += Math.floor(this.rest / 12);
      this.wave++;
      this.queue = this.waveComposition(this.wave);
      this.spawnEvery = Math.max(14, 34 - this.wave);
      this.sinceSpawn = this.spawnEvery;
      this.rest = 0;
      return true;
    }

    /** What rank the enemies are fielding this wave — 1, 2 or 3. */
    rankFor(wave) {
      let r = 1;
      for (const at of RANK_AT) if (wave >= at) r++;
      return r;
    }

    get rank() { return this.rankFor(Math.max(1, this.wave)); }

    spawn(kindKey) {
      const k = KINDS[kindKey];
      const d = this.diff;
      const rank = this.rankFor(this.wave);
      const step = rank - 1;
      const hp = Math.round(k.hp * (1 + (this.wave - 1) * d.ramp * (k.ramp || 1))
        * (1 + step * 0.18) * d.hp);
      const lane = this.nextLane % this.map.lanes.length;
      this.nextLane = lane + 1;
      const e = {
        kind: kindKey, rank: rank, hp: hp, maxHp: hp,
        speed: k.speed * (1 + step * 0.04) * d.speed,
        armour: (k.armour || 0) + step * 2,
        lane: lane, dist: 0, prog: 0, slowFor: 0, hurt: 0,
        bounty: Math.round((k.bounty + Math.floor(this.wave / 2)) * (1 + step * 0.22) * d.bounty),
        x: 0, y: 0, head: 0
      };
      this.enemies.push(e);
      this.place(e);
    }

    /* -------------------------------------------------------------- path */

    /** Cache an enemy's world position and heading from its one number. */
    place(e) {
      const lane = this.map.lanes[e.lane];
      const pts = lane.points;
      const i = Math.max(0, Math.min(Math.floor(e.dist), pts.length - 2));
      const f = Math.max(0, Math.min(1, e.dist - i));
      const a = pts[i], b = pts[i + 1];
      e.x = a.x + (b.x - a.x) * f;
      e.y = a.y + (b.y - a.y) * f;
      e.head = Math.atan2(b.y - a.y, b.x - a.x);
      e.prog = e.dist / lane.end;
    }

    positionAt(dist, laneIdx) {
      const pts = this.map.lanes[laneIdx || 0].points;
      if (dist <= 0) return { x: pts[0].x, y: pts[0].y };
      const i = Math.floor(dist);
      if (i >= pts.length - 1) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
      const f = dist - i;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f
      };
    }

    /* -------------------------------------------------------------- tick */

    step() {
      for (const a of this.takeInputs()) if (a === 'next') this.startWave();

      if (this.rest > 0) {
        this.rest--;
        if (this.rest === 0) this.startWave();
      }

      if (this.queue.length && ++this.sinceSpawn >= this.spawnEvery) {
        this.sinceSpawn = 0;
        this.spawn(this.queue.pop());
      }

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const factor = e.slowFor > 0 ? TOWERS.frost.slow : 1;
        if (e.slowFor > 0) e.slowFor--;
        if (e.hurt > 0) e.hurt--;
        e.dist += e.speed * factor;
        if (e.dist >= this.map.lanes[e.lane].end) {
          this.enemies.splice(i, 1);
          this.lives -= (KINDS[e.kind].leak || 1);
          this.leaked++;
          if (this.lives <= 0) { this.lives = 0; this.finish('overrun'); return; }
          continue;
        }
        this.place(e);
      }

      for (const tw of this.towers) {
        const st = this.statsOf(tw);
        let target = null;
        for (const e of this.enemies) {
          if (Math.hypot(e.x - tw.x, e.y - tw.y) > st.range) continue;
          if (!target || e.prog > target.prog) target = e;
        }
        // The barrel tracks whether or not it can fire, so a tower between
        // shots is visibly following the thing it is about to shoot.
        if (target) tw.aim = turnToward(tw.aim, Math.atan2(target.y - tw.y, target.x - tw.x), TURN);
        if (tw.flash > 0) tw.flash--;
        if (tw.cooldown > 0) { tw.cooldown--; continue; }
        if (!target) continue;

        tw.cooldown = st.rate;
        tw.flash = 6;
        tw.shots++;
        this.shots.push({
          x1: tw.x, y1: tw.y, x2: target.x, y2: target.y,
          life: 6, max: 6, colour: st.spec.colour, kind: tw.type
        });

        tw.dealt += this.damage(target, st.dmg);
        if (st.spec.slow) target.slowFor = st.spec.slowFor;
        if (st.spec.splash) {
          const hx = target.x, hy = target.y;
          this.blasts.push({ x: hx, y: hy, r: st.spec.splash, life: 14, max: 14 });
          for (const e of this.enemies) {
            if (e === target) continue;
            if (Math.hypot(e.x - hx, e.y - hy) <= st.spec.splash) tw.dealt += this.damage(e, st.dmg * 0.5);
          }
        }
      }

      for (let i = this.shots.length - 1; i >= 0; i--) {
        if (--this.shots[i].life <= 0) this.shots.splice(i, 1);
      }
      for (let i = this.blasts.length - 1; i >= 0; i--) {
        if (--this.blasts[i].life <= 0) this.blasts.splice(i, 1);
      }

      if (!this.queue.length && !this.enemies.length && this.rest === 0) {
        if (this.wave >= WAVES) { this.finish('cleared'); return; }
        this.rest = this.diff.rest;          // a breather to build in
      }
    }

    /** Armour is taken off every hit, so a stream of small bites is the wrong
        answer to it. A hit always does something, or a gun would read as broken. */
    damage(enemy, amount) {
      const dealt = Math.max(1, amount - (enemy.armour || 0));
      enemy.hp -= dealt;
      enemy.hurt = 4;
      if (enemy.hp > 0) return dealt;
      const i = this.enemies.indexOf(enemy);
      if (i < 0) return dealt;
      this.enemies.splice(i, 1);
      this.money += enemy.bounty;
      this.score += Math.round(enemy.bounty * 2 * this.diff.score);
      this.killed++;
      return dealt;
    }

    get waves() { return WAVES; }
    get building() { return this.rest > 0 || (!this.queue.length && !this.enemies.length); }
    get nextIsBoss() { return this.isBossWave(this.wave + 1); }
  };

  PV.TowerDef.TOWERS = TOWERS;
  PV.TowerDef.KINDS = KINDS;
  PV.TowerDef.DIFFS = DIFFS;
  PV.TowerDef.WAVES = WAVES;
  PV.TowerDef.MAX_LEVEL = MAX_LEVEL;
  PV.TowerDef.MAX_RANK = MAX_RANK;

})(window.PV);
