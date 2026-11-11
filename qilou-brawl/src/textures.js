// 骑楼擂台 · 程序化贴图：灰泥、青砖、麻石、花阶砖、木板、擂台地毯、招牌图集、脚下影子。
// 全部在加载时用代码算出，没有图片文件；用贴图而不是着色器，是因为引擎会自己挑 WebGPU 或 WebGL，贴图两边都认。
import * as pc from 'playcanvas';

// 可平铺的值噪声：格点按周期取模，所以贴图四边接得上
function mkNoise(seed) {
  const h = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const n2 = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const m = (a) => ((a % per) + per) % per, x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
    const a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (u, v, base, oct) => { let s = 0, a = .5, f = base, t = 0; for (let i = 0; i < oct; i++) { s += a * n2(u * f, v * f, f); t += a; a *= .5; f *= 2; } return s / t; };
  // 各向异性：横向 fx 个周期、纵向 fy 个周期（拉长的水渍、木纹）
  const n2a = (u, v, fx, fy) => {
    const x = u * fx, y = v * fy, xi = Math.floor(x), yi = Math.floor(y), ax = x - xi, ay = y - yi, uu = ax * ax * (3 - 2 * ax), vv = ay * ay * (3 - 2 * ay);
    const mx = (a) => ((a % fx) + fx) % fx, my = (a) => ((a % fy) + fy) % fy;
    const a = h(mx(xi), my(yi) + 977), b = h(mx(xi + 1), my(yi) + 977), c = h(mx(xi), my(yi + 1) + 977), d = h(mx(xi + 1), my(yi + 1) + 977);
    return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
  };
  return { h, n2, fbm, n2a };
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// fn(u, v) → [r, g, b, 高度, 光泽]，都在 0..1。出反照率（光泽放进透明通道）和由高度求出的法线贴图
function bake(S, fn, bump) {
  const alb = new Uint8Array(S * S * 4), hgt = new Float32Array(S * S), nrm = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = fn((x + .5) / S, (y + .5) / S), i = (y * S + x) * 4;
    alb[i] = Math.max(0, Math.min(255, o[0] * 255)); alb[i + 1] = Math.max(0, Math.min(255, o[1] * 255)); alb[i + 2] = Math.max(0, Math.min(255, o[2] * 255)); alb[i + 3] = Math.max(0, Math.min(255, o[4] * 255));
    hgt[y * S + x] = o[3];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xl = (x + S - 1) % S, xr = (x + 1) % S, yu = (y + S - 1) % S, yd = (y + 1) % S;
    let dx = (hgt[y * S + xl] - hgt[y * S + xr]) * bump, dy = (hgt[yu * S + x] - hgt[yd * S + x]) * bump;
    const l = 1 / Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    nrm[i] = (dx * l * .5 + .5) * 255; nrm[i + 1] = (dy * l * .5 + .5) * 255; nrm[i + 2] = (l * .5 + .5) * 255; nrm[i + 3] = 255;
  }
  return { alb, nrm, S };
}
function tex(device, data, w, h, srgb, repeat = true) {
  const t = new pc.Texture(device, {
    width: w, height: h, format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8, mipmaps: true, anisotropy: 8,
    addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE, addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, levels: [data]
  });
  return t;
}

