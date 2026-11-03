# 2026-11-03 B5 回归

只做报告「值得改的」1、2：手机模型在前，当前状态与说明紧随其后，底部固定下一步按钮；11 步目录和斗栱剖视窗按需展开。横屏将模型与说明并排。首次仍须按原 11 步顺序完成；结束后可直接回看斗栱、梁架、拆开及装回，明确显示回看状态；从头来重新锁定引导。未做受力答题或装配选择玩法。

## 红 → 绿

`tools/browser-check.cjs` 在原始发布页运行，88 项中 40 项失败：手机主操作缺固定入口、过程及完成后模型/说明出屏，完成后没有回看入口。修后源码生成页和发布 `index.html` 各 124/124 通过。全程真实点击 11 步，已有时钟钩子仅用于等动画停稳；读取实际显示构件和当前状态，验证四种回看与重置锁定。手机每一步都测模型、说明和按钮同屏，按钮至少 44 CSS px。

初次修后还在 844×340 发现说明被底栏遮住，该项报红后改为左右布局，再跑变绿。逐张读图又发现回看斗栱/梁架时墙体仍留在画面：墙生长动画的内联透明度覆盖了隐藏样式。新增实际计算透明度检查在四视口各报两项红（`nanchan-opacity-before/`），再修隐藏规则，确保真消失，而不只检查状态标记。截图逐张对照：初屏、完成、斗栱与拆开，包含桌面和三种手机视口；输出目录 `nanchan-before/`、`nanchan-source/`、`nanchan-after/`。

## 构建与环境

SVG / Anatomy 页面，不使用 three。从 `src/` 重建并复制发布文件；最终 `src/nanchan-light.html` 与 `index.html` 字节一致。`--light --audit` 输出 `audit passed`：1028 solids、918 items、63 depth states、102 frame states，未动几何与尺寸。审计后只调整了横屏与隐藏层 CSS，重新构建了最终页。

```sh
cd nanchan-temple/src
NODE_OPTIONS=--max-old-space-size=14000 node build.mjs --light --audit
cp nanchan-light.html ../index.html
# 仓根启动本地 HTTP 后：
NODE_PATH="$(npm root -g)" node nanchan-temple/tools/browser-check.cjs \
  http://127.0.0.1:8765/nanchan-temple/ /path/to/output
```

Chrome 156.0.8078.80：390×664、320×568、844×340 触屏模拟 / DPR 2，1365×900 / DPR 1；各页页面错误 0。没有 Node 逻辑测试，构件及布局检查在浏览器中完成；没有新增框架或依赖。

另录了正常入口约 31 秒：真实点击走完 11 步，再回看斗栱及拆开，未用钩子推进状态，页面错误 0。录像在验收输出的 `opening-final/nanchan-temple/`，按每秒一帧抽样复看；这不是全帧视觉验收。

真手机、Safari、实际触屏手感及真人首次理解未测。页面用拟声文字表达落件，无音频；没有声效听测结论。
