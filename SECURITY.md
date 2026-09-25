# Security

PlayVault is a static site. There is no server, no account, no password and no
database — every game runs in the browser, and every save is in that browser's
own `localStorage`.

That one fact decides everything below. The single optional exception is a
copy the player sends to **their own** Google Drive, and it has its own
section further down.

## The thing people ask first: can the JavaScript be hidden?

**No.** Not here, not anywhere, not by anyone. The deployed code IS bundled
and stripped of comments (see "speed bumps" below, and `tools/build.js`)
because being tiresome to read is worth something — but that is tidiness, not
protection, and the rest of this section is why.

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

`Settings → Import` takes a file, and `From Drive` fetches one — both go
through the same `PV.Store.importAll`. It is parsed, then **rebuilt from scratch**
with `PV.Safe.plain`: plain objects and arrays only, no functions, no
non-finite numbers, bounded depth, key count, array length and string length,
and `__proto__` / `constructor` / `prototype` keys dropped on the way through.
Copying an own `__proto__` key into an object with `Object.assign` sets that
object's prototype instead of adding a key, which is how a JSON file turns
into an exploit; the per-game record is now built field by field for the same
reason. Stores that fail their own validator are skipped, not restored badly.
A Drive file over 4 MB is refused before it is parsed — a real save is a few
kilobytes, and parsing a huge one would freeze the tab before anything asked.

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

## The Drive copy

`Settings → Your data` has **To Drive**, **From Drive** and an **Auto**
switch (off by default). It is the only way a save leaves the
browser, and only when the player asks. `js/core/drive.js` is a port of
CardVerse's, which is the canonical copy for every GameHub game.

- **What goes up** is exactly what Export writes, and only that — theme,
  language and the Drive switches stay on the device. It lands in a `GameHub`
  folder in the signed-in player's own My Drive, as `playvault-data.json`.
- **The scope is `drive.file`**: only files this app created. It cannot list,
  read or touch anything else in anybody's Drive. Every player gets their own
  folder in their own Drive; nobody can reach anybody else's.
- **The token lives in memory only.** It is never written to storage, and a
  reload forgets it. The OAuth client ID in `js/core/drive-config.js` is
  public by design; there is no client secret, and must never be one.
- **An id from Drive is checked for shape** before it goes into the next
  request's URL, so a strange answer cannot steer a request somewhere else.
- **Coming back down, it is input #2 above**: rebuilt, validated, and only
  after the player has seen what is in both copies and said yes.

### Google's sign-in script, which cannot be pinned

Signing in needs `https://accounts.google.com/gsi/client`. Google serves it
unversioned and changes it without notice, so unlike PeerJS it **cannot** carry
an `integrity` hash — whatever Google serves runs, with the same reach into
this page as the app's own code, which includes reading every save in it.
That is a trust extended to Google, and it is kept as small as it can be:

- **It is not on the page.** `drive.js` fetches it only when Drive is about to
  be used: when the Settings screen is opened (so the first press can open
  its sign-in window straight away — Safari blocks a window opened after a
  network wait), when a hand reaches for the Games screen's "Load from Drive"
  offer, or when auto-save is on and has something to send. A player who
  never opens Settings and never turns auto-save on never runs it.
- The Content-Security-Policy names exactly that file, plus the two Google
  origins the Drive calls and the sign-in library need.
- It tries to insert an inline stylesheet for Google's own sign-in button,
  which PlayVault never shows. `style-src` refuses it on purpose; the one
  console error that leaves is expected.

## Page-level hardening

- **Content-Security-Policy** (in `index.html`): `default-src 'self'`, no
  inline script, no `eval`, no plugins, no form posts, `base-uri 'none'`, and
  two third-party script sources: PeerJS's CDN, and the one Google sign-in
  file above.
- **Subresource Integrity** on PeerJS, pinned by `sha384` hash with
  `crossorigin="anonymous"`. If the CDN ever serves different bytes the
  browser refuses to run them — playing with friends stops working and nothing
  else does, which is the right way round. Google's sign-in script is the one
  thing that cannot be pinned; see the section above.
- **`referrer: no-referrer`**, so no URL of yours leaks to the CDN or to Google.
- No `eval`, no `new Function`, no `document.write`, no string timers.
- The only `innerHTML` in the app writes the game icons, which are static SVG
  strings in this repo. No text from a player, a peer or a file is ever
  written as HTML — `PV.el` puts everything else in a text node.

**Not available on a static host:** `frame-ancestors` (clickjacking) and
`X-Content-Type-Options` need real response headers, which GitHub Pages does
not let you set. They are listed here as known gaps rather than left implied.

## Two speed bumps, filed honestly as speed bumps

These were asked for, they are worth having, and neither is a lock. They are
listed apart from the section above for that reason.

### The deployed site is one stripped bundle

`node tools/build.js` reads the script list from `index.dev.html`, strips the
comments and indentation out of all 71 files and writes `js/playvault.min.js`
plus the `index.html` that loads it. 751 kB of commented source becomes one
446 kB file, and the deployed page has exactly two script tags (Google's
sign-in script is added only when Drive needs it).

What it buys: someone opening Sources on the live site sees one dense file
instead of a tour of the codebase with the reasoning written in.

What it does not buy: **anything at all against a determined reader.** Every
identifier keeps its name, devtools pretty-prints it in one click, and the
readable original is in this public repository. If the source itself must not
be readable, the only lever that actually moves is making the repository
private — and even then the bundle is still downloadable by anyone who can
load the page, because a browser cannot run code it has not been given.

Two guards come with it, because a build step's real risk is shipping
something that does not match the source:

- `node tools/smoke.js --min` runs the entire test suite — 2.7 million checks
  — against the minified source, which is the evidence that stripping it did
  not change what it does.
- The bundle carries a hash of the files that went into it, and the smoke
  tests fail if it no longer matches. A bundle one edit behind the code is a
  bug that only appears in production, after a push.

### Records are sealed against a hand edit

`profile` and `stats` are stored with a checksum of themselves, and so is
each game's record of coins and unlocks (`crowd.meta`, `worms.meta`,
`fps.meta`). A value that does not match its own sum is dropped on the next
read and the app starts that record again, so editing a number in devtools
does not survive a refresh — which is the thing that actually happened.

The salt is a constant in the same JavaScript the player already has, so
anyone who reads the bundle can recompute a sum. Treat this as what it is: it
stops casual editing of a local save, and it is not a defence against
anybody who is trying. Nothing stored locally can be, and nothing needs to be
while the records mean something only on that machine.

## Reporting

Found something? Open an issue on the repository. Since there is no server and
no user data, the interesting reports are: a way to get HTML or script into
the page from a file, a Drive copy or a peer, a way to make the app unusable
from stored data, or anything that reaches beyond this app's own origin and
the player's own Drive file.
