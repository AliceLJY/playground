# 2026-11-03 B5 回归

范围：报告「值得改的」1、2。原图按钮和 CAD 图片均在新标签打开同一张原始 PNG；技术文件名移到页尾，三维页增加到 `../floorplan-walk/` 的入口。源码里的房间卡片只显示面积，因此提示写「下方可查看各房间面积」，没有承诺点击定位。未添加日照竞猜或木色对比玩法。

`tools/browser-check.cjs` 在旧代码上 32 项中 12 项失败：四种视口均缺原图入口、仍有面向开发者的首屏文字、缺布置版链接。修后 48/48 通过：真实点击打开原图并读取自然尺寸、两入口目标一致、按钮至少 44 px、链接目标存在，四标签与所有图片加载正常、无横向溢出、页面错误 0。

本页本来就是发布副本，无额外构建；`share.js` 内置 three r186，未改包或模型。环境为本地 HTTP、Chrome 156.0.8078.80；390×664、320×568、844×340 / DPR 2，1365×900 / DPR 1。截图输出 `floorplan-before/`、`floorplan-after/`。

```sh
NODE_PATH="$(npm root -g)" node floorplan/tools/browser-check.cjs \
  http://127.0.0.1:8765/floorplan/ /path/to/output
```

本地检查布置版的 `dist/` 构建产物可用；发布链接仍是该页正式目录，不改成开发路径。没有 Node 逻辑测试，DOM 导航回归在浏览器中检查。真手机打开图片后的缩放手感、Safari 未测。本页无声音。

正常入口另录了约 30 秒操作，未使用状态跳转：操作录像页面错误 0，并按每秒一帧抽样复看；不是全帧视觉验收。录像和抽帧在输出 `opening/floorplan/`，不能替代真机手感判断。

## 2026-11-25 Duet 展页巡检复核

外部测试员 Duet 修理单第 10 节逐条复核。仓根 `python3 -m http.server 8784`，Playwright 驱动本机 Chrome，1440×900 与 390×664（hasTouch true / false）。新增 `tools/duet-check.cjs`：原代码 15 项 FAIL（exit 1），修后 18/18 PASS（exit 0）。

| # | Duet 说法 | 复现 / 查证 | 结论 | 怎么改的 |
|---|---|---|---|---|
| 1 | 平面图左下说明第 3 条写进右下图签「图名」格 | 看 `assets/plan-A01.png` 原图：第 3 条「…门扇开向看原图人工标注。」压在「图名」二字上 | 成立，未改 | 字在图片里，由外接盘出片工程 `2026-09-30-户型图三维小样/tools/cad_export.py:436` 生成。要改得在那边把第 3 条拆两行后重出 DXF 与 PNG，超出本次只改作品目录的范围，留作者定 |
| 2 | 要等全部图片（约 1 MB）下完才画三维 | 复现：用路由把 `assets/` 图片拖 4 秒，1.5 秒时三维画布 0 个已画像素（截图是空深色块） | 成立已修 | `share.js` 三维立即画，`window.__ready` 仍等图片（检查脚本照旧）；顺带去掉了图片晚到时强行切回「三维」标签的副作用 |
| 3 | 标签 34px 高，无 role=tab | 复现：四个标签均 34px，无 tab 语义 | 成立已修 | 标签最小 44px；加 `tablist` / `tab` / `tabpanel`、`aria-controls`，`share.js` 切换时同步 `aria-selected` |
| 4 | 「所以房间时长比任一点都长」不成立，句末无句号 | 查 `share.js` 内的 sun 数据：储藏间 0 h（单点最长 0.08 h）、家庭室 0 h（单点 1.17 h）、过道 0.75 h（单点 1.08 h），三间都反例 | 成立已修 | 改为「房间时长常比其中任一点都长；但光斑不到 0.5 ㎡ 的时段不算，所以家庭室、储藏间记 0 h，过道也短于晒得最久的那一点。」 |
| 5 | 「首层 · 8 个房间」与「首层八间房」重复 | 复现 | 成立已修 | 副标题改为「房间面积合计 · 比例尺按楼梯踏步宽估算」 |
| 6 | 手机画布 touch-action:none，可能滑不动页面 | 用 CDP 触摸事件在 390×664 模拟：画布（362×330，占屏约一半）上竖滑页面不动；画布下方竖滑页面滚动 246px | 成立，设计取舍未改 | 画布上单指要留给旋转。要不要缩小画布、改成双指旋转或加「上滑看房间」提示，留作者定 |
| 7 | 263.1 ㎡ 当确数展示，没说是估算 | 查 `share.js` 内 plan 数据：`scale_basis: "stair tread 27.7 cm = 8.9 px; exterior wall ≈ 36.5 cm cross-check"`，比例尺由踏步宽反推 | 成立已修 | 与第 5 条合并：副标题注明比例尺按踏步宽估算 |

改原检查：`tools/browser-check.cjs` 第一项原用「首屏含『八』」判断访客文案，第 5 条去掉「八间房」后改为判断含「房间」，检查意图（文案不含文件名）不变。

```sh
NODE_PATH="$(npm root -g)" node floorplan/tools/duet-check.cjs http://127.0.0.1:8784/floorplan/ <截图目录>       # 修前 exit 1（15 FAIL），修后 exit 0（18 PASS）
NODE_PATH="$(npm root -g)" node floorplan/tools/browser-check.cjs http://127.0.0.1:8784/floorplan/ <输出目录>    # 修后 44 PASS / 4 FAIL，exit 1
node --check floorplan/share.js                                                                                # exit 0
```

browser-check 的 4 项 FAIL 都是「local walk-in build available: 404」：它请求 `../floorplan-walk/dist/`，那是未提交的构建产物（`.gitignore:14`），本工作副本没构建。改动前在 aaf1c1b 原样代码上跑同一脚本，结果同为 44 PASS / 4 FAIL、同样这 4 项。真手机、Safari 未测。
