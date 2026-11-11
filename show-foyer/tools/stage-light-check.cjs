// 分区亮台、暖光锥、总光渐亮分别验；真实 Canvas 像素，逻辑坐标由页面回报。
// NODE_PATH="$(npm root -g)" node tools/stage-light-check.cjs <page-url> <out-dir>
const fs = require('node:fs'), path = require('node:path');
const ZONES = ['curtainLeft', 'curtainMiddle', 'curtainRight', 'boards', 'frameLeft', 'frameRight'];
const FRAMES = ['frameLeft', 'frameRight']; // 光锥裁剪区之外，不受灯笼/光锥 0.6 秒淡入影响
const TIMES = [0, 120, 600, 1000, 2000, 3000];
const VIEWPORTS = [['desktop-1440x810', 1440, 810, 1, false], ['desktop-1440x1080', 1440, 1080, 1, false], ['iphone-390x664', 390, 664, 2, true]];

function sampleRegions(g) {
  const inset = (b, x0, x1, y0, y1) => ({ x: b.x + b.width * x0, y: b.y + b.height * y0, width: b.width * (x1 - x0), height: b.height * (y1 - y0) });
  const c = g.curtain, regions = {};
  for (const [i, name] of ['curtainLeft', 'curtainMiddle', 'curtainRight'].entries()) regions[name] = inset(c, (i + 0.12) / 3, (i + 0.88) / 3, 0.32, 0.68);
  regions.boards = inset(g.boards, 0.15, 0.85, 0.12, 0.48);
  for (const [side, name] of [['left', 'frameLeft'], ['right', 'frameRight']]) {
    regions[name] = inset(g.frame[side], 0.2, 0.8, 0.35 * c.height / g.frame[side].height, 0.72 * c.height / g.frame[side].height);
  }
  // 同一高度、同样大小；在光锥与光斑边界间取框，避免只画光斑也能过。
  const lamp = g.firstLamp, y1 = c.y + c.height * 0.2;
  const poolReach = Math.sqrt(Math.max(0, lamp.poolRadius ** 2 - (lamp.poolY - y1) ** 2));
  const halfCone = lamp.spread + (lamp.baseHalfWidth - lamp.spread) * (y1 - lamp.top) / (lamp.baseY - lamp.top);
  const gap = halfCone - poolReach, width = gap * 0.3;
  if (!(gap > 2)) throw new Error('光锥与光斑之间没有足够的独立取样空间');
  for (const [name, x] of [['coneInside', lamp.x + poolReach + gap * 0.5], ['coneOutsideLeft', c.x + c.width * 0.25], ['coneOutsideRight', c.x + c.width * 0.75]]) {
    regions[name] = { x: x - width / 2, y: c.y + c.height * 0.18, width, height: c.height * 0.02 };
  }
  for (const [name, b] of Object.entries(regions)) {
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0 || b.x < g.stage.x || b.y < g.stage.y || b.x + b.width > g.stage.x + g.stage.width || b.y + b.height > g.stage.y + g.stage.height) throw new Error(`${name}: 取样框不在页面回报的舞台内`);
  }
  const seat = g.seats[0];
  regions.frontRow = { x: seat.x - seat.width * 0.22, y: seat.y + seat.height * 0.3, width: seat.width * 0.44, height: seat.height * 0.25 };
  return regions;
}

// 只接受实测序列；按首末读数归一化，既拦瞬间跳亮也拦过慢。
// Node 测试还把真实 tick() 的 lit 序列送进同一判据，不能代替浏览器像素验证。
function fadeChecks(values) {
  const span = values[3000] - values[0];
  const f = t => span > 0 ? (values[t] - values[0]) / span : NaN;
  return {
    early120: f(120) >= 0.1 && f(120) <= 0.4,
    middle600: f(600) >= 0.6 && f(600) <= 0.85,
    near1000: f(1000) >= 0.8 && f(1000) <= 0.96,
    settled2000: f(2000) >= 0.96 && f(2000) <= 1.04,
    ordered: values[0] < values[120] && values[120] < values[600] && values[600] < values[1000] && values[1000] <= values[2000] && values[2000] <= values[3000],
  };
}

