// 机位与构图（SPEC 验收 6、7）：六种视口 × 三个机位，用页面同一份纯数学（src/framing.js）算机位，
// 再用独立的投影把四个轮子的外缘、啮合点投到屏幕上，检查都在「顶栏与底栏之间」的安全区里。
// 顶栏底栏的高度取自浏览器检查里实测的值（tools/browser-check.cjs 会在真实页面上再核一遍）。
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/framing.js');
const M = require('../src/gear-mesh.js');
const path = require('path');
const { pathToFileURL } = require('url');
const THREE_P = import(pathToFileURL(path.join(__dirname, '..', 'vendor', 'three.module.js')).href);
const P = M.PARAMS;

// [宽, 高, 顶栏占的高度, 底栏占的高度]
const VIEWPORTS = [
  [1280, 720, 59, 55],
  [1920, 1080, 59, 55],
  [390, 844, 84, 130],
  [844, 390, 43, 43],
  [720, 800, 84, 130],
  [540, 960, 84, 130],
];

for (const [W, H, top, bottom] of VIEWPORTS) {
  test(`验收 6 全景：${W}×${H}，四个轮子的外缘整个在安全区里（离边缘至少 8 px），中心都在画面内`, () => {
    const pose = F.poseFor('hero', { W, H, top, bottom, pad: 22, P });
    assert.ok(pose.fitted, '拉到 600 个单位远还装不下');
    const rot = pose.rigRotation;
    assert.equal(rot, F.isPortrait(W, H) ? Math.PI / 2 : 0, '竖屏应整组转 90°');
    for (const [k, pts] of Object.entries(F.gearOutlinePoints(P))) {
      for (const p of pts) {
        const q = F.project(F.rigToWorld(p, rot), pose, W, H);
        assert.ok(q.x >= 8 && q.x <= W - 8, `${k} 外缘横向出画：x=${q.x.toFixed(1)} 画面宽 ${W}`);
        assert.ok(q.y >= top + 8 && q.y <= H - bottom - 8, `${k} 外缘压到顶栏或底栏：y=${q.y.toFixed(1)}，安全区 ${top}–${H - bottom}`);
      }
    }
    for (const [k, c] of Object.entries(F.gearCenters(P))) {
      const q = F.project(F.rigToWorld(c, rot), pose, W, H);
      assert.ok(q.x > 0 && q.x < W && q.y > top && q.y < H - bottom, `${k} 的中心不在画面内：(${q.x.toFixed(1)}, ${q.y.toFixed(1)})`);
    }
  });

  for (const view of ['mesh', 'mesh-cd']) {
    test(`验收 7 特写 ${view}：${W}×${H}，啮合点在安全区正中附近，周围 11×11 个单位都在安全区里`, () => {
      const pose = F.poseFor(view, { W, H, top, bottom, pad: 22, P });
      const rot = pose.rigRotation;
      const c = view === 'mesh' ? [-P.bx + P.rA, 0, -P.zL + P.depth / 2] : [P.rC, 0, P.zL + P.depth / 2];
      const q = F.project(F.rigToWorld(c, rot), pose, W, H);
      assert.ok(Math.abs(q.x - W / 2) < 40 && Math.abs(q.y - (top + (H - bottom)) / 2) < 40, `啮合点没在安全区中央：(${q.x.toFixed(1)}, ${q.y.toFixed(1)})`);
      for (const [dx, dy] of [[-5.5, -5.5], [5.5, -5.5], [5.5, 5.5], [-5.5, 5.5]]) {
        const e = F.project(F.rigToWorld([c[0] + dx, c[1] + dy, c[2]], rot), pose, W, H);
        assert.ok(e.x >= 0 && e.x <= W && e.y >= top && e.y <= H - bottom, `特写范围角点出安全区：(${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
      }
    });
  }
}

test('验收 6 校准：dsh 原版页面的机位与布局（A 在原点、镜头 (28,9,58) 看 (19,0,0)、不转竖屏）在 393×852 下 A 出画', () => {
  // 原版布局：A 在 x=0，B 在 bx，C 与 B 同轴，D 在 2·bx
  const pose = { position: [28, 9, 58], target: [19, 0, 0], offsetY: 0 };
  const W = 393, H = 852;
  const A = F.project([0, 0, -P.zL], pose, W, H);
  assert.ok(A.x < 0 || A.x > W, `这条检查应当抓到 A 出画，实测 A 的中心在 x=${A.x.toFixed(1)}（画面宽 ${W}）`);
  // 同一个检查对新机位必须通过
  const hero = F.poseFor('hero', { W, H, top: 84, bottom: 130, pad: 22, P });
  const a = F.project(F.rigToWorld([-P.bx, 0, -P.zL], hero.rigRotation), hero, W, H);
  assert.ok(a.x > 0 && a.x < W && a.y > 84 && a.y < H - 130, `新机位下 A 应在画面内：(${a.x.toFixed(1)}, ${a.y.toFixed(1)})`);
});

test('验收 6 framing.project 与 THREE 相机的投影一致（含 viewOffset），误差 < 0.5 px', async () => {
  // 上面的构图测试用的是 framing.js 自己的投影；这里拿 three.js 真实的相机对一遍，防止两边各错各的。
  const THREE = await THREE_P;
  for (const [W, H, top, bottom] of VIEWPORTS) for (const view of F.VIEWS) {
    const pose = F.poseFor(view, { W, H, top, bottom, pad: 22, P });
    const cam = new THREE.PerspectiveCamera(F.FOV, W / H, 0.1, 500);
    cam.position.set(...pose.position);
    cam.lookAt(new THREE.Vector3(...pose.target));
    if (Math.abs(pose.offsetY) > 0.5) cam.setViewOffset(W, H, 0, -pose.offsetY, W, H);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const rot = pose.rigRotation;
    for (const p of [[-P.bx, 0, -P.zL], [0, 0, P.zL], [P.bx + 3, 4, 0], [-P.bx + P.rA, 0.5, -0.3]]) {
      const w = F.rigToWorld(p, rot), q = F.project(w, pose, W, H);
      const v = new THREE.Vector3(...w).project(cam);
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      assert.ok(Math.hypot(sx - q.x, sy - q.y) < 0.5, `${W}×${H} ${view}: THREE 投影 (${sx.toFixed(2)}, ${sy.toFixed(2)}) 与 framing (${q.x.toFixed(2)}, ${q.y.toFixed(2)}) 不一致`);
    }
  }
});
