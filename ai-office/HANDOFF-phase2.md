# 像素办公室二期 · 前端交接

状态：前端实现及本地验收完成，全套 Node 与浏览器检查通过，待 CC 验收提交。2026-11-01。未 git add / commit / push，未重启正式服务。

## 交付范围

本轮编辑：`office-core.js`、`office.js`、`index.html`、`style.css`、`demo-script.json`、`tools/browser-check.cjs`、`README.md`、`README_CN.md`、`SPEC.md`。新增：`tests/phase2.test.cjs`、`tools/preview.cjs`、本文件。证据写在已被忽略的 `tools/shots/`。

- 附楼向下扩到 360×740 逻辑像素、720×1480 画布。原房间坐标保留，经南侧新门洞连接。手机房间窗口上下滚动，画布按宽度显示。
- 会议室有投影、CC 讲台位、10 个成员座位、玻璃墙外 2 个旁听席。review 显示轮次和采纳／反驳／待议；huddle 显示人数；散会显示最近会议时间，成员恢复原状态走位。
- 电话亭、亮灯、听筒与固定气泡；电话优先于 CC 同时收到的会议走位。其他会议成员照常入座。
- 派活列表按 id 增减播放 1 秒抛物线。去程从 CC 桌出发，CC 开会／通话时从当前位置出发；回程落在 CC 桌。桌上文件夹随名单保留；重复快照不重播。同 id 快速变化只保留最新一趟，防止后台暂停时积压旧动画。
- 储物间 0–100% 对应 0–8 层纸箱，92% 起贴红纸条；无 disk 信号时为空储物间。
- 夜班保安受信号与北京时间双重控制，慢走已验证路线，每个巡逻时间戳一圈；done 时门口绿／红灯，失败冒「备份没过」，ok=null 为灰灯。白天不显示。
- 累计木牌合并了原来的来客总数立牌。「今天」显示完整累计数字及倒序事件；木牌大数字用万／亿缩写。事件只用结构化固定模板；未知 kind 跳过。访客看得到今天，公告数据在进入模拟前清空、公告标签隐藏。
- 150 秒演示覆盖所有新增动作，固定累计示例在木牌、今天栏都标「演示」。默认北京时间 10:00；`?demo=1&night=1` 为 23:00，实时模式不受 night 参数影响。
- 保留打招呼、送礼、合照和访客；合照扩到 720×1570，预览卡移出滚动窗口以防裁切。CSP 与起始版本逐字一致。

未编辑 `server/`、`bin/`、`tests/server.test.cjs`、`tests/fixtures/state-scene.json`、`mv.js`、`mv-script.json`、`.github/`、仓库外文件或私有配置。工作区同时出现的 `server/scene.mjs`、`tests/room.test.cjs`、`bin/office-call` 等属于另一端的服务端工作，本轮未覆盖或整理。没有新增依赖、素材、构建步骤或常驻服务。

## Done when 证据

### 1. Node 场景与字段校验

```sh
node --test tests/*.test.cjs
node --test tests/scene.test.cjs tests/phase2.test.cjs
node --check office-core.js
node --check office.js
node --check tools/browser-check.cjs
node --check tools/preview.cjs
git diff --check
```

- 收尾全套 **46 / 46 通过**，输出 `tools/shots/node-tests-final.txt`。较早一轮同轮新增的 `tests/room.test.cjs` 曾有 wrapper 名单和会议成员顺序两项失败，保留在 `tools/shots/node-tests.txt`；后续复跑已全部通过。本轮未修改该服务端测试或实现。
- 最终前端单独 **17 / 17 通过**，输出 `tools/shots/frontend-tests.txt`。原有 8 项保留，新加 9 项。
- 新测试：fixture／旧字段兼容，33 类坏输入，未知事件跳过；全部新目标从 11 个原桌位、全部休息点和门口可达；3 个种子从工位／沙发入会、翻页不换座、散会回去，以及满员 11 人不同座位；派活增减、重复轮询、会议／电话当前位置出件、电话中也回收至 CC 桌；电话与会议优先级；箱子单调性；旁听两席与送礼／离开；夜班边界、完整一圈真实移动、无超过 2 秒卡死窗口、白天隐藏；全部事件模板。
- 新场景的真实移动每 20 ms 检查碰撞。测试先抓出电话亭旁 `(336,492)` 的路线点不可走，改成 `(340,492)` 后通过。不是只检查目标常量。
- 所列 JS 语法检查及 `git diff --check` 通过。仓内没有单独的前端 lint 配置。

