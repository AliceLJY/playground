// 南禅寺大殿 · 纯函数模型。图里一个单位 = 1 分（材分制的「分」）。
// 数字出处见 facts.md：Z = 张荣等 2022《建筑史学刊》；R = 祁英涛、柴泽俊 1980《文物》。
// 页面上每个数字都从这里来。

export const SOURCE = {
  Z: "张荣等 2022《建筑史学刊》",
  R: "祁英涛、柴泽俊 1980《文物》",
};

// 一分多少毫米。Z：16.3–16.5 mm，取 16.5。
export const FEN_MM = 16.5;
export const CHI_MM = 300; // Z 推的营造尺

// 材（Z）：材广 15 分，单材厚 10 分，足材广 21 分，栔 6 分
export const CAI = { guang: 15, hou: 10, zu: 21, qi: 6, zuHou: 11 };

// 平面（Z）：明间 300、次间 200、进深三间各 200
export const BAY = { ming: 300, ci: 200, deep: 200 };
export const COLS_X = [-BAY.ming / 2 - BAY.ci, -BAY.ming / 2, BAY.ming / 2, BAY.ming / 2 + BAY.ci]; // -350 -150 150 350
export const COLS_Y = [-300, -100, 100, 300];

// 竖向（Z）：平柱高 13 尺，斗栱层高 95 分，举屋 130 分
export const COLUMN_H = (13 * CHI_MM) / FEN_MM; // 236.36
export const BRACKET_H = 95;
export const JU_H = 130;
export const XIA_ZHE = 10; // 平槫下折
export const CE_JIAO = 70 / FEN_MM; // R：侧脚 7 cm → 4.24 分
export const SHENG_QI = 2; // Z：1.5–2 分（示意）
export const COLUMN_D = 24; // Z：柱径 24 分
export const SQUARE_COL = [300 / FEN_MM, 360 / FEN_MM]; // R：方柱 30×36 cm

// 台基：R 发掘原台明高 110 cm；下檐出 202 cm（示意，R OCR 不全）
export const BASE_H = 1100 / FEN_MM; // 66.7
export const BASE_OUT = 2020 / FEN_MM; // 122.4（柱中到台明边，示意）

// 槫（Z）：槫距 150，橑檐槫距柱中 47（两跳）
export const PURLIN_Y = { ji: 0, ping: 150, niuji: 300, liaoyan: 347 };
export const TIAO = [27, 20]; // Z：外跳第一跳 27、第二跳 20

// 出檐（R）：檐柱中至椽头 234 cm（修缮推算，示意）
export const EAVE_OUT = 2340 / FEN_MM; // 141.8

// 鸱尾（R 复原）：高 140 cm
export const CHIWEI_H = 1400 / FEN_MM; // 84.8

// 举折：从三个数算出各槫上皮相对橑檐槫上皮的高度
export function juZhe({ ju = JU_H, zhe = XIA_ZHE, P = PURLIN_Y } = {}) {
  const span = P.liaoyan - P.ji;
  const straightAtPing = (ju * (P.liaoyan - P.ping)) / span;
  const ping = straightAtPing - zhe;
  const niuji = (ping * (P.liaoyan - P.niuji)) / (P.liaoyan - P.ping);
  return {
    liaoyan: 0,
    niuji,
    ping,
    ji: ju,
    straightAtPing,
    ratio: (2 * P.liaoyan) / ju, // 前后橑檐槫距 ÷ 举高
    slopeUpper: Math.atan((ju - ping) / (P.ping - P.ji)) * 180 / Math.PI,
    slopeLower: Math.atan(ping / (P.liaoyan - P.ping)) * 180 / Math.PI,
  };
}

// 分 → 厘米 / 米（随分值滑杆变）
export const cm = (fen, mm = FEN_MM) => (fen * mm) / 10;
export const m = (fen, mm = FEN_MM) => (fen * mm) / 1000;

export function overall(mm = FEN_MM) {
  const J = juZhe();
  const width = BAY.ming + 2 * BAY.ci;
  const depth = 3 * BAY.deep;
  return {
    widthFen: width,
    depthFen: depth,
    width: m(width, mm),
    depth: m(depth, mm),
    column: m(COLUMN_H, mm),
    bracket: m(BRACKET_H, mm),
    ju: m(JU_H, mm),
    eave: m(EAVE_OUT, mm),
    cai: [cm(CAI.guang, mm), cm(CAI.hou, mm)],
    ratio: J.ratio,
    ridge: m(BASE_H + COLUMN_H + BRACKET_H + 10.5 + JU_H, mm),
  };
}

// 栌斗（Z）：高 18、宽 29、深 26；耳/平/欹 7/4/7
export const LUDOU = { w: 29, d: 26, h: 18, er: 7, ping: 4, qi: 7 };

