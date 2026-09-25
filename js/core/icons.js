/* PlayVault — the few line icons the shell draws, and the pill button that
   carries one.

   The glyphs are Bootstrap Icons 1.11.3 (MIT licence, (c) The Bootstrap
   Authors, https://icons.getbootstrap.com) — the same five MoneyFlow, FinSim
   and PlanSphere put on these same buttons, so the backup row looks the same
   in every one of those apps. They are copied in as path data rather than
   loaded as the icon font the others use, because this page's CSP loads
   fonts and styles from itself only.

   Built with createElementNS, never innerHTML, so SECURITY.md's "the only
   innerHTML writes the game icons" stays true. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  /* name -> its paths on a 16×16 grid; `odd` is fill-rule="evenodd". */
  const ICONS = {
    sync: [   // bi-arrow-repeat
      { d: 'M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41m-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9' },
      { odd: true, d: 'M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5 5 0 0 0 8 3M3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9z' }
    ],
    cloudUp: [   // bi-cloud-arrow-up
      { odd: true, d: 'M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708z' },
      { d: 'M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383m.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z' }
    ],
    cloudDown: [   // bi-cloud-arrow-down
      { odd: true, d: 'M7.646 10.854a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L8.5 9.293V5.5a.5.5 0 0 0-1 0v3.793L6.354 8.146a.5.5 0 1 0-.708.708z' },
      { d: 'M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383m.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z' }
    ],
    download: [   // bi-download
      { d: 'M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5' },
      { d: 'M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z' }
    ],
    upload: [   // bi-upload
      { d: 'M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5' },
      { d: 'M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708z' }
    ]
  };

  /** A 16-unit line icon drawn in the text colour around it, or null. */
  PV.icon = function (name) {
    const paths = ICONS[name];
    if (!paths) return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const p of paths) {
      const path = document.createElementNS(NS, 'path');
      if (p.odd) path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('d', p.d);
      svg.appendChild(path);
    }
    return svg;
  };

  /**
   * A pill: an icon, then its label in a span of its own, so a busy label
   * ("Saving…") can stand in for it without losing the icon.
   */
  PV.pill = function (icon, label, attrs) {
    return PV.el('button', Object.assign({ class: 'btn ghost pill' }, attrs),
      PV.icon(icon), PV.el('span', {}, label));
  };

})(window.PV);
