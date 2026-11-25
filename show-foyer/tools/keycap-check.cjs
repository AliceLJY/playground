// 按钮键帽验收（2026-11-25）：五级按钮 × 五种状态（默认 / 悬停 / 按下 / 键盘焦点 / 禁用），手机 390×664 与桌面 1365×900 各截一张拼图，
// 外加各覆盖层的整屏图；同时量：触屏按钮 ≥44、不出屏、不互相重叠、各态之间布局不动、有填充三级的阴影列表三态结构一致、
// 过渡 120–160ms、系统「减少动态效果」下没有位移、Tab 能把焦点送到按钮且焦点环可见、Enter / 空格能触发、禁用按钮点了不触发。
//   在仓库根起本地服务后：NODE_PATH="$(npm root -g)" node show-foyer/tools/keycap-check.cjs <page-url> <out-dir>
// 读法：report.json 里每项 pass 为 true 才算过；sheet-*.png 是拼图（行 = 五级，列 = 五态），scene-*.png 是整屏。
// 禁用态：底栏「鼓掌」在门口是真禁用，节目单首页「上一页」、末页「清场」（没有来访记录时）是真禁用；
// 白色次、浅灰弱、ghost「合影」、链接「锣」平时不会禁用，截外观时临时加上 disabled 属性、截完去掉，report 里标 forced。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node show-foyer/tools/keycap-check.cjs <page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], samples: [] };
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'OK  ' : 'FAIL', name); };
const sep = url.includes('?') ? '&' : '?';
const STATES = ['default', 'hover', 'active', 'focus', 'disabled'];
const FILLED = ['primary', 'secondary', 'weak'];
// 每级一个代表按钮，以及到达它所需的画面
const LEVELS = [
  { level: 'primary', label: '深色主', sel: '#btnLamp', scene: 'seated' },
  { level: 'secondary', label: '白色次', sel: '#gongOverlay [data-close]', scene: 'gong' },
  { level: 'weak', label: '浅灰弱', sel: '#giftStart', scene: 'programme-1' },
  { level: 'ghost', label: 'ghost', sel: '#btnPhoto', scene: 'seated' },
  { level: 'link', label: '文字链接', sel: '#gongBtn', scene: 'seated' },
];
const VPS = [
  { tag: 'phone-390x664', width: 390, height: 664, dpr: 2, hasTouch: true },
  { tag: 'desktop-1365x900', width: 1365, height: 900, dpr: 1, hasTouch: false },
];
// 把 box-shadow 拆成逐项的「内 / 外」类型
function shadowKinds(v) {
  if (!v || v === 'none') return [];
  const parts = []; let depth = 0, cur = '';
  for (const ch of v) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  return parts.map(s => (/\binset\b/.test(s) ? 'inset' : 'outer'));
}

async function openPage(browser, vp, reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: vp.hasTouch, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto(`${url}${sep}view=first&t=6&mute=1`);
  await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
  await p.waitForTimeout(200);
  return { ctx, p, errors };
}
async function toScene(p, scene) {
  await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  const phase = await p.evaluate(() => __foyer.snapshot().phase);
  if (scene !== 'door' && phase === 'door') { await p.click('#btnSit'); await p.waitForTimeout(150); }
  if (scene === 'gong') await p.evaluate(() => __foyer.gong());
  if (scene === 'programme-1') await p.evaluate(() => __foyer.openProgramme(0));
  if (scene === 'programme-5') await p.evaluate(() => __foyer.openProgramme(4));
  await p.waitForTimeout(250);
}
// 所有可见按钮的版面位置（offset* 不含 transform，用来判断「挤没挤动邻居」）和屏幕位置（含 transform，用来判断出屏和重叠）
const layoutOf = p => p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden').map(b => {
  const r = b.getBoundingClientRect();
  return { id: b.id || b.dataset.close || b.textContent.trim(), ox: b.offsetLeft, oy: b.offsetTop, ow: b.offsetWidth, oh: b.offsetHeight, x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom, enabled: !b.disabled, inBook: !!b.closest('.book') };
}));
const styleOf = (p, sel) => p.locator(sel).first().evaluate(el => {
  const cs = getComputedStyle(el);
  return { boxShadow: cs.boxShadow, transform: cs.transform, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, transitionDuration: cs.transitionDuration, bg: cs.backgroundColor, color: cs.color, focusVisible: el.matches(':focus-visible'), active: el.matches(':active'), hover: el.matches(':hover') };
});
function sameLayout(a, b) { return a.length === b.length && a.every((r, i) => r.id === b[i].id && r.ox === b[i].ox && r.oy === b[i].oy && r.ow === b[i].ow && r.oh === b[i].oh); }
async function clipShot(p, sel, file, vp) {
  const box = await p.locator(sel).first().boundingBox();
  const pad = 16, x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  const clip = { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height: Math.min(vp.height - y, box.height + pad * 2) };
  await p.screenshot({ path: file, clip });
  return file;
}
async function tabTo(p, sel) {
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press('Tab');
    if (await p.locator(sel).first().evaluate(el => document.activeElement === el)) return i + 1;
  }
  return 0;
}

