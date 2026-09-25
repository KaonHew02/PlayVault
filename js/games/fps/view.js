/* 突击小队 / Strike Squad — view.

   Glue between the loop harness and everything this game draws, hears and
   reads from the player:

   - TWO CANVASES, as in Crowd Rush: WebGL underneath (scene.js), the
     harness's own 2D canvas on top for the HUD (hud.js), and the lobby as
     a panel over both while the match waits (lobby.js).
   - THE MOUSE is captured (pointer lock) by a click on the game. Its
     movement is sent to the engine as look input once a frame, and the
     camera shows what has been sent but not yet applied, so the aim
     answers the hand at the screen's own rate, not the tick's. Losing the
     capture — Esc, another window — pauses the match.
   - THE KEYS are the reference's: WASD, Space, Shift, C, R, 1 2 3, 4 5 6,
     Q for a grenade, E to plant or defuse, G to take a gun off the floor,
     Tab for the scoreboard, P to pause, the right button or V to aim.
     Held keys go to the engine as one bit mask whenever it changes.
   - ON A PHONE there is no pointer to capture: the left thumb drags a
     stick that appears where it lands, the right thumb drags to look, and
     the buttons on the glass are the rest of the keyboard.

   Coins, rank and missions are banked when a match ends (meta.js). A race
   with friends uses stock guns and banks nothing, as every race here does. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const D = PV.FpsData;
  const DEG = Math.PI / 180;
  const SETTINGS = 'fps.settings';

  /* The device's own settings: not sealed, not in the backup. */
  PV.Store.validate(SETTINGS, v => {
    const s = PV.Safe.obj(v);
    if (!s) return undefined;
    return {
      sens: PV.Safe.num(s.sens, 0.2, 3, 1), fov: PV.Safe.int(s.fov, 70, 110, 95),
      vol: PV.Safe.num(s.vol, 0, 1, 0.7), mute: PV.Safe.bool(s.mute), invert: PV.Safe.bool(s.invert)
    };
  });
  const loadSettings = () => PV.Store.get(SETTINGS, null) || { sens: 1, fov: 95, vol: 0.7, mute: false, invert: false };

  const KEYS = {
    KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'crouch', ControlLeft: 'crouch', KeyE: 'use', KeyV: 'ads'
  };
  const TAPS = {
    Space: 'jump', KeyR: 'reload', Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', KeyQ: 'nade',
    Digit4: 'skill0', Digit5: 'skill1', Digit6: 'skill2', KeyG: 'pick', KeyF: 'slot2'
  };

  PV.FpsView = function (ctx) {
    const HOLD = PV.FpsGame.HOLD;
    const opts = ctx.opts || {};
    const racing = !!ctx.race;
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    let meta = PV.FpsMeta.load();
    const settings = loadSettings();
    const audio = PV.FpsAudio(settings);

    let ui = null, scene = null, glCanvas = null, broken = false, lobby = null, box = null;
    // Input.
    const keys = Object.create(null);
    let mouseFire = false, mouseAds = false, locked = false, board = false;
    let pendYaw = 0, pendPitch = 0, unYaw = 0, unPitch = 0, lastTick = -1, sentHold = -1;
    let stickSent = [0, 0];
    // Touch.
    const touches = new Map();
    let stick = null, pad = [], adsToggle = false, crouchToggle = false;
    const touchHeld = { fire: false, fire2: false, ads: false, use: false };
    // What the HUD shows.
    const st = {
      feed: [], medals: [], pops: [], hurts: [], hitT: 0, hitHead: false, hitKill: false,
      icon: PV.FpsArt.paintGun, touch: touch, touchHeld: touchHeld, stick: null, lastRound: null
    };
    let seen = 0, lastNow = 0, camY = null, wasAlive = true, steps = Object.create(null);
    let lobbyCam = 0;

    function saveSettings() { PV.Store.set(SETTINGS, settings); audio.setVolume(settings.vol, settings.mute); }

    function cfg() {
      const g = ui && ui.game;
      return { mode: g ? g.modeKey : 'tdm', map: g ? g.mapKey : 'depot', diff: opts.difficulty || 'normal' };
    }

    /* ---- starting a match ---- */

    function deploy() {
      const g = ui && ui.game;
      if (!g || g.phase !== 'lobby') return;
      audio.init();
      g.setLoadout(PV.FpsMeta.loadout(meta));
      ui.input('start');
      if (lobby) lobby.show(false);
      if (!touch) grab();
    }

    function grab() {
      if (!ui || touch) return;
      const c = ui.canvas;
      try {
        const p = c.requestPointerLock && c.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* not allowed right now: the prompt stays up */ }
    }
    function release() {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    }

    /* ---- the keyboard and the mouse ---- */

    function active() { return !!(ui && ui.canvas.isConnected && ui.game && ui.game.phase !== 'lobby' && !ui.game.isOver()); }
    function typing(e) { const tg = e.target && e.target.tagName; return tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT'; }

    function onKeyDown(e) {
      if (!active() || typing(e)) return;
      if (e.code === 'Tab') { e.preventDefault(); board = true; return; }
      const hold = KEYS[e.code];
      const tap = TAPS[e.code];
      if (!hold && !tap) return;
      e.preventDefault();
      if (hold) keys[hold] = true;
      if (tap && !e.repeat && !ui.paused) ui.input(tap);
    }
    function onKeyUp(e) {
      if (e.code === 'Tab') { board = false; return; }
      const hold = KEYS[e.code];
      if (hold) keys[hold] = false;
    }
    function onMouseMove(e) {
      if (!locked || !active() || ui.paused) return;
      const g = ui.game, me = g.me, gun = me.inv[me.cur];
      const zoom = gun && gun.s.cat !== 'melee' ? 1 + (gun.s.zoom - 1) * me.adsT : 1;
      const k = 0.0022 * settings.sens / Math.pow(zoom, 0.85);
      pendYaw += (e.movementX || 0) * k;
      pendPitch += -(e.movementY || 0) * k * (settings.invert ? -1 : 1);
    }
    function onMouseDown(e) {
      if (!locked || !active()) return;
      if (e.button === 0) mouseFire = true;
      else if (e.button === 2) mouseAds = true;
    }
    function onMouseUp(e) {
      if (e.button === 0) mouseFire = false;
      else if (e.button === 2) mouseAds = false;
    }
    let wheelT = 0;
    function onWheel(e) {
      if (!locked || !active()) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelT < 120) return;
      wheelT = now;
      ui.input(e.deltaY > 0 ? 'next' : 'prev');
    }
    function onLock() {
      locked = !!ui && document.pointerLockElement === ui.canvas;
      if (!locked) { mouseFire = mouseAds = false; for (const k in keys) keys[k] = false; }
      // Losing the mouse mid-fight is a pause, not a free minute for the bots.
      if (!locked && ui && active() && !ui.paused && !touch) ui.pause();
    }
    function onBlur() { for (const k in keys) keys[k] = false; mouseFire = mouseAds = false; board = false; }
    function noMenu(e) { e.preventDefault(); }

    function onCanvasDown(e) {
      if (!ui) return;
      if (e.pointerType !== 'mouse' && touch) { touchDown(e); return; }
      const g = ui.game;
      if (!g || g.phase === 'lobby' || g.isOver()) return;
      if (ui.paused) ui.pause();
      if (!locked) grab();
      audio.init();
    }

    /* ---- the thumbs ---- */

    function point(e) {
      const r = ui.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    }
    function touchDown(e) {
      const g = ui.game;
      if (!g || g.phase === 'lobby') return;
      e.preventDefault();
      audio.init();
      const p = point(e);
      try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* already captured */ }
      for (const b of pad) {
        if (Math.hypot(p.x - b.x, p.y - b.y) > b.r) continue;
        const id = b.id;
        if (id === 'pause') { ui.pause(); return; }
        if (ui.paused) { ui.pause(); return; }
        touches.set(e.pointerId, { kind: 'btn', id: id, x: p.x, y: p.y });
        if (id === 'fire' || id === 'fire2') touchHeld[id] = true;
        else if (id === 'use') touchHeld.use = true;
        else if (id === 'ads') { adsToggle = !adsToggle; touchHeld.ads = adsToggle; }
        else if (id === 'crouch') crouchToggle = !crouchToggle;
        else if (id === 'jump') ui.input('jump');
        else if (id === 'reload') ui.input('reload');
        else if (id === 'swap') ui.input('next');
        else if (id === 'nade') ui.input('nade');
        else if (id === 'pick') ui.input('pick');
        else if (id.indexOf('skill') === 0) ui.input(id);
        return;
      }
      if (ui.paused) { ui.pause(); return; }
      if (p.x < p.w * 0.45 && !stick) {
        stick = { id: e.pointerId, x0: p.x, y0: p.y, dx: 0, dy: 0 };
        touches.set(e.pointerId, { kind: 'stick' });
      } else {
        touches.set(e.pointerId, { kind: 'look', x: p.x, y: p.y });
      }
    }
    function touchMove(e) {
      const tch = touches.get(e.pointerId);
      if (!tch || !ui) return;
      const p = point(e);
      if (tch.kind === 'stick' && stick) {
        const R = Math.min(p.w, p.h) * 0.09;
        let dx = (p.x - stick.x0) / R, dy = (p.y - stick.y0) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        stick.dx = dx; stick.dy = dy;
      } else if (tch.kind === 'look' || (tch.kind === 'btn' && (tch.id === 'fire' || tch.id === 'fire2'))) {
        const g = ui.game, me = g.me, gun = me.inv[me.cur];
        const zoom = gun && gun.s.cat !== 'melee' ? 1 + (gun.s.zoom - 1) * me.adsT : 1;
        const k = 0.0055 * settings.sens / Math.pow(zoom, 0.85);
        pendYaw += (p.x - tch.x) * k;
        pendPitch += -(p.y - tch.y) * k * (settings.invert ? -1 : 1);
        tch.x = p.x; tch.y = p.y;
      }
    }
    function touchUp(e) {
      const tch = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      if (!tch) return;
      if (tch.kind === 'stick') stick = null;
      else if (tch.kind === 'btn') {
        if (tch.id === 'fire' || tch.id === 'fire2') touchHeld[tch.id] = false;
        if (tch.id === 'use') touchHeld.use = false;
      }
    }

    /* ---- sending the controls ---- */

    function holdBits() {
      let h = 0;
      if (keys.fwd) h |= HOLD.fwd;
      if (keys.back) h |= HOLD.back;
      if (keys.left) h |= HOLD.left;
      if (keys.right) h |= HOLD.right;
      if (keys.sprint) h |= HOLD.sprint;
      if (keys.crouch || crouchToggle) h |= HOLD.crouch;
      if (mouseFire || touchHeld.fire || touchHeld.fire2) h |= HOLD.fire;
      if (mouseAds || keys.ads || (touch && adsToggle)) h |= HOLD.ads;
      if (keys.use || touchHeld.use) h |= HOLD.use;
      if (stick && -stick.dy > 0.93) h |= HOLD.sprint;
      return h;
    }

    function send(game) {
      if (game.tick !== lastTick) { unYaw = 0; unPitch = 0; lastTick = game.tick; }
      if (ui.paused || game.phase === 'lobby' || game.isOver()) { sentHold = -1; pendYaw = pendPitch = 0; return; }
      const h = holdBits();
      if (h !== sentHold) { ui.input({ hold: h }); sentHold = h; }
      const sv = stick ? [stick.dx, -stick.dy] : [0, 0];
      if (sv[0] !== stickSent[0] || sv[1] !== stickSent[1]) { ui.input({ move: sv }); stickSent = sv; }
      if (pendYaw || pendPitch) {
        ui.input({ look: [pendYaw, pendPitch] });
        unYaw += pendYaw; unPitch += pendPitch;
        pendYaw = pendPitch = 0;
      }
    }

    /* ---- what happened ---- */

    function medal(text, col, pts) {
      st.medals.push({ text: text, col: col, pts: pts, age: 0 });
      if (st.medals.length > 4) st.medals.shift();
    }

    function readEvents(game) {
      const me = game.me, out = [];
      for (const e of game.events) {
        if (e.s <= seen) continue;
        seen = e.s;
        out.push(e);
        const a = e.a != null && e.a >= 0 ? game.actors[e.a] : null;
        const mine = a === me;
        switch (e.k) {
          case 'shot': {
            const w = D.W[e.w];
            audio.shot(PV.FpsAudio.kindOf(w), e.q, e.x, e.y, e.z, mine);
            break;
          }
          case 'melee': audio.knife(a && a.x, a && a.y, a && a.z, mine); break;
          case 'reload': audio.reload(mine, a && a.x, a && a.y, a && a.z, e.shell); break;
          case 'shell': if (mine) audio.shell(); break;
          case 'dry': if (mine) audio.dry(); break;
          case 'swap': if (mine) audio.swap(); break;
          case 'land': if (mine) audio.land(true); break;
          case 'bounce': audio.bounce(e.x, e.y, e.z); break;
          case 'boom': audio.boom(e.x, e.y, e.z, e.big); break;
          case 'beep': audio.beep(1850, 0.07, 0.12); break;
          case 'hit':
            if (mine && e.v !== me.id) {
              st.hitT = 0.25; st.hitHead = e.head; st.hitKill = e.left <= 0;
              if (e.left > 0) audio.hit(e.head, false);
            }
            if (e.v === me.id && e.a !== me.id) {
              const src = a || { x: me.hurtX, z: me.hurtZ };
              st.hurts.push({ dir: Math.atan2(src.x - me.x, -(src.z - me.z)), age: 0 });
              if (st.hurts.length > 6) st.hurts.shift();
              audio.hurt();
            }
            break;
          case 'kill':
            st.feed.unshift({ a: e.a, v: e.v, w: e.w, head: e.head, age: 0 });
            if (st.feed.length > 6) st.feed.pop();
            if (mine && e.v !== me.id) { audio.hit(e.head, true); st.pops.push({ n: e.head ? 125 : 100, age: 0 }); }
            break;
          case 'assist': if (mine) st.pops.push({ n: 50, age: 0 }); break;
          case 'medal':
            if (mine) { medal(t('fps.medal.' + e.m), e.m === 'revenge' || e.m === 'first' ? '#FF8A5A' : '#FFD35A'); audio.chime(true); }
            break;
          case 'rung':
            if (mine) { medal(t('fps.newGun', { gun: e.w.toUpperCase() }), '#7FE0FF'); audio.chime(true); }
            break;
          case 'demote':
            if (e.v === me.id) { medal(t('fps.demoted'), '#FF6A5A'); audio.chime(false); }
            else if (mine) medal(t('fps.medal.blade'), '#FFD35A');
            break;
          case 'cap':
            medal(t(e.t === me.team ? 'fps.capWe' : 'fps.capThey', { p: 'ABC'[e.p] }), e.t === me.team ? '#7FE0A0' : '#FF6A5A');
            audio.beep(e.t === me.team ? 990 : 440, 0.15, 0.14);
            break;
          case 'flag': {
            const ours = e.f === me.team;
            const key = 'fps.flag.' + e.k + (ours ? 'Ours' : 'Theirs');
            medal(t(key, { name: a ? a.name : '' }), ours === (e.k === 'return' || e.k === 'back') ? '#7FE0A0' : '#FF6A5A');
            audio.beep(e.k === 'cap' ? 1200 : 700, 0.18, 0.14);
            break;
          }
          case 'bomb':
            if (e.k === 'plant' || e.k === 'defuse' || e.k === 'drop' || e.k === 'take' || e.k === 'boom') {
              medal(t('fps.bomb.' + e.k, { name: a ? a.name : '' }), e.k === 'plant' || e.k === 'boom' ? '#FF6A5A' : '#7FE0FF');
              audio.beep(e.k === 'plant' ? 600 : 1100, 0.25, 0.16);
            }
            break;
          case 'round': st.lastRound = e; audio.horn(e.w === me.team); break;
          case 'count': audio.beep(660, 0.12, 0.12); break;
          case 'go': audio.horn(true); break;
          case 'end': audio.horn(game.result === 'win'); release(); break;
          case 'skill': if (mine && e.s === 'medkit') audio.heal(); else if (mine) audio.chime(true); break;
          case 'ammo': case 'pickup': if (mine) audio.click(); break;
          case 'spawn': if (mine) camY = null; break;
        }
      }
      return out;
    }

    /** Footsteps: one every stride, for everybody on the ground and moving. */
    function footsteps(game) {
      for (const a of game.actors) {
        if (!a.alive || !a.ground || a.crouching) continue;
        const n = Math.floor(a.anim / 3.3);
        if (steps[a.id] == null) { steps[a.id] = n; continue; }
        if (n !== steps[a.id]) {
          steps[a.id] = n;
          audio.step(a.x, a.y, a.z, a === game.me, a.gear && a.gear.quiet);
        }
      }
    }

    /* ---- the camera ---- */

    function camera(game, al, dt, W, Hh) {
      const me = game.me;
      const fovH = settings.fov * DEG;
      const baseFov = 2 * Math.atan(Math.tan(fovH / 2) / Math.max(0.5, W / Hh));
      if (game.phase === 'lobby') {
        lobbyCam += dt * 0.06;
        const w = game.world, cx = w.W / 2, cz = w.D / 2, R = Math.max(w.W, w.D) * 0.62;
        const x = cx + Math.sin(lobbyCam) * R, z = cz + Math.cos(lobbyCam) * R;
        return { x: x, y: 22, z: z, yaw: Math.atan2(cx - x, -(cz - z)), pitch: -0.62, fov: 60 * DEG, first: false, third: true };
      }
      if (!me.alive && game.phase === 'live') {
        // Watch the one who did it, from over the body.
        const k = game.actors[me.killer];
        const bx = me.x, by = me.y + 2.4, bz = me.z;
        let yaw = me.yaw, pitch = -0.5;
        if (k && k !== me && k.alive) {
          yaw = Math.atan2(k.x - bx, -(k.z - bz));
          pitch = Math.atan2(k.y + 1.4 - by, Math.hypot(k.x - bx, k.z - bz));
        }
        // Stand back from the body, but never into the wall behind it.
        const f = PV.FpsGame.dir(yaw, 0);
        const back = Math.max(0, Math.min(2.2, game.world.ray(bx, by, bz, -f[0], 0, -f[2], 2.6) - 0.35));
        return { x: bx - f[0] * back, y: by, z: bz - f[2] * back, yaw: yaw, pitch: pitch, fov: baseFov, first: false, third: true };
      }
      const x = me.px + (me.x - me.px) * al, z = me.pz + (me.z - me.pz) * al;
      let y = me.py + (me.y - me.py) * al + PV.FpsGame.EYE + (PV.FpsGame.EYE_CROUCH - PV.FpsGame.EYE) * me.crouch;
      // Ease up stairs and into a crouch; follow a jump exactly.
      if (camY == null || !me.ground || Math.abs(y - camY) > 0.9) camY = y;
      else camY += (y - camY) * Math.min(1, dt * 16);
      y = camY;
      const kickP = me.kickP * DEG, kickY = me.kickY * DEG;
      const yaw = me.yaw + unYaw + kickY;
      const pitch = Math.max(-1.53, Math.min(1.53, me.pitch + unPitch)) + kickP;
      const g = me.inv[me.cur];
      const zoom = g && g.s.cat !== 'melee' ? 1 + (g.s.zoom - 1) * me.adsT : 1;
      const fov = 2 * Math.atan(Math.tan(baseFov / 2) / zoom);
      const run = me.sprinting ? 0.012 * Math.sin(me.anim * 1.1) : 0;
      return { x: x, y: y, z: z, yaw: yaw, pitch: pitch, fov: fov, roll: run, first: true, third: false };
    }

    /* ---- the harness ---- */

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: {},
      pad: null,

      create: () => new PV.FpsGame({
        seed: ctx.seed(), mode: opts.mode, map: opts.map, difficulty: opts.difficulty,
        autostart: racing, name: (PV.Profile && PV.Profile.name()) || t('common.you'),
        loadout: racing ? PV.FpsMeta.raceKit(meta) : PV.FpsMeta.loadout(meta)
      }),

      onReset(game) {
        seen = game.seq; camY = null; wasAlive = true; steps = Object.create(null);
        st.feed.length = 0; st.medals.length = 0; st.pops.length = 0; st.hurts.length = 0; st.hitT = 0; st.lastRound = null;
        sentHold = -1; lastTick = -1; unYaw = unPitch = pendYaw = pendPitch = 0;
        adsToggle = crouchToggle = false;
        meta = PV.FpsMeta.load();
        if (lobby) { lobby.refresh(meta); lobby.show(!racing); }
        if (ui) ui.status.textContent = t('fps.mode.' + game.modeKey) + ' · ' + t('fps.map.' + game.mapKey) + ' · ' + t('diff.' + (opts.difficulty || 'normal'));
      },

      fit(availW, availH) {
        if (box && document.fullscreenElement === box) return { w: window.innerWidth, h: window.innerHeight };
        if (PV.stage().phone) {
          const w = Math.max(280, availW);
          return { w: w, h: Math.round(Math.max(320, Math.min(availH + 60, w * 1.35))) };
        }
        let w = Math.min(availW, 1280), h = w * 0.5625;
        if (h > availH + 40) { h = availH + 40; w = h / 0.5625; }
        return { w: Math.round(Math.max(320, w)), h: Math.round(Math.max(200, h)) };
      },

      build(api) {
        ui = api;
        box = api.canvas.parentElement;
        box.classList.add('fps-box');
        api.canvas.classList.add('fps-hud');
        glCanvas = PV.el('canvas', { class: 'fps-gl' });
        box.insertBefore(glCanvas, api.canvas);
        try { scene = PV.FpsScene(glCanvas); } catch (e) { scene = null; broken = true; }
        glCanvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); broken = true; });
        if (!racing) {
          lobby = PV.FpsLobby({
            meta: meta, settings: settings, audio: audio, touch: touch, cfg: cfg,
            onDeploy: deploy, onChange: () => { meta = PV.FpsMeta.load(); },
            onSettings: () => saveSettings()
          });
          box.appendChild(lobby.node);
        }
        const full = PV.el('button', {
          class: 'btn ghost', onclick: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
          }
        }, '⛶ ' + t('fps.fullscreen'));
        api.status.parentElement.querySelector('.bar-actions').prepend(full);
        api.below.appendChild(PV.el('p', { class: 'muted small' }, touch ? t('fps.touchHelp') : t('fps.keysHelp')));
        const c = api.canvas;
        c.addEventListener('pointerdown', onCanvasDown);
        c.addEventListener('pointermove', touchMove);
        c.addEventListener('pointerup', touchUp);
        c.addEventListener('pointercancel', touchUp);
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
          c.removeEventListener('pointermove', touchMove);
          c.removeEventListener('pointerup', touchUp);
          c.removeEventListener('pointercancel', touchUp);
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
        if (g) api.status.textContent = t('fps.mode.' + g.modeKey) + ' · ' + t('fps.map.' + g.mapKey) + ' · ' + t('diff.' + (opts.difficulty || 'normal'));
        if (lobby) lobby.refresh();
      },

      draw(c, game, geom, api, alpha) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016;
        lastNow = now;
        c.clearRect(0, 0, geom.w, geom.h);
        if (!scene || broken) {
          c.fillStyle = '#1B2330';
          c.fillRect(0, 0, geom.w, geom.h);
          PV.FpsHud.text(c, t('fps.noGL'), geom.w / 2, geom.h / 2, Math.max(12, geom.w * 0.024), '#EAF0F7', 'center');
          return;
        }
        if (glCanvas.style.width !== geom.w + 'px') { glCanvas.style.width = geom.w + 'px'; glCanvas.style.height = geom.h + 'px'; }
        scene.resize(geom.w, geom.h, Math.min(1.5, window.devicePixelRatio || 1));
        if (lobby) lobby.show(game.phase === 'lobby' && !racing);
        if (api.paused || game.isOver()) release();

        send(game);
        const list = readEvents(game);
        footsteps(game);
        const me = game.me;
        const cam = camera(game, alpha, dt, geom.w, geom.h);
        audio.listen(cam.x, cam.y, cam.z, cam.yaw);

        const g = me.inv[me.cur];
        const optic = g && g.s.cat !== 'melee' ? g.s.optic : null;
        const scoped = (optic === 'x4' || optic === 'x8') && me.adsT > 0.9 && me.alive && cam.first ? optic : null;
        const v = {
          first: cam.first && me.alive, g: g, ads: me.adsT, wear: me.wear, team: PV.FpsHud.TEAM ? hexRgb(PV.FpsHud.TEAM[game.teams ? me.team : 0]) : [1, 1, 1],
          reload: me.reloadT > 0 ? 1 - me.reloadT / me.reloadLen : -1,
          swap: me.swapT > 0 ? me.swapT / me.swapLen : 0,
          fire: me.fireT, swing: me.swingT, speed: Math.hypot(me.vx, me.vz), sprint: me.sprinting, air: !me.ground,
          hide: !!scoped, dt: dt, al: alpha, now: now / 1000, events: list
        };
        scene.frame(game, cam, v);

        // The HUD's view of this frame.
        for (const k of ['medals', 'pops', 'hurts', 'feed']) for (const x of st[k]) x.age += dt;
        st.medals = st.medals.filter(m => m.age < 2.1);
        st.pops = st.pops.filter(p => p.age < 0.9);
        st.hurts = st.hurts.filter(h => h.age < 1.2);
        st.hitT = Math.max(0, st.hitT - dt);
        st.camX = cam.x; st.camY = cam.y; st.camZ = cam.z; st.camYaw = cam.yaw;
        st.project = (x, y, z) => scene.project(x, y, z);
        const w = game.world;
        st.visible = a => w.clear(cam.x, cam.y, cam.z, a.x, a.y + a.h - 0.1, a.z);
        const mineSees = Object.create(null);
        st.teamSees = a => {
          if (mineSees[a.id] == null) mineSees[a.id] = game.teams && game.tick - a.spotted < 40 ? true : w.clear(cam.x, cam.y, cam.z, a.x, a.y + 1.2, a.z);
          return mineSees[a.id];
        };
        st.scoped = scoped;
        const s = g ? g.s : null;
        st.melee = !s || s.cat === 'melee';
        const spreadDeg = s && s.cat !== 'melee' ? game.spread(me, s) : 1.2;
        st.spreadPx = Math.tan(spreadDeg * DEG) / Math.tan(cam.fov / 2) * geom.h / 2;
        st.hideCross = !me.alive || (me.adsT > 0.55 && !st.melee) || me.sprinting || !!scoped;
        st.board = board || (api.paused && game.phase !== 'lobby');
        // The enemy under the crosshair, and the nearest gun on the floor.
        st.aimed = null;
        if (me.alive && cam.first) {
          const f = PV.FpsGame.dir(cam.yaw, cam.pitch);
          const tw = w.ray(cam.x, cam.y, cam.z, f[0], f[1], f[2], 90);
          let best = tw;
          for (const a of game.actors) {
            if (!a.alive || !game.enemy(me, a)) continue;
            const d = game.hitTest(a, cam.x, cam.y, cam.z, f[0], f[1], f[2], best);
            if (d < best) { best = d; st.aimed = a; }
          }
        }
        st.nearDrop = null;
        if (me.alive && game.modeKey !== 'gun') {
          let bd = 2.2;
          for (const d of game.drops) {
            const dist = Math.hypot(d.x - me.x, d.z - me.z);
            if (dist < bd && (!me.inv[0] || me.inv[0].id !== d.id)) { bd = dist; st.nearDrop = d.id; }
          }
        }
        st.stick = stick;
        st.prompt = !touch && !locked && !api.paused && (game.phase === 'live' || game.phase === 'count' || game.phase === 'round') ? t('fps.clickToPlay') : null;
        pad = PV.FpsHud.draw(c, game, geom, st) || [];
        if (me.alive !== wasAlive) { wasAlive = me.alive; if (!me.alive) mouseFire = false; }
      },

      outcome(game) {
        release();
        const me = game.me, s = me.stats;
        const res = game.result === 'win' ? 'win' : game.result === 'draw' ? 'draw' : 'lose';
        const bank = racing ? { coins: 0, xp: 0, rankUp: 0 } : PV.FpsMeta.bank(meta, game, false);
        meta = PV.FpsMeta.load();
        const done = racing ? [] : PV.FpsMeta.missions(meta).daily.concat(PV.FpsMeta.missions(meta).weekly).filter(x => x.done && !x.claimed);
        const where = t('fps.mode.' + game.modeKey) + ' · ' + t('fps.map.' + game.mapKey);
        return {
          result: res,
          score: s.score,
          xp: Math.round(30 + s.k * 4 + s.a * 2 + (res === 'win' ? 60 : res === 'draw' ? 30 : 0)),
          tone: res === 'win' ? 'good' : res === 'draw' ? 'flat' : 'bad',
          title: t(res === 'win' ? 'fps.victory' : res === 'draw' ? 'fps.draw' : 'fps.defeat'),
          againLabel: racing ? undefined : t('fps.toLobby'),
          lines: [
            where,
            game.teams ? t('fps.final', { us: game.teamScore[me.team], them: game.teamScore[1 - me.team] }) : t('fps.place', { n: game.place || 1, of: game.actors.length }),
            t('fps.line.kda', { k: s.k, d: s.d, a: s.a }) + ' · ' + t('fps.line.hs', { n: s.hs }),
            t('common.score') + ': ' + PV.fmtNum(s.score),
            racing ? null : t('fps.earned', { coins: PV.fmtNum(bank.coins), xp: PV.fmtNum(bank.xp) }),
            bank.rankUp ? t('fps.rankUp', { n: bank.rankUp }) : null,
            done.length ? t('fps.missionsReady', { n: done.length }) : null,
            '@best'
          ]
        };
      }
    });

    function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
  };

})(window.PV);
