# The roster

Given 2026-09-07. Eleven games, plus play-with-friends. On 2026-09-08 two were
added — Spider Solitaire and Worm Arena, both into a contract that already
existed, which is the point of the three families — and Klondike Solitaire was
dropped at the user's request, leaving one card solitaire on the roster.

Spider Solitaire · Mahjong Solitaire · Sudoku · Tetris · Snake · Worm Arena ·
Tower Defense · Chess · 象棋 · 五子棋 · 黑白棋 — plus Crowd Rush, added
2026-09-22. Kart Racing was removed the same day

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

### 3. Real-time loop — Tetris, Snake, Worm Arena, Tower Defense, Crowd Rush

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
| **7** | Kart Racing made to drive properly | **shipped 2026-09-22** — no new content, no new screens. The kart felt wrong because the harness was feeding a driving game on a Tetris key-repeat; the rest fell out of measuring rather than reading. See below |
| **8** | Tower Defense: six maps, three difficulties, drawn turrets | **shipped 2026-09-22** — see below. Snake gained a third rule the same day: biting yourself can cut the tail instead of ending the run |
| **9** | Crowd Rush | **shipped 2026-09-22** — a new game, asked for as "count masters" plus a crazygames link. See below |
| **10** | Kart Racing removed | **2026-09-22** — the user asked for it to go. `js/games/racing/` and its strings, tests and script tags are gone; the phase 5, 6 and 7 notes above are kept as the record of what was learnt building it. A circuit racer to the crazygames *Circuit Racing* reference is the replacement, and is not built yet |
| **11** | The option sheet grows cards, and the worm dash eats the tail | **2026-09-22** — see below |
| **12** | Crowd Rush repainted to its reference | **2026-09-22** — see below |
| **16** | Crowd Rush plays like its reference | **2026-09-23** — the crazygames link again, with "just copy it". The game's own art, name and code are FreePlay's and are not copied; what its page lists as the game — a start line, coins and upgrades between runs, crowds that charge, a king to knock down — is built here, drawn in this game's own style. See below |
| **17** | Tower Defense: normal is no longer easy | **2026-09-24** — "normal mode need increase the enemy power, i test play like ez mode". Measured with a bot before changing anything; see below |
| **18** | Crowd Rush, level by level | **2026-09-24** — "count master is level by level, can make it level by level?" Levels are the default mode now; free run keeps the course and difficulty picker, and races use it. Measured with bots before shipping; see below |
| **19** | Crowd Rush: smooth, faster, and a road to the bottom edge | **2026-09-24** — "not smooth", "why down side got the green color", "move not fast… more level will increase the speed right?" See below |
| **20** | Crowd Rush: hard is hard, levels are faster, the blob eases | **2026-09-24** — "free run hard mode like ez one, make it more fast more hard" and "level by level can make the stick man move fast a bit, i see not smoothly". Measured with bots first; see below |
| **21** | Worm Arena rebuilt to its reference | **2026-09-24** — the crazygames *Worms Zone* link, with "fully copy this link, FULLY, bcz current one too shit". A new engine, view and wardrobe rather than a patch; the reference's art, names and code are not copied. See below |
| **22** | Crowd Rush rebuilt in 3D to its reference | **2026-09-24** — "and then the count master oso fully copy it, FULLY bcz current one too shit", with the crazygames *Count Masters* link. Studied from the reference's trailer and a thirty-level playthrough of its web version, frame by frame. A new engine, a WebGL scene and a new view; FreePlay's art, name and code are not copied. See below |
| **23** | Worm Arena redrawn | **2026-09-24** — "the worm look some ugly, redesign it and then the map i cant see the food clearly", with a screenshot. A new worm painter, and snacks that stand off the floor. No rule changed but how big the snacks are and how many. See below |
| **24** | Four fixes to playing with friends | **2026-09-24** — found by walking every game through a room, asked for as "fix all four": Back froze or restarted a match, the board rematch card reset one board, a Snake race could never end, and Worm Arena's room opened with no mode picked. See below |
| **15** | One bundled script, and sealed records | **2026-09-22** — `node tools/build.js` writes `js/playvault.min.js` and the deployed `index.html`; `index.dev.html` is the page to work against. Records carry a checksum so a devtools edit does not survive a refresh. Both are speed bumps and `SECURITY.md` says so; the guards that make the build safe are `smoke.js --min` (the whole suite against minified source) and a stamp the suite checks for staleness |
| **14** | Untrusted input, everywhere it enters | **2026-09-22** — a validation layer (`js/core/safe.js`), a CSP, and SRI on the one third-party script. Written up in `SECURITY.md`; the rule is rebuild the value, never adopt it |
| **13** | Snake: a third rule for your own tail | **2026-09-22** — `pass` puts the head straight through its own body and counts the crossing. With walls that leaves the wall as the only way to lose; with wrap it leaves none, and the run ends at a full board or when the player stops. That is the mode, not a bug |

