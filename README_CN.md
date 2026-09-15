# playground

做着玩的小东西，一个仓一个子目录，共用一个 Pages 站点。

**在线：https://aliceljy.github.io/playground/**

| 玩意 | 是什么 | 技术 |
|---|---|---|
| [阿橘的广州骑游](aju-guangzhou-ride/) · [玩](https://aliceljy.github.io/playground/aju/) | 橘猫骑车穿过广州，三花挑战与风格街区探索 | Three.js，打包成单个离线 HTML |
| [山河卷](shanhe-scroll/) · [玩](https://aliceljy.github.io/playground/shanhe/) | 可以走进去的历史长卷：宣纸时间轴点开史料卡片，再一步迈进 360° 全景现场 | Three.js 全景球，换一个数据文件就能换题材 |

## 加一个新玩意

1. 在仓库根目录建它自己的文件夹。
2. 在 `.github/workflows/pages.yml` 里加一段，把它的静态产物拷进 `_site/<名字>/`。
3. 在根目录 `index.html` 里加一张卡片。

纯静态的只要一条 cp。需要构建的把构建命令写进同一个 workflow —— 参考 `aju-guangzhou-ride` 用 `build.py` 把源码内联成单文件的做法。

## 本地预览

每个文件夹都能单独跑，走 http 不能双击（ES module 会被 CORS 拦）：

```bash
cd shanhe-scroll && python3 -m http.server 8777
```

## 许可

玩意本身的源码归我。打包进来的 `three.js` 保留它自己的 MIT 许可，见各文件夹里的 `THIRD_PARTY_NOTICES` / `THREE-LICENSE`。
