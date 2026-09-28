/* 火柴人对决 / Stick Clash — the catalogue.

   Everything a fight is made of, as data: the eight fighters, their moves,
   the six stages, the tournament ladder and the bot levels. The engine
   reads it, the view draws it, the tests walk it; nothing here runs.

   A MOVE is timed in ticks at 60 Hz: `f: [startup, active, recovery]`.
   Its hitbox `box: [x0, y0, x1, y1]` is in world units, x forward from the
   fighter's centre (so it turns with them), y up from their feet. A fighter
   is about 160 tall and 44 wide; the arena is 1400 across.

   - `dmg` and `stun` are what a clean hit does; `kb: [forward, up]` is the
     push. Any upward push, or `launch`, puts the target in the air.
   - `chain` names the move a timed press of Attack continues into, inside
     `win: [from, to]`. A press BEFORE the window drops the combo — that is
     the whole of "press at the right moment", and why mashing loses.
   - `multi: n` hits again every n ticks while active; `down` knocks down.
   - `vx`/`vy` move the fighter during the active frames (a rush, a leap);
     `pass` lets a rush go through the other fighter; `inv: [a, b]` are
     ticks it cannot be hit; `armor` takes hits without flinching.
   - `proj` throws something at tick `at`; `tele` jumps somewhere at `at`.
   - An ultimate has `cine` (the screen holds for its wind-up) and `lock`:
     once it connects, the target is held for a flurry and a finale. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const HZ = 60;
  const ARENA = 1400;

  /* The shared numbers. */
  const RULES = {
    walk: 4.2, back: 0.78, airVx: 4.6, jumpV: 15.5, grav: 0.85,
    width: 44, height: 150, minGap: 46, maxGap: 820,
    staMax: 100, staRegen: 0.42, blockRegen: 0.18, meterMax: 100,
    breaker: 50, buffer: 8, juggleCap: 7, roundTicks: 60 * HZ,
    downTicks: 44, getupTicks: 18, dizzyTicks: 70
  };

  function M(o) {
    return Object.assign({
      f: [5, 3, 13], dmg: 4, stun: 16, kb: [2.2, 0], box: [8, 92, 70, 126],
      cost: 5, anim: 'jab'
    }, o);
  }

  /* The things a fighter can throw. `w`/`h` is the hitbox, centred. */
  const PROJ = {
    ki: { w: 34, h: 30, life: 110 },
    wave: { w: 34, h: 70, life: 90 },
    scythe: { w: 54, h: 54, life: 96, boom: 0.34 },
    quake: { w: 60, h: 44, life: 90, ground: true },
    star: { w: 18, h: 18, life: 80 },
    orb: { w: 48, h: 48, life: 170 },
    spear: { w: 70, h: 14, life: 90 },
    fire: { w: 36, h: 36, life: 110, bounce: true },
    bolt: { w: 70, h: 400, life: 26, sky: true }
  };

  /* ---- the eight ---- */

  const FIGHTERS = {
    ink: {
      name: 'Ink', nameZh: '墨', title: 'The Brawler', titleZh: '拳脚客',
      color: '#EEF1F6', alt: '#6F7A8C', glow: '#9CC3FF', weapon: 'fists', hat: 'band',
      hp: 108, speed: 1, jump: 1, power: 1.1, weight: 1, price: 0,
      stats: [3, 3, 3, 1],
      moves: {
        j1: M({ f: [4, 3, 13], dmg: 3.9, box: [8, 98, 66, 124], chain: 'j2', win: [7, 19] }),
        j2: M({ f: [4, 3, 14], dmg: 4.4, box: [8, 96, 70, 124], anim: 'cross', chain: 'j3', win: [7, 20] }),
        j3: M({ f: [6, 3, 15], dmg: 5, stun: 18, box: [10, 55, 80, 100], anim: 'kick', chain: 'j4', win: [9, 22] }),
        j4: M({ f: [8, 4, 20], dmg: 7.5, stun: 26, kb: [7, 5], box: [5, 95, 84, 145], anim: 'round', cost: 6 }),
        up: M({ f: [5, 4, 20], dmg: 6, stun: 30, kb: [1.5, 13], launch: true, box: [0, 90, 56, 168], anim: 'upper', cost: 8 }),
        air: M({ f: [4, 9, 8], dmg: 5, stun: 18, kb: [3, 2], box: [6, 10, 62, 70], anim: 'airkick' }),
        sp: M({ f: [10, 2, 18], dmg: 0, anim: 'cast', cost: 22, box: null, proj: { at: 10, kind: 'ki', vx: 9, y: 108, dmg: 7, stun: 20, kb: [4, 3] } }),
        fwd: M({ f: [6, 12, 16], dmg: 8, stun: 26, kb: [6, 7], down: true, vx: 11, box: [5, 70, 56, 126], anim: 'knee', cost: 22 }),
        back: M({ f: [4, 15, 16], dmg: 3, stun: 22, kb: [2, 7], multi: 5, vx: 2.5, vy: 11, inv: [1, 7], box: [-42, 50, 62, 150], anim: 'spin', cost: 20 }),
        ult: M({ f: [36, 14, 24], dmg: 3, stun: 60, kb: [2, 0], cine: true, vx: 12, box: [5, 70, 70, 140], anim: 'dash', cost: 0,
          lock: { hits: 12, every: 3, dmg: 1.4, final: 9, kb: [10, 10], anim: 'flurry' } })
      },
      special: ['ki', 'knee', 'whirl', 'hundred']
    },

    blaze: {
      name: 'Blaze', nameZh: '炎', title: 'The Swordsman', titleZh: '剑客',
      color: '#FF5A4E', alt: '#FFB199', glow: '#FF9A3C', weapon: 'sword', hat: 'spikes',
      hp: 100, speed: 1.05, jump: 1, power: 1.04, weight: 1, price: 150,
      stats: [3, 4, 3, 3],
      moves: {
        j1: M({ f: [5, 3, 14], dmg: 4.4, box: [10, 80, 98, 136], anim: 'slashA', chain: 'j2', win: [8, 20] }),
        j2: M({ f: [5, 3, 15], dmg: 4.8, box: [10, 84, 98, 152], anim: 'slashB', chain: 'j3', win: [8, 21] }),
        j3: M({ f: [7, 4, 20], dmg: 7, stun: 24, kb: [6, 4], box: [15, 40, 104, 152], anim: 'overhead', cost: 6 }),
        up: M({ f: [5, 5, 20], dmg: 6, stun: 30, kb: [1.5, 13], launch: true, box: [5, 90, 74, 178], anim: 'rise', cost: 8 }),
        air: M({ f: [4, 8, 9], dmg: 5.5, stun: 18, kb: [3, 1], box: [0, -12, 84, 72], anim: 'airslash' }),
        sp: M({ f: [11, 2, 18], dmg: 0, anim: 'slashA', cost: 22, box: null, proj: { at: 11, kind: 'wave', vx: 10, y: 100, dmg: 7, stun: 20, kb: [4, 2] } }),
        fwd: M({ f: [8, 9, 18], dmg: 9, stun: 26, kb: [5, 6], down: true, vx: 17, pass: true, box: [-30, 70, 60, 140], anim: 'dash', cost: 24 }),
        back: M({ f: [3, 12, 22], dmg: 4, stun: 24, kb: [1.5, 9], multi: 4, launch: true, vx: 2, vy: 14, inv: [1, 8], box: [0, 60, 70, 180], anim: 'rise', cost: 20 }),
        ult: M({ f: [36, 10, 26], dmg: 3, stun: 60, kb: [2, 0], cine: true, vx: 22, pass: true, box: [-40, 60, 70, 150], anim: 'dash', cost: 0,
          lock: { hits: 10, every: 3, dmg: 1.6, final: 10, kb: [9, 11], anim: 'cuts' } })
      },
      special: ['wave', 'flash', 'dragon', 'cuts']
    },

    nox: {
      name: 'Nox', nameZh: '夜', title: 'The Reaper', titleZh: '夜镰',
      color: '#A77BFF', alt: '#D8C5FF', glow: '#C86BFF', weapon: 'scythe', hat: 'hood',
      hp: 88, speed: 1, jump: 1, power: 0.97, weight: 1, price: 250,
      stats: [4, 3, 2, 4],
      moves: {
        j1: M({ f: [6, 3, 15], dmg: 4.5, box: [15, 70, 116, 142], anim: 'slashA', chain: 'j2', win: [9, 21] }),
        j2: M({ f: [6, 4, 16], dmg: 5, box: [10, 60, 116, 162], anim: 'slashB', chain: 'j3', win: [10, 23] }),
        j3: M({ f: [7, 8, 18], dmg: 3, stun: 22, kb: [6, 5], multi: 4, box: [-60, 50, 116, 152], anim: 'spin', cost: 7 }),
        up: M({ f: [6, 5, 20], dmg: 6, stun: 30, kb: [1.5, 13], launch: true, box: [5, 90, 90, 185], anim: 'rise', cost: 8 }),
        air: M({ f: [5, 8, 9], dmg: 5.5, stun: 18, kb: [3, 1], box: [0, -24, 104, 72], anim: 'airslash' }),
        sp: M({ f: [12, 2, 16], dmg: 0, anim: 'throw', cost: 22, box: null, proj: { at: 12, kind: 'scythe', vx: 11.5, y: 105, dmg: 6, stun: 20, kb: [3, 4] } }),
        fwd: M({ f: [7, 12, 18], dmg: 8, stun: 26, kb: [6, 6], down: true, vx: 13, box: [10, 60, 110, 140], anim: 'thrust', cost: 24 }),
        back: M({ f: [12, 4, 14], dmg: 6, stun: 26, kb: [4, 7], inv: [4, 13], tele: { at: 9, to: 'behind' }, box: [10, 60, 110, 150], anim: 'slashB', cost: 20 }),
        ult: M({ f: [36, 2, 30], dmg: 0, cine: true, box: null, anim: 'throw', cost: 0,
          proj: { at: 36, kind: 'scythe', vx: 9, y: 100, big: true, dmg: 3, stun: 60, kb: [0, 0] },
          lock: { hits: 11, every: 3, dmg: 1.5, final: 10, kb: [8, 12], anim: 'reap' } })
      },
      special: ['reap', 'grim', 'veil', 'harvest']
    },

    brick: {
      name: 'Brick', nameZh: '砖', title: 'The Wall', titleZh: '铁壁',
      color: '#FF9F2E', alt: '#FFD08A', glow: '#FFC061', weapon: 'hammer', hat: 'helmet',
      hp: 112, speed: 0.85, jump: 0.92, power: 1.12, weight: 0.85, price: 300,
      stats: [5, 1, 5, 3],
      moves: {
        j1: M({ f: [8, 4, 18], dmg: 6, stun: 20, box: [15, 60, 104, 132], anim: 'slashA', chain: 'j2', win: [12, 25], cost: 6 }),
        j2: M({ f: [10, 4, 22], dmg: 9, stun: 26, kb: [7, 4], box: [20, 0, 112, 150], anim: 'overhead', cost: 8 }),
        up: M({ f: [8, 5, 24], dmg: 8, stun: 32, kb: [1.5, 13], launch: true, box: [5, 90, 80, 180], anim: 'upper', cost: 9 }),
        air: M({ f: [6, 8, 10], dmg: 7, stun: 20, kb: [3, 0], box: [0, -24, 90, 70], anim: 'airslash', cost: 6 }),
        sp: M({ f: [14, 2, 22], dmg: 0, anim: 'slam', cost: 22, box: null, proj: { at: 14, kind: 'quake', vx: 8, y: 22, dmg: 6.5, stun: 26, kb: [2, 10], launch: true } }),
        fwd: M({ f: [10, 14, 22], dmg: 8, stun: 26, kb: [9, 5], down: true, vx: 10, armor: true, box: [5, 60, 62, 140], anim: 'dash', cost: 24 }),
        back: M({ f: [6, 22, 18], dmg: 10, stun: 28, kb: [4, 10], launch: true, vx: 6, vy: 12, box: [-60, -10, 90, 60], hitFrom: 12, anim: 'slam', cost: 22 }),
        ult: M({ f: [36, 2, 32], dmg: 0, cine: true, box: null, anim: 'slam', cost: 0,
          proj: { at: 36, kind: 'quake', vx: 11, y: 30, big: true, dmg: 3, stun: 60, kb: [0, 0] },
          lock: { hits: 8, every: 4, dmg: 2, final: 12, kb: [7, 13], anim: 'pound' } })
      },
      special: ['quake', 'ram', 'meteor', 'split']
    },

    zephyr: {
      name: 'Zephyr', nameZh: '风', title: 'The Shadow', titleZh: '疾影',
      color: '#39D5E8', alt: '#A9F2FA', glow: '#5CF0FF', weapon: 'daggers', hat: 'mask',
      hp: 100, speed: 1.22, jump: 1.1, power: 1.07, weight: 1.02, price: 350,
      stats: [2, 5, 1, 2],
      moves: {
        j1: M({ f: [3, 3, 11], dmg: 4, box: [8, 92, 78, 126], chain: 'j2', win: [6, 16] }),
        j2: M({ f: [3, 3, 11], dmg: 4, box: [8, 92, 80, 126], anim: 'cross', chain: 'j3', win: [6, 16] }),
        j3: M({ f: [4, 3, 13], dmg: 4.6, box: [8, 84, 84, 150], anim: 'slashB', chain: 'j4', win: [7, 18] }),
        j4: M({ f: [6, 4, 18], dmg: 7, stun: 24, kb: [6, 5], box: [5, 95, 88, 146], anim: 'round', cost: 6 }),
        up: M({ f: [4, 4, 18], dmg: 5, stun: 30, kb: [1.5, 13], launch: true, box: [0, 90, 58, 170], anim: 'upper', cost: 7 }),
        air: M({ f: [3, 9, 7], dmg: 4.5, stun: 18, kb: [3, 2], box: [6, 10, 62, 70], anim: 'airkick' }),
        sp: M({ f: [9, 2, 15], dmg: 0, anim: 'throw', cost: 20, box: null, proj: { at: 9, kind: 'star', vx: 12.5, y: 108, n: 3, spread: 1.4, dmg: 2.6, stun: 14, kb: [2, 1] } }),
        fwd: M({ f: [5, 10, 16], dmg: 6, stun: 30, kb: [3, 5], vx: 18, pass: true, inv: [4, 14], box: [-40, 70, 50, 140], anim: 'dash', cost: 22 }),
        back: M({ f: [6, 1, 10], dmg: 0, box: null, inv: [2, 12], tele: { at: 5, to: 'behind' }, anim: 'cast', cost: 18 }),
        ult: M({ f: [36, 12, 24], dmg: 3, stun: 60, kb: [2, 0], cine: true, vx: 24, pass: true, box: [-40, 60, 70, 150], anim: 'dash', cost: 0,
          lock: { hits: 14, every: 2, dmg: 1.2, final: 9, kb: [9, 11], anim: 'shadows' } })
      },
      special: ['stars', 'step', 'smoke', 'shadows']
    },

    volt: {
      name: 'Volt', nameZh: '雷', title: 'The Stormcaller', titleZh: '唤雷者',
      color: '#FFE14A', alt: '#FFF2A8', glow: '#FFF06A', weapon: 'staff', hat: 'wizard',
      hp: 102, speed: 0.95, jump: 1, power: 1.13, weight: 1.02, price: 400,
      stats: [4, 2, 2, 4],
      moves: {
        j1: M({ f: [5, 3, 14], dmg: 4.6, box: [10, 90, 108, 122], anim: 'thrust', chain: 'j2', win: [8, 20] }),
        j2: M({ f: [5, 4, 15], dmg: 5, box: [10, 80, 100, 160], anim: 'slashB', chain: 'j3', win: [9, 21] }),
        j3: M({ f: [6, 9, 18], dmg: 2.5, stun: 22, kb: [6, 4], multi: 3, box: [-70, 60, 98, 152], anim: 'spin', cost: 7 }),
        up: M({ f: [5, 5, 20], dmg: 6, stun: 30, kb: [1.5, 13], launch: true, box: [5, 90, 76, 182], anim: 'rise', cost: 8 }),
        air: M({ f: [4, 8, 9], dmg: 5, stun: 18, kb: [3, 1], box: [0, -24, 90, 70], anim: 'airslash' }),
        sp: M({ f: [12, 2, 18], dmg: 0, anim: 'cast', cost: 24, box: null, proj: { at: 12, kind: 'orb', vx: 5.5, y: 110, dmg: 10, stun: 24, kb: [5, 4] } }),
        fwd: M({ f: [9, 4, 16], dmg: 7, stun: 24, kb: [5, 5], inv: [4, 9], tele: { at: 6, to: 'ahead', d: 170 }, box: [10, 80, 104, 132], anim: 'thrust', cost: 22 }),
        back: M({ f: [8, 20, 18], dmg: 2, stun: 18, kb: [5, 5], multi: 5, box: [-84, 0, 84, 172], anim: 'cast', cost: 20 }),
        ult: M({ f: [36, 2, 30], dmg: 0, cine: true, box: null, anim: 'cast', cost: 0,
          proj: { at: 36, kind: 'bolt', vx: 0, y: 0, atFoe: true, dmg: 3, stun: 60, kb: [0, 0] },
          lock: { hits: 10, every: 3, dmg: 1.6, final: 11, kb: [6, 13], anim: 'storm' } })
      },
      special: ['orb', 'blink', 'field', 'thunder']
    },

    pike: {
      name: 'Pike', nameZh: '枪', title: 'The Lancer', titleZh: '长枪手',
      color: '#5EDB6E', alt: '#B8F5BF', glow: '#8CFF7A', weapon: 'spear', hat: 'straw',
      hp: 102, speed: 1, jump: 1.05, power: 1.08, weight: 1, price: 450,
      stats: [3, 3, 3, 5],
      moves: {
        j1: M({ f: [6, 3, 15], dmg: 4.1, box: [20, 90, 138, 122], anim: 'thrust', chain: 'j2', win: [9, 21] }),
        j2: M({ f: [6, 3, 15], dmg: 4.1, box: [20, 104, 138, 142], anim: 'thrust', chain: 'j3', win: [9, 21] }),
        j3: M({ f: [8, 6, 20], dmg: 7, stun: 24, kb: [7, 5], box: [-80, 20, 132, 84], anim: 'spin', cost: 7 }),
        up: M({ f: [6, 5, 20], dmg: 6, stun: 30, kb: [1.5, 13], launch: true, box: [5, 90, 84, 190], anim: 'rise', cost: 8 }),
        air: M({ f: [5, 8, 9], dmg: 5.5, stun: 18, kb: [3, 1], box: [0, -40, 104, 52], anim: 'airslash' }),
        sp: M({ f: [12, 2, 18], dmg: 0, anim: 'throw', cost: 22, box: null, proj: { at: 12, kind: 'spear', vx: 13, vy: 1.6, grav: 0.08, y: 112, dmg: 8, stun: 22, kb: [5, 3] } }),
        fwd: M({ f: [8, 14, 20], dmg: 8, stun: 26, kb: [8, 6], down: true, vx: 12, box: [20, 80, 140, 128], anim: 'thrust', cost: 24 }),
        back: M({ f: [5, 24, 14], dmg: 6, stun: 24, kb: [4, 6], vx: 9, vy: 15, box: [-10, -20, 70, 70], hitFrom: 10, anim: 'airkick', cost: 20 }),
        ult: M({ f: [36, 12, 26], dmg: 3, stun: 60, kb: [2, 0], cine: true, vx: 16, box: [20, 70, 140, 130], anim: 'thrust', cost: 0,
          lock: { hits: 12, every: 3, dmg: 1.4, final: 10, kb: [11, 9], anim: 'thrusts' } })
      },
      special: ['javelin', 'charge', 'vault', 'dragonSpear']
    },

    oni: {
      name: 'Oni', nameZh: '鬼', title: 'The Warlord', titleZh: '鬼将',
      color: '#E23B4B', alt: '#FF9BA5', glow: '#FF3D2E', weapon: 'claws', hat: 'horns',
      hp: 125, speed: 1, jump: 1, power: 1.05, weight: 0.82, price: 1500, boss: true,
      stats: [5, 3, 5, 3],
      moves: {
        j1: M({ f: [5, 3, 14], dmg: 5, box: [10, 85, 86, 136], anim: 'cross', chain: 'j2', win: [8, 20] }),
        j2: M({ f: [5, 3, 15], dmg: 5, box: [10, 85, 86, 136], anim: 'jab', chain: 'j3', win: [8, 21] }),
        j3: M({ f: [9, 4, 20], dmg: 9, stun: 26, kb: [8, 6], box: [15, 20, 100, 150], anim: 'slam', cost: 7 }),
        up: M({ f: [6, 5, 20], dmg: 8, stun: 32, kb: [1.5, 13], launch: true, box: [0, 90, 64, 176], anim: 'upper', cost: 8 }),
        air: M({ f: [5, 8, 9], dmg: 7, stun: 20, kb: [3, 1], box: [0, -12, 84, 72], anim: 'airslash' }),
        sp: M({ f: [12, 2, 18], dmg: 0, anim: 'throw', cost: 22, box: null, proj: { at: 12, kind: 'fire', vx: 8, vy: 5, grav: 0.2, y: 120, dmg: 9, stun: 22, kb: [5, 5] } }),
        fwd: M({ f: [8, 14, 18], dmg: 10, stun: 26, kb: [9, 6], down: true, vx: 13, armor: true, box: [5, 60, 64, 140], anim: 'dash', cost: 24 }),
        back: M({ f: [12, 16, 18], dmg: 11, stun: 28, kb: [4, 11], launch: true, inv: [4, 12], tele: { at: 10, to: 'above' }, vy: -14, box: [-60, -10, 70, 70], anim: 'slam', cost: 22 }),
        ult: M({ f: [36, 2, 30], dmg: 0, cine: true, box: null, anim: 'cast', cost: 0,
          proj: { at: 36, kind: 'bolt', vx: 0, y: 0, atFoe: true, fire: true, dmg: 3, stun: 60, kb: [0, 0] },
          lock: { hits: 10, every: 3, dmg: 1.8, final: 12, kb: [7, 13], anim: 'inferno' } })
      },
      special: ['hellfire', 'rush', 'drop', 'inferno']
    }
  };

  const KEYS = Object.keys(FIGHTERS);

  /* A move's reach, for the bots: how far in front its hitbox goes. */
  for (const k of KEYS) {
    const f = FIGHTERS[k];
    f.key = k;
    for (const mk in f.moves) {
      const m = f.moves[mk];
      m.key = mk;
      m.reach = m.box ? m.box[2] + (m.vx ? m.vx * m.f[1] : 0) : (m.proj ? 900 : 0);
      if (m.tele && m.tele.to === 'ahead') m.reach = (m.tele.d || 0) + (m.box ? m.box[2] : 0);
    }
  }

  /* ---- stages ---- */

  const STAGES = ['dojo', 'rooftop', 'bamboo', 'temple', 'volcano', 'neon'];

  /* ---- the tournament: eight fights, each smarter than the last ---- */

  const LADDER = [
    { foe: 'blaze', lvl: 0.14, stage: 'dojo' },
    { foe: 'brick', lvl: 0.24, stage: 'bamboo' },
    { foe: 'zephyr', lvl: 0.34, stage: 'rooftop' },
    { foe: 'pike', lvl: 0.44, stage: 'temple' },
    { foe: 'volt', lvl: 0.54, stage: 'neon' },
    { foe: 'nox', lvl: 0.64, stage: 'bamboo' },
    { foe: 'ink', lvl: 0.76, stage: 'rooftop' },
    { foe: 'oni', lvl: 0.9, stage: 'volcano', boss: true }
  ];

  /* How sharp the computer is, 0 to 1, by the option sheet's difficulty. */
  const LEVELS = { easy: 0.16, normal: 0.42, hard: 0.7, expert: 0.93 };

  /* Coins for a win, and the consolation for a loss. */
  const PAY = {
    versus: { easy: 20, normal: 35, hard: 55, expert: 80 },
    tour: i => 40 + i * 15,
    champion: 300,
    loss: 6,
    perfect: 15
  };

  PV.StickData = {
    HZ: HZ, ARENA: ARENA, RULES: RULES, PROJ: PROJ,
    FIGHTERS: FIGHTERS, KEYS: KEYS, STAGES: STAGES, LADDER: LADDER, LEVELS: LEVELS, PAY: PAY,
    fighter: k => FIGHTERS[k] || FIGHTERS.ink,
    isFighter: k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(FIGHTERS, k)
  };

})(window.PV);
