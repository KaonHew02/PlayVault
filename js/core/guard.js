/* PlayVault — the lock.

   A friend who writes code opened the developer tools on this page and
   changed the game from there. This file is what stands in the way now, and
   the first thing to say about it is what it cannot be. A browser cannot run
   code it has not been given, so every line of PlayVault is on the machine
   that plays it, and the developer tools can pause it, read it and rewrite
   it; SECURITY.md says so at length. What CAN be done is to make every way
   in that the console offers lead nowhere, and to put back whatever the
   Elements panel changes. That is this file.

   On the published site it does five things, all before any other script
   on the page has run. Never on localhost, where the console is the
   developer's own tool: add `?guard` to the address to try it there.

   1. THE NAMESPACE IS NOT A GLOBAL. Everything the app is hangs off one
      object, PV: every save, every store, the profile, the running game.
      While the page loads, `window.PV` answers only to this site's own
      scripts; once it has loaded it answers nobody. Every module took its
      own reference as it loaded, so the game carries on, and the console
      finds `PV` undefined — and with it every function that writes a save.
   2. THE STORAGE ANSWERS ONLY TO US. localStorage and sessionStorage, and
      every method on them, refuse a caller that is not this site's code.
   3. THE PAGE IS OURS. Every way a script can change what is on screen — an
      attribute, a class, a style, some text, a node added or taken away, a
      button pressed, a listener added — is wrapped. Asked by this site's own
      scripts it works as it always did; asked by anything else, it throws.
      Reading is left alone: the Elements panel shows all of it anyway.
   4. WHAT CHANGES ANYWAY IS PUT BACK. The Elements panel does not go through
      any script, so nothing in (3) sees it. A MutationObserver does: a change
      to the page that none of this site's own calls made — a number typed
      over, a `disabled` taken off, a node deleted, a class added to show
      something hidden — is undone the moment it lands.
   5. THE LANGUAGE IS FROZEN. Math.random, JSON, Date, performance.now,
      requestAnimationFrame, the 2D canvas, WebGL and the rest cannot be
      replaced, so nothing pasted in can rig a crate, slow the clock down to
      beat a level, catch a save on its way through a built-in, or switch off
      Strike Squad's walls.

   Then three speed bumps, which are only that: F12 and the DevTools keys do
   nothing, the right-click menu does not open, and the console opens on a
   warning. The browser's own menu still opens the developer tools.

   WHO ASKED is read off the call stack, as GameTable's lock does: the first
   frame that is not this file and not a built-in is the caller. Code typed
   into a console has no address (Chrome prints `<anonymous>:1:5`, Firefox
   `debugger eval code`), and a DOM method handed to a timer from the console
   has no caller at all; both are refused. PlayVault never hands a DOM method
   to a timer, which is what makes the second rule safe — keep it that way.
   And this file is loaded on its own, in the head, never inside the bundle:
   the bundle is one address for every script, and this file's own frames
   would look like everybody's.

   What still gets through, honestly. A breakpoint: paused inside one of
   PlayVault's functions, the console can change that function's variables.
   Local Overrides: the Sources panel can serve an edited copy of any file,
   this one included. A stylesheet rule edited in the Styles pane. And every
   other page on the same origin — every site under kaonhew02.github.io is
   one origin, with one localStorage between them. Those belong to the
   browser, and nothing a page runs can switch them off. What is gone is the
   cheap cheat: a line pasted into the console, or a number typed over in the
   Elements panel. */
