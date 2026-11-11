// Run alone after pixel/function checks. Never terminates anyone else's browser.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'/opt/homebrew/lib/node_modules']}));
function load(){
 const lines=execFileSync('ps',['-axo','pid=,args='],{encoding:'utf8'}).split('\n');
 // Inspect process names only; do not write full command lines, paths or unrelated arguments.
 return{headlessBrowsers:lines.filter(l=>/Google Chrome .*--headless/.test(l)&&!l.includes('--type=')).length,otherBrowserChecks:lines.filter(l=>/node .*tools\/browser-check\.cjs/.test(l)&&!l.includes(' -c ')).length};
}
(async()=>{const before='file://'+path.resolve(__dirname,'../shots/r3-baseline.html'),after=process.argv[2]||'file://'+path.resolve(__dirname,'../dist/index.html');const report={date:new Date().toISOString(),loadBeforeLaunch:load(),measurements:[],errors:[]};
 const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 try{for(const view of ['hero','night'])for(const [version,base]of [['before',before],['after',after]]){const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2}),pg=await ctx.newPage();pg.on('pageerror',e=>report.errors.push(e.message));const url=new URL(base);url.searchParams.set('debug','1');url.searchParams.set('view',view);await pg.goto(url.href);await pg.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:60000});await pg.evaluate(()=>window.__SKY_DEBUG__.setPaused(false));await pg.waitForTimeout(2000);await pg.evaluate(()=>window.__SKY_DEBUG__.clearPerformance());const loadStart=load();await pg.waitForTimeout(8000);const snapshot=await pg.evaluate(()=>window.__PLAYTEST__.snapshot());report.measurements.push({version,view,loadStart,loadEnd:load(),snapshot});await ctx.close();}
 }finally{await browser.close();}
 report.loadAfterClose=load();fs.writeFileSync('shots/r3-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.measurements.map(({version,view,loadStart,loadEnd,snapshot:s})=>({version,view,loadStart,loadEnd,renderer:s.renderer,fps:s.fps,jsMs:s.jsMs,calls:s.drawCalls,max:s.drawMax,triangles:s.triangles,dpr:s.pixelRatio,quality:s.quality})),null,2));if(report.errors.length)throw new Error(report.errors.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
