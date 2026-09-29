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
  load is untouched.
- There are no other players' saves to reach, no server to lie to, no
  leaderboard to poison, no payment and no personal data.
- Someone who gives themself a million XP has cheated at solitaire.

If PlayVault ever gets a real leaderboard, that changes completely — and the
answer then is not obfuscation either. It is a server that recomputes or
verifies what the client claims, because a score that arrives from a browser
is a **claim**, always, no matter how the client was written.

## A friend with F12: what they tried, and what happens now

This is what actually happened — a friend who writes code opened the developer
tools on the live site and changed the game from there, and the change was
still there after a refresh. Each way they had, and what it gets them today:

| What they try | What happens now |
| --- | --- |
| `PV.Profile.addXp(…)`, `PV.Store.set('chef.meta', …)` or any other line pasted into the console | `PV` is undefined. Nothing of the app — no store, no save, no running game — is reachable by name. |
| `localStorage.setItem(…)`, `localStorage['playvault.…'] = …`, `sessionStorage` | Refused: *PlayVault is locked: the console cannot change this page, its games or its saves.* |
| `el.textContent = …`, `.click()`, `.classList`, `.style`, `.dataset`, `innerHTML`, `remove()`, a listener on the page | Refused, with the same line. |
| Replacing `Math.random`, `JSON.stringify`, `Date.now`, `performance.now`, `requestAnimationFrame`, a WebGL or canvas method | Cannot: the language is frozen. No rigged crate, no slowed clock, no Strike Squad without walls. |
| A number typed over, `disabled` or `hidden` taken off, a class added, a node deleted, *Edit as HTML* in the Elements panel | Put back the moment it lands, and the console says so. The buttons re-check the save anyway: a shop button with its `disabled` taken off still says *not enough coins*. |
| Export → change `coins` in a text editor → Import | Refused: the file no longer matches its seal. |
| The same, on the copy in Google Drive | Refused the same way, before anything in it is even described. |
| A value changed in the Application tab's Local Storage | Dropped on the next read, because it no longer matches its seal (as before). |
| F12, Ctrl+Shift+I/J/C/K, Ctrl+U, right-click → Inspect | Do nothing. The browser's own menu still opens the developer tools. |

Every row of that table was checked in a real Chrome, driven over the DevTools
protocol — the same channel the developer tools themselves use — against the
built bundle; see "How it was tested" below.

## The lock: `js/core/guard.js`

The first script on the page, in the head, before anything else can run. It
is **on for the published site and off on this machine** — on `localhost`,
`127.0.0.1` and a file on disk the console is the developer's own tool. Add
`?guard` to the address to switch it on there and try it. And it is on only
in a browser whose stacks it can read: at start-up it reads its own frame
back, and a browser that writes stacks some way it does not know gets no lock
rather than a game that refuses its own code. Chrome, Firefox and Safari's
formats are all known and tested; the live checks below ran in Chrome.

What it does:

1. **The namespace is not a global.** Everything the app is hangs off one
   object, `PV`. While the page loads, `window.PV` answers only to this site's
   own scripts; once it has loaded it answers nobody. Every module took its own
   reference as it loaded, so the game carries on and the console finds `PV`
   undefined. That alone closes the cheat that started this — the app's own
   functions sealing a number somebody typed.
2. **The storage answers only to this site's code**: `localStorage`,
   `sessionStorage` and every method on them.
3. **The page is ours.** Every way a script can change what is on screen — an
   attribute, a class, a style, text, a node added or taken away, a button
   pressed, a listener added, a window opened — is wrapped. Asked by this
   site's scripts it works as it always did; asked by anything else it throws.
   Reading is left alone: the Elements panel shows all of it anyway.
4. **What changes anyway is put back.** The Elements panel does not go through
   any script, so (3) cannot see it. A `MutationObserver` can: a change inside
   PlayVault's part of the page that none of its own calls made is undone as it
   lands. A new `data-` attribute is left alone (it is how extensions mark a
   text box), the browser's own page translation is left alone (the player
   asked for it), and something that keeps rewriting the page hundreds of times
   a second is left alone after it has shown that it will, rather than fought
   for ever.
5. **The language is frozen**: `Object`, `Array`, `JSON`, `Math`, `Date`,
   `Promise` and the rest, `performance`, the 2D canvas, WebGL, the input
   events, and the bindings the page reaches for by name.

**How it knows who asked.** From the call stack, as GameTable's lock does: the
first frame that is not the lock itself and not a built-in is the caller. Code
typed into a console has no address (`<anonymous>:1:5` in Chrome, `debugger
eval code` in Firefox), a snippet or an extension has somebody else's, and a DOM
method handed to a timer from the console has no caller at all — all refused.
PeerJS and Google's sign-in script are let through by address, because they
call back in. This is why the lock is its own file, never in the bundle: the
bundle is one address for every script, and the lock's frames would look like
everybody's.

**What it costs.** Reading the stack costs tens of microseconds, so the lock
only reads it for a change to something that is on screen, and not at all for
a write that changes nothing — the panel hidden that was already hidden, which
is most of what a game does in a frame. Measured in Chrome on the built
bundle: most games ask it nothing in a frame, the puzzles about once a second
for their clock, and script time with and without the lock is within the
noise of the measurement (0–13%). Page load is unchanged.

