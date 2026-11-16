# 手机键盘 · OPPO Find N6 专属版

把安卓手机变成一把蓝牙键盘加触控板，给 iPad 用。出门不用再带妙控键盘。布局按 Find N6 展开的方屏排的。

**下载**：[phone-keyboard-v0.4.apk](https://github.com/AliceLJY/playground/releases/download/phone-keyboard-v0.4/phone-keyboard-v0.4.apk)（25 KB，安卓 10+）· 介绍页 <https://aliceljy.github.io/playground/phone-keyboard/>

其他安卓手机也能装，但手机系统得支持「模拟蓝牙键盘」（`BluetoothHidDevice`），部分品牌的系统把它关掉了。

## 体验

- 横竖都行（折叠屏展开是方屏）：最上一条状态栏；上半区左边数字键、右边触控板；下半区整块键盘。触控板放上面，打字时手掌不会蹭到。
- iPad 认它是普通外接键盘 + 鼠标，屏幕上的软键盘自动收起。
- 触控板照 MacBook 习惯：单指移动、轻点=左键、双指轻点=右键、双指滑=滚动（自然方向）、轻点后马上按住拖=拖一下、长按半秒=拖选（抬手不断，换位置接着拖，轻点结束，选长段文字用）。
- 三指手势不做：OPPO 把三指上滑/下滑留给系统（小布记忆、截屏），App 收不到。改成触控板下一排快捷键：全选、剪切、复制、粘贴、撤销、回主屏、切 App。
- 打中文用 iPad 自带的拼音输入法；「中/英」键等于 Ctrl+空格。
- 修饰键（⇧ ctrl ⌥ ⌘）点一下锁住，用于下一个键，之后自动取消；也可以一指按住、另一指按键。
- 按键时有轻微震动；按住键不放由 iPad 自己连发。

## 原理

Android 9+ 自带 `BluetoothHidDevice`，App 注册成标准启动键盘（报告 ID 1，8 字节）加鼠标（报告 ID 2：三键、X/Y、滚轮、横向滚动），iPad 那边什么都不用装。

## 构建

不用 Gradle，直接用 SDK 命令行工具：`bash tools/build.sh`，先跑 `tests/KeyStateTest.java`（键位、报告字节、触控板手势的断言），再出 `build/phone-keyboard.apk`。环境来自 `~/.android-build.env`。

## 验收

1. 测试全过（键宽、键码、修饰键锁定、Ctrl+Space、rollover）。
2. iPad 设置 → 蓝牙里能搜到并配对手机；配对后 App 状态栏显示「已连接」。
3. 在 iPad 备忘录里能打英文、切拼音打中文、⌘C/⌘V、方向键移动光标。
4. 关掉再打开 App，会自动重连上次的 iPad。

## 发版

`bash tools/build.sh` 出包，改 `AndroidManifest.xml` 的 `versionCode` / `versionName`，再 `gh release create phone-keyboard-v<版本> build/phone-keyboard.apk#phone-keyboard-v<版本>.apk`，介绍页与 README 的下载链接跟着改。签名钥匙不在仓库里（另有离线备份），换了钥匙已安装的人只能卸载重装。

## 谁会点开、AI 素材

给出门带 iPad、又不想多背一个键盘的人。代码全部是 AI 协作写的；截图是真机截的；没有 AI 生成的图片、声音。
