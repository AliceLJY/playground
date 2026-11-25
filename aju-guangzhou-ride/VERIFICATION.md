# Mobile fixes — 2026-11-03 (B4)

Only the two reported issues were changed. In short touch landscape, the map is a 74 × 44 CSS px launcher, speed and boost share a row, and utility actions leave the bottom driving corners clear. The existing route planner already pauses simulation; that behavior is retained and tested. Touch departure now explains automatic pedalling versus navigation and waits for confirmation. Closing the note keeps the bike stopped on the introduction. Desktop departure and all driving parameters are unchanged.

## Red before, green after

`tools/mobile-check.cjs` was run against the old implementation before changing it. Its baseline report has 16 failing checks: landscape overlaps/oversized map and intercepted map center, missing departure confirmation, and keyboard-only copy. The added close-target check also measured the original dialog close button at 35 × 35 px before enlarging it to 44 × 44 px. The final source and rebuilt single-file page each pass all 50 checks across five viewports. The checks also cover cancellation, ≥44 px driving targets and center hit-testing, a stationary simulation while the map is open, returning to riding, and zero page errors.

`node --test tests/*.test.cjs`: **27/27 passed**. No simulation rules or new gameplay were added. `python3 build.py` regenerated the ignored `阿橘的广州慢游.html`; CI generates this same file for `/aju/`, so the bundle is not committed.

## Browser and visual checks

- Google Chrome 156.0.8078.80, Playwright, real Apple M4 GPU (`ANGLE Metal Renderer: Apple M4`), bundled Three.js r160.
- Source and built page: 390 × 664, 320 × 568, 844 × 340, 844 × 300 and 1365 × 900 CSS px. Mobile device scale factor 2, normal renderer cap 1.5; desktop scale factor 1. No screenshot-only quality changes.
- Landscape checks begin at 390 × 664, tap Start, then rotate before confirming departure, matching the reported use case. Each departure, riding and map screenshot was opened and checked: the small map and readouts leave the driving buttons clear, and the departure text distinguishes pedalling from navigation.
- A separate 30-second recording of the built page at 390 × 664 exercised steering, braking, boost, map opening/closing and pause/resume. Sampled frames were reviewed; no page errors. This was an input smoke check, not a complete race or a judgment of steering comfort.

Evidence is outside the repository in the B4 output folder: `aju-red/`, `aju-source/`, `aju-built/` (screenshots and `report.json`), `aju-node.txt`, and `aju-smoke/` (recording and state). Example frames: `aju-built/390x664-departure.png`, `aju-built/844x300-ride.png` and `aju-built/844x300-map.png`.

## Reproduce

Serve the repository root with `python3 -m http.server 8844 --bind 127.0.0.1`. In a second terminal, from this directory:

```sh
node --test tests/*.test.cjs
python3 build.py
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs http://127.0.0.1:8844/aju-guangzhou-ride/ /tmp/b4-aju-source
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs 'http://127.0.0.1:8844/aju-guangzhou-ride/阿橘的广州慢游.html' /tmp/b4-aju-built
```

## Limits and deferred observations

Physical phones, Safari, sound, human comprehension of the new copy, and handling comfort remain unverified. At 300 px height, opening the original introduction directly in landscape can leave its Start button outside the viewport; this is a separate pre-existing issue, outside the two requested report items. The narrow 320 px and short landscape route dialogs still scroll to their lower actions. Neither was silently counted as a no-scroll pass. No new delivery mission or completed-journal feature was added. Performance was not benchmarked in this pass.

## Landscape introduction follow-up — 2026-11-03 (B8)

The deferred direct-open issue above is now fixed. `tools/mobile-check.cjs` opens each viewport directly, before any rotation or scrolling, and checks that Start is fully inside the viewport and its center hit-tests to the button. Before the CSS change, the rebuilt page failed both checks at 844 × 300 and 844 × 340 (4 failures out of 60 checks): the button bottoms were 369.47 and 378.27 CSS px respectively. The test captures the introduction before any fallback to portrait; that fallback only allows the remaining ride checks to finish on the broken baseline. On the fixed page, the first Start click succeeds directly in landscape.

Only the short touch-landscape introduction layout changed: smaller heading and gaps, hidden extra controls/version text, scrollable prose if needed, and a non-shrinking 44 px Start button. No new dependencies or JavaScript layout logic were needed. After the change, source and rebuilt single-file pages each pass **60/60 checks** across 844 × 300, 844 × 340, 390 × 664, 320 × 568 and 1365 × 900. Both landscape button bottoms are 249.59 CSS px and their centers hit the button; the other three Start rectangles are unchanged. Introduction screenshots were inspected alongside the baseline. The existing departure, riding and map checks still pass with zero page errors. Browser: Google Chrome 156.0.8078.80 through Playwright, real Apple M4 Metal GPU, Three.js r160, mobile DPR 2/render ratio 1.5 and desktop DPR/render ratio 1; normal rendering settings throughout.

