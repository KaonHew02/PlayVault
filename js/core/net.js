/* PlayVault — the pipe. WebRTC peer-to-peer, with room codes.

   Ported from CardVerse's js/core/net.js, which is the file to look at if this
   one is ever wrong: the model is the same and its bugs have been paid for
   once already. One browser hosts. It owns whatever authority the game needs
   and it is the only peer anyone else talks to; guests never talk to guests.

   The one thing WebRTC cannot do by itself is INTRODUCE two browsers. That
   needs a signalling server, so this uses PeerJS's free public broker to swap
   connection details and nothing else: once the two are talking, the moves go
   directly between them and the broker sees none of it. It is third-party and
   occasionally slow, which is why every failure path here ends in a sentence a
   player can act on rather than in a hang.

   PeerJS is loaded from a CDN with `async defer`. If it never arrives,
   available() is false, the friends screen says so, and every other part of
   PlayVault carries on working offline exactly as before.

   Every message on the wire is { t: '<kind>', ... }. The kinds net.js owns are
   hello / welcome / full / bye; everything else belongs to room.js. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  /** Room ids are namespaced so we never collide with another PeerJS app. */
  const PREFIX = 'playvault-v1-';
  const CODE_LEN = 6;

  const OPEN_TIMEOUT = 20000;
  const CONNECT_TIMEOUT = 20000;

  const available = () => typeof window.Peer === 'function';

  /* The library is loaded `async defer`, so somebody who opens the friends
     screen in the first moment after a cold load gets there before it does.
     Saying "online play is not available" at that point is simply wrong, and
     it never corrects itself because nothing repaints. Waiting a few seconds
     is the whole difference. Concurrent callers share one wait. */
  let waiting = null;
  function ready(ms) {
    if (available()) return Promise.resolve(true);
    if (waiting) return waiting;
    const until = Date.now() + (ms || 8000);
    waiting = new Promise(resolve => {
      (function look() {
        if (available()) { waiting = null; resolve(true); return; }
        if (Date.now() > until) { waiting = null; resolve(false); return; }
        setTimeout(look, 150);
      })();
    });
    return waiting;
  }

  /** Digits only — a code gets read aloud and typed on a phone. */
  function newCode() {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += Math.floor(Math.random() * 10);
    return code;
  }

  const idFor = code => PREFIX + String(code).trim();

  /** PeerJS error types, said in words a player can act on. */
  function translate(err) {
    const type = (err && err.type) || '';
    if (type === 'unavailable-id') return taken();
    if (type === 'peer-unavailable') return new Error(t('net.errNoRoom'));
    if (type === 'network') return new Error(t('net.errBroker'));
    if (type === 'browser-incompatible') return new Error(t('net.errBrowser'));
    if (type === 'webrtc') return new Error(t('net.errWebrtc'));
    return new Error((err && err.message) || t('net.errGeneric'));
  }

  /* A collision on the room code is retried rather than shown, so it is tagged
     on the error object instead of being sniffed back out of translated text —
     the message is localised and a regex over it would only work in English. */
  function taken() {
    const e = new Error(t('net.errTaken'));
    e.codeTaken = true;
    return e;
  }

  /**
   * Wrap a PeerJS peer so every path settles exactly once. Left to itself, a
   * closed window or a broker that never answers calls no callback at all and
   * the UI waits for ever.
   */
  function openPeer(id) {
    if (!available()) return Promise.reject(new Error(t('net.errNoLib')));
    return new Promise((resolve, reject) => {
      let done = false;
      const peer = new window.Peer(id, { debug: 0 });
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { peer.destroy(); } catch (e) { /* already gone */ }
        reject(new Error(t('net.errSlowBroker')));
      }, OPEN_TIMEOUT);

      peer.on('open', () => {
        if (done) return;
        done = true; clearTimeout(timer); resolve(peer);
      });
      peer.on('error', err => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { peer.destroy(); } catch (e) { /* already gone */ }
        reject(translate(err));
      });
    });
  }

  /** The tiny event bus both ends share. */
  class Emitter {
    constructor() { this.handlers = Object.create(null); }

    on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); return this; }

    /* A room outlives the screens that listen to it — a rematch builds a whole
       new race over the same room. Without this, the finished one goes on
       listening and can still settle a round it is no longer part of. */
    off(event, fn) {
      const list = this.handlers[event];
      const i = list ? list.indexOf(fn) : -1;
      if (i >= 0) list.splice(i, 1);
      return this;
    }

    fire(event) {
      const args = Array.prototype.slice.call(arguments, 1);
      for (const fn of (this.handlers[event] || [])) {
        try { fn.apply(null, args); } catch (err) { console.error('[pv:net]', event, err); }
      }
    }
  }

  /* ------------------------------------------------------------------ host */

  /**
   * The host holds the room. It hands out seats, keeps the connections, and is
   * the only peer everyone else is connected to.
   *
   * A seat is taken from the CONNECTION, never from the message — otherwise any
   * peer could act for anybody at the table.
   */
  class Host extends Emitter {
    constructor() {
      super();
      this.code = null;
      this.peer = null;
      this.conns = new Map();       // peerId -> { conn, seat, name, level, alive }
      this.closed = false;
      this.seatsTaken = 1;          // seat 0 is the host
      this.maxPlayers = 2;
      this.locked = false;          // set once the game starts: no late joins
    }

    /** Claim a code. Retries on collision, which is why it loops. */
    async open(maxPlayers) {
      this.maxPlayers = Math.max(2, maxPlayers | 0);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        try {
          this.peer = await openPeer(idFor(code));
          this.code = code;
          break;
        } catch (err) {
          if (!err.codeTaken || attempt === 4) throw err;
        }
      }

      this.peer.on('connection', conn => this.accept(conn));
      this.peer.on('error', err => this.fire('error', translate(err)));
      this.peer.on('disconnected', () => {
        // The broker dropped us. Existing peers stay connected; only new joins
        // would fail, so reconnect quietly rather than alarming anyone.
        if (!this.closed) { try { this.peer.reconnect(); } catch (e) { /* nothing to do */ } }
      });
      return this.code;
    }

    accept(conn) {
      if (this.closed) return conn.close();
      const refuse = this.locked ? 'started'
        : (this.seatsTaken >= this.maxPlayers ? 'full' : null);
      if (refuse) {
        conn.on('open', () => {
          try { conn.send({ t: 'full', why: refuse }); } catch (e) { /* going anyway */ }
          setTimeout(() => { try { conn.close(); } catch (err) { /* fine */ } }, 300);
        });
        return;
      }
      const seat = this.seatsTaken++;
      const entry = { conn: conn, seat: seat, name: '', level: 1, alive: true };
      this.conns.set(conn.peer, entry);

      conn.on('open', () => {
        try { conn.send({ t: 'welcome', seat: seat, code: this.code }); }
        catch (e) { /* dropping */ }
      });
      conn.on('data', msg => this.receive(entry, msg));
      conn.on('close', () => this.drop(entry, 'left'));
      conn.on('error', () => this.drop(entry, 'lost'));
    }

    receive(entry, msg) {
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        entry.name = String(msg.name || '').slice(0, 20);
        entry.level = Math.max(1, msg.level | 0);
        this.fire('join', entry);
        return;
      }
      // Everything else is the room's business, with the seat stamped by us.
      this.fire('msg', entry.seat, msg);
    }

    drop(entry, why) {
      if (!this.conns.has(entry.conn.peer)) return;
      entry.alive = false;
      this.conns.delete(entry.conn.peer);
      // A seat is never reused. A rejoin under an old seat would inherit that
      // seat's half-played game, and a fresh chair is the simplest correct thing.
      this.fire('leave', entry, why);
    }

    send(seat, msg) {
      for (const e of this.conns.values()) {
        if (e.seat === seat && e.alive) {
          try { e.conn.send(msg); } catch (err) { /* dropping */ }
        }
      }
    }

    broadcast(msg, exceptSeat) {
      for (const e of this.conns.values()) {
        if (!e.alive || e.seat === exceptSeat) continue;
        try { e.conn.send(msg); } catch (err) { /* dropping */ }
      }
    }

    close(reason) {
      this.closed = true;
      try { this.broadcast({ t: 'bye', reason: reason || 'closed' }); } catch (e) { /* going anyway */ }
      setTimeout(() => {
        for (const e of this.conns.values()) { try { e.conn.close(); } catch (err) { /* fine */ } }
        try { this.peer && this.peer.destroy(); } catch (e) { /* fine */ }
      }, 200);
    }
  }

  /* ---------------------------------------------------------------- client */

  /** A guest. One connection, to the host, and nothing else. */
  class Client extends Emitter {
    constructor() {
      super();
      this.peer = null;
      this.conn = null;
      this.seat = -1;
      this.code = null;
      this.closed = false;
    }

    async join(code, hello) {
      this.code = String(code).trim();
      this.peer = await openPeer(undefined);
      this.peer.on('error', err => this.fire('error', translate(err)));

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };

        const conn = this.peer.connect(idFor(this.code), { reliable: true });
        this.conn = conn;

        const timer = setTimeout(
          () => finish(reject, new Error(t('net.errNoAnswer'))), CONNECT_TIMEOUT);

        conn.on('open', () => {
          try { conn.send(Object.assign({ t: 'hello' }, hello || {})); }
          catch (e) { /* the close path reports it */ }
        });
        conn.on('data', msg => {
          if (!msg || typeof msg.t !== 'string') return;
          if (msg.t === 'welcome') { this.seat = msg.seat; finish(resolve, msg); return; }
          if (msg.t === 'full') {
            finish(reject, new Error(msg.why === 'started' ? t('net.errStarted') : t('net.errFull')));
            return;
          }
          this.fire('msg', msg);
        });
        conn.on('close', () => {
          finish(reject, new Error(t('net.errHostClosed')));
          if (!this.closed) this.fire('bye', { reason: 'lost' });
        });
        conn.on('error', err => finish(reject, translate(err)));
        this.peer.on('error', err => finish(reject, translate(err)));
      });
    }

    send(msg) {
      try { this.conn && this.conn.send(msg); } catch (e) { /* the close handler reports it */ }
    }

    close() {
      this.closed = true;
      try { this.conn && this.conn.close(); } catch (e) { /* fine */ }
      try { this.peer && this.peer.destroy(); } catch (e) { /* fine */ }
    }
  }

  PV.Net = {
    PREFIX: PREFIX,
    available: available,
    ready: ready,
    newCode: newCode,
    idFor: idFor,
    Emitter: Emitter,
    Host: Host,
    Client: Client
  };

})(window.PV);
