#!/usr/bin/env python3
"""Place a square plot on a real map so that no well-known building is cut by its edge.

Reads the local OpenStreetMap extract (default: the Guangdong .osm.pbf on the external disk) with
osmium, turns the square to follow the main streets, then slides it within a limit until no famous
building straddles the edge. Writes plot.json, plot-preview.svg and the area's features
(osm-area.geojsonseq) to --out-dir, and prints a report.

Usage:
  plot_square.py --find 石室                       list named features containing a string, with coordinates
  plot_square.py --lat 23.1158 --lon 113.2570 --size 200 --out-dir work
  plot_square.py --center-osm w542890833 --size 200 --keep "石室圣心大教堂" --out-dir work
  plot_square.py --lat .. --lon .. --rotate 12 --fixed --out-dir work    only check this exact placement

Exit code: 0 = no famous building cut, 2 = some famous building is still cut (see the report), 1 = error.
Pure Python 3.9+ and the osmium command (brew install osmium-tool). No other dependencies.
"""
import argparse, json, math, os, shutil, subprocess, sys, tempfile

DEFAULT_PBF = '/Volumes/ColdData/data/osm/guangdong-latest.osm.pbf'
M_PER_DEG_LAT = 110574.0
M_PER_DEG_LON_EQ = 111320.0

# Street classes that set the grid of a neighbourhood, with their weight for the orientation vote.
STREET_WEIGHT = {'trunk': 3, 'primary': 3, 'secondary': 3, 'tertiary': 3,
                 'residential': 2, 'unclassified': 2, 'living_street': 2, 'pedestrian': 2}
FAMOUS_TOURISM = {'museum', 'attraction', 'gallery'}
FAMOUS_BUILDING = {'church', 'cathedral', 'chapel', 'temple', 'shrine', 'mosque', 'synagogue'}
# Area kinds that carry wikidata but are not "a building you could cut": districts, roads, admin areas.
NOT_A_LANDMARK = ('boundary', 'admin_level', 'place', 'highway', 'railway', 'route', 'waterway')
GREEN = {('leisure', 'park'), ('leisure', 'garden'), ('landuse', 'grass'), ('landuse', 'forest'),
         ('natural', 'wood'), ('landuse', 'recreation_ground'), ('natural', 'scrub')}
EDGE_TOLERANCE_M = 0.5   # a wall poking this far past the edge still counts as inside
MARGIN_SHARE = 0.04      # preferred clearance between a landmark and the edge, as a share of the side


# ---------------------------------------------------------------- projection

class Frame:
    """Local metric frame around (lat0, lon0): x east, y north, metres. Good to well under 0.1% over a few km."""
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = M_PER_DEG_LON_EQ * math.cos(math.radians(lat0))

    def to_xy(self, lon, lat):
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * M_PER_DEG_LAT)

    def to_lonlat(self, x, y):
        return (self.lon0 + x / self.kx, self.lat0 + y / M_PER_DEG_LAT)


# ---------------------------------------------------------------- geometry

