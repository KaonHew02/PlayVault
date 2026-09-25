/* 变色躲猫猫 / Blend In — the scene.

   Builds a map into buffers once and draws a round every frame.

   THE WORLD: every face of every box that is not buried in another, with
   its material's texture and the one light (gl.js). A face's texture
   coordinates come from world.js's uvOf(), the same function the engine
   samples colours with, so a wall on screen and a wall in a bot's eye are
   the same wall to the texel.

   BODIES: one mesh for the whole figure, built from body.js's parts, every
   vertex hung on its bone and pointing into the atlas. Each body brings its
   own paint, a 128 x 128 texture refreshed whenever its paint changes. A
   seeker is flat black with a red outline, as in the reference. A found
   hider is gone: it pops in a burst of water.

   Effects are this file's own and never read back: droplets in the air,
   spray where they land, wet splats that dry off the walls, the pop. They
   use Math.random(), which is fine here and nowhere in the engine. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const G = PV.HideGL, M4 = G.M4, D = PV.HideData, B = PV.HideBody;
  const TAU = Math.PI * 2;
  const MAXP = 1600, MAXQ = 500;
  const hexf = h => D.hex(h).map(v => v / 255);

  /* ----------------------------------------------------------- the bake */

  const bakes = Object.create(null);
  const FACES = [
    // key, normal, corner (lo/hi per axis), u edge, v edge
    ['py', [0, 1, 0]], ['ny', [0, -1, 0]], ['pz', [0, 0, 1]], ['nz', [0, 0, -1]], ['px', [1, 0, 0]], ['nx', [-1, 0, 0]]
  ];

  function corners(b, f) {
    const { x0, y0, z0, x1, y1, z1 } = b;
    switch (f) {
      case 'py': return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
      case 'ny': return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
      case 'pz': return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      case 'nz': return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
      case 'px': return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
      default: return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    }
  }

  function bake(world) {
    if (bakes[world.key]) return bakes[world.key];
    const W = PV.HideWorld;
    const bins = Object.create(null);
    const inBox = (x, y, z, self) => {
      const list = world.near(x, z, 0.05);
      for (const b of list) if (b !== self && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return true;
      return false;
    };
    const uv = [0, 0];
    for (const b of world.boxes) {
      for (const F of FACES) {
        const f = F[0], n = F[1];
        const q = corners(b, f);
        // Skipped only when buried all over: a poster on a wall covers a
        // bit of the wall's face, not the face.
        let buried = true;
        for (let i = 0; i < 3 && buried; i++) {
          for (let j = 0; j < 3 && buried; j++) {
            const u = 0.08 + 0.42 * i, v = 0.08 + 0.42 * j;
            const px = q[0][0] + (q[1][0] - q[0][0]) * u + (q[3][0] - q[0][0]) * v + n[0] * 0.004;
            const py = q[0][1] + (q[1][1] - q[0][1]) * u + (q[3][1] - q[0][1]) * v + n[1] * 0.004;
            const pz = q[0][2] + (q[1][2] - q[0][2]) * u + (q[3][2] - q[0][2]) * v + n[2] * 0.004;
            if (!inBox(px, py, pz, b)) buried = false;
          }
        }
        if (buried) continue;
        if (f === 'ny' && b.y0 <= -0.25) continue;
        const mat = W.matOf(b, f);
        const s = D.shade(n[0], n[1], n[2]);
        const out = bins[mat] || (bins[mat] = []);
        const put = p => { W.uvOf(b, f, p[0], p[1], p[2], uv); out.push(p[0], p[1], p[2], uv[0], uv[1], s); };
        put(q[0]); put(q[1]); put(q[2]);
        put(q[0]); put(q[2]); put(q[3]);
      }
    }
    const res = { bins: {} };
    for (const k in bins) res.bins[k] = new Float32Array(bins[k]);
    // Ground past the walls for the open-sky maps, so a look over a wall
    // does not show the void.
    const gx0 = -150, gx1 = world.W + 150, gz0 = -150, gz1 = world.D + 150, y = -0.35;
    const gm = D.MATS.grass.size;
    res.ground = new Float32Array([gx0, y, gz0, gx0 / gm, gz0 / gm, 0.78, gx1, y, gz1, gx1 / gm, gz1 / gm, 0.78, gx1, y, gz0, gx1 / gm, gz0 / gm, 0.78,
      gx0, y, gz0, gx0 / gm, gz0 / gm, 0.78, gx0, y, gz1, gx0 / gm, gz1 / gm, 0.78, gx1, y, gz1, gx1 / gm, gz1 / gm, 0.78]);
    bakes[world.key] = res;
    return res;
  }

  /* The body mesh: every part, round and down, in its bone's space. */
  function bodyMesh() {
    const d = [], AT = B.AT, o = [0, 0, 0, 0, 0, 0];
    for (const p of B.PARTS) {
      const r = p.rect, nu = p.seg, nv = p.bone === 1 ? 14 : p.bone === 2 ? 12 : 9;
      const V = [];
      for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
          const u = i / nu, s = j / nv;
          B.surf(p, Math.min(0.99999, u), s, o);
          const tx = Math.max(r.x + 0.5, Math.min(r.x + r.w - 0.5, r.x + u * r.w)) / AT;
          const ty = Math.max(r.y + 0.5, Math.min(r.y + r.h - 0.5, r.y + s * r.h)) / AT;
          V.push([o[0], o[1], o[2], o[3], o[4], o[5], tx, ty, p.bone]);
        }
      }
      const at = (i, j) => V[j * (nu + 1) + i];
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          // Counter-clockwise seen from outside: round the part is +u, down
          // it is +s, and (a, c, e) turns the outward way.
          const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
          for (const v of [a, c, e, a, b, c]) d.push.apply(d, v);
        }
      }
    }
    return new Float32Array(d);
  }

  /* A toy water gun, pointing down -z, the grip at the origin. */
  function gunGeo(skin) {
    const g = new G.Geo(), m = M4.create();
    const body = hexf(skin.body), tank = hexf(skin.tank), noz = hexf(skin.nozzle), grip = hexf(skin.grip);
    g.box(M4.compose(m, 0, 0.06, -0.2, 0, 0, 0), 0.1, 0.12, 0.5, body);
    g.box(M4.compose(m, 0, 0.14, -0.08, 0, 0, 0), 0.06, 0.05, 0.3, body);
    g.cyl(M4.compose(m, 0, 0.19, -0.2, 0, 0, 0), 0.07, 0.32, 10, tank);
    g.box(M4.compose(m, 0, 0.06, -0.5, 0, 0, 0), 0.07, 0.07, 0.12, noz);
    g.cyl(M4.compose(m, 0, 0.06, -0.59, 0, 0, 0), 0.025, 0.08, 8, noz);
    g.box(M4.compose(m, 0, -0.06, -0.02, 0, 0.25, 0), 0.06, 0.16, 0.07, grip);
    g.box(M4.compose(m, 0, -0.01, -0.12, 0, 0, 0), 0.03, 0.07, 0.04, grip);
    g.box(M4.compose(m, 0, 0.03, 0.08, 0, 0, 0), 0.08, 0.1, 0.14, body);
    return g;
  }

  function skyDome() {
    const out = [], n = 16, m = 8;
    const P = (i, j) => { const th = Math.PI * j / m - Math.PI / 2, ph = i / n * TAU; return [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)]; };
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); out.push(...a, ...c, ...b, ...a, ...d, ...c); }
    return new Float32Array(out);
  }

  /* -------------------------------------------------------- the scene */

  PV.HideScene = function (canvas) {
    const R = G.Renderer(canvas);
    const gl = R.gl, P = R.progs;
    const vp = M4.create(), view = M4.create(), proj = M4.create(), tmp = M4.create(), mm = M4.create();
    const bones = new Float32Array(11 * 16);
    const rmats = B.newMats();
    let Wd = 1, Hd = 1, dpr = 1, W = 1, H = 1;
    let world = null, key = null;
    const bins = [];
    const tex = Object.create(null);
    const paints = Object.create(null);         // actor id -> { t, ver, rgba }
    const guns = Object.create(null);
    const body = (function () { const d = bodyMesh(); return { buf: R.buffer(d), count: d.length / 9 }; })();
    const sky = R.buffer(skyDome());
    const skyCount = skyDome().length / 3;
    let ground = null;
    const dyn = {
      pts: R.buffer(new Float32Array(MAXP * 8), true), ptsData: new Float32Array(MAXP * 8),
      quad: R.buffer(new Float32Array(MAXQ * 6 * 10), true), quadData: new Float32Array(MAXQ * 6 * 10)
    };
    const parts = [], splats = [], rings = [];
    const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1.2 };
    const proxy = Object.create(null);

    function texOf(k) {
      if (tex[k]) return tex[k];
      const m = D.MATS[k] || D.MATS.white, n = m.res, px = D.texels(k), rgba = new Uint8Array(n * n * 4);
      for (let i = 0; i < n * n; i++) { rgba[i * 4] = px[i * 3]; rgba[i * 4 + 1] = px[i * 3 + 1]; rgba[i * 4 + 2] = px[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
      tex[k] = R.texture(rgba, n, !m.pic, true);
      return tex[k];
    }

    function load(w) {
      world = w; key = w.key;
      const bk = bake(w);
      for (const b of bins) R.drop(b.buf);
      bins.length = 0;
      for (const k in bk.bins) { texOf(k); bins.push({ tex: k, buf: R.buffer(bk.bins[k]), count: bk.bins[k].length / 6 }); }
      if (ground) R.drop(ground);
      ground = R.buffer(bk.ground);
      texOf('grass');
      parts.length = 0; splats.length = 0; rings.length = 0;
    }

    function paintOf(a) {
      let p = paints[a.id];
      if (!p) {
        const rgba = new Uint8Array(B.AT * B.AT * 4);
        p = paints[a.id] = { t: R.texture(rgba, B.AT, false, false), ver: -1, rgba: rgba };
      }
      if (p.ver !== a.paintVer) {
        const src = a.paint, dst = p.rgba;
        for (let k = 0; k < B.TN; k++) { dst[k * 4] = src[k * 3]; dst[k * 4 + 1] = src[k * 3 + 1]; dst[k * 4 + 2] = src[k * 3 + 2]; dst[k * 4 + 3] = 255; }
        R.retexture(p.t, dst, B.AT);
        p.ver = a.paintVer;
      }
      return p.t;
    }

    function gunOf(id) {
      const k = D.BLASTER[id] ? id : 'classic';
      if (!guns[k]) guns[k] = R.model(gunGeo(D.BLASTER[k]));
      return guns[k];
    }

    /* ---- effects ---- */

    function spawn(x, y, z, vx, vy, vz, life, size, col, grav) {
      if (parts.length >= MAXP - 4) parts.shift();
      parts.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, t: 0, life: life, size: size, col: col, grav: grav == null ? 9 : grav });
    }
    const rnd = Math.random;
    function splat(x, y, z, nx, ny, nz, s, col, life, kind) {
      if (splats.length >= MAXQ - 40) splats.shift();
      splats.push({ x: x, y: y, z: z, nx: nx, ny: ny, nz: nz, s: s, col: col, t: 0, life: life, kind: kind || 0, seed: rnd() });
    }

    function effects(game, list) {
      for (const e of list) {
        if (e.k === 'splash') {
          for (let i = 0; i < 3; i++) spawn(e.x, e.y, e.z, e.nx * 1.5 + (rnd() - 0.5) * 2, e.ny * 1.5 + rnd() * 1.5, e.nz * 1.5 + (rnd() - 0.5) * 2, 0.3 + rnd() * 0.25, 0.035, [0.62, 0.84, 1, 0.85]);
          if (rnd() < 0.5) splat(e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.12 + rnd() * 0.14, [0.1, 0.25, 0.45, 0.28], 7);
        } else if (e.k === 'hit') {
          for (let i = 0; i < 7; i++) spawn(e.x, e.y, e.z, (rnd() - 0.5) * 3, rnd() * 2.5, (rnd() - 0.5) * 3, 0.35 + rnd() * 0.3, 0.045, [0.7, 0.88, 1, 0.95]);
        } else if (e.k === 'found') {
          for (let i = 0; i < 70; i++) {
            const a = rnd() * TAU, u = rnd() * 2 - 1, sp = 2 + rnd() * 5;
            spawn(e.x, e.y, e.z, Math.cos(a) * Math.sqrt(1 - u * u) * sp, Math.abs(u) * sp + 1, Math.sin(a) * Math.sqrt(1 - u * u) * sp, 0.6 + rnd() * 0.6, 0.07 + rnd() * 0.06, rnd() < 0.3 ? [1, 1, 1, 0.95] : [0.45, 0.75, 1, 0.9]);
          }
          const f = world ? world.floorAt(e.x, e.z, e.y, 0.1) : 0;
          splat(e.x, f + 0.012, e.z, 0, 1, 0, 1.1, [0.2, 0.45, 0.8, 0.5], 10);
          rings.push({ x: e.x, y: f + 0.02, z: e.z, t: 0 });
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
      }
      for (let i = splats.length - 1; i >= 0; i--) { splats[i].t += dt; if (splats[i].t > splats[i].life) splats.splice(i, 1); }
      for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.8) rings.splice(i, 1); }
    }

    /* ---- the camera ---- */

    function setCamera(c) {
      Object.assign(cam, c);
      M4.look(view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
      M4.perspective(proj, cam.fov, W / H, 0.05, 400);
      M4.multiply(vp, proj, view);
    }

    function project(x, y, z) {
      const p = M4.apply(vp, x, y, z);
      if (p[3] <= 0.05) return null;
      return { x: (p[0] / p[3] * 0.5 + 0.5) * W, y: (0.5 - p[1] / p[3] * 0.5) * H, d: p[3] };
    }

    /** The ray under a point on the screen (CSS pixels). */
    function rayAt(px, py) {
      const nx = px / W * 2 - 1, ny = 1 - py / H * 2;
      const t = Math.tan(cam.fov / 2), asp = W / H;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const f = [sy * cp, sp, -cy * cp], r = [cy, 0, sy], u = [-sy * sp, cp, cy * sp];
      const d = [f[0] + r[0] * nx * t * asp + u[0] * ny * t, f[1] + r[1] * nx * t * asp + u[1] * ny * t, f[2] + r[2] * nx * t * asp + u[2] * ny * t];
      const l = Math.hypot(d[0], d[1], d[2]);
      return { ox: cam.x, oy: cam.y, oz: cam.z, dx: d[0] / l, dy: d[1] / l, dz: d[2] / l };
    }

    /* ---- drawing ---- */

    function common(p) {
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.uni.uVP, false, vp);
      if (p.uni.uEye) gl.uniform3f(p.uni.uEye, cam.x, cam.y, cam.z);
      if (p.uni.uFog) {
        gl.uniform3fv(p.uni.uFog, world && world.sky ? hexf(world.skyLow) : [0.8, 0.8, 0.8]);
        gl.uniform2f(p.uni.uFogR, world && world.sky ? 60 : 900, world && world.sky ? 220 : 1000);
      }
    }

    /** The body matrices for drawing: the engine's actor, moved to where it
        is between its last two ticks. */
    function renderMats(a, al, t) {
      let q = proxy[a.id];
      if (!q) q = proxy[a.id] = {};
      for (const k in a) { const v = a[k]; if (typeof v !== 'object' || v === null) q[k] = v; }
      q.climb = a.climb;
      q.x = a.px + (a.x - a.px) * al; q.y = a.py + (a.y - a.py) * al; q.z = a.pz + (a.z - a.pz) * al;
      if (t != null) q.t = t;
      return B.pose(rmats, q);
    }

    function drawBody(a, al, v) {
      const p = P.body;
      renderMats(a, al, v.now + a.id * 1.37);
      for (let i = 0; i < 11 * 16; i++) bones[i] = rmats[i];
      gl.uniformMatrix4fv(p.uni.uBones, false, bones);
      const seeker = a.role === 'seeker';
      const wet = Math.min(1, a.soak * 1.4);
      gl.uniform1f(p.uni.uWet, wet);
      gl.uniform1f(p.uni.uFlash, v.flash && v.flash[a.id] ? v.flash[a.id] : 0);
      gl.uniform1f(p.uni.uFat, 0);
      if (seeker) {
        gl.uniform1f(p.uni.uMode, 1);
        gl.uniform3fv(p.uni.uFlat, [0.12, 0.12, 0.14]);
      } else {
        gl.uniform1f(p.uni.uMode, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, paintOf(a));
        gl.uniform1i(p.uni.uPaint, 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, body.count);
      if (seeker || v.outline === a.id) {
        // The outline: the same body, inside out and a little fatter.
        gl.cullFace(gl.FRONT);
        gl.uniform1f(p.uni.uFat, 0.022);
        gl.uniform1f(p.uni.uMode, 2);
        gl.uniform3fv(p.uni.uFlat, seeker ? [0.9, 0.16, 0.14] : [1, 0.85, 0.2]);
        gl.drawArrays(gl.TRIANGLES, 0, body.count);
        gl.cullFace(gl.BACK);
      }
    }

    function frame(game, c, v) {
      if (!world || game.world.key !== key) load(game.world);
      stepEffects(v.dt);
      effects(game, v.events || []);
      setCamera(c);
      gl.viewport(0, 0, Wd, Hd);
      gl.clearColor(0.8, 0.85, 0.9, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND);

      // Sky.
      gl.depthMask(false);
      gl.useProgram(P.sky.prog);
      gl.uniformMatrix4fv(P.sky.uni.uVP, false, vp);
      gl.uniform3f(P.sky.uni.uEye, cam.x, cam.y, cam.z);
      gl.uniform3fv(P.sky.uni.uTop, hexf(world.skyTop));
      gl.uniform3fv(P.sky.uni.uLow, hexf(world.skyLow));
      gl.disable(gl.CULL_FACE);
      R.bind(P.sky, sky, [['aPos', 3, 0]], 3);
      gl.drawArrays(gl.TRIANGLES, 0, skyCount);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);

      // The world.
      const pw = P.world;
      common(pw);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(pw.uni.uTex, 0);
      gl.bindTexture(gl.TEXTURE_2D, texOf('grass'));
      R.bind(pw, ground, [['aPos', 3, 0], ['aUV', 2, 3], ['aShade', 1, 5]], 6);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      for (const b of bins) {
        gl.bindTexture(gl.TEXTURE_2D, texOf(b.tex));
        R.bind(pw, b.buf, [['aPos', 3, 0], ['aUV', 2, 3], ['aShade', 1, 5]], 6);
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }

      // Bodies.
      const pb = P.body;
      common(pb);
      R.bind(pb, body.buf, [['aPos', 3, 0], ['aNrm', 3, 3], ['aUV', 2, 6], ['aBone', 1, 8]], 9);
      for (const a of game.actors) {
        if (a.found) continue;
        if (a === game.me && c.first) continue;
        drawBody(a, v.al, v);
      }

      // Water guns in seekers' hands.
      const pm = P.model;
      common(pm);
      for (const a of game.actors) {
        if (a.role !== 'seeker' || a.found || (a === game.me && c.first)) continue;
        const g = gunOf(a === game.me ? v.blaster : ['classic', 'ocean', 'lava', 'bubble', 'lemon', 'neon'][a.id % 6]);
        const x = a.px + (a.x - a.px) * v.al, y = a.py + (a.y - a.py) * v.al, z = a.pz + (a.z - a.pz) * v.al;
        const f = PV.HideGame.dir(a.lookYaw, 0), rx = Math.cos(a.lookYaw), rz = Math.sin(a.lookYaw);
        M4.compose(mm, x + f[0] * 0.42 + rx * 0.12, y + 1.18 + Math.sin(a.lookPitch) * 0.3, z + f[2] * 0.42 + rz * 0.12, a.lookYaw, a.lookPitch, 0, 1.2);
        gl.uniformMatrix4fv(pm.uni.uM, false, mm);
        R.bind(pm, g.buf, [['aPos', 3, 0], ['aNrm', 3, 3], ['aCol', 3, 6]], 9);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }

      // Wet splats and rings: flat, blended, on the surfaces.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -4);
      let nq = 0;
      const Q = dyn.quadData;
      const quad = (x, y, z, nx, ny, nz, s, col, kind) => {
        if (nq >= MAXQ) return;
        let tx, tz, ty;
        if (Math.abs(ny) > 0.5) { tx = [1, 0, 0]; ty = [0, 0, 1]; } else { tx = [-nz, 0, nx]; ty = [0, 1, 0]; }
        tz = null;
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
        for (const q of cs) {
          const o = nq * 60 + cs.indexOf(q) * 10;
          Q[o] = x + (tx[0] * q[0] + ty[0] * q[1]) * s + nx * 0.004;
          Q[o + 1] = y + (tx[1] * q[0] + ty[1] * q[1]) * s + ny * 0.004;
          Q[o + 2] = z + (tx[2] * q[0] + ty[2] * q[1]) * s + nz * 0.004;
          Q[o + 3] = (q[0] + 1) / 2; Q[o + 4] = (q[1] + 1) / 2;
          Q[o + 5] = col[0]; Q[o + 6] = col[1]; Q[o + 7] = col[2]; Q[o + 8] = col[3]; Q[o + 9] = kind;
        }
        nq++;
      };
      for (const s of splats) {
        const k = 1 - Math.max(0, (s.t - s.life * 0.6) / (s.life * 0.4));
        quad(s.x, s.y, s.z, s.nx, s.ny, s.nz, s.s * Math.min(1, 0.4 + s.t * 8), [s.col[0], s.col[1], s.col[2], s.col[3] * k + 0 * s.seed], 0);
      }
      for (const r of rings) quad(r.x, r.y, r.z, 0, 1, 0, 0.4 + r.t * 3, [0.75, 0.9, 1, 1 - r.t / 0.8], 1);
      if (nq) {
        const pd = P.decal;
        gl.useProgram(pd.prog);
        gl.uniformMatrix4fv(pd.uni.uVP, false, vp);
        R.upload(dyn.quad, Q, nq * 60);
        R.bind(pd, dyn.quad, [['aPos', 3, 0], ['aUV', 2, 3], ['aCol', 4, 5], ['aKind', 1, 9]], 10);
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, nq * 6);
        gl.enable(gl.CULL_FACE);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);

      // Droplets and spray.
      let np = 0;
      const PT = dyn.ptsData;
      const pt = (x, y, z, s, col) => {
        if (np >= MAXP) return;
        const o = np * 8;
        PT[o] = x; PT[o + 1] = y; PT[o + 2] = z; PT[o + 3] = s; PT[o + 4] = col[0]; PT[o + 5] = col[1]; PT[o + 6] = col[2]; PT[o + 7] = col[3];
        np++;
      };
      const k = v.al / D.HZ;
      for (const d of game.drops) {
        const x = d.x + d.vx * k, y = d.y + d.vy * k, z = d.z + d.vz * k;
        pt(x, y, z, 0.075, [0.55, 0.8, 1, 0.9]);
        pt(x - d.vx * 0.012, y - d.vy * 0.012, z - d.vz * 0.012, 0.06, [0.6, 0.85, 1, 0.6]);
      }
      for (const p of parts) pt(p.x, p.y, p.z, p.size, [p.col[0], p.col[1], p.col[2], p.col[3] * (1 - p.t / p.life)]);
      if (np) {
        const pp = P.points;
        gl.useProgram(pp.prog);
        gl.uniformMatrix4fv(pp.uni.uVP, false, vp);
        gl.uniform1f(pp.uni.uPx, Hd / (2 * Math.tan(cam.fov / 2)));
        R.upload(dyn.pts, PT, np * 8);
        R.bind(pp, dyn.pts, [['aPos', 3, 0], ['aSize', 1, 3], ['aCol', 4, 4]], 8);
        gl.drawArrays(gl.POINTS, 0, np);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      // The first-person water gun, in its own space, over everything.
      if (c.first && v.gun) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const g = gunOf(v.blaster);
        const bob = v.bob || 0, kick = v.kick || 0;
        const vm = M4.create();
        M4.compose(vm, 0.25 + Math.sin(bob) * 0.012, -0.25 + Math.abs(Math.cos(bob)) * 0.01 + kick * 0.01, -0.62 + kick * 0.04, 0.07, 0.03 + kick * 0.05, 0, 0.82);
        M4.perspective(tmp, 1.05, W / H, 0.02, 10);
        gl.useProgram(pm.prog);
        gl.uniformMatrix4fv(pm.uni.uVP, false, tmp);
        gl.uniform3f(pm.uni.uEye, 0, 0, 0);
        gl.uniform3fv(pm.uni.uFog, [1, 1, 1]);
        gl.uniform2f(pm.uni.uFogR, 900, 1000);
        gl.uniformMatrix4fv(pm.uni.uM, false, vm);
        R.bind(pm, g.buf, [['aPos', 3, 0], ['aNrm', 3, 3], ['aCol', 3, 6]], 9);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }
    }

    return {
      frame: frame,
      project: project,
      rayAt: rayAt,
      resize(w, h, d) {
        W = w; H = h; dpr = d;
        const cw = Math.round(w * d), ch = Math.round(h * d);
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        Wd = cw; Hd = ch;
      },
      /** A texture of this body's paint, for a picture of it elsewhere. */
      renderMats: renderMats,
      destroy() {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  };

  PV.HideScene.gunGeo = gunGeo;

})(window.PV);
