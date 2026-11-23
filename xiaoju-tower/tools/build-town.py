"""Chapter 2 (下塔进城) street grid: Guangdong OSM extract -> data/town.js (window.XJT_TOWN).
Same local metres as data/city.js (Canton Tower at origin, +x east, -z north). Map data © OpenStreetMap contributors, ODbL 1.0.
Needs osmium-tool on PATH and Pillow:  uv run --with pillow python tools/build-town.py [pbf] [--png out.png]

The grid is 1 m per cell over the area between the tower and the two Zhujiang New Town towers. Every cell gets one surface:
road, ground (plazas, pavements, lots), green, water, building, footbridge (walk only). Movement, collision, the minimap
and the ground texture all read this one grid, so what you see is what you bump into."""
import base64, hashlib, json, math, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--png']
PBF = Path(args[0] if args else "/Volumes/ColdData/data/osm/guangdong-latest.osm.pbf")
PNG = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None
city = json.loads((ROOT / "data/city.js").read_text().split("=", 1)[1].rstrip().rstrip(";"))
LAT0, LON0 = city["origin"]
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110540.0
X0, X1, Z0, Z1 = -650, 650, -1500, 220          # world box in metres (z negative = north)
W, H = X1 - X0, Z1 - Z0
ROAD, GROUND, GREEN, WATER, BUILDING, FOOTBRIDGE = 1, 2, 3, 4, 5, 6

def lonlat(x, z): return (LON0 + x / KX, LAT0 - z / KZ)
bbox = lonlat(X0 - 60, Z1 + 60) + lonlat(X1 + 60, Z0 - 60)
BBOX = f"{bbox[0]:.5f},{bbox[1]:.5f},{bbox[2]:.5f},{bbox[3]:.5f}"
px = lambda p: ((p[0] - LON0) * KX - X0, -(p[1] - LAT0) * KZ - Z0)      # lon/lat -> grid pixel
tmp = Path(tempfile.mkdtemp(prefix="xjt-town-"))
run = lambda *a: subprocess.run(a, check=True, capture_output=True)
run("osmium", "extract", "-s", "smart", "-b", BBOX, str(PBF), "-o", str(tmp / "a.pbf"), "--overwrite")
def export(name, *filters, geom=None):
    run("osmium", "tags-filter", str(tmp / "a.pbf"), *filters, "-o", str(tmp / f"{name}.pbf"), "--overwrite")
    extra = [f"--geometry-types={geom}"] if geom else []
    run("osmium", "export", str(tmp / f"{name}.pbf"), "-f", "geojsonseq", *extra, "-o", str(tmp / f"{name}.seq"), "--overwrite")
    return [json.loads(l.lstrip("\x1e")) for l in (tmp / f"{name}.seq").read_text().splitlines() if l.strip()]
def rings(g):
    if g["type"] == "Polygon": return [g["coordinates"]]
    if g["type"] == "MultiPolygon": return g["coordinates"]
    return []

img = Image.new("L", (W, H), GROUND); d = ImageDraw.Draw(img)
def poly(g, v):
    for pl in rings(g):
        d.polygon([px(p) for p in pl[0]], fill=v)
        for hole in pl[1:]: d.polygon([px(p) for p in hole], fill=GROUND if v != WATER else GROUND)

# green: parks, lawns, woods. Paved plazas inside parks are drawn back on top as ground.
areas = export("areas", "wr/leisure=park,garden,pitch,playground", "wr/landuse=grass,forest,flowerbed,village_green,meadow", "wr/natural=wood,scrub,grassland", "wr/highway=pedestrian", "wr/place=square", geom="polygon")
nofill = Image.new("L", (W, H), 0); dn = ImageDraw.Draw(nofill)     # parks and squares stay open: no procedural blocks there
for f in areas:
    for pl in rings(f["geometry"]): dn.polygon([px(p) for p in pl[0]], fill=1)
for f in areas:
    t = f["properties"]
    if t.get("highway") != "pedestrian" and t.get("place") != "square" and t.get("leisure") not in ("pitch", "playground"): poly(f["geometry"], GREEN)
for f in areas:
    t = f["properties"]
    if t.get("highway") == "pedestrian" or t.get("place") == "square" or t.get("leisure") in ("pitch", "playground"): poly(f["geometry"], GROUND)

# roads and paths (tunnels and anything underground skipped: the river tunnels would otherwise walk under water)
WIDTH = {"primary": 16, "primary_link": 8, "secondary": 13, "secondary_link": 7, "tertiary": 10, "tertiary_link": 6, "unclassified": 7,
         "residential": 6, "living_street": 5, "service": 4, "cycleway": 3, "footway": 3, "pedestrian": 4, "path": 2.5, "steps": 3}