// ---- 各种表面。除青砖、花阶砖、麻石自带颜色外，其余接近中性灰，颜色由顶点色给 ----
function plaster(N) { // 4 m 一铺：斑驳、往下淌的水渍、细裂缝、几处灰皮剥落露出青砖
  return (u, v) => {
    const b = N.fbm(u, v, 3, 5), grain = N.n2(u * 190, v * 190, 190), fine = N.n2(u * 64, v * 64, 64);
    const drip = N.n2a(u, v, 44, 3) * N.n2a(u + .37, v, 96, 5), streak = ss(.34, .7, drip);
    const crackF = Math.abs(N.fbm(u + .21, v + .63, 2, 4) - .5), crack = 1 - ss(.0015, .006, crackF) * 1;
    const crackOn = ss(.5, .62, N.fbm(u + .5, v + .11, 2, 2)), ck = crack * crackOn;
    const pf = N.fbm(u + .77, v + .31, 2, 5) + (fine - .5) * .04, peel = ss(.672, .684, pf), lip = ss(.645, .672, pf) * (1 - peel);
    let k = .9 + .2 * (b - .5) * 2 * .55 + .05 * (grain - .5) + .05 * (fine - .5) - .2 * streak - .1 * lip, r = k, g = k * .985 - .012 * streak, bl = k * .955 - .05 * streak;
    g += .03 * streak * ss(.5, .8, b); // 水渍处一点青苔绿
    let hh = .5 + .1 * (grain - .5) + .12 * (fine - .5) + .12 * lip, gl = .1;
    if (ck > 0) { r *= 1 - .55 * ck; g *= 1 - .55 * ck; bl *= 1 - .55 * ck; hh -= .4 * ck; }
    if (peel > 0) {
      const row = Math.floor(v * 56), bx = u * 14 + (row & 1) * .5, fy = v * 56 - row, fx = bx - Math.floor(bx);
      const mortar = Math.min(ss(0, .12, Math.min(fy, 1 - fy)), ss(0, .035, Math.min(fx, 1 - fx)));
      const id = N.h(Math.floor(bx) % 14, row), bk = (.44 + .2 * id) * (.75 + .5 * fine);
      const br = mix(.62, bk * .92, mortar), bg = mix(.6, bk * .96, mortar), bb = mix(.56, bk * 1.04, mortar);
      r = mix(r, br, peel); g = mix(g, bg, peel); bl = mix(bl, bb, peel); hh = mix(hh, .12 + .22 * mortar, peel);
    }
    return [r, g, bl, hh, gl];
  };
}
function brick(N) { // 2 m 一铺：青砖 32 皮，错缝
  return (u, v) => {
    const row = Math.floor(v * 32), bx = u * 8 + (row & 1) * .5, fy = v * 32 - row, fx = bx - Math.floor(bx);
    const mortar = Math.min(ss(0, .14, Math.min(fy, 1 - fy)), ss(0, .04, Math.min(fx, 1 - fx)));
    const id = N.h(((Math.floor(bx) % 8) + 8) % 8, row), fine = N.n2(u * 120, v * 120, 120), b = N.fbm(u, v, 3, 4);
    const chip = ss(.72, .8, N.n2(u * 40, v * 60, 40)) * mortar;
    const k = (.4 + .22 * id) * (.8 + .4 * fine) * (.75 + .5 * b) * (1 - .25 * chip);
    const warm = id > .8 ? .06 : 0;
    return [mix(.66, k * .93 + warm, mortar), mix(.65, k * .98, mortar), mix(.62, k * 1.06 - warm, mortar), .2 + .6 * mortar - .2 * chip + .1 * fine, .12 + .1 * id * mortar];
  };
}
function granite(N) { // 4 m 一铺：横铺的麻石条，每条约 0.5 m 宽、1.3 m 长，走的人多的地方磨得发亮
  return (u, v) => {
    const row = Math.floor(v * 8), off = N.h(row, 91) * 3, sx = u * 3 + off, col = ((Math.floor(sx) % 3) + 3) % 3, fy = v * 8 - row, fx = sx - Math.floor(sx);
    const wob = (N.n2(u * 30, v * 30, 30) - .5) * .012;
    const joint = Math.min(ss(.012, .05, Math.min(fy, 1 - fy) + wob), ss(.004, .017, Math.min(fx, 1 - fx) + wob * .4));
    const id = N.h(col + 7 * row, row + 13), sp = N.n2(u * 300, v * 300, 300), sp2 = N.n2(u * 140, v * 140, 140), b = N.fbm(u, v, 2, 5);
    const fleck = ss(.72, .8, sp) * .16 - ss(.75, .85, sp2) * .2 + ss(.2, .1, sp) * .08;
    const chip = ss(.78, .86, N.fbm(u + .4, v + .2, 6, 3)) * (1 - ss(.0, .2, Math.min(fy, 1 - fy)));
    const wear = ss(.35, .7, b);
    let k = (.6 + .11 * id + fleck) * (.8 + .34 * b) * (1 - .3 * chip);
    const tint = id > .7 ? [1.025, .995, .96] : id < .25 ? [.975, .995, 1.02] : [1, 1, .985];
    const j = .3 + .1 * b;
    return [mix(j, k * tint[0], joint), mix(j, k * tint[1], joint), mix(j * .95, k * tint[2], joint), .15 + .6 * joint + .2 * (sp2 - .5) - .3 * chip, mix(.08, .22 + .34 * wear, joint) * (1 - chip)];
  };
}
function floorTile(N) { // 1.6 m 一铺：8×8 块 20 cm 的花阶砖，菱形配四角圆花，隔块换色
  const cream = [.84, .78, .64], red = [.6, .24, .19], green = [.3, .42, .34], dark = [.22, .22, .24], ochre = [.78, .58, .26];
  return (u, v) => {
    const tx = Math.floor(u * 8), ty = Math.floor(v * 8), a = u * 8 - tx, b = v * 8 - ty, alt = (tx + ty) & 1;
    const d = Math.abs(a - .5) + Math.abs(b - .5), cr = Math.hypot(Math.min(a, 1 - a), Math.min(b, 1 - b)), cc = Math.hypot(a - .5, b - .5);
    let c = cream;
    if (cr < .27) c = cr < .1 ? ochre : cr > .235 ? dark : alt ? red : green;
    else if (d < .3) c = d > .262 ? dark : cc < .075 ? ochre : alt ? green : red;
    else if (d < .34) c = cream; else if (Math.abs(d - .42) < .018) c = dark;
    const grout = Math.min(ss(0, .03, Math.min(a, 1 - a)), ss(0, .03, Math.min(b, 1 - b)));
    const id = N.h(tx, ty), wear = N.fbm(u, v, 3, 5), fine = N.n2(u * 160, v * 160, 160), dirt = ss(.52, .78, N.fbm(u + .3, v + .6, 2, 4));
    const k = (.84 + .14 * id) * (.74 + .5 * wear) * (.94 + .12 * fine) * (1 - .3 * dirt);
    const g = .2;
    return [mix(g, c[0] * k, grout), mix(g, c[1] * k, grout), mix(g * .95, c[2] * k, grout), .25 + .6 * grout + .1 * (fine - .5), mix(.06, .3 + .28 * wear, grout) * (1 - .6 * dirt)];
  };
}
function wood(N) { // 2 m 一铺：8 条竖木板，木纹拉长，接近中性，颜色交给顶点色
  return (u, v) => {
    const p = Math.floor(u * 8), fx = u * 8 - p, id = N.h(p, 5), gap = ss(0, .05, Math.min(fx, 1 - fx));
    const gr = N.n2a(u + id, v, 96, 5) * .55 + N.n2a(u, v + id, 230, 9) * .45, knot = ss(.82, .9, N.n2a(u + id * .3, v, 16, 6));
    const fine = N.n2(u * 150, v * 150, 150), worn = N.fbm(u, v, 3, 4);
    const k = (.72 + .22 * id) * (.74 + .42 * gr) * (1 - .35 * knot) * (.82 + .3 * worn) * (.95 + .1 * fine);
    return [mix(.16, k * 1.03, gap), mix(.15, k, gap), mix(.14, k * .95, gap), .15 + .55 * gap + .3 * (gr - .5) - .2 * knot, mix(.05, .2 + .2 * gr, gap)];
  };
}

