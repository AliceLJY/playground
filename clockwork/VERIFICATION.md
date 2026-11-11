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

## 2026-11-11 第二轮：截图定格、错误退出与金属材质回归

状态：代码和 Node 检查完成；浏览器实测由派活方执行，像素阈值尚未在 GPU 上校准。本节不引用前面历史浏览器通过数作为本轮证据。

只改 `clockwork/`。未联网、安装依赖、创建 node_modules 软链、提交或推送；按本轮「不联网」限制没有执行 git fetch。已读冷读报告并核对代码及最近三个提交，未重做 `cbbcfca` 的发条盒 UV 修复。Three.js 保持内置 r160。

文件与对应项：

- `index.html`：把原动画循环中的轴系更新原样提为 `advanceSimulation()`，播放、单步与新定格探针共用它，新增累计模拟秒数。`debug=1` 下增加 `freeze(request)` 和 `sampleMaterials(variant)`；正常入口没有探针，不启用 preserveDrawingBuffer，不改变材质或默认渲染配置。
- `tools/shots.cjs`：取消真实时间 800 ms 等待和鼠标缩放/拖动；固定模拟时刻与数值机位，截图前后均核对实际状态，记录至 `report.json`。页面异常、console.error、时间/任一轴角/相机位置/朝向不符均退出 1，失败也保存报告并关闭浏览器。主机可选的 favicon 请求统一回应 204，其余错误照常判失败。
- `tools/acceptance.mjs`：两个 Node 浏览器脚本共用请求、实际状态断言和像素阈值。不被页面导入；发布流程只复制 HTML 和 vendor 仍能使用页面探针。
- `tools/browser-check.cjs`：保留原有四视口交互检查，另加固定机位的主轮/中心轮像素检查，以及两个真实渲染的负例和恢复检查。等待钩子使用 100 ms 定时轮询；URL 通过 URLSearchParams 增加 debug 参数，支持原有查询参数和部署子目录。
- `tests/capture-regression.test.cjs`：执行页面的实际轴系更新、定格与像素统计函数；用真实 r160 Group/Camera 测模拟结果。另以 Playwright 替身运行真实 shots CLI，验证正常返回 0、截图期间抛异常/console.error 或错误姿态返回 1。DOM、OrbitControls、GPU 与文件写入由替身承担，这部分没有启动浏览器，也没有生成图片，不能当 GPU 证据。
- 中英文 README：补上脚本行为与未完成的像素校准说明。本节为中文交接报告。

采用已有暂停/单步的模拟步长和本地 r160，未新增依赖或通用测试框架。仅为定格提取原更新函数，没有调整齿比、步进、金属参数或普通入口画面。

**定格契约**

三个机位均为第 48 个模拟秒、60 倍速、暂停、无待执行单步。先清零累计角度与摆轮相位，再调用真实轴系更新推进 48 秒；因此不受页面加载及此前帧调度影响。截图前后读取全部七根轴的实际 rotation.z，按独立齿比公式检查，容差 `1e-9` 弧度；同时核对模拟时间、倍率、暂停状态、相机位置、target 与实际视线方向。

| 名称 | 视口 / DPR | 相机位置 | 观察目标 |
| --- | --- | --- | --- |
| wide | 1440×810 / 1 | (-14, 4, 48) | (0, 1, 0) |
| close | 1440×810 / 1 | (-10, 4, 27) | (-1, -3, 0) |
| phone | 390×664 / 2 | 原 home 方向按 664/390 拉远 | (0, 1, 0) |

通过脚本访问 `/clockwork/?debug=1` 并调用定格；无参数入口保持正常播放。`report.json` 的 `requested`、`frozen`、`afterScreenshot` 和 `errors` 分别记录请求、截图前后实际轴角/机位与错误。中心轮预期为 `-2π × 48 / 3600`，擒纵轮为其 60 倍，摆轮也按 60 倍速的实际相位公式核对。机位与旧截图不完全相同；修前/修后须使用这版脚本和这版定格钩子重新成对拍摄，不能直接拿旧鼠标机位图比较。

**像素契约与待校准阈值**

