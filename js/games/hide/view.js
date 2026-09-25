/* 变色躲猫猫 / Blend In — view.

   Glue between the loop harness and everything this game draws, hears and
   reads from the player:

   - TWO CANVASES, as in Strike Squad: WebGL underneath (scene.js), the
     harness's own 2D canvas on top for the HUD (hud.js), and the panels as
     DOM over both (ui.js).
   - A HIDER is seen from behind, the camera orbiting on the mouse; WASD
     walk the way the camera looks. A SEEKER looks down the barrel of a
     water gun, or over its shoulder if the menu says so.
   - PAINT MODE (E) lets the mouse go: a click or a drag on your body lays
     paint where the pointer is, a drag anywhere else turns the camera, the
     wheel zooms. The brush is sent to the engine as a dab on the REST pose
     (body.js), spaced along the stroke so a fast drag is still a line.
     Pick takes the colour of whatever is clicked next: a wall, a floor,
     anybody's paint.
   - FREECAM (Q) flies the camera off on its own to see yourself as a
     seeker would; LOCK (F) holds you perfectly still; V picks a pose.
   - ON A PHONE the left thumb walks, the right thumb looks, and the bar's
     buttons are the keys.

   Coins and experience are banked when a round ends (meta.js). A race
   with friends skips the lobby and banks nothing, as every race here does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const D = PV.HideData, B = PV.HideBody;
  const DEG = Math.PI / 180;
  const SETTINGS = 'hide.settings';

  /* The device's own settings: not sealed, not in the backup. */
  PV.Store.validate(SETTINGS, v => {
    const s = PV.Safe.obj(v);
    if (!s) return undefined;
    return { sens: PV.Safe.num(s.sens, 0.2, 3, 1), vol: PV.Safe.num(s.vol, 0, 1, 0.7), third: PV.Safe.bool(s.third), fov: PV.Safe.int(s.fov, 60, 100, 80) };
  });
  const loadSettings = () => PV.Store.get(SETTINGS, null) || { sens: 1, vol: 0.7, third: false, fov: 80 };

  const MOVE = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'slow', ShiftRight: 'slow', Space: 'jump', KeyC: 'down', ControlLeft: 'down' };

  PV.HideView = function (ctx) {
    const HOLD = PV.HideGame.HOLD;
    const opts = ctx.opts || {};
    const racing = !!ctx.race;
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    let meta = PV.HideMeta.load();
    const settings = loadSettings();
    const audio = PV.HideAudio(settings);

    let ui = null, scene = null, glCanvas = null, broken = false, panels = null, box = null;
    const keys = Object.create(null);
    let mouseFire = false, locked = false, pendYaw = 0, pendPitch = 0, unYaw = 0, unPitch = 0, lastTick = -1, sentHold = -1;
    let stickSent = [0, 0];
    // Modes.
    let painting = false, picking = false, posing = false, menu = false, free = false;
    let fc = null;                                 // freecam: { x, y, z, yaw, pitch }
    let dist = 3.3, camNow = null, lastNow = 0, seen = 0, stroke = null, drag = null, hover = null, rotDrag = null;
    let bank = null, lastPhase = null, roleSel = null;
    const flash = Object.create(null);
    // Touch.
    const touches = new Map();
    let stick = null, tlook = null;
    const st = { feed: [], toast: null, hitT: 0, brush: null, dropper: null, prompt: null, foundBy: '' };

    function saveSettings() { PV.Store.set(SETTINGS, settings); audio.setVolume(settings.vol); }
    function toast(s, col) { st.toast = { text: s, col: col, age: 0 }; }

    /* ---- modes ---- */

    function game() { return ui && ui.game; }
    function canPaint() { const g = game(); return !!g && g.canPaint(g.me) && g.phase !== 'result'; }
    function canHide() { const g = game(); return !!g && !g.me.found && g.me.role !== 'seeker' && g.phase !== 'result'; }

    function setPaint(on) {
      painting = !!on && canPaint();
      picking = false;
      if (painting) { posing = false; release(); }
      panels.showPaint(painting);
      panels.showPoses(false);
      panels.pickMode(false);
      stroke = null;
    }
    function setPoses(on) {
      const g = game();
      posing = !!on && canHide() && !(g && g.me.climb);
      if (posing) { painting = false; panels.showPaint(false); release(); }
      panels.showPoses(posing, g ? g.poses : [], g ? g.me.pose : 'stand');
    }
    function setMenu(on) {
      menu = !!on;
      if (menu) release();
      panels.showMenu(menu, racing);
      if (!menu && ui && !ui.paused && !painting && !posing) grab();
    }
    function setFree(on) {
      const g = game();
      free = !!on && !!g && (g.me.role !== 'seeker' || g.me.found);
      if (free && camNow) fc = { x: camNow.x, y: camNow.y, z: camNow.z, yaw: camNow.yaw, pitch: camNow.pitch };
      toast(free ? '🎥 ' + t('hide.toast.free') : '🎥 ' + t('hide.toast.back'));
    }
    function onKey(k) {
      audio.init();
      const g = game();
      if (!g) return;
      if (k === 'paint') { setPaint(!painting); if (!painting && !menu) grab(); }
      else if (k === 'pose') { setPoses(!posing); if (!posing && !menu) grab(); }
      else if (k === 'free') setFree(!free);
      else if (k === 'lock') { if (canHide() && g.phase !== 'lobby') ui.input('lock'); }
      else if (k === 'menu') setMenu(!menu);
      audio.click();
    }

    /* ---- the pointer ---- */

    function grab() {
      if (!ui || touch || painting || posing || menu) return;
      const g = game();
      if (!g || g.isOver() || g.phase === 'lobby' && panels && !lobbyFolded()) return;
      try { const p = ui.canvas.requestPointerLock && ui.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not now */ }
    }
    function release() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
    function lobbyFolded() { const n = panels && panels.node.querySelector('.hide-lobby'); return !n || n.hidden || n.classList.contains('folded'); }

    function typing(e) { const tg = e.target && e.target.tagName; return tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT'; }
    function live() { return !!(ui && ui.canvas.isConnected && ui.game && !ui.game.isOver()); }

    function onKeyDown(e) {
      if (!live() || typing(e)) return;
      const g = game();
      const c = e.code;
      if (c === 'KeyE') { e.preventDefault(); if (!e.repeat) onKey('paint'); return; }
      if (c === 'KeyV') { e.preventDefault(); if (!e.repeat) onKey('pose'); return; }
      if (c === 'KeyQ') { e.preventDefault(); if (!e.repeat) onKey('free'); return; }
      if (c === 'KeyF') { e.preventDefault(); if (!e.repeat) onKey('lock'); return; }
      if (c === 'KeyO' || (c === 'Escape' && (painting || posing || menu))) {
        e.preventDefault();
        if (c === 'Escape' && (painting || posing)) { setPaint(false); setPoses(false); return; }
        if (!e.repeat) onKey('menu');
        return;
      }
      if (posing && /^Digit[1-9]$/.test(c)) { const p = D.POSES[Number(c.slice(5)) - 1]; if (p) choosePose(p.id); e.preventDefault(); return; }
      const m = MOVE[c];
      if (!m) return;
      e.preventDefault();
      keys[m] = true;
      if (m === 'jump' && !e.repeat && !ui.paused && !painting && !free && g.phase !== 'intro') ui.input('jump');
    }
    function onKeyUp(e) { const m = MOVE[e.code]; if (m) keys[m] = false; }
    function onMouseMove(e) {
      if (!live() || ui.paused) return;
      if (locked) {
        const k = 0.0022 * settings.sens;
        look(e.movementX * k, -e.movementY * k);
        return;
      }
      if (rotDrag) {
        const k = 0.006 * settings.sens;
        look((e.clientX - rotDrag.x) * k, -(e.clientY - rotDrag.y) * k);
        rotDrag.x = e.clientX; rotDrag.y = e.clientY;
      }
    }
    function look(dy, dp) {
      if (free && fc) { fc.yaw += dy; fc.pitch = Math.max(-1.5, Math.min(1.5, fc.pitch + dp)); return; }
      pendYaw += dy; pendPitch += dp;
    }
    function onMouseDown(e) {
      if (!locked || !live()) return;
      if (e.button === 0) mouseFire = true;
    }
    function onMouseUp(e) {
      if (e.button === 0) mouseFire = false;
      if (e.button === 0 || e.button === 2) rotDrag = null;
      if (stroke) { stroke = null; if (panels) panels.remember(panels.color); }
    }
    function onWheel(e) {
      if (!live()) return;
      const g = game();
      if (g.me.role === 'seeker' && !settings.third && !g.me.found && g.phase !== 'lobby') return;
      e.preventDefault();
      dist = Math.max(1.4, Math.min(7, dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    }
    function onLock() {
      locked = !!ui && document.pointerLockElement === ui.canvas;
      if (!locked) { mouseFire = false; for (const k in keys) keys[k] = false; }
    }
    function onBlur() { for (const k in keys) keys[k] = false; mouseFire = false; rotDrag = null; stroke = null; }
    function noMenu(e) { e.preventDefault(); }

    /* ---- the canvas: painting, picking, turning, grabbing ---- */

    function point(e) { const r = ui.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }

    /** What is under a point on the screen: a body (with where on it), or
        the world, or nothing. */
    function under(px, py) {
      const g = game();
      if (!scene || !g) return null;
      const r = scene.rayAt(px, py);
      const w = g.world;
      const tw = w.ray(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 80);
      const wh = w.hit.box ? { nx: w.hit.nx, ny: w.hit.ny, nz: w.hit.nz } : null;
      let best = null, bt = tw;
      for (const a of g.actors) {
        if (a.found || (a === g.me && camNow && camNow.first)) continue;
        const mats = scene.renderMats(a, lastAl, null);
        const hit = B.rayBody(mats, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, bt);
        if (hit && hit.t < bt) { bt = hit.t; best = { actor: a, hit: hit }; }
      }
      if (best) return best;
      if (!wh) return null;
      w.ray(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 80);
      const col = w.colourAt(r.ox + r.dx * tw, r.oy + r.dy * tw, r.oz + r.dz * tw, [0, 0, 0]);
      return col ? { world: true, col: col } : null;
    }
    let lastAl = 1;

    function dabAt(hit) {
      const q = hit.rest, c = panels.color;
      ui.input({ paint: [q[0], q[1], q[2], q[3], q[4], q[5], panels.brush, c[0], c[1], c[2]] });
      audio.swish();
    }
    /** A stroke from the last dab to this one: dabs a third of a brush
        apart along the rest pose, so a quick drag is still a line. */
    function strokeTo(hit) {
      const q = hit.rest;
      if (stroke && stroke.last && stroke.part === hit.part) {
        const p = stroke.last, d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), step = Math.max(0.006, panels.brush * 0.35);
        const n = Math.min(24, Math.floor(d / step));
        for (let i = 1; i <= n; i++) {
          const k = i / (n + 1);
          const m = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
          const nn = [p[3] + (q[3] - p[3]) * k, p[4] + (q[4] - p[4]) * k, p[5] + (q[5] - p[5]) * k];
          const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
          const c = panels.color;
          ui.input({ paint: [m[0], m[1], m[2], nn[0] / l, nn[1] / l, nn[2] / l, panels.brush, c[0], c[1], c[2]] });
        }
      }
      dabAt(hit);
      stroke.last = q.slice(); stroke.part = hit.part;
    }

    function onCanvasDown(e) {
      if (!ui) return;
      audio.init();
      const g = game();
      if (!g || g.isOver()) return;
      if (e.pointerType !== 'mouse' && touch && !painting) { touchDown(e); return; }
      if (ui.paused) { ui.pause(); return; }
      const p = point(e);
      if (painting || picking) {
        e.preventDefault();
        if (e.button === 2) { rotDrag = { x: e.clientX, y: e.clientY }; return; }
        const u = under(p.x, p.y);
        if (picking) {
          if (u) {
            const col = u.world ? u.col : (() => { const k = u.hit.texel * 3, a = u.actor; return a.role === 'seeker' ? D.SEEKER.slice() : [a.paint[k], a.paint[k + 1], a.paint[k + 2]]; })();
            panels.setColor(col);
            toast('💧 ' + t('hide.toast.picked'));
            audio.pick();
          }
          picking = false; panels.pickMode(false);
          return;
        }
        if (u && u.actor === g.me) { stroke = { last: null }; try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } strokeTo(u.hit); return; }
        rotDrag = { x: e.clientX, y: e.clientY };
        return;
      }
      if (posing) { setPoses(false); }
      if (!locked) grab();
    }
    function onCanvasMove(e) {
      if (!ui) return;
      if (e.pointerType !== 'mouse' && touch && !painting) { touchMove(e); return; }
      const g = game();
      if (!g) return;
      const p = point(e);
      hover = { x: p.x, y: p.y };
      if (painting && stroke) {
        const u = under(p.x, p.y);
        if (u && u.actor === g.me) strokeTo(u.hit);
        else stroke.last = null;
      }
    }
    function onCanvasUp(e) {
      if (e.pointerType !== 'mouse' && touch && !painting) { touchUp(e); return; }
      if (stroke) { stroke = null; panels.remember(panels.color); }
      rotDrag = null;
    }
    function onCanvasLeave() { hover = null; }

    /* ---- the thumbs ---- */

    function touchDown(e) {
      e.preventDefault();
      const p = point(e);
      try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      const g = game();
      if (g.me.role === 'seeker' && p.x > p.w * 0.72 && p.y > p.h * 0.55) { touches.set(e.pointerId, { kind: 'fire', x: p.x, y: p.y }); mouseFire = true; return; }
      if (p.x > p.w * 0.72 && p.y > p.h * 0.3 && p.y < p.h * 0.55) { touches.set(e.pointerId, { kind: 'jump' }); ui.input('jump'); return; }
      if (p.x < p.w * 0.45 && !stick) { stick = { id: e.pointerId, x0: p.x, y0: p.y, dx: 0, dy: 0 }; touches.set(e.pointerId, { kind: 'stick' }); }
      else touches.set(e.pointerId, { kind: 'look', x: p.x, y: p.y });
    }
    function touchMove(e) {
      const tch = touches.get(e.pointerId);
      if (!tch || !ui) return;
      const p = point(e);
      if (tch.kind === 'stick' && stick) {
        const R = Math.min(p.w, p.h) * 0.1;
        let dx = (p.x - stick.x0) / R, dy = (p.y - stick.y0) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        stick.dx = dx; stick.dy = dy;
      } else if (tch.kind === 'look' || tch.kind === 'fire') {
        const k = 0.006 * settings.sens;
        look((p.x - tch.x) * k, -(p.y - tch.y) * k);
        tch.x = p.x; tch.y = p.y;
      }
    }
    function touchUp(e) {
      const tch = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      if (!tch) return;
      if (tch.kind === 'stick') stick = null;
      if (tch.kind === 'fire') mouseFire = false;
    }

    /* ---- sending the controls ---- */

    function holdBits(g) {
      if (painting || posing || menu || (free && !g.me.found)) return 0;
      let h = 0;
      if (keys.fwd) h |= HOLD.fwd;
      if (keys.back) h |= HOLD.back;
      if (keys.left) h |= HOLD.left;
      if (keys.right) h |= HOLD.right;
      if (keys.slow) h |= HOLD.slow;
      if (keys.jump) h |= HOLD.jump;
      if (mouseFire && (locked || touch)) h |= HOLD.fire;
      return h;
    }

    function send(g) {
      if (g.tick !== lastTick) { unYaw = 0; unPitch = 0; lastTick = g.tick; }
      if (ui.paused || g.isOver()) { sentHold = -1; pendYaw = pendPitch = 0; return; }
      const h = g.me.found ? 0 : holdBits(g) || 0;
      if (h !== sentHold) { ui.input({ hold: h }); sentHold = h; }
      const sv = stick && !free ? [stick.dx, -stick.dy] : [0, 0];
      if (sv[0] !== stickSent[0] || sv[1] !== stickSent[1]) { ui.input({ move: sv }); stickSent = sv; }
      if (pendYaw || pendPitch) {
        ui.input({ look: [pendYaw, pendPitch] });
        unYaw += pendYaw; unPitch += pendPitch;
        pendYaw = pendPitch = 0;
      }
    }

    function choosePose(id) {
      const g = game();
      if (!g || g.poses.indexOf(id) < 0) return;
      ui.input({ pose: id });
      setPoses(false);
      toast(D.POSE[id].icon + ' ' + t('hide.pose.' + id));
      grab();
    }

    /* ---- what happened ---- */

    function readEvents(g) {
      const me = g.me, out = [];
      for (const e of g.events) {
        if (e.s <= seen) continue;
        seen = e.s;
        out.push(e);
        switch (e.k) {
          case 'spray': { const a = g.actors[e.a]; if (a) audio.spray(a.x, a.y + 1.3, a.z, a === me); break; }
          case 'splash': audio.splash(e.x, e.y, e.z); break;
          case 'hit':
            audio.hit(e.x, e.y, e.z);
            if (e.a === me.id) st.hitT = 0.3;
            flash[e.v] = 0.6;
            break;
          case 'found': {
            const a = g.actors[e.a], v = g.actors[e.v];
            audio.found(e.x, e.y, e.z);
            st.feed.unshift({ text: '💦 ' + t('hide.feed', { a: a ? a.name : '?', v: v ? v.name : '?' }), age: 0, mine: e.a === me.id || e.v === me.id });
            if (st.feed.length > 5) st.feed.pop();
            if (e.v === me.id) { st.foundBy = a ? a.name : ''; setPaint(false); setPoses(false); setFree(true); }
            break;
          }
          case 'fill': if (e.a === me.id) { audio.fill(); toast('🪣 ' + t('hide.toast.filled')); } break;
          case 'lock': if (e.a === me.id) toast(e.on ? '🔒 ' + t('hide.toast.locked') : '🔓 ' + t('hide.toast.unlocked')); break;
          case 'jump': case 'climb': case 'mantle': if (e.a === me.id) audio.step(me.x, me.y, me.z); break;
          case 'count': audio.beep(e.hunt ? 520 : 660, 0.08, 0.1); break;
          case 'phase':
            if (e.p === 'hunt') { audio.horn(me.role === 'seeker'); toast(me.role === 'seeker' ? '👀 ' + t('hide.toast.go') : '🙊 ' + t('hide.toast.coming'), me.role === 'seeker' ? 'rgba(201,55,58,0.92)' : null); }
            if (e.p === 'hide') { toast(me.role === 'seeker' ? '👀 ' + t('hide.hud.warmUp') : '🎨 ' + t('hide.toast.hide')); if (me.role === 'hider' && !touch) grab(); }
            break;
          case 'end': audio.horn(g.myResult() === 'win'); release(); break;
        }
      }
      return out;
    }

    /* ---- the camera ---- */

    function camera(g, al, dt, W, Hh) {
      const me = g.me, w = g.world;
      const vfov = 2 * Math.atan(Math.tan(settings.fov * DEG / 2) / Math.max(0.6, W / Hh) * (W / Hh > 1.2 ? 1.25 : 1));
      if (g.phase === 'intro' || (g.phase === 'result' && !free)) {
        // Round the map, high up, looking in.
        const k = (g.tick / D.HZ) * 0.09, cx = w.mapW / 2, cz = w.mapD / 2, R = Math.max(w.mapW, w.mapD) * 0.36;
        const x = cx + Math.sin(k) * R, z = cz + Math.cos(k) * R * 0.8;
        return { x: x, y: w.sky ? 11 : 3.9, z: z, yaw: Math.atan2(cx - x, -(cz - z)), pitch: w.sky ? -0.62 : -0.32, fov: 70 * DEG, first: false };
      }
      if (free && fc) {
        const f = PV.HideGame.dir(fc.yaw, fc.pitch), r = [Math.cos(fc.yaw), 0, Math.sin(fc.yaw)];
        const sp = (keys.slow ? 2.5 : 6) * dt;
        let mx = 0, my = 0, mz = 0;
        if (keys.fwd) { mx += f[0]; my += f[1]; mz += f[2]; }
        if (keys.back) { mx -= f[0]; my -= f[1]; mz -= f[2]; }
        if (keys.right) { mx += r[0]; mz += r[2]; }
        if (keys.left) { mx -= r[0]; mz -= r[2]; }
        if (keys.jump) my += 1;
        if (keys.down) my -= 1;
        if (stick) { mx += (f[0] * -stick.dy + r[0] * stick.dx); mz += (f[2] * -stick.dy + r[2] * stick.dx); }
        fc.x = Math.max(0.3, Math.min(w.W - 0.3, fc.x + mx * sp));
        fc.y = Math.max(0.3, Math.min(8, fc.y + my * sp));
        fc.z = Math.max(0.3, Math.min(w.D - 0.3, fc.z + mz * sp));
        return { x: fc.x, y: fc.y, z: fc.z, yaw: fc.yaw, pitch: fc.pitch, fov: vfov, first: false };
      }
      const x = me.px + (me.x - me.px) * al, y = me.py + (me.y - me.py) * al, z = me.pz + (me.z - me.pz) * al;
      const yaw = me.lookYaw + unYaw, pitch = Math.max(-1.45, Math.min(1.45, me.lookPitch + unPitch));
      const firstPerson = me.role === 'seeker' && !settings.third && g.phase !== 'lobby';
      if (firstPerson) {
        return { x: x, y: y + g.eye(me) - me.y, z: z, yaw: yaw, pitch: pitch, fov: vfov, first: true };
      }
      // Over the shoulder: round a point at the chest, pulled in from walls.
      const top = me.climb ? 1.1 : Math.max(0.5, Math.min(1.35, (D.POSE[me.pose] || D.POSES[0]).top * 0.8));
      const tx = x, ty = y + top, tz = z;
      const p = Math.max(-1.2, Math.min(1.1, pitch));
      const f = PV.HideGame.dir(yaw, p);
      const d = me.role === 'seeker' ? Math.min(dist, 2.6) : dist;
      const side = me.role === 'seeker' ? 0.45 : 0;
      const ox = tx + Math.cos(yaw) * side, oz = tz + Math.sin(yaw) * side;
      const back = Math.max(0.35, Math.min(d, w.ray(ox, ty, oz, -f[0], -f[1], -f[2], d + 0.3) - 0.25));
      const cam = { x: ox - f[0] * back, y: ty - f[1] * back, z: oz - f[2] * back, yaw: yaw, pitch: p, fov: vfov, first: false };
      if (painting) {
        // Frame the body clear of the paint panel: above it on a phone,
        // where the panel is along the bottom; left of it otherwise.
        if (PV.stage().phone) cam.pitch -= Math.atan2(0.62 * Math.min(1, back / 3), back);
        else cam.yaw += Math.atan2(0.5 * Math.min(1, back / 3), back);
      }
      return cam;
    }

    /* ---- the harness ---- */

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {},
      pad: null,

      create: () => {
        meta = PV.HideMeta.load();
        return new PV.HideGame({
          seed: ctx.seed(), map: opts.map, role: opts.role, difficulty: opts.difficulty,
          autostart: racing, name: (PV.Profile && PV.Profile.name()) || t('common.you'),
          poses: racing ? D.FREE_POSES : meta.poses
        });
      },

      onReset(g) {
        seen = g.seq; sentHold = -1; lastTick = -1; unYaw = unPitch = pendYaw = pendPitch = 0;
        painting = picking = posing = menu = free = false; fc = null; stroke = null; bank = null; lastPhase = null;
        if (roleSel && g.phase === 'lobby') g.input({ role: roleSel });
        st.feed.length = 0; st.toast = null; st.foundBy = '';
        dist = 3.3;
        meta = PV.HideMeta.load();
        if (panels) { panels.showPaint(false); panels.showPoses(false); panels.showMenu(false); panels.showResults(false); panels.showIntro(false); }
        if (ui) ui.status.textContent = t('hide.map.' + g.mapKey) + ' · ' + t('diff.' + (opts.difficulty || 'normal'));
      },

      fit(availW, availH) {
        if (box && document.fullscreenElement === box) return { w: window.innerWidth, h: window.innerHeight };
        if (PV.stage().phone) {
          const w = Math.max(280, availW);
          return { w: w, h: Math.round(Math.max(340, Math.min(availH + 60, w * 1.3))) };
        }
        let w = Math.min(availW, 1280), h = w * 0.5625;
        if (h > availH + 40) { h = availH + 40; w = h / 0.5625; }
        return { w: Math.round(Math.max(320, w)), h: Math.round(Math.max(220, h)) };
      },

      build(api) {
        ui = api;
        box = api.canvas.parentElement;
        box.classList.add('hide-box');
        api.canvas.classList.add('hide-hud');
        glCanvas = PV.el('canvas', { class: 'hide-gl' });
        box.insertBefore(glCanvas, api.canvas);
        try { scene = PV.HideScene(glCanvas); } catch (e) { scene = null; broken = true; }
        glCanvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); broken = true; });
        panels = PV.HideUI({
          settings: settings, touch: touch, meta: meta,
          game: () => ui && ui.game,
          getMeta: () => meta,
          onKey: onKey,
          onColor: () => {},
          onBrush: () => {},
          onPick: () => { picking = !picking; panels.pickMode(picking); if (picking) toast('💧 ' + t('hide.toast.pickHint')); },
          onFill: c => { ui.input({ fill: c.slice() }); },
          onReset: () => { ui.input('reset'); toast('🧽 ' + t('hide.toast.reset')); },
          onPose: id => choosePose(id),
          onSettings: () => saveSettings(),
          onRestart: () => { setMenu(false); const b = api.status.parentElement.querySelector('.bar-actions .btn:last-child'); if (b) b.click(); },
          onPlay: () => { audio.init(); ui.input('start'); panels.showLobby(false); },
          onRole: r => { roleSel = r; ui.input({ role: r }); },
          roleNow: () => roleSel || (ui.game && ui.game.roleWant),
          onBuyPose: id => { const ok = PV.HideMeta.shop.buyPose(meta, id); if (ok) { audio.pick(); meta = PV.HideMeta.load(); ui.game.poses = meta.poses.slice(); } return ok; },
          onBlaster: id => {
            const own = meta.blasters.indexOf(id) >= 0;
            const ok = own ? PV.HideMeta.shop.equip(meta, id) : PV.HideMeta.shop.buyBlaster(meta, id);
            if (ok) { audio.pick(); meta = PV.HideMeta.load(); }
            return ok;
          }
        });
        box.appendChild(panels.node);
        const full = PV.el('button', {
          class: 'btn ghost', onclick: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
          }
        }, '⛶ ' + t('hide.fullscreen'));
        api.status.parentElement.querySelector('.bar-actions').prepend(full);
        api.below.appendChild(PV.el('p', { class: 'muted small' }, touch ? t('hide.touchHelp') : t('hide.keysHelp')));
        const c = api.canvas;
        c.addEventListener('pointerdown', onCanvasDown);
        c.addEventListener('pointermove', onCanvasMove);
        c.addEventListener('pointerup', onCanvasUp);
        c.addEventListener('pointercancel', onCanvasUp);
        c.addEventListener('pointerleave', onCanvasLeave);
        c.addEventListener('contextmenu', noMenu);
        c.addEventListener('wheel', onWheel, { passive: false });
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('pointerlockchange', onLock);
        window.addEventListener('blur', onBlur);
      },

      onDestroy() {
        release();
        if (ui) {
          const c = ui.canvas;
          c.removeEventListener('pointerdown', onCanvasDown);
          c.removeEventListener('pointermove', onCanvasMove);
          c.removeEventListener('pointerup', onCanvasUp);
          c.removeEventListener('pointercancel', onCanvasUp);
          c.removeEventListener('pointerleave', onCanvasLeave);
          c.removeEventListener('contextmenu', noMenu);
          c.removeEventListener('wheel', onWheel);
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('pointerlockchange', onLock);
        window.removeEventListener('blur', onBlur);
        if (document.fullscreenElement === box) document.exitFullscreen().catch(() => {});
        if (scene) scene.destroy();
        scene = null;
        audio.destroy();
      },

      onRelabel(api) {
        const g = api.game;
        if (g) api.status.textContent = t('hide.map.' + g.mapKey) + ' · ' + t('diff.' + (opts.difficulty || 'normal'));
        if (panels) panels.relabel();
      },

      draw(c, g, geom, api, alpha) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016;
        lastNow = now;
        lastAl = alpha;
        c.clearRect(0, 0, geom.w, geom.h);
        if (!scene || broken) {
          c.fillStyle = '#1B2330';
          c.fillRect(0, 0, geom.w, geom.h);
          PV.HideHud.text(c, t('hide.noGL'), geom.w / 2, geom.h / 2, Math.max(12, geom.w * 0.024), '#EAF0F7', 'center');
          return;
        }
        if (glCanvas.style.width !== geom.w + 'px') { glCanvas.style.width = geom.w + 'px'; glCanvas.style.height = geom.h + 'px'; }
        scene.resize(geom.w, geom.h, Math.min(1.5, window.devicePixelRatio || 1));
        const me = g.me;

        // Phase changes: panels in and out.
        if (g.phase !== lastPhase) {
          lastPhase = g.phase;
          panels.showLobby(g.phase === 'lobby' && !racing);
          panels.showIntro(g.phase === 'intro', g);
          if (g.phase !== 'result') panels.showResults(false);
          if (g.phase === 'intro') { setPaint(false); setPoses(false); free = false; }
          if (g.phase === 'hunt' && me.role === 'seeker' && !touch) grab();
          if (g.phase === 'result') {
            setPaint(false); setPoses(false); free = false;
            if (!racing && !bank) { bank = PV.HideMeta.bank(meta, g); meta = PV.HideMeta.load(); }
            panels.showResults(true, g, racing ? null : bank);
          }
        }
        if (api.paused || g.isOver()) release();
        if ((painting || posing) && !canPaint() && painting) setPaint(false);
        if (posing && !canHide()) setPoses(false);

        send(g);
        const list = readEvents(g);
        const cam = camera(g, alpha, dt, geom.w, geom.h);
        camNow = cam;
        audio.listen(cam.x, cam.y, cam.z, cam.yaw);
        for (const k in flash) { flash[k] -= dt * 2.5; if (flash[k] <= 0) delete flash[k]; }
        const walk = Math.hypot(me.x - me.px, me.z - me.pz) * D.HZ;
        const v = {
          al: alpha, dt: dt, now: now / 1000, events: list, flash: flash,
          gun: me.role === 'seeker' && !me.found, blaster: meta.blaster,
          bob: me.walk, kick: me.fireT > 0 ? me.fireT / 5 : 0,
          outline: -1, walk: walk
        };
        scene.frame(g, cam, v);

        // The HUD's view of this frame.
        for (const f of st.feed) f.age += dt;
        st.feed = st.feed.filter(f => f.age < 4.5);
        if (st.toast) { st.toast.age += dt; if (st.toast.age > 2.2) st.toast = null; }
        st.hitT = Math.max(0, st.hitT - dt);
        st.first = cam.first;
        st.freecam = free;
        st.project = (x, y, z) => scene.project(x, y, z);
        st.visible = a => g.world.clear(cam.x, cam.y, cam.z, a.x, a.y + 1.4, a.z);
        st.barUp = !!(ui && panels);
        st.shade = g.phase === 'intro' ? 0.35 : 0;
        // The brush, where it would land.
        st.brush = null; st.dropper = null;
        if ((painting || picking) && hover) {
          if (picking) st.dropper = hover;
          else {
            const u = under(hover.x, hover.y);
            if (u && u.actor === me) {
              const pr = scene.project(u.hit.x, u.hit.y, u.hit.z);
              const r = pr ? panels.brush / pr.d * geom.h / (2 * Math.tan(cam.fov / 2)) : 6;
              const col = panels.color;
              st.brush = { x: hover.x, y: hover.y, r: r, col: 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')' };
            }
          }
        }
        st.prompt = !touch && !locked && !api.paused && !painting && !posing && !menu && !free && !me.found
          && (g.phase === 'hide' || g.phase === 'hunt' || (g.phase === 'lobby' && lobbyFolded())) ? t('hide.clickToPlay') : null;
        PV.HideHud.draw(c, g, geom, st);

        // The bar's buttons for who you are now.
        const which = [];
        if (g.phase !== 'intro' && g.phase !== 'result') {
          if (me.role !== 'seeker' || me.found) which.push('free');
          if (canHide()) { which.push('pose'); }
          if (canPaint()) which.push('paint');
          if (canHide() && g.phase !== 'lobby') which.push('lock');
          which.push('menu');
        }
        panels.bar(which.length > 0, which, { paint: painting, pose: posing, free: free, lock: me.lock, menu: menu });
      },

      outcome(g) {
        release();
        const me = g.me;
        const res = g.myResult() || 'lose';
        const hiders = g.hiders(), found = hiders.filter(a => a.found).length;
        const b = bank || (racing ? { xp: 0, coins: 0, levelUp: 0 } : PV.HideMeta.bank(meta, g));
        bank = b;
        const title = me.role === 'seeker'
          ? (g.result === 'seekers' ? t('hide.end.allFound') : t('hide.end.escaped'))
          : (me.found ? t('hide.end.caught') : t('hide.end.survived'));
        return {
          result: res,
          score: g.myScore(),
          xp: Math.round(20 + (res === 'win' ? 40 : 0) + me.stats.finds * 10),
          tone: res === 'win' ? 'good' : 'bad',
          title: title,
          againLabel: racing ? undefined : t('hide.nextRound'),
          lines: [
            t('hide.map.' + g.mapKey) + ' · ' + t('hide.foundOf', { n: found, of: hiders.length }),
            me.role === 'seeker' ? t('hide.line.finds', { n: me.stats.finds }) : t('hide.line.lasted', { s: Math.round((me.found ? me.stats.survived : g.huntT) / D.HZ) }),
            racing ? null : t('hide.line.earned', { xp: b.xp, coins: b.coins }),
            b.levelUp ? t('hide.line.levelUp', { n: b.levelUp }) : null,
            '@best'
          ]
        };
      }
    });
  };

})(window.PV);
