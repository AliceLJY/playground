/* 像素连连看的牌面小人。本文件由 tools/sync-figures.cjs 从 ../ai-office/office.js 与 office-core.js 原样抽出生成，
 * 不要手改：改了长相请改办公室源码再重跑脚本。tests/figures.test.cjs 会核对它和办公室源码一致。 */
(function (root) {
  'use strict';
  const r = (g, color, x, y, w, h) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };

  // ---- office-core.js：弹簧、跳一下（hopAt）、挥手（greetPose），原样 ----
  function spring(stiffness, ratio, reduced = false) { return { k: stiffness, c: Math.max(ratio, reduced ? 1 : 0) * 2 * Math.sqrt(stiffness), x: 0, v: 0, target: 0 }; }
  function springStep(s, dt) {
    const h = 1 / 240;
    let left = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 3) : 0;
    while (left > 1e-9) {
      const step = Math.min(h, left);
      s.v += (-s.k * (s.x - s.target) - s.c * s.v) * step;
      s.x += s.v * step;
      left -= step;
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = Number.isFinite(s.target) ? s.target : 0; s.v = 0; }
    return s;
  }
  function springAt(stiffness, ratio, age, { from = 0, to = 1, v = 0 } = {}, reduced = false) {
    const s = spring(stiffness, ratio, reduced); s.x = from; s.target = to; s.v = v;
    return springStep(s, age).x;
  }
  // Done: a crouch, four hops that get lower, a squash on every landing that springs back. squash > 0 is that many
  // logical rows shorter (and a little wider), < 0 stretched; whole pixels only, so the art never smears.
  const HOPS = [[.12, .42, 6], [.52, .82, 6], [.92, 1.22, 5], [1.32, 1.62, 4]], HOP_SECONDS = 2;
  function hopAt(age, reduced = false) {
    if (!(age >= 0) || age >= HOP_SECONDS) return { lift: 0, squash: 0, widen: 0 };
    let lift = 0;
    for (const [start, end, height] of HOPS) if (age >= start && age < end) { const p = (age - start) / (end - start); lift = Math.round(height * 4 * p * (1 - p)); }
    if (reduced) return { lift, squash: 0, widen: 0 };
    const s = spring(600, .35); s.target = 2;
    let t = 0;
    const until = at => { const to = Math.min(at, age); springStep(s, to - t); t = to; return t < age; };
    for (let i = 0; i < HOPS.length; i++) {
      const [start, end, height] = HOPS[i];
      if (!until(start)) break;
      s.target = 0; s.v -= 35; // take off: a stretch
      if (!until(end)) break;
      s.v += height * 10; s.target = i < HOPS.length - 1 ? 1.5 : 0; // land: a squash
    }
    until(age);
    const squash = Math.max(-2, Math.min(3, Math.round(s.x))) + 0; // + 0: no -0
    return { lift, squash, widen: Math.max(-1, Math.min(2, Math.round(squash * .6))) + 0 };
  }
  // Called by a visitor, a treat or a photo: perk up a step, the waving arm springs past the top and settles,
  // the word pops up from the head. arm 0 is down, 1 up.
  function greetPose(age, reduced = false) {
    if (!(age >= 0)) return { arm: 1, perk: 0, pop: 0 };
    const t = Math.min(age, 1.5);
    return { arm: springAt(260, .48, t, {}, reduced), perk: Math.round(springAt(300, .4, t, { to: 0, v: 70 }, reduced)) + 0, pop: Math.round(5 * (1 - springAt(420, .5, t, {}, reduced))) + 0 };
  }

  // 名单：演示版办公室的 10 位同事（颜色与配饰编号取自 ai-office/demo-script.json，配饰编号 = look ?? 工位号），
  // 加老板（drawPerson 里 boss 的颜色）和两个小孩。
  const ROSTER = [{"id":"director","name":"CC","color":"#D18A65","look":0,"kind":"adult"},{"id":"builder","name":"Codex","color":"#6D9D8E","look":1,"kind":"adult"},{"id":"twin-a","name":"Kimi","color":"#7F91BC","look":2,"kind":"adult"},{"id":"artist","name":"Agy","color":"#8DA66F","look":4,"kind":"adult"},{"id":"companion","name":"etwin-cc","color":"#D69A9E","look":5,"kind":"adult"},{"id":"scout","name":"Grok Bot","color":"#6F8585","look":6,"kind":"adult"},{"id":"filmmaker","name":"Muse","color":"#B397B8","look":7,"kind":"adult"},{"id":"writer","name":"豆包","color":"#C6A160","look":8,"kind":"adult"},{"id":"helper","name":"Dots","color":"#9FA866","look":9,"kind":"adult"},{"id":"courier","name":"Cobbler","color":"#BD8955","look":10,"kind":"adult"}];
  ROSTER.push({ id: 'boss', name: '老板', color: '#c97859', look: 11, kind: 'boss' });
  ROSTER.push({ id: 'wuyou', name: '无忧', color: '#e8963a', look: -1, kind: 'kid', girl: false });
  ROSTER.push({ id: 'wulv', name: '无虑', color: '#9a6fc4', look: -1, kind: 'kid', girl: true });

  // 合影背景的盆栽，原样。
  function plant(g, x, y, large = false) {
    r(g, '#6f5946', x - 5, y, 11, 11); r(g, '#c79061', x - 6, y, 13, 4); r(g, '#bd885b', x - 3, y + 4, 7, 6);
    r(g, '#52745e', x - 1, y - 16, 3, 17); r(g, '#608568', x - 8, y - 14, 9, 6); r(g, '#86a376', x - 6, y - 17, 7, 4); r(g, '#446951', x + 2, y - 10, 8, 6); r(g, '#9aaf80', x + 3, y - 13, 7, 4);
    if (large) { r(g, '#6d9172', x - 9, y - 27, 9, 7); r(g, '#5b7e63', x + 1, y - 23, 9, 7); r(g, '#6f9273', x - 1, y - 23, 3, 9); }
  }
  const POSE_WORDS = ['茄子', '耶', '✌', '茄子', '笑一个', '耶', '看这里', '茄子', '比心', '耶', '茄子'];

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
    r(ctx, '#4c584e30', x - 8, a.y - 1, 17, 3);
    if (!boss && !moving && (working || seated)) {
      r(ctx, '#657a67', x - 8, y - 12, 16, 13); r(ctx, '#8ba087', x - 7, y - 12, 14, 3);
      r(ctx, '#4a5e50', x - 7, y + 1, 3, 4); r(ctx, '#4a5e50', x + 4, y + 1, 3, 4);
    }
    r(ctx, '#33443f', x - 6, y - 18, 12, 15); r(ctx, color, x - 5, y - 10, 10, 8);
    r(ctx, '#e3b58d', x - 5, y - 16, 10, 7); r(ctx, '#4b4639', x - 6, y - 21, 12, 6); r(ctx, '#544c3a', x - 6, y - 16, 2, 5);
    const look = a.activity==='melon' && sim.melon ? Math.sign(sim.melon.source.x-a.x) : greets ? Math.sign((hello ? hello.x : C.pantry.x) - a.x) : 0;
    r(ctx, '#273a34', x - 3 + look, y - 13, 2, 2); r(ctx, '#273a34', x + 2 + look, y - 13, 2, 2);
    const leg = moving ? Math.sin(t * 11) > 0 ? 2 : -2 : 0;
    r(ctx, '#34483e', x - 5, y - 2, 4, 3 + leg); r(ctx, '#34483e', x + 2, y - 2, 4, 3 - leg);
    const typing = !boss && working && !moving ? Math.sin(t * 15 + a.i) > 0 ? 2 : -1 : 0;
    r(ctx, color, x - 8, y - 10, 3, 6); r(ctx, color, x + 5, y - 10, 3, 6);
    const hands = !boss && working && !moving ? 14 : 4;
    r(ctx, '#e4bb91', x - 8, y - hands - typing, 3, 3);
    if (greets) {
      const hand = Math.round(-4 - 16 * pose.arm), swing = hand > -17 ? 0 : Math.sin(t * 9) > 0 ? 2 : -1;
      if (hand < -10) { r(ctx, '#33443f', x + 5, y - 10, 3, 6); r(ctx, color, x + 5, y + hand + 3, 3, -13 - hand); }
      r(ctx, '#e4bb91', x + 5 + swing, y + hand, 3, 3);
    } else r(ctx, '#e4bb91', x + 5, y - hands + typing, 3, 3);
    const i = boss ? 11 : fig.look;
    if (i === 0) { r(ctx, '#3e4b47', x - 5, y - 14, 10, 1); r(ctx, '#3e4b47', x - 5, y - 14, 4, 4); r(ctx, '#b7d0b4', x - 4, y - 13, 2, 1); }
    if (i === 1) { r(ctx, color, x - 7, y - 19, 14, 2); r(ctx, '#697d74', x - 8, y - 16, 3, 6); r(ctx, '#697d74', x + 6, y - 16, 3, 6); }
    if (i === 2 || i === 3) { r(ctx, color, x + 2, y - 21, 4, 4); if (i === 3) r(ctx, '#eadfbe', x - 3, y - 20, 3, 3); }
    if (i === 4) { r(ctx, color, x - 7, y - 23, 14, 4); r(ctx, color, x - 3, y - 25, 7, 2); }
    if (i === 5) { r(ctx, '#e7c8c0', x - 8, y - 20, 5, 4); r(ctx, '#d89ca2', x - 3, y - 19, 3, 2); }
    if (i === 6) { r(ctx, '#314f4b', x - 6, y - 15, 12, 3); r(ctx, '#b3d2a9', x - 4, y - 15, 5, 1); }
    if (i === 7) { r(ctx, '#3f5351', x + 7, y - 8, 7, 9); r(ctx, '#e3dbc1', x + 8, y - 7, 2, 2); r(ctx, '#e3dbc1', x + 11, y - 3, 2, 2); }
    if (i === 8) { r(ctx, '#ebd7a7', x - 5, y - 10, 10, 2); r(ctx, '#ebd7a7', x + 3, y - 9, 3, 6); }
    if (i === 9) { r(ctx, '#66715d', x, y - 26, 1, 5); r(ctx, color, x - 1, y - 28, 3, 3); }
    if (i === 10) { r(ctx, color, x - 6, y - 23, 12, 5); r(ctx, '#eddca8', x - 8, y - 19, 16, 2); r(ctx, '#e6d2a7', x + 6, y - 5, 7, 5); }
    if (boss) { r(ctx, '#dcb159', x + 2, y - 22, 4, 3); r(ctx, '#5a4839', x - 7, y - 18, 3, 10); }
  }

  // 小孩：leisureUnder 里的 kid()，原样；跳一下沿用 hopAt 的抬升。
  function drawKid(ctx, fig, fx, fy, opts = {}) {
    const hop = opts.hop != null ? hopAt(opts.hop) : null;
    const kid=(x,y,shirt,girl)=>{ r(ctx,'#4c4d4030',x-4,y,8,2); r(ctx,shirt,x-3,y-7,6,6); r(ctx,'#e4bb91',x-3,y-12,6,5); r(ctx,'#4b4639',x-3,y-13,6,2); if(girl){ r(ctx,'#4b4639',x-5,y-12,2,4); r(ctx,'#4b4639',x+3,y-12,2,4); r(ctx,'#e58fb0',x-5,y-13,2,1); r(ctx,'#e58fb0',x+3,y-13,2,1); } r(ctx,'#2f3a3c',x-2,y-1,2,2); r(ctx,'#2f3a3c',x+1,y-1,2,2); };
    kid(Math.round(fx), Math.round(fy - (hop?.lift || 0)), fig.color, !!fig.girl);
  }

  function drawFigure(ctx, fig, fx, fy, opts) { return fig.kind === 'kid' ? drawKid(ctx, fig, fx, fy, opts) : drawAdult(ctx, fig, fx, fy, opts); }
  // 逻辑像素外框（相对脚底）：大人 x-8..x+14、y-28..y+2（含 Muse 的胶片、Dots 的天线），小孩 x-5..x+5、y-13..y+2。
  const BOX = { adult: { left: -8, right: 14, top: -28, bottom: 2 }, kid: { left: -5, right: 5, top: -13, bottom: 2 } };

  const api = { ROSTER, BOX, POSE_WORDS, plant, drawFigure, drawAdult, drawKid, hopAt, greetPose, springAt, HOP_SECONDS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PixelFigures = api;
})(typeof window !== 'undefined' ? window : globalThis);
