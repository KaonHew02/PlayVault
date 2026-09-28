/* 街头大厨 / Street Chef — registration.

   No option sheet: the trucks, the levels and the kitchen are the game's
   own lobby (ui.js). A race with friends takes its truck from the room's
   seed, so a room needs nothing chosen either. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'chef',
    family: 'arcade',
    name: 'Street Chef',
    nameZh: '街头大厨',
    blurb: 'Run a food truck: cook, plate and serve before the customers lose patience. Seventeen streets of forty levels — 680 in all — and a kitchen to upgrade on every truck.',
    blurbZh: '经营一辆美食餐车：在顾客失去耐心之前烹饪、装盘、上菜。十七条街、每条四十关，共 680 关，每辆餐车都有可以升级的厨房。',
    accent: '#F07A26',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M5 14h27v20H5z" fill="#F07A26"/>'
      + '<path d="M32 20h6l5 7v7H32z" fill="#C85F16"/>'
      + '<path d="M34 22h4l3 5h-7z" fill="#BFE6F7"/>'
      + '<path d="M8 18h20v8H8z" fill="#2B2F36"/>'
      + '<path d="M6 11h25l-1 4H7z" fill="#FFF3DC"/>'
      + '<path d="M9 11v4M14 11v4M19 11v4M24 11v4M29 11v4" stroke="#D93A2E" stroke-width="2.6"/>'
      + '<circle cx="12" cy="35" r="4" fill="#23252A"/><circle cx="37" cy="35" r="4" fill="#23252A"/>'
      + '<circle cx="12" cy="35" r="1.6" fill="#C3CBD4"/><circle cx="37" cy="35" r="1.6" fill="#C3CBD4"/>'
      + '<path d="M13 25c0-3 2-4.5 5-4.5s5 1.5 5 4.5z" fill="#F3C54F"/>'
      + '<circle cx="18" cy="22.4" r="1.5" fill="#D7301F"/></svg>',

    options: [],

    start: (host, ctx) => PV.ChefView(ctx)
  });

})(window.PV);
