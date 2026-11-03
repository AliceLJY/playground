// NODE_PATH="$(npm root -g)" node tools/hunt-check.cjs <out-dir> <base-url>
// Real DOM inputs only; no state-setting hooks. Run browsers serially with the existing checks.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[2], base = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const checks = [], shots = [], environments = [];
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail });
  console.log(pass ? 'ok' : 'FAIL', name);
  if (!pass) throw new Error(name + ': ' + JSON.stringify(detail));
}
const waitOpen = (p) => p.waitForFunction(() => !window.__xiguan.busy && window.__xiguan.s === 3.4, null, { polling: 50 });
const waitClosed = (p) => p.waitForFunction(() => !window.__xiguan.busy && window.__xiguan.s === 0, null, { polling: 50 });
async function shot(p, tag) {
  await p.screenshot({ path: path.join(out, tag + '.png') });
  shots.push({ name: tag, state: await p.evaluate(() => ({ s: __xiguan.s, hunt: __xiguan.hunt, busy: __xiguan.busy })) });
}
async function controlsFit(p) {
  return p.locator('#hunt-dialog button').evaluateAll((bs) => {
    const rr = bs.map((b) => { const r = b.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height, right:r.right, bottom:r.bottom, hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }; });
    return { rects:rr, pass:rr.every((r,i) => r.w>=44 && r.h>=44 && r.x>=0 && r.y>=0 && r.right<=innerWidth && r.bottom<=innerHeight && r.hit && rr.slice(i+1).every(q => r.right<=q.x || q.right<=r.x || r.bottom<=q.y || q.bottom<=r.y)) };
  });
}
async function highlightedPixels(p) {
  return p.evaluate(() => {
    const c = document.querySelector('#hunt-canvas'), d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let n = 0;
    for (let i=0;i<d.length;i+=4) if(d[i]>130 && d[i]<180 && d[i+1]<90 && d[i+2]<70) n++;
    return n;
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [width, height] of [[390,664],[320,568],[844,340],[1365,900]]) {
      const errors = [];
      const context = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:1, hasTouch:width<900,
        ...(width===390 ? { recordVideo:{dir:path.join(out,'video'),size:{width,height}} } : {}) });
      const p = await context.newPage();
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
      await p.goto(base); await p.waitForFunction(() => window.__xiguan?.ready, null, { polling:50 });
      const started = Date.now(); // Record at least 30 seconds after the page is ready, excluding startup.
      environments.push(await p.evaluate(() => ({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,canvas:'2d',reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})));
      await shot(p, `${width}-default`);
      const activate = async (selector, keyboard = false) => {
        if (keyboard || width>=900) { await p.locator(selector).focus(); await p.keyboard.press('Enter'); }
        else await p.locator(selector).tap();
      };
      await activate('#hunt-start');
      const fit = await controlsFit(p); check(`${width}: all targets fit and have 44px hit areas`, fit.pass, fit.rects);
      await shot(p, `${width}-start`);
      const highlights = [await highlightedPixels(p)];
      await activate('[data-gate="tanglong"]');
      check(`${width}: wrong choice happened without progress or opening`, await p.evaluate(() => __xiguan.hunt.feedback==='wrong' && __xiguan.hunt.count===0 && __xiguan.s===0 && !__xiguan.busy));
      await shot(p, `${width}-wrong`);
      await activate('[data-gate="jiaomen"]');
      check(`${width}: first choice earned one highlight`, await p.evaluate(() => __xiguan.hunt.count===1 && document.querySelectorAll('.gate-pin[data-found="true"]').length===1));
      await shot(p, `${width}-first`);
      highlights.push(await highlightedPixels(p));
      await activate('[data-gate="jiaomen"]');
      check(`${width}: duplicate happened and kept progress`, await p.evaluate(() => __xiguan.hunt.feedback==='repeat' && __xiguan.hunt.count===1));
      await p.locator('[data-gate="tanglong"]').focus(); await p.keyboard.press('Space');
      check(`${width}: keyboard uses same intent for second choice`, await p.evaluate(() => __xiguan.hunt.count===2 && __xiguan.s===0));
      await shot(p, `${width}-second`);
      highlights.push(await highlightedPixels(p));
      await activate('[data-gate="damen"]');
      check(`${width}: three actual picks completed while facade remains closed`, await p.evaluate(() => __xiguan.hunt.count===3 && __xiguan.hunt.phase==='reading' && __xiguan.s===0 && !__xiguan.busy));
      await shot(p, `${width}-third`);
      highlights.push(await highlightedPixels(p));
      check(`${width}: each actual rendered gate adds visible highlight pixels`,highlights.every((n,i)=>i===0 || n>highlights[i-1]+10),highlights);
      await p.waitForFunction(() => !document.querySelector('#hunt-dialog').open, null, {polling:50});
      await p.waitForTimeout(300); await p.locator('#inspect-pause').click();
      const paused = await p.evaluate(() => __xiguan.s); await p.waitForTimeout(200);
      check(`${width}: earned opening supports existing pause`, await p.evaluate(s => __xiguan.s===s && s>0 && s<3.4 && !__xiguan.busy, paused));
      await p.locator('#inspect-pause').focus(); await p.keyboard.press('Space'); await waitOpen(p);
      check(`${width}: welcome and normal mode after opening`, await p.evaluate(() => !document.querySelector('#welcome').hidden && __xiguan.hunt.phase==='idle' && __xiguan.hunt.count===0 && __xiguan.hunt.remaining===0 && document.querySelectorAll('.gate-pin[data-found="true"]').length===0));
      check(`${width}: welcome leaves all three original labels clickable`,await p.locator('.landmark').evaluateAll(bs=>bs.length===3 && bs.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})));
      await shot(p, `${width}-welcome`);
      await p.locator('.landmark').nth(1).click();
      check(`${width}: existing courtyard label opens detail`, await p.evaluate(() => __xiguan.detail?.index===1 && __xiguan.s===3.4));
      await p.keyboard.press('Escape'); await p.locator('#welcome-close').click();
      await shot(p, `${width}-normal-open`);
      await activate('#hunt-start'); await activate('[data-gate="jiaomen"]'); await p.keyboard.press('Escape');
      check(`${width}: exit preserves previously open house`, await p.evaluate(() => __xiguan.s===3.4 && __xiguan.hunt.phase==='idle'));
      await p.locator('#toggle').click(); await waitClosed(p);
      await activate('#hunt-start');
      check(`${width}: restart is 0/3`, await p.evaluate(() => __xiguan.hunt.count===0));
      for (const id of ['jiaomen','tanglong','damen']) await activate(`[data-gate="${id}"]`);
      await p.locator('#hunt-exit').click(); await p.waitForTimeout(2100);
      check(`${width}: exit during final explanation cancels delayed opening`, await p.evaluate(() => __xiguan.hunt.phase==='idle' && __xiguan.s===0 && !__xiguan.busy));
      if (width===390) await p.waitForTimeout(Math.max(0, 30000-(Date.now()-started)));
      check(`${width}: zero page and console errors`, errors.length===0, errors);
      await context.close();
    }
    const p = await browser.newPage({viewport:{width:390,height:664},deviceScaleFactor:2,reducedMotion:'reduce'});
    await p.goto(base); await p.waitForFunction(() => window.__xiguan?.ready,null,{polling:50});
    await p.locator('#toggle').click(); await waitOpen(p);
    await p.locator('#hunt-start').click();
    for(const id of ['jiaomen','tanglong','damen']) await p.locator(`[data-gate="${id}"]`).click();
    await p.waitForFunction(() => __xiguan.hunt.phase==='idle',null,{polling:50});
    check('reduced motion: completed hunt from open house returns directly to open',await p.evaluate(() => __xiguan.s===3.4 && !__xiguan.busy));
    await p.locator('#toggle').click(); await waitClosed(p);
    check('closing the house clears the welcome',await p.locator('#welcome').isHidden());
    await shot(p,'390-dpr2-reduced-closed');
    await p.locator('#toggle').click(); await waitOpen(p);
    // Exercise queued native dialog events in one turn; the main runs above use real touch/keys.
    await p.evaluate(()=>{const labels=document.querySelectorAll('.landmark');labels[0].click();document.querySelector('#detail-dialog').close();labels[1].click();});
    await p.waitForTimeout(100);
    check('late detail close cannot clear a newly opened detail',await p.evaluate(()=>document.querySelector('#detail-dialog').open && __xiguan.detail?.index===1));
    await p.keyboard.press('Escape');
    await p.evaluate(()=>{document.querySelector('#hunt-start').click();document.querySelector('#hunt-exit').click();document.querySelector('#hunt-start').click();});
    await p.waitForTimeout(100);
    check('late hunt close cannot cancel a fresh visit',await p.evaluate(()=>document.querySelector('#hunt-dialog').open && __xiguan.hunt.phase==='finding' && __xiguan.hunt.count===0));
    await p.locator('#hunt-exit').click(); await p.close();
  } finally {
    fs.writeFileSync(path.join(out,'report.json'), JSON.stringify({browser:browser.version(),environments,checks,shots},null,2));
    await browser.close();
  }
})().catch(e => {console.error(e);process.exitCode=1;});
