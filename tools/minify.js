/* PlayVault — the source stripper behind `node tools/build.js`.

   It is deliberately NOT a compiler. It removes comments and indentation and
   nothing else: every identifier keeps its name, and every newline that was
   in the source is still there. That matters more than the few extra per cent
   a renaming pass would win, because renaming needs a full parser, and a bug
   in one is a game that breaks in the browser and nowhere else.

   Keeping the newlines is the load-bearing decision. Automatic semicolon
   insertion means joining two lines can silently change what code does —
   `return` alone on a line being the famous one — and no syntax check would
   catch it. Newlines in, newlines out, and the question never arises.

   What it must get right is where a token ENDS, because `/` is division or
   the start of a regular expression depending on what came before it, and a
   comment marker inside a string is just text. Hence a real scanner. */
'use strict';

const ID = /[A-Za-z0-9_$]/;

/* After these, a `/` starts a regular expression; after an identifier, a
   number, `)` or `]` it is division. `}` is the ambiguous one — a block may
   be followed by a regex — and it is included, because in this codebase a
   `/` after `}` is always a regex and never a division of an object. */
const REGEX_OK = [
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*',
  '/', '%', '<', '>', '~', '^', '=>', '===', '!==', '==', '!=', '&&', '||',
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', ''
];

function minify(src) {
  const n = src.length;
  const out = [];
  let i = 0;
  let last = '';                       // last significant token emitted

  const push = tok => { out.push(tok); last = tok; };

  function readString(from, quote) {
    let j = from + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === quote) { j++; break; }
      j++;
    }
    return src.slice(from, j);
  }

  /** A template literal, including any `${ ... }` holes and their nesting. */
  function readTemplate(from) {
    let j = from + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { j++; break; }
      if (c === '$' && src[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '`') { j += readTemplate(j).length; continue; }
          if (d === '"' || d === "'") { j += readString(j, d).length; continue; }
          if (d === '{') depth++;
          else if (d === '}') depth--;
          j++;
        }
        continue;
      }
      j++;
    }
    return src.slice(from, j);
  }

  /** Null when the slash turns out not to open a regular expression. */
  function readRegex(from) {
    let j = from + 1, inClass = false;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '\n') return null;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { j++; break; }
      j++;
    }
    if (j > n) return null;
    while (j < n && ID.test(src[j])) j++;          // flags
    return src.slice(from, j);
  }

  function regexAllowed() {
    if (last === '') return true;
    if (ID.test(last[last.length - 1])) return REGEX_OK.indexOf(last) >= 0;
    return REGEX_OK.indexOf(last) >= 0 || last === '\n';
  }

  while (i < n) {
    const c = src[i];

    // ---- whitespace: one newline if the run had one, otherwise one space,
    // and neither when the characters on both sides can sit together.
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      let j = i, nl = false;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) {
        if (src[j] === '\n') nl = true;
        j++;
      }
      i = j;
      if (nl) { if (last !== '\n' && last !== '') push('\n'); }
      else if (needsGap(last, src[i])) push(' ');
      continue;
    }

    // ---- comments: the whole point. A block comment that spanned lines
    // leaves its newline behind, so nothing downstream joins up.
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      if (src.slice(i, stop).indexOf('\n') >= 0 && last !== '\n' && last !== '') push('\n');
      i = stop;
      continue;
    }

    if (c === '"' || c === "'") { const s = readString(i, c); i += s.length; push(s); continue; }
    if (c === '`') { const s = readTemplate(i); i += s.length; push(s); continue; }

    if (c === '/' && regexAllowed()) {
      const r = readRegex(i);
      if (r) { i += r.length; push(r); continue; }
    }

    // ---- a run of identifier characters, or a single punctuator.
    if (ID.test(c)) {
      let j = i;
      while (j < n && ID.test(src[j])) j++;
      const word = src.slice(i, j);
      if (needsGap(last, word[0])) push(' ');
      i = j;
      push(word);
      continue;
    }
    push(c);
    i++;
  }

  return out.join('').replace(/\n{2,}/g, '\n').trim();
}

/** Two tokens need a gap only when running them together makes a third. */
function needsGap(prev, next) {
  if (!prev || prev === '\n' || !next) return false;
  const a = prev[prev.length - 1];
  if (ID.test(a) && ID.test(next)) return true;
  // `a + +b`, `a - -b`, `a / /re/` and friends: keep signs apart.
  if ((a === '+' && next === '+') || (a === '-' && next === '-')) return true;
  return false;
}

module.exports = { minify: minify };