### 2. 浏览器、固定机位与 fixture

```sh
node tools/preview.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:3191/
```

结果：**202 项检查通过，25 个截图场景**。报告 `tools/shots/report.json`。系统 Chrome **156.0.8078.74**；渲染器 **ANGLE Metal / Apple M4**，不是 SwiftShader；DPR=2，普通页面画布为 720×1480。Canvas 绘制回调 p95 **0.30 ms**（不是整帧耗时或手机 FPS）。

| 必需截图 | 输入／状态 | 人工读图结果 |
| --- | --- | --- |
| `meeting.png` | `?view=meeting`，种子 7，自零运行至 73 s | CC 在投影右侧，Codex／Kimi 入座，第 2 轮和 3／1／0 可读，两位客人在玻璃墙外旁听 |
| `booth.png` | `?view=booth`，112.5 s | CC 在亭内，听筒、顶灯和「我记一下」可见；会议室已空、门牌有上次会议时间 |
| `handoff.png` | `?view=handoff`，45.5 s | 文件夹在 CC 桌与 Codex 桌之间的弧线上，实际 flight progress 约 0.5 |
| `board.png` | `?view=board`，73 s | 木牌与今天抽屉同时可读，固定示例清楚标演示，事件按倒序列出 |
| `night-guard.png` | `?view=night-guard`，8 s | 保安在附楼右侧巡逻，帽子与手电光束可见；另有 `night-guard-annex.png` |
| `mobile-390.png` | 390×664，会议机位 | 无横向溢出，会议、木牌、箱子与旁听席可读；3 个标签、抽屉按钮都 ≥44 CSS px 且可点 |
| `mobile-320.png` | 320×568，会议机位 | 无横向溢出，投影正文为 6.4 CSS px（8 逻辑 px），今天明细可在抽屉放大阅读 |
| `live-fixture.png` | 预览服务原样返回契约 fixture；模拟推进到座位 | demo=false、真实名单、93%、137 位访客，12 分钟会议；只一位旁听访客，公告标签隐藏 |

以上截图已逐张打开读图。另读过 `mobile-390-today.png`、`mobile-320-today.png`、`live-fixture-today.png`、合照、保安成功／失败和开场联系表。

预览服务只监听 **127.0.0.1:3191**，不调用或修改正式办公室。验收时阻断全部外网；仅缺 API 降级测试允许发起预定的只读地址尝试，然后在浏览器路由内中止。fixture 未修改，SHA-256：`340cca353dc6f79ee313eeb89661540cf2590bff529d6df608d8244e8526841a`。

补充验收：

- 旧服务缺三个扩展字段：`legacy-empty.png`，没有会议、电话、箱子或保安，统计为未知。
- 首次坏快照保持上一份合法场景，不把坏 id 部分混进去。
- 访客 feed 即使误带公告测试文本，也没有进入 DOM 或模拟。
- 通过真实按钮点击、局部 HTTP stub 测了送咖啡和送达；没有向正式服务 POST。打招呼、拍照、收起卡片、送礼菜单仍工作。
- 从正常入口推进前 30 秒，每秒一张 `opening-00.png`～`opening-30.png`；已读 `opening-contact-1.png`、`opening-contact-2.png`，可见走动、交活、访客招呼、奶茶送达。这是逐秒截图序列，不是 30 fps 视频。
- 无 API 的七个静态文件（含原有 MV 两文件），在 `/playground/ai-office/` 前缀下进入明确标注的演示：`static-fallback.png`。没有构建步骤。

### 3. 原房间、MV、壁纸回归

- 浏览器自动用 `git show 1f13ea1:ai-office/...` 读取起始版本的前端，分别运行。hero 时原房间 y<398 的 **720×796 RGBA 数据逐字对比，差异数 0**；新门洞从 y=398 向下连接。
- `?mv=1&hold=1` 推进到 10 s，截图 `mv-hold.png`；MV canvas 与起始版本同帧 `mv-before.png` **PNG 完全相同**，页面错误 0。两个文件已打开，原机位和人物未偏。
- `?wall=1` 截图 `wall.png` 已打开：扩建后整体在壁纸位置内，隐藏送礼／合照控件，无页面错误；没有发访客登记。
- 读图发现的两条回归现在有真实断言：旧合照 top=109.55、滚动窗口 top=127，确实被裁；修后整个卡片在可见区内且可点。旧灯像素是帽子色 `[54,76,103,255]`，修后失败／成功小灯实际读数分别为 `[217,86,77,255]`／`[103,183,121,255]`。截图 `photo.png`、`guard-failed.png`、`guard-done.png` 已复看。

