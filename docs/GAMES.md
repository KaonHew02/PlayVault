# The roster

Given 2026-09-07. Eleven games, plus play-with-friends. On 2026-09-08 two were
added — Spider Solitaire and Worm Arena, both into a contract that already
existed, which is the point of the three families — and Klondike Solitaire was
dropped at the user's request, leaving one card solitaire on the roster.

Spider Solitaire · Mahjong Solitaire · Sudoku · Tetris · Snake · Worm Arena ·
Kart Racing · Tower Defense · Chess · 象棋 · 五子棋 · 黑白棋

## Three families, three contracts

This is the load-bearing difference from **CardVerse**, where all twelve games
share one engine contract (seats → turns → bets → payouts) and a new game costs
almost nothing. PlayVault's roster does **not** fit one contract. Forcing it
into one would make every game fight the shell.

### 1. Turn-based board — Chess, 象棋, 五子棋, 黑白棋

Two seats, strict alternation, `legalMoves(seat)`, terminal states
win/lose/draw. One engine base and one grid-board view serve all four; only
piece movement and the terminal test differ.

- CardVerse's rules carry over verbatim: engines never touch the DOM, the
  profile or `Math.random()`; `legalMoves()` is the single source of legality;
  `apply()` refuses anything absent from it.
- AI is decision quality, never cheating — one strong strategy per game plus a
  blunder rate per level.
- **This family is where "play with friends" is easy**, and it is the same
  host-authority WebRTC model CardVerse already ships.

### 2. Solo puzzle — Sudoku, Spider Solitaire, Mahjong Solitaire

One player, a deal from a seed, undo/redo, hints, a timer, a win test. No
opponent, no turn order.

- "Play with friends" here is a **race on a shared seed**, not turn-taking:
  same deal, everyone solves it, times compared. Cheap to build and it reuses
  the same room-code plumbing.
- The generator is the hard part, not the game. Sudoku needs a
  uniqueness-checked generator per difficulty; Mahjong Solitaire and the card
  solitaires need boards that can actually be finished, or players hit dead
  ones and blame the game.

### 3. Real-time loop — Tetris, Snake, Worm Arena, Kart Racing, Tower Defense

A canvas and a fixed-timestep loop. Nothing here is turn-based, so nothing here
uses the board contract.

- **Multiplayer must be shared-seed + events, not state sync.** Each player
  simulates their own board locally; only the seed and the occasional event
  (attack lines, lap times, wave cleared) cross the wire. Broadcasting 60 fps
  of state over a public WebRTC broker will not hold up.
- Racing and Tower Defense are by far the biggest builds in the roster — art,
  tracks/levels, and balance, not just rules. Treat them as their own phase.

## Suggested build order

CardVerse's V1 lesson applies: build the shell plus a few games, register the
rest as greyed "Coming soon" stubs in the lobby.

| phase | ships | status |
| --- | --- | --- |
| **1** | Hub shell + 五子棋 + Sudoku + Tetris | **shipped 2026-09-07** — one game per family, so all three contracts were proven before anything was built on them |
| **2** | 黑白棋, Chess, 象棋, Solitaire, Mahjong Solitaire, Snake | **shipped 2026-09-07** — each slotted into a contract phase 1 had already proved |
| **3** | Racing, Tower Defense | **shipped 2026-09-07** — the two that are real productions |
| **4** | play with friends | **shipped 2026-09-08** — two jobs, not five: host authority for the board family, one shared seed for the other two |
| **5** | Spider Solitaire, Worm Arena, kart items for Racing | **shipped 2026-09-08** — two new games and one reworked, none of which touched the shell. Klondike Solitaire was removed the same day |
| **6** | Worm Arena and Kart Racing rebuilt to written specs | **shipped 2026-09-08** — the user supplied a spec for each; both name their own MVP, and everything past it (coins-as-currency, wardrobes, Grand Prix, battle modes) is deliberately still unbuilt |

Phases 2 and 3 also added a shared harness per family (`js/core/boardhost.js`
and `js/core/loophost.js`). Those were the actual saving: by the fourth board
game, a new one is `create/draw/hit/status/outcome` and nothing else — no
canvas handling, no undo, no AI scheduling, no end-of-game card.

Phase 1's three games are deliberately the *simplest* member of each family.
The point of phase 1 is the contracts, not the content.

