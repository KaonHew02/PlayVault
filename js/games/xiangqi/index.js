/* 中国象棋 / Xiangqi — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'xiangqi',
    family: 'board',
    name: 'Chinese Chess',
    nameZh: '中国象棋',
    blurb: 'River, palace, and a cannon that needs a screen to fire.',
    blurbZh: '楚河汉界，九宫困将，炮要隔子才能打。',
    accent: '#B3261E',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="7" y="7" width="34" height="34" rx="4" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" opacity=".5"/>'
      + '<circle cx="24" cy="24" r="11" fill="#F6EAD2" stroke="#B3261E" stroke-width="1.8"/>'
      + '<text x="24" y="29" font-size="13" text-anchor="middle" font-family="serif" '
      + 'font-weight="700" fill="#B3261E">帥</text></svg>',

    options: [
      {
        key: 'mode', labelKey: 'gomoku.mode', def: 'ai', solo: true,
        choices: [
          { value: 'ai', labelKey: 'gomoku.vsAI' },
          { value: 'hotseat', labelKey: 'gomoku.hotseat' }
        ]
      },
      {
        key: 'level', labelKey: 'common.difficulty', def: 'normal',
        showIf: o => o.mode !== 'hotseat',
        choices: [
          { value: 'easy', labelKey: 'diff.easy' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'hard', labelKey: 'diff.hard' }
        ]
      }
    ],

    start: (host, ctx) => PV.XiangqiView(ctx)
  });

})(window.PV);