### Phase 11 — the map picker, and what a dash costs

- **A segmented control that wraps is ugly**, and with six maps in it that is
  exactly what happened: a ragged hole at the end of every row. An option with
  more than three choices — or any choice with a picture to show — is now a
  grid of equal cards instead, full width under its own label, three across on
  a desktop sheet and two on a phone. `preview` on a choice is a callback that
  hands the shell a node; the shell finds it a place to sit and knows nothing
  about what is in it.
- **A map card shows the map**, painted by `paintTerrain` — the same function
  that paints the board — so a thumbnail cannot drift from the thing it is a
  picture of. You can see the meadow's zigzag, the crossroads crossing and
  Ember Pass's two lanes merging before you pick.
- **The worm's dash now burns its tail** instead of a meter: nine segments a
  second while held, never below the ten you started at, and every third
  segment lands behind you as a crumb anyone can eat. The tank is gone. This
  is the Worms Zone bargain and it is a better one — a dash costs the thing
  you spent the round collecting, and it hands that thing to whoever is
  chasing you. The one thing it needed was a cap on crumbs, or a forty-second
  chase carpets the arena.

### Phase 9 — Crowd Rush

A crowd runner: one number, one position across a two-unit track, gates that
multiply or subtract, hazards that bite, rival crowds to trade with, and a
keep at the end. Three courses (★ to ★★★) and three difficulties.

- **The gate split is by overlap, not by where the middle of the crowd is.**
  The crowd is wide — wider the more of you there are — so the part inside
  each gate takes that gate's op and the parts are added back together.
  Straddling the line really does send half of you through the red gate, and
  a crowd wider than a gate can never get all of itself through one: at the
  outside edge exactly 1/w of it is inside. That cap is the tax on being big,
  and it is what stops a ×2 gate from being a free doubling forever.
- **Rival crowds are sized by a SHADOW RUN.** Gates multiply, so a rival
  written as a flat number is a walkover at the end or a wall at the start.
  The generator keeps a running estimate of what a good player would be
  holding, applies its own best gate to it — width tax and all — and sizes
  every rival and the king as a fraction of that. Difficulty moves the
  fraction; it never writes numbers by hand.
  Two bugs that estimate had, both worth remembering: a lane nobody walks
  through still handed out its `+30`, so the shadow gained free runners at
  every gate and ended ten times the size of the player it stood in for; and
  before the width tax it assumed a perfect funnel, which made EASY harder
  than normal, because easy grows the biggest crowds and therefore pays the
  widest tax. Measured with a bot: perfect play now clears easy and normal on
  every course and hard on three runs in four.
- **A clash is a one-for-one trade** — the bigger crowd always wins, by the
  difference — with a rate that follows the smaller side, so a fight takes
  about the same time at 20 against 10 as at 900 against 400.
- The crowd is drawn as up to 140 stickmen with legs that swing, spread over
  a few metres of depth. Spread *backward* they all clamp to the same y and
  scale and the crowd reads as one blue slab; spread away from the camera
  they overlap the way a running mob does.

### Phase 8 — what changed in Tower Defense

- **Six maps, not two**, and a map carries its own `tier` (1–4, shown as stars
  in the option sheet). A map is one or **two lanes** of waypoints; two lanes
  means the wave is dealt between them, so one wall of towers can only be in
  one of the places it is needed. Lanes may cross (Crossroads) or merge into a
  last shared run (Ember Pass). Cells are unioned for building, so a crossing
  is blocked once and shot at twice.
- **Difficulty (easy / normal / hard)** scales the enemies and the purse and
  nothing else: same twenty waves, same order. Measured with a bot that builds
  on the highest-coverage squares — normal is a win for a good build, hard is
  not, and the two-lane maps run about two waves harder at the same tower count.
- **Armour** is flat damage soaked per hit, which is what makes mixing towers
  the answer: the gun's twelve small bites do far less to an armoured enemy
  than the cannon's one big one. Bosses arrive from wave 10, last through the
  gate, and cost four lives.
- **Enemies rank up too** — 1 at wave 1, 2 from wave 7, 3 from wave 14 — worth
  health, armour, a little speed and a bigger bounty, and drawn as plate on the
  face they walk into fire with, with the same pips a tower wears. The player
  is upgrading; a wave 15 grunt that is only a wave 1 grunt with more health
  does not read as the game answering back. Ranks made hard unwinnable for the
  measuring bot, so hard's own health multiplier came down to 1.25 to pay for
  them — and with ranks in, guns + frost + cannon now beats gun spam on hard,
  which is the trade the towers were designed to have.
