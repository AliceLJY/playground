# playground

做着玩的小东西，一个仓一个子目录，共用一个 Pages 站点。首页分两排：上手玩的小游戏，和转着看的 3D 展页。

**在线：https://aliceljy.github.io/playground/**

## 小游戏

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [灯影守夜](shadow-gong/) · [玩](https://aliceljy.github.io/playground/shadow-gong/) | 散场后的皮影戏幕上举锣守灯：看兵器透光一亮就格挡，卡准了锣声一响、时间慢半拍，攒满架势再处决 | Three.js 2.5D，程序化皮影与合成音效，键鼠与触屏，单文件离线可玩 |
| [天台水枪大战](rooftop-splash/) · [玩](https://aliceljy.github.io/playground/rooftop-splash/) | 夏日天台的第一人称水枪对战，蓝橙电脑团队、三把水枪、水球与复活 | 三维程序化场景，键鼠与触屏，单文件离线可玩 |
| [小橘飞车 · 珠江杯](xiaoju-racing/) · [玩](https://aliceljy.github.io/playground/xiaoju-racing/) | 毛茸茸的小橘与五只猫同场竞速，漂移蓄气、氮气冲线 | Three.js，程序化毛发，单文件离线可玩 |
| [阿橘的广州骑游](aju-guangzhou-ride/) · [玩](https://aliceljy.github.io/playground/aju/) | 橘猫骑车穿过广州，三花挑战与风格街区探索 | Three.js，打包成单个离线 HTML |

## 3D 展页

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [机械沙虫](sandworm/) · [看](https://aliceljy.github.io/playground/sandworm/) | 一份虚构的工程设计档案：沙漠地下掘进的机械沙虫，六个机位、X 光看地下、拆开装甲看内部 | Three.js 程序化建模，键鼠与触屏，单文件离线可看 |
| [户型图 · 三维小样](floorplan/) · [看](https://aliceljy.github.io/playground/floorplan/) | 从一张公有领域户型图读出墙、门窗和房间，拉成能转的三维，配上 CAD 平面图、光追效果图和冬至日照 | Three.js 手机竖屏页，数据与效果图来自本地出片工程 |
| [山河卷](shanhe-scroll/) · [看](https://aliceljy.github.io/playground/shanhe/) | 可以走进去的历史长卷：宣纸时间轴点开史料卡片，再一步迈进 360° 全景现场 | Three.js 全景球，换一个数据文件就能换题材 |

## 加一个新玩意

开工前先读 [制作与验收约定](AGENTS.md)，在玩意自己的目录写一页规格。

1. 在仓库根目录建它自己的文件夹。
2. 在 `.github/workflows/pages.yml` 里加一段，把它的静态产物拷进 `_site/<名字>/`。
3. 在根目录 `index.html` 对应的那一排（小游戏或 3D 展页）里加一张卡片。

纯静态的只要一条 cp。需要构建的把构建命令写进同一个 workflow —— 参考 `aju-guangzhou-ride` 用 `build.py` 把源码内联成单文件的做法。

## 本地预览

每个文件夹都能单独跑，走 http 不能双击（ES module 会被 CORS 拦）：

```bash
cd shanhe-scroll && python3 -m http.server 8777
```

## 许可

玩意本身的源码归我。打包进来的 `three.js` 保留它自己的 MIT 许可，见各文件夹里的 `THIRD_PARTY_NOTICES` / `THREE-LICENSE`。展页用到的外部素材（户型图、模型）和参考来源也写在各自的 `THIRD_PARTY_NOTICES` 里。
