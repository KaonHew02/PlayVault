/* 人潮冲锋 / Crowd Rush — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'crowd',
    family: 'arcade',
    name: 'Crowd Rush',
    nameZh: '人潮冲锋',
    blurb: 'Run a crowd of stickmen through the gates that double it, and storm the keep.',
    blurbZh: '带着你的小人潮穿过增益之门，越滚越多，最后攻下城堡。',
    accent: '#3B82F6',
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true">'
      + '<path d="M6 40h36" stroke="currentColor" stroke-width="2" opacity=".4"/>'
      + '<g fill="none" stroke="#3B82F6" stroke-width="2.4" stroke-linecap="round">'
      + '<path d="M14 40v-6M14 34l-3 4M14 34l3 4M14 30v4"/>'
      + '<path d="M22 40v-8M22 32l-4 5M22 32l4 5M22 27v5"/>'
      + '<path d="M30 40v-6M30 34l-3 4M30 34l3 4M30 30v4"/></g>'
      + '<circle cx="14" cy="27" r="2.6" fill="#3B82F6"/>'
      + '<circle cx="22" cy="24" r="3" fill="#3B82F6"/>'
      + '<circle cx="30" cy="27" r="2.6" fill="#3B82F6"/>'
      + '<path d="M38 12h6v9h-6z" fill="#F6B32B"/>'
      + '<path d="M38 12V9l3 1.5L44 9v3" fill="#F6B32B"/></svg>',

    options: [
      {
        key: 'course', labelKey: 'crowd.course', def: 'fields',
        choices: PV.CrowdCourse.keys.map(k => ({
          value: k, labelKey: 'crowd.' + k, tag: '\u2605'.repeat(PV.CrowdCourse.tierOf(k))
        }))
      },
      {
        key: 'difficulty', labelKey: 'crowd.diff', def: 'normal',
        choices: [
          { value: 'easy', labelKey: 'diff.easy' },
          { value: 'normal', labelKey: 'diff.normal' },
          { value: 'hard', labelKey: 'diff.hard' }
        ]
      }
    ],

    start: (host, ctx) => PV.CrowdRushView(ctx)
  });

})(window.PV);
