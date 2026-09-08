/* 卡丁车 / Kart Racing — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'racing',
    family: 'arcade',
    name: 'Kart Racing',
    nameZh: '卡丁车',
    blurb: 'Three rivals, item boxes and a drift worth learning. The grass is slow and the shells are not.',
    blurbZh: '三名对手、满地道具箱，还有值得练的漂移。草地很慢，龟壳很快。',
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
      },
      {
        key: 'kart', labelKey: 'racing.kart', def: 'medium',
        choices: [
          { value: 'light', labelKey: 'racing.light' },
          { value: 'medium', labelKey: 'racing.medium' },
          { value: 'heavy', labelKey: 'racing.heavy' }
        ]
      }
    ],

    start: (host, ctx) => PV.RacingView(ctx)
  });

})(window.PV);
