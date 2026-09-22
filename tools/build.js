/* PlayVault — the deploy build.
 *
 *   node tools/build.js          write js/playvault.min.js and index.html
 *   node tools/build.js --check  say whether they are up to date, change nothing
 *
 * `index.dev.html` is the source of truth: it lists every script, in order,
 * and it is the page to work against. This script reads that list, strips the
 * comments and the indentation out of each file (tools/minify.js), joins them
 * into one bundle, and writes the deployed `index.html` pointing at it.
 *
 * Two things it does on purpose:
 *
 * - The bundle carries a STAMP: a hash of every source that went into it. The
 *   smoke tests read that stamp back and fail if it no longer matches the
 *   sources, because a bundle that is one edit behind the code is a bug that
 *   only shows up in production, after a push, on someone else's machine.
 * - The script tag carries `?v=<stamp>`, so a browser that has the old bundle
 *   cached fetches the new one instead of serving yesterday's game for a week.
 *
 * What this is NOT is a security control. It makes the source inconvenient to
 * read; devtools still shows every line of it, and anyone can still change
 * anything in their own browser. SECURITY.md says what actually holds.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { minify } = require('./minify.js');

const ROOT = path.join(__dirname, '..');
const DEV = path.join(ROOT, 'index.dev.html');
const OUT_HTML = path.join(ROOT, 'index.html');
const OUT_JS = path.join(ROOT, 'js', 'playvault.min.js');
const BUNDLE_REL = 'js/playvault.min.js';

/** The ordered list of local scripts, straight out of the development page. */
function sources(devHtml) {
  const block = devHtml.slice(
    devHtml.indexOf('<!-- app:start -->'),
    devHtml.indexOf('<!-- app:end -->')
  );
  const out = [];
  const re = /<script src="(js\/[^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

function stampOf(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex').slice(0, 12);
}

function buildBundle(files, stamp) {
  const parts = [
    '/* PlayVault — generated bundle. Do not edit.',
    ' * Built by `node tools/build.js` from the files listed in index.dev.html.',
    ' * The readable source is the repository this came from.',
    ' * stamp:' + stamp,
    ' */'
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const code = minify(src);
    if (!code) continue;
    parts.push(code.endsWith(';') || code.endsWith('}') ? code : code + ';');
  }
  return parts.join('\n') + '\n';
}

function buildHtml(devHtml, stamp) {
  const a = devHtml.indexOf('<!-- app:start -->');
  const b = devHtml.indexOf('<!-- app:end -->') + '<!-- app:end -->'.length;
  const tag = '<!-- Every script this app owns, in one file. Built by\n'
    + '     `node tools/build.js`; edit index.dev.html and the sources, never\n'
    + '     this line. The version is a hash of those sources, so a browser\n'
    + '     holding the old bundle fetches the new one. -->\n'
    + '<script src="' + BUNDLE_REL + '?v=' + stamp + '"></script>';
  // Take the head comment above app:start out of the deployed page too.
  let head = devHtml.slice(0, a);
  head = head.replace(/<!-- THE DEVELOPMENT PAGE[\s\S]*?-->\n/, '');
  return head + tag + devHtml.slice(b);
}

function main() {
  const check = process.argv.indexOf('--check') >= 0;
  const devHtml = fs.readFileSync(DEV, 'utf8');
  const files = sources(devHtml);
  if (!files.length) { console.error('build: no scripts found in index.dev.html'); process.exit(1); }

  const stamp = stampOf(files);
  const bundle = buildBundle(files, stamp);
  const html = buildHtml(devHtml, stamp);

  if (check) {
    const haveJs = fs.existsSync(OUT_JS) ? fs.readFileSync(OUT_JS, 'utf8') : '';
    const haveHtml = fs.existsSync(OUT_HTML) ? fs.readFileSync(OUT_HTML, 'utf8') : '';
    const fresh = haveJs === bundle && haveHtml === html;
    console.log(fresh ? 'build: up to date (stamp ' + stamp + ')'
      : 'build: STALE — run `node tools/build.js`');
    process.exit(fresh ? 0 : 1);
  }

  fs.writeFileSync(OUT_JS, bundle);
  fs.writeFileSync(OUT_HTML, html);
  const raw = files.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log('build: ' + files.length + ' files, '
    + (raw / 1024).toFixed(0) + ' kB source -> '
    + (Buffer.byteLength(bundle) / 1024).toFixed(0) + ' kB bundle'
    + ' (stamp ' + stamp + ')');
}

module.exports = { sources: sources, stampOf: stampOf, buildBundle: buildBundle };
if (require.main === module) main();
