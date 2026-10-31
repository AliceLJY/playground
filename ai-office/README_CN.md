# 像素办公室

一间可以放着看的 AI 团队办公室。11 位像素伙伴会打字、等人拍板、交活、休息和出差；送信员把纸条送到“小试AI”的桌前，再留在后墙公告板上。手机竖屏优先，电脑右侧显示团队面板。人物、桌椅、沙发和动画全部用 Canvas 2D 画，没有外部图片、字体、音乐或运行依赖。

本地服务读活动信号，网页只展示简要状态。没有服务时自动切换到约 60 秒循环的虚构演示，顶部明确标注“演示模式 · 模拟数据”。

## 怎么跑

在本目录执行：

```sh
node server/office-server.mjs
# 浏览器打开 http://127.0.0.1:3091/
node server/office-server.mjs --once
node --test tests/*.test.cjs
```

`--once` 读取已有状态，采集一次、向标准输出打印一份公开 JSON 后退出，**不写状态文件**，可以与服务同时验收而不覆盖公告板。持续服务只开一个。服务固定只监听 **127.0.0.1:3091**；没有安装常驻进程，也没有修改 launchd 或 Tailscale，后续由 owner 接。

真实配置和 token 已在本机准备好，位置是 `~/.config/ai-office/config.json`、`token`；状态与公告保存在同目录的 `state.json`。三个文件权限均为 `600`，目录为 `700`。不要复制进仓库。仓库中的 `config.example.json` 只有演示名单，来源均为 push 或送信员。

另起一台机器时，先复制并私下编辑配置，再生成 token；命令不会打印 token，也不会覆盖已有 token：

```sh
mkdir -p ~/.config/ai-office
chmod 700 ~/.config/ai-office
(umask 077; cp -n config.example.json ~/.config/ai-office/config.json)
test -f ~/.config/ai-office/token || (umask 077; openssl rand -hex 24 > ~/.config/ai-office/token)
chmod 600 ~/.config/ai-office/config.json ~/.config/ai-office/token
```

名单固定 11 个位置，顺序对应：总监、代码、双子一、双子二、创意、陪伴、探索、影像、写作、候补、送信员。每项包含 `id`、`name`、`role`、`color`（六位 HEX）、`source`；id 小写且不重复。老板是场景人物，不计入接口名单。配置或 token 修改后重启服务。

## 接口与小命令

| 接口 | 行为 |
| --- | --- |
| `GET /` | 网页 |
| `GET /api/state` | 公开只读：`{updatedAt, roster, notices, demo:false}` |
| `POST /api/report` | JSON：`{id, status, summary?}` |
| `POST /api/notice` | JSON：`{text}` |

两个写接口都要求 `Authorization: Bearer` 后接私有 token，并使用 `Content-Type: application/json`。token 不会交给网页。缺少或错误凭据返回 401，输入错误 400，请求体过大 413，类型错误 415，限流 429；保存成功返回 200 和 `{ok:true}`。

公开角色字段只有 `id,name,role,color,status,statusSince,badge`。状态为 `busy / waiting / done / idle / away / off / unknown`。每 10 秒采集；push 优先 10 分钟，重启仍有效；状态不变时保持原有 `statusSince`。公告按时间顺序保留最近 20 条。

```sh
bin/office-report builder busy "编程"
bin/office-report builder waiting "等一个决定"
bin/office-notice "有一份新的小进展。"
```

示例 id 要换成私有配置里的实际 id。两个命令自己读 token，静默、失败仍返回成功，不跟随跳转，最多等 5 秒。每个角色每 2 秒最多一条；公告和送信员共用限额；所有成功写入合计每滚动分钟最多 120 条。请求体总计最多 4096 字节，分块传输同样限制。

## 角色信号

以下是私有配置中使用的采集器；日志、会话和素材镜像只读，不读取其它仓库源码。

