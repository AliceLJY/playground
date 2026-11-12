// 四景的次序、镜头怎么走、诗放在哪。页面和测试共用这一份，免得两边各写一套数。
// 世界坐标以「屏幕高度」为 1，每一景的画占 x ∈ [0, R]、y ∈ [0, 1]。
// 行程 g ∈ [0, 5]：整数部分是第几景（0–3 是四句诗的四幅画，4 是卷尾素纸），小数部分是这一景走了多少。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LuzhaiLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const R = 2.5;                      // 每幅画的宽高比（3172×1268 上下）
  const POEM_RATIO = 915 / 652;       // 题诗图的宽高比（assets/poem.png）
  // 题诗多高（占屏高）：手机上以整首放得下为限，屏幕宽了就放大，最多占四成屏高
  const poemH = (a) => Math.max(0.2, Math.min(0.40, (a - 0.08) / POEM_RATIO));
  const poemW = (a) => poemH(a) * POEM_RATIO;
  const PUSH = 0.18;                  // 每一景里镜头往画里推多少（1 → 1.18 倍）
  const FADE = 0.14;                  // 每一景首尾各有这么长一段在云气里换景

  // wide：竖屏时这一景两头各多走多少（竖屏只看得到画的一窄条，多走一段才看得出是长卷）。
  // from / to：镜头正中对着画的横向哪里（0 是最左，1 是最右）。手卷从右往左看，所以都是由大到小。
  // light：返照落在画里的位置和大小（没有就不写）。trunks：会在返照里落影的几根树干，[横向位置, 树根的纵向位置]。
  // seconds：没人碰时这一景自己走多久。voice：这一景里人语有多近。warm：傍晚的暖意有多重。
  const SCENES = [
    { key: 's1', wide: 0.14, line: '空山不见人', en: 'Empty mountain. No one in sight.', from: 0.68, to: 0.40, seconds: 12, voice: 0.12, warm: 0.25 },
    { key: 's2', wide: 0.12, line: '但闻人语响', en: 'Only the sound of voices, somewhere.', from: 0.80, to: 0.36, seconds: 13, voice: 1.00, warm: 0.45 },
    { key: 's3', wide: 0.06, line: '返景入深林', en: 'Evening light returns into the deep wood,', from: 0.78, to: 0.58, seconds: 15, voice: 0.45, warm: 0.80,
      light: { u: 0.63, v: 0.80, ru: 0.085, rv: 0.050, enterFrom: [0.99, 0.50], arrive: 0.45 },
      trunks: [[0.72, 0.72], [0.80, 0.63], [0.88, 0.56], [0.57, 0.78]] },
    { key: 's4', wide: 0, line: '复照青苔上', en: 'and shines again on the green moss.', from: 0.58, to: 0.48, seconds: 16, push: 0.06, voice: 0.20, warm: 1.00,
      light: { u: 0.52, v: 0.62, ru: 0.16, rv: 0.17, leave: 0.72 },
      trunks: [[0.88, 0.45], [0.72, 0.52], [0.57, 0.27], [0.30, 0.33]] },
  ];
  const N = SCENES.length;
  const HOLD = 3;                     // 开场停几秒才开始自己走
  const END = N + 1;                  // 行程终点（素纸上诗显全）

  const ease = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const baseZoom = (a) => Math.max(1, a / R);          // 屏幕比画还宽时放大到铺满

  // 第 i 景走到 u 时的镜头：正中的世界坐标 cx、放大倍数 zoom、屏幕两边看到的画的范围 [left, right]
  function camera(i, u, a) {
    const s = SCENES[i], e = ease(clamp01(u));
    const push = s.push === undefined ? PUSH : s.push;   // 第四景是低头看苔，推太近就认不出是苔了
    const z0 = baseZoom(a), z1 = z0 * (1 + push), zoom = z0 * (1 + push * e);
    const fit = (want, hw) => (hw >= R / 2 ? R / 2 : Math.max(hw, Math.min(R - hw, want)));
    const ext = (s.wide || 0) * clamp01((1.2 - a) / 0.7);   // 屏幕越窄，横着多走的这一段越长；横屏不加
    const c0 = fit((s.from + ext) * R, a / (2 * z0));
    const c1 = Math.min(c0, fit((s.to - ext) * R, a / (2 * z1)));   // 屏幕很宽时也只许向左，不许倒回右边
    const hw = a / (2 * zoom);
    const cx = fit(c0 + (c1 - c0) * e, hw);
    return { cx, zoom, left: cx - hw, right: cx + hw, top: 0.5 + 0.5 / zoom, bottom: 0.5 - 0.5 / zoom };
  }

  // 这一景的诗句什么时候在画边上露一下：画先看够了，句子才出来，走完之前又收回去
  const LINE_IN = 0.52, LINE_OUT = 0.84;
  function lineAlpha(u) {
    const up = clamp01((u - LINE_IN) / 0.10), down = 1 - clamp01((u - (LINE_OUT - 0.08)) / 0.08);
    return ease(Math.min(up, down));
  }

  // 云气盖住画面的程度：换景时在云里，中间是清的。第一景开头不遮——第一眼就得是一幅画。
  function veil(i, u) {
    const head = i > 0 ? 1 - clamp01(u / FADE) : 0;
    const tail = i < N ? clamp01((u - (1 - FADE)) / FADE) : 0;
    return Math.max(head, tail);
  }

  return { R, POEM_RATIO, poemH, poemW, PUSH, FADE, SCENES, N, HOLD, END, ease, clamp01, baseZoom, camera, veil, lineAlpha, LINE_IN, LINE_OUT };
});
