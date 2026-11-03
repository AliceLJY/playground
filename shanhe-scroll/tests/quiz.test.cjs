// Run the page's actual quiz/reset functions with a minimal DOM; no duplicate scoring model.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function setup(){
 const element=()=>({children:[],disabled:false,textContent:'',classList:{values:new Set(),add(c){this.values.add(c);},remove(c){this.values.delete(c);},contains(c){return this.values.has(c);}},set innerHTML(v){this.children=[];},appendChild(el){this.children.push(el);}});
 const els=new Map(),$=id=>{if(!els.has(id))els.set(id,element());return els.get(id);};
 const context=vm.createContext({$,document:{createElement:element},refreshScore(){},buildRail(){}});
 const state=source.slice(source.indexOf('let score = 0;'),source.indexOf('const $ ='));
 const quiz=source.slice(source.indexOf('function buildQuiz(node){'),source.indexOf("$('scene-next').onclick"));
 const reset=source.slice(source.indexOf('function reset(){'),source.indexOf('function dismissHint(){'));
 vm.runInContext(state+quiz+reset,context);
 const node={id:'one',score:{correct:120,wrong:40},quiz:{question:'choose',answer:'A',options:[{key:'A',text:'first'},{key:'B',text:'second'}],verdict:'same evidence',hint:'same hint'}};
 return{node,$,build:n=>context.buildQuiz(n),reset:()=>context.reset(),score:()=>vm.runInContext('score',context)};
}
test('revisiting a correct answer never awards another score',()=>{
 const p=setup();p.build(p.node);p.$('opts').children[0].onclick();assert.equal(p.score(),120);
 p.build(p.node);p.$('opts').children[0].onclick();assert.equal(p.score(),120,'one node only contributes its first answer');
 assert.ok(p.$('opts').children.every(b=>b.disabled));assert.ok(p.$('verdict').classList.contains('show'));
});
test('revisiting a wrong answer restores that choice and its original hint',()=>{
 const p=setup();p.build(p.node);p.$('opts').children[1].onclick();p.build(p.node);
 assert.ok(p.$('opts').children[1].classList.contains('wrong'),'previous wrong choice is visible');
 assert.equal(p.$('verdict-hint').textContent,'same hint');p.$('opts').children[0].onclick();assert.equal(p.score(),40);
});
test('distinct nodes score separately and reset clears remembered answers',()=>{
 const p=setup();p.build(p.node);p.$('opts').children[0].onclick();
 p.build({...p.node,id:'two'});p.$('opts').children[1].onclick();assert.equal(p.score(),160);
 p.reset();assert.equal(p.score(),0);p.build(p.node);assert.ok(p.$('opts').children.every(b=>!b.disabled));
 p.$('opts').children[1].onclick();assert.equal(p.score(),40);
});