VEHICLE = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service"}
ways = export("hw", "w/highway", geom="linestring")
lines, bridges, roads_out = [], [], []
for f in ways:
    t = f["properties"]; hw = t.get("highway")
    if hw not in WIDTH or t.get("tunnel") == "yes" or t.get("area") == "yes": continue
    if str(t.get("layer", "0")).lstrip("-").isdigit() and int(t.get("layer", "0")) < 0: continue
    pts = [px(p) for p in f["geometry"]["coordinates"]]
    v = ROAD if hw in VEHICLE else GROUND
    w = WIDTH[hw]
    if t.get("bridge") and t.get("bicycle") == "no": v, w = FOOTBRIDGE, 8     # 海心桥: OSM draws the deck as two parallel ways; 8 m strokes merge them into one deck
    elif t.get("bridge") and v == GROUND: w = max(w, 6)      # footbridges onto 海心沙 are wide decks, not 3 m paths
    rec = (pts, w, v, t)
    (bridges if t.get("bridge") or t.get("tunnel") == "building_passage" else lines).append(rec)
    if hw in VEHICLE and hw not in ("service",):
        roads_out.append({"k": hw, "n": t.get("name") or "", "p": [round(c + o, 1) for q in pts for c, o in zip(q, (X0, Z0))]})
def stroke(rec):
    pts, w, v, _ = rec
    d.line(pts, fill=v, width=max(1, round(w)), joint="curve")
    r = w / 2
    for x, y in pts: d.ellipse([x - r, y - r, x + r, y + r], fill=v)
for rec in sorted(lines, key=lambda r: r[2] == ROAD): stroke(rec)   # paths first, roads on top

water = export("water", "wr/natural=water", "wr/waterway=riverbank", "wr/water", geom="polygon")
for f in water: poly(f["geometry"], WATER)
for rec in bridges: stroke(rec)
# bridge decks for the 3D view: every bridge way that crosses water, with its drawn width
bridges_out = []
for pts, w, v, t in bridges:
    if t.get("tunnel") == "building_passage": continue
    bridges_out.append({"w": w, "foot": v == FOOTBRIDGE, "n": t.get("name") or "", "p": [round(c + o, 1) for q in pts for c, o in zip(q, (X0, Z0))]})

# buildings (same footprints as the chapter-1 city), plus the two supertall towers raised in game.js on their OSM spot
bld = []
for rec in city["b"]:
    xs, zs = rec[1::2], rec[2::2]
    if max(xs) < X0 or min(xs) > X1 or max(zs) < Z0 or min(zs) > Z1: continue
    d.polygon([(x - X0, z - Z0) for x, z in zip(xs, zs)], fill=BUILDING); bld.append(rec)
for l in city["l"]:
    if l["h"] < 100: continue
    n, r = (12, 32) if l["label"] == "西塔" else (8, 36)
    pts = [(l["x"] + math.cos(i / n * 2 * math.pi + (math.pi / 8 if n == 8 else 0)) * r - X0, l["z"] - math.sin(i / n * 2 * math.pi + (math.pi / 8 if n == 8 else 0)) * r - Z0) for i in range(n)]
    d.polygon(pts, fill=BUILDING)
for rec in bridges:
    if rec[3].get("tunnel") == "building_passage": stroke(rec)
# the Canton Tower footing: a solid core the cat starts next to (tower plaza is walkable around it)
d.ellipse([-30 - X0, -24 - Z0, 30 - X0, 24 - Z0], fill=BUILDING)

# smooth one-cell spikes and notches left by rasterising (a thin water spur at an island tip could wedge a runner)
img = img.filter(ImageFilter.ModeFilter(3)); d = ImageDraw.Draw(img)

# procedural infill: OSM lists only part of Zhujiang New Town's towers, so whole blocks look empty.
# A 34 m cell that is entirely plain ground (no road, green, water, building) and 9 m clear of any road gets a block.
px_ = img.load(); nf = nofill.load()
def clear(x0, y0, x1, y1, pad):
    for yy in range(max(0, y0 - pad), min(H, y1 + pad), 2):
        for xx in range(max(0, x0 - pad), min(W, x1 + pad), 2):
            if px_[xx, yy] != GROUND or nf[xx, yy]: return False
    return True
def hr(key, lo, hi): return lo + (hi - lo) * int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
fill = []
S = 34
for gy in range(0, H - S, S):
    for gx in range(0, W - S, S):
        wx, wz = gx + X0 + S / 2, gy + Z0 + S / 2
        if math.hypot(wx, wz) < 140: continue                         # keep the tower plaza open
        if not clear(gx + 3, gy + 3, gx + S - 3, gy + S - 3, 9): continue
        k = f"{gx},{gy}"
        w2, h2 = hr(k + "w", 9, 13), hr(k + "d", 9, 13)
        ht = round(hr(k + "h", 24, 120) if wz < -700 else hr(k + "h", 18, 60), 1)
        cx, cz = gx + S / 2, gy + S / 2
        quad = [(cx - w2, cz - h2), (cx + w2, cz - h2), (cx + w2, cz + h2), (cx - w2, cz + h2)]
        d.polygon(quad, fill=BUILDING)
        fill.append([ht] + [round(c, 1) for x, z in quad for c in (x + X0, z + Z0)])

