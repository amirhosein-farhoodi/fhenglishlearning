#!/usr/bin/env python3
"""
extract_book.py - Turn a "Grammar in Use"-style PDF into per-unit raw text files
that an LLM (or a human) can convert into course JSON.

Requirements: Python 3.9+ and `pdftotext` (poppler) on PATH.
  Windows: install poppler (e.g. via Git for Windows/MSYS2, or https://github.com/oschwartz10612/poppler-windows)
  macOS:   brew install poppler
  Linux:   apt install poppler-utils

Usage:
  python tools/extract_book.py source-books/my-book.pdf --slug my-book --units 145

Options:
  --slug            Folder name used under content-src/ and src/content/books/  (required)
  --units           Number of units in the book (required)
  --pages-per-unit  Pages per unit (default 2: explanation page + exercises page)
  --first-page      1-based PDF page index of the first unit's first page. Default: auto-detect.
  --key-marker      Regex for answer-key unit headings in raw text (default: ^UNIT (\d+)\s*$)
  --no-key          The book has no answer key section.

Output (content-src/<slug>/raw/):
  unit-001.md ... unit-NNN.md   one file per unit: lesson page, exercise page, answer key
  toc.json                      { "1": "Present continuous (I am doing)", ... }
  pages.txt                     every page of the PDF with === PAGE n === markers (fallback)
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

NOISE = [
    r'^\s*facebook\.com/\S+\s*$', r'^\s*vk\.com/\S+\s*$',
    r'^\s*Key to Exercises\s*$', r'^\s*\d{1,3}\s*$',
]

def run_pdftotext(pdf, layout):
    if not shutil.which('pdftotext'):
        sys.exit('ERROR: pdftotext not found on PATH. Install poppler (see header of this script).')
    out = tempfile.mktemp(suffix='.txt')
    cmd = ['pdftotext'] + (['-layout'] if layout else []) + [pdf, out]
    subprocess.run(cmd, check=True)
    with open(out, encoding='utf-8', errors='replace') as f:
        txt = f.read()
    os.remove(out)
    return txt

def clean(text):
    lines = []
    for l in text.split('\n'):
        if any(re.match(p, l) for p in NOISE):
            continue
        lines.append(l.rstrip())
    # collapse 3+ blank lines
    out = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines))
    return out.strip('\n')

def detect_first_page(pages, per_unit):
    for i in range(len(pages) - per_unit):
        p = pages[i]
        if re.search(r'^\s*Unit\s*$', p, re.M) and re.search(r'^\s*1\s+\S', p, re.M):
            nxt = pages[i + per_unit - 1]
            if re.search(r'^\s*1\.1\s', nxt, re.M):
                return i
    return None

def unit_title(page, n, toc):
    """Headings appear as either
         Unit

3 Title (sub)         -> "Title (sub)"
       or (long titles)
         Unit Title

3 (sub)         -> "Title (sub)"
    """
    num = re.search(r'^\s*%d\s+(\S.*?)\s*$' % n, page, re.M)
    lead = re.search(r'^\s*Unit\s+(\S.*?)\s*$', page, re.M)
    num_t = num.group(1) if num and not re.match(r'^\d', num.group(1)) else ''
    lead_t = lead.group(1) if lead else ''
    if lead_t and num_t:
        return f'{lead_t} {num_t}'.strip()
    if num_t and not num_t.startswith('('):
        return num_t
    if lead_t:
        return lead_t
    return toc.get(str(n), f'Unit {n}')

def parse_toc(full_text, units):
    """Best effort: look for lines like ' 12 for and since ...' in the Contents area."""
    toc = {}
    head = full_text[:60000]
    for m in re.finditer(r'^\s*(\d{1,3})\s+([A-Za-z\-\'\u2019/(].*?)\s*$', head, re.M):
        n = int(m.group(1))
        if 1 <= n <= units and str(n) not in toc:
            toc[str(n)] = m.group(2).strip()
    return toc

def split_key(raw_text, marker, units):
    text = raw_text.replace('\f', '\n')
    lines = text.split('\n')
    starts = []
    for i, l in enumerate(lines):
        m = re.match(marker, l)
        if m:
            starts.append((i, int(m.group(1))))
    key = {}
    end_markers = re.compile(r'^(Key to Additional exercises|Key to Study guide|Index)\s*$')
    for idx, (i, n) in enumerate(starts):
        j = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        # stop early at an end marker
        for k in range(i + 1, j):
            if end_markers.match(lines[k]):
                j = k; break
        if 1 <= n <= units:
            key[n] = clean('\n'.join(lines[i + 1:j]))
    return key

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--slug', required=True)
    ap.add_argument('--units', type=int, required=True)
    ap.add_argument('--pages-per-unit', type=int, default=2)
    ap.add_argument('--first-page', type=int, default=None, help='1-based PDF page of unit 1')
    ap.add_argument('--key-marker', default=r'^UNIT (\d+)\s*$')
    ap.add_argument('--no-key', action='store_true')
    a = ap.parse_args()

    out_dir = os.path.join('content-src', a.slug, 'raw')
    os.makedirs(out_dir, exist_ok=True)

    print('Extracting text (layout mode)...')
    layout = run_pdftotext(a.pdf, True)
    print('Extracting text (raw mode, for answer key)...')
    raw = run_pdftotext(a.pdf, False)
    pages = layout.split('\f')

    with open(os.path.join(out_dir, 'pages.txt'), 'w', encoding='utf-8') as f:
        for i, p in enumerate(pages):
            f.write(f'\n\n=== PAGE {i + 1} ===\n{p}')

    first = (a.first_page - 1) if a.first_page else detect_first_page(pages, a.pages_per_unit)
    if first is None:
        sys.exit('ERROR: could not auto-detect the first unit page. Pass --first-page N (1-based).')
    print(f'First unit starts on PDF page {first + 1}')

    toc = parse_toc(layout, a.units)
    key = {} if a.no_key else split_key(raw, a.key_marker, a.units)
    if not a.no_key:
        missing = [n for n in range(1, a.units + 1) if n not in key]
        print(f'Answer key found for {len(key)} units' + (f'; missing: {missing}' if missing else ''))

    titles = {}
    for n in range(1, a.units + 1):
        start = first + (n - 1) * a.pages_per_unit
        unit_pages = pages[start:start + a.pages_per_unit]
        if len(unit_pages) < a.pages_per_unit:
            print(f'WARNING: ran out of pages at unit {n}'); break
        title = unit_title(unit_pages[0], n, toc)
        titles[str(n)] = title
        parts = [f'# Unit {n} — {title}\n']
        labels = ['Lesson page (explanations & examples)', 'Exercises page'] + [f'Page {i+1}' for i in range(2, a.pages_per_unit)]
        for i, p in enumerate(unit_pages):
            parts.append(f'\n## {labels[i]}\n\n```\n{clean(p)}\n```\n')
        if n in key:
            parts.append(f'\n## Answer key\n\n```\n{key[n]}\n```\n')
        with open(os.path.join(out_dir, f'unit-{n:03d}.md'), 'w', encoding='utf-8') as f:
            f.write(''.join(parts))

    with open(os.path.join(out_dir, 'toc.json'), 'w', encoding='utf-8') as f:
        json.dump(titles, f, indent=2, ensure_ascii=False)
    print(f'Wrote {len(titles)} unit files to {out_dir}')
    print('Next: follow tools/prompts/author-unit.md to convert raw units into course JSON, or run /add-book in Claude Code.')

if __name__ == '__main__':
    main()
