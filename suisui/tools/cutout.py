"""Cut a 3 x 2 sheet of objects shot on pure black into single transparent webp sprites.

    uv run --with pillow --with numpy --with scipy python3 tools/cutout.py <sheet.png> <name1,name2,...,name6> <out-dir>

Background = dark pixels connected to the sheet border (flood fill), so dark areas *inside* an object
(bronze shadows, the inside of a glass) stay opaque. Along the border region alpha ramps with brightness,
which keeps thin smoke and glass rims soft. Each cell is cropped to its content and placed bottom-centred
on a square canvas, the same way the shelf stands things on the floor of a slot.
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SIZE = 512          # sprite edge in pixels; the largest item on screen is ~150 CSS px at 2x
BOTTOM = 0.97       # objects stand on this fraction of the height
FILL = 0.94         # the longer side of an object fills this share of the sprite
LO, HI = 14, 46     # brightness ramp (0..255) for alpha on the background side
MIN_RUN = 8         # pixels a row or column needs to count as part of an object
KEEP = 0.01         # a piece is part of the object if it is at least this share of the cell's largest piece
# share of the object height, from the top, that is glow or smoke, and whether only cool pixels count there.
# The incense smoke is grey-blue and bronze is warm, so the censer zone can reach the rim without fading the handles.
SOFT = {'candle': (0.20, False), 'censer': (0.42, True)}
SOFT_HI = 150       # brightness at which glow and smoke become fully opaque
HOLE = 8            # at or below this brightness a pixel is backdrop even when enclosed by the object

def cut(sheet_path, names, out_dir):
    im = Image.open(sheet_path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    v = a.max(axis=2)
    # binary: possibly background (dark) vs certainly object; flood the dark region from the border
    dark = Image.fromarray(((v < HI) * 255).astype(np.uint8))
    w, h = dark.size
    seeds = [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]
    for s in seeds:
        if dark.getpixel(s) == 255:
            ImageDraw.floodfill(dark, s, 128)
    bg = np.asarray(dark) == 128
    alpha = np.full(v.shape, 255, np.float32)
    ramp = np.clip((v - LO) / (HI - LO), 0, 1) * 255
    alpha[bg] = ramp[bg]
    # near-pure black is backdrop wherever it is: the hole of a jade disc is enclosed by the object, the flood never reaches it
    alpha[v <= HOLE] = 0
    alpha_img = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    # un-multiply from black: a half-transparent glow or wisp of smoke was shot over black, so what we see is
    # colour x alpha. Dividing by alpha gives back the light itself; without it flames and smoke get a dirty dark halo.
    al = np.asarray(alpha_img).astype(np.float32) / 255
    rgb = a.astype(np.float32)
    soft = (al > 0.02) & (al < 0.999)
    rgb[soft] = np.clip(rgb[soft] / al[soft][:, None], 0, 255)
    rgba = Image.fromarray(rgb.astype(np.uint8)); rgba.putalpha(alpha_img)
    A = np.asarray(alpha_img)
    cols, rows = 3, 2
    cw, ch = w / cols, h / rows
    # connected pieces of clearly-object pixels; each cell keeps the pieces whose centre lies in it and that are
    # at least KEEP of its largest piece, so seams between rows and stray specks drop out
    lab, n = ndimage.label(A > 40)
    idx = np.arange(1, n + 1)
    area = ndimage.sum(np.ones_like(lab), lab, idx)
    cy, cx = np.array(ndimage.center_of_mass(np.ones_like(lab), lab, idx)).T if n else (np.array([]), np.array([]))
    os.makedirs(out_dir, exist_ok=True)
    report = []
    for i, name in enumerate(names):
        c, r = i % cols, i // cols
        inside = (cx >= c * cw) & (cx < (c + 1) * cw) & (cy >= r * ch) & (cy < (r + 1) * ch)
        if not inside.any():
            report.append((name, 'EMPTY')); continue
        big = area[inside].max()
        keep = idx[inside & (area >= big * KEEP)]
        km = np.isin(lab, keep)
        ys, xs = np.where(km)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        pad = 6
        X0, Y0, X1, Y1 = max(0, bx0 - pad), max(0, by0 - pad), min(w, bx1 + pad), min(h, by1 + pad)
        # soft fringe pixels (alpha <= 40, label 0) next to the kept pieces stay; everything labelled otherwise goes
        near = ndimage.binary_dilation(km[Y0:Y1, X0:X1], iterations=pad)
        sub = lab[Y0:Y1, X0:X1]
        ok = km[Y0:Y1, X0:X1] | ((sub == 0) & near)
        crop = rgba.crop((X0, Y0, X1, Y1))
        ca = np.asarray(crop.getchannel('A')).astype(np.float32) * ok
        if name in SOFT:
            # flame glow and incense smoke are light over black, brighter than the backdrop threshold, so they came
            # out opaque and dirty. In the top share of the object only, alpha follows brightness and colour is un-multiplied.
            share, cool_only = SOFT[name]
            top = int((by1 - by0) * share) + (by0 - Y0)
            sv = v[Y0:Y1, X0:X1][:top].astype(np.float32)
            wide = np.clip((sv - LO) / (SOFT_HI - LO), 0, 1) * 255
            if cool_only:
                px = a[Y0:Y1, X0:X1][:top].astype(np.float32)
                wide = np.where(px[..., 2] >= px[..., 0] - 4, wide, 255)   # blue at least as strong as red
            ca[:top] = np.minimum(ca[:top], wide)
            crgb = np.asarray(crop.convert('RGB')).astype(np.float32)
            src = a[Y0:Y1, X0:X1][:top].astype(np.float32)
            al = ca[:top] / 255
            m = al > 0.02
            crgb[:top][m] = np.clip(src[m] / al[m][:, None], 0, 255)
            crop = Image.fromarray(crgb.astype(np.uint8))
        crop.putalpha(Image.fromarray(ca.astype(np.uint8)))
        x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
        k = SIZE * FILL / max(crop.size)
        crop = crop.resize((max(1, round(crop.size[0] * k)), max(1, round(crop.size[1] * k))), Image.LANCZOS)
        out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        out.paste(crop, ((SIZE - crop.size[0]) // 2, round(SIZE * BOTTOM) - crop.size[1]), crop)
        p = os.path.join(out_dir, name + '.webp')
        out.save(p, 'WEBP', quality=86, method=6)
        touches = bx0 <= x0 + 1 or bx1 >= x1 - 1 or by0 <= y0 + 1 or by1 >= y1 - 1
        report.append((name, f'{crop.size[0]}x{crop.size[1]}', f'{os.path.getsize(p)//1024}KB', 'TOUCHES CELL EDGE' if touches else 'ok'))
    for row in report:
        print(*row)

if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    cut(sys.argv[1], sys.argv[2].split(','), sys.argv[3])
