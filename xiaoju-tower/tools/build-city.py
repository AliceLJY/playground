"""Guangdong OSM extract (.osm.pbf, downloaded once) -> data/city.js (window.XJT_CITY).
Local metres, Canton Tower at origin, +x east, -z north. Map data © OpenStreetMap contributors, ODbL 1.0.
Needs osmium-tool on PATH. Usage: python3 tools/build-city.py [path/to/guangdong-latest.osm.pbf]"""
import json, math, re, hashlib, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
PBF = Path(sys.argv[1] if len(sys.argv) > 1 else "/Volumes/ColdData/data/osm/guangdong-latest.osm.pbf")
LAT0, LON0 = 23.10645, 113.32452          # refined below from the OSM tower outline if present
RADIUS = 4200
BBOX = "113.278,23.068,113.371,23.145"
tmp = Path(tempfile.mkdtemp(prefix="xjt-osm-"))
run = lambda *a: subprocess.run(a, check=True, capture_output=True)
run("osmium", "extract", "-b", BBOX, str(PBF), "-o", str(tmp / "area.pbf"), "--overwrite")
run("osmium", "tags-filter", str(tmp / "area.pbf"), "wr/building", "wr/natural=water", "wr/waterway=riverbank", "wr/water", "-o", str(tmp / "f.pbf"), "--overwrite")
run("osmium", "export", str(tmp / "f.pbf"), "-f", "geojsonseq", "--geometry-types=polygon", "-a", "type,id", "-o", str(tmp / "f.geojsonseq"), "--overwrite")
feats = [json.loads(l.lstrip("\x1e")) for l in (tmp / "f.geojsonseq").read_text().splitlines() if l.strip()]
for f in feats:
    pr = f["properties"]
    if pr.get("name") in ("广州塔", "广州新电视塔", "Canton Tower") and pr.get("man_made") == "tower":
        ring = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"][0][0]
        LON0 = sum(p[0] for p in ring) / len(ring); LAT0 = sum(p[1] for p in ring) / len(ring); break
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110540.0
proj = lambda p: (round((p[0] - LON0) * KX, 1), round(-(p[1] - LAT0) * KZ, 1))
def num(v):
    m = re.match(r"\s*([0-9.]+)", str(v or "")); return float(m.group(1)) if m else None
def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2
def hrand(i, lo, hi):
    return lo + (hi - lo) * int(hashlib.md5(str(i).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
B, W = [], []
stats = {"buildings": 0, "tagged": 0, "estimated": 0, "water": 0}
for f in feats:
    t = f["properties"]; g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for poly in polys:
        pts = [proj(p) for p in poly[0]]
        if len(pts) > 2 and pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3: continue
        if area(pts) < 0: pts = pts[::-1]
        if "building" in t:
            cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
            d = math.hypot(cx, cz)
            if d < 75 or d > RADIUS: continue
            a = abs(area(pts))
            if a < 25: continue
            h = num(t.get("height")) or (num(t.get("building:levels")) * 3.3 if num(t.get("building:levels")) else None)
            if h: stats["tagged"] += 1
            else:
                stats["estimated"] += 1
                key = t.get("@id", cx * 7 + cz)
                h = hrand(key, 9, 24) if a < 400 else hrand(key, 18, 70) if a < 2500 else hrand(key, 24, 110)
            B.append([round(max(4.0, min(h, 560.0)), 1)] + [c for p in pts for c in p]); stats["buildings"] += 1
        elif t.get("natural") == "water" or t.get("waterway") == "riverbank" or "water" in t:
            W.append([c for p in pts for c in p]); stats["water"] += 1
# landmarks for the 488 m postcard: names straight from OSM, height = tallest building within 70 m
# OSM has no usable height for the two supertall towers (west 88 m, east 13 m podium), so their
# public heights are added here and the game raises a tower on that spot: west 440.75 m, east 530 m.
LANDMARKS = [("海心沙", "海心沙亚运公园"), ("西塔", "广州国际金融中心"), ("东塔", "广州周大福金融中心")]
REAL_H = {"西塔": 440.75, "东塔": 530.0}
run("osmium", "tags-filter", str(tmp / "area.pbf"), "nwr/name=" + ",".join(n for _, n in LANDMARKS), "-o", str(tmp / "lm.pbf"), "--overwrite")
run("osmium", "export", str(tmp / "lm.pbf"), "-f", "geojsonseq", "-o", str(tmp / "lm.geojsonseq"), "--overwrite")
lm_feats = [json.loads(l.lstrip("\x1e")) for l in (tmp / "lm.geojsonseq").read_text().splitlines() if l.strip()]
L = []
for label, osm_name in LANDMARKS:
    pts = []
    for f in lm_feats:
        if f["properties"].get("name") != osm_name: continue
        g = f["geometry"]
        if g["type"] == "Point": pts = [g["coordinates"]]; break
        ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0] if g["type"] == "MultiPolygon" else g["coordinates"]
        pts = ring
    assert pts, osm_name
    xs = [proj(p) for p in pts]; x = sum(p[0] for p in xs) / len(xs); z = sum(p[1] for p in xs) / len(xs)
    near = [b[0] for b in B if math.hypot(sum(b[1::2]) / len(b[1::2]) - x, sum(b[2::2]) / len(b[2::2]) - z) < 70]
    L.append({"label": label, "name": osm_name, "x": round(x, 1), "z": round(z, 1), "h": REAL_H.get(label, 2), "osmH": max(near) if near else None})
out = {"origin": [LAT0, LON0], "b": B, "w": W, "l": L, "stats": stats, "attribution": "© OpenStreetMap contributors (ODbL)"}
js = "window.XJT_CITY=" + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";\n"
(ROOT / "data" / "city.js").write_text(js)
print("origin", round(LAT0, 5), round(LON0, 5), stats, len(js), "bytes")
