/* Guangzhou-inspired closed racing course: Xiguan, shaded avenue, Pearl River. */
(function(root){'use strict';
const T=root.THREE,C=root.RaceCore,A=root.RaceCat;
function build(scene){
 const world=new T.Group();scene.add(world);let seed=187;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const {box,ball,rod,curve,mat,mesh}=A;
 function group(s,lateral=0){const p=C.at(s,lateral),g=new T.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=p.heading;world.add(g);return g;}
 function text(label,w,h,bg='#122b3b',fg='#f5cf87',font=70){const can=document.createElement('canvas');can.width=1024;can.height=256;const c=can.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,1024,256);c.strokeStyle=fg;c.lineWidth=5;c.strokeRect(18,18,988,220);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font='700 '+font+'px "PingFang SC",sans-serif';c.fillText(label,512,132,940);const tex=new T.CanvasTexture(can);tex.colorSpace=T.SRGBColorSpace;return new T.Mesh(new T.PlaneGeometry(w,h),mat('#ffffff',{map:tex,roughness:.8}));}
 function ribbon(left,right,material,lift=.04,from=0,to=C.L){const points=[],uv=[];for(let s=from;s<to;s+=2){const next=Math.min(to,s+2),p=[C.at(s,left),C.at(s,right),C.at(next,left),C.at(next,right)];for(const i of [0,1,2,1,3,2]){points.push(p[i].x,p[i].y+lift,p[i].z);uv.push(i%2,(i<2?s:next)/8);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();const m=mesh(g,material,world);m.castShadow=false;return m;}
 function asphalt(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),img=ctx.createImageData(256,256);for(let i=0;i<img.data.length;i+=4){const v=42+rand()*17;img.data[i]=v;img.data[i+1]=v+3;img.data[i+2]=v+5;img.data[i+3]=255;}ctx.putImageData(img,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(3,1);t.colorSpace=T.SRGBColorSpace;return mat('#b8b8b8',{map:t,roughness:.91});}
 box(world,[-70,-1.8,-40],[640,3.4,400],'#718657');
 ribbon(-10.4,10.4,mat('#c7b692'));ribbon(-8.2,8.2,asphalt(),.065);
 for(const side of [-1,1])ribbon(side*7.5-.055,side*7.5+.055,mat('#f9edcb'),.081);
 for(let s=4;s<C.L;s+=7){const g=group(s);box(g,[0,.09,0],[.11,.02,2.9],'#e5d5aa');}
 for(let s=0;s<C.L;s+=4){const f=s/C.L;for(const side of [-1,1]){
  const g=group(s,side*8.5);box(g,[0,.15,0],[.55,.25,3.96],Math.floor(s/4)%2?'#f3dfb9':'#b95339');
  if(f>.59&&f<.86){box(g,[0,1,0],[.09,1.9,.09],'#586963');rod(g,[0,1.53,-2],[0,1.53,2],.045,'#d4c6a6');rod(g,[0,.85,-2],[0,.85,2],.028,'#647970');}
  else{box(g,[0,.62,0],[.38,1.04,3.98],Math.floor(s/12)%2?'#244551':'#18323b');box(g,[-side*.203,.81,0],[.012,.065,3.4],'#e7ba70');}
 }}
 const start=group(0);for(const x of [-8.7,8.7]){box(start,[x,3.7,0],[.6,7.4,.62],'#173741');box(start,[x,1.1,0],[.74,.35,.75],'#efa548');}
 box(start,[0,7,0],[18,.9,.65],'#153039');const banner=text('小橘飞车  ·  珠江杯',11,.9,'#153039','#ffd695',77);banner.position.set(0,7.02,.34);start.add(banner);
 for(let i=0;i<20;i++)box(start,[-7.6+i*.8,.085,0],[.8,.018,1.1],i%2?'#f4e9d3':'#303c3d');
 for(let i=0;i<20;i++)box(start,[-7.6+i*.8,.085,-1.1],[.8,.018,1.1],i%2?'#303c3d':'#f4e9d3');
 for(let j=0;j<6;j++){const g=group(-7-Math.floor(j/2)*4.5,(j%2?1:-1)*2.25);for(const x of [-.85,.85])box(g,[x,.085,0],[.08,.01,1.6],'#ede7cd');box(g,[0,.086,.8],[1.7,.01,.08],'#ede7cd');}
 const boosts=[];for(const p of C.pads){const g=group(p.s,p.lane);box(g,[0,.1,0],[2.6,.06,5.8],mat('#265c69',{emissive:'#22798b',emissiveIntensity:.5}));for(let i=0;i<4;i++)for(const side of [-1,1]){const o=box(g,[side*.47,.145,-1.8+i*1.1],[.13,.02,1.2],mat('#9ce9db',{emissive:'#51cbbc',emissiveIntensity:.6}));o.rotation.y=side*-.65;}boosts.push(g);}
 function window(g,x,y,z,w,h){box(g,[x,y,z],[w+.24,h+.23,.1],'#dfcfb2');box(g,[x,y,z+.06],[w,h,.1],mat('#294c50',{roughness:.32,metalness:.22}));box(g,[x,y,z+.13],[.045,h,.02],'#adbbab');box(g,[x,y,z+.13],[w,.045,.02],'#adbbab');box(g,[x,y-h*.5-.12,z+.16],[w+.34,.12,.28],'#e9d7b7');}
 const shopNames=['榕记茶楼','西关冰室','木棉糖水','骑楼邮局','有记凉茶','小橘单车','南风书屋','广州老字号'];
 function house(s,side,i){const g=group(s,side*15);g.rotation.y+=side>0?-Math.PI/2:Math.PI/2;const h=7.8+(i%3)*1.1,w=10.4,wall=['#d7b58a','#d8c7a5','#c6c2ac','#c19b78','#e2c7a2'][i%5];
  box(g,[0,h/2+2.4,-1],[w,h,7],wall);box(g,[0,.25,-1],[w+1,.5,8],'#a9a58b');box(g,[0,1.45,1.45],[w,2.9,1.5],'#35534e');
  for(const x of [-4.8,0,4.8]){box(g,[x,1.55,3],[.45,3.1,.48],'#e9d5ad');box(g,[x,3,3],[.7,.3,.75],'#f0ddba');}
  box(g,[0,3.32,2.98],[w+.3,.3,.9],'#e6cda6');
  for(const x of [-2.4,2.4]){const sh=new T.Shape();sh.absarc(0,0,2.16,0,Math.PI,false);sh.lineTo(-2.16,-.22);sh.absarc(0,-.22,1.91,Math.PI,0,true);sh.closePath();mesh(new T.ExtrudeGeometry(sh,{depth:.24,bevelEnabled:false,curveSegments:14}),'#e5d3b1',g,[x,2.06,2.79]);}
  for(const y of [4.5,7.25])for(const x of [-3.1,0,3.1])window(g,x,y,2.56,1.16,1.8);
  box(g,[0,h+2.42,-.7],[w+.65,.27,7.4],'#eee0c1');box(g,[0,h+2.8,2.5],[w,.55,.28],wall);box(g,[0,h+3.09,2.5],[w+.35,.14,.48],'#e6d8b9');
  const sign=text(shopNames[i%shopNames.length],4.6,.88,i%2?'#a94d31':'#23493f',i%2?'#f4deb0':'#e7d2a1',85);sign.position.set(0,2.27,2.35);g.add(sign);
  if(i%2===0){for(let j=0;j<9;j++){const aw=box(g,[-4+j,3.04,3.78],[1,.1,2.1],j%2?'#e8d4ad':'#ac583e');aw.rotation.x=.13;box(g,[-4+j,2.81,4.8],[1,.25,.05],j%2?'#e8d4ad':'#ac583e');}}
  if(i%3===1){box(g,[0,6.1,3],[w-.6,.17,1.1],'#e3caa2');for(let j=0;j<20;j++)box(g,[-4.5+j*.47,6.55,3.47],[.035,.85,.035],'#446458');rod(g,[-4.6,6.95,3.47],[4.6,6.95,3.47],.035,'#446458');}
  for(const x of [-3.5,3.5]){box(g,[x,1.1,2.3],[1.2,2.1,.16],'#314e46');rod(g,[x,1.9,4.1],[x,2.6,4.1],.017,'#b4955d');ball(g,[x,2.18,4.1],[.3,.37,.29],'#bd5133');}
 }
 for(let s=20,i=0;s<C.L*.31;s+=12.2,i++){house(s,-1,i);if(s<C.L*.20)house(s,1,i+3);}
 function tree(s,side,i){const g=group(s,side*(11.6+(i%3)*1.7));rod(g,[0,0,0],[.2,5,0],.21,'#766444');for(let j=0;j<5;j++){const a=j*1.26;rod(g,[.1,3.7,0],[Math.cos(a)*2.1,6.6+rand(),Math.sin(a)*2.1],.085,'#706244');}
  for(let j=0;j<9;j++){const a=j*2.4,r=1+rand()*1.4;ball(g,[Math.cos(a)*r,6.2+rand()*2,Math.sin(a)*r],[1.7,1.1,1.6],['#466d3e','#648444','#82944b','#56763a'][j%4]);}box(g,[0,.12,0],[2.2,.22,2.2],'#bba788');
 }
 for(let s=C.L*.935,i=12;s<C.L-18;s+=12.2,i++)house(s,1,i);
 for(let s=C.L*.305,i=0;s<C.L*.63;s+=16,i++){tree(s,-1,i);tree(s,1,i+3);}
 for(let s=C.L*.83,i=0;s<C.L*.96;s+=17,i++)tree(s,-1,i);
 function villa(s,i){const g=group(s,-21);g.rotation.y=Math.PI/2+C.at(s).heading;box(g,[0,4,0],[11,8,7],i%2?'#d8d0b5':'#bd8063');box(g,[0,.36,0],[12,.72,8],'#c4b894');box(g,[0,8.1,0],[11.7,.26,7.5],'#f4e0bb');const roof=mesh(new T.ConeGeometry(8,2.9,4),'#567f77',g,[0,9.6,0]);roof.rotation.y=Math.PI/4;roof.scale.z=.75;for(const x of [-3.5,0,3.5])for(const y of [2.4,5.8])window(g,x,y,3.55,1.5,2);for(const x of [-2.8,2.8])rod(g,[x,.5,4.6],[x,5.4,4.6],.22,'#e8daba');box(g,[0,5.5,4],[7,.26,2.8],'#e4d6b9');}
 for(let s=C.L*.33,i=0;s<C.L*.58;s+=27,i++)villa(s,i);
 for(let s=0;s<C.L;s+=29){const g=group(s,-10.3);rod(g,[0,0,0],[0,5.4,0],.075,'#3b514c');curve(g,[[0,5.1,0],[.1,5.6,0],[.8,5.7,0],[1.2,5.4,0]],.058,'#3b514c');ball(g,[1.2,5.25,0],[.25,.28,.25],mat('#ffdab1',{emissive:'#e5a559',emissiveIntensity:.35}));}
 // Infield garden and layered skyline keep the start grid connected to a city.
 const plaza=new T.Group();plaza.position.set(-78,0,-39);world.add(plaza);
 box(plaza,[0,.02,0],[54,.08,57],'#b6b293');
 const basin=mesh(new T.CylinderGeometry(6,6.3,.6,48),'#d4c6a5',plaza,[0,.35,0]);
 mesh(new T.CylinderGeometry(5.6,5.6,.12,48),mat('#6aaba6',{roughness:.25,metalness:.28}),plaza,[0,.68,0]);
 rod(plaza,[0,.5,0],[0,3.8,0],.3,'#e8daba');mesh(new T.CylinderGeometry(2.4,1.7,.35,32),'#cbbc98',plaza,[0,3.2,0]);
 for(let i=0;i<14;i++){const a=i*Math.PI/7,x=Math.cos(a)*20,z=Math.sin(a)*22;box(plaza,[x,.2,z],[3,.4,3],'#a39578');rod(plaza,[x,.4,z],[x,5.3,z],.14,'#726246');for(let j=0;j<5;j++){const q=j*1.26;ball(plaza,[x+Math.cos(q)*1.1,5.9+Math.sin(j)*.5,z+Math.sin(q)*1.1],[1.7,1.2,1.7],['#68884e','#8c9b57','#4c743f'][j%3]);}}
 for(let i=0;i<26;i++){const x=-290+i*19,z=-222-rand()*35,h=19+rand()*42;box(world,[x,h/2,z],[11+rand()*7,h,12],mat(['#8da69b','#b1b4a0','#94a6a2','#b9b89f'][i%4],{roughness:.7}));for(let y=3;y<h;y+=3)box(world,[x,y,z+6.05],[8,.11,.02],'#c5d0bf');}
 // Pearl River outside the southern side of the circuit.
 const waterGeo=new T.PlaneGeometry(800,390,80,40);waterGeo.rotateX(-Math.PI/2);
 const water=mesh(waterGeo,mat('#447f87',{metalness:.38,roughness:.26}),world,[-60,-.65,302]);water.castShadow=false;
 const waterBase=waterGeo.attributes.position.array.slice();
 for(let i=0;i<65;i++){const s=.61*C.L+rand()*.22*C.L,p=C.at(s,18+rand()*8);if(p.z<75)continue;const b=box(world,[p.x,-.42,p.z+40],[2+rand()*7,.012,.06],'#b7cec0');b.castShadow=false;}
 box(world,[-40,-.65,330],[800,2,80],'#7d977a');
 for(let i=0;i<42;i++){const x=-285+i*13,h=18+rand()*69,g=new T.Group();g.position.set(x,0,302+rand()*12);world.add(g);box(g,[0,h/2,0],[8+rand()*6,h,10],mat(['#728f91','#8ba5a0','#95aba0','#7f9895'][i%4],{roughness:.45,metalness:.15}));for(let y=3;y<h;y+=3.2)box(g,[0,y,-5.03],[7,.17,.03],'#e4c99d');}
 const tower=new T.Group();tower.position.set(76,0,191);world.add(tower);
 for(let i=0;i<22;i++){const a=i*Math.PI*2/22,pts=[];for(let j=0;j<=32;j++){const y=j*2.85,r=3.5+6.4*Math.pow((y-40)/48,2);pts.push([Math.cos(a+y*.028)*r,y,Math.sin(a+y*.028)*r]);}curve(tower,pts,.14,mat('#d8ba9a',{metalness:.5,roughness:.38}),44);}
 for(let y=8;y<93;y+=7){const r=3.5+6.4*Math.pow((y-40)/48,2),ring=mesh(new T.TorusGeometry(r,.14,6,40),'#d3b69e',tower,[0,y,0]);ring.rotation.x=Math.PI/2;}rod(tower,[0,90,0],[0,117,0],.17,'#d3cbb0');
 ribbon(-8.2,8.2,mat('#b1a68b'),-.23,C.L*.61,C.L*.79);
 for(let s=C.L*.617;s<C.L*.783;s+=7){const g=group(s),h=C.at(s).y;if(h>1.2)for(const x of [-5.8,5.8])box(g,[x,-h*.5-.2,0],[.75,h,1.3],'#b9b59d');}
 const bridge=group(C.L*.695);for(const side of [-1,1]){rod(bridge,[side*9.6,-4,-28],[side*9.6,20,-28],.28,'#e9cfa4');rod(bridge,[side*9.6,-4,28],[side*9.6,20,28],.28,'#e9cfa4');curve(bridge,[[side*9.6,20,-28],[side*9.6,13,-14],[side*9.6,10,0],[side*9.6,13,14],[side*9.6,20,28]],.14,'#e1c094',40);for(let z=-25;z<=25;z+=5)rod(bridge,[side*9.6,1,z],[side*9.6,10+10*Math.pow(z/28,2),z],.047,'#e9d9b6');}
 const balloons=[];for(let j=0;j<4;j++){const g=group(j*C.L*.25+26,-23),b=ball(g,[0,19+j,0],[1.8,2.35,1.8],['#e4965c','#82aaaa','#dfba68','#c17665'][j]);rod(g,[0,3,0],[0,17+j,0],.012,'#998264');balloons.push(b);}
 // Merge static meshes by material for the race, retaining only animated water/balloons.
 bake(world,new Set([water,...balloons]));
 return {world,water,update(time){const p=waterGeo.attributes.position;for(let i=0;i<p.count;i++){const x=waterBase[i*3],z=waterBase[i*3+2];p.setY(i,Math.sin(x*.13+time*.8)*.095+Math.sin(z*.18-time*.7)*.08);}p.needsUpdate=true;for(let i=0;i<balloons.length;i++)balloons[i].position.y=19+i+Math.sin(time*.6+i)*.3;},text};
}
function bake(group,skip=new Set()){
 group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),bins=new Map(),remove=[];
 function visit(o){if(skip.has(o))return;if(o.isMesh&&!Array.isArray(o.material)){
  const key=o.material.uuid+':'+Boolean(o.geometry.attributes.color);if(!bins.has(key))bins.set(key,{material:o.material,pos:[],normal:[],uv:[],color:[],shadow:false});const b=bins.get(key),g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(inv.clone().multiply(o.matrixWorld));b.pos.push(g.attributes.position.array);b.normal.push(g.attributes.normal.array);b.uv.push(g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2));if(g.attributes.color)b.color.push(g.attributes.color.array);b.shadow=b.shadow||o.castShadow;remove.push(o);
 }else for(const child of o.children)visit(child);}
 for(const child of group.children)visit(child);
 const join=arrays=>{const out=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
 for(const o of remove)o.removeFromParent();
 for(const b of bins.values()){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(join(b.pos),3));g.setAttribute('normal',new T.BufferAttribute(join(b.normal),3));g.setAttribute('uv',new T.BufferAttribute(join(b.uv),2));if(b.color.length)g.setAttribute('color',new T.BufferAttribute(join(b.color),3));g.computeBoundingSphere();const m=new T.Mesh(g,b.material);m.castShadow=b.shadow;m.receiveShadow=true;group.add(m);}
}
root.RaceWorld={build,bake};
})(window);
