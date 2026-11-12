// 卷子的尺寸与镜头位置。世界坐标以「屏幕高度」为 1，画心占 x ∈ [0, R]，往左是隔水和卷尾素纸。
// 页面和测试共用这一份，免得两边各写一套数。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LuzhaiLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const R = 3966 / 1586;              // 画心宽高比
  const MOUNT = 0.07;                 // 隔水宽
  const POEM_X = -(MOUNT + 0.52);     // 题诗正中在卷尾素纸上的位置
  const POEM_H = 0.25;                // 题诗高度（占屏高），与 CSS 的 25vh 对应
  const POEM_W = POEM_H * 948 / 585;  // 题诗宽度（按 assets/poem.png 的尺寸）
  const LIGHT_U = 0.728;              // 苔上那片返照在画里的横向位置（0–1）
  const LIGHT_X = LIGHT_U * R;
  const rightCam = (a) => (a >= R ? (R - a) / 2 : R - a);            // 画的最右端
  const startCam = (a) => Math.min(rightCam(a), LIGHT_X - 0.56 * a);  // 开场就要看见苔上的返照
  const endCam = (a) => POEM_X - a / 2;                               // 卷到题诗居中为止
  const clampCam = (c, a) => Math.max(endCam(a), Math.min(rightCam(a), c));
  return { R, MOUNT, POEM_X, POEM_H, POEM_W, LIGHT_U, LIGHT_X, rightCam, startCam, endCam, clampCam };
});
