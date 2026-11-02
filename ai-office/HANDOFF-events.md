# 像素办公室：五个小事件

状态：实现、Node 与本地浏览器验收完成，待 owner 看图、接 wrapper、重启及发布。2026-11-02；基准 HEAD `9c95916`，开工 fetch 后 main 与 origin/main 一致、工作区干净。没有 git add/commit/push，没有重启正式服务、接触私有配置或修改 scripts、sync-bridge、launchd、Tailscale、funnel、发布 workflow。只运行了自动退出的临时测试服务。

## 修改文件

- `server/scene.mjs`：真实状态转换观察、snack/supper 判定、轮次时间和 argue 日记、统计、快照投影。
- `server/office-server.mjs`：quota 认证接口、持久化、过期过滤；采集及两个 report 路径统一观察状态转换；guest 时间降精度。
- `bin/office-quota`：新可执行小命令。
- `office-core.js`：统一优先表、各类活动及有界队列、真实寻路、桌面食物、固定台词、严格校验、日记模板。
- `office.js`：像素烟团／火苗／星星／拖鞋／饼干／西瓜／面碗／沙漏、气泡与动作、抽屉状态、轮询接收、机位与手机取景、MV 隔离。
- `demo-script.json`：185 秒演示时间轴。
- `tests/events.test.cjs`、`tests/events-server.test.cjs`、`tests/events-browser.cjs`：新检查。
- `tests/reception-server.test.cjs`：仅给原有 guest 顶层字段白名单加入 `quota`，原断言保留。
- `SPEC.md`、`README.md`、`README_CN.md`、本文件：规格、接口与交接。

没有改 index.html/style.css、MV 两文件、既有契约 fixture 或其他玩意；不增加依赖、静态素材、构建步骤。证据位于已忽略的 `tools/shots/`，临时测试状态位于既有 `tools/.test-data/events-*`，没有使用真实 token。

## 信号和服务端字段

### 吵架

已读 `applyMeeting`：`adopted/rejected/open` 是上报后直接替换 slide 的**本轮计数，不是服务端累计值**。因此不取相邻轮差值。切新轮先清旧 slide，未附新计数就不沿用上一轮反驳；相同轮次补报数字不另触发。

新增 `scene.meeting.roundAt`，只在 round 改变时写入。私人快照精确 ISO，guest 向下取整到分钟；没有这个字段的旧 feed 保守使用 meeting.since。前端只有 round 改变（首次看到一个新鲜轮次也算）且 rejected >=1 才排队，键为 `meeting.since|round`。服务端相同键也只记一次 `argue {round,rejected}` 日记。收到及开演前都检查两分钟期限，晚开页面不补旧会。

CC 加会议成员中除 CC 外、按排序后的 ID 名单和 since+round 稳定哈希选出的 reviewer 到白板前。走到位后固定台词 4 秒，实际合拢到同一坐标才进入烟团 2.5 秒，散开叉腰 3 秒后返回原会位。反驳 >=3 时四句变五句、烟团放大。没有流血或打脸动作。约 10 秒是到位后的主要演出；进出白板的寻路另计，初次看到会议时路途可能更长。通话、等待拍板、会议结束或换轮立即让位。

### 交活请客

`reduceScene` 接收真实 before/after：前一状态 busy、本次 done，且从前一 statusSince 到转换时至少 20 分钟。`scene.snackAtById` 持久化同人每小时一次的冷却，触发写 `scene.snack = {id,at}`、`snack {ids:[id]}` 日记、`stats.snacksTotal` / `stats.today.snacks`。

采集、私人 `/api/report`、公开的按 bot 身份 report 都经过同一观察器。两份快照带 snack，guest 只含 ID 与分钟级时间。轮询期间多人交活可由最近的 snack 日记补齐候场，按 ID+分钟与最新 scene.snack 去重（同人一小时冷却下不会合并合法的两次请客）。

演员逐个走到非 off/away 同事的工位旁，不站进收件人的椅子里；工位主人正在开会或罚站也仍算这张工位有人。送达才画新像素饼干，每份保留 300 秒，位置与访客礼物分开。出门的收件人跳过；真实工作／罚站／接待可中断送礼，已送达的保留，不补演被打断的余程。送完若已经 idle，直接交回正常游戏角走位；否则回工位。

### 吃瓜

