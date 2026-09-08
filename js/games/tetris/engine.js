/* Tetris — engine.

   Sits on the real-time contract: a fixed 60 Hz tick, inputs applied on tick
   boundaries, every random draw from the seeded RNG. Nothing here reads the
   clock or the DOM, so a run is reproducible from its seed and its input log —
   which is what a versus mode between two friends will be built on later.

   Standard behaviour, because players have muscle memory for it:
   - a 7-bag randomiser, so a drought of I pieces is impossible
   - SRS rotation with the usual wall kicks (the tables below are written in
     screen coordinates, y down, not the y-up form they are usually printed in)
   - lock delay that resets when you move, but only fifteen times, so a piece
     cannot be spun on the floor for ever
   - two hidden rows above the well, where pieces spawn */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const COLS = 10, ROWS = 22, HIDDEN = 2;

  /* Base shapes, rotation 0. Rotations are derived, not typed out. */
  const BASE = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };
  const KEYS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  function rotateCW(m) {
    const n = m.length;
    const out = [];
    for (let y = 0; y < n; y++) {
      out.push([]);
      for (let x = 0; x < n; x++) out[y].push(m[n - 1 - x][y]);
    }
    return out;
  }

  /** SHAPES[type][rot] -> array of {x, y} filled offsets. */
  const SHAPES = {};
  KEYS.forEach(k => {
    let m = BASE[k];
    SHAPES[k] = [];
    for (let r = 0; r < 4; r++) {
      const cells = [];
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m.length; x++) if (m[y][x]) cells.push({ x: x, y: y });
      }
      SHAPES[k].push(cells);
      m = rotateCW(m);
    }
  });

  /* Wall kicks, y already flipped to screen coordinates (down positive). */
  const KICK_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
  };
  const KICK_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
  };

  const LINE_SCORE = [0, 100, 300, 500, 800];

  PV.Tetris = class Tetris extends PV.LoopGame {
    constructor(opts) {
      super(opts);
      this.cols = COLS; this.rows = ROWS; this.hidden = HIDDEN;
      this.grid = new Int8Array(COLS * ROWS).fill(-1);
      this.bag = [];
      this.queue = [];
      this.hold = null;
      this.holdUsed = false;
      this.lines = 0;
      this.level = 1;
      this.gravity = 0;
      this.lockTicks = 0;
      this.lockResets = 0;
      this.piece = null;
      for (let i = 0; i < 5; i++) this.queue.push(this.draw());
      this.spawn();
    }

    /* ---- pieces ---- */

    /** 7-bag: every seven pieces contain each shape exactly once. */
    draw() {
      if (!this.bag.length) this.bag = this.rng.shuffle(KEYS.slice());
      return this.bag.pop();
    }

    spawn(type) {
      const k = type || this.queue.shift();
      if (!type) this.queue.push(this.draw());
      const size = BASE[k].length;
      this.piece = {
        type: k, rot: 0,
        x: Math.floor((COLS - size) / 2),
        y: 0
      };
      this.lockTicks = 0; this.lockResets = 0; this.gravity = 0;
      if (this.collides(this.piece)) this.finish('blocked');
    }

    cellsOf(p) {
      const s = SHAPES[p.type][p.rot];
      const out = [];
      for (const c of s) out.push({ x: p.x + c.x, y: p.y + c.y });
      return out;
    }

    collides(p) {
      for (const c of this.cellsOf(p)) {
        if (c.x < 0 || c.x >= COLS || c.y >= ROWS) return true;
        if (c.y >= 0 && this.grid[c.y * COLS + c.x] !== -1) return true;
      }
      return false;
    }

    /* ---- moves ---- */

    move(dx, dy) {
      const p = this.piece;
      if (!p) return false;
      const next = { type: p.type, rot: p.rot, x: p.x + dx, y: p.y + dy };
      if (this.collides(next)) return false;
      this.piece = next;
      this.touchLock();
      return true;
    }

    rotate(dir) {
      const p = this.piece;
      if (!p || p.type === 'O') return false;
      const to = (p.rot + (dir > 0 ? 1 : 3)) % 4;
      const table = p.type === 'I' ? KICK_I : KICK_JLSTZ;
      const kicks = table[p.rot + '>' + to] || [[0, 0]];
      for (const k of kicks) {
        const next = { type: p.type, rot: to, x: p.x + k[0], y: p.y + k[1] };
        if (!this.collides(next)) { this.piece = next; this.touchLock(); return true; }
      }
      return false;
    }

    /** Moving resets lock delay — but only fifteen times per piece. */
    touchLock() {
      if (this.lockTicks > 0 && this.lockResets < 15) { this.lockTicks = 0; this.lockResets++; }
    }

    holdPiece() {
      if (this.holdUsed || !this.piece) return false;
      const cur = this.piece.type;
      const swap = this.hold;
      this.hold = cur;
      this.holdUsed = true;
      if (swap) this.spawn(swap); else this.spawn();
      return true;
    }

    hardDrop() {
      let n = 0;
      while (this.move(0, 1)) n++;
      this.score += n * 2;
      this.lock();
      return n;
    }

    ghostY() {
      const p = this.piece;
      if (!p) return 0;
      let y = p.y;
      while (!this.collides({ type: p.type, rot: p.rot, x: p.x, y: y + 1 })) y++;
      return y;
    }

    lock() {
      const p = this.piece;
      if (!p) return;
      const idx = KEYS.indexOf(p.type);
      for (const c of this.cellsOf(p)) {
        if (c.y >= 0) this.grid[c.y * COLS + c.x] = idx;
      }
      this.piece = null;
      const cleared = this.clearLines();
      if (cleared) {
        this.lines += cleared;
        this.score += LINE_SCORE[cleared] * this.level;
        this.level = 1 + Math.floor(this.lines / 10);
        // `at` is where the lines were, so the view can flash them. They are
        // recorded as the rows above collapse, which is exactly where the eye
        // expects the flash to be.
        this.lastClear = { rows: cleared, at: this.clearedRows.slice(), tick: this.tick };
      }
      this.holdUsed = false;
      if (!this.over) this.spawn();
    }

    clearLines() {
      let cleared = 0;
      this.clearedRows = [];
      for (let y = ROWS - 1; y >= 0; y--) {
        let full = true;
        for (let x = 0; x < COLS; x++) if (this.grid[y * COLS + x] === -1) { full = false; break; }
        if (!full) continue;
        cleared++;
        this.clearedRows.push(y);
        this.grid.copyWithin(COLS, 0, y * COLS);
        this.grid.fill(-1, 0, COLS);
        y++;                                     // re-check the row that slid down
      }
      return cleared;
    }

    /** Ticks between automatic drops. Floors at 2 so it stays playable. */
    dropTicks() { return Math.max(2, 48 - (this.level - 1) * 4); }

    /* ---- the tick ---- */

    step() {
      for (const a of this.takeInputs()) {
        if (this.over) break;
        if (a === 'left') this.move(-1, 0);
        else if (a === 'right') this.move(1, 0);
        else if (a === 'rotateCW') this.rotate(1);
        else if (a === 'rotateCCW') this.rotate(-1);
        else if (a === 'hold') this.holdPiece();
        else if (a === 'hardDrop') this.hardDrop();
        else if (a === 'softDrop') { if (this.move(0, 1)) { this.score += 1; this.gravity = 0; } }
      }
      if (this.over || !this.piece) return;

      if (++this.gravity >= this.dropTicks()) {
        this.gravity = 0;
        if (!this.move(0, 1)) this.lockTicks = Math.max(this.lockTicks, 1);
      }

      // Grounded: count down the lock delay.
      const grounded = this.collides({
        type: this.piece.type, rot: this.piece.rot, x: this.piece.x, y: this.piece.y + 1
      });
      if (grounded) {
        if (this.lockTicks === 0) this.lockTicks = 1;
        else if (++this.lockTicks > 30) this.lock();
      } else if (this.lockTicks) {
        this.lockTicks = 0;
      }
    }

    /** Visible occupancy, for the view. */
    visibleRows() { return ROWS - HIDDEN; }
  };

  PV.Tetris.COLS = COLS;
  PV.Tetris.ROWS = ROWS;
  PV.Tetris.HIDDEN = HIDDEN;
  PV.Tetris.KEYS = KEYS;
  PV.Tetris.SHAPES = SHAPES;

})(window.PV);
