/* 突击小队 / Strike Squad — registration. */
(function (PV) {
  'use strict';

  /** A map card's picture: the map from above, as the minimap draws it. */
  function preview(key) {
    const c = document.createElement('canvas');
    if (key === 'random') {
      c.width = 88; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#39424c'; x.fillRect(0, 0, 88, 64);
      x.fillStyle = '#aab4bf'; x.font = '700 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', 44, 34);
      return c;
    }
    const mm = PV.FpsHud.miniMap(new PV.FpsWorld(key));
    c.width = mm.c.width; c.height = mm.c.height;
    c.getContext('2d').drawImage(mm.c, 0, 0);
    return c;
  }

  PV.Registry.add({
    code: 'fps',
    family: 'arcade',
    name: 'Strike Squad',
    nameZh: '突击小队',
    blurb: 'A first-person shooter: seven modes on eight maps against bots, twenty-two guns to buy, upgrade and paint, skills, clothes and daily missions.',
    blurbZh: '第一人称射击：八张地图、七种模式，对战机器人；二十二把枪可购买、升级与涂装，另有技能、服装与每日任务。',
    accent: '#F97316',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<circle cx="31" cy="17" r="9.5" fill="none" stroke="#F97316" stroke-width="2.2"/>'
      + '<path d="M31 4v7M31 23v7M18 17h7M37 17h7" stroke="#F97316" stroke-width="2.2" stroke-linecap="round"/>'
      + '<circle cx="31" cy="17" r="1.8" fill="#F97316"/>'
      + '<path d="M4 33h26l3-3h8v5H33l-2 3H19l-2 6h-6l2-6H4z" fill="currentColor" opacity=".85"/>'
      + '<path d="M7 31h9v2H7z" fill="currentColor" opacity=".6"/></svg>',

    options: [
      {
        // The reference's Quick Battle — a random mode on a random map —
        // and its seven modes by name.
        key: 'mode', labelKey: 'fps.opt.mode', def: 'quick', grid: true,
        choices: ['quick', 'tdm', 'ffa', 'dom', 'ctf', 'snd', 'elim', 'gun'].map(k => ({ value: k, labelKey: 'fps.mode.' + k }))
      },
      {
        key: 'map', labelKey: 'fps.opt.map', def: 'random',
        choices: ['random'].concat(PV.FpsMaps.KEYS).map(k => ({ value: k, labelKey: 'fps.map.' + k, preview: preview }))
      },
      {
        key: 'difficulty', labelKey: 'fps.opt.diff', def: 'normal',
        choices: [
          { value: 'easy', labelKey: 'diff.easy' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'hard', labelKey: 'diff.hard' }
        ]
      }
    ],

    start: (host, ctx) => PV.FpsView(ctx)
  });

})(window.PV);
