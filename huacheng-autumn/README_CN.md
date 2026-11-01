# 花城秋岸

一块能拖着转的广州秋日江岸沙盘：簕杜鹃从天桥上垂下来，白色有轨电车从桥下经过，赤岗塔周围开着粉色异木棉，远处是广州塔。可以看看车流、凑近看花，也可以把白天慢慢拖进入夜。

署名：**我的AI小木屋**。

没有导入图片和模型。形体、花叶、水面、砖色变化、车辆贴膜和灯光全部由代码生成。页面无声，没有分数和通关目标。

## 能做什么

- **转着看**：镜头约 40 秒绕一圈，依次经过天桥、赤岗塔和沙盘远景；随时拖动就能接管。
- **换时间**：默认是柔和的午后白天。底部滑条为 **白天 → 黄昏 → 入夜**；白天是暖灰薄雾、银白钢网和不发光的暗窗。太阳闪光逐渐消失，换成对岸灯光的柔和倒影，窗户和路灯陆续亮起。
- **凑近看**：放大看电车曲面风挡与线路牌、花瀑、砖墙和独立叶片。

## 操作

| 动作 | 电脑 | 手机 |
|---|---|---|
| 转动场景 | 按住拖动 | 单指拖动 |
| 远近 | 滚轮或左下角加减按钮 | 双指捏合或按钮 |
| 回到开场 | 复位按钮 | 同左 |
| 开关自动路线 | 眼睛形按钮 | 同左 |
| 换时间 | 拖底部滑条 | 同左 |

自动路线开着时，停手 4.5 秒后开始用 3 秒平滑交还镜头。鼠标悬停在天桥或赤岗塔上，它的灯稍微亮一点。系统开启「减少动态效果」时，自动路线默认关闭。

## 真实依据

以下对应 [SPEC.md](SPEC.md) 的场景依据表，只用作设计参考，页面不加载这些来源的素材。

