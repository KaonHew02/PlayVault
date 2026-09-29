#!/usr/bin/env node
/* PlayVault — the lock, checked in a real browser.
 *
 *   node tools/lockcheck.mjs            console, Elements panel, every game, files
 *   node tools/lockcheck.mjs --net      ...and Google's sign-in and a two-tab room
 *                                       (both need the internet)
 *   CHROME=/path/to/chrome node tools/lockcheck.mjs
 *
 * js/core/guard.js cannot be tested in Node: what it guards is a page. So this
 * serves the repository, starts a headless Chrome, and drives the BUILT bundle
 * (index.html?guard) over the DevTools protocol — the channel the developer
 * tools themselves use. Runtime.evaluate is exactly a line pasted into the
 * console (its frames are <anonymous>), and the DOM domain is exactly the
 * Elements panel. Run `node tools/build.js` first: this checks what ships.
 *
 * Three things it proves, in that order of importance:
 *
 *   1. Nothing a console or the Elements panel can do reaches a save, and
 *      what they change on screen is refused or put back.
 *   2. Every game plays under the lock with no error and with nothing of its
 *      OWN put back. A "put back" during normal play means a game changed the
 *      page in a way the lock could not see, and the published site would
 *      undo it — that is a bug in the game, and this is where it shows.
 *   3. Export, Import and the refused edited file, through the real file input.
 *   4. A storage too full to take a write says so, in a strip the lock
 *      leaves alone, until there is room again.
 *
 * Zero dependencies, like everything in tools/: Node 22+ (global WebSocket and
 * fetch) and a Chrome or Edge on the machine.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NET = process.argv.includes('--net');
const GAMES = ['gomoku', 'reversi', 'chess', 'xiangqi', 'sudoku', 'spider', 'mahjong', 'tetris', 'snake',
  'worms', 'crowd', 'towerdef', 'fps', 'hide', 'chef', 'stick'];
const MESSAGE = 'PlayVault is locked';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ok    ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 600) : '')); }
}

/* ------------------------------------------------------------ a server */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const SITE = 'http://127.0.0.1:' + server.address().port + '/';

/* ------------------------------------------------------------ a Chrome */

function findChrome() {
  const env = process.env.CHROME;
  const guesses = env ? [env] : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  return guesses.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}
const CHROME = findChrome();
if (!CHROME) { console.error('lockcheck: no Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-lockcheck-'));
const downloads = path.join(scratch, 'downloads');
fs.mkdirSync(downloads);
const DPORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DPORT, '--user-data-dir=' + path.join(scratch, 'profile'),
  '--window-size=1280,860', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', 'about:blank'],
  { stdio: 'ignore' });

async function devtools(p, method) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch('http://127.0.0.1:' + DPORT + p, method ? { method } : undefined); return await r.json(); }
    catch (e) { await sleep(150); }
  }
  throw new Error('Chrome did not answer ' + p);
}

const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, Enter: 13, Escape: 27, F12: 123 };

