/* 麻将连连看 / Mahjong Solitaire — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'mahjong',
    family: 'puzzle',
    name: 'Mahjong Solitaire',
    nameZh: '麻将连连看',
    blurb: 'Clear the turtle two tiles at a time — but only the free ones. Every board can be cleared.',
    blurbZh: '两两配对清空龟形牌阵，只有两侧无阻的牌才能取。每一局都保证有解。',
    accent: '#1E7A45',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="8" y="14" width="13" height="19" rx="2.4" fill="#F3EFE4" stroke="#8494A8" stroke-width="1.2"/>'
      + '<rect x="23" y="14" width="13" height="19" rx="2.4" fill="#F3EFE4" stroke="#8494A8" stroke-width="1.2"/>'
      + '<path d="M14.5 20v7M11 23.5h7" stroke="#1E7A45" stroke-width="2.2" stroke-linecap="round"/>'
      + '<circle cx="29.5" cy="23.5" r="3.4" fill="none" stroke="#B3261E" stroke-width="2.2"/></svg>',

    options: [],
    start: (host, ctx) => PV.MahjongView(ctx)
  });

})(window.PV);
