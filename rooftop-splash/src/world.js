(function(root){
'use strict';
const T=root.THREE,A=root.SplashArena;
const materials=new Map();
function mat(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.8}));return materials.get(color);}
function box(parent,w,h,d,color,x=0,y=0,z=0){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cyl(parent,r1,r2,h,color,x=0,y=0,z=0,n=16){const m=new T.Mesh(new T.CylinderGeometry(r1,r2,h,n),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function ball(parent,r,color,x=0,y=0,z=0){const m=new T.Mesh(new T.SphereGeometry(r,12,8),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function textSprite(text,color='#36555a',background=null){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,512,128);}ctx.font='bold 52px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,256,68);
  const texture=new T.CanvasTexture(canvas),sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthWrite:false}));sprite.scale.set(3.6,.9,1);return sprite;
}
function leaf(parent,x,y,z,scale=1){
  cyl(parent,.1,.14,1.3*scale,0x7b7750,x,y+.65*scale,z,7);
  for(let i=0;i<4;i++){const a=i*2.4,m=ball(parent,.58*scale,[0x72996e,0x90ac79,0x557e67][i%3],x+Math.cos(a)*.3*scale,y+(1.1+i*.15)*scale,z+Math.sin(a)*.3*scale);m.scale.y=1.25;}
}
function buildWorld(scene){
  scene.background=new T.Color(A.colors.sky);scene.fog=new T.Fog(A.colors.fog,45,150);
  scene.add(new T.HemisphereLight(0xfff5dd,0x799d98,1.15));const sun=new T.DirectionalLight(0xffefcf,2.15);sun.position.set(-24,44,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:110});sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;scene.add(sun);
  const world=new T.Group();scene.add(world);
  box(world,A.width+1,1.8,A.length+1,0xc9bda7,0,-.92,0);box(world,A.width,.08,A.length,A.colors.floor,0,-.04,0);
  for(let x=-18;x<=18;x+=3)box(world,.025,.008,58,0xd7c3a9,x,.01,0);
  for(let z=-27;z<=27;z+=3)box(world,38,.008,.025,0xd7c3a9,0,.011,z);
  for(const side of [-1,1]){
    box(world,.45,1.15,59,0xf1debd,side*19.1,.55,0);box(world,.58,.14,59,0xf6ebd3,side*19.1,1.15,0);
    box(world,38,1.15,.45,0xf1debd,0,.55,side*29.1);box(world,38,.14,.58,0xf6ebd3,0,1.15,side*29.1);
  }
  for(let team=0;team<2;team++){
    const p=A.spawns[team],color=team?A.colors.orange:A.colors.blue;
    box(world,10,.02,6,color,0,.02,p.z);box(world,10,.023,.12,0xfff9dd,0,.025,p.z-3*(team?-1:1));
    for(let i=-1;i<=1;i++)box(world,.15,.025,1.4,0xfff9dd,i*2,.035,p.z);
    const board=textSprite(team?'ORANGE CLUB':'BLUE CLUB','#fffaeb',team?'#e68055':'#4f9fa9');board.position.set(0,2.4,team?-28:28);board.scale.set(6,1.5,1);world.add(board);
    cyl(world,.6,.65,1.8,0xf3e8c4,team?-7:7,.9,p.z,16);cyl(world,.52,.52,.9,color,team?-7:7,1.2,p.z,16);
  }
  for(const p of A.props){
    const g=new T.Group();g.position.set(p.x,0,p.z);world.add(g);
    if(p.kind==='tank'){
      // The square plinth fills the collider corners; the rounded tank sits on it.
      box(g,p.w,1.2,p.d,0xd0bda0,0,.6,0);cyl(g,p.w*.48,p.w*.48,p.h-1.2,p.color,0,(p.h+1.2)/2,0,24);
      for(const y of [1.6,2.8,3.8])cyl(g,p.w*.49,p.w*.49,.07,0xd9e3d9,0,y,0,24);
      cyl(g,.7,.7,.22,0x4f838f,0,p.h+.08,0);box(g,.15,p.h,.18,0xf5e8c9,p.w*.49,p.h/2,.5);
      for(let y=.3;y<p.h;y+=.4)box(g,.65,.08,.12,0xf5e8c9,p.w*.49+.2,y,.5);
    }else if(p.kind==='shed'){
      box(g,p.w,p.h,p.d,p.color,0,p.h/2,0);box(g,p.w+.4,.24,p.d+.4,0xf5e3bd,0,p.h+.06,0);
      const front=p.z>0?-1:1;box(g,1.6,2.8,.06,0x365963,1,1.4,front*(p.d/2+.04));box(g,2.6,1.4,.07,0xc4e0dc,-2,2.4,front*(p.d/2+.05));
      box(g,.08,1.4,.1,0xf8e8cb,-2,2.4,front*(p.d/2+.1));box(g,2.6,.08,.1,0xf8e8cb,-2,2.4,front*(p.d/2+.1));
      box(g,1.8,.8,.6,0xa0c2be,1,p.h+.6,0);cyl(g,.25,.25,1.3,0xcbd0bb,-1,p.h+.7,1);
    }else if(p.kind==='planter'){
      box(g,p.w,p.h,p.d,p.color,0,p.h/2,0);box(g,p.w+.12,.14,p.d+.12,0xf0bb8e,0,p.h,0);box(g,p.w-.3,.05,p.d-.3,0x6c6650,0,p.h+.04,0);
      for(let x=-p.w/2+.65;x<p.w/2;x+=1.15){leaf(g,x,p.h+.03,0,.55);for(let k=0;k<2;k++)ball(g,.12,k?0xf9dc87:0xf39870,x+.2,p.h+.78,k*.4-.2);}
    }else if(p.kind==='ac'){
      box(g,p.w,p.h,p.d,p.color,0,p.h/2,0);box(g,p.w+.12,.1,p.d+.12,0xf6edd6,0,p.h,0);
      for(const x of [-1,1]){const fan=cyl(g,.7,.7,.08,0x789390,x,1,p.d/2+.05,20);fan.rotation.x=Math.PI/2;for(let j=-2;j<=2;j++)box(g,1.3,.045,.08,0xd0dbcf,x,1+j*.24,p.d/2+.11);}
    }else if(p.kind==='pergola'){
      box(g,p.w,p.h,p.d,0xb5c2a0,0,p.h/2,0);box(g,p.w+.6,.25,p.d+.6,p.color,0,p.h+.12,0);
      box(g,p.w-.5,.7,.1,0x497c79,0,1.6,p.d/2+.03);box(g,p.w-.5,.7,.1,0x497c79,0,1.6,-p.d/2-.03);
      for(let i=0;i<7;i++)box(g,.5,.07,p.d+.9,i%2?0xffedc1:0xe89b6b,-3+i,2.68,0);
      const label=textSprite('夏日补给站','#faf3d3');label.position.set(0,2.1,p.d/2+.12);label.scale.set(4,.9,1);g.add(label);
    }else if(p.kind==='crates'){
      box(g,p.w,p.h,p.d,p.color,0,p.h/2,0);
      for(const y of [.25,p.h/2,p.h-.2])for(const face of [-1,1])box(g,p.w,.08,.08,0xf5dfae,0,y,face*p.d/2);
      box(g,.1,p.h,.05,0xf5dfae,0,p.h/2,p.d/2+.04);
    }else box(g,p.w,p.h,p.d,p.color,0,p.h/2,0);
  }
  // Clotheslines are overhead, outside the playing lanes.
  for(const x of [-17,17]){
    for(const z of [-5,5])cyl(world,.055,.055,3.6,0x6f8e88,x,1.8,z,6);
    box(world,.035,.035,10,0x7c8976,x,3.5,0);
    for(let j=0;j<5;j++){const cloth=box(world,.06,1.2,1.15,[0xefd08c,0xe8a78e,0xf8f1d7,0x98beba,0x97b4c5][j],x,2.88,-4+j*2);cloth.rotation.z=.05*Math.sin(j);}
  }
  // A fictional city skyline. No external models, textures or map services.
  let seed=812;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<68;i++){
    const side=i%4,along=(Math.floor(i/4)-8)*9,w=5+rand()*6,h=7+rand()*22,d=5+rand()*6;
    const x=side<2?(side?1:-1)*(30+rand()*16):along,z=side<2?along:(side===2?1:-1)*(42+rand()*12);
    const bottom=-18;box(world,w,h,d,[0xd5ba9b,0xbeaca0,0xafbfba,0xd8bbab,0xc5c8b8][i%5],x,bottom+h/2,z);
    box(world,w+.4,.45,d+.4,0xf0dcc0,x,bottom+h,z);
    for(let y=bottom+2;y<bottom+h-1;y+=2.8)for(let k=-1;k<=1;k++){
      if(side<2)box(world,.04,.95,.85,0x759395,x+(side?-1:1)*(w/2+.02),y,z+k*1.9);
      else box(world,.85,.95,.04,0x759395,x+k*1.9,y,z+(side===2?-1:1)*(d/2+.02));
    }
  }
  const clouds=new T.Group();scene.add(clouds);
  for(let i=0;i<8;i++){const g=new T.Group();g.position.set(-70+i*20,26+rand()*10,-65+rand()*15);for(let j=0;j<4;j++){const m=ball(g,3+rand()*2,0xfff3d9,j*4,rand()*2,0);m.scale.y=.5;}clouds.add(g);}
  // Batch city windows and roof details by material. Hundreds of fixed boxes
  // become a handful of draw calls without adding a geometry dependency.
  world.updateMatrixWorld(true);const batches=new Map();
  world.traverse(m=>{if(m.isMesh&&m.geometry.type==='BoxGeometry'){if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(m);}});
  for(const [material,meshes] of batches){
    const instanced=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,meshes.length);
    meshes.forEach((m,i)=>{const p=m.geometry.parameters,matrix=m.matrixWorld.clone().multiply(new T.Matrix4().makeScale(p.width,p.height,p.depth));instanced.setMatrixAt(i,matrix);m.parent.remove(m);m.geometry.dispose();});
    instanced.castShadow=true;instanced.receiveShadow=true;instanced.frustumCulled=false;scene.add(instanced);
  }
  return{world,sun,clouds};
}
function makeGun(team=0,index=0){
  const g=new T.Group(),color=team?A.colors.orange:A.colors.blue;
  box(g,.22,.28,.67,0xffd46e,0,0,-.05);box(g,.24,.15,.4,color,0,.17,.05);box(g,.14,.35,.2,0xf5e4bd,0,-.25,.13).rotation.x=-.2;
  const barrel=cyl(g,.1,.1,.55,index===1?0x5c8a92:color,0,.02,-.55,12);barrel.rotation.x=Math.PI/2;
  const tip=cyl(g,.125,.125,.08,0xfaf2d7,0,.02,-.84,12);tip.rotation.x=Math.PI/2;
  ball(g,.15,0xb3e1d7,0,.22,-.17).scale.set(1,1,1.5);box(g,.055,.08,.05,0x315968,0,.26,-.44);
  if(index===1){const scope=cyl(g,.1,.1,.32,0x3d6570,0,.35,-.15,12);scope.rotation.x=Math.PI/2;g.scale.z=1.3;}
  if(index===2)g.scale.set(.8,.85,.65);return g;
}
function makeActor(a){
  const g=new T.Group(),color=a.team?A.colors.orange:A.colors.blue,skin=[0xe7b18b,0xc58d69,0xf0c9a3][a.id%3];
  const torso=cyl(g,.32,.27,.66,color,0,1.05,0,10);const head=ball(g,.29,skin,0,1.62,0);head.scale.y=1.1;
  const hat=cyl(g,.33,.31,.17,color,0,1.86,0,12);box(g,.52,.05,.3,color,0,1.8,-.22);box(g,.46,.13,.09,0x315563,0,1.64,-.26);
  const legs=[];for(const x of [-.17,.17]){const leg=new T.Group();leg.position.set(x,.79,0);box(leg,.22,.58,.24,0x3e6570,0,-.27,0);box(leg,.26,.15,.4,0xf6e9c8,0,-.64,-.07);g.add(leg);legs.push(leg);}
  for(const x of [-.4,.4]){const arm=box(g,.18,.5,.19,skin,x,1.06,-.17);arm.rotation.x=-.55;}
  cyl(g,.21,.21,.58,0xffdb77,0,1.15,.31,10);box(g,.13,.34,.1,0xf0e8c8,0,1.15,.53);
  const gun=makeGun(a.team);gun.position.set(.24,1.12,-.4);gun.scale.setScalar(.7);g.add(gun);
  const label=textSprite(a.name,a.team?'#bd5a32':'#23697d','#fff4df');label.position.y=2.35;label.scale.set(1.65,.42,1);g.add(label);
  const ring=new T.Mesh(new T.RingGeometry(.46,.56,24),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.5}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;g.add(ring);
  g.userData={legs,label,head,hat,torso,gun,ring};return g;
}
root.SplashWorld={buildWorld,makeActor,makeGun,box,ball,mat};
})(globalThis);
