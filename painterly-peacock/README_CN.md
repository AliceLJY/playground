# 油彩孔雀

一只油画质感的三维孔雀，站在暖象牙色的画面里。移动鼠标，它跟着走；鼠标停在它身上，它抖抖脑袋，尾屏一根根慢慢打开，移开又慢慢收起。点它一根尾羽，那根羽毛脱落飘到地上，孔雀走过去低头衔起来，转头把它插回原来那个位置。滚轮往下它走近一步狠狠啄一下，往上它退回去；空格让它蹲一下跳起来再落地。

手机上点地面领它走，点尾羽一样会掉，底部有「开屏、走近、后退、跳」四个按钮。声音默认关，右上角可以打开，都是 Web Audio 当场合成的轻声音。

所有造型、颜色、笔触颗粒和声音都由代码生成，没有外部模型、贴图、图片或音频文件。造型是示意，不对应真实品种。

## 运行和检查

```sh
npm ci
node tools/build.mjs            # 打成单文件 dist/index.html
node --test tests/*.test.cjs    # Node 测试：拾羽全链、羽毛总数、喙和羽根不分离、动作归属、安全区、走路朝向、开屏、材质、预算、页面措辞
node tools/browser-check.cjs    # 真实 Chrome：10 张固定状态截图、布局、像素读数、真实鼠标和触屏输入、页面报错
node tools/preview.cjs          # 没有 WebGL 的机器上看构图的 CPU 预览（不是渲染截图）
```

源码入口：`node tools/serve.cjs . 8941`，打开 `http://127.0.0.1:8941/dev.html`。固定状态用 `?scene=stand`（收屏站立）、`display`（满屏）、`fallen`（羽毛落地）、`carrying`（衔着往回插）、`returned`（插回之后），都是从固定种子真实玩出来的，进入后暂停。`window.__PLAYTEST__` 提供 `ready`、`snapshot()`、`reset()`、`setSeed(n)`、`step(ms)`、`hover(true/false)`、`walkTo(屏幕 x, y)`、`pluck(id)`、`jump()`、`peck()`、`setScene(名字)`。验收条目、还没验证的部分见 [SPEC.md](SPEC.md)。Three.js 锁定 0.186.1，MIT 许可保留在生成的页面里。

我的AI小木屋（公众号）· GitHub @AliceLJY

## 谁会点开、AI 素材

- 谁会点开：喜欢鸟、喜欢油画笔触，想在手机或电脑上逗一只孔雀玩一两分钟的人。
- AI 素材：代码和文档由 AI 协作完成。所有几何、颜色、笔触颗粒、动画和声音都是程序生成，没有使用 AI 生成或导入的图片、模型、动作文件和音频。
