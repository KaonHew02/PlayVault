/* 麻将连连看 / Mahjong Solitaire — engine.

   The deal is built BACKWARDS, and that is the whole trick. Rather than
   scattering 144 tiles and hoping, the generator starts from a full board and
   repeatedly lifts off a pair of currently-free positions, assigning them a
   matching face as it goes. Replaying those liftings in reverse is a solution,
   so every board it produces can be cleared.

   Dealing forwards and checking afterwards would mean writing a solver for a
   game whose search space is enormous; dealing backwards makes the guarantee
   free.

   A tile is free when nothing rests on top of it and at least one of its long
   sides is clear. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  PV.Mahjong = class Mahjong extends PV.PuzzleGame {
    constructor(opts) {
      super(opts);
      this.shuffles = 0;
      this.deal();
    }

    deal() {
      const L = PV.MahjongLayout;
      this.faces = L.faces();
      // A stubborn seed can paint itself into a corner; take the next one.
      for (let attempt = 0; attempt < 40; attempt++) {
        const built = this.build(new PV.RNG(this.seed + attempt));
        if (built) { this.tiles = built.tiles; this.solution = built.order; return; }
      }
      throw new Error('Mahjong: could not build a solvable layout');
    }

    /**
     * Lift free pairs off a full board, naming them as we go. The order they
     * come off in IS a solution — replaying it clears the board — so it is
     * kept, and the smoke test replays it to prove the guarantee rather than
     * taking the argument on trust.
     */
    build(rng) {
      const spots = PV.MahjongLayout.turtle();
      const tiles = spots.map((p, i) => ({ i: i, x: p.x, y: p.y, z: p.z, id: null, gone: false }));
      const pool = rng.shuffle(PV.MahjongLayout.pairs().slice());
      const live = tiles.slice();
      const order = [];

      while (live.length) {
        const free = live.filter(tl => this.freeIn(live, tl));
        if (free.length < 2) return null;
        rng.shuffle(free);

        const a = free[0];
        const rest = live.filter(tl => tl !== a);
        // The second tile has to still be free once the first is gone.
        const b = free.slice(1).find(tl => this.freeIn(rest, tl));
        if (!b) return null;

        const pair = pool.pop();
        a.id = pair[0];
        b.id = pair[1];
        order.push([a.i, b.i]);
        live.splice(live.indexOf(a), 1);
        live.splice(live.indexOf(b), 1);
      }
      return { tiles: tiles, order: order };
    }

    /* ------------------------------------------------------------- rules */

    overlaps(a, b) { return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2; }

    freeIn(list, tile) {
      let left = false, right = false;
      for (const o of list) {
        if (o === tile) continue;
        if (o.z === tile.z + 1 && this.overlaps(o, tile)) return false;   // covered
        if (o.z !== tile.z || Math.abs(o.y - tile.y) >= 2) continue;
        if (o.x === tile.x - 2) left = true;
        else if (o.x === tile.x + 2) right = true;
      }
      return !left || !right;
    }

    remaining() { return this.tiles.filter(tl => !tl.gone); }
    isFree(tile) { return !tile.gone && this.freeIn(this.remaining(), tile); }
    face(tile) { return this.faces[tile.id]; }

    /** Every matching pair currently playable. */
    availableMoves() {
      const free = this.remaining().filter(tl => this.freeIn(this.remaining(), tl));
      const out = [];
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          if (PV.MahjongLayout.matches(this.face(free[i]), this.face(free[j]))) {
            out.push({ type: 'match', a: free[i].i, b: free[j].i });
          }
        }
      }
      return out;
    }

    handle(move) {
      if (!move) return null;
      // Reshuffle carries no tile pair, so it is handled before the pair checks.
      if (move.type === 'reshuffle') {
        move.ids.forEach((id, k) => { this.tiles[move.order[k]].id = id; });
        return null;
      }

      const a = this.tiles[move.a], b = this.tiles[move.b];
      if (!a || !b || a === b) return null;

      if (move.type === 'unmatch') {
        a.gone = false; b.gone = false;
        return null;
      }
      if (move.type !== 'match') return null;

      if (a.gone || b.gone) return null;
      if (!this.isFree(a) || !this.isFree(b)) return null;
      if (!PV.MahjongLayout.matches(this.face(a), this.face(b))) return null;

      a.gone = true; b.gone = true;
      return { type: 'unmatch', a: move.a, b: move.b };
    }

    /**
     * Deal the remaining faces out again when the board is stuck. The result is
     * not guaranteed solvable — nothing can guarantee that mid-game — so it is
     * offered rather than done automatically, and it is counted.
     */
    reshuffle() {
      const live = this.remaining();
      const order = live.map(tl => tl.i);
      const before = live.map(tl => tl.id);
      for (let attempt = 0; attempt < 30; attempt++) {
        const ids = this.rng.shuffle(before.slice());
        ids.forEach((id, k) => { this.tiles[order[k]].id = id; });
        if (this.availableMoves().length) {
          this.shuffles++;
          this.undoStack.push({ type: 'reshuffle', a: order[0], b: order[0], ids: before, order: order });
          return true;
        }
      }
      before.forEach((id, k) => { this.tiles[order[k]].id = id; });
      return false;
    }

    isSolved() { return this.remaining().length === 0; }

    snapshot() {
      return {
        seed: this.seed,
        gone: this.tiles.map(tl => (tl.gone ? 1 : 0)),
        ids: this.tiles.map(tl => tl.id),
        elapsed: this.elapsedMs, shuffles: this.shuffles
      };
    }

    static restore(snap) {
      if (!snap || snap.seed == null) return null;
      const g = new Mahjong({ seed: snap.seed });
      snap.ids.forEach((id, i) => { g.tiles[i].id = id; });
      snap.gone.forEach((v, i) => { g.tiles[i].gone = !!v; });
      g._elapsed = snap.elapsed | 0;
      g.shuffles = snap.shuffles | 0;
      return g;
    }
  };

})(window.PV);
