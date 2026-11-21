# Offline bake for 小黑煤球盖广州: magenta-keyed GPT paintings -> transparent webp + brick grid data (src/buildings.js).
#   uv run --with pillow --with numpy python3 tools/bake.py <dir-with-source-pngs>
# Source PNGs are not in the repo (they live with the batch on the external disk); the outputs are.
# A brick is a 2:1 cell in a running bond (odd rows from the bottom shift by half a brick).
# A cell counts when more than half of it is building; its colour is the alpha-weighted mean, quantised to a small palette.
import sys, os, json
import numpy as np
from PIL import Image

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'   # palette index -> char, '.' = no brick

B = [
  dict(id='qilou', name='骑楼', file='qilou.png', cols=26, price=1, weight=1, out_w=640,
       stages=[('柱廊', 0.24), ('二楼三楼', 0.635), ('四楼', 0.85), ('女儿墙与山花', 1.0)],
       fact='楼上压在人行道上，楼下柱廊给行人遮阳挡雨。1912 年广州的建筑章程第一次写出「骑楼」这个词。'),
  dict(id='chenjiaci', name='陈家祠', file='chenjiaci.png', cols=60, price=4, weight=4, out_w=900,
       stages=[('墙脚与石鼓', 0.30), ('砖雕与门神', 0.60), ('瓦面与陶塑脊', 1.0)],
       fact='1888 到 1894 年建成，三进三路九堂两厢。正门两侧外墙有 6 幅大砖雕，屋脊上挤满石湾陶塑，两端是鳌鱼。'),
  dict(id='zhenhailou', name='镇海楼', file='zhenhailou.png', cols=44, price=12, weight=12, out_w=760,
       stages=[('红石两层', 0.37), ('第三四层', 0.66), ('第五层', 0.82), ('歇山顶与鳌鱼', 1.0)],
       fact='1380 年始建，又叫五层楼，高 28 米。下两层是红石墙，往上是青砖，五重檐铺绿琉璃瓦，屋脊两端立着鳌鱼。'),
]

def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta-ness: red and blue both high, green low
    m = np.minimum(r, b) - g
    alpha = np.clip((150 - m) / 70.0, 0, 1)            # m >= 150 -> background, m <= 80 -> building
    # despill the fringe: pull red/blue down toward green where partly keyed
    spill = (1 - alpha) * 0.9
    out = a.copy()
    lim = np.maximum(g, np.minimum(r, b) - m * spill)
    out[..., 0] = np.where(alpha < 1, np.minimum(r, lim + 40), r)
    out[..., 2] = np.where(alpha < 1, np.minimum(b, lim + 40), b)
    return out, alpha

data = []
for d in B:
    im = Image.open(os.path.join(SRC, d['file']))
    rgb, alpha = key(im)
    ys, xs = np.where(alpha > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    H, W = alpha.shape
    cols = d['cols']; bw = W / cols; bh = bw / 2; rows = int(round(H / bh)); bh = H / rows
    cells = []   # rows from the bottom; each row a list of (x0,x1,colour or None)
    for r in range(rows):
        yb = H - r * bh; yt = yb - bh
        off = 0.5 if r % 2 else 0.0
        n = cols + (1 if off else 0)
        row = []
        for i in range(n):
            cx0 = max(0.0, (i - off) * bw); cx1 = min(float(W), (i - off + 1) * bw)
            ya, yb_ = int(round(yt)), max(int(round(yt)) + 1, int(round(yb)))
            xa, xb = int(round(cx0)), max(int(round(cx0)) + 1, int(round(cx1)))
            al = alpha[ya:yb_, xa:xb]
            if al.size == 0 or al.mean() < 0.5:
                row.append(None); continue
            c = (rgb[ya:yb_, xa:xb] * al[..., None]).sum((0, 1)) / al.sum()
            row.append(c)
        cells.append(row)
    # quantise to <= 60 colours with Pillow's median cut on the list of brick colours
    flat = [c for row in cells for c in row if c is not None]
    strip = Image.fromarray(np.array(flat, dtype=np.uint8).reshape(1, -1, 3), 'RGB')
    q = strip.quantize(colors=60, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:60 * 3]
    idx = list(q.get_flattened_data()) if hasattr(q, 'get_flattened_data') else list(q.getdata())
    used = sorted(set(idx))
    remap = {u: k for k, u in enumerate(used)}
    palette = ['#%02x%02x%02x' % tuple(pal[u * 3:u * 3 + 3]) for u in used]
    it = iter(idx)
    enc = []; counts = []
    for row in cells:
        s = ''.join('.' if c is None else ALPHA[remap[next(it)]] for c in row)
        enc.append(s); counts.append(sum(ch != '.' for ch in s))
    total = sum(counts)
    stages = []
    for name, frac in d['stages']:
        top_row = rows if frac >= 1 else int(round(rows * frac))
        stages.append(dict(name=name, rows=top_row, upTo=sum(counts[:top_row])))
    # transparent painting, cropped, resized
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    pic = Image.fromarray(rgba, 'RGBA')
    ow = d['out_w']; oh = round(H * ow / W)
    pic = pic.resize((ow, oh), Image.LANCZOS)
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    pic.save(os.path.join(ROOT, 'assets', d['id'] + '.webp'), 'WEBP', quality=84, method=6)
    data.append(dict(id=d['id'], name=d['name'], price=d['price'], weight=d['weight'], fact=d['fact'], img='assets/' + d['id'] + '.webp',
                     aspect=round(W / H, 4), cols=cols, rows=rows, total=total, palette=palette, cells=enc, stages=stages))
    print(d['id'], 'size', W, H, 'grid', cols, rows, 'bricks', total, 'stages', [(s['name'], s['upTo']) for s in stages],
          'webp', os.path.getsize(os.path.join(ROOT, 'assets', d['id'] + '.webp')))

js = ('// Generated by tools/bake.py from the three paintings; do not edit by hand.\n'
      '// cells: one string per brick row from the bottom; odd rows are offset by half a brick (one more cell). Char = palette index, "." = no brick.\n'
      "(function(root,data){if(typeof module==='object'&&module.exports)module.exports=data;else root.COAL_BUILDINGS=data;})"
      "(typeof self!=='undefined'?self:this," + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
open(os.path.join(ROOT, 'src', 'buildings.js'), 'w').write(js)
print('buildings.js', len(js))
