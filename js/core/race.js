/* PlayVault — playing a puzzle or an arcade game against friends.

   Nothing is synchronised. Everyone gets the SAME SEED from the host and plays
   their own board locally; the only things that cross the wire are a progress
   line every second or so and a finishing line at the end. That is the whole
   design, and it is the one the three contracts were built for: a deal is a
   pure function of (seed, difficulty) and a real-time run replays from its
   seed, so two people on one seed are playing the same game without a single
   frame of state ever being sent.

   The alternative — broadcasting sixty frames a second of somebody's Tetris
   well over a public WebRTC broker — does not hold up, and it would need a
   rewrite of every engine to accept foreign state.

   Turn-based board games do NOT come here. They are host-authority and live in
   boardhost.js, because "same seed, race" is not what chess is.

   The host is the only one that ranks. Everyone reports, one peer decides, and
   the same table appears on every screen. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const el = PV.el;

  const TICK = 700;              // how often progress goes out, at most
  const WON = { win: 1, solved: 1 };

  /**
   * Rank the finishers. Pure, and exported, because it is the part that is
   * worth a test: an off-by-one here hands somebody else's medal out.
   *
   *   'time'   a puzzle. Whoever solved it goes first, soonest first; then
   *            everyone who did not, by how far they got.
   *   'score'  an arcade run. Highest score, whether the run is over or not:
   *            a race the host calls early is settled on what everybody has
   *            when it is called. Finished runs used to come first, which
   *            let a host who crashed early call it and take the medal from
   *            somebody still playing on three times the score. Every arcade
   *            score but the worm's only goes up, so a run still going has
   *            at least what it shows; the worm's is its mass, as a finished
   *            one's is its mass when it died. On equal scores a finished
   *            run is listed first, then the quicker one.
   *
   * Somebody who never finished still ranks, because dropping them off the
   * table reads as a bug — a puzzle below everyone who solved it, an arcade
   * run on its score.
   */
  function rank(entries, metric) {
    const rows = (entries || []).slice();
    const won = e => (WON[e.result] ? 1 : 0);
    rows.sort((a, b) => {
      if (metric === 'time') {
        if (won(a) !== won(b)) return won(b) - won(a);
        if (won(a)) return (a.timeMs || 0) - (b.timeMs || 0);
      } else {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        if (a.done !== b.done) return (b.done ? 1 : 0) - (a.done ? 1 : 0);
        if (a.done && b.done) return (a.timeMs || 0) - (b.timeMs || 0);
      }
      if ((b.pct || 0) !== (a.pct || 0)) return (b.pct || 0) - (a.pct || 0);
      return a.seat - b.seat;
    });
    // Equal results share a rank, and the next one skips — 1, 1, 3, not 1, 1, 2.
    let lastKey = null, lastRank = 0;
    rows.forEach((row, i) => {
      const key = metric === 'time'
        ? won(row) + ':' + (won(row) ? (row.timeMs || 0) : (row.pct || 0))
        : String(row.score || 0);
      row.rank = (key === lastKey) ? lastRank : (i + 1);
      lastKey = key; lastRank = row.rank;
    });
    return rows;
  }

  /** What winning a race is worth on top of the game's own XP. */
  function bonusFor(rank, players) {
    if (players < 2) return 0;
    if (rank === 1) return 30;
    if (rank === 2) return 15;
    return 8;
  }

  /**
   * ctx must provide: host, panel(panelObject), exit(), progress?() -> {pct, score}
   * opts: { metric: 'time' | 'score' }
   */
  PV.Race = function (ctx, room, opts) {
    const metric = (opts && opts.metric) === 'time' ? 'time' : 'score';
    const board = Object.create(null);      // seat -> {pct, score, timeMs, result, done}
    let myDone = false, localPanel = null, ended = false;
    let lastSent = '', timer = 0;

    const bar = PV.RoomUI.gameBar(room);
    const btnEnd = el('button', {
      class: 'btn ghost small-btn', hidden: true,
      onclick: () => settle()
    }, t('race.finishNow'));
    bar.node.querySelector('.room-bar-head').appendChild(btnEnd);
    // Built before the game mounts, so that a view can read ctx.race and know
    // it is in a race. insertBefore keeps the bar on top either way.
    ctx.host.insertBefore(bar.node, ctx.host.firstChild);

    for (const m of room.members) seatRow(m.seat);
    bar.say(t('race.seed', { code: PV.seedToCode(room.seed) }));
    paint();

    const onRoster = () => { checkAllDone(); paint(); };
    const onClosed = () => { clearInterval(timer); bar.say(t('room.hostLeft')); };

    timer = setInterval(tick, TICK);
    room.on('msg', onMsg);
    room.on('end', onEnd);
    room.on('roster', onRoster);
    room.on('closed', onClosed);

    /* ------------------------------------------------------------------ */

    function seatRow(seat) {
      if (!board[seat]) board[seat] = { seat: seat, pct: 0, score: 0, timeMs: 0, result: '', done: false };
      return board[seat];
    }

    /** Send progress, but only when it has actually moved. */
    function tick() {
      if (myDone || ended || !ctx.progress) return;
      let p = null;
      try { p = ctx.progress(); } catch (e) { p = null; }
      if (!p) return;
      const pct = PV.clamp(Math.round((p.pct || 0) * 100), 0, 100);
      const score = Math.round(p.score || 0);
      const key = pct + '/' + score;
      if (key === lastSent) return;
      lastSent = key;
      room.post({ k: 'p', pct: pct / 100, score: score });
    }

    /* A line on the scoreboard is a claim from another person's browser, and
       on a shared seed there is nothing to check it against — that is the
       cost of having no server, and it is written down in SECURITY.md rather
       than pretended away. What IS checked is the shape: a number that is not
       a number, or one with three hundred digits, would break the board for
       everyone including the honest players. */
    const RESULTS = ['win', 'lose', 'draw', 'solved', 'over'];

    function onMsg(from, p) {
      if (!p || ended) return;
      const row = seatRow(from);
      if (p.k === 'p') {
        if (row.done) return;                       // a finished row never moves back
        row.pct = PV.Safe.num(p.pct, 0, 1, 0);
        row.score = PV.Safe.int(p.score, -1e12, 1e12, 0);
        paint();
        return;
      }
      if (p.k === 'f') {
        row.done = true;
        row.result = PV.Safe.pick(p.result, RESULTS, 'over');
        row.score = PV.Safe.int(p.score, -1e12, 1e12, 0);
        row.timeMs = PV.Safe.int(p.timeMs, 0, 1e10, 0);
        row.pct = WON[row.result] ? 1 : PV.Safe.num(p.pct, 0, 1, row.pct);
        paint();
        checkAllDone();
      }
    }

    /** Host only: everybody still connected has finished, so call it. */
    function checkAllDone() {
      if (!room.isHost || ended) return;
      const live = room.live();
      const outstanding = live.filter(m => !(board[m.seat] && board[m.seat].done));
      if (live.length && !outstanding.length) settle();
      else btnEnd.hidden = !(live.length > 1 && live.some(m => board[m.seat] && board[m.seat].done));
    }

    function settle() {
      if (!room.isHost || ended) return;
      const rows = room.live().map(m => Object.assign({ name: m.name }, seatRow(m.seat)));
      room.end(rank(rows, metric));
    }

    function onEnd(msg) {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      btnEnd.hidden = true;
      const rows = msg.standings || [];
      const mine = rows.filter(r => r.seat === room.seat)[0];
      const values = {};
      rows.forEach(r => { values[r.seat] = { text: valueOf(r), rank: r.rank }; });
      bar.players.update(values);
      bar.say(t('race.over'));

      let bonusLine = null;
      if (mine) {
        const gained = bonusFor(mine.rank, rows.length);
        if (gained) {
          PV.Profile.addXp(gained);
          bonusLine = '+' + gained + ' ' + t('profile.xp') + ' · ' + t('race.bonus');
        }
      }

      ctx.panel({
        title: mine && mine.rank === 1 ? t('race.youWon') : t('race.results'),
        tone: mine && mine.rank === 1 ? 'good' : 'flat',
        lines: rows.map(r =>
          (PV.RoomUI.medal(r.rank) || (r.rank + '.')) + ' ' + r.name + ' — ' + valueOf(r))
          .concat(bonusLine ? [bonusLine] : [])
          .concat(localPanel && localPanel.lines ? localPanel.lines.filter(Boolean) : []),
        again: room.isHost ? () => room.again() : false,
        againLabel: room.isHost ? t('race.rematch') : null,
        exitLabel: t('result.toLobby')
      });
    }

    function valueOf(r) {
      // An arcade run is ranked on its score, finished or not, so the score
      // is what its line shows — "still going, 0%" hid why it came first.
      if (metric === 'score') return PV.fmtNum(r.score) + (r.done ? '' : ' · ' + t('race.stillGoing'));
      if (!r.done) return t('race.unfinished', { n: Math.round((r.pct || 0) * 100) });
      return WON[r.result] ? PV.fmtTime(r.timeMs) : t('race.gaveUp');
    }

    function paint() {
      if (ended) return;
      const values = {};
      for (const m of room.members) {
        const row = seatRow(m.seat);
        values[m.seat] = {
          text: row.done ? doneText(row) : liveText(row),
          tone: row.done ? 'done' : ''
        };
      }
      bar.players.update(values);
    }

    function doneText(row) {
      if (metric === 'time') return WON[row.result] ? PV.fmtTime(row.timeMs) : t('race.gaveUp');
      return PV.fmtNum(row.score);
    }

    function liveText(row) {
      if (metric === 'score') return PV.fmtNum(row.score);
      return Math.round((row.pct || 0) * 100) + '%';
    }

    /* ------------------------------------------------------------ public */

    return {
      node: bar.node,

      /** ctx.record() is wrapped so a game reports its own outcome unchanged. */
      report(outcome) {
        if (myDone || ended) return;
        myDone = true;
        let pct = 1;
        if (ctx.progress) { try { pct = (ctx.progress().pct) || 0; } catch (e) { pct = 0; } }
        const mine = seatRow(room.seat);
        mine.done = true;
        mine.result = outcome.result || 'over';
        mine.score = Math.round(outcome.score || 0);
        mine.timeMs = outcome.timeMs || 0;
        mine.pct = WON[mine.result] ? 1 : pct;
        room.post({
          k: 'f', result: mine.result, score: mine.score,
          timeMs: mine.timeMs, pct: mine.pct
        });
        paint();
        checkAllDone();
      },

      /** The game's own end card is held back until the table can be shown. */
      showLocal(panel) {
        localPanel = panel;
        if (ended) return;
        bar.say(t('race.waiting'));
        ctx.panel({
          title: panel.title,
          tone: panel.tone,
          lines: (panel.lines || []).filter(Boolean).concat([t('race.waitingLong')]),
          again: false,
          exitLabel: t('race.leaveRace')
        });
      },

      /* The room outlives this screen — a rematch builds a whole new race over
         the same room. A finished one that kept listening could still settle a
         round it is no longer part of. */
      destroy() {
        clearInterval(timer);
        ended = true;
        room.off('msg', onMsg);
        room.off('end', onEnd);
        room.off('roster', onRoster);
        room.off('closed', onClosed);
        bar.node.remove();
      }
    };
  };

  PV.Race.rank = rank;
  PV.Race.bonusFor = bonusFor;

})(window.PV);
