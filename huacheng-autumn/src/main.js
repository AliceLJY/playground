// Pure geometry. No imported models, images, fonts or texture maps.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SEED, BASE, BRIDGE, PAGODA, CANTON, TRAM, COLORS, makeLayout, cantonStructure, tramAt, mulberry32, clamp, VIEWS, pathAt, createRig, fovFor, shiftFor, skyAt } from './core.js';
const $=id=>document.getElementById(id),canvas=$('scene'),params=new URLSearchParams(location.search);
const number=(name,fallback)=>{const n=Number(params.get(name));return params.has(name)&&Number.isFinite(n)?n:fallback;};
const mobile=innerWidth<600,layout=makeLayout(SEED,mobile),rnd=mulberry32(SEED+1),R=(a,b)=>a+(b-a)*rnd();
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('fail').style.display='grid';throw e;}
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;renderer.localClippingEnabled=true;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(56,1,0.15,650);
scene.fog=new THREE.FogExp2(0x747e99,0.006);
const std=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:0.78,...extra});
const warm=new THREE.Color(1,0.62,0.28);
const mats={
 base:std('#EEE8DE'),road:std('#4A4C52'),grass:std('#597342'),paving:std('#C9B9A3'),stone:std('#D8D2C6'),bridge:std('#C8BEAD'),
 brick:std('#9A5A3E'),cornice:std('#BC8762'),seam:std('#633E31'),rock:std('#A4553A',{flatShading:true}),soil:std('#746247'),
 bark:std('#69543D'),iron:std('#3D494B',{metalness:0.5,roughness:0.4}),rail:std('#B6B9B0',{metalness:0.65,roughness:0.32}),
 line:std('#E4D9B7'),white:std('#F4F4F0'),glass:std('#253B47',{metalness:0.3,roughness:0.2}),red:std('#C8272D'),gray:std('#777C7C'),
 lamp:new THREE.MeshBasicMaterial({color:new THREE.Color(2,1.24,0.56)}),window:std('#171614',{emissive:warm,emissiveIntensity:2}),
 darkWindow:std('#35302C'),silk:std('#E87BA8',{side:THREE.DoubleSide}),leaf:std('#FFFFFF',{side:THREE.DoubleSide}),bract:std('#FFFFFF',{side:THREE.DoubleSide}),
 skyline:std('#627285',{roughness:1}),tower:std('#C4C4DB',{metalness:0.15,roughness:0.55,vertexColors:true,emissive:0x746ba6,emissiveIntensity:0.4})
};
// snowline-cabin collector: static pieces merged by material, repeated pieces instanced.
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),P=new THREE.Vector3(),S=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const groups={};const group=name=>groups[name]||(groups[name]=new THREE.Group());
for(const k of ['ground','bridge','pagoda','canton','tram','city','boats','cars']){scene.add(group(k));group(k).name=k;}
const bins=new Map();
function put(owner,mat,geo,p=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
 const g=geo.index?geo.toNonIndexed():geo.clone();if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
 for(const a of Object.keys(g.attributes))if(!['position','normal','uv'].includes(a))g.deleteAttribute(a);
 M.compose(P.fromArray(p),Q.setFromEuler(E.set(...rot)),S.fromArray(scale));g.applyMatrix4(M);
 const key=owner+'|'+mat;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(g);geo.dispose();
}
const cube=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cyl=(a,b,h,n=12)=>new THREE.CylinderGeometry(a,b,h,n);
function rod(owner,mat,a,b,r=0.05){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=cyl(r,r,v.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,v.normalize()));put(owner,mat,g,a.map((x,i)=>(x+b[i])/2));}
const instances=[];
function inst(name,geo,mat,items,transform,color,owner=scene){
 const mesh=new THREE.InstancedMesh(geo,mat,items.length);mesh.name=name;items.forEach((o,i)=>{transform(o,M);mesh.setMatrixAt(i,M);if(color)mesh.setColorAt(i,color(o,i));});mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();owner.add(mesh);instances.push(mesh);return mesh;
}
const compose=(m,p,s=[1,1,1],r=[0,0,0])=>m.compose(P.fromArray(p),Q.setFromEuler(E.set(...r)),S.fromArray(s));
const beamMatrix=(o,m)=>{const a=new THREE.Vector3(...o.a),b=new THREE.Vector3(...o.b),v=b.clone().sub(a);return m.compose(a.add(b).multiplyScalar(0.5),Q.setFromUnitVectors(Y,v.clone().normalize()),S.set(o.width,v.length(),o.width));};
function roundedSlab(w,d,h,r){const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:8});g.rotateX(-Math.PI/2);return g;}
// Board, paved surfaces and planted rail bed; their top faces come straight from core.js.
for(const b of layout.surfaces){if(b.id==='base')put('ground','base',roundedSlab(BASE.width,BASE.depth,1.6,2),[0,-1.6,0]);else put(b.id==='bridge'?'bridge':'ground',b.id==='road'?'road':b.id==='track-grass'?'grass':b.id==='bridge'?'bridge':'paving',cube(...b.size),b.center);}
for(const b of [...layout.piers,...layout.steps])put('bridge','bridge',cube(...b.size),b.center);
inst('bridge-rails',cube(1,1,1),mats.rail,layout.rails,beamMatrix,null,group('bridge'));
// Promenade railing, benches and paving joints (geometry, no map).
const riverRails=[];
for(let x=-20.5;x<=20.5;x+=1.2)riverRails.push({a:[x,0.4,-9.65],b:[x,1.25,-9.65],width:0.14});
for(const y of [0.72,1.25])riverRails.push({a:[-20.5,y,-9.65],b:[20.5,y,-9.65],width:0.12});
inst('riverside-rails',cube(1,1,1),mats.stone,riverRails,beamMatrix);
for(const x of [-18,-12,0,6,19]){put('ground','bark',cube(1.55,0.15,0.5),[x,0.95,-7.8]);for(const s of [-1,1])put('ground','iron',cube(0.1,0.55,0.45),[x+s*0.6,0.68,-7.8]);}
// Road marks stand 5 cm above road, grass rails 5 cm above turf. No epsilon-height overlays.
for(const z of [4.3,6,7.7])for(let x=-20;x<21;x+=2.8)put('ground','line',cube(1.3,0.05,0.07),[x,0.225,z]);
for(const x of [-14,13.5])for(let z=3;z<9.3;z+=0.65)put('ground','line',cube(1.8,0.05,0.3),[x,0.225,z]);
for(const z of [-0.6,0.6])put('ground','rail',cube(42.4,0.1,0.055),[0,0.35,z]);
for(let x=-20.8;x<=20.8;x+=0.65)put('ground','soil',cube(0.15,0.05,1.5),[x,0.325,0]);
for(let x=-20;x<=20;x+=1.5)for(const z of [-8,-4.4,12.5])put('ground','stone',cube(0.045,0.05,z===12.5?3.6:1.3),[x,0.425,z]);
// Small station exactly beneath the flower bridge, with a slim platform and sign.
put('ground','iron',cube(0.08,2,0.08),[-3.8,1.55,-2.5]);put('ground','white',cube(1.1,0.45,0.1),[-3.8,2.3,-2.5]);put('ground','red',cube(0.6,0.08,0.12),[-3.8,2.3,-2.5]);
// Red sandstone mound, rough blocks and stone stair up to the pagoda.
put('pagoda','rock',new THREE.SphereGeometry(1,28,12),[11.8,0.4,-6],[0,0,0],[6.2,2.05,5.7]);
for(let i=0;i<21;i++){const a=i*2.4;put('pagoda','rock',new THREE.DodecahedronGeometry(R(0.4,0.8),0),[11.8+Math.cos(a)*R(4.3,5.4),R(0.3,1.3),-6+Math.sin(a)*R(3.8,4.7)],[R(0,2),a,0],[1,0.6,1]);}
put('pagoda','cornice',cyl(2.75,3.2,0.5,8),[11.8,2.25,-6]);
for(let i=0;i<10;i++)put('pagoda','stone',cube(1.5,0.2,0.45),[11.8,0.5+i*0.2,-0.6-i*0.43]);
// Narrow stepped brick corbel cornices, NOT nine pavilion roofs. Arches follow each octagonal face.
function arch(w,h){const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2-w/2);s.absarc(0,h/2-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,-h/2);return new THREE.ShapeGeometry(s,12);}
for(const lv of layout.levels){
 put('pagoda','brick',cyl(lv.radius-0.09,lv.radius,1.65,8),[PAGODA.x,(lv.bottom+lv.top)/2,PAGODA.z]);
 for(const [dy,rr,hh,mat] of [[-0.16,0.05,0.10,'seam'],[-0.05,0.16,0.12,'cornice'],[0.08,0.25,0.14,'cornice']])put('pagoda',mat,cyl(lv.radius+rr,lv.radius+rr-0.02,hh,8),[PAGODA.x,lv.top+dy,PAGODA.z]);
 for(const w of lv.windows){put('pagoda','seam',arch(w.w+0.13,w.h+0.16),w.p,[0,w.angle,0]);put('pagoda',w.lit?'window':'darkWindow',arch(w.w,w.h),[w.p[0]+Math.sin(w.angle)*0.025,w.p[1],w.p[2]+Math.cos(w.angle)*0.025],[0,w.angle,0]);}
 // Thin brick courses around all eight faces are physical lines, laid 5 cm below the cornice.
 for(let row=1;row<7;row++){const yy=lv.bottom+row*0.2,rr=lv.radius-0.09*(row*0.2/1.65)+0.003;for(let side=0;side<8;side++){const a=side*Math.PI/4,b=(side+1)*Math.PI/4;rod('pagoda','seam',[11.8+Math.sin(a)*rr,yy,-6+Math.cos(a)*rr],[11.8+Math.sin(b)*rr,yy,-6+Math.cos(b)*rr],0.009);}}
}
const top=PAGODA.base+9*PAGODA.floorH;
put('pagoda','cornice',cyl(0.7,1.55,0.65,8),[11.8,top+0.45,-6]);
for(const [dy,r,sy] of [[1,0.38,0.5],[1.65,0.25,0.35]])put('pagoda','cornice',new THREE.SphereGeometry(r,12,10),[11.8,top+dy,-6],[0,0,0],[1,sy/r,1]);
put('pagoda','cornice',new THREE.ConeGeometry(0.13,0.45,10),[11.8,top+2.08,-6]);
{const a=Math.PI/8,r=PAGODA.radius*Math.cos(a)+0.08,p=[PAGODA.x+Math.sin(a)*r,2.98,PAGODA.z+Math.cos(a)*r];put('pagoda','seam',arch(.86,.98),p,[0,a,0]);put('pagoda','darkWindow',arch(.68,.86),[p[0]+Math.sin(a)*.02,p[1],p[2]+Math.cos(a)*.02],[0,a,0]);}
// Individual folded leaf/bract geometry; leaves have a visible central crease.
function leafGeometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-0.5,0.45,0,0,0.52,0.1,0,0,0,0,0.52,0.1,0.5,0.45,0, -0.5,0.45,0,0,1,0,0,0.52,0.1,0.5,0.45,0,0,0.52,0.1,0,1,0],3));g.computeVertexNormals();return g;}
function petalGeometry(){const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-0.7,0.45,-0.55,1,0,1);s.bezierCurveTo(0.55,1,0.7,0.45,0,0);return new THREE.ShapeGeometry(s,4);}
const leafItems=[],petals=[],centres=[];
for(const t of layout.trees){
 const [x,y,z]=t.root;
 if(t.kind==='silk') {put('ground','bark',cyl(0.18,0.42,t.h*0.45,10),[x,y+t.h*0.225,z]);put('ground','bark',cyl(0.12,0.18,t.h*0.35,9),[x,y+t.h*0.625,z]);}
 else put('ground','bark',cyl(0.12,0.22,t.h*(t.kind==='palm'?1:0.65),9),[x,y+t.h*(t.kind==='palm'?0.5:0.325),z]);
 for(const b of t.branches)rod('ground','bark',b.a,b.b,b.width);
 for(const l of t.leaves)leafItems.push(l);
 for(const f of t.flowers){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rot));for(let k=0;k<5;k++){const local=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),k*Math.PI*2/5);petals.push({p:f.p,quat:q.clone().multiply(local),size:f.size,shade:f.shade});}centres.push(f);}
}
const leafColors=[new THREE.Color('#2F6B34'),new THREE.Color('#5E9A3E')];
const leaves=inst('individual-leaves',leafGeometry(),mats.leaf,leafItems,(o,m)=>compose(m,o.p,o.scale,o.rot),o=>leafColors[0].clone().lerp(leafColors[1],o.shade));
const flowers=inst('silk-five-petals',petalGeometry(),mats.silk,petals,(o,m)=>m.compose(P.fromArray(o.p),o.quat,S.set(o.size,o.size,1)),o=>new THREE.Color().setScalar(o.shade));
inst('silk-centres',new THREE.SphereGeometry(0.035,5,4),mats.cornice,centres,(o,m)=>compose(m,o.p));
inst('flower-vine-leaves',leafGeometry(),mats.leaf,layout.bracts.filter((_,i)=>i%4===0),(o,m)=>compose(m,[o.p[0],o.p[1]+.06,o.p[2]],[.18,.26,1],o.rot),()=>new THREE.Color('#426E35'),group('bridge'));
const bracts=inst('bougainvillea-bracts',petalGeometry(),mats.bract,layout.bracts,(o,m)=>compose(m,o.p,[o.scale*1.3,o.scale*1.8,o.scale],o.rot),o=>new THREE.Color(COLORS[o.color]).multiplyScalar(o.shade),group('bridge'));
// Small vertex displacement on each leaf; shadows share the same bend shader.
const wind={value:0};
function windShader(shader){shader.uniforms.uWind=wind;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += 0.12 * position.y * sin(uWind*1.2 + instanceMatrix[3].x*1.7 + instanceMatrix[3].z);');}
for(const mesh of [leaves,flowers,bracts]){mesh.material.onBeforeCompile=windShader;mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});mesh.customDepthMaterial.onBeforeCompile=windShader;}
// All lamp components are instanced; illumination comes from lamp positions.
inst('lamp-posts',cyl(1,1,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],2.2,p[2]],[0.07,3.6,0.07]));
inst('lamp-bases',cyl(1,1.2,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],0.65,p[2]],[0.17,0.5,0.17]));
inst('lamp-caps',new THREE.ConeGeometry(1,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],4.13,p[2]],[0.34,0.3,0.34]));
const lampGlobes=inst('lamp-globes',new THREE.SphereGeometry(1,8,6),mats.lamp,layout.lamps,(p,m)=>compose(m,[p[0],3.85,p[2]],[0.2,0.27,0.2]));lampGlobes.castShadow=false;
const lampLights=layout.lamps.map(p=>{const l=new THREE.PointLight(0xffbd79,8,8,2);l.position.set(p[0],3.7,p[2]);scene.add(l);return l;});
const bridgeGlow=inst('bridge-lamps',new THREE.SphereGeometry(0.13,8,6),mats.lamp,[-4,1.8,8].map(z=>[-5.5,5.05,z]),(p,m)=>compose(m,p),null,group('bridge'));bridgeGlow.castShadow=false;
const bridgeLight=new THREE.PointLight(0xffb977,8,10,2);bridgeLight.position.set(-5.5,4.7,0);scene.add(bridgeLight);
// Canton Tower: actual straight tilted columns, elliptical rings and diagonal braces.
const tower=cantonStructure(),towerPieces=[];
function towerRod(a,b,width){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=cyl(width,width,v.length(),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,v.normalize()));g.translate(...a.map((x,i)=>(x+b[i])/2));const ps=g.attributes.position,colors=[];for(let i=0;i<ps.count;i++){const k=clamp((ps.getY(i)-CANTON.base)/CANTON.height,0,1),c=new THREE.Color('#64BDCD').lerp(new THREE.Color('#CE80C7'),k);colors.push(c.r,c.g,c.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));towerPieces.push(g.toNonIndexed());g.dispose();}
for(const b of tower.columns)towerRod(b.a,b.b,b.width);for(const ring of tower.rings)for(let j=1;j<ring.length;j++)towerRod(ring[j-1],ring[j],0.035);for(const b of tower.braces)towerRod(b.a,b.b,b.width);
const towerMesh=new THREE.Mesh(mergeGeometries(towerPieces),mats.tower);group('canton').add(towerMesh);towerPieces.forEach(g=>g.dispose());
put('canton','stone',cyl(1.2,1.15,1.3,24),[CANTON.x,CANTON.base+CANTON.height-0.2,CANTON.z]);
put('canton','rail',cyl(0.045,0.2,9,12),[CANTON.x,CANTON.base+CANTON.height+4.5,CANTON.z]);
put('canton','lamp',new THREE.SphereGeometry(0.09,8,6),[CANTON.x,CANTON.base+CANTON.height+9,CANTON.z]);
// Distant bank and low-saturation skyline, separate from the miniature board.
put('city','skyline',cube(160,0.8,16),[0,-0.8,-56]);
put('city','skyline',cube(...layout.cantonBase.size),layout.cantonBase.center);
for(let i=0;i<45;i++){const x=-76+i*3.5;if(Math.abs(x-CANTON.x)<4)continue;const h=R(3,14),w=R(1.7,3.2),z=R(-60,-51);put('city','skyline',cube(w,h,R(2,4)),[x,h/2-0.4,z]);if(i%4===0)put('city','skyline',cube(w*0.6,1.5,1.5),[x,h+0.35,z]);}
// Four-section white tram, rounded end cabs and large windscreens. Local +X follows rails.
for(let i=0;i<TRAM.cars;i++){
 const x=(i-(TRAM.cars-1)/2)*(TRAM.carLength+TRAM.gap);
 put('tram','white',new RoundedBoxGeometry(3.8,2.25,1.65,3,0.28),[x,1.85,0]);
 put('tram','gray',cube(3.2,0.16,1.35),[x,0.7,0]);
 put('tram','gray',new RoundedBoxGeometry(2.6,0.3,1.15,2,0.1),[x,3.05,0]);
 for(const side of [-1,1]) {
   for(let j=0;j<4;j++){put('tram','window',cube(0.67,1.05,0.045),[x-1.3+j*0.85,2.05,side*0.833]);put('tram','glass',cube(0.045,1.22,0.055),[x-0.87+j*0.85,2.05,side*0.858]);}
   put('tram','red',cube(3.45,0.08,0.055),[x,1.25,side*0.845]);
   // Kapok wrap: five red petals per blossom, drawn as geometry below the waist.
   for(let j=0;j<3;j++)for(let k=0;k<5;k++)put('tram','red',petalGeometry(),[x-1+j,0.98,side*0.856],[0,side===1?0:Math.PI,k*Math.PI*2/5],[0.21,0.21,1]);
 }
 for(const sx of [-1,1])for(const sz of [-1,1])put('tram','iron',cyl(0.27,0.27,0.15,10),[x+sx*1.16,0.58,sz*0.72],[Math.PI/2,0,0]);
 if(i<3){put('tram','iron',cube(0.24,1.95,1.45),[x+2.025,1.8,0]);for(let j=0;j<4;j++)put('tram','gray',cube(0.024,1.95,1.5),[x+1.94+j*0.045,1.8,0]);}
}
for(const side of [-1,1]){
 const x=side*7.98;put('tram','glass',new RoundedBoxGeometry(0.14,1.12,1.24,3,0.1),[x,2.12,0]);
 for(const z of [-0.55,0.55])put('tram','lamp',new THREE.SphereGeometry(0.085,8,6),[x+side*0.08,1.22,z]);
}
for(const z of [-0.42,0.42]){rod('tram','iron',[-1.9,3.23,z],[-0.9,3.63,z],0.025);rod('tram','iron',[-0.9,3.63,z],[0.1,3.23,z],0.025);}rod('tram','iron',[-0.9,3.63,-0.6],[-0.9,3.63,0.6],0.03);
const clip=[new THREE.Plane(new THREE.Vector3(1,0,0),TRAM.clipX),new THREE.Plane(new THREE.Vector3(-1,0,0),TRAM.clipX)];
// Commit collected geometry. Every tram material (including lamps) uses the same world-space boundary.
for(const [key,gs] of bins){const [owner,mat]=key.split('|'),material=owner==='tram'?mats[mat].clone():mats[mat];if(owner==='tram'){material.clippingPlanes=clip;material.clipShadows=true;}const mesh=new THREE.Mesh(mergeGeometries(gs),material);mesh.name=owner+'-'+mat;mesh.castShadow=!['city','canton'].includes(owner)&&mat!=='lamp';mesh.receiveShadow=true;group(owner).add(mesh);gs.forEach(g=>g.dispose());}
// Moving traffic: one draw per repeated car part, seeded positions, no imported assets.
const carSpecs=Array.from({length:8},(_,i)=>({i,lane:i%4,z:3.45+i%4*1.7,color:['#B7C7CC','#E6CB86','#AB4238','#F1ECE3'][i%4],phase:R(0,42),speed:R(1.2,2.1)}));
const carBodies=inst('car-bodies',new RoundedBoxGeometry(2.1,0.6,0.95,2,0.17),mats.white,carSpecs,(o,m)=>compose(m,[0,0.67,o.z]),o=>new THREE.Color(o.color),group('cars'));
const carCabins=inst('car-cabins',new RoundedBoxGeometry(1.1,0.42,0.84,2,0.14),mats.glass,carSpecs,(o,m)=>compose(m,[0,1.07,o.z]),null,group('cars'));
const carWheels=inst('car-wheels',cyl(0.2,0.2,0.15,8),mats.iron,carSpecs.flatMap(c=>[-0.68,0.68].flatMap(x=>[-0.48,0.48].map(z=>({c,x,z})))),(o,m)=>compose(m,[o.x,0.4,o.c.z+o.z],[1,1,1],[Math.PI/2,0,0]),null,group('cars'));
for(const mesh of [carBodies,carCabins,carWheels]){mesh.material=mesh.material.clone();mesh.material.clippingPlanes=clip;mesh.material.clipShadows=true;mesh.frustumCulled=false;}
// Low excursion boats on the river.
const boatSpecs=[{x:-25,z:-22,phase:0},{x:6,z:-30,phase:2.2},{x:27,z:-19,phase:4.1}];
const boatHulls=inst('boat-hulls',new RoundedBoxGeometry(3.8,0.6,1.35,3,0.3),mats.white,boatSpecs,(o,m)=>compose(m,[o.x,-1.55,o.z]),null,group('boats'));
const boatCabins=inst('boat-cabins',new RoundedBoxGeometry(2.3,0.7,1,2,0.12),mats.window,boatSpecs,(o,m)=>compose(m,[o.x,-0.95,o.z]),null,group('boats'));
for(const mesh of [boatHulls,boatCabins])mesh.frustumCulled=false;
// Analytical water ripples and sky reflections, generated in the shader (no texture).
const waterU={time:{value:0},water:{value:new THREE.Color('#3E5F7A')},low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()},lights:{value:0}};
const water=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.ShaderMaterial({uniforms:waterU,vertexShader:'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:`varying vec3 vWorld;uniform float time,lights;uniform vec3 water,low,mid,top;
void main(){vec2 p=vWorld.xz;float wavePhase=p.y*2.2+sin(p.x*.27+time*.1)*1.4+time*.6;float w=sin(wavePhase)/(1.+fwidth(wavePhase)*3.);float far=smoothstep(5.,100.,-p.y);vec3 c=mix(water*.48,mid*.72,far);c+=mix(mid,low,.2)*.018*(.5+.5*w);float glitter=pow(max(0.,sin(p.y*9.+time)*sin(p.x*1.6-p.y*3.)),15.);float stripe=exp(-pow((p.x+33.)/5.,2.))*smoothstep(-44.,-37.,p.y)*(1.-smoothstep(-17.,-12.,p.y));c+=vec3(.34,.12,.23)*glitter*stripe*lights;vec3 n=normalize(vWorld-cameraPosition);float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),5.);vec3 haze=mix(mid,top,smoothstep(0.,.9,n.y));haze=mix(haze,low,exp(-abs(n.y)*8.)*side*.65);float fog=1.-exp(-distance(cameraPosition.xz,p)*.012);c=mix(c,haze,fog);gl_FragColor=vec4(c,1.);}`}));water.rotation.x=-Math.PI/2;water.position.y=-1.85;scene.add(water);
// Water occupies the back of the board as well as the surrounding river; the rear corners follow the base.
{const b=layout.waterSurface,hw=b.size[0]/2,f=-b.max[2],back=-b.min[2],r=BASE.radius,s=new THREE.Shape();s.moveTo(-hw,f);s.lineTo(hw,f);s.lineTo(hw,back-r);s.quadraticCurveTo(hw,back,hw-r,back);s.lineTo(-hw+r,back);s.quadraticCurveTo(-hw,back,-hw,back-r);s.lineTo(-hw,f);const g=new THREE.ShapeGeometry(s,12);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,water.material);m.position.y=b.center[1];scene.add(m);}
const skyU={low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(550,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',fragmentShader:'varying vec3 d;uniform vec3 low,mid,top;void main(){vec3 n=normalize(d);float h=n.y;vec3 c=mix(mid,top,smoothstep(0.,.9,h));float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),5.);c=mix(c,low,exp(-abs(h)*8.)*side*.65);gl_FragColor=vec4(c,1.);}'}));sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
const sun=new THREE.DirectionalLight(0xffa564,2.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:180});sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.08;scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xd4d7e6,0x948265,1);scene.add(hemi);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),0.28,0.45,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
const requested=params.get('view'),validView=Object.hasOwn(VIEWS,requested),fixedTime=validView?Math.max(0,number('t',13)):null;
let view=validView?requested:'auto',frozen=validView,hour=clamp(number('h',0.55),0,1),t=fixedTime??0;
const rig=createRig({u:validView?VIEWS[requested]:0,auto:!matchMedia('(prefers-reduced-motion: reduce)').matches});
let W=1,H=1,aspect=1,scaleIdx=0,pixelRatio=1,frames=0,calls=0,tris=0,fps=60,slow=0,fast=0;
const scales=[1,0.85,0.7,0.55];
document.body.classList.toggle('detail',validView&&['bridge','pagoda'].includes(requested));
function resize(){W=innerWidth;H=innerHeight;aspect=W/H;pixelRatio=Math.min(devicePixelRatio||1,2)*scales[scaleIdx];renderer.setPixelRatio(pixelRatio);renderer.setSize(W,H,false);composer.setPixelRatio(pixelRatio);composer.setSize(W,H);camera.aspect=aspect;camera.fov=fovFor(aspect);camera.updateProjectionMatrix();const sh=shiftFor(aspect);camera.projectionMatrix.elements[8]=-sh[0];camera.projectionMatrix.elements[9]=-sh[1];camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
addEventListener('resize',resize);resize();
let hoverId=null;
const tramLamps=group('tram').children.find(m=>m.name==='tram-lamp').material;
const tramWindows=group('tram').children.find(m=>m.name==='tram-window').material;
function applyHour(){const h=skyAt(hour);for(const k of ['low','mid','top'])skyU[k].value.setRGB(...h[k]);waterU.low.value.setRGB(...h.low);waterU.mid.value.setRGB(...h.mid);waterU.top.value.setRGB(...h.top);waterU.lights.value=h.lights;scene.fog.color.setRGB(...h.mid).multiplyScalar(1.2);sun.color.setRGB(...h.key);sun.intensity=h.keyInt;sun.position.set(-40,80*h.sunY,-65);hemi.intensity=h.hemi;mats.lamp.color.copy(warm).multiplyScalar(0.12+4.6*h.lights);mats.window.emissiveIntensity=1.4*h.lights*(hoverId==='pagoda'?1.18:1);tramWindows.emissiveIntensity=1.35*h.lights;tramLamps.color.copy(warm).multiplyScalar(.15+3*h.lights);mats.tower.emissiveIntensity=h.lights*0.65;for(const l of lampLights)l.intensity=30*h.lights;bridgeLight.intensity=26*h.lights*(hoverId==='bridge'?1.25:1);}
$('hour').value=String(hour*1000);$('hour').addEventListener('input',()=>hour=Number($('hour').value)/1000);
const syncAuto=()=>document.querySelector('[data-act=auto]').setAttribute('aria-pressed',String(rig.auto));syncAuto();
const touchRig=()=>{frozen=false;view='manual';rig.grab();};
$('tools').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;touchRig();if(b.dataset.act==='in')rig.zoom(0.87);if(b.dataset.act==='out')rig.zoom(1/0.87);if(b.dataset.act==='reset'){rig.reset();view='auto';}if(b.dataset.act==='auto')rig.setAuto(!rig.auto);syncAuto();});
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{touchRig();rig.held=true;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);pinch=0;});
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),hit=new THREE.Vector3();
const hoverBoxes=['bridge','pagoda'].map(id=>({id,box:new THREE.Box3().setFromObject(group(id))}));
canvas.addEventListener('pointermove',e=>{const p=pointers.get(e.pointerId);if(!p){mouse.set(e.clientX/W*2-1,1-e.clientY/H*2);ray.setFromCamera(mouse,camera);hoverId=null;let best=Infinity;for(const q of hoverBoxes)if(ray.ray.intersectBox(q.box,hit)){const d=hit.distanceTo(camera.position);if(d<best){best=d;hoverId=q.id;}}return;}const dx=e.clientX-p[0],dy=e.clientY-p[1];p[0]=e.clientX;p[1]=e.clientY;if(pointers.size===1)rig.drag(dx/H*2.2,dy/H*1.6);else if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)rig.zoom(clamp(pinch/d,0.85,1.18));pinch=d;}});
const release=e=>{pointers.delete(e.pointerId);pinch=0;rig.held=pointers.size>0;rig.idle=0;};
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
const clearPointers=()=>{pointers.clear();pinch=0;rig.held=false;rig.idle=0;};addEventListener('blur',clearPointers);document.addEventListener('visibilitychange',clearPointers);canvas.addEventListener('pointerleave',()=>hoverId=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(frozen)touchRig();rig.zoom(Math.exp(clamp(e.deltaY,-120,120)*0.0014));},{passive:false});
function animate(dt){if(!frozen)t+=dt;const pose=rig.update(frozen?0:dt);camera.position.fromArray(pose.pos);camera.lookAt(...pose.target);camera.updateMatrixWorld();sky.position.copy(camera.position);if(!frozen){view=rig.mode;document.body.classList.toggle('detail',camera.position.distanceTo(new THREE.Vector3(0,4,0))<40);}wind.value=t;waterU.time.value=t;group('tram').position.x=tramAt(t).x;
 const xx=[];carSpecs.forEach((c,i)=>{const dir=c.lane<2?1:-1,x=(((t*c.speed+c.phase)%48)-24)*dir;xx.push(x);carBodies.setMatrixAt(i,compose(M,[x,0.67,c.z]));carCabins.setMatrixAt(i,compose(M,[x-dir*0.15,1.07,c.z]));});
 let wi=0;for(const c of carSpecs)for(const x of [-0.68,0.68])for(const z of [-0.48,0.48])carWheels.setMatrixAt(wi++,compose(M,[xx[c.i]+x,0.4,c.z+z],[1,1,1],[Math.PI/2,0,0]));for(const mesh of [carBodies,carCabins,carWheels])mesh.instanceMatrix.needsUpdate=true;
 boatSpecs.forEach((b,i)=>{const x=b.x+Math.sin(t*0.018+b.phase)*7,y=Math.sin(t*0.7+b.phase)*0.045;boatHulls.setMatrixAt(i,compose(M,[x,-1.55+y,b.z]));boatCabins.setMatrixAt(i,compose(M,[x,-0.95+y,b.z]));});boatHulls.instanceMatrix.needsUpdate=true;boatCabins.instanceMatrix.needsUpdate=true;applyHour();renderer.info.reset();composer.render();calls=renderer.info.render.calls;tris=renderer.info.render.triangles;frames++;}
let last=performance.now();function frame(now){const raw=(now-last)/1000;last=now;animate(Math.min(raw,0.1));if(raw>0){fps+=(1/raw-fps)*0.05;if(fps<44){slow+=raw;fast=0;}else if(fps>57){fast+=raw;slow=0;}else{fast=slow=0;}}if(slow>1.5&&scaleIdx<3){scaleIdx++;slow=0;resize();}if(fast>12&&scaleIdx>0){scaleIdx--;fast=0;resize();}requestAnimationFrame(frame);}requestAnimationFrame(frame);
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),rendererName=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const rectOf=el=>{const r=el.getBoundingClientRect();return{x0:r.left/W,x1:r.right/W,y0:r.top/H,y1:r.bottom/H};};
// Project actual rendered geometry bounds with the actual Three camera, including its view shift.
function projected(b){const ps=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ps.push(new THREE.Vector3(x,y,z).project(camera));return{x0:(Math.min(...ps.map(p=>p.x))+1)/2,x1:(Math.max(...ps.map(p=>p.x))+1)/2,y0:(1-Math.max(...ps.map(p=>p.y)))/2,y1:(1-Math.min(...ps.map(p=>p.y)))/2,front:ps.every(p=>p.z<1)};}
const staticBoxes=Object.fromEntries(['pagoda','canton','bridge'].map(k=>[k,new THREE.Box3().setFromObject(group(k))]));
window.__huacheng={get ready(){return frames>3;},state:()=>({view,requestedView:requested,mode:rig.mode,auto:rig.auto,cam:camera.position.toArray(),target:rig.look.slice(),u:rig.u,t,hour,hover:hoverId,held:rig.held,tram:tramAt(t),frozen}),
info:()=>({calls,tris,fps,renderer:rendererName,w:W,h:H,dpr:devicePixelRatio,pixelRatio,scaleIdx,density:mobile?'mobile':'desktop',instances:instances.reduce((s,m)=>s+m.count,0),inventory:instances.map(m=>({name:m.name,count:m.count,type:m.type,isInstancedMesh:m.isInstancedMesh})),lightLevel:skyAt(hour).lights,lighting:{lamps:lampLights[0].intensity,tramWindows:tramWindows.emissiveIntensity,towerWindows:mats.window.emissiveIntensity}}),
setHour:h=>{if(Number.isFinite(h)){hour=clamp(h,0,1);$('hour').value=String(hour*1000);}},
tramGeometryBounds:()=>{const b=new THREE.Box3().setFromObject(group('tram'));return {min:b.min.toArray(),max:b.max.toArray()};},
subjectBoxes:()=>{const tr=tramAt(t);return{...Object.fromEntries(Object.entries(staticBoxes).map(([k,b])=>[k,projected(b)])),tram:projected(new THREE.Box3(new THREE.Vector3(...tr.clipped.min),new THREE.Vector3(...tr.clipped.max))),base:projected(new THREE.Box3(new THREE.Vector3(-22,-1.6,-16.5),new THREE.Vector3(22,0,16.5))) };},
uiBoxes:()=>Object.fromEntries(['.brand','.badge','.copy','.tele','.credit','.tools','.hour'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none'&&getComputedStyle(document.querySelector(s)).visibility!=='hidden').map(s=>[s,rectOf(document.querySelector(s))])),
};
window.__PLAYTEST__={get ready(){return window.__huacheng.ready;},snapshot:()=>({state:window.__huacheng.state(),info:window.__huacheng.info()}),reset:()=>{rig.reset();t=0;frozen=false;view='auto';syncAuto();}};