`node --test tests/*.test.cjs`: **27/27 passed**; JavaScript syntax checks and `git diff --check` also passed. `python3 build.py` regenerated `阿橘的广州慢游.html`, explicitly included in this follow-up commit as requested. Reproduce with the commands above using the source URL and then the generated HTML URL; the new screenshots are named `<width>x<height>-intro.png`, with measurements in `report.json`. Physical iOS/Safari and Android/Chrome devices, including browser-bar changes and safe-area insets in landscape, still need verification. This follow-up has not been pushed or checked on the live site.

## Standing against a wall — 2026-11-11

Reported in a review: with auto-forward on and nobody steering, the bike drifts into the arcade about 30 m from the start, falls, gets up still facing the wall, and then stands at 0 km/h for good; holding ↑ did nothing. Cause: a blocked step set the speed to zero every frame and nothing ever changed the heading.

Change (`src/core.js`): when a step is blocked, the pedals are still asked for and nobody is steering, `clearTurn` picks the smallest turn after which the way ahead is clear (12 m, else 4 m, else 1.2 m), and the bike finishes that turn standing still before it sets off (`s.pivot`). Steering, braking or parking cancels it; navigation is untouched. The default is unchanged: auto-forward on, navigation off, the bike still rides straight where it points, so a rider who never steers still falls at bends.

Checks, each red on the previous build:

- `node --test tests/*.test.cjs`: **31/31** (four new tests: resting against a wall, after a fall, no turning for a rider who steers/brakes/parks, boxed in). Before the change two of them failed with "stood at 0 km/h for 8.0 s" and "11.7 s".
- `NODE_PATH="$(npm root -g)" node tools/stuck-check.cjs <url> <out-dir>`: a visitor who never steers, 50 s on the real map, Chrome with Metal, 1365 × 900. Before: 1 fall, then 40.5 s at 0 km/h, 33 m travelled. After (source and rebuilt single file): 5 falls, longest standstill 1 s, 176–226 m travelled.

Not verified: phones, and whether five falls in 50 s reads as acceptable for a visitor who never steers; that is the existing "navigation off by default" design, not changed here.

## 2026-11-25 Duet 小游戏巡检复核

外部 AI 测试员 Duet 报了两条（它在 MacBook Chrome 里测，手机是不带触屏的模拟框）。先用本机 Playwright + Google Chrome（真 Apple M4 GPU，`--use-angle=metal`）复现，成立才改。新检查 `tools/duet-check.cjs`，十个视口：竖屏手机 390×844、414×896、390×664、375×667、360×740、320×568（触屏），横屏 844×390、844×300（触屏），桌面 1365×900、1440×900。

- **「自动前行」「自动导航」开关颜色固定，关的像开、开的像关**
  - 复现：成立。`#cruise` 不论开关都是深绿底，`#assist` 不论开关都是浅绿底；开局（前行开、导航关）看着正常，把前行关掉、导航打开后，十个视口全部是「关的深、开的浅」。
  - 改法：`src/style.css` 去掉按按钮写死的两条颜色，改成按 `aria-pressed` 着色（开＝深绿 `#345b49`，关＝浅绿 `#dbe4cf`），与小橘逛花城 11-22 的同名修法一致。`game.js` 本来就随状态更新 `aria-pressed`，没动。
- **手机开场「和阿橘出发」按钮盖住猫头**
  - 复现：成立，所有竖屏手机都压到。开场机位把猫头顶放在画面高度约 47.4% 处，而开场文字从 17% 往下排，按钮顶边落在画面高度的 45%（390×844）到 57%（320×568）。按猫头（含耳朵、胡须）的屏幕外接框算，六个竖屏视口按钮全和猫头相交；390×664 时按钮 y 343–393、猫头从 y 315 开始。横屏和桌面不压。
  - 改法：只改竖屏窄屏（≤700 px 宽、竖向）的开场排版：文字块改为从下往上挂在猫头上方（底边在 53% + 10 px），矮屏（≤760 px 高）标题由 58 px 缩到 44 px，更矮（≤600 px 高）再缩到 36 px 并隐藏小眉题。没有改 3D 机位和构图，横屏、桌面不变。为了让检查能量到猫头，`window.__ride` 加了只读的 `catHead`（猫头在屏幕上的外接框）。
- **红与绿**：先只加 `catHead` 钩子和检查、不改样式跑一遍：**44/60**（开关「翻转后颜色跟状态走」10 个视口全红；「按钮不压猫头」6 个竖屏全红）。改样式后源码入口、`python3 build.py` 打出的单文件各 **60/60**。截图逐张看过：竖屏按钮在猫耳上方、留有空隙；开关翻转后「自动导航 · 开」深色、「自动前行 · 关」浅色。
- **已有检查**：`node --test tests/*.test.cjs` **31/31**；两个 `node --check` 通过；`tools/mobile-check.cjs` 源码与单文件各 **60/60**；`tools/stuck-check.cjs` 源码与单文件均通过（50 秒内摔 5 次、走 226 m、最长停 0.75–1 s）。按本作品惯例，重新生成的 `阿橘的广州慢游.html` 随本次提交。
- **顺带看到、没改**：触屏手机骑行界面里，速度读数旁的「街头骑士」与冲刺条的「100%」叠在一起，冲刺条下还写着键盘提示「Shift / B · 松开恢复」；改前截图里就有，Duet 没报，同日已补修，见下一节。

