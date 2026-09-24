/* 蠕虫竞技场 / Worm Arena — the wardrobe, the food packs and the floors.

   Data only, shared three ways: the engine colours a dead worm's remains from
   its skin, the view paints every worm and pellet from here, and the
   wardrobe lists what can be bought. A skin is a run of colours laid one per
   segment from the head back, so `[a, a, b, b]` is a worm in two-segment
   stripes and the stripes travel with the body rather than sliding along it.

   Every skin, pack and floor here is this game's own. The reference's
   outfits and food art belong to its makers; what carries over is the idea
   — striped segments, googly eyes, a hat on the fancy ones, sweets on the
   floor — not a single picture. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* `price` is coins; nought is owned from the start. `hat` and `glow` are
     drawn by the view; the engine never looks past `colors`. */
  const SKINS = [
    { id: 'sprout', name: 'Sprout', nameZh: '嫩芽', price: 0,
      colors: ['#8BDA4B', '#8BDA4B', '#6CC23A', '#6CC23A'] },
    { id: 'bubblegum', name: 'Bubblegum', nameZh: '泡泡糖', price: 0,
      colors: ['#FF7EB6', '#FF7EB6', '#FFF2F8', '#FFB3D4'] },
    { id: 'ocean', name: 'Ocean', nameZh: '海洋', price: 0,
      colors: ['#3B9CFF', '#3B9CFF', '#6FD3FF', '#6FD3FF'] },
    { id: 'sunny', name: 'Sunny', nameZh: '阳光', price: 30,
      colors: ['#FFD23F', '#FFD23F', '#FF9F1C', '#FF9F1C'] },
    { id: 'grape', name: 'Grape', nameZh: '葡萄', price: 30,
      colors: ['#9B5DE5', '#9B5DE5', '#C79BFF', '#C79BFF'] },
    { id: 'candy', name: 'Candy Cane', nameZh: '拐杖糖', price: 60,
      colors: ['#F23B3B', '#F23B3B', '#FFFFFF', '#FFFFFF'] },
    { id: 'bee', name: 'Bumblebee', nameZh: '小蜜蜂', price: 80, hat: 'antennae',
      colors: ['#FFC800', '#FFC800', '#2D2A26', '#2D2A26'] },
    { id: 'tiger', name: 'Tiger', nameZh: '老虎', price: 100,
      colors: ['#FF8A1F', '#FF8A1F', '#FF8A1F', '#2A1D14'] },
    { id: 'melon', name: 'Watermelon', nameZh: '西瓜', price: 120,
      colors: ['#2FA84F', '#2FA84F', '#A6E36B', '#A6E36B'] },
    { id: 'mint', name: 'Mint Choc', nameZh: '薄荷巧克力', price: 150,
      colors: ['#8FF0C8', '#8FF0C8', '#8FF0C8', '#5B3A29'] },
    { id: 'zebra', name: 'Zebra', nameZh: '斑马', price: 180,
      colors: ['#FAFAFA', '#FAFAFA', '#26262B', '#26262B'] },
    { id: 'rainbow', name: 'Rainbow', nameZh: '彩虹', price: 220,
      colors: ['#FF4D4D', '#FF9F43', '#FFE14D', '#5BE37D', '#4DB8FF', '#7B6CFF', '#D16BFF'] },
    { id: 'lava', name: 'Lava', nameZh: '熔岩', price: 250,
      colors: ['#FF3D00', '#FF6D00', '#FFAB00', '#FF6D00'] },
    { id: 'frost', name: 'Frost', nameZh: '冰霜', price: 280,
      colors: ['#F2FBFF', '#C4E9FF', '#8FD3FF', '#C4E9FF'] },
    { id: 'galaxy', name: 'Galaxy', nameZh: '星河', price: 350, sparkle: true,
      colors: ['#2B2D6E', '#3D2F86', '#6B3FA0', '#3D2F86'] },
    { id: 'neon', name: 'Neon', nameZh: '霓虹', price: 400, glow: '#16FF8A',
      colors: ['#16FF8A', '#15151D', '#15151D', '#16FF8A'] },
    { id: 'dragon', name: 'Dragon', nameZh: '火龙', price: 600, hat: 'horns',
      colors: ['#E53935', '#E53935', '#FFB300', '#E53935', '#C62828'] },
    { id: 'royal', name: 'Royal', nameZh: '皇家', price: 1000, hat: 'crown', sparkle: true,
      colors: ['#FFD54F', '#FFC107', '#FFE082', '#FFC107'] }
  ];
  const BY_ID = Object.create(null);
  SKINS.forEach((s, i) => { s.index = i; BY_ID[s.id] = s; });

  /* Three things to eat, picked in the look panel. The view paints eight
     kinds of each; the engine only ever says "kind 0 to 7". */
  const FOOD_PACKS = ['sweets', 'fruit', 'orbs'];

  /* The floor under the arena: a honeycomb whose joins are only a shade off
     the tiles, the dark world outside the wall, and the wall itself. */
  const FLOORS = {
    lilac: { a: '#DAD3F4', line: '#CAC0EE', out: '#3A3358', wall: '#F0506E' },
    mint: { a: '#D3F1DD', line: '#BFE5CB', out: '#264236', wall: '#F0506E' },
    sky: { a: '#D4E8F9', line: '#C0DAF1', out: '#23364D', wall: '#F0506E' },
    night: { a: '#23283E', line: '#2D3350', out: '#0B0D16', wall: '#FF4D6D' }
  };

  PV.WormSkins = {
    list: SKINS,
    packs: FOOD_PACKS,
    floors: FLOORS,
    floorKeys: Object.keys(FLOORS),

    /** A skin by id or by index; anything unknown is the first one. */
    get(key) {
      if (typeof key === 'number') return SKINS[((key % SKINS.length) + SKINS.length) % SKINS.length];
      return BY_ID[key] || SKINS[0];
    },

    /** The colour of segment `i`, counted from the head. */
    colorAt(skin, i) {
      const c = skin.colors;
      return c[((i % c.length) + c.length) % c.length];
    },

    has(id) { return !!BY_ID[id]; }
  };

})(window.PV);
