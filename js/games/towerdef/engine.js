/* 塔防 / Tower Defense — engine.

   On the real-time contract. Twenty waves; survive them all and you win.

   An enemy's position is ONE number: how far it has walked along the path, in
   cells. Everything else — its x and y, which tower can reach it, which of two
   enemies is closer to the exit — is derived from that. Storing x and y and
   moving them by hand is how enemies end up drifting off the road when a slow
   effect changes their speed mid-corner.

   Towers always shoot the enemy that has walked FURTHEST. That is the one
   about to cost a life, and it is what a player expects without being told. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const TOWERS = {
    gun: { key: 'gun', cost: 60, dmg: 9, range: 2.5, rate: 22, colour: '#38BDF8' },
    frost: { key: 'frost', cost: 85, dmg: 4, range: 2.2, rate: 30, colour: '#A5F3FC', slow: 0.55, slowFor: 90 },
    cannon: { key: 'cannon', cost: 130, dmg: 30, range: 2.9, rate: 70, colour: '#F59E0B', splash: 1.25 }
  };

  const KINDS = {
    grunt: { key: 'grunt', hp: 42, speed: 0.020, bounty: 5, colour: '#F87171' },
    runner: { key: 'runner', hp: 26, speed: 0.038, bounty: 6, colour: '#FBBF24' },
    tank: { key: 'tank', hp: 150, speed: 0.012, bounty: 16, colour: '#C084FC' }
  };

  const WAVES = 20;

  PV.TowerDef = class TowerDef extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.map = PV.TDMaps.build(o.map || 'meadow');
      this.money = 220;
      this.lives = 20;
      this.wave = 0;
      this.towers = [];
      this.enemies = [];
      this.shots = [];
      this.queue = [];
      this.spawnEvery = 34;
      this.sinceSpawn = 0;
      this.rest = 240;                 // ticks of quiet before wave 1
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
        type: type, level: 1, cooldown: 0, spent: spec.cost
      });
      return true;
    }

    upgradeCost(tower) { return Math.round(TOWERS[tower.type].cost * 0.8 * tower.level); }

    upgrade(tower) {
      if (!tower || tower.level >= 3 || this.money < this.upgradeCost(tower)) return false;
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

    waveComposition(n) {
      const out = [];
      const grunts = 6 + Math.floor(n * 1.6);
      for (let i = 0; i < grunts; i++) out.push('grunt');
      if (n >= 3) for (let i = 0; i < Math.floor(n * 0.8); i++) out.push('runner');
      if (n >= 5) for (let i = 0; i < Math.floor(n / 4); i++) out.push('tank');
      return this.rng.shuffle(out);
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

    spawn(kindKey) {
      const k = KINDS[kindKey];
      const hp = Math.round(k.hp * (1 + (this.wave - 1) * 0.30));
      this.enemies.push({
        kind: kindKey, hp: hp, maxHp: hp, speed: k.speed,
        dist: 0, slowFor: 0, bounty: k.bounty + Math.floor(this.wave / 2)
      });
    }

    /* -------------------------------------------------------------- path */

    positionAt(dist) {
      const pts = this.map.points;
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

      const end = this.map.points.length - 1;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const factor = e.slowFor > 0 ? TOWERS.frost.slow : 1;
        if (e.slowFor > 0) e.slowFor--;
        e.dist += e.speed * factor;
        if (e.dist >= end) {
          this.enemies.splice(i, 1);
          this.lives--;
          this.leaked++;
          if (this.lives <= 0) { this.lives = 0; this.finish('overrun'); return; }
        }
      }

      for (const tw of this.towers) {
        if (tw.cooldown > 0) { tw.cooldown--; continue; }
        const st = this.statsOf(tw);
        let target = null;
        for (const e of this.enemies) {
          const p = this.positionAt(e.dist);
          if (Math.hypot(p.x - tw.x, p.y - tw.y) > st.range) continue;
          if (!target || e.dist > target.dist) target = e;
        }
        if (!target) continue;

        tw.cooldown = st.rate;
        const p = this.positionAt(target.dist);
        this.shots.push({ x1: tw.x, y1: tw.y, x2: p.x, y2: p.y, life: 6, colour: st.spec.colour });

        this.damage(target, st.dmg);
        if (st.spec.slow) target.slowFor = st.spec.slowFor;
        if (st.spec.splash) {
          for (const e of this.enemies) {
            if (e === target) continue;
            const q = this.positionAt(e.dist);
            if (Math.hypot(q.x - p.x, q.y - p.y) <= st.spec.splash) this.damage(e, st.dmg * 0.5);
          }
        }
      }

      for (let i = this.shots.length - 1; i >= 0; i--) {
        if (--this.shots[i].life <= 0) this.shots.splice(i, 1);
      }

      if (!this.queue.length && !this.enemies.length && this.rest === 0) {
        if (this.wave >= WAVES) { this.finish('cleared'); return; }
        this.rest = 300;               // five seconds to build before the next wave
      }
    }

    damage(enemy, amount) {
      enemy.hp -= amount;
      if (enemy.hp > 0) return;
      const i = this.enemies.indexOf(enemy);
      if (i < 0) return;
      this.enemies.splice(i, 1);
      this.money += enemy.bounty;
      this.score += enemy.bounty * 2;
      this.killed++;
    }

    get waves() { return WAVES; }
    get building() { return this.rest > 0 || (!this.queue.length && !this.enemies.length); }
  };

  PV.TowerDef.TOWERS = TOWERS;
  PV.TowerDef.KINDS = KINDS;
  PV.TowerDef.WAVES = WAVES;

})(window.PV);
