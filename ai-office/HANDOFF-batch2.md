# 第二批交接：手记、小黑板、特产与雷达

2026-11-02。本地实现和验收完成，待 owner 看图及决定后续重启／发布。基准 HEAD `1b8f807`，开工 fetch 后与 origin/main 一致、工作区干净。只改 ai-office 内文件；没有 git add/commit/push、安装依赖、重启正式服务或修改私有配置、launchd、Tailscale、pages.yml。测试只用临时状态、临时台账及临时本地端口；没有读真实雷达台账或写生产 history。

## 改了哪里

- `server/scene.mjs`：500 行上限及访客优先淘汰、北京换日存档、10 分钟请客门槛、Grok 特产冷却、雷达计数／去重／统计／快照投影。
- `server/office-server.mjs`：历史目录挂接、config 路径校验与传递、每次启动首个可读雷达采样只记基数、guest 新时间字段按分钟取整。
- `office-core.js`：共用优先表、候场和 BFS 的特产／雷达完整行走，纸张／棉花糖期限，老板看卡片，日卡和小黑板文字，严格字段校验和固定日记模板。
- `office.js`：背包、云朵棉花糖、纸堆、雷达天线、卡片、坐下与固定台词；两种新机位、活动状态文案、旧 MV 绘制分支保留。
- `demo-script.json`：一轮延至 340 秒；185 秒特产、250 秒雷达（累计 13、新增 7），原有机位的时间不动；演示 Grok 的 awayLabel 为“云上打盹”，豆包为“外勤”。
- 新测试 `tests/batch2.test.cjs`、`batch2-server.test.cjs`、`batch2-browser.cjs`；原测试仅更新 9/10 分钟边界、501 行拒收界限、优先表，以及给既有 HTTP 测试显式关闭真实雷达读取。
- `SPEC.md`、中英 README、`HANDOFF-events.md` 更新数字和新行为，本文件记最新证据。没有修改 MV 两文件、契约 fixture、HTML/CSS 或发布脚本。

复用现有活动队列、寻路、桌面物件及绘制函数；存档只用 Node 标准库，没有新框架、依赖或构建步骤。存档采用每天一次、至多 500 行的同步原子写，保证先完成写入尝试再清空当天数据。

## 字段与配置

| 位置 | 新内容 |
| --- | --- |
| `scene.souvenir` | `{at}`，没有则 null，旧快照可省略 |
| `scene.radar` | `{at,n,added}`，n 当天累计、added 本次新增；没有则 null，旧快照可省略 |
| `stats` | `souvenirsTotal`、`radarsTotal` |
| `stats.today` | `souvenirs`、`radars` |
| `events` | `souvenir {at}`；`radar {at,n,added}`；仍只返回当天，最多 500 行 |
| config 顶层 `historyDir` | 可选字符串；默认私有 state 文件旁的 history，正常为 `~/.config/ai-office/history`；自定义测试 stateFile 默认也留在其临时目录 |
| config 顶层 `radarLedgers` | 可选路径数组；`[]` 禁用；默认只读 sync-bridge 选题书架的副本（owner 11-02 改：launchd 下 node 读桌面会卡在隐私授权上，不报 EPERM）；支持 `~` |

事件显示沿用原手记的时间前缀：`14:20 Grok Bot 从云上回来，给大家带了云朵棉花糖`；`15:04 豆包雷达回来了，带回 7 个选题`。两份快照均不携带标题、链接、台账正文或新任务文字；guest 两个新 at 向下取整到分钟。页面同时校验对象字段、时间、整数范围和 `1 <= added <= n <= 100000`，坏字段整份拒收，旧快照可用。累计木牌不加行。

内部状态另保留 `souvenirAt`（毫秒，跨重启的三小时冷却）与 `radarSeen={day,n}`（计数高水位）。Grok 的新 done 替代该次普通请客；同一 done 不重复算新信号，冷却内也不改演请客。雷达在采集角色转换之前归约，所以同轮的豆包 done 不叠演请客；其后两分钟内的 done 也让位于雷达。页面同样清掉同时段豆包的请客候场，旧雷达不会压掉后来独立的请客。

雷达只匹配当天行首日期和竖线，不解析标题等字段；任一读取失败跳过，两处都失败返回无信号、不报错。两处取较大值，并保持当日高水位，避免较新镜像暂不可读时倒退后重播。服务启动后的首个成功读取只记基数（包括隔日重启），运行中的北京换日则归零。没有增加定时任务：沿用服务轮询来观察台账变化。

## 手记与存档

超过 500 行先删最早 visitor，再删最早的其它行。北京换日先把旧日 `{day,events,stats:{today}}` 写入 `YYYY-MM-DD.json.tmp`，chmod 600 后 rename；目录 700。写失败只记错误码，清日和接口继续。不会把旧日事件塞回当前快照，也没有“往日”界面。

历史里存的是当天仍保留的全部事件；500 安全阀淘汰掉的行不会额外无限缓存。升级前已经被 40 条上限挤掉的会议无法凭空找回；小黑板改看计数，可以立即消除“计数为 1 却说还没开会”的错误。没有 stats 才走旧事件逻辑。MV 仍用原文案分支，保证像素不变。

## 演出与边界

优先级：真实工作／会议／电话／递信 > 罚站 > 接待 > 吵架 > 请客／特产／雷达 > 吃瓜 > 游戏角。一种演出一个在场、最多三个候场；两分钟内信号才播，排到开场再验有效期。雷达按北京日期和累计数去重，隔天相同条数不会误去重。