def ring_area(ring):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def point_in_ring(px, py, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def segment_hits_box(x1, y1, x2, y2, h):
    """Liang-Barsky: does the segment touch the axis-aligned box |u|<=h, |v|<=h?"""
    t0, t1 = 0.0, 1.0
    dx, dy = x2 - x1, y2 - y1
    for p, q in ((-dx, x1 + h), (dx, h - x1), (-dy, y1 + h), (dy, h - y1)):
        if p == 0:
            if q < 0:
                return False
        else:
            t = q / p
            if p < 0:
                if t > t1: return False
                t0 = max(t0, t)
            else:
                if t < t0: return False
                t1 = min(t1, t)
    return t0 <= t1


class Shape:
    """A polygonal feature: outer rings only (holes ignored; see README)."""
    def __init__(self, rings, props):
        self.rings = [r for r in rings if len(r) >= 3]
        self.props = props
        pts = [p for r in self.rings for p in r]
        self.cx = sum(p[0] for p in pts) / len(pts)
        self.cy = sum(p[1] for p in pts) / len(pts)
        self.radius = max(math.hypot(p[0] - self.cx, p[1] - self.cy) for p in pts)
        self.area = sum(ring_area(r) for r in self.rings)

    @property
    def name(self):
        if self.props.get('name'):
            return self.props['name']
        p = self.props
        if p.get('tourism') == 'museum': return '无名博物馆'
        if p.get('amenity') == 'place_of_worship': return '无名宗教建筑'
        if 'historic' in p or 'heritage' in p: return '无名历史建筑'
        return '无名地标'

    @property
    def osm_ref(self):
        return f"{self.props.get('@type', '?')[0]}{self.props.get('@id', '?')}"

    def contains(self, x, y):
        return any(point_in_ring(x, y, r) for r in self.rings)


class Square:
    def __init__(self, cx, cy, size, angle_deg):
        self.cx, self.cy, self.size, self.angle = cx, cy, size, angle_deg
        self.h = size / 2
        a = math.radians(angle_deg)
        self.c, self.s = math.cos(a), math.sin(a)

    def local(self, x, y):
        dx, dy = x - self.cx, y - self.cy
        return dx * self.c + dy * self.s, -dx * self.s + dy * self.c

    def corners(self):
        h = self.h
        return [(self.cx + u * self.c - v * self.s, self.cy + u * self.s + v * self.c)
                for u, v in ((-h, -h), (h, -h), (h, h), (-h, h))]

    def classify(self, shape):
        """'inside', 'outside' or 'cut'."""
        u, v = self.local(shape.cx, shape.cy)
        h, r = self.h, shape.radius
        if abs(u) + r <= h + EDGE_TOLERANCE_M and abs(v) + r <= h + EDGE_TOLERANCE_M:
            return 'inside'
        if abs(u) - r > h or abs(v) - r > h:
            return 'outside'
        hin = h + EDGE_TOLERANCE_M
        states = set()
        for ring in shape.rings:
            loc = [self.local(x, y) for x, y in ring]
            n_in = sum(1 for a, b in loc if abs(a) <= hin and abs(b) <= hin)
            if n_in == len(loc):
                states.add('inside'); continue          # the square is convex: all corners in => all in
            if n_in or any(segment_hits_box(a1, b1, a2, b2, h)
                           for (a1, b1), (a2, b2) in zip(loc, loc[1:] + loc[:1])):
                return 'cut'
            # no corner in, no edge crossing: either fully outside, or the square sits inside the ring
            states.add('cut' if point_in_ring(0, 0, loc) else 'outside')
        if len(states) == 1:
            return states.pop()
        return 'cut'


# ---------------------------------------------------------------- reading OSM

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(cmd)}\n{r.stderr.strip()[:400]}")
    return r.stdout


def need_osmium():
    if not shutil.which('osmium'):
        sys.exit('osmium not found: brew install osmium-tool')


def extract_area(pbf, lat, lon, reach_m, out_path):
    """Cut a box of +-reach_m around (lat, lon) out of the pbf and export it as GeoJSON lines."""
    need_osmium()
    dlat = reach_m / M_PER_DEG_LAT
    dlon = reach_m / (M_PER_DEG_LON_EQ * math.cos(math.radians(lat)))
    bbox = f'{lon - dlon:.6f},{lat - dlat:.6f},{lon + dlon:.6f},{lat + dlat:.6f}'
    with tempfile.TemporaryDirectory() as td:
        area = os.path.join(td, 'area.pbf')
        run(['osmium', 'extract', '-s', 'smart', '-b', bbox, pbf, '-o', area, '--overwrite'])
        run(['osmium', 'export', '-f', 'geojsonseq', '-a', 'type,id', area, '-o', out_path, '--overwrite'])
    return bbox


def read_features(path):
    feats = []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip().lstrip('\x1e')
            if line:
                feats.append(json.loads(line))
    return feats


