# 记忆褪色

[English](README.md)

AI 记忆系统里，旧记忆的检索分会乘上一个越来越小的倍率，这一页把那条公式挂到一根弹簧上：卡片是从我自己的记忆库里抽的真实记忆（只取数字，不含内容），曲线上的点是同一天抽的 400 条。拖时间轴，卡片往后一天天往下沉、变淡；点它一下就是「想起它一次」，它往上一蹿，之后掉得更慢；钉住它就不再掉；不管怎么忘，都有一块地板接着。

公式和参数照 [RecallNest](https://github.com/AliceLJY/recallnest) 的 `decay-engine.ts` 与 `access-tracker.ts` 搬来，没有改；测试里有一张用原代码算出来的对照表。弹簧只决定卡片怎么落过去，落点由公式定。

规格与验收见 [SPEC.md](SPEC.md)。

## 本地预览

```bash
python3 -m http.server 8790
```

打开 `http://localhost:8790/`。地址后加 `?pick=0&ahead=60&recalls=10,30&pin=0` 可以直接停在某个状态。

## 测试

```bash
node --test tests/*.test.cjs
```

## 谁会点开、AI 素材

写给想知道「AI 是怎么记住又忘掉东西的」的人，不用读公式。页面代码由 AI 协作完成；没有生成的图片、声音或模型。