class Page {
  constructor(ws) { this.ws = new WebSocket(ws); this.n = 0; this.wait = new Map(); this.log = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) {
        const w = this.wait.get(d.id); this.wait.delete(d.id);
        if (d.error) w.rej(new Error(d.error.message)); else w.res(d.result);
      } else if (d.method === 'Runtime.consoleAPICalled') {
        const a = d.params.args || [];
        this.log.push({ kind: d.params.type, text: a.map(x => x.value !== undefined ? String(x.value) : (x.description || '')).join(' ') });
      } else if (d.method === 'Runtime.exceptionThrown') {
        const ex = d.params.exceptionDetails;
        this.log.push({ kind: 'exception', text: (ex.exception && ex.exception.description) || ex.text });
      } else if (d.method === 'Log.entryAdded') {
        this.log.push({ kind: 'log-' + d.params.entry.level, text: d.params.entry.text });
      }
    };
    for (const d of ['Runtime', 'Log', 'Page', 'DOM']) await this.send(d + '.enable');
  }
  send(method, params) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((res, rej) => {
      this.wait.set(id, { res, rej });
      setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
    });
  }
  /** Exactly what pasting into the console does. */
  async run(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception;
      return { threw: (ex && (ex.description || ex.value)) || r.exceptionDetails.text };
    }
    return { value: r.result.value };
  }
  async until(expr, ms) {
    const end = Date.now() + (ms || 8000);
    while (Date.now() < end) { if ((await this.run(expr)).value) return true; await sleep(100); }
    return false;
  }
  async go(url) {
    this.log.length = 0;
    await this.send('Page.navigate', { url });
    await sleep(300);
    return this.until('document.readyState === "complete" && !!document.querySelector("#app") && document.querySelector("#app").children.length > 0', 15000);
  }
  errors(extra) { return this.log.filter(l => (l.kind === 'exception' || l.kind === 'error' || l.kind === 'log-error') && !(extra && extra.test(l.text))); }
  putBacks() { return this.log.filter(l => /put back/.test(l.text)); }
  async node(selector) {
    const doc = await this.send('DOM.getDocument', { depth: 0 });
    return (await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector })).nodeId;
  }
  async key(code, key) {
    const text = key.length === 1 ? key : undefined;
    const vk = VK[code] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, text, windowsVirtualKeyCode: vk });
    await sleep(30);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  }
  async click(x, y, button) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: button || 'left', clickCount: 1 });
    }
  }
  async where(selector, textRe) {
    return (await this.run(`(() => {
      const re = ${textRe ? textRe.toString() : 'null'};
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetParent && !e.disabled && (!re || re.test(e.textContent.trim())));
      if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];
    })()`)).value;
  }
  async press(selector, textRe) {
    const at = await this.where(selector, textRe);
    if (at) await this.click(at[0], at[1]);
    return !!at;
  }
}

async function newPage() {
  const t = await devtools('/json/new?about:blank', 'PUT');
  const p = new Page(t.webSocketDebuggerUrl);
  await p.open();
  await p.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }).catch(() => {});
  return p;
}

const LOCKED = SITE + 'index.html?guard';
const refused = r => !!r.threw && r.threw.indexOf(MESSAGE) >= 0;
const CSP_STYLE = /Content Security Policy|Applying inline style violates/;

