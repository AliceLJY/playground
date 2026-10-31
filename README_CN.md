# playground

做着玩的小东西，一个仓一个子目录，共用一个 Pages 站点。首页分三排：上手玩的小游戏、转着看的 3D 展页，和放着看的 AI 幕后。

**在线：https://aliceljy.github.io/playground/**

## 小游戏

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [搭台 · 茶楼早市](datai-teahouse/) · [玩](https://aliceljy.github.io/playground/datai-teahouse/) | 广州茶楼早市，伙计把你安排到还有空位的桌，和陌生人搭台。没有聊天框，只能落座、斟茶、叩指、揭盖、翻报纸、夹一件、唔该、离席；坐下拣茶、头泡洗杯，喊伙计拿点心纸从十四样五档里下单，点心车每半分钟到桌边一趟全桌抢；五分钟一市，收市离席埋单可存图。桌上的别人是浏览器记着的你自己前几次来访的回放，人少时补两个标明「不是真人」的灰色身影 | 二维画布，分桌规则与来访回放在 Node 可测的核心里，合成音效，无服务器无请求，手机竖屏 |
| [候场厅 · 开演前五分钟](show-foyer/) · [玩](https://aliceljy.github.io/playground/show-foyer/) | 一出戏开演前的线上候场厅，五分钟一场：一座戏台、十二个座，和陌生人一起等开演。没有聊天框，只能落座、点灯、鼓掌、给邻座递茶、拍舞台、翻节目单、离席；厅满自动开下一厅，整点一声锣，幕后有鼓点在热身，三遍铃、场灯渐暗、幕布拉开就开演。厅里的别人是浏览器记着的你自己前几次来访的回放，人少时补三个标明「非真人」的灰色身影；散场领一张「今晚谁来过」合影图。戏名与演出单位是真实巡演剧目的公开信息，以后有新戏会换 | 二维画布；分厅、来访回放、三遍铃与幕后日程在 Node 可测的核心里；合成音效；无服务器无请求；手机竖屏 |
| [你是哪一根柱](yueju-pillars/) · [玩](https://aliceljy.github.io/playground/yueju-pillars/) | 粤剧剧团靠六位主演撑起整台戏，叫六柱制。答八道日常小题，看你是哪一柱，读几条有出处的粤剧知识、看你在《帝女花》里演谁，长按保存分享图 | 普通 HTML 加画布分享图；题目、事实与计分在 Node 可测的核心里，测试穷举 4^8 种答法检查结果分布；手机竖屏 |
| [细雨剑门](jianmen-drizzle/) · [玩](https://aliceljy.github.io/playground/jianmen-drizzle/) | 走进高剑父 1926 年的《山水》（写陆游「细雨骑驴入剑门」诗意），细雨和流云里转头找诗里写的四处，每看准一处诗笺写出一句；转过身，是画家没画的那一半 | PINOC（Viggle JST-2）一张画生成的高斯泼溅场景 + PlayCanvas，着色器里的流云与飞瀑，合成雨声，键鼠与触屏 |
| [打回乐池](yingge-pit/) · [玩](https://aliceljy.github.io/playground/yingge-pit/) | 英歌小戏台上，白衣木偶从乐池往上爬，铁枝一亮就点那一道，英歌纸偶出槌把它打回去；三波、大锣「大英歌」，两个人可以同一台手机一起打 | 二维画布，短片素材拼的戏台与纸偶，代码画的木偶，合成锣鼓，触屏与键盘，竖屏横屏都行 |
| [药性配对](herb-match/) · [玩](https://aliceljy.github.io/playground/herb-match/) | 药材从药柜上落下，赶在落地前分进寒、凉、温、热四个药篓；分错了药签翻面讲为什么。只为认识四气，不是医疗建议 | 二维画布，代码画的扁平药材，合成音效，触屏与鼠标，竖屏横屏都行 |
| [骑楼擂台](qilou-brawl/) · [玩](https://aliceljy.github.io/playground/qilou-brawl/) | 黄昏的西关骑楼街，粤剧武生从街口一路打上醒狮擂台：早茶阿婆、包租公、醒狮头，拳脚连段、翻滚格挡、锣鼓二阶段 | PINOC 一张图生成的高斯泼溅角色 + PlayCanvas，程序化街景与合成锣鼓，键鼠与触屏 |
| [深夜杂货店](diorama-walk/) · [玩](https://aliceljy.github.io/playground/diorama-walk/) | 雨夜街角的一块微缩模型，放大就走进那家还亮着灯的老杂货店值夜班；有惊吓，照着《夜班须知》撑到出店 | Three.js 方块灰盒，程序合成的方位音效，键鼠与触屏，单文件离线可玩 |
| [灯影守夜](shadow-gong/) · [玩](https://aliceljy.github.io/playground/shadow-gong/) | 散场后的皮影戏幕上举锣守灯：看兵器透光一亮就格挡，卡准了锣声一响、时间慢半拍，攒满架势再处决 | Three.js 2.5D，程序化皮影与合成音效，键鼠与触屏，单文件离线可玩 |
| [凉拖拍蟑螂](slipper-smash/) · [玩](https://aliceljy.github.io/playground/slipper-smash/) | 广州雨夜小巷里划屏拍蟑螂，别碰奶茶，最后拍服肌肉蟑螂 Boss | 二维画布，合成音效，触屏与鼠标，竖屏横屏都行 |
| [天台水枪大战](rooftop-splash/) · [玩](https://aliceljy.github.io/playground/rooftop-splash/) | 夏日天台的第一人称水枪对战，蓝橙电脑团队、三把水枪、水球与复活 | 三维程序化场景，键鼠与触屏，单文件离线可玩 |
| [小橘飞车 · 珠江杯](xiaoju-racing/) · [玩](https://aliceljy.github.io/playground/xiaoju-racing/) | 毛茸茸的小橘与五只猫同场竞速，漂移蓄气、氮气冲线 | Three.js，程序化毛发，单文件离线可玩 |
| [阿橘的广州骑游](aju-guangzhou-ride/) · [玩](https://aliceljy.github.io/playground/aju/) | 橘猫骑车穿过广州，三花挑战与风格街区探索 | Three.js，打包成单个离线 HTML |

## 3D 展页

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [凸透镜成像 · 自己找规律](lens-lab/) · [看](https://aliceljy.github.io/playground/lens-lab/) | 一张光具座：平行光找焦点，再拖蜡烛、拖光屏把像对清楚，五种成像情况一种种找出来、表格自己填满，最后回答放大镜和投影仪为什么一个正一个倒 | Three.js，薄透镜公式实时计算，鼠标与触屏，单文件离线可看 |
| [机械沙虫](sandworm/) · [看](https://aliceljy.github.io/playground/sandworm/) | 一份虚构的工程设计档案：沙漠地下掘进的机械沙虫，六个机位、X 光看地下、拆开装甲看内部 | Three.js 程序化建模，键鼠与触屏，单文件离线可看 |
| [户型图 · 三维小样](floorplan/) · [看](https://aliceljy.github.io/playground/floorplan/) | 从一张公有领域户型图读出墙、门窗和房间，拉成能转的三维，配上 CAD 平面图、光追效果图和冬至日照 | Three.js 手机竖屏页，数据与效果图来自本地出片工程 |
| [走进户型图](floorplan-walk/) · [看](https://aliceljy.github.io/playground/floorplan-walk/) | 同一张户型图做成能摆家具的彩色平面图：从家具库拖进去，切到 3D 房子从图上长出来，转着看或者从入户门走进去；真实日照、夜景、剖切、整屋换木色 | SVG 平面图 + Three.js，60 种家具（图例与模型移植自 floorplan-3d，MIT），键鼠与触屏，单文件离线可看 |
| [雪线小木屋](snowline-cabin/) · [看](https://aliceljy.github.io/playground/snowline-cabin/) | 雪夜山顶一间亮着灯的木屋：点暗着的山头替它点灯，七座点满有流星；时间从黄昏拖到日出；还能进屋待一会儿 | Three.js 纯代码场景，没有模型和图片，鼠标与触屏，单文件离线可看 |
| [机械钟齿轮 · 一张图生成](clockwork/) · [看](https://aliceljy.github.io/playground/clockwork/) | 把一张机械钟图解交给 Gemini 4 Argon，它一次写出的 3D 页面：三级齿轮按图上标的齿比咬合转动 | Gemini 4 Argon 一次生成，Three.js，键鼠与触屏 |
| [齿轮返修](gear-repair/) · [看](https://aliceljy.github.io/playground/gear-repair/) | DeepSeek Harness 一次写出的齿轮页把渐开线方向写反了一个符号，两对齿轮帧帧穿模；作者只给症状和查法，它自己修好。一键切换原版与返修后，红点标出穿模处 | Three.js，两版齿形代码原样保留，穿模检测与页面共用一份代码，鼠标与触屏 |
| [山河卷](shanhe-scroll/) · [看](https://aliceljy.github.io/playground/shanhe/) | 可以走进去的历史长卷：宣纸时间轴点开史料卡片，再一步迈进 360° 全景现场 | Three.js 全景球，换一个数据文件就能换题材 |
| [南禅寺大殿 · 一步步搭起来](nanchan-temple/) · [看](https://aliceljy.github.io/playground/nanchan-temple/) | 国内现存最早的木构建筑（唐建中三年 782 年重建）。11 个按钮一层层搭：台基、立柱、斗栱、梁架、椽、瓦，再拆开、装回。尺寸取自实测，剖视窗看屋顶的重量怎么经斗栱传到柱子，可切白天、黑夜 | Anatomy skill（MIT）生成的等轴 SVG，单文件，键鼠与触屏 |
| [西关大屋 · 推开看](xiguan-house/) · [看](https://aliceljy.github.io/playground/xiguan-house/) | 广州西关大屋的门口到正厅。点一下：趟栊拉进墙里、大门推开贴墙，屋面前坡扣到后坡上再掀到后面，前墙和两面山墙倒下，满洲窗推开；再点一下沿同一条时间线合上。部件全程不互相穿插，由测试逐帧检查 | 自写 Canvas 2D 等距渲染，键鼠与触屏 |

## AI 幕后

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [派活回放](dispatch-replay/) · [看](https://aliceljy.github.io/playground/dispatch-replay/) | 回放真实的 Claude Code 工作，两份可切换：总调度用 68 分钟把 15 篇文章的事实核查拆给 21 个子 agent，每个读进十几万 token，交回的报告只有几百字；做一支短片时派 8 个子 agent，另叫 8 次外部 AI Codex 画图，Codex 在记录里是个黑箱 | 二维画布，数据从本机会话记录抽取（只留标签、时间、token 数和字数），可暂停拖动，手机电脑都行 |
| [agent 引擎是什么](agent-engine/) · [看](https://aliceljy.github.io/playground/agent-engine/) | 六个镜头讲清 API、引擎、harness 三层：只有 API 会卡在哪、加上循环能做什么、循环之外的失败怎么接住；页面里的循环是真跑的教学小实现 | 讲解页，纯前端，手动翻页或自动播放，手机电脑都行 |
| [手写板书](handwritten-board/) · [看](https://aliceljy.github.io/playground/handwritten-board/) | 两页手写板书一笔一笔写出来，讲的是它自己怎么做出来的：龙藏行书逐字揭示，一只手跟着笔尖走，红笔圈重点；可暂停、倍速、翻页或长卷、换字体 | DOM 文字加 SVG，GSAP 时间线，字体子集打包在页面里，没有构建步骤 |

## 加一个新玩意

开工前先读 [制作与验收约定](AGENTS.md)，在玩意自己的目录写一页规格。

1. 在仓库根目录建它自己的文件夹。
2. 在 `.github/workflows/pages.yml` 里加一段，把它的静态产物拷进 `_site/<名字>/`。
3. 在根目录 `index.html` 对应的那一排（小游戏、3D 展页或 AI 幕后）里加一张卡片。

纯静态的只要一条 cp。需要构建的把构建命令写进同一个 workflow —— 参考 `aju-guangzhou-ride` 用 `build.py` 把源码内联成单文件的做法。

## 本地预览

每个文件夹都能单独跑，走 http 不能双击（ES module 会被 CORS 拦）：

```bash
cd shanhe-scroll && python3 -m http.server 8777
```

## 许可

玩意本身的源码归我。打包进来的 `three.js` 保留它自己的 MIT 许可，见各文件夹里的 `THIRD_PARTY_NOTICES` / `THREE-LICENSE`。展页用到的外部素材（户型图、模型）和参考来源也写在各自的 `THIRD_PARTY_NOTICES` 里。
