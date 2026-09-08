# PlayVault

**One Hub. Endless Games.**

Started 2026-09-07. Vanilla HTML/CSS/JS, classic `<script>` tags into one `PV`
namespace, no build step, no dependencies — the same shape as CardVerse and
MiniShoppingMall.

```
node tools/serve.js 8099     # then open http://localhost:8099/
node tools/smoke.js          # headless engine tests; [scale] for a longer run
node tools/build-logo.mjs    # regenerate every logo asset
```

## What is built

**All twelve games on the roster are playable.** Nothing is a stub.

| family | games |
| --- | --- |
| board | 五子棋 · 黑白棋 · Chess · 中国象棋 |
| puzzle | Sudoku · Spider Solitaire · Mahjong Solitaire |
| arcade | Tetris · Snake · Worm Arena · Kart Racing · Tower Defense |

Each family sits on its own engine contract, and each contract has a shared
harness so a game only writes its rules and its painting.

```
index.html                  script order matters: core, contracts, harnesses, games, shell
css/app.css                 one stylesheet, tokens for dark and light
js/core/
  util.js rng.js store.js   helpers, seeded random, persistence
  i18n.js profile.js        English + 简体中文, the player and their records
  registry.js               games register themselves; nothing else knows them
  cards.js                  a 52-card deck as integers
  board.js puzzle.js loop.js    the three engine contracts
  boardhost.js loophost.js      the harness each family shares
js/games/<code>/            one folder per game, self-contained
js/app.js                   lobby, play, stats, settings, hash routing
tools/                      build-logo.mjs, serve.js, smoke.js
```

### The rule that keeps this cheap

**A new game touches nothing outside `js/games/<code>/`.** Its `index.js` calls
`PV.Registry.add({...})` and the lobby, the statistics screen, the option sheet
and the save format all follow. The moment a screen special-cases a game code,
the next game costs twice as much.

### The three contracts

| contract | file | harness | the rule that matters |
| --- | --- | --- | --- |
| turn-based board | `js/core/board.js` | `boardhost.js` | `legalMoves()` is the single source of legality and `apply()` is the only way in |
| solo puzzle | `js/core/puzzle.js` | — | the deal is a pure function of (seed, difficulty); every move returns its own inverse |
| real-time loop | `js/core/loop.js` | `loophost.js` | fixed timestep, inputs applied on tick boundaries, so a run replays from its seed |

Engines never touch the DOM, the profile, or `Math.random()`. Everything random
comes from a seeded `PV.RNG` — which is what makes "race a friend on this seed"
possible later without a server.

The harnesses own the canvas, resizing, undo, pause, the computer's turn, key
repeat, the thumb pad and the end-of-game card. A board game supplies
`create/draw/hit/status/outcome`; a real-time game supplies
`create/draw/keymap/pad/outcome`.

### Testing

`node tools/smoke.js` runs ~184,000 checks in about five seconds. It drives
`apply()` and the ticker, never the internals — driving `handle()` directly
walks past the legality gate and tests a path no player ever takes, which is
how a green headless run and a broken browser happen at the same time.

Two checks are worth knowing about because they are the ones that catch real
rule bugs rather than crashes:

- **Chess perft**: 20 / 400 / 8902 / 197281 nodes from the opening position.
  If pins, checks or any piece's movement is wrong, one of those numbers moves.
- **Xiangqi opens with exactly 44 legal moves.** That single number catches a
  broken horse leg, elephant eye or river rule.

Mahjong proves its own guarantee: the generator records the order it peeled
pairs off the board, and the test replays that order to prove every board can
actually be cleared.

## Logo

A bolted vault split down the middle, doors parted on a seam of light, with the
play button bridging both halves. Chosen 2026-09-07 over a closed vault door, a
combination dial and a PV monogram.

| file | use |
| --- | --- |
| `logo.svg` | the mark, 40 px and up |
| `logo-simple.svg` | 16–32 px — bolts and the frame stroke dropped, play button grown |
| `icon.svg` / `favicon.svg` | square, full bleed, maskable-safe |
| `lockup.svg` / `lockup-stacked.svg` / `wordmark.svg` | with the wordmark and slogan |
| `social.svg` | 1200×630 OG card |

Every file also exists with a `-neon` suffix in the alternate palette.
`assets/logo/preview.html` is the contact sheet. **`tools/build-logo.mjs` is the
only place the art is authored — never hand-edit `assets/logo/*.svg`.**

### Palette

**Brass on steel** is canonical: `#F6B32B` on `#171D26`, with `#0D1218` for
game interiors and `#EAF0F7` / `#8494A8` for text. Alternate: **neon vault**,
`#25D8F2` on `#171034` — a dark-arcade skin, not the brand.

## Notes for whoever edits this next

- **Anything a view calls during construction must be declared above that
  call.** A `let` or `const` further down the closure is still in its temporal
  dead zone, the view silently fails to mount, and you get a half-drawn screen
  with one ReferenceError. It has bitten twice — `cell` in the Tetris view and
  `colX` in a card view. Prefer `function` declarations for helpers, because
  those hoist.
- **Unicode chess pieces: stroke first, then fill.** Fill-then-stroke looks
  right in the code and comes out wrong on screen — a 3px outline swallows the
  glyph's thin interior and every piece renders in the outline colour, so white
  and black look identical.
- The logo contact sheet is the point: a mark is judged at 16 px, not 128. The
  seam must stay narrow, the play triangle must overlap **both** doors, and the
  bloom must stay small (r≈34–44) or the mark turns into an amber blob.
- `PV.t()` must be looked up **lazily** inside a module — `const t = (k, p) =>
  window.PV.t(k, p)` — never captured at module scope, because i18n.js may load
  after the file using it and a captured `undefined` never recovers.
- A new persisted store that is not in `BACKUP_STORES` (`js/core/store.js`) is
  silently left out of every export. Theme and language are excluded on
  purpose: they belong to the device.
- Editing a JS file and then navigating by hash alone shows you the **old**
  code — a hash change does not reload scripts. Change the query string to
  force a real reload before believing a fix failed.
