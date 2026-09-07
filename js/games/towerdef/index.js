/* 塔防 / Tower Defense — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'towerdef',
    family: 'arcade',
    name: 'Tower Defense',
    nameZh: '塔防',
    blurb: 'Twenty waves, three towers, twenty lives. Hold the line.',
    blurbZh: '二十波敌人，三种防御塔，二十条命。守住防线。',
    accent: '#F59E0B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M8 36h32" stroke="currentColor" stroke-width="2" opacity=".45"/>'
      + '<path d="M14 36V20l5-4 5 4v16Z" fill="#8494A8"/>'
      + '<path d="M14 20h10M16.5 16v-3h5v3" fill="none" stroke="#8494A8" stroke-width="2"/>'
      + '<circle cx="33" cy="29" r="5" fill="#F6B32B"/>'
      + '<path d="M28 36h10" stroke="#F6B32B" stroke-width="2.6" stroke-linecap="round"/></svg>',

    options: [
      {
        key: 'map', labelKey: 'td.map', def: 'meadow',
        choices: [
          { value: 'meadow', labelKey: 'td.meadow' },
          { value: 'canyon', labelKey: 'td.canyon' }
        ]
      }
    ],

    start: (host, ctx) => PV.TowerDefView(ctx)
  });

})(window.PV);
