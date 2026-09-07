#!/usr/bin/env python3
"""
make_icons.py - build the favicon and header-logo assets from the master logo.

`public/logo-transparent.png` is the master artwork (about 1250x1250, ~770 KB). That is the right
thing to keep in the repo, but shipping it for a 32px browser tab or a 38px header mark would send
three quarters of a megabyte to render a thumbnail - more than the whole JS bundle. This writes
small, alpha-preserving derivatives instead, so the master stays the single source of truth.

Requirements: Pillow (`pip install pillow`).

Usage:
  python tools/make_icons.py                     # regenerate every derivative
  python tools/make_icons.py --source public/logo-transparent.png

Output (public/):
  favicon-32.png          browser tab
  favicon-192.png         Android / PWA
  apple-touch-icon.png    iOS home screen (180px)
  logo-mark.png           the header mark (96px, sharp at 38px on a 2x screen)

Re-run this after changing the master, then check index.html still lists the same filenames.
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('ERROR: Pillow is required. Install it with:  pip install pillow')

# filename -> pixel size
TARGETS = {
    'favicon-32.png': 32,
    'favicon-192.png': 192,
    'apple-touch-icon.png': 180,
    'logo-mark.png': 96,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default='public/logo-transparent.png')
    ap.add_argument('--out-dir', default='public')
    ap.add_argument('--margin', type=float, default=1.06,
                    help='square canvas as a multiple of the artwork (1.0 = flush, no breathing room)')
    a = ap.parse_args()

    if not os.path.exists(a.source):
        sys.exit(f'ERROR: {a.source} not found')

    src = Image.open(a.source).convert('RGBA')
    print(f'{a.source}: {src.width}x{src.height}')

    # Trim the transparent margin, then re-centre on a square canvas. Without this the mark keeps
    # whatever padding the export happened to have and looks small at favicon sizes.
    bbox = src.getbbox()
    art = src.crop(bbox) if bbox else src
    side = int(max(art.size) * a.margin)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)

    for name, size in TARGETS.items():
        path = os.path.join(a.out_dir, name)
        square.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
        print(f'  {name:<24} {size:>3}x{size:<3}  {os.path.getsize(path) / 1024:6.1f} KB')


if __name__ == '__main__':
    main()
