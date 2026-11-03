# 花城秋岸 · 第一轮实测记录

日期：2026-11-01。只在 huacheng-autumn/ 内新增和修改文件；未执行任何 git 操作，未发布。

## 文件

- package.json、package-lock.json：沿用 snowline-cabin 的 three 0.186.1 / esbuild 0.28.2。
- .gitignore：忽略 node_modules/、dist/、shots/。
- index.template.html：原规格文案、四个控制按钮、时间滑条、横竖屏布局。
- src/core.js：带种子的布局、每片叶与花的生成数据、九层塔、双曲面网格、40 秒路线、电车时刻、接管与交还、光照插值。
- src/main.js：纯代码几何、实例化、材质与灯光、江面、移动交通、交互、渲染与验收钩子。没有导入图片、模型、贴图、字体；连木棉贴膜也由几何画出。
- tests/core.test.cjs：规格 1–8，加部件结构、输入保持和时段连续性检查，共 10 项。
- tools/build.mjs、serve.cjs、shot.cjs、browser-check.cjs：改写同仓参考工程；单文件打包、源码入口、四机位截图、浏览器验收。
- SPEC.md：仅追加本轮复现方法、固定状态、输入范围和像素统计定义；原验收阈值未改。
- VERIFICATION.md：本记录。
- dist/index.html：构建结果；shots/r1/：最终截图、日志和报告。

## 验证

安装与构建实际执行：npm ci；node tools/build.mjs。npm ci 输出 added 3 packages / found 0 vulnerabilities。单文件 639033 bytes。

SHA-256：4dde9e8238a940f1a8ec1b49e8298d021294d4d0ac70e9aa29ef4072d2262f9f

Node 原文摘要：

```text
ℹ tests 10
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

完整日志：shots/r1/node-test.txt。测试按 60 Hz 取每圈 2,400 个点，并对种子 20261101、7、131 检查树冠净空；植物另覆盖移动密度。手动接管测试覆盖 5 个路线位置 × 5 档转角 × 3 档缩放。

默认种子的路线实测：长度约 190.247 m，最大单帧位移 0.079318 m，最近障碍净空约 2.489 m，离赤岗塔最近约 14.019 m，最高约 43.065 m。

浏览器：Chrome 156.0.8078.74。打包入口 {"pass":21,"fail":0}；源码入口 {"pass":21,"fail":0}。包括 B1–B6、实际拖动与交还、滚轮缩放、复位、时间滑条、双指触控和电车实际渲染包围盒检查。两入口均无页面错误、无外部资源请求。源码入口只读取本地 JS 模块；打包入口不读取额外文件。

固定机位实测（1440×900，DPR 1；计数含阴影与后期）：

| 机位 | 绘制调用 | 实际 view |
|---|---:|---|
| hero | 107 | hero |
| bridge | 103 | bridge |
| pagoda | 106 | pagoda |
| wide | 107 | wide |

玩家默认入口：1440×900、DPR 2，实际 pixelRatio 2，档位 0，绘制调用 104，6 秒观察末帧率 59.99 fps。只代表本机这个观察窗口，不是手机性能保证。

渲染器：`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。不是 SwiftShader。

默认桌面实例合计 54653；独立叶片 15,780，异木棉花瓣 6,400（1,280 朵 × 5），簕杜鹃苞片 24,660。叶、花瓣、苞片、栏杆、路灯均为 InstancedMesh。

黄昏暖色亮像素 0.618%；入夜上半画面平均亮度 0.0739，蓝/红比 4.836。B6 全暖色色相占比：下午 0.59%、黄昏 6.96%、入夜 5.26%。统计定义见 SPEC.md。

手机布局以 Chrome 模拟 390×664、412×700、844×390，DPR 2 检查；按钮均完整可点，文字与按钮无重叠。未测 iPhone/Android 真机和 Safari。

## 四张最终截图逐张读图

