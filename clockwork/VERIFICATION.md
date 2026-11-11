# 2026-11-03 B5 回归

范围：报告「值得改的」1、2。没有更改齿数、齿比、几何或默认 60x 倍率；未添加预测或发条玩法。three 保持内置 r160，无构建步骤。

`tools/browser-check.cjs` 先在旧代码上运行：16 项中 11 项失败（四视口缺少暂停/单步、按钮只有 31 px，三种触屏视口仍显示鼠标提示）。修后 36/36 通过：逐个读取实际轴角，验证全部齿轮和摆轮暂停、每次推进 0.25 秒、保持 180x 选择、恢复播放，以及暂停期间相机仍能拖动。探针仅在 `?debug=1` 出现，正常入口不依赖它。

环境：本地 HTTP、Playwright 驱动 Chrome 156.0.8078.80；Apple M4 Metal，非 SwiftShader。390×664、320×568、844×340 触屏模拟 / DPR 2；1365×900 / DPR 1。正常默认渲染路径，未锁画质；页面错误均为 0。截图见验收输出 `clockwork-before/`、`clockwork-after/`。

```sh
# 从仓根启动 python3 -m http.server 8765 --bind 127.0.0.1
NODE_PATH="$(npm root -g)" node clockwork/tools/browser-check.cjs \
  http://127.0.0.1:8765/clockwork/ /path/to/output
```

没有 Node 逻辑测试；改动涉及 DOM、动画和手势提示，回归检查留在真实浏览器中。触屏文案已与本地 OrbitControls 的单指旋转、双指缩放及平移配置核对；真手机、Safari、真实双指手感未测。本页无声音。

正常入口另录了约 30 秒操作，未使用状态跳转：操作录像页面错误 0，并按每秒一帧抽样复看；不是全帧视觉验收。录像和抽帧在输出 `opening/clockwork/`，不能替代真机手感判断。

## 2026-11-11 发条盒端面圆纹偏心回归

范围：只修冷读报告中的发条盒端面圆纹偏心。已核对内置 `vendor/three.module.js` 的版本为 r160，以及 `CylinderGeometry` 两端轴心 UV 为 `(0.5, 0.5)`。原 `grainFor(2.6)` 的变换将它移至约 `(0.583612, 0.583612)`；计入 `CanvasTexture.flipY` 后是 `(0.583612, 0.416388)`，均偏离纹理圆心。

`index.html` 只调整发条盒独有的纹理变换，将端面轴心映回 `(0.5, 0.5)`；粗糙度和凹凸共用该纹理。缩放随后也改成 `1/1.15`，让端面边缘落在和齿轮同一圈纹理上（原值只取到纹理最里面约 8%）。`grainFor`、`metal` 和齿轮生成代码未改，vendor 未改。采用现有材质上的偏移修正，没有引入新 helper、依赖或构建步骤。

新增 `tests/grain-mapping.test.cjs`：从页面提取并执行实际几何与材质代码，加载本地 r160，读取真实几何体 UV，再执行 Three.js 的纹理变换。检查两个端面的轴心及圆周（容差 `1e-7` 纹理 UV 单位），并对 8、10、30、32、60、64、96 齿的挤出轮端面逐顶点比对修前映射，粗糙度和凹凸各查一次。Canvas 仅提供尺寸占位，不生成像素；这些是几何与映射检查，不是 GPU 渲染检查。

先新增测试、保持页面旧代码运行：

```sh
cd clockwork
node --test tests/*.test.cjs
```

真实红输出节选（退出码 1）：

```text
✖ both drum cap axes map to the grain centre in roughness and bump maps (16.190125ms)
✖ equal radii on both drum caps stay equidistant from the grain centre (0.186334ms)
✔ extruded gear faces retain their previous coordinate-based grain mapping (301.751125ms)
ℹ tests 3
ℹ pass 1
ℹ fail 2
AssertionError [ERR_ASSERTION]: Cap 1 roughnessMap: axis maps to (0.583612, 0.416388), expected (0.5, 0.5)
AssertionError [ERR_ASSERTION]: Cap 1 roughnessMap: texture radius spread 0.1659678407555779 exceeds 1e-7
```

随后修改页面，用相同命令运行，真实绿输出（退出码 0）：

```text
✔ both drum cap axes map to the grain centre in roughness and bump maps (21.609208ms)
✔ equal radii on both drum caps stay equidistant from the grain centre (0.961958ms)
✔ extruded gear faces retain their previous coordinate-based grain mapping (362.362542ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 898.675167
```

本机 Node v26.13.0。另以 `spawnSync` 调用 `node --check`，HTML 内模块先提取到标准输入，真实状态输出：

```text
node --check tests/grain-mapping.test.cjs: exit 0
index.html module: node --input-type=module --check: exit 0
```

本轮没有打开浏览器、生成截图或测量 GPU；没有联网、安装依赖、提交或推送。冷读报告中的截图时刻、截图脚本错误退出和整体金属材质回归等条目不在本次范围，未改。

需派活方在浏览器实测：从仓根启动本地 HTTP 服务，打开 `/clockwork/` 正常入口（建议桌面 1440×900，保留默认渲染配置），暂停并隐藏标注，缩放、转到主齿轮后方，查看深青铜发条盒两侧端面。判据是可见圆纹围绕轴心展开，同一圈不向一边偏移；对照相同机位、相同暂停姿态的修前画面，确认齿轮圆纹、高光没有变化。端面可能被主轮或背板挡住，需从斜侧观察。本轮没有自动像素检查，此处须以实际渲染另验。

浏览器复核（2026-11-11，Chrome，1200×800）：正面机位改前改后各拍一张，页面错误 0；发条盒在主轮背后，大半被挡住，这个机位上肉眼看不出差别，所以这条修复的依据是上面的映射测试，不是截图。
