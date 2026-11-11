const {test,before}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {renderViews}=require('../tools/palette-render.cjs');
// A11: rendered pixels, not assertions that palette constants equal themselves.
const limits={hero:{span:.50,gap:.12,hue:45,gray:.35},wide:{span:.45,gap:.10,hue:45,gray:.35},night:{span:.34,gap:.06,hue:25,gray:.12}};
let report;
before(async()=>{report=await renderViews({base:process.env.SKY_PALETTE_BASE||'file://'+path.resolve(__dirname,'../dist/index.html'),out:process.env.SKY_PALETTE_OUT||path.resolve(__dirname,'../shots/r3-test')});assert.deepEqual(report.errors,[]);}, {timeout:120000});
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
