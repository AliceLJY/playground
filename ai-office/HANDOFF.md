# 像素办公室 v1 交接

状态：v1 已完成本地验收，待 owner 验收、接首页与发布。日期：2026-11-01（北京时间）。没有 git add / commit / push。

## 交付内容

- `index.html`、`style.css`、`office.js`、`office-core.js`、`demo-script.json`：纯静态 Canvas 2D 办公室，11 位伙伴和独立老板人物；打字、排队敲门、交活蹦跳和彩带、去沙发、离开办公室、灰色问号；送信员与老板都到桌边后，纸条展示 8 秒。
- `server/core.mjs`、`collectors.mjs`、`office-server.mjs`：Node 内置模块服务，固定 `127.0.0.1:3091`，10 秒采集；push 优先 10 分钟；Bearer 鉴权、4 KiB 请求体、两级限流、清洗、原子持久化和 20 条公告。
- `bin/office-report`、`bin/office-notice`：可执行的静默小命令；token 从私有文件读入，不在参数中传递；失败不影响调用方，5 秒硬超时。
- `config.example.json` 只有演示名单。真实配置、token、state 在 `~/.config/ai-office/`，文件权限均为 600，目录为 700。token 用 `openssl rand -hex 24` 生成，未输出其值。精确扫描本目录，token 出现次数为 0。
- `README.md`、`README_CN.md`、`SPEC.md`、`tests/`、`tools/browser-check.cjs`：说明、规格与可重跑的验收入口。

## 验收结果

| 任务条目 | 实际结果与证据 |
| --- | --- |
| Node 测试 | `node --test tests/*.test.cjs`：**13 项通过**。覆盖 mtime 三档、30 分钟边界、北京夜间边界、unknown、push 第 600000 毫秒失效、statusSince、401、摘要/纸条 80 字与控制字符、按角色和全局 429、分块请求体 413、公告 20 条及重启、etwin 游标/轮转、真实模拟行走、11 人排队，以及送信员等待巡视中的老板回桌再计满 8 秒。 |
| 真实 `--once` | 输出合法 JSON，**11 个角色都有 status；CC 为 busy，徽章 3**。文件：`tools/once.json`。已兼容本机 CC 的毫秒整数时间字段。`--once` 不写状态，可并行只读验收而不覆盖公告板。 |
| 真实 HTTP | curl GET 返回 JSON；不带 token 的 notice POST 为 **401**；从私有文件读取 token、经 curl 标准输入传头的 POST 为 **200**，公告 0 → 1。证据：`tools/api-check.json`。 |
| 真实送信全流程 | 最后另打开真实服务网页，确认老板确实在巡视，再从 Node 向真实 notice 接口写入纸条，等轮询与行走。确认 **demo:false、phase:holding、bossAtDesk:true、POST 200、页面错误 0**，并打开 `tools/shots/notice-live.png` 检查双方都在桌边。程序等待老板回桌后才计满展示的 8 秒；修复前对照图为 `notice-before-fix.png`。目前公告共 **4 条验收纸条**，无私人内容。 |
| 小命令与重启 | office-notice 又发了一条验收纸条；两个命令 stdout/stderr 都为 0 字节、退出 0。停服后两命令仍退出 0，分别约 **131 / 127 ms**。重启服务后 **2 条验收公告保留**。未清空它们。重复启动第二个服务退出 1，状态文件逐字未变。 |
| 浏览器 | **85 项检查通过、13 个截图场景**。最终使用系统 Chrome **156.0.8078.74**，渲染器 **ANGLE Metal Renderer: Apple M4**，不是 SwiftShader。视口：390×664、320×568、412×700、844×390、1280×800；实际 DPR 2，Canvas 固定 2 倍内部像素，默认与固定机位同一路径。报告：`tools/shots/report.json`。 |
| 必需截图 | `tools/shots/hero.png`（演示）、`queue.png`、`notice.png`、`hero-live.png`（真实服务）。均已打开读图：忙碌者在桌前、排队在老板桌旁、送信员在老板桌前、纸条和演示横幅可读；390×664 的抽屉未出屏。另检查展开抽屉和桌面右面板。 |
| 静态发布形态 | 对同样五个静态文件，在本地 `/playground/ai-office/` 子路径运行；没有 API 时自动进入明确标注的演示。无页面脚本错误、无第三方网络请求。截图 `static-fallback.png`。没有额外打包产物。 |
| 开场动作与性能 | 开场约 30 秒按约每秒一帧保存 `opening-00.png`～`opening-30.png`，两张 `opening-contact-*.png` 已读图，确认交活、走向沙发、绕开书柜、排队及递纸条会推进。不是 30 fps 视频。另用真实时钟测 Canvas 绘制回调，p95 约 **0.50 ms**；这不等于整帧/GPU 耗时，也不代表手机帧率。 |
| 语法与私有文件 | JS/MJS `node --check`、shell `sh -n` 通过。公开五个文件不含本机信号路径；服务静态白名单不会开放 config、token、state、测试或服务源码。 |