def find_named(pbf, text, limit=30):
    """Named features whose name contains `text`, with a representative point."""
    need_osmium()
    with tempfile.TemporaryDirectory() as td:
        named = os.path.join(td, 'named.pbf')
        run(['osmium', 'tags-filter', pbf, 'nwr/name', '-o', named, '--overwrite'])
        proc = subprocess.Popen(['osmium', 'export', '-f', 'geojsonseq', '-a', 'type,id', named, '-o', '-'],
                                stdout=subprocess.PIPE, text=True)
        hits = []
        for line in proc.stdout:
            if text not in line:
                continue
            f = json.loads(line.strip().lstrip('\x1e'))
            name = f['properties'].get('name', '')
            if text in name:
                hits.append(f)
        proc.wait()
    # a closed way comes out as a line and as an area: keep the area only
    areas = {(f['properties']['@type'], f['properties']['@id']) for f in hits if f['geometry']['type'] != 'LineString'}
    hits = [f for f in hits if f['geometry']['type'] != 'LineString'
            or (f['properties']['@type'], f['properties']['@id']) not in areas]
    out = []
    for f in hits[:limit]:
        p, g = f['properties'], f['geometry']
        name = p.get('name', '')
        pts = list(iter_points(g))
        lon = sum(q[0] for q in pts) / len(pts); lat = sum(q[1] for q in pts) / len(pts)
        kind = ','.join(f'{k}={p[k]}' for k in ('building', 'tourism', 'amenity', 'historic', 'highway',
                                              'public_transport', 'wikidata') if k in p)
        out.append((f"{p['@type'][0]}{p['@id']}", g['type'], name, lat, lon, kind))
    return out, len(hits)


def iter_points(g):
    t, c = g['type'], g['coordinates']
    if t == 'Point':
        yield c
    elif t == 'LineString':
        yield from c
    elif t == 'Polygon':
        yield from c[0]
    elif t == 'MultiPolygon':
        for poly in c:
            yield from poly[0]
    elif t == 'MultiLineString':
        for line in c:
            yield from line


def osm_object_center(pbf, ref):
    """Centre (lat, lon) of an OSM object like w542890833 / n123 / r456."""
    need_osmium()
    with tempfile.TemporaryDirectory() as td:
        obj = os.path.join(td, 'obj.pbf'); js = os.path.join(td, 'obj.geojsonseq')
        run(['osmium', 'getid', '-r', pbf, ref, '-o', obj, '--overwrite'])
        run(['osmium', 'export', '-f', 'geojsonseq', '-a', 'type,id', obj, '-o', js, '--overwrite'])
        tid = {'n': 'node', 'w': 'way', 'r': 'relation'}[ref[0]]
        mine = [f for f in read_features(js)
                if f['properties'].get('@type') == tid and str(f['properties'].get('@id')) == ref[1:]]
    if not mine:
        sys.exit(f'{ref} not found in {pbf}')
    # a closed way comes out twice (as a line and as an area): prefer the area
    f = min(mine, key=lambda f: f['geometry']['type'] == 'LineString')
    pts = list(iter_points(f['geometry']))
    return (sum(q[1] for q in pts) / len(pts), sum(q[0] for q in pts) / len(pts), f['properties'].get('name', ref))


# ---------------------------------------------------------------- the map in metres

def is_famous(p):
    if any(k in p for k in NOT_A_LANDMARK):
        return False
    if p.get('historic') == 'district':
        return False
    return ('wikidata' in p or 'wikipedia' in p or 'heritage' in p
            or ('historic' in p and p['historic'] != 'no')
            or p.get('amenity') == 'place_of_worship'
            or p.get('tourism') in FAMOUS_TOURISM
            or p.get('building') in FAMOUS_BUILDING)


def polygon_rings(g, frame):
    if g['type'] == 'Polygon':
        polys = [g['coordinates']]
    elif g['type'] == 'MultiPolygon':
        polys = g['coordinates']
    else:
        return []
    rings = []
    for poly in polys:
        ring = [frame.to_xy(lon, lat) for lon, lat in poly[0]]
        if len(ring) > 1 and ring[0] == ring[-1]:
            ring = ring[:-1]
        rings.append(ring)
    return rings


