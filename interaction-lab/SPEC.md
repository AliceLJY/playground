# 交互实验室 · 规格

## 体验一句话

每轮生成一批小交互（按钮、卡片、拖拽、开合、计数、加载……），每个都是一个带弹簧或缓动参数的单文件网页；自动截图、录 3 秒，再由一个和生成者不同的判官按作者以前说过的原话打分，留下两三条，外加一条「意外项」。留下的以后做网页、小游戏、视频时直接取用。

- 主美学：感官（手感）。次要：表达（每一条有一种自己的弹法）。
- 场地：生成与筛选全在作者的 Mac mini 上跑；候选本身按手机竖屏单手设计（视口 390×664），也要在电脑上能用。默认无声。
- 循环型：每轮重复跑，验的是「判官会不会把明显难看的放进来」和「留下的会不会越来越窄」，不验通关率。

## 一轮的四段

| 段 | 谁做 | 产物 |
|---|---|---|
| 生成 | Codex（`codex-run.sh -m write`） | `<轮目录>/candidates/<slug>/index.html`，每轮 8 个 |
| 录屏与自动检查 | `tools/record.cjs`（本机 Playwright + ffmpeg） | 每个候选：首帧截图、3 秒 mp4、6 格联系表、`checks.json` |
| 判官 | 另一个端（Kimi，撞额度换 Grok），不能是生成者 | `scores.json`（每一分都引用原话或检查项），`tools/validate-scores.cjs` 校验 |
| 入库 | `tools/ingest.cjs` | 弹药库分组目录：每种交互一个目录、`history.json`、分组 README 表 |

## 候选合同（生成者必须遵守，`tools/record.cjs` 逐条检查）

1. 单个 `index.html`，零外部请求（字体、图片、脚本都内联或用系统字体）。
2. `<script type="application/json" id="lab-params">` 写明 `{ "name", "kind", "oneLine", "spring": { "k", "c" } 或 "easing", "feedbackLayers": [...] }`。
3. 动画只走 `requestAnimationFrame` + `performance.now()`；位置、缩放、旋转、透明度的变化不许用 CSS transition / animation / Web Animations（录屏用假时钟逐帧推进，CSS 动画不跟它走）。
4. 弹簧积分照抄下面的 `springStep`（固定 1/240 秒步长，与帧率无关）：

   ```js
   function springStep(s, dt) {
     const h = 1 / 240;
     let left = Math.min(dt, 0.1);
     while (left > 1e-9) {
       const step = Math.min(h, left);
       s.v += (-s.k * (s.x - s.target) - s.c * s.v) * step;
       s.x += s.v * step;
       left -= step;
     }
     return s;
   }
   ```

5. 能点能拖的元素加 `data-lab-target="<名字>"`，点击区不小于 44×44 CSS 像素。
6. 用 Pointer Events；`pointerup`、`pointercancel`、`lostpointercapture` 都要松开；`touch-action: none` 只设在拖拽区。
7. 挂 `window.__LAB__ = { ready: true, demo: [...] }`，`demo` 是 3 秒内的演示手势，时间是秒：
   - `{ "t": 0.4, "type": "tap", "target": "<名字>" }`
   - `{ "t": 1.0, "type": "drag", "target": "<名字>", "dx": 0, "dy": 120, "dur": 0.5 }`（按住、拖、松手）
   - 第一下手势不早于 0.3 秒；最后一下手势结束后留至少 0.8 秒给它落定。
8. 按下后 100 ms 内画面要有变化（AGENTS.md 第 8 节）；反馈按事件分量叠层：轻事件小弹跳、重事件才加大动作。
9. `prefers-reduced-motion: reduce` 时阻尼比提到 ≥1，不过冲。

## 自动检查（`checks.json`，判官当硬性扣分项）

| id | 检查 | 通过阈值 |
|---|---|---|
| C1-errors | 页面报错 | 0 条 |
| C2-offline | 外部请求 | 0 个 |
| C3-params | `#lab-params` 可解析、含 name/kind | 成立 |
| C4-spring | 源码里有 `springStep` 且 `h = 1 / 240` | 成立 |
| C5-css-motion | 源码里没有 `transition:` / `@keyframes` / `.animate(` 用于运动 | 0 处（`transition: none` 不算） |
| C6-hook | `__LAB__.ready` 且 demo 非空、都在 3 秒内 | 成立 |
| C7-targets | demo 用到的 target 都存在且 ≥44×44 | 全部成立 |
| C8-response | 每次按下后，前 3 帧（100 ms）内画面差异超过阈值 | 每次都成立 |
| C9-settle | 最后 0.25 秒相邻帧几乎不变（动完了，没在抖） | 成立 |
| C10-moved | 3 秒里画面确实动过 | 成立 |

## 判官规则

- 判据只用两份账里作者的**原话**一列和制作意见账，外加上面的自动检查。审美账里「我读出的倾向」那一列是推断，不给判官。
- 每一个加分、扣分都要写出处：原话照抄一小段 + 日期，或检查 id。没有出处的分作废（`validate-scores.cjs` 会把引用和原文逐字比对）。
- 同一行原话一轮最多引用两次（第一轮判官把「超级无敌好，很心动」当万能加分引了 6 次，校验脚本此后拦截）。
- 每轮留 2–3 条「留下」，另留 1 条「意外项」：判官分数中等、但和已留下的以及以往留下的弹法都不一样的那一条，防止越筛越窄。
- 自动检查有一项不过的，不能进「留下」，可以进意外项但要写明哪项没过。

## 验收

| # | 条目 | 检查方式 | 阈值 |
|---|---|---|---|
| 1 | 每个候选都有首帧截图、3 秒 mp4、联系表、checks.json | 列目录 | 8/8 |
| 2 | 自动检查真能抓坏样本 | `tests/fixtures/` 里一个故意用 CSS transition、点击区 30 px、按下 200 ms 才动的坏候选，跑 record 后 C5/C7/C8 都红 | 三项都红 |
| 3 | 判官每一分有出处，引用逐字在原文里 | `validate-scores.cjs` | 0 条无出处、0 条对不上 |
| 4 | 留下 2–3 条 + 1 条意外项，意外项和留下的 kind 不同 | 同上 | 成立 |
| 5 | 判官不是生成者 | `scores.json` 的 `judge` 字段 ≠ `codex` | 成立 |
| 6 | 生成、录屏、判官三段各有一条能复跑的命令 | README | 三条 |
