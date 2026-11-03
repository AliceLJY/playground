# 2026-11-03 B5 回归

范围：报告「值得改的」1、2。没有更改齿数、齿比、几何或默认 60x 倍率；未添加预测或发条玩法。three 保持内置 r160，无构建步骤。

`tools/browser-check.cjs` 先在旧代码上运行：16 项中 11 项失败（四视口缺少暂停/单步、按钮只有 31 px，三种触屏视口仍显示鼠标提示）。修后 36/36 通过：逐个读取实际轴角，验证全部齿轮和摆轮暂停、每次推进 0.25 秒、保持 180x 选择、恢复播放，以及暂停期间相机仍能拖动。探针仅在 `?debug=1` 出现，正常入口不依赖它。

环境：本地 HTTP、Playwright 驱动 Chrome 156.0.8078.80；Apple M4 Metal，非 SwiftShader。390×664、320×568、844×340 触屏模拟 / DPR 2；1365×900 / DPR 1。正常默认渲染路径，未锁画质；页面错误均为 0。截图见验收输出 `clockwork-before/`、`clockwork-after/`。

```sh
# 从仓根启动 python3 -m http.server 8765 --bind 127.0.0.1
NODE_PATH="$(npm root -g)" node clockwork/tools/browser-check.cjs \
  http://127.0.0.1:8765/clockwork/ /path/to/output
```

没有 Node 逻辑测试；改动涉及 DOM、动画和手势提示，回归检查留在真实浏览器中。触屏文案已与本地 OrbitControls 的单指旋转、双指缩放及平移配置核对；真手机、Safari、真实双指手感未测。本页无声音。

正常入口另录了约 30 秒操作，未使用状态跳转：操作录像页面错误 0，并按每秒一帧抽样复看；不是全帧视觉验收。录像和抽帧在输出 `opening/clockwork/`，不能替代真机手感判断。
