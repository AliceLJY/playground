# 细雨剑门

走进高剑父 1926 年的《山水》。这幅立轴题的是陆游《剑门道中遇微雨》，落款「写剑南诗意」，画里有个骑驴的人正往剑门关走。画化开以后，你站在峡谷上方那人的位置，四下是细雨和流动的云。转头去找诗里写的地方，每看准一处，诗笺上就写出一句：

衣上征尘杂酒痕，远游无处不消魂。此身合是诗人未？细雨骑驴入剑门。

转过身去，那一面高剑父没有画。

**在线：https://aliceljy.github.io/playground/jianmen-drizzle/**

## 操作

| | 键鼠 | 触屏 |
|---|---|---|
| 转头 | 按住拖动，或方向键 / WASD | 单指拖 |
| 望远望近 | 滚轮 | 双指捏 |
| 声音 | 左上角「声」 | 同左 |

看准一处要停一秒，屏幕中间的墨环会描满。卡住 25 秒会出一句提示和一个小箭头。一次两三分钟。

## 怎么做的

- 场景：把原画裁去题款，交给 [PINOC](https://viggle.ai/pinoc)（Viggle 的 JST-2 世界模型）一张图生成高斯泼溅场景，再补了一次洞。它从画家的位置重建，所以能转头、能看到画家身后，但走不了几步：原画是俯瞰峡谷的高远视角，机位悬在半空。
- 正后方的接缝：生成的全景首尾在正后方对不齐，补洞补不掉。着色器把那条缝化成一道从云里落下的飞瀑。
- 活起来的部分都是代码：着色器里让亮而灰的泼溅（云雾）慢慢漂移；细雨是一层随转头平移的细墨线；雨声、找到一处时的一声拨弦、结尾的驴铃都现场合成。
- 渲染：PlayCanvas 2.18，场景转成 SOG 格式：电脑用完整版（72 万个泼溅，8.3 MB），手机默认用减半的轻量版（36 万个，4.4 MB），`?q=full` 或 `?q=lite` 可以手动换。
- 玩法逻辑在 `src/core.js`，不碰画面，Node 里能直接跑；自动驾驶用来测试和固定机位截图。

理念参考了 @gkxspace 的《走进梵高》（[walk-into-van-gogh](https://github.com/yuwen-cool/walk-into-van-gogh)，MIT）：一张画生成场景，转身看画家没画的那一半。代码是这里自己写的。

## 本地

```bash
npm ci --ignore-scripts && npm rebuild esbuild   # playcanvas 会带一个用不上的 canvas 原生包，跳过它的编译
node --test tests/*.test.cjs
node tools/build.mjs          # 产物在 dist/，用任意静态服务打开 dist/index.html
```

带参数：`?view=hero|gate|back` 固定机位，`?auto` 让自动驾驶依次找四处直到结尾；`&still=1` 冻结时间与雨，`&hud=0`、`&rain=0` 去掉界面和雨，`&seam=off` 关掉瀑布、露出原始接缝。

浏览器验收：`tools/check.cjs`（像素读数与帧率）、`tools/first30.cjs`（开局 30 秒录屏），用法写在文件开头。

规格见 [SPEC.md](SPEC.md)，验收记录见 [VERIFICATION.md](VERIFICATION.md)，第三方许可与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 谁会点开、AI 素材

- 谁会点开：喜欢国画、岭南画派、陆游这首诗的人，和想看「一张画怎么变成能站进去的 3D」的人。
- AI 素材清单：3D 场景由 PINOC（Viggle JST-2）从高剑父原画（公有领域）生成；原画、诗句不是 AI 生成的；云雾流动、瀑布、细雨、界面和声音全是代码；代码由人与 AI 协作完成。