无服务端字段、无随机触发。来源顺序为正在争论 > 正在持纸条递信 > 有人 waiting。只从**已走到游戏角**的 idle 非邮差、非会议／通话／接待／罚站／请客者中，按桌号取 2–3 位；不足两位不演。到游戏角前的闲人不凭空拉过去。朝事发方向探头，捧像素西瓜，固定「啧啧」「咋了咋了」或像素西瓜气泡。所有来源结束后再留 3 秒，随后正常走回游戏角；参与者一有真实工作立即退出。

### 撞额度罚站

`POST /api/quota {id, minutes?, clear?}`，同 `/api/report` 的 Bearer 认证和 4096 字节体限制。id 在当前名单内；minutes 必须为 1–300 整数，默认 60，超限返回 400（不截断）；clear 必须为布尔，true 解除。拒绝额外字段。认证失败 401，按 quota:id 和共享预算限流 429。

`state.quota[id] = until` 存毫秒数，原子持久化；私人和 guest 都只暴露尚未过期的 `quota: {id: untilISO}`。GET 即时过滤，不必等下一次 poll。**真实状态从非 busy 转为 busy** 时，无论来自采集、私人还是 bot report，自动清掉对应 quota 并记解除日记；连续重复的 busy 不当成恢复。额度接口本身不写角色状态。日记固定为「Agy 撞额度，罚站中」／「Agy 额度恢复，回座位」。

```sh
bin/office-quota agy          # 默认 60 分钟
bin/office-quota codex 90
bin/office-quota agy clear
```

命令沿用 office-report 的静默、失败不影响调用方、5 秒硬超时、4.5 秒 fetch 超时和不跟随重定向。token 只在 Node 内从 `~/.config/ai-office/token` 读取，不进入命令参数或输出。由于信封不允许改 `bin/send.mjs`，读取与请求逻辑写在新命令的 Node heredoc 中，没有扩大改动范围。owner 自行在四个 wrapper 中接调用，本轮没有改它们。实际凭据读取／生产 POST 没有执行；验证了 shell 语法和非法参数静默退出，真实 HTTP 行为用隔离测试凭据验过。

### 深夜送夜宵

`reduceScene` 在北京 23:00（含）–03:00（不含）第一次看到非空 busy 名单时，写 `scene.supper={at,ids}`，持久化 `scene.supperNight`（按凌晨 03:00 划夜晚），记 `supper {ids}` 日记、`stats.suppersTotal`，也记录 `stats.today.suppers`。午夜不重复、次夜可再触发，重启不忘记当夜记录。

名单是触发当刻的 busy 同事；后续状态改变不抹掉已经发生的加班信号。借用已有保安继续送，或从门口新出一个同款保安；逐桌送到才画面碗，保留 600 秒。送完回门口，已有保安继续自己的巡逻进度；临时保安退场。不会新增第二个同时在场的保安，也不占用同事的活动名额。

## 优先表、队列与边界解释

`ACTIVITY_PRIORITY`：**真实 busy/waiting/会议/通话（含递信） > 罚站 > 接待 > 吵架 > 请客 > 吃瓜 > 游戏角**。同类型一个正在演、最多三个候场，FIFO；满了丢最老候场项。收到及准备开演时都过两分钟期限，切后台恢复也按墙钟清候场。罚站一旦开始可持续至 until，其他额度报告仍受三项／两分钟候场约束。

两处信封文字需要说明：

1. 采用 Constraints 中的明确优先表，因此仍在 busy、开会或通话的人不会为了罚站离开真实工作；额度信号仍存在。它实际转 busy 时服务端会清除。这里优先于正文里宽泛的“画面优先演罚站”。
2. 吵架是**其自身互审会议内部的演出**，成员本来就已被该会占用，底层 CLI 仍可报 busy；不与该会抢占名额。其他会议、通话和接待者都不会因此被借走。否则“开会 > 吵架”会让这种会议室演出永远不可能发生。

另外两项明确实现边界：主要争论段约 10 秒，寻路另计；演示从 150 延到 185 秒，65 秒第 2 轮反驳改为 0，77 秒第 3 轮反驳 3 条，散会延到 94 秒，保留原 meeting=73 秒和 booth=112.5 秒机位。20 秒送礼、34 秒接待未挪动。

所有动画、食物保留时间按本地模拟时间推进，后台页面暂停演出；quota 到期与候场过期用墙钟。刷新后不会恢复上一页面的播放进度／桌上食物，仍按新鲜信号决定是否演出。guest 向下取整分钟可能使补演窗口最多提前 59 秒结束，宁可少补演，不延长过期窗口。两页因轮询、状态与排队差异不保证逐帧同步。这里沿用既有本地演出模型，没有增加跨页进度服务。