### 4. 本交接与复现入口

本文件就是二期交接。README 中英各自已加入入口和时间轴；规格先写后实现。所有检查使用现有 BFS、Canvas 和 Node 内置能力；未引入新框架或配置层。

预览如仍运行，可直接打开：

- `http://127.0.0.1:3191/?view=meeting`
- `http://127.0.0.1:3191/?view=board`
- `http://127.0.0.1:3191/?demo=1&night=1`
- `http://127.0.0.1:3191/`（原样 fixture，不是真实活动）

## 契约处理与未覆盖项

没有修改契约字段，也没有必须先停下来问的问题。以下是明确的前端解释，方便 CC 联调：

1. 旧快照可完全省略 scene／stats／events；字段存在时必须符合完整对象形状。scene 内可空的字段用 null。数组 id 必须属于同份 roster，不接受重复成员或把 CC 放进 dispatched。
2. 新时间字段接受带时区 ISO（Z 或 ±HH:MM，秒或 1–9 位小数秒），范围 2000–2100，日历日期也校验。计数为 0–1e9 整数；轮次 0–10000；slide 三项 0–100000；事件 minutes 0–1440、n 0–100000；disk 接受 0–100 有限数。没有跨字段强迫 today≤total，以免拒收非原子计数过渡。
3. events 只接受契约列出的结构化键，未知但符合字符集的 kind 跳过。已知 kind 的必需字段缺失会整份拒收。相同时间保持服务端原顺序；不同时间降序。
4. 同时有 call 和 meeting 时，CC 先去电话亭；挂电话后若会议还在就回讲台。会议散后按最新 roster 状态回工位、休息区或门口。投影时长使用 meeting.since，轮次变化不重置。
5. 本轮没有接新服务端、重启 launchd、实发信号、上传或发布；当前浏览器证明的是前端消费 fixture／受控快照，不是服务端真实采集准确性。正式联调由 CC 接。
6. 未测真机 Safari／安卓，也没有声称手机 FPS 或完成真人审美验收。手工读图覆盖上述场景；30 秒证据为低频采样，不能排除采样间的短暂动画瑕疵。


## 返修：游戏室

2026-11-01，本次按 Alice 改定做的是**主房间游戏角**，不是附楼游戏室。状态：前端返修与本地验收完成，未暂存、提交或推送，未重启正式服务。

### 改了什么

- 从 `c216e84` 开始，开工 `git fetch origin` 后 main 与 origin/main 一致；只看了旧 stash 的统计，没有 pop。保留 `000c40b` 木牌纸条数、`c216e84` 标题访客累计和短横幅。
- 主房间左下角改为棋桌、两台街机、打盹／看书豆袋；六个活动位、四个分开的围观位。保留原书架和落地灯。屏幕闪、手拨摇杆、两人到齐后交替落子、冒 z、翻开书均由原 Canvas 像素函数绘制。
- 只有 idle 且不在会议／电话中的伙伴入角，桌号 4、5、9 也包含在内；Cobbler（10）闲着留守前台。done 回工位庆祝两秒后留在工位。其他状态和送信优先级沿用。
- 初次按桌号排序，先双人棋、再街机、豆袋、围观；保留有效活动位，只在成员变化时补空位。5→4 的五种离开都测试：离开末位时其他人不动，离开前四位时只有末位补缺。单人用街机；两人未都到场不演下棋。
- 家具接入原 4 像素 BFS，豆袋靠背挡路、前座可达。访客新增 (92,356) 围观位；原书架、老板桌、门口游览及保安整圈保留。
- 会议室南墙从 y=669 收到 y=633，四张椅子、CC 原讲台位、六个独立后排站位；旁听席改一张两人长凳，留出更宽的储物间前过道。画布仍为 360×740。
- 会议存在时门洞亮「开会中 ↓」，标题显示「楼下在开会」，招呼、拎礼物、道谢仍优先；320 短屏也保留标题。新增 `?view=games`，同一剧本从零走到 138 秒，六位 idle 玩耍／休息，未手摆人物。
- 编辑文件：`office-core.js`、`office.js`、`style.css`、`demo-script.json`、两个前端测试、`tools/browser-check.cjs`、中英 README、SPEC 和本交接。复用现有模拟、寻路、绘制与 Node/Playwright 检查，无新增依赖或框架。

