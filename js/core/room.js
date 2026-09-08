/* PlayVault — a room, on top of the pipe.

   net.js knows about connections. This knows about PLAYERS: who is in the
   room, which game they agreed to play, what seed it was dealt from, and how a
   message gets from one of them to the others. Both families of online play sit
   on this one object, and nothing above it touches PV.Net directly.

   Two ways to say something, and picking the wrong one is the bug that will
   bite:

     post(p)  goes to EVERYONE, including the sender, in the host's order.
              Use it for facts — a score, a finish, a move the host has already
              accepted. Every peer sees the same sequence.
     ask(p)   goes to the HOST ONLY and is not relayed. Use it for requests —
              "I would like to play this move". The host decides and then
              post()s the result. A guest that applies its own ask locally has
              just walked around the host, which is the whole ballgame.

   The transport is injected as `link` rather than reached for, so the message
   handling is exercised headless in tools/smoke.js by pairing two rooms
   through an in-memory link. Everything below `link` is real code under test;
   only the WebRTC underneath it is not. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  /** A room is at most this many players, whatever the game asks for. */
  const MAX_SEATS = 6;

  function member(seat, name, level, host) {
    return {
      seat: seat,
      name: name || t('profile.player'),
      level: Math.max(1, level | 0),
      host: !!host,
      alive: true
    };
  }

  /**
   * link: {
   *   isHost, send(msg), sendTo(seat, msg), broadcast(msg), close(reason)
   * }
   */
  PV.Room = class Room extends PV.Net.Emitter {
    constructor(o) {
      super();
      this.link = o.link;
      this.isHost = !!o.link.isHost;
      this.code = o.code || '';
      this.seat = o.seat | 0;
      this.gameCode = o.gameCode || '';
      this.opts = o.opts || {};
      this.maxPlayers = PV.clamp(o.maxPlayers || 2, 2, MAX_SEATS);
      this.members = o.members || [];
      this.phase = 'lobby';          // lobby | playing | over
      this.seed = 0;
      this.round = 0;
      this.dead = false;
    }

    /* ---------------------------------------------------------- roster */

    memberAt(seat) {
      return this.members.filter(m => m.seat === seat)[0] || null;
    }

    nameFor(seat) {
      const m = this.memberAt(seat);
      return m ? m.name : t('profile.player');
    }

    /** Members still connected, in seat order. */
    live() { return this.members.filter(m => m.alive).sort((a, b) => a.seat - b.seat); }

    get full() { return this.live().length >= this.maxPlayers; }

    /* --------------------------------------------------------- speaking */

    /** To everyone, in the host's order, including back to the sender. */
    post(p) {
      if (this.dead) return false;
      if (this.isHost) {
        this.link.broadcast({ t: 'msg', from: 0, p: p });
        this.fire('msg', 0, p);
      } else {
        this.link.send({ t: 'post', p: p });
      }
      return true;
    }

    /** To the host alone. Not relayed; the host answers with a post(). */
    ask(p) {
      if (this.dead) return false;
      if (this.isHost) this.fire('ask', 0, p);
      else this.link.send({ t: 'ask', p: p });
      return true;
    }

    /* ----------------------------------------------------- host actions */

    /** Host: everyone in, deal a seed, and go. Locks the room to late joins. */
    begin(seed) {
      if (!this.isHost) return false;
      this.seed = (seed == null ? PV.newSeed() : seed) >>> 0;
      this.round++;
      this.phase = 'playing';
      const msg = {
        t: 'begin', game: this.gameCode, opts: this.opts,
        seed: this.seed, round: this.round, members: this.members
      };
      this.link.broadcast(msg);
      this.fire('begin', msg);
      return true;
    }

    /** Host: the same room, the same people, a fresh deal. */
    again(seed) { return this.begin(seed); }

    /** Host: the round is settled. Everyone shows the same table. */
    end(standings) {
      if (!this.isHost) return false;
      this.phase = 'over';
      const msg = { t: 'end', standings: standings || [] };
      this.link.broadcast(msg);
      this.fire('end', msg);
      return true;
    }

    /** Host: push the roster after anyone joins, leaves or is renamed. */
    pushRoster() {
      if (!this.isHost) return;
      this.link.broadcast({ t: 'roster', members: this.members, game: this.gameCode, opts: this.opts });
      this.fire('roster', this.members);
    }

    /* ------------------------------------------------------- receiving */

    /** Everything arriving from the wire lands here, host and guest alike. */
    receive(fromSeat, msg) {
      if (this.dead || !msg || typeof msg.t !== 'string') return;

      if (this.isHost) {
        // A guest may only ever request or announce. It cannot begin a round,
        // rewrite the roster, or end the game — those are the host's alone, and
        // refusing them here is cheaper than checking at every use.
        if (msg.t === 'ask') this.fire('ask', fromSeat, msg.p);
        else if (msg.t === 'post') {
          this.link.broadcast({ t: 'msg', from: fromSeat, p: msg.p });
          this.fire('msg', fromSeat, msg.p);
        }
        return;
      }

      if (msg.t === 'msg') { this.fire('msg', msg.from | 0, msg.p); return; }
      if (msg.t === 'roster') {
        this.members = msg.members || [];
        if (msg.game) this.gameCode = msg.game;
        if (msg.opts) this.opts = msg.opts;
        this.fire('roster', this.members);
        return;
      }
      if (msg.t === 'begin') {
        this.gameCode = msg.game || this.gameCode;
        this.opts = msg.opts || this.opts;
        this.seed = msg.seed >>> 0;
        this.round = msg.round | 0;
        this.members = msg.members || this.members;
        this.phase = 'playing';
        this.fire('begin', msg);
        return;
      }
      if (msg.t === 'end') { this.phase = 'over'; this.fire('end', msg); return; }
      if (msg.t === 'bye') this.shut(msg.reason || 'closed');
    }

    /* ------------------------------------------------------------ close */

    shut(reason) {
      if (this.dead) return;
      this.dead = true;
      this.fire('closed', reason || 'closed');
    }

    leave(reason) {
      if (this.dead) { PV.Room.forget(this); return; }
      this.dead = true;
      try { this.link.close(reason); } catch (e) { /* going anyway */ }
      PV.Room.forget(this);
    }
  };

  /* ---------------------------------------------------------------------- *
   * Building one, over a real connection.
   * ---------------------------------------------------------------------- */

  const me = () => ({ name: PV.Profile.name(), level: PV.Profile.level().level });

  /** Host a room for `gameCode`. Resolves once the broker has given us a code. */
  PV.Room.host = async function (gameCode, opts, maxPlayers) {
    const net = new PV.Net.Host();
    const code = await net.open(maxPlayers);
    const mine = me();

    const room = new PV.Room({
      link: {
        isHost: true,
        send: msg => net.broadcast(msg),
        sendTo: (seat, msg) => net.send(seat, msg),
        broadcast: msg => net.broadcast(msg),
        close: reason => net.close(reason)
      },
      code: code, seat: 0, gameCode: gameCode, opts: opts, maxPlayers: maxPlayers,
      members: [member(0, mine.name, mine.level, true)]
    });
    room.net = net;

    net.on('join', entry => {
      room.members.push(member(entry.seat, entry.name, entry.level, false));
      room.pushRoster();
      room.fire('joined', entry.seat);
    });
    net.on('leave', entry => {
      const m = room.memberAt(entry.seat);
      if (m) m.alive = false;
      room.pushRoster();
      room.fire('left', entry.seat);
    });
    net.on('msg', (seat, msg) => room.receive(seat, msg));
    net.on('error', err => room.fire('error', err));

    return PV.Room.adopt(room);
  };

  /** Join the room with this code. Resolves once we have a seat. */
  PV.Room.join = async function (code) {
    const net = new PV.Net.Client();
    const mine = me();
    await net.join(code, { name: mine.name, level: mine.level });

    const room = new PV.Room({
      link: {
        isHost: false,
        send: msg => net.send(msg),
        sendTo: (_seat, msg) => net.send(msg),
        broadcast: msg => net.send(msg),
        close: () => net.close()
      },
      code: net.code, seat: net.seat
    });
    room.net = net;

    net.on('msg', msg => room.receive(0, msg));
    net.on('bye', info => room.shut((info && info.reason) || 'closed'));
    net.on('error', err => room.fire('error', err));

    return PV.Room.adopt(room);
  };

  /* The one live room. The play screen reads it rather than being handed it,
     because a hash route is the only thing between the friends screen and the
     game and a route carries no objects. */
  PV.Room.current = null;
  PV.Room.adopt = function (room) {
    if (PV.Room.current && PV.Room.current !== room) PV.Room.current.leave('replaced');
    PV.Room.current = room;
    room.on('closed', () => { if (PV.Room.current === room) PV.Room.current = null; });
    return room;
  };
  PV.Room.forget = function (room) {
    if (PV.Room.current === room) PV.Room.current = null;
  };

  PV.Room.MAX_SEATS = MAX_SEATS;
  PV.Room.member = member;

})(window.PV);
