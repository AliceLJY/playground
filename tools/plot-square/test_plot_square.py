"""Tests for plot_square.py.  Run: python3 -m unittest -v test_plot_square  (in this folder)

The synthetic tests build a small map in metres around a reference point and need nothing installed.
The real-data test uses the local Guangdong extract and osmium; it is skipped where they are missing.
"""
import contextlib, io, json, math, os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plot_square as P

LAT0, LON0 = 23.12, 113.25
FRAME = P.Frame(LAT0, LON0)


def box(cx, cy, w, h, angle=0.0):
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in pts]


def polygon(ring, **tags):
    coords = [list(FRAME.to_lonlat(x, y)) for x, y in ring]
    coords.append(coords[0])
    return {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [coords]}, 'properties': tags}


def street(points, kind='residential'):
    return {'type': 'Feature', 'properties': {'highway': kind},
            'geometry': {'type': 'LineString', 'coordinates': [list(FRAME.to_lonlat(x, y)) for x, y in points]}}


def grid_streets(angle, spacing=60, reach=300):
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    out = []
    for k in range(-5, 6):
        off = k * spacing
        for (x1, y1), (x2, y2) in (((-reach, off), (reach, off)), ((off, -reach), (off, reach))):
            out.append(street([(x1 * c - y1 * s, x1 * s + y1 * c), (x2 * c - y2 * s, x2 * s + y2 * c)]))
    return out


def run_tool(features, *args):
    d = tempfile.mkdtemp()
    path = os.path.join(d, 'features.geojsonseq')
    with open(path, 'w', encoding='utf-8') as fh:
        for f in features:
            fh.write(json.dumps(f, ensure_ascii=False) + '\n')
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = P.main(['--features', path, '--lat', str(LAT0), '--lon', str(LON0), '--out-dir', d] + list(args))
    with open(os.path.join(d, 'plot.json'), encoding='utf-8') as fh:
        plot = json.load(fh)
    svg_ok = os.path.getsize(os.path.join(d, 'plot-preview.svg')) > 500
    shutil.rmtree(d)
    return code, plot, buf.getvalue(), svg_ok


def filler():
    """Ordinary houses everywhere, so that every placement cuts something ordinary."""
    return [polygon(box(x, y, 12, 9), building='yes') for x in range(-240, 241, 30) for y in range(-240, 241, 30)]


class Geometry(unittest.TestCase):
    def shape(self, ring):
        return P.Shape([ring], {})

    def test_inside_outside_cut(self):
        sq = P.Square(0, 0, 200, 0)
        self.assertEqual(sq.classify(self.shape(box(0, 0, 20, 20))), 'inside')
        self.assertEqual(sq.classify(self.shape(box(300, 0, 20, 20))), 'outside')
        self.assertEqual(sq.classify(self.shape(box(100, 0, 20, 20))), 'cut', 'straddling the east edge')
        # a long thin building crossing the square with no corner inside it
        self.assertEqual(sq.classify(self.shape(box(0, 0, 400, 6))), 'cut')
        # the square sits entirely inside a huge area
        self.assertEqual(sq.classify(self.shape(box(0, 0, 900, 900))), 'cut')

    def test_rotation_changes_the_answer(self):
        s = self.shape(box(95, 95, 10, 10))           # near the north-east corner
        self.assertEqual(P.Square(0, 0, 200, 0).classify(s), 'inside')
        self.assertEqual(P.Square(0, 0, 200, 45).classify(s), 'outside')

    def test_tolerance_is_small(self):
        sq = P.Square(0, 0, 200, 0)
        self.assertEqual(sq.classify(self.shape(box(95.2, 0, 10, 10))), 'inside', '0.2 m over is within tolerance')
        self.assertEqual(sq.classify(self.shape(box(97, 0, 10, 10))), 'cut', '2 m over is a cut')

    def test_street_angle(self):
        m = P.Map(grid_streets(20), FRAME)
        a, share = P.street_angle(m.streets, 250)
        self.assertLess(abs(a - 20), 2, f'grid at 20 degrees read as {a}')
        m = P.Map(grid_streets(-35), FRAME)
        a, _ = P.street_angle(m.streets, 250)
        self.assertLess(abs(a + 35), 2, f'grid at -35 degrees read as {a}')


