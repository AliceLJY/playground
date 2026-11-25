# 2026-11-03 B5 回归

只做报告「值得改的」1、2：手机模型在前，当前状态与说明紧随其后，底部固定下一步按钮；11 步目录和斗栱剖视窗按需展开。横屏将模型与说明并排。首次仍须按原 11 步顺序完成；结束后可直接回看斗栱、梁架、拆开及装回，明确显示回看状态；从头来重新锁定引导。未做受力答题或装配选择玩法。

## 红 → 绿

`tools/browser-check.cjs` 在原始发布页运行，88 项中 40 项失败：手机主操作缺固定入口、过程及完成后模型/说明出屏，完成后没有回看入口。修后源码生成页和发布 `index.html` 各 124/124 通过。全程真实点击 11 步，已有时钟钩子仅用于等动画停稳；读取实际显示构件和当前状态，验证四种回看与重置锁定。手机每一步都测模型、说明和按钮同屏，按钮至少 44 CSS px。

初次修后还在 844×340 发现说明被底栏遮住，该项报红后改为左右布局，再跑变绿。逐张读图又发现回看斗栱/梁架时墙体仍留在画面：墙生长动画的内联透明度覆盖了隐藏样式。新增实际计算透明度检查在四视口各报两项红（`nanchan-opacity-before/`），再修隐藏规则，确保真消失，而不只检查状态标记。截图逐张对照：初屏、完成、斗栱与拆开，包含桌面和三种手机视口；输出目录 `nanchan-before/`、`nanchan-source/`、`nanchan-after/`。

## 构建与环境

SVG / Anatomy 页面，不使用 three。从 `src/` 重建并复制发布文件；最终 `src/nanchan-light.html` 与 `index.html` 字节一致。`--light --audit` 输出 `audit passed`：1028 solids、918 items、63 depth states、102 frame states，未动几何与尺寸。审计后只调整了横屏与隐藏层 CSS，重新构建了最终页。

```sh
cd nanchan-temple/src
NODE_OPTIONS=--max-old-space-size=14000 node build.mjs --light --audit
cp nanchan-light.html ../index.html
# 仓根启动本地 HTTP 后：
NODE_PATH="$(npm root -g)" node nanchan-temple/tools/browser-check.cjs \
  http://127.0.0.1:8765/nanchan-temple/ /path/to/output
```

Chrome 156.0.8078.80：390×664、320×568、844×340 触屏模拟 / DPR 2，1365×900 / DPR 1；各页页面错误 0。没有 Node 逻辑测试，构件及布局检查在浏览器中完成；没有新增框架或依赖。

另录了正常入口约 31 秒：真实点击走完 11 步，再回看斗栱及拆开，未用钩子推进状态，页面错误 0。录像在验收输出的 `opening-final/nanchan-temple/`，按每秒一帧抽样复看；这不是全帧视觉验收。

真手机、Safari、实际触屏手感及真人首次理解未测。页面用拟声文字表达落件，无音频；没有声效听测结论。

## 2026-11-25 Duet 展页巡检复核

外部测试员 Duet 的修理单第 8 节逐条复核。本地 `python3 -m http.server 8784`（仓根），Playwright 自带 Chromium，1440×900 与 390×664（hasTouch true / false 各一次）。新增 `tools/duet-check.cjs`，在原代码上 7 项中 6 项 FAIL，修后 7/7 PASS。

