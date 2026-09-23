"""Package the Pearl River Cup as an offline HTML file; standard library only."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "src/race.css").read_text(encoding="utf-8")
marker = '<link rel="stylesheet" href="src/race.css">'
assert html.count(marker) == 1
html = html.replace(marker, '<style>\n' + css + '\n</style>')
for name in ("vendor/three.min.js", "src/race-core.js", "src/race-cat.js", "src/race-world.js", "src/race-game.js"):
    js = (ROOT / name).read_text(encoding="utf-8").replace('</script', '<\\/script')
    marker = '<script src="' + name + '"></script>'
    assert html.count(marker) == 1, name
    html = html.replace(marker, '<script>\n' + js + '\n</script>')
assert '<script src=' not in html and 'rel="stylesheet"' not in html
notice = (ROOT / "vendor/THREE-LICENSE.txt").read_text(encoding="utf-8")
html = html.replace('<head>', '<head>\n<!-- Three.js license\n' + notice + '\n-->\n', 1)
target = ROOT / '小橘飞车.html'
target.write_text(html, encoding='utf-8')
content = target.read_bytes()
print(target.name, len(content), 'bytes', hashlib.sha256(content).hexdigest())
