"""Package the locally tested game as one offline HTML file. Standard library only."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text()
css = (ROOT / "src/style.css").read_text()
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + css + '\n</style>')
for name in ("vendor/three.min.js", "src/core.js", "src/game.js"):
    js = (ROOT / name).read_text().replace('</script', '<\\/script')
    marker = '<script src="' + name + '"></script>'
    assert html.count(marker) == 1, name
    html = html.replace(marker, '<script>\n' + js + '\n</script>')
assert '<script src=' not in html and 'rel="stylesheet"' not in html
notice = (ROOT / "vendor/THREE-LICENSE.txt").read_text()
html = html.replace("<head>", "<head>\n<!-- Three.js license\n" + notice + "\n-->", 1)
target = ROOT / "阿橘的广州慢游.html"
target.write_text(html)
print(target.name, len(target.read_bytes()), 'bytes', hashlib.sha256(target.read_bytes()).hexdigest())
