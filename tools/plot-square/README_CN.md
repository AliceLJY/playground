# 方块取景 plot-square

做真实街区的作品（等距小城、微缩模型、可走的街景）之前，先在地图上放一个正方形取景框，自动避免把有名的建筑切成两半。

English: [README.md](README.md)

## 它做什么

1. 从本地广东 OSM 包（`/Volumes/ColdData/data/osm/guangdong-latest.osm.pbf`）切出你给的点周围的数据，不连在线服务。
2. 按附近主街的走向把方块转过去，街道横平竖直；街网不明显时朝北。
3. 在限定范围内平移（默认最多挪边长的 40%），按这个顺序挑位置：你点名要保的完整装进来 → 被切的地标最少 → 离你给的点近、地标离边留 4% 空隙、和街道对齐、普通楼少切。
4. 输出 `plot.json`（中心、转角、四个角的经纬度、装进来和被切的地标清单）、`plot-preview.svg`（预览图）和 `osm-area.geojsonseq`（这一片的数据，后面建模直接用）。

「地标」按 OSM 标签认：带维基数据或维基百科条目、文物保护、历史建筑、宗教场所、博物馆、景点；画成点的地标（比如只标了一个点的寺庙）会认它所在的那栋楼。比方块面积一半还大的地标（整片街区、校园）不算被切，单独列出来。

## 用法

```bash
cd tools/plot-square
python3 plot_square.py --find 石室圣心            # 按名字找，列出编号和坐标；同名的东西常有好几个，挑对的那个
python3 plot_square.py --center-osm w542890833 --size 200 --out-dir work
python3 plot_square.py --lat 23.1173 --lon 113.2339 --size 230 --keep "粤剧艺术博物馆;八和会馆" --out-dir work
python3 plot_square.py --lat .. --lon .. --keep-at 23.11760,113.23300 --out-dir work   # 地图上没名字的楼，按坐标点名
python3 plot_square.py --lat .. --lon .. --rotate north --fixed --out-dir work         # 不挪不转，只检查这个摆法
```

退出码：0 = 没有地标被切且点名的都装进来了；2 = 还有被切的或没装进来的（看输出）；1 = 出错。需要 Python 3.9+ 和 `osmium`（`brew install osmium-tool`），没有别的依赖。

`--keep` 先找名字完全一样的，找不到再找名字里包含这几个字的地标：保「粤剧艺术博物馆」不会落到「粤剧艺术博物馆 办公楼」上。

## 测试

```bash
cd tools/plot-square && python3 test_plot_square.py -v
```

人造地图的测试在哪都能跑；真实数据那一条（石室圣心大教堂压在西边线上，先报被切、再自己挪开）只在有本地 OSM 包和 osmium 的机器上跑，别处自动跳过。两条修过的毛病（点名排在避切前面、点名按全名优先）各有一条测试，已把旧写法放回去确认测试会变红。

## 已知的简化

- 楼的内院（多边形里的洞）忽略不计，带内院的楼按实心算。
- 挑位置的几个权重是手定的（代码里标了 `simplified`）；摆得不对劲时先看预览图，再调权重。
- OSM 在广州的标注不全：很多老建筑没有标签，按标签认不出就当普通楼，有名但没标的要自己用 `--keep` 或 `--keep-at` 点名。

## 来历

思路来自 April Zhu 的 Pocket City skill（2026-11-23 看过，非商用许可）。这里没有用它的代码，是照「转向跟街、平移避开地标」这个想法从头写的，数据换成本地包。

## 谁会点开、AI 素材

给要拿真实街区做作品的人。代码由 AI 协作完成，地图数据 © OpenStreetMap contributors（ODbL）。
