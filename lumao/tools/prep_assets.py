"""Build the cat layers for 撸猫撸了一手毛 from the generated pictures, one pose at a time.

Inputs per pose (not in the repo; see README "AI material"): <dir>/base.png (the whole cat, transparent background,
1536×1024) and <dir>/head-<state>.png (the same picture edited by an image model to change only the head, on flat
green #00B140). Outputs: lumao/assets/<pose>/cat-base.webp, cat-<state>.webp (head layer only), cat-masks.png,
lumao/assets/<pose>/data.json, and src/cat-data.js rebuilt from every pose's data.json.
Run:  python tools/prep_assets.py <pose> <dir-with-pictures>   (needs Pillow + numpy)
"""
import sys, json, os, glob
import numpy as np
from PIL import Image, ImageFilter

POSES = {
    # side view standing; chest rule: below the chin and behind the throat the chest belongs to the base picture
    'stand': dict(crop=(160, 0, 1360, 1024), torso=(400, 1150, 405), tail_pivot=(1150, 452), neck_pivot=(430, 470), tail_len=470,
                  floor=1000, belly=720, leg_y=760, head_box=(640, 530), head0=(470, 560), chest=True,
                  tail=lambda X, Y: (X > 1040) & (Y < 455) & ((Y < 418) | (X > 1118)),
                  states=['purr', 'look', 'warn', 'bite', 'lick']),
    # asleep on her side, head left, back along the top
    'sleep': dict(crop=(0, 110, 1536, 880), torso=(360, 1180, 222), tail_pivot=(1215, 400), neck_pivot=(370, 470), tail_len=420,
                  floor=700, belly=560, leg_y=610, head_box=(480, 700), head0=(360, 620), chest=False,
                  tail=lambda X, Y: ((X > 1240) & (Y < 560)) | ((X > 1400) & ~((X < 1420) & (Y > 600))),
                  states=['drowsy', 'awake', 'purr', 'look', 'warn', 'bite', 'lick']),
    # on her back, belly up, head left; the head region also takes the front paws (they grab in 'bite')
    'belly': dict(crop=(0, 90, 1536, 890), torso=(560, 1240, 290), tail_pivot=(1290, 680), neck_pivot=(430, 560), tail_len=300,
                  floor=760, belly=420, leg_y=740, head_box=(720, 760), head0=(420, 760), chest=False,
                  tail=lambda X, Y: (X > 1290) & (Y > 590),
                  states=['purr', 'look', 'warn', 'bite', 'lick']),
}
W, H = 1536, 1024
SCALE = 0.8
GREEN = np.array([0, 177, 64], float)
HERE = os.path.dirname(os.path.abspath(__file__))
X, Y = np.arange(W)[None, :], np.arange(H)[:, None]


def blur(a, r):
    return np.array(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float) / 255


