/* 街头大厨 / Street Chef — the menu: every part and every truck.

   Seventeen streets of forty levels, as the reference has: the five the
   game opened with, then a hot-dog cart, a sandwich bar, a breakfast
   griddle, a waffle stand, an ice-cream van, a smokehouse, a falafel
   stall, a wok, a bakery, a café, a ramen bar and a Nashville hot-chicken
   truck. The order is the order they open in.

   A PART is anything that goes on a plate or is handed over: kind base
   (starts a plate), add (goes on one), side or drink; `layer` is the order
   a cook puts adds on (the bot follows it; any order is allowed); `cools`
   is how many seconds a hot drink stays hot.

   A TRUCK has stations — each cooks one part (type cook) or pours one drink
   (type drink), with slots and a speed by upgrade level 1..3; cook, burn
   and fill in seconds at level 1; `art` is which picture it wears — bins
   of parts taken as they are, and a menu of dishes, each with a price and
   the level it arrives on. A station or bin is only in the kitchen once
   something on the menu needs it (data.js kitchenAt), so the menu is all
   there is to say about a level's kitchen. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const base = layer => ({ kind: 'base', layer: layer || 0 });
  const add = layer => ({ kind: 'add', layer: layer });
  const side = () => ({ kind: 'side' });
  const drink = cools => (cools ? { kind: 'drink', cools: cools } : { kind: 'drink' });

  const PARTS = {
    // pasta
    pasta: base(), redsauce: add(1), whitesauce: add(1), meatball: add(2), parmesan: add(3), olives: add(4), basil: add(5),
    garlicbread: side(), coffee: drink(14),
    // burgers
    bun: base(), patty: add(1), bacon: add(2), cheddar: add(2), onion: add(3), tomato: add(4), lettuce: add(5),
    fries: side(), soda: drink(), milkshake: drink(),
    // pizza
    pizza: base(), pepperoni: add(2), ham: add(2), mushroom: add(2), pineapple: add(3), pepper: add(3), wings: side(), lemonade: drink(),
    // tacos
    shell: base(), beef: add(1), chicken: add(1), jack: add(3), salsa: add(4), guac: add(5), jalapeno: add(6),
    nachos: side(), churros: side(), horchata: drink(),
    // sushi
    rice: base(), salmon: add(1), tuna: add(1), tempura: add(1), cucumber: add(2), avocado: add(3), roe: add(4),
    miso: side(), edamame: side(), tea: drink(16),
    // hot dogs
    hdbun: base(), sausage: add(1), cheesesauce: add(2), ketchup: add(3), mustard: add(4), relish: add(5), onionrings: side(),
    // sandwiches
    toast: base(), egg: add(2), tomsoup: side(), oj: drink(),
    // breakfast
    pancake: base(), butter: add(1), syrup: add(4), blueberry: add(3), banana: add(3), hashbrown: side(),
    // waffles
    waffle: base(), cream: add(2), strawberry: add(3), choc: add(5), cocoa: drink(14),
    // ice cream
    cone: base(), vanilla: add(1), chocscoop: add(1), strawscoop: add(1), hotfudge: add(3), sprinkles: add(4), cherry: add(5),
    // barbecue
    steak: base(), ribs: base(), bbqsauce: add(1), beans: add(2), coleslaw: add(3), pickle: add(4), corn: side(), icedtea: drink(),
    // falafel
    pita: base(), falafel: add(1), shawarma: add(1), hummus: add(2), tahini: add(5), minttea: drink(14),
    // wok
    noodles: base(), shrimp: add(1), tofu: add(1), bokchoy: add(2), soysauce: add(3), chili: add(4), scallion: add(5),
    dumplings: side(), bubbletea: drink(),
    // bakery
    cupcake: base(), icing: add(1), chocicing: add(1), croissant: side(), latte: drink(14),
    // café
    shot: base(), milk: add(1), caramel: add(2), cinnamon: add(4), muffin: side(),
    // ramen
    ramen: base(), chashu: add(1), softegg: add(2), sweetcorn: add(3), nori: add(4),
    // Nashville
    brioche: base(), hotchicken: add(1), hotsauce: add(2), honey: add(3)
  };

  /* A station, briefly: id, type, what it makes, its art, seconds, and the
     slots/speed ladders every station of that size shares. */
  const ONE = [1, 2, 3], TWO = [2, 3, 4];
  const COOK_SPEED = [1, 0.82, 0.68], POUR_SPEED = [1, 0.8, 0.62];
  function cook(id, makes, art, secs, burn, big) {
    return { id: id, type: 'cook', makes: makes, art: art, cook: secs, burn: burn, slots: big ? TWO : ONE, speed: COOK_SPEED };
  }
  function pour(id, makes, art, secs) {
    return { id: id, type: 'drink', makes: makes, art: art, fill: secs, slots: ONE, speed: POUR_SPEED };
  }
  const dish = (parts, price, at) => ({ parts: parts, price: price, at: at });

  const TRUCKS = [
    {
      key: 'pasta', price: 0,
      stations: [
        cook('pot', 'pasta', 'pot', 4.5, 8, true),
        cook('pan', 'whitesauce', 'pan', 3.5, 4),
        cook('skillet', 'meatball', 'pan', 4.5, 6),
        cook('garlicoven', 'garlicbread', 'oven', 4.5, 7),
        pour('espresso', 'coffee', 'espresso', 3)
      ],
      bins: ['redsauce', 'parmesan', 'olives', 'basil'],
      menu: [
        dish(['pasta', 'redsauce'], 10, 1),
        dish(['coffee'], 6, 2),
        dish(['pasta', 'redsauce', 'parmesan'], 14, 4),
        dish(['pasta', 'whitesauce'], 14, 6),
        dish(['pasta', 'whitesauce', 'parmesan'], 18, 8),
        dish(['pasta', 'redsauce', 'olives'], 16, 10),
        dish(['pasta', 'redsauce', 'parmesan', 'olives'], 21, 12),
        dish(['pasta', 'whitesauce', 'basil'], 19, 14),
        dish(['pasta', 'redsauce', 'parmesan', 'basil'], 22, 16),
        dish(['pasta', 'whitesauce', 'parmesan', 'olives', 'basil'], 27, 18),
        dish(['pasta', 'redsauce', 'meatball'], 18, 21),
        dish(['garlicbread'], 7, 24),
        dish(['pasta', 'redsauce', 'meatball', 'parmesan'], 23, 27),
        dish(['pasta', 'redsauce', 'meatball', 'parmesan', 'basil'], 28, 31)
      ]
    },
    {
      key: 'burger', price: 2500,
      stations: [
        cook('grill', 'patty', 'grill', 5, 6.5, true),
        cook('bacongrill', 'bacon', 'griddle', 4, 5),
        cook('fryer', 'fries', 'fryer', 4, 8),
        pour('fountain', 'soda', 'fountain', 2.5),
        pour('blender', 'milkshake', 'blender', 3.5)
      ],
      bins: ['bun', 'cheddar', 'lettuce', 'tomato', 'onion'],
      menu: [
        dish(['bun', 'patty'], 10, 1),
        dish(['bun', 'patty', 'cheddar'], 14, 2),
        dish(['fries'], 6, 3),
        dish(['soda'], 5, 5),
        dish(['bun', 'patty', 'lettuce'], 14, 7),
        dish(['bun', 'patty', 'cheddar', 'tomato'], 18, 9),
        dish(['bun', 'patty', 'lettuce', 'tomato'], 18, 11),
        dish(['bun', 'patty', 'cheddar', 'onion'], 18, 13),
        dish(['bun', 'patty', 'cheddar', 'lettuce', 'tomato'], 24, 15),
        dish(['bun', 'patty', 'cheddar', 'onion', 'tomato', 'lettuce'], 28, 17),
        dish(['bun', 'patty', 'bacon'], 17, 21),
        dish(['milkshake'], 7, 24),
        dish(['bun', 'patty', 'bacon', 'cheddar'], 21, 27),
        dish(['bun', 'patty', 'bacon', 'cheddar', 'lettuce', 'tomato'], 30, 31)
      ]
    },
    {
      key: 'pizza', price: 5000,
      stations: [
        cook('oven', 'pizza', 'oven', 6, 7, true),
        cook('wingfryer', 'wings', 'fryer', 5, 7),
        cook('garlicoven', 'garlicbread', 'oven', 4.5, 7),
        pour('jug', 'lemonade', 'jug', 3)
      ],
      bins: ['pepperoni', 'ham', 'mushroom', 'pineapple', 'pepper', 'olives', 'basil'],
      menu: [
        dish(['pizza', 'pepperoni'], 12, 1),
        dish(['pizza'], 9, 2),
        dish(['lemonade'], 5, 3),
        dish(['pizza', 'mushroom'], 12, 4),
        dish(['pizza', 'pepperoni', 'mushroom'], 17, 6),
        dish(['wings'], 8, 8),
        dish(['pizza', 'pepper', 'olives'], 17, 10),
        dish(['pizza', 'pepperoni', 'pepper'], 17, 12),
        dish(['pizza', 'mushroom', 'olives', 'basil'], 22, 14),
        dish(['pizza', 'pepperoni', 'mushroom', 'pepper', 'olives'], 26, 16),
        dish(['pizza', 'ham', 'pineapple'], 17, 21),
        dish(['garlicbread'], 7, 24),
        dish(['pizza', 'ham', 'mushroom', 'olives'], 22, 27),
        dish(['pizza', 'pepperoni', 'ham', 'pineapple', 'pepper'], 27, 31)
      ]
    },
    {
      key: 'taco', price: 8000,
      stations: [
        cook('grill', 'beef', 'grill', 4.5, 6, true),
        cook('plancha', 'chicken', 'pan', 4, 5),
        cook('chipfryer', 'nachos', 'fryer', 3.5, 7),
        cook('churrofryer', 'churros', 'fryer', 4, 7),
        pour('urn', 'horchata', 'urn', 2.8)
      ],
      bins: ['shell', 'salsa', 'jack', 'lettuce', 'guac', 'jalapeno'],
      menu: [
        dish(['shell', 'beef', 'salsa'], 12, 1),
        dish(['shell', 'beef', 'jack'], 12, 2),
        dish(['horchata'], 5, 3),
        dish(['shell', 'beef', 'salsa', 'jack'], 16, 4),
        dish(['nachos'], 7, 5),
        dish(['shell', 'chicken', 'lettuce'], 14, 7),
        dish(['shell', 'chicken', 'salsa', 'jack'], 18, 9),
        dish(['shell', 'beef', 'guac'], 16, 11),
        dish(['shell', 'chicken', 'lettuce', 'guac'], 20, 13),
        dish(['shell', 'beef', 'salsa', 'jack', 'guac'], 24, 15),
        dish(['shell', 'chicken', 'salsa', 'jack', 'lettuce', 'guac'], 28, 17),
        dish(['shell', 'beef', 'salsa', 'jalapeno'], 18, 21),
        dish(['churros'], 7, 24),
        dish(['shell', 'chicken', 'guac', 'jalapeno'], 21, 27),
        dish(['shell', 'beef', 'salsa', 'jack', 'guac', 'jalapeno'], 30, 31)
      ]
    },
    {
      key: 'sushi', price: 12000,
      stations: [
        cook('ricer', 'rice', 'ricer', 5, 12, true),
        cook('soup', 'miso', 'pot', 4, 8),
        cook('tempurafryer', 'tempura', 'fryer', 4, 5.5),
        cook('edamamepot', 'edamame', 'pot', 3.5, 9),
        pour('kettle', 'tea', 'kettle', 2.5)
      ],
      bins: ['salmon', 'tuna', 'cucumber', 'avocado', 'roe'],
      menu: [
        dish(['rice', 'salmon'], 12, 1),
        dish(['rice', 'tuna'], 12, 2),
        dish(['tea'], 5, 3),
        dish(['miso'], 8, 4),
        dish(['rice', 'salmon', 'avocado'], 16, 6),
        dish(['rice', 'tuna', 'cucumber'], 15, 8),
        dish(['rice', 'salmon', 'roe'], 18, 10),
        dish(['rice', 'tuna', 'avocado', 'cucumber'], 20, 12),
        dish(['rice', 'salmon', 'avocado', 'roe'], 23, 14),
        dish(['rice', 'salmon', 'cucumber', 'avocado', 'roe'], 27, 16),
        dish(['rice', 'tempura'], 16, 21),
        dish(['edamame'], 6, 24),
        dish(['rice', 'tempura', 'avocado'], 20, 27),
        dish(['rice', 'tempura', 'avocado', 'cucumber', 'roe'], 29, 31)
      ]
    },
    {
      key: 'hotdog', price: 15000,
      stations: [
        cook('roller', 'sausage', 'roller', 4.5, 6, true),
        cook('ringfryer', 'onionrings', 'fryer', 4, 7),
        pour('fountain', 'soda', 'fountain', 2.5)
      ],
      bins: ['hdbun', 'ketchup', 'mustard', 'relish', 'onion', 'cheesesauce'],
      menu: [
        dish(['hdbun', 'sausage'], 10, 1),
        dish(['hdbun', 'sausage', 'ketchup'], 12, 2),
        dish(['soda'], 5, 3),
        dish(['hdbun', 'sausage', 'mustard'], 12, 5),
        dish(['onionrings'], 7, 7),
        dish(['hdbun', 'sausage', 'ketchup', 'mustard'], 16, 9),
        dish(['hdbun', 'sausage', 'relish'], 13, 12),
        dish(['hdbun', 'sausage', 'cheesesauce'], 15, 15),
        dish(['hdbun', 'sausage', 'ketchup', 'onion'], 16, 18),
        dish(['hdbun', 'sausage', 'mustard', 'relish', 'onion'], 21, 21),
        dish(['hdbun', 'sausage', 'cheesesauce', 'onion', 'ketchup'], 23, 25),
        dish(['hdbun', 'sausage', 'ketchup', 'mustard', 'relish', 'onion'], 26, 29)
      ]
    },
    {
      key: 'sandwich', price: 17500,
      stations: [
        cook('press', 'toast', 'press', 4, 5, true),
        cook('eggpan', 'egg', 'pan', 3.5, 4.5),
        cook('souppot', 'tomsoup', 'pot', 4.5, 8),
        pour('juicer', 'oj', 'jug', 2.8)
      ],
      bins: ['ham', 'cheddar', 'lettuce', 'tomato', 'avocado'],
      menu: [
        dish(['toast', 'ham'], 11, 1),
        dish(['toast', 'cheddar'], 10, 2),
        dish(['oj'], 6, 3),
        dish(['toast', 'ham', 'cheddar'], 15, 5),
        dish(['tomsoup'], 8, 7),
        dish(['toast', 'egg'], 13, 9),
        dish(['toast', 'egg', 'cheddar'], 16, 12),
        dish(['toast', 'ham', 'lettuce', 'tomato'], 18, 15),
        dish(['toast', 'egg', 'avocado'], 18, 18),
        dish(['toast', 'ham', 'egg', 'cheddar'], 21, 21),
        dish(['toast', 'egg', 'avocado', 'tomato'], 22, 25),
        dish(['toast', 'ham', 'egg', 'cheddar', 'lettuce', 'tomato'], 29, 29)
      ]
    },
    {
      key: 'breakfast', price: 20000,
      stations: [
        cook('griddle', 'pancake', 'griddle', 4.5, 5.5, true),
        cook('bacongrill', 'bacon', 'griddle', 4, 5),
        cook('eggpan', 'egg', 'pan', 3.5, 4.5),
        cook('hashfryer', 'hashbrown', 'fryer', 4, 7),
        pour('espresso', 'coffee', 'espresso', 3)
      ],
      bins: ['butter', 'syrup', 'blueberry', 'banana'],
      menu: [
        dish(['pancake', 'syrup'], 10, 1),
        dish(['pancake', 'butter'], 10, 2),
        dish(['coffee'], 6, 3),
        dish(['pancake', 'butter', 'syrup'], 14, 5),
        dish(['pancake', 'bacon'], 14, 7),
        dish(['hashbrown'], 7, 9),
        dish(['pancake', 'bacon', 'syrup'], 17, 12),
        dish(['pancake', 'egg', 'bacon'], 19, 15),
        dish(['pancake', 'butter', 'blueberry', 'syrup'], 19, 18),
        dish(['pancake', 'egg', 'bacon', 'syrup'], 22, 21),
        dish(['pancake', 'banana', 'blueberry', 'syrup'], 20, 25),
        dish(['pancake', 'butter', 'egg', 'bacon', 'syrup'], 27, 29)
      ]
    },
    {
      key: 'waffle', price: 22500,
      stations: [
        cook('iron', 'waffle', 'iron', 4.5, 5, true),
        pour('blender', 'milkshake', 'blender', 3.5),
        pour('cocoapot', 'cocoa', 'urn', 3)
      ],
      bins: ['syrup', 'cream', 'strawberry', 'banana', 'choc'],
      menu: [
        dish(['waffle', 'syrup'], 10, 1),
        dish(['waffle', 'cream'], 11, 2),
        dish(['milkshake'], 7, 3),
        dish(['waffle', 'cream', 'syrup'], 15, 5),
        dish(['waffle', 'cream', 'strawberry'], 16, 7),
        dish(['waffle', 'banana', 'choc'], 16, 9),
        dish(['cocoa'], 6, 12),
        dish(['waffle', 'strawberry', 'choc'], 16, 15),
        dish(['waffle', 'cream', 'banana', 'choc'], 21, 18),
        dish(['waffle', 'cream', 'strawberry', 'banana'], 21, 21),
        dish(['waffle', 'strawberry', 'banana', 'syrup'], 21, 25),
        dish(['waffle', 'cream', 'strawberry', 'banana', 'choc'], 27, 29)
      ]
    },
    {
      key: 'icecream', price: 25000,
      stations: [
        cook('fudgepan', 'hotfudge', 'pan', 3, 4),
        pour('blender', 'milkshake', 'blender', 3.5)
      ],
      bins: ['cone', 'vanilla', 'chocscoop', 'strawscoop', 'sprinkles', 'cherry'],
      menu: [
        dish(['cone', 'vanilla'], 8, 1),
        dish(['cone', 'chocscoop'], 8, 2),
        dish(['milkshake'], 7, 3),
        dish(['cone', 'strawscoop'], 8, 4),
        dish(['cone', 'vanilla', 'sprinkles'], 11, 6),
        dish(['cone', 'chocscoop', 'hotfudge'], 13, 9),
        dish(['cone', 'vanilla', 'chocscoop'], 14, 12),
        dish(['cone', 'strawscoop', 'cherry'], 12, 14),
        dish(['cone', 'vanilla', 'hotfudge', 'cherry'], 17, 17),
        dish(['cone', 'vanilla', 'strawscoop', 'sprinkles'], 18, 21),
        dish(['cone', 'chocscoop', 'strawscoop', 'hotfudge'], 20, 25),
        dish(['cone', 'vanilla', 'chocscoop', 'hotfudge', 'cherry'], 24, 29),
        dish(['cone', 'vanilla', 'chocscoop', 'strawscoop', 'sprinkles', 'cherry'], 28, 33)
      ]
    },
    {
      key: 'bbq', price: 27500,
      stations: [
        cook('grill', 'steak', 'grill', 5.5, 6, true),
        cook('smoker', 'ribs', 'smoker', 6.5, 8),
        cook('cornpot', 'corn', 'pot', 4, 9),
        pour('teajug', 'icedtea', 'jug', 3)
      ],
      bins: ['bbqsauce', 'beans', 'coleslaw', 'pickle'],
      menu: [
        dish(['steak', 'bbqsauce'], 12, 1),
        dish(['steak', 'coleslaw'], 12, 2),
        dish(['icedtea'], 5, 3),
        dish(['steak', 'bbqsauce', 'pickle'], 16, 5),
        dish(['corn'], 7, 7),
        dish(['ribs', 'bbqsauce'], 16, 9),
        dish(['ribs', 'coleslaw', 'pickle'], 19, 12),
        dish(['steak', 'bbqsauce', 'beans'], 18, 15),
        dish(['ribs', 'bbqsauce', 'beans'], 20, 18),
        dish(['steak', 'bbqsauce', 'coleslaw', 'pickle'], 22, 21),
        dish(['ribs', 'bbqsauce', 'coleslaw', 'beans'], 25, 25),
        dish(['steak', 'bbqsauce', 'beans', 'coleslaw', 'pickle'], 28, 29)
      ]
    },
    {
      key: 'falafel', price: 30000,
      stations: [
        cook('falafelfryer', 'falafel', 'fryer', 4, 6, true),
        cook('spit', 'shawarma', 'spit', 5, 7),
        cook('fryer', 'fries', 'fryer', 4, 8),
        pour('kettle', 'minttea', 'kettle', 2.8)
      ],
      bins: ['pita', 'hummus', 'tomato', 'lettuce', 'pickle', 'tahini'],
      menu: [
        dish(['pita', 'falafel'], 11, 1),
        dish(['pita', 'falafel', 'hummus'], 14, 2),
        dish(['minttea'], 5, 3),
        dish(['pita', 'falafel', 'tomato'], 14, 5),
        dish(['fries'], 6, 7),
        dish(['pita', 'shawarma'], 13, 9),
        dish(['pita', 'shawarma', 'tahini'], 16, 12),
        dish(['pita', 'falafel', 'hummus', 'lettuce'], 18, 15),
        dish(['pita', 'shawarma', 'tomato', 'pickle'], 19, 18),
        dish(['pita', 'falafel', 'hummus', 'tomato', 'tahini'], 23, 21),
        dish(['pita', 'shawarma', 'lettuce', 'tomato', 'tahini'], 24, 25),
        dish(['pita', 'shawarma', 'hummus', 'lettuce', 'pickle', 'tahini'], 29, 29)
      ]
    },
    {
      key: 'wok', price: 30000,
      stations: [
        cook('noodlepot', 'noodles', 'pot', 4.5, 7, true),
        cook('wok', 'shrimp', 'wok', 3.5, 4.5),
        cook('steamer', 'dumplings', 'steamer', 5, 9),
        pour('bobajug', 'bubbletea', 'jug', 3)
      ],
      bins: ['tofu', 'bokchoy', 'soysauce', 'chili', 'scallion'],
      menu: [
        dish(['noodles', 'soysauce'], 10, 1),
        dish(['noodles', 'bokchoy'], 11, 2),
        dish(['bubbletea'], 7, 3),
        dish(['noodles', 'soysauce', 'scallion'], 14, 5),
        dish(['dumplings'], 8, 7),
        dish(['noodles', 'shrimp'], 15, 9),
        dish(['noodles', 'shrimp', 'soysauce'], 18, 12),
        dish(['noodles', 'tofu', 'bokchoy'], 16, 15),
        dish(['noodles', 'shrimp', 'bokchoy', 'scallion'], 22, 18),
        dish(['noodles', 'tofu', 'chili', 'scallion'], 20, 21),
        dish(['noodles', 'shrimp', 'soysauce', 'chili'], 22, 25),
        dish(['noodles', 'shrimp', 'tofu', 'bokchoy', 'scallion'], 28, 29)
      ]
    },
    {
      key: 'bakery', price: 32500,
      stations: [
        cook('cakeoven', 'cupcake', 'oven', 5.5, 6, true),
        cook('croissantoven', 'croissant', 'oven', 5, 7),
        pour('espresso', 'latte', 'espresso', 3.2)
      ],
      bins: ['icing', 'chocicing', 'sprinkles', 'cherry', 'blueberry'],
      menu: [
        dish(['cupcake', 'icing'], 10, 1),
        dish(['cupcake', 'chocicing'], 10, 2),
        dish(['latte'], 6, 3),
        dish(['cupcake', 'icing', 'sprinkles'], 13, 5),
        dish(['croissant'], 7, 7),
        dish(['cupcake', 'chocicing', 'cherry'], 14, 9),
        dish(['cupcake', 'icing', 'blueberry'], 14, 12),
        dish(['cupcake', 'chocicing', 'sprinkles', 'cherry'], 18, 15),
        dish(['cupcake', 'icing', 'cherry', 'blueberry'], 18, 18),
        dish(['cupcake', 'chocicing', 'blueberry', 'sprinkles'], 19, 21),
        dish(['cupcake', 'icing', 'sprinkles', 'cherry'], 18, 25),
        dish(['cupcake', 'icing', 'sprinkles', 'cherry', 'blueberry'], 24, 29)
      ]
    },
    {
      key: 'cafe', price: 32500,
      stations: [
        cook('brewer', 'shot', 'brewer', 3.5, 6, true),
        cook('muffinoven', 'muffin', 'oven', 5, 7),
        pour('juicer', 'oj', 'jug', 2.8)
      ],
      bins: ['milk', 'caramel', 'choc', 'cream', 'cinnamon'],
      menu: [
        dish(['shot', 'milk'], 10, 1),
        dish(['shot'], 7, 2),
        dish(['muffin'], 7, 3),
        dish(['shot', 'milk', 'caramel'], 14, 5),
        dish(['shot', 'milk', 'choc'], 14, 7),
        dish(['shot', 'cream'], 12, 9),
        dish(['oj'], 6, 12),
        dish(['shot', 'milk', 'cinnamon'], 14, 15),
        dish(['shot', 'milk', 'caramel', 'cream'], 19, 18),
        dish(['shot', 'milk', 'choc', 'cream'], 19, 21),
        dish(['shot', 'milk', 'choc', 'cinnamon'], 19, 25),
        dish(['shot', 'milk', 'caramel', 'choc', 'cream'], 24, 29),
        dish(['shot', 'milk', 'caramel', 'cream', 'cinnamon'], 24, 33)
      ]
    },
    {
      key: 'ramen', price: 35000,
      stations: [
        cook('ramenpot', 'ramen', 'pot', 5, 8, true),
        cook('eggpot', 'softegg', 'pot', 4, 9),
        cook('grill', 'chashu', 'grill', 4.5, 5.5),
        cook('steamer', 'dumplings', 'steamer', 5, 9),
        pour('kettle', 'tea', 'kettle', 2.5)
      ],
      bins: ['nori', 'scallion', 'sweetcorn', 'chili'],
      menu: [
        dish(['ramen', 'scallion'], 11, 1),
        dish(['ramen', 'nori'], 11, 2),
        dish(['tea'], 5, 3),
        dish(['ramen', 'nori', 'scallion'], 14, 5),
        dish(['ramen', 'chashu'], 15, 7),
        dish(['dumplings'], 8, 9),
        dish(['ramen', 'softegg'], 15, 12),
        dish(['ramen', 'chashu', 'scallion'], 18, 15),
        dish(['ramen', 'softegg', 'sweetcorn'], 18, 18),
        dish(['ramen', 'chashu', 'softegg', 'nori'], 23, 21),
        dish(['ramen', 'chashu', 'chili', 'scallion'], 21, 25),
        dish(['ramen', 'softegg', 'sweetcorn', 'nori', 'scallion'], 25, 29),
        dish(['ramen', 'chashu', 'softegg', 'nori', 'scallion'], 28, 33)
      ]
    },
    {
      key: 'nashville', price: 35000,
      stations: [
        cook('chickenfryer', 'hotchicken', 'fryer', 5, 6, true),
        cook('fryer', 'fries', 'fryer', 4, 8),
        pour('jug', 'lemonade', 'jug', 3)
      ],
      bins: ['brioche', 'pickle', 'coleslaw', 'hotsauce', 'honey'],
      menu: [
        dish(['brioche', 'hotchicken'], 12, 1),
        dish(['brioche', 'hotchicken', 'pickle'], 14, 2),
        dish(['lemonade'], 5, 3),
        dish(['brioche', 'hotchicken', 'hotsauce'], 15, 5),
        dish(['fries'], 6, 7),
        dish(['brioche', 'hotchicken', 'coleslaw'], 16, 9),
        dish(['brioche', 'hotchicken', 'honey'], 16, 12),
        dish(['brioche', 'hotchicken', 'pickle', 'hotsauce'], 18, 15),
        dish(['brioche', 'hotchicken', 'coleslaw', 'honey'], 20, 18),
        dish(['brioche', 'hotchicken', 'pickle', 'coleslaw', 'hotsauce'], 24, 21),
        dish(['brioche', 'hotchicken', 'hotsauce', 'honey', 'pickle'], 24, 25),
        dish(['brioche', 'hotchicken', 'pickle', 'coleslaw', 'hotsauce', 'honey'], 29, 29)
      ]
    }
  ];

  PV.ChefMenu = { PARTS: PARTS, TRUCKS: TRUCKS };

})(window.PV);
