# 验证记录

平时的验收条目在 README 的「验收」表里；这里只记专门的一轮复核。

## 2026-11-25 Duet 小游戏巡检复核

外部 AI 测试员 Duet 在电脑 Chrome 里试玩后报了两条。逐条用 Playwright 真浏览器复现后再定。

### 1. 账单「多謝」章压住一行字末尾

- 复现：`tools/bill-check.cjs` 在 390×664 打开 `?view=first&t=6&mute=1`，离席出茶单，拦下茶单画布上的 `fillText` / `strokeRect`，按当时的变换矩阵算出每行字的包围盒和红章四个角，判相交。三种账（什么都没做、开局走查那样的一趟、礼数和笼数都多的长行）。
- 结论：成立。红章中心在 (850, 950)，外框角最高到 y≈852，而第五行「N 笼 N 件 · 礼数：谢了 N 次 · 被谢 N 次 · 报纸 N 版」的基线在 y=854、常被压到满宽（右端到 x≈960），三种账全都压住这一行末尾的「报纸 N 版」。
- 改法：红章往下挪 40 像素（中心改到 `Hc - 190`），落在「合计」那一行旁边、礼数那一行字脚下面；下沿离署名行在水平方向错开。`index.html` 两个脚本的 `?v=` 改成 `20261125a`。
- 检查：`NODE_PATH="$(npm root -g)" node tools/bill-check.cjs http://127.0.0.1:8782/datai-teahouse/ <out>`。修之前三种账全红（退出码 1，报「压住了：「3 笼 2 件 · 礼数：谢了 1 次 · 被谢 2 次 · 报纸 1 版」」），修之后三种账全绿、退出码 0，红章外框角 `[[752,922],[918,892],[948,1058],[782,1088]]`。
- 顺带看到的（没改，不在这次范围）：笼数种类很多时（一趟拿了八九种点心），第四行字号压到下限 26 px 仍超出纸边，末尾被裁。正常一市拿三四种不会碰到。

### 2. README 的上报地址和代码不一致

- 复现：对照 `src/game.js` 与两份 README。
  - 代码：`const TRACE_ENDPOINT = 'https://tea.aliceljy.xyz';`，`tests/publish.test.cjs` 只放行 `tea.aliceljy.xyz` 或一个 workers.dev 地址；请求在 `fetchRemote` 和 `postTrace` 两个函数里共三处 fetch（`/traces?n=12`、`PUT /trace/<k>`、`POST /trace`）。
  - README 验收第 7 条原句：「页面里唯一允许的地址是 `TRACE_ENDPOINT`（只能是 workers.dev），请求只在 game.js 两处」（英文版 "a workers.dev address only … two places in game.js"）。
  - README「页面」一段原句：「回来接着坐的话离席时只更新本机那条、不重复上传」（英文版 "only updates the local copy, no second upload"）；代码自 d1eb03e 起第二次离席会凭凭条发 `PUT /trace/<k>` 把服务端同一条换成完整的，README 的服务一段也没写这个接口。
- 结论：成立，文档落后于代码。
- 改法：只改两份 README，对齐代码现状：第 7 条写明地址只能是 `https://tea.aliceljy.xyz` 或 workers.dev、现在填的是前者，请求在两个函数里共三处 fetch；「页面」一段改成「不再新留一条，凭凭条 PUT 换成完整的」；「服务」一段补上 `PUT /trace/<k>`（凭条对得上、3 小时内、进门时刻不变、GET 不吐凭条）。没有动 `worker/` 和 `src/game.js`。
- 检查：纯文档对齐，不跑红绿；`node --test tests/*.test.cjs` 的发布扫描（README 里不许出现本机路径、寺庙词）照常通过。

### 改完后的全套检查（2026-11-25）

- `node --test tests/*.test.cjs`：27 过 0 失败。
- `tools/browser-check.cjs`：16 项全过。
- `tools/walkthrough.cjs`：开局流程全过。
- `tools/traces-check.cjs`：17 项全过（假地址，Playwright 作答，不碰线上服务）。
- `tools/bill-check.cjs`：三种账全过。
