// The room's WebSocket codec: handshake, masking, and every frame it must refuse.
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../server/ws.mjs');

const req=(h={},method='GET')=>({method,headers:{upgrade:'websocket',connection:'keep-alive, Upgrade','sec-websocket-version':'13','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==',...h}});

test('handshake answers RFC 6455\'s sample key and refuses anything that is not a browser upgrade',async()=>{
  const W=await load();
  const ok=W.handshake(req());
  assert.match(ok,/^HTTP\/1\.1 101 /);
  assert.match(ok,/Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n/,'the accept value from RFC 6455 section 1.3');
  assert.equal(W.handshake(req({},'POST')),null);
  assert.equal(W.handshake(req({upgrade:'h2c'})),null);
  assert.equal(W.handshake(req({connection:'keep-alive'})),null);
  assert.equal(W.handshake(req({'sec-websocket-version':'8'})),null);
  assert.equal(W.handshake(req({'sec-websocket-key':'short'})),null);
  assert.equal(W.handshake(req({'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==\r\nX: y'})),null,'no header injection through the key');
});

function reader(W){const got={text:[],ping:0,close:0,err:null};const r=new W.FrameReader({onText:s=>got.text.push(s),onPing:()=>got.ping++,onClose:()=>got.close++,onError:e=>got.err=e});return{r,got};}

test('masked text frames decode, split across chunks or several in one chunk',async()=>{
  const W=await load();
  const {r,got}=reader(W);
  const a=W.clientFrame(1,'{"t":"c","i":3}'),b=W.clientFrame(1,'砸');
  r.push(a.subarray(0,3));r.push(a.subarray(3));r.push(Buffer.concat([b,W.clientFrame(9,'')]));
  assert.deepEqual(got.text,['{"t":"c","i":3}','砸']);assert.equal(got.ping,1);assert.equal(got.err,null);
  const long='x'.repeat(300);const {r:r2,got:g2}=reader(W);r2.push(W.clientFrame(1,long));
  assert.deepEqual(g2.text,[long],'16-bit lengths work up to the limit');
});

test('refuses unmasked, fragmented, binary, oversized, 64-bit, bad utf-8 and unknown frames',async()=>{
  const W=await load();
  const cases={
    unmasked:W.clientFrame(1,'hi',{mask:false}),
    fragment:W.clientFrame(1,'hi',{fin:false}),
    opcode:W.clientFrame(2,'hi'),
    length:W.clientFrame(1,'y'.repeat(W.MAX_FRAME+1)),
    utf8:W.clientFrame(1,Buffer.from([0xc3,0x28])),
  };
  for(const [why,f] of Object.entries(cases)){const {r,got}=reader(W);r.push(f);assert.equal(got.err,why,`${why} frame should be refused`);assert.deepEqual(got.text,[]);}
  const {r,got}=reader(W);r.push(Buffer.from([0x81,0xff,0,0,0,0,0,0,0,1]));assert.equal(got.err,'length','64-bit lengths are never needed here');
  const {r:r3,got:g3}=reader(W);r3.push(Buffer.alloc(W.MAX_FRAME*5,0x81));assert.ok(g3.err,'a flood of bytes without a valid frame is refused');
});

test('close ends the reader; after an error nothing more is delivered',async()=>{
  const W=await load();
  const {r,got}=reader(W);r.push(Buffer.concat([W.clientFrame(8,Buffer.from([3,232])),W.clientFrame(1,'late')]));
  assert.equal(got.close,1);assert.deepEqual(got.text,[]);
  const {r:r2,got:g2}=reader(W);r2.push(W.clientFrame(2,'x'));r2.push(W.clientFrame(1,'after'));
  assert.equal(g2.err,'opcode');assert.deepEqual(g2.text,[]);
});

test('server frames are unmasked text, pong and close',async()=>{
  const W=await load();
  const t=W.encodeText('{"t":"O","n":2}');assert.equal(t[0],0x81);assert.equal(t[1],15);assert.equal(t.subarray(2).toString(),'{"t":"O","n":2}');
  const big=W.encodeText('z'.repeat(400));assert.equal(big[1],126);assert.equal(big.readUInt16BE(2),400);
  assert.deepEqual([...W.encodeClose(1008)],[0x88,2,0x03,0xf0]);
  assert.equal(W.encodePong(Buffer.from('p'))[0],0x8a);
});
