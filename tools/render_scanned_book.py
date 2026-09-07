#!/usr/bin/env python3
"""
render_scanned_book.py - the extract_book.py counterpart for **scanned** PDFs.

Some "... in Use" PDFs are page images with no text layer, so `pdftotext` returns nothing and
tools/extract_book.py cannot be used. This script instead renders each unit's pages to PNGs that
an LLM (or a human) can read directly, plus the answer-key pages, and writes an index.json that
says which files belong to which unit.

Requirements: Python 3.9+ and PyMuPDF (`pip install pymupdf`).

Usage (Essential Grammar in Use, 3rd edition - unit 27 is absent from that scan):
  python tools/render_scanned_book.py source-books/essential-english-grammar-in-use.pdf \
      --slug essential-english-grammar-in-use --units 115 --first-page 13 \
      --skip-units 27 --key-pages 283-308 \
      --key-starts 282:1,283:4,284:8,285:11,286:16,287:20,288:24,289:29,290:33,291:38,\
292:43,293:46,294:50,295:54,296:59,297:63,298:68,299:72,300:77,301:82,302:87,303:90,\
304:95,305:99,306:102,307:108,308:111

How the page maths works
  Units run two pages each (left = explanation, right = exercises) in book order, so
  a unit's first page is `--first-page` plus two pages for every unit *present* before it.
  `--skip-units` lists units whose pages are missing from the scan: they consume no pages and
  get no output, which keeps every later unit aligned. Verify with --check before a full render.

Output (content-src/<slug>/pages/):
  unit-001-a.png, unit-001-b.png ...   lesson page and exercises page per unit
  key-283.png ...                      answer-key pages (shared by several units)
  index.json                           per unit: its two page images plus the key page(s) that
                                       hold its answers, so an author knows exactly what to read
"""
import argparse
import json
import os
import sys

try:
    import pymupdf
except ImportError:
    sys.exit('ERROR: PyMuPDF is required. Install it with:  pip install pymupdf')


def parse_ranges(spec):
    """'27' or '3,27' or '283-308' -> sorted list of ints."""
    out = set()
    for part in filter(None, (p.strip() for p in (spec or '').split(','))):
        if '-' in part:
            a, b = part.split('-', 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return sorted(out)


def unit_first_page(n, first_page, skip):
    """1-based PDF page of unit n's lesson page (None if the unit is not in the scan)."""
    if n in skip:
        return None
    present_before = sum(1 for k in range(1, n) if k not in skip)
    return first_page + 2 * present_before


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--slug', required=True)
    ap.add_argument('--units', type=int, required=True)
    ap.add_argument('--first-page', type=int, required=True, help="1-based PDF page of unit 1's lesson page")
    ap.add_argument('--pages-per-unit', type=int, default=2)
    ap.add_argument('--skip-units', default='', help='units missing from the scan, e.g. "27" or "27,63-64"')
    ap.add_argument('--key-pages', default='', help='answer-key PDF pages, e.g. "283-308"')
    ap.add_argument('--key-starts', default='',
                    help='"<pdf page>:<first unit on it>" pairs, e.g. "282:1,283:4,284:8". Used to '
                         'tell each unit which key page(s) hold its answers.')
    ap.add_argument('--zoom', type=float, default=2.0, help='render scale; 2.0 is comfortably readable')
    ap.add_argument('--only', default='', help='render just these units, e.g. "1-12" (index.json still covers all)')
    ap.add_argument('--check', action='store_true', help='print the unit -> page mapping and exit')
    a = ap.parse_args()

    skip = set(parse_ranges(a.skip_units))
    key_pages = parse_ranges(a.key_pages)
    only = set(parse_ranges(a.only)) if a.only else None

    # [(pdf page, first unit on that page)], ascending
    key_starts = sorted(
        (int(p.split(':')[0]), int(p.split(':')[1]))
        for p in filter(None, (x.strip() for x in a.key_starts.split(',')))
    )

    def key_files_for(n):
        """The key page(s) that can hold unit n's answers: the page it starts on, plus the next."""
        if not key_starts:
            return []
        page = key_starts[0][0]
        for pno, first_unit in key_starts:
            if first_unit <= n:
                page = pno
            else:
                break
        return [f'key-{p}.png' for p in (page, page + 1) if p <= (key_pages[-1] if key_pages else page)]

    doc = pymupdf.open(a.pdf)
    out_dir = os.path.join('content-src', a.slug, 'pages')

    mapping = {}
    for n in range(1, a.units + 1):
        start = unit_first_page(n, a.first_page, skip)
        if start is None:
            continue
        pages = list(range(start, start + a.pages_per_unit))
        if pages[-1] > doc.page_count:
            print(f'WARNING: unit {n} would need PDF page {pages[-1]} but the file has {doc.page_count}')
            break
        mapping[n] = pages

    if a.check:
        print(f'{a.pdf}: {doc.page_count} pages')
        print(f'skipping units (absent from the scan): {sorted(skip) or "none"}')
        for n in sorted(mapping):
            if n <= 3 or n >= a.units - 2 or n % 25 == 0:
                print(f'  unit {n:>3} -> PDF pages {mapping[n]}')
        print(f'answer-key pages: {key_pages[0]}-{key_pages[-1]}' if key_pages else 'answer-key pages: none')
        return

    os.makedirs(out_dir, exist_ok=True)
    m = pymupdf.Matrix(a.zoom, a.zoom)
    suffix = 'abcdefgh'
    written = 0

    for n, pages in sorted(mapping.items()):
        if only and n not in only:
            continue
        for i, pno in enumerate(pages):
            f = os.path.join(out_dir, f'unit-{n:03d}-{suffix[i]}.png')
            doc[pno - 1].get_pixmap(matrix=m).save(f)
            written += 1

    for pno in key_pages:
        if pno > doc.page_count:
            continue
        f = os.path.join(out_dir, f'key-{pno}.png')
        doc[pno - 1].get_pixmap(matrix=m).save(f)
        written += 1

    index = {
        'slug': a.slug,
        'pdf': os.path.basename(a.pdf),
        'units': a.units,
        'readMe': (
            'Every filename is numbered by PDF page, which is usually NOT the page number printed '
            'on the page itself, so key-283.png may well show printed page 284. Go by the "key" '
            'list under each unit rather than by the printed folio, and if a unit is not on the '
            'page you were given, look at the next key-*.png - the key runs in unit order and each '
            'page holds several units.'
        ),
        'skippedUnits': sorted(skip),
        'keyPages': [f'key-{p}.png' for p in key_pages],
        'unitPages': {
            str(n): {
                'lesson': f'unit-{n:03d}-a.png',
                'exercises': f'unit-{n:03d}-b.png',
                'key': key_files_for(n),
                'pdfPages': pages,
            }
            for n, pages in sorted(mapping.items())
        },
    }
    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, indent=2)

    print(f'Wrote {written} PNG(s) to {out_dir}')
    if skip:
        print(f'Units absent from the scan (no pages, leave them unauthored): {sorted(skip)}')
    print('Next: author units from these images following tools/prompts/author-unit.md.')


if __name__ == '__main__':
    main()