| 截图 | 我看到的、已修的 | 本轮保留的限制 |
|---|---|---|
| shots/r1/hero.png | 四个主体同时入画。修了车窗过曝、广州塔与赤岗塔挤在一起、塔脚悬空、稀疏树冠，以及沙盘后部没有江面的空白底板。 | 远处广州塔偏淡；花叶、车辆仍有明显微缩模型感。 |
| shots/r1/bridge.png | 能看清花团下垂、栏杆、桥墩、楼梯、电车车头与红花贴膜。镜头移远并降低注视点后，车头不再被画面底边切掉。 | 叶片和苞片近看仍偏纸片感；桥下照明在车顶有局部强高光。该近景不要求两塔完整入画。 |
| shots/r1/pagoda.png | 九层、窄檐、暗线、拱窗和葫芦塔刹可辨；后退机位修好了塔刹出框，修了入口贴在墙内不可见的问题。 | 山岗仍偏规则，砖缝、树枝较简化；前景异木棉会挡住部分塔基。 |
| shots/r1/wide.png | 能看全沙盘、两座塔和远岸。修了江面高频条纹、远端硬边，以及天线出框。 | 天际线按规格保留通用简化块体；江面反射为程序化近似，没有真实镜面倒影。 |

四张均在最终构建后由 tools/shot.cjs 重新输出，并用看图工具逐张打开。较早迭代图片放在 shots/r1/review/，用来说明修图过程，不能当最终验收结果。

本轮未制作 README、录屏、音乐；未修改 CI、首页或其他玩意；未暂存、提交、推送。源码与打包的实测报告分别为 shots/r1/source/report.json 和 shots/r1/browser/report.json。

## F4 交互修复（2026-11-03）

范围仅为本目录体检「值得改的」第 1、2 条，基线 `217c874`。Three.js 仍为 0.186.1，未升级依赖，未改几何、材质、光照、原有机位和默认路线。只在修复分支提交，不推送、不发布。

- 地名按钮经正式 `rig.goTo()` 沿既有路线较短方向缓入缓出，抵达后留驻；没有接到测试 `setView()`，场景时间和交通持续推进。可随时拖动、缩放、重选或复位；「自动游览 / 留在这里 · 继续」常显当前控制状态，显式继续立即开始 3 秒平滑归还。
- 地名导航沿用固定近景的隐藏介绍文案行为。实现中间版曾在桌面「塔下」恢复文案、压住广州塔；真实点击复现为 `copyVisible: true`（`before/detail-copy.json/png`），补入三地名 × 两视口的检查后修复，未挪机位或景物。
- 时间条命中高度由 24 增为 44 CSS px，细线 2 px、圆点 12 px 保留；三个时段文字变成至少 44×44 的原生按钮。短竖屏为控件让出空间，隐藏介绍小字；其余文字及主标题保留。
- 新增 `tests/navigation.test.cjs` 两项：真实推进 5 个出发点 × 3 个目的地，检查速度、净空、准确到达、60 秒留驻、电车行驶样本、显式继续及输入中断。旧 19 项继续运行。
- 新增 `tools/controls-check.cjs`：正常入口真实触控/鼠标/键盘，验证准确到达后 8 秒不归还、实际渲染电车移动、切换游览、复位、时段预设、细线之外的点击；五种视口测完整性、重叠和中心命中。`tools/layout.cjs` 扩充新控件采样；原先只用于竖屏的「沙盘在文案上方」判据明确只在竖屏执行，横屏仍检查控件边界与重叠。

### 红绿证据

证据当时写在工作副本外的临时目录，没有保留。

| 检查 | 修改前 | 修改后 |
|---|---|---|
| Node 全套 | 19 通过，新增 2 项失败：缺少正式地名动作 | 21/21 通过 |
| 地名入口与常显状态，5 个视口 | 5 项失败：三个入口缺失、自动按钮无常显文字 | 5 项通过；另实际走完三机位、留驻、继续 |
| 时间命中区与文字预设，5 个视口 | 5 项失败：滑条 24 px、文字不可点 | 5 项通过；滑条 44 px，预设为 0 / .55 / 1，偏离线条的点击有效 |