try {
  await devtools('/json/version');
  const page = await newPage();

  /* -------------------------------------------------------- the console */
  console.log('\n== the console, on the published bundle with the lock on');
  check(await page.go(LOCKED), 'the lobby renders under the lock');
  await sleep(400);
  check(page.errors().length === 0, 'with no errors', page.errors());
  const t = async (expr, msg, okFn) => { const r = await page.run(expr); check(okFn(r), msg, r); };
  await t('typeof PV', 'PV is undefined', r => r.value === 'undefined');
  await t("window.PV = {}", 'and cannot be put back', r => !!r.threw);
  await t("localStorage.getItem('playvault.profile')", 'localStorage refuses the console', refused);
  await t("localStorage['playvault.profile'] = 'x'", 'by name too', refused);
  await t("Storage.prototype.setItem.call(sessionStorage, 'x', 'y')", 'and so does sessionStorage', refused);
  await t("document.querySelector('.name-btn').textContent = 'HACKED'", 'text cannot be set', refused);
  await t("document.querySelector('.name-btn').click()", 'a button cannot be pressed', refused);
  await t("document.querySelector('.name-btn').classList.add('x')", 'a class cannot be added', refused);
  await t("document.querySelector('.name-btn').style.color = 'red'", 'a style cannot be set', refused);
  await t("Object.assign(document.querySelector('.name-btn').style, { display: 'none' })", 'nor through Object.assign', refused);
  await t("document.querySelector('.nav a').dataset.nav = 'x'", 'a data- attribute cannot be set', refused);
  await t("document.querySelector('.name-btn').setAttribute('hidden', '')", 'an attribute cannot be set', refused);
  await t("document.querySelector('.profile-strip').remove()", 'a node cannot be removed', refused);
  await t("document.body.appendChild(document.createElement('div'))", 'a node cannot be added', refused);
  await t("document.querySelector('#app').innerHTML = '<h1>x</h1>'", 'innerHTML cannot be set', refused);
  await t("document.addEventListener('keydown', () => {})", 'a listener cannot be added', refused);
  await t("window.open('')", 'a fresh window cannot be opened', refused);
  await t("(async () => { setTimeout(document.body.remove.bind(document.body), 0); await new Promise(r => setTimeout(r, 200)); return document.body && document.body.isConnected; })()",
    'a DOM method handed to a timer is refused', r => r.value === true);
  await t("(async () => { await 0; document.querySelector('.name-btn').textContent = 'x'; })()", 'after an await too', refused);
  await t("Math.random = () => 0; Math.random() === 0", 'Math.random cannot be replaced', r => r.value === false || !!r.threw);
  await t("JSON.stringify = () => '{}'; JSON.stringify({ a: 1 })", 'JSON.stringify cannot be replaced', r => r.value === '{"a":1}' || !!r.threw);
  await t("Object.defineProperty(performance, 'now', { value: () => 0 }); performance.now() === 0", 'performance.now cannot be replaced', r => r.value === false || !!r.threw);
  await t("Object.defineProperty(Object.prototype, 'coins', { set() {} }); 'coins' in {}", 'Object.prototype cannot grow a trap', r => r.value === false || !!r.threw);
  await t("WebGL2RenderingContext.prototype.enable = () => {}; String(WebGL2RenderingContext.prototype.enable).includes('native')", 'WebGL cannot be hooked', r => r.value === true || !!r.threw);
  await t("Error.prepareStackTrace = () => 'x'; Error.prepareStackTrace", 'a stack cannot be forged', r => r.value === undefined || !!r.threw);
  await t("document.querySelector('.name-btn').getBoundingClientRect().width > 0", 'reading the page still works', r => r.value === true);

  /* ------------------------------------------------- the Elements panel */
  console.log('\n== the Elements panel');
  // A node as the page shows it: tags, text, and attributes in sorted order —
  // Chrome's Edit as HTML can leave the same attributes in another order,
  // which changes nothing anybody sees.
  const text = sel => page.run(`(() => {
    const canon = n => n.nodeType === 3 ? n.data : n.nodeType !== 1 ? '' : '<' + n.tagName + ' '
      + [...n.attributes].map(a => a.name + '=' + a.value).sort().join(' ') + '>' + [...n.childNodes].map(canon).join('') + '</>';
    const el = document.querySelector(${JSON.stringify(sel)});
    return el ? canon(el) : null;
  })()`).then(r => r.value);
  const name0 = await text('.name-btn'), strip0 = await text('.profile-strip'), avatar0 = await text('.avatar');
  page.log.length = 0;
  await page.send('DOM.setOuterHTML', { nodeId: await page.node('.name-btn'), outerHTML: '<button class="name-btn">HACKED 999999</button>' });
  await sleep(150);
  const name1 = await text('.name-btn');
  check(name1 === name0, 'Edit as HTML is put back', { before: name0, after: name1 });
  await page.send('DOM.setOuterHTML', { nodeId: await page.node('.avatar'), outerHTML: '<div class="avatar">99</div>' });
  await sleep(150);
  check(await text('.avatar') === avatar0, 'a level typed over is put back');
  let id = await page.node('.name-btn');
  const desc = await page.send('DOM.describeNode', { nodeId: id, depth: 1 });
  const tn = desc.node.children && desc.node.children.find(c => c.nodeType === 3);
  if (tn) {
    const pushed = await page.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [tn.backendNodeId] });
    await page.send('DOM.setNodeValue', { nodeId: pushed.nodeIds[0], value: 'Coins: 999999' });
    await sleep(150);
    check(await text('.name-btn') === name0, 'text edited in place is put back');
  }
  for (const [name, value] of [['hidden', ''], ['class', 'hacked'], ['style', 'color:red'], ['contenteditable', 'true']]) {
    await page.send('DOM.setAttributeValue', { nodeId: await page.node('.name-btn'), name, value });
    await sleep(120);
    check(await text('.name-btn') === name0, 'an attribute set in the panel is put back: ' + name);
  }
  await page.send('DOM.removeNode', { nodeId: await page.node('.profile-strip') });
  await sleep(150);
  check(await text('.profile-strip') === strip0, 'a deleted node comes back where it was');
  await page.send('DOM.removeNode', { nodeId: await page.node('#app') });
  await sleep(150);
  check((await page.run("!!document.querySelector('#app') && document.querySelector('#app').parentNode === document.body")).value, 'even #app comes back');
  check(page.putBacks().length > 0, 'and the console says what was put back');
  check(await page.press('a[data-nav="settings"]') && await page.until("location.hash === '#/settings'", 3000), 'the page still works after all of it');
  check(page.errors(CSP_STYLE).length === 0, 'with no errors but the CSP refusing the style=""', page.errors(CSP_STYLE));

  /* -------------------------------------------------------- speed bumps */
  console.log('\n== the speed bumps');
  const sid = await page.send('Page.addScriptToEvaluateOnNewDocument', { source:
    "window.__heard = []; window.addEventListener('keydown', e => window.__heard.push(e.key + (e.shiftKey ? '+shift' : '') + ':' + e.defaultPrevented));"
    + "window.addEventListener('contextmenu', e => window.__heard.push('menu:' + e.defaultPrevented));" });
  await page.go(LOCKED);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F12', code: 'F12', windowsVirtualKeyCode: 123 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F12', code: 'F12', windowsVirtualKeyCode: 123 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'I', code: 'KeyI', modifiers: 10, windowsVirtualKeyCode: 73 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'I', code: 'KeyI', modifiers: 10, windowsVirtualKeyCode: 73 });
  const at = await page.where('.profile-strip');
  await page.click(at[0], at[1], 'right');
  await sleep(200);
  const heard = (await page.run('window.__heard')).value || [];
  check(heard.includes('F12:true') && heard.includes('I+shift:true') && heard.includes('menu:true'), 'F12, Ctrl+Shift+I and the right-click menu are cancelled', heard);
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sid.identifier });

  /* ----------------------------------------------------- every game */
  console.log('\n== every game, played under the lock');
  const GO = /^(▶\s*)?(play|start|deploy|fight|go|begin|next|ready)\b/i;
  for (const code of GAMES) {
    await page.go(LOCKED + '&g=' + code + '#/games');
    page.log.length = 0;
    await page.run(`location.hash = '#/play/${code}'`);
    const up = await page.until("!!document.querySelector('.game-host') && document.querySelector('.game-host').children.length > 0", 8000);
    await sleep(600);
    for (let round = 0; round < 4; round++) {
      await page.press('.game-host button', GO);
      for (const k of ['Enter', 'KeyJ', 'Space', 'ArrowLeft', 'KeyW', 'KeyD', 'ArrowUp', 'KeyK']) {
        await page.key(k, k === 'Space' ? ' ' : k.startsWith('Key') ? k.slice(3).toLowerCase() : k);
      }
      const box = (await page.run("(() => { const c = document.querySelector('.game-host canvas') || document.querySelector('.game-host'); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")).value;
      if (box) for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.7], [0.75, 0.4], [0.6, 0.8]]) { await page.click(box[0] + fx * box[2], box[1] + fy * box[3]); await sleep(50); }
      await sleep(1200);
    }
    const errs = page.errors(CSP_STYLE);
    check(up && errs.length === 0 && page.putBacks().length === 0, code + ': no errors, and nothing of its own put back', { up, errs: errs.slice(0, 2), putBacks: page.putBacks().length });
  }

  // The two paths a generic poke misses: a Street Chef level, and Sudoku's cells.
  await page.go(LOCKED + '&g=chef2#/games');
  page.log.length = 0;
  await page.run("location.hash = '#/play/chef'");
  await page.until("!!document.querySelector('.chef-level')", 8000);
  await page.press('.chef-card.help .head .btn');
  await sleep(200);
  const lv = await page.press('.chef-level:not(.locked)');
  await sleep(300);
  const played = await page.press('.chef-card .btn.primary.wide');
  const cbox = (await page.run("(() => { const b = document.querySelector('.game-host canvas').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")).value;
  for (let i = 0; i < 24 && cbox; i++) { await page.click(cbox[0] + cbox[2] * (0.1 + 0.8 * ((i * 37) % 100) / 100), cbox[1] + cbox[3] * (0.3 + 0.6 * ((i * 53) % 100) / 100)); await sleep(120); }
  check(lv && played && page.errors(CSP_STYLE).length === 0 && page.putBacks().length === 0, 'street chef: a level played, nothing put back', { lv, played, errs: page.errors(CSP_STYLE) });
  await page.go(LOCKED + '&g=sudoku2#/games');
  page.log.length = 0;
  await page.run("location.hash = '#/play/sudoku'");
  await page.until("document.querySelectorAll('.sudoku-grid .sq').length === 81", 8000);
  const cells = () => page.run("[...document.querySelectorAll('.sudoku-grid .sq')].map(c => c.textContent).join('|')").then(r => r.value);
  const before = await cells();
  for (let i = 0; i < 81; i += 7) { await page.press(`.sudoku-grid .sq:nth-child(${i + 1})`); await page.key('Digit' + (1 + i % 9), String(1 + i % 9)); }
  await sleep(1300);
  check(before !== await cells() && page.errors(CSP_STYLE).length === 0 && page.putBacks().length === 0, 'sudoku: digits typed in show up, nothing put back');

  /* ---------------------------------------------- export and import */
  console.log('\n== Export, Import, and an edited file');
  await page.go(LOCKED + '&g=files#/settings');
  await sleep(500);
  for (const f of fs.readdirSync(downloads)) fs.unlinkSync(path.join(downloads, f));
  await page.press('.pill', /Export/i);
  let file = null;
  for (let i = 0; i < 40 && !file; i++) { await sleep(150); file = fs.readdirSync(downloads).find(f => /\.json$/.test(f) && !/crdownload/.test(f)); }
  check(!!file, 'Export downloads a file');
  if (file) {
    const full = path.join(downloads, file);
    const env = JSON.parse(fs.readFileSync(full, 'utf8'));
    check(typeof env.seal === 'string', 'and it is sealed');
    const importIt = async p => {
      await page.go(LOCKED + '&g=import' + Date.now() + '#/settings');
      await sleep(300);
      await page.send('DOM.setFileInputFiles', { files: [p], nodeId: await page.node('input[type=file]') });
      await sleep(600);
      return (await page.run("[...document.querySelectorAll('.panel p')].map(p => p.hidden ? '' : p.textContent).join(' | ')")).value || '';
    };
    check(/Restored/i.test(await importIt(full)), 'an untouched export imports');
    const edited = JSON.parse(fs.readFileSync(full, 'utf8'));
    edited.data.profile = Object.assign({}, edited.data.profile, { xp: 500000000 });
    const bad = path.join(downloads, 'edited.json');
    fs.writeFileSync(bad, JSON.stringify(edited, null, 2));
    check(/changed after PlayVault saved it/i.test(await importIt(bad)), 'an edited one is refused');
    delete edited.seal;
    fs.writeFileSync(bad, JSON.stringify(edited, null, 2));
    check(/changed after PlayVault saved it/i.test(await importIt(bad)), 'and so is one with its seal cut off');
  }

  /* ----------------------------------------- the network: Drive, a room */
  if (NET) {
    console.log('\n== Google sign-in and a two-tab room (the internet)');
    await page.go(LOCKED + '&g=drive#/settings');
    check(await page.until("typeof google !== 'undefined' && !!google.accounts && !!google.accounts.oauth2", 12000), "Google's sign-in library loads under the lock");
    page.log.length = 0;
    await page.press('.pill', /To Drive/i);
    let popup = null;
    for (let i = 0; i < 40 && !popup; i++) { await sleep(200); popup = (await devtools('/json/list')).find(x => x.type === 'page' && /accounts\.google\.com/.test(x.url)); }
    check(!!popup && !page.log.some(l => l.text.indexOf(MESSAGE) >= 0), 'To Drive opens its window, and the lock refused nothing on the way');
    if (popup) await fetch('http://127.0.0.1:' + DPORT + '/json/close/' + popup.id).catch(() => {});
    await page.send('Page.bringToFront');

    await page.go(LOCKED + '&g=room#/friends');
    await page.until("typeof Peer === 'function'", 10000);
    await page.press('.pick-grid .pick');
    await sleep(300);
    await page.press('.pick-setup .btn.primary');
    const open = await page.until("/Room code\\s*\\d{3}\\s?\\d{3}/.test(document.querySelector('#app').textContent)", 20000);
    check(open, 'a locked tab opens a room');
    if (open) {
      const code = (await page.run("(m => m[1] + m[2])(document.querySelector('#app').textContent.match(/Room code\\s*(\\d{3})\\s?(\\d{3})/))")).value;
      const guest = await newPage();
      await guest.go(LOCKED + '&g=guest#/friends');
      await sleep(1200);
      await guest.send('DOM.focus', { nodeId: await guest.node('.code-input') });
      await guest.send('Input.insertText', { text: code });
      await guest.key('Enter', 'Enter');
      check(await page.until("!/Waiting for somebody to join/.test(document.querySelector('#app').textContent)", 25000), 'a second locked tab joins it');
      await page.press('#app button', /start/i);
      check(await page.until("location.hash.indexOf('#/play/') === 0", 10000) && await guest.until("location.hash.indexOf('#/play/') === 0", 15000), 'and the match starts on both');
      check(guest.errors(CSP_STYLE).length === 0 && guest.putBacks().length === 0, 'the guest had no errors', guest.errors(CSP_STYLE));
      check(page.errors(CSP_STYLE).length === 0 && page.putBacks().length === 0, 'nor did the host', page.errors(CSP_STYLE));
    }
  }

  /* ------------------------------ a storage that is full, under the lock */
  console.log('\n== a storage that is full says so, under the lock');
  // Filled from the unlocked page on this origin: the locked one refuses the
  // console. Halving until even one character will not go, then topping up
  // the last key a character at a time, leaves no room for anything larger.
  await page.go(SITE + 'index.dev.html#/games');
  const filled = (await page.run(`(() => {
    let n = 0, size = 1 << 20;
    while (size >= 1) { try { localStorage.setItem('pv-fill-' + n, 'x'.repeat(size)); n++; } catch (e) { size >>= 1; } }
    const last = 'pv-fill-' + (n - 1);
    let v = localStorage.getItem(last) || '';
    for (;;) { try { localStorage.setItem(last, v + 'x'); v += 'x'; } catch (e) { break; } }
    return n;
  })()`)).value;
  check(filled > 0, 'the storage fills up', filled);
  await page.go(LOCKED + '&g=full#/settings');
  await sleep(300);
  page.log.length = 0;
  // A real click: the app writes the theme, and the storage refuses it.
  const light = await page.press('.seg-btn', /^Light$/);
  const shown = await page.until("!!document.querySelector('.save-strip') && document.querySelector('.save-strip').offsetParent !== null", 5000);
  check(light && shown, 'a refused write puts a strip over the screen', { light, shown });
  const says = (await page.run("(document.querySelector('.save-strip') || {}).textContent || ''")).value;
  check(/not being saved/.test(says) && /Export/.test(says), 'which says progress is not being saved, and offers Export', says);
  await page.press('a[data-nav="games"]');
  check(await page.until("location.hash === '#/games' && !!document.querySelector('.save-strip')", 3000), 'and stays over the next screen');
  check(page.errors(CSP_STYLE).length === 0 && page.putBacks().length === 0, 'with no errors, and nothing of its own put back',
    { errs: page.errors(CSP_STYLE), putBacks: page.putBacks().length });
  await page.go(SITE + 'index.dev.html#/games');
  await page.run("Object.keys(localStorage).filter(k => k.indexOf('pv-fill-') === 0).forEach(k => localStorage.removeItem(k))");
  check((await page.run("Object.keys(localStorage).some(k => k.indexOf('pv-fill-') === 0)")).value === false, 'the storage is emptied again');

  /* ------------------------------------------ and off, on this machine */
  console.log('\n== off on this machine');
  check(await page.go(SITE + 'index.dev.html') && (await page.run('typeof PV')).value === 'object', 'index.dev.html on 127.0.0.1 is unlocked: PV is there');
  check(await page.go(SITE + 'index.dev.html?guard') && (await page.run('typeof PV')).value === 'undefined', 'and ?guard locks it');
} catch (e) {
  fail++;
  console.log('CRASH ' + ((e && e.stack) || e));
} finally {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  chrome.kill();
  server.close();
  await sleep(500);
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold it */ }
  process.exit(fail ? 1 : 0);
}
