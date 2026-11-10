# 圣家堂 · 纯代码建筑导览

线上：https://aliceljy.github.io/playground/sagrada-familia/

一座用代码搭出来的圣家堂。外面能转着看十八座塔、三个立面、后殿和周围的扩展区街块；点右边的视点会飞过去；也可以从三个立面的门走进去，看分叉成树冠的柱子、带采光口的拱顶，以及两侧彩窗落在地面和柱子上的色光。早晨、正午、傍晚三档光可以切：早晨是诞生一侧的蓝绿，傍晚是受难一侧的红橙黄。

- **操作**：轨道（拖动旋转、滚轮或双指缩放、右键拖动平移）、漫游（WASD 加拖动；手机左下摇杆加拖动）、飞行（WASD 沿视线飞，空格升、Q 降）。
- **没有任何素材文件**：形体、贴图、彩窗花纹全是运行时用代码画的。Three.js 打进单文件。
- **不是测绘**：哪些数字查过、哪些是示意，见 [facts.md](facts.md)，页面右上「依据」里也写了。荣耀立面和它的四座塔现实中还没建成。

## 跑起来

```bash
npm ci
node tools/build.mjs            # 出 dist/index.html
node tools/serve.cjs . 8957     # 源码入口 /dev.html，打包产物 /dist/index.html
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8957/dist/index.html
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8957/dist/index.html shots
```

规格与验收条目见 [SPEC.md](SPEC.md)。

## 谁会点开、AI 素材

写给想在浏览器里逛一圈圣家堂、又不想等模型加载的人。全部代码、形体与贴图由 AI（Claude）协作生成，没有外部模型、图片、音频；建筑事实来自公开资料，细部是示意。对标的演示来自 AI超元域的视频，界面外壳沿用本仓作者之前的 FORMA 导览样式。

## 第二轮（2026-11-11）

三个立面重做成成组的构件并推到钟塔前面，塔身加肋和石片，柱子改成有棱扭转的截面，光柱改成体积光，加了画质三档（底栏右侧按钮，掉帧会自动降档）和荣耀门廊柱的碰撞。对照脚本 `tools/compare2.cjs`。
