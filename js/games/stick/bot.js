/* 火柴人对决 / Stick Clash — the computer.

   A bot drives its fighter through the same controls a player has: it
   holds left, right and down and presses jump, attack and special, and the
   engine runs those exactly as it runs a keyboard. It never moves a
   fighter, never reads the future, and every choice comes out of the
   game's own RNG, so a fight against it replays from its seed.

   What a level buys is what a better player has:

   - REACTION. A new threat is noticed after a delay — 23 ticks on easy,
     5 on expert — and a jab that starts in 4 ticks gets through a slow
     guard. A decision about each attack is taken once, when it is seen,
     not re-rolled every tick until the dice come up "block".
   - TIMING. A combo is continued inside its window, early in it at the
     top level; a weak bot sometimes presses early and drops the chain,
     exactly as a person does.
   - JUDGEMENT. Punishing a whiffed attack, uppercutting a jump-in,
     jumping a thrown thing, breaking out of a long combo, and backing off
     to get stamina back. The stronger the bot, the more often it does
     the right one.

   The tournament raises the level fight by fight, which is the
   reference's "opponents become smarter and more aggressive". */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const sign = v => (v < 0 ? -1 : 1);
  const FREE = { idle: 1, walk: 1, block: 1, land: 1, jump: 1, fall: 1 };

  function create(level) {
    const L = clamp(+level || 0, 0, 1);
    const P = {
      react: Math.round(23 - 18 * L),
      block: 0.1 + 0.78 * L,
      combo: 0.3 + 0.7 * L,
      sloppy: 0.35 * (1 - L),
      punish: 0.1 + 0.8 * L,
      anti: 0.05 + 0.65 * L,
      dodge: 0.1 + 0.8 * L,
      breaker: 0.08 + 0.8 * L,
      aggro: 0.3 + 0.45 * L,
      special: 0.12 + 0.2 * L,
      jumpIn: 0.06 + 0.1 * L,
      ult: 0.35 + 0.65 * L
    };
    const mem = {
      plan: 'wait', wait: 10, seen: -1, seenAt: 0, willBlock: false, blockFor: 0,
      chainFor: -1, chainGo: false, chainAt: 0, projSeen: -1, projAct: 'none',
      punishFor: -1, antiFor: -1, brkCombo: -1, brk: false
    };

    function think(g, me, foe) {
      const rng = g.rng, c = me.ctl;
      c.l = c.r = c.d = false;
      const dx = foe.x - me.x, dist = Math.abs(dx), toward = sign(dx);
      const hold = dir => { if (dir > 0) c.r = true; else c.l = true; };
      const reach = me.def.moves.j1.reach;

      // Reeling: burst out of a long combo if the meter allows.
      if (me.state === 'hit') {
        if (me.meter >= 50 && me.combo >= 3 && me.heldBy < 0) {
          if (mem.brkCombo < 0) { mem.brkCombo = 1; mem.brk = rng.chance(P.breaker); }
          if (mem.brk) me.buf.s = 1;
        }
        return;
      }
      mem.brkCombo = -1;

      // Mid-move: carry the chain on, on time or not quite.
      if (me.state === 'attack') {
        const m = me.mv;
        if (m && m.chain && !me.chainQ && !me.early) {
          if (mem.chainFor !== me.mseq) {
            mem.chainFor = me.mseq;
            const worth = foe.state === 'hit' || foe.state === 'block' || dist < reach + 30;
            mem.chainGo = worth && rng.chance(P.combo);
            const span = m.win[1] - m.win[0];
            mem.chainAt = m.win[0] + Math.round(rng.next() * span * (1 - L) * 0.8);
            if (rng.chance(P.sloppy)) mem.chainAt = m.win[0] - 2;
          }
          if (mem.chainGo && me.mt >= mem.chainAt) me.buf.a = 1;
        }
        return;
      }

      if (!FREE[me.state]) return;

      // In the air: a jump-in kick when it will land.
      if (me.air) {
        if (!me.airUsed && dist < 100 && foe.y < me.y + 40 && me.vy < 4) me.buf.a = 1;
        return;
      }

      // An attack coming: decide once, then guard (if we saw it in time).
      const fm = foe.mv;
      const threat = foe.state === 'attack' && fm && (fm.box || fm.tele) && foe.mt <= fm.f[0] + fm.f[1]
        && dist < (fm.reach || 100) + 60;
      if (threat && foe.mseq !== mem.seen) {
        mem.seen = foe.mseq; mem.seenAt = g.tick;
        mem.willBlock = rng.chance(P.block * (fm.cine ? 0.8 : 1));
      }
      if (threat && mem.willBlock && g.tick - mem.seenAt >= P.react * 0.5) {
        c.d = true; mem.blockFor = 6 + (fm.multi ? 12 : 0);
        return;
      }
      if (mem.blockFor > 0) { mem.blockFor--; c.d = true; return; }

      // Something thrown at us: jump it or guard it.
      let near = null;
      for (const p of g.proj) {
        if (p.owner === me.side || p.sky) continue;
        const gap = me.x - p.x;
        if (sign(gap) === sign(p.vx) && Math.abs(gap) < 280) { near = p; break; }
      }
      if (near) {
        if (near.id !== mem.projSeen) {
          mem.projSeen = near.id;
          mem.projAct = rng.chance(P.dodge) ? (rng.chance(0.55) ? 'jump' : 'block') : 'none';
        }
        const gap = Math.abs(me.x - near.x);
        if (mem.projAct === 'jump' && gap < 170 && gap > 60) { hold(toward); me.buf.u = 1; return; }
        if (mem.projAct === 'block' && gap < 200) { c.d = true; return; }
      }

      // They whiffed and are stuck recovering: hit them.
      if (foe.state === 'attack' && fm && foe.mt > fm.f[0] + fm.f[1] && !foe.chainQ && dist < reach + 20) {
        if (mem.punishFor !== foe.mseq) {
          mem.punishFor = foe.mseq;
          if (rng.chance(P.punish)) { me.buf.a = 1; return; }
        }
      }

      // They are jumping in: uppercut.
      if (foe.air && (foe.state === 'jump' || foe.state === 'attack') && dist < 150 && foe.y > 30) {
        const key = foe.side * 100000 + Math.floor(g.tick / 40);
        if (mem.antiFor !== key && Math.abs(foe.vx) > 0.5 && sign(foe.vx) === -toward) {
          mem.antiFor = key;
          if (rng.chance(P.anti)) { c.d = true; me.buf.a = 1; return; }
        }
      }

      // Dizzy or open: go in.
      const open = foe.state === 'stun';
      const ultReach = me.def.moves.ult.reach;
      if (me.meter >= 100 && (open || foe.state === 'idle' || foe.state === 'walk') && dist < Math.min(ultReach, 600)
        && rng.chance(P.ult * 0.08)) { c.d = true; me.buf.s = 1; return; }

      // Neutral: pick a plan every so often.
      if (--mem.wait <= 0 || open) {
        mem.wait = Math.round(P.react * (0.6 + rng.next() * 0.9)) + 4;
        mem.plan = choose(g, me, foe, dist, reach, open);
      }

      switch (mem.plan) {
        case 'approach':
          hold(toward);
          if (dist < reach - 10) mem.plan = 'wait';
          break;
        case 'retreat':
          if ((toward > 0 && me.x > 90) || (toward < 0 && me.x < PV.StickData.ARENA - 90)) hold(-toward);
          break;
        case 'attack':
          if (dist <= reach + 6) { me.buf.a = 1; mem.plan = 'wait'; } else hold(toward);
          break;
        case 'upper':
          if (dist <= reach) { c.d = true; me.buf.a = 1; mem.plan = 'wait'; } else hold(toward);
          break;
        case 'throw':
          me.buf.s = 1; mem.plan = 'wait';
          break;
        case 'rush':
          hold(toward); me.buf.s = 1; mem.plan = 'wait';
          break;
        case 'backsp':
          hold(-toward); me.buf.s = 1; mem.plan = 'wait';
          break;
        case 'jump':
          hold(toward); me.buf.u = 1; mem.plan = 'wait';
          break;
        case 'guard':
          c.d = true;
          break;
        default:
          break;
      }
    }

    function choose(g, me, foe, dist, reach, open) {
      const rng = g.rng;
      const sp = me.def.moves.sp, fwd = me.def.moves.fwd, back = me.def.moves.back;
      if (foe.state === 'down' || foe.state === 'getup') return dist < 140 ? 'wait' : 'approach';
      if (open) return dist <= reach ? 'attack' : 'approach';
      if (me.sta < 22 && dist < 400) return rng.chance(0.7) ? 'retreat' : 'guard';
      const r = rng.next();
      if (dist > reach + 60) {
        if (sp.proj && g.canThrow(me) && me.sta >= sp.cost + 10 && dist > 300 && r < P.special) return 'throw';
        if (me.sta >= fwd.cost + 10 && dist < fwd.reach + 40 && dist > 120 && r < P.special * 1.6) return 'rush';
        if (r < P.special + P.jumpIn && dist < 330) return 'jump';
        return rng.chance(P.aggro + 0.25) ? 'approach' : 'wait';
      }
      if (r < P.aggro) return rng.chance(0.2) ? 'upper' : 'attack';
      if (r < P.aggro + 0.08 && me.sta >= back.cost + 10) return 'backsp';
      if (r < P.aggro + 0.25) return 'guard';
      if (r < P.aggro + 0.35) return 'retreat';
      return 'wait';
    }

    return { level: L, think: think };
  }

  PV.StickBot = { create: create };

})(window.PV);
