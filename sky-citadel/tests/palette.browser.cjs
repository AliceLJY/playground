const {test,before}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {renderViews}=require('../tools/palette-render.cjs');
const {renderSkyScenarios}=require('../tools/sky-render.cjs');
// A11: rendered pixels, not assertions that palette constants equal themselves.
const limits={hero:{span:.50,gap:.12,hue:45,gray:.35},wide:{span:.45,gap:.10,hue:45,gray:.35},night:{span:.34,gap:.06,hue:25,gray:.12}};
let report,skyReport;
before(async()=>{
 const base=process.env.SKY_PALETTE_BASE||'file://'+path.resolve(__dirname,'../dist/index.html');
 report=await renderViews({base,out:process.env.SKY_PALETTE_OUT||path.resolve(__dirname,'../shots/r3-test')});
 assert.deepEqual(report.errors,[]);
 skyReport=await renderSkyScenarios({base,out:process.env.SKY_R4_OUT||path.resolve(__dirname,'../shots/r4-after')});
 assert.deepEqual(skyReport.errors,[]);
}, {timeout:180000});
for(const view of ['hero','night','wide'])test('A11 '+view+': contrast, city/sky separation and grey coverage',()=>{
 const {metrics:m,snapshot:s}=report.views.find(v=>v.view===view),l=limits[view];
 assert.equal(s.view,view,'requested fixed camera actually entered');assert.equal(s.simTime,12);
 assert.ok(m.city.pixels>50000&&m.sky.pixels>500000,'real city and unobstructed sky were sampled');
 const failures=[];
 if(m.span<l.span)failures.push(`p5–p95 ${m.span.toFixed(3)} < ${l.span}`);
 if(m.lumaGap<l.gap)failures.push(`city/sky luma gap ${m.lumaGap.toFixed(3)} < ${l.gap}`);
 if(m.hueGap<l.hue)failures.push(`city/sky hue gap ${m.hueGap.toFixed(1)}° < ${l.hue}°`);
 if(m.grayFraction>l.gray)failures.push(`low saturation ${(m.grayFraction*100).toFixed(1)}% > ${l.gray*100}%`);
 assert.deepEqual(failures,[],`A11 ${view}: ${failures.join('; ')}`);
});

// Kept in this browser file so `node --test tests/*.browser.cjs` runs a single
// sequential GPU workload. CPU/CI tests never load browser or screenshot code.
for(const name of ['default','hero','wide','dawn','noon','night']) {
 test('A12 '+name+': rendered sky rows pass the sky rules',async()=>{
  // Same rules as tests/sky-colors.test.cjs, here on pixels read back from the GPU.
  const {skyRuleFailures}=await import('../src/sky-colors.js');
  const m=skyReport.scenarios.find(s=>s.name===name).metrics;
  assert.equal(m.height,900);assert.equal(m.skyPixels,1440*900);
  assert.ok(m.screenSkyMaxError<=3,`normal frame differs from measured sky by ${m.screenSkyMaxError}/255`);
  assert.deepEqual(skyRuleFailures(m.rows.map(r=>r.hex)),[]);
 });
 test('A12 '+name+': lower cloud sea colour',()=>{
  const m=skyReport.scenarios.find(s=>s.name===name).metrics;
  assert.ok(m.cloudPixels>20000,`only ${m.cloudPixels} actual lower-cloud pixels`);
  assert.ok(m.brownCloudFraction<.03,`brown/beige lower clouds ${(m.brownCloudFraction*100).toFixed(2)}% >= 3%`);
 });
 if(name==='noon')test('A12 noon: all rows stay blue',()=>{
  const m=skyReport.scenarios.find(s=>s.name===name).metrics;
  assert.ok(m.rows.every(r=>r.h>=200&&r.h<=260),'noon sky must stay in blue hues');
 });
}
