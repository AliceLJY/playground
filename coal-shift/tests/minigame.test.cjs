'use strict';
// 微信小游戏版（minigame/game.js）的回归检查：照原版 verify.cjs 的 20 项改写，输入换成微信触控。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'minigame');
const source = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');

function environment({storageBlocked = false, stored = '0', screen = {w: 844, h: 390, safe: {left: 47, top: 0, right: 797, bottom: 369}}, audio = false, shareApi = false, menu = false, scene = 1001, extraStorage = {}} = {}) {
  const handlers = {};
  const storage = new Map([['sooty-office-best-v1', stored], ...Object.entries(extraStorage)]);
  const shared = [];
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
  if (shareApi) Object.assign(wx, {
    showShareMenu: o => { shared.push({menu: o}); }, onShareAppMessage: fn => { handlers.shareMsg = fn; }, onShareTimeline: fn => { handlers.shareTimeline = fn; },
    shareAppMessage: o => { shared.push(o); },
  });
  // 横屏胶囊：贴右上角，宽 87 高 32，离安全区顶 7。
  if (menu) wx.getMenuButtonBoundingClientRect = () => ({left: screen.w - 94, right: screen.w - 7, top: screen.safe.top + 7, bottom: screen.safe.top + 39, width: 87, height: 32});
  wx.getLaunchOptionsSync = () => ({scene}); wx.onShow = fn => { handlers.show = fn; };
  if (audio) wx.createWebAudioContext = () => ({state: 'running', currentTime: 0, destination: {}, createOscillator: () => ({frequency: {}, connect() {}, start() {}, stop() {}}), createGain: () => ({gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}})});
  const context = vm.createContext({console, wx, requestAnimationFrame() {}, Date, Math, assert, handlers, storage, shared});
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
  function tapShare(){ const b=SHARE_BUTTON, t=tp(98, b.x+b.w/2, b.y+b.h/2); down(t); up(t); }
  function lose(){ start(); spawnIn=99; for(let i=0;i<3;i++){ player.invincible=0; items=[{type:'bug',x:player.x,y:455,speed:150}]; update(.016); } assert.equal(mode,'over'); }
  function win(n){ start(); spawnIn=99; caught=n; elapsed=59.98; update(.05); assert.equal(mode,'over'); }
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

