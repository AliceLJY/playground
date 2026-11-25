# 山河卷 · B2 修复验证

2026-11-03，本地静态服务，未推送或发布。Three.js 仍为仓内 r160；无构建步骤，发布即本目录源码。

## 改了什么

- 报告 1：每个节点只记录并计分第一次作答。重进恢复原选择、正确选项和原反馈；「重新开卷」清空记录。原答对/答错分值与称号阈值不变。
- 报告 2：900px 以下顶栏只留卷名、分数和菜单；原来的两项操作收进菜单，按钮高至少 44px。省略面包屑和称号，初始提示改为「点红点看史料，左右滑换年代」。桌面保留完整顶栏。菜单在场景内也可点击，Escape 可收起。
- 复用已有按钮、选项反馈和原生 Map/CSS，没有新增依赖、规则模块或玩法。

## 检查与红绿

- `tests/quiz.test.cjs`：直接执行页面中的计分、重看和重置函数（最小 DOM 替身），3/3 通过。原版 2 条失败：重复答对从 120 累加至 240；重看错误答案不恢复原标记与提示。修后两条变绿，另确认不同节点分别计分、重置后可以重新作答。
- `tools/browser-check.cjs`：390×664、320×568、844×340、1365×900，DPR 2/2/2/1，53 项全部通过。原版 20 项失败，包含手机顶栏换行/越界、提示宽度不足、菜单缺失、重复计分与反馈消失。修后顶栏和提示不挤压，菜单真实点击可用，重看保持 120 分，重新开卷归零；四个不同节点正常答完结算为各节点原分值之和 570。
- 页面零错误。Chrome 156.0.8078.80 / Playwright；WebGL 渲染器为 `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`，非 SwiftShader。沿用默认 DPR 封顶 2、抗锯齿与渲染路径，没有为截图另降画质；没有重新测帧率。
- 截图：任务输出 `shanhe-scroll/before/` 与 `shanhe-scroll/after/` 中的首屏、菜单、重看场景与桌面卷终，已打开读图核对。

## 复跑

在仓根启动 `python3 -m http.server 8942 --bind 127.0.0.1`，另一个终端：

```bash
cd shanhe-scroll
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs /tmp/shanhe-check http://127.0.0.1:8942/shanhe-scroll/index.html
```

## 未覆盖

真手机、Safari、真人环视手感和屏幕阅读器没有实测；本作没有声音。未重审史料与全景素材。没有增加线索热点或卷终选择回顾，未调整难度或原评分数值。

## 2026-11-25 Duet 展页巡检复核

外部测试员 Duet 修理单第 12 节逐条复核（线上路径 `/playground/shanhe/`，本地 `/shanhe-scroll/`）。仓根 `python3 -m http.server 8784`，Playwright 驱动本机 Chrome，1440×900 与 390×664（hasTouch true / false）。

| # | Duet 说法 | 复现 / 查证 | 结论 | 怎么改的 |
|---|---|---|---|---|
| 1 | 四题全对只有 570 分，最高称号「洞见世变」门槛 600 拿不到 | 复现：120+100+150+200 = 570 | 成立已修 | `data/timeline.js` 最高称号门槛改 570（全对正好拿到）；其余分值、档位不动 |
| 2 | 手机卡片宽固定 390，右出屏 16px，× 被切 | 复现：390 宽卡片 16→406 | 成立已修 | 卡片宽 `min(390px, 100vw - 32px)`，定位按实测宽度算 |
| 3 | 卡片印章永远「一」 | 复现：江南机器制造总局、南湖红船都是「一」 | 成立已修 | 打开卡片时印章写所在章序号（二、三） |
| 4 | × 9×16、按钮 27–33px、红点 22px | 复现：× 9×16，卡片两按钮与「继续前行」33px，红点四周 18px 处点不到 | 成立已修 | × 44×44（负外边距，卡片头高度不变）；`.btn` 最小高 44；红点用伪元素把点按区放到 44×44，圆点与标签位置不变 |
| 5 | 不进场景一路「继续前行」0 分也能到卷终 | 代码如此（`markVisited` 不看是否作答） | 设计取舍，未改 | 留作者定是否要求答题 |
| 6 | 键盘 Tab 不到红点，Esc 不关卡片 | 复现：Tab 只到滚动区；Esc 只收菜单 | 成立已修 | 红点 `tabindex=0`、`role=button`、带名字，回车 / 空格打开；Esc 同时关卡片 |
| 7 | 手指拖动环视可能被页面滚动吃掉、drag 卡住 | 用 CDP 触摸事件在 390×664 模拟：#gl `touch-action:auto`，手指抬起后画布仍是 `dragging`（drag 卡在 true） | 成立已修 | #gl 加 `touch-action:none`，`pointercancel` 与 `pointerup` 一样松开 |
| 8 | 三元里卡「道光二十一年五月」配「五月二十九日至三十日」，后者是公历 | 查证：英文维基 Sanyuanli incident 记 1841-05-29/30（https://en.wikipedia.org/wiki/Sanyuanli_incident ）；用 ICU 中国历（Node `Intl`，`zh-CN-u-ca-chinese`）换算 1841-05-29/30 = 辛丑年四月初九 / 初十，同法换算虎门销烟 1839-06-03 = 四月廿二，与本卡片「四月二十二日起」一致，说明换算口径对得上 | 成立已修 | dateline 改「道光二十一年四月」；正文改「四月初九至初十（公历 1841 年 5 月 29 日至 30 日）」。农历日是计算所得，没找到直接写「四月初九 / 初十」的中文原始文献 |
| 9 | 「中学为体，西学为用」放在 1865 年，明确说法多见于 1890 年代 | 查证：英文维基 Chinese Learning as Substance, Western Learning for Application（https://en.wikipedia.org/wiki/Chinese_Learning_as_Substance,_Western_Learning_for_Application ）说思想由冯桂芬 1861 年《校邠庐抗议》提出，张之洞 1898 年《劝学篇》阐发；没查到 1896 年沈寿康一说的出处。思想 1865 年前已有，八字口号是否晚出没能定论 | 存疑未改 | 留作者核；可改的写法如「以中国伦常名教为原本，辅以诸国富强之术」（冯桂芬语） |
| 10 | 「执辩」疑为「置辩」 | 查证：汉典无「执辩」词条；「置辩」释「加以申辩、辩论」（https://www.zdic.net/hans/置辯 ） | 成立已修 | 题干改「你当如何置辩？」 |

检查与红绿：

```sh
cd shanhe-scroll && node --test tests/*.test.cjs
# 修前（只加新测试）：4 条 3 过 1 败（all-correct scroll reaches the top title），exit 1；修后 4/4，exit 0
NODE_PATH="$(npm root -g)" node tools/duet-check.cjs http://127.0.0.1:8784/shanhe-scroll/ <截图目录>
# 修前 30 FAIL，exit 1；修后 35/35 PASS，exit 0
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <输出目录> http://127.0.0.1:8784/shanhe-scroll/
# 修后 53/53 ok，exit 0（原「四个节点答完结算 570」照旧）
```

触屏那条的「画面转了」采样指标修前修后都过（修前也能转一点再被接走），真正变红变绿的是「松手后不再卡在拖动状态」。真手机、Safari、屏幕阅读器未测。
