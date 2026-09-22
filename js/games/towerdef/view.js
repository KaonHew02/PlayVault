/* 塔防 / Tower Defense — view.

   Two clicks and nothing else: pick a tower in the shop, tap a green square.
   Tapping a tower you already own selects it instead, and the shop turns into
   its upgrade and sell panel — no separate mode, no modifier key. While a shop
   item is armed every square you may build on is tinted, green if you can
   afford it and grey if you cannot, so the hint is telling the truth.

   The towers are drawn, not labelled. Each one is a base plate plus a turret
   that ROTATES to the thing it is shooting — the engine tracks the barrel
   every tick whether or not it can fire, so a tower reads as tracking rather
   than teleporting its shots. Each level changes the silhouette (one barrel,
   two, then two plus a brake and a drum) and carries a pip badge, because a
   number painted inside a circle is not something you can see at a glance
   across a board with fourteen towers on it.

   The terrain is painted ONCE into an offscreen canvas and blitted. It never
   changes between resizes, and per-cell scenery on sixty frames a second is
   the one thing here that would actually cost something. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const KEYS = ['gun', 'frost', 'cannon'];
  const TAU = Math.PI * 2;

  /* A map's palette lives with the painting, not with the map data. */
  const THEMES = {
    meadow: { ground: '#24402C', ground2: '#27452F', decor: '#31563B', road: '#6B5A44', kerb: '#50402B', mark: '#8A7758', scenery: 'tuft' },
    canyon: { ground: '#4A3226', ground2: '#4E3629', decor: '#5C3C2D', road: '#8A6242', kerb: '#66452C', mark: '#B08457', scenery: 'rock' },
    glacier: { ground: '#26384A', ground2: '#2A3D50', decor: '#35506A', road: '#8FA3B8', kerb: '#627E96', mark: '#D7E6F3', scenery: 'ice' },
    dunes: { ground: '#584626', ground2: '#5C4A2A', decor: '#6A5730', road: '#B79A5F', kerb: '#8A7141', mark: '#E0C892', scenery: 'dune' },
    crossroads: { ground: '#2E3A2C', ground2: '#323F30', decor: '#3E4C3A', road: '#7A7366', kerb: '#59534A', mark: '#A49C90', scenery: 'scrub' },
    ember: { ground: '#241D23', ground2: '#282128', decor: '#43292A', road: '#6B585B', kerb: '#463A3E', mark: '#F2793F', scenery: 'lava' }
  };

  /* Scenery has to be the same every repaint or the field crawls, and it must
     not touch the game's RNG or it would change the run. So: a hash of the
     cell, not a random number. */
  function hash(x, y, salt) {
    let h = Math.imul(x + 31, 374761393) + Math.imul(y + 7, 668265263) + Math.imul(salt || 1, 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Mix a hex colour toward black (k < 0) or white (k > 0). */
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const to = k < 0 ? 0 : 255, a = Math.abs(k);
    const r = Math.round(((n >> 16) & 255) * (1 - a) + to * a);
    const g = Math.round(((n >> 8) & 255) * (1 - a) + to * a);
    const b = Math.round((n & 255) * (1 - a) + to * a);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rr(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** An n-sided plate, flat side up — the tower foundations. */
  function plate(c, x, y, r, n, turn) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (turn || 0);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }

  /* ------------------------------------------------------------- terrain */

  /** Ground, scenery, road, gate and base — everything that never moves. */
  function paintTerrain(map, w, h, dpr) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = THEMES[map.theme] || THEMES.meadow;
    const cell = w / map.cols;

    c.fillStyle = th.ground;
    c.fillRect(0, 0, w, h);

    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const px = x * cell, py = y * cell;
        if ((x + y) % 2 === 0) { c.fillStyle = th.ground2; c.fillRect(px, py, cell, cell); }
        const r = hash(x, y, 3);
        if (r > 0.70) scenery(c, th, px, py, cell, hash(x, y, 9), r);
      }
    }

    c.strokeStyle = 'rgba(255,255,255,.045)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < map.cols; x++) { c.moveTo(x * cell, 0); c.lineTo(x * cell, h); }
    for (let y = 1; y < map.rows; y++) { c.moveTo(0, y * cell); c.lineTo(w, y * cell); }
    c.stroke();

    // The road is stroked through the cell centres rather than filled cell by
    // cell: one polyline gives rounded corners and a kerb for free, and a
    // square-cornered road is the thing that makes a grid look like a grid.
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const lane of map.lanes) {
      const trace = () => {
        c.beginPath();
        lane.points.forEach((p, i) => {
          if (i) c.lineTo(p.x * cell, p.y * cell); else c.moveTo(p.x * cell, p.y * cell);
        });
      };
      c.strokeStyle = th.kerb; c.lineWidth = cell * 0.96; trace(); c.stroke();
      c.strokeStyle = th.road; c.lineWidth = cell * 0.78; trace(); c.stroke();
      c.save();
      c.globalAlpha = 0.28;
      c.strokeStyle = th.mark; c.lineWidth = Math.max(1, cell * 0.05);
      c.setLineDash([cell * 0.22, cell * 0.28]);
      trace(); c.stroke();
      c.restore();
    }

    for (const lane of map.lanes) {
      const p = lane.points, n = p.length;
      gate(c, p[0].x * cell, p[0].y * cell, cell, Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x));
      base(c, p[n - 1].x * cell, p[n - 1].y * cell, cell);
    }
    return cv;
  }

  function scenery(c, th, px, py, cell, r2, r) {
    const x = px + cell * (0.2 + r2 * 0.6), y = py + cell * (0.2 + r * 0.55);
    c.save();
    c.globalAlpha = 0.85;
    c.fillStyle = th.decor;
    switch (th.scenery) {
      case 'tuft':
        // Blades curve. Three straight strokes read as a scribbled W.
        c.strokeStyle = th.decor; c.lineWidth = Math.max(1, cell * 0.04); c.lineCap = 'round';
        c.beginPath();
        for (let i = -1; i <= 1; i++) {
          const h = cell * (0.09 + r2 * 0.06), lean = i * cell * 0.06;
          c.moveTo(x + i * cell * 0.06, y);
          c.quadraticCurveTo(x + i * cell * 0.06 + lean * 0.4, y - h * 0.7, x + i * cell * 0.06 + lean, y - h);
        }
        c.stroke();
        break;
      case 'rock': case 'scrub':
        plate(c, x, y, cell * (0.08 + r2 * 0.07), 5, r * TAU); c.fill();
        break;
      case 'ice':
        c.save(); c.translate(x, y); c.rotate(r * TAU);
        c.beginPath();
        c.moveTo(0, -cell * 0.11); c.lineTo(cell * 0.07, 0);
        c.lineTo(0, cell * 0.11); c.lineTo(-cell * 0.07, 0);
        c.closePath(); c.fill(); c.restore();
        break;
      case 'dune':
        c.strokeStyle = th.decor; c.lineWidth = Math.max(1, cell * 0.05); c.lineCap = 'round';
        c.beginPath();
        c.arc(x, y + cell * 0.1, cell * (0.12 + r2 * 0.08), Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
        break;
      case 'lava':
        c.strokeStyle = r2 > 0.72 ? th.mark : th.decor;
        c.globalAlpha = r2 > 0.72 ? 0.75 : 1;
        c.lineWidth = Math.max(1, cell * 0.05); c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x - cell * 0.1, y - cell * 0.05);
        c.lineTo(x, y + cell * 0.04);
        c.lineTo(x + cell * 0.11, y - cell * 0.03);
        c.stroke();
        break;
    }
    c.restore();
  }

  /** Where they come in: a barred gate across the road, chevrons pointing in. */
  function gate(c, x, y, cell, a) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = '#39404B';
    for (const s of [-1, 1]) {
      rr(c, -cell * 0.14, s * cell * 0.34 - cell * 0.11, cell * 0.28, cell * 0.22, cell * 0.05);
      c.fill();
    }
    c.fillStyle = 'rgba(248,113,113,.80)';
    rr(c, -cell * 0.08, -cell * 0.36, cell * 0.16, cell * 0.72, cell * 0.04);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.45)';
    c.lineWidth = Math.max(1.2, cell * 0.045);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const ox = cell * (0.14 + i * 0.13);
      c.beginPath();
      c.moveTo(ox, -cell * 0.13); c.lineTo(ox + cell * 0.09, 0); c.lineTo(ox, cell * 0.13);
      c.stroke();
    }
    c.restore();
  }

  /** What they are walking at: your keep, with a flag on it. */
  function base(c, x, y, cell) {
    c.fillStyle = 'rgba(52,211,153,.16)';
    rr(c, x - cell * 0.48, y - cell * 0.48, cell * 0.96, cell * 0.96, cell * 0.16);
    c.fill();
    c.fillStyle = '#2E6C52';
    rr(c, x - cell * 0.30, y - cell * 0.16, cell * 0.60, cell * 0.44, cell * 0.05);
    c.fill();
    c.fillStyle = '#3C8A69';
    for (let i = 0; i < 3; i++) {
      c.fillRect(x - cell * 0.30 + i * cell * 0.23, y - cell * 0.26, cell * 0.14, cell * 0.12);
    }
    c.strokeStyle = '#C8D6E3';
    c.lineWidth = Math.max(1, cell * 0.035);
    c.beginPath(); c.moveTo(x + cell * 0.02, y - cell * 0.26); c.lineTo(x + cell * 0.02, y - cell * 0.46);
    c.stroke();
    c.fillStyle = '#34D399';
    c.beginPath();
    c.moveTo(x + cell * 0.03, y - cell * 0.46);
    c.lineTo(x + cell * 0.24, y - cell * 0.40);
    c.lineTo(x + cell * 0.03, y - cell * 0.34);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.fillRect(x - cell * 0.30, y + cell * 0.22, cell * 0.60, cell * 0.06);
  }

  /* -------------------------------------------------------------- towers */

  /** The base plate every tower stands on, tinted by its type. */
  function pad(c, cell, colour, level) {
    c.fillStyle = 'rgba(0,0,0,.34)';
    c.beginPath(); c.ellipse(cell * 0.04, cell * 0.10, cell * 0.36, cell * 0.24, 0, 0, TAU); c.fill();

    plate(c, 0, 0, cell * 0.37, 8, Math.PI / 8);
    c.fillStyle = '#39424F'; c.fill();
    c.strokeStyle = '#242B35'; c.lineWidth = Math.max(1, cell * 0.03); c.stroke();

    plate(c, 0, -cell * 0.03, cell * 0.30, 8, Math.PI / 8);
    c.fillStyle = shade(colour, -0.62); c.fill();

    c.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      c.beginPath();
      c.arc(Math.cos(a) * cell * 0.26, Math.sin(a) * cell * 0.26 - cell * 0.03, cell * 0.027, 0, TAU);
      c.fill();
    }
    if (level >= 3) {                       // a fully upgraded tower is gilded
      plate(c, 0, -cell * 0.03, cell * 0.335, 8, Math.PI / 8);
      c.strokeStyle = '#F6B32B'; c.lineWidth = Math.max(1.4, cell * 0.035); c.stroke();
    }
  }

  /** Three pips over the tower: the level, readable without selecting it.
      A tower on the top row wears it underneath, or the canvas clips it. */
  function levelBadge(c, cell, level, colour, below) {
    const n = PV.TowerDef.MAX_LEVEL;
    const r = cell * 0.052, gap = cell * 0.155;
    const w = gap * (n - 1) + r * 2 + cell * 0.14, h = cell * 0.17;
    const y = below ? cell * 0.52 : -cell * 0.50;
    c.fillStyle = 'rgba(10,14,20,.72)';
    rr(c, -w / 2, y - h / 2, w, h, h / 2); c.fill();
    for (let i = 0; i < n; i++) {
      const x = -gap * (n - 1) / 2 + i * gap;
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      if (i < level) { c.fillStyle = i === n - 1 ? '#F6B32B' : colour; c.fill(); }
      else { c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = Math.max(1, cell * 0.018); c.stroke(); }
    }
  }

  /** A barrel lying along +x, so the whole turret is one rotation. */
  function barrel(c, cell, x0, x1, halfH, fill) {
    rr(c, x0 * cell, -halfH * cell, (x1 - x0) * cell, halfH * 2 * cell, halfH * cell * 0.5);
    c.fillStyle = fill; c.fill();
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.fillRect(x0 * cell, -halfH * cell, (x1 - x0) * cell, halfH * 0.5 * cell);
  }

  function muzzle(c, cell, at, size, colour, alpha) {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = colour;
    c.beginPath();
    c.moveTo(at * cell, 0);
    c.lineTo((at + size * 1.5) * cell, -size * cell);
    c.lineTo((at + size * 2.2) * cell, 0);
    c.lineTo((at + size * 1.5) * cell, size * cell);
    c.closePath(); c.fill();
    c.beginPath(); c.arc(at * cell, 0, size * 0.75 * cell, 0, TAU); c.fill();
    c.restore();
  }

  /* Each turret is a silhouette per level: you can tell a level 3 gun from a
     level 1 across the board, which is the whole point of upgrading. */
  const TURRETS = {
    gun(c, cell, level, flash) {
      rr(c, -0.21 * cell, -0.17 * cell, 0.42 * cell, 0.34 * cell, 0.08 * cell);
      c.fillStyle = '#4A5565'; c.fill();
      c.strokeStyle = '#2B323C'; c.lineWidth = Math.max(1, cell * 0.022); c.stroke();
      rr(c, -0.17 * cell, -0.13 * cell, 0.30 * cell, 0.10 * cell, 0.04 * cell);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fill();

      if (level === 1) {
        barrel(c, cell, 0.10, 0.46, 0.055, '#9AA7B6');
      } else {
        const len = level === 2 ? 0.50 : 0.56;
        barrel(c, cell, 0.08, len, 0.048, '#9AA7B6');
        c.save(); c.translate(0, 0.105 * cell); barrel(c, cell, 0.08, len, 0.048, '#9AA7B6'); c.restore();
        c.save(); c.translate(0, -0.105 * cell); barrel(c, cell, 0.08, len, 0.048, '#9AA7B6'); c.restore();
      }
      if (level >= 3) {
        rr(c, 0.50 * cell, -0.19 * cell, 0.10 * cell, 0.38 * cell, 0.03 * cell);
        c.fillStyle = '#C3CEDB'; c.fill();
        c.beginPath(); c.arc(-0.17 * cell, 0, 0.13 * cell, 0, TAU);
        c.fillStyle = '#38BDF8'; c.fill();
        c.strokeStyle = '#0B2A3C'; c.lineWidth = Math.max(1, cell * 0.02); c.stroke();
      }
      if (flash > 0) muzzle(c, cell, level === 1 ? 0.46 : 0.56, 0.10, '#FDE68A', flash / 6);
    },

    frost(c, cell, level, flash, tick) {
      plate(c, 0, 0, 0.21 * cell, 6, Math.PI / 6);
      c.fillStyle = '#2C5A6B'; c.fill();
      c.strokeStyle = '#17323D'; c.lineWidth = Math.max(1, cell * 0.022); c.stroke();

      barrel(c, cell, 0.06, 0.34, 0.075, '#7FD9EA');
      const tip = level >= 3 ? 0.56 : 0.50;
      c.beginPath();
      c.moveTo(0.32 * cell, -0.10 * cell);
      c.lineTo(tip * cell, 0);
      c.lineTo(0.32 * cell, 0.10 * cell);
      c.closePath();
      c.fillStyle = '#CFFAFE'; c.fill();

      if (level >= 2) {
        for (const s of [-1, 1]) {
          c.save(); c.translate(0.22 * cell, s * 0.17 * cell); c.rotate(s * 0.5);
          c.beginPath();
          c.moveTo(0, -0.05 * cell); c.lineTo(0.18 * cell, 0);
          c.lineTo(0, 0.05 * cell); c.closePath();
          c.fillStyle = '#A5F3FC'; c.fill();
          c.restore();
        }
      }
      if (level >= 3) {
        for (let i = 0; i < 3; i++) {
          const a = tick * 0.045 + i * TAU / 3;
          const x = Math.cos(a) * 0.30 * cell, y = Math.sin(a) * 0.30 * cell;
          c.save(); c.translate(x, y); c.rotate(a);
          c.beginPath();
          c.moveTo(0, -0.06 * cell); c.lineTo(0.05 * cell, 0);
          c.lineTo(0, 0.06 * cell); c.lineTo(-0.05 * cell, 0);
          c.closePath();
          c.fillStyle = 'rgba(207,250,254,.85)'; c.fill();
          c.restore();
        }
      }
      if (flash > 0) muzzle(c, cell, tip, 0.09, '#E0F9FF', (flash / 6) * 0.8);
    },

    cannon(c, cell, level, flash) {
      c.fillStyle = '#2B323C';
      for (const s of [-1, 1]) {
        rr(c, -0.14 * cell, s * 0.26 * cell - 0.07 * cell, 0.30 * cell, 0.14 * cell, 0.06 * cell);
        c.fill();
      }
      rr(c, -0.24 * cell, -0.19 * cell, 0.44 * cell, 0.38 * cell, 0.09 * cell);
      c.fillStyle = '#5C4A2E'; c.fill();
      c.strokeStyle = '#33291A'; c.lineWidth = Math.max(1, cell * 0.022); c.stroke();

      const len = level === 1 ? 0.48 : (level === 2 ? 0.55 : 0.60);
      barrel(c, cell, 0.04, len, level >= 3 ? 0.125 : 0.105, '#8A7350');
      c.fillStyle = '#3C2F1C';
      for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
        c.fillRect((0.20 + i * 0.14) * cell, -0.13 * cell, 0.035 * cell, 0.26 * cell);
      }
      rr(c, (len - 0.06) * cell, -0.17 * cell, 0.10 * cell, 0.34 * cell, 0.03 * cell);
      c.fillStyle = '#F59E0B'; c.fill();
      if (level >= 3) {
        for (const s of [-1, 1]) {
          rr(c, (len - 0.14) * cell, s * 0.20 * cell - 0.04 * cell, 0.16 * cell, 0.08 * cell, 0.02 * cell);
          c.fillStyle = '#C87F0A'; c.fill();
        }
        c.beginPath(); c.arc(-0.22 * cell, 0, 0.11 * cell, 0, TAU);
        c.fillStyle = '#F6B32B'; c.fill();
      }
      if (flash > 0) muzzle(c, cell, len + 0.04, 0.15, '#FDBA74', flash / 6);
    }
  };

  function drawTower(c, tw, cell, st, selected, tick) {
    c.save();
    c.translate(tw.x * cell, tw.y * cell);
    pad(c, cell, st.spec.colour, tw.level);
    if (selected) {
      plate(c, 0, -cell * 0.03, cell * 0.40, 8, Math.PI / 8);
      c.strokeStyle = '#F6B32B'; c.lineWidth = Math.max(2, cell * 0.05); c.stroke();
    }
    c.save();
    c.rotate(tw.aim);
    if (tw.flash > 0) c.translate(-(tw.flash / 6) * cell * (tw.type === 'cannon' ? 0.09 : 0.04), 0);
    TURRETS[tw.type](c, cell, tw.level, tw.flash, tick);
    c.restore();
    levelBadge(c, cell, tw.level, st.spec.colour, tw.cy === 0);
    c.restore();
  }

  /* ------------------------------------------------------------- enemies */

  const MOBS = {
    grunt(c, r, col) {
      c.strokeStyle = shade(col, -0.45); c.lineWidth = Math.max(1, r * 0.16); c.lineCap = 'round';
      c.beginPath();
      for (let i = -1; i <= 1; i++) {
        c.moveTo(i * r * 0.45, -r * 0.5); c.lineTo(i * r * 0.5, -r * 1.05);
        c.moveTo(i * r * 0.45, r * 0.5); c.lineTo(i * r * 0.5, r * 1.05);
      }
      c.stroke();
      c.beginPath(); c.arc(0, 0, r, 0, TAU);
      c.fillStyle = col; c.fill();
      c.strokeStyle = shade(col, -0.4); c.lineWidth = Math.max(1, r * 0.13); c.stroke();
      c.beginPath(); c.arc(r * 0.42, 0, r * 0.3, 0, TAU);
      c.fillStyle = '#FFF7ED'; c.fill();
      c.beginPath(); c.arc(r * 0.52, 0, r * 0.14, 0, TAU);
      c.fillStyle = '#1B2430'; c.fill();
    },

    runner(c, r, col) {
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.beginPath();
      c.moveTo(-r * 0.6, -r * 0.35); c.lineTo(-r * 1.7, -r * 0.12);
      c.lineTo(-r * 1.7, r * 0.12); c.lineTo(-r * 0.6, r * 0.35);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(r * 1.35, 0);
      c.quadraticCurveTo(r * 0.2, -r * 1.05, -r * 0.85, -r * 0.5);
      c.quadraticCurveTo(-r * 0.5, 0, -r * 0.85, r * 0.5);
      c.quadraticCurveTo(r * 0.2, r * 1.05, r * 1.35, 0);
      c.closePath();
      c.fillStyle = col; c.fill();
      c.strokeStyle = shade(col, -0.4); c.lineWidth = Math.max(1, r * 0.13); c.stroke();
      c.beginPath(); c.arc(r * 0.5, 0, r * 0.2, 0, TAU);
      c.fillStyle = '#1B2430'; c.fill();
    },

    tank(c, r, col) {
      c.fillStyle = '#242B35';
      for (const s of [-1, 1]) {
        rr(c, -r * 1.0, s * r * 0.78 - r * 0.24, r * 2.0, r * 0.48, r * 0.16);
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = Math.max(1, r * 0.08);
      c.beginPath();
      for (let i = -2; i <= 2; i++) {
        c.moveTo(i * r * 0.38, -r * 1.02); c.lineTo(i * r * 0.38, -r * 0.54);
        c.moveTo(i * r * 0.38, r * 0.54); c.lineTo(i * r * 0.38, r * 1.02);
      }
      c.stroke();
      rr(c, -r * 0.9, -r * 0.62, r * 1.8, r * 1.24, r * 0.2);
      c.fillStyle = col; c.fill();
      c.strokeStyle = shade(col, -0.45); c.lineWidth = Math.max(1, r * 0.11); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.38, 0, TAU);
      c.fillStyle = shade(col, -0.3); c.fill();
      rr(c, r * 0.25, -r * 0.1, r * 0.85, r * 0.2, r * 0.08);
      c.fillStyle = shade(col, -0.45); c.fill();
    },

    armour(c, r, col) {
      plate(c, 0, 0, r * 1.15, 6, 0);
      c.fillStyle = col; c.fill();
      c.strokeStyle = shade(col, -0.5); c.lineWidth = Math.max(1, r * 0.16); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(1, r * 0.13);
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-r * 0.15, -r * 0.55); c.lineTo(r * 0.4, 0); c.lineTo(-r * 0.15, r * 0.55);
      c.stroke();
      c.fillStyle = '#0F172A';
      rr(c, r * 0.5, -r * 0.22, r * 0.3, r * 0.44, r * 0.1); c.fill();
      c.fillStyle = 'rgba(255,255,255,.28)';
      for (const s of [-1, 1]) {
        c.beginPath(); c.arc(-r * 0.62, s * r * 0.42, r * 0.12, 0, TAU); c.fill();
      }
    },

    boss(c, r, col, tick) {
      const pulse = 1 + Math.sin(tick * 0.08) * 0.05;
      c.globalAlpha = 0.25 + Math.sin(tick * 0.08) * 0.08;
      c.beginPath(); c.arc(0, 0, r * 1.5 * pulse, 0, TAU);
      c.fillStyle = col; c.fill();
      c.globalAlpha = 1;
      c.fillStyle = shade(col, -0.35);
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10;
        c.save(); c.rotate(a);
        c.beginPath();
        c.moveTo(r * 0.8, -r * 0.2); c.lineTo(r * 1.32, 0); c.lineTo(r * 0.8, r * 0.2);
        c.closePath(); c.fill();
        c.restore();
      }
      c.beginPath(); c.arc(0, 0, r, 0, TAU);
      c.fillStyle = col; c.fill();
      c.strokeStyle = '#7F1D3A'; c.lineWidth = Math.max(1.5, r * 0.12); c.stroke();
      c.fillStyle = '#F6B32B';
      c.beginPath();
      c.moveTo(r * 0.2, -r * 0.62); c.lineTo(r * 0.95, -r * 0.3);
      c.lineTo(r * 0.5, -r * 0.05); c.lineTo(r * 0.95, r * 0.3);
      c.lineTo(r * 0.2, r * 0.62);
      c.closePath(); c.fill();
      c.fillStyle = '#FFE4E6';
      for (const s of [-1, 1]) {
        c.beginPath(); c.arc(r * 0.35, s * r * 0.34, r * 0.16, 0, TAU); c.fill();
      }
    }
  };

  /** Rank 2 and 3 wear plate on the face they walk into fire with. */
  function rankPlate(c, r, rank) {
    if (rank < 2) return;
    c.lineCap = 'round';
    c.strokeStyle = '#C6D2E0';
    c.lineWidth = Math.max(1, r * 0.16);
    c.beginPath(); c.arc(0, 0, r * 1.12, -0.85, 0.85); c.stroke();
    if (rank < 3) return;
    c.strokeStyle = '#F6B32B';
    c.lineWidth = Math.max(1, r * 0.12);
    c.beginPath(); c.arc(0, 0, r * 1.38, -0.7, 0.7); c.stroke();
  }

  function drawEnemy(c, e, cell, tick) {
    const spec = PV.TowerDef.KINDS[e.kind];
    const r = cell * spec.size;
    const x = e.x * cell, y = e.y * cell;

    c.fillStyle = 'rgba(0,0,0,.26)';
    c.beginPath(); c.ellipse(x + r * 0.2, y + r * 0.6, r * 0.95, r * 0.48, 0, 0, TAU); c.fill();

    c.save();
    c.translate(x, y); c.rotate(e.head);
    (MOBS[e.kind] || MOBS.grunt)(c, r, e.slowFor > 0 ? '#7DD3FC' : spec.colour, tick);
    rankPlate(c, r, e.rank || 1);
    c.restore();

    if (e.slowFor > 0) {
      c.strokeStyle = 'rgba(224,249,255,.75)';
      c.lineWidth = Math.max(1, cell * 0.022);
      for (let i = 0; i < 3; i++) {
        const a = tick * 0.03 + i * TAU / 3;
        const px = x + Math.cos(a) * r * 1.3, py = y + Math.sin(a) * r * 1.3;
        c.beginPath();
        c.moveTo(px - r * 0.16, py); c.lineTo(px + r * 0.16, py);
        c.moveTo(px, py - r * 0.16); c.lineTo(px, py + r * 0.16);
        c.stroke();
      }
    }
    if (e.hurt > 0) {
      c.globalAlpha = 0.34 * (e.hurt / 4);
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(x, y, r * 1.05, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }

    const frac = Math.max(0, e.hp / e.maxHp);
    const w = Math.max(cell * 0.5, r * 2.1), h = Math.max(2.5, cell * 0.075);
    const by = y - r - h * 2.2;
    c.fillStyle = 'rgba(8,12,18,.72)';
    rr(c, x - w / 2, by, w, h, h / 2); c.fill();
    c.fillStyle = frac > 0.5 ? '#34D399' : (frac > 0.25 ? '#FBBF24' : '#F87171');
    rr(c, x - w / 2, by, Math.max(h * 0.8, w * frac), h, h / 2); c.fill();

    // Rank, in the same pips the towers wear. Rank 1 is the baseline and says
    // nothing; a badge on every enemy on the board would be noise.
    if ((e.rank || 1) > 1) {
      const pr = Math.max(1.2, cell * 0.042), gap = pr * 2.6;
      const py = by - pr * 2.4;
      for (let i = 0; i < e.rank; i++) {
        c.beginPath();
        c.arc(x - gap * (e.rank - 1) / 2 + i * gap, py, pr, 0, TAU);
        c.fillStyle = e.rank >= 3 ? '#F6B32B' : '#E2E8F0';
        c.fill();
      }
    }
  }

  /* --------------------------------------------------------- projectiles */

  function drawShot(c, s, cell) {
    const a = s.life / s.max;
    c.save();
    c.lineCap = 'round';
    c.globalAlpha = s.kind === 'frost' ? a * 0.7 : a;
    c.strokeStyle = s.colour;
    c.lineWidth = s.kind === 'gun' ? Math.max(1.5, cell * 0.05)
      : (s.kind === 'frost' ? Math.max(2, cell * 0.10) : Math.max(2, cell * 0.075));
    c.beginPath();
    c.moveTo(s.x1 * cell, s.y1 * cell);
    c.lineTo(s.x2 * cell, s.y2 * cell);
    c.stroke();
    c.fillStyle = s.kind === 'frost' ? '#E0F9FF' : '#FFF7ED';
    c.beginPath();
    c.arc(s.x2 * cell, s.y2 * cell, cell * (s.kind === 'cannon' ? 0.09 : 0.055) * (0.5 + a * 0.5), 0, TAU);
    c.fill();
    c.restore();
  }

  function drawBlast(c, b, cell) {
    const k = 1 - b.life / b.max;                 // 0 at the bang, 1 at the end
    const r = b.r * cell * (0.45 + k * 0.8);
    const x = b.x * cell, y = b.y * cell;
    const g = c.createRadialGradient(x, y, r * 0.08, x, y, r);
    g.addColorStop(0, 'rgba(255,240,200,' + (0.85 * (1 - k)).toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(249,115,22,' + (0.5 * (1 - k)).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(120,53,15,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  /** The same turret art, small, for the shop button. */
  function towerIcon(type, level, px) {
    const dpr = window.devicePixelRatio || 1;
    const cv = document.createElement('canvas');
    cv.width = Math.round(px * dpr); cv.height = Math.round(px * dpr);
    cv.style.width = px + 'px'; cv.style.height = px + 'px';
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(px / 2, px / 2);
    const cell = px * 0.62;
    pad(c, cell, PV.TowerDef.TOWERS[type].colour, level);
    c.rotate(-Math.PI / 2);                       // barrel up, so it reads as a tower
    TURRETS[type](c, cell, level, 0, 0);
    return cv;
  }

  function pips(level) {
    let s = '';
    for (let i = 0; i < PV.TowerDef.MAX_LEVEL; i++) s += i < level ? '\u25C6' : '\u25C7';
    return s;
  }

  /* ----------------------------------------------------------- the view */

  PV.TowerDefView = function (ctx) {
    const opts = ctx.opts || {};
    const mapKey = PV.TDMaps.DEFS[opts.map] ? opts.map : 'meadow';
    const def = PV.TDMaps.DEFS[mapKey];
    const diffKey = PV.TowerDef.DIFFS[opts.difficulty] ? opts.difficulty : 'normal';

    let armed = 'gun', chosen = null, ui = null, bg = null, bgKey = '';
    let shop, info, hud, waveEl, livesEl, moneyEl, rankEl, waveBtn, bossEl, whereEl;

    return PV.loopHost(ctx, {
      hz: 60,
      keymap: { ' ': 'next', Enter: 'next' },
      pct: game => game.wave / game.waves,

      create: () => new PV.TowerDef({ seed: ctx.seed(), map: mapKey, difficulty: diffKey }),

      onReset() { armed = 'gun'; chosen = null; },

      fit(availW, availH) {
        const ratio = def.rows / def.cols;
        let w = Math.max(260, Math.min(availW, 1000));
        if (w * ratio > availH) w = Math.max(260, availH / ratio);
        return { w: w, h: w * ratio };
      },

      build(api) {
        ui = api;
        waveEl = PV.el('b', {}, '0');
        livesEl = PV.el('b', {}, '20');
        moneyEl = PV.el('b', {}, '220');
        rankEl = PV.el('b', {}, pips(1));
        hud = PV.el('div', { class: 'panel-mini stats' },
          PV.el('span', { class: 'k' }, t('td.wave')), waveEl,
          PV.el('span', { class: 'k' }, t('td.lives')), livesEl,
          PV.el('span', { class: 'k' }, t('td.money')), moneyEl,
          PV.el('span', { class: 'k' }, t('td.enemyRank')), rankEl);

        waveBtn = PV.el('button', { class: 'btn primary wide', onclick: () => api.input('next') },
          t('td.startWave'));
        bossEl = PV.el('div', { class: 'chip td-boss', hidden: true }, t('td.bossWave'));
        whereEl = PV.el('div', { class: 'muted small td-where' },
          t('td.' + mapKey) + ' ' + '\u2605'.repeat(def.tier) + ' \u00B7 ' + t('diff.' + diffKey));

        shop = PV.el('div', { class: 'td-shop' });
        info = PV.el('div', { class: 'td-info' });
        api.side.appendChild(hud);
        api.side.appendChild(waveBtn);
        api.side.appendChild(bossEl);
        api.side.appendChild(whereEl);
        api.below.appendChild(shop);
        api.below.appendChild(info);
        document.addEventListener('keydown', onKey);
        paintShop(api);
      },

      onDestroy() { document.removeEventListener('keydown', onKey); },

      onPointer(game, pt, geom, api) {
        const cell = geom.w / game.map.cols;
        const cx = Math.floor(pt.x / cell), cy = Math.floor(pt.y / cell);
        if (!game.inGrid(cx, cy)) return;

        const existing = game.towerAt(cx, cy);
        if (existing) { chosen = existing; paintShop(api); return; }
        chosen = null;
        if (armed) game.build(cx, cy, armed);
        paintShop(api);
      },

      onFrame(game, api) {
        waveEl.textContent = game.wave + ' / ' + game.waves;
        livesEl.textContent = String(game.lives);
        livesEl.style.color = game.lives <= 5 ? 'var(--bad)' : '';
        moneyEl.textContent = String(game.money);
        rankEl.textContent = pips(game.rank);
        waveBtn.disabled = !game.building || !!game.queue.length || !!game.enemies.length;
        waveBtn.textContent = game.rest > 0
          ? t('td.startIn', { n: Math.ceil(game.rest / 60) })
          : t('td.startWave');
        bossEl.hidden = !(game.nextIsBoss && game.building);
        if (chosen && game.towers.indexOf(chosen) < 0) { chosen = null; paintShop(api); }
      },

      draw(c, game, geom) {
        const map = game.map;
        const cell = geom.w / map.cols;
        const dpr = window.devicePixelRatio || 1;
        const key = map.key + '|' + Math.round(geom.w) + 'x' + Math.round(geom.h) + '|' + dpr;
        if (!bg || bgKey !== key) { bg = paintTerrain(map, geom.w, geom.h, dpr); bgKey = key; }
        c.drawImage(bg, 0, 0, geom.w, geom.h);

        // While the shop is armed, show exactly where that tower may go — and
        // whether the purse can take it.
        if (armed && !chosen) {
          const afford = game.money >= PV.TowerDef.TOWERS[armed].cost;
          // A whisper, not a tablecloth: at .07 the field still reads as
          // ground with free squares on it rather than as a sheet of tiles.
          c.fillStyle = afford ? 'rgba(52,211,153,.07)' : 'rgba(148,163,184,.05)';
          for (let y = 0; y < map.rows; y++) {
            for (let x = 0; x < map.cols; x++) {
              if (!game.canBuild(x, y)) continue;
              rr(c, x * cell + cell * 0.18, y * cell + cell * 0.18, cell * 0.64, cell * 0.64, cell * 0.14);
              c.fill();
            }
          }
        }

        if (chosen) {
          const st = game.statsOf(chosen);
          c.fillStyle = 'rgba(246,179,43,.10)';
          c.strokeStyle = 'rgba(246,179,43,.45)';
          c.lineWidth = Math.max(1, cell * 0.025);
          c.beginPath();
          c.arc(chosen.x * cell, chosen.y * cell, st.range * cell, 0, TAU);
          c.fill(); c.stroke();
        }

        for (const tw of game.towers) {
          drawTower(c, tw, cell, game.statsOf(tw), tw === chosen, game.tick);
        }
        for (const b of game.blasts) drawBlast(c, b, cell);
        for (const s of game.shots) drawShot(c, s, cell);
        for (const e of game.enemies) drawEnemy(c, e, cell, game.tick);
      },

      outcome(game) {
        const cleared = game.overReason === 'cleared';
        return {
          result: cleared ? 'win' : 'lose',
          score: game.score,
          xp: Math.round((cleared ? 140 : Math.max(10, game.wave * 6)) * game.diff.xp),
          tone: cleared ? 'good' : 'bad',
          title: cleared ? t('td.cleared') : t('td.overrun'),
          lines: [
            t('td.' + game.map.key) + ' \u00B7 ' + t('diff.' + game.diff.key),
            t('td.wave') + ': ' + game.wave + ' / ' + game.waves,
            t('td.killed') + ': ' + game.killed + ' \u00B7 ' + t('td.leaked') + ': ' + game.leaked,
            '@best'
          ]
        };
      }
    });

    /** 1 / 2 / 3 arm a tower. The harness only forwards actions to the engine,
        and arming the shop is the view's business, not the game's. */
    function onKey(e) {
      const i = { '1': 0, '2': 1, '3': 2 }[e.key];
      if (i == null || !ui) return;
      armed = KEYS[i]; chosen = null;
      paintShop(ui); ui.draw();
    }

    /** The shop doubles as the selected tower's panel — one place, two states.
        It is painted once from build(), before the harness has made a game, so
        nothing above the `chosen` branch may assume there is one. */
    function paintShop(api) {
      const game = api.game;
      PV.clear(shop);
      PV.clear(info);

      if (chosen) {
        const st = game.statsOf(chosen);
        const top = chosen.level >= PV.TowerDef.MAX_LEVEL;
        const next = top ? null : game.statsOf({ type: chosen.type, level: chosen.level + 1 });
        const arrow = (a, b) => Math.round(a) + (b == null ? '' : ' \u2192 ' + Math.round(b));

        info.appendChild(PV.el('span', { class: 'chip td-lv' },
          towerIcon(chosen.type, chosen.level, 22),
          t('td.' + chosen.type) + ' ' + pips(chosen.level)));
        info.appendChild(PV.el('span', { class: 'chip' },
          t('td.damage') + ' ' + arrow(st.dmg, next && next.dmg)));
        info.appendChild(PV.el('span', { class: 'chip' },
          t('td.range') + ' ' + st.range.toFixed(1) + (next ? ' \u2192 ' + next.range.toFixed(1) : '')));
        info.appendChild(PV.el('span', { class: 'chip' },
          t('td.rate') + ' ' + (60 / st.rate).toFixed(1) + '/s'));

        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          disabled: top || game.money < game.upgradeCost(chosen),
          onclick: () => { game.upgrade(chosen); paintShop(api); api.draw(); }
        }, top ? t('td.maxLevel') : t('td.upgrade') + ' \u00B7 ' + game.upgradeCost(chosen)));
        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          onclick: () => { game.sell(chosen); chosen = null; paintShop(api); api.draw(); }
        }, t('td.sell')));
        shop.appendChild(PV.el('button', {
          class: 'btn ghost',
          onclick: () => { chosen = null; paintShop(api); api.draw(); }
        }, t('common.close')));
        return;
      }

      for (const key of KEYS) {
        const spec = PV.TowerDef.TOWERS[key];
        shop.appendChild(PV.el('button', {
          class: 'btn ghost td-buy' + (armed === key ? ' on' : '')
            + (game && game.money < spec.cost ? ' poor' : ''),
          onclick: () => { armed = key; paintShop(api); api.draw(); }
        },
          towerIcon(key, 1, 26),
          t('td.' + key) + ' \u00B7 ' + spec.cost));
      }
      info.appendChild(PV.el('span', { class: 'muted small' }, t('td.hint')));
    }
  };

})(window.PV);
