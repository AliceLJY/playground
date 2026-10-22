// 齿轮齿廓：DeepSeek Harness（dsh）写的两版 makeGearShape，页面和 Node 测试共用这一份。
// 下面两个函数的函数体与 dsh 的原文逐字相同（tests/gear-profile.test.cjs 会比对），
// 只做了一处机械改动：THREE 从全局变量改成第一个参数，这样 Node 里也能用。
//   makeGearShapeOriginal  dsh 第一次写出的版本（齿形方向写反了一个符号：齿顶宽、齿根窄）
//   makeGearShapeRepaired  dsh 自己返修后的最终版（齿根宽、齿顶窄，另加齿根内收与 4% 侧隙）
(function (root) {
'use strict';

/* ---------------- 渐开线直齿轮轮廓（两版相同） ---------------- */
function involutePoint(t, rb) {
  return { r: rb * Math.sqrt(1 + t * t), a: t - Math.atan(t) };
}

/* ---------------- 原版：dsh 第一次生成 ---------------- */
function makeGearShapeOriginal(THREE, N, m, pressureDeg = 20) {
  const alpha = pressureDeg * Math.PI / 180;
  const rp = m * N / 2;                 // 分度圆半径
  const ra = rp + m;                    // 齿顶圆半径（齿顶高 = m）
  const rf = rp - 1.25 * m;             // 齿根圆半径（齿根高 = 1.25m）
  const rb = rp * Math.cos(alpha);      // 基圆半径
  const invAlpha = Math.tan(alpha) - alpha;      // 渐开线函数 inv(α)
  const toothAngle = 2 * Math.PI / N;
  const halfThick = Math.PI / (2 * N);           // 分度圆上半齿厚角
  const rotRel = halfThick - invAlpha;           // 齿形相对齿中心线的偏转
  const ta = Math.sqrt((ra * ra) / (rb * rb) - 1); // 齿顶处渐开线参数
  const invTa = ta - Math.atan(ta);
  const SEG = 6;                        // 每条渐开线的采样段数

  const shape = new THREE.Shape();
  const hole = new THREE.Path();
  hole.absarc(0, 0, m * 1.6, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  for (let i = 0; i < N; i++) {
    const th = i * toothAngle;          // 该齿中心线角度

    // 左齿根（径向直边起点，简化齿根过渡）
    if (i === 0) shape.moveTo(rf * Math.cos(th - rotRel), rf * Math.sin(th - rotRel));
    else shape.lineTo(rf * Math.cos(th - rotRel), rf * Math.sin(th - rotRel));
    // 左基圆
    shape.lineTo(rb * Math.cos(th - rotRel), rb * Math.sin(th - rotRel));
    // 左渐开线 基圆→齿顶
    for (let s = 1; s <= SEG; s++) {
      const t = ta * s / SEG;
      const p = involutePoint(t, rb);
      const ang = th - rotRel - p.a;
      shape.lineTo(p.r * Math.cos(ang), p.r * Math.sin(ang));
    }
    // 齿顶圆弧 左顶→右顶
    shape.absarc(0, 0, ra, th - rotRel - invTa, th + rotRel + invTa, false);
    // 右渐开线 齿顶→基圆
    for (let s = SEG - 1; s >= 0; s--) {
      const t = ta * s / SEG;
      const p = involutePoint(t, rb);
      const ang = th + rotRel + p.a;
      shape.lineTo(p.r * Math.cos(ang), p.r * Math.sin(ang));
    }
    // 右基圆→右齿根
    shape.lineTo(rf * Math.cos(th + rotRel), rf * Math.sin(th + rotRel));
    // 齿根圆弧 到下一齿左齿根
    const next = (i + 1 < N) ? (i + 1) * toothAngle : 2 * Math.PI;
    shape.absarc(0, 0, rf, th + rotRel, next - rotRel, false);
  }
  shape.closePath();
  return shape;
}

/* ---------------- 返修后：dsh 自己改的最终版 ---------------- */
function makeGearShapeRepaired(THREE, N, m, pressureDeg = 20) {
  const alpha = pressureDeg * Math.PI / 180;
  const rp = m * N / 2;                 // 分度圆半径
  const ra = rp + m;                    // 齿顶圆半径（齿顶高 = m）
  const rf = rp - 1.25 * m;             // 齿根圆半径（齿根高 = 1.25m）
  const rb = rp * Math.cos(alpha);      // 基圆半径
  const invAlpha = Math.tan(alpha) - alpha;      // 渐开线函数 inv(α)
  const toothAngle = 2 * Math.PI / N;
  const halfThick = Math.PI / (2 * N) * 0.96;       // 分度圆上半齿厚角（留 4% 侧隙，消除小齿数齿根区干涉）
  const rotRel = halfThick + invAlpha;           // 齿形相对齿中心线的偏转
  const ta = Math.sqrt((ra * ra) / (rb * rb) - 1); // 齿顶处渐开线参数
  const invTa = ta - Math.atan(ta);
  const SEG = 6;                        // 每条渐开线的采样段数
  const filletAng = halfThick * 0.8;    // 齿根过渡内收角：基圆以下让出间隙，避免齿顶刮碰

  const shape = new THREE.Shape();
  const hole = new THREE.Path();
  hole.absarc(0, 0, m * 1.6, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  for (let i = 0; i < N; i++) {
    const th = i * toothAngle;          // 该齿中心线角度

    // 左齿根（内收过渡，给齿根让出间隙）
    if (i === 0) shape.moveTo(rf * Math.cos(th - rotRel + filletAng), rf * Math.sin(th - rotRel + filletAng));
    else shape.lineTo(rf * Math.cos(th - rotRel + filletAng), rf * Math.sin(th - rotRel + filletAng));
    // 左基圆
    shape.lineTo(rb * Math.cos(th - rotRel), rb * Math.sin(th - rotRel));
    // 左渐开线 基圆→齿顶（角增大，齿廓向齿顶收窄）
    for (let s = 1; s <= SEG; s++) {
      const t = ta * s / SEG;
      const p = involutePoint(t, rb);
      const ang = th - rotRel + p.a;
      shape.lineTo(p.r * Math.cos(ang), p.r * Math.sin(ang));
    }
    // 齿顶圆弧 左顶→右顶
    shape.absarc(0, 0, ra, th - rotRel + invTa, th + rotRel - invTa, false);
    // 右渐开线 齿顶→基圆
    for (let s = SEG - 1; s >= 0; s--) {
      const t = ta * s / SEG;
      const p = involutePoint(t, rb);
      const ang = th + rotRel - p.a;
      shape.lineTo(p.r * Math.cos(ang), p.r * Math.sin(ang));
    }
    // 右基圆→右齿根（内收过渡）
    shape.lineTo(rf * Math.cos(th + rotRel - filletAng), rf * Math.sin(th + rotRel - filletAng));
    // 齿根圆弧 到下一齿左齿根
    const next = (i + 1 < N) ? (i + 1) * toothAngle : 2 * Math.PI;
    shape.absarc(0, 0, rf, th + rotRel - filletAng, next - rotRel + filletAng, false);
  }
  shape.closePath();
  return shape;
}

const api = {
  involutePoint,
  makeGearShapeOriginal,
  makeGearShapeRepaired,
  makeGearShape(THREE, version, N, m, pressureDeg) {
    if (version === 'original') return makeGearShapeOriginal(THREE, N, m, pressureDeg);
    if (version === 'repaired') return makeGearShapeRepaired(THREE, N, m, pressureDeg);
    throw new Error('unknown version: ' + version);
  },
  VERSIONS: ['original', 'repaired'],
};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.GearProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