旧源码从本工作副本 `git show 217c874:huacheng-autumn/...` 重建到 `before/`，最终版相同 Node 检查重跑仍 0/2；相同浏览器检查在旧版为 6 通过、10 失败（5 组地名、5 组时间目标），页面错误为零。原始修改前日志另保留在 `before/node.txt` 和 `before/controls/`，不把检查脚本自身的适用范围校正计成产品修复。

### 复现

在本目录运行，所有 GPU 检查顺序执行：

```sh
node --test tests/*.test.cjs
node tools/build.mjs
node tools/serve.cjs . 18964
# 另一个终端：
CHECK_OUT=/path/to/evidence-dir
NODE_PATH="$(npm root -g)" node tools/controls-check.cjs "$CHECK_OUT/final-build-controls" http://127.0.0.1:18964/dist/index.html
NODE_PATH="$(npm root -g)" node tools/controls-check.cjs "$CHECK_OUT/final-source-controls" http://127.0.0.1:18964/dev.html
node tools/flower-audit.mjs . "$CHECK_OUT/audit.html"
node tools/serve.cjs "$CHECK_OUT" 18965
# 再一个终端，顺序运行原有检查：
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs "$CHECK_OUT/legacy-build" http://127.0.0.1:18964/dist/index.html http://127.0.0.1:18965/audit.html
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs "$CHECK_OUT/legacy-source" http://127.0.0.1:18964/dev.html http://127.0.0.1:18965/audit.html
```

浏览器为本机 Chrome 156.0.8078.80，真实硬件渲染器 `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。五档为 390×664、320×568、844×340、844×390、1365×900；设备 DPR2，沿用默认自适应分辨率、FXAA 与 GTAO，没有为检查切换画质。

最终结果：Node **21/21**；新增交互浏览器检查在源码与单文件上各 **53/53**；既有浏览器检查在两入口各 **28/28**，均零页面错误。交互检查记录的开场实际像素比为 2；较长的默认桌面性能检查自适应到 1.5，未锁分辨率。单文件在 390×664、1365×900 留驻时，电车实际渲染包围盒在 1.5 秒内分别移动约 6.43 m、6.35 m，相机位置不变。真实 pointerup、pointercancel、lostpointercapture 以及事件派发的 blur、visibilitychange 都清除了按住状态。

最终截图与报告在 `final-build-controls/`、`final-source-controls/`（每组 11 张）和 `legacy-build/`、`legacy-source/`（每组 15 张）。逐张读图核对了五档开场、三个实际到达机位、六个原有机位和三种天色：按钮完整，新增控件不相互遮挡；320×568 省略介绍小字后保留主标题；塔下不再叠加介绍文案；花桥、花窗和两塔沿用原有构图与颜色。`review/` 保存按文件名顺序拼接的读图页，原图在各报告目录中。

正常入口另录 `opening/opening-30s.webm`（390×664、DPR1，普通游玩渲染，不启用录片模式），含真实点地名、拖动、暂停/继续、切换三种天色和复位。`opening/report.json` 保存 1,792 次实际动画帧状态及 12 张时间点截图，状态全部有限、零页面错误。录屏所有编码帧解码为 `opening/frames/sheet-01.png` 至 `sheet-14.png` 后逐帧读图，未见非操作引起的镜头突跳或输入卡住；28 秒主动复位保留原有回开场行为。此录屏用于交互验收，不作帧率或演示片画质结论。

最终单文件 `dist/index.html` 为 726813 bytes，SHA-256 `32e08d808b61417a53442eab3e35a0925f46093c9172bfe31844b627880f2506`。产物与 node_modules 均按既有规则忽略，不提交。另通过 JavaScript 语法检查与 `git diff --check`。

仍未覆盖：iPhone/Android 真机、Safari、真人对导航节奏与单手触控手感的判断、部署后的线上复验。失焦与切后台清理通过事件派发检查，不能替代真机切后台。本页始终无声，未增加声音。体检第 3 条及所有「可以加的玩法」按本批要求不做。
