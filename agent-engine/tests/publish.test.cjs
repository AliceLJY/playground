// What gets published is index.html plus src/ (plus vendor/ if one ever appears), copied as they are to a public Pages site.
// These checks scan those real files: no outside requests, nothing that points back to a person or a machine, readable colours, sane pacing.
// AGENT_ENGINE_ROOT points the suite at another copy of the folder (used to run it against a deliberately broken copy).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = process.env.AGENT_ENGINE_ROOT || path.join(__dirname, '..');
const C = require(path.join(ROOT, 'src', 'core.js'));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
const PUBLISHED = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'vendor'))];
const TEXT = PUBLISHED.filter((f) => /\.(html|js|css|svg|json|txt|md)$/i.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f);

// words the published files must never contain, spelled in pieces so this file does not carry them either
const NAME = 'Al' + 'ice', ACCOUNT = ['anxian', 'jingya'].join(''), OUTDIR = 'AI' + '产出', INTERNAL = ['soc' + 'ai', 'hippo' + '-wiki', 'sync' + '-bridge', 'conversation' + '-truth'];
// the only outside pages the page may link to, as plain <a href> (a link is not a request)
const ALLOWED_LINKS = new Set([
  'https://code.claude.com/docs/en/agent-sdk/agent-loop',
  'https://nader.substack.com/p/you-couldve-invented-claude-code',
  'https://github.com/itshen/Alice_methodology',
]);

test('spec 8.7 the published set is what we think it is', () => {
  assert.ok(PUBLISHED.some((f) => rel(f) === 'index.html'), 'index.html is missing');
  assert.ok(PUBLISHED.some((f) => rel(f) === path.join('src', 'core.js')) && PUBLISHED.some((f) => rel(f) === path.join('src', 'view.js')) && PUBLISHED.some((f) => rel(f) === path.join('src', 'style.css')));
  const bytes = PUBLISHED.reduce((n, f) => n + fs.statSync(f).size, 0);
  assert.ok(bytes <= 120 * 1024, 'spec 6: published files weigh ' + bytes + ' bytes, budget is 122880');
});

