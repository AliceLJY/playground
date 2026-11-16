# 手机键盘

把安卓手机变成一把蓝牙键盘，给 iPad 用。出门不用再带妙控键盘。

## 体验

- 手机横屏，整个屏幕是一把键盘；iPad 认它是普通外接键盘，屏幕上的软键盘自动收起。
- 打中文用 iPad 自带的拼音输入法；「中/英」键等于 Ctrl+空格。
- 修饰键（⇧ ctrl ⌥ ⌘）点一下锁住，用于下一个键，之后自动取消；也可以一指按住、另一指按键。
- 按键时有轻微震动；按住键不放由 iPad 自己连发。

## 原理

Android 9+ 自带 `BluetoothHidDevice`，App 注册成标准启动键盘（报告 ID 1，8 字节报告），iPad 那边什么都不用装。

## 构建

不用 Gradle，直接用 SDK 命令行工具：`bash tools/build.sh`，先跑 `tests/KeyStateTest.java`（键位与报告字节的断言），再出 `build/phone-keyboard.apk`。环境来自 `~/.android-build.env`。

## 验收

1. 测试全过（键宽、键码、修饰键锁定、Ctrl+Space、rollover）。
2. iPad 设置 → 蓝牙里能搜到并配对手机；配对后 App 状态栏显示「已连接」。
3. 在 iPad 备忘录里能打英文、切拼音打中文、⌘C/⌘V、方向键移动光标。
4. 关掉再打开 App，会自动重连上次的 iPad。