```sh
NODE_PATH="$(npm root -g)" node tools/duet-check.cjs http://127.0.0.1:8781/aju-guangzhou-ride/ /tmp/aju-duet
```

没测真手机、Safari，没有线上复验。

### 同日补修：触屏骑行界面的速度读数与冲刺条

- **问题**（上一节顺带看到的）：竖屏手机上「km/h 街头骑士」压在冲刺条的「100%」上；触屏设备的冲刺条下还写着键盘提示「Shift / B · 松开恢复」。冲刺条是从下往上排的，那行提示把它撑高，顶边就顶到了速度读数里。触屏平板（1024×768）也显示这行提示；横屏手机原本已隐藏，不重叠。
- **怎么改的**（`src/style.css`，三行）：触屏（`pointer:coarse`）隐藏这行键盘提示，冲刺条随之变矮，顶边离开速度读数；窄屏但非触屏（≤700 px 宽、`pointer:fine`）照旧显示提示，速度读数上移到 232 px，避开更高的冲刺条。桌面布局不变。
- **检查**：`tools/duet-check.cjs` 加了骑行界面一段，视口增至 12 个（新增触屏平板 1024×768、非触屏窄窗 390×664）：
  - 速度数字、「km/h 街头骑士」、「冲刺」、「100%」、冲刺条、提示行之间互不重叠，也不碰底栏、路线图、地点卡和触控按钮。速度数字按字形的实际墨迹算，不按 43 px 字体的行框；「冲刺」和「100%」分开量，不把两端对齐中间的空白算进去。
  - 触屏不显示键盘提示；非触屏显示，且包含「Shift」。
- **红与绿**：只撤掉这三行样式跑，**82/96**（14 条红：6 个竖屏触屏视口加非触屏窄窗都是「街头骑士」压「100%」，6 个竖屏加平板共 7 个触屏视口显示键盘提示）；改后源码入口与重新打包的单文件各 **96/96**。截图逐张看过：390×664 触屏「5 km/h 街头骑士」与「冲刺 100%」分成两行，下面没有键盘提示；同尺寸非触屏仍有提示、不压字；平板与横屏不重叠。截图文件名从这一轮起带 `-touch` 后缀，避免同尺寸触屏与非触屏互相覆盖。
- **已有检查**：`node --test tests/*.test.cjs` **31/31**；两个 `node --check` 通过；`tools/mobile-check.cjs` 源码与单文件各 **60/60**；`tools/stuck-check.cjs` 源码与单文件都通过（50 秒摔 5 次、走 226 m）。重新生成的 `阿橘的广州慢游.html` 随本次提交。
- **顺带看到**：触屏平板底栏「扶正」后面仍带键盘提示「R」。窄屏用的那套样式会把它隐藏，平板宽度用不到。同日已补修，见下一节。没测真机。

### 同日补修：触屏一律不显示键盘提示

- **问题**：键盘提示原先按屏幕宽度隐藏（≤700 px），触屏平板宽度超过这一档，底栏「扶正」后面仍显示「R」；「停下来看看 E」的按键框在横屏手机和平板上也没被隐藏，提示框一弹出就会露出来。
- **怎么改的**（`src/style.css`）：上一节那条按触屏隐藏的规则，范围从冲刺条下那行扩大到全部键盘提示：所有按键框（`kbd`）、底部按键说明行、冲刺条下的提示，只看是不是触屏，不看宽度。原有按宽度隐藏的规则保留不动，所以窄屏非触屏窗口和以前一样不显示按键框和说明行。桌面照旧全部显示。
- **检查**：`tools/duet-check.cjs` 在触屏视口里加了两条：底栏每个按钮里都不能露出按键框；页面上所有按键框的样式都必须是隐藏，底部说明行也不能显示。「停下来看看」在隐藏的面板里，所以看按键框自身的样式，不看它此刻在不在屏上。桌面视口加一条：「扶正 R」和底部说明行仍然显示。
- **红与绿**：改前 **112/116**，4 条红：平板底栏露出「R」；平板、844×390、844×300 的「E」按键框样式可见。改后源码入口与重新打包的单文件各 **116/116**。截图看过：平板底栏「扶正」后面已经没有「R」；1365×900 桌面上「扶正 R」、底部按键行和冲刺条下的提示都还在。
- **已有检查**：`node --test tests/*.test.cjs` **31/31**；两个 `node --check` 通过；`tools/mobile-check.cjs` 源码与单文件各 **60/60**；`tools/stuck-check.cjs` 源码与单文件都通过（50 秒摔 5 次、走 226 m）。重新生成的 `阿橘的广州慢游.html` 随本次提交。
