'use strict';
// 微信小游戏版（minigame/game.js）的回归检查：照原版 verify.cjs 的 20 项改写，输入换成微信触控。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'minigame');
const source = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');

function environment({storageBlocked = false, stored = '0', screen = {w: 844, h: 390, safe: {left: 47, top: 0, right: 797, bottom: 369}}, audio = false} = {}) {
  const handlers = {};
  const storage = new Map([['sooty-office-best-v1', stored]]);
  const draw = new Proxy({}, {get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; }});
  const safe = {...screen.safe, width: screen.safe.right - screen.safe.left, height: screen.safe.bottom - screen.safe.top};
  const wx = {
    getWindowInfo: () => ({windowWidth: screen.w, windowHeight: screen.h, pixelRatio: 3, safeArea: safe}),
    createCanvas: () => ({width: 0, height: 0, getContext: () => draw}),
    getStorageSync(key) { if (storageBlocked) throw Error('storage blocked'); return storage.has(key) ? storage.get(key) : ''; },
    setStorageSync(key, value) { if (storageBlocked) throw Error('storage blocked'); storage.set(key, value); },
    onTouchStart: fn => { handlers.start = fn; }, onTouchMove: fn => { handlers.move = fn; },
    onTouchEnd: fn => { handlers.end = fn; }, onTouchCancel: fn => { handlers.cancel = fn; },
    onHide: fn => { handlers.hide = fn; }, vibrateShort() {},
  };
  if (audio) wx.createWebAudioContext = () => ({state: 'running', currentTime: 0, destination: {}, createOscillator: () => ({frequency: {}, connect() {}, start() {}, stop() {}}), createGain: () => ({gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}})});
  const context = vm.createContext({console, wx, requestAnimationFrame() {}, Date, Math, assert, handlers, storage});
  vm.runInContext(source, context);
  return context;
}
// 把舞台坐标换成屏幕触点，走真正的触控入口。
const touchHelpers = `
  function tp(id, sx, sy){ return {identifier:id, clientX: stageLeft + sx*scale, clientY: stageTop + sy*scale}; }
  function raw(id, x, y){ return {identifier:id, clientX:x, clientY:y}; }
  function down(t){ handlers.start({changedTouches:[t]}); }
  function move(t){ handlers.move({changedTouches:[t]}); }
  function up(t){ handlers.end({changedTouches:[t]}); }
  function tapCard(){ const b=CARD_BUTTON, t=tp(99, b.x+b.w/2, b.y+b.h/2); down(t); up(t); }
`;
const run = (ctx, code) => vm.runInContext(touchHelpers + code, ctx);

test('小游戏版：原版 20 项玩法检查（输入改为触控）', () => {
  const c = environment();
  run(c, "assert.equal(mode,'ready'); assert.equal(timerText(),'01:00'); assert.ok(card); render();");
  run(c, "tapCard(); assert.equal(mode,'playing'); assert.equal(lives,3); assert.equal(score,0); assert.equal(card,null);");
  run(c, "spawnIn=99; items=[{type:'coffee',x:480,y:425,speed:150}]; update(.05); assert.equal(score,10); assert.equal(caught,1); update(.05); assert.equal(score,10);");
  run(c, "for(let i=0;i<4;i++){items=[{type:'coffee',x:player.x,y:440,speed:150}];update(.016);} assert.equal(combo,5); assert.equal(score,60);");
  run(c, "items=[{type:'coffee',x:800,y:570,speed:150}];update(.016);assert.equal(combo,0);assert.equal(lives,3);");
  run(c, "items=[{type:'bug',x:player.x+60,y:455,speed:150}];update(.016);assert.equal(lives,3);");
  run(c, "items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);assert.equal(lives,2);items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);assert.equal(lives,2);assert.ok(player.invincible>0);");
  run(c, "keys.add('R');pause();const frozen=elapsed;const x=player.x;update(.05);assert.equal(elapsed,frozen);assert.equal(player.x,x);assert.equal(keys.size,0);tapCard();assert.equal(mode,'playing');");
  run(c, "items=[];keys.add('L');for(let i=0;i<100;i++)update(.05);assert.equal(player.x,35);keys.clear();keys.add('R');for(let i=0;i<100;i++)update(.05);assert.equal(player.x,925);keys.clear();");
  run(c, "start();spawnIn=99;for(let i=0;i<3;i++){player.invincible=0;items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);}assert.equal(lives,0);assert.equal(mode,'over');assert.ok(card);assert.equal(card.title,'小煤球需要充电');");
  run(c, "tapCard();assert.equal(lives,3);assert.equal(score,0);assert.equal(elapsed,0);assert.equal(items.length,0);assert.equal(player.invincible,0);assert.equal(mode,'playing');");
  run(c, "score=123;elapsed=59.98;spawnIn=99;update(.05);assert.equal(mode,'over');assert.equal(timerText(),'00:00');assert.equal(card.title,'准点下班！');assert.equal(storage.get('sooty-office-best-v1'),'123');");
  run(c, "start();spawnIn=99;down(tp(8,510,300));update(.05);assert.equal(player.x,510);move(tp(8,400,300));update(.5);assert.ok(Math.abs(player.x-400)<1e-6);handlers.cancel({changedTouches:[tp(8,400,300)]});assert.equal(pointerTarget,null);");
  run(c, "const L=raw(7,20,stageTop+stageH/2);down(L);assert.ok(keys.has('L'));update(.05);assert.ok(player.x<400);up(L);assert.equal(keys.size,0);const R=raw(6,830,stageTop+stageH/2);down(R);assert.ok(keys.has('R'));up(R);assert.equal(keys.size,0);");
  run(c, "handlers.hide();assert.equal(mode,'paused');tapCard();assert.equal(mode,'playing');");
  run(c, "const p=raw(5,HUD.pause.x+22,HUD.pause.y+19);down(p);up(p);assert.equal(mode,'paused');tapCard();assert.equal(mode,'playing');");
  run(c, "const s=raw(4,HUD.sound.x+22,HUD.sound.y+19);down(s);up(s);assert.equal(soundOn,false);assert.equal(mode,'playing');");
  run(environment({storageBlocked: true}), "start();score=30;finish(true);assert.equal(mode,'over');assert.equal(best,30);render();");
  run(environment({stored: 'not a score'}), "assert.equal(best,0);start();render();");
  run(c, "start();for(let i=0;i<3700&&mode==='playing';i++){player.x=35;update(1/60);render();}assert.equal(mode,'over');assert.ok(elapsed<=60);assert.ok(lives>=0);assert.ok(items.length<30);");
});

