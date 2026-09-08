/* Tetris — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'tetris',
    family: 'arcade',
    name: 'Tetris',
    nameZh: '俄罗斯方块',
    blurb: 'Seven shapes, ten columns, no way to win. 7-bag, SRS kicks, hold and ghost.',
    blurbZh: '七种方块，十列井道，永无止境。7-bag 随机、SRS 旋转、暂存与落点提示。',
    accent: '#31C7EF',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="8" y="8" width="10" height="10" rx="1.6" fill="#31C7EF"/>'
      + '<rect x="19" y="8" width="10" height="10" rx="1.6" fill="#AD4D9C"/>'
      + '<rect x="19" y="19" width="10" height="10" rx="1.6" fill="#AD4D9C"/>'
      + '<rect x="30" y="19" width="10" height="10" rx="1.6" fill="#EF7921"/>'
      + '<rect x="8" y="30" width="10" height="10" rx="1.6" fill="#42B642"/>'
      + '<rect x="19" y="30" width="10" height="10" rx="1.6" fill="#42B642"/>'
      + '</svg>',

    options: [],
    start: (host, ctx) => PV.TetrisView(ctx)
  });

})(window.PV);
