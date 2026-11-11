// snowline-cabin server, with an in-memory source HTML entry and path-boundary check.
// node tools/serve.cjs . 8941 ; source http://127.0.0.1:8941/dev.html ; build /dist/index.html
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||'.'),port=Number(process.argv[3]||8941),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json'};
http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://x').pathname);}catch{res.writeHead(400);return res.end();}
 const p=path.resolve(root,'.'+pathname),rel=path.relative(root,p);if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(403);return res.end();}
 if(pathname==='/dev.html'){const template=fs.readFileSync(path.join(root,'index.template.html'),'utf8'),imports=JSON.stringify({imports:{three:'./node_modules/three/build/three.module.js','three/addons/':'./node_modules/three/examples/jsm/'}});res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-store'});return res.end(template.replace('<!--BUNDLE-->','<script type="importmap">'+imports+'</script><script type="module" src="./src/main.js"></script>'));}
 fs.readFile(p,(err,buf)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(buf);});
}).listen(port,'127.0.0.1',()=>console.log('serving',root,'on',port));
