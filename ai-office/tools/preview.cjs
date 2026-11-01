// Read-only local frontend preview. Never contacts the real office or changes the contract fixture.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets={'index.html':'text/html','office.js':'text/javascript','office-core.js':'text/javascript','style.css':'text/css','demo-script.json':'application/json','mv.js':'text/javascript','mv-script.json':'application/json'};
function createPreview(){return http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname.replace(/^\/(?:playground\/ai-office\/)?/,'') || 'index.html';
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  try {
    if(file==='api/state'||file==='guest/api/state'){res.setHeader('content-type','application/json');res.end(await fs.readFile(path.join(root,'tests/fixtures/state-scene.json')));return;}
    if(file==='visit'||file==='guest/visit'){res.writeHead(204);res.end();return;}
    if(!Object.hasOwn(assets,file)){res.writeHead(404);res.end('not found');return;}
    res.setHeader('content-type',assets[file]);res.end(await fs.readFile(path.join(root,file)));
  }catch{res.writeHead(500);res.end('preview unavailable');}
});}
if(require.main===module)createPreview().listen(3191,'127.0.0.1',()=>console.log('Fixture preview: http://127.0.0.1:3191/'));
module.exports={createPreview};
