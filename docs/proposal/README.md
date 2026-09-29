# Building the project proposal

`docs/PROPOSAL.md` is the proposal. Everything else — the Word and PDF
editions beside it and the figures in `docs/img/` — is generated from it and
from the scripts here. Edit the Markdown, then rebuild; never edit the .docx
or the PDF by hand.

This folder is documentation tooling. It has its own `package.json` and its
own `node_modules/` so that PlayVault itself keeps no dependencies.

## What you need

- Node.js 22 or newer, and `npm install` run once in this folder
- Python 3 with PyMuPDF (`pip install pymupdf`), to read the PDF's bookmarks
- Windows with Microsoft Word or WPS Office, for the PDF
- Chrome or Edge, only to retake the screenshots

## Commands

Run from this folder.

```
powershell -ExecutionPolicy Bypass -File build.ps1   # the .docx and the PDF
node diagrams.mjs                                    # the seven diagrams in docs/img/*.svg
node screenshots.mjs                                 # retake the screenshots into .build/shots/
node compose.mjs                                     # lay them out as docs/img/*.png
```

| File | Does |
| --- | --- |
| `build-proposal.mjs` | `PROPOSAL.md` → the .docx: cover, document control, contents, numbered sections, figures |
| `build.ps1` | Two layout passes: build, export, read the page of every heading, build again with those page numbers, export, check nothing moved |
| `export-pdf.ps1` | .docx → PDF through whatever answers for `Word.Application` |
| `outline.py` | Reads the PDF's bookmarks and writes the page each heading landed on |
| `diagrams.mjs` | The architecture, families, friends, lock, commits, codebase and Phase 4 figures, drawn as SVG |
| `screenshots.mjs` | Plays the built bundle in headless Chrome and saves frames |
| `compose.mjs` | The recipe for the four screenshot figures: which frame, which order, which label |

## Things that are not obvious

- **The contents page is filled in by these scripts, not by Word.** On the
  machine this was built on, `Word.Application` is answered by WPS Office,
  which can show a filled-in contents field but cannot build one. So the
  generator writes a real TOC field with its entries already in it, and the
  page numbers come from the first pass's PDF. Word can still refresh the
  field (right-click → Update Field) if the .docx is edited.
- **The .docx declares Word 2007 compatibility.** WPS lays tables out by the
  2007 rules whatever the file says, so Word is asked to agree; each table's
  indent equals its cell margin, which puts its border on the page margin in
  both.
- **A section starts on a new page**, so the generator leaves out the spacer
  after a section's last table or list — one that fell to a new page on its
  own used to leave that page blank.
- **Numbers in the figures are the proposal's.** `diagrams.mjs` draws the
  commit counts, line counts and Phase 4 dates from its own data; change them
  there and in `PROPOSAL.md` together.
- **Screenshots are taken mid-game**, so each run gives different frames. Look
  at `.build/shots/` before running `compose.mjs` over the committed figures,
  or pass `--out=<dir>` to lay them out somewhere else first.
