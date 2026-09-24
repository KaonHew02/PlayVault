/* 蠕虫竞技场 / Worm Arena — view.

   Painted to read like the reference: a honeycomb floor inside a round red
   wall, fat worms made of shaded balls with googly eyes, sweets or fruit
   scattered everywhere, glowing remains where a worm burst, potion bottles,
   coins, and the HUD on the glass — score top left, the top ten top right,
   a round map bottom right. All of it is drawn here from nothing; the
   reference's own pictures are not used.

   Speed comes from SPRITES. A worm is a few hundred shaded balls and the
   floor is a few hundred snacks, every frame; each distinct ball colour,
   snack and bottle is painted once into a small canvas and stamped from
   then on, which is what keeps a busy arena at sixty frames.

   The camera sits on your head and pulls back as you grow (and further on
   the zoom potion), and it draws BETWEEN ticks: the body is sampled from
   the head a fraction of the last step back along its own path, so a
   screen that does not refresh at exactly sixty never sees the worm lurch.

   Three ways to steer, one input. A mouse aims from the middle of the
   canvas, where your head always is, and either button is the turbo; a
   finger drags a floating stick and holds the round button; the arrow keys
   turn and Space is the turbo. All of them end up as the engine's "aim at
   this angle" or "turn now", so none of them can out-turn another.

   Particles live here and nowhere near the engine: they are the one thing
   allowed to be random without a seed, because nothing depends on them. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const TAU = Math.PI * 2;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  /* ------------------------------------------------ what the player keeps */

  /* Coins, the skins bought with them, and how the arena looks. Sealed like
     the profile, rebuilt on every read, and in the backup. */
  const META = 'worms.meta';
  const MAX_COINS = 1e9;

  function freshMeta() {
    return {
      coins: 0, skin: 'sprout', food: 'sweets', floor: 'lilac', potion: 0,
      owned: PV.WormSkins.list.filter(s => !s.price).map(s => s.id)
    };
  }

  PV.Store.validate(META, v => {
    const m = PV.Safe.obj(v);
    if (!m) return undefined;
    const S = PV.WormSkins;
    const owned = [];
    (Array.isArray(m.owned) ? m.owned.slice(0, 64) : []).forEach(id => {
      const s = PV.Safe.str(id, 24, '');
      if (S.has(s) && owned.indexOf(s) < 0) owned.push(s);
    });
    S.list.forEach(s => { if (!s.price && owned.indexOf(s.id) < 0) owned.push(s.id); });
    const skin = PV.Safe.str(m.skin, 24, '');
    const food = PV.Safe.str(m.food, 12, '');
    const floor = PV.Safe.str(m.floor, 12, '');
    return {
      coins: PV.Safe.int(m.coins, 0, MAX_COINS, 0),
      owned: owned,
      skin: owned.indexOf(skin) >= 0 ? skin : 'sprout',
      food: S.packs.indexOf(food) >= 0 ? food : 'sweets',
      floor: S.floorKeys.indexOf(floor) >= 0 ? floor : 'lilac',
      potion: PV.Safe.int(m.potion, 0, PV.Worms.POTION_UP.max, 0)
    };
  });

  const loadMeta = () => PV.Store.get(META, null) || freshMeta();

  /* ------------------------------------------------------------ colour */

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** `hex` moved `k` of the way towards `to`. */
  function mix(hex, to, k) {
    const a = rgb(hex), b = rgb(to);
    const c = i => Math.round(a[i] + (b[i] - a[i]) * k);
    return 'rgb(' + c(0) + ',' + c(1) + ',' + c(2) + ')';
  }

  function alpha(hex, a) {
    const c = rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function canvasOf(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  /* ----------------------------------------------------------- sprites */

  /* A body ball: 128 px square, radius 62, so a worm of radius r stamps it
     at r * BALL wide — the margin is only what antialiasing needs, because
     every transparent pixel round a ball is still a pixel stamped, hundreds
     of times a frame. Lit in the middle and a shade darker at the edge, and
     with NO rim of its own: a rim on every ball is what made a worm read as
     a string of beads. The outline is drawn once, round the whole body. */
  const BALL = 128 / 62;
  const balls = new Map();
  function ballSprite(colour) {
    let s = balls.get(colour);
    if (s) return s;
    s = canvasOf(128, 128);
    const c = s.getContext('2d');
    const g = c.createRadialGradient(64, 57, 4, 64, 64, 63);
    g.addColorStop(0, mix(colour, '#FFFFFF', 0.3));
    g.addColorStop(0.6, colour);
    g.addColorStop(1, mix(colour, '#000000', 0.24));
    c.fillStyle = g;
    c.beginPath(); c.arc(64, 64, 62, 0, TAU); c.fill();
    balls.set(colour, s);
    return s;
  }

  /** The dark line round a worm: its own colour, deep and a little purple. */
  const inks = new Map();
  function inkOf(colour) {
    let s = inks.get(colour);
    if (!s) inks.set(colour, (s = mix(colour, '#1A1030', 0.62)));
    return s;
  }

  /** A soft halo: the turbo, the neon skin, and anything that glows. */
  const glows = new Map();
  function glowSprite(colour) {
    let s = glows.get(colour);
    if (s) return s;
    s = canvasOf(64, 64);
    const c = s.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, alpha(colour, 0.9));
    g.addColorStop(0.45, alpha(colour, 0.35));
    g.addColorStop(1, alpha(colour, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    glows.set(colour, s);
    return s;
  }

  /* A glowing orb: remains, turbo crumbs, and the "orbs" food pack. The
     core is radius 13 of 64, so an orb of radius r stamps at r * ORB. */
  const ORB = 64 / 13;
  const orbs = new Map();
  function orbSprite(colour) {
    let s = orbs.get(colour);
    if (s) return s;
    s = canvasOf(64, 64);
    const c = s.getContext('2d');
    const halo = c.createRadialGradient(32, 32, 8, 32, 32, 32);
    halo.addColorStop(0, alpha(colour, 0.6));
    halo.addColorStop(1, alpha(colour, 0));
    c.fillStyle = halo;
    c.fillRect(0, 0, 64, 64);
    const g = c.createRadialGradient(28, 27, 2, 32, 32, 13);
    g.addColorStop(0, mix(colour, '#FFFFFF', 0.75));
    g.addColorStop(0.55, colour);
    g.addColorStop(1, mix(colour, '#000000', 0.25));
    c.fillStyle = g;
    c.beginPath(); c.arc(32, 32, 13, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.beginPath(); c.arc(28, 27, 3.2, 0, TAU); c.fill();
    orbs.set(colour, s);
    return s;
  }

  /* ---- food packs: eight kinds each, drawn in a 64 px square, radius 24 */

  function disc(c, x, y, r, fill) {
    c.fillStyle = fill;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  function shine(c, x, y, rx, ry) {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.ellipse(x, y, rx, ry, -0.6, 0, TAU); c.fill();
  }

  const SWEETS = [
    function donut(c) {
      disc(c, 32, 33, 23, '#D9934A');
      c.fillStyle = '#FF4F9A';
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU, r = 19 + Math.sin(i * 1.9) * 1.6;
        const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.fill();
      disc(c, 32, 33, 7.5, '#A8662C');
      disc(c, 32, 33, 5.5, '#7A451B');
      const sp = ['#FFFFFF', '#6EE7F9', '#FDE047', '#86EFAC', '#FFFFFF', '#C4B5FD', '#FDE047'];
      c.lineWidth = 2.6; c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.3, r = 13 + (i % 2) * 3.5;
        const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
        c.strokeStyle = sp[i];
        c.beginPath(); c.moveTo(x - 2, y - 1.4); c.lineTo(x + 2, y + 1.4); c.stroke();
      }
      shine(c, 22, 20, 5, 2.6);
    },
    function candy(c) {
      c.fillStyle = '#FFD166';
      c.beginPath(); c.moveTo(18, 32); c.lineTo(4, 20); c.lineTo(6, 44); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(46, 32); c.lineTo(60, 20); c.lineTo(58, 44); c.closePath(); c.fill();
      c.fillStyle = '#EF476F';
      c.beginPath(); c.ellipse(32, 32, 16, 13, 0, 0, TAU); c.fill();
      c.save();
      c.beginPath(); c.ellipse(32, 32, 16, 13, 0, 0, TAU); c.clip();
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 3.4;
      for (let x = 10; x < 58; x += 9) { c.beginPath(); c.moveTo(x, 16); c.lineTo(x + 12, 48); c.stroke(); }
      c.restore();
      shine(c, 26, 25, 5, 2.5);
    },
    function lollipop(c) {
      c.fillStyle = '#F3F4F6';
      c.fillRect(30, 34, 4.5, 28);
      disc(c, 32, 26, 20, '#FF5D8F');
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 3.6;
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const a = i * 0.33, r = i * 0.3;
        const x = 32 + Math.cos(a) * r, y = 26 + Math.sin(a) * r;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      shine(c, 24, 17, 5, 2.6);
    },
    function cupcake(c) {
      c.fillStyle = '#4CC9F0';
      c.beginPath(); c.moveTo(14, 34); c.lineTo(50, 34); c.lineTo(44, 58); c.lineTo(20, 58); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2;
      for (let x = 20; x <= 44; x += 6) { c.beginPath(); c.moveTo(x, 36); c.lineTo(x + (x < 32 ? 1.5 : -1.5), 57); c.stroke(); }
      disc(c, 22, 32, 10, '#FF7DB8'); disc(c, 42, 32, 10, '#FF7DB8'); disc(c, 32, 25, 12, '#FF93C6');
      disc(c, 33, 12, 5, '#E11D48');
      shine(c, 27, 21, 4.5, 2.2);
    },
    function cookie(c) {
      disc(c, 32, 32, 23, '#B7773D');
      disc(c, 32, 31, 21, '#D9A066');
      const chips = [[24, 22], [38, 20], [44, 34], [30, 38], [20, 34], [36, 46], [26, 48]];
      chips.forEach(p => disc(c, p[0], p[1], 3.3, '#5B3413'));
      shine(c, 24, 18, 5, 2.4);
    },
    function jellybean(c) {
      c.save();
      c.translate(32, 32); c.rotate(-0.5);
      c.fillStyle = '#5EDB6B';
      c.beginPath(); c.ellipse(0, 0, 22, 13, 0, 0, TAU); c.fill();
      c.fillStyle = '#3FB54D';
      c.beginPath(); c.ellipse(0, 4, 18, 7, 0, 0, Math.PI); c.fill();
      c.restore();
      shine(c, 24, 24, 7, 3);
    },
    function icecream(c) {
      c.fillStyle = '#E0A458';
      c.beginPath(); c.moveTo(16, 30); c.lineTo(48, 30); c.lineTo(32, 62); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,70,20,.5)'; c.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(18 + i * 8, 30); c.lineTo(34 + i * 2, 58 - i * 6); c.stroke();
      }
      disc(c, 32, 24, 17, '#5FE3B9');
      disc(c, 22, 32, 6, '#5FE3B9'); disc(c, 42, 32, 6, '#5FE3B9');
      disc(c, 33, 9, 4.5, '#E11D48');
      shine(c, 26, 17, 5, 2.5);
    },
    function heart(c) {
      c.fillStyle = '#FF3D6E';
      c.beginPath();
      c.moveTo(32, 56);
      c.bezierCurveTo(4, 36, 10, 8, 32, 20);
      c.bezierCurveTo(54, 8, 60, 36, 32, 56);
      c.fill();
      shine(c, 22, 22, 6, 3);
    }
  ];

  const FRUIT = [
    function apple(c) {
      disc(c, 24, 36, 18, '#E63946'); disc(c, 40, 36, 18, '#E63946');
      disc(c, 32, 40, 19, '#E63946');
      c.strokeStyle = '#6B3E1F'; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(32, 22); c.lineTo(34, 10); c.stroke();
      c.fillStyle = '#4CAF50';
      c.beginPath(); c.ellipse(42, 13, 8, 4, -0.5, 0, TAU); c.fill();
      shine(c, 22, 30, 5, 3);
    },
    function orange(c) {
      disc(c, 32, 34, 23, '#FF9F1C');
      c.fillStyle = 'rgba(200,100,0,.35)';
      for (let i = 0; i < 14; i++) disc(c, 32 + Math.cos(i * 2.4) * (8 + (i % 3) * 5), 34 + Math.sin(i * 2.4) * (8 + (i % 3) * 5), 1.2, 'rgba(200,100,0,.35)');
      c.fillStyle = '#4CAF50';
      c.beginPath(); c.ellipse(36, 11, 7, 3.5, -0.4, 0, TAU); c.fill();
      shine(c, 23, 25, 6, 3);
    },
    function cherries(c) {
      c.strokeStyle = '#3F7D20'; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(20, 40); c.quadraticCurveTo(26, 16, 38, 6); c.stroke();
      c.beginPath(); c.moveTo(44, 42); c.quadraticCurveTo(42, 18, 38, 6); c.stroke();
      disc(c, 20, 44, 12, '#D62839'); disc(c, 44, 46, 12, '#E63946');
      shine(c, 16, 40, 3.5, 2); shine(c, 40, 42, 3.5, 2);
    },
    function strawberry(c) {
      c.fillStyle = '#F2394C';
      c.beginPath();
      c.moveTo(32, 60);
      c.bezierCurveTo(6, 40, 10, 14, 32, 16);
      c.bezierCurveTo(54, 14, 58, 40, 32, 60);
      c.fill();
      c.fillStyle = '#FFE08A';
      for (let i = 0; i < 12; i++) {
        const x = 32 + ((i % 4) - 1.5) * 8 + (i % 2) * 2, y = 24 + Math.floor(i / 4) * 10;
        c.beginPath(); c.ellipse(x, y, 1.3, 2, 0, 0, TAU); c.fill();
      }
      c.fillStyle = '#3FA34D';
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        c.moveTo(32, 16); c.lineTo(32 + Math.cos(a) * 14, 16 + Math.sin(a) * 7 + 3);
        c.lineTo(32 + Math.cos(a + 0.35) * 6, 12);
      }
      c.fill();
    },
    function grapes(c) {
      const g = [[24, 22], [36, 22], [48, 24], [30, 33], [42, 34], [36, 45], [26, 44], [32, 55]];
      g.forEach(p => disc(c, p[0], p[1], 8.4, '#7B2CBF'));
      g.forEach(p => disc(c, p[0] - 2.4, p[1] - 2.6, 2.4, 'rgba(255,255,255,.4)'));
      c.strokeStyle = '#5A3A1A'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(36, 14); c.lineTo(38, 5); c.stroke();
    },
    function banana(c) {
      c.fillStyle = '#FFD93D';
      c.beginPath();
      c.moveTo(8, 22);
      c.quadraticCurveTo(22, 58, 56, 40);
      c.quadraticCurveTo(28, 46, 16, 18);
      c.closePath();
      c.fill();
      c.strokeStyle = '#C99A06'; c.lineWidth = 2;
      c.stroke();
      disc(c, 10, 20, 3, '#6B4F1D'); disc(c, 56, 40, 2.6, '#6B4F1D');
    },
    function watermelon(c) {
      c.fillStyle = '#2FA84F';
      c.beginPath(); c.arc(32, 22, 28, 0.15, Math.PI - 0.15); c.closePath(); c.fill();
      c.fillStyle = '#E9FBD9';
      c.beginPath(); c.arc(32, 22, 24, 0.18, Math.PI - 0.18); c.closePath(); c.fill();
      c.fillStyle = '#FF4D6D';
      c.beginPath(); c.arc(32, 22, 21, 0.2, Math.PI - 0.2); c.closePath(); c.fill();
      c.fillStyle = '#26262B';
      [[22, 30], [32, 34], [42, 30], [27, 38], [37, 38]].forEach(p => {
        c.beginPath(); c.ellipse(p[0], p[1], 1.6, 2.6, 0, 0, TAU); c.fill();
      });
    },
    function pear(c) {
      disc(c, 32, 42, 18, '#9BD94F');
      disc(c, 32, 24, 11, '#9BD94F');
      c.fillStyle = '#9BD94F';
      c.fillRect(22, 24, 20, 18);
      c.strokeStyle = '#6B3E1F'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(32, 14); c.lineTo(34, 5); c.stroke();
      shine(c, 25, 36, 5, 3);
    }
  ];

  const ORB_COLOURS = ['#FF5A5F', '#FFB400', '#FFE74C', '#6BF178', '#35A7FF', '#8C5CFF', '#FF6FD8', '#FFFFFF'];

  /* Each piece's own colour, for the glow behind it. */
  const SWEET_GLOW = ['#FF4F9A', '#EF476F', '#FF5D8F', '#4CC9F0', '#E0A458', '#44CC5A', '#3FD8A8', '#FF3D6E'];
  const FRUIT_GLOW = ['#E63946', '#FF9F1C', '#D62839', '#F2394C', '#8E3CCB', '#FFD93D', '#FF4D6D', '#8FD14A'];

  /**
   * A snack as a sticker: the drawing, a dark outline round its silhouette,
   * and a soft glow of its own colour behind. On a pale floor full of
   * pastel sweets, the outline is what separates a donut from the tiles;
   * the glow is what makes it catch the eye from across the screen.
   * Drawn at 96 px from the 64 px drawings, so it stays sharp up close.
   */
  function sticker(fn, glow) {
    const art = canvasOf(96, 96), a = art.getContext('2d');
    a.scale(1.5, 1.5);
    fn(a);
    const sil = canvasOf(96, 96), s = sil.getContext('2d');
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * TAU;
      s.drawImage(art, Math.cos(t) * 3.2, Math.sin(t) * 3.2);
    }
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = 'rgba(56,26,72,.88)';
    s.fillRect(0, 0, 96, 96);
    const out = canvasOf(96, 96), o = out.getContext('2d');
    const g = o.createRadialGradient(48, 48, 12, 48, 48, 47);
    g.addColorStop(0, alpha(glow, 0.5));
    g.addColorStop(1, alpha(glow, 0));
    o.fillStyle = g;
    o.fillRect(0, 0, 96, 96);
    o.drawImage(sil, 0, 0);
    o.drawImage(art, 0, 0);
    return out;
  }

  const packs = {};
  /** Eight sprites for a pack, and how big to stamp them per unit of radius. */
  function packSprites(key) {
    if (packs[key]) return packs[key];
    let out;
    if (key === 'orbs') {
      out = { list: ORB_COLOURS.map(orbSprite), per: ORB * 0.8 };
    } else {
      const fruit = key === 'fruit';
      const src = fruit ? FRUIT : SWEETS, glow = fruit ? FRUIT_GLOW : SWEET_GLOW;
      // The drawing fills a radius of 36 of the 96: that is the snack's size.
      out = { list: src.map((fn, i) => sticker(fn, glow[i])), per: 96 / 36 };
    }
    return (packs[key] = out);
  }

  /* ---- potions: a round bottle each, liquid in the potion's colour */

  const POTION_LOOK = {
    magnet: { liquid: ['#FF4D6D', '#4D8DFF'], icon: 'magnet' },
    x5: { liquid: ['#3FA7FF'], icon: 'x5' },
    radar: { liquid: ['#A45CFF'], icon: 'skull' },
    speed: { liquid: ['#3DDC6E'], icon: 'bolt' },
    turn: { liquid: ['#1CC9A0'], icon: 'turn' },
    zoom: { liquid: ['#FFCB2F'], icon: 'eye' }
  };

  function potionIcon(c, icon, x, y, s, ink) {
    c.fillStyle = ink || '#FFFFFF';
    c.strokeStyle = ink || '#FFFFFF';
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (icon === 'magnet') {
      c.lineWidth = s * 0.34;
      c.beginPath(); c.arc(x, y - s * 0.1, s * 0.62, Math.PI, 0); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.62, y - s * 0.1); c.lineTo(x - s * 0.62, y + s * 0.5);
      c.moveTo(x + s * 0.62, y - s * 0.1); c.lineTo(x + s * 0.62, y + s * 0.5); c.stroke();
    } else if (icon === 'x5') {
      c.font = '900 ' + (s * 1.25).toFixed(1) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('×5', x, y + s * 0.06);
    } else if (icon === 'skull') {
      disc(c, x, y - s * 0.1, s * 0.62, '#FFFFFF');
      c.fillRect(x - s * 0.38, y + s * 0.2, s * 0.76, s * 0.42);
      disc(c, x - s * 0.24, y - s * 0.1, s * 0.17, '#5B2A99');
      disc(c, x + s * 0.24, y - s * 0.1, s * 0.17, '#5B2A99');
    } else if (icon === 'bolt') {
      c.beginPath();
      c.moveTo(x + s * 0.18, y - s * 0.8); c.lineTo(x - s * 0.45, y + s * 0.1); c.lineTo(x - s * 0.02, y + s * 0.1);
      c.lineTo(x - s * 0.2, y + s * 0.82); c.lineTo(x + s * 0.48, y - s * 0.12); c.lineTo(x + s * 0.04, y - s * 0.12);
      c.closePath(); c.fill();
    } else if (icon === 'turn') {
      c.lineWidth = s * 0.26;
      c.beginPath(); c.arc(x, y, s * 0.56, -0.3, Math.PI * 1.4); c.stroke();
      c.beginPath();
      c.moveTo(x + s * 0.72, y - s * 0.62); c.lineTo(x + s * 0.62, y + s * 0.02); c.lineTo(x + s * 0.08, y - s * 0.3);
      c.closePath(); c.fill();
    } else if (icon === 'eye') {
      c.lineWidth = s * 0.24;
      c.beginPath(); c.arc(x - s * 0.12, y - s * 0.12, s * 0.48, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(x + s * 0.24, y + s * 0.24); c.lineTo(x + s * 0.72, y + s * 0.72); c.stroke();
    }
  }

  const potions = {};
  function potionSprite(kind) {
    if (potions[kind]) return potions[kind];
    const look = POTION_LOOK[kind] || POTION_LOOK.speed;
    const s = canvasOf(72, 72), c = s.getContext('2d');
    // glass
    c.fillStyle = 'rgba(235,245,255,.55)';
    c.beginPath(); c.arc(36, 44, 23, 0, TAU); c.fill();
    c.fillRect(29, 12, 14, 16);
    // liquid, split down the middle for the magnet's two poles
    c.save();
    c.beginPath(); c.arc(36, 44, 20, 0, TAU); c.clip();
    look.liquid.forEach((col, i) => {
      c.fillStyle = col;
      const w = 72 / look.liquid.length;
      c.fillRect(i * w, 30, w, 42);
    });
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(0, 30, 72, 4);
    c.restore();
    // cork and rim
    c.fillStyle = '#B07A4A';
    c.fillRect(30, 6, 12, 9);
    c.fillStyle = '#E6EEF8';
    c.fillRect(28, 14, 16, 4);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2.4;
    c.beginPath(); c.arc(36, 44, 23, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath(); c.ellipse(26, 35, 4, 7, 0.5, 0, TAU); c.fill();
    potionIcon(c, look.icon, 37, 48, 10);
    return (potions[kind] = s);
  }

  let coinArt = null;
  function coinSprite() {
    if (coinArt) return coinArt;
    const s = canvasOf(48, 48), c = s.getContext('2d');
    disc(c, 24, 25.5, 20, '#B7791F');
    const g = c.createRadialGradient(18, 16, 2, 24, 24, 20);
    g.addColorStop(0, '#FFF2B0'); g.addColorStop(0.5, '#FFC83D'); g.addColorStop(1, '#E09B12');
    c.fillStyle = g;
    c.beginPath(); c.arc(24, 24, 20, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(160,100,10,.7)'; c.lineWidth = 2.2;
    c.beginPath(); c.arc(24, 24, 14, 0, TAU); c.stroke();
    c.fillStyle = '#E09B12';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 4 : 9;
      c.lineTo(24 + Math.cos(a) * r, 24 + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    return (coinArt = s);
  }

  let chestArt = null;
  function chestSprite() {
    if (chestArt) return chestArt;
    const s = canvasOf(80, 72), c = s.getContext('2d');
    c.fillStyle = '#8A4B22';
    c.fillRect(10, 30, 60, 36);
    c.fillStyle = '#A55A2A';
    c.beginPath(); c.moveTo(8, 34); c.lineTo(8, 22); c.quadraticCurveTo(40, 2, 72, 22); c.lineTo(72, 34); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,25,5,.5)'; c.lineWidth = 2;
    for (let y = 42; y < 66; y += 9) { c.beginPath(); c.moveTo(11, y); c.lineTo(69, y); c.stroke(); }
    c.fillStyle = '#FFC83D';
    c.fillRect(8, 31, 64, 5);
    c.fillRect(15, 20, 6, 46); c.fillRect(59, 20, 6, 46);
    c.fillRect(33, 30, 14, 15);
    c.fillStyle = '#5B3413';
    c.beginPath(); c.arc(40, 36, 2.6, 0, TAU); c.fill();
    c.fillRect(39, 37, 2, 5);
    return (chestArt = s);
  }

  /* ---- the floor: a honeycomb tile, repeated in world units */

  const HEX = 34, HEX_W = 59, K = 2;       // radius, tile width, pixels per unit
  const tiles = {};

  /** The floor's tile, painted once per floor for every canvas to share. */
  function floorTile(key) {
    if (tiles[key]) return tiles[key];
    const f = PV.WormSkins.floors[key] || PV.WormSkins.floors.lilac;
    const tile = canvasOf(HEX_W * K, HEX * 3 * K);
    const c = tile.getContext('2d');
    c.scale(K, K);
    c.fillStyle = f.line;
    c.fillRect(0, 0, HEX_W, HEX * 3);
    const hw = HEX_W / 2;
    const centres = [[0, 0], [HEX_W, 0], [hw, HEX * 1.5], [0, HEX * 3], [HEX_W, HEX * 3]];
    // Flat tiles and thin, quiet joins: the floor is the backdrop, and the
    // food has to be the loudest thing on it.
    centres.forEach(p => {
      const inset = 1.1, r = HEX - inset, w = hw - inset * 0.87;
      c.fillStyle = f.a;
      c.beginPath();
      c.moveTo(p[0], p[1] - r); c.lineTo(p[0] + w, p[1] - r / 2); c.lineTo(p[0] + w, p[1] + r / 2);
      c.lineTo(p[0], p[1] + r); c.lineTo(p[0] - w, p[1] + r / 2); c.lineTo(p[0] - w, p[1] - r / 2);
      c.closePath(); c.fill();
    });
    return (tiles[key] = { tile: tile, look: f });
  }

  /** The floor as a fill for one canvas, laid in world units. */
  function floorFill(ctx2d, key) {
    const t0 = floorTile(key);
    let pat = ctx2d.createPattern(t0.tile, 'repeat');
    if (pat && pat.setTransform && typeof DOMMatrix === 'function') {
      pat.setTransform(new DOMMatrix([1 / K, 0, 0, 1 / K, 0, 0]));
    } else {
      // No pattern transforms: a tile at one pixel a unit is still a floor.
      const small = canvasOf(HEX_W, HEX * 3);
      small.getContext('2d').drawImage(t0.tile, 0, 0, HEX_W, HEX * 3);
      pat = ctx2d.createPattern(small, 'repeat');
    }
    return { key: key, ctx: ctx2d, pattern: pat, look: t0.look };
  }

  /* ------------------------------------------------------------- worms */

  const XS = new Float64Array(4096), YS = new Float64Array(4096);

  /**
   * `n` points `sp` apart along a worm's body, starting `back` behind the
   * head — the fraction of a step the clock has not reached yet.
   */
  function sampleBody(w, back, sp, n) {
    const path = w.path, since = w.since, NODE = PV.Worms.NODE, last = path.length - 1;
    for (let i = 0; i < n; i++) {
      const s = back + i * sp;
      if (last < 0) { XS[i] = w.x; YS[i] = w.y; continue; }
      if (s <= since) {
        const k = since > 0 ? s / since : 0;
        XS[i] = w.x + (path[0].x - w.x) * k;
        YS[i] = w.y + (path[0].y - w.y) * k;
        continue;
      }
      const rest = s - since, j = Math.floor(rest / NODE);
      if (j >= last) { XS[i] = path[last].x; YS[i] = path[last].y; continue; }
      const f = (rest - j * NODE) / NODE, a = path[j], b = path[j + 1];
      XS[i] = a.x + (b.x - a.x) * f;
      YS[i] = a.y + (b.y - a.y) * f;
    }
  }

  /**
   * Two big googly eyes, side by side on the front of the head and nearly
   * touching, pupils on whatever the worm is looking at. `lid` is the head's
   * colour, for a blink.
   */
  function eyes(c, x, y, r, a, look, lid, shut) {
    const fx = Math.cos(a), fy = Math.sin(a), lx = Math.cos(look), ly = Math.sin(look);
    const er = r * 0.43;
    for (let side = -1; side <= 1; side += 2) {
      const ex = x + fx * r * 0.22 - fy * side * r * 0.47;
      const ey = y + fy * r * 0.22 + fx * side * r * 0.47;
      c.fillStyle = shut ? lid : '#FFFFFF';
      c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      c.lineWidth = r * 0.075;
      c.strokeStyle = 'rgba(26,16,48,.6)';
      c.stroke();
      if (shut) {
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(ex + fy * er * 0.62, ey - fx * er * 0.62);
        c.lineTo(ex - fy * er * 0.62, ey + fx * er * 0.62);
        c.stroke();
        continue;
      }
      const px = ex + lx * er * 0.36, py = ey + ly * er * 0.36;
      disc(c, px, py, er * 0.58, '#1B1726');
      disc(c, px - er * 0.2, py - er * 0.22, er * 0.2, '#FFFFFF');
    }
  }

  /** Hats sit on top of the head as seen on screen, not turned with it. */
  function hat(c, kind, x, y, r) {
    if (kind === 'crown') {
      const w = r * 1.3, h = r * 0.75, top = y - r * 1.05 - h;
      c.fillStyle = '#FFC83D';
      c.strokeStyle = '#B7791F'; c.lineWidth = r * 0.08;
      c.beginPath();
      c.moveTo(x - w / 2, top + h);
      c.lineTo(x - w / 2, top + h * 0.2); c.lineTo(x - w / 4, top + h * 0.55);
      c.lineTo(x, top); c.lineTo(x + w / 4, top + h * 0.55);
      c.lineTo(x + w / 2, top + h * 0.2); c.lineTo(x + w / 2, top + h);
      c.closePath(); c.fill(); c.stroke();
      disc(c, x, top + h * 0.7, r * 0.12, '#E11D48');
    } else if (kind === 'horns') {
      c.fillStyle = '#FFF3D6';
      c.strokeStyle = '#B7791F'; c.lineWidth = r * 0.07;
      for (let side = -1; side <= 1; side += 2) {
        c.beginPath();
        c.moveTo(x + side * r * 0.35, y - r * 0.8);
        c.quadraticCurveTo(x + side * r * 0.95, y - r * 1.2, x + side * r * 0.8, y - r * 1.75);
        c.quadraticCurveTo(x + side * r * 0.62, y - r * 1.15, x + side * r * 0.1, y - r * 0.92);
        c.closePath(); c.fill(); c.stroke();
      }
    } else if (kind === 'antennae') {
      c.strokeStyle = '#2D2A26'; c.lineWidth = r * 0.12; c.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        c.beginPath();
        c.moveTo(x + side * r * 0.3, y - r * 0.8);
        c.quadraticCurveTo(x + side * r * 0.45, y - r * 1.5, x + side * r * 0.85, y - r * 1.75);
        c.stroke();
        disc(c, x + side * r * 0.85, y - r * 1.75, r * 0.2, '#2D2A26');
      }
    }
  }

  function twinkle(c, x, y, s) {
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath();
    c.moveTo(x, y - s); c.lineTo(x + s * 0.28, y - s * 0.28); c.lineTo(x + s, y);
    c.lineTo(x + s * 0.28, y + s * 0.28); c.lineTo(x, y + s); c.lineTo(x - s * 0.28, y + s * 0.28);
    c.lineTo(x - s, y); c.lineTo(x - s * 0.28, y - s * 0.28);
    c.closePath(); c.fill();
  }

  /** A polyline through the body samples `from` to `to`, stroked as set. */
  function strokeBody(c, from, to) {
    c.beginPath();
    c.moveTo(XS[from], YS[from]);
    for (let i = from + 1; i <= to; i++) c.lineTo(XS[i], YS[i]);
    c.stroke();
  }

  const TAIL = 7;                  // body samples the tail tapers over

  /**
   * One worm, painted as a single soft tube rather than a row of beads:
   *
   *   a drop shadow, and a glow on the turbo or a neon skin — one stroke each
   *   one dark outline round the WHOLE body — a stroke, stamps for the taper
   *   the balls, tail first, close enough to read as gentle segments
   *   a gloss streak down its back, lit from the top left like everything
   *   the head: bigger, outlined, glossy, with googly eyes that blink
   *
   * The skin's stripes are counted in fixed lengths of body, not in samples,
   * so they are the same width however finely the body is drawn — and the
   * same stripes the engine colours a dead worm's remains by. Returns where
   * the head was drawn, or null if none of it was on screen.
   */
  function paintWorm(c, w, vis, now, back, look) {
    const skin = PV.WormSkins.get(w.skin);
    const r = w.r, sp = r * 0.5, unit = r * 0.55;
    const avail = w.since + Math.max(0, w.path.length - 1) * PV.Worms.NODE - back;
    const L = Math.max(0, Math.min(w.len, avail));
    const n = Math.min(XS.length, Math.max(2, Math.floor(L / sp) + 1));
    sampleBody(w, back, sp, n);

    const pad = r * 2.5;
    const inView = i => XS[i] > vis.x0 - pad && XS[i] < vis.x1 + pad && YS[i] > vis.y0 - pad && YS[i] < vis.y1 + pad;
    let seen = inView(n - 1);
    for (let i = 0; i < n && !seen; i += 3) seen = inView(i);
    if (!seen) return null;

    const base = skin.colors[0], ink = inkOf(base);
    const ow = r * 0.17;                               // outline width
    const cut = Math.max(0, n - 1 - TAIL);             // last sample at full width
    const radAt = i => {
      const fromTail = n - 1 - i;
      return fromTail < TAIL ? r * (0.45 + 0.55 * (fromTail / TAIL)) : r;
    };
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // Shadow, then glow: under everything.
    c.save();
    c.translate(r * 0.2, r * 0.32);
    c.strokeStyle = 'rgba(30,16,62,.17)';
    c.lineWidth = r * 2.05;
    strokeBody(c, 0, Math.max(0, n - 3));
    c.restore();
    if (w.boost || skin.glow) {
      const pulse = w.boost ? 0.5 + 0.5 * Math.sin((now || 0) * 0.35) : 0.5;
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = alpha(skin.glow || '#FFFFFF', 0.16 + 0.1 * pulse);
      c.lineWidth = r * 3.3;
      strokeBody(c, 0, n - 1);
      c.strokeStyle = alpha(skin.glow || '#FFFFFF', 0.22 + 0.12 * pulse);
      c.lineWidth = r * 2.7;
      strokeBody(c, 0, n - 1);
      c.globalCompositeOperation = 'source-over';
    }

    // The outline: one stroke for the body, a disc for each tapering sample.
    c.strokeStyle = ink;
    c.lineWidth = (r + ow) * 2;
    if (cut > 0) strokeBody(c, 0, cut);
    for (let i = n - 1; i > cut; i--) if (inView(i)) disc(c, XS[i], YS[i], radAt(i) + ow, ink);

    // The body, tail first, so each ball overlaps the one behind it.
    for (let i = n - 1; i >= 1; i--) {
      if (!inView(i)) continue;
      const d = radAt(i) * BALL;
      const colour = PV.WormSkins.colorAt(skin, Math.floor((i * sp) / unit));
      c.drawImage(ballSprite(colour), XS[i] - d / 2, YS[i] - d / 2, d, d);
    }

    // The gloss down its back, stopping short of the taper.
    if (cut > 3) {
      c.save();
      c.translate(-r * 0.18, -r * 0.27);
      c.strokeStyle = 'rgba(255,255,255,.3)';
      c.lineWidth = r * 0.32;
      strokeBody(c, 1, cut - 1);
      c.restore();
    }

    if (skin.sparkle) {
      const beat = Math.floor((now || 0) / 7);
      for (let i = 2; i < n; i += 2) {
        if ((i * 7 + beat) % 17 !== 0 || !inView(i)) continue;
        twinkle(c, XS[i] + r * 0.15, YS[i] - r * 0.2, r * 0.4);
      }
    }

    // The head: a size up, outlined, with its own shine.
    const hx = XS[0], hy = YS[0], hr = r * 1.14;
    disc(c, hx, hy, hr + ow, ink);
    c.drawImage(ballSprite(base), hx - hr * BALL / 2, hy - hr * BALL / 2, hr * BALL, hr * BALL);
    c.fillStyle = 'rgba(255,255,255,.34)';
    c.beginPath(); c.ellipse(hx - hr * 0.42, hy - hr * 0.48, hr * 0.28, hr * 0.16, -0.7, 0, TAU); c.fill();
    // A blink every three seconds or so, each worm on its own beat.
    const shut = now != null && ((Math.floor(now) + w.id * 53) % 190) < 7;
    eyes(c, hx, hy, hr, w.angle, look, base, shut);
    if (skin.hat) hat(c, skin.hat, hx, hy, r);
    return { x: hx, y: hy };
  }

  /**
   * The wardrobe's picture of a skin: a worm lying across the card, painted
   * by the same paintWorm as the arena, so the card cannot drift from it.
   */
  function skinCard(skin, w, h) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    // Sized by its own pixels and the stylesheet, so a narrow card can
    // shrink it without squashing the worm.
    const cv = canvasOf(Math.round(w * dpr), Math.round(h * dpr));
    const c = cv.getContext('2d');
    const k = h / 50;                                  // world units to card pixels
    c.scale(dpr * k, dpr * k);
    const W = w / k, H = h / k;
    const worm = {
      id: skin.index, skin: skin.index, r: 10, len: W - 26, since: 0, path: [],
      x: W - 16, y: H * 0.6, angle: 0, boost: false, step: 0
    };
    for (let i = 0; i < 60; i++) {
      worm.path.push({ x: worm.x - i * 4, y: worm.y + Math.sin(i * 0.17) * 4.5 });
    }
    paintWorm(c, worm, { x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 }, null, 0, 0);
    return cv;
  }

  /* ----------------------------------------------------------------- hud */

  function label(c, text, x, y, size, colour, weight) {
    c.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size * 0.3);
    c.strokeStyle = 'rgba(24,14,44,.72)';
    c.strokeText(text, x, y);
    c.fillStyle = colour;
    c.fillText(text, x, y);
  }

  function panel(c, x, y, w, h, r) {
    c.fillStyle = 'rgba(28,18,52,.42)';
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
    c.fill();
  }

  function clip(text, n) { return text.length > n ? text.slice(0, n - 1) + '…' : text; }

  /* ------------------------------------------------------------ the view */

  PV.WormsView = function (ctx) {
    const opts = ctx.opts || {};
    const racing = !!ctx.race;
    let meta = loadMeta();
    let ui = null, canvas = null, current = null, myName = '';
    let shopEl = null, shopShown = false;
    let floor = null;                // the floor pattern, for this canvas

    // camera and frame clock
    const cam = { scale: 0, last: 0 };
    // input state
    let mouseBoost = false, stick = null, boostTouch = null, touchSeen = false;
    const coarse = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;
    // decoration
    let bits = [], floats = [], notes = [];

    function saveMeta() { PV.Store.set(META, meta); meta = loadMeta(); }

    /** Coins from a run go in the stash once, however it ended. */
    function pay(game) {
      if (!game || game.paid) return;
      game.paid = true;
      if (!game.coins) return;
      meta = loadMeta();
      meta.coins = Math.min(MAX_COINS, meta.coins + game.coins);
      saveMeta();
    }

    function skinIndex() { return PV.WormSkins.get(meta.skin).index; }

    /* ---- the wardrobe and the look, in the side panel at the start line */

    function paintShop() {
      if (!shopEl) return;
      PV.clear(shopEl);
      const S = PV.WormSkins;
      shopEl.appendChild(PV.el('div', { class: 'shop-head' },
        PV.el('span', { class: 'k' }, t('worms.wardrobe')),
        PV.el('b', {}, PV.el('span', { class: 'coin' }), PV.fmtNum(meta.coins))));

      const grid = PV.el('div', { class: 'worm-skins' });
      S.list.forEach(skin => {
        const owned = meta.owned.indexOf(skin.id) >= 0;
        const on = meta.skin === skin.id;
        const poor = !owned && meta.coins < skin.price;
        const name = PV.I18n && PV.I18n.lang === 'zh' ? skin.nameZh : skin.name;
        grid.appendChild(PV.el('button', {
          class: 'worm-skin' + (on ? ' on' : '') + (owned ? '' : ' locked') + (poor ? ' poor' : ''),
          title: name,
          onclick: () => pickSkin(skin)
        },
        skinCard(skin, 64, 26),
        PV.el('span', { class: 'nm' }, name),
        PV.el('span', { class: 'pr' }, owned ? (on ? '✓' : '')
          : PV.el('span', {}, PV.el('span', { class: 'coin' }), PV.fmtNum(skin.price)))));
      });
      shopEl.appendChild(grid);

      const food = PV.el('div', { class: 'seg' });
      S.packs.forEach(k => food.appendChild(PV.el('button', {
        class: 'seg-btn' + (meta.food === k ? ' on' : ''),
        onclick: () => { meta.food = k; saveMeta(); paintShop(); if (ui) ui.draw(); }
      }, t('worms.' + k))));
      const floorsRow = PV.el('div', { class: 'worm-floors' });
      S.floorKeys.forEach(k => {
        const f = S.floors[k];
        floorsRow.appendChild(PV.el('button', {
          class: 'worm-floor' + (meta.floor === k ? ' on' : ''),
          title: t('worms.floor.' + k),
          'aria-label': t('worms.floor.' + k),
          style: { background: 'linear-gradient(135deg, ' + f.a + ' 0 55%, ' + f.wall + ' 55% 62%, ' + f.out + ' 62%)' },
          onclick: () => { meta.floor = k; saveMeta(); paintShop(); if (ui) ui.draw(); }
        }));
      });
      shopEl.appendChild(PV.el('div', { class: 'worm-look' },
        PV.el('span', { class: 'k' }, t('worms.food')), food,
        PV.el('span', { class: 'k' }, t('worms.floor')), floorsRow));

      // The one upgrade: potions that last longer.
      const UP = PV.Worms.POTION_UP, lv = meta.potion, top = lv >= UP.max;
      const cost = top ? 0 : UP.cost[lv];
      const secs = n => Math.round((PV.Worms.POTION_TICKS + n * UP.per) / 60);
      shopEl.appendChild(PV.el('div', { class: 'up-row' },
        PV.el('span', { class: 'nm' }, t('worms.upPotion') + ' · ' + t('worms.lv', { n: lv })),
        PV.el('button', {
          class: 'btn primary small-btn',
          disabled: top || meta.coins < cost,
          onclick: buyPotion
        }, top ? t('worms.max') : PV.el('span', {}, PV.el('span', { class: 'coin' }), PV.fmtNum(cost))),
        PV.el('span', { class: 'fx' }, top ? t('worms.upPotionTop', { n: secs(lv) })
          : t('worms.upPotionFx', { now: secs(lv), next: secs(lv + 1) }))));

      const best = PV.Profile.forGame('worms').bestScore;
      shopEl.appendChild(PV.el('p', { class: 'fx' },
        (best ? t('worms.best', { n: PV.fmtNum(best) }) + ' · ' : '') + t('worms.shopHint')));
    }

    function buyPotion() {
      const game = ui && ui.game, UP = PV.Worms.POTION_UP;
      if (!game || !game.ready || meta.potion >= UP.max) return;
      const cost = UP.cost[meta.potion];
      if (meta.coins < cost) return;
      meta.coins -= cost;
      meta.potion++;
      saveMeta();
      // Bought at the start line, so it counts for the run about to begin.
      game.potionTicks = PV.Worms.POTION_TICKS + meta.potion * UP.per;
      paintShop();
    }

    function pickSkin(skin) {
      const game = ui && ui.game;
      if (!game || !game.ready) return;
      if (meta.owned.indexOf(skin.id) < 0) {
        if (meta.coins < skin.price) return;
        meta.coins -= skin.price;
        meta.owned.push(skin.id);
      }
      meta.skin = skin.id;
      saveMeta();
      // Cosmetic only, so it may be set straight on the parked worm.
      game.player.skin = skin.index;
      paintShop();
      ui.draw();
    }

    function showShop(on) {
      if (!ui || on === shopShown) return;
      shopShown = on;
      PV.clear(ui.side);
      if (on) {
        shopEl = PV.el('div', { class: 'panel-mini worm-shop' });
        ui.side.appendChild(shopEl);
        paintShop();
      } else {
        shopEl = null;
      }
      ui.resize();
    }

    /* ---- input */

    function local(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    }

    function boostButton(w, h) {
      const r = Math.max(30, Math.min(44, Math.min(w, h) * 0.085));
      return { x: w - r - 18, y: h - r - 18, r: r };
    }

    function aimFrom(dx, dy, dead) {
      if (dx * dx + dy * dy < dead * dead) return;
      ui.input({ aim: Math.atan2(dy, dx) });
    }

    function onDown(e) {
      if (!ui || !ui.game) return;
      const game = ui.game, p = local(e);
      if (e.pointerType === 'mouse') {
        aimFrom(p.x - p.w / 2, p.y - p.h / 2, 4);
        if (game.ready) { ui.input('go'); return; }
        if (e.button === 0 || e.button === 2) { mouseBoost = true; ui.input({ boost: true }); }
        return;
      }
      touchSeen = true;
      if (e.cancelable) e.preventDefault();
      if (game.ready) { ui.input('go'); return; }
      const b = boostButton(p.w, p.h);
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.35) {
        boostTouch = e.pointerId;
        ui.input({ boost: true });
        return;
      }
      if (!stick) stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }

    function onMove(e) {
      if (!ui) return;
      const p = local(e);
      if (e.pointerType === 'mouse') { aimFrom(p.x - p.w / 2, p.y - p.h / 2, 4); return; }
      if (stick && e.pointerId === stick.id) {
        stick.x = p.x; stick.y = p.y;
        aimFrom(p.x - stick.ox, p.y - stick.oy, 8);
      }
    }

    function onUp(e) {
      if (!ui) return;
      if (!e || e.pointerType === 'mouse' || e.type === 'blur') {
        if (mouseBoost) { mouseBoost = false; ui.input({ boost: false }); }
      }
      if (!e || e.type === 'blur' || e.pointerId === boostTouch) {
        if (boostTouch != null) { boostTouch = null; ui.input({ boost: false }); }
      }
      if (!e || e.type === 'blur' || (stick && e.pointerId === stick.id)) stick = null;
    }

    const noMenu = e => e.preventDefault();

    /* ---- decoration: news from the engine, drained every frame */

    function note(text, colour) {
      notes.push({ text: text, colour: colour || '#FFFFFF', born: performance.now() });
      if (notes.length > 3) notes.shift();
    }

    function drain(game) {
      if (!game.events.length) return;
      const evs = game.events.splice(0);
      for (const ev of evs) {
        if (ev.kind === 'death') {
          const k = Math.min(40, 14 + Math.round(ev.r));
          for (let i = 0; i < k; i++) {
            const a = Math.random() * TAU, sp = (1 + Math.random() * 3) * (0.6 + ev.r / 25);
            bits.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                        life: 1, r: 2 + Math.random() * ev.r * 0.35, c: ev.c });
          }
        } else if (ev.kind === 'gulp') {
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * TAU;
            bits.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4,
                        life: 0.6, r: 1.6 + Math.random() * 2, c: ev.c || '#FFFFFF' });
          }
        } else if (ev.kind === 'kill') {
          note(t('worms.youAte', { name: ev.name }), '#FFE066');
        } else if (ev.kind === 'potion') {
          note(t('worms.fx.' + ev.potion), POTION_LOOK[ev.potion].liquid[0]);
        } else if (ev.kind === 'coin') {
          floats.push({ x: ev.x, y: ev.y, text: '+' + ev.n, c: '#FFD54F', life: 1 });
        } else if (ev.kind === 'chest') {
          note(t('worms.chestFound', { n: ev.n }), '#FFD54F');
          floats.push({ x: ev.x, y: ev.y, text: '+' + ev.n, c: '#FFD54F', life: 1.4 });
        }
      }
      if (bits.length > 500) bits.splice(0, bits.length - 500);
      if (floats.length > 30) floats.splice(0, floats.length - 30);
    }

    /* ---- painting */

    function paintFloorAndWall(c, game, fill) {
      const R = game.R;
      c.fillStyle = fill.pattern;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      // A pink band inside the wall, then the wall itself.
      c.strokeStyle = alpha(fill.look.wall, 0.16);
      c.lineWidth = 90;
      c.beginPath(); c.arc(0, 0, R - 45, 0, TAU); c.stroke();
      c.strokeStyle = fill.look.wall;
      c.lineWidth = 16;
      c.beginPath(); c.arc(0, 0, R + 8, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.55)';
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, R + 1, 0, TAU); c.stroke();
    }

    function paintFood(c, game, vis, now) {
      const pack = packSprites(meta.food);
      const tick = game.tick;
      const one = f => {
        if (f.x < vis.x0 - 30 || f.x > vis.x1 + 30 || f.y < vis.y0 - 30 || f.y > vis.y1 + 30) return;
        let k = 1 + Math.sin(now * 0.07 + f.ph) * 0.07;
        const age = tick - f.born;
        if (age < 18) k *= age / 18;
        if (f.k === 0) {
          const s = f.r * pack.per * k;
          if (s <= 0) return;
          c.drawImage(pack.list[f.look], f.x - s / 2, f.y - s / 2, s, s);
        } else {
          const left = f.until - tick;
          if (left < 120) c.globalAlpha = Math.max(0, left / 120);
          const s = f.r * ORB * k;
          if (s > 0) c.drawImage(orbSprite(f.c || '#FFFFFF'), f.x - s / 2, f.y - s / 2, s, s);
          c.globalAlpha = 1;
        }
      };
      game.food.each(vis.x0 - 30, vis.y0 - 30, vis.x1 + 30, vis.y1 + 30, one);
      for (const it of game.flying) one(it.f);
    }

    function paintPickups(c, game, vis, now) {
      const onScreen = (x, y, m) => x > vis.x0 - m && x < vis.x1 + m && y > vis.y0 - m && y < vis.y1 + m;
      for (const p of game.potions) {
        if (!onScreen(p.x, p.y, 60)) continue;
        const bob = Math.sin(now * 0.06 + p.ph) * 4;
        const col = POTION_LOOK[p.kind].liquid[0];
        const g = glowSprite(col), G = 76 + Math.sin(now * 0.1 + p.ph) * 6;
        c.globalAlpha = 0.55;
        c.drawImage(g, p.x - G / 2, p.y + bob - G / 2, G, G);
        c.globalAlpha = 1;
        c.drawImage(potionSprite(p.kind), p.x - 22, p.y + bob - 26, 44, 44);
      }
      const coin = coinSprite();
      for (const k of game.coinSpots) {
        if (!onScreen(k.x, k.y, 30)) continue;
        const spin = Math.abs(Math.cos(now * 0.05 + k.ph)) * 0.8 + 0.2;
        c.drawImage(coin, k.x - 11 * spin, k.y - 11, 22 * spin, 22);
      }
      const chest = chestSprite();
      for (const k of game.chests) {
        if (!onScreen(k.x, k.y, 80)) continue;
        const G = 120 + Math.sin(now * 0.08 + k.ph) * 12;
        c.globalAlpha = 0.6;
        c.drawImage(glowSprite('#FFD54F'), k.x - G / 2, k.y - G / 2, G, G);
        c.globalAlpha = 1;
        c.drawImage(chest, k.x - 30, k.y - 28, 60, 54);
      }
    }

    function paintBits(c) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx; b.y += b.vy;
        b.vx *= 0.93; b.vy *= 0.93;
        b.life -= 0.028;
        if (b.life <= 0) { bits.splice(i, 1); continue; }
        c.globalAlpha = Math.max(0, b.life);
        disc(c, b.x, b.y, b.r, b.c);
      }
      c.globalAlpha = 1;
    }

    /** Where a world point lands on the screen. */
    function toScreen(x, y, view) {
      return { x: view.w / 2 + (x - view.cx) * view.s, y: view.h / 2 + (y - view.cy) * view.s };
    }

    /** An arrow on the screen's edge pointing at something off it. */
    function edgeArrow(c, view, x, y, colour, draw) {
      const p = toScreen(x, y, view);
      const m = 34;
      if (p.x > m && p.x < view.w - m && p.y > m && p.y < view.h - m) return;
      const dx = p.x - view.w / 2, dy = p.y - view.h / 2;
      const k = Math.min((view.w / 2 - m) / Math.abs(dx || 1e-6), (view.h / 2 - m) / Math.abs(dy || 1e-6));
      const ax = view.w / 2 + dx * k, ay = view.h / 2 + dy * k, a = Math.atan2(dy, dx);
      c.save();
      c.translate(ax, ay);
      c.fillStyle = 'rgba(28,18,52,.55)';
      c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.fill();
      c.rotate(a);
      c.fillStyle = colour;
      c.beginPath(); c.moveTo(24, 0); c.lineTo(15, -7); c.lineTo(15, 7); c.closePath(); c.fill();
      c.restore();
      draw(ax, ay);
    }

    function hud(c, game, view, geom, now) {
      const p = game.player;
      const u = Math.max(0.78, Math.min(1.15, geom.w / 900));
      const board = game.leaderboard();

      // Names over heads, and a crown over the biggest.
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      for (const h of view.heads) {
        const s = toScreen(h.x, h.y, view);
        const top = s.y - h.w.r * view.s * 1.25 - 4;
        label(c, clip(h.w === p ? view.me : h.w.name, 16), s.x, top, Math.round(12 * u),
          h.w === p ? '#FFFFFF' : 'rgba(255,255,255,.88)');
        if (board[0] === h.w) {
          const cx = s.x, cy = top - 16 * u;
          c.fillStyle = '#FFC83D';
          c.beginPath();
          c.moveTo(cx - 8 * u, cy + 5 * u); c.lineTo(cx - 8 * u, cy - 3 * u); c.lineTo(cx - 4 * u, cy + 1 * u);
          c.lineTo(cx, cy - 6 * u); c.lineTo(cx + 4 * u, cy + 1 * u); c.lineTo(cx + 8 * u, cy - 3 * u);
          c.lineTo(cx + 8 * u, cy + 5 * u); c.closePath(); c.fill();
        }
      }

      // Floating "+1"s where coins were.
      c.textBaseline = 'middle';
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.life -= 0.02;
        if (f.life <= 0) { floats.splice(i, 1); continue; }
        const s = toScreen(f.x, f.y, view);
        c.globalAlpha = Math.min(1, f.life * 1.5);
        label(c, f.text, s.x, s.y - (1 - f.life) * 40, Math.round(15 * u), f.c, 800);
      }
      c.globalAlpha = 1;

      // Radar: the graves, and the chests in treasure mode, off the edge.
      if (p.alive && p.fx.radar > 0) {
        const near = game.graves.slice().sort((a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 5);
        for (const g of near) {
          edgeArrow(c, view, g.x, g.y, '#C084FC', (x, y) => {
            c.drawImage(potionSprite('radar'), x - 10, y - 11, 20, 20);
          });
        }
      }
      if (game.mode.chests && p.alive) {
        let best = null, bd = Infinity;
        for (const k of game.chests) {
          const d = Math.hypot(k.x - p.x, k.y - p.y);
          if (d < bd) { bd = d; best = k; }
        }
        if (best) edgeArrow(c, view, best.x, best.y, '#FFD54F', (x, y) => c.drawImage(chestSprite(), x - 12, y - 11, 24, 22));
      }

      // Top left: your size, your kills, your coins.
      const px = 12, py = 12, ph = 62 * u;
      panel(c, px, py, 150 * u, ph, 10 * u);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      const skin = PV.WormSkins.get(p.skin);
      const iy = py + 19 * u;
      c.drawImage(ballSprite(skin.colors[0]), px + 9 * u, iy - 9 * u, 18 * u, 18 * u);
      label(c, PV.fmtNum(p.alive && !p.parked ? Math.floor(p.mass) : (game.finalScore || 0)),
        px + 32 * u, iy + 1, Math.round(19 * u), '#FFFFFF', 800);
      const ry = iy + 26 * u;
      c.font = '700 ' + Math.round(13 * u) + 'px ' + FONT;
      label(c, '☠ ' + p.kills, px + 11 * u, ry, Math.round(13 * u), '#FFFFFF');
      c.drawImage(coinSprite(), px + 58 * u, ry - 8 * u, 16 * u, 16 * u);
      label(c, PV.fmtNum(game.coins), px + 78 * u, ry, Math.round(13 * u), '#FFE066');
      if (game.mode.chests) {
        c.drawImage(chestSprite(), px + 108 * u, ry - 8 * u, 18 * u, 16 * u);
        label(c, String(game.chestsFound), px + 130 * u, ry, Math.round(13 * u), '#FFE066');
      }

      // Potions running, as bottles with a clock round each.
      const fy = py + ph + 10 * u;
      const fxList = PV.Worms.POTIONS.filter(k => p.fx[k] > 0);
      fxList.forEach((k, i) => {
        const x = px + 18 * u + i * 36 * u, y = fy + 16 * u;
        c.fillStyle = 'rgba(28,18,52,.5)';
        c.beginPath(); c.arc(x, y, 16 * u, 0, TAU); c.fill();
        c.drawImage(potionSprite(k), x - 12 * u, y - 13 * u, 24 * u, 24 * u);
        c.strokeStyle = POTION_LOOK[k].liquid[0];
        c.lineWidth = 3 * u;
        c.beginPath();
        c.arc(x, y, 16 * u, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.fx[k] / game.potionTicks));
        c.stroke();
      });

      // Top right: the top ten — five on a phone — and you under them if
      // you are not in it.
      const shown = geom.w < 560 ? 5 : 10;
      const bw = 176 * u, rowH = 17 * u, top10 = board.slice(0, shown);
      const meAt = board.indexOf(p);
      const rows = top10.length + (meAt >= shown ? 1 : 0);
      const bx = geom.w - bw - 12, by = 12;
      panel(c, bx, by, bw, 24 * u + rows * rowH + 6 * u, 10 * u);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      label(c, t('worms.leaders'), bx + 10 * u, by + 13 * u, Math.round(11 * u), 'rgba(255,255,255,.75)', 700);
      const row = (w, place, y) => {
        const mine = w === p;
        const col = mine ? '#FFE066' : '#FFFFFF';
        c.textAlign = 'left';
        label(c, place + '.', bx + 10 * u, y, Math.round(12 * u), col, mine ? 800 : 600);
        label(c, clip(mine ? view.me : w.name, 12), bx + 34 * u, y, Math.round(12 * u), col, mine ? 800 : 600);
        c.textAlign = 'right';
        label(c, PV.fmtNum(Math.floor(w.mass)), bx + bw - 10 * u, y, Math.round(12 * u), col, mine ? 800 : 600);
      };
      top10.forEach((w, i) => row(w, i + 1, by + 30 * u + i * rowH));
      if (meAt >= shown) row(p, meAt + 1, by + 30 * u + shown * rowH);

      // Time mode's clock, top middle.
      if (game.mode.ticks) {
        const left = game.timeLeft();
        const txt = PV.fmtTime(Math.ceil(left / 60) * 1000);
        c.textAlign = 'center';
        panel(c, geom.w / 2 - 44 * u, 10, 88 * u, 30 * u, 15 * u);
        label(c, txt, geom.w / 2, 10 + 15 * u, Math.round(18 * u), left < 30 * 60 ? '#FF6B81' : '#FFFFFF', 800);
      }

      minimap(c, game, geom, u);

      // News in the middle: a worm you ate, a potion you found.
      const nowMs = performance.now();
      c.textAlign = 'center';
      notes = notes.filter(n => nowMs - n.born < 2200);
      notes.forEach((n, i) => {
        const age = (nowMs - n.born) / 2200;
        c.globalAlpha = age < 0.8 ? 1 : (1 - age) / 0.2;
        label(c, n.text, geom.w / 2, geom.h * 0.2 + i * 30 * u - age * 10, Math.round(21 * u), n.colour, 900);
      });
      c.globalAlpha = 1;

      // The wall is close: say so.
      if (p.alive && !p.parked) {
        const gap = game.R - Math.hypot(p.x, p.y) - p.r;
        if (gap < 260) {
          const k = Math.max(0, Math.min(1, 1 - gap / 260));
          const g = c.createRadialGradient(geom.w / 2, geom.h / 2, Math.min(geom.w, geom.h) * 0.35,
            geom.w / 2, geom.h / 2, Math.max(geom.w, geom.h) * 0.7);
          g.addColorStop(0, 'rgba(255,40,80,0)');
          g.addColorStop(1, 'rgba(255,40,80,' + (0.45 * k).toFixed(3) + ')');
          c.fillStyle = g;
          c.fillRect(0, 0, geom.w, geom.h);
          c.textAlign = 'center';
          label(c, '⚠ ' + t('worms.edge'), geom.w / 2, geom.h - 30 * u, Math.round(15 * u), '#FFD1DA', 800);
        }
      }

      // Touch: the stick where the finger went down, and the turbo button.
      if ((touchSeen || coarse) && !game.ready) {
        const b = boostButton(geom.w, geom.h);
        c.fillStyle = boostTouch != null ? 'rgba(255,214,79,.85)' : 'rgba(28,18,52,.45)';
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2;
        c.stroke();
        potionIcon(c, 'bolt', b.x, b.y, b.r * 0.5, boostTouch != null ? '#3A2A00' : '#FFFFFF');
        if (stick) {
          const reach = 46, dx = stick.x - stick.ox, dy = stick.y - stick.oy;
          const d = Math.hypot(dx, dy) || 1, k = Math.min(1, reach / d);
          c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2.5;
          c.beginPath(); c.arc(stick.ox, stick.oy, reach, 0, TAU); c.stroke();
          disc(c, stick.ox + dx * k, stick.oy + dy * k, 18, 'rgba(255,255,255,.6)');
        }
      }
    }

    /** The whole arena in a circle, bottom right: you, the leaders, chests. */
    function minimap(c, game, geom, u) {
      const mr = Math.max(40, Math.min(66, Math.min(geom.w, geom.h) * 0.11));
      const left = (touchSeen || coarse);
      const mx = left ? mr + 14 : geom.w - mr - 14, my = geom.h - mr - 14;
      const k = mr / game.R;
      c.fillStyle = 'rgba(28,18,52,.42)';
      c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2;
      c.stroke();
      const p = game.player;
      if (p.alive && p.fx.radar > 0) {
        for (const g of game.graves) disc(c, mx + g.x * k, my + g.y * k, 2.6, '#C084FC');
      }
      for (const ch of game.chests) {
        c.fillStyle = '#FFD54F';
        c.fillRect(mx + ch.x * k - 3, my + ch.y * k - 3, 6, 6);
      }
      const board = game.leaderboard().slice(0, 3);
      board.forEach((w, i) => {
        if (w === p) return;
        disc(c, mx + w.x * k, my + w.y * k, i === 0 ? 3.4 : 2.6, i === 0 ? '#FFC83D' : 'rgba(255,255,255,.7)');
      });
      const at = p.alive ? p : (game.lastDeath || p);
      const x = mx + at.x * k, y = my + at.y * k;
      disc(c, x, y, 4, '#FFFFFF');
      if (p.alive) {
        c.strokeStyle = '#FFFFFF'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(p.angle) * 9, y + Math.sin(p.angle) * 9); c.stroke();
      }
    }

    function overlay(c, game, geom) {
      const u = Math.max(0.78, Math.min(1.15, geom.w / 900));
      const p = game.player;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (game.ready) {
        const pulse = 1 + Math.sin(performance.now() / 260) * 0.04;
        const w = 260 * u, h = 58 * u, x = geom.w / 2 - w / 2, y = geom.h * 0.72 - h / 2;
        c.fillStyle = 'rgba(28,18,52,.62)';
        c.beginPath();
        if (c.roundRect) c.roundRect(x, y, w, h, h / 2); else c.rect(x, y, w, h);
        c.fill();
        label(c, t(touchSeen || coarse ? 'worms.tapToPlay' : 'worms.clickToPlay'),
          geom.w / 2, y + h / 2, Math.round(22 * u * pulse), '#FFE066', 900);
        label(c, t('worms.mode.' + game.modeKey) + ' · ' + t(touchSeen || coarse ? 'worms.hintTouch' : 'worms.hint'),
          geom.w / 2, y + h + 18 * u, Math.round(12 * u), 'rgba(255,255,255,.9)', 600);
        return;
      }
      if (!p.alive && game.lastDeath) {
        const since = game.tick - game.lastDeath.at;
        c.fillStyle = 'rgba(60,0,20,' + Math.min(0.35, since / 60).toFixed(3) + ')';
        c.fillRect(0, 0, geom.w, geom.h);
        const d = game.lastDeath;
        const why = d.cause === 'wall' ? t('worms.hitWall') : t('worms.eatenBy', { name: d.by || '?' });
        label(c, why, geom.w / 2, geom.h * 0.42, Math.round(26 * u), '#FFFFFF', 900);
        if (game.respawnAt) {
          const n = Math.max(1, Math.ceil((game.respawnAt - game.tick) / 60));
          label(c, t('worms.back', { n: n }), geom.w / 2, geom.h * 0.42 + 36 * u, Math.round(16 * u), '#FFE066', 700);
        }
      }
    }

    function draw(c, game, geom, api, alphaK) {
      drain(game);
      const p = game.player;
      const a = alphaK == null ? 1 : alphaK;
      const now = game.tick + a;

      // Where the camera looks: your head, or where you fell.
      let cx, cy;
      if (!p.alive && game.lastDeath) { cx = game.lastDeath.x; cy = game.lastDeath.y; }
      else { cx = p.px + (p.x - p.px) * a; cy = p.py + (p.y - p.py) * a; }

      // How far out: pull back as you grow, further on the zoom potion.
      const grow = Math.pow(Math.max(1, (p.alive ? p.r : 10) / 10), 0.62);
      const zoomFx = p.alive && p.fx.zoom > 0 ? 1.6 : 1;
      // A phone held upright is narrow, so it sees a little less of the
      // arena rather than a worm too thin to steer.
      const across = geom.w < 560 ? 300 : 350;
      const want = Math.min(geom.w, geom.h) / (across * grow * zoomFx) * (game.ready ? 0.9 : 1);
      const ms = performance.now();
      const dt = cam.last ? Math.min(0.1, (ms - cam.last) / 1000) : 1;
      cam.last = ms;
      cam.scale = cam.scale ? cam.scale + (want - cam.scale) * (1 - Math.exp(-dt * 3)) : want;
      const s = cam.scale;

      const view = { cx: cx, cy: cy, s: s, w: geom.w, h: geom.h, heads: [], me: myName };
      const hw = geom.w / 2 / s, hh = geom.h / 2 / s;
      const vis = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };

      if (!floor || floor.key !== meta.floor || floor.ctx !== c) floor = floorFill(c, meta.floor);
      const fill = floor;
      c.fillStyle = fill.look.out;
      c.fillRect(0, 0, geom.w, geom.h);
      c.save();
      c.translate(geom.w / 2, geom.h / 2);
      c.scale(s, s);
      c.translate(-cx, -cy);

      paintFloorAndWall(c, game, fill);
      paintFood(c, game, vis, now);
      paintPickups(c, game, vis, now);

      // Bots first, then you, so you are never under anybody.
      const order = game.worms.filter(w => w.alive && w !== p);
      if (p.alive) order.push(p);
      for (const w of order) {
        const back = (1 - a) * w.step;
        const look = w === p ? p.aim : w.angle;
        const head = paintWorm(c, w, vis, now, back, look);
        if (head) view.heads.push({ w: w, x: head.x, y: head.y });
      }
      paintBits(c);
      c.restore();

      hud(c, game, view, geom, now);
      overlay(c, game, geom);
    }

    /* ---- the harness */

    const host = PV.loopHost(ctx, {
      hz: 60,
      keymap: {
        ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right', A: 'left', D: 'right',
        ' ': 'boost', ArrowUp: 'boost', w: 'boost', W: 'boost', Enter: 'go'
      },
      sustained: ['left', 'right', 'boost'],
      pad: null,
      // A race on the clock shows how far through the seven minutes it is;
      // an endless one has no finish line to be a share of.
      pct: game => (game.mode.ticks ? 1 - game.timeLeft() / game.mode.ticks : 0),

      create: () => {
        pay(current);
        meta = loadMeta();
        myName = racing ? t('worms.you') : PV.Profile.name();
        current = new PV.Worms({
          seed: ctx.seed(), mode: opts.mode, crowd: opts.crowd,
          skin: skinIndex(), name: myName, autostart: racing,
          potionLevel: racing ? 0 : meta.potion      // a race is everyone on equal terms
        });
        return current;
      },

      onReset(game, api) {
        bits = []; floats = []; notes = [];
        stick = null; boostTouch = null; mouseBoost = false;
        cam.scale = 0;
        if (!ui) ui = api;
        shopShown = null;
        showShop(game.ready && !racing);
        api.status.textContent = t('worms.mode.' + game.modeKey) + ' · ' + t('worms.crowd.' + game.crowdKey);
      },

      fit(availW, availH) {
        const w = Math.max(280, Math.floor(availW));
        const ratio = w < 560 ? 1.35 : 0.64;
        return { w: w, h: Math.max(300, Math.min(Math.floor(availH), Math.round(w * ratio))) };
      },

      build(api) {
        ui = api;
        canvas = api.canvas;
        api.below.appendChild(PV.el('p', { class: 'muted small' }, t('worms.controls')));
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('contextmenu', noMenu);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('blur', onUp);
      },

      onDestroy() {
        pay(current);
        if (!canvas) return;
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('contextmenu', noMenu);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('blur', onUp);
      },

      onFrame(game) {
        // The wardrobe folds away the moment the run starts, and the arena
        // takes the room it was using.
        if (shopShown && !game.ready) showShop(false);
      },

      onRelabel(api) {
        if (shopShown) paintShop();
        const game = api.game;
        if (game) api.status.textContent = t('worms.mode.' + game.modeKey) + ' · ' + t('worms.crowd.' + game.crowdKey);
      },

      draw: draw,

      outcome(game) {
        pay(game);
        const p = game.player;
        const score = game.finalScore != null ? game.finalScore : Math.floor(p.mass);
        const timed = !!game.mode.ticks;
        const r = game.finalRank || game.rank();
        const won = timed && r.place === 1;
        const d = game.lastDeath;
        const title = timed ? (won ? t('worms.won') : t('worms.timeUp'))
          : (d && d.cause === 'wall' ? t('worms.hitWall') : t('worms.eatenBy', { name: (d && d.by) || '?' }));
        const lines = [
          t('common.score') + ': ' + PV.fmtNum(score)
            + (timed ? ' · ' + t('worms.place', { n: r.place, of: r.of })
              : (game.bestRank ? ' · ' + t('worms.bestRank', { n: game.bestRank }) : '')),
          t('worms.kills') + ': ' + p.kills
            + (game.mode.chests ? ' · ' + t('worms.chests') + ': ' + game.chestsFound : '')
            + ' · ' + t('worms.coinsWon', { n: game.coins }),
          // From the start line, not from the screen opening: time spent in
          // the wardrobe is not time played.
          t('common.time') + ': ' + PV.fmtTime(((game.tick - game.startTick) * 1000) / 60),
          '@best'
        ];
        return {
          result: won ? 'win' : 'over',
          score: score,
          xp: Math.min(400, 8 + Math.floor(score / 150) + p.kills * 3 + (won ? 40 : 0)),
          tone: won ? 'good' : 'flat',
          title: title,
          lines: lines
        };
      }
    });

    return host;
  };

})(window.PV);
