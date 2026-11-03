# 记忆褪色

[English](README.md)

AI 记忆系统里，旧记忆的检索分会乘上一个越来越小的倍率，这一页把那条公式挂到一根弹簧上：卡片是从我自己的记忆库里抽的真实记忆（只取数字，不含内容），曲线上的点是同一天抽的 400 条，每天自动换一批。拖时间轴，卡片往后一天天往下沉、变淡；点它一下就是「想起它一次」，它往上一蹿，之后掉得更慢；同一天已在库里或本页被想起过，就不能再加一次，按钮与卡片（含 Enter / 空格）一致。钉住它就不再掉；不管怎么忘，都有一块地板接着。

手机上弹簧、时间滑块和主按钮放在同一互动区，曲线与样本说明在下面；桌面左右排列。舞台空白和曲线可纵向滚页，卡片仍可自由拖拽，曲线横拖仍可选日。卡片上的「入库样本」保留原始数字，下方读数随推演变化。

公式和参数照 [RecallNest](https://github.com/AliceLJY/recallnest) 的 `decay-engine.ts` 与 `access-tracker.ts` 搬来，没有改；测试里有一张用原代码算出来的对照表。弹簧只决定卡片怎么落过去，落点由公式定。

规格与验收见 [SPEC.md](SPEC.md)。

页面下方「可选小实验 → 三次想起」可用三枚标记安排日期，对比从今天起第 180 天的「你的安排」与「不干预」，随时返回原推演；这是 RecallNest 衰减规则的小实验，不是人类记忆训练法。

## 本地预览

```bash
python3 -m http.server 8790
```

打开 `http://localhost:8790/`。地址后加 `?pick=0&ahead=60&recalls=10,30&pin=0` 可以直接停在某个状态。

## 测试

```bash
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/shoot.cjs http://localhost:8790/ <仓外输出目录>
NODE_PATH="$(npm root -g)" node tools/experiment-check.cjs http://localhost:8790/ <另一个仓外输出目录>
```

浏览器脚本使用本机 Playwright，覆盖扣栏手机视口及桌面，失败返回非零；截图只取当前可视区。最小试玩钩子为 `window.__PLAYTEST__.ready` / `snapshot()`，原有 `__fade` 仍可用。实测与未测范围见 [VERIFICATION.md](VERIFICATION.md)。

两个浏览器脚本顺序运行；新脚本走真实键盘和触屏的安排、失败、重试、完成与返回。`snapshot().experiment` 给出实验的实际状态，未进入时为 null。本站没有构建步骤，发布时原样复制 `index.html` 和 `src/`。

## 谁会点开、AI 素材

写给想知道「AI 是怎么记住又忘掉东西的」的人，不用读公式。页面代码由 AI 协作完成；没有生成的图片、声音或模型。
