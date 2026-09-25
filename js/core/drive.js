/* PlayVault — the copy that lives in Google Drive.

   Ported from CardVerse's drive.js, the canonical copy for every GameHub
   game (its docs/GAMEHUB.md says why, and asks for fixes to be ported back
   there). The hard-won parts are CardVerse's and are kept as they were: the
   four sign-in guards, the per-player folder found by name, the multipart
   create. What is PlayVault's own:

   - Google's sign-in library is fetched here, when it is first needed,
     instead of by a tag on every page. It is the one script this app runs
     that cannot be pinned by hash — Google serves it unversioned — so a
     player who never opens Settings and never turns auto-save on never runs
     it. SECURITY.md has the rest.
   - Every word goes through PV.t(), so it speaks both languages.
   - The file work is queued, so a press and an automatic save can never both
     find no file and each create one.

   localStorage stays the working store: instant, offline, no account, and
   PlayVault is whole without this file. Drive is the second copy — the one
   that survives a cleared browser and can be pulled onto another device.

   What goes up is exactly what Export writes, PV.Store.exportAll(), and what
   comes down goes through exactly what Import uses, PV.Store.importAll(),
   which rebuilds it rather than trusting it. One format, three ways in.

   The scope is `drive.file`: only files this app made. It cannot list, read
   or touch anything else in anybody's Drive, and needs no review by Google. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  const t = (k, p) => window.PV.t(k, p);

  const LIBRARY = 'https://accounts.google.com/gsi/client';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  const MAX_BYTES = 4 * 1024 * 1024;        // a real save is a few kB

  const AUTO_KEY = 'drive.auto';            // device settings, like theme:
  const STAMP_KEY = 'drive.lastPush';       // never in the backup itself
  const AUTO_WAIT = 60000;

  PV.Store.validate(AUTO_KEY, v => v === true);
  PV.Store.validate(STAMP_KEY, v => {
    const s = PV.Safe.str(v, 40, '');
    return s && !isNaN(new Date(s).getTime()) ? s : undefined;
  });

  const cfg = () => PV.DriveConfig || null;

  function configured() {
    const c = cfg();
    return !!c && /\.apps\.googleusercontent\.com$/.test(c.clientId || '')
      && !!c.folderName && !!c.filename;
  }

  /** Null when Drive can work from here; otherwise why not, in words. */
  function unusable() {
    if (!configured()) return t('drive.notSetUp');
    // A file opened off disk has no origin, and Google signs nothing in
    // without one. Everything else in PlayVault works from there.
    if (window.location && window.location.protocol === 'file:') return t('drive.fromFile');
    return null;
  }

  /* ------------------------------------------------------------ signing in */

  let token = null;
  let tokenExpires = 0;
  let tokenClient = null;
  let pending = null;       // the request the token client is answering now

  /* The guards CardVerse took from MiniShoppingMall, each for a way this hung
     in a real game rather than in theory. The fourth, `prompt: 'none'`, is
     explained at authorize().

       inFlight   a second request used to replace the first one's callback
                  and leave that promise pending for ever.
       silentOff  once Google refuses a silent token, stop asking. Asking
                  again a minute later is exactly the call that pops a
                  sign-in window in the middle of a game.
       timeout    in request(): a window closed the wrong way calls neither
                  callback, and would wedge auto-save for the session. */
  let inFlight = null;
  let silentOff = false;

  /* The player's folder and their file in it, once found. Cached so a save
     is one call rather than three, and forgotten whenever a sign-in window
     comes back — the one moment the account can change under us, when ids
     kept from before would point into somebody else's Drive. */
  let folderId = null;
  let fileId = null;

  const valid = () => !!token && Date.now() < tokenExpires - 60000;

  const oauth2 = () => (window.google && window.google.accounts
    && window.google.accounts.oauth2) || null;

  let loading = null;

  /** Google's sign-in library, fetched the first time anything needs it. */
  function library() {
    const ready = oauth2();
    if (ready) return Promise.resolve(ready);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      function fail() {
        tag.remove();
        loading = null;                     // the next press tries again
        reject(new Error(t('drive.noLibrary')));
      }
      tag.src = LIBRARY;
      tag.async = true;
      tag.onload = () => { const lib = oauth2(); if (lib) resolve(lib); else fail(); };
      tag.onerror = fail;
      document.head.appendChild(tag);
    });
    return loading;
  }

  /**
   * Fetch the library before anyone presses anything. A browser only lets a
   * page open a window while the click that asked for it is fresh, and some
   * (Safari) count a network round trip in between as not fresh at all — so
   * the sign-in window has to be opened by the press itself, with the
   * library already here. The Settings screen calls this as it draws.
   */
  function warm() {
    if (unusable() || oauth2()) return;
    library().catch(() => {});              // the press that needs it says why
  }

  /**
   * A token, silently if Google already knows the answer.
   *
   * `prompt: 'none'`, never `''`: the empty string does not promise silence,
   * and with two Google accounts signed in Google shows the account chooser
   * anyway — which is how an automatic save once took the window away from
   * the game. 'none' tells Google to answer or fail, never to show anything.
   * A press passes no prompt at all, so a player who already agreed is not
   * asked to agree again every time.
   */
  function authorize(interactive) {
    if (valid()) return Promise.resolve(token);
    if (!interactive && silentOff) return Promise.reject(new Error(t('drive.silentRefused')));
    if (inFlight) return inFlight;

    // Straight on when the library is here, so the window opens inside the
    // click; otherwise fetch it first and hope the click is still fresh.
    const lib = oauth2();
    const promise = lib ? request(lib, interactive, false)
      : library().then(l => request(l, interactive, true));
    inFlight = promise;
    promise.catch(() => {}).then(() => { if (inFlight === promise) inFlight = null; });
    return promise;
  }

  function request(lib, interactive, late) {
    return new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const mine = {};
      const settle = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (pending === mine) pending = null;
        fn(value);
      };

      mine.token = response => {
        if (!response || response.error || !response.access_token) {
          const code = PV.Safe.str(response && response.error, 60, 'no_token');
          // access_denied is both a Cancel and Google refusing an account
          // that is not on the test list while the consent screen is still
          // in Testing. "You cancelled" sends the second kind hunting for a
          // mistake they did not make, so the words allow for both.
          if (/access_denied|user_cancel/i.test(code)) return settle(reject, new Error(t('drive.denied')));
          return settle(reject, new Error(t('drive.refused', { code: code })));
        }
        // Google's consent screen lets a player untick Drive and still sign
        // in. Saying so now beats a 403 from the folder a moment later.
        if (typeof lib.hasGrantedAllScopes === 'function' && !lib.hasGrantedAllScopes(response, SCOPE)) {
          return settle(reject, new Error(t('drive.noScope')));
        }
        token = String(response.access_token);
        tokenExpires = Date.now() + PV.Safe.num(response.expires_in, 60, 86400, 3600) * 1000;
        if (interactive) { folderId = null; fileId = null; }
        silentOff = false;
        settle(resolve, token);
      };

      mine.error = err => {
        const type = (err && err.type) || '';
        // A silent attempt fails through here too, and it never opened a
        // window — saying one was closed sent people looking for it.
        if (!interactive) return settle(reject, new Error(t('drive.silentRefused')));
        if (type === 'popup_closed') return settle(reject, new Error(t('drive.popupClosed')));
        // Fetched after the press, and the browser no longer counted the
        // window as asked for. The library is here now; the next press works.
        settle(reject, new Error(t(late ? 'drive.pressAgain' : 'drive.popupBlocked')));
      };

      timer = setTimeout(() => settle(reject, new Error(t('drive.noAnswer'))),
        interactive ? 120000 : 15000);

      try {
        // One client for the page, with callbacks that hand each answer to
        // whichever request is waiting — given to Google once, up front.
        if (!tokenClient) {
          tokenClient = lib.initTokenClient({
            client_id: cfg().clientId,
            scope: SCOPE,
            callback: r => { if (pending) pending.token(r); },
            error_callback: e => { if (pending) pending.error(e); }
          });
        }
        pending = mine;
        tokenClient.requestAccessToken(interactive ? {} : { prompt: 'none' });
      } catch (err) {
        settle(reject, err);
      }
    });
  }

  /* --------------------------------------------------------- talking to Drive */

  /**
   * Every Drive call goes through here. A 401 means the token went stale in
   * flight, which is normal after an hour and worth one silent retry rather
   * than an error in someone's face.
   */
  async function call(url, options, retrying) {
    const opts = options || {};
    let response;
    try {
      response = await fetch(url, Object.assign({}, opts, {
        headers: Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token })
      }));
    } catch (e) {
      throw new Error(t('drive.offline'));
    }

    if (response.status === 401 && !retrying) {
      token = null;
      await authorize(false);
      return call(url, opts, true);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = PV.Safe.obj(await response.json());
        const e = body && PV.Safe.obj(body.error);
        detail = e ? PV.Safe.str(e.message, 200, '') : '';
      } catch (e) { /* a body that is not JSON says nothing more */ }

      if (response.status === 403 && /quota|storage/i.test(detail)) throw new Error(t('drive.full'));
      if (response.status === 403 && /insufficient|permission|scope/i.test(detail)) {
        throw new Error(t('drive.noScope'));
      }
      if (response.status === 404) {
        // Both are made by this app in the player's own Drive, so a 404 is
        // one of them deleted since we cached its id. Forget both, and the
        // next press looks again and writes a fresh one.
        folderId = null;
        fileId = null;
        throw new Error(t('drive.gone'));
      }
      throw new Error(t('drive.httpError', { status: response.status }) + (detail ? ' ' + detail : ''));
    }
    return response;
  }

  /** An id out of a Drive answer, or null. It goes into URLs, so it is
      checked for shape rather than taken as it came. */
  function firstId(body) {
    const b = PV.Safe.obj(body);
    const item = b && Array.isArray(b.files) ? PV.Safe.obj(b.files[0]) : b;
    const id = item && item.id;
    return typeof id === 'string' && /^[\w-]{1,200}$/.test(id) ? id : null;
  }

  /* The names come from drive-config.js, never from a player, and they are
     put into a query between quotes. This makes a careless edit to that file
     fail loudly rather than quietly widen the query. */
  function named(s) {
    if (/['\\]/.test(s)) throw new Error('drive-config.js: a name may not contain quotes or backslashes');
    return s;
  }

  /**
   * The player's own folder — found in whichever Drive just signed in, or,
   * when `make` is set, made there the first time. `drive.file` narrows the
   * search to folders this app made, so it can only ever match this
   * player's, even though every player's folder has the same name. That is
   * the whole of what makes the save per-player, and why the config holds a
   * name and no id. Only a save makes one: a load that finds nothing has
   * nothing to leave behind in somebody's Drive.
   */
  async function findFolder(make) {
    if (folderId) return folderId;
    const q = encodeURIComponent("name = '" + named(cfg().folderName) + "' and mimeType = '"
      + FOLDER + "' and trashed = false");
    folderId = firstId(await (await call(API + '/files?q=' + q + '&fields=files(id)&pageSize=1')).json());
    if (folderId || !make) return folderId;

    // No parent: it lands at the top of their My Drive, where they can see it.
    const made = await call(API + '/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cfg().folderName, mimeType: FOLDER })
    });
    folderId = firstId(await made.json());
    if (!folderId) throw new Error(t('drive.httpError', { status: 'folder' }));
    return folderId;
  }

  /** This game's file in that folder, or null when there is none yet. */
  async function findFile(make) {
    if (fileId) return fileId;
    const parent = await findFolder(make);
    if (!parent) return null;
    const q = encodeURIComponent("'" + parent + "' in parents and name = '"
      + named(cfg().filename) + "' and trashed = false");
    fileId = firstId(await (await call(API + '/files?q=' + q + '&fields=files(id)&pageSize=1')).json());
    return fileId;
  }

  /** The file's contents, or null when it is not JSON or is far too big to
      be a save — parsing that would freeze the tab before anything asked. */
  async function readFile(id) {
    const response = await call(API + '/files/' + id + '?alt=media');
    // Refused on its declared size before it is downloaded, where Drive says;
    // on its real size before it is parsed, always.
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES) return null;
    const text = await response.text();
    if (text.length > MAX_BYTES) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  async function modifiedAt(id) {
    const body = PV.Safe.obj(await (await call(API + '/files/' + id + '?fields=modifiedTime')).json());
    const d = new Date(body ? PV.Safe.str(body.modifiedTime, 40, '') : '');
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Created the first time, overwritten every time after: a mirror of this
   * browser, not an archive. The create is multipart because the name and
   * folder have to arrive with the content, or the file lands at the top of
   * My Drive instead of in the folder.
   */
  async function writeFile(envelope) {
    const body = JSON.stringify(envelope, null, 2);
    const id = await findFile(true);
    if (id) {
      await call(UPLOAD + '/files/' + id + '?uploadType=media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body
      });
      return id;
    }

    const boundary = 'playvault-' + Math.random().toString(36).slice(2);
    // findFile() has just resolved the folder, so this costs no call.
    const meta = { name: cfg().filename, parents: [await findFolder(true)], mimeType: 'application/json' };
    const multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(meta)
      + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n'
      + body
      + '\r\n--' + boundary + '--';
    const made = await call(UPLOAD + '/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: multipart
    });
    fileId = firstId(await made.json());
    return fileId;
  }

  /* One piece of file work at a time. Two writers that both look before
     either has written would both find no file and both create one — and
     Drive allows two files of the same name side by side. */
  let queue = Promise.resolve();
  function serial(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }

  /* ------------------------------------------------------- the two directions */

  /**
   * To Drive. Must be called from the click itself: a press is the
   * permission to open a sign-in window, and authorize() is reached before
   * anything here waits. Never rejects; `ui.say` gets the outcome.
   */
  async function push(ui) {
    const why = unusable();
    if (why) return ui.say(why);
    try {
      await authorize(true);
      await serial(() => writeFile(PV.Store.exportAll()));
      remember();
      ui.say(t('drive.saved'));
    } catch (err) {
      ui.say(t('drive.pushFailed', { why: err.message }));
    }
  }

  /**
   * From Drive. This is the dangerous direction — it replaces what is
   * here — so it says what is in both copies and asks before it changes
   * anything. Same rule about the click as push().
   */
  async function pull(ui) {
    const why = unusable();
    if (why) return ui.say(why);
    try {
      await authorize(true);
      const found = await serial(async () => {
        const id = await findFile(false);
        if (!id) return null;
        return { envelope: await readFile(id), when: await modifiedAt(id) };
      });
      if (!found) return ui.say(t('drive.nothing'));
      const env = found.envelope;
      if (!env || typeof env !== 'object' || env.format !== PV.Store.FORMAT) return ui.say(t('drive.notOurs'));

      const ask = t('drive.replaceAsk', {
        drive: summary(env),
        when: found.when ? dmy(found.when, true) : t('drive.unknownDate'),
        here: summary(PV.Store.exportAll())
      });
      if (!(ui.confirm ? ui.confirm(ask) : window.confirm(ask))) return ui.say('');

      const res = PV.Store.importAll(env);
      if (!res.ok) return ui.say(t('drive.notOurs'));
      ui.say(t('settings.importOk', { n: res.restored }));
      if (ui.restored) ui.restored(res);
    } catch (err) {
      ui.say(t('drive.pullFailed', { why: err.message }));
    }
  }

  /* -------------------------------------------------------------- auto-save */

  /* Off by default, and it has to be: the promise of this file is that
     nothing leaves the browser unless someone asks. Two rules keep it from
     being a nuisance once it is on. It never opens a sign-in window — if the
     token has lapsed it stands down and the status line says to press the
     button. And it waits for things to settle: a copy goes up a minute after
     the last change, not one per move. */
  let autoTimer = null;

  const autoOn = () => PV.Store.get(AUTO_KEY, false) === true;

  function setAuto(on) {
    PV.Store.set(AUTO_KEY, !!on);
    if (on) schedule(); else clearTimeout(autoTimer);
    paint();
  }

  /** store.js calls this whenever a backed-up store changes. */
  function schedule() {
    if (!autoOn() || unusable()) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(run, AUTO_WAIT);
  }

  async function run() {
    if (!autoOn() || unusable()) return;

    // A token lasts about an hour and lives in memory, so a reload loses it.
    // Ask Google for a new one without a window: where the grant stands it
    // comes back silently; where it does not, stand down for the session and
    // let the status line ask for one press. Only while the tab is actually
    // being looked at — nothing should wake a background tab into sign-in.
    if (!valid()) {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      try {
        await authorize(false);
      } catch (err) {
        silentOff = true;
        paint();
        return;
      }
    }

    try {
      await serial(() => writeFile(PV.Store.exportAll()));
      remember();
    } catch (err) {
      // Nobody asked for this one, so it gets no dialog. The status line
      // going stale is the honest signal, and a press gives the real error.
      paint();
    }
  }

  /* ---------------------------------------------------------- the status line */

  function remember() {
    PV.Store.set(STAMP_KEY, new Date().toISOString());
    paint();
  }

  /** "25 Sep 2026" — a month name cannot be misread the way 04/09 can —
      and "25 Sep 2026, 14:05" when which copy is newer may be a matter of
      hours. */
  function dmy(date, withTime) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return t('drive.unknownDate');
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const zh = !!PV.I18n && PV.I18n.lang === 'zh';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = zh ? y + '年' + (m + 1) + '月' + d + '日' : d + ' ' + MONTHS[m] + ' ' + y;
    if (!withTime) return day;
    const pad = n => String(n).padStart(2, '0');
    return day + (zh ? ' ' : ', ') + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /**
   * One sentence under the buttons, and a tone for its colour. What must
   * never happen is a broken backup and a quiet status line — that one case
   * is the reason this exists — so every failure mode has words.
   */
  function status() {
    const why = unusable();
    if (why) return { tone: 'none', text: why };

    const iso = PV.Store.get(STAMP_KEY, null);
    if (!iso) {
      // Auto cannot make the first copy: Google only signs anyone in when
      // they ask it to. Say what to do, not merely what is true.
      return autoOn() ? { tone: 'warn', text: t('drive.autoFirst') }
        : { tone: 'none', text: t('drive.never') };
    }

    const then = new Date(iso);
    const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.max(0, Math.round((midnight(new Date()) - midnight(then)) / 86400000));
    const when = days === 0 ? t('drive.today') : days === 1 ? t('drive.yesterday')
      : t('drive.daysAgo', { n: days });

    if (autoOn() && silentOff) return { tone: 'warn', text: t('drive.autoNeedsPress', { when: when }) };
    // A week without a copy is worth interrupting for; anything less is not.
    if (days >= 7) return { tone: 'warn', text: t('drive.stale', { when: when, date: dmy(then) }) };
    return { tone: 'ok', text: t('drive.inDrive', { when: when, date: dmy(then) }) };
  }

  /** What a backup holds, in words, for the question before a restore. The
      envelope may have come from Drive, so it is rebuilt before it is read. */
  function summary(envelope) {
    const env = PV.Safe.obj(PV.Safe.plain(envelope, { nodes: 80000, depth: 10 }));
    const data = env && PV.Safe.obj(env.data);
    const profile = data && PV.Safe.own(data, 'profile') ? PV.Store.clean('profile', data.profile) : undefined;
    const stats = data && PV.Safe.own(data, 'stats') ? PV.Store.clean('stats', data.stats) : undefined;
    const xp = profile ? profile.xp : 0;
    const name = profile ? profile.name : '';
    let games = 0;
    if (stats) for (const k of Object.keys(stats.games)) games += stats.games[k].played;
    if (!xp && !games && !name) return t('drive.holdsNothing');
    const words = t('drive.holds', { level: PV.Profile.levelOf(xp).level, games: PV.fmtNum(games) });
    return name ? name + ' — ' + words : words;
  }

  /** True while this browser holds nothing a restore could overwrite. A
      profile and a stats record are made on first sight, empty, so those two
      count only once something is in them. */
  function blank() {
    const data = PV.Store.exportAll().data;
    for (const k of Object.keys(data)) {
      if (k === 'profile') { if (data.profile.xp > 0 || data.profile.name) return false; }
      else if (k === 'stats') {
        const g = data.stats.games;
        if (Object.keys(g).some(c => g[c].played > 0)) return false;
      } else return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ the buttons */

  let painted = null;       // the status line and switch on screen, if any

  /* The switch keeps its one word whichever way it is set, as it does in
     MoneyFlow, FinSim and PlanSphere: on is drawn filled, and the tooltip
     says which way it is and what pressing it will do. */
  function paintInto(p) {
    const s = status();
    p.line.textContent = s.text;
    p.line.className = 'drive-when small ' + s.tone;
    const on = autoOn();
    p.auto.classList.toggle('on', on);
    p.auto.setAttribute('aria-pressed', String(on));
    p.auto.title = t(on ? 'drive.autoOnHint' : 'drive.autoOffHint');
  }

  function paint() {
    if (painted && painted.line.isConnected) paintInto(painted);
    else painted = null;
  }

  /**
   * The Auto, To Drive and From Drive pills, and the status line that goes
   * under the row, for the Settings screen's data panel — which lays them out
   * in one row with its own Export and Import, the way MoneyFlow, FinSim and
   * PlanSphere do. `say` is that panel's message line, shared with Export and
   * Import; `restored` runs after a restore has replaced what was here.
   */
  function controls(opts) {
    const why = unusable();
    const auto = PV.pill('sync', t('drive.auto'), { disabled: !!why });
    const up = PV.pill('cloudUp', t('drive.push'), { disabled: !!why });
    const down = PV.pill('cloudDown', t('drive.pull'), { disabled: !!why });
    const line = PV.el('p', { class: 'drive-when small' });
    const ui = { say: opts.say, restored: opts.restored };

    function press(btn, fn, busy) {
      const label = btn.querySelector('span');
      const rest = label.textContent;
      up.disabled = down.disabled = true;
      label.textContent = t(busy);
      fn(ui).then(() => {
        label.textContent = rest;
        up.disabled = down.disabled = false;
        paint();
      });
    }
    up.addEventListener('click', () => press(up, push, 'drive.saving'));
    down.addEventListener('click', () => press(down, pull, 'drive.reading'));
    auto.addEventListener('click', () => setAuto(!autoOn()));

    painted = { line: line, auto: auto };
    paintInto(painted);               // not on the page yet, so not paint()
    warm();
    return { buttons: [auto, up, down], line: line };
  }

  /* The moment a Drive copy earns its keep is a cleared browser, and the
     person whose browser was just cleared is exactly the one who does not
     know to look in Settings. So a browser with nothing in it is asked, on
     the Games screen. It offers rather than does: a restore replaces things,
     and a sign-in window nobody pressed for would be blocked anyway. */
  let offerDismissed = false;

  function offer(opts) {
    if (offerDismissed || unusable() || !blank()) return null;
    const el = PV.el;
    const msg = el('p', { class: 'small msg', hidden: true });
    const yes = el('button', { class: 'btn primary' }, t('drive.offerYes'));
    const no = el('button', { class: 'btn ghost' }, t('drive.offerNo'));
    const node = el('section', { class: 'drive-offer' },
      el('p', {}, t('drive.offer')),
      el('div', { class: 'row-btns' }, yes, no),
      msg);

    // Not fetched for every new visitor: only once they reach for the button.
    ['pointerenter', 'pointerdown', 'focus'].forEach(ev => yes.addEventListener(ev, warm));
    yes.addEventListener('click', () => {
      yes.disabled = no.disabled = true;
      pull({
        say: m => { msg.textContent = m; msg.hidden = !m; },
        restored: opts && opts.restored
      }).then(() => { yes.disabled = no.disabled = false; });
    });
    no.addEventListener('click', () => { offerDismissed = true; node.remove(); });
    return node;
  }

  PV.Drive = {
    configured: configured,
    unusable: unusable,
    warm: warm,
    push: push,
    pull: pull,
    auto: autoOn,
    setAuto: setAuto,
    touch: schedule,
    status: status,
    summary: summary,
    blank: blank,
    controls: controls,
    offer: offer,
    /** For the smoke tests: forget the session, as a reload would. */
    _reset() {
      token = null; tokenExpires = 0; tokenClient = null; pending = null;
      inFlight = null; silentOff = false; folderId = null; fileId = null;
      loading = null; queue = Promise.resolve(); clearTimeout(autoTimer);
    }
  };

})(window.PV);