- **The towers are drawn.** A base plate plus a turret that rotates to what it
  is shooting — the engine tracks the barrel every tick whether or not it can
  fire — and each level changes the silhouette (one barrel, two, then two plus
  a muzzle brake, a drum and a gilded plate) and wears a pip badge. A number
  painted inside a circle is not something you can read across a board with
  fourteen towers on it.
- The terrain is painted once into an offscreen canvas and blitted; per-cell
  scenery at sixty frames a second is the only thing here that would cost
  anything. Scenery comes from a **hash of the cell**, never the game's RNG,
  so it cannot change what a seed does.

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
  on tick boundaries, key repeat kept in the harness. The smoke test runs each
  seed twice with the same scripted inputs and asserts an identical run, which
  is the property the versus mode will be built on.

  **Two kinds of held key, and a game must say which it wants.** `repeatable`
  is the Tetris kind — one press, a pause, then a steady stream of discrete
  steps, because a held left arrow should shift a piece a cell at a time.
  `sustained` is the steering-wheel kind: the action is re-queued on every
  tick, because a held left arrow on a kart is not a request to turn once, it
  is the wheel being at full lock. Both land on a tick boundary, so both still
  replay from the seed.

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

## What phase 7 actually fixed

Kart Racing "felt weird". It was not one thing, and none of it was visible by
reading the code — each item below is a number that came out of driving the
engine headlessly and counting.

- **The controls only arrived on 41% of ticks.** `loophost` delivered a held
  key on a DAS/ARR timer (one press, 160 ms of nothing, then one every 40 ms =
  25 Hz) while the engine re-reads steer and throttle fresh on all 60 of its
  ticks. A held arrow gave 78 deg/s of the 189 it asked for, and a 200 ms
  corrective tap turned 9.5 degrees instead of 37.8. Hence `sustained` above;
  measured live in the running app afterwards at 182 ticks of 182.
- **Rivals spent 29–83% of a race on the grass**, up to 27 units off a road
  four wide, and four of seven were permanently stranded in the infield. Three
  separate causes: aiming at the far *end* of the shortcut rather than along
  it, a brake with no floor that deadlocked a kart at −0.12 for the rest of
  the race, and a corner-speed multiplier that saturated for any bend past
  0.26 — the whole ring — so the field pinned itself to 38% of top speed and
  then could not steer either. Now 9–14%, and **none** of it is a kart running
  wide: every off-road tick is traceable to a spin, a slick or contact.
- **Lap times were impossible** — 5.85 s on a circuit whose theoretical best is
  6.8. The node search only looked ±12 nodes either side of the last one, so a
  kart out in the infield could be handed half a lap in a single tick. A lost
  kart now pays for one full scan, and a tick can be worth at most two nodes.
- **The shortcut was a trap.** A straight chord meets the road at a fifty-
  degree kink at *both* ends; rivals that took the ring's lapped 1.3 s slower
  than those that did not. It is now a Hermite slip road leaving and rejoining
  along the road's own tangents, and **a circuit only gets one if it is
  actually quicker**. The ring is a rounded octagon with no corner to cut, so
  it has none; Old Town's saves 0.57 s a lap.
- **The grass was a wall, not a penalty** — a bare clamp took two thirds of
  your speed on the tick you crossed the line. It eases now, which also makes
  a boost fade rather than snap off.
- **The camera showed 0.87 s of road** at speed and 0.56 s on a boost, so a
  mistake arrived before the corner that caused it was on screen. It now
  leads the kart and shows about 1.1 s.
- **The camera did not turn, and steering is relative to the kart.** Those two
  together mean that for the half of every lap spent heading down the screen —
  a quarter of it steeply — a press of left swings the kart visibly right. The
  file's own comment claimed the opposite ("left on the key is always left on
  the screen"), which is true of a game where the key names a direction, like
  Snake, and false of one where it steers. The camera now turns with the kart,
  so the road ahead is always straight up the screen. The minimap is the only
  thing left holding still, so the player is an arrow on it rather than a dot.
- **The coin counter could read 11 / 10.** The cap is on the speed bonus, not
  on the coins — the eleventh is still worth score, it just stops making you
  faster — so the HUD is a meter that fills and stops, and the end-of-race
  line is the plain total.
- **Steering had no weight and the drift was free.** The wheel now takes a
  moment to reach lock, grip fades with speed, and a drifting kart travels
  wide of where its nose points — which is what the boost is paying for.
- **The grid was 79 units long on a 48-unit screen**, single file, with the
  player on pole. Two abreast now, about 20 units, and the player starts last.
- Smaller, all real: oil sat on the +normal side of every corner because
  `tk.curve[c.i] ? 1 : 1` answers 1 either way; a boost pad announced itself
  sixty times a second; bananas never expired; and pressing R for a tow was
  quicker than staying on the road.

