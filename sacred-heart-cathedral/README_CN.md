# 石室圣心大教堂 · 纯代码建筑导览

线上：https://aliceljy.github.io/playground/sacred-heart-cathedral/

广州一德路那座双尖塔的花岗岩教堂，整座用代码搭出来。外面能转着看正立面的三座门、玫瑰窗和一对八角石尖塔，侧面的高窗、飞扶壁和一排小礼拜堂，北端的后殿；也可以从一德路的大门走进院子，上五级台阶，穿过中门走进中殿，看两排束柱、红砖砌的肋拱顶、后殿的长窗，以及彩窗落在地面和柱子上的色光。上午、正午、傍晚三档光可以切：上午东窗亮，傍晚西窗亮，正午是南面的玫瑰窗。

- **操作**：轨道（拖动旋转、滚轮或双指缩放、右键拖动平移）、漫游（WASD 加拖动；手机左下摇杆加拖动）、飞行（WASD 沿视线飞，空格升、Q 降）。右侧 18 个视点，点了飞过去；小平面图上的圆点也能点。
- **没有任何素材文件**：形体、石纹、彩窗全是运行时用代码画的。Three.js 打进单文件。
- **不是测绘**：哪些事实查过两处来源、哪些是对着照片量的、哪些是示意，见 [facts.md](facts.md)，页面右上「依据」里也写了。彩窗上的人物只是色块，不是任何一扇真窗。

## 跑起来

```bash
npm ci
node tools/build.mjs            # 出 dist/index.html
node tools/serve.cjs . 8947     # 源码入口 /dev.html，打包产物 /dist/index.html
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8947/dist/index.html
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8947/dist/index.html shots
NODE_PATH="$(npm root -g)" node tools/compare.cjs http://127.0.0.1:8947/dist/index.html <实拍目录> <输出目录>
```

规格与验收条目见 [SPEC.md](SPEC.md)。`tools/compare.cjs` 要一份实拍照片（文件名见脚本），照片没有放进仓库，出处在 `facts.md` 文末。

## 谁会点开、AI 素材

写给想在手机上逛一圈石室、看看哥特教堂是怎么撑起来的人。全部代码、形体与贴图由 AI（Claude）协作生成，没有外部模型、图片、音频；建筑事实来自公开资料，比例对着维基共享资源上的实拍量，细部是示意。界面外壳沿用本仓的 FORMA 导览样式，是圣家堂那一页的姊妹篇。
