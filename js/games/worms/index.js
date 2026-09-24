/* 蠕虫竞技场 / Worm Arena — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'worms',
    family: 'arcade',
    name: 'Worm Arena',
    nameZh: '蠕虫竞技场',
    blurb: 'Grow the biggest worm: eat, cut the others off, and swallow everything they drop.',
    blurbZh: '长成最大的蠕虫：吃食物，拦截对手，吞掉他们掉落的一切。',
    accent: '#A3E635',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<g fill="#8BDA4B"><circle cx="9" cy="35" r="4.4"/><circle cx="13" cy="30" r="4.8"/>'
      + '<circle cx="18" cy="26.5" r="5"/><circle cx="24" cy="25" r="5.2"/></g>'
      + '<g fill="#6CC23A"><circle cx="11" cy="32.5" r="4.5"/><circle cx="21" cy="25.5" r="5.1"/></g>'
      + '<circle cx="30" cy="25.5" r="6.4" fill="#8BDA4B"/>'
      + '<circle cx="31.2" cy="22.4" r="2.6" fill="#fff"/><circle cx="33.4" cy="27" r="2.6" fill="#fff"/>'
      + '<circle cx="32" cy="22.6" r="1.3" fill="#1B1726"/><circle cx="34.2" cy="27.2" r="1.3" fill="#1B1726"/>'
      + '<circle cx="40" cy="14" r="3.4" fill="#FF6FAE"/><circle cx="40" cy="14" r="1.2" fill="#A8662C"/>'
      + '<circle cx="15" cy="12" r="2.6" fill="#FFD166"/>'
      + '<circle cx="42" cy="34" r="2.4" fill="#35A7FF"/></svg>',

    options: [
      {
        // The reference's three: Infinity, Time and Treasure Hunter.
        key: 'mode', labelKey: 'worms.mode', def: 'endless',
        choices: [
          { value: 'endless', labelKey: 'worms.mode.endless' },
          { value: 'time', labelKey: 'worms.mode.time' },
          { value: 'treasure', labelKey: 'worms.mode.treasure' }
        ]
      },
      {
        key: 'crowd', labelKey: 'worms.crowd', def: 'normal',
        choices: [
          { value: 'quiet', labelKey: 'worms.crowd.quiet' },
          { value: 'normal', labelKey: 'worms.crowd.normal' },
          { value: 'busy', labelKey: 'worms.crowd.busy' }
        ]
      }
    ],

    start: (host, ctx) => PV.WormsView(ctx)
  });

})(window.PV);
