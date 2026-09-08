/* PlayVault — the bits of a room that are drawn.

   room.js is deliberately DOM-free so the message handling can be driven
   headless. Everything visual about a room lives here instead, and it is
   shared by the friends screen, the online board harness and the race
   harness, so a player strip looks and behaves the same wherever it appears.

   Nothing here decides anything. It renders what it is handed. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const el = PV.el;

  /**
   * A row of player chips. Call update() with { seat -> {text, tone, rank} } to
   * put a value beside each name — a score, a time, "your turn", "waiting".
   *
   * The strip rebuilds on update rather than diffing: six chips is nothing, and
   * a diffing strip is one more thing that can disagree with the roster.
   */
  function strip(room, opts) {
    const o = opts || {};
    const node = el('div', { class: 'room-strip' + (o.compact ? ' compact' : '') });
    let values = {};

    function paint() {
      PV.clear(node);
      const list = room.members.slice().sort((a, b) => a.seat - b.seat);
      for (const m of list) {
        const v = values[m.seat] || {};
        const chip = el('div', {
          class: 'pchip'
            + (m.seat === room.seat ? ' me' : '')
            + (m.alive ? '' : ' gone')
            + (v.tone ? ' ' + v.tone : '')
        });
        if (v.rank) chip.appendChild(el('span', { class: 'medal' }, medal(v.rank)));
        chip.appendChild(el('span', { class: 'lv' }, String(m.level || 1)));
        chip.appendChild(el('span', { class: 'nm' },
          m.name + (m.seat === room.seat ? ' (' + t('common.you') + ')' : '')));
        if (m.host) chip.appendChild(el('span', { class: 'tag' }, t('room.host')));
        if (!m.alive) chip.appendChild(el('span', { class: 'tag bad' }, t('room.gone')));
        else if (v.text) chip.appendChild(el('span', { class: 'val' }, v.text));
        node.appendChild(chip);
      }
    }

    paint();
    return {
      node: node,
      update(next) { values = next || {}; paint(); },
      repaint: paint
    };
  }

  function medal(rank) {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  }

  /** The room code, big enough to read out over the phone, with a copy button. */
  function codeBox(code) {
    const said = el('span', { class: 'muted small', hidden: true }, t('common.copied'));
    const box = el('div', { class: 'code-box' },
      el('div', {},
        el('span', { class: 'k' }, t('room.codeLabel')),
        el('b', { class: 'code mono' }, String(code).replace(/(\d{3})(\d{3})/, '$1 $2'))),
      el('div', { class: 'row-btns' },
        el('button', {
          class: 'btn ghost',
          onclick: () => {
            const done = () => { said.hidden = false; setTimeout(() => { said.hidden = true; }, 1600); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(String(code)).then(done, () => { /* the code is on screen anyway */ });
            } else { done(); }
          }
        }, t('common.copy')),
        said));
    return box;
  }

  /**
   * A banner across the top of a game that is being played with other people:
   * the code, the player strip, and a line of status. One shape for both
   * families, so an online game always says the same things in the same place.
   */
  function gameBar(room) {
    const line = el('div', { class: 'room-line muted small' });
    const players = strip(room, { compact: true });
    const node = el('div', { class: 'room-bar' },
      el('div', { class: 'room-bar-head' },
        el('span', { class: 'chip mono' }, '#' + room.code),
        line),
      players.node);

    /* No roster listener of its own: whoever mounts this bar is already
       repainting on the roster, and two listeners would fight over the values. */
    return {
      node: node,
      players: players,
      say(text, tone) {
        line.textContent = text || '';
        line.className = 'room-line small ' + (tone === 'you' ? 'you' : 'muted');
      }
    };
  }

  PV.RoomUI = { strip: strip, codeBox: codeBox, gameBar: gameBar, medal: medal };

})(window.PV);
