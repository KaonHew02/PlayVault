/* 变色躲猫猫 / Blend In — registration. */
(function (PV) {
  'use strict';

  /** A map card's picture: the map from above. */
  function preview(key) {
    if (key === 'random') {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 64;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 96, 64);
      ['#4DB6E8', '#8E63D6', '#E4587A', '#EF8A34', '#F2C94C', '#4CC38A'].forEach((col, i) => g.addColorStop(i / 5, col));
      x.fillStyle = g; x.fillRect(0, 0, 96, 64);
      x.fillStyle = '#fff'; x.font = '800 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', 48, 34);
      return c;
    }
    return PV.HideUI.mapPic(key, 96, 64);
  }

  PV.Registry.add({
    code: 'hide',
    family: 'arcade',
    name: 'Blend In',
    nameZh: '变色躲猫猫',
    blurb: 'Hide and seek in paint: colour your body to match the walls and hold still, or hunt the hiders down with a water gun. Six maps, poses, and bots that look before they spray.',
    blurbZh: '用颜料玩捉迷藏：把身体涂成墙的颜色一动不动，或者拿水枪把躲藏者找出来。六张地图、各种姿势，还有先看清再开枪的机器人。',
    accent: '#E4587A',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M6 8h36v32H6z" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/>'
      + '<path d="M6 30h36" stroke="currentColor" stroke-width="2" opacity=".35"/>'
      + '<circle cx="24" cy="15" r="4.6" fill="#E4587A"/>'
      + '<path d="M17.5 36c0-7 2.8-12.5 6.5-12.5s6.5 5.5 6.5 12.5" fill="#E4587A"/>'
      + '<path d="M24 10.4a4.6 4.6 0 0 1 0 9.2z M24 23.5c3.7 0 6.5 5.5 6.5 12.5H24z" fill="currentColor" opacity=".55"/>'
      + '<path d="M36 14l5-5M38.5 17.5l4.5-1.5" stroke="#4DB6E8" stroke-width="2.2" stroke-linecap="round"/></svg>',

    options: [
      {
        key: 'role', labelKey: 'hide.opt.role', def: 'random',
        choices: ['random', 'hider', 'seeker'].map(k => ({ value: k, labelKey: 'hide.role.' + k }))
      },
      {
        key: 'map', labelKey: 'hide.opt.map', def: 'random',
        choices: ['random'].concat(PV.HideMaps.KEYS).map(k => ({ value: k, labelKey: 'hide.map.' + k, preview: preview }))
      },
      {
        key: 'difficulty', labelKey: 'hide.opt.diff', def: 'normal',
        choices: [
          { value: 'easy', labelKey: 'diff.easy' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'hard', labelKey: 'diff.hard' }
        ]
      }
    ],

    start: (host, ctx) => PV.HideView(ctx)
  });

})(window.PV);
