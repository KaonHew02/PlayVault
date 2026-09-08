/* 五子棋 / Gomoku — registration.

   Everything this game needs lives in js/games/gomoku/. The lobby, the
   statistics screen and the save format all follow from this one call. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'gomoku',
    family: 'board',
    name: 'Gomoku',
    nameZh: '五子棋',
    blurb: 'Five in a row on a 15×15 board. Easy to learn, hard to stop.',
    blurbZh: '在 15×15 的棋盘上连成五子。规则简单，越下越上瘾。',
    accent: '#F6B32B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<g stroke="currentColor" stroke-width="1.4" opacity=".45">'
      + '<path d="M10 10h28M10 19h28M10 28h28M10 37h28M10 10v27M19 10v27M28 10v27M37 10v27"/></g>'
      + '<circle cx="19" cy="19" r="4.4" fill="#0D1218" stroke="#6A7B93" stroke-width="1"/>'
      + '<circle cx="28" cy="28" r="4.4" fill="#E8EDF4"/>'
      + '<circle cx="28" cy="19" r="4.4" fill="#0D1218" stroke="#6A7B93" stroke-width="1"/>'
      + '</svg>',

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

    start: (host, ctx) => PV.GomokuView(ctx)
  });

})(window.PV);
