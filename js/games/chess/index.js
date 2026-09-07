/* Chess — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'chess',
    family: 'board',
    name: 'Chess',
    nameZh: '国际象棋',
    blurb: 'The full game — castling, en passant, promotion, the lot.',
    blurbZh: '完整规则：王车易位、吃过路兵、兵的升变，一样不少。',
    accent: '#F6B32B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M24 9c-3 0-5 2-5 4.4 0 1.5.8 2.6 1.8 3.4-2 1-3.4 2.8-3.4 5.2h13.2c0-2.4-1.4-4.2-3.4-5.2 '
      + '1-.8 1.8-1.9 1.8-3.4C29 11 27 9 24 9Z" fill="currentColor"/>'
      + '<path d="M17 24h14l-1.6 9H18.6L17 24Z" fill="currentColor"/>'
      + '<rect x="14" y="34" width="20" height="5" rx="1.8" fill="currentColor"/></svg>',

    options: [
      {
        key: 'mode', labelKey: 'gomoku.mode', def: 'ai',
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

    start: (host, ctx) => PV.ChessView(ctx)
  });

})(window.PV);
