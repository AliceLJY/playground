# 山河卷 · 可走入的历史长卷（最小可跑 demo）

复刻 B 站「量子书架」用 Kimi K3 做的《山河岁月》的**核心技术路径**，用来验证"走进历史"到底是怎么实现的。
不是抄它的内容，是把它的骨架剥出来，做成**换个数据文件就能换题材**的模板。

原视频：<https://www.bilibili.com/video/BV1L13E6yEou>

---

## 跑起来

```bash
cd ~/Projects/shanhe-scroll-demo && python3 -m http.server 8777
```

然后浏览器打开 <http://127.0.0.1:8777/index.html>

必须走 http，不能双击 `index.html` 用 `file://` 打开——ES module 会被 CORS 拦。

停止：回到终端按 `Ctrl+C`。

**想直接看 360 效果**：打开后按右上角 **▶ 直接看场景**，一键进第一个全景。
进场景后按住鼠标拖动环视四周；**图被下方文字挡住时按「收起面板」全屏看图**，再按一次展开。
不按也行——首屏顶部有引导条，时间轴第一个红点会呼吸提示，点它展开史料卡片，
卡片里的「走入场景」同样能进。

> 首屏是时间轴（宣纸 + 竖排章节名），**全景在第二层**。第一版没做引导，
> 开箱只看到一片空纸和几个红点，找不到 360 在哪 —— 已加引导条 + 呼吸提示 + 一键直达三重入口。

---

## 「走进去」的真相

这是整个项目唯一需要解释的地方，其余都是普通前端。

原作宣传的是"3D 历史画卷 + 高斯泼溅"，但实际画面里：镜头能转能推，可是**视角变化时人物家具不产生真实的遮挡视差**，画面两侧有**桶形拉伸畸变**。这两条特征指向同一个实现：

> AI 生成一张 360° 等距柱状全景图（equirectangular）
> → 贴在 Three.js 球体的**内壁**（法线翻转）
> → 相机放在球心，只做旋转和变焦

代码就这几行（`index.html` 里 `sphereGeo` 那段）：

```js
const sphereGeo = new THREE.SphereGeometry(500, 64, 40);
sphereGeo.scale(-1, 1, 1);        // ← 关键：翻转法线，于是我们站在球「里面」
const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ map: 全景图 }));
```

界面上那两个按钮「走入场景 / 视角远眺」，做的事就是改 `camera.fov`（55 / 92）。

**所以它是 360 全景漫游（像街景），不是可以自由行走的三维空间。** 这不是贬低——这条路的性价比极高：一张图就是一个场景，没有建模、没有烘焙、没有资源管线。

原作者本人在评论区也说了高斯泼溅那条路"实际效果一般，适合大场景，不适合室内的场景"。

---

## 换题材

**只改 `data/timeline.js` 一个文件，`index.html` 一行不用动。**

结构：

```
META          标题、年份范围（年份用作背景水印大字）
CHAPTERS[]    章
  └ nodes[]   节点
      ├ card         史料卡片：dateline / place / body / significance
      ├ panorama     全景图文件名（放 panoramas/ 下）
      ├ fallbackTone 图缺失时的降级三色
      ├ sceneCaption 场景旁白一句
      ├ quiz         抉择题：question / options[] / answer / verdict / hint
      └ score        答对答错各得多少分
TITLES[]      得分称号档位
```

**全景图可以先不做**——文件不存在会自动降级成程序化天幕（正弦叠加的远山剪影 + 雾带 + 光点，左右接缝天然连续），左下角会标注"程序化天幕"。骨架先跑通，图慢慢补。

> demo 自带的四个节点**现在都配了真图**。想看降级长什么样，把 `panoramas/` 下任意一张图改个名，刷新即可。

粤剧百年的例子：章 = 红船年代 / 省港大班 / 薪火重光，节点 = 琼花会馆 / 八和公所重建 / 马师曾红线女回国，全景图 prompt 换成戏台、后台、水牌、锣鼓架。

---

## 全景图怎么生成

走 Gemini 逆向免费通道（本机已配好）：

```bash
cd ~/Projects/content-publisher/scripts/gemini-web-image
bun gemini-web-image.ts --model gemini-3-pro \
  --prompt "<见下方模板>" \
  --output ~/Projects/shanhe-scroll-demo/panoramas/<名字>.png
```

生成后规整成精确 2:1（Gemini 出的是 1456×720，差一点）：

```bash
sips -z 728 1456 panoramas/<名字>.png --out panoramas/<名字>.png
```

### prompt 模板

开头这句是**必须的**，决定了出不出弧形包裹感：

```
360 degree equirectangular panorama, 2:1 aspect ratio, seamless horizontal wrap.
```

后面接：`场景主体 + 具体年代地点 + 人物在做什么 + 光源 + 远景透出什么 + 画风色调 + no text`

本项目实际用过的三条（效果都可用）：

- **虎门销烟**：`Coastal beach at Humen, Guangdong, 1839. Two large rectangular pits dug in the sand filled with seawater and quicklime, thick white smoke rising from dissolving opium. Qing dynasty officials and soldiers in conical hats surrounding the pits, crowds of villagers watching from rocks, war junks anchored offshore under an overcast sky. Cinematic historical illustration, cool grey-blue and pale sand tones, painterly, no text.`
- **官署议事**：`Interior of a Qing dynasty Chinese official hall at night. Massive red lacquered columns with golden dragon carvings, coffered ceiling, candlelight and oil lamps, officials in dark blue court robes standing around a table with maps. Through the open doorway, snow falling over distant palace roofs. Cinematic historical illustration, muted warm amber and deep shadow, painterly, no text.`
- **南湖红船**：`Interior of a small traditional Chinese pleasure boat on Nanhu Lake, Jiaxing, 1921. Low wooden cabin ceiling, a round table with teacups and papers, a few young men in long gowns seated in discussion, lantern light, misty lake and distant willow shore visible through the open cabin window. Quiet dawn atmosphere, muted teal and warm lamp tones, cinematic historical illustration, painterly, no text.`

---

## 已知限制（诚实清单）

- **不是真 equirectangular**：Gemini 出的图有球面包裹的观感，但不是严格的球面投影。左右接缝对不齐，天顶和地底会有明显畸变。**规避办法**：`lat` 已限制在 ±72°（不让相机看到极点），接缝转到背后就看不见。真要严丝合缝得用专门的全景生成模型或 pano 后处理。
- **SynthID 水印**：Gemini 生成的图带不可见水印，右下角偶尔有可见的小星标。自用无妨，商用发布要注意。
- **史料是演示用的**：`timeline.js` 里四个节点的文本是按通行史实写的，但没有逐条核过原始文献。真要用于对外内容，史料必须重新考据。
- **没做人物星图和舆图**：原作有，这里刻意没做——它们跟"走进去"这个核心问题无关，做了只是让文件变大。真要加，力导向图用 `d3-force` 或 `three-forcegraph` 几十行的事。
- **移动端没适配**：只在桌面宽屏下调过。

---

## 文件

```
index.html              单页应用（结构 + 样式 + 逻辑，约 700 行）
data/timeline.js        题材数据 ← 换题材只改这个
panoramas/              360 全景图
vendor/three.module.js  Three.js r160（本地 vendor，离线可跑）
shots/                  效果截图
```

无构建、无 npm、无依赖安装。Three.js 是唯一外部库，已经 vendor 到本地。
