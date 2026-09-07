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

**Phase 1: the shell and one game per family.** Three games are playable —
五子棋, Sudoku and Tetris — chosen because each proves a different engine
contract. The other eight are registered as greyed *Coming soon* stubs, so the
lobby is honest about the roster. See [docs/GAMES.md](docs/GAMES.md).

```
index.html                  script order matters: core, contracts, games, shell
css/app.css                 one stylesheet, tokens for dark and light
js/core/
  util.js rng.js store.js   helpers, seeded random, persistence
  i18n.js profile.js        English + 简体中文, the player and their records
  registry.js               games register themselves; nothing else knows them
  board.js puzzle.js loop.js  the three engine contracts
js/games/<code>/            one folder per game, self-contained
js/games/stubs.js           the eight not built yet
js/app.js                   lobby, play, stats, settings, hash routing
tools/                      build-logo.mjs, serve.js, smoke.js
```

### The rule that keeps this cheap

**A new game touches nothing outside `js/games/<code>/.`** Its `index.js` calls
`PV.Registry.add({...})` and the lobby, the statistics screen, the option sheet
and the save format all follow. The moment a screen special-cases a game code,
the next game costs twice as much.

### The three contracts

| contract | file | games | the rule that matters |
| --- | --- | --- | --- |
| turn-based board | `js/core/board.js` | 五子棋, and Chess / 象棋 / 黑白棋 next | `legalMoves()` is the single source of legality and `apply()` is the only way in |
| solo puzzle | `js/core/puzzle.js` | Sudoku, and the two solitaires next | the deal is a pure function of (seed, difficulty); every move returns its own inverse |
| real-time loop | `js/core/loop.js` | Tetris, and Snake / Racing / Tower Defense next | fixed timestep, inputs applied on tick boundaries, so a run replays from its seed |

Engines never touch the DOM, the profile, or `Math.random()`. Everything random
comes from a seeded `PV.RNG`, which is what makes "race a friend on this seed"
possible later without a server.

**Never drive an engine through `handle()` in a test.** It walks straight past
the legality gate and tests a path no player ever takes — that is how a green
headless run and a broken browser happen at the same time. `tools/smoke.js`
drives `apply()` and asserts it returns `true`, including on the AI's own moves.

## Logo

A bolted vault split down the middle, doors parted on a seam of light, with the
play button bridging both halves. Chosen 2026-09-07 over a closed vault door, a
combination dial and a PV monogram — it is the one that says *the games are in
there* rather than *your games are locked away*.

Three cuts, all authored in `tools/build-logo.mjs`:

| file | use |
| --- | --- |
| `logo.svg` | the mark, 40 px and up |
| `logo-simple.svg` | 16–32 px — bolts and the frame stroke dropped, play button grown |
| `icon.svg` / `favicon.svg` | square, full bleed, content inside the central 80% so an Android maskable crop is safe |
| `lockup.svg` / `lockup-stacked.svg` | mark + wordmark + slogan |
| `wordmark.svg` | type only |
| `social.svg` | 1200×630 OG card |

Every file also exists with a `-neon` suffix in the alternate palette.
`assets/logo/preview.html` is the contact sheet.

### Palette

**Brass on steel** is canonical.

| token | value | |
| --- | --- | --- |
| `play` | `#F6B32B` | the play button, "Vault" in the wordmark, every accent in the UI |
| `playHi` / `glow` | `#FFD87A` / `#FFC64B` | seam highlight and bloom |
| `plate` / `ring` / `edge` / `bolt` | `#171D26` `#2C3644` `#44536A` `#6A7B93` | door, frame, hairlines, bolts |
| `face` | `#0D1218` | vault interior, and the Tetris well |
| `ink` / `sub` | `#EAF0F7` / `#8494A8` | wordmark, slogan |

Alternate: **neon vault** — `#25D8F2` on `#171034`. A dark-arcade skin, not the
brand.

## Notes for whoever edits this next

- **The logo contact sheet is the point.** A mark is judged at 16 px, not 128.
- The seam has to stay narrow (10 of 128 units) and the play triangle has to
  overlap **both** doors. The first cut had a 14-unit bright slit with the
  triangle inside it: it read as a vertical bar and the play button vanished.
- The bloom behind the play button has to stay small (r≈34–44). At r=52 the
  whole face turned into a fuzzy amber blob — the bolts were the only thing
  holding it together at that radius, which is why the bolt-less cuts need a
  *tighter* bloom, not a looser one.
- The wordmark uses a system font stack. Outline it to paths before print or
  third-party use, or it renders differently on other machines.
- `PV.t()` must be looked up **lazily** inside a module — `const t = (k, p) =>
  window.PV.t(k, p)` — never captured at module scope, because i18n.js may load
  after the file using it and a captured `undefined` never recovers.
- A new persisted store that is not in `BACKUP_STORES` (`js/core/store.js`) is
  silently left out of every export. Theme and language are excluded on
  purpose: they belong to the device.
- Anything a view calls during construction must be declared **above** that
  call. A `let` further down the closure is still in its temporal dead zone,
  and the whole game silently fails to mount — which is exactly what happened
  to `let cell` in the Tetris view.
