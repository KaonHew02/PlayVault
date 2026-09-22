# Security

PlayVault is a static site. There is no server, no account, no password and no
database — every game runs in the browser, and every save is in that browser's
own `localStorage`.

That one fact decides everything below.

## The thing people ask first: can the JavaScript be hidden?

**No.** Not here, not anywhere, not by anyone.

A browser cannot run code it has not been given. Every `.js` file in this repo
is downloaded to the machine that plays it, and from there it can be read in
the Sources tab, paused, edited and re-run. Minifying it, obfuscating it,
disabling right-click or blocking F12 do not change that — they make the file
harder to *read*, and none of them stops devtools, `view-source:`, a proxy or
`curl`. Anything advertised as "protecting" client-side JavaScript is selling
inconvenience as security.

So the question worth asking is not *how do I hide it* but **what does it cost
me if somebody changes it**. Here, the answer is: nothing that belongs to
anybody else.

- A player editing this app in their console is editing **their own copy**, on
  **their own machine**, changing **their own records**. The site other people
  load is untouched. The change "surviving a refresh" is just `localStorage`:
  it lives on that computer, and clearing site data removes it.
- There are no other players' saves to reach, no server to lie to, no
  leaderboard to poison, no payment and no personal data.
- Someone who gives themself a million XP has cheated at solitaire.

If PlayVault ever gets a real leaderboard, that changes completely — and the
answer then is not obfuscation either. It is a server that recomputes or
verifies what the client claims, because a score that arrives from a browser
is a **claim**, always, no matter how the client was written.

## What is actually defended, and how

Three inputs genuinely are not under this app's control, and all three are
rebuilt rather than trusted. `js/core/safe.js` holds the tools; the rule
everywhere is **rebuild the value, never adopt it**.

### 1. Stored data that has been tampered with or corrupted

Every value read out of `localStorage` goes through a validator registered by
the module that owns it (`PV.Store.validate`), not just values that arrive by
import. Strings are coerced, stripped of control and bidi characters, and cut
to length. Numbers are clamped to sane bounds. Unknown fields are dropped.

This closed a real bug, not a theoretical one: the player's level was found by
walking one level at a time from zero, so an `xp` of `1e308` — a number anyone
could type into devtools, or that a corrupted write could leave behind — meant
about 1e153 iterations. The tab hangs on load, and it hangs again on every
load after that, because the bad value is still in storage. XP is now clamped
on read and the walk is bounded, so the worst case is 4,500 steps.

### 2. A backup file from somewhere else

`Settings → Import` takes a file. It is parsed, then **rebuilt from scratch**
with `PV.Safe.plain`: plain objects and arrays only, no functions, no
non-finite numbers, bounded depth, key count, array length and string length,
and `__proto__` / `constructor` / `prototype` keys dropped on the way through.
Copying an own `__proto__` key into an object with `Object.assign` sets that
object's prototype instead of adding a key, which is how a JSON file turns
into an exploit; the per-game record is now built field by field for the same
reason. Stores that fail their own validator are skipped, not restored badly.

### 3. Another person's browser, in a friends room

This is the only place bytes authored by someone else reach your machine. The
room is host-authority — a guest may only *ask* or *announce*, and the host
alone begins a round, rewrites the roster or ends the game — and on top of
that every field arriving on the wire is rebuilt: names capped at 24
characters, seats to 0–15, levels to 1–9,999, the roster to 16 members,
option values to short scalars, seeds and rounds to integers, scoreboard rows
to finite clamped numbers and a result from a fixed list.

**What this cannot do is make a peer honest.** On a shared seed with no
server, a patched client can claim a score it did not earn. That is inherent
to peer-to-peer play without an authority, it is written here rather than
pretended away, and the rooms are six digits read out loud to people you know.

## Page-level hardening

- **Content-Security-Policy** (in `index.html`): `default-src 'self'`, no
  inline script, no `eval`, no plugins, no form posts, `base-uri 'none'`, and
  exactly one third-party origin allowed for scripts.
- **Subresource Integrity** on that third party. PeerJS is the only code in
  this app that is not ours, and it is pinned by `sha384` hash with
  `crossorigin="anonymous"`. If the CDN ever serves different bytes the
  browser refuses to run them — playing with friends stops working and nothing
  else does, which is the right way round.
- **`referrer: no-referrer`**, so no URL of yours leaks to the CDN.
- No `eval`, no `new Function`, no `document.write`, no string timers.
- The only `innerHTML` in the app writes the game icons, which are static SVG
  strings in this repo. No text from a player, a peer or a file is ever
  written as HTML — `PV.el` puts everything else in a text node.

**Not available on a static host:** `frame-ancestors` (clickjacking) and
`X-Content-Type-Options` need real response headers, which GitHub Pages does
not let you set. They are listed here as known gaps rather than left implied.

## If you want the source to be less convenient to read

That is a product decision, not a security one, and it has a real cost here:
this project has no build step, and every file is commented for the next
person who opens it. A minified bundle would slow down a casual reader by
about a minute and would not stop anyone who is actually trying. Ask, and it
can be added as an optional build — but it belongs under "housekeeping", not
under this heading.

## Reporting

Found something? Open an issue on the repository. Since there is no server and
no user data, the interesting reports are: a way to get HTML or script into
the page from a file or a peer, a way to make the app unusable from stored
data, or anything that reaches beyond this app's own origin.
