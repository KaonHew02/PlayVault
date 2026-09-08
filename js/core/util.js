/* PlayVault — small DOM and formatting helpers.
   Loaded first; everything in the app hangs off window.PV. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.$ = (sel, root) => (root || document).querySelector(sel);
  PV.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** el('div', {class:'x', onclick:fn}, child, 'text', [more]) */
  PV.el = function (tag, attrs) {
    const n = document.createElement(tag);
    const a = attrs || {};
    for (const k in a) {
      const v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    const kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      for (const kid of list) {
        if (kid == null || kid === false) continue;
        if (Array.isArray(kid)) { add(kid); continue; }
        n.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
      }
    })(kids);
    return n;
  };

  PV.clear = node => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  PV.clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /**
   * How big a game may draw itself, in CSS pixels.
   *
   * One place, so raising the ceiling raises it for every game at once and
   * none is left behind on last year's number. Three classes, because they are
   * the three shapes of screen this is played on:
   *
   *   phone   the whole width, minus the page gutter
   *   laptop  most of the width, capped so a game is not a wall of pixels
   *   desktop a wider cap, but still short of filling a 27" monitor — a board
   *           much past a foot across stops being readable at arm's length
   *
   * `h` is what is left under the topbar, the play heading and the game bar,
   * with more taken off on a phone where the thumb pad sits below the canvas.
   * A game that is taller than this makes the player scroll to see its own
   * board, which is worse than a smaller board.
   */
  PV.stage = function () {
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    const phone = w < 760;
    return {
      phone: phone,
      w: phone ? Math.max(280, w - 24) : Math.min(w - 56, w < 1500 ? 1180 : 1360),
      h: Math.max(280, h - (phone ? 250 : 210))
    };
  };

  /** m:ss, growing to h:mm:ss past the hour. */
  PV.fmtTime = function (ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  PV.fmtNum = n => Number(n || 0).toLocaleString();

  PV.fmtDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString();
  };

  /** Structural equality. Used by the board contract's default isLegal(). */
  PV.deepEqual = function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  };

  PV.clone = v => (typeof structuredClone === 'function'
    ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  /** requestAnimationFrame-safe no-op in the headless smoke shim. */
  PV.raf = cb => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb) : setTimeout(() => cb(Date.now()), 16));
  PV.cancelRaf = id => (typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame(id) : clearTimeout(id));

})(window.PV);
