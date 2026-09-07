# The roster

Given 2026-09-07. Eleven games, plus play-with-friends.

Solitaire · Mahjong Solitaire · Sudoku · Tetris · Snake · Racing ·
Tower Defense · Chess · 象棋 · 五子棋 · 黑白棋

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

### 2. Solo puzzle — Sudoku, Solitaire, Mahjong Solitaire

One player, a deal from a seed, undo/redo, hints, a timer, a win test. No
opponent, no turn order.

- "Play with friends" here is a **race on a shared seed**, not turn-taking:
  same deal, everyone solves it, times compared. Cheap to build and it reuses
  the same room-code plumbing.
- The generator is the hard part, not the game. Sudoku needs a
  uniqueness-checked generator per difficulty; Solitaire and Mahjong Solitaire
  need *solvable* deals or players hit dead boards and blame the game.

### 3. Real-time loop — Tetris, Snake, Racing, Tower Defense

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

| phase | ships | why |
| --- | --- | --- |
| **1 — shipped 2026-09-07** | Hub shell + 五子棋 + Sudoku + Tetris | one game per family, so all three contracts are proven and load-bearing before anything is built on top of them |
| **2** | 黑白棋, Chess, 象棋, Solitaire, Mahjong Solitaire, Snake | each slots into a contract phase 1 already proved |
| **3** | Racing, Tower Defense | the two that are real productions |
| **4** | play with friends | see below — it is a different job per family |

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
  checks uniqueness on every removal; the solitaires will need the same
  discipline for solvability.
- **Arcade**: `PV.LoopGame` + `PV.Ticker` — fixed 60 Hz timestep, inputs applied
  on tick boundaries, key repeat kept in the view. The smoke test runs each seed
  twice with the same scripted inputs and asserts an identical run, which is the
  property the versus mode will be built on.

## Shared with CardVerse

- `js/core/net.js` — room codes over WebRTC, PeerJS's public broker for
  introductions only, host authority, no server. Port it; do not re-derive it.
  The rule that matters: **`snapshotFor(viewer)` is the only broadcastable
  thing**, and per-viewer fields (`isYou`, seat identity) must be *written*
  there, never inherited from the host.
- `js/core/i18n.js` — English + 简体中文, one flat dict per language, `t()`
  looked up lazily. Half this roster has Chinese names already.
- `drive.js` — copy CardVerse's, not FinSim's or MoneyFlow's. Check
  `index.html` has the `accounts.google.com/gsi/client` script tag.
- GameHub Drive identity: **nothing to do in Google Cloud.** One project, one
  OAuth client, one origin. PlayVault needs only its own sub-folder id,
  `playvault-data.json`, and envelope `format: 'playvault.backup'` — and those
  must be wired **before the first push**, or the orphaning trap bites.