# shared-bike docks: OSM has no bicycle_rental here, so docks are placed by the game on pavements beside named roads,
# at least 90 m apart, on both banks (the footbridge bans bikes: OSM tags 海心桥 bicycle=no, so a south-bank bike only gets you to the bridge).
def cell(x, z):
    xi, zi = int(x - X0), int(z - Z0)
    return px_[xi, zi] if 0 <= xi < W and 0 <= zi < H else 0
docks = []
for r in roads_out:
    if r["k"] not in ("secondary", "tertiary", "primary", "unclassified"): continue
    p = r["p"]
    for i in range(0, len(p) - 2, 2):
        x, z = (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2
        if x < X0 + 40 or x > X1 - 40 or z < Z0 + 40: continue
        dx, dz = p[i + 2] - p[i], p[i + 3] - p[i + 1]; L = math.hypot(dx, dz) or 1
        for side in (1, -1):
            off = {"primary": 11, "secondary": 9.5, "tertiary": 8}.get(r["k"], 6.5)
            sx, sz = x - dz / L * off * side, z + dx / L * off * side
            if cell(sx, sz) != GROUND or any(math.hypot(sx - a["x"], sz - a["z"]) < 90 for a in docks): continue
            docks.append({"x": round(sx, 1), "z": round(sz, 1), "a": round(math.atan2(dx, -dz), 3)}); break

# the three postcard stops: the walkable cell nearest each OSM landmark (海心沙: the centre of the island park)
def nearest_walkable(x, z, clear=9):
    # nearest spot with open ground all round it (a stop wedged between podium walls is hard to see and to reach)
    ring = [(math.cos(a / 16 * math.pi) * r, math.sin(a / 16 * math.pi) * r) for r in range(2, clear + 1, 2) for a in range(32)]
    for rr in range(0, 200):
        for a in range(0, 360, 4):
            sx, sz = x + math.cos(math.radians(a)) * rr, z + math.sin(math.radians(a)) * rr
            if cell(sx, sz) in (GROUND, GREEN, ROAD) and all(cell(sx + ox, sz + oz) in (GROUND, GREEN, ROAD) for ox, oz in ring):
                return (round(sx, 1), round(sz, 1))
    return None
stops = []
# 海心沙: OSM's label point sits on the north bank; use the centre of the island polygon instead
isl = [f for f in areas if f["properties"].get("name") == "海心沙亚运公园"]
big = max((pl[0] for f in isl for pl in rings(f["geometry"])), key=len)
pts = [px(p) for p in big]
HX, HZ = sum(p[0] for p in pts) / len(pts) + X0, sum(p[1] for p in pts) / len(pts) + Z0
for l in city["l"]:
    x, z = nearest_walkable(HX, HZ, 5) if l["label"] == "海心沙" else nearest_walkable(l["x"], l["z"] + 48)
    stops.append({"label": l["label"], "name": l["name"], "x": x, "z": z, "lx": l["x"], "lz": l["z"]})

raw = img.tobytes()
out = bytearray(); i = 0
while i < len(raw):                                  # run-length: value byte, then length as LEB128
    v = raw[i]; j = i
    while j < len(raw) and raw[j] == v: j += 1
    n = j - i; out.append(v)
    while True:
        b = n & 0x7F; n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n: break
    i = j
counts = {k: raw.count(bytes([v])) for k, v in (("road", ROAD), ("ground", GROUND), ("green", GREEN), ("water", WATER), ("building", BUILDING), ("footbridge", FOOTBRIDGE))}
data = {"box": [X0, X1, Z0, Z1], "cell": 1, "rle": base64.b64encode(bytes(out)).decode(), "roads": roads_out, "bridges": bridges_out, "fill": fill, "docks": docks, "stops": stops,
        "start": {"x": 0, "z": -40}, "counts": counts, "attribution": "© OpenStreetMap contributors (ODbL)"}
js = "window.XJT_TOWN=" + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n"
(ROOT / "data/town.js").write_text(js)
print("town.js", len(js), "bytes; cells", counts, "; fill", len(fill), "; docks", len(docks), "; stops", stops)
if PNG:
    pal = {ROAD: (60, 62, 70), GROUND: (205, 198, 184), GREEN: (110, 160, 90), WATER: (60, 110, 160), BUILDING: (150, 120, 110), FOOTBRIDGE: (255, 120, 60)}
    rgb = Image.new("RGB", (W, H)); rgb.putdata([pal.get(v, (0, 0, 0)) for v in raw])
    dr = ImageDraw.Draw(rgb)
    for a in docks: dr.ellipse([a["x"] - X0 - 6, a["z"] - Z0 - 6, a["x"] - X0 + 6, a["z"] - Z0 + 6], fill=(40, 200, 120))
    for s in stops: dr.ellipse([s["x"] - X0 - 10, s["z"] - Z0 - 10, s["x"] - X0 + 10, s["z"] - Z0 + 10], outline=(255, 0, 0), width=4)
    dr.ellipse([-6 - X0, -40 - 6 - Z0, 6 - X0, -40 + 6 - Z0], fill=(255, 0, 255))
    rgb.save(PNG)