`track.js` now owns the surface speeds and the cornering model, because the
track has to price dirt against asphalt to decide whether its own shortcut is
worth having. The engine reads them, so there is one answer rather than two
that drift apart.

Two things deliberately left alone, both balance rather than defect: **boost
pads dominate a lap** (four pads at 55 ticks on a 1.55x multiplier is about
two thirds of a ring lap, so nominal top speed and the kart classes barely
register), and **the ring losing its shortcut** is a consequence of the
worth-it gate in `chordFor` that one threshold reverts.


### Phase 12 — Crowd Rush, repainted

The user sent the crazygames link again with "I want like this". Opening the
reference's own cover art rather than reading its description was the whole
job: Count Masters is **bright**, and what had been built was dark.

- **The runners are chunky blob people, not stick figures.** A big round
  head, a rounded body, stubby limbs, a gloss up and to the left, and a soft
  shadow on the ground. This is most of why the reference reads as a crowd of
  characters rather than a scribble. Limbs are dropped above seventy on
  screen — at that size a swinging arm is two pixels and 280 fills a frame.
- **A near-white road on bright ground, under a bright sky.** The old dirt
  track on dark grass was the second half of the problem.
- **Gates are solid slabs on dark posts**, saturated green and red, with a
  darker skirt where they meet the road. Translucent panels were the thing
  that made them look homemade: a gate you can see the road through does not
  read as a wall.
- Everything else followed from the new background: the floating gate totals
  got a white halo, the progress bar a white frame and a flag, the hazards
  darker bodies, and the saw a pale face and a red hub — a dark disc on a
  white road reads as a hole in it.
- The crowd's own count sits above the heads of the FRONT rank. Anchored to
  the back of the crowd it climbs into whatever gate is coming.

### Phase 16 — Crowd Rush, played like its reference

"Just copy it" cannot mean the reference's art, characters or code — those
belong to FreePlay. It can mean the game its own page describes, and that is
what was missing: this played as one long level with nothing between runs.

- **A start line.** A run waits with the crowd standing until a tap, Space or
  a steer. Hovering the mouse over the canvas is not a start. A race skips it
  (`autostart`), because nobody should be waiting at the line while the
  others run.
- **Coins and two upgrades.** A run pays coins — storming the keep pays for
  the people who got there, falling short still pays for the way you got —
  and the shop at the start line sells **starting crowd** (+3 runners a
  level) and **gate bonus** (+6% of whatever a GREEN gate gave, never
  softening a red one). The course is still sized from the difficulty's own
  starting crowd; the shadow run never sees a boost, so what you buy is a
  real edge. Upgrades are refused once the run has started, and a race uses
  none. The record is `crowd.meta`, sealed and validated like the profile,
  and in the backup.
- **A round crowd.** Runners pack on a sunflower spiral into a blob, not a
  random scatter. Runner i keeps its angle whatever the count, so a gate
  grows the blob from the outside instead of reshuffling it.
- **Crowds that charge.** A rival stands still until you are nine metres
  off, then runs at you. The charge is drawn to land exactly where the
  engine starts the fight, just past the front of YOUR crowd, which moves
  with its size — a rival drawn at a fixed distance stood inside big crowds.
  Its count sits over its far rank, or the two numbers stack when they meet.
  Every runner lost in a fight goes up in a puff.
- **A king.** The keep is held by one figure: our own runner five times the
  size, in red, with a cape, a plain crown and the course's only face. His
  health bar is the runners it takes. The fight is slower than a rival's on
  purpose, and when he falls the flags turn blue and the crowd walks in
  under confetti for a moment (`VICTORY` ticks) before the result. The
  score is settled when he falls; the walk is only a walk.

### Phase 17 — Tower Defense, normal made harder by measurement

"Normal plays like easy" was checked before anything was changed. A bot that
buys the most damage per gold against the armour in front of it — a new tower
on the square that sees the most road for its type, or an upgrade — played
every map while throwing away part of its income. The least share it can
still clear on is how much slack a difficulty leaves.

| | before | after |
| --- | --- | --- |
| easy | 27% | 27% (unchanged) |
| normal | 54%, no life lost on any map | 78%, lives lost on four maps of six |
| hard | 79% | 88%, close to losing on three maps |

Normal needing 54% and never losing a life is the same game as easy to
anyone who plays decently. Its enemies now carry **30% more health** and put
it on **faster wave by wave** (ramp 0.30 → 0.36). A weaker bot — fixed build
order, towers placed well — also still clears every map on normal, losing up
to half its lives on the meadow.

Hard had to move too, or normal would have landed on top of it. It keeps its
health and takes normal's ramp. Its enemies are each a touch lighter than
normal's (1.25 against 1.30) on purpose: there are 15% more of them, 10%
faster, into less gold and fewer lives, and giving them normal's health as
well puts a **wall at wave 8** — where enemies rank up and armour arrives —
that the bot cannot get past on two maps. Starting gold does not move that
wall; only the late-game ramp can add difficulty without it.

