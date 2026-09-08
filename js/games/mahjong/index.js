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
    // A face-down tile leaning behind an upright 红中, drawn the way the board
    // draws a tile: a darker slab underneath for the thickness, the face
    // offset up off it. The old icon was a green plus and a red ring — a
    // first-aid cross next to a zero, which is not a mahjong tile.
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<g transform="rotate(-11 15 26)">'
      + '<rect x="6" y="14" width="18" height="26" rx="3" fill="#17603A"/>'
      + '<rect x="6" y="11.6" width="18" height="26" rx="3" fill="#1E7A45"/>'
      + '<rect x="8.7" y="14.3" width="12.6" height="20.6" rx="2" fill="none" '
      + 'stroke="#4FBF85" stroke-width="1.3"/></g>'
      + '<rect x="22" y="11" width="20" height="29" rx="3.2" fill="#C9BC9C"/>'
      + '<rect x="22" y="8.5" width="20" height="29" rx="3.2" fill="#F7F1E1" '
      + 'stroke="rgba(0,0,0,.28)" stroke-width="1"/>'
      + '<rect x="27.6" y="18" width="8.8" height="10" fill="none" stroke="#B3261E" stroke-width="2.3"/>'
      + '<path d="M32 13.5v19" stroke="#B3261E" stroke-width="2.3" stroke-linecap="round"/></svg>',

    options: [],
    start: (host, ctx) => PV.MahjongView(ctx)
  });

})(window.PV);