// 此函数在页面内运行；直接读默认 Canvas，独立换算横纵像素比例，向内取整。
function readCanvas({ regions, canvas }) {
  const cv = document.getElementById('scene'), ctx = cv.getContext('2d');
  const kx = cv.width / canvas.width, ky = cv.height / canvas.height, samples = {}, pixelRects = {};
  for (const [name, b] of Object.entries(regions)) {
    const x = Math.ceil(b.x * kx), y = Math.ceil(b.y * ky), width = Math.floor((b.x + b.width) * kx) - x, height = Math.floor((b.y + b.height) * ky) - y;
    if (width < 1 || height < 1 || x < 0 || y < 0 || x + width > cv.width || y + height > cv.height) throw new Error(`${name}: 无有效像素或取样出界`);
    const d = ctx.getImageData(x, y, width, height).data, rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) rgb[j] += d[i + j];
    const [r, g, blue] = rgb.map(v => v / (d.length / 4));
    samples[name] = { luma: 0.2126 * r + 0.7152 * g + 0.0722 * blue, warmth: r - blue, rgb: [r, g, blue], pixels: d.length / 4 };
    pixelRects[name] = { x, y, width, height };
  }
  return { samples, pixelRects, canvasPixels: { width: cv.width, height: cv.height }, scale: { x: kx, y: ky } };
}