- The first measurements used a bot with a fixed build order, and it made
  the meadow — the one-star map — look like the hardest one, which almost
  earned it a gold bonus. A bot that upgrades by value found the meadow
  mid-pack. Calibrate on the better player; a weak one measures itself.
- `smoke.js` now holds the result: sixty per cent of the gold still clears
  easy and no longer clears normal on two maps, a good player clears normal
  and the hardest map on hard, and a wave gets heavier from easy to normal to
  hard.

### Phase 18 — Crowd Rush, level by level

Levels are the default; **Free run** keeps the course and difficulty picker,
and a race always uses it (everyone's level is their own, and a race needs one
course). Level n is a course and a difficulty worked out from n alone
(`PV.CrowdCourse.level`), played from a seed worked out from n alone
(`seedFor`), so a lost level comes back exactly as it was. Win and the level
number moves on (saved in `crowd.meta`, sealed); the button says "Next
level". Lose and it says "Try again". The bar runs from this level's number to
the next, and the scenery takes the three courses in turn.

The curve was measured with bots playing whole careers from level 1: a perfect
runner, a careless one (wrong gate one time in five, aims at gate middles,
misses one hazard in five), each with and without buying upgrades.

- **Level 1 was a coin toss.** Its first gate pair was `-30 | +50` at a crowd
  of twenty, and the king is sized from a perfect run, so at the free run's
  easy fraction one wrong gate early lost to him. The first fifteen levels
  now swap any red subtraction bigger than half of what a good player holds
  for a halving (`mercy`, levels only), and the ramp starts lower and eases
  in. A careless player now wins levels 1-3 nine or ten times in ten.
- **The king had stopped mattering.** The shadow run assumed every hazard
  takes a tenth; a good player steps round most of them, so on long, busy
  levels the shadow shrank away from the real crowd and sized kings of a
  dozen against five hundred. Levels assume a hazard takes 3% (`graze`).
  Free runs keep a tenth — they were balanced on it.
- **The gate bonus compounded.** As a share of each green gate's gain it
  multiplied gate after gate: an upgrading player had 148,000 runners by
  level 55 against a king of 36. It is now flat — two more runners out of
  every green gate per level — which is a real help to a small crowd and
  nothing to a big one. The shop says so in runners, not per cent.
- Where it landed: a careless player who buys upgrades reaches level 61 in
  about 70 runs, retrying one level in six or seven; the same player who
  never buys stalls around level 21; a perfect player needs upgrades past
  about level 24. Upgrading is how you get on — which is what the reference
  says of itself.
- `smoke.js` holds it: the ramp never gets easier from one level to the
  next, each level is one course, level 1 is gentler than a free run on
  easy, no level of the first fifteen opens on a gate that wipes the crowd,
  and a good player clears levels 1-10 with nothing bought.

### Phase 19 — Crowd Rush: smooth, faster, and the road to the bottom

- **Drawn between ticks.** The loop is a fixed sixty ticks a second and the
  screen draws once per refresh; the view drew only whole ticks. A screen
  that does not refresh at exactly sixty — every 120/144 Hz laptop, and a
  60 Hz one whenever its timing drifts — gets two ticks on one frame and
  none on the next, and a world that scrolls lurches every time. The harness
  now hands `spec.draw` the fraction past the last tick, the engine keeps
  where the crowd was (`lastDist`, `lastX`, never read by the rules), and
  the view draws in between. Measured first: a frame costs about a
  millisecond to draw, so it was never the machine.
- **The road runs to the bottom edge.** The camera puts the crowd's line four
  fifths of the way down and clamped everything behind it, so the road
  stopped there over a flat green band. The ground uses the same projection
  unclamped; nothing else does, because nothing else stands behind the line.
- **Faster, and faster by level.** Running 0.108 → 0.135 m a tick, steering
  0.03 → 0.05 track-widths a tick (across in about 0.7 s), and the level ramp
  0.95 → 1.25 by level 25, climbing to 1.45: 7.7 m/s at level 1 (it was 5.8)
  to 11.7 m/s. A hazard now bites per METRE rather than per tick, or every
  faster level would have made every saw gentler. The level curve measured
  the same afterwards: quicker steering pays for quicker running.

### Phase 20 — Crowd Rush: hard that is hard, faster levels, an eased blob

Free runs were measured the way the levels were — three courses, ten seeds, a
perfect player and careless ones, with and without upgrades:

