# 凉拖拍蟑螂

广州雨夜的小巷里，蟑螂一只只蹿上来。按住屏幕划过去，一拖鞋拍扁；连着拍中分数翻倍。画着红圈的奶茶别碰，三杯洒完就收工。撑过 45 秒，肌肉蟑螂「最靓的仔」登场，25 秒内把它拍服，还能和它合张影。

**[在线游玩](https://aliceljy.github.io/playground/slipper-smash/)**

一局一分钟左右。手机竖屏、横屏和电脑都能玩。

## 操作

- 手机：按住屏幕划过蟑螂，点一下也算。
- 电脑：按住鼠标拖过去。空格或回车开始、再来一局。
- 开始页和结算页左下角可以关声音。

## 怎么做的

- 一页规格在 [SPEC.md](SPEC.md)：配色、构图范围、规则数值、性能预算和十条验收。
- 规则在 `src/core.js`，不碰画面，可以在 node 里跑；测试用真实对局量抛物线落点、同屏数量、奶茶占比和四档打法的时长与通关率。
- 画面是二维画布。人字拖、奶茶和特效是代码画的，声音用 WebAudio 现场合成。
- 固定机位：`?view=hero`、`?view=stress`、`?view=boss`、`?view=win`；调试钩子是 `window.__slipper`。

## 本地运行

```bash
cd slipper-smash && python3 -m http.server 8931
```

打开 `http://127.0.0.1:8931/`。测试：`node --test tests/*.test.cjs`。没有构建步骤，发布时原样拷贝 `index.html`、`src/` 和 `assets/`。

## 素材与来源

- 划屏拍东西的玩法是「水果忍者」这一类游戏的通用玩法，起因是看到 [Pumpkin Smash](https://frank-otto.github.io/pumpkin-smash/) 这个万圣节小游戏；没有读它的代码，也没有用它的素材。
- `assets/` 里的蟑螂、小巷和人物图片是作者用 AI 画图工具生成的，人物是虚构形象；蟑螂贴图由 `tools/make-sprites.cjs` 从白底原图抠出。

## 验证

见 [VERIFICATION.md](VERIFICATION.md)。手感、声音和好不好玩还要真人试玩。
