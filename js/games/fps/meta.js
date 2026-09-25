/* 突击小队 / Strike Squad — what you keep between matches.

   The reference's whole outer game: coins earned in battle, a rank that
   goes up with experience and unlocks things, guns bought and upgraded,
   attachments, camos and keychains, clothes that change your numbers,
   skills, daily and weekly missions, and the crates for kills and wins.
   All of it is one record, `fps.meta`, sealed like the profile (store.js)
   and REBUILT on every read by the validator below: an id that is not in
   the catalogue is dropped, a level past the top is clamped, and a gun
   that is not owned cannot be carried or fitted.

   Nothing here draws anything. The lobby calls these functions and shows
   what they return; the tests call them without a page. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.FpsData, S = PV.Safe;
  const KEY = 'fps.meta';
  const MAX_COINS = 1e9;
  const START = ['striker', 'p9', 'knife'];

  function fresh() {
    return {
      coins: 250, xp: 0,
      weapons: START.slice(),
      up: {}, fit: {}, look: {},
      atts: [], camos: ['none'], charms: ['none'],
      gear: [], wear: { head: 'cap', body: 'tee', hands: 'bare', feet: 'sneakers' },
      skills: ['medkit'],
      kit: { primary: 'striker', secondary: 'p9', melee: 'knife', skills: ['medkit'] },
      life: { kills: 0, wins: 0, matches: 0 },
      crates: { killer: 0, winner: 0 },
      day: '', dp: {}, dc: [], week: '', wp: {}, wc: []
    };
  }

  /* ---- the validator: rebuild, never adopt ---- */

  const list = (v, ok, max) => (Array.isArray(v) ? v : []).filter((x, i, a) => typeof x === 'string' && ok(x) && a.indexOf(x) === i).slice(0, max || 200);
  const isAtt = k => { const p = String(k).split(':'); return D.ATTACH[p[0]] && D.ATTACH[p[0]].some(a => a.id === p[1] && a.price > 0); };
  const isGear = k => { const p = String(k).split(':'); return D.GEAR[p[0]] && D.GEAR[p[0]].some(g => g.id === p[1] && g.price > 0); };

  function clean(v) {
    const m = S.obj(v);
    if (!m) return undefined;
    const out = fresh();
    out.coins = S.int(m.coins, 0, MAX_COINS, 0);
    out.xp = S.int(m.xp, 0, 1e9, 0);
    out.weapons = START.concat(list(m.weapons, id => !!D.W[id] && START.indexOf(id) < 0, 60));
    out.atts = list(m.atts, isAtt, 60);
    out.camos = ['none'].concat(list(m.camos, id => id !== 'none' && D.CAMOS.some(c => c.id === id), 40));
    out.charms = ['none'].concat(list(m.charms, id => id !== 'none' && D.CHARMS.some(c => c.id === id), 40));
    out.gear = list(m.gear, isGear, 40);
    out.skills = ['medkit'].concat(list(m.skills, id => id !== 'medkit' && !!D.skill(id), 10));
    const up = S.obj(m.up) || {}, fit = S.obj(m.fit) || {}, look = S.obj(m.look) || {};
    for (const id of out.weapons) {
      const u = S.obj(S.own(up, id) ? up[id] : null);
      if (u) {
        const r = {};
        for (const k of D.TRACKS) r[k] = S.int(u[k], 0, D.UP_MAX, 0);
        out.up[id] = r;
      }
      const f = S.obj(S.own(fit, id) ? fit[id] : null);
      if (f) {
        const r = {};
        for (const slot of D.ASLOTS) {
          const a = typeof f[slot] === 'string' ? f[slot] : '';
          if (a && D.fits(id, slot, a) && (out.atts.indexOf(slot + ':' + a) >= 0)) r[slot] = a;
        }
        out.fit[id] = r;
      }
      const l = S.obj(S.own(look, id) ? look[id] : null);
      if (l) {
        out.look[id] = {
          camo: out.camos.indexOf(l.camo) >= 0 ? l.camo : 'none',
          charm: out.charms.indexOf(l.charm) >= 0 ? l.charm : 'none'
        };
      }
    }
    const wear = S.obj(m.wear) || {};
    for (const slot of D.GEAR_SLOTS) {
      const id = typeof wear[slot] === 'string' ? wear[slot] : '';
      const def = D.GEAR[slot][0].id;
      out.wear[slot] = id === def || out.gear.indexOf(slot + ':' + id) >= 0 ? id : def;
    }
    const kit = S.obj(m.kit) || {};
    const pick = (id, slot, def) => (typeof id === 'string' && out.weapons.indexOf(id) >= 0 && D.W[id].slot === slot ? id : def);
    out.kit.primary = pick(kit.primary, 0, 'striker');
    out.kit.secondary = pick(kit.secondary, 1, 'p9');
    out.kit.melee = pick(kit.melee, 2, 'knife');
    out.kit.skills = list(kit.skills, id => out.skills.indexOf(id) >= 0, 3);
    const life = S.obj(m.life) || {};
    out.life = { kills: S.int(life.kills, 0, 1e8, 0), wins: S.int(life.wins, 0, 1e7, 0), matches: S.int(life.matches, 0, 1e7, 0) };
    const cr = S.obj(m.crates) || {};
    out.crates = {
      killer: Math.min(S.int(cr.killer, 0, 1e7, 0), Math.floor(out.life.kills / D.CRATES.killer.every)),
      winner: Math.min(S.int(cr.winner, 0, 1e7, 0), Math.floor(out.life.wins / D.CRATES.winner.every))
    };
    const progress = p => {
      const o = S.obj(p) || {}, r = {};
      for (const mi of D.MISSIONS) if (S.own(o, mi.stat)) r[mi.stat] = S.int(o[mi.stat], 0, 1e8, 0);
      return r;
    };
    out.day = /^d:\d{4}-\d{2}-\d{2}$/.test(m.day) ? m.day : '';
    out.week = /^w:\d{4}-\d{2}$/.test(m.week) ? m.week : '';
    out.dp = progress(m.dp); out.wp = progress(m.wp);
    const mid = id => D.MISSIONS.some(mi => mi.id === id);
    out.dc = list(m.dc, mid, 3); out.wc = list(m.wc, mid, 3);
    return out;
  }
  PV.Store.validate(KEY, clean);

  function load() { return PV.Store.get(KEY, null) || fresh(); }
  function save(m) { PV.Store.set(KEY, m); return m; }

  /* ---- what the engine is handed ---- */

  /** The match loadout: the kit, with each gun's upgrades, fittings and look. */
  function loadout(m) {
    const entry = id => ({
      id: id,
      own: { up: m.up[id] || {}, att: m.fit[id] || {} },
      camo: (m.look[id] && m.look[id].camo) || 'none',
      charm: (m.look[id] && m.look[id].charm) || 'none'
    });
    return {
      primary: entry(m.kit.primary), secondary: entry(m.kit.secondary), melee: entry(m.kit.melee),
      skills: m.kit.skills.slice(), gear: Object.assign({}, m.wear)
    };
  }

  /** A race: stock guns, no clothes, no skills bought — everybody equal. */
  function raceKit(m) {
    const lo = loadout(m);
    for (const k of ['primary', 'secondary', 'melee']) { lo[k].own = { up: {}, att: {} }; }
    lo.gear = {};
    lo.skills = ['medkit'];
    return lo;
  }

  const rank = m => D.rankOf(m.xp);
  const unlocked = (m, lvl) => rank(m).level >= (lvl || 1);

  /* ---- the shop ---- */

  function spend(m, cost) {
    if (!(cost >= 0) || m.coins < cost) return false;
    m.coins -= cost;
    return true;
  }

  const shop = {
    buyWeapon(m, id) {
      const w = D.W[id];
      if (!w || m.weapons.indexOf(id) >= 0 || !unlocked(m, w.lvl) || !spend(m, w.price)) return false;
      m.weapons.push(id);
      return true;
    },
    equip(m, id) {
      const w = D.W[id];
      if (!w || m.weapons.indexOf(id) < 0) return false;
      m.kit[['primary', 'secondary', 'melee'][w.slot]] = id;
      return true;
    },
    upgrade(m, id, track) {
      if (m.weapons.indexOf(id) < 0 || D.TRACKS.indexOf(track) < 0) return false;
      const u = m.up[id] || (m.up[id] = { dmg: 0, acc: 0, rel: 0, mag: 0 });
      const lv = u[track] | 0;
      if (lv >= D.UP_MAX || !spend(m, D.upgradeCost(id, track, lv))) return false;
      u[track] = lv + 1;
      return true;
    },
    buyAtt(m, slot, aid) {
      const a = (D.ATTACH[slot] || []).find(x => x.id === aid);
      const k = slot + ':' + aid;
      if (!a || !a.price || m.atts.indexOf(k) >= 0 || !unlocked(m, a.lvl) || !spend(m, a.price)) return false;
      m.atts.push(k);
      return true;
    },
    /** Fit an attachment to a gun, or the slot's default to take it off. */
    fit(m, id, slot, aid) {
      if (m.weapons.indexOf(id) < 0 || !D.ATTACH[slot]) return false;
      const def = D.ATTACH[slot][0].id;
      const f = m.fit[id] || (m.fit[id] = {});
      if (aid === def) { delete f[slot]; return true; }
      if (m.atts.indexOf(slot + ':' + aid) < 0 || !D.fits(id, slot, aid)) return false;
      f[slot] = aid;
      return true;
    },
    buyCamo(m, cid) {
      const c = D.CAMOS.find(x => x.id === cid);
      if (!c || !c.price || m.camos.indexOf(cid) >= 0 || !unlocked(m, c.lvl) || !spend(m, c.price)) return false;
      m.camos.push(cid);
      return true;
    },
    buyCharm(m, cid) {
      const c = D.CHARMS.find(x => x.id === cid);
      if (!c || !c.price || m.charms.indexOf(cid) >= 0 || !unlocked(m, c.lvl) || !spend(m, c.price)) return false;
      m.charms.push(cid);
      return true;
    },
    dress(m, id, what, val) {
      if (m.weapons.indexOf(id) < 0) return false;
      const l = m.look[id] || (m.look[id] = { camo: 'none', charm: 'none' });
      if (what === 'camo' && m.camos.indexOf(val) >= 0) { l.camo = val; return true; }
      if (what === 'charm' && m.charms.indexOf(val) >= 0) { l.charm = val; return true; }
      return false;
    },
    buyGear(m, slot, gid) {
      const g = (D.GEAR[slot] || []).find(x => x.id === gid);
      const k = slot + ':' + gid;
      if (!g || !g.price || m.gear.indexOf(k) >= 0 || !unlocked(m, g.lvl) || !spend(m, g.price)) return false;
      m.gear.push(k);
      return true;
    },
    wear(m, slot, gid) {
      if (!D.GEAR[slot]) return false;
      if (gid !== D.GEAR[slot][0].id && m.gear.indexOf(slot + ':' + gid) < 0) return false;
      m.wear[slot] = gid;
      return true;
    },
    buySkill(m, sid) {
      const s = D.skill(sid);
      if (!s || !s.price || m.skills.indexOf(sid) >= 0 || !unlocked(m, s.lvl) || !spend(m, s.price)) return false;
      m.skills.push(sid);
      return true;
    },
    /** Put a skill in the kit or take it out; three at most. */
    toggleSkill(m, sid) {
      if (m.skills.indexOf(sid) < 0) return false;
      const i = m.kit.skills.indexOf(sid);
      if (i >= 0) { m.kit.skills.splice(i, 1); return true; }
      if (m.kit.skills.length >= 3) return false;
      m.kit.skills.push(sid);
      return true;
    }
  };

  /* ---- after a match ---- */

  /** What a match is worth, from the player's line on the scoreboard. */
  function rewards(game, racing) {
    const s = game.me.stats, r = game.result;
    const coins = racing ? 0 : Math.round(10 * s.k + 5 * s.hs + 4 * s.a + 15 * s.caps + 30 * s.flags + 10 * s.returns
      + 20 * s.plants + 25 * s.defuses + (r === 'win' ? 120 : r === 'draw' ? 70 : 40));
    const xp = racing ? 0 : Math.round(s.score + (r === 'win' ? 400 : r === 'draw' ? 250 : 150));
    return { coins: coins, xp: xp };
  }

  /** The numbers the missions count, from one match. */
  function statsOf(game) {
    const s = game.me.stats, kc = s.kc || {};
    return {
      kills: s.k, hs: s.hs, wins: game.result === 'win' ? 1 : 0, matches: 1,
      k_ar: kc.ar || 0, k_smg: kc.smg || 0, k_sniper: kc.sniper || 0, k_shotgun: kc.shotgun || 0,
      k_lmg: kc.lmg || 0, k_pistol: kc.pistol || 0, k_melee: s.melee, k_nade: s.nade,
      caps: s.caps, flags: s.flags, plants: s.plants + s.defuses, dmg: Math.round(s.dmg), streak: s.best
    };
  }

  /** Today's and this week's missions, rolling over when the date has. */
  function missions(m, now) {
    const d = now || new Date();
    const dk = D.dayKey(d), wk = D.weekKey(d);
    if (m.day !== dk) { m.day = dk; m.dp = {}; m.dc = []; }
    if (m.week !== wk) { m.week = wk; m.wp = {}; m.wc = []; }
    const view = (key, prog, claimed, weekly) => D.pickMissions(key, weekly).map(x => {
      const have = Math.min(x.n, prog[x.stat] || 0);
      return Object.assign(x, { have: have, done: have >= x.n, claimed: claimed.indexOf(x.id) >= 0, weekly: weekly });
    });
    return { daily: view(dk, m.dp, m.dc, false), weekly: view(wk, m.wp, m.wc, true) };
  }

  /** Bank a match: coins, rank, lifetime counts and mission progress. */
  function bank(m, game, racing, now) {
    const r = rewards(game, racing);
    const before = rank(m).level;
    m.coins = Math.min(MAX_COINS, m.coins + r.coins);
    m.xp = Math.min(1e9, m.xp + r.xp);
    const after = rank(m).level;
    if (!racing) {
      const st = statsOf(game);
      m.life.kills += st.kills; m.life.wins += st.wins; m.life.matches += 1;
      missions(m, now);
      for (const which of ['dp', 'wp']) {
        const p = m[which];
        for (const k in st) {
          const mi = D.MISSIONS.find(x => x.stat === k);
          if (!mi) continue;
          p[k] = mi.best ? Math.max(p[k] || 0, st[k]) : (p[k] || 0) + st[k];
        }
      }
    }
    save(m);
    return { coins: r.coins, xp: r.xp, rankUp: after > before ? after : 0 };
  }

  function claim(m, id, weekly, now) {
    const all = missions(m, now);
    const x = (weekly ? all.weekly : all.daily).find(q => q.id === id);
    if (!x || !x.done || x.claimed) return 0;
    (weekly ? m.wc : m.dc).push(id);
    m.coins = Math.min(MAX_COINS, m.coins + x.reward);
    save(m);
    return x.reward;
  }

  /* ---- crates ---- */

  function crates(m) {
    return {
      killer: Math.max(0, Math.floor(m.life.kills / D.CRATES.killer.every) - m.crates.killer),
      winner: Math.max(0, Math.floor(m.life.wins / D.CRATES.winner.every) - m.crates.winner),
      killerAt: m.life.kills % D.CRATES.killer.every, winnerAt: m.life.wins % D.CRATES.winner.every
    };
  }

  /** Open one: a camo or a charm you do not have yet (the cheaper ones
      more often), or coins when you have them all. `rnd` is a 0..1 source. */
  function openCrate(m, kind, rnd) {
    const r = rnd || Math.random;
    if (crates(m)[kind] <= 0) return null;
    m.crates[kind]++;
    const pool = [];
    for (const c of D.CAMOS) if (c.price && m.camos.indexOf(c.id) < 0) pool.push({ kind: 'camo', id: c.id, w: 3000 / c.price });
    for (const c of D.CHARMS) if (c.price && m.charms.indexOf(c.id) < 0) pool.push({ kind: 'charm', id: c.id, w: 1200 / c.price });
    let prize;
    if (pool.length && r() < (kind === 'winner' ? 0.8 : 0.6)) {
      let tot = pool.reduce((s, p) => s + p.w, 0), x = r() * tot;
      prize = pool.find(p => (x -= p.w) <= 0) || pool[pool.length - 1];
      (prize.kind === 'camo' ? m.camos : m.charms).push(prize.id);
    } else {
      const n = kind === 'winner' ? 400 : 200;
      prize = { kind: 'coins', n: n };
      m.coins = Math.min(MAX_COINS, m.coins + n);
    }
    save(m);
    return prize;
  }

  PV.FpsMeta = {
    KEY: KEY, fresh: fresh, clean: clean, load: load, save: save,
    loadout: loadout, raceKit: raceKit, rank: rank, unlocked: unlocked,
    shop: shop, rewards: rewards, statsOf: statsOf, missions: missions, bank: bank, claim: claim,
    crates: crates, openCrate: openCrate
  };

})(window.PV);
