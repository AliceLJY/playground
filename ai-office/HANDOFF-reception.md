# 像素办公室「来谈事」交接

状态：本地实现和验收完成，待 owner 重启服务、公网复验与提交。2026-11-02。基准 HEAD `3bee331`；开工 fetch 后与 origin/main 一致、工作区干净。本轮没有 git add / commit / push，没有重启正式服务或改私有配置、launchd、funnel。

## 文件清单

| 文件 | 改动 |
| --- | --- |
| `server/office-server.mjs` | meet POST/OPTIONS、校验、限流、原子持久化、两份快照扩展 |
| `server/scene.mjs` | noteMeet、累计/今日计数和 reception 事件 |
| `office-core.js` | 固定菜单/台词、确定性挑人、单拨接待与三拨队列、真实寻路、让出真实任务、字段校验 |
| `office.js` | 菜单请求、10 秒轮询去重、接待绘制/气泡/握手/合照、抽屉状态、累计板、固定机位、手机跟随 |
| `index.html`、`style.css` | 四项菜单、提示行、同款按钮；手机工具条移到滚动房间上方 |
| `demo-script.json` | 第 34 秒来客配置及接待示例计数 |
| `tests/reception.test.cjs` | 9 项真实模拟与字段边界检查 |
| `tests/reception-server.test.cjs` | 3 项真实 HTTP、重载、隐私与限流检查 |
| `tests/reception-browser.cjs` | 独立临时预览/HTTP 测试桩、手机/双页面/合照/壁纸/MV/录屏检查 |
| `SPEC.md`、`README.md`、`README_CN.md`、本文件 | 规格、用法、接口、实测与限制 |

其余文件未改；尤其未改发布 workflow、MV 两文件、契约 fixture、其它目录。没有新增依赖或静态素材。测试证据留在已忽略的 `tools/shots/`，测试服务状态留在既有的 `tools/.test-data/`，便于本轮核验。

## 接口与持久化

- `POST /guest/meet`，JSON 只接受 `{kind,v}`。kind：`pitch` / `research` / `learn` / `chat`；v：16–32 位小写十六进制随机标签。没有自由输入框；标签从不进入事件、统计、快照或状态文件。
- 成功 `200 {ok:true,at:"ISO"}`。同毫秒成功请求的 at 按毫秒递增，避免按 at 去重时吞掉事件。坏 kind/tag/JSON、多余字段、Authorization 或 X-Office-Key、任何 query、>256 B 体均 400；含分块传输上限。没有鉴权或凭据需求，也不接受 token。
- 同标签五分钟一次，429 带 Retry-After。走原有共享全局 limiter（每分钟 120 次）；独立 meet 标签键使不同访客可连续发起。meet 路径不走旧的按地址 guestHits 表，满足“不记 IP”；旧接口行为不变。标签冷却只留内存，进程重启后重置，与 treat 的做法一致。
- Pages Origin `https://aliceljy.github.io` 的 OPTIONS 为 204，允许 POST 和 content-type；POST 成功和错误都有相同来源 CORS。其它 Origin 不开放读取。
- `state.meets` 保留最近 50 条，条目严格为 `{kind,at}`。`meetDay` / `meetCounts` 单独保留北京日分类计数，避免第 51 拨后今日计数不再增长。场景保留 `stats.meetsTotal` / `stats.today.meets`，事件 kind 为 `reception`。
- `/api/state` 和 `/guest/api/state` 都有最近十条 `meets`、`meetsToday` 及上述 stats；guest 仍不含公告正文、build、访客标签等私有字段。缺新字段的旧快照继续可用；存在但形状非法时整份拒收。
- 公网 `/office/meet` 继续由现有 funnel 映射至 `/guest/meet`，无需改路由。

## 挑人与演出

播放当刻按 `at + actor.id` 的稳定哈希排序，最多挑两个 idle 非 courier，chat 最多一个；排除老板、访客、真实会议成员和当前电话中的总监。独立页面在相同名单/真实状态下挑到同一批人；不同轮询时刻看到的真实状态不同，允许人选不同，不能为了同步把忙碌的人拖走。

接待人物设置 `activity='reception'`，不写 status/statusSince。途中一旦真实状态转忙、开会或接电话，立即释放该人；全部接待者被真实工作占用则送客。结束后按最新状态回游戏角/工位等正常目的地。游戏位置沿用现有分配器，不保证回到同一把椅子。

- 有忙碌但无可用 idle：Cobbler 在茶水位接，固定「都在赶活，先喝杯茶」，20 秒停留后出门。若信号全为 unknown，仍不当作 idle，改说「先喝杯茶，等伙伴有空」。Cobbler 已在递信、开会/电话或离开时不抢占，客人自行候茶。
- 全员 off/away：客人进门一步，门口告别 10 秒后离开；有夜班保安时由保安说并向门口走，结束后恢复原巡逻。
- 真会存在或途中开始：立即改以 pantry 为目标，让出会议室，冒「会议室有人，我们在这儿聊」。已有角色仍通过真实路线走出去，不瞬移穿墙。
- 正常接待四句固定台词，0/7/14/21 秒交替由 AI 和客人说；谈话 24 秒，握手 4 秒，另计进出/入座走路。统一测试场景实测竖屏 **50.38 秒**、横屏 **44.28 秒**；真实状态中途变化会影响时长。没有 AI 调用。
- 一拨在演、最多三拨待演，满了丢最早待演的一拨。按 at 去重，只接收两分钟内事件；开始排队演出前再检查有效期，过期不重播；切后台暂停模拟时，恢复前还会按墙钟清掉过期队列。排队到开演才挑人。
- 握手时两人靠近并动手臂，复用 takePhoto；仅发起页弹洽谈合照，底栏有日期时间和「我的AI小木屋」。旁观页、壁纸和 MV 不弹洽谈卡。没有向别的访客传身份。

