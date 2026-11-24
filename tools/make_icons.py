#!/usr/bin/env python3
"""
make_icons.py - build every logo derivative (header mark, favicon, PWA icons) from the master logo.

`public/logo-transparent.png` is the master artwork: the white FH-and-book mark with a violet glow,
on transparency. It is ~800 KB, so nothing ships it directly; this writes small derivatives.

Home-screen icons cannot be transparent - iOS fills the gaps with black and Android crops icons to
its own shape - so they put the mark on the same Aubergine tile the header uses (.brand-mark).

Requirements: Pillow (`pip install pillow`).

Usage:
  python tools/make_icons.py
  python tools/make_icons.py --source public/logo-transparent.png

Output (public/):
  logo-mark.png             96px   header mark, transparent (the tile colour comes from CSS)
  favicon-48.png            48px   browser tab: rounded tile
  apple-touch-icon.png     180px   iOS home screen: full-bleed tile (iOS rounds the corners itself)
  icons/icon-192.png       192px   manifest "any": rounded tile
  icons/icon-512.png       512px   manifest "any": rounded tile, also the splash screen on Android
  icons/icon-maskable-512.png      manifest "maskable": full bleed, mark inside the 80% safe circle

Re-run this after changing the master.
"""
import argparse
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('ERROR: Pillow is required. Install it with:  pip install pillow')

TILE = (0x6D, 0x28, 0xD2, 255)  # --c-aubergine, same as .brand-mark


def trimmed(src: Image.Image) -> Image.Image:
    """The artwork with its transparent margin cut off."""
    bbox = src.getbbox()
    return src.crop(bbox) if bbox else src


def place(art: Image.Image, size: int, fill: float, bg=None) -> Image.Image:
    """`art` scaled so its longer side is `fill` of the canvas, centred, over `bg` (or transparency)."""
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    scale = size * fill / max(art.size)
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    piece = art.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(piece, ((size - w) // 2, (size - h) // 2))
    return canvas


def rounded(img: Image.Image, radius: float) -> Image.Image:
    """Clip to a rounded square; `radius` is a fraction of the side. Drawn at 4x for smooth edges."""
    s = img.width
    mask = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s * 4 - 1, s * 4 - 1), radius=s * 4 * radius, fill=255)
    out = img.copy()
    out.putalpha(mask.resize((s, s), Image.LANCZOS))
    return out


def save(img: Image.Image, out_dir: str, name: str):
    path = os.path.join(out_dir, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    print(f'  {name:<28} {img.width:>3}px  {os.path.getsize(path) / 1024:6.1f} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default='public/logo-transparent.png')
    ap.add_argument('--out-dir', default='public')
    a = ap.parse_args()

    if not os.path.exists(a.source):
        sys.exit(f'ERROR: {a.source} not found')
    src = Image.open(a.source).convert('RGBA')
    print(f'{a.source}: {src.width}x{src.height}')
    art = trimmed(src)

    # Header: transparent, a touch of breathing room; CSS paints the tile behind it.
    save(place(art, 96, 0.94), a.out_dir, 'logo-mark.png')

    def tile(size: int, fill: float) -> Image.Image:
        # Draw big and downscale once, so the glow stays soft at small sizes.
        big = place(art, 1024, fill, TILE)
        return big.resize((size, size), Image.LANCZOS)

    save(rounded(tile(48, 0.9), 0.22), a.out_dir, 'favicon-48.png')
    save(tile(180, 0.82), a.out_dir, 'apple-touch-icon.png')
    save(rounded(tile(192, 0.82), 0.22), a.out_dir, 'icons/icon-192.png')
    save(rounded(tile(512, 0.82), 0.22), a.out_dir, 'icons/icon-512.png')
    # Maskable: the platform may cut a circle of 80% diameter; keep the mark well inside it.
    save(tile(512, 0.62), a.out_dir, 'icons/icon-maskable-512.png')


if __name__ == '__main__':
    main()
