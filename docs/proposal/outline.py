# Reads a PDF's bookmarks and writes the page each heading landed on, in
# document order, as the footer numbers it: the cover is its own section, so
# the page after it is page 1.
#   python outline.py in.pdf out.json [expected-count]
import json, sys
import pymupdf

pdf, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(pdf)
toc = doc.get_toc()
pages = [page - 1 for level, title, page in toc]
if len(sys.argv) > 3 and len(pages) != int(sys.argv[3]):
    sys.exit(f'{pdf}: {len(pages)} bookmarks, expected {sys.argv[3]}')
json.dump(pages, open(out, 'w'))
print(f'{pdf}: {doc.page_count} pages, {len(pages)} headings, last heading on page {pages[-1]}')
