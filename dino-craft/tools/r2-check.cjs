// Serial real-GPU regression probes and matched-camera before/after captures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, spawn} = require('node:child_process');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(execFileSync('npm', ['root', '-g'], {encoding:'utf8'}).trim(), 'playwright'))); }
const root = path.resolve(__dirname, '..'), out = path.join(root, 'shots');
const before = process.argv.includes('--before');
const report = {phase:before ? 'before' : 'after', checks:[], errors:[], scenes:[]};
const pause = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => __PLAYTEST__?.ready, null, {polling:100, timeout:60000});
const customBase=process.argv.find(arg=>/^https?:/.test(arg));
const base=customBase&&!before?customBase:'http://127.0.0.1:8967/'+(before?'shots/r2-before.html':'dist/index.html');
const pageUrl=query=>{const url=new URL(base);url.search=query;return url.href;};
const server=customBase&&!before?null:spawn(process.execPath,[path.join(__dirname,'serve.cjs'),root,'8967'],{stdio:'ignore'});
function check(name, fn) {
  try { fn(); report.checks.push({name, passed:true}); }
  catch (e) { report.checks.push({name, passed:false, message:e.message}); }
}
async function run() {
  await pause(400);
  const browser = await chromium.launch({headless:true,channel:'chromium',args:process.platform === 'darwin' ? ['--use-angle=metal'] : []});
  try {
    const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
    const p = await ctx.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => {if(m.type() === 'error') report.errors.push(m.text());});
    p.on('requestfailed', r => report.errors.push(r.failure().errorText));
    for (const view of ['default','hero','night']) {
      const url=pageUrl('?test=1'+(view==='default'?'':'&view='+view));
      await p.goto(url); await ready(p);
      if (view === 'default') {
        await p.evaluate(() => {document.querySelector('#start').click();__PLAYTEST__.freeze();});
      }
      await pause(500);
      const audit = await p.evaluate(() => __PLAYTEST__.renderAudit());
      if (view === 'hero') {
        check('R3 hero rex side silhouette ratio > 1.2', () => assert.ok(audit.rex.width*1440/(audit.rex.height*900)>1.2, JSON.stringify(audit.rex)));
        if (!before) {
          for(const type of ['grazer','ptero'])check('R3 visible elongated '+type+' outline',()=>assert.ok(audit.species.some(s=>s.type===type&&s.left>0&&s.right<1&&s.top>0&&s.bottom<1&&s.pixelAspect>1.2&&s.width>.04)));
          check('R3 near vegetation occupies less than 1.5% of hero',()=>assert.ok(audit.coverage.nearPlants<.015,JSON.stringify(audit.coverage)));
          check('R3 leg hinge remains on the local lateral axis when turned',()=>assert.ok(audit.maxLegAxisTilt<.0001));
          check('R3 head projects in front of body', () => assert.ok(audit.rex.headAhead));
          check('R3 at least 95% of rex silhouette is unoccluded', () => assert.ok(audit.rex.visibility.fraction > .95, JSON.stringify(audit.rex.visibility)));
          check('R2 leaf holes and translucent amber exist in actual Canvas atlas', () => assert.ok(audit.atlas.leafHoles > 8 && audit.atlas.amberTranslucent === 256));
        }
        check('R4 six round barrel tubes', () => assert.ok(audit.barrelRadialNormals >= 12, 'actual radial normals '+audit.barrelRadialNormals));
        check('R2 atlas used by real terrain', () => assert.ok(audit.terrain.textured && audit.terrain.nearest && audit.terrain.uvVertices > 0 && audit.terrain.alphaTest > 0, JSON.stringify(audit.terrain)));
      }
      // Identical world camera for each pair. Hero uses the side-observer camera
      // that will also be the final hero entry. No quality or material overrides.
      const pose = before ? (view === 'hero' ? {position:[-12.5,29,-12], rotation:[-.262,-1.72,0]} : audit.camera) : JSON.parse(fs.readFileSync(path.join(out,'r2-before-report.json'))).scenes.find(s=>s.view===view).pose;
      await p.evaluate(pose => __PLAYTEST__.captureCamera(pose), pose); await pause(200);
      await p.evaluate(() => __PLAYTEST__.clearPerformance()); await pause(1400);
      const s = await p.evaluate(() => __PLAYTEST__.snapshot());
      const a = await p.evaluate(() => __PLAYTEST__.renderAudit());
      await p.screenshot({path:path.join(out,`r2-${before?'before':'after'}-${view}.png`)});
      report.scenes.push({view,pose,state:s,audit:a});
    }
    if (!before) {
      await p.goto(pageUrl('?test=1&view=hero'));await ready(p);
      const first = await p.evaluate(()=>__PLAYTEST__.renderAudit());
      await p.evaluate(()=>__PLAYTEST__.step(180));await pause(150);
      const second = await p.evaluate(()=>__PLAYTEST__.renderAudit());
      for (const joint of ['leg','head','tail','jaw']) check('R3 animated '+joint+' transform changes',()=>assert.notDeepEqual(first.articulation[joint],second.articulation[joint]));
      // First left/right thigh rotations have opposite signed Z components.
      check('R3 opposite leg swing',()=>assert.ok(first.articulation.leg[0][6]*first.articulation.leg[2][6]<0));
      await p.goto(pageUrl('?test=1'));await ready(p);
      await p.locator('#start').click();await pause(150);
      const idle = await p.evaluate(()=>__PLAYTEST__.renderAudit());
      await p.mouse.down({button:'left'});await pause(600);
      let firing,fireFrame;
      for(let i=0;i<12;i++){
        const sample=await p.evaluate(()=>{const audit=__PLAYTEST__.renderAudit();return {audit,png:audit.flash.visible?document.querySelector('#scene').toDataURL('image/png').split(',')[1]:null};});
        firing=sample.audit;fireFrame=sample.png;if(firing.flash.visible)break;await pause(20);
      }
      check('R4 real mouse fire rotates barrel bundle',()=>assert.ok(Math.abs(firing.barrelAngle-idle.barrelAngle)>.5));
      check('R4 muzzle flash lies ahead of barrel ends while firing',()=>assert.ok(firing.flash.visible && firing.flash.rearZ < firing.flash.barrelFrontZ,JSON.stringify(firing.flash)));
      check('R4 six equally spaced muzzle centres',()=>{
        assert.equal(firing.muzzles.length,6);
        const angles=firing.muzzles.map(([x,y])=>Math.atan2(y,x)).sort((a,b)=>a-b);
        for(let i=0;i<6;i++) {const [x,y]=firing.muzzles[i];assert.ok(Math.abs(Math.hypot(x,y)-.155)<.0001);const gap=(angles[(i+1)%6]-angles[i]+Math.PI*2)%(Math.PI*2);assert.ok(Math.abs(gap-Math.PI/3)<.0001);}
      });
      if(fireFrame)fs.writeFileSync(path.join(out,'r2-gatling-fire.png'),Buffer.from(fireFrame,'base64')); // Same render as the flash assertion, before its short lifetime expires.
      report.firing={idle,firing,state:await p.evaluate(()=>__PLAYTEST__.snapshot())};
      await p.mouse.up({button:'left'});
    }
    for (const seed of [46,55,64,71,91,135,731,732,9,1001]) {
      await p.goto(pageUrl('?test=1&seed='+seed)); await ready(p);
      await p.evaluate(()=>{document.querySelector('#start').click();__PLAYTEST__.freeze();});await pause(100);
      const a = await p.evaluate(()=>__PLAYTEST__.renderAudit());
      check('R1 normal-entry six-voxel ray seed '+seed, () => assert.ok(a.spawn?.forwardClear === true, JSON.stringify(a.spawn)));
      if (!before) check('R1 sky/ground pixel coverage seed '+seed, () => assert.ok(a.coverage.sky >= .15 && a.coverage.ground >= .15, JSON.stringify(a.coverage)));
      if (!before) report.checks.push({name:'coverage seed '+seed, data:a.coverage, spawn:a.spawn});
    }
    if (!before) {
      const baseline=JSON.parse(fs.readFileSync(path.join(out,'r2-before-report.json')));
      for(const scene of report.scenes){
        const old=baseline.scenes.find(s=>s.view===scene.view);
        check('matched camera and quality '+scene.view,()=>{
          assert.deepEqual(scene.audit.camera,old.audit.camera);
          assert.equal(scene.state.quality.dpr,old.state.quality.dpr);
          assert.equal(scene.state.quality.scale,old.state.quality.scale);
        });
        const left=fs.readFileSync(path.join(out,'r2-before-'+scene.view+'.png')).toString('base64');
        const right=fs.readFileSync(path.join(out,'r2-after-'+scene.view+'.png')).toString('base64');
        const png=await p.evaluate(async({left,right,name})=>{
          const images=await Promise.all([left,right].map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;}));
          const canvas=document.createElement('canvas');canvas.width=images[0].width+images[1].width;canvas.height=Math.max(images[0].height,images[1].height)+48;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#15221e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f1e7cf';ctx.font='24px sans-serif';ctx.fillText('BEFORE · '+name,24,32);ctx.fillText('AFTER · '+name,images[0].width+24,32);ctx.drawImage(images[0],0,48);ctx.drawImage(images[1],images[0].width,48);return canvas.toDataURL('image/png').split(',')[1];
        },{left,right,name:scene.view});
        fs.writeFileSync(path.join(out,'r2-compare-'+scene.view+'.png'),Buffer.from(png,'base64'));
      }
    }
    await ctx.close();
  } finally {await browser.close();}
  check('zero browser errors',()=>assert.equal(report.errors.length,0,report.errors.join('\n')));
}
run().catch(e=>{report.errors.push(e.stack);process.exitCode=1;}).finally(()=>{
  if(server)server.kill();report.passed=report.errors.length===0&&!report.checks.some(c=>c.passed===false);fs.writeFileSync(path.join(out,`r2-${before?'before':'after'}-report.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({phase:report.phase,checks:report.checks,errors:report.errors},null,2));
  if (!before && report.checks.some(c=>c.passed===false)) process.exitCode=1;
});
