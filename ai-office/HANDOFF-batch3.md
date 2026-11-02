# 第三批交接：往日回放与防翻车安检门

基准 HEAD `a04eed9345b647a3d36782b0a069de2b931b9771`。开工 fetch 后与 origin/main 一致。改动均在 `ai-office/`；没有 add/commit/push、安装依赖、重启正式服务、修改生产配置／hook／launchd／Tailscale／发布流程。`mv.js`、`mv-script.json` 无改动。**早期测试有一次隔离疏漏，见文末偏离记录；不能把本轮描述为全程未触碰真实审计路径。**

## 文件与复用

| 文件 | 变更 |
| --- | --- |
| `server/scene.mjs` | 状态时间线、换日归档、安检计数与两分钟合并、快照白名单投影 |
| `server/office-server.mjs` | 历史路由、Bearer gate、30 秒去重、采集器挂接、guest 分钟取整、持久化新字段校验 |
| `server/history.mjs`（新） | 有界文件读取、共享严格校验、mtime 缓存、日期列表、guest 投影 |
| `server/makoto.mjs`（新） | 只追新增字节的审计尾读器；只向外返回被拦截的时间 |
| `bin/office-gate`（新、可执行） | 复用 office-quota 的静默、5 秒、失败返回 0 约定 |
| `office-core.js` | 两布局 gate 行程、同档优先级、事件入口复用、回放时钟与验证器 |
| `office.js` | 往日读取、实时快照暂存与恢复、横幅、安检门／文件夹绘制、木牌、合照异步隔离 |
| `index.html`、`style.css` | 往日标签／列表／回放横幅；手机按钮排版 |
| `demo-script.json` | 延至 400 秒；344 秒红灯 ×3、365 秒绿灯，既有事件时间不动 |
| `tests/batch3.test.cjs`、`batch3-server.test.cjs`、`batch3-browser.cjs`（新） | 实际归约、HTTP、假审计、双布局真实行走、隔离浏览器回归 |
| 既有 server／room／events／reception／batch2 测试 | 明确关闭 Makoto；优先表预期加入 gate |
| `SPEC.md`、`README.md`、`README_CN.md`、本文件 | 规格、接口、操作方法和实际证据 |

沿用现有队列、BFS、活动优先表、文件夹绘制、事件模板、guest 限流、原子写和采集器十秒超时规则。归档读取及尾读仅用 Node 标准库；没有第二套动画、数据库、依赖或构建步骤。源文件就是发布产物。未添加 wrapper 收尾 hook，留给 owner 接入。

## 字段与接口

| 位置 | 内容与边界 |
| --- | --- |
| 私有 state 的 `scene.timeline` | `{at,id,s}[]`，s 只允许 busy/waiting/done/idle/away/off/unknown；无任何任务文字 |
| 私有 state 的 `scene.timelineTruncated` | 超出 3000 条后置 true，不删旧条；下一天清除 |
| 时间线辅助状态 | `timelineLast` 保存各 id 上次状态；`timelineNeedsSnapshot` 控制全员快照。重启总是重新要求一份全员快照 |
| 归档 | `{day,events,stats:{today},timeline,timelineTruncated?}`；沿用目录 0700、文件 0600、临时文件 rename |
| `GET /api/history` | `{days:[{day,events:数量,timeline:数量}]}`，最新 14 份有效真实文件，日期倒序 |
| `GET /api/history/YYYY-MM-DD` | 只读该列表中的归档；旧档省略 timeline 时规范为 `[]` |
| `/guest/api/history` 及日期子路径 | 同形状，每个事件／时间线 at 向下取整到分钟；既有 guest 限流，CORS 只允许 Pages origin |
| 公网路径 | Pages 继续走 8443 的 `/office/api/history…`；未改 Funnel |
| `POST /api/gate` | 既有 Bearer；精确 `{id,ok}`，名单 id、布尔 ok；同 id 30 秒内重复回 200、不入账 |
| 两份快照 `scene.gate` | `{at,id,ok,n}` 或 null；n ≥1，guest at 分钟级 |
| 两份快照 `events` | `gate {at,id,ok}`；没有原文／工具名／session id；guest at 分钟级 |
| `stats` | `gatesBlockedTotal`、`gatesPassedTotal` |
| `stats.today` | `gatesBlocked`、`gatesPassed` |
| 私有合并状态 | `gateBlocked[id]={at,n}`，保存该 id 最近一次新拦截事件的窗口起点与次数 |
| config 顶层 `makotoAudit` | 默认 `~/.claude/makoto_state/audit.jsonl`，字符串覆盖，null／空字符串禁用；未修改真实 config |

每次伙伴归约只追加变化状态；服务启动后第一轮和北京换日后第一轮为全员相同 at 快照。时间线随 state 持久化，并在 `rollDay` 中先归档再清日；两份实时快照均不含当天时间线。达到上限后也不补造其后的状态。

