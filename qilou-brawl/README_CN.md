# 骑楼擂台

傍晚的西关骑楼街，街坊在街尽头摆了一台醒狮擂台。你是粤剧武生阿龙，从街口一路打上去：先过早茶阿婆，再过包租公的肚腩，最后上台对付醒狮头。

**在线玩：https://aliceljy.github.io/playground/qilou-brawl/**

## 操作

| | 键鼠 | 触屏 |
|---|---|---|
| 移动 | WASD | 左下摇杆 |
| 拳（三连） | J / 左键 | 拳 |
| 脚（二连，回旋踢收尾） | K / 右键 | 脚 |
| 翻滚 | 空格 | 滚 |
| 格挡（按住） | Q | 挡 |
| 锣鼓满了开二阶段 | E | 锣 |
| 转镜头 | 拖动鼠标、滚轮远近 | 拖动空白处 |

输了从当前这一段重来，不用从头打。

## 怎么做的

- 四个角色先用 AI 画成卡通全身图，再交给 [PINOC](https://viggle.ai/pinoc)（Viggle）一张图生成带骨骼的高斯泼溅角色，没有建模、没有手动绑骨。
- 动作：走、跑、踢、回旋踢、翻滚、格挡、受击、倒地、起身、欢呼来自 PINOC 免费动作库；库里没有出拳，三连拳是用一句话描述生成的。
- 渲染：PlayCanvas + [@viggle/splat-engine](https://www.npmjs.com/package/@viggle/splat-engine)（MIT）。骑楼街、满洲窗、招牌、灯笼、擂台都是代码搭的方块，合并成两个网格。
- 声音全部现场合成：拳脚、铜锣、醒狮锣鼓点。
- 玩法逻辑在 `src/core.js`，不依赖画面，Node 里能直接跑；自动驾驶（`makeBot`）用来测试、打通全局和固定机位截图。

参考了 akokoi1 的「长安街斗」的做法（同样是 PINOC 角色 + PlayCanvas），只借流程，没有用它的代码和素材。

## 本地

```bash
npm ci --ignore-scripts && npm rebuild esbuild   # playcanvas 会带一个用不上的 canvas 原生包，跳过它的编译
node --test tests/*.test.cjs
node tools/build.mjs          # 产物在 dist/，用任意静态服务打开 dist/index.html
```

带参数：`?auto` 让自动驾驶打（`&fast=4` 快进），`?view=hero|wide|stress|boss` 固定机位，`?record` 录屏模式。

录屏：`node tools/record.cjs <页面地址> <输出目录> 1920 1080 200 3` 接管页面时钟逐帧截图（30 帧不丢帧），录完把记下的发声离线渲染成音轨合成 MP4；只想调声音用 `tools/rerender-audio.cjs`，不用重录画面。

规格见 [SPEC.md](SPEC.md)，验收记录见 [VERIFICATION.md](VERIFICATION.md)，第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 谁会点开、AI 素材

- 谁会点开：想看「一张图怎么变成能打的 3D 角色」的人，和喜欢西关骑楼、醒狮、粤剧题材的广州街坊。
- AI 素材清单：四个角色的卡通全身图由 AI 画图工具生成，再经 PINOC 生成带骨骼的高斯泼溅角色；走、跑、踢、滚等动作来自 PINOC 免费动作库，三连拳由一句文字描述生成；街景、擂台和声音全是代码；代码由人与 AI 协作完成。
