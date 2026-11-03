// 从像素办公室源码里原样抽出画小人的代码，生成 src/figures.js。
// 牌面上的小人必须和办公室里一模一样，所以这里不手写任何一笔：每一行 r(...) 都是从
// ../ai-office/office.js（站姿、挥手、11 种配饰、老板、无忧无虑）和 office-core.js（弹簧、跳一下、挥手姿势）
// 按锚点文字截出来的。办公室那边改了长相，重跑本脚本即可；tests/figures.test.cjs 会比对生成结果和提交的文件，
// 不一致就红（说明办公室改了、这里没跟）。
//
//   node tools/sync-figures.cjs          写 src/figures.js
//   node tools/sync-figures.cjs --check  只比对，不一致退出码 1
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const office = fs.readFileSync(path.join(ROOT, 'ai-office', 'office.js'), 'utf8').split('\n');
const core = fs.readFileSync(path.join(ROOT, 'ai-office', 'office-core.js'), 'utf8').split('\n');
const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'ai-office', 'demo-script.json'), 'utf8'));

const find = (lines, needle, from = 0) => {
  const i = lines.findIndex((l, k) => k >= from && l.includes(needle));
  if (i < 0) throw new Error('办公室源码里找不到锚点：' + needle);
  return i;
};
const block = (lines, startNeedle, endNeedle, from = 0) => {
  const a = find(lines, startNeedle, from), b = find(lines, endNeedle, a);
  return lines.slice(a, b + 1);
};

// office.js：r()，站姿身体（阴影到左手），挥手的那条右臂，放下的右手，11 种配饰，老板的金发卡与侧发。
const rLine = office[find(office, 'const r = (g, color, x, y, w, h) =>')].trim();
const dp = find(office, 'function drawPerson(a, boss, hop)');
const body = block(office, "r(ctx, '#4c584e30', x - 8, a.y - 1, 17, 3);", "r(ctx, '#e4bb91', x - 8, y - hands - typing, 3, 3);", dp);
const arm = block(office, 'const hand = Math.round(-4 - 16 * pose.arm)', "r(ctx, '#e4bb91', x + 5 + swing, y + hand, 3, 3);", dp);
const restHand = office[find(office, "} else r(ctx, '#e4bb91', x + 5, y - hands + typing, 3, 3);", dp)];
const looks = block(office, "if (i === 0) { r(ctx, '#3e4b47'", "if (i === 10) {", dp);
const bossLine = office[find(office, "if (boss) { r(ctx, '#dcb159'", dp)];
const bossHead = bossLine.slice(0, bossLine.indexOf("10);") + 4) + ' }';
// 无忧、无虑：leisureUnder 里那个 kid=(x,y,shirt,girl)=>{...} 箭头函数。
const kidLine = office[find(office, 'kid=(x,y,shirt,girl)=>{')];
const kidSrc = kidLine.slice(kidLine.indexOf('kid=(x,y,shirt,girl)=>{')).replace(/;\s*$/, '');
const kidColors = office[find(office, "kid(Math.round(sx),Math.round(sy)+6,'#e8963a')")].includes("'#e8963a'") ? '#e8963a' : null;
const girlLine = office[find(office, "kid(54,62,'#9a6fc4',true)")];
const girlColor = /kid\(54,62,'(#[0-9a-f]{6})',true\)/i.exec(girlLine)[1];
// 合影背景用的盆栽 plant()，和合影时大家喊的那串词（hello.kind === 'pose'）。
const plantSrc = block(office, 'function plant(g, x, y, large = false) {', '  }', 0);
const poseLine = office[find(office, "hello?.kind === 'pose' ? [")];
const poseWords = /'pose' \? (\[[^\]]*\])/.exec(poseLine)[1];
// office-core.js：spring / springStep / springAt / hopAt / greetPose。
const springsEnd = find(core, '  }', find(core, "pop: Math.round(5 * (1 - springAt(420"));
const springSrc = core.slice(find(core, 'function spring(stiffness, ratio, reduced = false)'), springsEnd + 1);

