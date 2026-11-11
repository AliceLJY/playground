# 石室圣心大教堂 · 规格

**体验一句话**：打开就是一座能转着看的石室；点视点飞过去，或者从一德路的大门走上台阶、穿过中门走进中殿，看彩窗的色光落在束柱和地面上。

- **主美学**：感官、探索。弧型（走一遍、看一遍），不验通关率。
- **场地**：手机为主（390 宽视口要能进、能走、不卡），电脑也能用；静音；一次两三分钟。没有声音。
- **对照物**：维基共享资源上的实拍（正立面、西侧面、中殿、拱顶、彩窗），清单见 `facts.md`。

## 配色（sRGB）

外壳深底 `#14140f`、面板 `#1b1b15`、金 `#d9c07a`；外墙花岗岩 `#cbb89c`，堂内花岗岩 `#dccfba`；红砖拱面 `#9c8670` 底、砖色 `hsl(13–22 30–40% 40–48%)`；肋 `#c2b59e`；百叶 `#6e2a26`；屋面瓦 `#7b756b`；彩窗主色蓝 `#1a3fb8`、红 `#d21f1f`、金 `#f2b21e`、绿 `#1e9a4a`。

## 构图

全景：东南上方四分之三俯视，双塔完整、能看到侧面的飞扶壁。正立面：从广场南端仰看，三座门到塔尖都在画面里。内部视点：人眼高 1.62 米；中殿视点同时看到两排束柱、肋拱和尽头的后殿彩窗。

## 性能预算

mini（Apple M4，Chrome 真实 GPU）1440×900 不低于 30 帧；绘制 260 次以内；三角面 35 万以内。390×664 手机视口同样不低于 30 帧（桌面芯片模拟，不代表真手机）。手机默认画质「中」，连续两秒低于 28 帧自动降一档。

## 验收条目

| # | 条目 | 检查方式 |
|---|---|---|
| 1 | 平面尺寸与资料相符：总长约 77.2、最宽约 32.9、塔高 58.5、拱顶 28.2；左右各十根束柱 | `tests/core.test.cjs` |
| 2 | 墙、柱、长椅、祭台、隔墙、飞扶壁墩挡人；正面三座门、两扇边门走得通；台阶有高差 | `tests/core.test.cjs` + `browser-check` D11–D13 真实按键 |
| 3 | 视点不少于 14 个，点了能飞到，里外显示对，底部出说明；机位不埋在楼里、落脚点站得住 | `tests/core.test.cjs`、`browser-check` D06、D07 |
| 4 | 轨道 / 漫游 / 飞行三种方式都能用 | `browser-check` D04、D05、D10、D14–D16 |
| 5 | 上午东窗亮、傍晚西窗亮、正午玫瑰窗亮 | `browser-check` D08、D09；截图 `nave` 与 `nave-evening` 读图 |
| 6 | 手机视口顶栏不溢出、摇杆能走、边走边转头、松手即停 | `browser-check` P01–P08 |
| 7 | 帧率与规模在预算内 | `browser-check` D18、D19、P10；`tools/shots.cjs` 的 report.json |
| 8 | 外部 9 个、内部 9 个固定视点加步行、傍晚各一张，桌面与手机两套，读图无穿模、漂浮、空白 | `tools/shots.cjs`，逐张读 |
| 9 | 与实拍同视角的五组并排图，逐组写像与不像 | `tools/compare.cjs` |

## 固定视点

`?view=<id>&light=<morning|noon|evening>&still`，id 见 `src/core.js` 的 `VIEWS`（whole、facade、portals、rose、towers、east、buttress、apse、plaza、nave、piers、vault、crossing、altar、east-glass、west-glass、rose-in、chapel）。`still` 关掉闲置自动环绕；`&mode=walk` 落在广场南端；`&q=high|mid|low` 指定画质。

钩子：`window.__sf`（同 `window.__ss`；`snapshot()`、`setView(id)`、`setLight(id)`、`teleport(x,z,yaw)`、`shot(pos,look,fov)`、`gpu()`），另挂统一的 `window.__PLAYTEST__`。