材质检查单独使用 wide 机位、1440×810、DPR 1、默认抗锯齿、色调映射和渲染比例，定格在相同第 48 秒。主轮是 gear96，中心轮是 gear64。每个轮以实际世界包围盒投影出的矩形为区域，区域越出画布直接失败，不裁掉再冒充完整采样。

每轮依次渲染「该轮+背板」「仅背板」，其余轮、指针、轴帽和轮廓线两次都隐藏；再用同一几何的纯白轮片/黑背景生成真实覆盖遮罩。只统计遮罩向内收一个 framebuffer 像素、且主体/背景至少一通道相差超过 2 的像素。镂空、背板、黑色轮廓线与抗锯齿边缘不会贡献亮暗范围。相机、几何、原材质和渲染路径不因采样更换；白材质仅用于覆盖遮罩。读取发生在 renderer.render 后的同一个同步调用中，不需要 preserveDrawingBuffer。

读数使用 sRGB 画布的 0–255 加权亮度 `Y = .2126R + .7152G + .0722B`，不是线性光亮度。两个轮都要求：

- 有效样本不少于 500 像素，空白图不能通过。
- `P95(Y) - P05(Y) >= 24`，不用最大/最小值，避免少数杂点撑开范围。
- `Y >= 190` 的高光像素占比不少于 1%。

这是按当前黄铜/镍钢、摄影棚反射设置拟定的初值，**不是测得的金属基线**。首次浏览器执行须同时检查正例和负例，不得只放宽到当前版通过。脚本对每轮临时制造并实际渲染：

1. `basic`：将目标轮片替换为 `new THREE.MeshBasicMaterial({ color: 原轮片颜色 })`，无纹理和反射。轮片内部各朝向不再受光照/环境影响；剔除轮廓和背景后亮度接近常数，P95−P05 应接近 0，低于 24。即使整个面都亮，高光占比过线，范围仍必须失败。
2. `no-environment`：临时令 `scene.environment = null`，保留现有灯光和金属材质。metalness=1 的轮片失去摄影棚柔光箱和灯带的大面积反射；预期高光占比低于 1%，或亮暗范围低于 24。直接灯仍可留下零星高光，**实际是否低于阈值尚未验证**。

每个负例必须保留不少于 500 个有效像素，并在「范围或高光占比」至少一项失败，才算检测器发现坏材质；不能靠空图充当负例通过。若移除环境后依然过线，脚本整体退出 1，说明当前阈值/区域不足以识别此退化，需要按保存的真实像素重新校准。当前正例不过线同样退出 1。原材料、环境和可见性在 finally 中还原，最后重测 current 并要求五项统计值与第一次一致；状态也再次核对。

`report.json.materials` 记录每轮矩形、drawing buffer 尺寸、样本数、P05/P95、范围、高光比例、具体失败项及预览文件名；同时输出六张 `material-{current,basic,no-environment}-{great,center}.png` 和还原后的完整场景 `material-scene.png`。派活方要逐张读图，确认采到对应轮片、排除区域错误，不能只看 PASS。

**本轮实际 Node 验证**

先临时造坏版本、运行新增五项 Node 检查，每次用 finally 还原源文件，再运行完整测试。真实红输出的汇总（省略各项耗时及断言栈）：

```text
BAD VERSION: freeze +0.25 simulated seconds exit 1
ℹ tests 5
ℹ pass 2
ℹ fail 3
BAD VERSION: ignore collected page errors exit 1
ℹ tests 5
ℹ pass 4
ℹ fail 1
BAD VERSION: remove luminance-range assertion exit 1
ℹ tests 5
ℹ pass 3
ℹ fail 2
BAD VERSION: shots ignores page errors at all three guards; exit 1
✖ shots CLI exits nonzero for a late page error or wrong frozen pose
ℹ tests 5
ℹ pass 4
ℹ fail 1
```