// 老板的颜色写在 drawPerson 里：const color = boss ? '#c97859' : ...
const bossColor = /boss \? '(#[0-9a-f]{6})'/i.exec(office[find(office, "const color = boss ? '", dp)])[1];
const roster = demo.roster.map((a, k) => ({ id: a.id, name: a.name, color: a.color, look: a.look ?? (Number.isInteger(a.desk) ? a.desk : k), kind: 'adult' }));

const out = `/* 像素连连看的牌面小人。本文件由 tools/sync-figures.cjs 从 ../ai-office/office.js 与 office-core.js 原样抽出生成，
 * 不要手改：改了长相请改办公室源码再重跑脚本。tests/figures.test.cjs 会核对它和办公室源码一致。 */
(function (root) {
  'use strict';
  ${rLine}

  // ---- office-core.js：弹簧、跳一下（hopAt）、挥手（greetPose），原样 ----
${springSrc.join('\n')}

  // 名单：演示版办公室的 10 位同事（颜色与配饰编号取自 ai-office/demo-script.json，配饰编号 = look ?? 工位号），
  // 加老板（drawPerson 里 boss 的颜色）和两个小孩。
  const ROSTER = ${JSON.stringify(roster)};
  ROSTER.push({ id: 'boss', name: '老板', color: '${bossColor}', look: 11, kind: 'boss' });
  ROSTER.push({ id: 'wuyou', name: '无忧', color: '${kidColors}', look: -1, kind: 'kid', girl: false });
  ROSTER.push({ id: 'wulv', name: '无虑', color: '${girlColor}', look: -1, kind: 'kid', girl: true });

  // 合影背景的盆栽，原样。
${plantSrc.join('\n')}
  const POSE_WORDS = ${poseWords};

  // 大人：drawPerson 的站姿（不在工位、不走路、不打字）。opts.wave = 挥手的秒龄，opts.hop = 跳一下的秒龄，opts.t = 时钟。
  // 脚底在 (fx, fy)。
  function drawAdult(ctx, fig, fx, fy, opts = {}) {
    const boss = fig.kind === 'boss', moving = false, working = false, seated = false, t = opts.t || 0;
    const greets = opts.wave != null && opts.wave >= 0, pose = greets ? greetPose(opts.wave) : null, hello = greets ? { x: fx } : null;
    const hop = opts.hop != null ? hopAt(opts.hop) : null;
    const a = { x: fx, y: fy, i: 0, activity: null }, sim = { melon: null }, C = null;
    const color = fig.color;
    let x = Math.round(a.x), y = Math.round(a.y - (hop?.lift || 0) - (pose?.perk || 0));
    void sim; void C;
${body.join('\n')}
    if (greets) {
${arm.join('\n')}
${restHand}
    const i = boss ? 11 : fig.look;
${looks.join('\n')}
    ${bossHead.trim()}
  }

  // 小孩：leisureUnder 里的 kid()，原样；跳一下沿用 hopAt 的抬升。
  function drawKid(ctx, fig, fx, fy, opts = {}) {
    const hop = opts.hop != null ? hopAt(opts.hop) : null;
    const ${kidSrc};
    kid(Math.round(fx), Math.round(fy - (hop?.lift || 0)), fig.color, !!fig.girl);
  }

  function drawFigure(ctx, fig, fx, fy, opts) { return fig.kind === 'kid' ? drawKid(ctx, fig, fx, fy, opts) : drawAdult(ctx, fig, fx, fy, opts); }
  // 逻辑像素外框（相对脚底）：大人 x-8..x+14、y-28..y+2（含 Muse 的胶片、Dots 的天线），小孩 x-5..x+5、y-13..y+2。
  const BOX = { adult: { left: -8, right: 14, top: -28, bottom: 2 }, kid: { left: -5, right: 5, top: -13, bottom: 2 } };

  const api = { ROSTER, BOX, POSE_WORDS, plant, drawFigure, drawAdult, drawKid, hopAt, greetPose, springAt, HOP_SECONDS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PixelFigures = api;
})(typeof window !== 'undefined' ? window : globalThis);
`;

const target = path.join(__dirname, '..', 'src', 'figures.js');
if (process.argv.includes('--check')) {
  const same = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === out;
  console.log(same ? 'figures.js 与办公室源码一致' : 'figures.js 和办公室源码对不上，跑 node tools/sync-figures.cjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(target, out);
console.log('写入', path.relative(process.cwd(), target), out.length, '字节');