| wins | easy | normal | old hard | new hard |
| --- | --- | --- | --- | --- |
| perfect, no upgrades | 97% | 90% | 87% | 60% |
| perfect, a few upgrades | 100% | 100% | 100% | 70-73% |
| careless (1 gate in 5 wrong) | 27% | 17% | 17% | 13% |
| careless, a few upgrades | 57% | 60% | 47% | 10% |

- **Hard only tested sloppiness.** To anyone who reads the gates it was easy
  and normal again. It now runs a third faster than normal (10.9 m/s),
  assumes a good player steps round the hazards (`graze` 0.97, as levels
  do), and sends rivals of 78% and a king of 100% of a good player's crowd.
- **The shop undid any hard.** Three upgrade levels took a perfect run on the
  new hard straight back to 100%. Hard now sizes its crowds to what you bring
  (`matchBoost`): the shadow starts with your extra runners and takes your
  gate bonus, from the same seed, so the gates and hazards stay where they
  were and only the crowds and the king change. Buying at the start line lays
  the course again. A race brings no upgrades, so a race on hard is exactly
  the old layout. Upgrades still help a little on hard — a bigger crowd
  survives the hazards better — and still pay in full on easy, normal and
  the levels.
- **Levels run faster:** the ramp is 1.10 → 1.40 by level 25 and climbs to
  1.55 — 8.9 m/s at level 1 to 12.6 m/s. The level curve measured the same.
- **Legs follow the speed.** They swung at one rate whatever the course did,
  which is part of why a fast level looked slow.
- **The blob eases.** Its size was recomputed from the count every tick, so
  every gate snapped the whole crowd to a new shape and every hit in a fight
  reshuffled it. The drawn size now eases after the count in about a tenth of
  a second; the number over their heads stays exact.
- Found on the way, not changed: free-run easy is harsh on a careless player
  (27%), because a free run has no `mercy` — one wrong red gate early can
  end it. Levels have it; free runs were left as they were balanced.

### Phase 21 — Worm Arena, played like its reference

"Fully copy this link" cannot mean the reference's art, names or code — they
belong to its makers — so, as with Crowd Rush, it means the game its page
describes, built here and drawn from nothing. The old arena was replaced
rather than patched: `engine.js` and `view.js` are new, and `skins.js` holds
the wardrobe, the food packs and the floors.

What the page lists, and where it is now:

- **A round arena whose wall kills.** The soft edge is gone. The screen
  reddens inside 260 units of the wall, and bots measure their way off it: a
  minute of a full arena in the smoke test, no bot into the wall.
- **Your score is your size.** One number, mass. Thickness goes with its
  fourth root, length with its 0.6 power, speed falls with its log — the
  page's "as you get larger, you get slower". A worm turns on a circle about
  two body radii across, so a giant turns wide and heavy.
- **Turbo on either mouse button, Space or ⚡**: twice the speed, for 2 + 1.2%
  of your mass a second, three quarters of it dropped behind you as food, and
  never below 10.
- **Six potions** — magnet, food ×5, radar (arrows to where worms died),
  speed, sharp turns, zoom — twenty seconds each. The reference's shop sells
  nothing that makes a worm stronger, only potions that last longer, and that
  is the one upgrade here: +3 s a level, five levels, never in a race.
- **Coins on the floor** buy skins: eighteen, three free, a few with hats. The
  look panel picks the food (sweets, fruit or orbs) and the floor.
- **Three modes.** Infinity. Time: seven minutes, food and coins doubled, a
  death is a respawn, and you are placed at the bell. Treasure hunt: three
  chests with an arrow to the nearest, ten coins and a burst of food each.
- **The HUD is on the glass**: size, kills and coins top left with the potions
  under them on their clocks, the top ten top right (five on a phone) with you
  under them, a round map bottom right (bottom left on touch, out of the
  turbo button's way), and the clock top middle in Time.

Decisions:

- **Food within reach flies to the mouth, and is that worm's once it leaves
  the floor.** Everyone has that much magnet; the potion only widens it.
- **Only food the arena makes is doubled in Time.** Doubling everything paid
  a dead worm's remains back at 1.6 times what it weighed, so every traded
  kill printed mass: a fifteen-minute autopilot run ended with a worm of 6.6
  million. Remains and crumbs are somebody's mass already and are paid at
  face value; the ×5 potion pays on remains but never on a turbo crumb, or
  burning one unit and eating it back would pay three. The same run now
  tops out near eleven thousand.
- **Bots look down a fan of thirteen headings** for the one that is clear and
  nearest what they want — food worth the trip, a worm to cut off, or a
  wander. Three things halved how often they died, each measured before the
  next: another worm's head is treated as where it is GOING (three obstacles
  laid ahead of it), the clearance a heading needs is the turning circle the
  bot is on now — which a turbo doubles — and a turbo is dropped the moment
  the way ahead closes. A normal arena now loses about twenty worms a minute
  and a bot lives about a minute. Hunters run alongside and cut in ahead,
  because straight at a head is a head-on and the bigger worm wins those; big
  bots coil round small worms. Dim bots sometimes stop looking. That is how
  the arena gets fed.
