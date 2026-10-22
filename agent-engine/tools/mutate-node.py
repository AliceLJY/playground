"""Run the Node tests against deliberately broken copies of this folder and list which tests fail.
A test that stays green on a copy broken in the way it claims to guard against is not guarding anything.
Run from anywhere:  python3 -I tools/mutate-node.py [mutation-name ...]
Copies go to a temporary directory; nothing in the folder itself is touched. Exit code 1 if any mutation is missed.
"""
import os, re, shutil, subprocess, sys, tempfile

STAGE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = tempfile.mkdtemp(prefix='agent-engine-mutations-')
NAME = 'Al' + 'ice'     # the name the published files must never contain


def edit(d, rel, old, new):
    p = os.path.join(d, rel)
    s = open(p, encoding='utf-8').read()
    assert old in s, (rel, old)
    open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))


M = {}
def mut(name):
    def deco(fn):
        M[name] = fn
        return fn
    return deco

# --- published-files scan ---
@mut('google-fonts-link')
def _(d): edit(d, 'index.html', '<link rel="stylesheet" href="src/style.css">', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&display=swap">\n<link rel="stylesheet" href="src/style.css">')
@mut('font-import-in-css')
def _(d): edit(d, 'src/style.css', '*{box-sizing:border-box}', "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC');\n*{box-sizing:border-box}")
@mut('local-path-in-page')
def _(d): edit(d, 'index.html', '<p class="sub">', '<!-- ' + '/' + 'Users/someone/notes -->\n<p class="sub">')
@mut('name-in-footer')
def _(d): edit(d, 'index.html', '2026-10-21 成稿 · 我的AI小木屋。', '2026-10-21 为 ' + NAME + ' 做的讲解页。')
@mut('footer-output-folder')
def _(d): edit(d, 'index.html', '2026-10-21 成稿 · 我的AI小木屋。', '2026-10-21 成稿 · 产出目录 AI' + '产出/某日-某主题/。')
@mut('tailnet-address')
def _(d): edit(d, 'src/view.js', "const root = document.documentElement;", "const root = document.documentElement; // see https://box.example.ts.net:3080")
@mut('fetch-call')
def _(d): edit(d, 'src/view.js', "const root = document.documentElement;", "const root = document.documentElement; fetch('data.json');")
@mut('extra-external-link')
def _(d): edit(d, 'index.html', '<li>小红书「不同harness', '<li><a href="https://example.com/post" rel="noopener">更多</a> 小红书「不同harness')
@mut('no-viewport-meta')
def _(d): edit(d, 'index.html', '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n', '')
@mut('old-palette')
def _(d):
    # the palette of the original explainer page: small grey, model orange, gate amber and pass green were all under 4.5:1 on some background
    for new, old in [('--mute:#5F6976', '--mute:#7C8899'), ('--model:#BC3F0C', '--model:#C2410C'), ('--gate:#AB4F09', '--gate:#B45309'), ('--ok:#147A3A', '--ok:#15803D')]:
        edit(d, 'src/style.css', new, old)
@mut('scene-1-bloat')
def _(d): edit(d, 'index.html', '<p class="note">点下面的「下一步」', '<p>' + '这是一段很长的多余说明文字，' * 90 + '</p><p class="note">点下面的「下一步」')
@mut('named-person-returns')
def _(d): edit(d, 'index.html', '<b>连接型</b>', '<b>Cin' + 'dy</b>')
@mut('group-jab-returns')
def _(d): edit(d, 'index.html', '再往前走一步，要补的就是这块规则层</strong>。', '再往前走一步，要补的就是这块规则层</strong>，所以他们的 AI ' + '老' + '公也会「说过' + '养' + '猫下次就忘」。')
# --- engine behaviour ---
@mut('gate-lets-rm-through')
def _(d): edit(d, 'src/core.js', "const DANGEROUS = [/\\brm\\s+-[a-z]*[rf]/i, ", "const DANGEROUS = [")
@mut('gate-ignores-dotdot')
def _(d): edit(d, 'src/core.js', " || p.split('/').includes('..')", "")
@mut('pairing-keeps-orphans')
def _(d): edit(d, 'src/core.js', "if (m.role === 'tool' && !called.has(m.toolCallId)) { removed++; continue; }", "")
@mut('pairing-never-fills')
def _(d): edit(d, 'src/core.js', "if (!answered.has(c.id)) {", "if (false) {")
@mut('compact-drops-system')
def _(d): edit(d, 'src/core.js', "const head = history.filter((m, i) => m.role === 'system' && i === 0);", "const head = [];")
@mut('compact-splits-pairs')
def _(d): edit(d, 'src/core.js', "while (cut > head.length && history[cut].role === 'tool') cut--;", "")
@mut('retry-on-permanent')
def _(d): edit(d, 'src/core.js', "if (kind === 'permanent') return", "if (false) return")
@mut('backoff-no-cap')
def _(d): edit(d, 'src/core.js', "const step = Math.min(cap, base * Math.pow(2, attempt - 1));", "const step = base * Math.pow(2, attempt - 1);")
@mut('coerce-everything')
def _(d): edit(d, 'src/core.js', "if (re.test(v)) next = Number(v); else failed.push(k);", "next = Number(v);")
@mut('edit-guard-always-allows')
def _(d): edit(d, 'src/core.js', "if (toolName === 'edit_file' && !read.has(path))", "if (false)")
@mut('loop-stops-after-first-tool')
def _(d): edit(d, 'src/core.js', "events.push({ turn, phase: 'more', station: 5, added: [] });", "events.push({ turn, phase: 'more', station: 5, added: [] }); if (turn === 1) { stoppedBy = 'no-tool-request'; break; }")
@mut('answer-count-hardcoded')
def _(d): edit(d, 'src/core.js', "return { content: '一共 ' + names.length + ' 个目录", "return { content: '一共 31 个目录")
@mut('life-never-fixes-price')
def _(d): edit(d, 'src/core.js', "if (market && (p.price < market * 0.7 || p.price > market * 1.5))", "if (false)")
@mut('life-retells-rejected')
def _(d): edit(d, 'src/core.js', "if (s.verdict.status === 'reject') continue;", "")
@mut('life-ignores-balance')
def _(d): edit(d, 'src/core.js', "if (p.price > world.balance)", "if (false)")
@mut('parseview-accepts-7')
def _(d): edit(d, 'src/core.js', "/^[1-6]$/.test(raw)", "/^[1-7]$/.test(raw)")
@mut('xml-parser-swallows-broken')
def _(d): edit(d, 'src/core.js', "<\\/arguments>\\s*<\\/tool_call>/g;", "<\\/arguments>\\s*(?:<\\/tool_call>)?/g;")
@mut('dwell-no-cap')
def _(d): edit(d, 'src/core.js', "return clamp(Math.round((animMs || 0) + DWELL_BASE + (visibleChars / READ_CPS) * 1000), DWELL_MIN, DWELL_MAX);", "return Math.max(DWELL_MIN, Math.round((animMs || 0) + DWELL_BASE + (visibleChars / READ_CPS) * 1000));")
# --- docs ---
@mut('chinese-in-english-readme')
def _(d): edit(d, 'README.md', '(the page is in Chinese)', '(页面是中文)')
@mut('readme-section-moved')
def _(d): open(os.path.join(d, 'README_CN.md'), 'a', encoding='utf-8').write('\n## 许可\n\n没有许可声明。\n')


def main():
    res = {}
    try:
        _run(res)
    finally:
        shutil.rmtree(WORK, ignore_errors=True)


def _run(res):
    for name, fn in M.items():
        if sys.argv[1:] and name not in sys.argv[1:]:
            continue
        d = os.path.join(WORK, name)
        shutil.rmtree(d, ignore_errors=True)
        shutil.copytree(STAGE, d)
        fn(d)
        p = subprocess.run('node --test tests/*.test.cjs', shell=True, cwd=d, capture_output=True, text=True, timeout=300)
        fails = sorted(set(re.findall(r'^✖ (.+?) \(', p.stdout, flags=re.M)))
        res[name] = fails
        print(('CAUGHT ' if fails else 'MISSED ') + name, '->', len(fails), [f[:70] for f in fails], flush=True)
    missed = [n for n, f in res.items() if not f]
    print('%d mutations, %d caught, missed: %s' % (len(res), len(res) - len(missed), missed))
    sys.exit(1 if missed else 0)


main()
