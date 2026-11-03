// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <output-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Provide page URL and output directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base, browser: browser.version(), checks: [], runs: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  for (const [width, height] of [[390,664],[320,568],[844,340],[1365,900]]) {
    const mobile = width < 900;
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__nc, null, { polling: 100 });
    await page.locator('[data-mode="manual"]').click();
    await page.evaluate(()=>scrollTo(0,0));
    const layout = () => page.evaluate(() => {
      const rect = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right } : null; };
      const button = document.querySelector('[data-next-step]');
      const r = button?.getBoundingClientRect();
      return { svg:rect('.nc-svg'), stage:rect('.nc-stage'), tip:rect('[data-tip]'), next:rect('[data-next-step]'), hit:!!r && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === button, overflow:document.documentElement.scrollWidth>innerWidth };
    });
    await page.screenshot({ path:path.join(out,`${width}-initial.png`) });
    if (mobile) { const p = await layout(); check(`${width} next control visible and >=44px`,p.next && p.next.height>=44 && p.next.bottom<=height && p.hit,p); }
    // Actual click for every step. The existing clock hook only settles animation.
    for (let i=0;i<11;i++) {
      const next = page.locator('[data-next-step]');
      if (mobile && await next.count()) await next.click();
      else { const b=page.locator('.nc-step').nth(i); await b.evaluate(el=>el.scrollIntoView({block:'center'})); const r=await b.boundingBox(); await page.mouse.click(r.x+r.width/2,r.y+r.height/2); }
      await page.evaluate(() => window.__nc.advance(5));
      check(`${width} guided step ${i+1}`,await page.evaluate(n => window.__nc.state().done===n && !window.__nc.state().busy,i+1),i+1);
      if(mobile && i<10) { const p=await layout(); check(`${width} step ${i+1} stays with model and next button`,p.next&&p.stage.y>=0&&p.stage.bottom<=height-60&&p.next.bottom<=height&&p.hit,p.stage); }
    }
    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({ path:path.join(out,`${width}-complete.png`) });
    if (mobile) { const p = await layout(); check(`${width} complete model and explanation share viewport`,p.stage.y>=0 && p.stage.bottom<=height-54 && p.tip.bottom<=height-54 && !p.overflow,p); }
    const review = page.locator('[data-review]');
    const unlocked = await review.count()===4 && await review.evaluateAll(bs=>bs.every(b=>!b.disabled));
    check(`${width} completed build unlocks direct reviews`,unlocked,await review.count());
    if (unlocked) {
      for (const id of ['bracket','beam','apart','again']) {
        await page.locator(`[data-review="${id}"]`).click();
        await page.evaluate(() => window.__nc.advance(5));
        const state = await page.evaluate(() => ({...window.__nc.state(), label:document.querySelector('[data-current]').textContent, shown:[...new Set([...document.querySelectorAll('.nc-house .it:not([data-hide])')].map(n=>n.dataset.step))], apart:document.querySelector('.nc-stage').hasAttribute('data-apart')}));
        check(`${width} review ${id} keeps completion and reports pose`,state.done===11 && state.review===id && state.label.includes('回看') && (id!=='bracket'||(!state.shown.includes('beam')&&!state.shown.includes('roof'))) && state.apart===(id==='apart'),state);
        const ghosts=await page.locator('.nc-house .it[data-hide]').evaluateAll(ns=>[...new Set(ns.filter(n=>Number(getComputedStyle(n).opacity)>0).map(n=>n.dataset.step))]);
        check(`${width} review ${id} hidden pieces really disappear`,ghosts.length===0,ghosts);
        if (id==='apart'||id==='bracket') await page.screenshot({ path:path.join(out,`${width}-${id}.png`) });
      }
      await page.locator('[data-reset]').click();
      check(`${width} reset locks reviews and restores first step`,await page.evaluate(()=>window.__nc.state().done===0 && [...document.querySelectorAll('[data-review]')].every(b=>b.disabled)),null);
    }
    check(`${width} zero page errors`,errors.length===0,errors);
    report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio),errors});
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})();