| 角色 | 来源 | 判断 |
| --- | --- | --- |
| CC | `cc`；`~/.claude/sessions/*.json` | 先探测 pid。活会话有 busy 就忙；否则已知活会话为空闲，没有活会话为下班。徽章显示活会话数。时间兼容毫秒整数和 ISO 字符串。 |
| Codex | `codex`；`ps -axo pid,args` | 可执行文件名为 codex；排除 app-server、mcp、login、ChatGPT/cua_node 和插件扩展宿主。有进程是新信号，无进程进入或继续无活动计时。 |
| Kimi 1、Kimi 2 | `launchd`；`com.telegram-ai-bridge-mcodex1`、`com.telegram-ai-bridge-mcodex2`；`~/Projects/telegram-ai-bridge/` 下对应的 `bridge-mcodex1.log`、`bridge-mcodex2.log` | 服务有 pid 且日志 mtime 不足 3 分钟为忙，不足 30 分钟为空闲；服务或 pid 不在为下班。 |
| Agy | `launchd`；`com.telegram-ai-bridge-magy1`；`~/Projects/telegram-ai-bridge/bridge-magy1.log` | 同上。 |
| etwin | `etwin`；`com.etwin-bot`；`~/Projects/etwin-bot/etwin-bot.log` | 只数新增完整的 bot 输出行和 distill 完成行，不保留正文。有新活动后忙 60 秒、交活 20 秒，随后空闲，除非又有新信号。首次读取、日志轮转只记游标，不重播旧活动；其它情况按 mtime。 |
| Grok Bot | `artifacts`；`~/grok-box/workspace/` | 新文件 mtime 触发一次 20 秒交活；最新文件不足 2 小时为空闲，更旧则出差。 |
| Muse | `artifacts`；`/Volumes/ColdData/产出/muse-app/imagine_media/`；`returnAway:true` | 新文件交活一次，随后出差。盘未挂载或目录不可读为 unknown。 |
| 豆包 | `artifacts`；`~/machine-data/doubao/raw/` | 同 Grok Bot。 |
| Dots | `push`，带 `waitLabel` | 从未上报时空闲，牌子写“等派活”；收到上报后按 push 有效期及无活动超时。 |
| Cobbler | `courier`，公告接口 | 送纸条，并保存到公告板。 |

已知信号 30 分钟没有更新，白天为空闲，北京时间 23:00–08:00 为下班。明确下班、unknown、镜像角色的出差规则和从未上报的纯 push 角色优先；CC 时间字段也参与无活动判断。Codex 活进程每次刷新活动时间，没有进程的轮询不会刷新。读取失败、时间无效或异常超前、无法识别的状态、扫描不完整，一律 **unknown，不装作空闲**。

bridge 使用任务指定的 mtime 降级方案。硬围栏不允许读其它仓库源码，因此没有检查 bridge.js 或接 SQLite/A2A。日志启动、维护输出可能更新 mtime；镜像可能延迟数小时，不能靠它们确认具体任务完成或等人决策，这些请用 push。素材扫描忽略 `.git` 和软链接，最多 20,000 个条目，超限为 unknown。首次看见两小时内的新素材会交活一次，旧素材只建立基线。

## 隐私与保存

- 网页收不到本机路径、进程参数、会话名、日志正文、pid 或任意任务摘要。摘要清理控制字符并截到 80 个 Unicode 码点，再归成笼统任务类型私下保存，不进入公开字段。
- 纸条只取**清理控制与格式字符后的首行前 80 个码点**，替换可识别的路径、链接、账号、疑似电话编号和金额，再限制到 80 个码点；占位符变短也不会把后文挤进来。规则清洗不等于理解所有隐私；调用方仍须提供不含真实姓名等私人信息的首行。
- 文本按文本插入，不当 HTML。静态服务只开放五个页面文件，不开放服务源码、配置、token、状态和测试；没有 CORS、统计或第三方请求。
- 状态串行写入，再原子替换。状态文件损坏会停止启动，保留原文件供修复，不会悄悄清空公告板。服务不打印凭据或原始来源错误。

## 截图验收与发布

```sh
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:3091/
```

使用本机已有的 Playwright 和浏览器（macOS 走系统 Chrome 的 Metal，其他平台走 Chromium），不安装依赖。截图和报告在 `tools/shots/`，包含 390×664 和其它四种视口、真实服务、Pages 式子路径下没有 API 的静态版本。另约每秒一张采样开场 30 秒，供人工读图。假时钟部分不用于性能结论；Canvas 绘制回调耗时另用真实浏览器时钟测。报告记录渲染器，不把回调耗时说成手机帧率。自动检查不能代替审美判断或真机实测。

- `?demo=1&view=hero`：种子 7，从零推进到 4 秒。
- `?view=queue`：明确标注的演示，20 秒，两位伙伴在老板桌边。
- `?view=notice`：明确标注的演示，35 秒，送信员正在递纸条。双方都到桌边后再展示 8 秒，不会先递到空桌。
- `?view=hero`：有服务就读真实状态，让小人按真实状态走到目的地。
- `window.__PLAYTEST__` 提供 `ready`、`snapshot()`、`setSeed(n)`、`step(ms)`；step 会冻结动画时钟。固定机位运行同一套模拟，没有另摆一张假场景，也不更换渲染路径。固定演示显式锁在北京时间 10:00；正常入口按当前北京时间换灯光。

不需要打包。发布只复制 `index.html`、`office-core.js`、`office.js`、`style.css`、`demo-script.json`。首页第三排卡片、CI 中的 `node --test tests/*.test.cjs`、Pages 复制步骤由 owner 接，本任务不改其它目录。规格见 [SPEC.md](SPEC.md)，验收与待接事项见 [HANDOFF.md](HANDOFF.md)。

## 谁会点开、AI 素材

适合想看看 AI 伙伴在忙什么，或喜欢安静看一间小办公室运转的人。

代码、像素绘制、动画和演示文案由 AI 协作完成；没有外部图片、模型、动作素材或音频。署名：**我的AI小木屋 / @AliceLJY**。