class Placement(unittest.TestCase):
    def test_known_bad_placement_is_reported(self):
        """Calibration: a landmark on the west edge of the requested square must be reported as cut."""
        feats = filler() + [polygon(box(-100, 0, 30, 60), building='church', name='教堂', wikidata='Q1')]
        code, plot, out, svg_ok = run_tool(feats, '--rotate', 'north', '--fixed')
        self.assertEqual(code, 2)
        self.assertEqual(len(plot['famous_cut']), 1, out)
        self.assertIn('教堂', plot['famous_cut'][0])
        self.assertTrue(svg_ok)

    def test_search_moves_the_square_off_the_landmark(self):
        feats = filler() + [polygon(box(-100, 0, 30, 60), building='church', name='教堂', wikidata='Q1')]
        code, plot, out, _ = run_tool(feats, '--rotate', 'north')
        self.assertEqual(code, 0, out)
        self.assertEqual(plot['famous_cut'], [])
        self.assertTrue(any('教堂' in s for s in plot['famous_inside']), 'it should slide to take the church in')
        self.assertLessEqual(abs(plot['moved_m']['east']), 80 + 1e-6, 'slide limit is 40% of 200 m')

    def test_square_follows_the_streets(self):
        feats = filler() + grid_streets(20)
        code, plot, out, _ = run_tool(feats)
        self.assertEqual(code, 0, out)
        self.assertLess(abs(plot['rotation_deg'] - 20), 2)

    def test_landmark_too_big_is_not_a_cut(self):
        feats = filler() + [polygon(box(0, 0, 400, 400), name='大园区', wikidata='Q2')]
        code, plot, out, _ = run_tool(feats, '--rotate', 'north')
        self.assertEqual(code, 0, out)
        self.assertEqual(plot['famous_cut'], [])
        self.assertTrue(any('大园区' in s for s in plot['too_big_to_fit']))

    def test_keep_by_exact_name_first(self):
        """'博物馆' must not resolve to the nearer '博物馆 办公楼'."""
        feats = filler() + [polygon(box(10, 10, 20, 20), building='yes', name='博物馆 办公楼'),
                            polygon(box(150, 0, 30, 30), building='yes', name='博物馆', tourism='museum')]
        code, plot, out, _ = run_tool(feats, '--rotate', 'north', '--keep', '博物馆')
        self.assertEqual(code, 0, out)
        self.assertTrue(any(s.startswith('博物馆 [') for s in plot['famous_inside']), plot['famous_inside'])

    def test_named_landmark_beats_avoiding_other_cuts(self):
        """When keeping what you named forces another landmark onto the edge, keep it and report the cut."""
        # A 120 m bar lies right above the museum. A 100 m square that holds the museum always cuts the bar;
        # the only cut-free squares sit above the bar and leave the museum out. Calibrated: with the old order
        # (fewest cuts first) this test fails, because the tool drops the museum to save the bar.
        feats = [polygon(box(0, 0, 120, 10), building='yes', name='长条', historic='building'),
                 polygon(box(0, -10, 20, 8), building='yes', name='要保的', tourism='museum')]
        code, plot, out, _ = run_tool(feats, '--rotate', 'north', '--size', '100', '--slide', '0.8',
                                      '--keep', '要保的')
        self.assertEqual(plot['keep_missing'], [], out)
        self.assertTrue(any('要保的' in s for s in plot['famous_inside']), out)
        self.assertTrue(any('长条' in s for s in plot['famous_cut']), 'the cost is reported, not hidden')
        self.assertEqual(code, 2, 'a landmark is still cut, so the exit code says so')

    def test_keep_at_coordinate(self):
        feats = filler() + [polygon(box(-120, 40, 25, 25), building='yes')]
        lon, lat = FRAME.to_lonlat(-120, 40)
        code, plot, out, _ = run_tool(feats, '--rotate', 'north', '--keep-at', f'{lat},{lon}')
        self.assertEqual(code, 0, out)
        self.assertEqual(plot['keep_missing'], [])
        self.assertEqual(plot['keep_unresolved'], [])

    def test_unfound_name_is_reported(self):
        code, plot, out, _ = run_tool(filler(), '--rotate', 'north', '--keep', '不存在的楼')
        self.assertEqual(plot['keep_unresolved'], ['不存在的楼'])
        self.assertIn('没找到', out)


@unittest.skipUnless(os.path.exists(P.DEFAULT_PBF) and shutil.which('osmium'), 'needs the local OSM extract and osmium')
class RealData(unittest.TestCase):
    """Calibrated on 2026-11-23 against the Guangdong extract: Sacred Heart Cathedral, w542890833."""
    CATHEDRAL = (23.11739, 113.25472)

    def run_real(self, *args):
        d = tempfile.mkdtemp()
        lat, lon = self.CATHEDRAL
        lon += 100 / (P.M_PER_DEG_LON_EQ * math.cos(math.radians(lat)))     # cathedral on the west edge
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = P.main(['--lat', str(lat), '--lon', str(lon), '--size', '200', '--rotate', 'north',
                           '--out-dir', d] + list(args))
        with open(os.path.join(d, 'plot.json'), encoding='utf-8') as fh:
            plot = json.load(fh)
        shutil.rmtree(d)
        return code, plot, buf.getvalue()

    def test_cathedral_cut_then_freed(self):
        code, plot, out = self.run_real('--fixed')
        self.assertEqual(code, 2, out)
        self.assertTrue(any('w542890833' in s for s in plot['famous_cut']), out)
        code, plot, out = self.run_real()
        self.assertEqual(code, 0, out)
        self.assertTrue(any('w542890833' in s for s in plot['famous_inside']), out)


if __name__ == '__main__':
    unittest.main()
