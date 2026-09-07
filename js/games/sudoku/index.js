/* Sudoku — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'sudoku',
    family: 'puzzle',
    name: 'Sudoku',
    nameZh: '数独',
    blurb: 'One of each digit in every row, column and box. Every puzzle has exactly one answer.',
    blurbZh: '每行、每列、每宫都填入 1–9 各一次。每道题都只有唯一解。',
    accent: '#F6B32B',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<rect x="7" y="7" width="34" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>'
      + '<g stroke="currentColor" stroke-width="1.6" opacity=".55">'
      + '<path d="M18.3 7v34M29.6 7v34M7 18.3h34M7 29.6h34"/></g>'
      + '<text x="12.6" y="17" font-size="9" font-family="system-ui, sans-serif" font-weight="700" fill="#F6B32B">5</text>'
      + '<text x="24" y="28.4" font-size="9" font-family="system-ui, sans-serif" font-weight="700" fill="#F6B32B">3</text>'
      + '<text x="35" y="39.6" font-size="9" font-family="system-ui, sans-serif" font-weight="700" fill="#F6B32B">7</text>'
      + '</svg>',

    options: [
      {
        key: 'difficulty', labelKey: 'common.difficulty', def: 'normal',
        choices: [
          { value: 'easy', labelKey: 'diff.easy' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'hard', labelKey: 'diff.hard' },
          { value: 'expert', labelKey: 'diff.expert' }
        ]
      }
    ],

    start: (host, ctx) => PV.SudokuView(ctx)
  });

})(window.PV);