- **Everything is a sprite.** Each ball colour, snack, bottle, coin and chest
  is painted once into a small canvas and stamped: a full arena draws in 2–4
  ms on a 1180×510 canvas, and a tick costs 0.1 ms.
- **The camera draws between ticks** by sampling the body from the head a
  fraction of the last step back along its own path, instead of moving the
  whole worm — which would fold the neck whenever a new body point had landed
  inside the last step.
- **A start line**, like Crowd Rush's: the arena runs while you choose a skin,
  and your worm lies parked — an obstacle the bots steer round, and nobody
  dies on. A race skips it (`autostart`), brings no upgrades, and reports
  Time's clock as its progress. `worms.meta` holds coins, skins, food, floor
  and the upgrade; it is sealed and in the backup.

Not built: sound, the seasonal modes, emoji, and "continue" after a death,
which the reference sells for an advert.

### Phase 22 — Crowd Rush, rebuilt in 3D

Phases 9 to 20 describe a game that is gone: the engine, the course
generator and the view were all replaced. The reference is a 3D game, and
a crowd painted onto one vanishing point in 2D could be tuned for ever
without ever looking like it. Everything below was taken from watching the
reference — its trailer and a playthrough of levels 1 to 30 of the web
version — one frame at a time, not from its description.

- **Drawn in WebGL, with no library** (`gl.js`, `scene.js`). PlayVault has
  no dependencies and a CSP that loads scripts from this origin only; a
  600 kB engine for one game would have been the first exception to both.
  WebGL 2 where there is one, WebGL 1 with the instancing extension where
  not, and GLSL ES 1.00 so the shaders compile under either. Every runner on
  screen — yours, theirs, the tower, the ones the king sends flying — is one
  instanced draw call (two when you wear a skin); the limbs swing in the
  vertex shader, so the CPU sends twelve floats a runner. A frame costs well
  under a millisecond of script.
- **Two canvases.** WebGL draws on its own canvas under the harness's 2D
  one, which carries only the HUD: the level bar, coins, the count pills,
  the gate numbers floating off the crowd, the start screen's cards and
  buttons, the needle, the king's health. `loophost.js` is untouched and
  still draws its pause veil on top.
- **The camera is the reference's,** measured from its frames: low and
  flat behind the crowd, the road held in the middle of the screen, gates a
  third of the way up. Its tower and castle shots stand off to the RIGHT —
  the stairs climb away to the upper right in every reference frame — and
  the projection is mirrored once so world +x is screen right.
- **Runners, not a number.** Each has a place in a round blob on a hex
  lattice (`SLOTS`), wider than a gate never, longer down the road instead.
  A gate is taken by the whole crowd, by where its middle is when its front
  meets the glass — the reference's rule: ×4 at 27 is 108. A trap cuts the
  runners it touches. A red squad is runners too, and every pair that
  touches goes down together, which is the one-for-one trade arrived at by
  contact. Past 300 a side the rest wait in a reservoir; the count is exact
  either way.
- **The finishes.** Two of every three levels end at a rainbow staircase,
  ×1.0 to ×5.0, climbed as a human tower that leaves a row on each step,
  with a chest at the top; the third is a needle to stop for +10, +40 or
  +80 and a crowned king in front of a castle with onion domes, who swings a
  maul and knocks runners flying. The shop sells the reference's two
  upgrades, Start Units and Income, at 100 coins a level; the colour wheel
  and eight hats (one more every third level) are the reference's COLOR and
  SKIN.

What measuring found, each worth not finding again:

- **Traps with gaps narrower than a crowd** cost a perfect player half the
  crowd on level 2. Wider gaps, and runners now step aside from a blade in
  their path (`dodge`) — as far as they can in the half metre they see it
  coming, so a crowd run straight into a saw loses about a third and one
  steered into the gap loses nothing.
- **A blob that re-packed toward its middle every tick** poured its
  survivors into the saw that had just made the gap. Places are now stable;
  the gaps close once nothing sharp is near (`repack`), and at once in a
  fight, where closing up is what the reference's crowds do.
- **A runner that had stepped clear was pulled back into the blade** by its
  place in the blob. It now holds the edge until the blade has gone by.
- **The reservoir topped up onto a blade**, and a crowd of six hundred fed
  its whole reserve into one saw. The reserve only steps in when no trap is
  near.
- **A runner appended to a full table was handed place 300 of 300**, stood
  at NaN, and a fight against it could never end — found by the smoke run,
  one dusk seed in six. `append()` closes the gaps before counting the
  newcomer, and the suite now checks every tick that every runner stands
  somewhere real.
