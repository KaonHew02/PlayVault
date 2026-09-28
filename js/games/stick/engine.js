/* 火柴人对决 / Stick Clash — engine.

   One fight, best of three rounds (or one, or five), on the real-time
   contract: step() advances exactly one tick at 60 Hz, inputs land on tick
   boundaries, and every choice the computer makes comes out of the game's
   own PV.RNG — so a fight replays exactly from its seed and its inputs.

   INPUT is one string per control per tick: `l1 r1 d1` are held (the
   harness re-sends them every tick while the key is down), `u1 a1 s1` are
   presses (jump, attack, special) and wait in a short buffer, so a press a
   few ticks before a fighter is free still happens. The 2 suffix is the
   second player. `{ start: cfg }` begins a fight from the lobby; `'menu'`
   goes back to it.

   Moves are data (data.js); this file only runs them. The pieces that
   are easy to get wrong, all in one place:

   - HITS ARE COLLECTED, THEN APPLIED. Two jabs that land on the same tick
     both land — a trade — instead of whoever is first in the array winning.
   - A COMBO IS TIMED. A press inside a move's window queues the next hit;
     a press before it drops the chain for the rest of that move. The
     damage of each hit in a combo falls away (8% a hit, down to 35%), and
     an airborne target can only be juggled so long before it drops out.
   - BLOCKING faces one way. It holds against anything from in front,
     turns chip damage into a stamina cost, and breaks when stamina runs
     out. A fighter holding block does not turn round, so jumping over one
     and hitting their back is how a guard is opened — and an aerial hit
     from behind is an AERIAL STRIKE, harder and launching.
   - A BREAKER spends half the meter to burst out of a combo; an
     ULTIMATE spends all of it. The screen holds while an ultimate winds
     up (`cine`), then, once it connects, the target is held (`lock`) for
     the flurry and the finale.
   - The world stops for a few ticks on every hit (hitstop), and runs at a
     third of the speed for a moment after a knockout. Both are ticks, so
     a replay stops and slows in exactly the same places. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.StickData, R = D.RULES, W = D.ARENA;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const sign = v => (v < 0 ? -1 : 1);

  const GROUND_FREE = { idle: 1, walk: 1, land: 1 };
  const NO_HIT = { down: 1, getup: 1, ko: 1, held: 1, intro: 1, win: 1 };
  const MODES = ['tour', 'versus', 'two', 'train'];
  const DUMMY = ['stand', 'block', 'jump', 'cpu'];

  function fighter(side, id, alt, x, dir) {
    const def = D.fighter(id);
    return {
      side: side, id: def.key, def: def, alt: !!alt,
      x: x, y: 0, px: x, py: 0, vx: 0, vy: 0, dir: dir,
      hp: def.hp, hpMax: def.hp, sta: R.staMax, meter: 0,
      state: 'intro', st: 0,
      mv: null, mt: 0, mseq: 0, slot: -1, chainQ: false, early: false, active: false,
      stun: 0, bs: 0, inv: 0, air: false, airUsed: false, kd: false, launched: false, juggle: 0,
      armor: false, hidden: false, lock: null, heldBy: -1,
      combo: 0, comboDmg: 0, idleT: 0,
      ctl: { l: false, r: false, d: false },
      buf: { u: 0, a: 0, s: 0 },
      stats: { dmg: 0, hits: 0, best: 0, blocks: 0, specials: 0 },
      bot: null, human: false
    };
  }

  PV.StickGame = class StickGame extends PV.LoopGame {
    /** opts: { seed, stage, p1, p2, mode, level, rounds } — p1 and p2 start at once;
        show: [a, b] is who stands in the lobby until then. */
    constructor(opts) {
      super(opts);
      const o = opts || {};
      this.phase = 'lobby';
      this.pt = 0;
      this.mode = MODES.indexOf(o.mode) >= 0 ? o.mode : 'versus';
      this.stage = D.STAGES.indexOf(o.stage) >= 0 ? o.stage : D.STAGES[0];
      this.proj = [];
      this.pid = 0;
      this.events = [];
      this.seq = 0;
      this.freeze = 0;
      this.cine = null;
      this.round = 0;
      this.wins = [0, 0];
      this.perfects = [0, 0];
      this.kos = [0, 0];
      this.need = 2;
      this.maxRounds = 5;
      this.clock = 0;
      this.winner = -1;
      this.roundWinner = -1;
      this.koBy = -1;
      this.cfg = null;
      this.dummy = 'stand';
      // The lobby still has two fighters in it, idling behind the menu.
      const show = Array.isArray(o.show) ? o.show : [o.p1, o.p2];
      this.f = [];
      this.show(show[0], show[1]);
      if (o.p1 && o.p2) this.begin(o);
    }

    /* ---------------------------------------------------------- setup */

    /** Start a fight. Everything in cfg is checked, since it can come from a page. */
    begin(cfg) {
      const c = cfg || {};
      const mode = MODES.indexOf(c.mode) >= 0 ? c.mode : 'versus';
      const p1 = D.isFighter(c.p1) ? c.p1 : 'ink';
      const p2 = D.isFighter(c.p2) ? c.p2 : this.rng.pick(D.KEYS);
      const rounds = [1, 3, 5].indexOf(c.rounds) >= 0 ? c.rounds : 3;
      const level = typeof c.level === 'number' && c.level >= 0 && c.level <= 1 ? c.level : D.LEVELS.normal;
      let stage = c.stage;
      if (D.STAGES.indexOf(stage) < 0) stage = this.rng.pick(D.STAGES);
      this.mode = mode;
      this.stage = stage;
      const tour = Math.max(0, Math.min(D.LADDER.length - 1, Math.floor(+c.tour) || 0));
      this.cfg = { mode: mode, p1: p1, p2: p2, rounds: rounds, level: level, stage: stage, tour: tour };
      this.need = mode === 'train' ? 0 : (rounds + 1) / 2;
      this.maxRounds = rounds + 2;
      this.f = [fighter(0, p1, false, W / 2 - 180, 1), fighter(1, p2, p1 === p2, W / 2 + 180, -1)];
      this.f[0].human = true;
      this.f[1].human = mode === 'two';
      if (mode === 'versus' || mode === 'tour') this.f[1].bot = PV.StickBot.create(level);
      if (mode === 'train') this.setDummy(DUMMY.indexOf(c.dummy) >= 0 ? c.dummy : 'stand');
      this.round = 0;
      this.wins = [0, 0];
      this.perfects = [0, 0];
      this.kos = [0, 0];
      this.winner = -1;
      this.score = 0;
      this.startRound();
    }

    show(a, b) {
      const p1 = D.isFighter(a) ? a : 'ink', p2 = D.isFighter(b) ? b : 'blaze';
      this.f = [fighter(0, p1, false, W / 2 - 180, 1), fighter(1, p2, p1 === p2, W / 2 + 180, -1)];
    }

    setDummy(k) {
      if (this.mode !== 'train' || DUMMY.indexOf(k) < 0) return;
      this.dummy = k;
      this.f[1].bot = k === 'cpu' ? PV.StickBot.create(D.LEVELS.normal) : null;
    }

    startRound() {
      this.round++;
      const pos = [W / 2 - 180, W / 2 + 180];
      this.f.forEach((f, i) => {
        const keep = { meter: f.meter, stats: f.stats, bot: f.bot, human: f.human };
        const n = fighter(i, f.id, f.alt, pos[i], i ? -1 : 1);
        Object.assign(f, n, keep);
        if (this.mode === 'train') f.meter = R.meterMax;
      });
      this.proj.length = 0;
      this.freeze = 0;
      this.cine = null;
      this.koBy = -1;
      this.roundWinner = -1;
      this.clock = this.mode === 'train' ? 0 : R.roundTicks;
      this.phase = 'intro';
      this.pt = 0;
      this.ev('round', { n: this.round, final: this.need && this.wins[0] === this.need - 1 && this.wins[1] === this.need - 1 });
    }

    toLobby() {
      this.phase = 'lobby';
      this.pt = 0;
      this.proj.length = 0;
      this.cine = null;
      this.freeze = 0;
      this.f.forEach(f => { f.state = 'intro'; f.st = 0; f.mv = null; f.vx = f.vy = 0; f.y = 0; f.bot = null; f.human = false; });
    }

    ev(k, data) {
      const e = Object.assign({ k: k, seq: ++this.seq, t: this.tick }, data || {});
      this.events.push(e);
      if (this.events.length > 80) this.events.splice(0, this.events.length - 80);
      return e;
    }

    foe(f) { return this.f[1 - f.side]; }

    /* ----------------------------------------------------------- tick */

    step() {
      for (const f of this.f) { f.px = f.x; f.py = f.y; f.ctl.l = f.ctl.r = f.ctl.d = false; }
      for (const p of this.proj) { p.px = p.x; p.py = p.y; }
      for (const a of this.takeInputs()) this.take(a);
      this.pt++;

      switch (this.phase) {
        case 'lobby':
          for (const f of this.f) f.st++;
          break;
        case 'intro':
          for (const f of this.f) f.st++;
          if (this.pt === 60) this.ev('fight');
          if (this.pt >= 80) {
            this.phase = 'fight';
            this.pt = 0;
            for (const f of this.f) { f.state = 'idle'; f.st = 0; }
          }
          break;
        case 'fight':
          this.fight();
          break;
        case 'ko':
          // A third of the speed for a second, then real time again.
          if (this.pt > 60 || this.pt % 3 === 0) this.sim(false);
          if (this.pt >= 130) this.endRound();
          break;
        case 'timeup':
          this.sim(false);
          if (this.pt >= 70) this.endRound();
          break;
        case 'roundEnd':
          this.sim(false);
          for (const f of this.f) {
            if (f.side === this.roundWinner && GROUND_FREE[f.state]) { f.state = 'win'; f.st = 0; f.vx = 0; }
          }
          if (this.pt >= 110) this.nextRound();
          break;
        case 'matchEnd':
          this.sim(false);
          for (const f of this.f) {
            if (f.side === this.winner && (GROUND_FREE[f.state] || f.state === 'win') && f.state !== 'win') { f.state = 'win'; f.st = 0; f.vx = 0; }
          }
          if (this.pt >= 150) this.finish('match');
          break;
      }
    }

    take(a) {
      if (a === 'menu') { this.toLobby(); return; }
      if (typeof a === 'string' && a.length === 2) {
        const side = a[1] === '1' ? 0 : a[1] === '2' ? 1 : -1;
        const f = this.f[side];
        if (!f || !f.human) return;                 // nobody drives the computer's fighter
        const k = a[0];
        if (k === 'l' || k === 'r' || k === 'd') f.ctl[k] = true;
        else if (k === 'u' || k === 'a' || k === 's') f.buf[k] = R.buffer;
        return;
      }
      if (a && typeof a === 'object') {
        if (a.start && this.phase === 'lobby') this.begin(a.start);
        else if (Array.isArray(a.show) && this.phase === 'lobby') this.show(a.show[0], a.show[1]);
        else if (typeof a.dummy === 'string') this.setDummy(a.dummy);
      }
    }

    fight() {
      if (this.cine) {
        // The screen holds while an ultimate winds up; only its owner moves.
        const f = this.f[this.cine.side];
        f.px = f.x; f.py = f.y;
        this.moveTick(f, this.foe(f));
        if (--this.cine.t <= 0) this.cine = null;
        return;
      }
      if (this.freeze > 0) { this.freeze--; return; }
      for (const f of this.f) {
        if (f.bot) f.bot.think(this, f, this.foe(f));
        else if (this.mode === 'train' && f.side === 1) this.dummyThink(f);
      }
      this.sim(true);
      if (this.clock > 0 && this.phase === 'fight') {
        this.clock--;
        if (this.clock === 0) {
          this.phase = 'timeup';
          this.pt = 0;
          this.ev('timeup');
        }
      }
      if (this.mode === 'train') this.trainTick();
    }

    dummyThink(f) {
      if (this.dummy === 'block') f.ctl.d = true;
      else if (this.dummy === 'jump' && !f.air && f.state === 'idle' && f.st > 20) f.buf.u = 1;
    }

    /* A training dummy (and you) come back to full after a quiet second,
       with a full meter to practise ultimates on. */
    trainTick() {
      for (const f of this.f) {
        f.idleT = (f.state === 'idle' || f.state === 'walk' || f.state === 'block') && f.combo === 0 ? f.idleT + 1 : 0;
        if (f.idleT > 60) { f.hp = f.hpMax; f.meter = R.meterMax; f.sta = R.staMax; }
      }
    }

    /** One tick of the world. `control` is false once a round is decided. */
    sim(control) {
      const [a, b] = this.f;
      this.control(a, b, control);
      this.control(b, a, control);
      this.moveTick(a, b);
      this.moveTick(b, a);
      this.physics(a);
      this.physics(b);
      this.push(a, b);
      this.melee();
      this.projTick();
      this.face(a, b);
      this.face(b, a);
      this.timers(a, control);
      this.timers(b, control);
    }

    /* ------------------------------------------------------- controls */

    control(f, foe, on) {
      const c = f.ctl, b = f.buf;
      if (!on) { b.u = b.a = b.s = 0; if (f.state === 'walk') { f.state = 'idle'; f.vx = 0; } if (f.state === 'block' && !f.bs) f.state = 'idle'; return; }
      const fwd = f.dir > 0 ? c.r : c.l, bak = f.dir > 0 ? c.l : c.r;
      const st = f.state;

      if (GROUND_FREE[st] || (st === 'block' && !f.bs)) {
        if (b.s) {
          b.s = 0;
          const key = c.d && f.meter >= R.meterMax ? 'ult' : fwd ? 'fwd' : bak ? 'back' : 'sp';
          if (this.tryMove(f, key)) return;
        }
        if (b.a) { b.a = 0; if (this.tryMove(f, c.d ? 'up' : 'j1')) return; }
        if (b.u) { b.u = 0; this.jump(f, c); return; }
        if (c.d) {
          if (st !== 'block') { f.state = 'block'; f.st = 0; }
          f.vx = 0;
          return;
        }
        if (st === 'land') return;
        if (fwd || bak) {
          if (st !== 'walk') { f.state = 'walk'; f.st = 0; }
          f.vx = (c.r ? 1 : -1) * R.walk * f.def.speed * (bak ? R.back : 1);
        } else if (st !== 'idle') { f.state = 'idle'; f.st = 0; f.vx = 0; }
        return;
      }

      if (st === 'jump' || st === 'fall') {
        if (b.a && !f.airUsed) { b.a = 0; f.airUsed = true; this.tryMove(f, 'air'); return; }
        const cap = R.airVx * f.def.speed;
        if (c.l && !c.r) f.vx = Math.max(-cap, f.vx - 0.22);
        if (c.r && !c.l) f.vx = Math.min(cap, f.vx + 0.22);
        return;
      }

      if (st === 'attack' && b.a && !f.lock) {
        const m = f.mv;
        if (m.chain && !f.early && !f.chainQ) {
          if (f.mt < m.win[0]) { f.early = true; b.a = 0; }
          else if (f.mt <= m.win[1]) { f.chainQ = true; b.a = 0; }
        }
        return;
      }

      if (st === 'hit' && b.s && f.meter >= R.breaker && f.heldBy < 0) {
        b.s = 0;
        this.breaker(f, foe);
      }
    }

    jump(f, c) {
      f.state = 'jump'; f.st = 0;
      f.air = true;
      f.vy = R.jumpV * f.def.jump;
      f.vx = (c.r && !c.l ? 1 : c.l && !c.r ? -1 : 0) * R.airVx * f.def.speed;
      f.airUsed = false;
      this.ev('jump', { side: f.side });
    }

    /** Whether a special could go now: one thrown thing of your own at a time. */
    canThrow(f) { return !this.proj.some(p => p.owner === f.side && !p.ult); }

    tryMove(f, key) {
      const m = f.def.moves[key];
      if (!m) return false;
      if (key === 'ult') {
        if (f.meter < R.meterMax) return false;
        f.meter = 0;
      } else {
        if (key === 'sp' && m.proj && !this.canThrow(f)) return false;
        if (f.sta < m.cost) { this.ev('tired', { side: f.side }); return false; }
        f.sta -= m.cost;
      }
      this.startMove(f, m);
      if (key === 'sp' || key === 'fwd' || key === 'back' || key === 'ult') {
        f.stats.specials++;
        this.ev('special', { side: f.side, key: key });
      }
      return true;
    }

    startMove(f, m) {
      f.state = 'attack'; f.st = 0;
      f.mv = m; f.mt = 0; f.mseq++;
      f.slot = -1; f.chainQ = false; f.early = false; f.active = false; f.armor = false;
      if (!f.air) {
        const foe = this.foe(f);
        if (Math.abs(foe.x - f.x) > 2 && !foe.hidden) f.dir = sign(foe.x - f.x);
        f.vx = 0;
      }
      if (m.cine) {
        this.cine = { side: f.side, t: m.f[0] };
        this.ev('ult', { side: f.side });
      } else {
        this.ev('swing', { side: f.side, key: m.key, heavy: m.dmg >= 7 });
      }
    }

    endMove(f) {
      f.mv = null; f.active = false; f.armor = false; f.hidden = false; f.chainQ = false; f.lock = null;
      f.state = f.air ? 'fall' : 'idle'; f.st = 0;
      if (!f.air) f.vx = 0;
    }

    /* ---------------------------------------------------------- moves */

    moveTick(f, foe) {
      if (f.state !== 'attack') return;
      if (f.lock) { this.lockTick(f, foe); return; }
      const m = f.mv, su = m.f[0], ac = m.f[1], re = m.f[2];
      const t = ++f.mt;
      if (m.vx && t > su && t <= su + ac) f.vx = m.vx * f.dir;
      if (m.vx && t === su + ac + 1 && !f.air) f.vx *= 0.25;
      if (m.vy && t === su + 1) { f.vy = m.vy; if (f.vy > 0) f.air = true; }
      if (m.proj && t === m.proj.at) this.spawn(f, foe, m.proj, m);
      if (m.tele && t === m.tele.at) this.teleport(f, foe, m.tele);
      f.hidden = !!(m.tele && t >= m.tele.at - 3 && t < m.tele.at + 2);
      if (m.inv && t >= m.inv[0] && t <= m.inv[1]) f.inv = Math.max(f.inv, 1);
      f.armor = !!m.armor && t > su && t <= su + ac;
      f.active = !!m.box && t > su + (m.hitFrom || 0) && t <= su + ac;
      if (f.chainQ && t >= su + ac) {
        const next = f.def.moves[m.chain];
        f.chainQ = false;
        if (next && f.sta >= next.cost) { f.sta -= next.cost; this.startMove(f, next); return; }
        if (next) this.ev('tired', { side: f.side });
      }
      if (t >= su + ac + re) this.endMove(f);
    }

    teleport(f, foe, tp) {
      const from = f.x;
      if (tp.to === 'behind') {
        f.x = clamp(foe.x - foe.dir * 74, 40, W - 40);
        if (Math.abs(f.x - foe.x) < 40) f.x = clamp(foe.x + foe.dir * 74, 40, W - 40);
        f.y = 0; f.vy = 0; f.air = false;
      } else if (tp.to === 'ahead') {
        f.x = clamp(f.x + f.dir * tp.d, 40, W - 40);
      } else if (tp.to === 'above') {
        f.x = clamp(foe.x, 40, W - 40);
        f.y = 260; f.vy = 0; f.air = true;
      }
      if (Math.abs(foe.x - f.x) > 2) f.dir = sign(foe.x - f.x);
      this.ev('tele', { side: f.side, from: from, x: f.x, y: f.y });
    }

    spawn(f, foe, p, m) {
      const K = D.PROJ[p.kind];
      const n = p.n || 1;
      const big = !!p.big;
      for (let i = 0; i < n; i++) {
        const q = {
          id: ++this.pid, owner: f.side, kind: p.kind, dir: f.dir, t: 0,
          x: f.x + f.dir * 40, y: f.y + (p.y || 0), vx: p.vx * f.dir,
          vy: (p.vy || 0) + (n > 1 ? (i - (n - 1) / 2) * (p.spread || 0) : 0),
          grav: p.grav || 0, w: K.w * (big ? 1.9 : 1), h: K.h * (big ? 1.6 : 1),
          life: K.life, boom: K.boom || 0, bounce: !!K.bounce, sky: !!K.sky,
          dmg: p.dmg, stun: p.stun, kb: p.kb, launch: !!p.launch, down: !!p.down,
          lock: m.lock || null, ult: !!m.cine, big: big, fire: !!p.fire, leg: 0, hitLeg: -1
        };
        if (K.ground) q.y = f.y > 0 ? f.y + (p.y || 0) : (p.y || 22);
        if (p.atFoe) { q.x = foe.x; q.y = 0; q.vx = 0; }
        q.px = q.x; q.py = q.y;
        this.proj.push(q);
      }
      this.ev('proj', { side: f.side, kind: p.kind, big: big });
    }

    /* The flurry: the target is held while hits land every few ticks, then
       the finale throws them. Flurry hits cannot finish a fight — the
       finale does, which is why it is a finale. */
    startLock(a, d, m) {
      a.lock = { n: 0, t: 0, x: d.x, y: d.y };
      if (a.state !== 'attack' || a.mv !== m) { a.state = 'attack'; a.mv = m; }
      a.mt = m.f[0] + m.f[1];
      a.vx = 0; a.active = false;
      d.state = 'held'; d.st = 0; d.heldBy = a.side; d.vx = 0; d.vy = 0; d.mv = null; d.lock = null;
      this.ev('lock', { side: a.side, x: d.x, y: d.y, kind: m.lock.anim });
    }

    lockTick(a, d) {
      const L = a.mv.lock;
      a.lock.t++;
      if (a.lock.t % L.every) return;
      a.lock.n++;
      if (a.lock.n <= L.hits) {
        const dmg = Math.min(L.dmg * a.def.power, Math.max(0, d.hp - 1));
        this.damage(a, d, dmg);
        d.combo++;
        a.stats.best = Math.max(a.stats.best, d.combo);
        a.meter = Math.min(R.meterMax, a.meter + 0.3);
        this.ev('hit', { side: a.side, x: d.x, y: d.y + 90, dmg: dmg, flurry: true, kind: L.anim });
        return;
      }
      a.lock = null;
      d.heldBy = -1;
      d.state = 'hit'; d.st = 0;
      const dir = sign(d.x - a.x) || a.dir;
      this.throwBack(d, dir, L.kb, true, true, 40);
      this.damage(a, d, L.final * a.def.power);
      d.combo++;
      a.stats.best = Math.max(a.stats.best, d.combo);
      this.freeze = 14;
      this.ev('hit', { side: a.side, x: d.x, y: d.y + 90, dmg: L.final, heavy: true, finale: true, kind: L.anim });
    }

    /** Send a fighter flying. */
    throwBack(d, dir, kb, launch, down, stun) {
      d.vx = kb[0] * dir * d.def.weight;
      const up = kb[1] > 0 ? kb[1] * Math.sqrt(d.def.weight) : 0;
      if (launch || up > 0 || d.air) {
        d.vy = Math.max(up, d.air ? 6 : 0, down ? 5 : 0);
        if (d.vy > 0) d.air = true;
        d.launched = true;
      } else if (down) {
        d.vy = 5; d.air = true;
      }
      if (down) d.kd = true;
      d.stun = stun;
    }

    breaker(f, foe) {
      f.meter -= R.breaker;
      f.inv = 26;
      f.state = f.air ? 'fall' : 'burst'; f.st = 0;
      f.kd = false; f.launched = false; f.juggle = 0; f.vx = 0;
      this.endCombo(f);
      const dir = sign(foe.x - f.x) || f.dir;
      if (Math.abs(foe.x - f.x) < 260 && foe.state !== 'ko') {
        foe.mv = null; foe.lock = null; foe.active = false; foe.hidden = false; foe.armor = false;
        foe.state = 'hit'; foe.st = 0; foe.stun = 24;
        foe.vx = dir * 9; foe.vy = 6; foe.air = true; foe.launched = false;
      }
      this.freeze = 8;
      this.ev('breaker', { side: f.side, x: f.x, y: f.y + 90 });
    }

    /* ---------------------------------------------------------- world */

    physics(f) {
      if (f.state === 'held') return;
      if (f.air || f.y > 0 || f.vy !== 0) {
        f.vy -= R.grav;
        f.y += f.vy;
        if (f.y <= 0) { f.y = 0; f.vy = 0; f.air = false; this.land(f); } else f.air = true;
      }
      f.x += f.vx;
      if (!f.air) {
        const driven = f.state === 'walk' || (f.state === 'attack' && f.mv && f.mv.vx && f.mt <= f.mv.f[0] + f.mv.f[1]);
        if (!driven) f.vx *= 0.78;
        if (Math.abs(f.vx) < 0.05) f.vx = 0;
      }
      if (f.x < 40 || f.x > W - 40) {
        if (f.state === 'hit' && Math.abs(f.vx) > 7) { f.vx = -f.vx * 0.45; this.ev('wall', { x: f.x, y: f.y + 80 }); } else f.vx = 0;
        f.x = clamp(f.x, 40, W - 40);
      }
    }

    land(f) {
      f.juggle = 0;
      f.airUsed = false;
      switch (f.state) {
        case 'jump': case 'fall':
          f.state = 'land'; f.st = 0; f.vx = 0;
          this.ev('land', { side: f.side, x: f.x });
          break;
        case 'attack':
          if (f.mv && f.mv.key === 'air') { f.mv = null; f.active = false; f.state = 'land'; f.st = 0; f.vx = 0; }
          break;
        case 'hit':
          if (f.kd || f.launched) {
            f.state = 'down'; f.st = 0; f.vx *= 0.4;
            this.ev('down', { side: f.side, x: f.x });
          } else f.stun = Math.min(f.stun, 10);
          break;
        case 'ko':
          f.vx *= 0.5;
          this.ev('down', { side: f.side, x: f.x, ko: true });
          break;
      }
    }

    push(a, b) {
      if (a.state === 'held' || b.state === 'held' || NO_HIT[a.state] === 1 && a.state !== 'intro' && a.state !== 'win'
        || NO_HIT[b.state] === 1 && b.state !== 'intro' && b.state !== 'win') return;
      const pass = f => f.state === 'attack' && f.mv && f.mv.pass && f.mt <= f.mv.f[0] + f.mv.f[1];
      const hid = a.hidden || b.hidden;
      const dx = b.x - a.x;
      if (!pass(a) && !pass(b) && !hid && Math.abs(a.y - b.y) < 110 && Math.abs(dx) < R.minGap) {
        const s = dx === 0 ? (a.dir || 1) : sign(dx);
        const over = (R.minGap - Math.abs(dx)) / 2;
        a.x -= s * over; b.x += s * over;
        if (a.x < 40) { b.x += 40 - a.x; a.x = 40; }
        if (a.x > W - 40) { b.x -= a.x - (W - 40); a.x = W - 40; }
        if (b.x < 40) { a.x += 40 - b.x; b.x = 40; }
        if (b.x > W - 40) { a.x -= b.x - (W - 40); b.x = W - 40; }
      }
      const gap = Math.abs(b.x - a.x);
      if (gap > R.maxGap) {
        const s = sign(b.x - a.x), fix = (gap - R.maxGap) / 2;
        a.x += s * fix; b.x -= s * fix;
      }
    }

    face(f, foe) {
      if ((GROUND_FREE[f.state] || f.state === 'intro') && !foe.hidden && Math.abs(foe.x - f.x) > 2) f.dir = sign(foe.x - f.x);
    }

    timers(f, control) {
      f.st++;
      if (f.inv > 0) f.inv--;
      switch (f.state) {
        case 'hit':
          if (!f.air && --f.stun <= 0) this.free(f);
          break;
        case 'block':
          if (f.bs > 0) f.bs--;
          else if (!control || !f.ctl.d) { f.state = 'idle'; f.st = 0; }
          break;
        case 'land':
          if (f.st >= 4) { f.state = 'idle'; f.st = 0; }
          break;
        case 'burst':
          if (f.st >= 10) this.free(f);
          break;
        case 'down':
          if (f.st >= R.downTicks) {
            f.state = 'getup'; f.st = 0; f.inv = R.getupTicks + 10;
            this.endCombo(f);
          }
          break;
        case 'getup':
          if (f.st >= R.getupTicks) this.free(f);
          break;
        case 'stun':
          if (f.st >= R.dizzyTicks) { this.free(f); f.sta = Math.max(f.sta, 35); }
          break;
      }
      const calm = f.state === 'idle' || f.state === 'walk' || f.state === 'jump' || f.state === 'fall' || f.state === 'land';
      if (calm) f.sta = Math.min(R.staMax, f.sta + R.staRegen);
      else if (f.state === 'block' && !f.bs) f.sta = Math.min(R.staMax, f.sta + R.blockRegen);
      if (f.buf.u > 0) f.buf.u--;
      if (f.buf.a > 0) f.buf.a--;
      if (f.buf.s > 0) f.buf.s--;
    }

    free(f) {
      f.state = f.air ? 'fall' : 'idle'; f.st = 0;
      f.kd = false; f.launched = false; f.juggle = 0; f.heldBy = -1;
      this.endCombo(f);
    }

    endCombo(f) {
      if (f.combo >= 2) this.ev('comboEnd', { side: 1 - f.side, n: f.combo, dmg: f.comboDmg });
      f.combo = 0; f.comboDmg = 0;
    }

    /* ----------------------------------------------------------- hits */

    canHit(d) {
      if (d.inv > 0 || d.hidden || NO_HIT[d.state]) return false;
      if (d.state === 'hit' && d.air && d.juggle >= R.juggleCap) return false;
      return true;
    }

    hurt(d) {
      return { x0: d.x - R.width / 2, x1: d.x + R.width / 2, y0: d.y, y1: d.y + (d.state === 'block' ? 140 : R.height) };
    }

    box(f, b) {
      const xa = f.x + f.dir * b[0], xb = f.x + f.dir * b[2];
      return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: f.y + b[1], y1: f.y + b[3] };
    }

    melee() {
      const hits = [];
      for (const a of this.f) {
        if (a.state !== 'attack' || !a.active || a.lock) continue;
        const d = this.foe(a), m = a.mv;
        const slot = m.multi ? Math.floor((a.mt - m.f[0] - 1) / m.multi) : 0;
        if (a.slot === slot || !this.canHit(d)) continue;
        if (!overlap(this.box(a, m.box), this.hurt(d))) continue;
        a.slot = slot;
        hits.push([a, d, m]);
      }
      for (const [a, d, m] of hits) this.connect(a, d, m, a.x, null);
    }

    /** One hit, from a fighter's move or a thrown thing (`p`). */
    connect(a, d, m, srcX, p) {
      const from = p ? sign(p.vx || (d.x - p.x)) : (Math.abs(d.x - srcX) < 1 ? a.dir : sign(d.x - srcX));
      const front = d.dir === -from;
      if (d.state === 'block' && front) { this.blocked(a, d, m, from, p); return 'block'; }
      const power = a.def.power;
      if (d.armor) {
        this.damage(a, d, m.dmg * power * 0.6);
        this.freeze = 4;
        this.ev('armor', { side: a.side, x: d.x, y: d.y + 90 });
        return 'armor';
      }
      const counter = d.state === 'attack' && d.mv && d.mt <= d.mv.f[0];
      const behind = !p && !front && a.air && a.state === 'attack' && a.mv && a.mv.key === 'air';
      // A hit on anybody not already reeling starts a new combo.
      if (d.state !== 'hit') { d.combo = 0; d.comboDmg = 0; }
      let dmg = m.dmg * power * Math.max(0.35, 1 - 0.08 * d.combo);
      if (counter) dmg *= 1.2;
      if (behind) dmg *= 1.35;
      const wasAir = d.air;
      d.mv = null; d.lock = null; d.chainQ = false; d.hidden = false; d.armor = false; d.active = false;
      d.state = 'hit'; d.st = 0;
      if (wasAir) d.juggle++;
      this.throwBack(d, from, m.kb, m.launch || behind, m.down, m.stun + (counter ? 6 : 0));
      if (behind) d.vy = Math.max(d.vy, 9);
      this.damage(a, d, dmg);
      d.combo++;
      a.stats.best = Math.max(a.stats.best, d.combo);
      a.meter = Math.min(R.meterMax, a.meter + dmg * 1.1);
      d.meter = Math.min(R.meterMax, d.meter + dmg * 0.7);
      if (d.x <= 42 || d.x >= W - 42) a.vx = -from * 3;
      this.freeze = Math.max(this.freeze, Math.min(12, Math.round((p ? 2 : 3) + dmg * 0.7)));
      this.ev('hit', {
        side: a.side, x: p ? p.x : d.x - from * 10, y: p ? p.y : clamp(d.y + 100, d.y + 40, d.y + 140),
        dmg: dmg, heavy: dmg >= 7 || !!m.down || !!m.launch, counter: counter, behind: behind, kind: p ? p.kind : m.anim
      });
      if (m.lock && d.hp > 0 && d.state === 'hit') this.startLock(a, d, a.def.moves.ult);
      return 'hit';
    }

    blocked(a, d, m, from, p) {
      const chip = Math.min(m.dmg * a.def.power * 0.1, Math.max(0, d.hp - 1));
      d.hp -= chip;
      d.sta -= Math.max(6, m.dmg * 2.4);
      d.bs = Math.round(m.stun * 0.6) + 2;
      d.vx = from * Math.max(2, m.kb[0] * 0.7);
      if (!p && Math.abs(a.x - d.x) < 130) a.vx = -from * 2;
      a.meter = Math.min(R.meterMax, a.meter + 1.5);
      d.meter = Math.min(R.meterMax, d.meter + 2.5);
      d.stats.blocks++;
      this.freeze = Math.max(this.freeze, 3);
      this.ev('block', { side: d.side, x: d.x + d.dir * 22, y: d.y + 100 });
      if (d.sta <= 0) {
        d.sta = 0; d.bs = 0;
        d.state = 'stun'; d.st = 0;
        this.freeze = 10;
        this.ev('guardbreak', { side: d.side, x: d.x, y: d.y + 120 });
      }
    }

    damage(a, d, dmg) {
      if (dmg <= 0) return;
      if (this.mode === 'train') dmg = Math.min(dmg, Math.max(0, d.hp - 1));
      d.hp = Math.max(0, d.hp - dmg);
      d.comboDmg += dmg;
      a.stats.dmg += dmg;
      a.stats.hits++;
      this.rescore();
      if (d.hp <= 0 && d.state !== 'ko') this.ko(d, a);
    }

    ko(d, a) {
      d.state = 'ko'; d.st = 0;
      d.mv = null; d.lock = null; d.heldBy = -1; d.active = false; d.hidden = false;
      const dir = sign(d.x - a.x) || a.dir;
      d.vx = dir * 6; d.vy = Math.max(d.vy, 9); d.air = true;
      if (a.lock) a.lock = null;
      if (this.phase === 'fight') {
        this.phase = 'ko';
        this.pt = 0;
        this.koBy = a.side;
        this.freeze = 0;
        this.cine = null;
        this.ev('ko', { side: a.side, x: d.x, y: d.y + 90 });
      }
    }

    projTick() {
      const out = [];
      for (const p of this.proj) {
        p.t++;
        if (p.boom) {
          p.vx -= p.dir * p.boom;
          if (p.leg === 0 && sign(p.vx) !== p.dir) p.leg = 1;
        }
        p.vy -= p.grav;
        p.x += p.vx; p.y += p.vy;
        if (p.bounce && p.y < 18) { p.y = 18; p.vy = Math.abs(p.vy) * 0.55 + 2.5; }
        let dead = --p.life <= 0 || p.x < -80 || p.x > W + 80 || p.y < -30;
        const owner = this.f[p.owner];
        if (p.boom && p.leg === 1 && Math.abs(owner.x - p.x) < 40 && Math.abs(owner.y + 100 - p.y) < 90) dead = true;
        if (!dead) {
          const d = this.foe(owner);
          const live = !p.sky || (p.t >= 3 && p.t <= 14);
          if (live && p.hitLeg !== p.leg && this.canHit(d) && overlap(pbox(p), this.hurt(d))) {
            p.hitLeg = p.leg;
            this.connect(owner, d, p, p.x, p);
            if (!p.boom && !p.sky) dead = true;
          }
        }
        if (dead) { if (p.life > 0) this.ev('fizzle', { x: p.x, y: p.y, kind: p.kind }); } else out.push(p);
      }
      // Two thrown things meet: both go, unless one is an ultimate's.
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const p = out[i], q = out[j];
          if (p.owner === q.owner || p.dead || q.dead || p.sky || q.sky) continue;
          if (!overlap(pbox(p), pbox(q))) continue;
          if (!p.ult) p.dead = true;
          if (!q.ult) q.dead = true;
          this.ev('clash', { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        }
      }
      this.proj = out.filter(p => !p.dead);
    }

    /* --------------------------------------------------------- rounds */

    endRound() {
      const [a, b] = this.f;
      let w = -1;
      if (a.hp <= 0 && b.hp <= 0) w = -1;
      else if (b.hp <= 0) w = 0;
      else if (a.hp <= 0) w = 1;
      else {
        const ha = a.hp / a.hpMax, hb = b.hp / b.hpMax;
        w = ha > hb + 1e-9 ? 0 : hb > ha + 1e-9 ? 1 : -1;
      }
      this.roundWinner = w;
      let perfect = false;
      if (w >= 0) {
        this.wins[w]++;
        if (this.koBy === w) this.kos[w]++;
        if (this.f[w].hp >= this.f[w].hpMax) { this.perfects[w]++; perfect = true; }
      }
      this.rescore();
      this.phase = 'roundEnd';
      this.pt = 0;
      this.ev('roundEnd', { w: w, perfect: perfect, time: this.koBy < 0 });
    }

    nextRound() {
      const [a, b] = this.wins;
      if (a >= this.need || b >= this.need || this.round >= this.maxRounds) {
        const [fa, fb] = this.f;
        this.winner = a > b ? 0 : b > a ? 1 : (fa.stats.dmg > fb.stats.dmg ? 0 : fb.stats.dmg > fa.stats.dmg ? 1 : -1);
        this.rescore();
        this.phase = 'matchEnd';
        this.pt = 0;
        this.ev('matchEnd', { w: this.winner });
        return;
      }
      this.startRound();
    }

    /** The first player's score, for records and races. */
    rescore() {
      const me = this.f[0];
      const won = this.winner === 0;
      this.score = Math.round(me.stats.dmg * 10 + this.wins[0] * 1000 + this.perfects[0] * 1500
        + me.stats.best * 100 + (won ? 2000 : 0));
    }

    /** 'win' | 'loss' | 'draw' for the first player. */
    myResult() { return this.winner === 0 ? 'win' : this.winner === 1 ? 'loss' : 'draw'; }
  };

  function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
  function pbox(p) {
    if (p.sky) return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: 0, y1: p.h };
    return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 };
  }

  PV.StickGame.MODES = MODES;
  PV.StickGame.DUMMY = DUMMY;
  PV.StickGame.overlap = overlap;

})(window.PV);
