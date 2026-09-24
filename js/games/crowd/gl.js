/* 人潮冲锋 / Crowd Rush — a small WebGL layer.

   The reference is a 3D game, and a crowd drawn as flat sprites down one
   vanishing point was the thing that kept this one looking homemade. This is
   just enough 3D to draw it properly and nothing more: column-major matrices,
   a handful of mesh builders, five shader programs, and instancing so that
   six hundred running people are one draw call.

   No library, on purpose. PlayVault has no dependencies and a CSP that loads
   scripts from this origin only; a 600 kB engine for one game would be the
   first exception to both. WebGL 2 where there is one, WebGL 1 with the
   instancing extension (which every browser that has WebGL 1 ships) where
   not, and the shaders are GLSL ES 1.00 so they compile under either.

   Nothing here knows about the game. scene.js builds the world with it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* ------------------------------------------------------------- mat4 */

  /* Column-major Float32Array(16), the layout GL wants. */
  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },

    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
      }
      return out;
    },

    /* A right-handed perspective, MIRRORED on x. The world has +x to the
       player's right and looks down +z; a right-handed camera looking down
       +z puts +x on the left of the screen. Mirroring here, once, is simpler
       than negating x everywhere else — nothing culls back faces, so the
       flipped winding costs nothing. */
    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out.fill(0);
      out[0] = -f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },

    lookAt(out, ex, ey, ez, tx, ty, tz) {
      let zx = ex - tx, zy = ey - ty, zz = ez - tz;
      let l = Math.hypot(zx, zy, zz) || 1;
      zx /= l; zy /= l; zz /= l;
      // x = up × z, with up = +y
      let xx = zz, xy = 0, xz = -zx;
      l = Math.hypot(xx, xy, xz) || 1;
      xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * ex + xy * ey + xz * ez);
      out[13] = -(yx * ex + yy * ey + yz * ez);
      out[14] = -(zx * ex + zy * ey + zz * ez);
      out[15] = 1;
      return out;
    },

    /** Translate, then rotate (yaw about y, pitch about x, roll about z, in
        that order), then scale. Yaw 0 faces +z; yaw π/2 faces +x. */
    compose(out, x, y, z, yaw, pitch, roll, sx, sy, sz) {
      const ca = Math.cos(yaw || 0), sa = Math.sin(yaw || 0);
      const cb = Math.cos(pitch || 0), sb = Math.sin(pitch || 0);
      const cc = Math.cos(roll || 0), sc = Math.sin(roll || 0);
      const X = sx == null ? 1 : sx, Y = sy == null ? X : sy, Z = sz == null ? X : sz;
      out[0] = (ca * cc + sa * sb * sc) * X;
      out[1] = (cb * sc) * X;
      out[2] = (-sa * cc + ca * sb * sc) * X;
      out[3] = 0;
      out[4] = (-ca * sc + sa * sb * cc) * Y;
      out[5] = (cb * cc) * Y;
      out[6] = (sa * sc + ca * sb * cc) * Y;
      out[7] = 0;
      out[8] = (sa * cb) * Z;
      out[9] = (-sb) * Z;
      out[10] = (ca * cb) * Z;
      out[11] = 0;
      out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
      return out;
    },

    /** Where a point lands in clip space: [x, y, z, w]. */
    apply(m, x, y, z, out) {
      const o = out || [0, 0, 0, 0];
      o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      o[3] = m[3] * x + m[7] * y + m[11] * z + m[15];
      return o;
    }
  };

  /** '#RRGGBB' to [r, g, b] in 0..1. */
  function rgb(hex) {
    const v = parseInt(String(hex).slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  /** Mix two [r,g,b]. */
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ----------------------------------------------------------- meshes */

  /* A mesh while it is being built: loose triangles, one normal per vertex.
     No index buffers anywhere — the biggest thing drawn is under 100k
     vertices, and drawArrays needs no extension on WebGL 1. */
  class Geo {
    constructor() { this.p = []; this.n = []; }
    v(x, y, z, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); }
    tri(a, b, c, na, nb, nc) {
      this.v(a[0], a[1], a[2], na[0], na[1], na[2]);
      this.v(b[0], b[1], b[2], nb[0], nb[1], nb[2]);
      this.v(c[0], c[1], c[2], nc[0], nc[1], nc[2]);
    }
    /** A flat quad, a-b-c-d going round. */
    quad(a, b, c, d, n) {
      const nn = n || faceNormal(a, b, c);
      this.tri(a, b, c, nn, nn, nn);
      this.tri(a, c, d, nn, nn, nn);
    }
    get count() { return this.p.length / 3; }
  }

  function faceNormal(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    // Everything here is lit double-sided; point the normal at the outside
    // the caller meant, which is the one with the larger y or away from the
    // origin — builders below pass their own normals where it matters.
    return [nx / l, ny / l, nz / l];
  }

  const Mesh = {
    /** A box centred on the origin. */
    box(w, h, d) {
      const g = new Geo(), x = w / 2, y = h / 2, z = d / 2;
      g.quad([-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0]);
      g.quad([-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z], [0, -1, 0]);
      g.quad([-x, -y, z], [-x, y, z], [x, y, z], [x, -y, z], [0, 0, 1]);
      g.quad([x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, -z], [0, 0, -1]);
      g.quad([x, -y, z], [x, y, z], [x, y, -z], [x, -y, -z], [1, 0, 0]);
      g.quad([-x, -y, -z], [-x, y, -z], [-x, y, z], [-x, -y, z], [-1, 0, 0]);
      return g;
    },

    /**
     * A surface of revolution about y. `prof` is [[r, y], ...] from bottom
     * to top; a radius of 0 closes the end. Smooth normals from the profile.
     */
    lathe(prof, seg, flat) {
      const g = new Geo(), n = prof.length;
      const pn = [];
      for (let i = 0; i < n; i++) {
        const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
        let dr = b[0] - a[0], dy = b[1] - a[1];
        const l = Math.hypot(dr, dy) || 1;
        pn.push([dy / l, -dr / l]);            // (radial, y) outward
      }
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        const c0 = Math.sin(a0), s0 = Math.cos(a0), c1 = Math.sin(a1), s1 = Math.cos(a1);
        for (let i = 0; i < n - 1; i++) {
          const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
          const P = (r, y, c, s2) => [r * c, y, r * s2];
          const N = (k, c, s2) => [pn[k][0] * c, pn[k][1], pn[k][0] * s2];
          const p00 = P(r0, y0, c0, s0), p01 = P(r0, y0, c1, s1), p10 = P(r1, y1, c0, s0), p11 = P(r1, y1, c1, s1);
          if (flat) {
            // From the diagonals, so a quad that closes to a point at the tip
            // (r = 0) still has a normal; one from its own degenerate
            // triangle is zero, and a zero normal lights as black.
            const d1 = [p11[0] - p00[0], p11[1] - p00[1], p11[2] - p00[2]];
            const d2 = [p10[0] - p01[0], p10[1] - p01[1], p10[2] - p01[2]];
            let fx = d1[1] * d2[2] - d1[2] * d2[1], fy = d1[2] * d2[0] - d1[0] * d2[2], fz = d1[0] * d2[1] - d1[1] * d2[0];
            const fl = Math.hypot(fx, fy, fz) || 1;
            fx /= fl; fy /= fl; fz /= fl;
            const mx = (c0 + c1) / 2, mz = (s0 + s1) / 2;
            // Outward: away from the axis, or up for a flat top.
            if (fx * mx + fz * mz + fy * 0.001 * Math.sign(y1 - y0 || 1) < 0) { fx = -fx; fy = -fy; fz = -fz; }
            if (Math.abs(fx * mx + fz * mz) < 1e-6 && fy < 0 && r1 < r0) { fx = -fx; fy = -fy; fz = -fz; }
            const fnm = [fx, fy, fz];
            g.tri(p00, p10, p11, fnm, fnm, fnm);
            g.tri(p00, p11, p01, fnm, fnm, fnm);
          } else {
            const n00 = N(i, c0, s0), n01 = N(i, c1, s1), n10 = N(i + 1, c0, s0), n11 = N(i + 1, c1, s1);
            g.tri(p00, p10, p11, n00, n10, n11);
            g.tri(p00, p11, p01, n00, n11, n01);
          }
        }
      }
      return g;
    },

    /** A cylinder (or cone, or frustum) from y=0 to y=h, capped. */
    cylinder(rb, rt, h, seg, flat) {
      const g = Mesh.lathe([[rb, 0], [rt, h]], seg, flat);
      // Caps as fans; a lathe leaves the ends open.
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        if (rt > 0) g.tri([0, h, 0], [rt * Math.sin(a0), h, rt * Math.cos(a0)], [rt * Math.sin(a1), h, rt * Math.cos(a1)], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
        if (rb > 0) g.tri([0, 0, 0], [rb * Math.sin(a1), 0, rb * Math.cos(a1)], [rb * Math.sin(a0), 0, rb * Math.cos(a0)], [0, -1, 0], [0, -1, 0], [0, -1, 0]);
      }
      return g;
    },

    sphere(r, seg, rings) {
      const prof = [];
      for (let i = 0; i <= rings; i++) {
        const t = -Math.PI / 2 + Math.PI * i / rings;
        prof.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      prof[0][0] = 0; prof[rings][0] = 0;
      return Mesh.lathe(prof, seg);
    },

    /** A capsule along +y: hemisphere centres at y=0 and y=len. */
    capsule(r, len, seg, rings) {
      const prof = [];
      for (let i = 0; i <= rings; i++) {
        const t = -Math.PI / 2 + (Math.PI / 2) * i / rings;
        prof.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
      for (let i = 0; i <= rings; i++) {
        const t = (Math.PI / 2) * i / rings;
        prof.push([Math.cos(t) * r, len + Math.sin(t) * r]);
      }
      prof[0][0] = 0; prof[prof.length - 1][0] = 0;
      return Mesh.lathe(prof, seg);
    },

    /** A flat saw blade lying in the x-z plane, `h` thick, teeth all round. */
    saw(r, teeth, h) {
      const g = new Geo(), pts = [];
      for (let i = 0; i < teeth; i++) {
        const a = i / teeth * Math.PI * 2, b = (i + 0.62) / teeth * Math.PI * 2;
        pts.push([Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82]);
        pts.push([Math.sin(b) * r, Math.cos(b) * r]);
      }
      const n = pts.length, y0 = -h / 2, y1 = h / 2;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        g.tri([0, y1, 0], [p[0], y1, p[1]], [q[0], y1, q[1]], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
        g.tri([0, y0, 0], [q[0], y0, q[1]], [p[0], y0, p[1]], [0, -1, 0], [0, -1, 0], [0, -1, 0]);
        let nx = q[1] - p[1], nz = -(q[0] - p[0]);
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        if (nx * (p[0] + q[0]) + nz * (p[1] + q[1]) < 0) { nx = -nx; nz = -nz; }
        g.quad([p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], [q[0], y0, q[1]], [nx, 0, nz]);
      }
      return g;
    },

    /** A flat quad in the x-z plane, facing up, centred. */
    plane(w, d) {
      const g = new Geo(), x = w / 2, z = d / 2;
      g.quad([-x, 0, -z], [-x, 0, z], [x, 0, z], [x, 0, -z], [0, 1, 0]);
      return g;
    }
  };

  /* A batch of meshes baked into one buffer: position, normal, colour. Each
     piece goes in through a matrix, so the whole static world — road, rails,
     scenery, castle — is one draw call. */
  class Batch {
    constructor() { this.d = []; }
    add(geo, m, col) {
      const p = geo.p, n = geo.n, d = this.d;
      const c0 = col[0], c1 = col[1], c2 = col[2];
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        d.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        const nx = n[i], ny = n[i + 1], nz = n[i + 2];
        let ox = m[0] * nx + m[4] * ny + m[8] * nz, oy = m[1] * nx + m[5] * ny + m[9] * nz, oz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        d.push(ox / l, oy / l, oz / l, c0, c1, c2);
      }
      return this;
    }
    get count() { return this.d.length / 9; }
  }

  /* The runner's mesh: every part in one buffer with a PART number per
     vertex, so the vertex shader can swing each limb about its own joint.
     0 is the body and head, 1/2 the left/right arm, 3/4 the left/right leg.
     The joints live in the shader, next to the swing. A piece given its own
     colour (a hat) keeps it; everything else wears the crowd's. */
  class Parts {
    constructor() { this.d = []; }
    add(geo, m, part, col) {
      const p = geo.p, n = geo.n, d = this.d;
      const c = col ? [col[0], col[1], col[2], 1] : [0, 0, 0, 0];
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        d.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        const nx = n[i], ny = n[i + 1], nz = n[i + 2];
        let ox = m[0] * nx + m[4] * ny + m[8] * nz, oy = m[1] * nx + m[5] * ny + m[9] * nz, oz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        d.push(ox / l, oy / l, oz / l, part, c[0], c[1], c[2], c[3]);
      }
      return this;
    }
    get count() { return this.d.length / 11; }
  }

  /* ---------------------------------------------------------- shaders */

  const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

  /* The one light model everything shares: a soft sun from above and
     behind the camera, a lot of sky, a little gloss. The reference is lit
     like a toy on a bright day, and fog fades the far road into the sky. */
  const LIGHT = `
uniform vec3 uSun;
uniform vec3 uFog;
uniform vec2 uFogR;
uniform vec3 uEye;
vec3 light(vec3 base, vec3 n, vec3 w, float gloss) {
  float d = max(dot(n, uSun), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 c = base * (0.40 + 0.46 * d + 0.24 * sky);
  vec3 v = normalize(uEye - w);
  vec3 h = normalize(uSun + v);
  c += vec3(1.0) * pow(max(dot(n, h), 0.0), 28.0) * gloss;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += base * rim * 0.18;
  return c;
}
vec3 fog(vec3 c, vec3 w) {
  float f = clamp((distance(w, uEye) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  return mix(c, uFog, f * f * (3.0 - 2.0 * f));
}
`;

  const SRC = {
    lit: [`
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = (uModel * vec4(aNrm, 0.0)).xyz;
  vC = aCol;
  gl_Position = uVP * w;
}`, HEAD + LIGHT + `
uniform vec4 uTint; uniform float uMode; uniform float uTime; uniform vec3 uAlt;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float cells(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = h2(n + g);
    o = 0.5 + 0.42 * sin(uTime * 0.9 + 6.2831 * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
void main() {
  vec3 n = normalize(vN);
  vec3 c = vC * uTint.rgb;
  float gloss = 0.05;
  if (uMode > 0.5 && uMode < 1.5) {
    // The road: broad chevrons pointing back at the camera, as the
    // reference paints its track.
    float b = fract((vW.z + abs(vW.x) * 0.62) / 7.0);
    c = mix(c, uAlt, step(0.5, b));
  } else if (uMode > 1.5 && uMode < 2.5) {
    // Water: a caustic net over deep blue.
    float e = cells(vW.xz * 0.16);
    float line = 1.0 - smoothstep(0.02, 0.13, e);
    c = mix(c, uAlt, line * 0.85);
    gloss = 0.25;
  } else if (uMode > 2.5 && uMode < 3.5) {
    gloss = 0.35;
  } else if (uMode > 3.5) {
    // Glass: lit from inside, brighter toward the top, so a gate reads as
    // a bright pane from any angle rather than a grey slab.
    vec3 g = c * (1.0 + 0.3 * smoothstep(0.0, 1.9, vW.y));
    gl_FragColor = vec4(fog(g, vW), uTint.a);
    return;
  }
  gl_FragColor = vec4(fog(light(c, n, vW, gloss), vW), uTint.a);
}`],

    /* The crowd. One instance per runner: where it stands and which way it
       faces, how far through its stride it is, how big it is, what it is
       doing (pose), and its colour. The limbs swing here, about the joints,
       so a crowd of six hundred costs the CPU twelve floats a runner. */
    crowd: [`
attribute vec3 aPos; attribute vec3 aNrm; attribute float aPart; attribute vec4 aVcol;
attribute vec4 iPos; attribute vec4 iAnim; attribute vec4 iCol;
uniform mat4 uVP;
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vFlash;
vec3 rx(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 ry(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rz(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
void main() {
  vec3 p = aPos, n = aNrm;
  float ph = iAnim.x, sw = iAnim.y, pose = iAnim.w;
  float s = sin(ph);
  bool arm = aPart > 0.5 && aPart < 2.5;
  bool leg = aPart > 2.5;
  float side = (aPart > 0.5 && aPart < 1.5) || (aPart > 2.5 && aPart < 3.5) ? -1.0 : 1.0;
  if (arm || leg) {
    vec3 pv = arm ? vec3(side * 0.125, 0.555, 0.0) : vec3(side * 0.062, 0.36, 0.0);
    float a = 0.0, b = 0.0;
    if (pose < 0.5) {                        // running
      a = leg ? side * s * sw : -side * s * sw * 0.85;
      b = arm ? side * 0.12 : 0.0;
    } else if (pose < 1.5) {                 // standing
      a = leg ? 0.0 : side * 0.03 * s;
      b = arm ? side * 0.16 : 0.0;
    } else if (pose < 2.5) {                 // fighting: arms up and flailing
      a = leg ? side * s * sw * 0.6 : -1.6 + 0.55 * sin(ph * 2.0 + side);
      b = arm ? side * 0.25 : 0.0;
    } else if (pose < 3.5) {                 // flying: spread like a starfish
      a = leg ? side * 0.35 : 0.2;
      b = arm ? side * 2.1 : side * 0.3;
    } else if (pose < 4.5) {                 // in the tower: arms up to the one above
      a = leg ? 0.0 : 0.0;
      b = arm ? side * 2.75 : side * 0.05;
    } else if (pose < 5.5) {                 // cheering: arms up, waving
      a = 0.0;
      b = arm ? side * (2.4 + 0.35 * sin(ph * 1.7 + side)) : 0.0;
    } else if (pose < 6.5) {                 // the king: his right arm is the swing
      a = arm ? (side > 0.0 ? ph : 0.1) : 0.0;
      b = arm ? side * 0.18 : side * 0.1;
    } else {                                 // knocked flat: everything slack
      a = 0.0;
      b = arm ? side * 0.7 : side * 0.18;
    }
    p = rz(rx(p - pv, a), b) + pv;
    n = rz(rx(n, a), b);
  }
  if (pose > 6.5) {                          // falling over backwards
    p = rx(p, -ph);
    n = rx(n, -ph);
  }
  float lift = 0.0;
  if (pose < 0.5) {
    lift = abs(cos(ph)) * 0.05 * sw;
    p = rx(p, 0.12 * sw);                   // leaning into the run
    n = rx(n, 0.12 * sw);
  } else if (pose > 4.5) {
    lift = abs(sin(ph * 1.3)) * 0.12;
  } else if (pose > 2.5 && pose < 3.5) {
    vec3 c = vec3(0.0, 0.5, 0.0);           // tumbling about the middle
    p = rz(rx(p - c, ph), ph * 0.6) + c;
    n = rz(rx(n, ph), ph * 0.6);
  }
  p.y += lift;
  p *= iAnim.z;
  p = ry(p, iPos.w);
  n = ry(n, iPos.w);
  vec4 w = vec4(p + iPos.xyz, 1.0);
  vW = w.xyz;
  vN = n;
  vC = mix(iCol.rgb, aVcol.rgb, aVcol.a);
  vFlash = iCol.a;
  gl_Position = uVP * w;
}`, HEAD + LIGHT + `
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vFlash;
void main() {
  vec3 n = normalize(vN);
  vec3 c = light(vC, n, vW, 0.22);
  c = mix(c, vec3(1.0), clamp(vFlash, 0.0, 1.0));
  gl_FragColor = vec4(fog(c, vW), 1.0);
}`],

    /* Soft round shadows under everyone, one instance each. */
    shadow: [`
attribute vec3 aPos;
attribute vec4 iShadow;
uniform mat4 uVP;
varying vec2 vUV;
void main() {
  vUV = aPos.xz;
  vec3 w = vec3(iShadow.x + aPos.x * iShadow.w, iShadow.y, iShadow.z + aPos.z * iShadow.w);
  gl_Position = uVP * vec4(w, 1.0);
}`, HEAD + `
uniform vec4 uShade;
varying vec2 vUV;
void main() {
  float d = length(vUV);
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * uShade.a;
  gl_FragColor = vec4(uShade.rgb, a);
}`],

    /* Textured quads in the world: paint splats, the red discs squads stand
       in, the numbers on gates and steps. */
    decal: [`
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vC; varying vec3 vW;
void main() {
  vUV = aUV; vC = aCol; vW = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`, HEAD + `
uniform sampler2D uTex;
uniform vec3 uFog; uniform vec2 uFogR; uniform vec3 uEye;
varying vec2 vUV; varying vec4 vC; varying vec3 vW;
void main() {
  vec4 t = texture2D(uTex, vUV);
  vec3 c = t.rgb * vC.rgb;
  float f = clamp((distance(vW, uEye) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f), t.a * vC.a);
}`],

    /* Puffs, sparks, confetti and coins: points that face the camera. A
       negative size draws a square (confetti), a positive one a soft disc. */
    points: [`
attribute vec3 aPos; attribute float aSize; attribute vec4 aCol;
uniform mat4 uVP; uniform float uPx;
varying vec4 vC; varying float vSq;
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  gl_Position = c;
  gl_PointSize = max(1.0, abs(aSize) * uPx / max(0.1, c.w));
  vC = aCol; vSq = aSize < 0.0 ? 1.0 : 0.0;
}`, HEAD + `
varying vec4 vC; varying float vSq;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = vSq > 0.5 ? 1.0 : 1.0 - smoothstep(0.55, 1.0, length(q));
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * a);
}`],

    /* The sky: a full-screen gradient behind everything. */
    sky: [`
attribute vec3 aPos;
varying float vY;
void main() { vY = aPos.y * 0.5 + 0.5; gl_Position = vec4(aPos.xy, 0.9999, 1.0); }`, HEAD + `
uniform vec3 uTop; uniform vec3 uBottom;
varying float vY;
void main() { gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 1.0, vY)), 1.0); }`]
  };

  /* ------------------------------------------------------------ context */

  function Renderer(canvas) {
    const opts = { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false };
    let gl = null, gl2 = false;
    try { gl = canvas.getContext('webgl2', opts); gl2 = !!gl; } catch (e) { gl = null; }
    if (!gl) {
      try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    }
    if (!gl) throw new Error('no webgl');

    let divisor, drawInst;
    if (gl2) {
      divisor = (l, d) => gl.vertexAttribDivisor(l, d);
      drawInst = (mode, first, count, n) => gl.drawArraysInstanced(mode, first, count, n);
    } else {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      if (!ext) throw new Error('no instancing');
      divisor = (l, d) => ext.vertexAttribDivisorANGLE(l, d);
      drawInst = (mode, first, count, n) => ext.drawArraysInstancedANGLE(mode, first, count, n);
    }

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('shader: ' + log);
      }
      return sh;
    }

    function program(pair) {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, pair[0]));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, pair[1]));
      // Location 0 must be an array that is always on: some WebGL 1 drivers
      // draw nothing when attribute 0 is a constant.
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
        throw new Error('link: ' + gl.getProgramInfoLog(prog));
      }
      const attr = {}, uni = {};
      const na = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(prog, i); attr[a.name] = gl.getAttribLocation(prog, a.name); }
      const nu = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(prog, i); uni[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, u.name); }
      return { prog: prog, attr: attr, uni: uni };
    }

    const progs = {};
    for (const k in SRC) progs[k] = program(SRC[k]);

    let enabled = [];
    /** Point the program's attributes at buffers; turn off the rest. */
    function bind(p, layout) {
      const want = [];
      for (const L of layout) {
        const loc = p.attr[L[0]];
        if (loc == null || loc < 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, L[1]);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, L[2], gl.FLOAT, false, L[3] * 4, L[4] * 4);
        divisor(loc, L[5] || 0);
        want.push(loc);
      }
      for (const loc of enabled) {
        if (want.indexOf(loc) < 0) { gl.disableVertexAttribArray(loc); divisor(loc, 0); }
      }
      enabled = want;
    }

    function buffer(data, dynamic) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      b.size = data.byteLength;
      return b;
    }
    /** Replace a dynamic buffer's contents, growing it when it must. */
    function upload(b, data, len) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      const bytes = (len == null ? data.length : len) * 4;
      if (bytes > b.size) {
        b.size = Math.max(bytes, b.size * 2);
        gl.bufferData(gl.ARRAY_BUFFER, b.size, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, len == null ? data : data.subarray(0, len));
    }

    function texture(src, mip) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const pow2 = v => (v & (v - 1)) === 0;
      if (mip && (gl2 || (pow2(src.width) && pow2(src.height)))) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    return {
      gl: gl, gl2: gl2, progs: progs, bind: bind, buffer: buffer, upload: upload,
      texture: texture, drawInst: drawInst,
      /** A static mesh buffer from a Batch or Parts. */
      mesh(b) { return { buf: buffer(new Float32Array(b.d)), count: b.count }; },
      drop(x) { if (x && x.buf) gl.deleteBuffer(x.buf); }
    };
  }

  PV.CrowdGL = {
    M4: M4, rgb: rgb, mix: mix, Geo: Geo, Mesh: Mesh, Batch: Batch, Parts: Parts,
    Renderer: Renderer
  };

})(window.PV);
