# 雪线小木屋 · B6 修复验证（2026-11-03）

- 仅修体检「正在前往、抵达后点亮」提示。复用现有 pendingLight 与计数刷新，不改变飞行时长、点灯和回程规则，不加玩法或依赖。
- `tools/flight-check.cjs`：构建后通过静态服务打开默认入口，390×664、320×568、844×340、1365×900，DPR 2。桌面真实点击烽火塔，其余视口用现有 focus 钩子启动同一飞行。旧版四档均在 pending 检查变红（正在飞、0/7，缺说明）；修后 21 项全绿：提示可见、取消不计数、抵达变 1/7 并清除提示、重访已亮山头不说还要点亮、进屋取消待点亮。
- `node --test tests/*.test.cjs`：14/14 通过。`node tools/build.mjs` 已重建 `dist/index.html`（不入仓）。无独立 lint 配置；`git diff --check` 检查空白。
- 浏览器：Chrome 156，ANGLE Metal / Apple M4，默认画质、默认自适应渲染，零页面错误。截图放本次外部验收目录 `out-B6/snowline-green/`，逐图检查提示与故事卡；未重新测帧率，不把此项功能检查当性能结论。
- 复跑：`NODE_PATH="$(npm root -g)" node tools/flight-check.cjs <输出目录> <静态服务下的 dist/ 地址>`。
- 未测：真手机、真人手感；页面本身无声。未发布，无线上复验。纸条和日出玩法不在本批范围。
