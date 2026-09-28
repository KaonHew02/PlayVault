/* 火柴人对决 / Stick Clash — registration. */
(function (PV) {
  'use strict';

  const D = PV.StickData;

  /** A stage card's picture: the stage itself, small, with nobody on it. */
  function preview(key) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const x = c.getContext('2d');
    if (key === 'random') {
      const g = x.createLinearGradient(0, 0, 96, 64);
      ['#4A2A17', '#1C1A4A', '#2E5A3A', '#C4507A', '#8A2412', '#2A0B4A'].forEach((col, i) => g.addColorStop(i / 5, col));
      x.fillStyle = g; x.fillRect(0, 0, 96, 64);
      x.fillStyle = '#fff'; x.font = '800 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', 48, 34);
      return c;
    }
    PV.StickArt.drawStage(x, key, { x: D.ARENA / 2, s: 0.14, floor: 50 }, 96, 64, 0);
    return c;
  }

  PV.Registry.add({
    code: 'stick',
    family: 'arcade',
    name: 'Stick Clash',
    nameZh: '火柴人对决',
    blurb: 'A one-on-one stickman fighter. Time your combos, block, break out, and finish with an ultimate. Eight fighters to unlock, a tournament, and two players on one keyboard.',
    blurbZh: '一对一火柴人格斗。把握连招节奏、格挡、爆气脱身，再用必杀技收尾。八名可解锁的斗士、锦标赛模式，还能两人同屏对战。',
    accent: '#FF5A4E',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.2">'
      + '<circle cx="13" cy="11" r="4" fill="currentColor" stroke="none" opacity=".75"/>'
      + '<path d="M13 15v11l-5 10M13 26l5 9M13 18l7 3 7-2" stroke="currentColor" opacity=".75"/>'
      + '<circle cx="36" cy="12" r="4" fill="#FF5A4E" stroke="none"/>'
      + '<path d="M36 16l-2 10 4 10M34 26l-6 8M35 19l-6-4-4 3" stroke="#FF5A4E"/>'
      + '</g><path d="M22 16l4 2-3 3" fill="none" stroke="#F6B32B" stroke-width="2.2" stroke-linecap="round"/></svg>',

    options: [
      {
        key: 'mode', labelKey: 'stick.opt.mode', def: 'tour', solo: true,
        choices: PV.StickGame.MODES.map(k => ({ value: k, labelKey: 'stick.mode.' + k }))
      },
      {
        key: 'difficulty', labelKey: 'stick.opt.cpu', def: 'normal',
        showIf: (c, room) => room || c.mode === 'versus',
        choices: ['easy', 'normal', 'hard', 'expert'].map(k => ({ value: k, labelKey: 'diff.' + k }))
      },
      {
        key: 'rounds', labelKey: 'stick.opt.rounds', def: 3, solo: true,
        showIf: c => c.mode !== 'train',
        choices: [1, 3, 5].map(n => ({ value: n, labelKey: 'stick.rounds.' + n }))
      },
      {
        key: 'stage', labelKey: 'stick.opt.stage', def: 'random',
        showIf: (c, room) => room || c.mode !== 'tour',
        choices: ['random'].concat(D.STAGES).map(k => ({ value: k, labelKey: 'stick.stage.' + k, preview: preview }))
      }
    ],

    start: (host, ctx) => PV.StickView(ctx)
  });

})(window.PV);
