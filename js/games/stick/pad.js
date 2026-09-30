/* 火柴人对决 / Stick Clash — the thumb controls.

   On a touch screen of any size — a tablet, or a phone on its side, is as
   thumb-driven as a phone held upright — the left thumb has a stick and
   the right thumb the buttons:

   - THE STICK comes to where the thumb lands in its half and pushes as the
     keys do: left and right walk (held), down blocks (held), up jumps —
     once a push, as a key pressed and not repeated.
   - THE BUTTONS are attack, special, jump and block, so a direction and a
     button go together: ▶ + ✦ is a special, 🛡 + 👊 an uppercut.

   Under the canvas on the page; over it on the whole screen, where the
   stage is the screen (view.js moves it). Each thumb is its own pointer,
   held by what it touched, so a thumb sliding off a button still holds it
   until it lifts. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const DEAD = 0.3;              // of the stick's reach: under this, no walk
  const UP = 0.6, DOWN = 0.6;    // how far up jumps, and how far down blocks

  /** o: { press(action), release(action) } -> { node, show(on), reset() } */
  PV.StickPad = function (o) {
    const el = PV.el;
    const knob = el('div', { class: 'stk-knob' });
    const base = el('div', { class: 'stk-base' }, knob);
    const zone = el('div', { class: 'stk-zone', 'aria-label': 'stick' }, base);
    const btns = el('div', { class: 'stk-btns' });
    const node = el('div', { class: 'stk-pad' }, zone, btns);
    const letGo = [];

    /* ---- the buttons ---- */

    [
      { label: '🛡', action: 'd1', aria: 'block' },
      { label: '▲', action: 'u1', aria: 'jump' },
      { label: '✦', action: 's1', aria: 'special' },
      { label: '👊', action: 'a1', aria: 'attack' }
    ].forEach(b => {
      const n = el('button', { type: 'button', class: 'stk-b', 'aria-label': b.aria }, b.label);
      let id = null;
      n.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (id !== null) return;
        id = e.pointerId;
        try { n.setPointerCapture(id); } catch (err) { /* a synthetic pointer */ }
        n.classList.add('on');
        o.press(b.action);
      });
      const up = e => {
        if (id === null || (e && e.pointerId !== id)) return;
        id = null;
        n.classList.remove('on');
        o.release(b.action);
      };
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', up);
      n.addEventListener('lostpointercapture', up);
      n.addEventListener('contextmenu', e => e.preventDefault());
      letGo.push(() => up(null));
      btns.appendChild(n);
    });

    /* ---- the stick ---- */

    let sid = null, x0 = 0, y0 = 0, upArmed = true;
    const held = { l1: false, r1: false, d1: false };

    zone.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (sid !== null) return;
      sid = e.pointerId;
      try { zone.setPointerCapture(sid); } catch (err) { /* a synthetic pointer */ }
      const r = zone.getBoundingClientRect();
      x0 = e.clientX; y0 = e.clientY;
      base.style.left = (x0 - r.left) + 'px';
      base.style.top = (y0 - r.top) + 'px';
      zone.classList.add('on');
      move(e);
    });
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', e => e.preventDefault());
    letGo.push(() => end(null));

    function move(e) {
      if (sid === null || e.pointerId !== sid) return;
      const R = base.offsetWidth / 2 || 50;
      let dx = (e.clientX - x0) / R, dy = (e.clientY - y0) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = 'translate(' + (dx * R).toFixed(1) + 'px,' + (dy * R).toFixed(1) + 'px)';
      set('l1', dx < -DEAD);
      set('r1', dx > DEAD);
      set('d1', dy > DOWN);
      // Up jumps once; the stick must come back down past the middle of
      // the way before it jumps again.
      if (dy < -UP) { if (upArmed) { upArmed = false; o.press('u1'); } }
      else if (dy > -UP / 2) upArmed = true;
    }

    /* A held direction is pressed again on every move: a pause, or the
       window losing the focus, lets go of everything the harness holds. */
    function set(a, on) {
      if (on) { held[a] = true; o.press(a); }
      else if (held[a]) { held[a] = false; o.release(a); }
    }

    function end(e) {
      if (sid === null || (e && e.pointerId !== sid)) return;
      sid = null;
      for (const a in held) set(a, false);
      upArmed = true;
      zone.classList.remove('on');
      base.style.left = base.style.top = '';
      knob.style.transform = '';
    }

    return {
      node: node,
      /** Hidden, it keeps its room, so the page does not jump when a fight starts. */
      show(on) { if (!on) this.reset(); node.classList.toggle('off', !on); },
      reset() { letGo.forEach(f => f()); }
    };
  };

})(window.PV);
