/* PlayVault — the screen where a game becomes two people.

   Three states, one route (#/friends):

     home     nobody is in a room. Pick a game and open one, or type six
              digits and join one.
     lobby    a room exists and has not started. The code, who is in it, and —
              for the host alone — the Start button.
     playing  the room is mid-game. The screen offers the way back to it
              rather than pretending the room is idle.

   Everything that decides anything is in room.js; this file picks options,
   draws people, and reports failures in a sentence a player can act on. The
   room outlives this screen, so its listeners are attached once, to the room,
   and not on every repaint. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const el = PV.el;

  let picked = null;            // the game being set up, before the room exists
  let pickedOpts = {};
  let seats = 2;
  let busy = false;
  let note = '';                // the last thing that went wrong, said plainly
  let mount = null;
  let noLib = false;            // the library was waited for and never arrived

  /** Board games are two chairs. A race can hold a small crowd. */
  const seatChoices = g => (g && g.family === 'board' ? [2] : [2, 3, 4]);

  function repaint() {
    if (!mount || !mount.isConnected) return;
    PV.clear(mount);
    render(mount);
  }

  function fail(err) {
    busy = false;
    note = (err && err.message) || String(err || '');
    repaint();
  }

  /* ---------------------------------------------------------------- room */

  /** Attached once per room, because the screen comes and goes and it does not. */
  function wire(room) {
    if (room._friendsWired) return room;
    room._friendsWired = true;
    room.on('roster', repaint);
    room.on('joined', repaint);
    room.on('left', repaint);
    room.on('error', err => { note = (err && err.message) || ''; repaint(); });
    room.on('begin', msg => {
      // Everyone lands on the same game at the same moment, host included.
      // A rematch begins the game we are already looking at, and setting the
      // hash to the hash it already has fires nothing — so re-route by hand.
      const hash = '#/play/' + (msg.game || room.gameCode);
      if (location.hash === hash) PV.App.route();
      else PV.App.go(hash);
    });
    room.on('closed', reason => {
      note = reason === 'lost' ? t('room.hostLeft') : t('room.closed');
      repaint();
    });
    return room;
  }

  async function openRoom() {
    if (busy || !picked) return;
    busy = true; note = ''; repaint();
    try {
      const room = await PV.Room.host(picked.code, pickedOpts, seats);
      wire(room);
      busy = false;
      repaint();
    } catch (err) { fail(err); }
  }

  async function joinRoom(code) {
    if (busy) return;
    if (!/^\d{6}$/.test(String(code).trim())) { note = t('room.badCode'); repaint(); return; }
    busy = true; note = ''; repaint();
    try {
      const room = await PV.Room.join(String(code).trim());
      wire(room);
      busy = false;
      repaint();
    } catch (err) { fail(err); }
  }

  /* -------------------------------------------------------------- screen */

  PV.Friends = {
    screen(app) {
      mount = el('div', { class: 'screen' });
      app.appendChild(mount);
      render(mount);
    }
  };

  function render(wrap) {
    wrap.appendChild(el('div', { class: 'play-head' },
      el('button', { class: 'btn ghost back', onclick: () => PV.App.go('#/games') },
        '‹ ' + t('nav.back')),
      el('h2', {}, t('friends.title'))));

    if (note) wrap.appendChild(el('p', { class: 'notice' }, note));

    if (!PV.Net.available()) {
      if (!noLib) {
        // Still on its way. Say so, and repaint the moment it lands.
        wrap.appendChild(el('section', { class: 'panel' },
          el('p', { class: 'muted' }, t('net.checking'))));
        PV.Net.ready().then(arrived => { noLib = !arrived; repaint(); });
        return;
      }
      wrap.appendChild(el('section', { class: 'panel' },
        el('h3', {}, t('net.unavailable')),
        el('p', { class: 'muted small' }, t('net.unavailableHint')),
        el('div', { class: 'row-btns' },
          el('button', {
            class: 'btn ghost', onclick: () => { noLib = false; repaint(); }
          }, t('common.retry')))));
      return;
    }

    const room = PV.Room.current;
    if (room && !room.dead) { renderRoom(wrap, room); return; }
    renderHome(wrap);
  }

  /* ---- home: host one, or join one ---- */

  function renderHome(wrap) {
    wrap.appendChild(el('p', { class: 'muted' }, t('friends.how')));

    /* join */
    const input = el('input', {
      class: 'code-input mono', type: 'text', inputmode: 'numeric',
      maxlength: '6', placeholder: '000000', 'aria-label': t('room.codeLabel'),
      oninput: e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); },
      onkeydown: e => { if (e.key === 'Enter') joinRoom(input.value); }
    });
    wrap.appendChild(el('section', { class: 'panel' },
      el('h3', {}, t('friends.join')),
      el('p', { class: 'muted small' }, t('friends.joinHint')),
      el('div', { class: 'row-btns' },
        input,
        el('button', {
          class: 'btn primary', disabled: busy,
          onclick: () => joinRoom(input.value)
        }, busy ? t('room.connecting') : t('friends.joinBtn')))));

    /* host */
    const list = PV.Registry.playable();
    const grid = el('div', { class: 'pick-grid' });
    list.forEach(g => {
      grid.appendChild(el('button', {
        class: 'pick' + (picked && picked.code === g.code ? ' on' : ''),
        onclick: () => {
          picked = g;
          pickedOpts = defaultsFor(g);
          seats = seatChoices(g)[0];
          note = '';
          repaint();
        }
      },
        el('span', { class: 'icon', html: g.icon || '' }),
        el('span', { class: 'nm' }, g.name),
        el('span', { class: 'fam' }, t('family.' + g.family))));
    });

    const setup = el('div', { class: 'pick-setup' });
    if (picked) {
      setup.appendChild(PV.App.optionsBody(picked, pickedOpts, null, true));

      const choices = seatChoices(picked);
      if (choices.length > 1) {
        const seg = el('div', { class: 'seg' });
        choices.forEach(n => seg.appendChild(el('button', {
          class: 'seg-btn' + (seats === n ? ' on' : ''),
          onclick: () => { seats = n; repaint(); }
        }, t('room.seatsN', { n: n }))));
        setup.appendChild(el('div', { class: 'opt-row' },
          el('span', { class: 'k' }, t('room.seats')), seg));
      }
      setup.appendChild(el('p', { class: 'muted small' },
        picked.family === 'board' ? t('friends.boardHint') : t('friends.raceHint')));
      setup.appendChild(el('button', {
        class: 'btn primary', disabled: busy, onclick: openRoom
      }, busy ? t('room.opening') : t('friends.hostBtn')));
    }

    wrap.appendChild(el('section', { class: 'panel' },
      el('h3', {}, t('friends.host')),
      el('p', { class: 'muted small' }, t('friends.hostHint')),
      grid, setup));
  }

  /* ---- lobby: the room, before and during ---- */

  function renderRoom(wrap, room) {
    const g = PV.Registry.get(room.gameCode);
    const strip = PV.RoomUI.strip(room);

    const head = el('section', { class: 'panel room-panel' },
      PV.RoomUI.codeBox(room.code),
      el('p', { class: 'muted small' },
        room.isHost ? t('room.shareCode') : t('room.joinedAs', { n: room.seat + 1 })),
      el('div', { class: 'opt-row' },
        el('span', { class: 'k' }, t('room.game')),
        el('b', {}, g ? g.name : room.gameCode || '—')),
      strip.node);

    if (room.phase === 'playing') {
      head.appendChild(el('div', { class: 'row-btns' },
        el('button', {
          class: 'btn primary',
          onclick: () => PV.App.go('#/play/' + room.gameCode)
        }, t('room.rejoin')),
        leaveBtn(room)));
      wrap.appendChild(head);
      return;
    }

    const waiting = room.live().length < 2;
    if (room.isHost) {
      head.appendChild(el('p', { class: 'muted small' },
        waiting ? t('room.waitingForOne') : t('room.readyToStart', { n: room.live().length })));
      head.appendChild(el('div', { class: 'row-btns' },
        el('button', {
          class: 'btn primary', disabled: waiting,
          onclick: () => room.begin()
        }, t('room.start')),
        leaveBtn(room)));
    } else {
      head.appendChild(el('p', { class: 'muted small' }, t('room.waitingForHost')));
      head.appendChild(el('div', { class: 'row-btns' }, leaveBtn(room)));
    }

    wrap.appendChild(head);
  }

  function leaveBtn(room) {
    return el('button', {
      class: 'btn ghost danger',
      onclick: () => { room.leave('left'); note = ''; picked = null; repaint(); }
    }, room.isHost ? t('room.closeRoom') : t('room.leave'));
  }

  function defaultsFor(g) {
    const out = {};
    (g.options || []).forEach(o => { out[o.key] = o.def != null ? o.def : o.choices[0].value; });
    // Two people at one board are two people, never one of them and a computer.
    if (out.mode) out.mode = 'hotseat';
    return out;
  }

})(window.PV);