**What still gets through — honestly:**

- **The browser's menu.** Developer tools open from the menu whatever a page
  does.
- **A breakpoint.** Paused inside one of PlayVault's functions, the console
  runs in that function and can change its variables; the Scope pane, *Store
  as global variable* and `queryObjects()` hand out live objects the same way.
  Nothing a page runs can switch the debugger off.
- **Local Overrides.** The Sources panel can serve an edited copy of any file,
  this one included.
- **A seal worked out by hand.** The seals below are computed by code that is
  in the public repository. Somebody who reads it can compute a seal for a
  record of their own and paste it into the Application tab, or into a backup
  file. That takes reading the source, which is the point.
- **Another page on the same origin.** Every site under `kaonhew02.github.io`
  is **one origin with one `localStorage`** — CardVerse, GameTable, MoneyFlow
  and the rest can all read and write PlayVault's keys, and their consoles are
  not locked by this file. The seals still apply there. Real isolation needs
  PlayVault on an origin of its own: a custom domain, or its own GitHub account.
- **A stylesheet rule** edited in the Styles pane changes how the page looks,
  and nothing else.

What is gone is the cheap cheat — a line pasted into the console, a number
typed over, a file edited in Notepad — and every one of the ways left needs a
debugger or the source open, and leaves the numbers that matter on that one
machine.

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
through the same `PV.Store.importAll`.

**First, the seal.** Every backup PlayVault writes — Export, To Drive, and the
automatic Drive copy — carries a `seal` over everything in its envelope, and a
file that no longer matches it is refused whole, with nothing restored. That
closed the easiest cheat there was, easier than any console: export, change a
number in a text editor, import, and the app sealed the edited numbers into
the records as if they had been earned. A backup saved before seals existed
has none, cannot be told apart from an edited one, and is refused too: export
a fresh copy, or press *To Drive*, from the browser that holds the progress.

**Then the rebuild.** Even a sealed file is not believed. It is parsed, then
**rebuilt from scratch** with `PV.Safe.plain`: plain objects and arrays only, no
functions, no non-finite numbers, bounded depth, key count, array length and
string length, and `__proto__` / `constructor` / `prototype` keys dropped on
the way through. Copying an own `__proto__` key into an object with
`Object.assign` sets that object's prototype instead of adding a key, which is
how a JSON file turns into an exploit; the per-game record is now built field
by field for the same reason. Stores that fail their own validator are
skipped, not restored badly. A Drive file over 4 MB is refused before it is
parsed — a real save is a few kilobytes, and parsing a huge one would freeze
the tab before anything asked.

### 3. Another person's browser, in a friends room

This is the only place bytes authored by someone else reach your machine. The
room is host-authority — a guest may only *ask* or *announce*, and the host
alone begins a round, rewrites the roster or ends the game — and on top of
that every field arriving on the wire is rebuilt: names capped at 24
characters, seats to 0–15, levels to 1–9,999, the roster to 16 members,
option values to short scalars, seeds and rounds to integers, scoreboard rows
to finite clamped numbers and a result from a fixed list. A guest who
un-hides the host's buttons in the Elements panel (it is put back anyway)
finds they do nothing: *call it* and *rematch* check `room.isHost`, not the
button.

**What this cannot do is make a peer honest.** On a shared seed with no
server, a patched client can claim a score it did not earn. That is inherent
to peer-to-peer play without an authority, it is written here rather than
pretended away, and the rooms are six digits read out loud to people you know.

**The relay, when there is one.** Friends whose networks cannot reach each
other directly go through a TURN relay, set in `js/core/relay-config.js`.
It carries WebRTC's packets, which are encrypted end to end, so it never
sees a move, a name or a save — only that two addresses are talking. Its
credentials are public by design: a browser has to be handed them, as in
every browser app that uses TURN, and anyone with the developer tools open
can read them. The worst that costs is the relay plan's monthly quota; if
it is ever abused, new credentials at the provider replace these. `net.js`
takes only well-formed `turn:`/`turns:` entries from that file, and a relay
that is down leaves direct connections alone.

## The Drive copy

`Settings → Your data` has **To Drive**, **From Drive** and an **Auto**
switch (off by default). It is the only way a save leaves the
browser, and only when the player asks. `js/core/drive.js` is a port of
CardVerse's, which is the canonical copy for every GameHub game.

- **What goes up** is exactly what Export writes, seal and all, and only that —
  theme, language and the Drive switches stay on the device. It lands in a
  `GameHub` folder in the signed-in player's own My Drive, as
  `playvault-data.json`.
- **The scope is `drive.file`**: only files this app created. It cannot list,
  read or touch anything else in anybody's Drive. Every player gets their own
  folder in their own Drive; nobody can reach anybody else's.
- **The token lives in memory only.** It is never written to storage, and a
  reload forgets it. The OAuth client ID in `js/core/drive-config.js` is
  public by design; there is no client secret, and must never be one.