test('spec 8.7 no outside requests: every loaded resource is local, every http(s) address is one of the allowed <a> links', () => {
  for (const f of TEXT) {
    const s = read(f);
    // 1. every web address in the file must be an allowed link inside an <a href>
    const urls = s.match(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)]*/g) || [];
    for (const u of urls) {
      const absolute = u.startsWith('//') ? 'https:' + u : u;
      assert.ok(ALLOWED_LINKS.has(absolute), 'spec 8.7: ' + rel(f) + ' contains the web address ' + u.slice(0, 60) + ' which is not an allowed link');
      assert.ok(f.endsWith('.html'), 'spec 8.7: ' + rel(f) + ' mentions an outside address; only index.html may, and only as a plain link');
    }
  }
  const html = read(path.join(ROOT, 'index.html'));
  const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
  for (const t of tags) {
    const name = /^<([a-zA-Z0-9]+)/.exec(t)[1].toLowerCase();
    const attrs = [...t.matchAll(/\s(src|href|action|poster|data|srcset|xlink:href|formaction)\s*=\s*"([^"]*)"/gi)];
    for (const [, attr, value] of attrs) {
      const remote = /^(https?:)?\/\//i.test(value.trim());
      if (name === 'a' && attr.toLowerCase() === 'href') {
        if (remote) {
          assert.ok(ALLOWED_LINKS.has(value), 'spec 8.7: link to ' + value + ' is not on the allowed list');
          assert.ok(/rel="[^"]*noopener/.test(t), 'spec 8.7: external link ' + value + ' needs rel="noopener"');
        }
      } else assert.ok(!remote, 'spec 8.7: <' + name + ' ' + attr + '="' + value + '"> loads something from outside');
    }
    assert.ok(!/\son[a-z]+\s*=/i.test(t), 'spec 8.7: inline event handler in ' + t.slice(0, 60));
    assert.ok(!['iframe', 'embed', 'object', 'video', 'audio', 'source', 'img', 'form'].includes(name), 'spec 8.7: <' + name + '> is not expected on this page');
  }
  // every <link>/<script> must point at a file that exists in the folder
  for (const t of tags.filter((x) => /^<(link|script)\b/i.test(x))) {
    const m = /(?:src|href)\s*=\s*"([^"]*)"/i.exec(t);
    if (!m || m[1].startsWith('data:')) continue;
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'spec 8.7: ' + t + ' points at a file that is not in the folder');
  }
  // code that can reach the network
  for (const f of TEXT.filter((x) => /\.(js|html)$/.test(x))) {
    const s = read(f).replace(/\/\/[^\n]*$/gm, '');
    for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'import(']) {
      assert.ok(!s.includes(api), 'spec 8.7: ' + rel(f) + ' uses ' + api);
    }
  }
  const css = read(path.join(ROOT, 'src', 'style.css'));
  assert.ok(!/@import|url\(\s*["']?(https?:)?\/\//i.test(css), 'spec 8.7: the stylesheet must not import or load anything remote');
  assert.ok(!/@font-face/i.test(css) || !/url\(\s*["']?(https?:)?\/\//i.test(css), 'fonts must be system fonts or local files');
});

test('spec 8.7 nothing that points back to a person, a machine or a session', () => {
  const forbidden = [
    ['a local user path', /\/Users\//], ['a home path', /\/home\/[a-z]/i], ['a Windows path', /[A-Z]:\\(Users|Windows)/], ['a tilde library path', /~\/Library/],
    ['the local account name', new RegExp(ACCOUNT, 'i')], ['a tailnet address', /\.ts\.net|tailscale|tail[0-9a-f]{6}/i], ['a private IP', /\b(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)\b/],
    ['localhost', /localhost|127\.0\.0\.1/], ['a session id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['the output folder name', new RegExp(OUTDIR)], ['an internal tool name', new RegExp(INTERNAL.join('|'), 'i')],
    ['a font CDN', /fonts\.googleapis|fonts\.gstatic|unpkg|jsdelivr|cdnjs|cloudflare/i],
  ];
  for (const f of TEXT) {
    const s = read(f).split('https://github.com/itshen/Alice_methodology').join('');   // that one link legitimately spells the other author's repo name
    for (const [what, re] of forbidden) assert.ok(!re.test(s), 'spec 8.7: ' + rel(f) + ' contains ' + what + ' (' + (re.exec(s) || [''])[0] + ')');
    assert.ok(!new RegExp(NAME, 'i').test(s), 'spec 8.7: ' + rel(f) + ' contains the author\'s name outside the one allowed link');
  }
  // the allowed link really is the only place the name appears
  const html = read(path.join(ROOT, 'index.html'));
  assert.strictEqual((html.match(new RegExp(NAME, 'g')) || []).length, (html.match(new RegExp(NAME + '_methodology', 'g')) || []).length, 'spec 8.7: the author\'s name appears somewhere other than the allowed link');
});

// wording the page must not carry: a named person judged in passing, and a jab at a group of users (spelled in pieces so this file does not carry them either)
const BANNED_WORDING = [['Cin' + 'dy', 'a named person'], ['AI ' + '老' + '公', 'a jab at a group of users'], ['养' + '猫', 'the "forgets the cat" jab'], ['人机' + '恋', 'a label put on a group of users']];
test('spec 8.7 no named person judged in passing, no jab at a group of users', () => {
  for (const f of TEXT) {
    const s = read(f);
    for (const [word, why] of BANNED_WORDING) assert.ok(!s.includes(word), 'spec 8.7: ' + rel(f) + ' contains "' + word + '" (' + why + ')');
  }
});

test('spec 8.7 the page is a proper document: language, charset, viewport, six scenes, scripts in order', () => {
  const html = read(path.join(ROOT, 'index.html'));
  assert.ok(/^<!doctype html>/i.test(html.trim()), 'doctype');
  assert.ok(/<html lang="zh-CN">/.test(html), 'lang');
  assert.ok(/<meta charset="utf-8">/i.test(html), 'charset');
  assert.ok(/<meta name="viewport" content="[^"]*width=device-width[^"]*initial-scale=1/.test(html), 'viewport meta: without it phones lay the page out 980 px wide and shrink it');
  assert.ok(/<title>agent 引擎是什么/.test(html));
  const scenes = html.match(/<section class="scene" data-title="[^"]+"/g) || [];
  assert.strictEqual(scenes.length, C.SCENES, 'six scenes, got ' + scenes.length);
  assert.ok(html.indexOf('src/core.js') > 0 && html.indexOf('src/core.js') < html.indexOf('src/view.js'), 'core.js loads before view.js');
  for (const id of ['steps', 'play', 'prev', 'next', 'chat', 'ring', 'msgs', 'cards', 'lifeflow', 'verdict', 'world', 'retell']) assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  assert.strictEqual((html.match(/class="fc"/g) || []).length, 8, 'eight failure cards');
});

// ---------- pacing, measured on the real text ----------
function sceneChars(html) {
  const parts = html.split('<section class="scene"').slice(1).map((p) => p.split('</section>')[0]);
  return parts.map((p) => p.replace(/<div class="fix">[\s\S]*?<span class="tap">[^<]*<\/span><\/div>/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, '').length);
}
test('spec 8.6 autoplay pacing: each scene stays 12-40 s, the whole tour 90-240 s, measured on the real text', () => {
  const html = read(path.join(ROOT, 'index.html'));
  const chars = sceneChars(html);
  assert.strictEqual(chars.length, 6);
  // text that scripts add to a scene: chat bubbles, the messages[] list, the gate's verdicts, the world and the retelling
  const loop = C.runLoop({}), life = C.runLife(), chat = C.apiOnly(C.scriptedModel, C.demoMessages());
  const extra = [
    0,
    chat.messages[1].content.length + chat.last.content.length + 120 + 10 + 4,
    loop.messages.reduce((n, m) => { const f = C.formatMessage(m); return n + f.label.length + f.text.length + (f.note || '').length; }, 0),
    0, 0,
    life.steps.reduce((n, s) => n + s.verdict.note.length + 2, 0) + C.formatWorld(life.world).replace(/\s/g, '').length * 2 + life.retell.length,
  ];
  const anim = [1400, 3700, 300 + loop.events.length * C.LOOP_EVENT_MS, 600, 600, 6300];
  const dwell = chars.map((c, i) => C.dwellMs(c + extra[i], anim[i]));
  dwell.forEach((d, i) => assert.ok(d >= 12000 && d <= 40000, 'spec 8.6: scene ' + (i + 1) + ' stays ' + d / 1000 + ' s'));
  const total = dwell.reduce((a, b) => a + b, 0) / 1000;
  assert.ok(total >= 90 && total <= 240, 'spec 8.6: the autoplay tour takes ' + total + ' s, spec says 90-240');
  // no scene may carry so much text that even the 40 s cap leaves less than half the time it takes to read it
  chars.forEach((c, i) => assert.ok((c + extra[i]) / C.READ_CPS <= 2 * C.DWELL_MAX / 1000, 'spec 8.6: scene ' + (i + 1) + ' has ' + (c + extra[i]) + ' characters, too much for the autoplay cap'));
});

// ---------- colour contrast, read from the stylesheet ----------
function vars(block) { const o = {}; for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) o[m[1]] = m[2]; return o; }
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('spec 8.8 colour contrast: every text colour reaches 4.5:1 on each background it is drawn on, in both themes', () => {
  const css = read(path.join(ROOT, 'src', 'style.css'));
  const light = vars(/:root\s*\{([^}]*)\}/.exec(css)[1]);
  const darkBlock = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  assert.ok(darkBlock, 'the stylesheet must define a dark theme');
  const dark = Object.assign({}, light, vars(darkBlock[1]));
  // foreground colour on the backgrounds it actually sits on (read off the rules in style.css)
  const PAIRS = [
    ['ink', ['paper', 'card', 'line2', 'model-soft', 'engine-soft', 'tool-soft', 'gate-soft']],
    ['ink2', ['paper', 'card', 'line2', 'engine-soft', 'model-soft', 'tool-soft', 'gate-soft']],
    ['mute', ['paper', 'card', 'model-soft', 'tool-soft', 'gate-soft']],
    ['model', ['model-soft']], ['engine', ['engine-soft', 'paper', 'card']], ['tool', ['tool-soft']], ['harness', ['harness-soft']], ['gate', ['gate-soft', 'card']],
    ['bad', ['paper', 'card', 'gate-soft']], ['ok', ['card', 'gate-soft']],
  ];
  const fails = [];
  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    for (const [fg, bgs] of PAIRS) for (const bg of bgs) {
      assert.ok(theme[fg] && theme[bg], 'colour variable missing: ' + fg + ' or ' + bg);
      const r = ratio(theme[fg], theme[bg]);
      if (r < 4.5) fails.push(name + ' ' + fg + ' ' + theme[fg] + ' on ' + bg + ' ' + theme[bg] + ' = ' + r.toFixed(2));
    }
  }
  assert.deepStrictEqual(fails, [], 'spec 8.8: text below 4.5:1\n  ' + fails.join('\n  '));
});