class Map:
    def __init__(self, features, frame):
        self.frame = frame
        self.buildings, self.famous_areas, self.famous_points = [], [], []
        self.streets, self.water, self.green = [], [], []
        for f in features:
            p, g = f['properties'], f['geometry']
            if g is None:
                continue
            t = g['type']
            if t in ('LineString', 'MultiLineString'):
                if p.get('highway') in STREET_WEIGHT or 'highway' in p:
                    lines = [g['coordinates']] if t == 'LineString' else g['coordinates']
                    for line in lines:
                        self.streets.append(([frame.to_xy(lon, lat) for lon, lat in line], p.get('highway')))
                continue
            if t == 'Point':
                if is_famous(p):
                    self.famous_points.append((frame.to_xy(*g['coordinates']), p))
                continue
            rings = polygon_rings(g, frame)
            if not rings:
                continue
            shape = Shape(rings, p)
            if not shape.rings:
                continue
            if 'building' in p:
                self.buildings.append(shape)
            if is_famous(p):
                self.famous_areas.append(shape)
            if p.get('natural') == 'water' or p.get('waterway') == 'riverbank' or p.get('water'):
                self.water.append(shape)
            elif any((k, p.get(k)) in GREEN for k in ('leisure', 'landuse', 'natural')):
                self.green.append(shape)
        # a famous point (e.g. a temple mapped as a node) makes the building it stands in famous
        for (x, y), p in self.famous_points:
            for b in self.buildings:
                if math.hypot(b.cx - x, b.cy - y) <= b.radius and b.contains(x, y):
                    if b not in self.famous_areas:
                        b.props = dict(b.props); b.props.setdefault('name', p.get('name'))
                        b.via_point = p.get('name')
                        self.famous_areas.append(b)
                    break

    def building_at(self, x, y, max_dist=15):
        for b in self.buildings:
            if math.hypot(b.cx - x, b.cy - y) <= b.radius and b.contains(x, y):
                return b
        near = [b for b in self.buildings if math.hypot(b.cx - x, b.cy - y) <= max_dist + b.radius]
        return min(near, key=lambda b: math.hypot(b.cx - x, b.cy - y)) if near else None


# ---------------------------------------------------------------- orientation

def street_angle(streets, radius):
    """Dominant street direction near the origin, degrees in [-45, 45): the square's edges follow it."""
    bins = [0.0] * 90
    for line, kind in streets:
        w = STREET_WEIGHT.get(kind)
        if not w:
            continue
        for (x1, y1), (x2, y2) in zip(line, line[1:]):
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if math.hypot(mx, my) > radius:
                continue
            length = math.hypot(x2 - x1, y2 - y1)
            if length < 1:
                continue
            a = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 90
            bins[int(a) % 90] += w * length
    if sum(bins) < 50:      # hardly any street: stay north-up
        return 0.0, 0.0
    smooth = [sum(bins[(i + k) % 90] * (5 - abs(k)) for k in range(-4, 5)) for i in range(90)]
    best = max(range(90), key=lambda i: smooth[i])
    share = sum(bins[(best + k) % 90] for k in range(-5, 6)) / sum(bins)
    a = float(best)
    return (a - 90 if a >= 45 else a), share


# ---------------------------------------------------------------- the search

class Result:
    def __init__(self, square, cut, inside, keep_missing, ordinary_cut, score):
        self.square, self.cut, self.inside = square, cut, inside
        self.keep_missing, self.ordinary_cut, self.score = keep_missing, ordinary_cut, score


def evaluate(square, famous, keep, buildings=None):
    cut, inside = [], []
    for s in famous:
        state = square.classify(s)
        if state == 'cut': cut.append(s)
        elif state == 'inside': inside.append(s)
    keep_missing = []
    for k in keep:
        if isinstance(k, Shape):
            if square.classify(k) != 'inside': keep_missing.append(k)
        else:   # a bare point
            u, v = square.local(*k[0])
            if abs(u) > square.h or abs(v) > square.h: keep_missing.append(k)
    ordinary = None
    if buildings is not None:
        ordinary = [b for b in buildings if b not in famous and square.classify(b) == 'cut']
    return cut, inside, keep_missing, ordinary


