"""Build a standalone offline game using only the Python standard library."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
marker = '<link rel="stylesheet" href="src/style.css">'
assert html.count(marker) == 1
html = html.replace(marker, '<style>\n' + (ROOT / 'src/style.css').read_text(encoding='utf-8') + '\n</style>')
for name in ('vendor/three.min.js', 'src/arena.js', 'src/core.js', 'src/world.js', 'src/game.js'):
    marker = '<script src="' + name + '"></script>'
    assert html.count(marker) == 1, name
    js = (ROOT / name).read_text(encoding='utf-8').replace('</script', '<\\/script')
    html = html.replace(marker, '<script>\n' + js + '\n</script>')
assert '<script src=' not in html and 'rel="stylesheet"' not in html
notice = (ROOT / 'vendor/THREE-LICENSE.txt').read_text(encoding='utf-8')
html = html.replace('<head>', '<head>\n<!-- Three.js license\n' + notice + '\n-->\n', 1)
target = ROOT / '天台水枪大战.html'
target.write_text(html, encoding='utf-8')
content = target.read_bytes()
print(target.name, len(content), 'bytes', hashlib.sha256(content).hexdigest())