## 页面与复现

- `?view=reception`：种子 7，同一演示从零推进至 **49 秒**；actualView 必须返回 reception。竖屏 390×664 自动滚到附楼；横屏 1455×782 同屏展示。
- 每轮演示第 34 秒自动来一拨，与第 20 秒送礼错开，四种 kind 逐轮轮换。演示菜单点击只本页播放，提示明确写「演示接待」。第 50 秒的真实会议演示会把尚未结束的接待移到茶水位。
- 手机工具条是一行 ≥44px 按钮，放在滚动房间上方；打开菜单也不覆盖画布，但会占用一部分视口高度，房间仍可滚动。`view=games` 微调初始滚动量，保持六个游戏角色名牌在首个可见视口内。横屏仍放手记侧栏。
- 发起页跟客人下楼并在出门前回到楼上；旁观者自行滚动。壁纸默认只看主房间，来客期间临时展开附楼，结束收回；`annex=1` 始终保留附楼。MV v5 使用当前 portrait 布局（现状并非 legacy），但从不排入接待；legacy 模拟也拒绝 meet。
- 专用接待访客不计入在线人数；最大画面人数预算从 18 调整到 **19**，SPEC 已注明。复用原 BFS/Canvas/照片，不增加框架或外部素材。

## 验证证据

在 ai-office 下：

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs
node --check office-core.js
node --check office.js
node --check server/office-server.mjs
node --check server/scene.mjs
git diff --check
```

- 基线 **75/75**；最终 **87/87**，新增 12 项，原有全部测试（含 MV）通过。日志 `tools/shots/reception-node.txt`。HTTP 测试使用临时端口/随机测试凭据/仓内临时状态；没有访问真实配置或向正式服务 POST。
- 引擎实际 20ms 步进覆盖双布局、多种状态、四种来意、真实入座与轮流台词、握手距离、离场、逐步 status/statusSince 不变、真实会议/电话排除、忙碌/夜间/unknown 分支、排序与不同种子/名单顺序、FIFO/三项队列/过期、横竖转换和每步家具碰撞。送客时另用 1ms 步长检查，避免小步长空目标问题。
- 浏览器 **38 项通过，19 张场景截图，页面错误 0**。系统 Chrome **156.0.8078.74**，DPR 2，Canvas 2D 原绘制路径；手机 390×664 / 320×568 / 412×700，横屏 1455×782。新工具条、四项菜单尺寸和可点性、两页真实按钮/HTTP 测试桩、10 秒轮询、同人选、仅本页洽谈合照、429 提示、坏字段整份拒收、旧事件不播、壁纸与游戏机位检查均通过。
- MV 在 **10 / 31.5 / 53.6 / 75.9 秒**的 canvas PNG 与基准 HEAD **逐字相同**；`mv.js`、`mv-script.json` 未改。
- 必需图：`tools/shots/reception.png`、`reception-landscape.png`。另有 `reception-keepsake.png`（实际导出的 720×1570 PNG）、`reception-photo.png`、三档菜单、429 与壁纸。报告 `reception-browser.json`，控制台记录 `reception-browser.txt`。已打开必需图、合照、菜单和壁纸读图；台词、访客标识、AI 名牌和木牌可辨，没有气泡盖住投影标题。
- 正常演示入口真实操作录制 `reception-opening.webm`：约 31 秒，390×664，浏览器原生 25fps；点来谈事→来取经→跟随下楼。另有 `reception-opening-contact.png` 两秒一帧的检查联系表及七个默认入口步进截图。看过抽帧，行走、入座和气泡顺序正常；没有声称逐一人工看完所有视频帧。实际时钟绘制回调 p95 约 **0.7ms**，只代表本机 Canvas 回调，不是手机 FPS。

没有单独构建产物，发布仍使用原五个静态文件。本轮未跑旧 `tools/browser-check.cjs` 的全套历史截图比较，改用新增的接待浏览器检查与明确基准的 MV 像素回归；原 Node 测试全部保留通过。

## Owner 接手与未覆盖项

1. 自行重启现役 office-server，让新增服务端接口生效；本轮没有重启。
2. 通过公开 Pages 页面验证 OPTIONS 和 `/office/meet` POST，检查 400 / 429 的 CORS、两份快照新字段、两个真实浏览器的同步，以及刷新后累计保留。该动作会真实增加接待计数，本轮未做。
3. 审阅两张必需截图及真实手机手感，再按自己的流程提交/发布。未改 workflow，无新静态文件要拷贝。

未测真机 Safari/安卓，未做公网发布或 funnel 复验。轮询同步并非逐帧同步：不同页面最多相差一次轮询及本地排队时间；服务器不保存接待者名单或演出进度。状态不同时按各页当前真实空闲情况选人。五分钟冷却在服务重启后重置；累计与记录不会丢。这些边界没有用模拟测试冒充线上已验证。
