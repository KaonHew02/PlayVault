/* 突击小队 / Strike Squad — the scene.

   Builds a map into buffers once and draws a match every frame.

   THE WORLD is built from world.js's boxes: every face that is not buried
   in another box, cut into metre squares, textured by what the box is made
   of, and LIT ONCE. For every corner of every square a ray goes to the sun
   and six go out across the sky above the face; how many get out is how
   much light the corner gets. That is where the shadows come from — of the
   walls on the ground, of a roof on the floor under it, the dark in a
   corner — and it is done when the map is built, so a frame pays nothing
   for it. The result is kept per map for as long as the page is open.

   Everything else is drawn where the engine has it, between its last two
   ticks: soldiers (one skinned draw each, their gun a second), flags, the
   bomb, grenades, guns on the floor. Effects are this file's own and never
   read back: bullet holes, tracers, sparks, blood, smoke, the fireball,
   muzzle fire — all made from the engine's events.

   The first-person gun is drawn last, in its own space, after the depth is
   cleared, so it never goes through a wall you are standing against. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const G = PV.FpsGL, M4 = G.M4, rgb = G.rgb;
  const A = PV.FpsArt, D = PV.FpsData;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const MAXP = 1400, MAXQ = 700;

  const TEAM = [rgb('#3F7FE0'), rgb('#E2453A')];
  const FFA_FOE = rgb('#D8702E');

  /* ------------------------------------------------------- the bake */

  const bakes = Object.create(null);

  /* Six directions over a face, in its own frame: straight out, and five
     round it at 55 degrees. */
  const AO = (function () {
    const out = [[0, 0, 1]];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU, t = 55 * DEG;
      out.push([Math.cos(a) * Math.sin(t), Math.sin(a) * Math.sin(t), Math.cos(t)]);
    }
    return out;
  })();

  function bake(world) {
    if (bakes[world.key]) return bakes[world.key];
    const th = world.theme;
    const sun = norm(th.sun), sunCol = rgb(th.sunCol).map(v => v * 0.95);
    const sky = G.mix(rgb(th.sky[0]), [1, 1, 1], 0.35).map(v => v * th.amb);
    const geo = new G.WorldGeo();

    /* Light at a point on a face with normal n and tangents t1, t2. */
    function light(px, py, pz, n, t1, t2) {
      const ox = px + n[0] * 0.03, oy = py + n[1] * 0.03, oz = pz + n[2] * 0.03;
      const nd = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
      let sunV = 0;
      if (nd > 0) sunV = world.ray(ox, oy, oz, sun[0], sun[1], sun[2], 90) >= 90 ? 1 : 0;
      let open = 0;
      for (const d of AO) {
        const dx = t1[0] * d[0] + t2[0] * d[1] + n[0] * d[2];
        const dy = t1[1] * d[0] + t2[1] * d[1] + n[1] * d[2];
        const dz = t1[2] * d[0] + t2[2] * d[1] + n[2] * d[2];
        const t = world.ray(ox, oy, oz, dx, dy, dz, 5);
        open += t >= 5 ? 1 : t / 5 * 0.6;
      }
      open /= AO.length;
      const k = 0.26 + 0.74 * open;
      const s = sunV * Math.max(0, nd) * 0.92;
      // A little of the ground's light comes back up onto walls.
      const bounce = n[1] < 0.5 ? 0.06 * open : 0;
      return [sky[0] * k + sunCol[0] * s + bounce, sky[1] * k + sunCol[1] * s + bounce, sky[2] * k + sunCol[2] * s + bounce];
    }

    /* A rectangle of the world: origin p, edges eu (u) and ev (v), normal
       n, cut into squares of about a metre, each corner lit. */
    function face(tex, p, eu, ev, n, scale, tint, uv0) {
      const lu = Math.hypot(eu[0], eu[1], eu[2]), lv = Math.hypot(ev[0], ev[1], ev[2]);
      const nu = Math.max(1, Math.round(lu)), nv = Math.max(1, Math.round(lv));
      const t1 = eu.map(v => v / lu), t2 = ev.map(v => v / lv);
      const L = [];
      for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
          const x = p[0] + eu[0] * i / nu + ev[0] * j / nv;
          const y = p[1] + eu[1] * i / nu + ev[1] * j / nv;
          const z = p[2] + eu[2] * i / nu + ev[2] * j / nv;
          const l = light(x, y, z, n, t1, t2);
          L.push([x, y, z, l[0] * tint[0], l[1] * tint[1], l[2] * tint[2], (uv0[0] + lu * i / nu) / scale, (uv0[1] + lv * j / nv) / scale]);
        }
      }
      const at = (i, j) => L[j * (nu + 1) + i];
      const put = q => geo.v(tex, q, q[6], q[7], [q[3], q[4], q[5]]);
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          put(a); put(b); put(c);
          put(a); put(c); put(d);
        }
      }
    }

    const inBox = (x, y, z, self) => world.boxes.some(b => b !== self && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1);
    const outside = (x, z) => x < 0 || z < 0 || x > world.W || z > world.D;

    for (const b of world.boxes) {
      if (b.mat === 'trunk' || b.mat === 'barrel') continue;
      const m = A.material(b.mat, th);
      const { x0, y0, z0, x1, y1, z1 } = b;
      const F = [
        // origin, u edge, v edge, normal, uv origin
        [[x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, 1, 0], [x0, z0]],
        [[x0, y1, z1], [x1 - x0, 0, 0], [0, y0 - y1, 0], [0, 0, 1], [x0, 0]],
        [[x1, y1, z0], [x0 - x1, 0, 0], [0, y0 - y1, 0], [0, 0, -1], [x1, 0]],
        [[x1, y1, z1], [0, 0, z0 - z1], [0, y0 - y1, 0], [1, 0, 0], [z1, 0]],
        [[x0, y1, z0], [0, 0, z1 - z0], [0, y0 - y1, 0], [-1, 0, 0], [z0, 0]]
      ];
      if (y0 > 0.01) F.push([[x0, y0, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], [0, -1, 0], [x0, z0]]);
      for (const f of F) {
        const c = [f[0][0] + f[1][0] / 2 + f[2][0] / 2, f[0][1] + f[1][1] / 2 + f[2][1] / 2, f[0][2] + f[1][2] / 2 + f[2][2] / 2];
        const probe = [c[0] + f[3][0] * 0.05, c[1] + f[3][1] * 0.05, c[2] + f[3][2] * 0.05];
        if (outside(probe[0], probe[2]) || inBox(probe[0], probe[1], probe[2], b)) continue;
        if (f[3][1] === 0 && probe[1] < 0) continue;
        face(m.tex, f[0], f[1], f[2], f[3], m.scale, m.tint, f[4]);
      }
    }

    /* The ground, a cell at a time, skipping cells under solid blocks. */
    const cover = c => { const d = PV.FpsWorld.CELL[c]; return d && !d.inset; };
    const groundMat = ['ground', 'road', 'grass'];
    for (let z = 0; z < world.D; z++) {
      for (let x = 0; x < world.W; x++) {
        const i = z * world.W + x;
        if (cover(world.ch[i])) continue;
        const m = A.material(groundMat[world.ground[i]], th);
        face(m.tex, [x, 0, z], [1, 0, 0], [0, 0, 1], [0, 1, 0], m.scale, m.tint, [x, z]);
      }
    }

    /* Props: trees and barrels, drawn as models, and the far scenery. */
    const props = new G.Geo();
    world.boxes.forEach((b, k) => {
      if (b.mat === 'trunk') A.tree(props, th.tree, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 5, k);
      else if (b.mat === 'barrel') A.barrel(props, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, ['#3F6FA0', '#B5452F', '#4E7A3B', '#C9A13A'][k % 4]);
    });
    skyline(props, world, th);

    const out = { bins: {}, props: new Float32Array(props.d), propCount: props.count };
    for (const k in geo.bins) out.bins[k] = new Float32Array(geo.bins[k]);
    // A floor past the walls, so looking over one does not show the void.
    const far = [], fm = A.material('ground', th), s = 1 / fm.scale, fl = sky.map((v, i) => v * 0.8 + sunCol[i] * 0.55);
    const X0 = -120, X1 = world.W + 120, Z0 = -120, Z1 = world.D + 120, y = -0.02;
    const q = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z0], [X1, Z1], [X0, Z1]];
    for (const p of q) far.push(p[0], y, p[1], p[0] * s, p[1] * s, fl[0], fl[1], fl[2]);
    out.floor = { tex: fm.tex, data: new Float32Array(far) };
    bakes[world.key] = out;
    return out;
  }

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  /** Far scenery by theme, outside the walls: cranes, dunes, hills,
      mountains, towers, chimneys, a forest. */
  function skyline(g, w, th) {
    const m = M4.create();
    const cx = w.W / 2, cz = w.D / 2, R = Math.max(w.W, w.D) * 0.5;
    const rnd = k => A.hash2(k, w.W, 77);
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU + rnd(i) * 0.2, d = R + 18 + rnd(i + 50) * 45;
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d * (w.D / w.W);
      const k = th.skyline;
      if (k === 'cranes') {
        if (i % 3) g.box(M4.compose(m, x, 4, z, a), 8 + rnd(i) * 8, 8, 3, rgb(['#B5452F', '#2F6BA6', '#4E8A3B', '#C9A13A'][i % 4]), 0, 0);
        else { g.box(M4.compose(m, x, 12, z), 1.2, 24, 1.2, rgb('#E0B23A'), 0, 0); g.box(M4.compose(m, x + 5, 23.5, z, a), 16, 1, 1, rgb('#E0B23A'), 0, 0); }
      } else if (k === 'dunes') {
        g.ball(M4.compose(m, x, -4, z, a, 0, 0, 3, 1, 1.6), 8 + rnd(i) * 6, 10, 5, rgb('#D9BE8E'), 0, 0);
      } else if (k === 'hills' || k === 'canopy') {
        const col = k === 'canopy' ? rgb('#3D6F32') : rgb('#6E9A52');
        g.ball(M4.compose(m, x, -6, z, a, 0, 0, 2.2, 1, 1.5), 10 + rnd(i) * 8, 10, 5, col, 0, 0);
      } else if (k === 'peaks') {
        g.cone(M4.compose(m, x, -2, z), 14 + rnd(i) * 10, 18 + rnd(i + 9) * 16, 7, rgb('#8FA2B4'), 0, 0);
        g.cone(M4.compose(m, x, 12 + rnd(i + 9) * 10, z), 5, 7, 7, rgb('#F2F5F8'), 0, 0);
      } else if (k === 'city') {
        const h = 14 + rnd(i) * 30;
        g.box(M4.compose(m, x, h / 2, z, a), 8 + rnd(i + 3) * 6, h, 8, rgb(['#4B4F63', '#5E5A6E', '#3E4556'][i % 3]), 0, 0);
      } else if (k === 'stacks') {
        if (i % 2) { g.cyl(M4.compose(m, x, 10, z, 0, Math.PI / 2, 0), 1.6, 1.2, 20, 10, rgb('#8A7F76'), 0, 0); }
        else g.box(M4.compose(m, x, 5, z, a), 14, 10, 8, rgb('#7C8691'), 0, 0);
      }
    }
  }

  /* -------------------------------------------------------- the scene */

  PV.FpsScene = function (canvas) {
    const R = G.Renderer(canvas);
    const gl = R.gl, P = R.progs;
    const vp = M4.create(), view = M4.create(), proj = M4.create(), tmp = M4.create(), tmp2 = M4.create();
    const vmProj = M4.create();
    const bones = new Float32Array(16 * 16);
    let W = 1, H = 1, dpr = 1;
    let world = null, built = null, key = null;
    const tex = Object.create(null);
    const models = Object.create(null);
    let floorBuf = null, propBuf = null;
    const bins = [];
    const dyn = {
      pts: R.buffer(new Float32Array(MAXP * 8), true), ptsData: new Float32Array(MAXP * 8),
      quad: R.buffer(new Float32Array(MAXQ * 6 * 10), true), quadData: new Float32Array(MAXQ * 6 * 10)
    };
    const sphere = R.buffer(new Float32Array(skyDome()));
    const skyCount = skyDome().length / 3;

    /* Effects: particles, holes, tracers. */
    const parts = [];
    const holes = [];
    const tracers = [];
    let shake = 0;
    const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1.2 };

    function texOf(name) {
      if (!tex[name]) tex[name] = R.texture(A.textureCanvas(name));
      return tex[name];
    }
    function modelOf(m) {
      if (!m) return null;
      if (!models[m.key]) models[m.key] = R.model(m.geo);
      return models[m.key];
    }

    /** A new map: its buffers and its textures, from the bake. */
    function load(w) {
      world = w;
      key = w.key;
      built = bake(w);
      for (const b of bins) R.drop(b.buf);
      bins.length = 0;
      for (const t in built.bins) {
        texOf(t);
        bins.push({ tex: t, buf: R.buffer(built.bins[t]), count: built.bins[t].length / 8 });
      }
      if (floorBuf) R.drop(floorBuf);
      floorBuf = R.buffer(built.floor.data);
      texOf(built.floor.tex);
      if (propBuf) R.drop(propBuf);
      propBuf = built.propCount ? R.buffer(built.props) : null;
      parts.length = 0; holes.length = 0; tracers.length = 0;
    }

    /* ---- effects ---- */

    function spawn(x, y, z, vx, vy, vz, life, size, grow, col, add, grav) {
      if (parts.length >= MAXP - 2) parts.shift();
      parts.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, t: 0, life: life, size: size, grow: grow, col: col, add: !!add, grav: grav || 0 });
    }
    function rnd() { return Math.random(); }   // effects only: never the game's RNG

    /** What the engine did since the last frame, turned into things to see. */
    function effects(game, v, list) {
      const me = game.me;
      for (const e of list) {
        if (e.k === 'impact') {
          if (holes.length > 140) holes.shift();
          holes.push({ x: e.x, y: e.y, z: e.z, nx: e.nx, ny: e.ny, nz: e.nz, t: 0, s: 0.06 + rnd() * 0.03 });
          const dust = e.m === 'ground' || e.m === 'sandbag' || e.m === 'hedge' ? [0.62, 0.55, 0.45, 0.8] : [0.72, 0.72, 0.7, 0.75];
          for (let i = 0; i < 4; i++) spawn(e.x, e.y, e.z, e.nx * 1.5 + (rnd() - 0.5) * 1.5, e.ny * 1.5 + rnd() * 1.2, e.nz * 1.5 + (rnd() - 0.5) * 1.5, 0.35 + rnd() * 0.3, 0.1, 0.5, dust, false, 4);
          if (e.m === 'cont_r' || e.m === 'cont_b' || e.m === 'cont_g' || e.m === 'barrel' || e.m === 'siding') {
            for (let i = 0; i < 3; i++) spawn(e.x, e.y, e.z, e.nx * 3 + (rnd() - 0.5) * 4, e.ny * 3 + rnd() * 3, e.nz * 3 + (rnd() - 0.5) * 4, 0.18, 0.035, 0, [1, 0.8, 0.4, 1], true, 9);
          }
        } else if (e.k === 'shot') {
          const a = game.actors[e.a];
          let mx = e.x, my = e.y - 0.12, mz = e.z;
          if (a === me && v.first) { const m = v.muzzle; if (m) { mx = m[0]; my = m[1]; mz = m[2]; } }
          else if (a) { const f = PV.FpsGame.dir(a.yaw, a.pitch); mx = a.x + f[0] * 0.8 + Math.cos(a.yaw) * 0.18; my = e.y - 0.25 + f[1] * 0.8; mz = a.z + f[2] * 0.8 + Math.sin(a.yaw) * 0.18; }
          if (!e.q) spawn(mx, my, mz, 0, 0, 0, 0.05, a === me ? 0.25 : 0.4, 2, [1, 0.8, 0.4, 1], true);
          if (rnd() < (a === me ? 0.5 : 0.8)) tracers.push({ x0: mx, y0: my, z0: mz, x1: e.tx, y1: e.ty, z1: e.tz, t: 0 });
        } else if (e.k === 'hit') {
          if (e.x == null) continue;
          for (let i = 0; i < (e.head ? 10 : 6); i++) spawn(e.x, e.y, e.z, (rnd() - 0.5) * 2.5, rnd() * 2, (rnd() - 0.5) * 2.5, 0.35 + rnd() * 0.25, 0.07, 0.3, [0.62, 0.05, 0.05, 0.9], false, 7);
        } else if (e.k === 'boom') {
          const big = e.big ? 2 : 1;
          for (let i = 0; i < 26 * big; i++) {
            const a = rnd() * TAU, u = rnd() * 2 - 1, sp = (3 + rnd() * 6) * big;
            spawn(e.x, e.y + 0.3, e.z, Math.cos(a) * Math.sqrt(1 - u * u) * sp, Math.abs(u) * sp, Math.sin(a) * Math.sqrt(1 - u * u) * sp, 0.3 + rnd() * 0.3, 0.6 * big, 1.5, [1, 0.62 + rnd() * 0.2, 0.2, 1], true, -1);
          }
          for (let i = 0; i < 18 * big; i++) spawn(e.x + (rnd() - 0.5) * 2, e.y + 0.5, e.z + (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 1 + rnd() * 2, (rnd() - 0.5) * 2, 1.4 + rnd(), 1.2 * big, 1.8, [0.28, 0.27, 0.26, 0.55], false, -0.4);
          if (holes.length > 140) holes.shift();
          holes.push({ x: e.x, y: world ? world.floorAt(e.x, e.z, e.y + 0.3) + 0.02 : 0.02, z: e.z, nx: 0, ny: 1, nz: 0, t: 0, s: 1.6 * big, scorch: true });
          const d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z);
          shake = Math.max(shake, Math.max(0, 1 - d / (18 * big)) * 0.9);
        } else if (e.k === 'melee' && e.hit) {
          // blood comes with the hit event
        }
      }
    }

    function stepEffects(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - 1.6 * dt; p.vz *= 1 - 1.6 * dt;
      }
      for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t += dt; if (tracers[i].t > 0.07) tracers.splice(i, 1); }
      for (const h of holes) h.t += dt;
      while (holes.length && holes[0].t > 30) holes.shift();
      shake *= Math.pow(0.02, dt);
    }

    /* ---- the camera ---- */

    function setCamera(c) {
      Object.assign(cam, c);
      const sx = shake ? (rnd() - 0.5) * shake * 0.05 : 0, sy = shake ? (rnd() - 0.5) * shake * 0.05 : 0;
      M4.fps(view, cam.x, cam.y, cam.z, cam.yaw + sx, cam.pitch + sy, cam.roll || 0);
      M4.perspective(proj, cam.fov, W / H, 0.05, 400);
      M4.multiply(vp, proj, view);
    }

    /** Where a world point lands on the screen, in CSS pixels, or null
        when it is behind the camera. */
    function project(x, y, z) {
      const p = M4.apply(vp, x, y, z);
      if (p[3] <= 0.05) return null;
      return { x: (p[0] / p[3] * 0.5 + 0.5) * W, y: (0.5 - p[1] / p[3] * 0.5) * H, d: p[3] };
    }

    /* ---- drawing ---- */

    function fogUniforms(p, th) {
      const f = rgb(th.fog);
      gl.uniform3f(p.uni.uFog, f[0], f[1], f[2]);
      gl.uniform2f(p.uni.uFogR, th.fogR[0], th.fogR[1]);
      gl.uniform3f(p.uni.uEye, cam.x, cam.y, cam.z);
    }

    function drawSky(th) {
      const p = P.sky;
      gl.useProgram(p.prog);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      R.bind(p, sphere, [['aPos', 3, 0]], 3);
      gl.uniformMatrix4fv(p.uni.uVP, false, vp);
      gl.uniform3f(p.uni.uEye, cam.x, cam.y, cam.z);
      const t = rgb(th.sky[0]), h = rgb(th.sky[1]), s = norm(th.sun), sc = rgb(th.sunCol);
      gl.uniform3f(p.uni.uTop, t[0], t[1], t[2]);
      gl.uniform3f(p.uni.uHorizon, h[0], h[1], h[2]);
      gl.uniform3f(p.uni.uSun, s[0], s[1], s[2]);
      gl.uniform3f(p.uni.uSunCol, sc[0], sc[1], sc[2]);
      gl.drawArrays(gl.TRIANGLES, 0, skyCount);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    function drawWorld(th) {
      const p = P.world;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uni.uVP, false, vp);
      fogUniforms(p, th);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(p.uni.uTex, 0);
      const lay = [['aPos', 3, 0], ['aUV', 2, 3], ['aLight', 3, 5]];
      gl.bindTexture(gl.TEXTURE_2D, texOf(built.floor.tex));
      R.bind(p, floorBuf, lay, 8);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      for (const b of bins) {
        gl.bindTexture(gl.TEXTURE_2D, texOf(b.tex));
        R.bind(p, b.buf, lay, 8);
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }
    }

    /* The model program's per-frame state. */
    let modelTh = null;
    function modelBegin(th, sunScale, viewSpace) {
      const p = P.model;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uni.uVP, false, viewSpace ? vmProj : vp);
      const s = norm(th.sun), sc = rgb(th.sunCol), sky = rgb(th.sky[0]);
      let sx = s[0], sy = s[1], sz = s[2];
      if (viewSpace) {
        // The sun in the camera's own space.
        const v = view;
        sx = v[0] * s[0] + v[4] * s[1] + v[8] * s[2];
        sy = v[1] * s[0] + v[5] * s[1] + v[9] * s[2];
        sz = v[2] * s[0] + v[6] * s[1] + v[10] * s[2];
      }
      gl.uniform3f(p.uni.uSun, sx, sy, sz);
      gl.uniform3f(p.uni.uSunCol, sc[0] * 0.85, sc[1] * 0.85, sc[2] * 0.85);
      // The gun in your hands is lit a little brighter than the world: it is
      // the thing you look at most, and a black shape reads as nothing.
      const a = th.amb * (viewSpace ? 1.45 : 1);
      gl.uniform3f(p.uni.uSky, (sky[0] * 0.4 + 0.6) * a, (sky[1] * 0.4 + 0.6) * a, (sky[2] * 0.4 + 0.6) * a);
      gl.uniform3f(p.uni.uGround, 0.42 * a, 0.4 * a, 0.36 * a);
      if (viewSpace) {
        gl.uniform3f(p.uni.uFog, 0, 0, 0);
        gl.uniform2f(p.uni.uFogR, 1000, 2000);
        gl.uniform3f(p.uni.uEye, 0, 0, 0);
      } else fogUniforms(p, th);
      gl.uniform1f(p.uni.uShade, sunScale == null ? 1 : sunScale);
      gl.uniform3f(p.uni.uTeam, 1, 1, 1);
      gl.uniform1f(p.uni.uFlash, 0);
      gl.uniform1f(p.uni.uPat, 0);
      modelTh = th;
    }
    function drawModel(buf, boneList, opts) {
      const p = P.model, o = opts || {};
      for (let i = 0; i < boneList.length; i++) bones.set(boneList[i], i * 16);
      gl.uniformMatrix4fv(p.uni.uBones, false, bones);
      if (o.team) gl.uniform3f(p.uni.uTeam, o.team[0], o.team[1], o.team[2]);
      gl.uniform1f(p.uni.uFlash, o.flash || 0);
      if (o.shade != null) gl.uniform1f(p.uni.uShade, o.shade);
      const camo = o.camo && o.camo !== 'none' ? D.CAMOS.find(c => c.id === o.camo) : null;
      if (camo) {
        const c0 = rgb(camo.cols[0]), c1 = rgb(camo.cols[1]), c2 = rgb(camo.cols[2]);
        gl.uniform3f(p.uni.uCamo0, c0[0], c0[1], c0[2]);
        gl.uniform3f(p.uni.uCamo1, c1[0], c1[1], c1[2]);
        gl.uniform3f(p.uni.uCamo2, c2[0], c2[1], c2[2]);
        gl.uniform1f(p.uni.uPat, camo.pat);
      } else gl.uniform1f(p.uni.uPat, 0);
      R.bind(p, buf.buf, [['aPos', 3, 0], ['aNrm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9], ['aBone', 1, 10]], 11);
      gl.drawArrays(gl.TRIANGLES, 0, buf.count);
    }

    const I = M4.create();

    /* ---- soldiers ---- */

    /** Bone matrices for a soldier at interpolation `al`. */
    function pose(a, al, out) {
      const x = a.px + (a.x - a.px) * al, y = a.py + (a.y - a.py) * al, z = a.pz + (a.z - a.pz) * al;
      let yaw = a.yaw;
      const dy = a.yaw - a.pyaw;
      if (Math.abs(dy) < Math.PI) yaw = a.pyaw + dy * al;
      const pitch = a.alive ? a.pitch : 0;
      const cr = a.crouch;
      const speed = Math.hypot(a.x - a.px, a.z - a.pz) * 60;
      const run = Math.min(1, speed / 5);
      const ph = a.anim * 2.2;
      const hipY = 0.93 - 0.3 * cr;
      // Falling over when dead: backwards about the feet over half a second.
      const fall = a.alive ? 0 : Math.min(1, a.deadT / 28);
      const root = M4.compose(out.root || (out.root = M4.create()), x, y, z, yaw, -fall * 1.45, 0);
      const hips = M4.multiply(out[0] || (out[0] = M4.create()), root, M4.compose(tmp, 0, hipY - fall * 0.35, 0, 0, 0, 0));
      const chest = M4.multiply(out[1] || (out[1] = M4.create()), hips, M4.compose(tmp, 0, 0.07, 0, 0, pitch * 0.35 + cr * 0.15, 0));
      M4.multiply(out[2] || (out[2] = M4.create()), chest, M4.compose(tmp, 0, 0.5, 0, 0, pitch * 0.5, 0));
      const aim = pitch * 0.65;
      M4.multiply(out[3] || (out[3] = M4.create()), chest, M4.compose(tmp, 0.26, 0.42, 0, -0.12, aim, 0));
      M4.multiply(out[4] || (out[4] = M4.create()), chest, M4.compose(tmp, -0.26, 0.42, 0, 0.35, aim + 0.1, 0));
      const sw = Math.sin(ph) * 0.65 * run, sw2 = Math.sin(ph + Math.PI) * 0.65 * run;
      const air = !a.ground && a.alive ? 0.5 : 0;
      for (const side of [1, -1]) {
        const s = side > 0 ? sw : sw2;
        const th = M4.multiply(out[side > 0 ? 5 : 7] || (out[side > 0 ? 5 : 7] = M4.create()), hips,
          M4.compose(tmp, side * 0.1, -0.02, 0, 0, -s - cr * 1.25 - air * 0.6, 0));
        const bend = Math.max(0, -Math.cos(ph + (side > 0 ? 0 : Math.PI))) * 0.9 * run + cr * 2.1 + air;
        M4.multiply(out[side > 0 ? 6 : 8] || (out[side > 0 ? 6 : 8] = M4.create()), th, M4.compose(tmp, 0, -0.44, 0, 0, bend, 0));
      }
      // Where the gun goes: at the right hand, pointed along the aim.
      const gunM = M4.multiply(out.gun || (out.gun = M4.create()), chest, M4.compose(tmp, 0.14, 0.32, -0.34, 0, aim, 0));
      out.x = x; out.y = y; out.z = z; out.yaw = yaw;
      return gunM;
    }

    const poses = [];

    function drawSoldiers(game, al, th) {
      const me = game.me;
      modelBegin(th);
      for (const a of game.actors) {
        if (a === me && !cam.third) continue;
        if (!a.alive && a.deadT > 360) continue;
        const pz = poses[a.id] || (poses[a.id] = {});
        const gunM = pose(a, al, pz);
        const team = game.teams ? TEAM[a.team] : (a === me ? TEAM[0] : FFA_FOE);
        const flash = game.tick - a.lastHurt < 5 && a.alive ? 0.45 : 0;
        const shade = sunAt(pz.x, pz.y + 1.2, pz.z, th);
        const body = modelOf(A.soldier(a.wear));
        drawModel(body, [pz[0], pz[1], pz[2], pz[3], pz[4], pz[5], pz[6], pz[7], pz[8]], { team: team, flash: flash, shade: shade });
        const g = a.inv[a.cur];
        if (g && (a.alive || a.deadT < 20)) {
          const gm = modelOf(A.gun(g.id, g.s.att));
          drawModel(gm, [gunM], { camo: g.camo, flash: 0, shade: shade });
        }
      }
    }

    /** Is the sun on this point? One ray, for soldiers under a roof. */
    function sunAt(x, y, z, th) {
      const s = norm(th.sun);
      return world.ray(x, y, z, s[0], s[1], s[2], 60) >= 60 ? 1 : 0.25;
    }

    /* ---- the rest of the match ---- */

    function drawThings(game, al, th, now) {
      modelBegin(th);
      // Flags: a pole and a waving cloth in the team's colour.
      for (const f of game.flags) {
        const fm = modelOf(A.flagModel());
        let x = f.x, y = f.y, z = f.z;
        if (f.at === 'carried') {
          const c = game.actors[f.carrier];
          if (c === game.me && !cam.third) continue;
          if (c) { x = c.px + (c.x - c.px) * al; y = c.py + (c.y - c.py) * al + 0.6; z = c.pz + (c.z - c.pz) * al; }
        }
        const pole = M4.compose(M4.create(), x, y, z, now * 0.3, 0, 0, 1);
        const cloth = M4.multiply(M4.create(), pole, M4.compose(tmp, 0, 2.45, 0, Math.sin(now * 3.1 + f.team) * 0.35, 0, Math.sin(now * 4.3) * 0.05));
        drawModel(fm, [pole, cloth], { team: TEAM[f.team] });
      }
      // The bomb, where it is when it is not in somebody's pack.
      const B = game.bomb;
      if (B && (B.at === 'dropped' || B.at === 'planted')) {
        const bm = modelOf(A.bombModel());
        const blink = B.at === 'planted' && Math.floor(now * (B.t < 600 ? 6 : 2)) % 2 === 0;
        const mm = M4.compose(M4.create(), B.x, B.y, B.z, 0.4, 0, 0);
        const led = M4.compose(M4.create(), B.x, B.y + (blink ? 0 : -1), B.z, 0.4, 0, 0);
        drawModel(bm, [mm, led]);
      }
      // Grenades in flight.
      const nm = modelOf(A.nadeModel());
      for (const n of game.nades) {
        const x = n.px != null ? n.px + (n.x - n.px) * al : n.x, y = n.py != null ? n.py + (n.y - n.py) * al : n.y, z = n.pz != null ? n.pz + (n.z - n.pz) * al : n.z;
        drawModel(nm, [M4.compose(M4.create(), x, y, z, n.spin, n.spin * 0.7, 0)]);
      }
      // Guns on the floor, turning slowly.
      for (const d of game.drops) {
        const gm = modelOf(A.gun(d.id, d.s.att));
        drawModel(gm, [M4.compose(M4.create(), d.x, d.y + 0.12 + Math.sin(now * 2 + d.spin) * 0.03, d.z, d.spin + now * 0.8, 0, Math.PI / 2 * 0.95)], { camo: d.camo });
      }
      if (propBuf) drawModel({ buf: propBuf, count: built.propCount }, [I], { shade: 1 });
    }

    /* Quads: shadows, holes, rings, tracers. Kind by quad. */
    function drawQuads(game, al, th) {
      const q = dyn.quadData;
      let n = 0;
      function quad(p0, p1, p2, p3, col, kind) {
        if (n >= MAXQ) return;
        const P4 = [p0, p1, p2, p3], UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
        let o = n * 60;
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const p = P4[k];
          q[o] = p[0]; q[o + 1] = p[1]; q[o + 2] = p[2];
          q[o + 3] = UV[k][0]; q[o + 4] = UV[k][1];
          q[o + 5] = col[0]; q[o + 6] = col[1]; q[o + 7] = col[2]; q[o + 8] = col[3];
          q[o + 9] = kind;
          o += 10;
        }
        n++;
      }
      function flat(x, y, z, r, col, kind) {
        quad([x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r], col, kind);
      }
      // Capture rings and site marks.
      for (const p of game.points) {
        const c = p.owner < 0 ? [0.95, 0.95, 0.95, 0.85] : [...TEAM[p.owner], 0.9];
        flat(p.x, p.y + 0.03, p.z, PV.FpsGame.CAP_R, c, 2);
      }
      for (const s of game.sites) flat(s.x, s.y + 0.03, s.z, PV.FpsGame.SITE_R, [1, 0.72, 0.2, 0.85], 2);
      for (const f of game.flags) flat(f.hx, f.hy + 0.03, f.hz, 1.8, [...TEAM[f.team], 0.8], 2);
      // Shadows under soldiers.
      for (const a of game.actors) {
        if (!a.alive || (a === game.me && !cam.third)) continue;
        const x = a.px + (a.x - a.px) * al, z = a.pz + (a.z - a.pz) * al;
        const fy = world.floorAt(x, z, a.y + 0.1);
        flat(x, fy + 0.02, z, 0.45, [0, 0, 0, 0.35], 0);
      }
      // Bullet holes and scorch marks, lying on the face they hit.
      for (const h of holes) {
        const n2 = [h.nx, h.ny, h.nz];
        const t1 = Math.abs(n2[1]) > 0.9 ? [1, 0, 0] : [n2[2], 0, -n2[0]];
        const t2 = [n2[1] * t1[2] - n2[2] * t1[1], n2[2] * t1[0] - n2[0] * t1[2], n2[0] * t1[1] - n2[1] * t1[0]];
        const s = h.s, cx = h.x + n2[0] * 0.012, cy = h.y + n2[1] * 0.012, cz = h.z + n2[2] * 0.012;
        const P0 = [cx - t1[0] * s - t2[0] * s, cy - t1[1] * s - t2[1] * s, cz - t1[2] * s - t2[2] * s];
        const P1 = [cx + t1[0] * s - t2[0] * s, cy + t1[1] * s - t2[1] * s, cz + t1[2] * s - t2[2] * s];
        const P2 = [cx + t1[0] * s + t2[0] * s, cy + t1[1] * s + t2[1] * s, cz + t1[2] * s + t2[2] * s];
        const P3 = [cx - t1[0] * s + t2[0] * s, cy - t1[1] * s + t2[1] * s, cz - t1[2] * s + t2[2] * s];
        const fade = Math.min(1, (30 - h.t) / 4);
        quad(P0, P1, P2, P3, h.scorch ? [0.08, 0.07, 0.06, 0.7 * fade] : [0.06, 0.06, 0.06, 0.85 * fade], h.scorch ? 4 : 1);
      }
      // Tracers: thin quads along the shot, turned to face the camera.
      for (const t of tracers) {
        const dx = t.x1 - t.x0, dy = t.y1 - t.y0, dz = t.z1 - t.z0, L = Math.hypot(dx, dy, dz) || 1;
        const k0 = Math.min(1, t.t / 0.07) * 0.6, len = Math.min(L, 6);
        const sx = t.x0 + dx * k0, sy = t.y0 + dy * k0, sz = t.z0 + dz * k0;
        const ex = sx + dx / L * len, ey = sy + dy / L * len, ez = sz + dz / L * len;
        const vx = cam.x - sx, vy = cam.y - sy, vz = cam.z - sz;
        let wx = dy * vz - dz * vy, wy = dz * vx - dx * vz, wz = dx * vy - dy * vx;
        const wl = Math.hypot(wx, wy, wz) || 1, w = 0.025;
        wx = wx / wl * w; wy = wy / wl * w; wz = wz / wl * w;
        quad([sx - wx, sy - wy, sz - wz], [ex - wx, ey - wy, ez - wz], [ex + wx, ey + wy, ez + wz], [sx + wx, sy + wy, sz + wz], [1, 0.85, 0.5, 0.75], 3);
      }
      if (!n) return;
      const p = P.decal;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uni.uVP, false, vp);
      fogUniforms(p, th);
      R.upload(dyn.quad, q, n * 60);
      R.bind(p, dyn.quad, [['aPos', 3, 0], ['aUV', 2, 3], ['aCol', 4, 5], ['aKind', 1, 9]], 10);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -2);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function drawParticles() {
      if (!parts.length) return;
      const d = dyn.ptsData;
      const p = P.points;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uni.uVP, false, vp);
      gl.uniform1f(p.uni.uPx, H * 0.5 / Math.tan(cam.fov / 2) * dpr);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      for (const add of [false, true]) {
        let n = 0;
        for (const q of parts) {
          if (q.add !== add) continue;
          const k = q.t / q.life;
          const o = n * 8;
          d[o] = q.x; d[o + 1] = q.y; d[o + 2] = q.z;
          d[o + 3] = q.size * (1 + q.grow * k);
          d[o + 4] = q.col[0]; d[o + 5] = q.col[1]; d[o + 6] = q.col[2]; d[o + 7] = q.col[3] * (1 - k);
          n++;
        }
        if (!n) continue;
        gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        R.upload(dyn.pts, d, n * 8);
        R.bind(p, dyn.pts, [['aPos', 3, 0], ['aSize', 1, 3], ['aCol', 4, 4]], 8);
        gl.drawArrays(gl.POINTS, 0, n);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* ---- the gun in your hands ---- */

    const vm = { bob: 0, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, charm: 0, charmV: 0, kick: 0 };

    /**
     * v: { first, ads (0..1), g (the weapon), wear, reload (0..1 or -1),
     *      swap (0..1), fire (ticks since), swing (ticks since), speed,
     *      sprint, air, hide, dt }
     */
    function drawViewModel(game, v, th) {
      const me = game.me, g = v.g;
      if (!g || v.hide) { vm.muzzle = null; return; }
      const dt = v.dt;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      M4.perspective(vmProj, 54 * DEG, W / H, 0.01, 10);
      const w = D.W[g.id];
      const melee = w.cat === 'melee', pistol = w.cat === 'pistol';
      // Sway: the gun lags the view a little when it turns.
      const dyaw = cam.yaw - vm.lastYaw, dpit = cam.pitch - vm.lastPitch;
      vm.lastYaw = cam.yaw; vm.lastPitch = cam.pitch;
      const turnX = Math.max(-0.2, Math.min(0.2, -(dyaw > Math.PI ? dyaw - TAU : dyaw < -Math.PI ? dyaw + TAU : dyaw) * 1.2));
      const turnY = Math.max(-0.2, Math.min(0.2, dpit * 1.2));
      vm.swayX += (turnX - vm.swayX) * Math.min(1, dt * 10);
      vm.swayY += (turnY - vm.swayY) * Math.min(1, dt * 10);
      vm.bob += dt * (v.sprint ? 11 : 7.5) * Math.min(1, v.speed / 4);
      const bobA = Math.min(1, v.speed / 5) * (1 - v.ads * 0.85) * (v.sprint ? 1.6 : 1);
      const ads = v.ads;
      const sy = A.sightY(g.id, g.s.att);
      // Hip and aimed positions for the gun's origin (the grip).
      // High enough that both hands are on the screen, as in the reference.
      const hip = melee ? [0.17, -0.16, -0.31] : pistol ? [0.12, -0.125, -0.36] : [0.125, -0.13, -0.34];
      const aimZ = pistol ? -0.36 : -0.26;
      const at = [hip[0] + (0 - hip[0]) * ads, hip[1] + (-sy - hip[1]) * ads, hip[2] + (aimZ - hip[2]) * ads];
      let x = at[0] + vm.swayX * 0.08 + Math.sin(vm.bob) * 0.012 * bobA;
      let y = at[1] + vm.swayY * 0.06 - Math.abs(Math.cos(vm.bob)) * 0.012 * bobA;
      let z = at[2];
      let yaw = vm.swayX * 0.4, pitch = vm.swayY * 0.3, roll = Math.sin(vm.bob) * 0.02 * bobA;
      // Recoil: back and up for a moment after every shot.
      const k = Math.max(0, 1 - v.fire / 6);
      const kickScale = w.cat === 'sniper' || w.cat === 'shotgun' ? 2.2 : pistol ? 1.5 : 1;
      z += k * 0.035 * kickScale * (1 - ads * 0.5);
      pitch += k * 0.07 * kickScale;
      // Sprinting: across the chest. Swapping: down and back up.
      if (v.sprint && !ads) { x -= 0.06; y -= 0.04; yaw += 0.55; roll -= 0.25; }
      if (v.air) y += 0.02;
      if (v.swap > 0) { y -= v.swap * 0.35; pitch -= v.swap * 0.6; }
      if (v.reload >= 0) {
        const r = Math.sin(Math.min(1, v.reload) * Math.PI);
        y -= r * 0.1; roll += r * 0.5; pitch += r * 0.25; x -= r * 0.03;
      }
      if (melee && v.swing < 16) {
        const s = Math.sin(v.swing / 16 * Math.PI);
        x -= s * 0.22; yaw += s * 1.1; pitch -= s * 0.3; z -= s * 0.1;
      }
      const base = M4.compose(M4.create(), x, y, z, yaw, pitch, roll);
      const shade = sunAt(cam.x, cam.y, cam.z, th);
      modelBegin(th, shade, true);
      const gm = modelOf(A.gun(g.id, g.s.att));
      drawModel(gm, [base], { camo: g.camo, shade: shade });
      const am = modelOf(A.arms(g.id, v.wear && v.wear.hands));
      drawModel(am, [base], { team: v.team, shade: shade });
      // The charm on its cord, swinging with the gun.
      const cm = g.charm && g.charm !== 'none' ? modelOf(A.charm(g.charm)) : null;
      if (cm) {
        const acc = (turnX * 4 + Math.sin(vm.bob) * bobA * 0.6 + k * 0.8);
        vm.charmV += (-vm.charm * 60 - vm.charmV * 4 + acc * 30) * dt;
        vm.charm += vm.charmV * dt;
        const hook = w.charm;
        const cmM = M4.multiply(M4.create(), base, M4.compose(tmp, -hook[0], hook[1], -hook[2], 0, 0, Math.max(-1, Math.min(1, vm.charm))));
        drawModel(cm, [cmM], { shade: shade });
      }
      // Where the muzzle is, in the world, for the tracer and the flash.
      const mz = w.muzzle;
      const vpos = M4.apply(base, 0, mz[0], -mz[1] - (g.s.att.muzzle === 'supp' ? 0.17 : 0));
      // Camera space to world space.
      const cy = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const r = [cy, 0, syw], u = [-syw * sp, cp, cy * sp], b = [-syw * cp, -sp, cy * cp];
      vm.muzzle = [cam.x + r[0] * vpos[0] + u[0] * vpos[1] + b[0] * vpos[2],
        cam.y + r[1] * vpos[0] + u[1] * vpos[1] + b[1] * vpos[2],
        cam.z + r[2] * vpos[0] + u[2] * vpos[1] + b[2] * vpos[2]];
      vm.flashAt = vpos;
      // Muzzle fire, in the gun's own space so it sits on the muzzle.
      if (v.fire < 2 && !g.s.quiet && !melee) {
        const p = P.points;
        gl.useProgram(p.prog);
        gl.uniformMatrix4fv(p.uni.uVP, false, vmProj);
        gl.uniform1f(p.uni.uPx, H * 0.5 / Math.tan(27 * DEG) * dpr);
        const d = dyn.ptsData;
        const s = w.cat === 'shotgun' || w.cat === 'sniper' ? 0.16 : 0.1;
        const pts = [[vpos[0], vpos[1], vpos[2], s, 1, 0.85, 0.5, 1], [vpos[0], vpos[1], vpos[2] - 0.03, s * 0.6, 1, 1, 0.8, 1]];
        pts.forEach((q2, i) => d.set(q2, i * 8));
        R.upload(dyn.pts, d, 16);
        R.bind(p, dyn.pts, [['aPos', 3, 0], ['aSize', 1, 3], ['aCol', 4, 4]], 8);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, 2);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    /* ---- a frame ---- */

    /**
     * cam: {x, y, z, yaw, pitch, fov, roll, third}
     * v:   view-model state (see drawViewModel), plus `events` since the
     *      last frame and `dt`.
     */
    function frame(game, c, v) {
      if (!world || world.key !== game.world.key) load(game.world);
      const th = world.theme;
      effects(game, v, v.events || []);
      stepEffects(v.dt);
      setCamera(c);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      drawSky(th);
      drawWorld(th);
      const now = v.now || 0;
      drawThings(game, v.al, th, now);
      drawSoldiers(game, v.al, th);
      drawQuads(game, v.al, th);
      drawParticles();
      if (v.first) drawViewModel(game, v, th);
      else vm.muzzle = null;
      return vm;
    }

    function resize(w, h, ratio) {
      W = w; H = h; dpr = ratio;
      const cw = Math.round(w * ratio), ch = Math.round(h * ratio);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    }

    function destroy() {
      for (const b of bins) R.drop(b.buf);
      if (floorBuf) R.drop(floorBuf);
      if (propBuf) R.drop(propBuf);
      for (const k in models) R.drop(models[k].buf);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }

    return { frame: frame, resize: resize, project: project, destroy: destroy, cam: cam, get vm() { return vm; } };
  };

  /** A unit sphere for the sky, as triangles. */
  function skyDome() {
    const out = [];
    const seg = 24, rings = 12;
    const P = (i, j) => {
      const th = Math.PI * j / rings - Math.PI / 2, ph = i / seg * TAU;
      return [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)];
    };
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        out.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    return out;
  }

  /** The bake on its own, for the tests: how long a map takes to light. */
  PV.FpsScene.bake = bake;

})(window.PV);
