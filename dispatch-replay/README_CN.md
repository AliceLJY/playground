# 派活回放

回放一次真实的 Claude Code 工作。作者丢来一句「给一批公众号旧文做事实核查」，总调度 Claude Code 用 68 分钟把 15 篇文章拆给 21 个子 agent：15 个核查员，6 个复核员。每个子 agent 在自己独立的上下文里搜网页、读网页、写核查表，上下文涨到 14.4 万到 22.5 万 token；干完交回给总调度的报告只有 205 到 588 字。

在线：https://aliceljy.github.io/playground/dispatch-replay/

## 怎么看

- 默认 1.5 分钟放完，可以换成 3 分钟。空格暂停，左右方向键快进快退，拖底下的时间轴跳到任意时刻。
- 点一个子 agent，看它自己的数字：模型、跑了多久、调了哪些工具、上下文峰值、交回多少字。
- 每条字幕出现时会慢放一会儿，停够读完的时间；这时右上角时钟前面标「慢放」。时钟本身始终是真实时间。
- 固定画面：`?view=hero`（同时在跑的子 agent 最多的时刻）、`?view=wide`、`?view=end`、`?t=<真实秒数>`。

## 画面里的数字从哪来

数据由 `tools/extract.py` 从作者本机的 Claude Code 会话记录里抽出来，只带任务标签、模型名、工具类别（网页 / 文件 / 写入 / 命令 / 外部工具 / 其他）、时间、token 数和字数，不带提示词、报告原文和文件路径。任务那句话和字幕是手写的。

- 气泡面积和 token 数成正比，子 agent 和总调度用同一把尺。token 是每个子 agent 自己上下文的峰值，也就是它单次请求读进去的上下文里最大的那一次，含缓存。
- 交回的报告按字数计，只算子 agent 自己写的那部分，不含系统套在外面的说明。token 和字数单位不同，所以报告包裹画成固定大小的小亮点，旁边写字数。
- 结尾那个大圆是 21 个子 agent 峰值加起来的 376.7 万 token，和总调度自己的 33.8 万 token 放在一起比。

换一份会话：

```bash
python3 -I tools/extract.py <会话 jsonl> --from <开始时间> --to <结束时间> \
  --slug <名字> --title "<标题>" --task "<任务那句话>" \
  [--subtitle "<副标题>"] [--captions <字幕.json>] [--label-strip '<要删掉的标签片段>'] > data/<名字>.js
```

再在 `data/index.js` 里加一行，页面右上角会多出一个选择框。数据格式见 [SPEC.md](SPEC.md) 第 3 节；Kimi、Gemini、Grok 这类外部 AI 可以写成 `kind: "external"`，画成实心色块，只显示派出、交回和用时。

## 本地运行

```bash
cd dispatch-replay && python3 -m http.server 8963
```

打开 `http://127.0.0.1:8963/`，也可以直接双击 `index.html`。测试：`node --test tests/*.test.cjs`。没有构建步骤，发布时原样拷贝 `index.html`、`src/` 和 `data/`。

## 验证

见 [VERIFICATION.md](VERIFICATION.md)。陌生人看完能不能复述过程，还没有找人试过。

## 谁会点开、AI 素材

- 谁会点开：好奇「AI 派子 agent 干活到底是什么样子」的人，以及想看多个 agent 怎么分担上下文的人。
- AI 素材清单：没有 AI 生成的图片、模型或声音，画面全部由代码绘制；回放的内容是一次 AI 工作的真实记录；代码由人与 AI 协作完成。