### What phase 1 actually proved

- **Board**: `PV.BoardGame` — `legalMoves()` is the single source of legality,
  `apply()` is the only way in, and `snapshotFor(viewer)` already exists and
  already writes its per-viewer fields rather than inheriting them. 黑白棋 and
  the two chesses need an engine and a view, and nothing else.
- **Puzzle**: `PV.PuzzleGame` — the deal is a pure function of (seed,
  difficulty), every move returns its own inverse so undo is free, and the
  timer belongs to the engine so it survives a re-render. Sudoku's generator
  checks uniqueness on every removal; the tile and card puzzles need the same
  discipline for solvability.
- **Arcade**: `PV.LoopGame` + `PV.Ticker` — fixed 60 Hz timestep, inputs applied
  on tick boundaries, key repeat kept in the view. The smoke test runs each seed
  twice with the same scripted inputs and asserts an identical run, which is the
  property the versus mode will be built on.

## What phase 4 actually shipped

**Two mechanisms, chosen by family, not twelve integrations.** The board family
is host authority and the other two race a shared seed, and that split fell
straight out of the three contracts — which is the return on having built them.

- `js/core/net.js` + `room.js` — the pipe and the room over it. Room codes,
  seats, roster, and exactly two ways to speak: `post()` to everyone, `ask()`
  to the host alone.
- `js/core/boardnet.js` — turn-based play. Deliberately split out of
  `boardhost.js`: the harness owns a canvas and cannot run headless, and the
  accept rules are the part that has to be right, so they live where the smoke
  test can pair two rooms in memory and play whole games through them.
- `js/core/race.js` — puzzle and arcade. Same seed, a progress line about once
  a second, a finishing line, and one ranking done by the host.

**No game was rewritten.** The three touches a game needed were mechanical:

- `ctx.seed()` instead of `PV.newSeed()` — in a room it returns the host's
  seed, which is the whole of "everybody gets the same deal".
- `ctx.progress()` — what the scoreboard reads. `loophost.js` provides it for
  the four games it hosts; Tetris and the three puzzles set their own.
- `if (ctx.race)` — do not resume the solo save, do not write to it, and do not
  offer a new board mid-race.

The end-of-game path needed nothing at all: the shell wraps `ctx.record` and
`ctx.gameOver`, so a game reports its outcome exactly as it always did and the
race holds its end card back until the table is in.

### The parts worth not rediscovering

- **A move is an ask, never applied locally**, and it carries the index it was
  played at. That one number is the entire resync protocol.
- **A seat comes from the connection, never from the message.**
- **A guest holds a real engine.** Sound only because these four games are full
  information and deterministic — replaying accepted moves gives the same
  board. It buys `legalMoves()`, highlighting and the terminal test for free.
- **Undo is off online.** Taking a move back on one board is exactly the
  disagreement the resync exists to prevent.
- **A seat is never reused after a drop.** A rejoin under an old seat would
  inherit that seat's half-played game.
- **PeerJS is `async defer`**, so the screen can render before it arrives; wait
  for it rather than declaring online play unavailable.
- **Setting `location.hash` to the hash it already has fires nothing** — a
  rematch has to re-route by hand.

## Shared with CardVerse

- `js/core/net.js` — room codes over WebRTC, PeerJS's public broker for
  introductions only, host authority, no server. **Ported 2026-09-08**, not
  re-derived. The rule that matters: **`snapshotFor(viewer)` is the only
  broadcastable thing**, and per-viewer fields (`isYou`, seat identity) must be
  *written* there, never inherited from the host. PlayVault's board games do
  not broadcast snapshots at all — they broadcast accepted moves, which is
  cheaper and only possible because nothing on these boards is hidden.
- `js/core/i18n.js` — English + 简体中文, one flat dict per language, `t()`
  looked up lazily. Half this roster has Chinese names already.
- `drive.js` — copy CardVerse's, not FinSim's or MoneyFlow's. Check
  `index.html` has the `accounts.google.com/gsi/client` script tag.
- GameHub Drive identity: **nothing to do in Google Cloud.** One project, one
  OAuth client, one origin. PlayVault needs only its own sub-folder id,
  `playvault-data.json`, and envelope `format: 'playvault.backup'` — and those
  must be wired **before the first push**, or the orphaning trap bites.
