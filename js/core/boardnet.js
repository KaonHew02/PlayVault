/* PlayVault — the rules of playing a board game down a wire.

   Split out of boardhost.js on purpose: the harness owns a canvas and cannot
   run headless, and this is the part that has to be right. tools/smoke.js
   pairs two rooms in memory, hangs one of these off each end, and plays whole
   games through it — so the accept rules below are under test, not merely
   under review.

   HOST AUTHORITY. The host holds the only engine that decides anything. A
   guest holds a real engine too — these four games are full information and
   deterministic, so replaying the accepted moves gives it the same board — but
   it never applies its own move. It asks. The host validates through apply(),
   and posts the move back to everyone including itself, so both players take
   exactly the same path into their board and there is no second code path that
   only one of them runs.

   Every accepted move carries the index it was played at. That single number is
   the whole resync protocol:

     p.i <  history.length   we already have it — the host's echo of its own move
     p.i == history.length   apply it
     p.i >  history.length   we missed one; ask for the move list and rebuild

   A move that is refused is simply never posted. The asking board does not
   move, which is the correct outcome and needs no message of its own. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /**
   * room: a PV.Room, already begun.
   * api: {
   *   engine()                 -> the live engine
   *   rebuild(history)         replace the engine by replaying these moves
   *   changed()                repaint
   *   restart()                start the game over (a rematch)
   *   gone(kind)               'opponent' | 'host' — nobody left to play
   * }
   */
  PV.boardNet = function (room, api) {
    const seat = room.seat;

    const onRoster = () => { if (room.live().length < 2) api.gone('opponent'); };
    const onClosed = () => api.gone('host');

    room.on('ask', onAsk);
    room.on('msg', onMsg);
    room.on('roster', onRoster);
    room.on('closed', onClosed);

    /* ---- the host, deciding ---- */

    function onAsk(from, p) {
      if (!room.isHost || !p) return;
      const e = api.engine();

      if (p.k === 'sync') { room.post({ k: 'state', history: e.history.slice() }); return; }

      if (p.k === 'resign') {
        if (e.over) return;
        e.finish(1 - from, 'resign');
        room.post({ k: 'over', winner: 1 - from, reason: 'resign' });
        api.changed();
        return;
      }

      if (p.k !== 'mv' || e.over) return;
      // The seat came from the connection, so this is the whole of the
      // "you cannot move for me" check.
      if (from !== e.turn) return;
      // Out of step: hand back the move list rather than the move.
      if (p.i !== e.history.length) { room.post({ k: 'state', history: e.history.slice() }); return; }

      const move = Object.assign({}, p.move);
      const at = e.history.length;
      if (!e.apply(move)) return;              // refused: nobody's board moves
      api.changed();
      room.post({ k: 'mv', i: at, move: move });
    }

    /* ---- everybody, following ---- */

    function onMsg(from, p) {
      if (!p) return;
      const e = api.engine();

      if (p.k === 'mv') {
        if (p.i < e.history.length) return;                    // already have it
        if (p.i > e.history.length) { room.ask({ k: 'sync' }); return; }
        if (!e.apply(Object.assign({}, p.move))) { room.ask({ k: 'sync' }); return; }
        api.changed();
        return;
      }

      if (p.k === 'state') {
        if (room.isHost) return;                               // the host IS the state
        api.rebuild((p.history || []).slice());
        api.changed();
        return;
      }

      if (p.k === 'over') {
        const live = api.engine();
        if (!live.over) { live.finish(p.winner, p.reason || ''); api.changed(); }
        return;
      }

      if (p.k === 'again') { api.restart(); api.changed(); }
    }

    return {
      seat: seat,

      /** A move leaves as a request. Nothing is applied here, ever. */
      request(move) {
        const e = api.engine();
        if (!move || e.over || e.turn !== seat) return false;
        return room.ask({ k: 'mv', i: e.history.length, move: move });
      },

      resign() { return room.ask({ k: 'resign' }); },

      /** Host only in practice; the button is hidden for everyone else. */
      rematch() { return room.post({ k: 'again' }); },

      /* The room outlives the screen. A board that has been torn down must
         stop answering for it, or a stale engine starts accepting moves. */
      destroy() {
        room.off('ask', onAsk);
        room.off('msg', onMsg);
        room.off('roster', onRoster);
        room.off('closed', onClosed);
      }
    };
  };

})(window.PV);
