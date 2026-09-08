/* 黑白棋 / Reversi — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'reversi',
    family: 'board',
    name: 'Reversi',
    nameZh: '黑白棋',
    blurb: 'Flank a line of your opponent\'s discs and every one of them turns.',
    blurbZh: '两端夹住对手的棋子，中间的全部翻面。',
    accent: '#F6B32B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="7" y="7" width="34" height="34" rx="4" fill="#1E5B43" stroke="currentColor" stroke-width="1.6"/>'
      + '<circle cx="18" cy="18" r="5.2" fill="#0D1218"/><circle cx="30" cy="18" r="5.2" fill="#EAF0F7"/>'
      + '<circle cx="18" cy="30" r="5.2" fill="#EAF0F7"/><circle cx="30" cy="30" r="5.2" fill="#0D1218"/>'
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

    start: (host, ctx) => PV.ReversiView(ctx)
  });

})(window.PV);
