// NODE_PATH="$(npm root -g)" node tests/demo-treat-browser.cjs [http://127.0.0.1:PORT/ai-office/]
// ?demo=1 探班送礼：只在本页演，不向任何地址发 POST / 访客 / 接口请求。不给地址就用本目录起一个临时静态服务（只读本目录文件）。
// 绝不指向线上办公室；非演示页的请求一律拦下。
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};
(async()=>{
 let server,base=process.argv[2];
 if(!base){server=http.createServer((q,r)=>{const f=path.join(root,new URL(q.url,'http://x').pathname.split('/').at(-1)||'index.html');fs.readFile(f,(e,d)=>{if(e||!f.startsWith(root)){r.writeHead(404);r.end('{}');return;}r.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});r.end(d);});}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/ai-office/`;}
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();const bad=[];
  page.on('request',r=>{if(r.method()!=='GET'||/guest\/|api\/|visit|treat|meet/.test(new URL(r.url()).pathname))bad.push(r.method()+' '+r.url());});
  await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(base).origin?(/guest\/|api\//.test(u.pathname)?r.fulfill({status:404,body:'{}'}):r.continue()):r.abort();});
  await page.goto(base+'?demo=1');await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{timeout:20000});
  await page.click('#treat-toggle');await page.click('#treat-menu button[data-kind="cake"]');await page.waitForTimeout(600);
  const note=await page.textContent('#treat-note');
  assert.deepEqual(bad,[],'演示模式送礼不许发请求：'+bad.join(' | '));
  assert.match(note,/蛋糕送出去了/,'演示模式应在本页送出：'+note);
  assert.match(await page.textContent('#room-caption'),/蛋糕/,'办公室应出现探班送礼画面');
  console.log('PASS demo treat plays locally, 0 requests:',note);
 } finally {await browser.close();if(server)server.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