Grok 经门口到 CC 的桌边放纸，再逐个访问有人的工位；送到才放物件，出门的收件人跳过。纸十分钟、云糖五分钟，从送达开始按页面模拟时间计。送完到自己座位坐五秒，再走到门口。豆包经门口到后墙，贴卡两秒，老板走到旁边看三秒；附近在场者说固定短句。老板有等待拍板／递信时优先处理真实工作，贴卡者最多等 25 秒，然后回座坐五秒出门。真实工作／罚站／接待可中断演员；已落桌物件与已贴卡保留。

演员不写 status/statusSince。镜像源通常在 done 的 20 秒之后自行回 away；若真实状态一直是 done/idle，完成演出后仍按那个状态继续正常行为，不能为了“回到 away”伪改状态。页面刷新不续播旧的桌面食物或演出进度；超过两分钟的当日雷达只恢复卡片，当日有效，过北京午夜撤掉。两页允许轮询与行程差异，不承诺逐帧同步。

## 实际验证

基线 **111/111**；最终 **131/131**（新增 20 项：引擎／归约 16、HTTP 4）。日志在 `tools/shots/batch2-baseline-node.txt`、`batch2-node-final.txt`。

**先红后绿实际跑过**：仅新增复现测试、尚未修改实现时，在原 HEAD 上用 `reduceScene` 开凌晨一场会，随后 45 次十分钟间隔的真实归约与 `noteVisitor`，失败于“the early meeting must survive visitor traffic”。证据 `batch2-red-node.txt`；修复后同一测试通过，同时断言会议仍在、事件数 >40、小黑板含“今天开过 1 次会”。没有用静态配置断言替代复现。

其它 Node 覆盖：500 行两级淘汰；零点前全部事件和 today 的逐项存档比对、0700/0600、临时文件消失、不可写父目录下 HTTP 仍 200；9 分钟不请客／10 分钟请客；实际 artifacts 归约触发 Grok done、三小时边界及重载；雷达首读不触发、增加触发、同数不触发、镜像回退、两处取较大、两处 EPERM、换日及隔日启动；私有／guest 两条 HTTP 路径无标题文字、guest 分钟级时间；旧快照与坏新字段。

两布局以 10 ms 逐步跑完整行程，逐步比较 status/statusSince，检查所有角色和老板都不在家具内；必须实际出现各阶段及交付物，检查先纸后糖、五分钟／十分钟期限、老板“有意思”、回门口、日卡午夜消失、旧卡恢复、转屏及工作优先。每步最大行进 0.59 个逻辑像素。

浏览器结果：

- 新增 **31 项通过、15 张截图、页面错误 0**，`batch2-browser.json` / `batch2-browser-final.txt`。含真实 HTTP 轮询坏字段整份拒收、好快照恢复、双布局／壁纸、320 宽 Pages 子路径。
- 第一批事件回归 **58 项通过、23 张截图**，`events-browser.json` / `batch2-events-regression.txt`。
- 接待回归 **38 项通过、19 张截图**，`reception-browser.json` / `batch2-reception-regression.txt`；包括真实按钮、双页接待与合照归属、429、多视口、真实时钟开场。
- **MV 10 / 31.5 / 53.6 / 75.9 秒的 canvas PNG 与原 HEAD 逐字相同**，MV 文件自身也无差异。
- Chrome **156.0.8078.74**，Canvas2D 默认绘制路径、DPR 2；新机位无额外画质锁。接待回归真实时钟绘制回调 p95 约 **0.70 ms**，只代表本机回调，不是手机 FPS。
- 默认入口录屏 `batch2-opening.webm`：**31.68 秒，390×664、25fps**，未用位置 setter，使用默认动画循环，含打开今天／伙伴抽屉。已读每两秒抽帧的 `batch2-opening-contact.png`；另外保留接待回归本轮的真实时钟 30 秒录屏。未声称逐帧人工看完全部视频。

## 五张交付图与复现

同一真实演示、种子 7，从零逐步推进；竖屏 390×664，横屏 1455×782，DPR 2。

| 图片 | 入口／状态 |
| --- | --- |
| `tools/shots/souvenir.png` | `?view=souvenir`，200 秒，已放纸、分云糖中；保留上方 CC 桌面在视野里 |
| `tools/shots/souvenir-landscape.png` | 同入口、同时间，横屏分糖中 |
| `tools/shots/radar.png` | `?view=radar`，266 秒，卡片累计 13 条，老板在看 |
| `tools/shots/radar-landscape.png` | 同入口，横屏 263 秒，卡片及附近台词可见 |
| `tools/shots/board-meetings.png` | 浏览器脚本喂入旧快照形状：meeting=null、events=[]、today.meetings=1；正常入口滚至会议室，文字为“今天开过 1 次会” |

已打开五张图检查：大背包、白粉云糖、纸堆和转动天线与既有食物不同；卡片及小黑板文字可读。首轮截图抓到横屏豆包已返回，改成单独的横屏时刻；首轮特产竖屏裁掉 CC 桌面，改为 200 秒、不额外下滚。浏览器明确比对实际到达的演出阶段，不把“hero”误报成雷达图。

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tests/batch2-browser.cjs
NODE_PATH="$(npm root -g)" node tests/events-browser.cjs
NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs
node --check office-core.js
node --check office.js
node --check server/scene.mjs
node --check server/office-server.mjs
git diff --check
```

`batch2-browser.cjs` 可收一个基准地址，默认启动隔离的临时预览。没有另一个构建产物：源文件就是静态发布文件。证据保存在已忽略的 `tools/shots/`，较早开发失败日志留作排查，不作为最终通过证据。

本轮没有发布、公网复验或真机 Safari／安卓测试。生产目录的 TCC 权限、真实雷达运行和正式服务的存档落盘，留给 owner 审核后自行重启时观察；本轮用临时台账和实际 EPERM/EACCES 分支验证，没有触碰生产状态。除上述渲染时刻、候场／中断和状态不伪改的明确边界外，没有省略信封功能。
