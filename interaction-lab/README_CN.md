# 交互实验室

[English](README.md)

每轮生成一批带弹簧手感的小交互（按钮、开关、翻卡、拖拽……），自动录屏、自动检查，再由另一个 AI 拿作者以前说过的原话当判据筛一遍，留下两三条，外加一条「意外项」防止越筛越窄。思路来自 Emil Kowalski 的 interaction lab：他每天生成新交互、自己挑；这里不让作者每天挑，用她已经说过的话代替。

这是一套工具，不是上线的页面：候选和录屏都放在仓库外面，本目录只有生成器、录屏检查和判官。规格与候选合同见 [SPEC.md](SPEC.md)。

## 三段命令

在本目录下运行。`<轮目录>` 是这一轮的暂存目录，`<媒体目录>` 放 mp4 和 gif。

1. **生成**（Codex，后台跑，约 5–10 分钟）

   ```bash
   tools/generate.sh <轮目录> [种子] [个数=8]
   ```

   按种子从 `kinds.json` 加权抽种类，填好 `generate-prompt.md`（候选合同原样从 SPEC 嵌入），经 `codex-run.sh` 带 Done Gate 写进 `<轮目录>/candidates/<slug>/index.html`。

2. **录屏与自动检查**（本机 Playwright + ffmpeg，8 个约 2 分钟）

   ```bash
   NODE_PATH="$(npm root -g)" node tools/record.cjs <轮目录>/candidates <媒体目录>
   ```

   390×664 手机视口、2 倍像素，假时钟逐帧推进 3 秒，按候选自己的 `__LAB__.demo` 发真实触摸。每个候选出首帧 `shot.png`、12 格联系表 `contact.png`、`checks.json`（C1–C10），媒体目录出 `<slug>.mp4` 与 `<slug>.gif`。

3. **判官**（Kimi，只读，最后只写 `scores.json`；约 5–10 分钟）

   ```bash
   tools/judge.sh <轮目录> <审美账.md> <制作意见账.md> [history.json]
   ```

   生成 `judge-brief.md`（两份账只取「原话」四列，推断列不给判官），交给 Kimi 看图、读源码、打分，再由 `tools/validate-scores.cjs` 校验：每一分都要有出处，原话引用逐字比对，没过的检查必须扣分，留下 2–3 个且检查全过，意外项 1 个且种类不同，判官不是生成者。

## 测试

```bash
node --test tests/*.test.cjs
```

浏览器部分的校准：`tests/fixtures/bad` 是故意违约的坏样本（CSS 过渡、30 像素点击区、按下 200 毫秒才动、没有弹簧），`tests/fixtures/good` 是合规的好样本。跑 `record.cjs tests/fixtures <临时目录>` 应得到坏样本 C4/C5/C7/C8 四项红、好样本全绿。

## 谁会点开、AI 素材

写给想看「AI 怎么自己挑交互」的开发者。本目录的代码由 AI 协作完成；候选交互由 Codex 生成，判官是 Kimi。