历史读取先检查文件类型、大小和严格日期，再逐字段校验。最大 2 MiB；读取本身也限到 2 MiB+1，避免 stat 后文件增长绕过上限。不跟随符号链接。日期必须在列表中；非法字段、额外文字、坏文件、路径穿越统一返回 `{"error":"Not found"}`，不回原文。解析缓存同时包含有效／无效结果，key 为 inode、mtime、ctime、size，上限 64；未变化文件仍检查元数据，但不重读解析。列表含最新 14 份有效文件，不要求日期连续，也不虚构缺失日期。

旧快照可省略所有新字段；新字段若存在则验证时间、id、布尔、整数及对象白名单。归档和页面共用 `office-core.js` 的验证器。旧 events 的 500 条上限沿用，因此回放只能展示实际保留下来的记录。

## Makoto 数据边界

- **只提取三个字段的位置：`server/makoto.mjs:29`**，`const { ts, event, exit_code } = JSON.parse(...)`。JSON 原行只在有界内存缓冲／临时解析对象中存在；从不读取 findings 属性，向外只返回合格的 ts 毫秒值。允许三个 live event；严格数值 exit_code 2 才记 CC 红灯，0 不记绿灯。
- `server/makoto.mjs:17` 起处理首次、文件缩短或 inode 更换：定位新 EOF、清残行。单轮读取最多 256 KiB，半行等下一轮，超长单行丢弃至换行，缺失／坏行静默跳过。游标不进 state；重启不重演旧审计。
- `server/office-server.mjs:161` 是十秒超时包裹，`:166` 建立启动基线，`:208` 将合格 ts 映射为 `cc` 拦截。超时只打固定文字；解析／文件错误不带原行。上一轮读取未结束时不再并发开读。
- `server/scene.mjs:224` 合并同 id 距上一次新事件不足两分钟的拦截：每次增加累计／今日次数，窗口 n 累加，但不增加事件、不新起演出。到两分钟边界才开启下一次；绿灯独立计数。POST 的 30 秒去重在此之前，重复请求连计数也不加。
- 正常审计用源 ts；迟到到另一北京日或未来 ts 使用本轮观察时间，防止旧行把当前 scene 再次倒回旧日、覆盖已归档数据。没有修改成员 status/statusSince。

唯一标记假 findings 的测试同时检查 state 文件、私有快照、guest 快照、events 和捕获的日志；均不含标记。测试假数据也给 session_id/tool_name 塞同一标记。隐私验证材料只来自假文件；未输出真实 audit 原行或以其作为验收证据。

## 回放与事件演法

回放从首条时间线／事件前一分钟开始（不早于当天零点）。60×／240×／600× 只推进记录时钟，步行、气泡等沿用正常模拟速度。连续二十个记录分钟没有状态变化或事件，跳到下一条记录前一分钟；“下一件事”也按下一条记录跳。末条记录后一分钟停钟，已经开始的动画继续走完。每人只采用已到时的最后一条状态；未出现过的仍是 unknown 灰色问号。没有时间线的旧档显示原定提示；截断档另提示后续座位状态未记。

页面轮询继续，但回放期间只保存最新实时快照，不应用到回放模拟。退出立刻恢复实时。探班／来谈事／合照入口隐藏，函数内也拦截；开始回放会失效此前尚未完成的异步合照，不补欢迎。guest visit 心跳照常。演示、壁纸、MV 无往日标签；历史接口失败隐藏标签。回放中的木牌只使用存档 today；不存在的历史累计显示横线，避免伪造总账。

所有事件到点都用与“今天”相同的固定模板更新横幅；能演的再进已有入口。动画服从正常的在场条件、活动优先级、最多三个候场和队列实际模拟时间期限；密集记录不保证每一场都完整播完。记录时钟加速不会让队列仅因超过两个“历史分钟”就立即失效。

| event kind | 回放演法 |
| --- | --- |
| visitor | `setVisitors(n)` 进门／逛办公室；回放展示窗口为 30 个模拟秒 |
| treat | `treat(treat,at)`，原有探班送礼／答谢 |
| reception | `meet('chat',at)`，原接待行程；旧事件未保存菜单类型，使用通用聊聊 |
| meeting | `setScene` 建立原 review/huddle 会议，原成员寻路入座 |
| round | 更新会议 round、roundAt；原白板表现，无猜测的采纳／反驳统计 |
| argue | 有对应会议时，进原吵架队列，使用事件中的 round/rejected |
| meeting-end | 清会议，沿正常路线返回 |
| handoff | 原 dispatch 入口：在场走到工位递文件，否则原电话亭／飞行文件夹 |
| return | 移除 dispatched id，复用原回交文件夹 |
| call／call-end | 原电话亭咨询开始／结束 |
| snack | 原点心队列、走访与桌面食物 |
| supper | 原保安夜宵行程 |
| quota | 原罚站／恢复入口；旧事件没有期限，使用既有默认 60 分钟（记录时间）或 clear |
| souvenir | 原特产行程、纸堆、云糖 |
| radar | 原雷达行程、当天卡片，使用记录 n/added |
| gate | 本批同一安检门入口，红灯返工／绿灯送 CC；事件未保存合并 n，回放只演该事件一次，不猜 n |
| guard | 原巡检完成灯与结果；归档只记结果，不补造整段巡逻 |
| 其它符合结构校验的 kind | 不加动画，横幅与“今天”都显示固定“记录了一件事” |

