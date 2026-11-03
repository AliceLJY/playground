// The repository is public: nothing in this folder may look like a real key to a scanner.
// Every secret-looking string must be a short stub with the middle cut out (sk-…4f2a).
const test=require('node:test'),assert=require('node:assert');
const fs=require('fs'),path=require('path');
const C=require('../src/core.js');
const root=path.join(__dirname,'..');
function files(d){let out=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='check-out'||e.name==='node_modules'||e.name.startsWith('.'))continue;const p=path.join(d,e.name);if(e.isDirectory())out=out.concat(files(p));else if(/\.(js|cjs|html|md|json)$/.test(e.name))out.push(p);}return out;}
const entropy=s=>{const m={};for(const c of s)m[c]=(m[c]||0)+1;let e=0;for(const k in m){const p=m[k]/s.length;e-=p*Math.log2(p);}return e;};

test('spec 7.9: no long high-entropy run in any file of this folder',()=>{
  for(const f of files(root)){
    const text=fs.readFileSync(f,'utf8');
    for(const m of text.matchAll(/[A-Za-z0-9+\/_=-]{20,}/g)){
      // a run with slashes is checked piece by piece (URL paths like host:port/folder/file are not keys)
      for(const s of m[0].includes('/')?m[0].split('/').filter(x=>x.length>=16):[m[0]]){
      if(!/\d/.test(s)||!/[a-z]/i.test(s))continue;   // plain words and identifiers without digits are fine
      assert.ok(entropy(s)<3.6,`spec 7.9: ${path.relative(root,f)} has a key-like run of ${s.length} chars (entropy ${entropy(s).toFixed(2)}): ${s.slice(0,6)}…`);
    }}
    for(const m of text.matchAll(/\b(?:sk|tok|ak|ss|tk|ghp|AKIA|xox[bp])[-_][A-Za-z0-9]{8,}/g))assert.fail(`spec 7.9: ${path.relative(root,f)} has an uncut key-shaped string ${m[0].slice(0,5)}…`);
  }
});

test('spec 7.9: every leak fragment shown on screen is cut in the middle',()=>{
  for(const st of C.STORIES){
    assert.ok(st.frag.includes('…'),'spec 7.9: fragment without the cut: '+st.title);
    const tail=st.frag.split('…')[1];assert.ok(tail.length<=4,'spec 7.9: fragment keeps more than 4 trailing chars: '+st.title);
  }
});
