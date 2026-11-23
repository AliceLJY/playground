"""Package the locally tested game as one offline HTML file. Standard library only."""
from pathlib import Path
import base64, hashlib
ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text()
css = (ROOT / "src/style.css").read_text()
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + css + '\n</style>')
for name in ("vendor/three.min.js", "data/city.js", "src/core.js", "data/town.js", "src/town-core.js", "src/game.js", "src/town.js"):
    js = (ROOT / name).read_text().replace('</script', '<\\/script')
    if name == "src/game.js":
        loader = "'assets/cat-' + n + '.webp'"
        assert js.count(loader) == 1
        table = ",".join(f"'{a.stem[4:]}':'data:image/webp;base64," + base64.b64encode(a.read_bytes()).decode() + "'" for a in sorted((ROOT / "assets").glob("cat-*.webp")))
        js = js.replace(loader, "({" + table + "})[n]")
    marker = '<script src="' + name + '"></script>'
    assert html.count(marker) == 1, name
    html = html.replace(marker, '<script>\n' + js + '\n</script>')
assert '<script src=' not in html and 'rel="stylesheet"' not in html and "'assets/cat-'" not in html
notice = (ROOT / "vendor/THREE-LICENSE.txt").read_text()
html = html.replace("<head>", "<head>\n<!-- Three.js license\n" + notice + "\n-->\n<!-- Map data © OpenStreetMap contributors, ODbL 1.0 -->", 1)
target = ROOT / "小橘爬塔.html"
target.write_text(html)
print(target.name, len(target.read_bytes()), 'bytes', hashlib.sha256(target.read_bytes()).hexdigest()[:16])