(async () => {
  const browser = await chromium.launch();
  report.browser = browser.version();
  for (const vp of VPS) {
    const { ctx, p, errors } = await openPage(browser, vp, false);
    const files = {};
    // 门口：底栏「鼓掌」真禁用，点了不触发
    await toScene(p, 'door');
    {
      const claps = await p.evaluate(() => __foyer.snapshot().claps);
      const box = await p.locator('#btnClap').boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(150);
      check(`${vp.tag} 门口「鼓掌」禁用：点了不触发`, await p.locator('#btnClap').isDisabled() && (await p.evaluate(() => __foyer.snapshot().claps)) === claps);
      files['primary-disabled'] = await clipShot(p, '#btnClap', path.join(out, `${vp.tag}-primary-disabled.png`), vp);
      report.samples.push({ vp: vp.tag, level: 'primary', state: 'disabled', sel: '#btnClap', forced: false, style: await styleOf(p, '#btnClap') });
    }
    for (const L of LEVELS) {
      await toScene(p, L.scene);
      const loc = p.locator(L.sel).first();
      check(`${vp.tag} ${L.label}：代表按钮可见`, await loc.isVisible(), L.sel);
      const base = await layoutOf(p), st = {};
      for (const state of STATES) {
        if (state === 'disabled' && L.level === 'primary') continue;
        await p.mouse.move(1, 1);
        await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        let forced = false, tabs = null;
        if (state === 'hover') await loc.hover();
        if (state === 'active') { const b = await loc.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); }
        if (state === 'focus') tabs = await tabTo(p, L.sel);
        if (state === 'disabled') { forced = await loc.evaluate(el => { if (el.disabled) return false; el.disabled = true; return true; }); }
        await p.waitForTimeout(260); // 过渡 140ms，等它走完
        st[state] = await styleOf(p, L.sel);
        files[`${L.level}-${state}`] = await clipShot(p, L.sel, path.join(out, `${vp.tag}-${L.level}-${state}.png`), vp);
        const after = await layoutOf(p);
        check(`${vp.tag} ${L.label} ${state}：其他按钮版面不动`, sameLayout(base, after));
        if (state === 'active') { await p.mouse.move(1, 1); await p.mouse.up(); } // 在别处松开，不触发点击
        if (state === 'focus') check(`${vp.tag} ${L.label}：Tab ${tabs} 次到达，焦点环可见`, tabs > 0 && st.focus.focusVisible && /solid 2px/.test(st.focus.outline), st.focus.outline);
        if (forced) await loc.evaluate(el => { el.disabled = false; });
        report.samples.push({ vp: vp.tag, level: L.level, state, sel: L.sel, forced, tabs, style: st[state] });
      }
      if (FILLED.includes(L.level)) {
        const k = ['default', 'hover', 'active'].map(s => shadowKinds(st[s].boxShadow).join(','));
        check(`${vp.tag} ${L.label}：默认 / 悬停 / 按下阴影列表结构一致（内,内,外,外）`, k.every(x => x === 'inset,inset,outer,outer'), k);
      }
      check(`${vp.tag} ${L.label}：过渡 120–160ms`, st.default.transitionDuration.split(',').map(s => parseFloat(s)).every(s => s >= 0.12 && s <= 0.16), st.default.transitionDuration);
      if (!vp.hasTouch) check(`${vp.tag} ${L.label}：悬停 / 按下有位移`, st.hover.transform !== st.default.transform || L.level === 'ghost' || L.level === 'link', [st.hover.transform, st.active.transform]);
    }
    // 各画面：所有可见按钮 ≥44、不出屏、不重叠
    for (const scene of ['door', 'seated', 'programme-1', 'programme-5', 'gong']) {
      await toScene(p, scene);
      await p.screenshot({ path: path.join(out, `${vp.tag}-scene-${scene}.png`) });
      const rows = await layoutOf(p);
      const outside = rows.filter(r => r.x < -0.5 || r.y < -0.5 || r.right > vp.width + 0.5 || r.bottom > vp.height + 0.5);
      const small = rows.filter(r => r.w < 44 || r.h < 44);
      const overlaps = [];
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) overlaps.push([a.id, b.id]);
      }
      // 覆盖层打开时底栏仍在 DOM 里，只算同一层的按钮
      const layer = scene.startsWith('programme') ? rows.filter(r => r.inBook) : scene === 'gong' ? rows.filter(r => r.id === 'gongOverlay') : rows;
      const layerOverlaps = overlaps.filter(([a, b]) => layer.some(r => r.id === a) && layer.some(r => r.id === b));
      check(`${vp.tag} ${scene}：按钮不出屏`, outside.length === 0, outside.map(r => r.id));
      check(`${vp.tag} ${scene}：按钮 ≥44×44`, small.length === 0, small.map(r => [r.id, r.w, r.h]));
      check(`${vp.tag} ${scene}：同层按钮不重叠`, layerOverlaps.length === 0, layerOverlaps);
    }
    // 键盘：节目单里 Tab 到「下一页」按 Enter 翻页，Tab 到声音开关按空格切换
    await toScene(p, 'programme-1');
    {
      await tabTo(p, '#progNext'); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
      const pg = await p.evaluate(() => __foyer.snapshot().programmePage);
      check(`${vp.tag} Enter 触发「下一页」`, pg === 1, pg);
      const before = await p.locator('#soundBtn').textContent();
      await tabTo(p, '#soundBtn'); await p.keyboard.press('Space'); await p.waitForTimeout(120);
      const afterText = await p.locator('#soundBtn').textContent();
      check(`${vp.tag} 空格触发声音开关`, before !== afterText, [before, afterText]);
      await p.keyboard.press('Space'); await p.waitForTimeout(80);
      await p.evaluate(() => __foyer.openProgramme(0));
      const prevPage = await p.evaluate(() => __foyer.snapshot().programmePage);
      const box = await p.locator('#progPrev').boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(120);
      check(`${vp.tag} 首页「上一页」禁用：点了不翻`, await p.locator('#progPrev').isDisabled() && (await p.evaluate(() => __foyer.snapshot().programmePage)) === prevPage);
    }
    check(`${vp.tag} 页面零报错`, errors.length === 0, errors);
    // 拼图：行 = 五级，列 = 五态
    const sheet = await ctx.newPage();
    const cell = f => f ? `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">` : '<span>—</span>';
    const rowsHtml = LEVELS.map(L => `<tr><th>${L.label}<small>${L.sel}</small></th>${STATES.map(s => `<td>${cell(files[`${L.level}-${s}`])}</td>`).join('')}</tr>`).join('');
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#0b0806;color:#d8ccb8;font:13px -apple-system,"PingFang SC","Noto Sans SC",sans-serif}table{border-collapse:collapse}th,td{padding:8px;border:1px solid #2a2220;vertical-align:middle;text-align:center}th small{display:block;color:#7d6f5d;font-weight:400;margin-top:4px}img{display:block;margin:auto;max-width:260px;height:auto}</style><h3 style="margin:0 0 10px">${vp.tag} · 真浏览器截图（${report.browser}）</h3><table><tr><th></th>${STATES.map(s => `<th>${s}</th>`).join('')}</tr>${rowsHtml}</table>`);
    await sheet.screenshot({ path: path.join(out, `sheet-${vp.tag}.png`), fullPage: true });
    await ctx.close();
    // 减少动态效果：悬停、按下都不位移
    const rm = await openPage(browser, vp, true);
    await toScene(rm.p, 'seated');
    await rm.p.locator('#btnLamp').hover(); await rm.p.waitForTimeout(260);
    const t1 = (await styleOf(rm.p, '#btnLamp')).transform;
    const b = await rm.p.locator('#btnLamp').boundingBox(); await rm.p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await rm.p.mouse.down(); await rm.p.waitForTimeout(260);
    const t2 = (await styleOf(rm.p, '#btnLamp')).transform;
    await rm.p.mouse.move(1, 1); await rm.p.mouse.up();
    const still = t => t === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t);
    check(`${vp.tag} 减少动态效果：悬停 / 按下无位移`, still(t1) && still(t2), [t1, t2]);
    await rm.ctx.close();
  }
  await browser.close();
  report.pass = report.checks.every(c => c.pass);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(report.pass ? '全部通过' : `${report.checks.filter(c => !c.pass).length} 项没过`);
  process.exit(report.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