## 复现、截图和验证

使用种子 7，从同一 demo 的零时刻真实 step 到目标，不摆人物、不改渲染品质。截图默认 DPR 2，竖屏 390×664、横屏 1455×782：

| 入口 | 秒数／实际状态 | 图片 |
| --- | --- | --- |
| `?view=argue` | 84.5，smoke，两人同坐标且身体／名牌隐藏 | `tools/shots/argue.png`、`argue-landscape.png` |
| `?view=snack` | 112.5，送礼中，已有饼干 | `snack.png`、`snack-landscape.png` |
| `?view=melon` | 18，两位闲人凑到一起 | `melon.png`、`melon-landscape.png` |
| `?view=quota` | 93，Agy 已在墙边 | `quota.png`、`quota-landscape.png` |
| `?view=supper` | 154，保安送面中，已有面碗 | `supper.png`、`supper-landscape.png` |

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tests/events-browser.cjs
NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs
node --check office-core.js
node --check office.js
node --check server/scene.mjs
node --check server/office-server.mjs
sh -n bin/office-quota
git diff --check
```

- 基线 **87/87**；完成后 **111/111**，新增 24 项（引擎 17、服务端 7）。原 MV、接待、房间、布局测试保留全绿。日志 `events-baseline-node.txt`、`events-node-final.txt`。
- HTTP 覆盖 token、坏 ID／字段／数值、分钟上下限、clear、持久化和重载、无需 poll 的到期过滤、采集／私人／bot report 转 busy 自动清、19／20 分钟和小时冷却、23:00／03:00／跨午夜／次夜、两份快照和任务文字不外泄。不会读取生产配置或访问正式服务。
- 引擎每 20 ms 真实推进两种布局，验证五件事全流程、各步 status/statusSince 不变、每步无家具碰撞、烟团阶段两人坐标重合、固定五句／哼、饼干和面碗到期、吃瓜散回、优先级、旧轮不重播、迟到跳过、排队上限／FIFO／过期、轮询多次交活补齐、布局转换、已有保安恢复。
- 新浏览器 **58 项检查通过、23 张截图、页面错误 0**；十个主机位实际状态与请求一致，人物身体都在可视区，吃瓜和请客机位已针对手机修正取景。另验五种壁纸、HTTP 坏快照整份拒收、真实轮询 quota、320 宽的 Pages 子路径。报告 `events-browser.json`，最终控制台 `events-browser-final.txt`。
- 既有接待浏览器 **38 项通过、19 张截图、页面错误 0**；真实按钮、双页面挑人／合照归属、429、坏字段、后台候场过期、壁纸、320／390 游戏角、30 秒开场录屏均通过。日志 `events-reception-browser.txt`，报告 `reception-browser.json`。这一轮只验证接待原有流程，没有改其浏览器检查脚本。
- **MV 的 10 / 31.5 / 53.6 / 75.9 秒，当前与 HEAD 基线 canvas PNG 逐字相同**；MV 两文件未修改。不是仅用 Node 测试推断画面没变。
- 系统 Chrome **156.0.8078.74**，Canvas 2D 默认渲染路径，DPR 2；真实时钟开场绘制回调 p95 **0.70 ms**，不是手机 FPS。`reception-opening.webm` 是本轮约 31 秒正常入口实际录屏（含点来谈事）；`events-opening-contact.png` 是每两秒抽帧查看，未声称人工逐一看完全部视频帧。
- 已打开检查十个机位及开场联系表；第一轮发现烟团像堆方块、手机事件不在首屏，现已改为连续云团轮廓并加入事件身体可视区断言；又发现请客完回桌再去游戏角拖慢原 games 机位，已按当前 idle 直接归还正常走位，原接待浏览器回归通过。

最后有效证据是上面 final 日志和两份 JSON；其他 events-* 日志保留首次失败便于核对，不作为通过凭据。没有单独打包产物，测试已包含静态 Pages 子路径；未发布、未复验公网、未测真机 Safari/安卓。

## Owner 下一步

看十张图与动画口味，接四个 wrapper 的 office-quota 调用，再按自己的流程重启服务、提交、发布。正式服务与旧网页在重启／刷新前不会自动拥有新服务端判定。重启后检查真实长活交付、真实轮次和当夜的首个 busy；本轮没有为了验收伪造生产信号。