(function (root) {
  'use strict';

  const O = Object, R = Reflect;
  const freeze = O.freeze, gopd = O.getOwnPropertyDescriptor, define = O.defineProperty;
  const protoOf = O.getPrototypeOf, namesOf = O.getOwnPropertyNames, keysOf = R.ownKeys, apply = R.apply;
  const Err = Error, TypeErr = TypeError, ProxyC = Proxy, clock = Date.now;

  const MESSAGE = 'PlayVault is locked: the console cannot change this page, its games or its saves.';

  const doc = typeof document !== 'undefined' ? document : null;
  const loc = typeof location !== 'undefined' ? location : null;
  const log = typeof console !== 'undefined' ? console : null;

  /* Where this site's scripts live, read off this file's own address, so a
     copy served from anywhere — GitHub Pages, localhost — knows its own. */
  const OWN = /js\/core\/guard\.js(?:[?#].*)?$/;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || '';
  const BASE = OWN.test(SELF) ? SELF.replace(OWN, '') : '';
  /* The two scripts from elsewhere that call back into ours: PeerJS, for
     playing with friends, and Google's sign-in, for the Drive copy. */
  const TRUSTED = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/', 'https://accounts.google.com/gsi/'];

  /** On for the published site. Off on this machine, unless `?guard` asks. */
  function wanted(l) {
    if (!l) return false;
    if (/[?&]guard(?:[=&]|$)/.test(l.search || '')) return true;
    const host = String(l.hostname || '').toLowerCase();
    return !(l.protocol === 'file:' || host === 'localhost' || /\.localhost$/.test(host)
      || /^127(?:\.\d{1,3}){3}$/.test(host) || host === '[::1]' || host === '::1');
  }

  /* -------------------------------------------------------------- who asked */

  /* A frame of code that was typed or pasted rather than loaded: Chrome's
     console and eval, Firefox's console and eval, Safari's console. */
  const PASTED = /<anonymous>:\d|\bVM\d+:\d|debugger eval code|> eval\b|> Function\b|\beval at\b|evaluateWithScopeExtension|_wrapCall/;
  const URL_IN = /[a-z][a-z0-9+.-]*:\/\/[^\s)]+/i;

  /**
   * Was this asked for by a stranger? Skip this file's own frames and the
   * engine's built-ins (Array.forEach, Reflect.apply — no address), and judge
   * the first frame that has one. No such frame means nothing of ours asked.
   * A stack that cannot be read at all is let through: a lock that broke the
   * game in some browser would be worse than no lock.
   */
  function stranger(stack, base, self, trusted) {
    if (typeof stack !== 'string' || !base) return false;
    const lines = stack.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (PASTED.test(line)) return true;
      const m = URL_IN.exec(line);
      if (!m) continue;
      const url = m[0];
      if (self && url.startsWith(self)) continue;
      if (url.startsWith(base)) return false;
      for (const t of trusted || TRUSTED) if (url.startsWith(t)) return false;
      return true;
    }
    return true;
  }

  const stackOf = (() => {
    const d = gopd(Err.prototype, 'stack');          // Firefox keeps it here
    return d && d.get ? e => apply(d.get, e, []) : e => e.stack;
  })();

  function asked() {
    let s;
    try { s = stackOf(new Err()); } catch (e) { return false; }
    return stranger(s, BASE, SELF, TRUSTED);
  }

  /**
   * Can this browser's stacks be read the way stranger() reads them? The
   * test is this file's own frame: the first address on a stack taken here
   * must be this file's, query and all. Chrome, Firefox and Safari all write
   * it so; a browser that wrote it some other way would have every one of
   * PlayVault's own calls refused, and a lock that broke the game would be
   * worse than no lock.
   */
  function readsItself(stack, self) {
    if (typeof stack !== 'string' || !self) return false;
    const lines = stack.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = URL_IN.exec(lines[i]);
      if (m) return m[0].startsWith(self);
    }
    return false;
  }

  /* So it is on only for the published site (or `?guard`), only with an
     address of its own — none means this file was bundled, or loaded from
     somewhere it does not expect, and it could not tell its own frames from
     anybody else's — and only where it can read its own stack. */
  const ON = !!(doc && BASE && wanted(loc) && (() => {
    try { return readsItself(stackOf(new Err()), SELF); } catch (e) { return false; }
  })());

  /* ---------------------------------------------------- 1. the namespace */

  let shut = false;                  // the page has loaded: PV answers nobody

  /* Every file opens with `window.PV = window.PV || {}` and hands PV to its
     own closure. So the one object is handed out while the files load, to
     them and nobody else, and the setter takes nothing but itself back. */
  function hide() {
    const ns = {};
    const had = gopd(root, 'PV');
    if (had && !had.configurable) throw new Err('window.PV was claimed before the lock');
    define(root, 'PV', {
      configurable: false, enumerable: false,
      get() { return shut || asked() ? undefined : ns; },
      set(v) { if (v !== ns || shut || asked()) throw new TypeErr(MESSAGE); }
    });
    return ns;
  }

  /* ------------------------------------------------------------ 2. storage */

  function lockStorage() {
    for (const name of ['localStorage', 'sessionStorage']) {
      let d = null;
      for (let o = root; o && !d; o = protoOf(o)) d = gopd(o, name);
      if (!d || !d.get) continue;
      const get = d.get;
      define(root, name, {
        configurable: false, enumerable: d.enumerable,
        get() { if (asked()) throw new TypeErr(MESSAGE); return apply(get, root, []); }
      });
    }
    const SP = root.Storage && root.Storage.prototype;
    if (!SP) return;
    for (const key of keysOf(SP)) {
      if (key === 'constructor' || typeof key !== 'string') continue;
      const d = gopd(SP, key);
      if (!d || !d.configurable) continue;
      if (typeof d.value === 'function') {
        const fn = d.value;
        define(SP, key, {
          configurable: true, enumerable: d.enumerable, writable: d.writable,
          value: function () { if (asked()) throw new TypeErr(MESSAGE); return apply(fn, this, arguments); }
        });
      } else if (d.get) {
        const get = d.get;
        define(SP, key, {
          configurable: true, enumerable: d.enumerable,
          get() { if (asked()) throw new TypeErr(MESSAGE); return apply(get, this, []); }
        });
      }
    }
  }

  /* ----------------------------------------------------------- 3. the page */

  const NodeC = root.Node, AttrC = root.Attr;
  const owners = new WeakMap();      // a style, a class list, an attribute map -> its element
  let isConnected = null, ownerElement = null;

  /** Is this on screen, or part of something that is? */
  function live(x) {
    if (x === root || x === doc) return true;
    if (x === null || typeof x !== 'object') return false;
    const owner = owners.get(x);
    if (owner !== undefined) return live(owner);
    if (NodeC && x instanceof NodeC) {
      try { if (apply(isConnected, x, [])) return true; } catch (e) { return false; }
      if (AttrC && x instanceof AttrC) {
        let el = null;
        try { el = apply(ownerElement, x, []); } catch (e) { /* not really an attribute */ }
        return el ? live(el) : false;
      }
      return false;
    }
    return true;      // a range, a selection, a style sheet: no owner we know, so assume it is shown
  }

  /* Nodes that are not on screen are left alone, because that is where every
     screen is built, and nobody else can reach them until one of ours puts
     them there. So building a screen costs nothing, and only a change to
     what is showing reads the stack. */
  function check(x) {
    if (live(x) && asked()) throw new TypeErr(MESSAGE);
  }

  /** One change to the page, made by this site: checked, and then kept. */
  function change(fn, self, args) {
    check(self);
    return quiet(fn, self, args);
  }

  /** A change let through without reading the stack: see SAME. Still kept
      and accounted for, so the put-back never mistakes it for a stranger's. */
  function quiet(fn, self, args) {
    flush();
    try { return apply(fn, self, args); } finally { drain(); }
  }

  /* Writes that change nothing — a panel hidden that is already hidden, a
     label given the text it already shows, a class toggled into the state
     it is already in — happen every frame in some games, and there is
     nothing in them to protect. Reading the stack costs tens of
     microseconds, so they skip it. Measured, this is most of what a game
     asks of the lock in a frame. */
  const SAME = ['hidden', 'disabled', 'className', 'title', 'textContent', 'checked'];

  function unchanged(get, self, key, v) {
    try {
      const now = apply(get, self, []);
      return key === 'textContent' ? now === (v == null ? '' : String(v)) : now === v;
    } catch (e) { return false; }
  }

  let nContains = null;              // DOMTokenList.prototype.contains, kept real

  function noTokenChange(key, self, args) {
    try {
      if (key === 'toggle') return args.length > 1 && !!args[1] === apply(nContains, self, [args[0]]);
      if (!args.length) return false;
      for (let i = 0; i < args.length; i++) {
        if (apply(nContains, self, [args[i]]) !== (key === 'add')) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  /* Getters that hand back a way of changing the element they came from.
     The handle remembers its element, so changing it is a change to a page
     that is showing only when the element is. */
  const HANDLES = ['style', 'classList', 'relList', 'attributes', 'dataset', 'part', 'attributeStyleMap'];

  /* Two handles need more than remembering. In Chrome a CSS property —
     `el.style.width = '10px'` — is not a setter on any prototype but a named
     property of the declaration itself, and every `el.dataset.x` is the
     same. Nothing on a prototype sees those, this site's own included, and
     a change this site makes that nothing saw would be put back as if a
     stranger had made it. So `style` and `dataset` hand out a stand-in that
     makes every change through change(), like every other way in. One per
     real object, so `el.style === el.style` still holds. */
  const STAND_IN = ['style', 'dataset'];
  const standIns = new WeakMap();

  function standIn(real, owner) {
    let p = standIns.get(real);
    if (p) return p;
    const via = (fn, still) => { let out = false; (still ? quiet : change)(() => { out = fn(); }, owner, []); return out; };
    p = new ProxyC(real, {
      get(t, k) {
        const v = R.get(t, k, t);
        return typeof v === 'function' ? function () { return apply(v, t, arguments); } : v;
      },
      // A value it already has changes nothing: no stack to read (see SAME).
      set: (t, k, v) => via(() => R.set(t, k, v, t), typeof v === 'string' && R.get(t, k, t) === v),
      deleteProperty: (t, k) => via(() => R.deleteProperty(t, k)),
      defineProperty: (t, k, d) => via(() => R.defineProperty(t, k, d))
    });
    standIns.set(real, p);
    owners.set(p, owner);
    return p;
  }

  /* Methods that only read. They are left as they were: reading is not what
     this guards, and some of them run many times a frame. Anything not
     named here is treated as a change, which costs a little and is never
     wrong. */
  const READS = [
    'contains', 'compareDocumentPosition', 'getRootNode', 'hasChildNodes', 'isEqualNode', 'isSameNode',
    'lookupPrefix', 'lookupNamespaceURI', 'isDefaultNamespace', 'cloneNode',
    'getAttribute', 'getAttributeNS', 'getAttributeNames', 'getAttributeNode', 'getAttributeNodeNS',
    'hasAttribute', 'hasAttributeNS', 'hasAttributes', 'getBoundingClientRect', 'getClientRects',
    'closest', 'matches', 'webkitMatchesSelector', 'querySelector', 'querySelectorAll',
    'getElementsByTagName', 'getElementsByTagNameNS', 'getElementsByClassName', 'checkVisibility',
    'computedStyleMap', 'getAnimations', 'hasPointerCapture', 'getHTML', 'getInnerHTML',
    'getElementById', 'getElementsByName', 'elementFromPoint', 'elementsFromPoint', 'caretPositionFromPoint',
    'caretRangeFromPoint', 'hasFocus', 'getSelection', 'queryCommandEnabled', 'queryCommandIndeterm',
    'queryCommandState', 'queryCommandSupported', 'queryCommandValue', 'hasStorageAccess',
    'createElement', 'createElementNS', 'createTextNode', 'createComment', 'createDocumentFragment',
    'createAttribute', 'createAttributeNS', 'createEvent', 'createRange', 'createTreeWalker',
    'createNodeIterator', 'createExpression', 'createNSResolver', 'evaluate', 'createProcessingInstruction',
    'createCDATASection', 'importNode',
    'getPropertyValue', 'getPropertyPriority', 'item', 'namedItem', 'getNamedItem', 'getNamedItemNS',
    'supports', 'entries', 'keys', 'values', 'forEach', 'toString', 'getRangeAt', 'containsNode',
    'cloneRange', 'cloneContents', 'compareBoundaryPoints', 'comparePoint', 'intersectsNode', 'isPointInRange',
    'createContextualFragment', 'substringData',
    'toDataURL', 'toBlob', 'captureStream', 'canPlayType', 'checkValidity', 'getBBox', 'getCTM',
    'getScreenCTM', 'getTotalLength', 'getPointAtLength', 'isPointInFill', 'isPointInStroke',
    'getComputedTextLength', 'getNumberOfChars', 'get', 'getAll', 'has'
  ];

  function wrap(proto) {
    const tokenList = !!root.DOMTokenList && proto === root.DOMTokenList.prototype;
    for (const key of keysOf(proto)) {
      if (key === 'constructor' || typeof key !== 'string') continue;
      const d = gopd(proto, key);
      if (!d || !d.configurable) continue;
      if (d.get || d.set) {
        const get = d.get, set = d.set;
        const handle = !!get && HANDLES.indexOf(key) >= 0;
        if (!set && !handle) continue;                 // a plain read: as it was
        const stand = handle && STAND_IN.indexOf(key) >= 0;
        const same = !!get && SAME.indexOf(key) >= 0;
        define(proto, key, {
          configurable: true, enumerable: d.enumerable,
          get: handle ? function () {
            const v = apply(get, this, []);
            if (v === null || typeof v !== 'object') return v;
            owners.set(v, this);
            return stand ? standIn(v, this) : v;
          } : get,
          set: !set ? undefined : same
            ? function (v) { if (unchanged(get, this, key, v)) quiet(set, this, [v]); else change(set, this, [v]); }
            : function (v) { change(set, this, [v]); }
        });
      } else if (typeof d.value === 'function' && READS.indexOf(key) < 0) {
        const fn = d.value;
        const tokens = tokenList && (key === 'toggle' || key === 'add' || key === 'remove');
        define(proto, key, {
          configurable: true, enumerable: d.enumerable, writable: d.writable,
          value: tokens
            ? function () { return noTokenChange(key, this, arguments) ? quiet(fn, this, arguments) : change(fn, this, arguments); }
            : function () { return change(fn, this, arguments); }
        });
      }
    }
  }

  const DOM = ['Node', 'Element', 'CharacterData', 'Text', 'Comment', 'Attr', 'NamedNodeMap', 'DOMTokenList',
    'CSSStyleDeclaration', 'CSS2Properties', 'CSSStyleProperties', 'StylePropertyMap', 'Document', 'HTMLDocument',
    'DocumentFragment', 'ShadowRoot', 'AbstractRange', 'Range', 'StaticRange', 'Selection', 'StyleSheet',
    'CSSStyleSheet', 'CSSRule', 'CSSStyleRule'];

  function domNames() {
    const out = DOM.slice();
    for (const k of namesOf(root)) if (/^(HTML|SVG|MathML)\w*Element$/.test(k)) out.push(k);
    return out.filter(n => typeof root[n] === 'function' && root[n].prototype);
  }

  /**
   * A frozen prototype turns `obj.toString = f` on any object that inherits it
   * into an error — the "override mistake" — and PeerJS does exactly that to
   * `addEventListener` on RTCPeerConnection.prototype. So these few become an
   * accessor that hands back the original and lets an assignment make its own
   * property on whatever was assigned to, never on the prototype itself.
   */
  function tame(proto, key, value, guarded) {
    define(proto, key, {
      configurable: false, enumerable: false,
      get() { return value; },
      set(v) {
        if (this === proto) throw new TypeErr(MESSAGE);
        if (guarded) check(this);
        define(this, key, { value: v, writable: true, enumerable: true, configurable: true });
      }
    });
  }

  function installDom() {
    isConnected = gopd(NodeC.prototype, 'isConnected').get;
    ownerElement = AttrC ? gopd(AttrC.prototype, 'ownerElement').get : null;
    nContains = root.DOMTokenList ? root.DOMTokenList.prototype.contains : null;
    keepNatives();                    // the put-back needs the real ones

    for (const n of domNames()) wrap(root[n].prototype);

    /* A fresh window's untouched DOM methods would work on this page's
       nodes, so opening one is ours alone too. Google's sign-in opens its
       popup through here, and is let through by address. */
    const open = root.open;
    if (typeof open === 'function') {
      const d = gopd(root, 'open');
      define(root, 'open', {
        value: function () { check(root); return apply(open, root, arguments); },
        writable: false, enumerable: d ? d.enumerable : true, configurable: false
      });
    }

    /* Listening, unlistening and dispatching on what is on screen — and on
       the window and the document — are ours alone as well. */
    const ET = root.EventTarget && root.EventTarget.prototype;
    if (ET) {
      for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
        const fn = ET[k];
        if (typeof fn !== 'function') continue;
        tame(ET, k, function () {
          if (this === root || this === doc || (NodeC && this instanceof NodeC && live(this))) check(this);
          return apply(fn, this, arguments);
        }, true);
      }
    }
  }

  /* ------------------------------------------------------------ 4. put back */

  /* The real DOM methods, kept before anything is wrapped. The put-back runs
     from a MutationObserver, with none of this site's frames on the stack,
     so the wrapped ones would refuse it. */
  let MO = null, nTake = null, nObserve = null, nDisconnect = null, nInsert = null, nRemove = null;
  let nParent = null, nNext = null, nFirst = null, nSetAttr = null, nRemoveAttr = null, nData = null;
  let nBody = null, nQuery = null;

  function keepNatives() {
    MO = root.MutationObserver || null;
    if (!MO) return;
    const MP = MO.prototype, NP = NodeC.prototype, EP = root.Element.prototype;
    nTake = MP.takeRecords; nObserve = MP.observe; nDisconnect = MP.disconnect;
    nInsert = NP.insertBefore; nRemove = NP.removeChild;
    nParent = gopd(NP, 'parentNode').get; nNext = gopd(NP, 'nextSibling').get; nFirst = gopd(NP, 'firstChild').get;
    nSetAttr = EP.setAttributeNS; nRemoveAttr = EP.removeAttributeNS;
    nData = gopd(root.CharacterData.prototype, 'data').set;
    nBody = gopd(root.Document.prototype, 'body').get;
    nQuery = root.Document.prototype.querySelector;
  }

  let mo = null;                     // watching <body>, once the page has loaded
  let body = null;
  let tripped = false, burstAt = 0, burst = 0, toldAt = 0;
  const ours = new WeakSet();        // what this site put straight onto <body>

  /** What one of this site's own calls just did is not news: throw it away.
      Anything it put straight onto <body> is one of ours from then on. */
  function drain() {
    if (!mo) return;
    const recs = apply(nTake, mo, []);
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.type !== 'childList' || r.target !== body) continue;
      const added = r.addedNodes;
      for (let j = 0; j < added.length; j++) ours.add(added[j]);
    }
  }

  /** Anything already waiting when one of our calls begins is somebody else's. */
  function flush() {
    if (!mo) return;
    const recs = apply(nTake, mo, []);
    if (recs.length) putBack(recs);
  }

  const parentOf = n => apply(nParent, n, []);

  /** Inside what PlayVault draws — its header, its screens, its sheets? */
  function mine(node) {
    let n = node, top = null;
    while (n && n !== body) { top = n; n = parentOf(n); }
    return n === body && (top === null || ours.has(top));
  }

  /* A new `data-` attribute changes nothing the game reads — it is how an
     extension marks a text box it has noticed — and fighting one would only
     start a tug of war. `data-i18n` is the exception: the app reads it. */
  const MARK = /^data-(?!i18n)/;

  /* The browser's own page translation rewrites every line of text, which is
     the player asking for it, not cheating; Chrome marks <html> when it has. */
  const TRANSLATED = /\btranslated-(?:ltr|rtl)\b/;
  let longAt = 0, long = 0;

  function standDown(why) {
    tripped = true;
    try { apply(nDisconnect, mo, []); } catch (e) { /* already gone */ }
    if (log) log.warn('[PlayVault] ' + why + ', so changes to it are no longer put back.');
  }

  /**
   * Undo, newest first, everything in these records that happened inside
   * PlayVault's own part of the page. Something that keeps rewriting the
   * page — a translator, an extension — is not a person in the Elements
   * panel, and would only fight this for ever: after a burst of hundreds of
   * changes in a second, or a steady stream over ten, it is left to it and
   * the console says so. The page is only a picture of the game; what this
   * guards is that picture, never a save.
   */
  function putBack(recs) {
    if (tripped) return;
    // Only what lands in PlayVault's own part counts: an extension busy in
    // its own box is none of this file's business.
    const hits = [];
    for (let i = 0; i < recs.length; i++) if (mine(recs[i].target)) hits.push(recs[i]);
    if (!hits.length) return;
    const now = clock();
    const html = doc.documentElement;
    if (html && TRANSLATED.test(html.className)) { standDown('The browser has translated this page'); return; }
    if (now - burstAt > 1000) { burstAt = now; burst = 0; }
    if (now - longAt > 10000) { longAt = now; long = 0; }
    burst += hits.length;
    long += hits.length;
    if (burst > 300 || long > 600) { standDown('Something keeps rewriting this page'); return; }
    let put = 0;
    for (let i = hits.length - 1; i >= 0; i--) {
      const r = hits[i], tg = r.target;
      try {
        if (r.type === 'attributes') {
          if (r.oldValue === null && MARK.test(r.attributeName)) continue;
          if (r.oldValue === null) apply(nRemoveAttr, tg, [r.attributeNamespace, r.attributeName]);
          else apply(nSetAttr, tg, [r.attributeNamespace, r.attributeName, r.oldValue]);
        } else if (r.type === 'characterData') {
          apply(nData, tg, [r.oldValue]);
        } else if (r.type === 'childList') {
          const atBody = tg === body;
          const added = r.addedNodes, removed = r.removedNodes;
          // Straight onto <body> is where extensions put their own boxes; leave those.
          if (!atBody) {
            for (let j = added.length - 1; j >= 0; j--) if (parentOf(added[j]) === tg) apply(nRemove, tg, [added[j]]);
          }
          let ref = r.nextSibling;
          if (ref && parentOf(ref) !== tg) {
            const prev = r.previousSibling;
            ref = prev && parentOf(prev) === tg ? apply(nNext, prev, []) : (prev ? null : apply(nFirst, tg, []));
          }
          for (let j = 0; j < removed.length; j++) {
            const n = removed[j];
            if (atBody && !ours.has(n)) continue;
            if (parentOf(n) === null) apply(nInsert, tg, [n, ref]);
          }
        }
        put++;
      } catch (e) { /* a node that has moved on since: nothing to put back */ }
    }
    apply(nTake, mo, []);             // putting it back is not news either
    if (put && log && now - toldAt > 2000) {
      toldAt = now;
      log.warn('[PlayVault] A change made to this page from outside the game was put back.');
    }
  }

  /* From the moment the page has loaded — before that, the parser is still
     putting the page together, and none of that is anybody's cheating. */
  function watch() {
    if (!MO || mo) return;
    body = apply(nBody, doc, []);
    if (!body) return;
    for (const sel of ['body > header', '#app']) {
      const n = apply(nQuery, doc, [sel]);
      if (n) ours.add(n);
    }
    mo = new MO(putBack);
    apply(nObserve, mo, [body, {
      subtree: true, childList: true, attributes: true, characterData: true,
      attributeOldValue: true, characterDataOldValue: true
    }]);
  }

  /* ------------------------------------------------------ 5. the language */

  const JS = ['Object', 'Function', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON',
    'Reflect', 'Proxy', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry', 'Date',
    'RegExp', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
    'AggregateError', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
    'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
    'BigInt64Array', 'BigUint64Array', 'Atomics', 'Intl', 'Iterator', 'parseInt', 'parseFloat', 'isNaN',
    'isFinite', 'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent', 'escape', 'unescape'];
  const WEB = ['TextEncoder', 'TextDecoder', 'Crypto', 'SubtleCrypto', 'Storage', 'EventTarget', 'Event',
    'NodeList', 'HTMLCollection', 'DocumentFragment', 'ShadowRoot', 'DOMParser', 'TreeWalker', 'NodeIterator',
    'DOMStringMap', 'CSSRule', 'CSSStyleRule', 'MutationObserver', 'MutationRecord',
    // PlayVault's own: the clock the games run on, what they draw with, and
    // the input they read
    'Performance', 'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'Path2D',
    'ImageData', 'UIEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'TouchEvent',
    'Touch', 'TouchList'];
  /* Bindings the page itself reaches for by name. Replacing `performance`
     or `requestAnimationFrame` would be as good as hooking them. */
  const BINDINGS = ['crypto', 'localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval',
    'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'structuredClone',
    'atob', 'btoa', 'performance', 'fetch', 'getComputedStyle', 'matchMedia'];

  function tameLanguage() {
    for (const k of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
      'propertyIsEnumerable', 'toLocaleString']) tame(O.prototype, k, O.prototype[k], false);
    for (const k of ['constructor', 'toString']) tame(Function.prototype, k, Function.prototype[k], false);
  }

  /* Left unfrozen on purpose: an error's `name` and `message` are assigned on
     instances all over the web (PeerJS included), and nothing is gained by
     freezing where they come from. The Error constructor itself is frozen —
     that is where a stack could be forged. */
  function unfrozen() {
    const skip = new WeakSet([root]);
    if (doc) skip.add(doc);
    for (const n of ['Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError',
      'URIError', 'AggregateError', 'DOMException']) {
      if (typeof root[n] === 'function' && root[n].prototype) skip.add(root[n].prototype);
    }
    return skip;
  }

  /** Freeze everything reachable from these, through properties and prototypes. */
  function harden(roots, skip) {
    const seen = new WeakSet();
    const todo = roots.slice();
    while (todo.length) {
      const o = todo.pop();
      if (o === null || (typeof o !== 'object' && typeof o !== 'function')) continue;
      if (seen.has(o) || skip.has(o)) continue;
      seen.add(o);
      try { freeze(o); } catch (e) { /* an exotic object that cannot be frozen */ }
      try { todo.push(protoOf(o)); } catch (e) { /* no prototype to reach */ }
      let keys = [];
      try { keys = keysOf(o); } catch (e) { /* nothing to walk */ }
      for (const k of keys) {
        let d;
        try { d = gopd(o, k); } catch (e) { continue; }
        if (!d) continue;
        if ('value' in d) todo.push(d.value); else todo.push(d.get, d.set);
      }
    }
  }

  function intrinsics() {
    const out = JS.concat(WEB).map(n => root[n]);
    try {
      out.push(protoOf(Uint8Array), protoOf([][Symbol.iterator]()), protoOf(new Map()[Symbol.iterator]()),
        protoOf(new Set()[Symbol.iterator]()), protoOf(''[Symbol.iterator]()),
        protoOf(/x/[Symbol.matchAll]('x')), protoOf(function* () {}), protoOf(async function () {}),
        protoOf(async function* () {}));
    } catch (e) { /* an older engine without one of these */ }
    // The instances too: `defineProperty(performance, 'now', …)` would make
    // an own `now` that no frozen prototype stands in front of.
    for (const n of ['crypto', 'performance']) if (root[n]) out.push(root[n]);
    return out;
  }

  function lockBindings(names) {
    for (const n of names) {
      const d = gopd(root, n);
      if (!d || !d.configurable) continue;
      try {
        define(root, n, 'value' in d
          ? { value: d.value, writable: false, enumerable: d.enumerable, configurable: false }
          : { get: d.get, enumerable: d.enumerable, configurable: false });
      } catch (e) { /* the browser keeps this one */ }
    }
  }

  /* ------------------------------------------------------------ speed bumps */

  function speedBumps(listen) {
    if (log && log.log) {
      log.log('%cStop!', 'color:#dc2626;font:700 40px/1.2 system-ui,-apple-system,sans-serif');
      log.log('%cThis is a tool built into the browser for developers. PlayVault is locked: code pasted '
        + 'here cannot change the page, the games or your saves, and if someone told you to paste something '
        + 'here to unlock coins or levels, it is a trick.\n'
        + '停！这是浏览器给开发者用的工具。PlayVault 已上锁：粘贴到这里的代码改不了页面、游戏或存档。'
        + '如果有人叫你在这里粘贴代码来解锁金币或关卡，那是骗局。',
        'font:15px/1.5 system-ui,-apple-system,sans-serif');
    }

    // Right-click still works where it earns its place: in a text box, and
    // over selected text. Everywhere else all it would offer is "Inspect".
    // The games that use the right button keep it — this only stops the menu.
    apply(listen, root, ['contextmenu', e => {
      const tg = e.target;
      if (tg && tg.closest && tg.closest('input, textarea, select, [contenteditable]')) return;
      if (root.getSelection && String(root.getSelection())) return;
      e.preventDefault();
    }, true]);

    // F12, and the keys for DevTools, the console, the element picker and
    // the page source: Ctrl+Shift+I/J/C/K and Ctrl+U, or Cmd+Option+I/J/C/U.
    // Ctrl+Alt is left alone on purpose: on many keyboards that is AltGr,
    // and AltGr+C or AltGr+U types a letter.
    const KEYS = ['KeyI', 'KeyJ', 'KeyC', 'KeyK'];
    apply(listen, root, ['keydown', e => {
      const code = e.code || '';
      if (e.key === 'F12'
        || (e.ctrlKey && e.shiftKey && KEYS.indexOf(code) >= 0)
        || (e.metaKey && e.altKey && (KEYS.indexOf(code) >= 0 || code === 'KeyU'))
        || (e.ctrlKey && !e.shiftKey && !e.altKey && code === 'KeyU')) e.preventDefault();
    }, true]);
  }

  /* ----------------------------------------------------------------- lock */

  const failed = [];
  function step(name, fn) {
    try { return fn(); } catch (e) { failed.push(name + ': ' + (e && e.message)); return undefined; }
  }
  function report() {
    if (failed.length && log) log.warn('[PlayVault] The lock is only partly on — ' + failed.join('; '));
  }

  /** The language alone — what the smoke tests can check without a page. */
  function freezeLanguage() {
    step('stack depth', () => { if (typeof Err.stackTraceLimit === 'number' && Err.stackTraceLimit < 20) Err.stackTraceLimit = 20; });
    step('built-ins', tameLanguage);
    step('freeze', () => harden(intrinsics(), unfrozen()));
    step('bindings', () => lockBindings(JS.concat(WEB, BINDINGS)));
    return failed.slice();
  }

  let PV = null;
  if (ON) {
    /* Each step stands alone: one that fails in some browser is reported
       and the rest still happen, because a half-locked page must still be a
       working game. */
    const listen = root.EventTarget.prototype.addEventListener;   // before it is tamed
    step('speed bumps', () => speedBumps(listen));
    step('stack depth', () => { if (typeof Err.stackTraceLimit === 'number' && Err.stackTraceLimit < 20) Err.stackTraceLimit = 20; });
    PV = step('namespace', hide) || null;
    step('storage', lockStorage);
    const dom = step('page', () => { installDom(); return domNames(); }) || [];
    step('built-ins', tameLanguage);
    step('freeze', () => harden(intrinsics().concat(dom.map(n => root[n])), unfrozen()));
    step('bindings', () => lockBindings(JS.concat(WEB, BINDINGS, dom)));
    apply(listen, doc, ['DOMContentLoaded', () => {
      shut = true;
      step('put back', watch);
      report();
    }]);
  }
  if (!PV) {
    try { PV = root.PV = root.PV || {}; } catch (e) { PV = {}; }
  }

  PV.Guard = {
    on: ON,
    stranger: stranger,
    readsItself: readsItself,
    wanted: wanted,
    freezeLanguage: freezeLanguage,
    MESSAGE: MESSAGE
  };

})(typeof window !== 'undefined' ? window : globalThis);
