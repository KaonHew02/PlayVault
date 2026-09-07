/* 接龙 / Klondike Solitaire — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'solitaire',
    family: 'puzzle',
    name: 'Solitaire',
    nameZh: '接龙',
    blurb: 'Klondike, draw one or draw three. Deals are checked winnable before you see them.',
    blurbZh: '经典克朗代克接龙，可选翻一张或三张。发牌前先验证有解。',
    accent: '#D8443B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="9" y="12" width="17" height="24" rx="3" fill="#EAF0F7" stroke="#8494A8" '
      + 'stroke-width="1.2" transform="rotate(-10 17 24)"/>'
      + '<rect x="21" y="12" width="17" height="24" rx="3" fill="#FFFFFF" stroke="#8494A8" '
      + 'stroke-width="1.2" transform="rotate(8 29 24)"/>'
      + '<path d="M29 20l3.4 3.6c1.3 1.4 1.3 3.4 0 4.6-1.2 1.2-3 1-3.4-.2-.4 1.2-2.2 1.4-3.4.2-1.3-1.2-1.3-3.2 0-4.6L29 20Z" '
      + 'fill="#D8443B"/></svg>',

    options: [
      {
        key: 'draw', labelKey: 'solitaire.drawLabel', def: '1',
        choices: [
          { value: '1', labelKey: 'solitaire.draw1' },
          { value: '3', labelKey: 'solitaire.draw3' }
        ]
      }
    ],

    start: (host, ctx) => PV.SolitaireView(ctx)
  });

})(window.PV);
