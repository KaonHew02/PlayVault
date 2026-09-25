/* 突击小队 / Strike Squad — a small WebGL layer.

   The same rule as Crowd Rush's: no library, because PlayVault has no
   dependencies and a CSP that loads scripts from this origin only. WebGL 2
   where there is one, WebGL 1 where not, and GLSL ES 1.00 so the shaders
   compile under either.

   Five programs, each for one kind of thing:

   - world    the map. Textured, and lit ONCE: every vertex carries the light
              that reaches it — sun where the sun gets in, sky where the sky
              is open, darker in corners and under roofs — worked out when the
              map is built. A frame costs a texture lookup and some haze.
   - model    soldiers, guns, flags and props. Flat colours per part, lit by
              the sun and the sky here and now, and SKINNED: every vertex
              belongs to one bone and a soldier is a single draw call with
              its sixteen bone matrices. A gun's body can wear a camo drawn
              by the shader from where on the gun the pixel is.
   - decal    flat things in the world: bullet holes, blob shadows under
              soldiers, capture rings, tracers, scorch marks. The shape is
              drawn in the shader from the quad's corners.
   - points   sparks, smoke, dust, blood and muzzle fire.
   - sky      a dome with a gradient and a sun.

   Nothing here knows about the game; scene.js builds the world with it. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* --------------------------------------------------------------- mat4 */

  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    copy(out, a) { out.set(a); return out; },

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

    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },

    /** A camera at (ex, ey, ez) looking along yaw and pitch: yaw 0 looks
        down -z, yaw pi/2 down +x, pitch up is positive. */
    fps(out, ex, ey, ez, yaw, pitch, roll) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // Camera axes in world space: right, up, back.
      let rx = cy, ry = 0, rz = sy;
      let ux = -sy * sp, uy = cp, uz = cy * sp;
      const bx = -sy * cp, by = -sp, bz = cy * cp;
      if (roll) {
        const cr = Math.cos(roll), sr = Math.sin(roll);
        const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
        ux = ux * cr - rx * sr; uy = uy * cr - ry * sr; uz = uz * cr - rz * sr;
        rx = nrx; ry = nry; rz = nrz;
      }
      out[0] = rx; out[1] = ux; out[2] = bx; out[3] = 0;
      out[4] = ry; out[5] = uy; out[6] = by; out[7] = 0;
      out[8] = rz; out[9] = uz; out[10] = bz; out[11] = 0;
      out[12] = -(rx * ex + ry * ey + rz * ez);
      out[13] = -(ux * ex + uy * ey + uz * ez);
      out[14] = -(bx * ex + by * ey + bz * ez);
      out[15] = 1;
      return out;
    },

    /** Translate, then rotate (yaw about y, pitch about x, roll about z),
        then scale. Yaw 0 faces -z, like the camera; a model is built
        facing -z. */
    compose(out, x, y, z, yaw, pitch, roll, sx, sy, sz) {
      const ca = Math.cos(yaw || 0), sa = Math.sin(yaw || 0);
      const cb = Math.cos(pitch || 0), sb = Math.sin(pitch || 0);
      const cc = Math.cos(roll || 0), sc = Math.sin(roll || 0);
      const X = sx == null ? 1 : sx, Y = sy == null ? X : sy, Z = sz == null ? X : sz;
      // R = Ry(-yaw) * Rx(pitch) * Rz(roll): yaw turns -z toward +x.
      const r00 = ca * cc - sa * sb * sc, r01 = -ca * sc - sa * sb * cc, r02 = -sa * cb;
      const r10 = cb * sc, r11 = cb * cc, r12 = -sb;
      const r20 = sa * cc + ca * sb * sc, r21 = -sa * sc + ca * sb * cc, r22 = ca * cb;
      out[0] = r00 * X; out[1] = r10 * X; out[2] = r20 * X; out[3] = 0;
      out[4] = r01 * Y; out[5] = r11 * Y; out[6] = r21 * Y; out[7] = 0;
      out[8] = r02 * Z; out[9] = r12 * Z; out[10] = r22 * Z; out[11] = 0;
      out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
      return out;
    },

    apply(m, x, y, z, out) {
      const o = out || [0, 0, 0, 0];
      o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      o[3] = m[3] * x + m[7] * y + m[11] * z + m[15];
      return o;
    }
  };

  function rgb(hex) {
    const v = parseInt(String(hex).slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* ------------------------------------------------------------- meshes */

  /* A model while it is being built: loose triangles with a normal, a
     colour, a material and a bone per vertex. Materials: 0 plain, 1 camo
     body, 2 team colour, 3 unlit, 4 glass. */
  class Geo {
    constructor() { this.d = []; }
    v(p, n, c, mat, bone) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], mat || 0, bone || 0); }
    tri(a, b, c, n, col, mat, bone) { this.v(a, n, col, mat, bone); this.v(b, n, col, mat, bone); this.v(c, n, col, mat, bone); }
    get count() { return this.d.length / 11; }

    /** A box through a matrix. */
    box(m, sx, sy, sz, col, mat, bone) {
      const x = sx / 2, y = sy / 2, z = sz / 2;
      const P = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]
        .map(p => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]);
      const N = n => { const v = [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const F = [[0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]], [3, 7, 6, 2, [0, 1, 0]], [0, 1, 5, 4, [0, -1, 0]]];
      for (const f of F) {
        const n = N(f[4]);
        this.tri(P[f[0]], P[f[1]], P[f[2]], n, col, mat, bone);
        this.tri(P[f[0]], P[f[2]], P[f[3]], n, col, mat, bone);
      }
      return this;
    }

    /** A cylinder along local z, `len` long, centred, through a matrix. */
    cyl(m, r0, r1, len, seg, col, mat, bone, caps) {
      const pts = [];
      const T = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const N = (x, y, z) => { const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const p00 = T(c0 * r0, s0 * r0, -len / 2), p01 = T(c1 * r0, s1 * r0, -len / 2);
        const p10 = T(c0 * r1, s0 * r1, len / 2), p11 = T(c1 * r1, s1 * r1, len / 2);
        const n0 = N(c0, s0, 0), n1 = N(c1, s1, 0);
        this.v(p00, n0, col, mat, bone); this.v(p10, n0, col, mat, bone); this.v(p11, n1, col, mat, bone);
        this.v(p00, n0, col, mat, bone); this.v(p11, n1, col, mat, bone); this.v(p01, n1, col, mat, bone);
        if (caps !== false) {
          const nb = N(0, 0, -1), nf = N(0, 0, 1);
          this.tri(T(0, 0, -len / 2), p01, p00, nb, col, mat, bone);
          this.tri(T(0, 0, len / 2), p10, p11, nf, col, mat, bone);
        }
        pts.push(p00);
      }
      return this;
    }

    /** A sphere (squashable by the matrix). */
    ball(m, r, seg, rings, col, mat, bone) {
      const T = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const N = (x, y, z) => { const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const P = (i, j) => {
        const th = Math.PI * j / rings - Math.PI / 2, ph = i / seg * Math.PI * 2;
        return [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)];
      };
      for (let j = 0; j < rings; j++) {
        for (let i = 0; i < seg; i++) {
          const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
          const q = [a, b, c, d];
          const tp = q.map(p => T(p[0] * r, p[1] * r, p[2] * r)), tn = q.map(p => N(p[0], p[1], p[2]));
          this.v(tp[0], tn[0], col, mat, bone); this.v(tp[2], tn[2], col, mat, bone); this.v(tp[1], tn[1], col, mat, bone);
          this.v(tp[0], tn[0], col, mat, bone); this.v(tp[3], tn[3], col, mat, bone); this.v(tp[2], tn[2], col, mat, bone);
        }
      }
      return this;
    }

    /** A cone along local +y from the matrix origin. */
    cone(m, r, h, seg, col, mat, bone) {
      const T = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const N = (x, y, z) => { const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const top = T(0, h, 0), k = r / Math.hypot(r, h);
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const p0 = T(Math.cos(a0) * r, 0, Math.sin(a0) * r), p1 = T(Math.cos(a1) * r, 0, Math.sin(a1) * r);
        const n0 = N(Math.cos(a0) * (1 - k), k, Math.sin(a0) * (1 - k)), n1 = N(Math.cos(a1) * (1 - k), k, Math.sin(a1) * (1 - k));
        this.v(p0, n0, col, mat, bone); this.v(top, N(Math.cos((a0 + a1) / 2) * (1 - k), k, Math.sin((a0 + a1) / 2) * (1 - k)), col, mat, bone); this.v(p1, n1, col, mat, bone);
        this.tri(T(0, 0, 0), p1, p0, N(0, -1, 0), col, mat, bone);
      }
      return this;
    }
  }

  /* The world while it is being built: textured, pre-lit triangles, one
     array per texture. `light` is an [r, g, b] per vertex. */
  class WorldGeo {
    constructor() { this.bins = Object.create(null); }
    bin(tex) { return this.bins[tex] || (this.bins[tex] = []); }
    v(tex, p, u, v, l) { this.bin(tex).push(p[0], p[1], p[2], u, v, l[0], l[1], l[2]); }
  }

  /* ------------------------------------------------------------ shaders */

  const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

  const FOG = `
uniform vec3 uFog; uniform vec2 uFogR; uniform vec3 uEye;
vec3 fog(vec3 c, vec3 w) {
  float f = clamp((distance(w, uEye) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  return mix(c, uFog, f * f * (3.0 - 2.0 * f));
}
`;

  const SRC = {
    world: [`
attribute vec3 aPos; attribute vec2 aUV; attribute vec3 aLight;
uniform mat4 uVP;
varying vec2 vUV; varying vec3 vL; varying vec3 vW;
void main() { vUV = aUV; vL = aLight; vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`, HEAD + FOG + `
uniform sampler2D uTex;
varying vec2 vUV; varying vec3 vL; varying vec3 vW;
void main() {
  vec3 t = texture2D(uTex, vUV).rgb;
  gl_FragColor = vec4(fog(t * vL, vW), 1.0);
}`],

    model: [`
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute float aMat; attribute float aBone;
uniform mat4 uVP; uniform mat4 uBones[16];
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying vec3 vO; varying float vM;
void main() {
  int b = int(aBone + 0.5);
  mat4 m = uBones[0];
  for (int i = 1; i < 16; i++) { if (i == b) m = uBones[i]; }
  vec4 w = m * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = (m * vec4(aNrm, 0.0)).xyz;
  vC = aCol; vM = aMat; vO = aPos;
  gl_Position = uVP * w;
}`, HEAD + FOG + `
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround;
uniform float uShade; uniform vec3 uTeam; uniform float uFlash;
uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2; uniform float uPat;
varying vec3 vN; varying vec3 vC; varying vec3 vW; varying vec3 vO; varying float vM;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 camo(vec3 o) {
  vec2 p = vec2(o.z * 9.0 + o.x * 3.0, o.y * 9.0 + o.x * 5.0);
  if (uPat < 0.5) return vC;
  if (uPat < 1.5) {
    float a = n2(p * 1.3) + 0.5 * n2(p * 2.9);
    return a < 0.62 ? uCamo0 : (a < 0.95 ? uCamo1 : uCamo2);
  }
  if (uPat < 2.5) {
    float s = sin(p.x * 3.2 + n2(p * 1.5) * 4.0);
    return s > 0.55 ? uCamo1 : (s > 0.35 ? uCamo2 : uCamo0);
  }
  if (uPat < 3.5) {
    float a = h1(floor(p * 2.2));
    return a < 0.5 ? uCamo0 : (a < 0.8 ? uCamo1 : uCamo2);
  }
  if (uPat < 4.5) {
    vec2 q = fract(p * 3.0);
    float w = step(0.5, q.x) == step(0.5, q.y) ? 1.0 : 0.0;
    return mix(uCamo0, uCamo1, w * 0.8 + 0.1 * q.y);
  }
  if (uPat < 5.5) {
    vec2 q = p * 2.0; q.x += step(1.0, mod(q.y, 2.0)) * 0.5;
    float d = length(fract(q) - vec2(0.5, 0.2));
    return d < 0.42 ? mix(uCamo1, uCamo0, smoothstep(0.1, 0.42, d)) : uCamo2;
  }
  if (uPat < 6.5) {
    float s = 0.5 + 0.5 * sin(p.x * 1.4 + sin(p.y * 1.1) * 1.8);
    return mix(uCamo0, uCamo1, smoothstep(0.2, 0.8, s)) + uCamo0 * 0.15 * step(0.93, fract(p.y * 1.5));
  }
  if (uPat < 7.5) {
    float st = step(0.985, h1(floor(p * 6.0)));
    return mix(mix(uCamo0, uCamo1, n2(p * 0.8)), uCamo2, st);
  }
  return mix(uCamo0, uCamo1, 0.5 + 0.5 * sin(p.x * 0.8 + p.y * 0.6));
}
void main() {
  vec3 n = normalize(vN);
  vec3 c = vC;
  if (vM > 0.5 && vM < 1.5) c = camo(vO);
  else if (vM > 1.5 && vM < 2.5) c = vC * uTeam;
  if (vM > 2.5 && vM < 3.5) { gl_FragColor = vec4(c, 1.0); return; }
  float d = max(dot(n, uSun), 0.0) * uShade;
  vec3 amb = mix(uGround, uSky, 0.5 + 0.5 * n.y);
  vec3 lit = c * (amb + uSunCol * d);
  vec3 v = normalize(uEye - vW);
  float spec = pow(max(dot(n, normalize(uSun + v)), 0.0), 24.0) * (vM > 3.5 ? 0.9 : 0.12) * uShade;
  lit += uSunCol * spec;
  if (vM > 0.5 && vM < 1.5 && uPat > 7.5) lit += uSunCol * pow(max(dot(n, normalize(uSun + v)), 0.0), 10.0) * 0.5;
  lit = mix(lit, vec3(1.0, 0.25, 0.2), uFlash);
  gl_FragColor = vec4(fog(lit, vW), 1.0);
}`],

    decal: [`
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute float aKind;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vC; varying float vK; varying vec3 vW;
void main() { vUV = aUV; vC = aCol; vK = aKind; vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`, HEAD + FOG + `
varying vec2 vUV; varying vec4 vC; varying float vK; varying vec3 vW;
void main() {
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q);
  float a;
  if (vK < 0.5) a = 1.0 - smoothstep(0.55, 1.0, r);                  // soft disc (shadow)
  else if (vK < 1.5) a = (1.0 - smoothstep(0.35, 0.55, r)) + 0.35 * (1.0 - smoothstep(0.55, 1.0, r)); // bullet hole
  else if (vK < 2.5) a = smoothstep(0.78, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r)) + 0.12 * (1.0 - smoothstep(0.86, 0.9, r)); // ring
  else if (vK < 3.5) a = (1.0 - smoothstep(0.0, 1.0, abs(q.y))) * (1.0 - smoothstep(0.7, 1.0, abs(q.x))); // tracer
  else a = 1.0 - smoothstep(0.2, 1.0, r);                              // scorch
  if (a <= 0.01) discard;
  gl_FragColor = vec4(fog(vC.rgb, vW), vC.a * a);
}`],

    points: [`
attribute vec3 aPos; attribute float aSize; attribute vec4 aCol;
uniform mat4 uVP; uniform float uPx;
varying vec4 vC;
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  gl_Position = c;
  gl_PointSize = clamp(aSize * uPx / max(0.05, c.w), 1.0, 256.0);
  vC = aCol;
}`, HEAD + `
varying vec4 vC;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float a = 1.0 - smoothstep(0.35, 1.0, r);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * a);
}`],

    sky: [`
attribute vec3 aPos;
uniform mat4 uVP; uniform vec3 uEye;
varying vec3 vD;
void main() { vD = aPos; vec4 p = uVP * vec4(aPos * 400.0 + uEye, 1.0); gl_Position = p.xyww; }`, HEAD + `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol;
varying vec3 vD;
void main() {
  vec3 d = normalize(vD);
  float t = clamp(d.y * 1.6, 0.0, 1.0);
  vec3 c = mix(uHorizon, uTop, sqrt(t));
  float s = max(dot(d, uSun), 0.0);
  c += uSunCol * (pow(s, 900.0) * 1.6 + pow(s, 24.0) * 0.18);
  if (d.y < 0.0) c = uHorizon * 0.96;
  gl_FragColor = vec4(c, 1.0);
}`]
  };

  /* ------------------------------------------------------------ context */

  function Renderer(canvas) {
    const opts = { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = null, gl2 = false;
    try { gl = canvas.getContext('webgl2', opts); gl2 = !!gl; } catch (e) { gl = null; }
    if (!gl) {
      try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    }
    if (!gl) throw new Error('no webgl');

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
    function bind(p, buf, layout, stride) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const want = [];
      for (const L of layout) {
        const loc = p.attr[L[0]];
        if (loc == null || loc < 0) continue;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, L[1], gl.FLOAT, false, stride * 4, L[2] * 4);
        want.push(loc);
      }
      for (const loc of enabled) if (want.indexOf(loc) < 0) gl.disableVertexAttribArray(loc);
      enabled = want;
    }

    function buffer(data, dynamic) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      b.size = data.byteLength;
      return b;
    }
    function upload(b, data, len) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      const bytes = len * 4;
      if (bytes > b.size) {
        b.size = Math.max(bytes, b.size * 2);
        gl.bufferData(gl.ARRAY_BUFFER, b.size, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, len));
    }

    function texture(src) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    }

    return {
      gl: gl, gl2: gl2, progs: progs, bind: bind, buffer: buffer, upload: upload, texture: texture,
      drop(b) { if (b) gl.deleteBuffer(b); },
      /** A static model buffer from a Geo. */
      model(geo) { return { buf: buffer(new Float32Array(geo.d)), count: geo.count }; }
    };
  }

  PV.FpsGL = { M4: M4, rgb: rgb, mix: mix, Geo: Geo, WorldGeo: WorldGeo, Renderer: Renderer };

})(window.PV);