// ---- 招牌图集：竖灯箱、横匾、柱上对联 ----
const FONT = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","SimSun","PingFang SC","Microsoft YaHei",serif';
export const SIGN_TEXT = {
  box: ['祥兴茶楼', '荣记烧腊', '西关凉茶', '龙凤饼家', '和昌布庄', '同昌药行', '广昌钟表', '兴记云吞面', '福记糖水', '合兴海味', '大押', '跌打', '明记冰室', '士多', '照相', '理发', '凉果', '鞋庄', '艇仔粥', '双皮奶', '肠粉', '金铺', '花生糖', '竹升面'],
  board: ['祥兴茶楼', '荣记烧腊', '西关凉茶铺', '龙凤饼家', '和昌布庄', '同昌药行', '广昌钟表行', '兴记面家', '福记糖水', '合兴海味', '宝生大押', '正骨跌打', '明记冰室', '街坊士多', '艺光照相', '飞发铺', '凉果蜜饯', '步云鞋庄', '荔湾艇仔粥', '南信甜品', '银记肠粉', '天宝金铺', '醒狮会馆', '武馆'],
  couplet: ['锣鼓喧天迎盛会', '醒狮起舞贺新春', '生意兴隆通四海', '财源茂盛达三江', '一团和气', '八方来财', '龙马精神', '花开富贵', '出入平安', '恭喜发财', '货真价实', '童叟无欺', '老字号', '祖传秘方', '饮啖茶', '食个包', '开门大吉', '万事胜意', '拳打南山', '脚踢北海']
};
const BOX_STYLE = [['#B3161C', '#FFE08A', '#FFD25E'], ['#12305A', '#FFFFFF', '#9FD0FF'], ['#1E5A3A', '#FFE08A', '#BFF0C8'], ['#F4C430', '#A3141A', '#7A0E12'], ['#F7F1E0', '#B3161C', '#B3161C'], ['#1B1B1F', '#FFCF5A', '#FF5A4A'], ['#C2185B', '#FFFFFF', '#FFD0E4'], ['#0E6E76', '#FFFFFF', '#B6F4F0']];
const BOARD_STYLE = [['#16130F', '#E8B84A'], ['#5A1410', '#F2CF72'], ['#143524', '#EBC867'], ['#2A1B10', '#F0D9A0'], ['#0F2038', '#E8C56A']];
export const ATLAS = { W: 2048, H: 2048, box: { w: 170, h: 420, y: [0, 420], n: 12 }, board: { w: 512, h: 120, y0: 850, n: 4, rows: 6 }, couplet: { w: 100, h: 440, y0: 1590, n: 20 } };
function signAtlas() {
  const c = document.createElement('canvas'); c.width = ATLAS.W; c.height = ATLAS.H;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.textAlign = 'center'; g.textBaseline = 'middle';
  const vertical = (text, x, y, w, h, size, color, pad) => {
    const n = text.length, step = Math.min(size * 1.12, (h - pad * 2) / n), fs = Math.min(size, step * .96);
    g.font = `900 ${fs}px ${FONT}`; g.fillStyle = color;
    for (let k = 0; k < n; k++) g.fillText(text[k], x + w / 2, y + h / 2 + (k - (n - 1) / 2) * step + fs * .04);
  };
  SIGN_TEXT.box.forEach((t, i) => {
    const B = ATLAS.box, x = (i % B.n) * B.w, y = B.y[Math.floor(i / B.n)], [bg, fg, edge] = BOX_STYLE[i % BOX_STYLE.length];
    g.fillStyle = bg; g.fillRect(x, y, B.w, B.h);
    const gr = g.createRadialGradient(x + B.w / 2, y + B.h / 2, 10, x + B.w / 2, y + B.h / 2, B.h * .62); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = gr; g.fillRect(x, y, B.w, B.h);
    g.strokeStyle = edge; g.lineWidth = 5; g.strokeRect(x + 9, y + 9, B.w - 18, B.h - 18); g.lineWidth = 1.5; g.strokeRect(x + 17, y + 17, B.w - 34, B.h - 34);
    g.shadowColor = fg; g.shadowBlur = 10; vertical(t, x, y, B.w, B.h, t.length <= 2 ? 118 : 96, fg, 26); g.shadowBlur = 0;
  });
  SIGN_TEXT.board.forEach((t, i) => {
    const B = ATLAS.board, x = (i % B.n) * B.w, y = B.y0 + Math.floor(i / B.n) * B.h, [bg, fg] = BOARD_STYLE[i % BOARD_STYLE.length];
    g.fillStyle = bg; g.fillRect(x, y, B.w, B.h);
    g.strokeStyle = fg; g.globalAlpha = .75; g.lineWidth = 3; g.strokeRect(x + 7, y + 7, B.w - 14, B.h - 14); g.globalAlpha = 1;
    const fs = Math.min(78, (B.w - 70) / t.length * .98); g.font = `900 ${fs}px ${FONT}`; g.fillStyle = fg;
    const step = Math.min(fs * 1.25, (B.w - 70) / t.length);
    for (let k = 0; k < t.length; k++) g.fillText(t[k], x + B.w / 2 + (k - (t.length - 1) / 2) * step, y + B.h / 2 + 3);
  });
  SIGN_TEXT.couplet.forEach((t, i) => {
    const B = ATLAS.couplet, x = i * B.w, y = B.y0, gold = i >= 12;
    g.fillStyle = gold ? '#EFE3C4' : '#B81A1F'; g.fillRect(x, y, B.w, B.h);
    g.strokeStyle = gold ? '#8A1C16' : '#E9B94B'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, B.w - 10, B.h - 10);
    vertical(t, x, y, B.w, B.h, 70, gold ? '#9A1B14' : '#F5D276', 18);
  });
  return g.getImageData(0, 0, c.width, c.height).data;
}
// 擂台图集：上面 1024×1600 是红地毯（回纹金边、正中「擂」字圆章），下面是「醒狮擂台」横幅
export const ARENA = { W: 1024, H: 2048, carpet: [0, 0, 1024, 1600], banner: [0, 1610, 1024, 290], plaque: [0, 1910, 512, 138] };
function arenaAtlas(N) {
  const c = document.createElement('canvas'); c.width = ARENA.W; c.height = ARENA.H;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#A51F24'; g.fillRect(0, 0, 1024, 1600);
  const gold = '#E2B04A', deep = '#7E1418';
  g.fillStyle = deep; g.fillRect(0, 0, 1024, 1600); g.fillStyle = '#B4242A'; g.fillRect(36, 36, 952, 1528);
  g.strokeStyle = gold; g.lineWidth = 9; g.strokeRect(58, 58, 908, 1484); g.lineWidth = 3; g.strokeRect(128, 128, 768, 1344);
  // 回纹：金边两道线之间一圈方折线
  g.lineWidth = 5; g.beginPath();
  const fret = (x, y, dx, dy, n) => { for (let k = 0; k < n; k++) { const ox = x + dx * k * 50, oy = y + dy * k * 50, ax = dx ? 1 : 0, ay = dy ? 1 : 0, px = (a, b) => [ox + ax * a + ay * b, oy + ay * a + ax * b];
    const pts = [px(4, 10), px(4, 42), px(42, 42), px(42, 12), px(16, 12), px(16, 30), px(30, 30), px(30, 22)]; g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); } };
  fret(74, 68, 1, 0, 17); fret(74, 1480, 1, 0, 17); fret(68, 124, 0, 1, 27); fret(904, 124, 0, 1, 27); g.stroke();
  // 四角如意云头
  for (const [cx, cy] of [[190, 190], [834, 190], [190, 1410], [834, 1410]]) { g.lineWidth = 6; for (const r of [20, 36, 52]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); } }
  // 正中圆章
  g.fillStyle = deep; g.beginPath(); g.arc(512, 800, 232, 0, Math.PI * 2); g.fill();
  g.lineWidth = 12; g.beginPath(); g.arc(512, 800, 232, 0, Math.PI * 2); g.stroke(); g.lineWidth = 4; g.beginPath(); g.arc(512, 800, 204, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.beginPath(); g.arc(512 + Math.cos(a) * 262, 800 + Math.sin(a) * 262, 9, 0, Math.PI * 2); g.fillStyle = gold; g.fill(); }
  g.font = `900 300px ${FONT}`; g.fillStyle = gold; g.fillText('擂', 512, 812); // 图的上边贴在擂台背板那头，从街口走过来看字是正的
  // 织物的毛糙与踩旧
  const im = g.getImageData(0, 0, 1024, 1600), d = im.data;
  for (let y = 0; y < 1600; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4, u = x / 1024, v = y / 1600;
    const k = (.86 + .2 * N.n2(x * .5, y * .5, 4096)) * (.8 + .36 * N.fbm(u, v * 1.5, 3, 4)) * (((x + y) & 3) === 0 ? .93 : 1);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  g.putImageData(im, 0, 0);
  // 横幅
  const [bx, by, bw, bh] = ARENA.banner;
  g.fillStyle = '#B3161C'; g.fillRect(bx, by, bw, bh);
  const gr = g.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, 'rgba(255,220,160,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = gr; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = gold; g.lineWidth = 8; g.strokeRect(bx + 14, by + 14, bw - 28, bh - 28); g.lineWidth = 2; g.strokeRect(bx + 28, by + 28, bw - 56, bh - 56);
  g.font = `900 190px ${FONT}`; g.fillStyle = '#F6D06A'; g.shadowColor = 'rgba(60,0,0,.8)'; g.shadowBlur = 6; g.shadowOffsetY = 5;
  ['醒', '狮', '擂', '台'].forEach((ch, k) => g.fillText(ch, bx + 150 + k * 241, by + bh / 2 + 8)); g.shadowBlur = 0; g.shadowOffsetY = 0;
  // 牌匾
  const [qx, qy, qw, qh] = ARENA.plaque;
  g.fillStyle = '#17120D'; g.fillRect(qx, qy, qw, qh); g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(qx + 8, qy + 8, qw - 16, qh - 16);
  g.font = `900 92px ${FONT}`; g.fillStyle = '#EBC25A'; ['西', '关', '擂', '台'].forEach((ch, k) => g.fillText(ch, qx + 82 + k * 116, qy + qh / 2 + 4));
  return g.getImageData(0, 0, c.width, c.height).data;
}
function blob() { // 脚下的软影：中间实、边缘虚
  const S = 128, d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x - 63.5, y - 63.5) / 64, a = Math.pow(Math.max(0, 1 - r), 1.6) * (1 - .25 * r); const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.min(255, a * 255); }
  return d;
}

export function makeTextures(device, { small = false } = {}) {
  const S = small ? 512 : 1024, out = {};
  const surf = { plaster: [plaster, 11, 2.2], brick: [brick, 23, 3], granite: [granite, 37, 3.2], tile: [floorTile, 41, 2], wood: [wood, 53, 2.6] };
  for (const [name, [fn, seed, bump]] of Object.entries(surf)) {
    const b = bake(S, fn(mkNoise(seed)), bump * S / 1024);
    out[name] = { map: tex(device, b.alb, S, S, true), normal: tex(device, b.nrm, S, S, false) };
  }
  out.signs = tex(device, new Uint8Array(signAtlas().buffer), ATLAS.W, ATLAS.H, true, false);
  out.arena = tex(device, new Uint8Array(arenaAtlas(mkNoise(67)).buffer), ARENA.W, ARENA.H, true, false);
  out.blob = tex(device, blob(), 128, 128, true, false);
  return out;
}
