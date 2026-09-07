/* 赛车 / Racing — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'racing',
    family: 'arcade',
    name: 'Racing',
    nameZh: '赛车',
    blurb: 'Top-down circuits against three rivals. Stay on the asphalt — the grass is slow.',
    blurbZh: '俯视视角绕圈竞速，与三名对手同场。别开出赛道，草地上跑不快。',
    accent: '#F87171',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M10 32c0-8 5-16 14-16s14 8 14 16" fill="none" stroke="currentColor" '
      + 'stroke-width="2" opacity=".45"/>'
      + '<rect x="17" y="20" width="14" height="20" rx="4" fill="#D8443B"/>'
      + '<rect x="20" y="24" width="8" height="6" rx="1.6" fill="#0D1218" opacity=".55"/>'
      + '<rect x="14" y="23" width="4" height="7" rx="1.4" fill="#0D1218"/>'
      + '<rect x="30" y="23" width="4" height="7" rx="1.4" fill="#0D1218"/></svg>',

    options: [
      {
        key: 'track', labelKey: 'racing.track', def: 'ring',
        choices: [
          { value: 'ring', labelKey: 'racing.ring' },
          { value: 'circuit', labelKey: 'racing.circuit' }
        ]
      },
      {
        key: 'laps', labelKey: 'racing.laps', def: '3',
        choices: [
          { value: '2', labelKey: 'racing.laps2' },
          { value: '3', labelKey: 'racing.laps3' },
          { value: '5', labelKey: 'racing.laps5' }
        ]
      }
    ],

    start: (host, ctx) => PV.RacingView(ctx)
  });

})(window.PV);
