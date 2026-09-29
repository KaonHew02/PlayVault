// Screenshots of the real built site, for the proposal's figures.
//   node screenshots.mjs [lobby] [<game code>…] [fps-play] [save] [chef]
// writes .build/shots/*.png; compose.mjs lays them out into docs/img/.
// It drives the BUILT bundle (run `node tools/build.js` first) from a
// throwaway server on a random port, in a headless Chrome with a throwaway
// profile: the lock is off on 127.0.0.1, and no real save is ever opened.
// The lobby's level-13 player is test data written into that profile.
// Frames are taken mid-game, so a re-run gives different pictures; look at
// them before committing new figures. Needs Chrome or Edge, and Node 22+.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, '.build', 'shots');
const ONLY = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const SITE = 'http://127.0.0.1:' + server.address().port + '/';

const CHROME = (process.env.CHROME ? [process.env.CHROME] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]).find(p => fs.existsSync(p));
if (!CHROME) { console.error('screenshots: no Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-shots-'));
const DPORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DPORT, '--user-data-dir=' + path.join(scratch, 'profile'),
  '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function devtools(p, method) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch('http://127.0.0.1:' + DPORT + p, method ? { method } : undefined); return await r.json(); }
    catch (e) { await sleep(150); }
  }
  throw new Error('Chrome did not answer ' + p);
}
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, Enter: 13, Escape: 27 };

