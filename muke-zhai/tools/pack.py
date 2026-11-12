# 穆柯寨 · 把抠好的动作帧打成图集。输入是 agent-sprite-forge 每条 take 的 keyed/frames-clean（不进仓），
# 输出 assets/<角色>-<动作>.webp 与 src/clips.js。帧窗是人看总览图后定的，写在 SPEC 里；改帧窗后重跑本脚本。
# 用法：python tools/pack.py <素材根目录> <本玩意目录>
import sys, glob, json, os
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
R = lambda a, b, s: list(range(a, b + 1, s))
# body: 舞台上「靴底到盔顶」的目标像素；ratio: 原画里盔顶到靴底占整个外框（含翎子、枪尖）的比例，人量的
CH = {
 'guiying': dict(set='guiying-red', body=250, ratio=0.90, acts={
   'idle':   dict(take='t01', frames=R(0, 141, 3), loop=True),
   'walk':   dict(take='t03', search=(16, 48), step=2, loop=True),
   'attack': dict(take='t01', frames=[4, 13, 21, 26, 30, 34, 42, 51, 103, 111, 119, 128, 144], hit=5),
   'jump':   dict(take='t02', frames=[0] + R(12, 108, 6) + [120]),
   'hurt':   dict(take='t01', frames=R(36, 100, 6)),
   'guard':  dict(take='t01', frames=[0, 12, 18, 24, 30, 36, 48, 96, 102, 108, 120], hold=6),
   'victory':dict(take='t03', frames=[0, 6, 12, 18, 24, 54, 60, 66, 72], hold=8),
 }),
 'zongbao': dict(set='zongbao2', body=260, ratio=0.865, acts={
   'idle':   dict(take='t01', frames=R(0, 141, 3), loop=True),
   'walk':   dict(take='t02', search=(16, 48), step=2, loop=True),
   'attack': dict(take='t01', frames=[22, 28, 31, 34, 38, 44, 50, 55, 66, 78, 89, 96, 104, 116, 133], hit=6),
   'guard':  dict(take='t01', frames=[0, 6, 12, 18, 24, 36, 48, 96, 102, 108, 120], hold=6),
   'hurt':   dict(take='t01', frames=R(48, 100, 4)),
   'victory':dict(take='t03', frames=[0, 6, 12, 18, 24, 36, 48, 60, 72], hold=8),
 }),
 'mengliang': dict(set='mengliang2', body=215, ratio=1.0, acts={
   'idle':   dict(take='t03', frames=R(0, 36, 3) + R(33, 3, -3), loop=True),
   'walk':   dict(take='t01', search=(16, 48), step=2, loop=True),
   'attack': dict(take='t02', frames=R(6, 120, 6), hit=7),
   'hurt':   dict(take='t01', frames=R(54, 108, 6)),
   'defeat': dict(take='t03', frames=R(0, 60, 4), hold=15),
 }),
}
COLS = 8

def load(ch, a, t):
    fs = sorted(glob.glob(f'{SRC}/set-{ch}/actions/{a}/takes/{t}/keyed/frames-clean/*.png'))
    assert len(fs) > 100, (ch, a, t, len(fs))
    return fs