guest 取整后，可能出现同人、同分钟、同结果的两条合法过关记录。实时／回放均按出现序号区分，重复轮询不重复演，同分钟的两条也不误合成一条。

## 安检门与机位

两布局都在逻辑 `(124,164)`、CC 工位旁的过道放门，门不是障碍，不改网格。先在自己工位拿文件夹，到门后停四秒：红灯返工，绿灯继续送到 CC 桌，再回自己座位坐两秒。文件夹复用既有物件。本人 away/off/unknown 不演。真实工作／会议／电话／递信 > 罚站 > 接待 > 吵架＝安检门 > 请客／特产／雷达 > 吃瓜 > 游戏角。

门框 #739C82、灭灯 #72796e、红灯 #EB6B55、绿灯 #7AC87B（sRGB）。附近在场者可说“又被拦了”；门顶“拦下！”／“拦下 ×n”／“放行”，演员气泡在门右侧，让灯露出来。木牌保留标题与原三行，新增第五行“安检门拦下 N 次”；字号随宽度缩小、行距 8 逻辑像素。MV 沿用旧行距和旧行数。

`?view=gate`：种子 7，从零真实推进至 347 秒，必须实际处于 signal 红灯阶段。演示红灯在 344 秒、绿灯 365 秒，n=3 的红灯在演示木牌也记三次。没有挪动任何旧演示事件。

## 实测与复现

