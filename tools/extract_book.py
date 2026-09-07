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
  --detect-headings Find each unit by its "Unit / N Title" heading instead of assuming a fixed
                    number of pages per unit. Use this when a unit's exercises overflow onto an
                    extra page, which makes fixed pagination drift out of step.
  --key-marker      Regex for answer-key unit headings in raw text (default: ^UNIT (\d+)\s*$)
  --no-key          The book has no answer key section.
  --repair-font-shift
                    Some text boxes use an embedded font whose encoding is offset, so pdftotext
                    returns mojibake ("KDUGO\ZDLW..."). This learns the offsets the PDF actually
                    uses, then decodes the affected blocks. The encoder also drops the spaces, so
                    decoded words run together - readable, but split them by eye. Ordinary prose is
                    never touched: a block must be one long run of letters with no English in it
                    before a shift is even tried.

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

COMMON_WORDS = ('the', 'and', 'for', 'you', 'that', 'with', 'have', 'this', 'was', 'not',
                'his', 'her', 'they', 'from', 'been', 'when', 'what', 'would', 'there', 'about')


def _english_score(text):
    """Rough count of common English words. Works on text with the spaces stripped out."""
    low = text.lower()
    return sum(low.count(w) for w in COMMON_WORDS)


VOWELS = set('aeiouAEIOU')


def _vowel_ratio(text):
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(c in VOWELS for c in letters) / len(letters)


def _shift(text, n):
    return ''.join(chr(ord(c) + n) if 32 <= ord(c) + n < 127 else c for c in text)


def _plausible_english(text):
    """English running text sits near 38% vowels; encoded text is far off."""
    return 0.25 <= _vowel_ratio(text) <= 0.55


def _longest_letter_run(line):
    return max((len(m) for m in re.findall(r'[A-Za-z]+', line)), default=0)


def _is_garbled_line(line):
    """A line produced by one of these broken fonts, as opposed to ordinary text.

    The decisive clue is that the encoder also loses the spaces, so the whole line arrives as one
    long letter run. Requiring that keeps the repair away from normal prose, which never has a
    15-letter word - mistaking real text for mojibake and 'decoding' it is the one outcome worth
    ruling out, since it would silently corrupt a sentence an author then trusts.
    """
    return (sum(c.isalpha() for c in line) >= 12
            and _english_score(line) == 0
            and _longest_letter_run(line) >= 15)


def _garbled_blocks(page):
    """Runs of consecutive lines that look like broken-font output."""
    lines = page.split('\n')
    flag = [_is_garbled_line(l) for l in lines]
    blocks, i = [], 0
    while i < len(lines):
        if not flag[i]:
            i += 1
            continue
        j = i
        while j < len(lines) and (flag[j] or not lines[j].strip()):
            j += 1
        blocks.append([k for k in range(i, j) if flag[k]])
        i = j
    return lines, blocks


# A shift is only trusted once this many separate long blocks agree on it. Deliberately strict:
# a wrong shift turns mojibake into plausible-looking nonsense, which is far more dangerous than
# leaving it obviously broken, and a genuinely broken font is reused across many pages.
MIN_BLOCKS_PER_SHIFT = 5


def learn_font_shifts(pages):
    """Find the codepoint offsets used by this PDF's broken fonts.

    Only long garbled blocks vote, a shift must turn one into several real English words, and the
    shift must then be corroborated by MIN_BLOCKS_PER_SHIFT blocks. One-off winners are flukes -
    a short block can score a few accidental hits on almost any offset.
    """
    found = {}
    for page in pages:
        lines, blocks = _garbled_blocks(page)
        for block in blocks:
            text = '\n'.join(lines[k] for k in block)
            if sum(c.isalpha() for c in text) < 30:
                continue
            best, best_score = None, 3
            for shift in range(-60, 61):
                if shift == 0:
                    continue
                out = _shift(text, shift)
                score = _english_score(out)
                if score > best_score and _plausible_english(out):
                    best, best_score = shift, score
            if best is not None:
                found[best] = found.get(best, 0) + 1
    return sorted((k for k, n in found.items() if n >= MIN_BLOCKS_PER_SHIFT), key=lambda k: -found[k])


def repair_font_shift(page, shifts):
    """Decode the garbled blocks of one page using the document's known shifts.

    Returns (text, [shifts applied]). A block is only rewritten when one of the known shifts turns
    it into plausible English, so text that merely looks unusual is left alone.
    """
    if not shifts:
        return page, []
    lines, blocks = _garbled_blocks(page)
    out, applied = list(lines), []
    for block in blocks:
        text = '\n'.join(lines[k] for k in block)
        best, best_key = None, None
        for shift in shifts:
            cand = _shift(text, shift)
            # A real English word, not merely a believable vowel count. Without this, blocks that
            # are legitimately word-like but wordless (vocabulary boxes, index entries) get shifted
            # into nonsense.
            if _english_score(cand) < 1 or not _plausible_english(cand):
                continue
            key = (_english_score(cand), -abs(_vowel_ratio(cand) - 0.38))
            if best_key is None or key > best_key:
                best, best_key = shift, key
        if best is None:
            continue
        for k in block:
            out[k] = _shift(lines[k], best)
        applied.append(best)
    return '\n'.join(out), applied