| # | Duet 说法 | 复现 / 查证 | 结论 | 怎么改的 |
|---|---|---|---|---|
| 1 | 尺子拨到 13/15/17/19 mm，「装回」读数仍是 12 mm 的面阔进深 | 复现，且不止这四档：12–20 mm 共 17 档里只有 12/14/16.5/18/20 对，其余 12 档都退回 12 mm 的数；回看斗栱在 13 mm 显示 114 cm（应 124 cm）。原因 `build.mjs` 只预算 5 档 | 成立已修 | `build.mjs` 改为预算滑杆全部 17 档（12–20，步长 0.5） |
| 2 | 第 4 步前展开斗栱剖视窗是空白 | 复现：桌面默认展开，`[data-inset]` 在第 4 步前 hidden，展开区里没有可见元素 | 成立已修 | 剖视窗里加一行「搭到第 4 步斗栱，这里放大看一朵柱头铺作。」，`inset.mjs` 的 start/stop 同步隐藏 / 显示它 |
| 3 | 手机「从头来」13px、只有 19px 高 | 复现：390 宽 334×19，触屏与非触屏相同 | 成立已修 | 窄屏 `.nc-reset` 改为 44px 高、14px 字 |
| 4 | 16.5 mm 档注「实测（张荣 2022）」，facts.md 列为推算 | 查证：张荣等 2022 第 3.2 节用卡尺实测华栱厚等，再按「单材厚 10 分°、足材高 21 分°」等假定算出 16.3–16.5 mm/分°，称「初步判断」，3.3 节取 16.5（澎湃转载全文 https://m.thepaper.cn/newsDetail_forward_18883877 ）。是推算值 | 成立已修 | 页面注改「推算（张荣 2022）」；README / README_CN 同句改为「张荣等 2022 按实测尺寸推算的分值」 |
| 5 | facts.md 与页面三处不一：坡度、通面阔、生起 | 对照页面：举高 chip 为 `1:5.34`（= 694 ÷ 130，Z 体系），面阔按 700 分（16.5 mm 时 11.55 m），生起没画（`build.mjs:36` 注释与 README「已知简化」）。facts.md 前半写的是补核前的旧方案 | 成立已修（文档） | facts.md 三处与「示意」清单一处改为实际做法，保留原句并注明 2026-11-25 订正 |

另见未改：页面图注小字「出檐、台基外轮廓、生起……为示意」里的「生起」，实际是没画而不是示意画。只改这一词要重建，留给作者定。

构建：`src/` 下 `node build.mjs --light`（本机 Anatomy `1482e84`），改前先在 aaf1c1b 上重建确认产物与 `index.html` 逐字节相同，修后 `cp nanchan-light.html ../index.html`，两者逐字节相同。几何未动，没有重跑 `--audit`。

```sh
NODE_PATH="$(npm root -g)" node nanchan-temple/tools/duet-check.cjs http://127.0.0.1:8784/nanchan-temple/ <截图目录>   # 修前 exit 1（6 FAIL），修后 exit 0（7 PASS）
NODE_PATH="$(npm root -g)" node nanchan-temple/tools/browser-check.cjs http://127.0.0.1:8784/nanchan-temple/ <输出目录> # 修后 124/124 PASS，exit 0
```

真手机、Safari 未测。

### 同日后续

上面「另见未改」那条（图注把没画的生起说成「示意」）作者 11-25 定为改。

- 原因：`src/build.mjs:36` 注释和 README「已知简化」都写明生起没画（只有 2 分，画出来槫和椽会在角上互相穿插），但第 978 行图注把它列进「……为示意」清单。
- 改法：只改图注这一句，其余不动。
  - 改前：「出檐、台基外轮廓、生起、阑额截面、门钉与椽的数量为示意。」
  - 改后：「出檐、台基外轮廓、阑额截面、门钉与椽的数量为示意；未画生起。」
- 构建：改前先在未改动代码（ce20e76）上 `node build.mjs --light`（本机 Anatomy），`cmp src/nanchan-light.html index.html` 逐字节相同；改后重建，`cp nanchan-light.html ../index.html`，两者逐字节相同。新旧 `index.html` 只差这一句（1,866,044 → 1,866,046 字符）。几何未动，没有重跑 `--audit`。
- 红→绿：一个最小 Playwright 检查（会话草稿，不进仓库），打开页面读 `document.body.innerText`，要求新句出现、旧句不出现、没有「生起……为示意」，且图注元素可见。对改前的 `index.html`：`hasNew false, hasOld true` → FAIL，exit 1；对改后的发布页 `http://127.0.0.1:8795/nanchan-temple/`：`hasNew true, hasOld false`，图注框 1240×43.75 → PASS，exit 0。图注截图看过。
- 改后已有检查：`tools/duet-check.cjs` 7/7 PASS；`tools/browser-check.cjs` 124/124 PASS（均 exit 0）。真手机、Safari 未测。
