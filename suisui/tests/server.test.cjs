// The room server over a real socket: origin, path, address limit (with a forged X-Forwarded-For),
// hello timeout, flood cut-off, broadcasts, and a newer tab replacing an older one.
const test=require('node:test'),assert=require('node:assert/strict');
const net=require('node:net');

async function boot(limits={}){
  const S=await import('../server/room-server.mjs'),W=await import('../server/ws.mjs');
  const srv=await S.startRoom({port:0,seed:3,limits:{tickMs:20,...limits}});
  return{S,W,srv};
}
// A raw client: handshake with chosen headers, then masked text frames out, server frames in.
function client(W,port,{origin='http://127.0.0.1:8971',path='/room/ws',xff}={}){
  return new Promise((resolve)=>{
    const sock=net.connect(port,'127.0.0.1');const c={sock,msgs:[],status:null,closed:false,buf:Buffer.alloc(0)};
    sock.on('connect',()=>sock.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nOrigin: ${origin}\r\n${xff?`X-Forwarded-For: ${xff}\r\n`:''}\r\n`));
    sock.on('data',d=>{
      c.buf=Buffer.concat([c.buf,d]);
      if(c.status==null){const e=c.buf.indexOf('\r\n\r\n');if(e<0)return;c.status=+c.buf.toString('latin1',9,12);c.buf=c.buf.subarray(e+4);resolve(c);}
      while(c.buf.length>=2){const op=c.buf[0]&15;let len=c.buf[1]&127,off=2;if(len===126){if(c.buf.length<4)return;len=c.buf.readUInt16BE(2);off=4;}
        if(c.buf.length<off+len)return;const p=c.buf.subarray(off,off+len);c.buf=c.buf.subarray(off+len);
        if(op===1)c.msgs.push(JSON.parse(p.toString()));if(op===8)c.closeCode=p.length>=2?p.readUInt16BE(0):0;}
    });
    sock.on('close',()=>{c.closed=true;if(c.status==null)resolve(c);});sock.on('error',()=>{});
  }).then(c=>{c.say=m=>c.sock.write(W.clientFrame(1,typeof m==='string'?m:JSON.stringify(m)));c.last=t=>[...c.msgs].reverse().find(m=>m.t===t);return c;});
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=2000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return true;await wait(15);}return false;}

test('only a browser upgrade from an allowed origin on /room/ws gets in',async()=>{
  const {W,srv}=await boot();
  try{
    assert.equal((await client(W,srv.port)).status,101);
    assert.equal((await client(W,srv.port,{origin:'https://aliceljy.github.io'})).status,101);
    assert.equal((await client(W,srv.port,{origin:'https://evil.example'})).status,403);
    assert.equal((await client(W,srv.port,{origin:'null'})).status,403);
    assert.equal((await client(W,srv.port,{path:'/room/ws/../x'})).status,404);
    const r=await fetch(`http://127.0.0.1:${srv.port}/room/health`);assert.equal(r.status,200);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/`)).status,404);
  }finally{await srv.stop();}
});

test('four connections per address, counted on the last X-Forwarded-For entry so a forged first entry does not help',async()=>{
  const {W,srv}=await boot();
  try{
    const ok=[];for(let k=0;k<4;k++)ok.push(await client(W,srv.port,{xff:`10.0.0.${k}, 203.0.113.7`}));
    assert.deepEqual(ok.map(c=>c.status),[101,101,101,101]);
    assert.equal((await client(W,srv.port,{xff:'198.51.100.1, 203.0.113.7'})).status,429,'forging the first entry still counts as the same address');
    assert.equal((await client(W,srv.port,{xff:'203.0.113.8'})).status,101,'a different real address is fine');
  }finally{await srv.stop();}
});

test('a connection that never says hi is closed; one that floods is cut off',async()=>{
  const {W,srv}=await boot({helloMs:150,floodMs:200,msgsPerSec:10});
  try{
    const quiet=await client(W,srv.port);assert.ok(await until(()=>quiet.closed,1500),'silent connection closed');
    const loud=await client(W,srv.port);loud.say({t:'hi',n:1,c:1});await until(()=>loud.last('W'));
    for(let k=0;k<400&&!loud.closed;k++){loud.say({t:'u',i:0});if(k%40===0)await wait(20);}
    assert.ok(await until(()=>loud.closed,2000),'flooding connection closed');
    const replies=loud.msgs.filter(m=>m.t==='X').length;assert.ok(replies<60,`only about the bucket was answered (${replies})`);
  }finally{await srv.stop();}
});

test('two visitors: claim, queue as 第 2 位, smash broadcast to both, nothing but whitelisted messages accepted',async()=>{
  const {W,srv}=await boot();
  try{
    const a=await client(W,srv.port),b=await client(W,srv.port);
    a.say({t:'hi',n:3,c:2});b.say({t:'hi',n:4,c:5});
    await until(()=>a.last('W')&&b.last('W'));
    const i=a.last('W').slots.find(s=>s.st==='idle'&&s.k!=='note').i;
    a.say({t:'c',i});await until(()=>a.last('K'));
    b.say({t:'c',i});await until(()=>b.last('K'));assert.equal(b.last('K').q,2);
    b.say({t:'n',text:'骂人的话'});b.say('{"t":"s","i":0,"g":"tap","ox":0,"oy":0,"msg":"hi"}');b.say('not json');
    await wait(80);assert.ok(!b.msgs.some(m=>JSON.stringify(m).includes('骂人')),'free text never echoes back');
    a.say({t:'s',i,g:'tap',ox:.5,oy:.5});
    assert.ok(await until(()=>a.last('S')&&b.last('S')),'both saw the smash');
    assert.equal(b.last('S').i,i);assert.equal(b.last('S').by,a.last('W').you.pid);
  }finally{await srv.stop();}
});

test('the same visitor in a newer tab replaces the older connection without leaving the room',async()=>{
  const {W,srv}=await boot();
  try{
    const a=await client(W,srv.port);a.say({t:'hi',n:1,c:1});await until(()=>a.last('W'));
    const tok=a.last('W').you.tok,pid=a.last('W').you.pid;
    const a2=await client(W,srv.port);a2.say({t:'hi',n:1,c:1,tok});await until(()=>a2.last('W'));
    assert.equal(a2.last('W').you.pid,pid,'same session');
    assert.ok(await until(()=>a.closed),'older tab closed');
    await wait(60);assert.equal([...srv.room.sessions.values()].filter(s=>s.live).length,1,'still in the room');
  }finally{await srv.stop();}
});

test('the room fills at its people limit and tells the next visitor to play alone',async()=>{
  const {W,srv}=await boot({people:2,perAddr:10});
  try{
    for(let k=0;k<2;k++){const c=await client(W,srv.port);c.say({t:'hi',n:k,c:k});await until(()=>c.last('W'));}
    const late=await client(W,srv.port);late.say({t:'hi',n:9,c:9});
    assert.ok(await until(()=>late.last('F')&&late.closed),'told the room is full, then closed');
  }finally{await srv.stop();}
});

test('a client that only half-closes (sends FIN) frees its place at once, not after the heartbeat',async()=>{
  const {W,srv}=await boot();
  try{
    const four=[];for(let k=0;k<4;k++)four.push(await client(W,srv.port,{xff:'203.0.113.9'}));
    assert.deepEqual(four.map(c=>c.status),[101,101,101,101]);
    four.forEach(c=>c.sock.end());                       // FIN only, the way a proxy passes on a closed tab
    assert.ok(await until(()=>srv.conns.size===0,1500),`server still holds ${srv.conns.size} half-closed connections`);
    assert.equal((await client(W,srv.port,{xff:'203.0.113.9'})).status,101,'the address can connect again');
  }finally{await srv.stop();}
});