| 元素 | 依据 |
|---|---|
| 赤岗北天桥簕杜鹃 | [广州日报《广州，以一城繁花，迎四海宾朋》，2026-10-19](https://news.dayoo.com/gzrbrmt/202610/19/170614_55014303.htm)：橙黄红花簇与远处广州塔同框。 |
| 赤岗塔下美丽异木棉 | 同一篇[广州日报报道](https://news.dayoo.com/gzrbrmt/202610/19/170614_55014303.htm)的照片和图注。 |
| 花瀑与花窗 | [大洋网／广州日报《“广州的秋天像极了春天”，二沙岛簕杜鹃花廊成打卡新热点》，2026-10-29](https://news.dayoo.com/guangzhou/202610/29/139995_55018230.htm)。 |
| 海珠有轨电车、白底红木棉涂装 | [维基百科海珠有轨电车条目](https://en.wikipedia.org/wiki/Haizhu_Tram)；早期涂装另补核[南方日报《首辆有轨电车正线调试》，2014-10-16，新浪转载](https://news.sina.com.cn/c/2014-10-16/063930996533.shtml)。 |
| 赤岗塔八角九层的外形 | [维基百科赤岗塔条目](https://en.wikipedia.org/wiki/Chigang_Pagoda)；[海珠区政府介绍](https://www.haizhu.gov.cn/hzdt/ztlm/tzhz/rjhj/lyjd/hsgy/content/mpost_9123078.html)记载其于 1619 年开工。 |
| 广州塔细腰与扭转网格 | [维基百科广州塔条目](https://en.wikipedia.org/wiki/Canton_Tower)。 |

比例、距离和位置均经过风格化处理，**不是测绘还原**。几处景物被压缩到同一块沙盘上；现实中的广州塔也在海珠区珠江南岸，本页将它移至水对面的远景，是构图安排。天际线是简化虚构楼群，电车线路牌与亮窗安排也是场景设计，不提供真实运营信息。

## 本地运行与检查

在 `huacheng-autumn/` 目录运行，需要带 npm 的 Node.js。浏览器检查另需本机已安装 Playwright 和 Google Chrome。

```bash
npm ci
node tools/build.mjs                    # 生成独立单文件 dist/index.html
node --test tests/*.test.cjs
node tools/flower-audit.mjs . shots/r4/audit.html
NODE_PATH="$(npm root -g)" node tools/architecture-check.cjs shots/r4/architecture
NODE_PATH="$(npm root -g)" node tools/glare-check.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r4/browser
NODE_PATH="$(npm root -g)" node tools/refinement-motion.cjs shots/r4/motion
NODE_PATH="$(npm root -g)" node tools/layout.cjs shots/r4/mobile
NODE_PATH="$(npm root -g)" node tools/phone-route.cjs shots/r4/phone-route
NODE_PATH="$(npm root -g)" node tools/shot.cjs shots/r4
NODE_PATH="$(npm root -g)" node tools/night-check.cjs shots/r4/night
NODE_PATH="$(npm root -g)" node tools/performance-check.cjs shots/r4/performance
NODE_PATH="$(npm root -g)" node tools/opening-check.cjs shots/r4/opening
```

可以直接打开 `dist/index.html`，也可以启动本地服务：

```bash
node tools/serve.cjs . 18954
# 在另一终端检查源码入口：
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r4/source http://127.0.0.1:18954/dev.html
```

源码地址：`http://127.0.0.1:18954/dev.html`；打包地址：`http://127.0.0.1:18954/dist/index.html`。所有 GPU 检查按顺序运行。花量诊断页是隔离构建，不是发布产物。

固定机位为 `?view=hero`、`?view=bridge`、`?view=pagoda`、`?view=wide`。加 `&h=0`、`&h=0.55`、`&h=1` 分别查看白天（默认）、黄昏、入夜；`&t=13` 固定模拟到第 13 秒。四机位沿用正常渲染路径。页面提供 `window.__huacheng`、`window.__PLAYTEST__` 检查钩子，正常操作不依赖它们。

第三轮 `d1bcc77` 基线保留在 `shots/r4/baseline/`。用同一仪器重跑旧版校准：

```bash
node tools/flower-audit.mjs shots/r4/baseline shots/r4/baseline/audit.html
NODE_PATH="$(npm root -g)" node tools/architecture-check.cjs shots/r4/baseline/final-check "file://$PWD/shots/r4/baseline/audit.html" --baseline
```

## 实测结果与边界

第四轮截图、新旧读数、渲染器信息与边界见 [VERIFICATION_R4.md](VERIFICATION_R4.md)。改用倒角形体、向树冠外着色的小叶片、PCF 柔和投影与 GTAO 接触暗影，真正的后期渲染目标开启 MSAA。花色集中在天桥花瀑和异木棉树冠；站台加入钢拱玻璃雨棚，没有架空电线和受电弓。

道路为双向两条 3.5 米车道，电车宽约 2.65 米、高约 3.6 米；步道补长椅、单车、垃圾桶和小咖啡摊。总体布局与地标高度仍经过压缩，是建筑意象，不能当测绘图。

未测真手机、Safari 和部署后的线上入口。桌面模拟帧率不代表手机性能，自适应分辨率保留。玻璃、水面使用程序近似反射；近景不额外加景深虚化，保持细节可读。本轮不提交、不发布。

## 许可

页面源码归 **我的AI小木屋**；本目录没有另行授予开源许可。打包的 Three.js 保留 MIT 许可，全文在 `dist/index.html` 开头注释中。参考报道和照片的权利仍归各自权利人，页面不打包这些图片。

## 谁会点开、AI 素材

- 谁会点开：想花一两分钟看看广州秋花、微缩建筑和经过的电车的人。
- AI 素材：页面里没有导入图片和模型，全部代码生成，包括运行时绘制的车辆贴膜和线路牌。参考图由 Codex 生成，只用来定审美，不进入页面。代码由 Codex 编写，Claude Code 负责指挥和验收。没有使用音频。
