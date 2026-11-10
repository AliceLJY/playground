# 圣家堂 · 规格

**体验一句话**：打开就是一座能转着看的圣家堂；点右边的视点飞过去，或者自己走进门，看彩窗的色光落在柱林和地面上。

- **主美学**：感官、探索。弧型（走一遍、看一遍），不验通关率。
- **场地**：电脑为主，手机能用；静音；一次两三分钟。没有声音。
- **对标**：AI超元域《深度实测 Claude Fable 5.2》里的 Sagrada Família Explorer（5:15–7:08）。

## 配色（sRGB）

外壳深底 `#14140f`、面板 `#1b1b15`、金 `#d9c07a`；石材 `#dccdae` / `#d6c6a2` / `#b9a47f`；冷色玻璃 `#1f4fd6`→`#3fbf5a`；暖色玻璃 `#d81f1f`→`#ffc21a`；斑岩柱 `#a24a3c`。

## 构图

全景：四分之三俯视，教堂占画面高度六成以上，耶稣塔完整。内部视点：人眼高 1.65 米，中殿视点能同时看到两排柱、拱顶和尽头的祭坛。

## 性能预算

mini（Apple M4，Chrome 真实 GPU）1440×900 不低于 30 帧；绘制 150 次以内；三角面 40 万以内。390×664 手机视口同样不低于 30 帧（桌面芯片模拟，不代表真手机）。

## 验收条目

| # | 条目 | 检查方式 |
|---|---|---|
| 1 | 十八座塔，高度次序对 | `tests/core.test.cjs` |
| 2 | 墙、柱、长椅、祭台挡人；三处门洞走得通 | `tests/core.test.cjs` + `browser-check` D11–D13 真实按键 |
| 3 | 视点不少于 14 个，点了能飞到，里外显示对，底部出说明 | `browser-check` D06、D07 |
| 4 | 轨道 / 漫游 / 飞行三种方式都能用 | `browser-check` D04、D05、D10、D14–D16 |
| 5 | 早晨光冷色亮、傍晚光暖色亮 | `browser-check` D09；截图 `nave` 与 `nave-evening` 读图 |
| 6 | 手机视口顶栏不溢出、摇杆能走、边走边转头 | `browser-check` P01–P08 |
| 7 | 帧率与规模在预算内 | `browser-check` D18、D19；`tools/shots.cjs` 的 report.json |
| 8 | 外部 10 个、内部 7 个固定视点截图读图无穿模、漂浮 | `tools/shots.cjs`，逐张读 |

## 固定视点

`?view=<id>&light=<morning|noon|evening>&still`，id 见 `src/core.js` 的 `VIEWS`（whole、nativity、passion、glory、towers、cross、pinnacles、apse、nave、columns、vault、crossing、altar、morning-glass、evening-glass 等）。`still` 关掉闲置自动环绕。`&mode=walk` 落在荣耀门前。

钩子：`window.__sf`（`snapshot()`、`setView(id)`、`setLight(id)`、`teleport(x,z,yaw)`、`gpu()`），另挂统一的 `window.__PLAYTEST__`。