复现坏版本的方法：定格函数的 `advanceSimulation(seconds)` 改为 `advanceSimulation(seconds + .25)`；共享断言临时忽略 errors；材质阈值临时删掉 range；或 shots 两次 assertFrozen 不传错误并跳过最后 errors 检查。以上都是临时改源码的真实 Node 反向运行。像素统计的 Node 输入是人工构造的均匀/明暗/空白缓冲区，仅证明统计和门限分支正确；真实金属、Basic、无环境三组 GPU 反向证据仍由下面的浏览器命令生成。

派活方完整命令（使用已有全局 Playwright；不要安装或链接依赖）：

```sh
# 终端 1，从仓根启动服务，保持运行。
cd "$(git rev-parse --show-toplevel)"
python3 -m http.server 8765 --bind 127.0.0.1
```

```sh
# 终端 2，先做本轮离线检查。
cd "$(git rev-parse --show-toplevel)/clockwork"
node --test tests/*.test.cjs
node --check tools/shots.cjs
node --check tools/browser-check.cjs
node --check tools/acceptance.mjs
node --check tests/capture-regression.test.cjs
node --input-type=module --check < <(python3 -c 'import pathlib,re; print(re.search(r"<script type=\"module\">(.*?)</script>",pathlib.Path("index.html").read_text(),re.S).group(1))')
cd ..
NODE_PATH="$(npm root -g)" node clockwork/tools/shots.cjs http://127.0.0.1:8765/clockwork/ /tmp/clockwork-round2/shots-a
NODE_PATH="$(npm root -g)" node clockwork/tools/shots.cjs http://127.0.0.1:8765/clockwork/ /tmp/clockwork-round2/shots-b
NODE_PATH="$(npm root -g)" node clockwork/tools/browser-check.cjs http://127.0.0.1:8765/clockwork/ /tmp/clockwork-round2/check
```

预期（不是本轮已执行的浏览器输出）：两次 shots 各输出 `PASS wide`、`PASS close`、`PASS phone`，退出 0，且两份 report 的实际轴角、时间和机位一致；browser-check 原交互项继续通过，新增 `current great/center has metal contrast and highlights`、两个负例各两项 `is rejected by metal limits`、两项恢复检查与一项无错误检查全部 PASS，退出 0。若阈值初值不成立，会输出相关 FAIL 并退出 1，应保留 report 和六张区域图作为校准依据。页面异常、状态不符、读取失败或负例没被拒绝均不能算通过。

再用同一命令将基准地址换成派活方发布的 `/playground/clockwork/` URL 复验；本轮未做发布。另打开正常无 debug 入口，确认默认 60x 播放、暂停/单步/镜头操作没有改变；真机、Safari、默认画面、GPU 像素和性能均未在本轮实测。

最终还原后执行 `node --test tests/*.test.cjs` 的真实输出末段（退出 0）：

```text
✔ shots CLI exits nonzero for a late page error or wrong frozen pose (324.365167ms)
✔ both drum cap axes map to the grain centre in roughness and bump maps (2.544042ms)
✔ equal radii on both drum caps stay equidistant from the grain centre (0.187709ms)
✔ extruded gear faces retain their previous coordinate-based grain mapping (64.072041ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 454.599375
```

语法检查真实输出（均退出 0）：

```text
node --check tools/shots.cjs: exit 0
node --check tools/browser-check.cjs: exit 0
node --check tools/acceptance.mjs: exit 0
node --check tests/capture-regression.test.cjs: exit 0
index.html module: node --input-type=module --check: exit 0
```

### 浏览器实测与阈值校准（2026-11-11，Chrome，Apple Metal）

`tools/shots.cjs` 连跑两遍，三个机位都定格在第 48 个模拟秒，两份报告的轴角和机位逐项一致。材质检查第一次跑报「great sample region is clipped」：广角机位里主轮下缘出画，取样改成只取屏幕内的部分。按实测读数校准阈值：亮度范围（p95 − p05）出货版主轮 87.8、中心轮 58.8；纯色材质 0、0；去掉环境贴图 19.0、43.4，阈值定 50。出货画面没有像素亮度到 190，高光占比分不开好坏，改为只记录不要求。校准后 `tools/browser-check.cjs` 45 条全过，两个坏版本都被拒绝。中心轮的余量不大（58.8 对 50 对 43.4），换机位或调灯后要重新校准。