def search(m, size, slide, angles, preferred_angle, keep, too_big_limit):
    famous = [s for s in m.famous_areas if s.area <= too_big_limit]
    too_big = [s for s in m.famous_areas if s.area > too_big_limit]
    keep_shapes = [k for k in keep if isinstance(k, Shape)]
    for k in keep_shapes:              # anything the user named counts as famous, unless it cannot fit
        if k not in famous and k.area <= too_big_limit:
            famous.append(k)
    step = max(2.0, size / 40)
    n = int(round(slide * size / step))
    cands = []
    for ang in angles:
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                sq = Square(i * step, j * step, size, ang)
                cut, inside, keep_missing, _ = evaluate(sq, famous, keep)
                dist = math.hypot(i * step, j * step)
                # a landmark hugging the edge looks cramped in a diorama: prefer some clearance
                roomy = Square(sq.cx, sq.cy, size * (1 - 2 * MARGIN_SHARE), ang)
                tight = sum(1 for s in inside if roomy.classify(s) != 'inside')
                # simplified: fixed weights; tune if placements look wrong in practice
                soft = (dist - 0.1 * size * min(len(inside), 3) + 0.3 * size * tight
                        + (0 if ang == preferred_angle else 0.25 * size))
                cands.append(((len(keep_missing), len(cut)), soft, sq, cut, inside, keep_missing))  # what you named comes first
    cands.sort(key=lambda c: (c[0], c[1]))
    best_primary = cands[0][0]
    finalists = [c for c in cands if c[0] == best_primary][:60]
    results = []
    for primary, soft, sq, cut, inside, keep_missing in finalists:
        ordinary = [b for b in m.buildings if b not in famous and sq.classify(b) == 'cut']
        score = soft + 0.01 * sum(b.area for b in ordinary)
        results.append(Result(sq, cut, inside, keep_missing, ordinary, (primary, score)))
    results.sort(key=lambda r: r.score)
    return results[0], famous, too_big


# ---------------------------------------------------------------- output

def svg_preview(m, res, famous, too_big, reach, path, title):
    W = 900; pad = 40
    k = (W - 2 * pad) / (2 * reach)
    P = lambda x, y: (pad + (x + reach) * k, pad + (reach - y) * k)
    def poly(ring, fill, stroke='none', sw=0.6, extra=''):
        pts = ' '.join(f'{a:.1f},{b:.1f}' for a, b in (P(x, y) for x, y in ring))
        return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W + 70}" font-family="sans-serif">',
           f'<rect width="{W}" height="{W + 70}" fill="#f6f2e8"/>']
    for s in m.green:
        out += [poly(r, '#cfe3bf') for r in s.rings]
    for s in m.water:
        out += [poly(r, '#b8d4e6') for r in s.rings]
    for line, kind in m.streets:
        if len(line) > 1:
            w = 2.2 if STREET_WEIGHT.get(kind, 0) >= 3 else (1.4 if kind in STREET_WEIGHT else 0.6)
            pts = ' '.join(f'{a:.1f},{b:.1f}' for a, b in (P(x, y) for x, y in line))
            out.append(f'<polyline points="{pts}" fill="none" stroke="#c9c1b0" stroke-width="{w}"/>')
    ordinary = set(id(b) for b in res.ordinary_cut)
    cut = set(id(s) for s in res.cut)
    fam = set(id(s) for s in famous)
    for b in m.buildings:
        if id(b) in fam: continue
        out += [poly(r, '#e9b8ae' if id(b) in ordinary else '#a9a294') for r in b.rings]
    for s in too_big:
        out += [poly(r, 'none', '#c9a227', 1.2, 'stroke-dasharray="6 4"') for r in s.rings]
    for s in famous:
        out += [poly(r, '#d0342c' if id(s) in cut else '#e0b030', '#5a4a1a', 0.8) for r in s.rings]
    sq = [P(x, y) for x, y in res.square.corners()]
    out.append('<polygon points="' + ' '.join(f'{a:.1f},{b:.1f}' for a, b in sq) +
               '" fill="none" stroke="#2c3833" stroke-width="2.4"/>')
    ox, oy = P(0, 0)
    out.append(f'<path d="M{ox-7},{oy}h14M{ox},{oy-7}v14" stroke="#2c3833" stroke-width="1.5"/>')
    for s in famous:
        if res.square.classify(s) != 'outside' and s.props.get('name'):
            x, y = P(s.cx, s.cy)
            out.append(f'<text x="{x:.0f}" y="{y:.0f}" font-size="12" text-anchor="middle" fill="#3a2f10" '
                       f'stroke="#f6f2e8" stroke-width="3" paint-order="stroke">{esc(s.props["name"])}</text>')
    y0 = W + 22
    out.append(f'<text x="{pad}" y="{y0}" font-size="14" fill="#2c3833">{esc(title)}</text>')
    out.append(f'<text x="{pad}" y="{y0 + 24}" font-size="12" fill="#555">金=地标 红=地标被切 粉=普通楼被切 '
               f'虚线金框=地标比方块大 十字=你给的中心 北朝上</text>')
    out.append('</svg>')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def clearance(square, s):
    """Metres between the shape and the nearest edge of the square (negative = past the edge)."""
    return square.h - max(max(abs(u), abs(v)) for r in s.rings for u, v in (square.local(x, y) for x, y in r))


