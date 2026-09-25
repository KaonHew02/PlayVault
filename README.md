# PlayVault

**One Hub. Endless Games.**

Started 2026-09-07. Vanilla HTML/CSS/JS, classic `<script>` tags into one `PV`
namespace, no build step, no dependencies — the same shape as CardVerse and
MiniShoppingMall.

See [SECURITY.md](SECURITY.md) for what a static site can and cannot defend —
including the short answer to "can you hide the JavaScript?" (no, and here is
what to do instead).

```
node tools/serve.js 8099     # then open http://localhost:8099/index.dev.html
node tools/smoke.js          # headless engine tests; [scale] for a longer run
node tools/smoke.js --min    # ...the same tests against the minified source
node tools/build.js          # write js/playvault.min.js and the deployed index.html
node tools/build-logo.mjs    # regenerate every logo asset
```

**Work against `index.dev.html`** — it loads every file separately, so the
debugger shows real filenames and real line numbers. `index.html` is
generated: it loads one bundle and is what GitHub Pages serves. Run
`node tools/build.js` before pushing; the smoke tests fail if you forget.

## What is built

**All thirteen games on the roster are playable, alone or with friends.**
Nothing is a stub.

| family | games |
| --- | --- |
| board | 五子棋 · 黑白棋 · Chess · 中国象棋 |
| puzzle | Sudoku · Spider Solitaire · Mahjong Solitaire |
| arcade | Tetris · Snake · Worm Arena · Tower Defense · Crowd Rush · Strike Squad |

Strike Squad is a first-person shooter against bots: seven modes on eight
maps, twenty-two guns with upgrades, attachments, camos and keychains,
clothes, skills, and daily and weekly missions. It is the biggest game here
by a distance — fourteen files in `js/games/fps/`, raw WebGL like Crowd
Rush — and `docs/GAMES.md` (phase 25) is the record of how it was built
and measured.

Each family sits on its own engine contract, and each contract has a shared
harness so a game only writes its rules and its painting.

```
index.html                  script order matters: core, contracts, harnesses, games, shell
css/app.css                 one stylesheet, tokens for dark and light
js/core/
  util.js rng.js store.js   helpers, seeded random, persistence
  icons.js                  the few line icons (Bootstrap Icons, MIT), and the pill button
  i18n.js profile.js        English + 简体中文, the player and their records
  drive-config.js drive.js  the optional copy in the player's own Google Drive
  registry.js               games register themselves; nothing else knows them
  cards.js                  a 52-card deck as integers
  board.js puzzle.js loop.js    the three engine contracts
  boardhost.js loophost.js      the harness each family shares
  net.js room.js            the pipe (WebRTC + room codes) and the room over it
  boardnet.js race.js       the two ways a game is shared
  roomui.js friends.js      the room's pixels, and the screen that opens one
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

## Playing with friends

`#/friends`. One player opens a room and reads out six digits; everyone else
types them in. WebRTC peer to peer, PeerJS's public broker for introductions
only, **no server holds the game** — the same model CardVerse ships, ported
rather than re-derived.

There are two ways to share a game, and the FAMILY decides which, so no screen
ever names a game:

| family | how it is shared | the file |
| --- | --- | --- |
| board | host authority, two seats, turn by turn | `js/core/boardnet.js` |
| puzzle · arcade | same seed, everyone at once, ranked at the end | `js/core/race.js` |

**A move is an ASK, never applied locally.** The host validates it through
`apply()` and posts the accepted move back to everyone, itself included — so
both players take the same path into their board and there is no second code
path that only one of them runs. A guest holds a real engine (these four games
are full information and deterministic, so replaying accepted moves gives the
same board) which is why it gets `legalMoves()`, highlighting and the terminal
test for free.

Every accepted move carries the index it was played at, and that one number is
the whole resync protocol: below our history we already have it, equal to it we
apply it, above it we ask for the move list and rebuild.

A race sends **a progress line about once a second and a finishing line**, and
nothing else. Sixty frames a second of somebody's Tetris well over a public
broker does not hold up; a seed does. Only the host ranks, so the same table
appears on every screen. A race the host calls early is settled on what
everybody has when it is called: an arcade run still going ranks on its score,
not below every run that has already ended.

Two rules in `js/core/room.js` that are easy to get wrong:

