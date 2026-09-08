/* PlayVault — the shell.

   Owns the four screens, the hash route, and the one contract every game is
   started through. It knows about families and options; it knows nothing about
   any particular game, and it must stay that way. The moment a screen
   special-cases a game code, the next game costs twice as much. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);
  const el = PV.el;

  let app = null;
  let live = null;                 // the running game's controller
  let pendingOpts = null;          // options chosen in the lobby sheet

  /* ------------------------------------------------------------------ theme */

  function applyTheme(name) {
    const theme = name === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    PV.Store.set('theme', theme);
  }

  /* ------------------------------------------------------------------ route */

  function go(hash) { location.hash = hash; }

  function parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'games' };
    if (parts[0] === 'play' && parts[1]) return { name: 'play', code: parts[1] };
    if (parts[0] === 'friends') return { name: 'friends' };
    if (parts[0] === 'stats' || parts[0] === 'settings') return { name: parts[0] };
    return { name: 'games' };
  }

  function route() {
    if (live) { live.destroy(); live = null; }
    const r = parseRoute();
    /* Walking away from an online game is leaving it. A room that outlived the
       screen would keep answering for a player who is no longer at the board. */
    if (r.name !== 'play' && r.name !== 'friends' && PV.Room.current) {
      PV.Room.current.leave('left');
    }
    PV.clear(app);
    PV.$$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === r.name));
    if (r.name === 'play') screenPlay(r.code);
    else if (r.name === 'friends') PV.Friends.screen(app);
    else if (r.name === 'stats') screenStats();
    else if (r.name === 'settings') screenSettings();
    else screenLobby();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ lobby */

  let filter = 'all';

  function screenLobby() {
    const wrap = el('div', { class: 'screen' });

    /* profile strip */
    const lv = PV.Profile.level();
    const pct = Math.round(lv.into / lv.need * 100);
    const strip = el('section', { class: 'profile-strip' },
      el('div', { class: 'avatar' }, String(lv.level)),
      el('div', { class: 'who' },
        el('button', {
          class: 'name-btn',
          title: t('profile.rename'),
          onclick: () => {
            const n = prompt(t('profile.namePrompt'), PV.Profile.data().name || '');
            if (n != null) { PV.Profile.setName(n); route(); }
          }
        }, PV.Profile.name()),
        el('div', { class: 'xpbar' }, el('i', { style: { width: pct + '%' } })),
        el('div', { class: 'muted small' },
          t('profile.level') + ' ' + lv.level + ' · ' +
          t('profile.next', { n: lv.need - lv.into, lvl: lv.level + 1 }))
      )
    );
    wrap.appendChild(strip);

    /* play with friends */
    wrap.appendChild(el('section', { class: 'friends-cta' },
      el('div', {},
        el('h3', {}, t('friends.title')),
        el('p', { class: 'muted small' }, t('friends.blurb'))),
      el('button', { class: 'btn primary', onclick: () => go('#/friends') }, t('friends.open'))
    ));

    /* family filter */
    const fams = ['all'].concat(PV.Registry.FAMILIES);
    const tabs = el('div', { class: 'seg tabs' });
    fams.forEach(f => {
      tabs.appendChild(el('button', {
        class: 'seg-btn' + (filter === f ? ' on' : ''),
        onclick: () => { filter = f; route(); }
      }, t('family.' + f)));
    });
    wrap.appendChild(tabs);

    /* game grid */
    const list = PV.Registry.byFamily(filter);
    const grid = el('div', { class: 'game-grid' });
    if (!list.length) grid.appendChild(el('p', { class: 'muted' }, t('lobby.empty')));
    list.forEach(g => grid.appendChild(gameCard(g)));
    wrap.appendChild(grid);

    app.appendChild(wrap);
  }

  function gameCard(g) {
    const rec = PV.Profile.forGame(g.code);
    const card = el('article', { class: 'game-card' + (g.soon ? ' soon' : '') });

    card.appendChild(el('div', { class: 'icon', html: g.icon || '' }));
    card.appendChild(el('h3', {}, g.name));
    card.appendChild(el('p', { class: 'blurb' }, g.blurb));

    const foot = el('div', { class: 'card-foot' });
    if (g.soon) {
      foot.appendChild(el('span', { class: 'badge' }, t('lobby.soon')));
    } else {
      if (rec.played) {
        const best = rec.bestTimeMs ? PV.fmtTime(rec.bestTimeMs)
          : (rec.bestScore ? PV.fmtNum(rec.bestScore) : null);
        foot.appendChild(el('span', { class: 'muted small' },
          t('stats.played') + ' ' + rec.played + (best ? ' · ' + t('common.best') + ' ' + best : '')));
      }
      foot.appendChild(el('button', {
        class: 'btn primary',
        onclick: () => launch(g)
      }, t('lobby.play')));
    }
    card.appendChild(foot);
    return card;
  }

  /** Games with options get a sheet first; games without go straight in. */
  function launch(g) {
    if (!(g.options || []).length) { pendingOpts = {}; go('#/play/' + g.code); return; }
    openSheet(g);
  }

  function defaultsFor(g) {
    const out = {};
    (g.options || []).forEach(o => { out[o.key] = o.def != null ? o.def : o.choices[0].value; });
    return out;
  }

  /**
   * The option rows for one game, writing into `chosen` as they are pressed.
   * Shared with the friends screen so a room is set up the same way a solo game
   * is — and so a new option appears in both places at once.
   *
   * `solo` options (vs computer / pass-and-play) are skipped in a room: the
   * opponent is a person on another device, which is the whole point.
   */
  function optionsBody(g, chosen, onChange, inRoom) {
    const body = el('div', { class: 'sheet-body' });
    function paint() {
      PV.clear(body);
      (g.options || []).forEach(o => {
        if (inRoom && o.solo) return;
        if (o.showIf && !o.showIf(chosen)) return;
        const row = el('div', { class: 'opt-row' }, el('span', { class: 'k' }, t(o.labelKey)));
        const seg = el('div', { class: 'seg' });
        o.choices.forEach(c => {
          seg.appendChild(el('button', {
            class: 'seg-btn' + (chosen[o.key] === c.value ? ' on' : ''),
            onclick: () => { chosen[o.key] = c.value; paint(); if (onChange) onChange(chosen); }
          }, t(c.labelKey)));
        });
        row.appendChild(seg);
        body.appendChild(row);
      });
    }
    paint();
    return body;
  }

  function openSheet(g) {
    const chosen = defaultsFor(g);
    const body = optionsBody(g, chosen, null, false);

    const modal = el('div', { class: 'modal', onclick: e => { if (e.target === modal) modal.remove(); } },
      el('div', { class: 'sheet' },
        el('h3', {}, g.name),
        body,
        el('div', { class: 'sheet-foot' },
          el('button', { class: 'btn ghost', onclick: () => modal.remove() }, t('common.cancel')),
          el('button', {
            class: 'btn primary',
            onclick: () => { pendingOpts = chosen; modal.remove(); go('#/play/' + g.code); }
          }, t('common.start'))
        )
      )
    );
    document.body.appendChild(modal);
  }

  /* ------------------------------------------------------------------- play */

  function screenPlay(code) {
    const g = PV.Registry.get(code);
    if (!g || g.soon) { go('#/games'); return; }

    /* An online room brings its own game, its own options and its own seed —
       all three come from the host, so nobody is playing a different deal. */
    const room = (PV.Room.current && PV.Room.current.phase === 'playing'
      && PV.Room.current.gameCode === code) ? PV.Room.current : null;

    const opts = room ? room.opts : (pendingOpts || defaultsFor(g));
    pendingOpts = null;

    const host = el('div', { class: 'game-host' });
    const wrap = el('div', { class: 'screen play' },
      el('div', { class: 'play-head' },
        el('button', {
          class: 'btn ghost back',
          onclick: () => go(room ? '#/friends' : '#/games')
        }, '‹ ' + t('nav.back')),
        el('h2', {}, g.name)),
      host);
    app.appendChild(wrap);

    // Declared before ctx: its methods close over this binding and a `let`
    // further down would still be in its dead zone when the game starts.
    let race = null;

    const ctx = {
      code: code,
      opts: opts,
      host: host,
      room: room,
      /* The one place a game asks for randomness. In a room it is the host's
         seed, which is what makes "the same deal for everybody" true without a
         single game knowing anything about the room. */
      seed: () => (room ? room.seed >>> 0 : PV.newSeed()),
      record: outcome => {
        const rec = PV.Profile.record(code, outcome);
        if (race) race.report(outcome);
        return rec;
      },
      exit: () => go('#/games'),
      /* In a race the game's own end card is held until the table is in, so
         gameOver goes through the race and panel() is the raw one. */
      gameOver: panel => (race ? race.showLocal(panel) : showGameOver(wrap, panel)),
      panel: panel => showGameOver(wrap, panel)
    };

    /* Board games are host-authority and handle their room inside the board
       harness. Everything else races the same seed. The family decides, so no
       screen ever names a game. */
    if (room && g.family !== 'board') {
      race = PV.Race(ctx, room, { metric: g.family === 'puzzle' ? 'time' : 'score' });
      ctx.race = race;
    }

    const started = g.start(host, ctx) || { destroy() {} };
    live = {
      destroy() {
        if (race) race.destroy();
        started.destroy();
      }
    };
  }

  /** One end-of-game panel for every game, so the shape never surprises. */
  function showGameOver(wrap, panel) {
    const old = wrap.querySelector('.over-layer');
    if (old) old.remove();
    const actions = el('div', { class: 'over-actions' });
    // `again: false` — not merely absent — is a game that cannot be replayed
    // from here: an abandoned room, or a race waiting on the other players.
    if (panel.again !== false) {
      actions.appendChild(el('button', {
        class: 'btn primary',
        onclick: () => { layer.remove(); if (panel.again) panel.again(); }
      }, panel.againLabel || t('result.again')));
    }
    actions.appendChild(el('button', {
      class: 'btn ghost', onclick: () => go('#/games')
    }, panel.exitLabel || t('result.toLobby')));

    const layer = el('div', { class: 'over-layer' },
      el('div', { class: 'over-card tone-' + (panel.tone || 'flat') },
        el('h3', {}, panel.title || ''),
        el('div', { class: 'over-lines' },
          (panel.lines || []).filter(Boolean).map(line => el('div', {}, line))),
        actions));
    wrap.appendChild(layer);
  }

  /* ------------------------------------------------------------------ stats */

  function screenStats() {
    const totals = PV.Profile.totals();
    const wrap = el('div', { class: 'screen' }, el('h2', {}, t('stats.title')));

    wrap.appendChild(el('div', { class: 'tiles' },
      tile(t('stats.totalGames'), PV.fmtNum(totals.played)),
      tile(t('stats.totalTime'), PV.fmtTime(totals.timeMs)),
      tile(t('profile.level'), String(PV.Profile.level().level))
    ));

    const rows = PV.Registry.playable()
      .map(g => ({ g: g, r: PV.Profile.forGame(g.code) }))
      .filter(x => x.r.played > 0);

    if (!rows.length) {
      wrap.appendChild(el('p', { class: 'muted' }, t('stats.empty')));
    } else {
      const table = el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, t('stats.game')),
          el('th', {}, t('stats.played')),
          el('th', {}, t('stats.won')),
          el('th', {}, t('stats.best')),
          el('th', {}, t('stats.time')))),
        el('tbody', {}, rows.map(x => el('tr', {},
          el('td', {}, x.g.name),
          el('td', {}, String(x.r.played)),
          el('td', {}, String(x.r.won)),
          el('td', { class: 'mono' }, x.r.bestTimeMs ? PV.fmtTime(x.r.bestTimeMs)
            : (x.r.bestScore ? PV.fmtNum(x.r.bestScore) : '—')),
          el('td', { class: 'mono' }, PV.fmtTime(x.r.timeMs))
        ))));
      wrap.appendChild(el('div', { class: 'table-wrap' }, table));
      wrap.appendChild(el('button', {
        class: 'btn ghost danger',
        onclick: () => { if (confirm(t('stats.resetAsk'))) { PV.Profile.resetStats(); route(); } }
      }, t('stats.reset')));
    }

    app.appendChild(wrap);
  }

  function tile(k, v) {
    return el('div', { class: 'tile' }, el('span', { class: 'k' }, k), el('b', {}, v));
  }

  /* --------------------------------------------------------------- settings */

  function screenSettings() {
    const wrap = el('div', { class: 'screen' }, el('h2', {}, t('settings.title')));

    /* appearance */
    const theme = PV.Store.get('theme', 'dark');
    wrap.appendChild(el('section', { class: 'panel' },
      el('h3', {}, t('settings.appearance')),
      el('div', { class: 'opt-row' },
        el('span', { class: 'k' }, t('settings.theme')),
        seg([['dark', t('settings.dark')], ['light', t('settings.light')]], theme,
          v => { applyTheme(v); route(); })),
      el('div', { class: 'opt-row' },
        el('span', { class: 'k' }, t('settings.language')),
        seg(PV.I18n.LANGS.map(l => [l, PV.I18n.name(l)]), PV.I18n.lang,
          v => PV.I18n.set(v)))
    ));

    /* data */
    const msg = el('p', { class: 'muted small', hidden: true });
    const file = el('input', {
      type: 'file', accept: 'application/json', class: 'hidden-file',
      onchange: e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          let parsed = null;
          try { parsed = JSON.parse(fr.result); } catch (err) { parsed = null; }
          if (!parsed) return say(t('settings.importBadJson'));
          const res = PV.Store.importAll(parsed);
          if (!res.ok) return say(t('settings.importBadFormat'));
          say(t('settings.importOk', { n: res.restored }));
          setTimeout(route, 900);
        };
        fr.readAsText(f);
        e.target.value = '';
      }
    });
    function say(m) { msg.textContent = m; msg.hidden = false; }

    wrap.appendChild(el('section', { class: 'panel' },
      el('h3', {}, t('settings.data')),
      el('p', { class: 'muted small' }, t('settings.dataHint')),
      el('div', { class: 'row-btns' },
        el('button', { class: 'btn ghost', onclick: doExport }, t('settings.export')),
        el('button', { class: 'btn ghost', onclick: () => file.click() }, t('settings.import'))),
      file, msg
    ));

    wrap.appendChild(el('section', { class: 'panel' },
      el('h3', {}, t('settings.about')),
      el('p', { class: 'muted small' }, t('settings.aboutText')),
      el('p', { class: 'muted small mono' }, 'PlayVault · ' + t('app.tagline'))
    ));

    app.appendChild(wrap);
  }

  function seg(pairs, value, onPick) {
    const box = el('div', { class: 'seg' });
    pairs.forEach(p => {
      box.appendChild(el('button', {
        class: 'seg-btn' + (value === p[0] ? ' on' : ''),
        onclick: () => onPick(p[0])
      }, p[1]));
    });
    return box;
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(PV.Store.exportAll(), null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'playvault-data.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    app = PV.$('#app');
    PV.I18n.init();
    PV.Registry.localize();
    PV.I18n.apply();
    applyTheme(PV.Store.get('theme', 'dark'));

    window.addEventListener('hashchange', route);
    document.addEventListener('pv:lang', () => {
      PV.Registry.localize();
      PV.I18n.apply();
      route();
    });

    route();
  }

  // Published before boot(), because the first screen drawn may already be the
  // friends screen and it reads PV.App on the way in.
  PV.App = { route: route, go: go, optionsBody: optionsBody, defaultsFor: defaultsFor };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.PV);