def detect_unit_pages(pages, units, first_hint):
    """Map unit number -> (start, end) page indices using the "Unit" / "N Title" headings.

    Lesson pages of "... in Use" books open with a line containing only `Unit` and then a line
    starting with the unit number. Locating those makes extraction immune to units that spill
    onto an extra page. Returns None if the headings cannot be found reliably.
    """
    starts = {}
    for i in range(first_hint, len(pages)):
        head = [l for l in pages[i].split('\n') if l.strip()][:4]
        # 'Unit' on its own, or 'Unit <first half of a long title that wrapped>'
        if not head or not re.match(r'^\s*Unit\b', head[0]):
            continue
        for l in head[1:]:
            m = re.match(r'^\s*(\d{1,3})\s+\S', l)
            if not m:
                continue
            n = int(m.group(1))
            # keep the first page seen for each unit, and only ever move forwards
            if 1 <= n <= units and n not in starts and all(starts[k] < i for k in starts):
                starts[n] = i
            break
    if len(starts) < units:
        missing = [n for n in range(1, units + 1) if n not in starts]
        print(f'--detect-headings found {len(starts)}/{units} unit headings; missing: {missing[:15]}'
              + (' ...' if len(missing) > 15 else ''))
        return None
    if sorted(starts) != list(range(1, units + 1)) or list(starts[n] for n in sorted(starts)) != sorted(starts.values()):
        print('--detect-headings found headings out of order; falling back to fixed pagination')
        return None
    spans = {}
    for n in range(1, units + 1):
        end = starts[n + 1] if n + 1 in starts else min(starts[n] + 2, len(pages))
        spans[n] = (starts[n], end)
    return spans


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
    ap.add_argument('--detect-headings', action='store_true',
                    help='locate each unit by its "Unit / N Title" heading instead of fixed pagination')
    ap.add_argument('--repair-font-shift', action='store_true',
                    help='undo offset font encodings that make some pages come out as mojibake')
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
    # Headings are located on the untouched text: the repair prepends a note to a page, which
    # would otherwise hide the "Unit / N Title" heading that --detect-headings looks for.
    pages_raw = list(pages)

    if a.repair_font_shift:
        known = learn_font_shifts(pages)
        print(f'Font-shift repair: offsets used by this PDF: '
              + (', '.join(f'{k:+d}' for k in known) if known else 'none found'))
        repaired = []
        for i, pg in enumerate(pages):
            fixed, shifts = repair_font_shift(pg, known)
            if not shifts:
                continue
            note = ('[Some text on this page used an offset font encoding and has been decoded '
                    f'(shift {"/".join(f"{x:+d}" for x in sorted(set(shifts)))}). The encoder drops '
                    'spaces, so the decoded words run together - split them by eye.]')
            pages[i] = note + '\n' + fixed
            repaired.append(i + 1)
        print(f'Font-shift repair: decoded text on {len(repaired)} page(s)'
              + (f': {repaired}' if 0 < len(repaired) <= 30 else ''))

    with open(os.path.join(out_dir, 'pages.txt'), 'w', encoding='utf-8') as f:
        for i, p in enumerate(pages):
            f.write(f'\n\n=== PAGE {i + 1} ===\n{p}')

    first = (a.first_page - 1) if a.first_page else detect_first_page(pages_raw, a.pages_per_unit)
    if first is None:
        sys.exit('ERROR: could not auto-detect the first unit page. Pass --first-page N (1-based).')
    print(f'First unit starts on PDF page {first + 1}')

    toc = parse_toc(layout, a.units)
    key = {} if a.no_key else split_key(raw, a.key_marker, a.units)
    if not a.no_key:
        missing = [n for n in range(1, a.units + 1) if n not in key]
        print(f'Answer key found for {len(key)} units' + (f'; missing: {missing}' if missing else ''))

    spans = detect_unit_pages(pages_raw, a.units, first) if a.detect_headings else None
    if spans:
        print(f'--detect-headings located all {a.units} units '
              f'(unit 1 on PDF page {spans[1][0] + 1}, unit {a.units} on {spans[a.units][0] + 1})')

    titles = {}
    for n in range(1, a.units + 1):
        if spans:
            start, end = spans[n]
        else:
            start, end = first + (n - 1) * a.pages_per_unit, first + n * a.pages_per_unit
        unit_pages = pages[start:end]
        if len(unit_pages) < 2:
            print(f'WARNING: ran out of pages at unit {n}'); break
        title = unit_title(pages_raw[start], n, toc)
        titles[str(n)] = title
        parts = [f'# Unit {n} — {title}\n']
        labels = ['Lesson page (explanations & examples)', 'Exercises page'] + [f'Continued page {i+1}' for i in range(2, len(unit_pages))]
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
