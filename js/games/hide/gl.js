/* 变色躲猫猫 / Blend In — a small WebGL layer.

   No library, as with Crowd Rush and Strike Squad: PlayVault has no
   dependencies and a CSP that loads scripts from this origin only. WebGL 2
   where there is one, WebGL 1 where not, GLSL ES 1.00 so the shaders
   compile under either.

   THE LIGHT IS THE ONE IN data.js, to the digit. `shade()` there is what
   the bots judge by and what the colour picker's numbers mean; the world
   and the bodies are lit here by the same formula, so a body painted the
   colour of the wall behind it, facing the same way, is the same colour on
   screen. No shadows and no fog indoors, for the same reason: a shadow
   that fell on the wall and not on you would give you away through no
   fault of your paint.

   Programs:
   - world    the map: a texture per material, lit per face.
   - body     a painted body. Skinned: every vertex belongs to one of the
              eleven bones, and the colour comes from that body's own paint
              texture. A seeker is drawn flat black, then again in red,
              inside out and a little fatter, which is its outline.
   - model    flat-coloured things: water guns, the bucket in your hand.
   - points   droplets and spray.
   - decal    wet marks on walls and floors, and splash rings.
   - sky      a gradient over the maps that have one. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData;

  /* --------------------------------------------------------------- mat4 */

  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
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
      out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
      return out;
    },
    /** A camera at (ex, ey, ez) looking along yaw and pitch: yaw 0 looks
        down -z, yaw pi/2 down +x, pitch up is positive. */
    look(out, ex, ey, ez, yaw, pitch) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const rx = cy, ry = 0, rz = sy;
      const ux = -sy * sp, uy = cp, uz = cy * sp;
      const bx = -sy * cp, by = -sp, bz = cy * cp;
      out[0] = rx; out[1] = ux; out[2] = bx; out[3] = 0;
      out[4] = ry; out[5] = uy; out[6] = by; out[7] = 0;
      out[8] = rz; out[9] = uz; out[10] = bz; out[11] = 0;
      out[12] = -(rx * ex + ry * ey + rz * ez);
      out[13] = -(ux * ex + uy * ey + uz * ez);
      out[14] = -(bx * ex + by * ey + bz * ez);
      out[15] = 1;
      return out;
    },
    /** Translate, rotate (yaw about y, pitch about x, roll about z), scale. */
    compose(out, x, y, z, yaw, pitch, roll, s) {
      const ca = Math.cos(-(yaw || 0)), sa = Math.sin(-(yaw || 0)), cb = Math.cos(pitch || 0), sb = Math.sin(pitch || 0), cc = Math.cos(roll || 0), sc = Math.sin(roll || 0);
      const k = s == null ? 1 : s;
      out[0] = (ca * cc + sa * sb * sc) * k; out[1] = cb * sc * k; out[2] = (-sa * cc + ca * sb * sc) * k; out[3] = 0;
      out[4] = (-ca * sc + sa * sb * cc) * k; out[5] = cb * cc * k; out[6] = (sa * sc + ca * sb * cc) * k; out[7] = 0;
      out[8] = sa * cb * k; out[9] = -sb * k; out[10] = ca * cb * k; out[11] = 0;
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

  /* A flat-coloured model while it is being built. */
  class Geo {
    constructor() { this.d = []; }
    v(p, n, c) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); }
    get count() { return this.d.length / 9; }
    box(m, sx, sy, sz, col) {
      const x = sx / 2, y = sy / 2, z = sz / 2;
      const P = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]
        .map(p => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]);
      const N = n => { const v = [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const F = [[0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]], [3, 7, 6, 2, [0, 1, 0]], [0, 1, 5, 4, [0, -1, 0]]];
      for (const f of F) {
        const n = N(f[4]);
        this.v(P[f[0]], n, col); this.v(P[f[1]], n, col); this.v(P[f[2]], n, col);
        this.v(P[f[0]], n, col); this.v(P[f[2]], n, col); this.v(P[f[3]], n, col);
      }
      return this;
    }
    cyl(m, r, len, seg, col) {
      const T = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const N = (x, y, z) => { const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const p00 = T(c0 * r, s0 * r, -len / 2), p01 = T(c1 * r, s1 * r, -len / 2), p10 = T(c0 * r, s0 * r, len / 2), p11 = T(c1 * r, s1 * r, len / 2);
        const n0 = N(c0, s0, 0), n1 = N(c1, s1, 0);
        this.v(p00, n0, col); this.v(p10, n0, col); this.v(p11, n1, col);
        this.v(p00, n0, col); this.v(p11, n1, col); this.v(p01, n1, col);
        const nb = N(0, 0, -1), nf = N(0, 0, 1);
        this.v(T(0, 0, -len / 2), nb, col); this.v(p01, nb, col); this.v(p00, nb, col);
        this.v(T(0, 0, len / 2), nf, col); this.v(p10, nf, col); this.v(p11, nf, col);
      }
      return this;
    }
  }

  /* ------------------------------------------------------------ shaders */

  const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
  const S = D.SUN;
  // data.js's shade(), word for word.
  const SHADE = `
float shade(vec3 n) {
  float d = dot(n, vec3(${S[0].toFixed(6)}, ${S[1].toFixed(6)}, ${S[2].toFixed(6)}));
  return 0.7 + 0.22 * max(d, 0.0) + 0.08 * n.y;
}
uniform vec3 uFog; uniform vec2 uFogR; uniform vec3 uEye;
vec3 fog(vec3 c, vec3 w) {
  float f = clamp((distance(w, uEye) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  return mix(c, uFog, f * f);
}
`;

  const SRC = {
    world: [`
attribute vec3 aPos; attribute vec2 aUV; attribute float aShade;
uniform mat4 uVP;
varying vec2 vUV; varying float vS; varying vec3 vW;
void main() { vUV = aUV; vS = aShade; vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`, HEAD + SHADE + `
uniform sampler2D uTex; uniform float uWet;
varying vec2 vUV; varying float vS; varying vec3 vW;
void main() {
  vec3 t = texture2D(uTex, vUV).rgb;
  gl_FragColor = vec4(fog(t * vS, vW), 1.0);
}`],

    body: [`
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV; attribute float aBone;
uniform mat4 uVP; uniform mat4 uBones[11]; uniform float uFat;
varying vec3 vN; varying vec2 vUV; varying vec3 vW;
void main() {
  int b = int(aBone + 0.5);
  mat4 m = uBones[0];
  for (int i = 1; i < 11; i++) { if (i == b) m = uBones[i]; }
  vec3 n = normalize((m * vec4(aNrm, 0.0)).xyz);
  vec4 w = m * vec4(aPos, 1.0);
  w.xyz += n * uFat;
  vN = n; vUV = aUV; vW = w.xyz;
  gl_Position = uVP * w;
}`, HEAD + SHADE + `
uniform sampler2D uPaint; uniform float uMode; uniform vec3 uFlat; uniform float uWet; uniform float uFlash;
varying vec3 vN; varying vec2 vUV; varying vec3 vW;
void main() {
  if (uMode > 1.5) { gl_FragColor = vec4(uFlat, 1.0); return; }
  vec3 n = normalize(vN);
  vec3 c = uMode > 0.5 ? uFlat : texture2D(uPaint, vUV).rgb;
  vec3 lit = c * shade(n);
  // Wet: darker, with a shine that moves with you.
  if (uWet > 0.0) {
    vec3 v = normalize(uEye - vW);
    float sp = pow(max(dot(reflect(-v, n), vec3(0.3, 0.9, 0.3)), 0.0), 16.0);
    lit = mix(lit, lit * 0.8 + vec3(0.2, 0.35, 0.55) * sp, uWet);
  }
  lit = mix(lit, vec3(1.0, 1.0, 1.0), uFlash);
  gl_FragColor = vec4(fog(lit, vW), 1.0);
}`],

    model: [`
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;
uniform mat4 uVP; uniform mat4 uM;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() { vec4 w = uM * vec4(aPos, 1.0); vW = w.xyz; vN = (uM * vec4(aNrm, 0.0)).xyz; vC = aCol; gl_Position = uVP * w; }`, HEAD + SHADE + `
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  float sp = pow(max(dot(n, normalize(vec3(0.45, 0.8, 0.38) + v)), 0.0), 20.0) * 0.35;
  gl_FragColor = vec4(fog(vC * shade(n) + sp, vW), 1.0);
}`],

    points: [`
attribute vec3 aPos; attribute float aSize; attribute vec4 aCol;
uniform mat4 uVP; uniform float uPx;
varying vec4 vC;
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  gl_Position = c;
  gl_PointSize = clamp(aSize * uPx / max(0.05, c.w), 1.5, 128.0);
  vC = aCol;
}`, HEAD + `
varying vec4 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  float hi = 1.0 - smoothstep(0.0, 0.7, length(q - vec2(-0.35, -0.35)));
  gl_FragColor = vec4(vC.rgb + hi * 0.35, vC.a * (1.0 - smoothstep(0.75, 1.0, r)));
}`],

    decal: [`
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute float aKind;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vC; varying float vK;
void main() { vUV = aUV; vC = aCol; vK = aKind; gl_Position = uVP * vec4(aPos, 1.0); }`, HEAD + `
varying vec2 vUV; varying vec4 vC; varying float vK;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q);
  float a;
  if (vK < 0.5) {
    // A splat: a blob with ragged edges.
    float ang = atan(q.y, q.x);
    float edge = 0.62 + 0.14 * sin(ang * 5.0 + vC.a * 20.0) + 0.08 * sin(ang * 11.0 + vC.a * 7.0);
    a = 1.0 - smoothstep(edge - 0.08, edge, r);
  } else if (vK < 1.5) {
    a = smoothstep(0.7, 0.8, r) * (1.0 - smoothstep(0.9, 1.0, r));
  } else {
    a = 1.0 - smoothstep(0.4, 1.0, r);
  }
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vC.rgb, a * min(1.0, vC.a));
}`],

    sky: [`
attribute vec3 aPos;
uniform mat4 uVP; uniform vec3 uEye;
varying vec3 vD;
void main() { vD = aPos; vec4 p = uVP * vec4(aPos * 300.0 + uEye, 1.0); gl_Position = p.xyww; }`, HEAD + `
uniform vec3 uTop; uniform vec3 uLow;
varying vec3 vD;
void main() {
  vec3 d = normalize(vD);
  float t = clamp(d.y * 1.4, 0.0, 1.0);
  vec3 c = mix(uLow, uTop, sqrt(t));
  float s = max(dot(d, normalize(vec3(0.45, 0.8, 0.38))), 0.0);
  c += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 1.2 + pow(s, 20.0) * 0.12);
  if (d.y < 0.0) c = uLow * 0.9;
  gl_FragColor = vec4(c, 1.0);
}`]
  };

  /* ------------------------------------------------------------ context */

  function Renderer(canvas) {
    const opts = { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    let gl = null, gl2 = false;
    try { gl = canvas.getContext('webgl2', opts); gl2 = !!gl; } catch (e) { gl = null; }
    if (!gl) { try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; } }
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
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(prog));
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
      if (bytes > b.size) { b.size = Math.max(bytes, b.size * 2); gl.bufferData(gl.ARRAY_BUFFER, b.size, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, len));
    }
    /** A texture from RGBA bytes, n a side (a power of two). */
    function texture(rgba, n, repeat, mip) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (mip) {
        const an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      }
      return t;
    }
    function retexture(t, rgba, n) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }

    return {
      gl: gl, gl2: gl2, progs: progs, bind: bind, buffer: buffer, upload: upload, texture: texture, retexture: retexture,
      drop(b) { if (b) gl.deleteBuffer(b); },
      model(geo) { return { buf: buffer(new Float32Array(geo.d)), count: geo.count }; }
    };
  }

  PV.HideGL = { M4: M4, Geo: Geo, Renderer: Renderer };

})(window.PV);