在 `ai-office/` 运行：

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tests/batch3-browser.cjs
NODE_PATH="$(npm root -g)" node tests/events-browser.cjs
NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs
NODE_PATH="$(npm root -g)" node tests/batch2-browser.cjs
node --check office-core.js
node --check office.js
node --check server/scene.mjs
node --check server/office-server.mjs
node --check server/history.mjs
node --check server/makoto.mjs
sh -n bin/office-gate
git diff --check
```

基线 **145/145**，最终 Node **171/171**；日志 `tools/shots/batch3-baseline-node.txt`、`batch3-node-final.txt`。新增 26 项，含双布局红／绿各自独立用例。完整覆盖：启动／换日全员快照、仅状态变化、3000 停记与截断归档、重启恢复、快照排除时间线；历史错误／大小／日期／路径穿越／mtime／CORS／guest 限流；鉴权／布尔／名单／30 秒边界；审计 EOF／exit 0／半行／256 KiB／截断／换 inode／两分钟边界／无原文外泄。

行走测试按 10 ms 或 20 ms 真正步进，不设位置跳到目标。红灯到门→回座，绿灯到门→送 CC→回座全部阶段实际发生；两布局另外对全部 11 个工位（含 CC）各跑红／绿，逐步检查家具碰撞与最大位移，20 ms 上限 1.181 逻辑像素。逐步比较 status/statusSince 不变；另验未知／离场不演、工作／罚站／接待优先。

同分钟重复过关的回放用例先在修复前实际失败（只演一次，预期两次），证据 `batch3-rounded-replay-red.txt`；最终同一真实模拟通过。读图发现灯被气泡盖住后，调整气泡并留下实际灯像素断言；木牌使用真正 fillText 的文字包围盒验证两布局五行无交叠、宽 ≤260、纵向在木牌内，避免只测配置常量。

最终浏览器结果（顺序运行，不并行抢资源）：

| 回归 | 结果 | 日志／报告 |
| --- | --- | --- |
| batch3 | **46 项、6 图、错误 0** | `batch3-browser-final.txt` / `batch3-browser.json` |
| events | **58 项、23 图、错误 0** | `batch3-events-regression.txt` / `events-browser.json` |
| reception | **38 项、19 图、错误 0** | `batch3-reception-regression.txt` / `reception-browser.json` |
| batch2 | **31 项、15 图、错误 0** | `batch3-batch2-regression.txt` / `batch2-browser.json` |

新浏览器实际点击往日／选天／倍速／下一件事／退出，检查时钟推进、二十分钟空闲跳过、无记录 unknown、旧档提示、隐藏交互和无相关请求、轮询暂存及退出立刻恢复；Pages-origin 走 guest 历史且 visit 心跳不断，空列表、演示／壁纸隐藏也通过。两布局实测红灯像素，另测绿灯像素；门顶倍数与木牌计数一致。

**MV 10 / 31.5 / 53.6 / 75.9 秒 canvas PNG 与 HEAD a04eed9 逐字节一致**，三个既有浏览器脚本均实际重比；并非只检查文件未改。Chrome **156.0.8078.74**、Canvas2D、DPR 2。默认入口 30 秒真实时间回归继续通过；保留 `batch2-opening.webm` 和 `reception-opening.webm`，已打开本轮 batch2 的 0／15／30 秒截图，开局人物、抽屉、文字均正常，未声称人工逐帧看完视频。本轮默认绘制回调 p95 为 **1.0 ms**（batch2），接待录屏 **0.60 ms**，均低于 12 ms；不是实体手机帧率。

最终所有 JS 语法、shell 语法及 `git diff --check` 通过。wrapper 仅实跑非法 id，确认退出 0 且 stdout/stderr 为空；没有用有效 id 调真实 token／正式端口。Bearer HTTP 行为由临时服务测试覆盖。

## 六张图

`tests/batch3-browser.cjs` 自起临时 HTTP 服务、临时 history，禁用 Makoto，拦截外网请求；本机页走真实 HTTP，Pages-origin 页面通过代理访问同一临时服务的真实 guest 路由，不连接正式 Funnel。竖屏 **390×664 CSS**（含浏览器栏的可视高度）、横屏 **1455×782 CSS**，分别触发 360×740 与 640×420 逻辑布局，DPR 2、Chrome 默认 Canvas2D 路径，无额外画质分支。

| 图片 | 复现和逐张看到的内容 |
| --- | --- |
| `tools/shots/replay-list.png` | 真实打开“往日”；11-02／11-01 日期、事件数／座位记录数、选中标签清楚，没有横向溢出 |
| `tools/shots/replay.png` | 11-02 回放 10:02；240×、跳转／退出按钮及 10:00 安检事件文字完整；无记录伙伴显示灰色问号，交互按钮消失 |
| `tools/shots/replay-landscape.png` | 横幅在左侧画面上方，右侧手记列表仍可读；完整横屏办公室及多个问号可见，木牌未知累计显示横线 |
| `tools/shots/gate-red.png` | 347 秒，Codex 抱文件夹站门中，红灯露出，“拦下 ×3”和右侧“我再改改”分开；CC 旁“又被拦了”可见 |
| `tools/shots/gate-red-landscape.png` | 同阶段横屏；红门／气泡与 CC 工位关系清楚，右侧木牌五行不重叠，拦下累计为 3 |
| `tools/shots/gate-green.png` | 从红灯继续真实推进到 Kimi 绿灯 signal；绿灯、“放行”、“这回过了”和文件夹均可见 |

最终生成的六张图均逐张打开复核，以上描述来自本轮图像。证据保存在已忽略的 `tools/shots/`；开发失败日志保留作排查，不作为通过证据。

## 明确边界与偏离

1. **测试隔离疏漏**：早期旧 `tests/room.test.cjs` 四份配置漏写 `makotoAudit:null`，因此早期 Node 回归曾调用默认真实审计路径的打开／stat／定位末尾分支。这不符合“不读真实 makoto_state”的信封约束。没有为追查而再次访问该路径；不能证明当时路径不存在，也不能断言其后 poll 从未读到新增字节。没有打印真实 audit 内容、没有写生产文件。已补齐四处并检查所有 createOffice 测试入口；最终回归全部显式禁用或使用临时假 audit。另：开局沿旧启动约定读过围栏外共享规则／待办说明，未修改，亦不应在本任务围栏下继续执行。
2. 旧档不含状态、接待类型、额度期限、巡逻起点或 gate 合并 n，不能还原这些事实。上表列出的默认演示方式只用于复用动画；身份 status 仍由时间线独占，unknown 不被动画推成 idle/busy。历史总累计缺失显示横线。末事件后一分钟停钟是减少无内容尾段的实现选择。
3. 日期列表定义为最新 14 份有效存档；缺的日期不补。审计跨日迟到／未来时间使用观察时间，理由见上。超长审计单行丢弃，限制内存；正常格式与微秒时间已用假文件验证。
4. 未部署、未重启、未接 owner wrapper、未读真实源来验证效果；Pages 检查是隔离的 origin/guest 路由模拟，不能称为公网复验。未测实体手机 Safari／安卓、没有 WebGL/GPU FPS 声称。回调 p95 只代表本机 Canvas 绘制耗时。

owner 后续可查看以上六图，再自行接 wrapper、提交／发布并重启正式服务；本轮没有执行这些动作。
