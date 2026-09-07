/* 贪吃蛇 / Snake — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'snake',
    family: 'arcade',
    name: 'Snake',
    nameZh: '贪吃蛇',
    blurb: 'Eat, grow, and run out of room.',
    blurbZh: '吃掉食物，越长越长，直到无路可走。',
    accent: '#34D399',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M12 34h12a6 6 0 0 0 0-12h-6a6 6 0 0 1 0-12h12" fill="none" stroke="#34D399" '
      + 'stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="34" cy="10" r="3.4" fill="#F6B32B"/></svg>',

    options: [
      {
        key: 'speed', labelKey: 'snake.speed', def: 'normal',
        choices: [
          { value: 'calm', labelKey: 'snake.calm' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'fast', labelKey: 'snake.fast' }
        ]
      },
      {
        key: 'walls', labelKey: 'snake.edges', def: 'walls',
        choices: [
          { value: 'walls', labelKey: 'snake.solid' },
          { value: 'wrap', labelKey: 'snake.wrap' }
        ]
      }
    ],

    start: (host, ctx) => PV.SnakeView(ctx)
  });

})(window.PV);