class Page {
  constructor(ws) { this.ws = new WebSocket(ws); this.n = 0; this.wait = new Map(); this.log = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { const w = this.wait.get(d.id); this.wait.delete(d.id); if (d.error) w.rej(new Error(d.error.message)); else w.res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.log.push(((d.params.exceptionDetails.exception || {}).description) || d.params.exceptionDetails.text);
    };
    for (const d of ['Runtime', 'Page']) await this.send(d + '.enable');
  }
  send(method, params) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((res, rej) => { this.wait.set(id, { res, rej }); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); rej(new Error('timeout ' + method)); } }, 30000); });
  }
  async run(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? { threw: r.exceptionDetails.text } : { value: r.result.value }; }
  async until(expr, ms) { const end = Date.now() + (ms || 8000); while (Date.now() < end) { if ((await this.run(expr)).value) return true; await sleep(100); } return false; }
  async go(url) { await this.send('Page.navigate', { url }); await sleep(300); return this.until('document.readyState === "complete" && !!document.querySelector("#app") && document.querySelector("#app").children.length > 0', 15000); }
  async key(code, key) {
    const text = key.length === 1 ? key : undefined;
    const vk = VK[code] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, text, windowsVirtualKeyCode: vk });
    await sleep(40);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  }
  async click(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); }
  async where(selector, textRe) {
    return (await this.run(`(() => { const re = ${textRe ? textRe.toString() : 'null'};
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetParent && !e.disabled && (!re || re.test(e.textContent.trim())));
      if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`)).value;
  }
  async press(selector, textRe) { const at = await this.where(selector, textRe); if (at) await this.click(at[0], at[1]); return !!at; }
  async box(sel) { return (await this.run(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); if (!c) return null; const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`)).value; }
  async shot(name, clip) {
    const r = await this.send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip: Object.assign({ scale: 1 }, clip) } : {}));
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    console.log('  shot', name);
  }
  async view(w, h, mobile, dpr) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr || 1, mobile: !!mobile });
  }
}

const GO = /^(▶\s*)?(play|start|deploy|fight|go|begin|next|ready)\b/i;
const want = n => !ONLY.length || ONLY.includes(n);

try {
  fs.mkdirSync(OUT, { recursive: true });
  const t = await devtools('/json/new?about:blank', 'PUT');
  const page = new Page(t.webSocketDebuggerUrl);
  await page.open();
  const URL_ = SITE + 'index.html';

  await page.view(1280, 800);
  let n = 0;
  const fresh = hash => page.go(URL_ + '?s=' + (++n) + hash);
  if (want('lobby')) {
    // A lived-in profile, written through the app's own API into this
    // throwaway profile — the unlocked local origin allows exactly that.
    await fresh('#/games');
    const seeded = await page.run(`(() => {
      PV.Profile.setName('Kaon'); PV.Profile.addXp(4700);
      const r = (c, o) => PV.Profile.record(c, o);
      r('chess', { result: 'win', timeMs: 512000, xp: 30 }); r('chess', { result: 'win', timeMs: 431000, xp: 30 }); r('chess', { result: 'lose', timeMs: 300000, xp: 5 });
      r('gomoku', { result: 'win', timeMs: 190000, xp: 20 }); r('reversi', { result: 'lose', timeMs: 240000, xp: 5 }); r('xiangqi', { result: 'draw', timeMs: 610000, xp: 10 });
      r('sudoku', { result: 'solved', timeMs: 521000, lowerTimeIsBetter: true, xp: 25 }); r('spider', { result: 'solved', timeMs: 812000, lowerTimeIsBetter: true, xp: 40 });
      r('mahjong', { result: 'solved', timeMs: 388000, lowerTimeIsBetter: true, xp: 30 });
      r('tetris', { result: 'over', score: 48250, timeMs: 400000, xp: 25 }); r('snake', { result: 'over', score: 37, timeMs: 150000, xp: 10 });
      r('worms', { result: 'over', score: 5210, timeMs: 330000, xp: 20 }); r('crowd', { result: 'win', score: 1240, timeMs: 90000, xp: 20 });
      r('towerdef', { result: 'win', score: 20, timeMs: 900000, xp: 60 }); r('fps', { result: 'win', score: 1820, timeMs: 240000, xp: 40 });
      r('hide', { result: 'win', score: 3, timeMs: 195000, xp: 30 }); r('stick', { result: 'win', score: 2, timeMs: 120000, xp: 25 });
      r('chef', { result: 'win', score: 640, timeMs: 110000, xp: 25 });
      return PV.Profile.level().level;
    })()`);
    console.log('  seeded, level', seeded.value, seeded.threw || '');
    await fresh('#/games'); await sleep(700);
    await page.shot('lobby-dark');
    await page.run("document.documentElement.setAttribute('data-theme','light')"); await sleep(400);
    await page.shot('lobby-light');
    await page.run("document.documentElement.setAttribute('data-theme','dark')");
    await fresh('#/friends'); await sleep(1200);
    await page.shot('friends');
    await fresh('#/settings'); await sleep(900);
    await page.shot('settings');
    await fresh('#/stats'); await sleep(600);
    await page.shot('stats');
    // phone
    await page.view(390, 844, true, 2);
    await fresh('#/games'); await sleep(800);
    await page.shot('lobby-phone');
    await page.view(1280, 800);
  }

  const GAMES = ['gomoku', 'reversi', 'chess', 'xiangqi', 'sudoku', 'spider', 'mahjong', 'tetris', 'snake', 'worms', 'crowd', 'towerdef', 'fps', 'hide', 'chef', 'stick'];
  for (const code of GAMES) {
    if (!want(code)) continue;
    console.log(code);
    await page.go(URL_ + '#/games');
    await page.run("PV.Store.set('theme','dark')");
    await page.go(URL_ + '#/games');
    page.log.length = 0;
    await page.run(`location.hash = '#/play/${code}'`);
    await page.until("!!document.querySelector('.game-host') && document.querySelector('.game-host').children.length > 0", 8000);
    await sleep(1400);
    await page.shot(code + '-a');
    for (let round = 0; round < 2; round++) {
      await page.press('.game-host button', GO);
      await sleep(400);
      const box = await page.box('.game-host canvas') || await page.box('.game-host');
      if (['gomoku', 'reversi', 'xiangqi', 'chess'].includes(code) && box) {
        for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.5], [0.5, 0.42], [0.58, 0.58]]) { await page.click(box[0] + fx * box[2], box[1] + fy * box[3]); await sleep(500); }
      }
      if (code === 'tetris') for (const k of ['ArrowLeft', 'ArrowUp', 'Space', 'ArrowRight', 'ArrowUp', 'Space', 'ArrowLeft', 'ArrowLeft', 'Space']) { await page.key(k, k === 'Space' ? ' ' : k); await sleep(120); }
      if (code === 'snake') for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown']) { await page.key(k, k); await sleep(450); }
      if (['worms', 'crowd', 'fps', 'hide', 'stick'].includes(code)) for (const k of ['Enter', 'Space', 'KeyD', 'KeyW', 'KeyJ']) { await page.key(k, k === 'Space' ? ' ' : k.startsWith('Key') ? k.slice(3).toLowerCase() : k); await sleep(200); }
      if (box && ['towerdef', 'mahjong', 'spider'].includes(code)) for (const [fx, fy] of [[0.3, 0.5], [0.5, 0.4], [0.6, 0.6]]) { await page.click(box[0] + fx * box[2], box[1] + fy * box[3]); await sleep(250); }
      await sleep(1600);
    }
    await page.shot(code + '-b');
    if (page.log.length) console.log('  errors:', page.log.slice(0, 2));
  }
  if (want('fps-play')) {
    await page.go(URL_ + '?f=1#/games');
    await page.run("location.hash = '#/play/fps'");
    await page.until("!!document.querySelector('.game-host canvas')", 10000);
    await sleep(1500);
    console.log('  deploy pressed:', await page.press('.game-host button', /^deploy$/i));
    await sleep(2500);
    const b = await page.box('.game-host canvas');
    if (b) await page.click(b[0] + b[2] / 2, b[1] + b[3] / 2);
    for (const k of ['KeyW', 'KeyW', 'KeyD']) { await page.key(k, k.slice(3).toLowerCase()); await sleep(200); }
    await sleep(2500);
    await page.shot('fps-play');
  }
  if (want('save')) {
    // A storage that refuses the next write, and the strip that says so.
    // Only possible on this unlocked origin; setItem is put back after.
    const failSave = () => page.run("window.__set = window.__set || Storage.prototype.setItem;"
      + " Storage.prototype.setItem = function () { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };"
      + " PV.Profile.addXp(10); 'ok'");
    await fresh('#/games');
    await page.run("if (!PV.Profile.data().name) { PV.Profile.setName('Kaon'); PV.Profile.addXp(4700); } 'ok'");
    await fresh('#/games'); await failSave(); await sleep(600);
    await page.shot('save-desk', { x: 0, y: 0, width: 1280, height: 330 });
    await page.view(390, 844, true, 2);
    await fresh('#/games'); await failSave(); await sleep(800);
    await page.shot('save-phone', { x: 0, y: 0, width: 390, height: 360 });
    await page.view(1280, 800);
    await page.run("if (window.__set) Storage.prototype.setItem = window.__set; 'ok'");
  }
  if (want('chef')) {
    await page.go(URL_ + '#/games');
    await page.run("location.hash = '#/play/chef'");
    await page.until("!!document.querySelector('.chef-level')", 8000);
    await page.press('.chef-card.help .head .btn'); await sleep(200);
    await page.shot('chef-map');
    await page.press('.chef-level:not(.locked)'); await sleep(300);
    await page.press('.chef-card .btn.primary.wide'); await sleep(900);
    const cbox = await page.box('.game-host canvas');
    for (let i = 0; i < 14 && cbox; i++) { await page.click(cbox[0] + cbox[2] * (0.1 + 0.8 * ((i * 37) % 100) / 100), cbox[1] + cbox[3] * (0.3 + 0.6 * ((i * 53) % 100) / 100)); await sleep(140); }
    await sleep(800);
    await page.shot('chef-level');
  }
} catch (e) {
  console.log('CRASH ' + ((e && e.stack) || e));
} finally {
  chrome.kill();
  server.close();
  await sleep(400);
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
}
