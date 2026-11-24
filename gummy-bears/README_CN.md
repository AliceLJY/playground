# 软糖熊

白色桌面上一把半透明的软糖熊：樱桃红、橙、柠檬黄、苹果绿和几乎透明的菠萝色。按住任意一只熊的任意部位拉：拉头，脖子先伸长，身体被拖着过来；拉耳朵或一条腿，那一段就变细。往下压，它会鼓起来；用力一甩再松手，它飞出去、落地压扁、弹起来，把碰到的熊推开。松手后每只熊都会自己弹回原形，熊和熊、熊和桌面不会穿过去。点「再倒一些」从上方倒下一把，堆成一堆会抖一会儿、然后静下来的糖。

右边的小卡可以挑倒出来的口味、调软硬，实时显示拉伸倍数和弹跳高度。电脑和手机竖屏都能玩，鼠标和手指都能抓。手机上降一档：不做折射，熊少一些。

所有造型、颜色和影子都由代码生成，没有图片、模型或字体文件。软体物理也是自己写的（四面体格子加位置式约束），和 Three.js 一起打进一个单文件。

## 运行和检查

```sh
npm ci
node tools/build.mjs              # 打成单文件 dist/index.html
node --test tests/*.test.cjs      # Node 测试：拉到最大回原形、不穿透、倒满静止、reset、同种子、构图、网格、单文件
node tools/browser-check.cjs      # 真实 Chrome：8 张截图、布局、像素、鼠标和触屏拖动、页面报错
node tools/preview.mjs            # 没有 WebGL 的机器上看构图的 CPU 预览（不是渲染截图）
```

源码入口：`node tools/serve.cjs . 8941`，打开 `http://127.0.0.1:8941/dev.html`。`?seed=n` 换种子，`?quality=low` 强制手机档。`window.__PLAYTEST__` 提供 `ready`、`snapshot()`、`reset()`、`setSeed(n)`、`step(ms)`、`grab(熊编号, 部位, [x, y])`、`release()`、`pour()` 等。上限、降档内容、预算、验收条目和还没验证的部分（真显卡观感、帧率、手机真机）见 [SPEC.md](SPEC.md)。Three.js 锁定 0.186.1，MIT 许可保留在生成的页面里。

竖屏演示片（1080×1920，手动跑，不进检查；手机视口下页面自动用低画质档，和手机上一样），先起 `node tools/serve.cjs . 8982`：

```bash
NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> --endcard <署名页模板目录>   # 接管页面时钟逐帧录，真实触摸（拉、甩、点「再倒一些」），录下页面自己的声音
~/.local/share/sweety-statechart-video/venv/bin/python -I tools/demo-sound.py <输出目录> <成片.mp4>   # 配乐垫在页面声音下面、响度归到 -12 LUFS（要 numpy 和 ffmpeg）
```

片里只拉、甩、倒，不往下按（往下按熊表面还会起皱，见 SPEC.md）。

我的AI小木屋（公众号）· GitHub @AliceLJY

## 谁会点开、AI 素材

- 谁会点开：喜欢捏东西、玩果冻和橡皮泥手感的人，想在电脑或手机上随手抓几只软糖熊拉一拉、甩一甩、倒一堆看它们抖。
- AI 素材：代码和文档由 AI 协作完成。所有几何、颜色、影子和物理都是程序生成，没有使用 AI 生成或导入的图片、模型、动作文件和声音。声音（落地、抓起、松手）是 Web Audio 当场合成的，没有音频文件。
