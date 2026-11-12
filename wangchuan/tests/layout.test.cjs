// 规格里能算出来的几条，写成断言。跑法：node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../layout.js');

// 竖屏手机、平板、横屏电脑、超宽屏
const ASPECTS = [9 / 19.5, 9 / 16, 3 / 4, 4 / 3, 16 / 9, 21 / 9];

test('开场第一眼就看得见苔上的返照（留 2 秒也有 2 秒的收获）', () => {
  for (const a of ASPECTS) {
    const cam = L.startCam(a);
    const pos = (L.LIGHT_X - cam) / a; // 返照在屏幕横向的位置，0 是最左，1 是最右
    assert.ok(pos > 0.25 && pos < 0.8, `宽高比 ${a.toFixed(2)}：开场时返照落在屏幕横向 ${pos.toFixed(2)}，应在 0.25–0.8 之间`);
  }
});

test('开场不露出画心之外的东西', () => {
  for (const a of ASPECTS.filter((x) => x < L.R)) {
    const cam = L.startCam(a);
    assert.ok(cam >= 0 && cam + a <= L.R + 1e-9, `宽高比 ${a.toFixed(2)}：开场视野 [${cam.toFixed(2)}, ${(cam + a).toFixed(2)}] 超出画心 [0, ${L.R.toFixed(2)}]`);
  }
});

test('卷到头时题诗居中，屏幕够宽就整首都在屏内', () => {
  for (const a of ASPECTS) {
    const cam = L.endCam(a);
    assert.ok(Math.abs(cam + a / 2 - L.POEM_X) < 1e-9, `宽高比 ${a.toFixed(2)}：卷尾时题诗没有居中`);
    assert.ok(cam < L.startCam(a), `宽高比 ${a.toFixed(2)}：卷尾位置应在开场位置的左边`);
    if (a >= L.POEM_W + 0.04) {
      assert.ok(L.POEM_X - L.POEM_W / 2 >= cam && L.POEM_X + L.POEM_W / 2 <= cam + a, `宽高比 ${a.toFixed(2)}：题诗有一部分在屏幕外`);
    }
  }
});

test('最窄的竖屏手机也装得下整首题诗', () => {
  assert.ok(L.POEM_W + 0.04 <= 9 / 19.5, `题诗宽 ${L.POEM_W.toFixed(3)} 屏高，9:19.5 的手机只有 ${(9 / 19.5).toFixed(3)} 屏高宽`);
});

test('题诗不压在画心上（唐画画面上不题诗，诗在卷尾素纸）', () => {
  assert.ok(L.POEM_X + L.POEM_W / 2 < -L.MOUNT, '题诗右缘越过了隔水，压到画心一侧');
});

test('题诗图的尺寸和 layout 里写的一致', () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'poem.png'));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.ok(Math.abs(w / h - L.POEM_W / L.POEM_H) < 1e-3, `poem.png 是 ${w}×${h}，layout 按 ${(L.POEM_W / L.POEM_H).toFixed(3)} 算`);
});

test('页面上没有解说文字：除了卷尾的署名说明、声音提示和开关，不出现别的字', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const body = html.slice(html.indexOf('<body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '\n');
  const lines = body.split('\n').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(lines, ['辋川卧游 · 鹿柴', '画与字皆为 AI 依盛唐青绿、盛唐小楷之法新作，并非古迹。', '轻触有声', '声']);
});