- **`post()` goes to everyone, `ask()` goes to the host alone.** Facts are
  posted, requests are asked. A guest that applies its own ask has walked
  around the host, which is the whole ballgame.
- **A seat is taken from the connection, never from the message.** That single
  rule is all of "you cannot move for me".

Three more that cost a browser session each to find:

- **PeerJS is `async defer`, so the friends screen can render before it lands.**
  `PV.Net.ready()` waits for it; saying "online play is not available" on a cold
  load and never repainting is simply wrong.
- **`location.hash = <the hash it already has>` fires nothing.** A rematch
  begins the game already on screen, so `room.on('begin')` re-routes by hand.
- **Two tabs on one machine prove nothing about two networks.** They always
  find a direct path; a friend on mobile data often cannot, and then only a TURN
  relay gets through. PeerJS's built-in relay no longer resolves, so `RELAYS` in
  `js/core/net.js` is where a relay's credentials go. An attempt also holds no
  chair until it opens — one that never got through used to fill a room of two.

And three that only show once a match is played through to its end and back:

- **Back is not leaving.** The Back on an online game — and a phone's back
  gesture — lands on the friends screen, and building the game again on the way
  back dealt a fresh one under a live match: an empty board on the host (whose
  board is the only true one), a guest stuck on the wrong turn, a race run
  started over on the same deal. `app.js` puts a game that is still being played
  aside instead, still connected, and "Back to the game" puts the same screen
  back. A real-time run holds still while it is aside (`park()` on the harness).
- **A board rematch is taken by both boards or neither.** The end card's button
  was a local reset — a new game on one board under a match the other thought
  was over. It is the host's Rematch now; the guest's card says to wait for it.
- **A race needs a finish everybody can lose.** Snake on wrap with a tail that
  cannot kill has no way to end, so nobody finished and the host never got
  "Call it". A race on those rules runs against a three-minute clock.

## Keeping a copy in Google Drive

`Settings → Your data` has **Auto**, **To Drive** and **From Drive**, in one
row with Export and Import — the same pills, icons and order as MoneyFlow,
FinSim and PlanSphere, in PlayVault's brass. It is CardVerse's `drive.js`
ported, on the shared **GameHub** OAuth client — CardVerse's `docs/GAMEHUB.md`
is the canonical note, and fixes to one copy belong in the other.

- It writes `GameHub/playvault-data.json` in the signed-in player's **own** My
  Drive (envelope `format: 'playvault.backup'`, the same file Export writes).
  **Never rename either** — a renamed file is a new file, and every copy
  already written under the old name is orphaned.
- It works only from **<https://kaonhew02.github.io/PlayVault/>**: Google signs
  in only on a registered origin, and that origin (`https://kaonhew02.github.io`,
  no path) already covers every Pages repo on the account, so nothing needed
  setting up in Google Cloud. `localhost` is not a registered origin, so
  Google will not sign in there; from a file on disk the buttons are off and
  the line under them says why.
- While the GameHub consent screen is in **Testing**, only accounts on its
  test-user list can sign in — add friends there, or publish the consent
  screen (`drive.file` needs no Google review).
- Google's sign-in script is fetched only when Drive is about to be used,
  never on every page — SECURITY.md says why.
- A browser with no progress yet gets a "Load from Drive" offer on the Games
  screen, because the person whose browser was just cleared is exactly the
  one who does not know to look in Settings.

### Testing

`node tools/smoke.js` runs ~185,000 checks in about five seconds. It drives
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

**Online play is tested by pairing two rooms in memory** and hanging a real
`PV.boardNet` off each end, so the routing, the seat stamping and the host's
accept rules are under test rather than under review — only the WebRTC beneath
the link is replaced. That is why the wire protocol lives in `boardnet.js`
rather than inside the canvas-owning harness. It still does not replace two
real browsers, which is what caught the two bugs above.

**Drive is tested against a fake Google** — a sign-in library that answers the
way Google's does, and a Drive behind `fetch()` that keeps files per account
and shows each account only its own, as `drive.file` does. So the real
queries, the real multipart upload, the restore, the sign-in failures and
auto-save are all under test; only Google itself is not.

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
  silently left out of every export and every Drive copy. Theme, language and
  the Drive switches are excluded on purpose: they belong to the device.
- Editing a JS file and then navigating by hash alone shows you the **old**
  code — a hash change does not reload scripts. Change the query string to
  force a real reload before believing a fix failed.
