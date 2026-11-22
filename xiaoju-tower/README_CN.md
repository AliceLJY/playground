# 小橘爬塔

爱攀岩的肌肉小橘顺着广州塔扭转的白色钢网格往上爬。路线自己挑，看准时机在横梁上歇脚；起风前按住抓紧，绕开蹲着的鸽子。天色随高度从午后走到入夜，爬到 454 米看全城亮灯。

## 怎么玩

- 按住 ↑ / W 沿柱子往上爬，↓ / S 往下。往上爬会掉体力，挂在柱子中段也会慢慢掉；停在横梁上不动就能回体力。
- 停在横梁上时，← → / A D 换到相邻的柱子，用来绕开鸽子。撞上鸽子会扣体力，人也会被推回这一段的底部。
- 屏幕顶上的风向条走满就开始刮风。刮风前按住「抓紧」（空格），风向条退空了再松手。没扛住会滑到下面一道横梁。
- 过了塔腰，柱子往外倒，爬起来更费体力。约 109、227、336 米各有一层歇脚台，到了体力回满，并记作存档点。体力用光会滑回上一个歇脚台。
- 天色跟你的时钟走：白天玩是白天，傍晚玩越爬越黑，晚上玩一开始就是夜景。开场面板上的按钮可以手动换。
- 手机上，左下是「抓紧」，右下是方向键。拖动画面可以左右转一下镜头。

## 本地运行与检查

```sh
python3 -m http.server 8765    # 在 xiaoju-tower 目录里
```

打开 `http://localhost:8765/`。固定机位：`?view=base`、`?view=waist`、`?view=top`，加 `&seed=3` 可以固定鸽子和阵风。

```sh
node --check src/core.js && node --check src/game.js
node --test tests/*.test.cjs
python3 build.py                                   # 生成单文件 小橘爬塔.html
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8765/ shots
```

城市数据由 `tools/build-city.py` 从 OSM 广东分省包切出来（需要 osmium-tool），以广州塔为原点，取半径 4.2 公里。角色贴图由 `tools/key-sprites.py` 从绿幕动作表抠出。实测数字和没覆盖到的项目见 [VERIFICATION.md](VERIFICATION.md)。

## 谁会点开、AI 素材

- 谁会点开：在广州塔下仰头看过它的人，想自己爬上去一回。
- AI 素材：小橘的设定图和三张攀爬动作帧是网页版 ChatGPT 生成的；塔身、城市、天色、鸽子都是代码搭的，城市楼群来自 OpenStreetMap；代码由人与 AI 协作完成。署名：我的AI小木屋 / GitHub @AliceLJY。