test('小游戏版：声音可开关并记住，开着时不影响游玩', () => {
  const c = environment({audio: true});
  run(c, "const s=raw(4,HUD.sound.x+22,HUD.sound.y+19);down(s);up(s);assert.equal(soundOn,true);assert.equal(storage.get('sooty-office-sound-v1'),'on');tapCard();items=[{type:'coffee',x:player.x,y:455,speed:150}];update(.016);assert.equal(score,10);");
});

test('小游戏版：卡片按钮在按下后滑出不触发，防误开局', () => {
  const c = environment();
  run(c, "const b=CARD_BUTTON;down(tp(3,b.x+10,b.y+10));up(tp(3,b.x+10,b.y+200));assert.equal(mode,'ready');");
});

test('小游戏版：不同屏幕比例下舞台与按钮都在屏幕内、互不重叠', () => {
  const screens = [
    {w: 844, h: 390, safe: {left: 47, top: 0, right: 797, bottom: 369}},   // 刘海屏横放
    {w: 667, h: 375, safe: {left: 0, top: 0, right: 667, bottom: 375}},    // 16:9 老机型
    {w: 915, h: 412, safe: {left: 0, top: 24, right: 915, bottom: 412}},   // 安卓长屏
    {w: 1024, h: 768, safe: {left: 0, top: 0, right: 1024, bottom: 768}},  // 平板 4:3
  ];
  for (const screen of screens) {
    const c = environment({screen});
    run(c, `
      assert.ok(stageLeft>=0 && stageTop>=0 && stageLeft+stageW<=${screen.w}+0.01 && stageTop+stageH<=${screen.h}+0.01, 'stage off screen ${screen.w}x${screen.h}');
      assert.ok(stageTop>=${screen.safe.top}-0.01 && stageTop+stageH+3<=${screen.safe.bottom}, 'stage (with its 3px frame) outside safe area');
      assert.ok(stageLeft-3>=${screen.safe.left} && stageLeft+stageW+3<=${screen.safe.right}, 'stage frame touches the safe-area edge');
      if (sideButtons) for (const s of ['L','R']) { const b=buttonBox(s); assert.ok(b.w>=36, 'side button too narrow'); assert.ok(b.x>=0 && b.x+b.w<=${screen.w}, 'button off screen'); assert.ok(b.x+b.w<=stageLeft || b.x>=stageLeft+stageW, 'button overlaps stage'); }
      for (const b of [HUD.sound, HUD.pause]) { assert.ok(b.w>=40 && b.h>=36, 'HUD button touch area too small'); assert.ok(b.y>=${screen.safe.top}-0.01 && b.y+b.h<=stageTop, 'HUD button overlaps stage'); assert.ok(b.x>=stageLeft-0.01 && b.x+b.w<=stageLeft+stageW+0.01, 'HUD button outside bar'); }
      assert.ok(HUD.sound.x+HUD.sound.w<=HUD.pause.x, 'HUD buttons overlap');
      assert.ok(barY>=${screen.safe.top}-0.01 && barY+BAR<=stageTop+0.01, 'HUD bar must sit above the stage so falling items are never covered');
      assert.ok(CARD_BUTTON.h*scale>=40, 'card button too small');
    `);
  }
});

test('小游戏版：只用微信接口，不碰网页对象，不引用外部资源', () => {
  assert.doesNotMatch(source, /\b(document|window|localStorage|performance)\./, '出现了网页专属对象');
  assert.doesNotMatch(source, /https?:\/\//, '出现了外部地址');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.config.json'), 'utf8'));
  assert.equal(cfg.compileType, 'game');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')).deviceOrientation, 'landscape');
});

test('小游戏版：玩法数值与网页版一致', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const fragment of ['W = 960', 'ROUND = 60', 'PLAYER_Y = 461', '410 * dt', '600 * dt', 'Math.max(.34, .79 - elapsed * .006)', '1.65', "(type === 'coffee' ? 126 : 142) + elapsed * 1.55 + Math.random() * 23", "Math.random() > .38"]) {
    const compact = s => s.replace(/\s+/g, '');
    assert.ok(compact(source).includes(compact(fragment)), `小游戏版缺少数值 ${fragment}`);
    assert.ok(compact(html).includes(compact(fragment)), `网页版缺少数值 ${fragment}（检查本身过期了）`);
  }
});
