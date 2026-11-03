# 2026-11-03 B5 回归

只做报告「值得改的」1、2：窄屏 2D 顶栏保留模式切换与撤销/重做，其余原有动作放到「更多」；家具库增加卧室、客厅、餐厨、卫浴四个跳转按钮，沿用原家具列表与添加逻辑。桌面也可跳分类，其他类别仍可滚动查找。未改布置规则、保存键、碰撞、默认家具或 3D 漫游；未做 A/B 方案或搬家任务。

## 红 → 绿

- 新增 `tools/mobile-check.cjs`：原始构建 15 项中 7 项失败（手机缺可发现的工具入口，四视口缺类别跳转）；修后 59/59 通过。真实点击/触屏检查入口与 ≥44 px 点按区、展开后全部原有工具可达、清空后撤销回 41 件、四组第一件家具滚入可见区并可添加/撤销、切到 3D 与零页面错误。
- 第一轮新检查在桌面返回「卧室」时报红，修正吸顶标题导致的滚动偏差，再跑全绿。
- 原有 `tests/core.test.cjs`：13/13 通过。
- 原有 `tools/browser-check.cjs`：34/34 通过。折叠屏检查改为先点「更多」再点「适应」，匹配新入口；模型、布置、撤销、保存、带我走、摇杆、转屏等原检查保留。

## 复现

three 保持 0.186.1、esbuild 保持 0.28.2，未安装或升级依赖。

```sh
cd floorplan-walk
node tools/build.mjs
node --test tests/*.test.cjs
# 仓根启动本地 HTTP 后：
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs \
  http://127.0.0.1:8765/floorplan-walk/dist/ /path/to/mobile-output
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs \
  /path/to/full-output http://127.0.0.1:8765/floorplan-walk/dist/
```

已重新打包并在真实 Chrome 156.0.8078.80 打开 `dist/index.html`。新增回归视口 390×664、320×568、844×340 / DPR 2，1365×900 / DPR 1；原有完整检查还覆盖默认 DPR 2、11 个机位及折叠屏变化。GPU 为 Apple M4 Metal，非 SwiftShader。页面错误 0；原有检查记录运行时外部请求 0。

截图见输出 `walk-before/`、`walk-after/`、`walk-full/`，逐张检查了初屏、更多菜单、分类跳转后的家具库与 3D。横屏空间较紧，模型仍能显示，布局与操作没有另换渲染路径。

真手机、Safari、真实双指缩放与拖家具手感未测。本页无声音；本轮没有声音结论。`dist/` 与 `node_modules/` 不提交。

正常入口另录了约 30 秒操作，未使用状态跳转：操作录像页面错误 0，并按每秒一帧抽样复看；不是全帧视觉验收。录像和抽帧在输出 `opening/floorplan-walk/`，不能替代真机手感判断。
