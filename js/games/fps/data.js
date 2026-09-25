/* 突击小队 / Strike Squad — the catalogue.

   Everything the armory sells and everything a match is made of, as plain
   data: twenty-two weapons in the reference's five classes plus pistols and
   blades, the attachments, camos and charms that hang off them, the clothes
   that change a soldier's numbers, the skills, the seven modes, the ranks and
   the missions. No DOM, no clock and no randomness here — the engine, the
   bots, the lobby, the art and the tests all read the same numbers.

   The reference is Hazmob FPS (crazygames). Its names, art and code are its
   makers' and none of them is copied; what its page lists as the game is
   what this file is a table of.

   A weapon's numbers are its STOCK numbers and are never written to. What a
   player has bought on top — upgrade levels, attachments — is applied by
   stats() into a fresh object, so a bot and a player holding the same gun
   start from the same table.

   Units: metres, seconds, degrees for spread and kick (a cone's half-angle),
   rounds a minute for fire rate, and damage out of a 100-point soldier. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* ------------------------------------------------------------ classes */

  const CATS = ['ar', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol', 'melee'];
  const SLOT = { ar: 0, smg: 0, shotgun: 0, sniper: 0, lmg: 0, pistol: 1, melee: 2 };

  /* ------------------------------------------------------------- models */

  /* A gun is a list of parts in its own space: +z toward the muzzle, +y up,
     origin at the trigger. The same list draws the first-person gun, the
     one a soldier carries, and the side-on icon on every card and in the
     kill feed, so none of the three can drift from the others.

       ['b', cx, cy, cz, sx, sy, sz, mat, rx]   a box, tipped rx about x
       ['c', cx, cy, cz, r, len, mat]           a cylinder along z

     Materials: b body (takes the camo), d dark steel, p polymer, w wood,
     a accent, g glass, s bright steel. */
  const MODELS = {
    striker: [
      ['b', 0, 0, 0.04, 0.055, 0.075, 0.34, 'b'],
      ['b', 0, 0.047, 0.04, 0.04, 0.018, 0.32, 'd'],
      ['b', 0, 0.002, 0.32, 0.062, 0.066, 0.24, 'p'],
      ['c', 0, 0.006, 0.53, 0.011, 0.2, 'd'],
      ['c', 0, 0.006, 0.645, 0.017, 0.04, 'd'],
      ['b', 0, 0.06, 0.43, 0.012, 0.05, 0.014, 'd'],
      ['b', 0, -0.105, 0.1, 0.028, 0.15, 0.065, 'd', 0.18],
      ['b', 0, -0.085, -0.07, 0.034, 0.11, 0.042, 'p', -0.32],
      ['b', 0, 0.012, -0.21, 0.03, 0.03, 0.16, 'd'],
      ['b', 0, -0.005, -0.31, 0.044, 0.095, 0.11, 'p'],
      ['b', 0, 0.066, -0.09, 0.03, 0.022, 0.035, 'd']
    ],
    kodiak: [
      ['b', 0, 0, 0.03, 0.056, 0.08, 0.36, 'b'],
      ['b', 0, 0.05, 0.02, 0.05, 0.02, 0.3, 'd'],
      ['b', 0, -0.004, 0.3, 0.06, 0.06, 0.2, 'w'],
      ['b', 0, 0.042, 0.3, 0.05, 0.03, 0.18, 'w'],
      ['c', 0, 0.01, 0.52, 0.012, 0.24, 'd'],
      ['c', 0, 0.01, 0.655, 0.016, 0.05, 'd'],
      ['b', 0, 0.06, 0.6, 0.012, 0.045, 0.015, 'd'],
      ['b', 0, -0.12, 0.14, 0.032, 0.17, 0.07, 'a', 0.42],
      ['b', 0, -0.085, -0.08, 0.034, 0.11, 0.04, 'w', -0.35],
      ['b', 0, -0.02, -0.28, 0.046, 0.085, 0.24, 'w', 0.12],
      ['b', 0, 0.063, -0.03, 0.028, 0.02, 0.04, 'd']
    ],
    falcon: [
      ['b', 0, 0.005, 0.02, 0.06, 0.09, 0.5, 'b'],
      ['b', 0, 0.075, 0.02, 0.018, 0.03, 0.36, 'p'],
      ['b', 0, 0.063, 0.2, 0.03, 0.03, 0.02, 'p'],
      ['b', 0, 0.063, -0.16, 0.03, 0.03, 0.02, 'p'],
      ['b', 0, -0.01, 0.34, 0.058, 0.062, 0.16, 'p'],
      ['c', 0, 0.006, 0.52, 0.011, 0.22, 'd'],
      ['c', 0, 0.006, 0.635, 0.016, 0.03, 'd'],
      ['b', 0, -0.1, -0.06, 0.026, 0.13, 0.06, 'd', 0.1],
      ['b', 0, -0.085, 0.16, 0.034, 0.11, 0.04, 'p', -0.3],
      ['b', 0, -0.03, 0.08, 0.02, 0.04, 0.2, 'p']
    ],
    tempest: [
      ['b', 0, 0, 0.04, 0.06, 0.08, 0.38, 'b'],
      ['b', 0, 0.05, 0.08, 0.042, 0.02, 0.46, 'd'],
      ['b', 0, 0.0, 0.34, 0.07, 0.07, 0.24, 'b'],
      ['c', 0, 0.006, 0.56, 0.013, 0.22, 'd'],
      ['c', 0, 0.006, 0.685, 0.02, 0.05, 'd'],
      ['b', 0, -0.1, 0.13, 0.034, 0.13, 0.07, 'd', 0.1],
      ['b', 0, -0.085, -0.07, 0.036, 0.11, 0.042, 'p', -0.3],
      ['b', 0, 0.0, -0.24, 0.04, 0.07, 0.18, 'p'],
      ['b', 0, -0.01, -0.34, 0.046, 0.11, 0.05, 'p'],
      ['b', 0, 0.035, -0.28, 0.035, 0.03, 0.1, 'p']
    ],
    viper: [
      ['b', 0, 0, 0.05, 0.05, 0.075, 0.25, 'b'],
      ['b', 0, 0.044, 0.05, 0.034, 0.014, 0.2, 'd'],
      ['c', 0, 0.004, 0.23, 0.012, 0.1, 'd'],
      ['c', 0, 0.004, 0.285, 0.015, 0.02, 'd'],
      ['b', 0, -0.1, 0.02, 0.03, 0.14, 0.036, 'd', -0.08],
      ['b', 0, -0.06, 0.02, 0.036, 0.09, 0.045, 'p', -0.08],
      ['b', 0, 0.01, -0.13, 0.012, 0.012, 0.12, 'd'],
      ['b', 0, -0.03, -0.19, 0.036, 0.05, 0.012, 'd'],
      ['b', 0, 0.055, 0.13, 0.01, 0.024, 0.01, 'd']
    ],
    hornet: [
      ['b', 0, 0, 0.04, 0.052, 0.075, 0.3, 'b'],
      ['b', 0, 0.046, 0.04, 0.03, 0.018, 0.22, 'd'],
      ['b', 0, -0.005, 0.24, 0.06, 0.062, 0.12, 'p'],
      ['c', 0, 0.004, 0.34, 0.011, 0.1, 'd'],
      ['b', 0, -0.11, 0.1, 0.026, 0.15, 0.045, 'd', 0.35],
      ['b', 0, -0.08, -0.06, 0.034, 0.1, 0.04, 'p', -0.3],
      ['b', 0, 0.0, -0.18, 0.03, 0.06, 0.12, 'p'],
      ['b', 0, -0.005, -0.25, 0.04, 0.09, 0.04, 'p'],
      ['b', 0, 0.062, 0.2, 0.018, 0.03, 0.02, 'd']
    ],
    vortex: [
      ['b', 0, -0.01, 0.06, 0.056, 0.1, 0.28, 'b'],
      ['b', 0, 0.05, 0.08, 0.032, 0.018, 0.26, 'd'],
      ['c', 0, 0.01, 0.26, 0.012, 0.12, 'd'],
      ['b', 0, -0.1, -0.02, 0.03, 0.12, 0.05, 'd', -0.1],
      ['b', 0, -0.12, 0.15, 0.03, 0.12, 0.034, 'd'],
      ['b', 0, -0.02, 0.22, 0.05, 0.06, 0.08, 'p'],
      ['b', 0, 0.02, -0.14, 0.03, 0.05, 0.12, 'p'],
      ['b', 0, 0.0, -0.22, 0.04, 0.1, 0.04, 'p']
    ],
    bulldog: [
      ['b', 0, 0, 0.02, 0.07, 0.1, 0.44, 'b'],
      ['b', 0, 0.063, 0.06, 0.05, 0.03, 0.2, 'p'],
      ['b', 0, 0.059, 0.06, 0.03, 0.006, 0.18, 'g'],
      ['c', 0, 0.012, 0.28, 0.011, 0.08, 'd'],
      ['b', 0, -0.07, 0.08, 0.05, 0.05, 0.06, 'p'],
      ['b', 0, -0.06, 0.18, 0.05, 0.04, 0.05, 'p'],
      ['b', 0, -0.03, -0.15, 0.06, 0.08, 0.12, 'p']
    ],
    breacher: [
      ['b', 0, 0, -0.02, 0.055, 0.08, 0.26, 'b'],
      ['c', 0, 0.02, 0.4, 0.015, 0.56, 'd'],
      ['c', 0, -0.02, 0.33, 0.014, 0.44, 'd'],
      ['b', 0, -0.025, 0.36, 0.06, 0.055, 0.2, 'w'],
      ['b', 0, 0.042, 0.15, 0.01, 0.014, 0.3, 'd'],
      ['b', 0, 0.035, 0.66, 0.012, 0.018, 0.012, 'a'],
      ['b', 0, -0.075, -0.1, 0.034, 0.1, 0.04, 'w', -0.35],
      ['b', 0, -0.025, -0.28, 0.048, 0.09, 0.24, 'w', 0.16]
    ],
    hurricane: [
      ['b', 0, 0, 0.02, 0.06, 0.09, 0.34, 'b'],
      ['b', 0, 0.052, 0.02, 0.04, 0.02, 0.3, 'd'],
      ['b', 0, -0.005, 0.31, 0.066, 0.07, 0.22, 'p'],
      ['c', 0, 0.01, 0.52, 0.017, 0.24, 'd'],
      ['c', 0, 0.01, 0.65, 0.022, 0.04, 'd'],
      ['b', 0, -0.12, 0.12, 0.05, 0.14, 0.09, 'd', 0.1],
      ['b', 0, -0.09, -0.08, 0.036, 0.11, 0.042, 'p', -0.3],
      ['b', 0, 0.0, -0.26, 0.05, 0.1, 0.2, 'p']
    ],
    marksman: [
      ['b', 0, 0, 0.04, 0.058, 0.08, 0.38, 'b'],
      ['b', 0, 0.048, 0.06, 0.04, 0.018, 0.4, 'd'],
      ['b', 0, 0.0, 0.36, 0.06, 0.065, 0.24, 'p'],
      ['c', 0, 0.006, 0.6, 0.012, 0.32, 'd'],
      ['c', 0, 0.006, 0.775, 0.017, 0.04, 'd'],
      ['b', 0, -0.09, 0.12, 0.03, 0.1, 0.07, 'd', 0.12],
      ['b', 0, -0.085, -0.07, 0.034, 0.11, 0.042, 'p', -0.3],
      ['b', 0, -0.005, -0.28, 0.046, 0.1, 0.22, 'p', 0.06]
    ],
    longbow: [
      ['b', 0, 0, 0.02, 0.058, 0.07, 0.34, 'b'],
      ['b', 0, -0.02, 0.33, 0.06, 0.06, 0.34, 'b'],
      ['c', 0, 0.01, 0.66, 0.013, 0.46, 'd'],
      ['c', 0, 0.01, 0.9, 0.02, 0.06, 'd'],
      ['b', 0.045, 0.02, -0.05, 0.05, 0.012, 0.012, 's'],
      ['c', 0.07, 0.02, -0.05, 0.01, 0.012, 's'],
      ['b', 0, -0.07, 0.08, 0.03, 0.07, 0.07, 'd'],
      ['b', 0, -0.085, -0.1, 0.034, 0.11, 0.04, 'b', -0.3],
      ['b', 0, -0.02, -0.34, 0.05, 0.12, 0.3, 'b', 0.08],
      ['b', 0, 0.035, -0.3, 0.035, 0.03, 0.14, 'p']
    ],
    rail: [
      ['b', 0, 0, 0.02, 0.07, 0.09, 0.42, 'b'],
      ['b', 0, 0.0, 0.4, 0.08, 0.08, 0.3, 'b'],
      ['c', 0, 0.01, 0.78, 0.018, 0.5, 'd'],
      ['b', 0, 0.01, 1.05, 0.06, 0.05, 0.08, 'd'],
      ['b', 0, -0.13, 0.12, 0.05, 0.16, 0.09, 'd'],
      ['b', 0, -0.1, -0.12, 0.04, 0.12, 0.045, 'p', -0.3],
      ['b', 0, 0.0, -0.36, 0.06, 0.14, 0.3, 'b'],
      ['b', 0, -0.13, 0.52, 0.012, 0.16, 0.012, 'd', 0.4],
      ['b', 0, -0.13, 0.52, 0.012, 0.16, 0.012, 'd', -0.4]
    ],
    warden: [
      ['b', 0, 0, 0.04, 0.07, 0.09, 0.42, 'b'],
      ['b', 0, 0.055, 0.02, 0.06, 0.022, 0.36, 'd'],
      ['b', 0, -0.005, 0.38, 0.07, 0.07, 0.22, 'p'],
      ['c', 0, 0.006, 0.62, 0.014, 0.3, 'd'],
      ['c', 0, 0.006, 0.79, 0.019, 0.05, 'd'],
      ['b', 0.0, -0.12, 0.1, 0.1, 0.13, 0.12, 'a'],
      ['b', 0, -0.09, -0.08, 0.036, 0.11, 0.042, 'p', -0.3],
      ['b', 0, -0.01, -0.3, 0.05, 0.11, 0.22, 'p'],
      ['b', 0, -0.07, 0.6, 0.012, 0.12, 0.012, 'd', 0.35],
      ['b', 0, -0.07, 0.6, 0.012, 0.12, 0.012, 'd', -0.35]
    ],
    titan: [
      ['b', 0, 0, 0.02, 0.07, 0.1, 0.46, 'b'],
      ['b', 0, 0.06, 0.1, 0.04, 0.02, 0.2, 'd'],
      ['c', 0, 0.01, 0.52, 0.016, 0.54, 'd'],
      ['c', 0, 0.01, 0.8, 0.024, 0.06, 'd'],
      ['c', 0, 0.03, 0.4, 0.02, 0.2, 'd'],
      ['b', 0.07, -0.08, 0.08, 0.07, 0.12, 0.12, 'a'],
      ['b', 0, -0.09, -0.12, 0.036, 0.11, 0.042, 'w', -0.3],
      ['b', 0, -0.02, -0.34, 0.05, 0.12, 0.26, 'w', 0.12],
      ['b', 0, -0.08, 0.66, 0.012, 0.14, 0.012, 'd', 0.35],
      ['b', 0, -0.08, 0.66, 0.012, 0.14, 0.012, 'd', -0.35]
    ],
    p9: [
      ['b', 0, 0.02, 0.06, 0.03, 0.03, 0.19, 'b'],
      ['b', 0, -0.005, 0.07, 0.028, 0.025, 0.16, 'p'],
      ['b', 0, -0.06, -0.01, 0.028, 0.1, 0.04, 'p', -0.25],
      ['b', 0, -0.03, 0.03, 0.006, 0.02, 0.04, 'd'],
      ['b', 0, 0.04, 0.14, 0.006, 0.01, 0.006, 'd'],
      ['b', 0, 0.04, -0.02, 0.016, 0.01, 0.008, 'd']
    ],
    ranger: [
      ['b', 0, 0.022, 0.065, 0.032, 0.034, 0.21, 's'],
      ['b', 0, -0.006, 0.07, 0.028, 0.026, 0.17, 'd'],
      ['b', 0, -0.065, -0.015, 0.03, 0.11, 0.045, 'w', -0.22],
      ['b', 0, -0.032, 0.035, 0.006, 0.02, 0.04, 'd'],
      ['b', 0, 0.044, 0.16, 0.006, 0.01, 0.006, 'd']
    ],
    stinger: [
      ['b', 0, 0.02, 0.06, 0.032, 0.034, 0.2, 'b'],
      ['b', 0, -0.005, 0.07, 0.03, 0.028, 0.17, 'p'],
      ['b', 0, -0.09, -0.01, 0.026, 0.16, 0.036, 'd', -0.2],
      ['b', 0, -0.05, 0.14, 0.02, 0.05, 0.02, 'p'],
      ['c', 0, 0.02, 0.185, 0.009, 0.05, 'd']
    ],
    magnum: [
      ['c', 0, 0.022, 0.13, 0.012, 0.2, 's'],
      ['b', 0, 0.034, 0.13, 0.012, 0.012, 0.2, 's'],
      ['c', 0, 0.012, 0.0, 0.026, 0.05, 'b'],
      ['b', 0, 0.01, -0.04, 0.03, 0.05, 0.05, 's'],
      ['b', 0, -0.06, -0.06, 0.032, 0.1, 0.045, 'w', -0.35],
      ['b', 0, -0.025, 0.0, 0.006, 0.02, 0.04, 'd'],
      ['b', 0, 0.048, 0.22, 0.006, 0.012, 0.008, 'd']
    ],
    knife: [
      ['b', 0, 0, 0.15, 0.006, 0.03, 0.17, 's'],
      ['b', 0, 0.012, 0.23, 0.006, 0.01, 0.02, 's'],
      ['b', 0, 0, 0.055, 0.024, 0.05, 0.012, 'd'],
      ['b', 0, -0.002, -0.02, 0.022, 0.03, 0.12, 'p']
    ],
    machete: [
      ['b', 0, 0.005, 0.24, 0.005, 0.05, 0.34, 's'],
      ['b', 0, 0.02, 0.41, 0.005, 0.03, 0.04, 's'],
      ['b', 0, 0, 0.06, 0.03, 0.05, 0.012, 'd'],
      ['b', 0, -0.002, -0.02, 0.024, 0.032, 0.13, 'w']
    ],
    axe: [
      ['b', 0, 0, 0.14, 0.022, 0.026, 0.46, 'w'],
      ['b', 0, 0.035, 0.34, 0.012, 0.1, 0.08, 's'],
      ['b', 0, 0.07, 0.35, 0.01, 0.03, 0.12, 's'],
      ['b', 0, -0.025, 0.34, 0.016, 0.04, 0.04, 'd']
    ]
  };

  /* ------------------------------------------------------------- weapons */

  /* The fields, once:
       dmg head leg     damage, and the head/leg multipliers
       pellets          shots in one pull (shotguns)
       r0 r1 far        full damage to r0 metres, sliding to `far` of it by r1
       rpm fire burst   rounds a minute; auto | semi | burst | bolt | pump | melee
       mag res reload   magazine, reserve, seconds; `shell` = one at a time
       hip ads walk air spread in degrees: hip, aimed, and added when moving
                        or off the ground
       bloom bmax back  spread each shot adds, its cap, and how fast it goes
       kick kickH       how far a shot throws the aim up, and sideways
       zoom adsT        field of view divided by this when aimed, and how long
       optic            the sight it comes with
       move equip       speed while holding it, seconds to bring it up
       reach arc back2  blades: how far, how wide, and the backstab factor
       price lvl        coins, and the rank it unlocks at
       rail muzzle under charm   where the optic, the muzzle device, the
                        grip and the charm go on the model
       snd              which gunshot it makes */
  const W = {
    striker: {
      cat: 'ar', dmg: 26, head: 1.5, leg: 0.85, r0: 28, r1: 60, far: 0.72,
      rpm: 720, fire: 'auto', mag: 30, res: 150, reload: 2.1,
      hip: 2.4, ads: 0.25, walk: 1.2, air: 5, bloom: 0.22, bmax: 3.5, back: 10,
      kick: 0.55, kickH: 0.22, zoom: 1.3, adsT: 0.2, optic: 'iron', move: 0.95, equip: 0.5,
      price: 0, lvl: 1, rail: [0.056, 0.02], muzzle: [0.006, 0.665], under: [-0.03, 0.33], charm: [0.032, -0.03, -0.02], snd: 'rifle'
    },
    kodiak: {
      cat: 'ar', dmg: 32, head: 1.5, leg: 0.85, r0: 30, r1: 65, far: 0.75,
      rpm: 600, fire: 'auto', mag: 30, res: 150, reload: 2.4,
      hip: 2.8, ads: 0.3, walk: 1.3, air: 5, bloom: 0.3, bmax: 4.5, back: 9,
      kick: 0.8, kickH: 0.38, zoom: 1.3, adsT: 0.23, optic: 'iron', move: 0.93, equip: 0.55,
      price: 1500, lvl: 4, rail: [0.06, 0.02], muzzle: [0.01, 0.68], under: [-0.035, 0.3], charm: [0.032, -0.03, -0.03], snd: 'heavy'
    },
    falcon: {
      cat: 'ar', dmg: 30, head: 1.5, leg: 0.85, r0: 30, r1: 60, far: 0.72,
      rpm: 900, fire: 'burst', burst: 3, gap: 0.3, mag: 30, res: 150, reload: 2.3,
      hip: 2.5, ads: 0.22, walk: 1.2, air: 5, bloom: 0.18, bmax: 3, back: 11,
      kick: 0.45, kickH: 0.15, zoom: 1.35, adsT: 0.21, optic: 'iron', move: 0.95, equip: 0.5,
      price: 2000, lvl: 9, rail: [0.09, 0.02], muzzle: [0.006, 0.65], under: [-0.04, 0.34], charm: [0.034, -0.02, -0.1], snd: 'rifle'
    },
    tempest: {
      cat: 'ar', dmg: 40, head: 1.5, leg: 0.85, r0: 35, r1: 75, far: 0.8,
      rpm: 500, fire: 'auto', mag: 20, res: 120, reload: 2.5,
      hip: 3, ads: 0.25, walk: 1.3, air: 5.5, bloom: 0.35, bmax: 4.5, back: 9,
      kick: 1.0, kickH: 0.3, zoom: 1.35, adsT: 0.25, optic: 'iron', move: 0.92, equip: 0.6,
      price: 3200, lvl: 14, rail: [0.06, 0.08], muzzle: [0.006, 0.71], under: [-0.035, 0.34], charm: [0.034, -0.03, -0.02], snd: 'heavy'
    },
    viper: {
      cat: 'smg', dmg: 20, head: 1.4, leg: 0.85, r0: 10, r1: 26, far: 0.55,
      rpm: 950, fire: 'auto', mag: 32, res: 192, reload: 1.8,
      hip: 2.0, ads: 0.6, walk: 0.6, air: 3.5, bloom: 0.15, bmax: 3, back: 12,
      kick: 0.3, kickH: 0.3, zoom: 1.2, adsT: 0.14, optic: 'iron', move: 1.0, equip: 0.4,
      price: 800, lvl: 2, rail: [0.052, 0.05], muzzle: [0.004, 0.295], under: [-0.04, 0.12], charm: [0.03, -0.02, -0.03], snd: 'smg'
    },
    hornet: {
      cat: 'smg', dmg: 22, head: 1.4, leg: 0.85, r0: 14, r1: 32, far: 0.6,
      rpm: 800, fire: 'auto', mag: 30, res: 180, reload: 1.9,
      hip: 1.9, ads: 0.4, walk: 0.6, air: 3.5, bloom: 0.14, bmax: 2.8, back: 12,
      kick: 0.28, kickH: 0.18, zoom: 1.2, adsT: 0.15, optic: 'iron', move: 1.0, equip: 0.42,
      price: 1200, lvl: 5, rail: [0.055, 0.04], muzzle: [0.004, 0.39], under: [-0.036, 0.24], charm: [0.03, -0.02, -0.02], snd: 'smg'
    },
    vortex: {
      cat: 'smg', dmg: 19, head: 1.4, leg: 0.85, r0: 9, r1: 22, far: 0.55,
      rpm: 1150, fire: 'auto', mag: 25, res: 175, reload: 1.7,
      hip: 1.8, ads: 0.5, walk: 0.6, air: 3.5, bloom: 0.13, bmax: 2.8, back: 13,
      kick: 0.22, kickH: 0.16, zoom: 1.2, adsT: 0.13, optic: 'iron', move: 1.02, equip: 0.4,
      price: 2600, lvl: 10, rail: [0.059, 0.08], muzzle: [0.01, 0.32], under: [-0.05, 0.22], charm: [0.032, -0.03, 0.0], snd: 'smg'
    },
    bulldog: {
      cat: 'smg', dmg: 20, head: 1.4, leg: 0.85, r0: 12, r1: 28, far: 0.58,
      rpm: 900, fire: 'auto', mag: 50, res: 200, reload: 2.4,
      hip: 2.1, ads: 0.5, walk: 0.7, air: 3.5, bloom: 0.14, bmax: 3, back: 12,
      kick: 0.26, kickH: 0.2, zoom: 1.2, adsT: 0.16, optic: 'iron', move: 0.98, equip: 0.45,
      price: 2800, lvl: 18, rail: [0.078, 0.06], muzzle: [0.012, 0.32], under: [-0.05, 0.2], charm: [0.036, -0.03, -0.1], snd: 'smg'
    },
    breacher: {
      cat: 'shotgun', dmg: 17, pellets: 8, head: 1.2, leg: 0.9, r0: 5, r1: 16, far: 0.2,
      rpm: 70, fire: 'pump', mag: 6, res: 36, reload: 0.45, shell: true,
      hip: 4.8, ads: 3.8, walk: 0.3, air: 2, bloom: 0, bmax: 0, back: 10,
      kick: 3.0, kickH: 0.6, zoom: 1.15, adsT: 0.2, optic: 'iron', move: 0.96, equip: 0.55,
      price: 1000, lvl: 3, rail: [0.05, 0.1], muzzle: [0.02, 0.68], under: [-0.055, 0.36], charm: [0.03, -0.03, -0.06], snd: 'shotgun'
    },
    hurricane: {
      cat: 'shotgun', dmg: 12, pellets: 8, head: 1.2, leg: 0.9, r0: 4, r1: 13, far: 0.2,
      rpm: 260, fire: 'auto', mag: 10, res: 50, reload: 2.6,
      hip: 5.2, ads: 4.2, walk: 0.3, air: 2, bloom: 0.2, bmax: 1.5, back: 8,
      kick: 1.8, kickH: 0.5, zoom: 1.15, adsT: 0.22, optic: 'iron', move: 0.95, equip: 0.6,
      price: 3000, lvl: 12, rail: [0.063, 0.02], muzzle: [0.01, 0.67], under: [-0.04, 0.31], charm: [0.033, -0.03, -0.04], snd: 'shotgun'
    },
    marksman: {
      cat: 'sniper', dmg: 60, head: 2.0, leg: 0.85, r0: 60, r1: 120, far: 0.9,
      rpm: 220, fire: 'semi', mag: 10, res: 50, reload: 2.4,
      hip: 5.5, ads: 0.06, walk: 2.5, air: 7, bloom: 0.6, bmax: 3, back: 8,
      kick: 2.2, kickH: 0.3, zoom: 3.5, adsT: 0.28, optic: 'x4', move: 0.92, equip: 0.6,
      price: 1800, lvl: 6, rail: [0.057, 0.06], muzzle: [0.006, 0.795], under: [-0.035, 0.36], charm: [0.032, -0.03, -0.03], snd: 'sniper'
    },
    longbow: {
      cat: 'sniper', dmg: 110, head: 2.5, leg: 0.8, r0: 100, r1: 200, far: 1,
      rpm: 48, fire: 'bolt', mag: 5, res: 30, reload: 2.9,
      hip: 7, ads: 0.02, walk: 3, air: 8, bloom: 0, bmax: 0, back: 8,
      kick: 3.5, kickH: 0.4, zoom: 6.5, adsT: 0.35, optic: 'x8', move: 0.9, equip: 0.7,
      price: 2500, lvl: 8, rail: [0.035, 0.1], muzzle: [0.01, 0.93], under: [-0.05, 0.36], charm: [0.032, -0.03, -0.05], snd: 'sniper'
    },
    rail: {
      cat: 'sniper', dmg: 150, head: 2.0, leg: 0.9, r0: 120, r1: 250, far: 1,
      rpm: 36, fire: 'bolt', mag: 4, res: 24, reload: 3.3,
      hip: 8, ads: 0.02, walk: 3.2, air: 9, bloom: 0, bmax: 0, back: 8,
      kick: 4.5, kickH: 0.5, zoom: 7, adsT: 0.4, optic: 'x8', move: 0.87, equip: 0.8,
      price: 4500, lvl: 20, rail: [0.045, 0.1], muzzle: [0.01, 1.09], under: [-0.04, 0.42], charm: [0.036, -0.03, -0.1], snd: 'sniper'
    },
    warden: {
      cat: 'lmg', dmg: 25, head: 1.4, leg: 0.85, r0: 30, r1: 60, far: 0.75,
      rpm: 780, fire: 'auto', mag: 100, res: 200, reload: 4.6,
      hip: 3.6, ads: 0.45, walk: 1.6, air: 6, bloom: 0.18, bmax: 4, back: 9,
      kick: 0.42, kickH: 0.3, zoom: 1.3, adsT: 0.32, optic: 'iron', move: 0.86, equip: 0.9,
      price: 2200, lvl: 7, rail: [0.066, 0.02], muzzle: [0.006, 0.815], under: [-0.04, 0.38], charm: [0.037, -0.03, -0.12], snd: 'lmg'
    },
    titan: {
      cat: 'lmg', dmg: 33, head: 1.4, leg: 0.85, r0: 35, r1: 70, far: 0.8,
      rpm: 640, fire: 'auto', mag: 80, res: 160, reload: 5.0,
      hip: 4, ads: 0.5, walk: 1.7, air: 6, bloom: 0.22, bmax: 4.5, back: 9,
      kick: 0.55, kickH: 0.35, zoom: 1.3, adsT: 0.35, optic: 'iron', move: 0.84, equip: 0.95,
      price: 3500, lvl: 16, rail: [0.07, 0.1], muzzle: [0.01, 0.83], under: [-0.05, 0.3], charm: [0.037, -0.04, -0.14], snd: 'lmg'
    },
    p9: {
      cat: 'pistol', dmg: 24, head: 1.7, leg: 0.85, r0: 12, r1: 30, far: 0.65,
      rpm: 420, fire: 'semi', mag: 12, res: 72, reload: 1.4,
      hip: 1.6, ads: 0.45, walk: 0.5, air: 3, bloom: 0.45, bmax: 3, back: 12,
      kick: 1.1, kickH: 0.2, zoom: 1.15, adsT: 0.12, optic: 'iron', move: 1.05, equip: 0.3,
      price: 0, lvl: 1, rail: [0.035, 0.07], muzzle: [0.02, 0.155], under: [-0.02, 0.1], charm: [0.018, -0.07, -0.02], snd: 'pistol'
    },
    ranger: {
      cat: 'pistol', dmg: 33, head: 1.7, leg: 0.85, r0: 14, r1: 32, far: 0.7,
      rpm: 330, fire: 'semi', mag: 8, res: 56, reload: 1.5,
      hip: 1.7, ads: 0.4, walk: 0.5, air: 3, bloom: 0.55, bmax: 3.5, back: 11,
      kick: 1.5, kickH: 0.25, zoom: 1.15, adsT: 0.13, optic: 'iron', move: 1.05, equip: 0.32,
      price: 500, lvl: 3, rail: [0.039, 0.07], muzzle: [0.022, 0.17], under: [-0.02, 0.1], charm: [0.018, -0.075, -0.03], snd: 'pistol'
    },
    stinger: {
      cat: 'pistol', dmg: 17, head: 1.5, leg: 0.85, r0: 8, r1: 20, far: 0.5,
      rpm: 1000, fire: 'auto', mag: 20, res: 120, reload: 1.5,
      hip: 2.2, ads: 0.8, walk: 0.5, air: 3, bloom: 0.2, bmax: 3.5, back: 12,
      kick: 0.35, kickH: 0.3, zoom: 1.15, adsT: 0.12, optic: 'iron', move: 1.04, equip: 0.3,
      price: 900, lvl: 6, rail: [0.037, 0.07], muzzle: [0.02, 0.21], under: [-0.075, 0.14], charm: [0.018, -0.08, -0.02], snd: 'smg'
    },
    magnum: {
      cat: 'pistol', dmg: 58, head: 1.8, leg: 0.85, r0: 20, r1: 45, far: 0.75,
      rpm: 160, fire: 'semi', mag: 6, res: 36, reload: 2.2,
      hip: 2.0, ads: 0.3, walk: 0.6, air: 3.5, bloom: 0.9, bmax: 4, back: 9,
      kick: 3.0, kickH: 0.4, zoom: 1.2, adsT: 0.15, optic: 'iron', move: 1.03, equip: 0.35,
      price: 1500, lvl: 11, rail: [0.04, 0.12], muzzle: [0.022, 0.23], under: [-0.01, 0.12], charm: [0.018, -0.07, -0.06], snd: 'magnum'
    },
    knife: {
      cat: 'melee', dmg: 55, back2: 2, reach: 2.1, arc: 35, rpm: 110, fire: 'melee',
      mag: 0, res: 0, reload: 0, hip: 0, ads: 0, walk: 0, air: 0, bloom: 0, bmax: 0, back: 0,
      kick: 0, kickH: 0, zoom: 1, adsT: 0.1, optic: 'iron', move: 1.08, equip: 0.25,
      price: 0, lvl: 1, rail: [0, 0], muzzle: [0, 0.24], under: [0, 0], charm: [0.014, -0.02, -0.07], snd: 'knife'
    },
    machete: {
      cat: 'melee', dmg: 70, back2: 1.6, reach: 2.4, arc: 40, rpm: 80, fire: 'melee',
      mag: 0, res: 0, reload: 0, hip: 0, ads: 0, walk: 0, air: 0, bloom: 0, bmax: 0, back: 0,
      kick: 0, kickH: 0, zoom: 1, adsT: 0.1, optic: 'iron', move: 1.06, equip: 0.3,
      price: 600, lvl: 5, rail: [0, 0], muzzle: [0, 0.43], under: [0, 0], charm: [0.015, -0.02, -0.08], snd: 'knife'
    },
    axe: {
      cat: 'melee', dmg: 100, back2: 1.5, reach: 2.3, arc: 30, rpm: 55, fire: 'melee',
      mag: 0, res: 0, reload: 0, hip: 0, ads: 0, walk: 0, air: 0, bloom: 0, bmax: 0, back: 0,
      kick: 0, kickH: 0, zoom: 1, adsT: 0.1, optic: 'iron', move: 1.03, equip: 0.35,
      price: 1200, lvl: 13, rail: [0, 0], muzzle: [0, 0.4], under: [0, 0], charm: [0.02, -0.02, -0.1], snd: 'knife'
    }
  };
  for (const id in W) {
    const w = W[id];
    w.id = id;
    w.slot = SLOT[w.cat];
    w.pellets = w.pellets || 1;
    w.model = MODELS[id];
  }

  const IDS = Object.keys(W);
  const byCat = cat => IDS.filter(id => W[id].cat === cat);

  /* The gun race: one kill a rung, the blade to finish. A blade kill sends
     its victim DOWN a rung and does not move the killer — the way the
     classic mode has always worked. */
  const LADDER = ['p9', 'ranger', 'stinger', 'viper', 'hornet', 'vortex', 'bulldog', 'breacher',
    'hurricane', 'striker', 'kodiak', 'falcon', 'tempest', 'warden', 'titan', 'marksman', 'longbow',
    'rail', 'magnum', 'knife'];

  /* --------------------------------------------------------- attachments */

  /* Four slots. An optic changes the zoom and how long aiming takes; the
     rest trade one number for another. `cats` limits where it fits. */
  const ATTACH = {
    optic: [
      { id: 'iron', price: 0, lvl: 1 },
      { id: 'dot', zoom: 1.35, adsT: 0.9, price: 300, lvl: 3, cats: ['ar', 'smg', 'shotgun', 'lmg', 'pistol'] },
      { id: 'holo', zoom: 1.45, adsT: 0.95, price: 500, lvl: 6, cats: ['ar', 'smg', 'shotgun', 'lmg'] },
      { id: 'x4', zoom: 3.2, adsT: 1.25, price: 800, lvl: 10, cats: ['ar', 'lmg', 'sniper'] },
      { id: 'x8', zoom: 6.5, adsT: 1.35, price: 1200, lvl: 14, cats: ['sniper'] }
    ],
    muzzle: [
      { id: 'none', price: 0, lvl: 1 },
      { id: 'comp', kick: 0.75, price: 400, lvl: 5, cats: ['ar', 'smg', 'lmg', 'pistol', 'sniper'] },
      { id: 'supp', quiet: true, range: 0.88, price: 700, lvl: 8, cats: ['ar', 'smg', 'lmg', 'pistol', 'sniper'] },
      { id: 'brake', kickH: 0.55, kick: 0.9, price: 600, lvl: 12, cats: ['ar', 'lmg', 'sniper', 'shotgun'] }
    ],
    mag: [
      { id: 'none', price: 0, lvl: 1 },
      { id: 'ext', mag: 1.3, reload: 1.1, price: 400, lvl: 4, cats: ['ar', 'smg', 'lmg', 'pistol', 'sniper', 'shotgun'] },
      { id: 'fast', reload: 0.8, price: 600, lvl: 9, cats: ['ar', 'smg', 'lmg', 'pistol', 'sniper', 'shotgun'] }
    ],
    grip: [
      { id: 'none', price: 0, lvl: 1 },
      { id: 'vert', kick: 0.85, bloom: 0.85, price: 250, lvl: 2, cats: ['ar', 'smg', 'lmg', 'shotgun'] },
      { id: 'laser', hip: 0.72, price: 450, lvl: 7, cats: ['ar', 'smg', 'lmg', 'shotgun', 'pistol'] },
      { id: 'angled', adsT: 0.85, price: 500, lvl: 11, cats: ['ar', 'smg', 'lmg', 'sniper'] }
    ]
  };
  const SLOTS = ['optic', 'muzzle', 'mag', 'grip'];
  const attach = (slot, id) => ATTACH[slot].find(a => a.id === id) || ATTACH[slot][0];
  /** Whether an attachment fits a weapon at all. Snipers keep their scope. */
  function fits(wid, slot, aid) {
    const w = W[wid], a = attach(slot, aid);
    if (!w || w.cat === 'melee') return a.price === 0 && a.id === ATTACH[slot][0].id;
    if (a.id === ATTACH[slot][0].id) return !(slot === 'optic' && w.cat === 'sniper');
    return !a.cats || a.cats.indexOf(w.cat) >= 0;
  }

  /* ---------------------------------------------------------- upgrades */

  /* Four tracks a gun, five levels each, bought in the armory — the
     reference's "upgrade the abilities of each gun you own". */
  const TRACKS = ['dmg', 'acc', 'rel', 'mag'];
  const UP_MAX = 5;
  const UP_BASE = [120, 220, 380, 600, 900];
  function upgradeCost(wid, track, level) {
    const w = W[wid];
    if (!w || level >= UP_MAX) return Infinity;
    const tier = 1 + Math.min(1.5, (w.price || 0) / 3000);
    return Math.round(UP_BASE[level] * tier / 10) * 10;
  }

  /**
   * A weapon's numbers with what its owner bought applied. `own` is
   * { up: {dmg, acc, rel, mag}, att: {optic, muzzle, mag, grip} } or
   * nothing for a stock gun. Returns a fresh object every time.
   */
  function stats(wid, own) {
    const w = W[wid] || W.striker;
    const s = Object.assign({}, w);
    const up = (own && own.up) || {};
    const at = (own && own.att) || {};
    const lv = k => Math.max(0, Math.min(UP_MAX, up[k] | 0));
    s.dmg = w.dmg * (1 + 0.04 * lv('dmg'));
    const acc = 1 - 0.07 * lv('acc');
    s.hip *= acc; s.ads *= acc; s.walk *= acc; s.bloom *= acc;
    s.kick *= 1 - 0.05 * lv('acc'); s.kickH *= 1 - 0.05 * lv('acc');
    s.reload = w.reload * (1 - 0.06 * lv('rel'));
    if (w.cat === 'shotgun' && w.shell) s.mag = w.mag + lv('mag');
    else s.mag = Math.round(w.mag * (1 + 0.1 * lv('mag')));
    s.optic = w.optic;
    s.att = {};
    for (const slot of SLOTS) {
      const id = at[slot] && fits(wid, slot, at[slot]) ? at[slot] : null;
      const a = id ? attach(slot, id) : null;
      s.att[slot] = a ? a.id : (slot === 'optic' ? w.optic : 'none');
      if (!a || a.price === 0) continue;
      if (a.zoom) { s.zoom = a.zoom; s.optic = a.id; }
      if (a.adsT) s.adsT *= a.adsT;
      if (a.kick) s.kick *= a.kick;
      if (a.kickH) s.kickH *= a.kickH;
      if (a.bloom) s.bloom *= a.bloom;
      if (a.hip) s.hip *= a.hip;
      if (a.mag) s.mag = Math.round(s.mag * a.mag);
      if (a.reload) s.reload *= a.reload;
      if (a.range) { s.r0 *= a.range; s.r1 *= a.range; }
      if (a.quiet) s.quiet = true;
    }
    s.res = Math.max(s.res, s.mag * 3);
    s.interval = 3600 / s.rpm;                 // ticks between rounds
    return s;
  }

  /* --------------------------------------------------------- cosmetics */

  /* Camos paint the body of a gun. `pat` picks the pattern the shader
     draws: 0 plain, 1 blotches, 2 stripes, 3 digital, 4 weave, 5 scales,
     6 waves, 7 stars, 8 polished. */
  const CAMOS = [
    { id: 'none', cols: null, pat: 0, price: 0, lvl: 1 },
    { id: 'woodland', cols: ['#56693F', '#2E3A22', '#8A7650'], pat: 1, price: 250, lvl: 2 },
    { id: 'desert', cols: ['#C9B18A', '#9C8058', '#E6D6B4'], pat: 1, price: 250, lvl: 3 },
    { id: 'urban', cols: ['#8C9198', '#555A62', '#C9CDD2'], pat: 3, price: 400, lvl: 5 },
    { id: 'arctic', cols: ['#EEF2F5', '#A9BBC8', '#FFFFFF'], pat: 1, price: 500, lvl: 7 },
    { id: 'tiger', cols: ['#E8801F', '#1B1B1B', '#F7AE45'], pat: 2, price: 800, lvl: 9 },
    { id: 'carbon', cols: ['#2A2C30', '#43474D', '#17181A'], pat: 4, price: 900, lvl: 11 },
    { id: 'crimson', cols: ['#9A1D1D', '#C93434', '#4E0F0F'], pat: 3, price: 1000, lvl: 13 },
    { id: 'cobalt', cols: ['#1E52A8', '#3478E0', '#0F2A5E'], pat: 1, price: 1000, lvl: 15 },
    { id: 'dragon', cols: ['#B8141D', '#F5B83A', '#2B0505'], pat: 5, price: 1600, lvl: 18 },
    { id: 'neon', cols: ['#18E8C4', '#B42EF5', '#0C0C1C'], pat: 6, price: 1800, lvl: 21 },
    { id: 'galaxy', cols: ['#1D1549', '#6030A8', '#F0E4FF'], pat: 7, price: 2400, lvl: 25 },
    { id: 'gold', cols: ['#D9A521', '#F9DA72', '#9A6C0C'], pat: 8, price: 3000, lvl: 30 }
  ];

  /* Keychains: a little thing on a cord at the side of the gun, swinging
     with every step. Purely for looks, like the reference's. */
  const CHARMS = [
    { id: 'none', price: 0, lvl: 1 },
    { id: 'dice', col: '#F4F4F0', price: 150, lvl: 2 },
    { id: 'star', col: '#FFC83A', price: 200, lvl: 3 },
    { id: 'heart', col: '#F0445B', price: 200, lvl: 4 },
    { id: 'skull', col: '#ECE7DA', price: 300, lvl: 6 },
    { id: 'bullet', col: '#D6A445', price: 300, lvl: 8 },
    { id: 'duck', col: '#FFD23F', price: 400, lvl: 10 },
    { id: 'cat', col: '#3A3A42', price: 400, lvl: 12 },
    { id: 'grenade', col: '#5E7045', price: 450, lvl: 14 },
    { id: 'clover', col: '#35B25A', price: 500, lvl: 17 },
    { id: 'crown', col: '#F5C02E', price: 600, lvl: 20 },
    { id: 'diamond', col: '#7FE3FF', price: 800, lvl: 24 }
  ];

  /* ---------------------------------------------------------- clothing */

  /* The reference's clothes "improve your base character stats". Here:
     armour soaks half of what hits you until it runs out, speed is a share
     of your pace, reload a share off every reload, quiet halves how far
     your steps carry. Everything is visible on the soldier. */
  const GEAR = {
    head: [
      { id: 'cap', price: 0, lvl: 1 },
      { id: 'beret', price: 300, lvl: 2 },
      { id: 'helmet', armor: 10, price: 600, lvl: 3 },
      { id: 'combat', armor: 20, price: 1500, lvl: 8 },
      { id: 'heavy', armor: 30, speed: -0.02, price: 3000, lvl: 15 }
    ],
    body: [
      { id: 'tee', price: 0, lvl: 1 },
      { id: 'vest', armor: 15, price: 800, lvl: 4 },
      { id: 'plate', armor: 30, speed: -0.03, price: 2000, lvl: 10 },
      { id: 'raider', armor: 22, speed: 0.02, price: 3500, lvl: 18 }
    ],
    hands: [
      { id: 'bare', price: 0, lvl: 1 },
      { id: 'gloves', reload: 0.06, price: 500, lvl: 2 },
      { id: 'tactical', reload: 0.12, price: 1500, lvl: 9 },
      { id: 'pro', reload: 0.16, ads: 0.1, price: 3000, lvl: 17 }
    ],
    feet: [
      { id: 'sneakers', price: 0, lvl: 1 },
      { id: 'boots', speed: 0.03, price: 600, lvl: 3 },
      { id: 'runners', speed: 0.06, price: 1600, lvl: 9 },
      { id: 'ghost', speed: 0.07, quiet: true, price: 3200, lvl: 16 }
    ]
  };
  const GEAR_SLOTS = ['head', 'body', 'hands', 'feet'];
  const gear = (slot, id) => (GEAR[slot] || []).find(g => g.id === id) || GEAR[slot][0];
  /** What a set of clothes adds up to. */
  function gearStats(worn) {
    const out = { armor: 0, speed: 0, reload: 0, ads: 0, quiet: false };
    for (const slot of GEAR_SLOTS) {
      const g = gear(slot, worn && worn[slot]);
      out.armor += g.armor || 0;
      out.speed += g.speed || 0;
      out.reload += g.reload || 0;
      out.ads += g.ads || 0;
      if (g.quiet) out.quiet = true;
    }
    return out;
  }

  /* ------------------------------------------------------------ skills */

  /* The reference's keys 4, 5 and 6. Three go in the loadout. */
  const SKILLS = [
    { id: 'medkit', cd: 22, dur: 2, price: 0, lvl: 1 },
    { id: 'stim', cd: 28, dur: 6, price: 800, lvl: 4 },
    { id: 'radar', cd: 35, dur: 6, price: 1200, lvl: 7 },
    { id: 'shield', cd: 40, dur: 5, price: 2000, lvl: 12 }
  ];
  const skill = id => SKILLS.find(s => s.id === id) || null;
  const NADES = 2;

  /* ------------------------------------------------------------- modes */

  /* The reference's seven. `size` is soldiers a side (or in all, for the
     free-for-alls). `limit` is what ends it — kills, points, captures or
     rounds won — and `time` the clock in seconds. */
  const MODES = {
    tdm: { teams: true, respawn: true, size: 5, limit: 75, time: 480 },
    ffa: { teams: false, respawn: true, size: 8, limit: 30, time: 480 },
    dom: { teams: true, respawn: true, size: 5, limit: 200, time: 540 },
    ctf: { teams: true, respawn: true, size: 5, limit: 3, time: 540, wait: 5 },
    snd: { teams: true, respawn: false, size: 5, limit: 4, time: 110, rounds: true, bomb: true },
    elim: { teams: true, respawn: false, size: 5, limit: 4, time: 100, rounds: true },
    gun: { teams: false, respawn: true, size: 8, limit: LADDER.length, time: 600 }
  };
  const MODE_KEYS = Object.keys(MODES);
  /* Quick battle draws its mode from these, most often a plain fight. */
  const QUICK = ['tdm', 'tdm', 'tdm', 'ffa', 'ffa', 'dom', 'dom', 'ctf', 'snd', 'elim', 'gun'];

  /* ------------------------------------------------------------- ranks */

  const MAX_RANK = 60;
  const need = l => 900 + 220 * (l - 1);
  /** { level, into, need, title } from rank xp. */
  function rankOf(xp) {
    let l = 1, left = Math.max(0, Math.floor(xp || 0));
    while (l < MAX_RANK && left >= need(l)) { left -= need(l); l++; }
    return { level: l, into: l >= MAX_RANK ? need(l) : left, need: need(l), title: Math.min(9, Math.floor((l - 1) / 6)) };
  }

  /* ---------------------------------------------------------- missions */

  /* The reference's daily and weekly missions. A day's three and a week's
     three are worked out from the date alone, so there is nothing to
     store but progress, and nothing to forge but a number the validator
     clamps anyway. `n` is [daily, weekly]. */
  const MISSIONS = [
    { id: 'kills', stat: 'kills', n: [25, 150] },
    { id: 'hs', stat: 'hs', n: [8, 45] },
    { id: 'wins', stat: 'wins', n: [2, 10] },
    { id: 'matches', stat: 'matches', n: [3, 15] },
    { id: 'ar', stat: 'k_ar', n: [15, 80] },
    { id: 'smg', stat: 'k_smg', n: [15, 80] },
    { id: 'sniper', stat: 'k_sniper', n: [8, 40] },
    { id: 'shotgun', stat: 'k_shotgun', n: [10, 50] },
    { id: 'lmg', stat: 'k_lmg', n: [12, 60] },
    { id: 'pistol', stat: 'k_pistol', n: [6, 30] },
    { id: 'blade', stat: 'k_melee', n: [3, 15] },
    { id: 'nades', stat: 'k_nade', n: [3, 15] },
    { id: 'caps', stat: 'caps', n: [4, 20] },
    { id: 'flags', stat: 'flags', n: [2, 8] },
    { id: 'plants', stat: 'plants', n: [2, 8] },
    { id: 'damage', stat: 'dmg', n: [3000, 20000] },
    { id: 'streak', stat: 'streak', n: [5, 10], best: true }
  ];
  const REWARD = [180, 900];

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /** Three different missions for a key ('d:2026-09-25' or 'w:2026-39'). */
  function pickMissions(key, weekly) {
    let h = hashStr(key);
    const pool = MISSIONS.map((m, i) => i);
    const out = [];
    while (out.length < 3 && pool.length) {
      h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9E3779B9) >>> 0;
      const m = MISSIONS[pool.splice(h % pool.length, 1)[0]];
      out.push({ id: m.id, stat: m.stat, n: m.n[weekly ? 1 : 0], best: !!m.best, reward: REWARD[weekly ? 1 : 0] });
    }
    return out;
  }
  const pad2 = n => String(n).padStart(2, '0');
  function dayKey(d) { return 'd:' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function weekKey(d) {
    // ISO week: the Thursday of this week decides the year.
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return 'w:' + t.getUTCFullYear() + '-' + pad2(Math.ceil(((t - y0) / 86400000 + 1) / 7));
  }

  /* Crates, as in the reference's lobby: one for every 25 kills and one for
     every 3 wins. What is inside is drawn when it is opened. */
  const CRATES = { killer: { every: 25, stat: 'kills' }, winner: { every: 3, stat: 'wins' } };

  /* ------------------------------------------------------------ export */

  PV.FpsData = {
    CATS: CATS, SLOT: SLOT, W: W, IDS: IDS, byCat: byCat, LADDER: LADDER,
    ATTACH: ATTACH, ASLOTS: SLOTS, attach: attach, fits: fits,
    TRACKS: TRACKS, UP_MAX: UP_MAX, upgradeCost: upgradeCost, stats: stats,
    CAMOS: CAMOS, CHARMS: CHARMS,
    GEAR: GEAR, GEAR_SLOTS: GEAR_SLOTS, gear: gear, gearStats: gearStats,
    SKILLS: SKILLS, skill: skill, NADES: NADES,
    MODES: MODES, MODE_KEYS: MODE_KEYS, QUICK: QUICK,
    MAX_RANK: MAX_RANK, rankOf: rankOf,
    MISSIONS: MISSIONS, pickMissions: pickMissions, dayKey: dayKey, weekKey: weekKey,
    CRATES: CRATES, hashStr: hashStr
  };

})(window.PV);