### 命令与结果

```sh
node --test tests/*.test.cjs
node --check office-core.js
node --check office.js
node --check tools/browser-check.cjs
git diff --check
node tools/preview.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:3191/
```

- **51 / 51 Node 测试通过**，输出 `tools/shots/repair-node-final.txt`。包括真实移动采样、每个新点位可达、所有五种 5→4、单人／双人到齐、桌号排序不受 roster 顺序影响、busy 不玩、done 留桌、Cobbler 留守、满员棋／机器／豆袋／围观、11 人会议无重位、散会回游戏角、真实访客到达围观位、保安无卡死窗口的一圈。改实现前新断言已失败，`repair-before.txt` 保留反例（包括旧 done 离桌）。
- **267 项浏览器检查通过，33 个截图场景**，输出 `tools/shots/repair-browser.txt` 和 `tools/shots/report.json`。Chrome 156.0.8078.74，ANGLE Metal / Apple M4，DPR=2，正常画布 720×1480。实际时钟 Canvas 绘制回调 p95 **0.30 ms**，不是手机帧率。
- 主房间 720×840 RGBA 对照 `c216e84`：仅豁免逻辑矩形 **[20,260,128,338)** 与 **[274,398,342,418)**；矩形外差异 **0 字节**，矩形内差异 79,965 字节。对照使用同一 busy 名单与冻结的 4 秒时间点，避免把指定的 idle 走位改动或不同帧手势当成房间美术变化。首轮实时采样曾产生时刻误差，改为这个固定场景，未扩大矩形。证据 `room-before.png`／`room-after.png`。
- MV 10 秒同帧与 `c216e84` **PNG 完全相同**；MV 保留原休息区和走位，不改 `mv.js`／`mv-script.json`。壁纸无报错，原房间坐标未偏。
- 390×664 与 320×568 都无横向滚动。games 的 scrollTop 均为 0，游戏角底部分别为 CSS y=463.12／375.4，房间可视底分别为 474／390。屏幕、摇杆手、棋子、伸手区域的实际变化均超过 16 个 RGBA 分量，12 次 250 ms 采样通过。
- 会议提示牌检查实际黄色像素的有／无，标题的招呼、拎礼物、道谢优先级均通过；木牌「纸条 37」受控样例和标题「来过 137 位客人」仍显示。发布形态沿用无构建的七个静态文件，缺 API 的 Pages 子路径检查通过。
- 语法及 diff 检查全过。禁止编辑的目录、测试和 MV 文件无差异，暂存区为空。fixture SHA-256 仍为 `340cca353dc6f79ee313eeb89661540cf2590bff529d6df608d8244e8526841a`。

### 已打开复看的截图

| 截图（均在 tools/shots/） | 读图结论 |
| --- | --- |
| `games-mobile-390.png`、`games-mobile-320.png`、`games-motion-390.png` | 首屏看清双街机、棋桌、豆袋、z 与书；移动采样的街机亮暗有变化 |
| `games-overflow.png` | 六人活动、四人围观，Cobbler 在前台，各人分开 |
| `meeting.png`、`meeting-main.png`、`meeting-overflow.png` | 四椅与投影、楼上开会牌、六人后排站位可辨，旁听是一张长凳 |
| `mobile-390.png`、`mobile-320.png` | 附楼不横溢，短屏标题可见，会议与旁听长凳清楚 |
| `live-fixture.png`、`night-guard.png` | 原 fixture 真实字段形态正常；夜班帽子、手电与路线仍在 |
| `mv-hold.png`、`wall.png` | 原 MV 机位和旧休息区保留；壁纸完整容纳主房间与附楼 |
| `opening-contact-1.png`、`opening-contact-2.png` | 默认入口 0–30 秒逐秒样本：走动、交活留桌、排队、招呼、送礼继续发生 |

### 没做的

没有加乒乓球／桌上足球：左下角保留通行空间。没有真机 Safari/安卓测试；手机是 Chrome 视口模拟。开局证据沿用逐秒截图，不称作 30 fps 录像；静态美术对比只证明规定场景和矩形外逐字一致，不声称所有动态人物在所有时刻相同。没有发布或线上复验，没有碰正式服务或私有配置，没有新增外部文件维护、提交或推送。旧 stash 原样保留。

本地只读预览：`http://127.0.0.1:3191/?view=games`、`?view=meeting`；3191 根入口是原样 fixture，不是实时办公室。