def key(im):
    """Green-screen key: alpha from how green a pixel is, colour un-mixed from the green, spill removed, edge pulled in."""
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    greenness = g - np.maximum(r, b)
    a = np.clip(1 - (greenness - 20) / (110 - 20), 0, 1)
    a = np.where(greenness < 20, 1, a)
    # the generated green is not flat (soft shadows): anything less than a third opaque is background
    a = np.clip((a - 0.35) / 0.5, 0, 1)
    fg = np.clip((im - (1 - a[..., None]) * GREEN) / np.maximum(a[..., None], 1e-3), 0, 255)
    # an orange cat is never greener than it is red or blue, so the green left on the edge goes
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))
    # the last ring of an un-mixed key is where the olive outline lives
    a = np.array(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(float) / 255
    return fg, a


def build(pose, src):
    P = POSES[pose]
    out = os.path.join(HERE, '..', 'assets', pose)
    os.makedirs(out, exist_ok=True)
    base = np.array(Image.open(os.path.join(src, 'base.png')).convert('RGBA')).astype(float)
    alpha = base[..., 3] / 255
    on_green = base[..., :3] * alpha[..., None] + GREEN * (1 - alpha[..., None])
    hx, hy = P['head_box']
    layers, region = {}, np.zeros((H, W))
    for s in P['states']:
        im = np.array(Image.open(os.path.join(src, f'head-{s}.png')).convert('RGB').resize((W, H), Image.LANCZOS)).astype(float)
        # only strong, clustered changes count: a regenerated picture also differs a little everywhere (mean ~10/255)
        d = (np.abs(im - on_green).sum(2) > 120).astype(float)
        d = blur(d, 14) > 0.5
        d[:, hx:] = False; d[hy:, :] = False
        region = np.maximum(region, d)
        layers[s] = key(im)
    head0 = (alpha > 0.5).astype(float); head0[:, P['head0'][0]:] = 0; head0[P['head0'][1]:, :] = 0
    region = np.maximum(region, head0)
    region = blur(region.astype(float), 22) > 0.12
    region = blur(region.astype(float), 8)
    tail = ((alpha > 0.02) & P['tail'](X, Y)).astype(float)
    tail = blur(tail, 3)
    if P['chest']:
        cw = np.clip((Y - 450) / 30, 0, 1) * np.clip((X - 340) / 40, 0, 1)
        keep = np.clip((Y - 490) / 60, 0, 1) * np.clip((X - 340) / 40, 0, 1)
    else:
        cw = np.zeros((H, W)); keep = np.zeros((H, W))
    x0, y0, x1, y1 = P['crop']

    def crop(a):
        return a[y0:y1, x0:x1]

    def save_rgba(rgb, a, path):
        img = Image.fromarray(np.dstack([crop(rgb), crop(a)[..., None] * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
        img = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
        img.save(path, 'WEBP', quality=86, method=6)
        return img.size

    size = save_rgba(base[..., :3], alpha, os.path.join(out, 'cat-base.webp'))
    for s in P['states']:
        fg, a = layers[s]
        ab = alpha * cw
        a = a * (1 - keep)
        na = a + ab * (1 - a)          # the new pose over the base chest: complementary, so no see-through band
        rgb = (fg * a[..., None] + base[..., :3] * (ab * (1 - a))[..., None]) / np.maximum(na[..., None], 1e-3)
        save_rgba(rgb, na * (region > 0.01), os.path.join(out, f'cat-{s}.webp'))
    # b: the part of the head region that is really head (not the chest); when the head lunges the place it left shows the body
    head_only = region * (1 - cw)
    m = Image.fromarray((np.dstack([crop(region), crop(tail), crop(head_only)]) * 255).clip(0, 255).astype(np.uint8), 'RGB').resize(size, Image.LANCZOS)
    m.save(os.path.join(out, 'cat-masks.png'), optimize=True)

    # the fur map's mask: 56×100 cells over the torso box; cat pixels that are not head, not tail, not legs
    tx0, tx1, ty0 = P['torso']
    ty1 = ty0 + 0.56 * (tx1 - tx0)
    grid = []
    for j in range(100):         # along the body, head → tail
        row = ''
        for i in range(56):      # across, back (or belly) → the side resting on the ground
            xi, yi = int(tx0 + (j + 0.5) / 100 * (tx1 - tx0)), int(ty0 + (i + 0.5) / 56 * (ty1 - ty0))
            ok = yi < H and alpha[yi, xi] > 0.5 and region[yi, xi] < 0.3 and tail[yi, xi] < 0.3 and yi < P['leg_y']
            row += '1' if ok else '0'
        grid.append(row)
    cwid, chei = x1 - x0, y1 - y0
    px = lambda x, y: [round((x - x0) / cwid, 5), round((y - y0) / chei, 5)]
    data = {'size': list(size), 'aspect': round(cwid / chei, 5), 'pxH': chei,
            'torso': {'p0': px(tx0, ty0), 'p1': px(tx1, ty1)}, 'tailPivot': px(*P['tail_pivot']), 'neckPivot': px(*P['neck_pivot']),
            'floor': px(0, P['floor'])[1], 'belly': px(0, P['belly'])[1], 'tailLen': round(P['tail_len'] / chei, 5),
            'states': P['states'], 'mask': grid}
    with open(os.path.join(out, 'data.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(pose, 'textures', size, 'mask cells on', sum(r.count('1') for r in grid))


def bundle():
    poses = {}
    for f in sorted(glob.glob(os.path.join(HERE, '..', 'assets', '*', 'data.json'))):
        poses[os.path.basename(os.path.dirname(f))] = json.load(open(f))
    with open(os.path.join(HERE, '..', 'src', 'cat-data.js'), 'w') as f:
        f.write('// generated by tools/prep_assets.py: per pose, layer geometry in texture units (0..1 over the cropped cat) and the fur-map mask\n')
        f.write('(function(root){root.LumaoCat=' + json.dumps({'poses': poses}, separators=(',', ':')) + ";if(typeof module==='object')module.exports=root.LumaoCat;})(typeof self!=='undefined'?self:this);\n")
    print('bundled', list(poses))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
    bundle()
