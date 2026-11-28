// 按钮键帽（2026-11-25）的静态检查：不开浏览器，只读 index.html 和 src/game.js 里的样式与按钮。
// 真浏览器里的五态截图、尺寸、重叠、键盘操作由 tools/keycap-check.cjs 负责。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
const MARK = '/* ===== 按钮：克制的实体键帽';
const block = style.slice(style.indexOf(MARK));
const before = style.slice(0, style.indexOf(MARK));

// 极简 CSS 解析：返回 { media, selector, decls }，@media 里的规则带上条件
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  (function walk(src, media) {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i); if (open < 0) break;
      const head = src.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < src.length) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      const body = src.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body, head);
      else {
        const decls = {};
        for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
        rules.push({ media, selector: head.replace(/\s+/g, ' '), decls });
      }
      i = j;
    }
  })(css, null);
  return rules;
}
const rules = parse(block);
// 顶层逗号拆分（:is(...) 里的逗号不拆）
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; }
function listOf(sel) {
  if (sel.startsWith(':is(')) {
    let d = 0, i = 3;
    for (; i < sel.length; i++) { if (sel[i] === '(') d++; if (sel[i] === ')' && --d === 0) break; }
    return { items: splitTop(sel.slice(4, i)), rest: sel.slice(i + 1) };
  }
  const rest = (sel.match(/(:[a-z-]+(\([^)]*\))?)+$/) || [''])[0];
  return { items: [sel.slice(0, sel.length - rest.length)], rest };
}