截图、JSON 报告和测试临时目录已在本目录 `.gitignore` 中排除；保留它们是为了 owner 就地验收，不作为网页素材或发布文件。

## 降级与明确的边界

1. **bridge 用 launchd + 日志 mtime**。任务的硬围栏禁止读其它仓库源码，因此没有读 bridge.js、接 SQLite/A2A；没有改任何 bot、launchd、Tailscale 或 Cobbler 脚本。mtime 可能是启动/维护输出，不保证就是在干活。需要精确 waiting/done 请用 push。
2. **镜像只代表镜像变化**。Grok/豆包新 mtime 交活一次后闲置，2 小时后出差；Muse 交活后回出差。盘未挂、读取异常或扫描超过 20,000 条时是 unknown。只 stat 文件，不读素材内容；软链接不跟随。
3. **etwin 活动语义用临时日志验过**，本机采集时服务不在，真实状态为 off；没有为了验收去启动 bot 或伪造其日志。其它进程关闭、新镜像到来等边界也用受控测试验证，没有改变运行中的伙伴。
4. **超时规则有明确优先级**：未知信号绝不变成 idle；已知无活动满 30 分钟白天 idle、北京 23–08 点 off；明确 off、镜像 away、从未上报的 Dots 例外。CC 活会话也看更新时间；活 Codex 进程持续刷新信号，无进程的轮询不刷新。
5. **摘要不进公开状态**，只私下存笼统类型。纸条先截原首行 80 字，再清洗和脱敏，避免替换路径后把第 80 字后面的内容挤进来。脱敏不是语义匿名化，Cobbler 调用方仍须提供不含私人姓名等内容的首行。
6. **未测真机 Safari/安卓浏览器，未发布线上**。手机检查是 Chromium 视口与触控模拟；审美和长期看着是否舒服仍由 owner 判断。开场动作证据是逐秒截图，不是全帧操作录屏。

## Owner 接手

在本目录启动命令是 `node server/office-server.mjs`。本轮留有临时验收服务供本机打开 `http://127.0.0.1:3091/`；它没有注册为常驻服务。若端口已关闭，重新执行该命令即可；不要同时启动两个持续服务。

- 接首页第三排“AI 幕后”卡片。
- 在发布 CI 中加入本目录的 `node --test tests/*.test.cjs`。
- Pages **只复制** `index.html`、`office-core.js`、`office.js`、`style.css`、`demo-script.json`。
- 按自己的安排配置 Tailscale serve，并在 cobbler-notify.sh 中调用 `bin/office-notice`。这两步不在本任务改动范围内。
- 验收后由 owner 提交；本任务没有提交或推送，也没有读取、修改或清理其它制作者的新目录。

范围内没有留下未完成的必需实现；剩余工作是上述外部接线、上线后复验和真人审美确认。
