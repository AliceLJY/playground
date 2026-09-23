/* Original articulated cats with geometry fur. No downloaded character assets. */
(function(root){'use strict';
const T=root.THREE,UP=new T.Vector3(0,1,0),boxGeo=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,32,22),mats=new Map();
const furMaterial=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,side:T.DoubleSide});
furMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal = normalize(vNormal);');};
let seed=53813;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
// Fine directional fibres keep the face from looking like smooth painted plastic.
const fibreCanvas=document.createElement('canvas');fibreCanvas.width=1024;fibreCanvas.height=512;
const fibreContext=fibreCanvas.getContext('2d');fibreContext.fillStyle='#dddddd';fibreContext.fillRect(0,0,1024,512);
for(let i=0;i<44000;i++){const x=rand()*1024,y=rand()*512,v=150+Math.floor(rand()*106);fibreContext.strokeStyle='rgb('+v+','+v+','+v+')';fibreContext.lineWidth=.55+rand()*.65;fibreContext.beginPath();fibreContext.moveTo(x,y);fibreContext.lineTo(x+(rand()-.5)*2,y+1.5+rand()*5);fibreContext.stroke();}
const fibreTexture=new T.CanvasTexture(fibreCanvas);fibreTexture.wrapS=T.RepeatWrapping;fibreTexture.anisotropy=4;
const undercoatMaterial=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,map:fibreTexture,bumpMap:fibreTexture,bumpScale:.0045});
function mat(c,opts={}){const key=c+JSON.stringify(opts);if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color:c,roughness:.75,...opts}));return mats.get(key);}
function mesh(g,m,parent,p=[0,0,0],scale){const o=new T.Mesh(g,typeof m==='string'?mat(m):m);o.position.set(...p);if(scale)o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function ball(p,pos,scale,m){return mesh(sphere,m,p,pos,scale);}
function box(p,pos,scale,m){return mesh(boxGeo,m,p,pos,scale);}
function rod(p,a,b,r,m,sides=10){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa),o=mesh(new T.CylinderGeometry(r,r,d.length(),sides),m,p);o.position.copy(aa.add(bb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,d.normalize());return o;}
function curve(p,pts,r,m,segments=28){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(v=>new T.Vector3(...v))),segments,r,7,false),m,p);}
function coat(id,x,y,z,part){
 let base=new T.Color('#da943f'),dark=new T.Color('#995022'),cream=new T.Color('#f7dfb3');
 if(id===1){base.set('#ecdec2');dark.set('#633b26');const patch=Math.sin(x*7+y*4)+Math.cos(z*8-y*4);if(patch>.45)base.set('#b67537');if(patch<-.7)base.set('#33332e');}
 if(id===2){base.set('#424953');dark.set('#252b32');cream.set('#b4b5aa');}
 if(id===3){base.set('#dfcba1');dark.set('#c6b084');cream.set('#f6eed4');}
 if(id===4){base.set('#bd7a42');dark.set('#66432c');cream.set('#e9d2ad');}
 if(id===5){base.set('#9a9d9e');dark.set('#4a5155');cream.set('#e4ddd0');}
 const wave=part==='head'?Math.sin(y*24+Math.abs(x)*9+Math.sin(z*6)*1.3):Math.sin(y*22+Math.sin(x*9+z*7)*1.2);
 const stripe=Math.pow(Math.max(0,wave),6)*(id===1?.1:id===3?.35:.72);
 base.lerp(dark,stripe);
 if(part==='head'&&z<-.11&&y>.105&&y<.295&&id!==1){
  const d=Math.min(Math.abs(x-(.048+(y-.11)*.25)),Math.abs(x+(.048+(y-.11)*.25)),Math.abs(x-(.174-(y-.11)*.18)),Math.abs(x+(.174-(y-.11)*.18)));
  const fade=Math.min(1,(y-.105)*25,(.295-y)*40);base.lerp(dark,Math.max(0,1-d/.023)*fade*.85);
 }

 if(part==='head'&&z<-.15&&y<-.085){const f=Math.min(1,(-y-.085)*8)*Math.max(0,1-Math.abs(x)*1.7);base.lerp(cream,f*.92);}
 if(part==='body'&&z<-.04&&y<.23)base.lerp(cream,Math.min(.87,(-z+.04)*4));
 return base;
}
function fur(p,center,scale,id,part,count,length){
 const underGeo=new T.SphereGeometry(1,36,24),pos=underGeo.attributes.position,colors=[];
 for(let i=0;i<pos.count;i++){const c=coat(id,pos.getX(i)*scale[0],pos.getY(i)*scale[1],pos.getZ(i)*scale[2],part);colors.push(c.r,c.g,c.b);}
 underGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));mesh(underGeo,undercoatMaterial,p,center,scale);
 const vertices=[],normals=[],hues=[];
 for(let i=0;i<count;i++){
  const u=rand()*2-1,a=rand()*Math.PI*2,q=Math.sqrt(1-u*u),v=new T.Vector3(Math.cos(a)*q,u,Math.sin(a)*q),r=new T.Vector3(v.x*scale[0],v.y*scale[1],v.z*scale[2]),n=new T.Vector3(v.x/scale[0],v.y/scale[1],v.z/scale[2]).normalize();
  let len=length*(.55+rand()*.8);if(part==='head'&&r.z<-.14)len*=.42;if(part==='head'&&Math.abs(r.x)>.23)len*=1.5;
  const comb=new T.Vector3(n.x*.65,n.y*.5-.65,n.z*.65+.18).normalize();
  const tip=r.clone().addScaledVector(n,len*.65).addScaledVector(comb,len*.58),mid=r.clone().lerp(tip,.56).addScaledVector(n,len*.14);
  const tangent=new T.Vector3(-n.z,0,n.x);if(tangent.lengthSq()<.01)tangent.set(1,0,0);tangent.normalize().multiplyScalar((.0012+rand()*.0015)*(part==='body'?1.3:1));
  const root1=r.clone().add(tangent),root2=r.clone().sub(tangent),mid1=mid.clone().addScaledVector(tangent,.52),mid2=mid.clone().addScaledVector(tangent,-.52);
  const c=coat(id,r.x,r.y,r.z,part).multiplyScalar(.82+rand()*.34);
  for(const [vv,t]of[[root1,0],[root2,0],[mid1,.5],[root2,0],[mid2,.5],[mid1,.5],[mid1,.5],[mid2,.5],[tip,1]]){
   vertices.push(vv.x+center[0],vv.y+center[1],vv.z+center[2]);normals.push(n.x,n.y,n.z);const cc=c.clone().lerp(new T.Color('#f3dca7'),t*.13);hues.push(cc.r,cc.g,cc.b);
  }
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('color',new T.Float32BufferAttribute(hues,3));
 const hair=mesh(geo,furMaterial,p);hair.castShadow=false;return hair;
}
function ear(parent,side,id){
 const g=new T.Group();g.position.set(side*.238,.247,.0);g.rotation.z=-side*.19;parent.add(g);
 const shape=new T.Shape();shape.moveTo(-.115,0);shape.quadraticCurveTo(-.085,.18,0,.287);shape.quadraticCurveTo(.08,.23,.127,0);shape.closePath();
 mesh(new T.ExtrudeGeometry(shape,{depth:.062,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.014,bevelThickness:.017,curveSegments:12}),mat(id===2?'#434852':'#bc762f'),g,[0,0,-.027]);
 const inner=new T.Shape();inner.moveTo(-.073,.023);inner.quadraticCurveTo(-.05,.15,0,.232);inner.quadraticCurveTo(.065,.17,.081,.023);inner.closePath();
 mesh(new T.ShapeGeometry(inner,18),mat('#cf9c96',{roughness:1,side:T.DoubleSide}),g,[0,0,-.047]).rotation.y=Math.PI;
 const strands=[],cols=[];
 for(let j=0;j<180;j++){const h=rand()*.22,x=(rand()-.5)*(.19-h*.65),c=new T.Color('#f0d0aa');strands.push(x,h,-.049,x+(rand()-.5)*.03,h+.015+rand()*.04,-.052);cols.push(c.r,c.g,c.b,c.r,c.g,c.b);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(strands,3));geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.add(new T.LineSegments(geo,new T.LineBasicMaterial({vertexColors:true})));return g;
}
function bicycle(parent,id){
 const bike=new T.Group();parent.add(bike);const accent=['#25aeb3','#e78585','#8492c7','#d6b14e','#9ac06b','#b7a5d1'][id],paint=mat(accent,{metalness:.65,roughness:.27}),metal=mat('#a2acb0',{metalness:.9,roughness:.23}),black=mat('#242b30',{roughness:.48}),tires=[];
 for(const z of [.86,-.92]){
  const w=new T.Group();w.position.set(0,.49,z);bike.add(w);
  const tire=mesh(new T.TorusGeometry(.442,.038,12,64),black,w);tire.rotation.y=Math.PI/2;
  for(const x of [-.022,.022]){const rim=mesh(new T.TorusGeometry(.409,.012,8,56),metal,w,[x,0,0]);rim.rotation.y=Math.PI/2;}
  for(let j=0;j<28;j++){const a=j*Math.PI/14;rod(w,[j%2?.04:-.04,0,0],[0,Math.cos(a)*.406,Math.sin(a)*.406],.0029,metal,4);}
  rod(w,[-.095,0,0],[.095,0,0],.033,metal);const disc=mesh(new T.CylinderGeometry(.11,.11,.011,24),metal,w,[-.046,0,0]);disc.rotation.z=Math.PI/2;
  tires.push(w);
 }
 const rear=[0,.49,.86],front=[0,.49,-.92],crank=[0,.45,.08],seat=[0,.99,.4],stem=[0,1.08,-.59];
 for(const [a,b]of[[rear,seat],[seat,crank],[crank,rear],[crank,stem],[stem,seat]])rod(bike,a,b,.032,paint,12);
 for(const x of [-.047,.047])rod(bike,[x,1.08,-.59],[x,.49,-.92],.023,paint,12);
 rod(bike,[0,.93,.4],[0,1.14,.46],.019,metal);ball(bike,[0,1.17,.46],[.14,.048,.205],black);
 rod(bike,[0,1.08,-.59],[0,1.36,-.65],.021,metal);rod(bike,[0,1.36,-.65],[0,1.38,-.83],.019,metal);
 for(const side of [-1,1]){curve(bike,[[0,1.38,-.83],[side*.3,1.38,-.83],[side*.355,1.3,-.96],[side*.355,1.18,-.88],[side*.355,1.18,-.73]],.022,black,20);curve(bike,[[side*.3,1.36,-.83],[side*.16,1.15,-.7],[side*.03,.95,-.76]],.005,'#343a3e',16);}
 const crankG=new T.Group();crankG.position.set(0,.45,.08);bike.add(crankG);const gear=mesh(new T.TorusGeometry(.135,.017,8,40),metal,bike,[.055,.45,.08]);gear.rotation.y=Math.PI/2;
 for(const side of [-1,1]){rod(crankG,[side*.06,0,0],[side*.18,0,side*.205],.017,metal);box(crankG,[side*.235,0,side*.205],[.16,.042,.09],black);}
 curve(bike,[[.072,.45,.08],[.072,.53,.79],[.072,.5,.92],[.072,.41,.85],[.072,.31,.08],[.072,.45,.08]],.006,'#626b6d');
 const bottle=mesh(new T.CylinderGeometry(.057,.055,.23,16),mat('#e7ece8',{roughness:.3}),bike,[0,.75,-.08]);bottle.rotation.x=-.48;box(bike,[0,1.145,.66],[.095,.048,.04],mat('#ff573e',{emissive:'#ff2f12',emissiveIntensity:.9}));
 return {bike,tires,crank:crankG};
}
function cat(parent,id=0){
 const g=new T.Group();parent.add(g);const detail=id===0?1:.27,body=new T.Group();g.add(body);
 fur(body,[0,1.47,.29],[.285,.435,.28],id,'body',Math.floor(6500*detail),.04);
 const head=new T.Group();head.position.set(0,1.998,-.105);head.rotation.x=.08;body.add(head);
 fur(head,[0,0,0],[.345,.307,.295],id,'head',Math.floor(14500*detail),.029);
 for(const side of [-1,1]){
  fur(head,[side*.23,-.09,-.125],[.16,.16,.17],id,'head',Math.floor(1300*detail),.029);
  ear(head,side,id);
  const eye=new T.Group();eye.position.set(side*.162,.028,-.236);eye.rotation.y=side*-.43;head.add(eye);
  const ev=[0,0,-.055],en=[0,0,-1],ec=[],iris=new T.Color(id===5?'#81abb0':'#8f9b50');ec.push(iris.r,iris.g,iris.b);
  const edge=[];for(let j=0;j<=48;j++){const a=j/48*Math.PI*2,x=Math.cos(a)*.097,y=Math.sin(a)*.065*(.65+.35*Math.abs(Math.sin(a)));ev.push(x,y,-.008);en.push(0,0,-1);const color=new T.Color(id===5?'#a2c1ba':'#adba73');ec.push(color.r,color.g,color.b);edge.push([x,y,-.009]);}
  const eg=new T.BufferGeometry();eg.setAttribute('position',new T.Float32BufferAttribute(ev,3));eg.setAttribute('normal',new T.Float32BufferAttribute(en,3));eg.setAttribute('color',new T.Float32BufferAttribute(ec,3));const indices=[];for(let j=1;j<=48;j++)indices.push(0,j+1,j);eg.setIndex(indices);mesh(eg,mat('#ffffff',{vertexColors:true,roughness:.2,side:T.DoubleSide}),eye);
  curve(eye,edge,.0065,id===2?'#343b3c':'#80603f',48);
  for(let j=0;j<32;j++){const a=j*Math.PI/16;rod(eye,[Math.cos(a)*.036,Math.sin(a)*.043,-.041],[Math.cos(a)*.069,Math.sin(a)*.051,-.02],.0008,j%2?'#768443':'#c9ba72',4);}
  ball(eye,[0,0,-.051],[.022,.055,.012],mat('#071011',{roughness:.13}));ball(eye,[-.019,.025,-.061],[.013,.016,.007],mat('#fffbe5',{roughness:.04}));ball(eye,[.018,-.021,-.057],[.005,.007,.004],'#e7f2d3');
  fur(head,[side*.086,-.125,-.291],[.107,.077,.061],id,'head',Math.floor(450*detail),.012);
  for(let k=0;k<4;k++){const y=-.125-k*.014;curve(head,[[side*.106,y,-.35],[side*.26,y-.005,-.365],[side*(.415+k*.018),y+.04-k*.031,-.292]],.0018,'#e5d2b0',12);}
  for(let j=0;j<5;j++)ball(head,[side*(.08+(j%2)*.024),-.10-Math.floor(j/2)*.021,-.35],[.003,.003,.002],'#80613f');
 }
 const nose=new T.Shape();nose.moveTo(-.04,0);nose.quadraticCurveTo(-.053,.025,-.026,.029);nose.quadraticCurveTo(0,.018,.026,.029);nose.quadraticCurveTo(.053,.025,.04,0);nose.lineTo(0,-.035);nose.closePath();
 mesh(new T.ExtrudeGeometry(nose,{depth:.018,bevelEnabled:true,bevelSize:.004,bevelThickness:.005,bevelSegments:2}),mat('#c68d86',{roughness:.5}),head,[0,-.08,-.371]);
 curve(head,[[0,-.117,-.363],[0,-.15,-.364],[-.06,-.172,-.341]],.0035,'#805a43',12);curve(head,[[0,-.15,-.364],[.06,-.172,-.341]],.0035,'#805a43',12);
 const scarf=mesh(new T.TorusGeometry(.224,.034,8,36),mat(id===0?'#b94730':'#576e72',{roughness:1}),body,[0,1.768,-.004]);scarf.rotation.x=Math.PI/2;
 const ribbon=new T.Group();ribbon.position.set(.17,1.77,.2);body.add(ribbon);curve(ribbon,[[0,0,0],[.08,-.03,.19],[.03,-.07,.43],[.12,.0,.6]],.037,id===0?'#b94730':'#576e72',20);
 for(const side of [-1,1]){
  const a=new T.Vector3(side*.223,1.663,.12),b=new T.Vector3(side*.285,1.446,-.322),c=new T.Vector3(side*.327,1.36,-.80);
  const arm=new T.Group();arm.position.copy(a.clone().add(b).multiplyScalar(.5));arm.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());body.add(arm);fur(arm,[0,0,0],[.093,a.distanceTo(b)/2+.035,.1],id,'body',Math.floor(1600*detail),.021);
  const fore=new T.Group();fore.position.copy(b.clone().add(c).multiplyScalar(.5));fore.quaternion.setFromUnitVectors(UP,c.clone().sub(b).normalize());body.add(fore);fur(fore,[0,0,0],[.072,b.distanceTo(c)/2+.015,.073],id,'body',Math.floor(1300*detail),.022);
  fur(body,[side*.327,1.358,-.802],[.084,.07,.089],id,'body',Math.floor(700*detail),.018);
  for(let j=0;j<3;j++)ball(body,[side*.327+(j-1)*.041,1.333,-.857],[.024,.043,.028],mat(id===2?'#66706e':'#e6c38c'));
 }
 const legs=[];for(const side of [-1,1]){
  const upper=new T.Group(),lower=new T.Group(),paw=new T.Group();body.add(upper,lower,paw);
  fur(upper,[0,0,0],[.117,.25,.135],id,'body',Math.floor(1700*detail),.031);fur(lower,[0,0,0],[.079,.21,.078],id,'body',Math.floor(1300*detail),.021);fur(paw,[0,0,-.025],[.108,.067,.16],id,'body',Math.floor(900*detail),.019);
  for(let j=0;j<3;j++)ball(paw,[(j-1)*.058,-.005,-.164],[.03,.04,.032],mat(id===2?'#65706b':'#e9c899'));legs.push({side,upper,lower,paw});
 }
 const tail=new T.Group();tail.position.set(0,1.24,.48);body.add(tail);
 const path=new T.CatmullRomCurve3([[0,0,0],[.06,-.015,.28],[.27,.13,.52],[.39,.45,.59],[.35,.76,.48]].map(v=>new T.Vector3(...v))),tg=new T.TubeGeometry(path,36,.075,12,false),tc=[];
 for(let i=0;i<tg.attributes.position.count;i++){const y=tg.attributes.position.getY(i);const c=coat(id,0,y,1,'tail');tc.push(c.r,c.g,c.b);}tg.setAttribute('color',new T.Float32BufferAttribute(tc,3));mesh(tg,mat('#ffffff',{vertexColors:true}),tail);
 for(let i=0;i<15;i++){const v=path.getPoint(i/14);fur(tail,[v.x,v.y,v.z],[.076,.07,.076],id,'tail',Math.floor(220*detail),.03);}
 return {cat:g,body,head,legs,tail,ribbon,id};
}
function make(parent,id){const root=new T.Group();parent.add(root);const bike=bicycle(root,id),parts=cat(root,id);return {root,bike,parts};}
function link(o,a,b,originalLength){const d=b.clone().sub(a);o.position.copy(a).add(b).multiplyScalar(.5);o.scale.y=d.length()/originalLength;o.quaternion.setFromUnitVectors(UP,d.normalize());}
function animate(model,r,time){
 const {parts:p,bike:b}=model;const pedal=r.pedal;
 b.tires.forEach(w=>w.rotation.x=-pedal*.92);b.crank.rotation.x=-pedal;
 p.body.position.y=Math.sin(pedal*2)*Math.min(.016,r.speed*.001);
 p.body.rotation.x=r.boost>0?-.075:Math.sin(time*2)*.008;
 p.head.rotation.y= -r.steer*.14+Math.sin(time*.67+r.id)*.025;p.head.rotation.z=r.steer*.065;
 p.tail.rotation.z=Math.sin(time*3+r.id)*.08-r.steer*.15;p.tail.rotation.y=Math.sin(time*2.1)*.15;
 p.ribbon.rotation.y=Math.sin(time*8)*(.04+r.speed*.002);
 for(const leg of p.legs){
  const side=leg.side,a=-pedal,hip=new T.Vector3(side*.206,1.27,.33),paw=new T.Vector3(side*.235,.47-Math.sin(a)*side*.205,.08+Math.cos(a)*side*.205),knee=new T.Vector3(side*.24,.86+(paw.y-.45)*.24,paw.z-.14);
  link(leg.upper,hip,knee,.5);link(leg.lower,knee,paw,.42);leg.paw.position.copy(paw);leg.paw.rotation.x=Math.sin(pedal)*side*.12;
 }
}
root.RaceCat={make,animate,mesh,mat,box,ball,rod,curve};
})(window);