// 每一步：给七岁孩子的提示、象声词、读数用的构件与分值
export const STEPS = [
  { id: "base", name: "夯台基", hint: "先把土一层层夯结实，垒成一个高台子，房子就不会陷下去。", sound: "咚！咚！", part: "台基", say: (mm) => `台基高 ${cm(BASE_H, mm).toFixed(0)} cm（R 发掘）· ${BASE_H.toFixed(0)} 分` },
  { id: "column", name: "立柱", hint: "立起 12 根柱子。每根柱子顶往里歪一点点（侧脚），房子站得更稳。", sound: "嘿哟！", part: "檐柱 ×12", say: (mm) => `柱高 ${m(COLUMN_H, mm).toFixed(2)} m · ${COLUMN_H.toFixed(0)} 分 · 侧脚 ${CE_JIAO.toFixed(1)} 分` },
  { id: "lane", name: "阑额", hint: "柱子顶上横着穿一圈木梁，把 12 根柱子手拉手连成一圈。", sound: "咔！", part: "阑额", say: () => `只用阑额 · 不用普拍枋（R）` },
  { id: "bracket", name: "斗栱", hint: "柱头上一层斗、一层栱，像手掌一层层往外托，把屋檐托得远远的。", sound: "咔哒 咔哒", part: "柱头铺作 ×12", say: (mm) => `五铺作双杪 · 高 ${BRACKET_H} 分 = ${cm(BRACKET_H, mm).toFixed(0)} cm · 出两跳 ${TIAO[0] + TIAO[1]} 分` },
  { id: "beam", name: "梁架", hint: "两根大梁从前檐一直跨到后檐，中间一根柱子都不用。", sound: "嗵——", part: "四椽栿 · 平梁 · 叉手", say: (mm) => `四椽栿跨 ${3 * BAY.deep} 分 = ${m(3 * BAY.deep, mm).toFixed(2)} m · 殿内无柱` },
  { id: "purlin", name: "举折定屋面", hint: "一根根圆木（槫）架上去，高低一排好，屋顶的弯就定了。", sound: "咕噜", part: "槫", say: () => { const J = juZhe(); return `举高 ${JU_H} 分 · 平槫下折 ${XIA_ZHE} 分 · 1:${J.ratio.toFixed(2)}`; } },
  { id: "rafter", name: "铺椽", hint: "顺着坡铺上一排排椽子，伸出去就是屋檐。", sound: "哒哒哒", part: "檐椽 · 脑椽 · 角梁", say: (mm) => `出檐 ${m(EAVE_OUT, mm).toFixed(2)} m（R 修缮推算，示意）· 不用飞椽` },
  { id: "roof", name: "瓦顶与鸱尾", hint: "盖上灰瓦，屋脊两头装上鸱尾，雨水就顺着坡流下去。", sound: "哗啦啦", part: "筒板瓦 · 鸱尾", say: (mm) => `鸱尾高 ${cm(CHIWEI_H, mm).toFixed(0)} cm（R 复原）· 单檐歇山` },
  { id: "wall", name: "砌墙装门", hint: "最后在柱子之间砌上白墙、装上大门和窗。墙不扛屋顶，只挡风。", sound: "吱呀", part: "檐墙 · 板门 · 破子棂窗", say: () => `墙不承重（R）· 板门两扇 · 破子棂窗` },
  { id: "apart", name: "拆开", hint: "把木头骨架一层层抬起来看看：每一层都压在下面那一层上。墙不扛重，就留在原地。", sound: "嗖——", part: "", say: () => `木构 7 层抬起 · 墙留在台基上` },
  { id: "again", name: "装回", hint: "再一层层装回去。屋顶的重量就这样从瓦一路传到地上。", sound: "咚", part: "", say: (mm) => { const o = overall(mm); return `面阔 ${o.width.toFixed(2)} m · 进深 ${o.depth.toFixed(2)} m`; } },
];

// 剖视窗里的传力顺序（从上往下）
export const LOAD_PATH = [
  { id: "wa", name: "瓦和椽", fen: "椽径约 9 分（示意）" },
  { id: "tuan", name: "橑檐槫", fen: "距柱中 47 分" },
  { id: "timu", name: "替木", fen: "高 10 分（示意）" },
  { id: "linggong", name: "令栱", fen: `材广 ${CAI.guang} 分` },
  { id: "hua2", name: "第二跳华栱", fen: `足材 ${CAI.zu} 分 · 出 ${TIAO[1]} 分` },
  { id: "hua1", name: "第一跳华栱", fen: `足材 ${CAI.zu} 分 · 出 ${TIAO[0]} 分` },
  { id: "ludou", name: "栌斗", fen: `高 ${LUDOU.h} 宽 ${LUDOU.w} 深 ${LUDOU.d} 分` },
  { id: "zhu", name: "檐柱", fen: `径 ${COLUMN_D} 分 · 高 ${COLUMN_H.toFixed(0)} 分` },
];

// 倍速角标：南禅寺每一步的真实工期没有史料记载，所以角标只写「快放」，不编倍数。
export const SPEED_NOTE = "快放 · 真实工期无记载";