def bbox(arr, thr=24):
    ys, xs = np.where(arr[..., 3] > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def find_loop(fs, box, lo, hi):
    # 只看下半身（靠旗翎子一直飘，会盖过腿的节奏）：找一段首尾最像的窗口
    x0, y0, x1, y1 = box; ly = int(y0 + (y1 - y0) * 0.55)
    small = []
    for f in fs:
        im = Image.open(f).convert('RGBA').crop((x0 - 40, ly, x1 + 40, y1 + 6)); im = im.resize((im.width // 4, im.height // 4), Image.BILINEAR)
        a = np.asarray(im, dtype=np.float32); small.append(a[..., :3] * (a[..., 3:4] / 255.0))
    best = None
    for p in range(lo, hi + 1):
        for i in range(4, len(fs) - p - 1):
            d = float(np.abs(small[i] - small[i + p]).mean() + 0.5 * np.abs(small[i + 1] - small[i + p + 1]).mean())
            # 周期内部要真的有动作，否则会选中一段几乎静止的
            mid = float(np.abs(small[i] - small[i + p // 2]).mean())
            score = d / (mid + 1e-3)
            if best is None or score < best[0]: best = (score, i, p, d, mid)
    return best

clips, report = {}, {}
for name, c in CH.items():
    clips[name] = {}
    for a, cfg in c['acts'].items():
        fs = load(c['set'], a, cfg['take'])
        f0 = np.asarray(Image.open(fs[0]).convert('RGBA')); b0 = bbox(f0)
        scale = (c['body'] / c['ratio']) / (b0[3] - b0[1])
        band = f0[int(b0[3] - (b0[3] - b0[1]) * 0.06):b0[3]]; xs = np.where(band[..., 3] > 24)[1]
        ax, ay = (xs.min() + xs.max()) / 2.0, float(b0[3])
        if 'search' in cfg:
            s, i, p, d, mid = find_loop(fs, b0, *cfg['search'])
            idx = list(range(i, i + p, cfg['step'])); report[f'{name}.{a}'] = dict(start=i, period=p, seam=round(d, 2), mid=round(mid, 2))
        else:
            idx = cfg['frames']
        ims = [Image.open(fs[i]).convert('RGBA') for i in idx]
        boxes = [bbox(np.asarray(im)) for im in ims]
        ux0, uy0 = min(b[0] for b in boxes) - 2, min(b[1] for b in boxes) - 2
        ux1, uy1 = max(b[2] for b in boxes) + 2, max(b[3] for b in boxes) + 2
        cw, chh = int(round((ux1 - ux0) * scale)), int(round((uy1 - uy0) * scale))
        rows = -(-len(ims) // COLS)
        atlas = Image.new('RGBA', (cw * min(COLS, len(ims)), chh * rows), (0, 0, 0, 0))
        for k, im in enumerate(ims):
            # 预乘再缩，免得透明边缘带出抠像色
            arr = np.asarray(im.crop((ux0, uy0, ux1, uy1)), dtype=np.float32); arr[..., :3] *= arr[..., 3:4] / 255.0
            sm = np.asarray(Image.fromarray(arr.astype(np.uint8), 'RGBA').resize((cw, chh), Image.LANCZOS), dtype=np.float32)
            al = np.maximum(sm[..., 3:4], 1.0); sm[..., :3] = np.clip(sm[..., :3] * 255.0 / al, 0, 255)
            atlas.paste(Image.fromarray(sm.astype(np.uint8), 'RGBA'), ((k % COLS) * cw, (k // COLS) * chh))
        fn = f'{name}-{a}.webp'; atlas.save(f'{OUT}/assets/{fn}', quality=86, method=6)
        e = dict(src=fn, cell=[cw, chh], cols=min(COLS, len(ims)), count=len(ims), anchor=[round((ax - ux0) * scale, 1), round((ay - uy0) * scale, 1)], loop=bool(cfg.get('loop')), srcFrames=idx, take=cfg['take'])
        for k in ('hit', 'hold'):
            if k in cfg: e[k] = cfg[k]
        clips[name][a] = e
        print(name, a, cfg['take'], len(ims), 'cell', cw, chh, os.path.getsize(f'{OUT}/assets/{fn}') // 1024, 'KB')
js = "// 穆柯寨 · 动作帧数据。由 tools/pack.py 生成，别手改。\n(function (root, factory) {\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.MKZ_CLIPS = factory();\n})(typeof self !== 'undefined' ? self : this, function () {\n  return " + json.dumps(clips, ensure_ascii=False) + ";\n});\n"
open(f'{OUT}/src/clips.js', 'w', encoding='utf-8').write(js)
print('loops', json.dumps(report))
