/* 人潮冲锋 / Crowd Rush — registration. */
(function (PV) {
  'use strict';

  PV.Registry.add({
    code: 'crowd',
    family: 'arcade',
    name: 'Crowd Rush',
    nameZh: '人潮冲锋',
    blurb: 'Level by level in 3D: grow a crowd through the gates, beat the red squads, climb the stairs as a human tower or bring down the king.',
    blurbZh: '一关一关的 3D 人潮冲锋：穿过倍增之门，打败红色人群，叠成人塔爬上阶梯，或者击倒国王。',
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
        // Levels, one after another, or a course and a difficulty picked by
        // hand. Not offered in a room: a race is everyone on one course, and
        // everyone's level is their own.
        key: 'play', labelKey: 'crowd.play', def: 'levels', solo: true,
        choices: [
          { value: 'levels', labelKey: 'crowd.levels' },
          { value: 'free', labelKey: 'crowd.free' }
        ]
      },
      {
        key: 'course', labelKey: 'crowd.course', def: 'ice',
        showIf: (o, inRoom) => inRoom || o.play === 'free',
        choices: PV.CrowdCourse.keys.map(k => ({
          value: k, labelKey: 'crowd.' + k, tag: '★'.repeat(PV.CrowdCourse.tierOf(k))
        }))
      },
      {
        key: 'difficulty', labelKey: 'crowd.diff', def: 'normal',
        showIf: (o, inRoom) => inRoom || o.play === 'free',
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
