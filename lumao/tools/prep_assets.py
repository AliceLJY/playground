"""Build the cat layers for 撸猫撸了一手毛 from the generated pictures.

Inputs (not in the repo; see README "AI material"): base.png (side view, transparent background, 1536×1024),
head-<state>.png (the same picture edited by an image model to change only the head, on flat green #00B140).
Outputs into lumao/assets/: cat-base.webp, cat-<state>.webp (head layer only), cat-masks.png, and src/cat-data.js.
Run:  python tools/prep_assets.py <dir-with-pictures>   (needs Pillow + numpy)
"""
import sys, json, os
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
W, H = 1536, 1024
CROP = (160, 0, 1360, 1024)          # the cat with margin, in base px
SCALE = 0.8                          # 1200×1024 → 960×819 textures
GREEN = np.array([0, 177, 64], float)
STATES = ['purr', 'look', 'warn', 'bite', 'lick']
FLOOR_Y = 1000                       # where the paws touch the floor (base px)
# the strokable back: from behind the ears to the root of the tail (base px); height = 0.56 × length (the fur map's aspect)
TORSO_X0, TORSO_X1, TORSO_Y0 = 400, 1150, 405
TORSO_Y1 = TORSO_Y0 + 0.56 * (TORSO_X1 - TORSO_X0)
TAIL_PIVOT = (1150, 452)
NECK_PIVOT = (430, 470)

def blur(a, r):
    return np.array(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float) / 255

base = np.array(Image.open(os.path.join(SRC, 'base.png')).convert('RGBA')).astype(float)
alpha = base[..., 3] / 255
on_green = base[..., :3] * alpha[..., None] + GREEN * (1 - alpha[..., None])

def key(im):
    """Green-screen key with spill removal: alpha from how green a pixel is, colour un-mixed from the green."""
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    greenness = g - np.maximum(r, b)
    a = np.clip(1 - (greenness - 20) / (110 - 20), 0, 1)
    a = np.where(greenness < 20, 1, a)
    fg = (im - (1 - a[..., None]) * GREEN) / np.maximum(a[..., None], 1e-3)
    fg = np.clip(fg, 0, 255)
    # despill: an orange cat is never greener than it is red or blue, so the green left on the edge goes
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))
    # pull the edge in by a pixel: the last ring of an unmixed key is where the olive outline lives
    a = np.array(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(float) / 255
    return fg, a

layers, region = {}, np.zeros((H, W))
for s in STATES:
    im = np.array(Image.open(os.path.join(SRC, f'head-{s}.png')).convert('RGB').resize((W, H), Image.LANCZOS)).astype(float)
    # where the head changed: blurred colour difference, kept to the front of the cat
    # only strong, clustered changes count: a regenerated picture also differs a little everywhere (mean ~10/255)
    d = (np.abs(im - on_green).sum(2) > 120).astype(float)
    d = blur(d, 14) > 0.5
    d[:, 640:] = False; d[530:, :] = False
    region = np.maximum(region, d)
    layers[s] = key(im)
# the head region also covers the original head, then grows and softens so the seam falls on unchanged fur
head0 = (alpha > 0.5).astype(float); head0[:, 470:] = 0; head0[560:, :] = 0
region = np.maximum(region, head0)
region = blur(region.astype(float), 22) > 0.12
region = blur(region.astype(float), 8)
# tail: everything of the cat above the back line behind the hips
X, Y = np.arange(W)[None, :], np.arange(H)[:, None]
tail = ((alpha > 0.02) & (X > 1040) & (Y < 455) & ((Y < 418) | (X > 1118))).astype(float)   # not the rump in front of the tail root
tail = blur(tail, 3)

def crop(a):
    x0, y0, x1, y1 = CROP
    return a[y0:y1, x0:x1]
def save_rgba(rgb, a, path):
    img = Image.fromarray(np.dstack([crop(rgb), crop(a)[..., None] * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    img = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
    img.save(path, 'WEBP', quality=86, method=6)
    return img.size

size = save_rgba(base[..., :3], alpha, os.path.join(OUT, 'cat-base.webp'))
# where a new head pose leaves the chest uncovered, the chest from the base picture shows (not the wall behind):
# only below the chin line (the original head sits above it)
cw = np.clip((Y - 450) / 30, 0, 1) * np.clip((X - 340) / 40, 0, 1)   # below the chin and behind the throat the chest belongs to the base picture
for s in STATES:
    fg, a = layers[s]
    ab = alpha * cw
    # lower on the chest the base picture wins even where the new pose drew fur: the chest is not part of the expression
    keep = np.clip((Y - 490) / 60, 0, 1) * np.clip((X - 340) / 40, 0, 1)   # a soft fade that starts after the base is fully there, never a hard edge
    a = a * (1 - keep)
    na = a + ab * (1 - a)          # the new pose over the base chest: complementary, so no see-through band where one fades in and the other out
    rgb = (fg * a[..., None] + base[..., :3] * (ab * (1 - a))[..., None]) / np.maximum(na[..., None], 1e-3)
    save_rgba(rgb, na * (region > 0.01), os.path.join(OUT, f'cat-{s}.webp'))
# b: the part of the head region that is really head (not the chest below and behind the chin). When the head lunges,
# the place it left shows the body there, not a hole.
head_only = region * (1 - cw)
masks = np.dstack([crop(region), crop(tail), crop(head_only)]) * 255
m = Image.fromarray(masks.clip(0, 255).astype(np.uint8), 'RGB').resize(size, Image.LANCZOS)
m.save(os.path.join(OUT, 'cat-masks.png'), optimize=True)

# the fur map's mask: 56×100 cells over the torso box; cat pixels that are not head, not tail
NX, NY = 56, 100
grid = []
for j in range(NY):       # core y: along the body, head → tail
    row = ''
    for i in range(NX):   # core x: across, back → belly
        cx = TORSO_X0 + (j + 0.5) / NY * (TORSO_X1 - TORSO_X0)
        cy = TORSO_Y0 + (i + 0.5) / NX * (TORSO_Y1 - TORSO_Y0)
        xi, yi = int(cx), int(cy)
        ok = alpha[yi, xi] > 0.5 and region[yi, xi] < 0.3 and tail[yi, xi] < 0.3 and yi < 760
        row += '1' if ok else '0'
    grid.append(row)
px = lambda x, y: [round((x - CROP[0]) / (CROP[2] - CROP[0]), 5), round((y - CROP[1]) / (CROP[3] - CROP[1]), 5)]
data = {
    'size': list(size), 'aspect': round((CROP[2] - CROP[0]) / (CROP[3] - CROP[1]), 5),
    'torso': {'p0': px(TORSO_X0, TORSO_Y0), 'p1': px(TORSO_X1, TORSO_Y1)},
    'tailPivot': px(*TAIL_PIVOT), 'neckPivot': px(*NECK_PIVOT), 'floor': px(0, FLOOR_Y)[1], 'belly': px(0, 720)[1], 'tailLen': round(470 / (CROP[3] - CROP[1]), 5), 'states': STATES, 'mask': grid,
}
with open(os.path.join(HERE, '..', 'src', 'cat-data.js'), 'w') as f:
    f.write('// generated by tools/prep_assets.py: layer geometry in texture units (0..1 over the cropped cat) and the fur-map mask\n')
    f.write('(function(root){root.LumaoCat=' + json.dumps(data, separators=(',', ':')) + ';if(typeof module===\'object\')module.exports=root.LumaoCat;})(typeof self!==\'undefined\'?self:this);\n')
print('textures', size, 'mask cells on', sum(r.count('1') for r in grid))