def describe(s):
    via = getattr(s, 'via_point', None)
    extra = f'（按点要素「{via}」认出）' if via and via != s.props.get('name') else ''
    return f'{s.name} [{s.osm_ref}]{extra}'


# ---------------------------------------------------------------- main

def parse_keep_at(values):
    out = []
    for v in values or []:
        lat, lon = (float(x) for x in v.split(','))
        out.append((lat, lon))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pbf', default=DEFAULT_PBF)
    ap.add_argument('--find', help='list named features whose name contains this text, then stop')
    ap.add_argument('--lat', type=float); ap.add_argument('--lon', type=float)
    ap.add_argument('--center-osm', help='centre on an OSM object, e.g. w542890833')
    ap.add_argument('--features', help='use this GeoJSON-lines file instead of cutting the pbf (tests)')
    ap.add_argument('--size', type=float, default=200, help='side in metres (default 200)')
    ap.add_argument('--slide', type=float, default=0.4, help='how far the square may move, as a share of its size')
    ap.add_argument('--rotate', default='auto', help='auto (follow streets, else north), north, or degrees')
    ap.add_argument('--keep', default='', help='names that must sit fully inside, separated by ;')
    ap.add_argument('--keep-at', action='append', help='lat,lon of a building that must sit fully inside (repeatable)')
    ap.add_argument('--fixed', action='store_true', help='do not move or turn: just check this placement')
    ap.add_argument('--out-dir', default='work')
    a = ap.parse_args(argv)

    if a.find:
        rows, total = find_named(a.pbf, a.find)
        for ref, gt, name, lat, lon, kind in rows:
            print(f'{ref:<14} {gt:<12} {lat:.5f},{lon:.5f}  {name}  {kind}')
        print(f'{total} match(es)' + (f', first {len(rows)} shown' if total > len(rows) else ''))
        return 0

    label = ''
    if a.center_osm:
        a.lat, a.lon, label = osm_object_center(a.pbf, a.center_osm)
    if a.lat is None or a.lon is None:
        ap.error('give --lat and --lon, or --center-osm (use --find to look a name up)')
    if not 60 <= a.size <= 1000:
        ap.error('size must be 60-1000 m')

    os.makedirs(a.out_dir, exist_ok=True)
    reach = a.size * 0.71 + a.slide * a.size * 1.42 + 30
    feat_path = a.features or os.path.join(a.out_dir, 'osm-area.geojsonseq')
    bbox = None
    if not a.features:
        bbox = extract_area(a.pbf, a.lat, a.lon, reach, feat_path)
    frame = Frame(a.lat, a.lon)
    m = Map(read_features(feat_path), frame)

    keep, unresolved = [], []
    for name in [n.strip() for n in a.keep.split(';') if n.strip()]:
        pool = m.famous_areas + [b for b in m.buildings if b not in m.famous_areas]
        exact = [s for s in pool if (s.props.get('name') or '') == name]
        # "粤剧艺术博物馆" must not land on "粤剧艺术博物馆 办公楼": exact name first, then landmarks, then any
        hits = exact or [s for s in m.famous_areas if name in (s.props.get('name') or '')] \
            or [s for s in pool if name in (s.props.get('name') or '')]
        if hits:
            keep.append(min(hits, key=lambda s: math.hypot(s.cx, s.cy)))
            continue
        pts = [((x, y), p) for (x, y), p in m.famous_points if name in (p.get('name') or '')]
        if pts:
            (x, y), p = pts[0]
            b = m.building_at(x, y)
            keep.append(b if b else ((x, y), p))
            continue
        unresolved.append(name)
    for lat, lon in parse_keep_at(a.keep_at):
        x, y = frame.to_xy(lon, lat)
        b = m.building_at(x, y)
        if b:
            b.props = dict(b.props); b.props.setdefault('name', f'指定点 {lat:.5f},{lon:.5f}')
            keep.append(b)
        else:
            unresolved.append(f'{lat},{lon}')

    st_angle, share = street_angle(m.streets, a.size * 0.71 + a.slide * a.size)
    if a.rotate == 'auto':
        angles = [st_angle] + ([0.0] if st_angle != 0.0 else [])
        preferred = st_angle
    elif a.rotate == 'north':
        angles, preferred = [0.0], 0.0
    else:
        angles = [float(a.rotate)]; preferred = angles[0]

    too_big_limit = 0.5 * a.size * a.size
    if a.fixed:
        sq = Square(0, 0, a.size, angles[0])
        famous = [s for s in m.famous_areas if s.area <= too_big_limit]
        for k in keep:
            if isinstance(k, Shape) and k not in famous and k.area <= too_big_limit:
                famous.append(k)
        too_big = [s for s in m.famous_areas if s.area > too_big_limit]
        cut, inside, keep_missing, ordinary = evaluate(sq, famous, keep, m.buildings)
        res = Result(sq, cut, inside, keep_missing, ordinary, None)
    else:
        res, famous, too_big = search(m, a.size, a.slide, angles, preferred, keep, too_big_limit)

    sq = res.square
    clon, clat = frame.to_lonlat(sq.cx, sq.cy)
    corners = [list(reversed(frame.to_lonlat(x, y))) for x, y in sq.corners()]
    plot = {
        'center': {'lat': round(clat, 7), 'lon': round(clon, 7)},
        'requested_center': {'lat': a.lat, 'lon': a.lon, 'label': label},
        'size_m': a.size,
        'rotation_deg': round(sq.angle, 1),
        'rotation_note': 'square edges turned this many degrees counter-clockwise from east/north (0 = north-up)',
        'moved_m': {'east': round(sq.cx, 1), 'north': round(sq.cy, 1)},
        'corners_latlon': [[round(c[0], 7), round(c[1], 7)] for c in corners],
        'famous_inside': [describe(s) for s in res.inside],
        'famous_cut': [describe(s) for s in res.cut],
        'too_big_to_fit': [describe(s) for s in too_big if sq.classify(s) != 'outside'],
        'keep_missing': [describe(k) if isinstance(k, Shape) else k[1].get('name') for k in res.keep_missing],
        'keep_unresolved': unresolved,
        'ordinary_buildings_cut': len(res.ordinary_cut),
        'street_angle_deg': round(st_angle, 1), 'street_angle_share': round(share, 2),
        'source': {'pbf': None if a.features else a.pbf, 'bbox': bbox,
                   'pbf_mtime': None if a.features else int(os.path.getmtime(a.pbf)),
                   'credit': '© OpenStreetMap contributors (ODbL)'},
    }
    with open(os.path.join(a.out_dir, 'plot.json'), 'w', encoding='utf-8') as fh:
        json.dump(plot, fh, ensure_ascii=False, indent=2)
    title = f'{label or f"{a.lat:.5f},{a.lon:.5f}"} · {a.size:.0f} m · 转 {sq.angle:.1f}° · ' \
            f'挪 东{sq.cx:+.0f} 北{sq.cy:+.0f} m · 地标被切 {len(res.cut)}'
    svg_preview(m, res, famous, too_big, reach * 0.8, os.path.join(a.out_dir, 'plot-preview.svg'), title)

    print(f'方块：{a.size:.0f} 米，中心 {clat:.6f},{clon:.6f}（相对你给的点 东{sq.cx:+.0f} 北{sq.cy:+.0f} 米），'
          f'转 {sq.angle:.1f}°（街道主方向 {st_angle:.1f}°，占比 {share:.0%}）')
    print(f'地标完整在内 {len(res.inside)}：' + ('、'.join(f'{describe(s)}（离边 {clearance(sq, s):.0f} 米）'
                                                     for s in res.inside) or '无'))
    if res.cut:
        print(f'⚠ 地标被切 {len(res.cut)}：' + '、'.join(describe(s) for s in res.cut))
    if plot['too_big_to_fit']:
        print('比方块还大、装不下的地标（不计入被切）：' + '、'.join(plot['too_big_to_fit']))
    if res.keep_missing:
        print('⚠ 点名要保的没装进来：' + '、'.join(plot['keep_missing']))
    if unresolved:
        print('⚠ 点名要保的在地图里没找到：' + '、'.join(unresolved) + '（OSM 里可能没名字，改用 --keep-at 纬度,经度）')
    print(f'普通楼被切 {len(res.ordinary_cut)} 栋。输出：{a.out_dir}/plot.json、plot-preview.svg')
    return 2 if (res.cut or res.keep_missing) else 0


if __name__ == '__main__':
    sys.exit(main())
