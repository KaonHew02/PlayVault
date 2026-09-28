/* 街头大厨 / Street Chef — the machines and colours of the later streets.

   The cookers and drink machines the first five trucks did not need, hung
   on art.js the way food.js hangs the food: each cook station has a body
   (drawn once behind its slots) and a slot (what is on it, raw to done);
   art.js adds the progress ring, the tick, the smoke and the "+" on top,
   as it does for its own. And every street gets its own colours. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const A = PV.ChefArt;
  const { rr, ell, circ, paint, line, mix, shade, burner, steam, onHeat, OL, TAU } = A;

  const shelf = (c, box, col) => {
    const { x, y, w, h } = box, u = box.u;
    rr(c, x, y + h * 0.5, w, h * 0.48, u * 0.06); paint(c, col || '#9AA3AE', OL, u * 0.025);
    rr(c, x + u * 0.04, y + h * 0.54, w - u * 0.08, h * 0.08, u * 0.03); paint(c, '#B7BFC8');
  };
  const ghost = (c, part, x, y, r) => { c.save(); c.globalAlpha = 0.18; onHeat(c, part, x, y, r, 0, false); c.restore(); };

  function flames(c, x, y, r, t) {
    for (let i = -2; i <= 2; i++) {
      const h = r * (0.3 + 0.12 * Math.sin(t * 0.3 + i * 1.7));
      c.beginPath(); c.moveTo(x + i * r * 0.2 - r * 0.08, y); c.quadraticCurveTo(x + i * r * 0.2, y - h * 1.6, x + i * r * 0.2 + r * 0.08, y); c.closePath();
      c.fillStyle = i % 2 ? '#FFB020' : '#FF6A2B'; c.fill();
    }
  }

  A.food({
    station: {
      griddle: {
        body(c, box) {
          const { x, y, w, h } = box, u = box.u;
          rr(c, x, y + h * 0.2, w, h * 0.78, u * 0.06); paint(c, '#474C55', OL, u * 0.025);
          rr(c, x + u * 0.05, y + h * 0.26, w - u * 0.1, h * 0.62, u * 0.04); paint(c, '#2E3238');
          ell(c, x + w * 0.3, y + h * 0.4, w * 0.18, h * 0.05); paint(c, 'rgba(255,255,255,.08)');
        },
        slot(c, part, s, k, burnt, busy) { if (busy) onHeat(c, part, s.cx, s.cy + s.r * 0.1, s.r * 1.3, k, burnt); else ghost(c, part, s.cx, s.cy + s.r * 0.1, s.r * 1.3); }
      },
      roller: {
        body(c, box) {
          const { x, y, w, h } = box, u = box.u;
          rr(c, x, y + h * 0.18, w, h * 0.8, u * 0.06); paint(c, '#C8CED6', OL, u * 0.025);
          rr(c, x + u * 0.05, y + h * 0.3, w - u * 0.1, h * 0.52, u * 0.04); paint(c, '#8F99A5');
          for (let i = 0; i < 6; i++) { rr(c, x + u * 0.07, y + h * (0.33 + i * 0.08), w - u * 0.14, h * 0.05, h * 0.025); paint(c, '#E9EEF3', 'rgba(0,0,0,.25)', u * 0.008); }
        },
        slot(c, part, s, k, burnt, busy) { if (busy) onHeat(c, part, s.cx, s.cy + s.r * 0.05, s.r * 1.2, k, burnt); else ghost(c, part, s.cx, s.cy + s.r * 0.05, s.r * 1.2); }
      },
      press: {
        body: (c, box) => shelf(c, box, '#9AA3AE'),
        slot(c, part, s, k, burnt, busy, sl) {
          const { cx, cy, r } = s;
          rr(c, cx - r * 1.0, cy - r * 0.05, r * 2.0, r * 0.8, r * 0.14); paint(c, '#474C55', OL, r * 0.06);
          for (let i = 0; i < 5; i++) line(c, cx - r * 0.8 + i * r * 0.4, cy + r * 0.05, cx - r * 0.8 + i * r * 0.4, cy + r * 0.6, '#2E3238', r * 0.06);
          const shut = sl.st === 'cook';
          if (busy && !shut) onHeat(c, part, cx, cy + r * 0.3, r * 0.95, k, burnt);
          if (shut) {
            rr(c, cx - r * 1.02, cy - r * 0.2, r * 2.04, r * 0.5, r * 0.14); paint(c, '#5E646E', OL, r * 0.06);
            line(c, cx - r * 0.5, cy - r * 0.3, cx + r * 0.5, cy - r * 0.3, OL, r * 0.14);
            A.steam(c, cx, cy - r * 0.4, r * 0.8, sl.t);
          } else {
            rr(c, cx - r * 1.0, cy - r * 0.95, r * 2.0, r * 0.32, r * 0.1); paint(c, '#5E646E', OL, r * 0.06);
            line(c, cx - r * 0.5, cy - r * 1.02, cx + r * 0.5, cy - r * 1.02, OL, r * 0.14);
          }
        }
      },
      iron: {
        body: (c, box) => shelf(c, box, '#9AA3AE'),
        slot(c, part, s, k, burnt, busy, sl) {
          const { cx, cy, r } = s;
          const shut = sl.st === 'cook';
          rr(c, cx - r * 0.95, cy - r * 0.2, r * 1.9, r * 0.95, r * 0.24); paint(c, '#2B2E33', OL, r * 0.06);
          if (shut) {
            rr(c, cx - r * 0.95, cy - r * 0.45, r * 1.9, r * 0.5, r * 0.24); paint(c, '#3A3D44', OL, r * 0.06);
            line(c, cx + r * 0.9, cy - r * 0.2, cx + r * 1.3, cy - r * 0.2, OL, r * 0.16);
            A.steam(c, cx, cy - r * 0.55, r * 0.8, sl.t);
          } else {
            rr(c, cx - r * 0.9, cy - r * 1.1, r * 1.8, r * 0.36, r * 0.16); paint(c, '#3A3D44', OL, r * 0.06);
            if (busy) onHeat(c, part, cx, cy + r * 0.26, r * 1.05, k, burnt);
            else for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { rr(c, cx - r * 0.72 + i * r * 0.38, cy - r * 0.02 + j * r * 0.34, r * 0.3, r * 0.26, r * 0.04); paint(c, '#1E2024'); }
          }
        }
      },
      smoker: {
        body(c, box, th) {
          const { x, y, w, h } = box, u = box.u;
          rr(c, x, y + h * 0.1, w, h * 0.84, h * 0.4); paint(c, '#2B2B2B', OL, u * 0.025);
          rr(c, x + w * 0.08, y - h * 0.02, u * 0.12, h * 0.2, u * 0.03); paint(c, '#474C55', OL, u * 0.02);
          for (let i = 0; i < 3; i++) { circ(c, x + w * 0.08 + u * 0.06 + i * u * 0.05, y - h * 0.08 - i * h * 0.08, u * (0.04 + i * 0.02)); c.fillStyle = 'rgba(160,160,165,.45)'; c.fill(); }
          rr(c, x + u * 0.04, y + h * 0.84, w - u * 0.08, h * 0.12, u * 0.03); paint(c, '#5E646E', OL, u * 0.02);
        },
        slot(c, part, s, k, burnt, busy, sl, t) {
          const { cx, cy, r } = s;
          rr(c, cx - r * 0.95, cy - r * 0.45, r * 1.9, r * 1.1, r * 0.3); paint(c, '#3A2A20', OL, r * 0.05);
          if (sl.st === 'cook') { c.save(); c.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.2); ell(c, cx, cy + r * 0.45, r * 0.7, r * 0.12); c.fillStyle = '#FF7A1A'; c.fill(); c.restore(); }
          if (busy) onHeat(c, part, cx, cy + r * 0.1, r * 1.05, k, burnt);
        }
      },
      spit: {
        body(c, box) {
          const { x, y, w, h } = box, u = box.u;
          rr(c, x, y + h * 0.05, w, h * 0.93, u * 0.06); paint(c, '#C8CED6', OL, u * 0.025);
          rr(c, x + u * 0.05, y + h * 0.1, w - u * 0.1, h * 0.2, u * 0.03); paint(c, '#E8503A');
          for (let i = 0; i < Math.floor(w / (u * 0.1)); i++) line(c, x + u * 0.08 + i * u * 0.1, y + h * 0.12, x + u * 0.08 + i * u * 0.1, y + h * 0.28, '#FFB020', u * 0.02);
          rr(c, x + u * 0.04, y + h * 0.8, w - u * 0.08, h * 0.16, u * 0.03); paint(c, '#8F99A5', OL, u * 0.02);
        },
        slot(c, part, s, k, burnt, busy) {
          const { cx, cy, r } = s;
          line(c, cx, cy - r * 1.2, cx, cy + r * 0.9, '#5E646E', r * 0.1);
          if (!busy) { c.save(); c.globalAlpha = 0.2; }
          const pair = A.doneOf(part) || ['#E3A38A', '#B8753A'];
          const col = burnt ? '#2A1E17' : mix(pair[0], pair[1], busy ? k : 0);
          c.beginPath(); c.moveTo(cx - r * 0.55, cy - r * 0.9); c.lineTo(cx + r * 0.55, cy - r * 0.9); c.lineTo(cx + r * 0.3, cy + r * 0.6); c.lineTo(cx - r * 0.3, cy + r * 0.6); c.closePath();
          paint(c, col, OL, r * 0.06);
          for (let i = 0; i < 5; i++) line(c, cx - r * 0.5 + i * r * 0.02, cy - r * 0.7 + i * r * 0.3, cx + r * 0.5 - i * r * 0.05, cy - r * 0.62 + i * r * 0.3, shade(col, -0.2), r * 0.05);
          if (!busy) c.restore();
        }
      },
      wok: {
        body: (c, box) => shelf(c, box, '#9AA3AE'),
        slot(c, part, s, k, burnt, busy, sl, t) {
          const { cx, cy, r } = s;
          burner(c, cx, cy + r * 0.3, r * 0.95, false);
          if (sl.st === 'cook') flames(c, cx, cy + r * 0.42, r, t);
          c.beginPath(); c.moveTo(cx - r * 0.95, cy - r * 0.1); c.quadraticCurveTo(cx, cy + r * 0.8, cx + r * 0.95, cy - r * 0.1); c.closePath();
          paint(c, '#2B2E33', OL, r * 0.06);
          line(c, cx - r * 0.95, cy - r * 0.1, cx - r * 1.2, cy - r * 0.2, OL, r * 0.14);
          line(c, cx + r * 0.95, cy - r * 0.1, cx + r * 1.2, cy - r * 0.2, OL, r * 0.14);
          ell(c, cx, cy - r * 0.1, r * 0.95, r * 0.22); paint(c, '#3A3D44', OL, r * 0.05);
          if (busy) onHeat(c, part, cx, cy - r * 0.08, r * 0.7, k, burnt);
        }
      },
      steamer: {
        body: (c, box) => shelf(c, box, '#9AA3AE'),
        slot(c, part, s, k, burnt, busy, sl, t) {
          const { cx, cy, r } = s;
          const basket = (y, h) => { rr(c, cx - r * 0.9, y, r * 1.8, h, r * 0.12); paint(c, '#D9B37A', OL, r * 0.06); for (let i = 0; i < 3; i++) line(c, cx - r * 0.85, y + h * (0.3 + i * 0.25), cx + r * 0.85, y + h * (0.3 + i * 0.25), '#B08A4A', r * 0.04); };
          basket(cy, r * 0.62);
          ell(c, cx, cy, r * 0.9, r * 0.24); paint(c, '#E9C88E', OL, r * 0.05);
          if (sl.st === 'cook') {
            ell(c, cx, cy - r * 0.1, r * 0.92, r * 0.26); paint(c, '#C9A262', OL, r * 0.05);
            c.beginPath(); c.moveTo(cx - r * 0.92, cy - r * 0.1); c.quadraticCurveTo(cx, cy - r * 0.7, cx + r * 0.92, cy - r * 0.1); paint(c, '#D9B37A', OL, r * 0.05);
            steam(c, cx, cy - r * 0.55, r * 0.8, t);
          } else if (busy) onHeat(c, part, cx, cy - r * 0.12, r * 0.95, k, burnt);
        }
      },
      brewer: {
        body(c, box, th) {
          const { x, y, w, h } = box, u = box.u;
          rr(c, x, y + h * 0.04, w, h * 0.3, u * 0.06); paint(c, '#474C55', OL, u * 0.025);
          rr(c, x + u * 0.05, y + h * 0.08, w - u * 0.1, h * 0.12, u * 0.03); paint(c, '#C3CBD4');
          rr(c, x, y + h * 0.84, w, h * 0.14, u * 0.04); paint(c, '#5E646E', OL, u * 0.02);
        },
        slot(c, part, s, k, burnt, busy, sl) {
          const { cx, cy, r, y } = s;
          rr(c, cx - r * 0.34, y + r * 0.56, r * 0.68, r * 0.3, r * 0.06); paint(c, '#2B2E33', OL, r * 0.05);
          if (sl.st === 'cook') line(c, cx, y + r * 0.9, cx, cy + r * 0.1, '#4A2A18', r * 0.12);
          if (busy) onHeat(c, part, cx, cy + r * 0.42, r * 1.25, k, burnt);
          else { c.save(); c.globalAlpha = 0.25; onHeat(c, part, cx, cy + r * 0.42, r * 1.25, 0, false); c.restore(); }
        }
      }
    },
    machine: {
      blender(c, box, m, th, t, busy, id) {
        const u = box.u, { x, y, w, h } = m;
        const lw = u * 0.025;
        rr(c, x + w * 0.12, y + h * 0.66, w * 0.76, h * 0.26, u * 0.05); paint(c, '#E23B3B', OL, lw);
        circ(c, x + w * 0.5, y + h * 0.79, u * 0.04); paint(c, '#FFFFFF');
        c.beginPath(); c.moveTo(x + w * 0.16, y + h * 0.08); c.lineTo(x + w * 0.84, y + h * 0.08); c.lineTo(x + w * 0.72, y + h * 0.66); c.lineTo(x + w * 0.28, y + h * 0.66); c.closePath();
        paint(c, 'rgba(220,240,255,.6)', OL, lw);
        const liq = A.liquidOf(id);
        c.beginPath(); c.moveTo(x + w * 0.2, y + h * (busy ? 0.24 : 0.36)); c.lineTo(x + w * 0.8, y + h * (busy ? 0.24 : 0.36)); c.lineTo(x + w * 0.71, y + h * 0.64); c.lineTo(x + w * 0.29, y + h * 0.64); c.closePath();
        c.fillStyle = liq || '#FFB3C7'; c.fill();
        if (busy) for (let i = 0; i < 3; i++) { circ(c, x + w * (0.35 + i * 0.15), y + h * (0.4 + 0.08 * Math.sin(t * 0.5 + i)), u * 0.02); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill(); }
        rr(c, x + w * 0.14, y + h * 0.03, w * 0.72, h * 0.07, u * 0.02); paint(c, '#2B2E33', OL, lw);
      }
    }
  });

  /* The streets' own colours: an awning, its stripe, an accent, the sky,
     the far buildings, the pavement, the kitchen tiles and shelves. */
  Object.assign(A.THEMES, {
    hotdog: { a: '#E23B3B', b: '#FFFFFF', c: '#F5C400', sky: ['#7EC8F0', '#E2F4FC'], far: '#A9C4D9', near: '#E5D3B5', tile: '#FFF4F2', tile2: '#F7DEDA', shelf: '#C9CDD2', trim: '#A82525' },
    sandwich: { a: '#3D8B5A', b: '#FFF3DC', c: '#E0A458', sky: ['#A3D5F0', '#EAF6FC'], far: '#C9BBA2', near: '#E6D5B8', tile: '#F7F4EC', tile2: '#E9E2D2', shelf: '#C5C9CC', trim: '#276B42' },
    breakfast: { a: '#F2A91E', b: '#FFFFFF', c: '#8E2F1E', sky: ['#FFD1A1', '#FFF3E0'], far: '#E6B98A', near: '#F2D6B0', tile: '#FFF8EC', tile2: '#F6E6CC', shelf: '#CAC7C2', trim: '#B8761A' },
    waffle: { a: '#FF8FB1', b: '#FFF6E6', c: '#8E5A2B', sky: ['#FFC7DA', '#FFF0F5'], far: '#E9B8C9', near: '#F2D9C7', tile: '#FFF5F8', tile2: '#FBE3EB', shelf: '#CDC6CA', trim: '#D1587F' },
    icecream: { a: '#7ED3F2', b: '#FFF6DC', c: '#FF8FB1', sky: ['#9FE1F7', '#F0FBFF'], far: '#BFE3F0', near: '#F4E6D0', tile: '#F2FBFF', tile2: '#DDF2FA', shelf: '#C3CDD2', trim: '#3A9CC2' },
    bbq: { a: '#5B3A26', b: '#F2D6A2', c: '#C1271B', sky: ['#F7B26A', '#FCE5C4'], far: '#C98E62', near: '#D9B38A', tile: '#F6EEE4', tile2: '#E6D6C2', shelf: '#BFBAB4', trim: '#3E2618' },
    falafel: { a: '#2A8C7E', b: '#F7E9C8', c: '#C9A227', sky: ['#8ED0E6', '#EAF7FB'], far: '#E0C79A', near: '#EED9B0', tile: '#F4FAF6', tile2: '#DCEEE6', shelf: '#C2CAC7', trim: '#1B6359' },
    wok: { a: '#C62828', b: '#FFD54F', c: '#2B2B2B', sky: ['#FF9E7A', '#FFE6D6'], far: '#D98C7A', near: '#E9C2A2', tile: '#FFF4EE', tile2: '#F6DFD4', shelf: '#C7C3C1', trim: '#8E1B1B' },
    bakery: { a: '#B983FF', b: '#FFF6FB', c: '#FF9EC4', sky: ['#D9C4FF', '#F6F0FF'], far: '#CDB8E6', near: '#EEDCCB', tile: '#FBF7FF', tile2: '#EEE4FA', shelf: '#C9C5CF', trim: '#7B4FC0' },
    cafe: { a: '#6B4226', b: '#F5E6CC', c: '#2E8B57', sky: ['#A7C7E7', '#EDF4FB'], far: '#B9A28C', near: '#DCC8B0', tile: '#F7F2EC', tile2: '#E9DDCF', shelf: '#C4BFBA', trim: '#4A2A18' },
    ramen: { a: '#2B2B2B', b: '#F4EDE1', c: '#D93A2E', sky: ['#FFB199', '#FFE9E0'], far: '#C99AA6', near: '#D8C3A8', tile: '#F5F1E8', tile2: '#E6DED0', shelf: '#BFC3CA', trim: '#111111' },
    nashville: { a: '#D84315', b: '#FFE0B2', c: '#2B2B2B', sky: ['#FFB074', '#FFE8D1'], far: '#D9A07A', near: '#EAC9A5', tile: '#FFF5EC', tile2: '#F7E1CC', shelf: '#C8C3BE', trim: '#9E2A0C' }
  });

})(window.PV);
