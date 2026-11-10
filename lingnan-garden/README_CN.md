# 岭南园林一角

照一张图搭出来的可走场景。[在线打开](https://aliceljy.github.io/playground/lingnan-garden/)

先让 AI 画了一张岭南园林的场景图：临水的水榭、镬耳墙和月洞门、石板路、盆景、荷塘、石拱桥、假山上的六角亭、大榕树和木棉。然后把图里看得见的东西一样样列出来，用 Three.js 纯代码搭成三维场景，可以第一人称走进去。那张图只用来对照，没有贴进场景；页面里点「对照原图」能并排看。

这不是哪座真实的园子，图是 AI 画的。

## 怎么玩

- 明信片视角：和起始图同一个机位。
- 走进去：电脑 WASD 走动、拖动转头、Shift 快走；手机左下摇杆走动，其余地方拖动转头。
- 带我逛一圈：自动沿石板路、踏步、前廊、屋里、曲廊、石桥、东岸走一圈，随时可以接手。
- 俯瞰：从空中看整座园子。

## 做出来的东西

水榭能走进去，屋里有桌椅茶具，满洲窗从里面看也有颜色。曲廊从前廊东端出去，落在水里的石矶上，一路去北岸，一路过石桥到东岸。月洞门后面是个竹院。水面有倒影，荷叶、灯笼、芭蕉会动，锦鲤在游，木棉在落花。声音是浏览器现场合成的。

图里被挡住或在画框外的部分（屋里、竹院、北岸、东岸、南面园门）是按岭南园林的常见做法补的。逐项的还原情况在 [SPEC.md](SPEC.md)。

## 本地运行

```
npm ci
node tools/build.mjs          # 生成 dist/index.html，自包含单文件
node tools/serve.cjs . 8973   # 打开 http://127.0.0.1:8973/dist/index.html
node --test tests/*.test.cjs
```

截图与真实输入检查需要全局装的 Playwright：

```
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8973/dist/index.html shots
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8973/dist/index.html shots/check
```

## 许可

代码同仓库。打包产物内含 Three.js（MIT），许可文本在生成文件开头的注释里。`ref/start.jpg` 是 AI 生成的对照图。