async function main(url, out) {
  if (!url || !out) throw new Error('用法：node tools/stage-light-check.cjs <page-url> <out-dir>');
  const { chromium } = require('playwright');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(), reports = [];
  try {
    for (const [tag, w, h, dpr, touch] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch });
      try {
        const page = await context.newPage(), errors = [], checks = {};
        let sampling;
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => m.type() === 'error' && errors.push(m.text()));
        const u = new URL(url);
        for (const [key, value] of Object.entries({ view: 'first', t: '6', mute: '1', seed: '11' })) u.searchParams.set(key, value);
        await page.goto(u.href);
        await page.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
        const geometry = await page.evaluate(() => __foyer.geometry), regions = sampleRegions(geometry);
        const sample = async label => {
          const reading = await page.evaluate(readCanvas, { regions, canvas: geometry.canvas });
          sampling = { pixelRects: reading.pixelRects, canvasPixels: reading.canvasPixels, scale: reading.scale };
          await page.screenshot({ path: path.join(out, `${tag}-${label}.png`) });
          // 仓外另存取样框叠图，不在游戏画布上画诊断层。
          const overlay = await page.evaluate(({ pixelRects }) => {
            const source = document.getElementById('scene'), cv = document.createElement('canvas');
            cv.width = source.width; cv.height = source.height;
            const ctx = cv.getContext('2d'); ctx.drawImage(source, 0, 0); ctx.lineWidth = 1; ctx.font = '12px monospace';
            for (const [name, b] of Object.entries(pixelRects)) { ctx.strokeStyle = ctx.fillStyle = name.startsWith('cone') ? '#00ffff' : '#00ff70'; ctx.strokeRect(b.x, b.y, b.width, b.height); ctx.fillText(name, b.x, Math.max(12, b.y - 3)); }
            return cv.toDataURL('image/png').split(',')[1];
          }, reading);
          fs.writeFileSync(path.join(out, `${tag}-${label}-regions.png`), Buffer.from(overlay, 'base64'));
          return reading.samples;
        };
        const state = () => page.evaluate(() => ({ ...__foyer.snapshot(), lit: __foyer.state.lit }));
        // 每档先走真实按钮：至少一遍触控/鼠标输入，不只靠状态钩子。
        if (touch) await page.tap('#btnSit'); else await page.click('#btnSit');
        await page.evaluate(() => __foyer.step(0));
        checks.seated = (await state()).phase === 'seated';
        const read = { 0: await sample('lamps0') }, transition = { 0: read[0] };
        if (touch) await page.tap('#btnLamp'); else await page.click('#btnLamp');
        for (let i = 1; i < TIMES.length; i++) {
          await page.evaluate(ms => __foyer.step(ms), TIMES[i] - TIMES[i - 1]);
          transition[TIMES[i]] = await sample(`fade-${TIMES[i]}ms`);
        }
        read[1] = transition[3000];
        checks.firstLamp = (await state()).lamps === 1;
        // 唯一隔离项：在同一时刻暂藏灯笼数组，总光 lit 不动、时间不走。
        // 两次真实渲染相减，消掉幕褶/材质和暖色总光；finally 恢复原灯笼。
        const beforeCone = await state();
        const lamps = await page.evaluate(() => { const lamps = __foyer.state.lamps; __foyer.state.lamps = []; __foyer.step(0); return lamps; });
        let reference, referenceState;
        try { reference = await sample('cone-reference'); referenceState = await state(); }
        finally { await page.evaluate(lamps => { __foyer.state.lamps = lamps; __foyer.step(0); }, lamps); }
        const withCone = await sample('cone-lit'), afterCone = await state();
        checks.coneIsolation = referenceState.lamps === 0 && afterCone.lamps === 1 && beforeCone.t === referenceState.t && beforeCone.t === afterCone.t && beforeCone.lit === referenceState.lit && beforeCone.lit === afterCone.lit;
        for (const name of FRAMES) checks[`coneIsolation.${name}`] = Math.abs(withCone[name].luma - reference[name].luma) <= 0.05;
        const cone = {};
        for (const outside of ['coneOutsideLeft', 'coneOutsideRight']) {
          const excess = metric => (withCone.coneInside[metric] - reference.coneInside[metric]) - (withCone[outside][metric] - reference[outside][metric]);
          cone[outside] = { luma: excess('luma'), warmth: excess('warmth') };
          checks[`cone.${outside}.luma`] = cone[outside].luma >= 4;
          checks[`cone.${outside}.warmth`] = cone[outside].warmth >= 3;
        }
        for (const n of [3, 5]) {
          for (let i = (await state()).lamps; i < n; i++) await page.evaluate(() => __foyer.act(1));
          await page.evaluate(() => __foyer.step(3000));
          checks[`lamps${n}`] = (await state()).lamps === n;
          read[n] = await sample(`lamps${n}`);
        }
        for (const zone of ZONES) {
          const values = [0, 1, 3, 5].map(n => read[n][zone].luma);
          checks[`wholeStage.${zone}.eachStep`] = values.slice(1).every((v, i) => v - values[i] >= 3);
          checks[`wholeStage.${zone}.span`] = values[3] - values[0] >= 25;
        }
        const seatLight = [0, 1, 3, 5].map(n => read[n].frontRow.luma);
        checks.frontRowFollowsLamps = seatLight.slice(1).every((v, i) => v > seatLight[i]);
        checks.frontRowVisibleChange = seatLight[3] - seatLight[0] >= 3;
        const fade = {};
        for (const zone of FRAMES) {
          const values = Object.fromEntries(TIMES.map(t => [t, transition[t][zone].luma]));
          const span = values[3000] - values[0];
          fade[zone] = { values, fractions: Object.fromEntries(TIMES.map(t => [t, span > 0 ? (values[t] - values[0]) / span : null])) };
          checks[`totalFade.${zone}.visible`] = span >= 3;
          for (const [name, pass] of Object.entries(fadeChecks(values))) checks[`totalFade.${zone}.${name}`] = pass;
        }
        const actualGeometry = await page.evaluate(() => __foyer.geometry);
        checks.geometryStable = JSON.stringify(actualGeometry) === JSON.stringify(geometry);
        checks.noPageErrors = errors.length === 0;
        const failed = Object.keys(checks).filter(name => !checks[name]);
        const report = { tag, viewport: { width: w, height: h }, deviceScaleFactor: dpr, browser: browser.version(), geometry, regions, sampling, read, transition, fade, cone, coneReadings: { reference, withCone }, coneIsolation: { before: beforeCone, reference: referenceState, after: afterCone }, checks, failed, errors };
        reports.push(report);
        fs.writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(report, null, 2));
        console.log(`${failed.length ? 'FAIL' : 'ok  '} ${tag}: ${Object.keys(checks).length - failed.length}/${Object.keys(checks).length} checks${failed.length ? ' ← ' + failed.join(', ') : ''}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(reports, null, 2));
  const fail = reports.filter(r => r.failed.length).length;
  console.log(`stage-light-check: ${reports.length - fail} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

module.exports = { sampleRegions, fadeChecks };
if (require.main === module) main(...process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