- **The tower's width came from the crowd**, so 32 runners climbed lower
  than 31 (three wide to four wide). The width belongs to the level now, and
  more runners never climb less.

Balance, with the test bot (better gate, widest clear stretch past a trap,
needle stopped in the middle): it clears levels 1 to 12 every time and 27
of the first 30; what it loses are presses and hammers, which need timing a
bot that only chooses where to stand does not have. `smoke.js` holds it,
along with the one-for-one trade, the gate rule, the reservoir, a king too
big for a handful, the stairs paying ×1.0 to ×5.0 and never less for more,
and a crowd steered round a blade losing far fewer than one run into it.

Not built: the reference's gems, its island-building meta game, the cannon
and mystery-box bonus levels, and squads stacked as towers.

### Phase 23 — Worm Arena, redrawn

The screenshot showed two things. Every ball had a dark rim of its own, so a
worm read as beads on a string, with small eyes on its front edge. And pastel
sweets sat on a pastel honeycomb whose joins were the strongest lines on the
screen.

- **One outline round the whole worm**, drawn once along the body — a stroke,
  with discs for the tapering tail — instead of a rim on every ball. The balls
  have no rim now, are lit in the middle and a shade darker at the edge, and
  sit half a radius apart, so a body reads as one soft tube with gentle
  segments. A gloss streak runs down its back, lit from the top left like the
  rest of the arena; the drop shadow and the turbo's glow are a stroke each.
- **Googly eyes**: bigger, nearly touching, pupils on whatever the worm is
  looking at, and a blink every three seconds on each worm's own beat.
- **The wardrobe's cards are painted by the arena's own `paintWorm`**, so a
  card cannot drift from the worm it sells.
- **Snacks are stickers**: the drawing, a dark outline round its silhouette,
  and a soft glow of its own colour behind it, at 96 px. The pastels were
  saturated, snacks are about a fifth bigger, there are 15% more of them, and
  the camera sits a little closer (350 world units across the short side, 300
  on a phone).
- **The floor is quieter**: flat tiles, and joins only a shade off them.
- **What it costs**: fewer stamps per length of worm than before — a ball
  every half radius and no shadow stamps, against a ball every 0.55 of a
  radius plus a shadow every second one — and the ball sprite lost the
  transparent margin every stamp was paying for. With the three strokes the
  pixels drawn come out about where they were. This was settled by counting:
  timings in the preview pane, hidden and software-rendered on a machine busy
  with another build, swung by a factor of a hundred between identical runs.

### Phase 24 — playing with friends, played through

Every game was walked through a room — join, play, finish, rematch, and the
Back button in the middle — and four things broke. The two board ones were
reproduced headless first, by pairing two rooms in memory and remounting one
end, before anything was changed.

- **Back froze or restarted the match.** The Back on an online game (and a
  phone's back gesture) goes to the friends screen, which offers "Back to the
  game" — and that rebuilt the game from nothing. A guest that came back on
  its own turn had a fresh board that said it was the host's turn, the host
  was waiting for the guest, and neither could ever move again. A host that
  came back had an empty board, and the host's board is the only true one. A
  race run started over on the same deal: lost progress, a second attempt,
  and on the host a scoreboard that had forgotten who had already finished.
  Now a game still being played is **put aside**, not destroyed (`parked` in
  `app.js`): its screen comes off the page, its listeners stay on the room —
  board moves keep landing, the race keeps its table, a card that arrives is
  there on the way back — and "Back to the game" re-attaches the same screen
  and sends a resize so each game measures itself again. A real-time run
  holds still while it is aside, through `park()` on `loopHost` and on the
  Tetris view: a Back is not a crash, and a pause is allowed in a race
  anyway. Leaving for any other screen still leaves the room.
- **The board rematch card reset one board.** Its button was the solo
  `reset()`: a new game on the host's board under a match the guest's board
  still thought was over, and the one button that fixed it — Rematch in the
  bar — sits under the card. Online the card's button is the host's Rematch,
  the guest's card says only the host can start one, and a rematch takes the
  card down on both screens (`ctx.closePanel()`).
- **A Snake race on wrap with a forgiving tail never ended.** Nothing on the
  board can end that run — `pass` goes through the body, `trim` only costs
  length, wrap has no wall — so nobody finished, and "Call it" waits for a
  finisher. A race on those rules gets a clock: three minutes, counted in
  ticks so a pause holds it and the run still replays from its seed, shown
  first in the side panel, and the most eaten at the bell takes it. A race
  with a wall or a fatal tail is unchanged — it can be lost.
- **Worm Arena's room opened with no mode picked.** The friends screen turns
  a board game's `mode` to pass-and-play, and it did that to any option
  called `mode` — the arena's Infinity/Time/Treasure too, where 'hotseat'
  matches no choice. It only touches the board family now.