- **An id from Drive is checked for shape** before it goes into the next
  request's URL, so a strange answer cannot steer a request somewhere else.
- **Coming back down, it is input #2 above**: its seal checked before it is
  even summarised, then rebuilt, validated, and restored only after the player
  has seen what is in both copies and said yes. The file sits in the player's
  own Drive, where anyone with the account can download it, change a number and
  upload it again — which is exactly what the seal is for.

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
- The lock lets it through by address — it opens its sign-in window through
  the wrapped `window.open` — and it still arrives into frozen built-ins. That
  was checked: the library loads, and *To Drive* opens Google's window.
- It tries to insert an inline stylesheet for Google's own sign-in button,
  which PlayVault never shows. `style-src` refuses it on purpose; the one
  console error that leaves is expected.

## Page-level hardening

- **The lock** (above), first in the head.
- **Content-Security-Policy** (in `index.html`): `default-src 'self'`, no
  inline script, no `eval`, no plugins, no form posts, `base-uri 'none'`, and
  two third-party script sources, each named down to the file: PeerJS's
  `1.5.4/peerjs.min.js` on cdnjs — not the whole of cdnjs, which would let in
  any library it hosts — and the one Google sign-in file above.
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
- **The page is a picture, never the source of truth.** No button trusts its
  own `disabled`, and no handler reads a price, a level or a count back out of
  the page: every shop, unlock, claim and start re-checks the save it was
  handed. That is why a button re-enabled in the Elements panel, before the
  lock puts it back, still does nothing.

**Not available on a static host:** `frame-ancestors` (clickjacking) and
`X-Content-Type-Options` need real response headers, which GitHub Pages does
not let you set; so does `Cross-Origin-Opener-Policy`, which would stop another
page on the same origin that opened PlayVault from reaching into it. They are
listed here as known gaps rather than left implied.

## Speed bumps, filed honestly as speed bumps

These were asked for, they are worth having, and none of them is a lock. They
are listed apart from the sections above for that reason.

### The deployed site is one stripped bundle

`node tools/build.js` reads the script list from `index.dev.html`, strips the
comments and indentation out of all 122 files and writes `js/playvault.min.js`
plus the `index.html` that loads it. 1.9 MB of commented source becomes one
1.2 MB file. The deployed page loads three scripts: the lock, PeerJS, and the
bundle (Google's sign-in script is added only when Drive needs it).

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

- `node tools/smoke.js --min` runs the entire test suite — 2.5 million checks
  — against the minified source, which is the evidence that stripping it did
  not change what it does.
- The bundle carries a hash of the files that went into it (the lock
  included), and the smoke tests fail if it no longer matches. A bundle one
  edit behind the code is a bug that only appears in production, after a push.

### Records and backups are sealed against a hand edit

`profile` and `stats` are stored with a checksum of themselves, and so is
each game's record of coins and unlocks (`crowd.meta`, `worms.meta`,
`fps.meta`, `hide.meta`, `stick.meta`, `chef.meta`), and so is every backup
file. A record that does not match its own sum is dropped on the next read
and the app starts that record again, so editing a number in devtools does not
survive a refresh; a backup that does not match is not restored at all.

The salt is a constant in the same JavaScript the player already has, so
anyone who reads the source can recompute a sum. It stops casual editing of a
save and of a backup file, and it is not a defence against somebody who reads
the code — nothing stored locally can be, and nothing needs to be while the
records mean something only on that machine.

### F12, the DevTools keys and the right-click menu

On the published site F12, Ctrl+Shift+I/J/C/K and Ctrl+U (Cmd+Option+I/J/C/U
on a Mac) do nothing, the right-click menu does not open (except in a text box
and over selected text), and the console opens on a warning in English and
Chinese that anyone asking you to paste something there is playing a trick on
you. The browser's own menu still opens the developer tools, and nothing a
page does can stop that. What these stop is the reflex — and the warning stops
the "paste this into your console" trick, which works on people rather than on
code.

## How it was tested

- `node tools/smoke.js` (and `--min`): the backup seal (an edited, unsealed,
  re-dated or re-sealed-by-hand file is refused, a real round trip through a
  file is not), a record sealed by every earlier version still opening, the
  lock's reading of Chrome, Firefox and Safari stacks, where it switches on,
  and every engine playing with the language frozen while `Math.random`,
  `JSON.stringify`, `Array.prototype.push` and `Object.prototype` hooks all
  fail.
- `node tools/lockcheck.mjs --net`: a real, headless Chrome driven over the
  DevTools protocol against the built bundle with the lock on — every row of
  the table above as a console paste and as an Elements-panel edit; all
  sixteen games played on into a match with no error and nothing of their own
  put back; Export, Import and a refused edited file through the real file
  input; Google's library loading and *To Drive* opening its window; and two
  locked tabs opening a room, joining it and starting a match over PeerJS.

## Reporting

Found something? Open an issue on the repository. Since there is no server and
no user data, the interesting reports are: a way to get HTML or script into
the page from a file, a Drive copy or a peer, a way to make the app unusable
from stored data, a way past the lock that does not need a debugger, or
anything that reaches beyond this app's own origin and the player's own Drive
file.
