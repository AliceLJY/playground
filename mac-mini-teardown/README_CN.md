# Mac mini 换硬盘 · 21 步拆解台

[English](README.md)

Mac mini（M4，2024）硬盘满了，有人直接拆机换大容量。我不敢，那就在 3D 里替我拆一遍：按 iFixit 换 SSD 指南一步步拆下去，翻面、撬开 4 个销钉、拧下内板和风扇的螺丝、断开 ZIF 排线，最后拔出那块 SSD 模块。屏幕上的读数卡一直在涨：步数、螺丝、刀头、接头。顺带看一眼：内存是焊在 M4 旁边的颗粒，加不了。拔出来的 SSD 长得像普通 M.2，但模块上没有存储控制器，控制器在 M4 芯片里，所以普通 M.2 硬盘插不上。接着拍怎么卡进去：一块第三方 2TB 小板斜着插进同一个插槽、压平，螺丝落进半圆缺口。最后是我为什么没这么做：怕影响保修，而且装好以后还得用另一台 Mac 的 Apple Configurator 做 DFU 刷机、整块盘抹掉重装系统，所以我接了一块外接硬盘。

不碰它时页面自己导览 54 秒；点一下就交给你：拖右下角旋钮、按「上一步 / 下一步」或 ← →，自己拆或装回去；25 秒不动交回导览。

线上：https://aliceljy.github.io/playground/mac-mini-teardown/

## 数字从哪来

| 数字 | 出处 |
|---|---|
| 21 步；底盖 4 个销钉、没有螺丝；13 颗螺丝（T5 ×8、3IP ×2、5IP ×2、8IP ×1）；4 种刀头；3 个接头（电源键排线可不拔、风扇 ZIF、SSD 插槽） | iFixit 指南 180199《How to Replace the SSD in your Mac mini (2024)》 |
| 内存是 LPDDR5 颗粒、紧挨 M4；SSD 两面各一颗 128 GB 闪存 | iFixit 芯片识别 178986 |
| 「看着像普通 M.2，但没有存储控制器，普通 M.2 不兼容」 | 指南 180199 的引言 |
| 机身 12.7 × 12.7 × 5.0 cm，M4 款 0.67 kg | Apple 支持页 Mac mini (2024) Tech Specs |
| 换第三方大容量小板，装好后要用另一台 Mac 的 Apple Configurator 做 DFU 刷机、整块盘抹掉重装系统 | 第三方小板厂商的刷机教程（不写厂商名）与作者 2026-09 扩容调研 |
| SSD 模块的外形：竖长圆角板约 1 : 1.5，金手指带防呆缺口，远端半圆缺口压螺丝 | 第三方 2TB 小板商品图；原厂模块同外形，两面各一颗 128 GB |

`data/` 里存了两份指南的步骤原文摘录（`tools/extract-ifixit.py` 从 iFixit API 原文摘出），`tests/` 直接解析它们对账，不是和常量比。内部零件的尺寸、位置、颗粒数量是示意，按步骤描述的相对位置摆放，页角写明「模型为示意」。

## 怎么做的

- 一个输入驱动全部：拆解进度 `s`（0–24：21 个 iFixit 步骤，加「顺带看内存」「SSD 特写」「换上第三方小板」三拍）。`src/model.js` 只有纯函数，给 `s` 算出每个零件的位姿、四个计数、侧视线稿；三维模型、读数卡、旋钮、测试都读它。
- 整台机器由代码搭出（`src/machine.js`），没有模型文件、没有图片。
- 导览是一条 `s(t)` 曲线加镜头、旁白和光标（`src/tour.js`），三处放慢：掀开底盖、拆风扇看到 SSD、拔出 SSD。
- 做法借 teardown 九步（模型先于画面、按节拍截图挑错、自驾导览、纯时间函数录片），代码另写，同 [最靓的仔](../gz-roach/)。

## 本地跑

```bash
npm ci
node --test tests/*.test.cjs          # 逻辑：对账 iFixit 原文、零件互不穿插、导览节奏
node tools/build.mjs                  # → dist/index.html，单文件离线
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs ./check   # 浏览器验收
NODE_PATH="$(npm root -g)" node tools/stills.cjs beats.png --size 540x960 --cols 6   # 按旁白节拍抽帧
NODE_PATH="$(npm root -g)" node tools/record.cjs 竖屏.mp4 --size 540x960 --dpr 2   # 逐帧录片 + events.json
uv run --with numpy python -I tools/score.py 竖屏.events.json 配乐.wav               # 按同一时间轴合成配乐
```

固定机位：`?view=open|cover|plate|fan|ssd|ram|pull|show|back|swap|screw|outro|done`，`?at=秒`，`?s=进度`，`?capture` 录片模式。

## 已知的边界

- 步骤、螺丝、接头、内存和闪存的事实按 iFixit；内部零件的大小和位置是示意，没有拆真机核对。
- 「我怕影响保修」是作者自己的顾虑，不是对 Apple 保修政策的说法。
- 没在真手机上试过；帧率只在一台 Mac mini（M4）的无头 Chrome 上量过。页面没有声音，录片配乐是代码合成的。

## 许可

页面源码归作者。打包进来的 Three.js 保留它自己的 MIT 许可，许可全文写在发布文件开头的注释里；`data/` 里的 iFixit 步骤原文按 CC BY-NC-SA 3.0，出处另见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 谁会点开、AI 素材

- 谁会点开：手上有台 Mac mini、硬盘快满了、在犹豫要不要拆机换盘的人。
- AI 素材清单：没有用任何图片、模型或采样声音（录片配乐是代码合成的）；机器的形体全部代码生成；代码由人与 AI 协作完成。
