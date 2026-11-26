# 我不是机器人

一份会自己改自己的网页演讲。开场是一页平平无奇的人机验证，讲者说「先过个验证」；接着这一页自己改了抬头：「这场演讲，就是一道验证码。」之后每一场出一道「证明你是人」的题——认字、认图、点一下、说一句「我不是机器人」——每一道都有一个青色的光标抢先答对，验证页一场比一场伤得重，直到它自己点了那个勾，整页碎成玻璃。最后回到开场那一页。

按 → 或点画面右侧翻到下一步，← 退回；手机上左右滑、或用底部的 ‹ › 也行；N 打开讲稿，F 全屏，A 自动播放，Home / End 回到开头 / 收尾。讲完再按一下 → 是资料页。

## 本地运行

```sh
npm ci
node tools/build.mjs
node tools/serve.cjs dist 8951
```

打开 `http://127.0.0.1:8951/index.html`。源码入口：在本目录跑 `node tools/serve.cjs . 8951`，打开 `/dev.html`。打包产物是一个带 Three.js 的 HTML，所有画面由代码画出来，页面不从外面加载任何东西。

- `?step=N&t=秒`：从第 N 步（0 起）开始。
- `?notes=1`：一打开就显示讲稿。
- `?headless=1`：不跑动画循环，由 `window.__talk.step(毫秒)` 推时间，用来逐帧录视频。

## 检查

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/wide 1920x1080
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/phone 390x664
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/keys 1280x720 --keys
NODE_PATH="$(npm root -g)" node tools/phone-check.cjs http://127.0.0.1:8951/index.html
```

规格与验收条目见 [SPEC.md](SPEC.md)。

## 数字从哪来

演讲里的数字都出自一手材料，口径照事实核查：99.8% 是论文用合成扭曲文字测「最难一类」的结果；17,600 本书出自 reCAPTCHA 2008 年的《科学》论文，书堆高度按每本 3 厘米示意；「约七成」是 12306 方面 2015 年的说法；1.4 秒是论文引用的文献值，人的 3.1–4.9 秒是实测；GPT-4 那句话来自 OpenAI 报告里评估机构用早期版本做的受控测试；AI 代理点框的那句话来自用户截图，经媒体报道。右下角的分数是示意。完整出处在演讲最后的资料页。

## 方法来源

学的是 @fluxxrider 公开的网页演讲「The Last Boring Slide」的讲法：外壳是最无聊的默认页面，演讲自己改自己，一场一个满屏的三维世界，屏上只留一句话，结尾回到同一页、只多一处前面埋过的变化。只学方法，没有用原作的代码、画面和讲稿。验证框、九宫格图块都是自己画的，不仿任何真实产品的标识。

Three.js 的 MIT 许可保留在打包的 HTML 里。署名为公众号「我的AI小木屋」与 GitHub @AliceLJY。

## 谁会点开、AI 素材

- 谁会点开——每天都在点「我不是机器人」、想知道这个框还能拦住谁的人；也给想看「网页本身就是演讲」怎么做的人。
- AI 素材——代码与讲稿由 AI 协作完成，画面全部由代码画出；没有使用 AI 生成的图片、模型或声音。
