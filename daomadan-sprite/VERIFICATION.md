# 刀马旦精灵 · 验证记录

规格与验收条目在 [README_CN.md](README_CN.md)。此前的验证写在 README 的「已知不足」里，这份文件从 2026-11-25 起记录之后的复核。

## 2026-11-25 Duet 展页巡检复核

外部测试员 Duet 的修理单（第 6 节，6 条）逐条在 Playwright Chromium 里复现或查证后处理。视口 1440×900（无触屏）与 390×664（触屏，`hasTouch` + `isMobile`）。

| # | Duet 说法 | 复现／查证 | 结论 | 怎么改 | 检查 |
|---|---|---|---|---|---|
| 1 | 走到舞台最右再出枪，枪头被舞台右缘裁掉 | 复现：x=870 出枪第 7 帧，枪和半个身子出了舞台。从图集量出出枪帧最远的不透明像素在锚点右侧 256 px，舞台宽 960，所以 x 超过约 704 出枪就会被裁 | 设计取舍 | 不改：要整杆枪留在台内，要么把可走范围缩到约 256–704（规格写的是左右各留 90），要么出枪时把人往里挪（违反验收第 5 条「出招时不滑步」），要么舞台跟着角色平移；留给作者定 | 截图 `dm-before-1440-spear-mid.png` |
| 2 | 点「跑」按钮再按一下 Shift 松开，按钮仍显示按下，实际已不跑 | 复现：松开 Shift 后 `aria-pressed` 仍是 true、`run` 是 false | 成立 | `src/game.js`：Shift 和「跑」按钮改用同一个 `setRun`，按钮状态跟着 Shift 走 | `NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <页面地址>` |
| 3 | 手机上仍显示键盘说明 | 复现：390×664 触屏下 `.keys` 可见 | 成立 | `index.html`：`(hover:none) and (pointer:coarse)` 时隐藏键盘说明；桌面照常显示 | 同上；改后手机截图看过 |
| 4 | Tab 到「出枪／跳／受击／←→」按回车没反应，按钮只听 pointerdown | 复现：三个动作回车后播放次数不变；← 上按住回车不走 | 成立 | 动作按钮加键盘点击（`detail === 0` 的 click）触发；←／→ 聚焦时按住回车走、松开或失焦停 | 同上 |
| 5 | 按住 ← / → 手指稍微移动，没有 `touch-action:none`，pointercancel 会松键（模拟框无触屏，未验证） | 用 CDP 触摸事件复现：手指按在 ← 上，斜着挪 24×12 px，0.5 秒后已回到待机（浏览器把手势当成滚动，发了 pointercancel） | 成立 | `.pad button` 加 `touch-action:none` | 同上（CDP 触摸模拟，不是真手机） |
| 6 | 「女靠一般只用粉红、大红、淡湖…绣牡丹和凤凰」「最常见的刀马旦扮相」无出处；README 写「花卉和凤凰」，页面写「牡丹和凤凰」 | 两轮检索只找到女蟒、宫衣的颜色与凤纹说明（中国新闻网戏曲服饰资料 https://www.chinanews.com/zxys/jjfs-cp.html 、大都会博物馆凤穿花宫衣 https://www.metmuseum.org/art/collection/search/68994 ），没有找到女靠配色的可靠出处 | 存疑未改 | 出处和措辞留给作者 | — |

`tools/duet-check.cjs`：改前 8 项里 7 项红（只有「桌面显示键盘说明」本来就对），改后 8 项全过。改后全部检查：Node 8 条全过；`tools/browser-check.cjs` 28 项全过。
