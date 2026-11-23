"""Chroma-key the 2x2 green sheet into trimmed transparent WebP frames for the game.
Run: uv run --with pillow python tools/key-sprites.py <sheet.png> <name1,name2,name3,name4>  (use - to skip a cell)
Sheets used: sprites/climb-sheet-v1.png -> -,-,brace,rest ; sprites/climb-sheet-v2.png -> climbA,pullA,-,pullB ; sprites/climb-left-v1.png -> climbB
Several sheets in one run share one scale: key-sprites.py a.png n1,n2,n3,n4 b.png n5,n6,n7,n8
跑台阶: sprites/run-stairs-v1.png runA,runB,runC,runD
三花姐: sanhua/climb-sheet.png sanhua-climbA,sanhua-pullA,sanhua-climbB,sanhua-pullB sanhua/pose-sheet.png sanhua-brace,sanhua-rest,sanhua-cheer,sanhua-hit"""
import sys
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
frames = {}
for sheet_path, name_list in zip(sys.argv[1::2], sys.argv[2::2]):
  sheet = Image.open(sheet_path).convert("RGB")
  W, H = sheet.size
  names = {i: n for i, n in enumerate(name_list.split(",")) if n != "-"}
  for idx, name in names.items():
    if len(name_list.split(",")) == 1:      # a single-frame image
        cell = sheet
    else:
        cx, cy = idx % 2, idx // 2
        cell = sheet.crop((cx * W // 2, cy * H // 2, (cx + 1) * W // 2, (cy + 1) * H // 2))
    px = cell.load(); w, h = cell.size
    out = Image.new("RGBA", (w, h)); po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            green = g - max(r, b)                      # how "green-screen" a pixel is
            a = 255 if green < 40 else 0 if green > 110 else int(255 * (110 - green) / 70)
            if a and green > 0: g = max(r, b) + min(green, 10)   # despill
            po[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    frames[name] = out.crop(bbox)
# common canvas, feet aligned at bottom, centred
cw = max(f.width for f in frames.values()) + 8; ch = max(f.height for f in frames.values()) + 8
scale = 512 / ch
for name, f in frames.items():
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(f, ((cw - f.width) // 2, ch - f.height - 4), f)
    canvas = canvas.resize((int(cw * scale), 512), Image.LANCZOS)
    canvas.save(ROOT / "assets" / f"cat-{name}.webp", "WEBP", quality=88, method=6)
    print(name, canvas.size, (ROOT / "assets" / f"cat-{name}.webp").stat().st_size, "bytes")
