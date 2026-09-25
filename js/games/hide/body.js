/* 变色躲猫猫 / Blend In — the body you paint.

   A round, faceless figure made of ten parts — a torso, a head, and two
   pieces to each arm and leg — each one a capsule (an egg for the head)
   hung on a bone. Nothing here draws; the scene builds its mesh from these
   same numbers, the engine and the bots use them to hit, paint and judge.

   THE PAINT is one small grid of texels for the whole body, an atlas:
   every part unrolled into its own rectangle, round the part one way and
   top to bottom the other, at about a centimetre and a half a texel. Every
   texel knows where on the body it sits when the body stands in its REST
   pose, arms a little out, and which way it faces there.

   A BRUSH works in that rest pose, in three dimensions: a dab paints every
   texel within its radius of the point you touched that faces roughly the
   same way. So a stroke runs across the seam of a sleeve or from a shoulder
   onto an arm the way paint on a real body would, and a dab on your chest
   does not come through on your back. Water washes paint off the same way.

   A pose is a set of angles per bone (data.js). `pose()` turns an actor's
   state — its pose, whether it walks, climbs, breathes — into eleven bone
   matrices; everything that needs the body where it stands right now
   (a droplet, a bot's eye, the camera) goes through them. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const D = PV.HideData;
  const TAU = Math.PI * 2;
  const AT = 128;                         // the atlas, texels a side
  const THETA0 = Math.PI / 2;             // the seam runs down the back

  /* --------------------------------------------------------- the parts */

  // Bones: parent, and the pivot in the parent's space.
  const BONES = [
    { p: -1, at: [0, 0.9, 0] },           // 0 hips
    { p: 0, at: [0, 0, 0] },              // 1 torso
    { p: 1, at: [0, 0.5, 0] },            // 2 head
    { p: 1, at: [-0.27, 0.43, 0] },       // 3 left arm
    { p: 3, at: [0, -0.28, 0] },          // 4 left forearm
    { p: 1, at: [0.27, 0.43, 0] },        // 5 right arm
    { p: 5, at: [0, -0.28, 0] },          // 6 right forearm
    { p: 0, at: [-0.1, -0.03, 0] },       // 7 left thigh
    { p: 7, at: [0, -0.42, 0] },          // 8 left shin
    { p: 0, at: [0.1, -0.03, 0] },        // 9 right thigh
    { p: 9, at: [0, -0.42, 0] }           // 10 right shin
  ];
  const NB = BONES.length;

  /* A part: along its bone's y from yb up to yt, rx by rz across, with
     round ends c high. The head is all ends. */
  const PARTS = [
    { bone: 1, yb: -0.1, yt: 0.52, rx: 0.2, rz: 0.14, c: 0.14, seg: 22 },
    { bone: 2, yb: 0.02, yt: 0.36, rx: 0.16, rz: 0.155, c: 0.17, seg: 20 },
    { bone: 3, yb: -0.3, yt: 0.06, rx: 0.075, rz: 0.075, c: 0.075, seg: 12 },
    { bone: 4, yb: -0.3, yt: 0.04, rx: 0.068, rz: 0.068, c: 0.068, seg: 12 },
    { bone: 5, yb: -0.3, yt: 0.06, rx: 0.075, rz: 0.075, c: 0.075, seg: 12 },
    { bone: 6, yb: -0.3, yt: 0.04, rx: 0.068, rz: 0.068, c: 0.068, seg: 12 },
    { bone: 7, yb: -0.42, yt: 0.06, rx: 0.095, rz: 0.095, c: 0.095, seg: 14 },
    { bone: 8, yb: -0.46, yt: 0.04, rx: 0.085, rz: 0.085, c: 0.085, seg: 14 },
    { bone: 9, yb: -0.42, yt: 0.06, rx: 0.095, rz: 0.095, c: 0.095, seg: 14 },
    { bone: 10, yb: -0.46, yt: 0.04, rx: 0.085, rz: 0.085, c: 0.085, seg: 14 }
  ];
  const NP = PARTS.length;

  for (const p of PARTS) {
    p.cyl = Math.max(0, p.yt - p.yb - 2 * p.c);
    const r = Math.sqrt((p.rx * p.rx + p.rz * p.rz) / 2);
    p.arc = Math.PI / 2 * Math.sqrt((r * r + p.c * p.c) / 2);
    p.len = 2 * p.arc + p.cyl;
    p.circ = TAU * r;
    p.ytc = p.yt - p.c; p.ybc = p.yb + p.c;
  }

  /* Shelf-pack the unrolled parts into the atlas at the finest density that
     fits. Deterministic: the same atlas every time, everywhere. */
  (function pack() {
    function tryD(d) {
      let x = 0, y = 0, rowH = 0;
      const out = [];
      for (const p of PARTS) {
        const w = Math.ceil(p.circ * d), h = Math.ceil(p.len * d);
        if (w + 1 > AT) return null;
        if (x + w + 1 > AT) { x = 0; y += rowH + 1; rowH = 0; }
        if (y + h + 1 > AT) return null;
        out.push({ x: x, y: y, w: w, h: h });
        x += w + 1; rowH = Math.max(rowH, h);
      }
      return out;
    }
    let lo = 10, hi = 200, best = tryD(lo);
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2, r = tryD(mid);
      if (r) { best = r; lo = mid; } else hi = mid;
    }
    PARTS.forEach((p, i) => { p.rect = best[i]; });
  })();

  /* ------------------------------------------------------------ matrices */

  /* 4x4, column-major, like the scene's. */
  function mIdent(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; }
  function mMul(out, a, b) {
    const r = TMP;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    out.set(r);
    return out;
  }
  const TMP = new Float64Array(16);
  /** Translate to (x, y, z), then Ry(yaw) Rx(pitch) Rz(roll). */
  function mTRS(out, x, y, z, yaw, pitch, roll) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch), sb = Math.sin(pitch), cc = Math.cos(roll), sc = Math.sin(roll);
    // Ry * Rx * Rz
    const r00 = ca * cc + sa * sb * sc, r01 = -ca * sc + sa * sb * cc, r02 = sa * cb;
    const r10 = cb * sc, r11 = cb * cc, r12 = -sb;
    const r20 = -sa * cc + ca * sb * sc, r21 = sa * sc + ca * sb * cc, r22 = ca * cb;
    out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
    out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
    out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }
  function xf(m, x, y, z, o, k) { o[k] = m[0] * x + m[4] * y + m[8] * z + m[12]; o[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; o[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
  function xn(m, x, y, z, o, k) { o[k] = m[0] * x + m[4] * y + m[8] * z; o[k + 1] = m[1] * x + m[5] * y + m[9] * z; o[k + 2] = m[2] * x + m[6] * y + m[10] * z; }

  /** A body: eleven bone matrices, laid end to end. */
  function newMats() { const a = new Float64Array(NB * 16); for (let i = 0; i < NB; i++) { a[i * 16] = a[i * 16 + 5] = a[i * 16 + 10] = a[i * 16 + 15] = 1; } return a; }

  const LOC = new Float64Array(16), PAR = new Float64Array(16), WORLD = new Float64Array(16);
  /**
   * Bone matrices from angles. `ang` is 11 [pitch, yaw, roll]; `root` is
   * [drop, pitch, roll]; the body stands at (x, y, z) facing `yaw`.
   * Writes into `out` (newMats()).
   */
  function build(out, ang, root, x, y, z, yaw) {
    mTRS(WORLD, x, y, z, -yaw, 0, 0);
    for (let i = 0; i < NB; i++) {
      const b = BONES[i], a = ang[i];
      if (i === 0) {
        mTRS(LOC, b.at[0], b.at[1] - root[0], b.at[2], 0, root[1], root[2]);
        mMul(PAR, WORLD, LOC);
      } else {
        mTRS(LOC, b.at[0], b.at[1], b.at[2], a[1], a[0], a[2]);
        for (let k = 0; k < 16; k++) PAR[k] = out[b.p * 16 + k];
        mMul(PAR, PAR, LOC);
      }
      for (let k = 0; k < 16; k++) out[i * 16 + k] = PAR[k];
    }
    return out;
  }

  /* ------------------------------------------------------ the surface */

  /** A point on part p at (u round, s down), in the bone's space, and its
      normal. Writes 6 numbers into o. */
  function surf(p, u, s, o) {
    const th = THETA0 + u * TAU, ct = Math.cos(th), st = Math.sin(th);
    const d = s * p.len;
    let y, rho, yc = 0, cap = 0;
    if (d < p.arc) { const f = d / p.arc * Math.PI / 2; y = p.ytc + p.c * Math.cos(f); rho = Math.sin(f); yc = p.ytc; cap = 1; }
    else if (d < p.arc + p.cyl) { y = p.ytc - (d - p.arc); rho = 1; }
    else { const f = (d - p.arc - p.cyl) / p.arc * Math.PI / 2; y = p.ybc - p.c * Math.sin(f); rho = Math.cos(f); yc = p.ybc; cap = 1; }
    const x = rho * p.rx * ct, z = rho * p.rz * st;
    let nx = x / (p.rx * p.rx), ny = cap ? (y - yc) / (p.c * p.c) : 0, nz = z / (p.rz * p.rz);
    if (!cap && rho === 1) { nx = ct / p.rx; nz = st / p.rz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    o[0] = x; o[1] = y; o[2] = z; o[3] = nx / l; o[4] = ny / l; o[5] = nz / l;
    return o;
  }

  /* The rest pose: arms a little out, legs a little apart, standing at the
     origin facing -z. Brushes work here. */
  const REST_ANG = [];
  for (let i = 0; i < NB; i++) REST_ANG.push([0, 0, 0]);
  REST_ANG[3] = [0, 0, -0.62]; REST_ANG[5] = [0, 0, 0.62];
  REST_ANG[7] = [0, 0, -0.1]; REST_ANG[9] = [0, 0, 0.1];
  const REST = build(newMats(), REST_ANG, [0, 0, 0], 0, 0, 0, 0);

  /* Every texel of the atlas: which part, where on it in its bone's space,
     and where in the rest pose. Unused texels are part 255. */
  const TN = AT * AT;
  const T_PART = new Uint8Array(TN).fill(255);
  const T_LOC = new Float32Array(TN * 6);     // bone-space point and normal
  const T_REST = new Float32Array(TN * 6);    // rest-pose point and normal
  const PART_BOUND = [];                       // rest-pose sphere per part
  const T_LIST = [];                          // used texel indices per part
  (function texelsOf() {
    const o = [0, 0, 0, 0, 0, 0], q = [0, 0, 0];
    PARTS.forEach((p, pi) => {
      const r = p.rect, list = [];
      const M = REST.subarray(p.bone * 16, p.bone * 16 + 16);
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < r.h; j++) {
        for (let i = 0; i < r.w; i++) {
          const k = (r.y + j) * AT + r.x + i;
          surf(p, (i + 0.5) / r.w, (j + 0.5) / r.h, o);
          T_PART[k] = pi;
          for (let n = 0; n < 6; n++) T_LOC[k * 6 + n] = o[n];
          xf(M, o[0], o[1], o[2], q, 0);
          T_REST[k * 6] = q[0]; T_REST[k * 6 + 1] = q[1]; T_REST[k * 6 + 2] = q[2];
          xn(M, o[3], o[4], o[5], q, 0);
          T_REST[k * 6 + 3] = q[0]; T_REST[k * 6 + 4] = q[1]; T_REST[k * 6 + 5] = q[2];
          cx += T_REST[k * 6]; cy += T_REST[k * 6 + 1]; cz += T_REST[k * 6 + 2];
          list.push(k);
        }
      }
      cx /= list.length; cy /= list.length; cz /= list.length;
      let rad = 0;
      for (const k of list) rad = Math.max(rad, Math.hypot(T_REST[k * 6] - cx, T_REST[k * 6 + 1] - cy, T_REST[k * 6 + 2] - cz));
      PART_BOUND.push([cx, cy, cz, rad]);
      T_LIST.push(Int32Array.from(list));
    });
  })();
  const ALL = (function () { const a = []; for (const l of T_LIST) for (const k of l) a.push(k); return Int32Array.from(a); })();

  /* ---------------------------------------------------------- poses */

  /* Where each pose's lowest point is, so a pose that lies down lies on
     the floor instead of hanging from the hips. */
  const scratch = newMats();
  function lowest(ang, root) {
    build(scratch, ang, root, 0, 0, 0, 0);
    let lo = Infinity;
    const q = [0, 0, 0];
    for (let pi = 0; pi < NP; pi++) {
      const p = PARTS[pi], M = scratch.subarray(p.bone * 16, p.bone * 16 + 16);
      const l = T_LIST[pi];
      for (let n = 0; n < l.length; n += 7) {
        const k = l[n];
        xf(M, T_LOC[k * 6], T_LOC[k * 6 + 1], T_LOC[k * 6 + 2], q, 0);
        if (q[1] < lo) lo = q[1];
      }
    }
    return lo;
  }
  for (const ps of D.POSES) {
    const lo = lowest(ps.bones, [0, ps.root[1], ps.root[2]]);
    ps.drop = ps.ground ? lo : 0;
    // The height of the top of the pose, for the camera and a collision box.
    build(scratch, ps.bones, [ps.drop, ps.root[1], ps.root[2]], 0, 0, 0, 0);
    let hi = 0;
    const q = [0, 0, 0];
    for (let pi = 0; pi < NP; pi++) {
      const M = scratch.subarray(PARTS[pi].bone * 16, PARTS[pi].bone * 16 + 16);
      for (let n = 0; n < T_LIST[pi].length; n += 7) {
        const k = T_LIST[pi][n];
        xf(M, T_LOC[k * 6], T_LOC[k * 6 + 1], T_LOC[k * 6 + 2], q, 0);
        if (q[1] > hi) hi = q[1];
      }
    }
    ps.top = hi;
  }

  const ANG = []; for (let i = 0; i < NB; i++) ANG.push([0, 0, 0]);
  const ROOT = [0, 0, 0];
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * An actor's bones right now. `a` carries: x, y, z, yaw, pose (id), prev
   * (the pose it is leaving), blend (0..1 into `pose`), walk (stride
   * phase), speed, air, climb (truthy while on a wall), still (locked:
   * no breathing), role ('seeker' holds the gun up), aim (pitch), t
   * (seconds, for breathing). Returns `out`.
   */
  function pose(out, a) {
    const seeker = a.role === 'seeker';
    const P1 = D.POSE[a.pose] || D.POSES[0], P0 = D.POSE[a.prev] || P1;
    const k = a.blend == null ? 1 : Math.max(0, Math.min(1, a.blend));
    const e = k * k * (3 - 2 * k);
    for (let i = 0; i < NB; i++) for (let c = 0; c < 3; c++) ANG[i][c] = lerp(P0.bones[i][c], P1.bones[i][c], e);
    ROOT[0] = lerp(P0.drop, P1.drop, e); ROOT[1] = lerp(P0.root[1], P1.root[1], e); ROOT[2] = lerp(P0.root[2], P1.root[2], e);
    const standing = (a.pose === 'stand' || !a.pose) && e > 0.5;
    const sp = Math.min(1, (a.speed || 0) / 4.5);
    if (a.climb) {
      // Up a wall: hands over head, a leg at a time.
      const w = Math.sin(a.walk || 0);
      ANG[3][0] = 0.2; ANG[3][2] = -2.6 + w * 0.35; ANG[5][0] = 0.2; ANG[5][2] = 2.6 + w * 0.35;
      ANG[4][0] = 0.5 - w * 0.4; ANG[6][0] = 0.5 + w * 0.4;
      ANG[7][0] = 0.7 + w * 0.5; ANG[8][0] = -1.0 - w * 0.4; ANG[9][0] = 0.7 - w * 0.5; ANG[10][0] = -1.0 + w * 0.4;
      ANG[1][0] = 0.1;
    } else if (standing && (sp > 0.02 || a.air)) {
      const w = Math.sin(a.walk || 0) * sp;
      ANG[7][0] = w * 0.75; ANG[9][0] = -w * 0.75;
      ANG[8][0] = -Math.max(0, -Math.cos(a.walk || 0)) * 0.9 * sp; ANG[10][0] = -Math.max(0, Math.cos(a.walk || 0)) * 0.9 * sp;
      if (!seeker) { ANG[3][0] = -w * 0.7; ANG[5][0] = w * 0.7; }
      ANG[1][0] = 0.08 * sp;
      if (a.air) { ANG[7][0] = 0.5; ANG[8][0] = -0.8; ANG[9][0] = 0.2; ANG[10][0] = -0.5; }
    }
    if (seeker && standing && !a.climb) {
      // The water gun held out in front, both hands on it.
      const p = Math.max(-1, Math.min(1, a.aim || 0));
      ANG[5][0] = 1.35 + p; ANG[5][2] = 0.05; ANG[6][0] = 0.25;
      ANG[3][0] = 1.25 + p; ANG[3][1] = -0.5; ANG[3][2] = 0.35; ANG[4][0] = 0.55;
    }
    if (!a.still && !a.climb) {
      const b = Math.sin((a.t || 0) * 2.2);
      ANG[1][0] += b * 0.02; ANG[2][0] += b * 0.025;
      ANG[3][2] -= b * 0.02; ANG[5][2] += b * 0.02;
    }
    return build(out, ANG, ROOT, a.x, a.y, a.z, a.yaw);
  }

  /* ---------------------------------------------------------- the paint */

  function newPaint(col) {
    const p = new Uint8Array(TN * 3);
    fill(p, col || D.WHITE);
    return p;
  }
  function fill(paint, c) {
    for (let k = 0; k < TN; k++) { paint[k * 3] = c[0]; paint[k * 3 + 1] = c[1]; paint[k * 3 + 2] = c[2]; }
  }

  /**
   * A dab of `col` at rest-pose point (px, py, pz) facing (nx, ny, nz),
   * radius r. Inside 70% of the radius the paint covers; past it, it fades.
   * `wash` instead moves what is there part of the way back to white.
   * Returns how many texels changed.
   */
  function dab(paint, px, py, pz, nx, ny, nz, r, col, wash) {
    let n = 0;
    const r2 = r * r;
    for (let pi = 0; pi < NP; pi++) {
      const b = PART_BOUND[pi];
      if (Math.hypot(b[0] - px, b[1] - py, b[2] - pz) > b[3] + r) continue;
      const l = T_LIST[pi];
      for (let q = 0; q < l.length; q++) {
        const k = l[q], o = k * 6;
        const dx = T_REST[o] - px, dy = T_REST[o + 1] - py, dz = T_REST[o + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (T_REST[o + 3] * nx + T_REST[o + 4] * ny + T_REST[o + 5] * nz < -0.15) continue;
        const f = Math.sqrt(d2) / r;
        const a = wash ? wash * (f < 0.6 ? 1 : (1 - f) / 0.4) : (f < 0.7 ? 1 : (1 - f) / 0.3);
        if (a <= 0) continue;
        const c = wash ? D.WHITE : col, i = k * 3;
        const r0 = paint[i], g0 = paint[i + 1], b0 = paint[i + 2];
        const r1 = Math.round(r0 + (c[0] - r0) * a), g1 = Math.round(g0 + (c[1] - g0) * a), b1 = Math.round(b0 + (c[2] - b0) * a);
        if (r1 !== r0 || g1 !== g0 || b1 !== b0) { paint[i] = r1; paint[i + 1] = g1; paint[i + 2] = b1; n++; }
      }
    }
    return n;
  }

  /* ------------------------------------------------------------- rays */

  /**
   * A ray against a posed body. `mats` from pose(); the ray is
   * (ox, oy, oz) + t (dx, dy, dz), direction a unit vector, up to maxT.
   * Returns null or { t, part, u, s, texel, rest: [x, y, z, nx, ny, nz],
   * x, y, z (world) }.
   */
  const R = { o: [0, 0, 0], d: [0, 0, 0] };
  function rayBody(mats, ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null;
    for (let pi = 0; pi < NP; pi++) {
      const p = PARTS[pi], m = mats.subarray(p.bone * 16, p.bone * 16 + 16);
      // Into the bone's space: the transpose of a rotation.
      const lx = ox - m[12], ly = oy - m[13], lz = oz - m[14];
      const Ox = m[0] * lx + m[1] * ly + m[2] * lz, Oy = m[4] * lx + m[5] * ly + m[6] * lz, Oz = m[8] * lx + m[9] * ly + m[10] * lz;
      const Dx = m[0] * dx + m[1] * dy + m[2] * dz, Dy = m[4] * dx + m[5] * dy + m[6] * dz, Dz = m[8] * dx + m[9] * dy + m[10] * dz;
      const t = rayPart(p, Ox, Oy, Oz, Dx, Dy, Dz, best);
      if (t < best) { best = t; hit = { t: t, pi: pi, lx: Ox + Dx * t, ly: Oy + Dy * t, lz: Oz + Dz * t }; }
    }
    if (!hit) return null;
    return describe(hit.pi, hit.lx, hit.ly, hit.lz, { t: hit.t, x: ox + dx * hit.t, y: oy + dy * hit.t, z: oz + dz * hit.t });
  }

  function rayPart(p, ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    // The side, scaled round.
    if (p.cyl > 0) {
      const Ox = ox / p.rx, Oz = oz / p.rz, Dx = dx / p.rx, Dz = dz / p.rz;
      const a = Dx * Dx + Dz * Dz, b = Ox * Dx + Oz * Dz, c = Ox * Ox + Oz * Oz - 1;
      const disc = b * b - a * c;
      if (a > 1e-12 && disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t > 0 && t < best) { const y = oy + dy * t; if (y <= p.ytc && y >= p.ybc) best = t; }
      }
    }
    // The two ends.
    for (let e = 0; e < 2; e++) {
      const yc = e ? p.ybc : p.ytc;
      const Ox = ox / p.rx, Oy = (oy - yc) / p.c, Oz = oz / p.rz, Dx = dx / p.rx, Dy = dy / p.c, Dz = dz / p.rz;
      const a = Dx * Dx + Dy * Dy + Dz * Dz, b = Ox * Dx + Oy * Dy + Oz * Dz, c = Ox * Ox + Oy * Oy + Oz * Oz - 1;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t > 0 && t < best) {
        const y = oy + dy * t;
        if (e ? y <= yc + 1e-6 : y >= yc - 1e-6) best = t;
      }
    }
    return best;
  }

  /** From a point on part pi (bone space) to its texel and rest-pose place. */
  function describe(pi, lx, ly, lz, out) {
    const p = PARTS[pi];
    const th = Math.atan2(lz / p.rz, lx / p.rx);
    let u = (th - THETA0) / TAU; u -= Math.floor(u);
    let s;
    if (ly >= p.ytc) { const f = Math.acos(Math.max(-1, Math.min(1, (ly - p.ytc) / p.c))); s = f / (Math.PI / 2) * p.arc / p.len; }
    else if (ly <= p.ybc) { const f = Math.asin(Math.max(-1, Math.min(1, (p.ybc - ly) / p.c))); s = (p.arc + p.cyl + f / (Math.PI / 2) * p.arc) / p.len; }
    else s = (p.arc + (p.ytc - ly)) / p.len;
    s = Math.max(0, Math.min(0.9999, s));
    const r = p.rect;
    const texel = (r.y + Math.min(r.h - 1, Math.floor(s * r.h))) * AT + r.x + Math.min(r.w - 1, Math.floor(u * r.w));
    const o = [0, 0, 0, 0, 0, 0];
    surf(p, u, s, o);
    const M = REST.subarray(p.bone * 16, p.bone * 16 + 16), q = [0, 0, 0, 0, 0, 0];
    xf(M, o[0], o[1], o[2], q, 0); xn(M, o[3], o[4], o[5], q, 3);
    out.part = pi; out.u = u; out.s = s; out.texel = texel; out.rest = q;
    return out;
  }

  /** A texel's place and facing on a posed body, into o[k..k+5]. */
  function texelWorld(mats, k, o, at) {
    const p = PARTS[T_PART[k]], m = mats.subarray(p.bone * 16, p.bone * 16 + 16);
    const i = k * 6;
    xf(m, T_LOC[i], T_LOC[i + 1], T_LOC[i + 2], o, at || 0);
    xn(m, T_LOC[i + 3], T_LOC[i + 4], T_LOC[i + 5], o, (at || 0) + 3);
    return o;
  }

  /** Where a posed body's hips are: the middle of it, for a quick test. */
  function centre(mats) { return [mats[12], mats[13], mats[14]]; }

  /* Twenty texels spread round the body, for a quick look at it: the bots'
     eyes sample these rather than all ten thousand. */
  const SAMPLES = (function () {
    const out = [];
    const pick = (pi, u, s) => { const r = PARTS[pi].rect; return (r.y + Math.floor(s * r.h)) * AT + r.x + Math.floor(u * r.w); };
    for (const u of [0.12, 0.37, 0.62, 0.87]) for (const s of [0.3, 0.6]) out.push(pick(0, u, s));
    for (const u of [0.2, 0.55, 0.85]) out.push(pick(1, u, 0.45));
    for (const pi of [2, 3, 4, 5, 6, 7, 8, 9]) out.push(pick(pi, pi % 2 ? 0.75 : 0.25, 0.5));
    out.push(pick(0, 0.5, 0.95));
    return Int32Array.from(out);
  })();

  PV.HideBody = {
    AT: AT, TN: TN, NB: NB, NP: NP, BONES: BONES, PARTS: PARTS,
    T_PART: T_PART, T_LOC: T_LOC, T_REST: T_REST, T_LIST: T_LIST, ALL: ALL, SAMPLES: SAMPLES,
    REST: REST, newMats: newMats, build: build, pose: pose, surf: surf,
    newPaint: newPaint, fill: fill, dab: dab,
    rayBody: rayBody, describe: describe, texelWorld: texelWorld, centre: centre,
    xf: xf, xn: xn
  };

})(window.PV);
