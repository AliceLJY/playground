/* Guangzhou arcade cycling prototype. Original geometry, local Three.js r160. */
(function(){'use strict';const $=id=>document.getElementById(id);try{
 const T=window.THREE,C=window.RideCore,reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let state=C.create(),input={},clockTime=0,lastTime=performance.now(),frames=0,metricsStart=performance.now(),lastPhase='',toastTimer,soundOn=false,audioContext,modalReturn='ride';
 const scene=new T.Scene();scene.background=new T.Color('#d9e9e5');scene.fog=new T.Fog('#d9e9e5',105,330);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('world').appendChild(renderer.domElement);
 const camera=new T.PerspectiveCamera(54,innerWidth/innerHeight,.1,550);
 scene.add(new T.HemisphereLight('#fff4d9','#6e9978',1.7));
 const sun=new T.DirectionalLight('#ffe5b7',2.4);sun.position.set(-20,35,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-26,right:26,top:28,bottom:-28,near:.5,far:100});sun.shadow.normalBias=.035;scene.add(sun,sun.target);
 const staticWorld=new T.Group();scene.add(staticWorld);
 const solidSpecs=[],obstacles=[];
 function solid(g,x,z,hx,hz,kind,minY=0,maxY=3){solidSpecs.push({g,x,z,hx,hz,kind,minY,maxY});}
 function collectSolids(){staticWorld.updateMatrixWorld(true);for(const o of solidSpecs){const v=new T.Vector3(o.x,0,o.z).applyMatrix4(o.g.matrixWorld),scale=o.g.getWorldScale(new T.Vector3()),q=o.g.getWorldQuaternion(new T.Quaternion()),angle=new T.Euler().setFromQuaternion(q,'YXZ').y;obstacles.push({x:v.x,z:v.z,hx:o.hx*scale.x,hz:o.hz*scale.z,angle,minY:v.y+o.minY*scale.y,maxY:v.y+o.maxY*scale.y,kind:o.kind});}}

    const mats = new Map();
    function mat(color, opts = {}) { const key = color + JSON.stringify(opts); if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({ color, roughness: .93, ...opts })); return mats.get(key); }
    function mesh(geo, material, parent, pos = [0, 0, 0], scale) { const m = new T.Mesh(geo, typeof material === 'string' ? mat(material) : material); m.position.set(...pos); if (scale) m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
    const boxGeo = new T.BoxGeometry(1, 1, 1), sphereGeo = new T.SphereGeometry(1, 16, 10), leafGeo = new T.IcosahedronGeometry(1, 1);
    function box(p, x, y, z, w, h, d, color) { return mesh(boxGeo, color, p, [x, y, z], [w, h, d]); }
    function ball(p, x, y, z, rx, ry, rz, color, geo = sphereGeo) { return mesh(geo, color, p, [x, y, z], [rx, ry, rz]); }
    function rod(p, a, b, radius, color, sides = 8) { const va = new T.Vector3(...a), vb = new T.Vector3(...b), delta = vb.clone().sub(va); const m = mesh(new T.CylinderGeometry(radius, radius, delta.length(), sides), color, p); m.position.copy(va.add(vb).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m; }
    let seed = 9327; function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
 function point(s,offset=0,y=0){const p=C.at(C.MAIN,s,offset);return new T.Vector3(p.x,p.y+y,p.z);}
 function heading(s){return C.at(C.MAIN,s).heading;}
 function placed(s,offset=0){const g=new T.Group();g.position.copy(point(s,offset));g.rotation.y=heading(s);staticWorld.add(g);return g;}
 function worldGroup(x,z,y=0){const g=new T.Group();g.position.set(x,y,z);staticWorld.add(g);return g;}
 function ribbon(road,left,right,color,lift=.02){const arr=[];for(let s=0;s<road.length;s+=1.8){const n=Math.min(road.length-.001,s+1.8);const q=[C.at(road,s,left),C.at(road,s,right),C.at(road,n,left),C.at(road,n,right)];for(const i of [0,1,2,1,3,2])arr.push(q[i].x,q[i].y+lift,q[i].z);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(arr,3));geo.computeVertexNormals();const m=mesh(geo,mat(color,{side:T.DoubleSide}),staticWorld);m.castShadow=false;return m;}
    function label(text, width, height, bg = '#f2e4bb', fg = '#355847', font = 68) {
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,768,192);ctx.strokeStyle=fg;ctx.lineWidth=5;ctx.strokeRect(15,15,738,162);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${font}px "Songti SC",serif`;ctx.fillText(text,384,102,720);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const material=new T.MeshStandardMaterial({map:tex,roughness:1});return new T.Mesh(new T.PlaneGeometry(width,height),material);
    }
    function plant(p,x,y,z,scale=1){solid(p,x,z,.25*scale,.25*scale,'花盆',y,y+.7*scale);mesh(new T.CylinderGeometry(.26,.17,.45,9),'#b67a56',p,[x,y+.225*scale,z],[scale,scale,scale]);for(let i=0;i<5;i++){const a=i*2.4;ball(p,x+Math.sin(a)*.23*scale,y+.6*scale,z+Math.cos(a)*.23*scale,.17*scale,.4*scale,.12*scale,['#526d40','#6d8751','#79915a'][i%3],leafGeo);}}
    function windowUnit(p,x,y,z,w=1.1,h=1.6){box(p,x,y,z,w+.16,h+.16,.15,'#efe3c3');box(p,x,y,z+.09,w,h,.09,'#315d53');box(p,x,y,z+.16,.055,h,.045,'#c2c5a1');box(p,x,y,z+.16,w,.06,.045,'#c2c5a1');for(const side of [-1,1]){box(p,x+side*(w*.5+.22),y,z+.15,.31,h,.09,'#497768');for(let k=0;k<7;k++)box(p,x+side*(w*.5+.22),y-h*.4+k*h*.13,z+.21,.31,.034,.035,'#365f55');}box(p,x,y-h*.5-.15,z+.16,w+.4,.13,.38,'#e4d9bc');}
    const names=['榕记茶楼','街角花店','有记凉茶','慢慢书屋','木棉杂货','阿婆糖水','好天气照相馆','旧时光理发','街坊小铺'];
    function house(s,side,index){const g=placed(s,side*10.3);g.rotation.y+=side<0?Math.PI/2:-Math.PI/2;const w=8.3,h=6.8+(index%3)*.6,d=4.8;const colors=['#e8d2a5','#f0dfbc','#decda8','#c8d1b8','#e6c3a3'];const wall=colors[index%colors.length];solid(g,0,-.4,w/2,1.9,'骑楼店面');for(const x of [-3.95,0,3.95])solid(g,x,2.15,.25,.32,'骑楼柱子');
      box(g,0,h*.5+2.5,0,w,h,d,wall);box(g,0,.55,-.35,w,1.1,d-1,'#a6aa8e');box(g,0,1.75,-.45,w,2.4,d-1.05,'#617c65');
      for(const x of [-3.95,0,3.95]){box(g,x,1.65,2.15,.32,3.15,.44,'#e6dab9');box(g,x,.28,2.15,.5,.38,.63,'#d0c6a7');box(g,x,3.16,2.15,.54,.25,.68,'#f4e8c9');}
      box(g,0,3.25,2.4,w+.3,.24,.65,'#e9ddbd');box(g,0,3.58,2.27,w,.49,.3,wall);
      const back=new T.Group();back.rotation.y=Math.PI;g.add(back);for(const x of [-2.4,2.4])for(const y of [4.75,7.3])windowUnit(back,x,y,2.45,.85,1.35);
      // Repeated arched arcade frames.
      for(const x of [-1.98,1.98]){const shape=new T.Shape();shape.absarc(0,0,1.74,0,Math.PI,false);shape.lineTo(-1.74,-.19);shape.absarc(0,-.19,1.47,Math.PI,0,true);shape.closePath();const arch=mesh(new T.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:false,curveSegments:12}),'#f1e5c8',g,[x,2.3,2.18]);arch.castShadow=true;}
      for(let level=0;level<2;level++)for(const x of [-2.65,0,2.65])windowUnit(g,x,4.75+level*2.55,2.45,1.0,1.55);
      box(g,0,h+2.58,0,w+.32,.23,d+.36,'#efdfbd');box(g,0,h+2.87,2.1,w+.15,.37,.3,wall);box(g,0,h+3.1,2.1,w+.4,.16,.5,'#ede0bf');
      if(index%2===0){box(g,0,5.87,2.65,w-.5,.15,.95,'#ddcfad');for(let i=0;i<15;i++)box(g,-3.4+i*.485,6.25,3.02,.05,.65,.05,'#55756a');rod(g,[-3.5,6.55,3.02],[3.5,6.55,3.02],.045,'#55756a');}
      const sign=label(names[index%names.length],3.05,.67,index%3===0?'#954f36':'#e8d4a1',index%3===0?'#fff0cf':'#375849');sign.position.set(0,2.25,1.95);g.add(sign);
      for(const x of [-2.8,2.8]){box(g,x,1.1,1.62,1.15,2.1,.2,'#3b6658');box(g,x,1.3,1.75,.035,1.25,.05,'#baa883');}
      if(index%3===0){for(let i=0;i<7;i++){const aw=box(g,-2.7+i*.9,2.65,2.96,.9,.1,1.6,i%2?'#efe3c6':'#ad6047');aw.rotation.x=.14;box(g,-2.7+i*.9,2.49,3.72,.9,.27,.07,i%2?'#efe3c6':'#ad6047');}}
      plant(g,-3.5,.13,3.3,.85);if(index%2)plant(g,3.5,.13,3.1,.7);
      if(index%4===1){for(let i=0;i<12;i++)box(g,-2.6+i*.2,1.22,1.88,.055,2.25,.08,'#7b6046');box(g,-1.5,2.39,1.94,2.5,.1,.15,'#ba956c');}
      if(index%4===2){box(g,-1.9,1.12,2.1,1.55,.8,.5,'#8a694a');for(let i=0;i<3;i++)mesh(new T.CylinderGeometry(.21,.21,.43,10),'#866344',g,[-2.4+i*.48,1.73,2.1]);solid(g,-1.9,2.1,.78,.25,'凉茶柜');}
      if(index%3===1){box(g,0,h+3.28,1.9,4.2,.62,.4,wall);box(g,0,h+3.67,1.9,2.4,.22,.48,'#efe4cc');const emblem=mesh(new T.TorusGeometry(.32,.055,5,18),'#b5a483',g,[0,h+3.3,2.13]);}
      if(index%3===2){const crest=mesh(new T.TorusGeometry(1.3,.16,5,24,Math.PI),'#e9dbb8',g,[0,h+3.2,1.9]);crest.scale.y=.6;for(const x of [-1.3,1.3])box(g,x,h+3.25,1.9,.3,.65,.4,wall);}
      rod(g,[3.75,.2,-2.46],[3.75,h+2.7,-2.46],.055,'#6d8074');
      for(let i=0;i<4;i++)box(g,-2+i*1.4,h+3.1,1.9,.2,.35,.23,'#e6d4ae');
    }
    function tree(s,offset,size=1){const p=C.at(C.MAIN,s,offset);if(!pathClear(p.x,p.z,4))return;const g=placed(s,offset);solid(g,0,0,.8,.8,'树池');rod(g,[0,0,0],[.18,4.2*size,0],.22*size,'#766f49');for(let i=0;i<4;i++){const a=i*1.7;rod(g,[.1,2.8*size,0],[Math.cos(a)*1.6*size,5*size,Math.sin(a)*1.5*size],.11*size,'#80754e');}for(let i=0;i<13;i++){const a=i*2.4,r=(i%4)*.62;ball(g,Math.cos(a)*r*size,5.2*size+Math.sin(i*2)*.6*size,Math.sin(a)*r*size,1.6*size,(.8+rand()*.45)*size,1.55*size,['#718b4d','#869951','#597b47','#65834b'][i%4],leafGeo);}box(g,0,.17,0,1.6,.28,1.6,'#baad8c');return g;}
    function lamp(s,offset){const p=C.at(C.MAIN,s,offset);if(!pathClear(p.x,p.z,3.2))return;const g=placed(s,offset);solid(g,0,0,.15,.15,'路灯');rod(g,[0,.1,0],[0,3.4,0],.065,'#435f4e');box(g,0,.18,0,.3,.28,.3,'#566f55');rod(g,[0,3.2,0],[0,3.55,-.45],.055,'#435f4e');box(g,0,3.47,-.47,.34,.48,.34,'#e5d4a4');box(g,0,3.74,-.47,.48,.12,.48,'#49634e');}
    function bench(s,off){const g=placed(s,off);solid(g,0,.1,1.25,.5,'长椅');for(let i=0;i<4;i++)box(g,0,.6,-.3+i*.2,2.5,.1,.15,'#a78657');for(const x of [-.95,.95]){box(g,x,.32,0,.14,.55,.65,'#49624d');rod(g,[x,.6,.36],[x,1.3,.52],.05,'#49624d');}for(let i=0;i<3;i++)box(g,0,.91+i*.17,.45,2.5,.12,.1,'#a78657');}
    function bicycle(parent){const bike=new T.Group();parent.add(bike);const tires=[],cranks=[],mint='#679c86',metal='#68776b',cream='#e8d9ae';
      for(const z of [.88,-.93]){const w=new T.Group();w.position.set(0,.51,z);bike.add(w);const tire=mesh(new T.TorusGeometry(.45,.055,8,36),'#455448',w);tire.rotation.y=Math.PI/2;const rim=mesh(new T.TorusGeometry(.398,.018,5,32),cream,w);rim.rotation.y=Math.PI/2;for(let i=0;i<10;i++){const a=i*Math.PI/5;rod(w,[0,0,0],[0,Math.cos(a)*.397,Math.sin(a)*.397],.006,metal,4);}rod(w,[-.12,0,0],[.12,0,0],.035,metal);tires.push(w);}
      const rear=[0,.51,.88],front=[0,.51,-.93],crank=[0,.48,.02],saddle=[0,1.02,.43],neck=[0,1.03,-.71];
      for(const [a,b] of [[rear,saddle],[saddle,crank],[crank,rear],[crank,neck],[neck,saddle],[neck,front]])rod(bike,a,b,.035,mint);
      rod(bike,[0,.93,.42],[0,1.16,.47],.022,metal);ball(bike,0,1.2,.47,.18,.055,.24,'#895b3c');
      rod(bike,[0,.85,-.79],[0,1.47,-.69],.026,metal);rod(bike,[-.43,1.47,-.63],[.43,1.47,-.63],.025,metal);
      for(const side of [-1,1]){rod(bike,[side*.43,1.47,-.63],[side*.43,1.44,-.39],.038,'#876344');}
      const crankG=new T.Group();crankG.position.set(0,.48,.02);bike.add(crankG);for(const side of [-1,1]){rod(crankG,[0,0,0],[side*.2,0,side*.22],.021,metal);box(crankG,side*.25,0,side*.22,.19,.07,.15,'#8e8168');}cranks.push(crankG);
      // Wicker basket and a sprig of flowers.
      box(bike,0,1.16,-1.12,.58,.4,.4,'#be9c66');for(let i=0;i<5;i++){box(bike,0,1.0+i*.085,-1.33,.62,.022,.025,'#dfbd80');box(bike,-.3,1.0+i*.085,-1.12,.02,.022,.43,'#dfbd80');box(bike,.3,1.0+i*.085,-1.12,.02,.022,.43,'#dfbd80');}for(let i=0;i<6;i++)box(bike,-.26+i*.1,1.16,-1.35,.02,.42,.015,'#9b7a50');
      for(let i=0;i<3;i++){rod(bike,[i*.12-.15,1.25,-1.12],[i*.17-.2,1.7+i*.06,-1.13],.011,'#5a8050');for(let j=0;j<5;j++)ball(bike,i*.17-.2+Math.cos(j*1.26)*.063,1.7+i*.06+Math.sin(j*1.26)*.063,-1.13,.048,.048,.035,i===1?'#eddcb2':'#c9784f');}
      return {bike,tires,crank:cranks[0]};
    }
    function makeCat(parent,small=false,calico=false){const cat=new T.Group();parent.add(cat);const orange=calico?'#f3e8d1':'#dc8d35',light=calico?'#fff0da':'#edaf50',stripe=calico?'#bc713c':'#ad652d',white='#fff0d3';
      const body=new T.Group();cat.add(body);ball(body,0,1.57,.29,.41,.55,.35,orange);ball(body,0,1.52,-.012,.3,.4,.1,white);
      const head=new T.Group();head.position.set(0,2.23,.0);body.add(head);ball(head,0,0,0,.56,.48,.47,light);ball(head,-.27,-.17,-.31,.27,.23,.21,light);ball(head,.27,-.17,-.31,.27,.23,.21,light);
      for(const side of [-1,1]){const ear=mesh(new T.ConeGeometry(.245,.51,3),orange,head,[side*.36,.42,.0]);ear.rotation.z=side*-.16;ear.rotation.y=side*.25;const inner=mesh(new T.ConeGeometry(.14,.32,3),'#d58d74',head,[side*.36,.44,-.06]);inner.rotation.z=side*-.16;inner.rotation.y=side*.25;
        ball(head,side*.225,-.045,-.427,.055,.073,.037,'#2a493b');ball(head,side*.233,-.022,-.459,.016,.019,.01,'#fff8db');ball(head,side*.14,-.23,-.42,.165,.105,.095,white);ball(head,side*.37,-.17,-.395,.077,.039,.019,'#d58664');
        for(let i=0;i<3;i++)rod(head,[side*.27,-.225+i*.043,-.47],[side*.64,-.27+i*.075,-.4],.009,'#80684b',4);
        for(let i=0;i<2;i++){const st=ball(head,side*.49,.08+i*.12,-.11,.045,.07,.15,stripe);st.rotation.z=side*-.35;}
      }
      ball(head,0,-.18,-.524,.047,.031,.028,'#a77465');rod(head,[0,-.2,-.512],[0,-.25,-.52],.009,'#80684b',4);rod(head,[0,-.25,-.52],[-.05,-.275,-.49],.009,'#80684b',4);rod(head,[0,-.25,-.52],[.05,-.275,-.49],.009,'#80684b',4);
      for(let i=-1;i<=1;i++){const st=ball(head,i*.135,.31,-.32,.047,.15,.041,stripe);st.rotation.z=i*-.24;}
      for(let i=0;i<3;i++)ball(body,0,1.62+i*.16,.602,.27,.045,.043,stripe);
      // Neckerchief: a muted teal accent, independent of the bicycle.
      mesh(new T.TorusGeometry(.245,.065,6,18),'#597f72',body,[0,1.96,.01]).rotation.x=Math.PI/2;
      const scarf=mesh(new T.ConeGeometry(.18,.39,3),'#668e7b',body,[.12,1.75,.08]);scarf.rotation.z=-.35;
      for(const side of [-1,1]){rod(body,[side*.3,1.83,.05],[side*.43,1.46,-.37],.105,orange,10);ball(body,side*.43,1.46,-.4,.115,.1,.125,white);}
      const feet=[];for(const side of [-1,1]){const upper=mesh(new T.CylinderGeometry(.16,.13,1,10),orange,body),lower=mesh(new T.CylinderGeometry(.12,.10,1,10),orange,body),paw=ball(body,side*.28,.5,0,.14,.085,.18,white);feet.push({side,upper,lower,paw});}
      const tailRoot=new T.Group();tailRoot.position.set(0,1.33,.58);body.add(tailRoot);const tailParts=[];const tailCurve=new T.CatmullRomCurve3([[0,0,0],[.06,-.04,.3],[.22,.06,.6],[.26,.35,.78],[.18,.64,.7]].map(v=>new T.Vector3(...v)));mesh(new T.TubeGeometry(tailCurve,28,.10,9,false),orange,tailRoot);for(const t of [.23,.46,.7,.9]){const pts=[];for(let j=0;j<5;j++)pts.push(tailCurve.getPoint(Math.min(1,t-.036+j*.018)));mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),6,.103,9,false),stripe,tailRoot);}ball(tailRoot,.18,.64,.7,.1,.1,.1,orange);
      if(calico){
        ball(head,-.31,.15,-.29,.29,.34,.23,'#413e39');ball(head,.32,.19,.13,.30,.30,.35,'#c3793f');
        ball(body,-.20,1.57,.54,.27,.33,.14,'#393d38');ball(body,.22,1.80,.49,.25,.22,.20,'#c3793f');
        ball(body,.31,1.39,.13,.17,.22,.30,'#c3793f');
        mesh(new T.TorusGeometry(.265,.075,6,18),'#c46b69',body,[0,1.96,.02]).rotation.x=Math.PI/2;
      }
      if(small){cat.scale.setScalar(.63);cat.position.y=-.6;}
      return {cat,body,head,feet,tailRoot,tailParts};
    }

 // A compressed, authored Guangzhou: arcade streets, garden villas, waterfront and a cross-town lane.
 box(staticWorld,-55,-.38,-40,380,.7,250,'#a6bd91');
 const water=box(staticWorld,-45,.02,162,460,.18,190,mat('#5babae',{roughness:.36,metalness:.12}));water.castShadow=false;
 for(const road of C.ROADS){ribbon(road,-road.width-1.5,road.width+1.5,'#e5d4b1',.045);ribbon(road,-road.width,road.width,road.id==='lane'?'#c1b59c':'#a3a89c',.065);ribbon(road,-road.width-.12,-road.width+.03,'#fff0cb',.085);ribbon(road,road.width-.03,road.width+.12,'#fff0cb',.085);}
 for(let s=0;s<C.END;s+=5){const g=placed(s);box(g,0,.09,0,.13,.02,1.6,'#f6e7bd');}
 function pathClear(x,z,r=5){return C.nearest(x,z,C.PATHS).distance>r;}
 function clearOfBranch(s,side){const p=C.at(C.MAIN,s,side*12);return C.nearest(p.x,p.z,[C.BRANCH]).distance>13&&pathClear(p.x,p.z,8);}
 let hi=0;
 for(let s=6;s<C.END*.29;s+=10)for(const side of [-1,1])if(clearOfBranch(s,side)){house(s,side,hi++);}
 function villa(s,side,index){const vp=C.at(C.MAIN,s,side*15);if(!pathClear(vp.x,vp.z,8))return;const g=placed(s,side*15);g.rotation.y+=side<0?Math.PI/2:-Math.PI/2;const brick=index%3===0,wall=brick?'#b8785e':['#ead7b9','#eddcc7','#d7e3d3','#e4bda8'][index%4];solid(g,0,0,5,3.5,'洋楼');solid(g,0,5.9,5,.09,'花园围栏');
  box(g,0,3.2,0,9,6.3,6,wall);box(g,0,.35,0,10,.7,7,'#c5b899');box(g,0,6.4,0,9.7,.3,6.7,'#fff0d6');
  const rear=new T.Group();rear.rotation.y=Math.PI;g.add(rear);for(const x of [-2.7,0,2.7])for(const y of [2,4.8])windowUnit(rear,x,y,3.05,1.05,1.55);box(rear,0,3.3,3.08,9,.16,.12,'#eadfc5');
  for(const side of [-1,1]){const flank=new T.Group();flank.position.x=side*4.53;flank.rotation.y=side*Math.PI/2;g.add(flank);for(const x of [-1.65,1.65])for(const y of [2,4.8])windowUnit(flank,x,y,0,1.05,1.55);}
  if(brick){for(let y=.7;y<6.2;y+=.28)box(rear,0,y,3.013,8.9,.018,.014,'#c99478');for(const x of [-4.3,4.3])box(rear,x,3.2,3.10,.38,6.3,.16,'#f3e7cd');}
  const roof=mesh(new T.ConeGeometry(6.5,2.4,4),'#a67458',g,[0,7.5,0]);roof.rotation.y=Math.PI/4;roof.scale.z=.76;
  for(const x of [-3,0,3])for(const y of [2,4.8]){windowUnit(g,x,y,3.05,1.3,1.7);if(brick){const arch=mesh(new T.TorusGeometry(.79,.095,5,18,Math.PI),'#f3e7cd',g,[x,y+.85,3.19]);for(const side of [-1,1])box(g,x+side*.8,y,3.18,.14,1.7,.12,'#f3e7cd');}}
  if(brick){for(let y=.7;y<6.2;y+=.28)box(g,0,y,3.012,8.9,.018,.014,'#c99478');for(const x of [-4.3,4.3])box(g,x,3.2,3.10,.38,6.3,.16,'#f3e7cd');box(g,0,3.35,3.75,8.8,.17,1.4,'#f3e7cd');for(let i=0;i<22;i++)rod(g,[-4.1+i*.39,3.4,4.35],[-4.1+i*.39,4.2,4.35],.025,'#4d6459');rod(g,[-4.3,4.2,4.35],[4.3,4.2,4.35],.04,'#4d6459');}
  for(const x of [-1.9,1.9]){rod(g,[x,.7,4],[x,4.5,4],.17,'#f6e8c9');box(g,x,4.5,4,.55,.18,.55,'#fff3d6');}
  box(g,0,4.7,4,5,.26,2.6,'#f5e4c6');box(g,0,.2,4.4,5,.4,3,'#dbc7a5');
  for(let i=0;i<11;i++)box(g,-5+i,1,5.9,.07,1.8,.07,'#4e7b6b');rod(g,[-5,1.8,5.9],[5,1.8,5.9],.055,'#4e7b6b');plant(g,-4,.3,4.4,1.4);plant(g,4,.3,4.4,1.4);
 }
 for(let s=C.END*.31;s<C.END*.59;s+=21){villa(s,-1,hi++);if(clearOfBranch(s,1))villa(s,1,hi++);}
 for(let s=C.END*.64;s<C.END*.93;s+=17){if(clearOfBranch(s,-1))villa(s,-1,hi++);}
 for(let s=0;s<C.END;s+=14){const f=s/C.END;if(f>.30&&f<.60){tree(s,8,.8+rand()*.25);tree(s,-8,.85+rand()*.3);}else if(f>.61){tree(s,-8,.65+rand()*.18);}else if(s%28<15)tree(s,7.4,.6);}
 for(let s=0;s<C.END;s+=28)lamp(s,C.at(C.MAIN,s).z>25?-6.7:6.7);
 for(let s=C.END*.67;s<C.END*.91;s+=20)bench(s,7.1);
 for(let s=C.END*.635;s<C.END*.745;s+=3){const p=C.at(C.MAIN,s),g=placed(s);box(g,0,-p.y/2-.5,0,11.1,p.y+.08,3.1,'#beaE91');}
 function banner(g,text){for(const x of [-6.9,6.9]){solid(g,x,0,.33,.33,'牌楼柱子');rod(g,[x,0,0],[x,5.8,0],.20,'#964f3b');box(g,x,.35,0,.65,.6,.65,'#d5bb91');}box(g,0,5.7,0,15,.65,.9,'#98523d');const roof=box(g,0,6.2,0,16,.23,1.9,'#49786a');const sign=label(text,5.4,1.15,'#8b4838','#ffe9b4',68);sign.position.set(0,5.6,.51);g.add(sign);}
 banner(placed(47),'西关 · 骑楼街');
 // The shortcut has its own red-brick walls, laundry and lantern strings.
 for(let s=18;s<C.BRANCH.length-18;s+=13){const p=C.at(C.BRANCH,s),g=worldGroup(p.x,p.z);g.rotation.y=p.heading;
  for(const side of [-1,1]){const wp=new T.Vector3(side*7,0,0).applyAxisAngle(new T.Vector3(0,1,0),p.heading).add(new T.Vector3(p.x,0,p.z));if(!pathClear(wp.x,wp.z,8))continue;solid(g,side*7,0,1.65,5,'红砖墙');box(g,side*7,2.2,0,3.3,4.4,10,'#b88369');box(g,side*7,4.5,0,3.8,.25,10.6,'#687e6e');const sign=label(side<0?'榕巷糖水':'街坊修车',2.7,.7,'#f0d7a1','#7b4d39');sign.position.set(side*5.3,2.7,0);sign.rotation.y=side<0?Math.PI/2:-Math.PI/2;g.add(sign);const front=new T.Group();front.position.set(side*5.30,0,-1.4);front.rotation.y=side<0?Math.PI/2:-Math.PI/2;g.add(front);windowUnit(front,0,2,0,1.05,1.45);box(g,side*5.28,1.1,2.5,.07,2.2,1.35,'#577f6b');for(let k=0;k<4;k++)box(g,side*5.23,.3+k*.49,2.5,.04,.035,1.2,'#b1bea0');}
  rod(g,[-5.5,5.3,0],[5.5,5.3,0],.02,'#77694f');for(let i=0;i<5;i++){const x=-4+i*2;ball(g,x,4.8,0,.32,.42,.32,'#d66e43');rod(g,[x,4.4,0],[x,4.12,0],.025,'#e6bc5f');}
 }
 // Garden pavilion, flowerbeds and a fountain.
 const park=worldGroup(-104,-35);for(const x of [-4,4])for(const z of [-4,4])rod(park,[x,0,z],[x,4.7,z],.19,'#e8dbb9');const pr=mesh(new T.ConeGeometry(7,2.2,4),'#689c87',park,[0,5.5,0]);pr.rotation.y=Math.PI/4;
 const fountain=worldGroup(-113,-66);solid(fountain,0,0,3.9,3.9,'喷泉');mesh(new T.CylinderGeometry(3.7,3.9,.5,32),'#d5c6a7',fountain,[0,.3,0]);mesh(new T.CylinderGeometry(3.3,3.3,.12,32),'#73b6b2',fountain,[0,.58,0]);rod(fountain,[0,.5,0],[0,2.3,0],.23,'#eee1c0');mesh(new T.CylinderGeometry(1.6,1.1,.28,24),'#ddd1b1',fountain,[0,2.1,0]);
 for(let i=0;i<40;i++){const x=-111+rand()*22,z=-49+rand()*28;if(C.nearest(x,z).distance<10)continue;ball(staticWorld,x,.35,z,.4,.4,.4,['#c8787b','#e8bc5e','#a69cc7'][i%3],leafGeo);}
 // River promenade, a low bridge crest, boats and a recognisable Canton Tower silhouette.
 for(let s=C.END*.65;s<C.END*.94;s+=3){const rp=C.at(C.MAIN,s,7.6);if(!pathClear(rp.x,rp.z,4))continue;const g=placed(s,7.6);solid(g,0,1.4,.1,1.5,'江边栏杆');box(g,0,.7,0,.18,1.3,.18,'#ecdbb6');box(g,0,1.2,1.4,.10,.12,2.9,'#d5c6a5');}
 const tower=worldGroup(80,110);tower.scale.setScalar(.78);for(let i=0;i<18;i++){const a=i*Math.PI*2/18,curve=[];for(let j=0;j<=30;j++){const y=j*1.65,r=2+4*Math.pow((y-23)/26,2),twist=a+y*.028;curve.push(new T.Vector3(Math.cos(twist)*r,y,Math.sin(twist)*r));}mesh(new T.TubeGeometry(new T.CatmullRomCurve3(curve),40,.10,5,false),['#ebc5a3','#dca58f','#c49faa'][i%3],tower);}for(const y of [4,12,23,34,44,48]){const r=2+4*Math.pow((y-23)/26,2);const ring=mesh(new T.TorusGeometry(r,.12,5,32),'#f3d8b3',tower,[0,y,0]);ring.rotation.x=Math.PI/2;}rod(tower,[0,48,0],[0,64,0],.16,'#ecd8b2');
 box(staticWorld,-30,.08,195,340,.4,60,'#a1bca1');
 for(let i=0;i<23;i++){const x=-150+i*11,h=12+rand()*25,z=174+rand()*12;box(staticWorld,x,h/2,z,7,h,8,['#a8c9c6','#b1ccd0','#b6cec3'][i%3]);for(let y=3;y<h;y+=3)box(staticWorld,x,y,z-4.05,6,.12,.12,'#e3dbc0');}
 for(let i=0;i<75;i++){const r=box(staticWorld,-210+rand()*360,.13,80+rand()*130,2+rand()*5,.015,.07,'#add8cc');r.castShadow=false;}
 const boats=[];for(let i=0;i<3;i++){const b=new T.Group();scene.add(b);b.position.set(-120+i*65,.25,95+i*14);box(b,0,.7,0,12,1.3,4,'#f0e2bb');box(b,0,1.8,0,8,1.4,3,'#fff3d9');box(b,0,2.7,0,9,.3,3.8,'#aa6655');for(let j=0;j<6;j++)box(b,-3+j*1.2,1.8,-1.55,.75,.75,.05,'#487d82');b.userData.x=b.position.x;boats.push(b);}
 // A small Cantonese opera stage provides a distinct landmark in the garden.
 const opera=worldGroup(-115,-31);opera.rotation.y=Math.PI/2;
 box(opera,0,.3,0,10,.6,5,'#aaa88d');solid(opera,0,0,5,2.5,'戏台台基',0,.7);
 box(opera,0,3.1,-2.2,9.5,5.1,.4,'#adad91');solid(opera,0,-2.2,4.75,.2,'戏台背墙');
 for(const x of [-4.4,4.4]){rod(opera,[x,.6,1.8],[x,5.6,1.8],.2,'#a4563c');solid(opera,x,1.8,.22,.22,'戏台柱子');box(opera,x,5.55,1.8,.65,.3,.65,'#ddd0aa');}
 box(opera,0,3.3,-1.9,5.6,4.8,.12,'#9e493d');for(const x of [-3.25,3.25])box(opera,x,3.4,-1.5,.9,4.6,.35,'#be6a4e');
 box(opera,0,5.9,0,11.2,.25,6.2,'#53766a');for(const z of [-2.7,2.7])rod(opera,[-5.7,5.85,z],[5.7,5.85,z],.13,'#657e69');
 for(const side of [-1,1]){const wing=box(opera,side*5.1,6.16,0,1.25,.16,6.2,'#53766a');wing.rotation.z=side*.28;}
 const operaName=label('榕荫戏台',4.2,.9,'#784938','#f2dba6');operaName.position.set(0,5.3,2.12);opera.add(operaName);
 for(const x of [-5.6,5.6])plant(opera,x,0,2.5,1.3);
 // Low grey-brick gateway beside the arcade district, kept clear of the carriageway.
 const gate=placed(C.END*.18,-18);gate.rotation.y+=Math.PI/2;
 for(const x of [-2.9,2.9]){box(gate,x,1.7,0,1.1,3.4,.65,'#929888');solid(gate,x,0,.55,.33,'西关门楼');for(let y=.3;y<3.3;y+=.32)box(gate,x,y,.34,1.08,.025,.025,'#bfc0a7');}
 box(gate,0,3.6,0,7.3,.4,.8,'#c5c4a9');box(gate,0,3.95,0,7.9,.18,1.35,'#527467');
 const gateName=label('榕巷里',2.5,.65,'#e2d3b2','#496553');gateName.position.set(0,3.6,.44);gate.add(gateName);
 // Direction boards at the actual junctions; their posts stand outside the path.
 for(const [road,d,text]of[[C.MAIN,C.END*.365,'花园 · 球场 →'],[C.BRANCH,C.BRANCH.length*.61,'← 球场    江边 ↑'],[C.MAIN,C.END*.81,'珠江来信 →']]){const p=C.at(road,d,road.width+1.7),g=worldGroup(p.x,p.z,p.y);g.rotation.y=p.heading;rod(g,[0,0,0],[0,2.8,0],.065,'#567460');solid(g,0,0,.08,.08,'指路牌');const l=label(text,3.8,.58,'#e9d7a8','#47695b',52);l.position.set(0,2.65,.04);g.add(l);}
 // Public garden paths connect the ring, the lane, the court and an open river edge.
 for(const path of C.PATHS){ribbon(path,-path.width,path.width,'#ddcba6',.075);}
 const court=worldGroup(C.COURT.x,C.COURT.z);box(court,0,.035,0,28,.06,38,'#b78b72');box(court,0,.078,0,24,.025,34,'#70978b');
 function paintLine(x,z,w,d){const m=box(court,x,.098,z,w,.012,d,'#f4e9ce');m.castShadow=false;}
 for(const x of [-11,11])paintLine(x,0,.12,32);for(const z of [-16,0,16])paintLine(0,z,22,.12);
 const mid=mesh(new T.TorusGeometry(2.2,.065,4,48),'#f4e9ce',court,[0,.105,0]);mid.rotation.x=Math.PI/2;mid.castShadow=false;
 for(const side of [-1,1]){paintLine(0,side*10,8,.12);for(const x of [-4,4])paintLine(x,side*13,.12,6);const g=new T.Group();g.position.z=side*17.2;court.add(g);solid(g,0,0,.18,.18,'球架');rod(g,[0,0,0],[0,4.3,0],.14,'#637e6f');box(g,0,3.9,-side*.5,2.8,1.5,.12,'#efe6ca');box(g,0,3.75,-side*.58,1.0,.7,.03,'#a87b62');const hoop=mesh(new T.TorusGeometry(.47,.04,5,24),'#bf7847',g,[0,3.32,-side*1]);hoop.rotation.x=Math.PI/2;for(let k=0;k<8;k++){const ang=k*Math.PI/4;rod(g,[Math.cos(ang)*.45,3.32,-side*1+Math.sin(ang)*.45],[Math.cos(ang)*.25,2.8,-side*1+Math.sin(ang)*.25],.012,'#e9e0c6');}}
 const courtSign=label('街坊球场 · 欢迎兜圈',5,.75,'#ead8ad','#487568',56);courtSign.position.set(C.COURT.x+15,2,C.COURT.z);courtSign.rotation.y=Math.PI/2;staticWorld.add(courtSign);
 // Pavilion legs and city perimeter are visible solids; grass itself is traversable.
 for(const x of [-4,4])for(const z of [-4,4])solid(park,x,z,.19,.19,'凉亭柱子');
 const edge=worldGroup(0,0);for(const [x,z,w,d] of [[-235,-45,.7,240],[130,-45,.7,240],[-52,-163,365,.7]]){box(edge,x,.6,z,w,1.2,d,'#658261');solid(edge,x,z,w/2,d/2,'绿篱',0,1.2);}
 // Teahouse and postal stops.
 const tea=placed(C.STOPS[0].at,-7);solid(tea,0,0,.8,.8,'茶桌');mesh(new T.CylinderGeometry(.8,.8,.12,16),'#b98c55',tea,[0,.95,0]);for(let i=0;i<3;i++)mesh(new T.CylinderGeometry(.2,.2,.17,12),'#ead3a1',tea,[-.4+i*.4,1.1,0]);
 const post=placed(C.STOPS[2].at,-7);solid(post,0,0,.4,.33,'邮筒');box(post,0,.9,0,.8,1.8,.65,'#40856f');box(post,0,1.3,.34,.48,.08,.03,'#edcf78');
 const rider=new T.Group();scene.add(rider);const bikeParts=bicycle(rider),catParts=makeCat(rider);rider.scale.setScalar(1.12);
 const rival=new T.Group();scene.add(rival);const rivalBike=bicycle(rival),rivalCat=makeCat(rival,false,true);rival.scale.setScalar(1.12);
 const rivalTag=label('三花 · 等你应战',3,.65,'#f8e8cc','#85574a',57);rivalTag.position.y=3.9;rival.add(rivalTag);
 const gates=C.GATES.map((s,i)=>{const p=C.at(C.MAIN,s),g=new T.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=p.heading;scene.add(g);for(const side of [-1,1]){rod(g,[side*5.1,0,0],[side*5.1,4.4,0],.11,'#d6944b');for(let k=0;k<4;k++)box(g,side*5.1,3+k*.32,0,.38,.18,.4,k%2?'#fff2cf':'#df9752');}const l=label(i===C.GATES.length-1?'江风终点':`路标 ${i+1}`,4.5,.8,'#f3d38d','#705b43',60);l.position.set(0,4.2,.05);g.add(l);g.visible=false;return g;});
 function ridingObstacles(){
  const r=state.race;if(!r||!['countdown','racing'].includes(r.status))return obstacles;
  const poles=[];for(let i=r.gate;i<C.GATES.length;i++){const scale=i===r.gate?1.08:1;for(const side of [-1,1]){const p=C.at(C.MAIN,C.GATES[i],side*5.1*scale);poles.push({x:p.x,z:p.z,hx:.19*scale,hz:.2*scale,angle:p.heading,minY:p.y,maxY:p.y+4.4*scale,kind:'比赛路标杆'});}}
  return obstacles.concat(poles);
 }
    function mergeStatic(root){root.updateMatrixWorld(true);const groups=new Map();root.traverse(o=>{if(!o.isMesh)return;const k=o.material.uuid;let g=groups.get(k);if(!g){g={material:o.material,positions:[],normals:[],uvs:[],shadow:false};groups.set(k,g);}const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);g.positions.push(geo.attributes.position.array);g.normals.push(geo.attributes.normal.array);g.uvs.push(geo.attributes.uv?geo.attributes.uv.array:new Float32Array(geo.attributes.position.count*2));g.shadow=g.shadow||o.castShadow;geo.dispose();});const merged=new T.Group();function joined(arrs){const result=new Float32Array(arrs.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrs){result.set(a,offset);offset+=a.length;}return result;}for(const g of groups.values()){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(joined(g.positions),3));geo.setAttribute('normal',new T.BufferAttribute(joined(g.normals),3));geo.setAttribute('uv',new T.BufferAttribute(joined(g.uvs),2));geo.computeBoundingSphere();const m=mesh(geo,g.material,merged);m.castShadow=g.shadow;}scene.remove(root);scene.add(merged);return merged;}
    collectSolids();mergeStatic(staticWorld);
 function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3400);}
 function tone(freq,duration=.25,volume=.045,delay=0){if(!soundOn)return;if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime+delay;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+duration+.02);}
 function bell(){if(state.phase!=='ride')return;state.bells++;tone(1568,.5,.08);tone(2093,.4,.045,.12);toast('叮铃——三花，前面借过！');}
 let primaryAction,secondaryAction;
 function modal(kind,title,content,primary,fn,secondary='',fn2=null){input={};$('dialog-kicker').textContent=kind;$('dialog-title').textContent=title;$('dialog-content').replaceChildren();if(typeof content==='string')$('dialog-content').innerHTML=content;else $('dialog-content').append(content);$('dialog-action').textContent=primary;$('dialog-action').disabled=false;primaryAction=fn;$('dialog-secondary').textContent=secondary;$('dialog-secondary').hidden=!secondary;secondaryAction=fn2;$('modal').hidden=false;$('dialog-action').focus();}
 function hide(){input={};$('modal').hidden=true;$('toast').classList.remove('show');}
 function closeModal(){if(state.phase==='challenge')C.decline(state);else if(state.phase==='dialog')C.close(state);else state.phase='ride';hide();}
 function showChallenge(){const portrait=document.createElement('div');portrait.innerHTML='<div class="cat-badge"><i></i><b></b><span>三花</span></div><p>“到江边，睇下边个快？”<br>沿金色路标骑过五个检查点。<br>按住 ↑ 加速，Shift 短暂冲刺；三花可不会等你。</p><p class="fine">应战会从骑楼起跑线出发 · 约一分钟<br>可以随时退出挑战，继续兜风。</p>';modal('街坊挑战 · 三花拦路','喂，阿橘！比一段？',portrait,'来，比一段！',()=>{C.accept(state);hide();snapCamera();tone(660,.2);},'今天只想兜风',()=>{C.decline(state);hide();toast('三花挪到路边：“下次见到，再比！”');});}
 function showResult(){const won=state.race.winner==='orange';tone(won?1046:523,.4);modal('江风挑战 · '+(won?'阿橘先到':'三花先到'),won?'阿橘，骑得可以喔！':'三花：下次再来！',`<div class="race-medal">${won?'风驰橘猫':'自在骑士'}</div><p>${won?'三花甩了甩尾巴：“下回我可认真了。”':'三花在江边等你：“风景太靓，睇入迷了？”'}<br>本次 ${state.race.time.toFixed(1)} 秒 · 通过 ${state.race.gate} / 5 个路标</p>`,'继续逛广州',()=>{state.phase='ride';hide();},'再和三花比一次',()=>{C.accept(state);hide();snapCamera();});}
 function visit(){if(!C.interact(state))return;const p=C.STOPS.find(p=>p.id===state.dialog);modal('沿途小憩',p.title,`<div class="stamp" style="color:${p.color}">${p.stamp}</div><p>${p.text}</p>`,'再骑一会儿',()=>{C.close(state);hide();});}
 function journal(){if(state.phase!=='ride'&&state.phase!=='paused')return;if(state.crash)return;state.phase='journal';modal('不必集齐，也是一趟好旅行','阿橘的旅行手账',C.STOPS.map(p=>`<div class="journal-item ${state.visits.includes(p.id)?'':'empty'}"><div class="stamp" style="color:${p.color}">${p.stamp}</div><div><strong>${p.short}</strong><p>${state.visits.includes(p.id)?'这段风景，已经收好。':'经过时可以停靠，也可以骑过去。'}</p></div></div>`).join(''),'合上手账',()=>{state.phase='ride';hide();});}
 function snapshot(){const pos=camera.position.clone(),quat=camera.quaternion.clone(),aspect=camera.aspect,fov=camera.fov,size=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio();const c=document.createElement('canvas');c.width=2880;c.height=2080;try{camera.aspect=2712/1580;camera.updateProjectionMatrix();renderer.setPixelRatio(1);renderer.setSize(2712,1580,false);renderer.render(scene,camera);const ctx=c.getContext('2d');ctx.fillStyle='#fbf4e4';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(renderer.domElement,84,84);ctx.fillStyle='#315848';ctx.font='88px "Songti SC",serif';ctx.fillText('今天，追着风骑。',116,1820);ctx.font='40px "PingFang SC",sans-serif';ctx.fillStyle='#7b8773';ctx.fillText('阿橘的广州骑游 · 灵感广州，艺术化街区',120,1926);ctx.textAlign='right';ctx.font='36px Georgia,serif';ctx.fillText('RIDE WILD. WANDER SLOW.',2752,1826);return c.toDataURL('image/png');}finally{camera.position.copy(pos);camera.quaternion.copy(quat);camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.render(scene,camera);}}
 function photo(){if(state.phase!=='ride')return;state.phase='photo';const data=snapshot(),wrap=document.createElement('div'),img=document.createElement('img');img.src=data;img.className='postcard-image';img.alt='阿橘在广州卡通街区的高清明信片';wrap.append(img);const a=document.createElement('a');a.href=data;a.download='阿橘广州骑游-高清明信片.png';a.className='download';a.textContent='保存高清明信片 · 2880 × 2080 ↓';wrap.append(a);modal('风景随手收好','寄一阵广州的风',wrap,'收好，继续骑',()=>{state.phase='ride';hide();});}
 function restart(){state=C.create();C.start(state);hide();input={};snapCamera();updateView();}
 function recover(){if(state.phase!=='ride')return;const n=C.nearest(state.x,state.z),p=C.at(n.road,n.at);state.x=p.x;state.z=p.z;state.y=p.y;state.speed=0;state.manual=0;toast('扶好车，继续出发。');}
 function doPause(){C.pause(state);input={};updateView();}
 function updateView(){const intro=state.phase==='intro';$('intro').hidden=!intro;$('intro-footer').hidden=!intro;$('ride-ui').hidden=intro;$('pause').hidden=intro;$('challenge').hidden=intro;$('journal').hidden=intro;$('pause-panel').hidden=state.phase!=='paused';$('pause').textContent=state.phase==='paused'?'继续':'暂停';}
 $('start').onclick=()=>{C.start(state);snapCamera();updateView();toast('自动导航默认关闭：松开方向就直行。↑ 加速 · Shift 冲刺');};
 $('brand').onclick=e=>{e.preventDefault();if(state.phase==='ride'||state.phase==='paused')doPause();};$('pause').onclick=doPause;$('resume').onclick=doPause;$('restart-pause').onclick=restart;
 $('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent='声音 · '+(soundOn?'开':'关');$('sound').setAttribute('aria-pressed',String(soundOn));tone(880,.2);};
 $('challenge').onclick=()=>{if(!state.crash&&(state.phase==='ride'||state.phase==='paused')){C.challenge(state);showChallenge();updateView();}};
 $('exit-race').onclick=()=>{state.race=null;if(!state.crash)state.phase='ride';toast('退出挑战，继续逛。三花下次再比。');};
 $('route-map').onclick=showRouteMap;$('stop-navigation').onclick=()=>{state.routeNav=null;state.assist=false;toast('导航已停止，保持当前车头自由骑行。');};
 $('journal').onclick=journal;$('photo').onclick=photo;$('visit').onclick=visit;$('bell').onclick=bell;$('recover').onclick=recover;
 $('cruise').onclick=()=>{if(state.phase==='ride')state.cruising=!state.cruising;};$('assist').onclick=()=>{state.assist=!state.assist;if(!state.assist)state.routeNav=null;toast(state.assist?'自动导航已开：松开方向后沿路骑。':'自动导航已关：车头朝哪就直行去哪，草地和小路也能骑。');};
 $('dialog-action').onclick=()=>primaryAction?.();$('dialog-secondary').onclick=()=>secondaryAction?.();$('dialog-x').onclick=closeModal;
 const keyMap={ArrowUp:'forward',KeyW:'forward',ArrowDown:'brake',KeyS:'brake',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ShiftLeft:'boost',ShiftRight:'boost',KeyB:'boost'};
 addEventListener('keydown',e=>{if(keyMap[e.code]){e.preventDefault();if(state.phase==='ride')input[keyMap[e.code]]=true;}if(e.repeat)return;if(e.code==='Space'&&state.phase==='ride'){e.preventDefault();bell();}if(e.code==='KeyE')visit();if(e.code==='KeyR')recover();if(e.code==='KeyP'||e.code==='Escape'){if(!$('modal').hidden)closeModal();else doPause();}if(e.code==='Tab'&&!$('modal').hidden){const els=[...$('modal').querySelectorAll('button,a[href]')].filter(el=>!el.hidden);if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}}});
 addEventListener('keyup',e=>{if(keyMap[e.code]){e.preventDefault();delete input[keyMap[e.code]];}});
 function clearInputs(){input={};document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
 addEventListener('blur',()=>{clearInputs();if(state.phase==='ride'||state.phase==='crash'){C.pause(state);updateView();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(state.phase==='ride'||state.phase==='crash'){C.pause(state);updateView();}}lastTime=performance.now();});
 document.querySelectorAll('[data-control]').forEach(btn=>{const control=btn.dataset.control;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);if(state.phase==='ride'){input[control]=true;btn.classList.add('held');}});for(const event of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(event,()=>{delete input[control];btn.classList.remove('held');});});
 function animateCat(parts,bike,pedal,speed,lean,dt,standing=0){bike.tires.forEach(w=>w.rotation.x=-pedal*1.65);bike.crank.rotation.x=-pedal;parts.body.position.y=reducedMotion?0:Math.sin(pedal*2)*Math.min(.025,speed*.004);parts.tailRoot.rotation.y=Math.sin(clockTime*3)*.16+lean*.25;parts.head.rotation.y=Math.sin(clockTime*.8)*.06;parts.feet.forEach(leg=>{const side=leg.side,angle=-pedal,hip=new T.Vector3(side*.28,1.32,.27),paw=new T.Vector3(side*.27,.48-Math.sin(angle)*side*.22,.02+Math.cos(angle)*side*.22),knee=new T.Vector3(side*.34,.88,paw.z-.15);paw.lerp(new T.Vector3(side*.28,.09,.27),standing);knee.lerp(new T.Vector3(side*.3,.7,.15),standing);leg.paw.position.copy(paw);for(const [m,a,b]of[[leg.upper,hip,knee],[leg.lower,knee,paw]]){const delta=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=delta.length();m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}});}
 const desiredCamera=new T.Vector3(),target=new T.Vector3();let camHeading=0;
 function snapCamera(){camHeading=state.heading;positionScene(1,true);}
 const splash=new T.Group();scene.add(splash);for(let i=0;i<12;i++){const a=i*Math.PI/6;ball(splash,Math.cos(a),0,Math.sin(a),.12,.18,.12,'#c5f0e5');}splash.visible=false;
 const crashNotice=document.createElement('div');crashNotice.id='crash-notice';crashNotice.setAttribute('role','status');crashNotice.hidden=true;document.body.append(crashNotice);
 function crashPose(dt){
  const c=state.crash,t=c?.time||0,side=c?.side||1,smooth=(a,b)=>{const v=C.clamp((t-a)/(b-a),0,1);return v*v*(3-2*v);};
  const fall=c?smooth(0,.55):0,stand=c?smooth(1.25,2.35):0,mount=c?smooth(2.65,3.8):0,lift=c?smooth(2.2,3.15):0;
  rider.userData.recoveryFocusX=-side*(.7+.8*(1-stand))*fall*(1-mount);
  bikeParts.bike.rotation.z=side*1.4*fall*(1-lift);bikeParts.bike.position.set(0,.3*fall*(1-lift),0);
  catParts.cat.rotation.z=side*1.48*fall*(1-stand);catParts.cat.position.set(-side*.95*fall*(1-mount),.53*fall*(1-stand),.25*fall*(1-mount));
  animateCat(catParts,bikeParts,state.pedal,state.speed,0,dt,stand*(1-mount));
  splash.visible=!!c?.water&&t<1.6;if(splash.visible){splash.position.set(c.from.x,.2,c.from.z);splash.children.forEach((o,i)=>{const a=i*Math.PI/6,r=.3+t*1.6;o.position.set(Math.cos(a)*r,Math.max(0,Math.sin(Math.min(1,t/1.6)*Math.PI)*1.8),Math.sin(a)*r);});}
  if(c?.water){const drift=1.25*fall*(1-stand);rider.position.x-=Math.sin(state.heading)*drift;rider.position.z-=Math.cos(state.heading)*drift;rider.position.y-=Math.sin(Math.min(1,t/2.4)*Math.PI)*.9;}
  if(c){rider.rotation.z=0;catParts.head.rotation.z=Math.sin(t*8)*.05*(1-stand);}
  else catParts.head.rotation.z=0;
  crashNotice.hidden=!c||state.phase==='paused';if(c?.water)crashNotice.textContent=t<1.4?'扑通！骑到珠江里了':t<3.15?'回到岸边，甩甩水……':'上岸啦！按 ↑ 继续，记得转弯';else if(c)crashNotice.textContent=t<.7?'哎哟！撞到'+c.kind+'了':t<1.3?'缓一缓……':t<2.35?'阿橘爬起来，拍拍灰':t<3.15?'扶好自行车……':'跨上车，继续追风！';
 }
 function positionScene(dt,snap=false){const steer=(input.right?1:0)-(input.left?1:0);rider.position.set(state.x,state.y+.04,state.z);rider.rotation.y=state.heading;rider.rotation.z+=(-steer*Math.min(.25,state.speed*.018)-rider.rotation.z)*Math.min(1,dt*7);crashPose(dt);
  const active=state.race&&(state.race.status==='countdown'||state.race.status==='racing'),p=C.at(C.MAIN,active?state.race.aiAt:30,active?1.3:state.encountered?6:0);
  rival.position.set(p.x,p.y+.04,p.z);rival.rotation.y=active?p.heading:p.heading+Math.PI/2;rival.rotation.z=active?Math.sin(clockTime)*.06:0;animateCat(rivalCat,rivalBike,active?clockTime*12:0,active?12:0,0,dt);rivalTag.visible=!active;rivalTag.quaternion.copy(camera.quaternion);rivalTag.quaternion.premultiply(rival.quaternion.clone().invert());
  const mobile=innerWidth<700;
  if(state.phase==='intro'){desiredCamera.copy(point(0)).add(new T.Vector3(mobile?3:3.5,mobile?5.2:3.5,mobile?-10:-6.5));target.copy(point(0,mobile?-.2:1.1,mobile?3.2:1.3));}
  else{camHeading=C.wrap(camHeading+C.wrap(state.heading-camHeading)*Math.min(1,dt*6));const back=state.crash?(mobile?14:10):(mobile?10:8.5),side=mobile?.2:1.1,focus=rider.userData.recoveryFocusX||0,fx=Math.cos(state.heading)*focus,fz=-Math.sin(state.heading)*focus;desiredCamera.set(state.x+fx+Math.sin(camHeading)*back+Math.cos(camHeading)*side,state.y+(mobile?5.4:3.8),state.z+fz+Math.cos(camHeading)*back-Math.sin(camHeading)*side);const look=state.crash?0:9;target.set(state.x+fx-Math.sin(state.heading)*look,state.y+(state.crash?.85:1.2),state.z+fz-Math.cos(state.heading)*look);}
  camera.position.lerp(desiredCamera,snap?1:Math.min(1,dt*5));camera.lookAt(target);const fov=state.phase==='intro'?49:reducedMotion?55:55+state.speed*.45;camera.fov+=(fov-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();
  sun.position.set(state.x-22,state.y+34,state.z+18);sun.target.position.set(state.x,state.y,state.z-8);sun.target.updateMatrixWorld();
  boats.forEach((b,i)=>{b.position.x=b.userData.x+Math.sin(clockTime*.025+i)*14;b.position.y=.25+Math.sin(clockTime*.8+i)*.08;});
  gates.forEach((g,i)=>{g.visible=!!active&&i>=state.race.gate;g.scale.setScalar(active&&i===state.race.gate?1.08:1);});
 }
 function showRouteMap(){
  if(state.crash||!['ride','paused'].includes(state.phase))return;if(state.race&&['countdown','racing'].includes(state.race.status)){toast('先完成或退出挑战，再选择骑游路线。');return;}
  state.phase='map';let selected='court',plan=C.planRoute(state,selected);const wrap=document.createElement('div');wrap.className='route-planner';const canvas=document.createElement('canvas');canvas.width=1008;canvas.height=900;canvas.id='route-overview';wrap.append(canvas);const choices=document.createElement('div');choices.className='route-choices';wrap.append(choices);const note=document.createElement('p');note.id='route-summary';wrap.append(note);
  function refresh(){plan=C.planRoute(state,selected);paintRouteMap(canvas.getContext('2d'),canvas.width,canvas.height,plan,true);note.textContent=plan?`${C.DESTINATIONS.find(p=>p.id===selected).note} · 约 ${Math.round(plan.length)} 游戏米`:'先骑到附近的道路或园路，再开始目的地导航。';choices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===selected)));$('dialog-action').disabled=!plan;}
  for(const dest of C.DESTINATIONS){const b=document.createElement('button');b.dataset.place=dest.id;b.textContent=dest.name;b.onclick=()=>{selected=dest.id;refresh();};choices.append(b);}
  modal('街区导览 · 试玩版 v0.1','今天，想骑去哪里？',wrap,'开启导航去这里',()=>{state.phase='ride';if(C.navigate(state,selected)){hide();toast('前往'+C.DESTINATIONS.find(p=>p.id===selected).name+'。可随时关闭自动导航。');}},'自己逛，不开导航',()=>{state.phase='ride';state.assist=false;state.routeNav=null;hide();});refresh();
 }
 function paintRouteMap(ctx,w,h,route,large=false){
  ctx.save();ctx.scale(w/336,h/300);ctx.fillStyle='#e4ecd8';ctx.fillRect(0,0,336,300);const sx=x=>32+(x+160)*1.45,sy=z=>23+(z+130)*1.2;
  ctx.fillStyle='#9ac9c8';ctx.fillRect(0,259,336,41);ctx.strokeStyle='#d1dec3';ctx.lineWidth=.6;for(let i=0;i<336;i+=24){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,259);ctx.stroke();}
  const line=(pts,color,width)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.z)):ctx.moveTo(sx(p.x),sy(p.z)));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();};
  for(const road of C.ROADS){line(road.pts,'#b3baa2',road.id==='ring'?11:7);line(road.pts,'#fff6df',road.id==='ring'?8:4);}
  for(const path of C.PATHS)line(path.pts,'#c6b799',3);
  ctx.fillStyle='#7da298';ctx.fillRect(sx(C.COURT.x-12),sy(C.COURT.z-17),24*1.45,34*1.2);
  if(route?.points?.length){line(route.points,'#fff8dc',6);line(route.points,'#cb8743',3.5);}
  ctx.font='12px sans-serif';ctx.fillStyle='#5d7967';ctx.fillText('沙面花园',30,113);ctx.fillText('西关骑楼',224,60);ctx.fillText('珠江',205,285);ctx.font='9px sans-serif';ctx.fillText('榕巷',185,145);ctx.fillText('榕荫戏台',71,151);
  for(const d of C.DESTINATIONS){const p=C.at(d.road,d.at),x=sx(p.x),y=sy(p.z);ctx.fillStyle=d.id===route?.id?'#c27b3c':'#668a73';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();if(large){ctx.font='9px sans-serif';ctx.fillStyle='#42634e';ctx.fillText(d.name,x+6,y-6);}}
  if(state.race&&['countdown','racing'].includes(state.race.status)){const p=C.at(C.MAIN,C.GATES[state.race.gate]||C.GATES.at(-1));ctx.fillStyle='#dca142';ctx.fillRect(sx(p.x)-4,sy(p.z)-4,8,8);const a=C.at(C.MAIN,state.race.aiAt);ctx.fillStyle='#59504c';ctx.beginPath();ctx.arc(sx(a.x),sy(a.z),4,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.translate(sx(state.x),sy(state.z));ctx.rotate(-state.heading);ctx.fillStyle='#cf7735';ctx.strokeStyle='#fff9e7';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();ctx.restore();
 }
 const mapCanvas=$('minimap'),mapctx=mapCanvas.getContext('2d');
 function drawMap(){paintRouteMap(mapctx,336,300,state.routeNav);}
 let hudTime=0;
 function hud(){const f=state.routeAt/C.END,zone=state.roadId==='lane'?3:f<.30?0:f<.63?1:2;const zones=[['01 / 西关骑楼','街角有点风','骑楼 · 茶香 · 三花的起跑线'],['02 / 沙面花园','拐进一片绿荫','洋楼 · 花园 · 连续弯道'],['03 / 珠江骑行道','江面，突然打开','江风 · 小坡 · 广州塔'],['支路 / 榕巷','抄条小路，去江边','红砖 · 灯笼 · 街坊糖水']];$('place-kicker').textContent=zones[zone][0];$('place-name').textContent=zones[zone][1];$('place-note').textContent=zones[zone][2];$('speed').textContent=Math.round(state.speed*3.6);$('boost-fill').style.width=state.boost+'%';$('boost-value').textContent=Math.round(state.boost)+'%';$('speed-effect').classList.toggle('active',state.boosting&&!reducedMotion);$('cruise').textContent=state.cruising?'自动前行 · 开':'自动前行 · 关';$('cruise').setAttribute('aria-pressed',String(state.cruising));$('assist').textContent=state.assist?'自动导航 · 开':'自动导航 · 关';$('assist').setAttribute('aria-pressed',String(state.assist));$('stamp-count').textContent=state.visits.length+' / 3';
  if(state.surface==='court'){ $('place-kicker').textContent='街坊空地 / 球场';$('place-name').textContent='来这里，绕个圈';$('place-note').textContent='球场 · 花园小路 · 自由骑行';}else if(['grass','path'].includes(state.surface)){ $('place-kicker').textContent='街区探索 / 自由骑行';$('place-name').textContent=state.surface==='path'?'这条小路，也能骑':'拐进草地里';$('place-note').textContent='空地自由通行 · 墙面和树木仍会碰撞';}
  const r=state.race,active=r&&(r.status==='countdown'||r.status==='racing');$('race-hud').hidden=!active;$('countdown').hidden=!(r?.status==='countdown');if(active){$('race-time').textContent=r.time.toFixed(1);$('race-gates').textContent=`路标 ${r.gate} / 5`;$('race-position').textContent=r.gate>r.aiGate||(r.gate===r.aiGate&&state.routeAt>r.aiAt)?'阿橘领先':'追上三花';$('countdown').textContent=Math.ceil(Math.max(1,r.countdown));}
  const nav=state.routeNav;$('navigation-hud').hidden=nav?.status!=='active';if(nav?.status==='active')$('navigation-label').textContent='前往 '+nav.name+' · 约 '+Math.round(nav.remaining)+' m';
  const p=C.near(state);$('interaction').hidden=state.phase!=='ride'||!p||active;if(p)$('interaction-title').textContent=p.short;drawMap();
 }
 function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);
 function frame(now){const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;clockTime+=dt;const collision=state.collisions,navStatus=state.routeNav?.status;C.step(state,input,dt,ridingObstacles());if(state.collisions>collision)clearInputs();if(navStatus==='active'&&state.routeNav?.status==='arrived')toast('到了，'+state.routeNav.name+'！停下来看看吧。');if(navStatus==='active'&&state.routeNav?.status==='off-route')toast('已离开路线，转为自由骑行。可重新打开路线图。');positionScene(dt);hudTime+=dt;if(hudTime>.06){hud();hudTime=0;}if(state.phase!==lastPhase){if(state.phase==='challenge')showChallenge();if(state.phase==='result')showResult();updateView();lastPhase=state.phase;}if(state.collisions>collision)tone(180,.16,.05);renderer.render(scene,camera);frames++;requestAnimationFrame(frame);}
 snapCamera();hud();updateView();$('loading').hidden=true;requestAnimationFrame(frame);
 window.__ride={get state(){return JSON.parse(JSON.stringify(state));},get obstacles(){return JSON.parse(JSON.stringify(obstacles));},get pose(){return {catTilt:catParts.cat.rotation.z,bikeTilt:bikeParts.bike.rotation.z,catOffset:catParts.cat.position.x};},get metrics(){return {fps:frames/((performance.now()-metricsStart)/1000),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries};},get ready(){return true;}};
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state.phase==='ride')C.pause(state);updateView();toast('画面暂时中断，请重新打开页面。');});
 }catch(error){$('loading').hidden=true;$('fatal').hidden=false;$('error-detail').textContent=String(error);console.error(error);}
})();
