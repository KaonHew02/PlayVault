/* 蠕虫竞技场 / Worm Arena — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'worms',
    family: 'arcade',
    name: 'Worm Arena',
    nameZh: '蠕虫竞技场',
    blurb: 'Swallow pellets, cut off a bigger worm, and eat everything it drops.',
    blurbZh: '吞食光点，别人撞上你就爆成食物，抢过来就是你的。',
    accent: '#A3E635',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M9 38c0-10 6-16 13-16 5 0 8 3 8 6.5S27 34 24 33" fill="none" stroke="#A3E635" '
      + 'stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="24" cy="33" r="5" fill="#A3E635"/>'
      + '<circle cx="22.4" cy="31.4" r="1.5" fill="#101820"/>'
      + '<circle cx="25.8" cy="32.2" r="1.5" fill="#101820"/>'
      + '<circle cx="34" cy="13" r="3" fill="#F6B32B"/>'
      + '<circle cx="14" cy="12" r="2.4" fill="#38BDF8"/>'
      + '<circle cx="42" cy="25" r="2.2" fill="#F87171"/></svg>',

    options: [
      {
        key: 'crowd', labelKey: 'worms.crowd', def: 'normal',
        choices: [
          { value: 'quiet', labelKey: 'worms.quiet' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'busy', labelKey: 'worms.busy' }
        ]
      }
    ],

    start: (host, ctx) => PV.WormsView(ctx)
  });

})(window.PV);
