/* 蜘蛛纸牌 / Spider Solitaire — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'spider',
    family: 'puzzle',
    name: 'Spider Solitaire',
    nameZh: '蜘蛛纸牌',
    blurb: 'Two decks, ten columns, eight runs to send home. One suit to learn on, four to be beaten by.',
    blurbZh: '两副牌、十列牌面，凑齐八条 K 到 A。一种花色入门，四种花色见真章。',
    accent: '#6D5BD0',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="6" y="13" width="16" height="23" rx="3" fill="#EAF0F7" stroke="#8494A8" '
      + 'stroke-width="1.2" transform="rotate(-9 14 24)"/>'
      + '<rect x="16" y="12" width="16" height="23" rx="3" fill="#FFFFFF" stroke="#8494A8" '
      + 'stroke-width="1.2"/>'
      + '<path d="M24 19l3.1 3.3c1.2 1.3 1.2 3.1 0 4.2-1.1 1.1-2.7 .9-3.1-.2-.4 1.1-2 1.3-3.1.2-1.2-1.1-1.2-2.9 0-4.2L24 19Z" '
      + 'fill="#141922"/>'
      + '<g stroke="#6D5BD0" stroke-width="1.3" fill="none" stroke-linecap="round">'
      + '<path d="M44 6H32M44 6v12M44 6l-8.5 8.5"/>'
      + '<path d="M38 6a6 6 0 0 1 6 6"/><path d="M33 6a11 11 0 0 1 11 11"/>'
      + '<path d="M38 13v13"/><path d="M35 27l-3-2M35 31l-3 2M41 27l3-2M41 31l3 2"/></g>'
      + '<circle cx="38" cy="29" r="3.2" fill="#6D5BD0"/></svg>',

    options: [
      {
        key: 'suits', labelKey: 'spider.suitsLabel', def: '1',
        choices: [
          { value: '1', labelKey: 'spider.suits1' },
          { value: '2', labelKey: 'spider.suits2' },
          { value: '4', labelKey: 'spider.suits4' }
        ]
      }
    ],

    start: (host, ctx) => PV.SpiderView(ctx)
  });

})(window.PV);