// 页面上全部按钮：index.html 的 + game.js 拼出来的
const buttons = [];
for (const m of (html.slice(html.indexOf('<body>')) + js).matchAll(/<button\b([^>]*)>/g)) {
  const a = m[1], attr = k => (a.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
  const b = { id: attr('id'), close: attr('data-close'), act: attr('data-act') };
  if (!buttons.some(x => x.id === b.id && x.close === b.close && x.act === b.act)) buttons.push(b); // giftStart 在两个分支里各拼一次，是同一个按钮
}
const name = b => b.id ? `#${b.id}` : b.close ? `[data-close=${b.close}]` : `[data-act=${b.act}]`;
const matches = (b, sel) => {
  if (sel === '.bottom button[data-act]') return b.act !== undefined;
  const m = sel.match(/^#([\w-]+) \[data-close\]$/); if (m) return b.close === m[1];
  return sel === `#${b.id}`;
};
const levelRules = {
  primary: rules.find(r => r.selector === '.bottom button[data-act]'),
  secondary: rules.find(r => !r.media && r.selector.startsWith(':is(#gongOverlay')),
  weak: rules.find(r => !r.media && r.selector.startsWith(':is(#curtainPhotoBtn')),
  ghost: rules.find(r => !r.media && r.selector.startsWith(':is(#btnPhoto') && !listOf(r.selector).rest),
  link: rules.find(r => !r.media && r.selector.startsWith(':is(#gongBtn') && !listOf(r.selector).rest),
};
const filled = rules.find(r => !r.media && r.selector.startsWith(':is(.bottom button[data-act]') && !listOf(r.selector).rest);

test('按钮总数与分级：每个按钮恰好归一级', () => {
  assert.equal(buttons.length, 23, `页面按钮应为 23 个，实际 ${buttons.length}`);
  for (const [lv, r] of Object.entries(levelRules)) assert.ok(r, `找不到 ${lv} 级的规则`);
  for (const b of buttons) {
    const hit = Object.entries(levelRules).filter(([, r]) => listOf(r.selector).items.some(s => matches(b, s))).map(([lv]) => lv);
    assert.equal(hit.length, 1, `${name(b)} 归到了 ${hit.length} 级：${hit.join('、')}`);
  }
});

test('有填充的三级共用一套材质，各级只换颜色变量', () => {
  assert.ok(filled, '找不到共用材质规则');
  const items = listOf(filled.selector).items;
  for (const lv of ['primary', 'secondary', 'weak']) for (const s of listOf(levelRules[lv].selector).items) assert.ok(items.includes(s), `${s} 没用共用材质`);
  for (const lv of ['primary', 'secondary', 'weak']) for (const k of Object.keys(levelRules[lv].decls)) assert.ok(k.startsWith('--k-'), `${lv} 级规则里出现了非变量声明 ${k}`);
  for (const k of ['background-image', 'border-color', 'box-shadow', 'transition']) assert.ok(filled.decls[k], `共用材质缺 ${k}`);
  assert.match(filled.decls['background-image'], /linear-gradient\(to bottom/, '要有上下微弱明度差');
});

test('阴影列表：默认 / 悬停 / 按下 / 禁用每个位置的内外类型一致（内,内,外,外）', () => {
  const kinds = v => splitTop(v).map(s => (/\binset\b/.test(s) ? 'inset' : 'outer')).join(',');
  const items = listOf(filled.selector).items.join(',');
  const stateRule = st => rules.find(r => r.selector.startsWith(':is(.bottom button[data-act]') && listOf(r.selector).items.join(',') === items && listOf(r.selector).rest === st);
  const states = { default: filled, hover: stateRule(':hover:not(:disabled)'), active: stateRule(':active:not(:disabled)'), disabled: stateRule(':disabled') };
  for (const [st, r] of Object.entries(states)) {
    assert.ok(r, `缺 ${st} 规则`);
    assert.equal(kinds(r.decls['box-shadow']), 'inset,inset,outer,outer', `${st} 的阴影列表结构不对：${r.decls['box-shadow']}`);
  }
  assert.equal(states.hover.media, '@media (hover: hover)', '悬停只在有指针悬停的设备上生效');
  assert.match(states.active.decls.transform, /var\(--k-down\)/, '按下要下沉');
  assert.match(states.hover.decls.transform, /var\(--k-up\)/, '悬停要抬升');
});

test('不做彩色发光和镜面高光：没有大模糊零偏移阴影、没有 text-shadow 和 filter', () => {
  for (const r of rules) {
    assert.ok(!('text-shadow' in r.decls) && !('filter' in r.decls), `${r.selector} 用了 text-shadow / filter`);
    const bs = r.decls['box-shadow']; if (!bs || bs === 'none') continue;
    for (const s of splitTop(bs)) {
      const nums = s.replace(/var\([^)]*\)|rgba?\([^)]*\)|transparent|inset/g, '').trim().split(/\s+/).map(parseFloat);
      assert.ok(nums.every(n => Math.abs(n) <= 6), `${r.selector} 的阴影 ${s} 不是短距离`);
    }
  }
});

test('五种状态五级都有：悬停、按下、焦点、禁用', () => {
  for (const lv of ['ghost', 'link']) {
    const items = listOf(levelRules[lv].selector).items.join(',');
    for (const st of [':hover:not(:disabled)', ':active:not(:disabled)', ':disabled']) assert.ok(rules.some(r => listOf(r.selector).items.join(',') === items && listOf(r.selector).rest === st), `${lv} 缺 ${st}`);
  }
  const focus = rules.find(r => r.selector.endsWith(':focus-visible'));
  assert.ok(focus, '缺 :focus-visible');
  for (const b of buttons) assert.ok(listOf(focus.selector).items.some(s => matches(b, s)), `${name(b)} 没有焦点样式`);
  assert.match(focus.decls.outline, /^2px solid var\(--k-focus\)$/, '焦点用 outline，不进阴影列表');
  assert.equal(focus.decls['z-index'], '1', '焦点环要压在邻键阴影上面');
  for (const r of rules.filter(r => /:hover/.test(r.selector))) assert.equal(r.media, '@media (hover: hover)', `${r.selector} 的悬停没包在 (hover: hover) 里`);
});

test('过渡 120–160ms；减少动态效果时位移归零；位移只用 transform', () => {
  const dur = block.match(/--k-dur:\s*(\d+)ms/); assert.ok(dur && +dur[1] >= 120 && +dur[1] <= 160, '过渡时长不在 120–160ms');
  for (const r of rules) if (r.decls.transition) for (const t of splitTop(r.decls.transition)) assert.match(t, /var\(--k-dur\)/, `${r.selector} 的过渡没用 --k-dur`);
  const rm = rules.find(r => r.media === '@media (prefers-reduced-motion: reduce)');
  assert.ok(rm && rm.decls['--k-up'] === '0px' && rm.decls['--k-down'] === '0px', '减少动态效果时要去掉位移');
  for (const r of rules) if (r.decls.transform) assert.match(r.decls.transform, /^translateY\((0|var\(--k-(up|down)\))\)$/, `${r.selector} 的位移不是受控的 translateY`);
});

test('只改外观：键帽样式里没有任何改尺寸、改位置、改显示的声明', () => {
  const layout = /^(width|height|min-|max-|padding|margin|border$|border-width|border-(top|right|bottom|left)$|font|letter-spacing|line-height|display|flex|grid|gap|top|left|right|bottom|inset|order|visibility|opacity|pointer-events|content)/;
  for (const r of rules) for (const k of Object.keys(r.decls)) assert.ok(!layout.test(k), `${r.selector} 改了 ${k}`);
  for (const r of rules) if (r.decls.position) assert.equal(r.decls.position, 'relative', 'position 只允许 relative（给焦点环 z-index 用）');
});

test('原有尺寸照旧：触屏按钮仍 ≥44，底栏高度不变', () => {
  const metric = [
    ['.top button.info', /width: 44px; height: 44px;/], ['.top button.gongbtn', /min-width: 44px; min-height: 44px;/],
    ['.bottom button {', /min-height: 46px; padding: 6px 4px; border: 1px solid;/], ['.overlay .close', /min-width: 44px; min-height: 44px;[^}]*padding: 8px 22px;/],
    ['.book .nav button', /min-width: 44px; min-height: 44px;/], ['#giftSkip', /min-width:44px; min-height:44px;/],
  ];
  for (const [sel, re] of metric) {
    const at = before.indexOf(sel); assert.ok(at >= 0, `找不到 ${sel}`);
    assert.match(before.slice(at, before.indexOf('}', at)), re, `${sel} 的尺寸变了`);
  }
  assert.ok(!/style="[^"]*(color|border|background)/.test(html.slice(html.indexOf('<body>'))), '按钮上不再留内联颜色');
});
