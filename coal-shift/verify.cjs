'use strict';
// Dependency-free regression checks. Real browser play is recorded in README.md.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const source = html.match(/<script id="game-code">([\s\S]*?)<\/script>/)[1];
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML IDs must be unique');
assert(!/<(?:script|link|img|audio)[^>]+(?:src|href)=["']https?:/i.test(html), 'Game must work offline');
new vm.Script(source);

function environment(storageBlocked = false, stored = '0') {
  const elements = new Map();
  const draw = new Proxy({}, {get: (target, key) => target[key] || (() => {})});
  const listeners = {};
  for (const id of ids) elements.set(id, {
    textContent: '', hidden: false, disabled: false, attrs: {}, handlers: {},
    tagName: ['start', 'pause', 'sound', 'left', 'right'].includes(id) ? 'BUTTON' : 'CANVAS',
    addEventListener(name, fn) { this.handlers[name] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
    focus() {}, setPointerCapture() {}, getContext() { return draw; },
    getBoundingClientRect() { return {left: 20, width: 480}; },
    click() { if (!this.disabled) this.handlers.click?.({target: this}); }
  });
  const storage = new Map([['sooty-office-best-v1', stored]]);
  const context = vm.createContext({
    console,
    window: {matchMedia: () => ({matches: false}), addEventListener: (name, fn) => { listeners[name] = fn; }},
    document: {hidden: false, getElementById: id => elements.get(id), addEventListener: (name, fn) => { listeners[name] = fn; }},
    localStorage: {
      getItem(key) { if (storageBlocked) throw Error('storage blocked'); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error('storage blocked'); storage.set(key, value); }
    },
    performance: {now: () => 1000}, requestAnimationFrame() {},
    assert, listeners
  });
  vm.runInContext(source, context);
  return context;
}
const context = environment();
let passed = 0;
function check(name, code, target = context) {
  vm.runInContext(code, target);
  console.log('PASS ' + name);
  passed++;
}
check('ready screen and pixel render', "assert.equal(mode,'ready'); assert.equal($('timer').textContent,'01:00'); render();");
check('start resets a round', "start(); assert.equal(mode,'playing'); assert.equal(lives,3); assert.equal(score,0); assert.equal($('overlay').hidden,true);");
check('coffee is caught and scores once', "spawnIn=99; items=[{type:'coffee',x:480,y:425,speed:150}]; update(.05); assert.equal(score,10); assert.equal(caught,1); update(.05); assert.equal(score,10);");
check('fifth consecutive coffee doubles its score', "for(let i=0;i<4;i++){items=[{type:'coffee',x:player.x,y:440,speed:150}];update(.016);} assert.equal(combo,5);assert.equal(score,60);");
check('missed coffee breaks combo without damage', "items=[{type:'coffee',x:800,y:570,speed:150}];update(.016);assert.equal(combo,0);assert.equal(lives,3);");
check('dodged bug does not cost a heart', "items=[{type:'bug',x:player.x+60,y:455,speed:150}];update(.016);assert.equal(lives,3);");
check('bug collision and temporary damage protection', "items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);assert.equal(lives,2);items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);assert.equal(lives,2);assert.ok(player.invincible>0);");
check('pause freezes timer and positions', "keys.add('ArrowRight');pause();const frozen=elapsed;const x=player.x;update(.05);assert.equal(elapsed,frozen);assert.equal(player.x,x);assert.equal(keys.size,0);pause();assert.equal(mode,'playing');");
check('keyboard movement stays inside both walls', "items=[];keys.add('ArrowLeft');for(let i=0;i<100;i++)update(.05);assert.equal(player.x,35);keys.clear();keys.add('ArrowRight');for(let i=0;i<100;i++)update(.05);assert.equal(player.x,925);keys.clear();");
check('three separate hits end the round', "start();spawnIn=99;for(let i=0;i<3;i++){player.invincible=0;items=[{type:'bug',x:player.x,y:455,speed:150}];update(.016);}assert.equal(lives,0);assert.equal(mode,'over');assert.equal($('overlay').hidden,false);assert.equal($('pause').disabled,true);");
check('restart clears score, damage, objects, and timer', "start();assert.equal(lives,3);assert.equal(score,0);assert.equal(elapsed,0);assert.equal(items.length,0);assert.equal(player.invincible,0);assert.equal(mode,'playing');");
check('60 seconds ends with a win and saves record', "score=123;elapsed=59.98;spawnIn=99;update(.05);assert.equal(mode,'over');assert.equal($('timer').textContent,'00:00');assert.equal($('card-title').textContent,'准点下班！');assert.equal(localStorage.getItem('sooty-office-best-v1'),'123');");
check('scaled touch/mouse coordinates and pointer release', "start();assert.equal(pointerPosition({clientX:260}),480);canvas.handlers.pointerdown({pointerType:'touch',pointerId:8,clientX:420,preventDefault(){}});update(.05);assert.equal(player.x,510);canvas.handlers.pointercancel({pointerId:8});assert.equal(pointerTarget,null);");
check('touch direction button releases cleanly', "$('left').handlers.pointerdown({pointerId:7,preventDefault(){}});update(.05);assert.ok(player.x<510);$('left').handlers.pointerup();assert.equal(keys.size,0);");
check('window blur and hidden tab automatically pause', "listeners.blur();assert.equal(mode,'paused');pause();document.hidden=true;listeners.visibilitychange();assert.equal(mode,'paused');document.hidden=false;");
check('Space, Enter, and R use the real input handlers', "listeners.keydown({code:'Space',target:canvas,preventDefault(){}});assert.equal(mode,'playing');listeners.keydown({code:'KeyR',target:canvas,preventDefault(){}});assert.equal(elapsed,0);listeners.keydown({code:'KeyP',target:canvas,preventDefault(){}});assert.equal(mode,'paused');listeners.keydown({code:'Enter',target:$('start'),preventDefault(){}});assert.equal(mode,'playing');");
check('missing audio API degrades without breaking game', "toggleSound();assert.equal(soundOn,false);assert.equal(mode,'playing');");
check('blocked storage still allows complete rounds', "start();score=30;finish(true);assert.equal(mode,'over');assert.equal(best,30);render();", environment(true));
check('invalid saved best is ignored', "assert.equal(best,0);start();render();", environment(false, 'not a score'));
check('full 60-second simulation and rendering', "start();for(let i=0;i<3700&&mode==='playing';i++){player.x=35;update(1/60);render();}assert.equal(mode,'over');assert.ok(elapsed<=60);assert.ok(lives>=0);assert.ok(items.length<30);");
console.log(`\n${passed} checks passed; inline JavaScript syntax and offline resources verified.`);