test('小游戏版：开始卡片和游玩画面都写着游戏名「煤球下班」（备案截图要求截图内能看到小游戏名）', () => {
  assert.match(source, /label\('煤球下班'/, '游玩画面左下角缺游戏名');
  const c = environment();
  run(c, "assert.equal(card.title, '煤球下班', '开始卡片大标题必须就是游戏名（11-21 备案曾因大标题写「小煤球，开工啦！」被判名称不一致）');");
});

const SCREENS = [
  {w: 844, h: 390, safe: {left: 47, top: 0, right: 797, bottom: 369}},
  {w: 667, h: 375, safe: {left: 0, top: 0, right: 667, bottom: 375}},
  {w: 915, h: 412, safe: {left: 0, top: 24, right: 915, bottom: 412}},
  {w: 1024, h: 768, safe: {left: 0, top: 0, right: 1024, bottom: 768}},
];

test('分享：右上角转发与朋友圈都打开，标题讲战绩、全中文、不许诺奖励', () => {
  const c = environment({shareApi: true});
  run(c, `
    assert.deepEqual([...shared[0].menu.menus].sort(), ['shareAppMessage','shareTimeline']);
    const t0 = handlers.shareMsg().title; assert.match(t0, /煤球下班/);
    win(17); assert.equal(handlers.shareMsg().title, '我接住 17 杯咖啡准点下班了，你能撑到 18:00 吗？');
    assert.equal(handlers.shareTimeline().title, handlers.shareMsg().title);
    lose(); assert.match(handlers.shareMsg().title, /没撑到下班/);
    for (const t of [t0, handlers.shareMsg().title]) { assert.doesNotMatch(t, /[A-Za-z]/, '审核打回过画面英文，分享标题也只用中文'); assert.doesNotMatch(t, /奖励|领取|复活|道具|红包/, '分享不许诺奖励（诱导分享）'); }
  `);
});

test('分享：结算卡上「分享战绩」发出主动分享，「再来一局」照常开局；开始卡和暂停卡没有分享键', () => {
  const c = environment({shareApi: true});
  run(c, `
    assert.equal(card.share, false); assert.equal(CARD_BUTTON.x, 320);
    tapCard(); pause(); assert.equal(card.share, false); tapCard(); assert.equal(mode, 'playing');
    win(5); assert.equal(card.share, true); render();
    const before = shared.length; tapShare(); assert.equal(shared.length, before + 1); assert.match(shared.at(-1).title, /接住 5 杯/); assert.equal(mode, 'over');
    const b=SHARE_BUTTON; down(tp(97, b.x+10, b.y+10)); up(tp(97, b.x+10, b.y+200)); assert.equal(shared.length, before + 1, '按下后滑出不触发');
    tapCard(); assert.equal(mode, 'playing'); assert.equal(card, null);
  `);
});

test('分享：没有分享接口的环境不画分享键，主按钮回到居中', () => {
  const c = environment();
  run(c, "win(3); assert.equal(card.share, false); assert.equal(CARD_BUTTON.x, 320); assert.equal(CARD_BUTTON.w, 320); render(); tapCard(); assert.equal(mode,'playing');");
});

test('添加到我的小程序：结束一局后出一次气泡，点了收起，开局也收起；每次启动最多一次、累计最多三次', () => {
  const c = environment({menu: true});
  run(c, `
    assert.equal(addTip, null, '开局前不打扰');
    tapCard(); assert.equal(addTip, null);
    lose(); assert.ok(addTip, '结束一局后出现'); render();
    assert.equal(storage.get('sooty-office-addtip-v1'), '1');
    const t = raw(50, addTip.x + addTip.w / 2, addTip.y + addTip.h / 2); down(t); up(t); assert.equal(addTip, null); assert.equal(mode, 'over', '点气泡只收起，不开局');
    tapCard(); lose(); assert.equal(addTip, null, '同一次启动不再出');
  `);
  const c2 = environment({menu: true, extraStorage: {'sooty-office-addtip-v1': '1'}});
  run(c2, "lose(); assert.ok(addTip); tapCard(); assert.equal(addTip, null, '开局就收起，不挡右侧方向键'); assert.equal(storage.get('sooty-office-addtip-v1'), '2');");
  run(environment({menu: true, extraStorage: {'sooty-office-addtip-v1': '3'}}), "lose(); assert.equal(addTip, null, '累计三次后不再出');");
});

test('添加到我的小程序：从「我的小程序」进来就记为已添加，永不再出；拿不到胶囊位置就不出', () => {
  const c = environment({menu: true, scene: 1104});
  run(c, "assert.equal(storage.get('sooty-office-added-v1'), 'yes'); lose(); assert.equal(addTip, null);");
  run(environment({menu: true, extraStorage: {'sooty-office-added-v1': 'yes'}}), "lose(); assert.equal(addTip, null);");
  const hot = environment({menu: true});
  run(hot, "lose(); assert.ok(addTip); handlers.show({scene: 1103}); assert.equal(addTip, null); assert.equal(storage.get('sooty-office-added-v1'), 'yes');");
  run(environment(), "lose(); assert.equal(addTip, null); render();");
});

test('结算卡两颗按钮与引导气泡：各屏都在屏幕内，彼此及读数栏按钮不重叠，触控区够大', () => {
  for (const screen of SCREENS) {
    const c = environment({screen, shareApi: true, menu: true});
    run(c, `
      lose();
      const S = b => ({x: stageLeft + b.x*scale, y: stageTop + b.y*scale, w: b.w*scale, h: b.h*scale});
      const pad = (b, n) => ({x: b.x-n, y: b.y-n, w: b.w+2*n, h: b.h+2*n});
      const apart = (a, b) => a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y;
      assert.ok(apart(pad(CARD_BUTTON, 18), pad(SHARE_BUTTON, 8)), '两颗结算按钮的触控区重叠');
      assert.ok(SHARE_BUTTON.x + SHARE_BUTTON.w <= CARD.x + CARD.w && CARD_BUTTON.x >= CARD.x, '按钮出了卡片');
      assert.ok(SHARE_BUTTON.h*scale >= 40 && SHARE_BUTTON.w*scale >= 40, '分享键太小');
      const t = addTip; assert.ok(t, '${screen.w}x${screen.h} 没出气泡');
      assert.ok(t.x >= 0 && t.x + t.w <= ${screen.w} && t.y >= 0 && t.y + t.h <= ${screen.h}, '气泡出屏');
      assert.ok(t.arrowX > t.x && t.arrowX < t.x + t.w, '箭头不在气泡上');
      assert.ok(apart(t, S(CARD)), '气泡压住结算卡 ${screen.w}x${screen.h}');
      const r = wx.getMenuButtonBoundingClientRect(), m = {x: r.left, y: r.top, w: r.width, h: r.height};
      for (const b of [HUD.sound, HUD.pause]) { assert.ok(apart(b, m), '读数栏按钮被胶囊盖住（胶囊会吃点击）${screen.w}x${screen.h}'); assert.ok(b.x >= stageLeft - 0.01, '读数栏按钮挤出了读数栏'); }
      assert.ok(HUD.sound.x - 84 > stageLeft + stageW / 2 + 40, '三颗心挤到了倒计时上');
      for (const b of [HUD.sound, HUD.pause, S(CARD_BUTTON), S(SHARE_BUTTON)]) assert.ok(apart(pad(t, 4), b), '气泡挡住了按钮 ${screen.w}x${screen.h}');
    `);
  }
});
