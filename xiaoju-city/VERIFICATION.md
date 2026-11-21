# 小橘逛花城 · 验证记录

## 环境与复现

- 日期：2026-11-22（会话时区）；源码入口 `http://127.0.0.1:8765/xiaoju-city/`，构建入口 `http://127.0.0.1:8765/xiaoju-city/小橘逛花城.html`。
- 浏览器：本机 Chrome，Playwright 无头模式，1365 × 900，DPR 1，渲染比例 1。
- WebGL 渲染器：`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。不是 SwiftShader；测得的桌面帧率可以引用。手机检查为模拟触控视口，DPR 2，不是实机。
- three.js：r160，使用本目录 `vendor/three.min.js`，无新增依赖或 CDN。

在仓库根目录启动服务：

```sh
python3 -m http.server 8765
```

统一检查命令：

```sh
cd xiaoju-city
node --check src/core.js
node --check src/game.js
node --test tests/*.test.cjs
python3 build.py
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8765/xiaoju-city/ shots
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs 'http://127.0.0.1:8765/xiaoju-city/小橘逛花城.html' shots/built
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs http://127.0.0.1:8765/xiaoju-city/ shots/mobile-source
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs 'http://127.0.0.1:8765/xiaoju-city/小橘逛花城.html' shots/mobile-built
```

构建结果：`小橘逛花城.html`，1,477,694 字节，SHA-256 `806d6d80c0cf36e831983a51f2f6f392eda6cdce98d4f3b3c462636eca4f4dd9`。三张 WebP 已内联为 data URI。

## 验收 1–8

| # | 结果 | 实测与证据 |
|---|---|---|
| 1 | 通过 | `node --test tests/hotspots.test.cjs`：14 / 14 个 id 都有仓库根目录，且都出现在 `pages.yml` 的 `_site/<id>`。 |
| 2 | 通过 | 同一测试：以 15 km/h 穿过「骑楼雨夜」保持 `phase=ride`，穿越过程中出现提示；停稳 35 帧（0.583 秒）仍不弹，第 36 帧（0.600 秒）进入 `hotspot` 且 `dialog=qilou-rain`。两侧均覆盖。 |
| 3 | 通过 | 同一测试：从起点和江边分别规划到 14 个入口，28 / 28 路线非空；另有真实模拟导航到骑楼雨夜并停车弹卡。 |
| 4 | 通过 | 同一测试：最小两两中心距 22.09 游戏米（阈值 ≥14）；最大道路中心线距离仅浮点尾差 `8.88e-16` 游戏米（阈值各自路宽 +3）。 |
| 5 | 通过 | `tools/browser-check.cjs`：请求层以 204 拦截，目标确为 `../qilou-rain/`，页面未离开；重载出现「回到刚才的地方」和「从头逛」，两个按钮均 ≥44px；恢复位置误差 0 游戏米；顶栏手账从 0 / 14 变为 1 / 14。禁用 localStorage 后仍正常开始，页面错误 0。源码与构建均通过。 |
| 6 | 通过 | `?view=title`：改为在一拍之内连续采样（16 次 × 50 ms ≈ 800 ms，一拍约 550–600 ms），取每栋高度的最大最小差。原先「隔 150 ms 采两次」会落在弹跳顶点附近，构建产物上实测出现过镇海楼 1.83% 的假红。改后源码与构建连跑三次：骑楼约 23.2%、陈家祠约 21.2–21.7%、镇海楼约 22.6%，三次均通过；存在一帧一栋在升、另一栋在降，相位不同。reduced-motion 下一拍内最大 0.83%（<1%），这个状态正好当作已知不跳的样本：它远低于 4% 阈值，说明检查分得出跳与不跳。截图 `shots/title.png`、`shots/built/title.png`。 |
| 7 | 通过 | 正常入口只按住 ↑：最新源码 1.447 秒、构建 1.455 秒出现「← 搭台 · 茶楼早市 · 停一下就能进」，阈值 ≤45 秒。 |
| 8 | 通过 | `tools/mobile-check.cjs`：390×664 与 844×390，在有存档 / 无存档两种标题状态下检查小橘、文字、按钮和三栋楼；骑行页增加内部文字节点两两比较。标题、骑行、卡片均无违规重叠，触控按钮竖屏最小 46px、横屏 44px；页面错误 0。源码和构建结果一致，证据在 `shots/mobile-source/`、`shots/mobile-built/`。 |

完整断言数据见 `shots/browser-report.json`、`shots/built/browser-report.json` 和两个 `mobile-report.json`。

## 第二轮：读图症状的回归证据

先只修改 `tools/mobile-check.cjs` 与 `tools/browser-check.cjs`，在未修页面上运行，确实得到以下失败行（完整报告保留在 `shots/before-round2-mobile/`、`shots/before-round2-browser/`）：

```text
FAIL 390x664 saved: rider overlaps every button/text block by less than 10% [{"id":"P.","ratio":0.2647729853736727},{"id":"start","ratio":0.046476529966507286},{"id":"fresh","ratio":0.20990473126140202}]
FAIL 390x664 saved: text and buttons cover less than 25% of each building [{"id":"qilou","heightRatio":0.19036219463078954,"cover":0.8421568863339419},{"id":"chenjiaci","heightRatio":0.09444754261911478,"cover":0.7703011537973166},{"id":"zhenhailou","heightRatio":0.15948776334537665,"cover":0.5064510930731551}]
FAIL 844x390 saved: dancing buildings span at least 60% width 0.4605601174792637
FAIL 390x664 speed and boost text nodes do not overlap [{"a":"街头骑士","b":"100%"}]
FAIL journal button increments from 0 / 14 to 1 / 14 after one entrance "手账 0 / 3"
```

修复后：

- 390×664 有存档：小橘与按钮/文字的非零重叠项为 0；楼群宽度 68.45%，每栋高度分别为 18.69%、13.46%、15.71%（均 ≥12%）；最大单栋遮挡 14.48%（阈值 <25%）。无存档同样通过，楼群宽度 67.59%，最大遮挡 15.33%。
- 844×390 有存档：小橘非零重叠项为 0；楼群宽度 60.96%，每栋高度分别为 58.82%、40.24%、55.30%（均 ≥25%）；最大单栋遮挡 22.00%。构建产物楼群宽度 61.63%，最大遮挡 22.43%。
- 速度与冲刺内部文字节点重叠 0；顶栏在进过一个入口并回来后显示「手账 1 / 14」。
- 阿橘原目录也有相同的竖屏速度/冲刺定位，本轮只读确认，没有修改该目录。
- 新截图：`390x664-title.png`（有存档）、`390x664-title-no-save.png`（无存档）及对应的 `844x390-title*.png`，源码与构建目录各一份，均已读图。

## 机位、性能与真实流程

- `?view=title`：`snapshot().view=title`。小橘与车占画面高度 32.63%，三张立面合计占画面宽度 65.71%，均在规格范围内。
- `?view=hotspot`：真实导航 39.60 游戏米后到达骑楼雨夜，`routeNav=arrived`、速度 0、卡片已弹出；不是手工摆位置。截图 `shots/hotspot.png`。
- `?view=map`：真实打开地图并选择十三行江岸，显示约 78 游戏米路线，`snapshot().view=map`。截图 `shots/map.png`。
- 光圈、外圈辉光和单张招牌图集合计 3 draw calls，低于 30 的预算。最新桌面实测整帧约 57.48 fps；未测手机实机帧率。
- `NODE_PATH="$(npm root -g)" node tools/opening-check.cjs http://127.0.0.1:8765/xiaoju-city/ shots/opening`：录制正常入口 30 秒操作。录像为 `shots/opening/page@21dd23d405410700755ab09e19fadb96.webm`，末帧为 `opening-30s.png`。流程包含起步、拒绝三花挑战和三次碰撞；前两次碰撞后继续骑行，录像结束时第三次恢复动画尚未结束；页面错误 0。

## 验收 9：参考并排对照

命令：`NODE_PATH="$(npm root -g)" node tools/reference-check.cjs http://127.0.0.1:8765 shots/reference`。

- `compare-title.png`：街区材质、程序化建筑细节、小橘与自行车、光照和后期均直接沿用参考，没有降成低面数或纯色替代；新标题拉远机位，加入三张有真实立面细节的舞蹈图片。
- `compare-hotspot.png`：沿用同一纸质对话框、标题层级和主次按钮；新增类型与到访状态，入口光圈在背景中仍可见，没有遮挡层级退步。
- `compare-map.png`：保留同一地图、路线和选中色；目的地增多后按区分组，大地图只标注当前选中地名，避免全部路名互相覆盖。

`dzyai.online` 对照未完成：站点可打开并显示「潮线失序」标题，但选择「雨夜行动」后持续停在「正在加载白汐港…」，没有取得真实任务卡片。因此这里不对其任务卡片层级作未经验证的判断。

## 未覆盖与人工判断

- 未在真实手机、Safari 或线上发布地址复验；手机结果来自 Chrome 模拟视口。
- 合成鼓点与音效未做人耳试听，骑行手感仍需真人试玩；自动检查不代替「好不好玩」的判断。
- 验收 9 的外部任务卡片对照如上所述未完成；其余本地三组并排图已逐张读图。
