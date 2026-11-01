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
// r186 computes BRDFs even for point lights with exactly zero cutoff attenuation.
// Skip only zero-contribution lights: same illumination, less work at default DPR 2.
THREE.ShaderChunk.lights_fragment_begin=THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight,','if ( directLight.visible ) RE_Direct( directLight,');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(56,1,0.15,650);
const boardBounds=new THREE.Box3(new THREE.Vector3(-22,-1.6,-16.5),new THREE.Vector3(22,0,16.5));
scene.fog=new THREE.Fog(0x566787,95,250);
const std=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:0.78,...extra});
const warm=new THREE.Color(1,0.62,0.28);
const mats={
 base:std('#EEE8DE'),road:std('#4A4C52'),grass:std('#597342'),paving:std('#C9B9A3'),stone:std('#D8D2C6'),bridge:std('#C8BEAD'),
 brick:std('#9A5A3E',{emissive:'#9A5A3E',emissiveIntensity:.32}),cornice:std('#B99082'),seam:std('#724B41'),rock:std('#A4553A',{flatShading:true}),soil:std('#746247'),
 bark:std('#69543D'),iron:std('#3D494B',{metalness:0.5,roughness:0.4}),rail:std('#B6B9B0',{metalness:0.2,roughness:0.62}),
 line:std('#E4D9B7'),white:std('#F4F4F0'),glass:std('#253B47',{metalness:0.3,roughness:0.2}),red:std('#C8272D'),gray:std('#777C7C'),
 lamp:new THREE.MeshBasicMaterial({color:new THREE.Color(2,1.24,0.56)}),window:std('#171614',{emissive:warm,emissiveIntensity:2}),
 darkWindow:std('#35302C'),silk:std('#E87BA8',{side:THREE.DoubleSide}),leaf:std('#FFFFFF',{side:THREE.DoubleSide}),bract:std('#FFFFFF',{side:THREE.DoubleSide}),
 skyline:std('#546776',{roughness:1}),tower:std('#C4C4DB',{metalness:0.15,roughness:0.55,vertexColors:true,emissive:0x746ba6,emissiveIntensity:0.4})
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
// New repeated details share the existing collectors; no new scene framework.
mats.sandstone=std('#FFFFFF',{flatShading:true});
mats.shrub=std('#416638',{flatShading:true});
mats.bank=std('#40534B');
mats.cityLeaf=std('#3B5650',{flatShading:true});
mats.glass.side=THREE.DoubleSide;mats.glass.emissive.set('#234452');mats.glass.emissiveIntensity=.13;
mats.tail=new THREE.MeshBasicMaterial({color:0x9d1c12});
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
// Three terraces: jagged sandstone blocks, pale octagonal platform and stair gap.
const rocks=[],hillPlants=[];
for(let tier=0;tier<3;tier++){
 const rx=5.9-tier*1.25,rz=5.05-tier*1.02,y=.4+tier*.6;
 put('pagoda','rock',cyl(1,1,.64,13),[11.8,y+.27,-6],[0,tier*.2,0],[rx,1,rz]);
 for(let j=0;j<35-tier*5;j++){
  const a=j/(35-tier*5)*Math.PI*2;
  if(Math.sin(a)>.92&&Math.abs(Math.cos(a)*rx)<.9)continue;
  rocks.push({p:[11.8+Math.cos(a)*rx,y+.25+R(-.1,.1),-6+Math.sin(a)*rz],scale:[R(.55,.95),R(.35,.55),R(.45,.8)],rot:[R(-.4,.4),R(0,6.28),R(-.2,.2)],shade:R(.68,1.25)});
  if(j%2===0)hillPlants.push({p:[11.8+Math.cos(a)*(rx-.25),y+.65,-6+Math.sin(a)*(rz-.25)],scale:[R(.2,.45),R(.2,.35),R(.2,.4)]});
 }
}
inst('sandstone-blocks',new THREE.DodecahedronGeometry(1,0),mats.sandstone,rocks,(o,m)=>compose(m,o.p,o.scale,o.rot),o=>new THREE.Color('#A4553A').multiplyScalar(o.shade),group('pagoda'));
inst('rock-crevice-shrubs',new THREE.IcosahedronGeometry(1,0),mats.shrub,hillPlants,(o,m)=>compose(m,o.p,o.scale),null,group('pagoda'));
put('pagoda','stone',cyl(3.48,3.6,.25,8),[11.8,2.075,-6]);
put('pagoda','stone',cyl(2.65,2.9,.3,8),[11.8,2.35,-6]);
const terraceRails=[];
for(let i=0;i<32;i++){
 const a=i/32*Math.PI*2;if(Math.cos(a)>.91)continue;
 const x=11.8+Math.sin(a)*3.35,z=-6+Math.cos(a)*3.35;
 terraceRails.push({a:[x,2.2,z],b:[x,2.95,z],width:.09});
 const b=a+Math.PI/16;if(Math.cos(b)>.91)continue;
 for(const y of [2.55,2.93])terraceRails.push({a:[x,y,z],b:[11.8+Math.sin(b)*3.35,y,-6+Math.cos(b)*3.35],width:.085});
}
inst('terrace-balustrade',cube(1,1,1),mats.stone,terraceRails,beamMatrix,null,group('pagoda'));
for(let i=0;i<12;i++)put('pagoda','stone',cube(1.55,.16+i*.15,.35),[11.8,.4+(.16+i*.15)/2,-.65-i*.29]);
// Narrow stepped brick corbel cornices, NOT nine pavilion roofs. Arches follow each octagonal face.
function arch(w,h){const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2-w/2);s.absarc(0,h/2-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,-h/2);return new THREE.ShapeGeometry(s,12);}
// Staggered brick courses vary individually, without adding geometry or texture files.
mats.brick.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 vBrick;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vBrick=position;');
 shader.fragmentShader='varying vec3 vBrick;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float row=floor(vBrick.y/.22),a=atan(vBrick.x-11.8,vBrick.z+6.);
 float col=floor(a*length(vBrick.xz-vec2(11.8,-6.))/.43+mod(row,2.)*.5);
 float brickShade=mix(.76,1.24,fract(sin(dot(vec2(col,row),vec2(127.1,311.7)))*43758.5453));
 diffuseColor.rgb*=brickShade;`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance*=brickShade;');
};
const pagodaHour={value:.55};
const pagodaWindowMat=std('#29231F',{emissive:warm,emissiveIntensity:1});
pagodaWindowMat.onBeforeCompile=shader=>{
 shader.uniforms.uPagodaHour=pagodaHour;
 shader.vertexShader='varying float vWindowOnAt;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWindowOnAt=instanceColor.r;');
 shader.fragmentShader='varying float vWindowOnAt;uniform float uPagodaHour;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float lit=smoothstep(vWindowOnAt-.025,vWindowOnAt+.025,uPagodaHour);
 diffuseColor.rgb=mix(vec3(.018,.014,.012),vec3(.13,.09,.05),lit);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance*=lit;');
};
const pagodaWindows=inst('pagoda-windows',arch(1,1),pagodaWindowMat,layout.levels.flatMap(l=>l.windows),(w,m)=>compose(m,[w.p[0]+Math.sin(w.angle)*.025,w.p[1],w.p[2]+Math.cos(w.angle)*.025],[w.w,w.h,1],[0,w.angle,0]),w=>new THREE.Color().setRGB(w.onAt,1,1),group('pagoda'));
pagodaWindows.castShadow=false;
for(const lv of layout.levels){
 put('pagoda','brick',cyl(lv.radius-0.09,lv.radius,1.65,8),[PAGODA.x,(lv.bottom+lv.top)/2,PAGODA.z]);
 for(const [dy,rr,hh,mat] of [[-0.16,0.05,0.10,'seam'],[-0.05,0.16,0.12,'cornice'],[0.08,0.25,0.14,'cornice']])put('pagoda',mat,cyl(lv.radius+rr,lv.radius+rr-0.02,hh,8),[PAGODA.x,lv.top+dy,PAGODA.z]);
 for(const w of lv.windows)put('pagoda','seam',arch(w.w+0.13,w.h+0.16),w.p,[0,w.angle,0]);
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
 else if(t.kind==='palm'){
   for(let j=0;j<12;j++){
    const a=j/12,b=(j+1)/12,at=u=>[x+.22*u*u,y+t.h*u,z+.18*Math.sin(Math.PI*u)];
    rod('ground','bark',at(a),at(b),.21-.1*a);
    put('ground','seam',cyl(.215-.1*a,.215-.1*a,.045,9),at(a));
   }
 } else put('ground','bark',cyl(.12,.22,t.h*.65,9),[x,y+t.h*.325,z]);
 for(const b of t.branches)rod('ground','bark',b.a,b.b,b.width);
 for(const l of t.leaves)leafItems.push(l);
 for(const f of t.flowers){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rot));for(let k=0;k<5;k++){const local=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),k*Math.PI*2/5);petals.push({p:f.p,quat:q.clone().multiply(local),size:f.size,shade:f.shade});}centres.push(f);}
}
for(const b of hillPlants)for(let i=0;i<12;i++)leafItems.push({p:[b.p[0]+R(-.25,.25),b.p[1]-.08,b.p[2]+R(-.25,.25)],scale:[.045,R(.2,.45),1],rot:[R(-.5,.5),R(0,6.28),R(-.5,.5)],shade:R(.25,.8)});
const leafColors=[new THREE.Color('#2F6B34'),new THREE.Color('#85A83F')];
const leaves=inst('individual-leaves',leafGeometry(),mats.leaf,leafItems,(o,m)=>compose(m,o.p,o.scale,o.rot),o=>leafColors[0].clone().lerp(leafColors[1],o.shade));
const flowers=inst('silk-five-petals',petalGeometry(),mats.silk,petals,(o,m)=>m.compose(P.fromArray(o.p),o.quat,S.set(o.size,o.size,1)),o=>new THREE.Color().setScalar(o.shade));
inst('silk-centres',new THREE.SphereGeometry(0.035,5,4),mats.cornice,centres,(o,m)=>compose(m,o.p));
inst('flower-vine-leaves',leafGeometry(),mats.leaf,layout.bracts.filter((_,i)=>i%4===0),(o,m)=>compose(m,[o.p[0],o.p[1]+.06,o.p[2]],[.18,.26,1],o.rot),()=>new THREE.Color('#426E35'),group('bridge'));
const bracts=inst('bougainvillea-bracts',petalGeometry(),mats.bract,layout.bracts,(o,m)=>compose(m,o.p,[o.scale*1.3,o.scale*1.8,o.scale],o.rot),o=>new THREE.Color(COLORS[o.color]).multiplyScalar(o.shade),group('bridge'));
// Broad drifts on both walks, track margins, road median and around the terraces.
// Blossoms are shallow five-petal cups, not flat coloured rugs.
const gardens=[],gardenFlowers=[],gardenLeaves=[];
function bed(x,z,w,d,color,y=.72,planter=false){gardens.push({x,z,w,d,color,y,planter});}
for(let x=-19.8;x<21;x+=2.25){
 for(const z of [-1.5,1.55])bed(x,z,2.2,.65,Math.floor((x+22)/4)%4,.63);
 if(Math.abs(x+14)>1.6&&Math.abs(x-13.5)>1.6&&Math.abs(x+5.5)>1.7)bed(x,6,2.05,.55,Math.floor((x+22)/5)%4,.68,true);
}
for(let x=-19;x<21;x+=3.1){
 if(x<-5||x>3.5)bed(x,11.1,2.9,1.7,Math.floor((x+22)/5)%4,.93,true);
 bed(x,14.25,2.95,1.6,(Math.floor((x+22)/4)+1)%4,.76);
 if(x<5||x>18)bed(x,-5.2,2.6,2.05,Math.floor((x+22)/4)%4,.9,true);
 if(x<5)bed(x,-8.5,2.7,1.1,(Math.floor((x+22)/4)+2)%4,.85,true);
}
for(let i=0;i<32;i++){
 const a=i/32*Math.PI*2,x=11.8+Math.cos(a)*5.65,z=-6+Math.sin(a)*4.75;
 if(z> -2.3&&Math.abs(x-11.8)<1.2)continue;
 bed(x,z,1.5,1.35,i%4,1.05);
}
// The bridge-side palm has been a spike above the deck: put flower boxes in that sightline.
for(const z of [-5.5,-1,3.5,8])bed(-5.5,z,.7,1.35,Math.floor(z+8)%4,6.05,true);
for(const b of gardens){
 if(b.planter){put('ground','stone',new RoundedBoxGeometry(b.w,.4,b.d,1,.06),[b.x,b.y-.3,b.z]);put('ground','soil',cube(b.w-.1,.08,b.d-.1),[b.x,b.y-.07,b.z]);}
 const spacing=mobile?.23:.17;
 for(let xx=-b.w/2;xx<b.w/2;xx+=spacing)for(let zz=-b.d/2;zz<b.d/2;zz+=spacing){
  const x=b.x+xx+R(0,spacing),z=b.z+zz+R(0,spacing),yy=b.y+.10+R(0,.35)+.2*Math.cos(xx*2)*Math.cos(zz*3);
  gardenFlowers.push({p:[x,yy,z],size:R(.11,.19),rot:[R(-.85,.85),R(0,6.28),R(-.75,.75)],color:b.color,shade:R(.78,1.22)});
  if(rnd()<.22)gardenLeaves.push({p:[x,yy-.2,z],scale:[.13,.3,1],rot:[R(-1,1),R(0,6.28),R(-2,2)],shade:R(.2,.8)});
 }
}
const blossomParts=[];
for(let i=0;i<5;i++){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.28,.28,.04,-.32,.7,.09,0,1,.22,.32,.7,.09,.28,.28,.04],3));
 g.setIndex([0,1,2,0,2,3,0,3,4,0,4,5]);g.computeVertexNormals();
 g.rotateX(-Math.PI/2+.16);g.rotateY(i*Math.PI*2/5);blossomParts.push(g);
}
const blossomGeometry=mergeGeometries(blossomParts);blossomParts.forEach(g=>g.dispose());
const gardenMesh=inst('garden-blossoms',blossomGeometry,mats.bract,gardenFlowers,(o,m)=>compose(m,o.p,[o.size,o.size,o.size],o.rot),o=>new THREE.Color(COLORS[o.color]).multiplyScalar(o.shade),group('ground'));
inst('garden-leaves',leafGeometry(),mats.leaf,gardenLeaves,(o,m)=>compose(m,o.p,o.scale,o.rot),o=>leafColors[0].clone().lerp(leafColors[1],o.shade),group('ground'));
const gardenCentres=inst('garden-centres',new THREE.CircleGeometry(.026,5),mats.cornice,gardenFlowers,(o,m)=>compose(m,[o.p[0],o.p[1]+.012,o.p[2]],[1,1,1],[-Math.PI/2,0,0]),null,group('ground'));
gardenCentres.castShadow=false;
// Small vertex displacement on each leaf; shadows share the same bend shader.
const wind={value:0};
function windShader(shader){shader.uniforms.uWind=wind;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += 0.12 * position.y * sin(uWind*1.2 + instanceMatrix[3].x*1.7 + instanceMatrix[3].z);');}
for(const mesh of [leaves,flowers,bracts,gardenMesh]){mesh.material.onBeforeCompile=windShader;mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});mesh.customDepthMaterial.onBeforeCompile=windShader;}
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
const towerU={time:{value:0},level:{value:0}};
mats.tower.onBeforeCompile=shader=>{
 shader.uniforms.uTowerTime=towerU.time;shader.uniforms.uTowerLevel=towerU.level;
 shader.vertexShader='varying float vTowerY;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vTowerY=position.y;');
 shader.fragmentShader='varying float vTowerY;uniform float uTowerTime,uTowerLevel;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n vec3 band=.55+.45*cos(vec3(0.,2.1,4.2)+vTowerY*.18-uTowerTime*.12); totalEmissiveRadiance=band*uTowerLevel;');
};
const beacon=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshBasicMaterial({color:0xff1812}));beacon.position.set(CANTON.x,CANTON.base+CANTON.height+9,CANTON.z);group('canton').add(beacon);
// The bank joins the horizon: continuous embankment, tree line, no floating platform.
const cityWindows=[],distantTrees=[];
for(let i=0;i<105;i++){
 const x=-180+i*3.5,h=R(4,15),w=R(1.8,3.1),z=R(-65,-54);
 if(Math.abs(x-CANTON.x)<4)continue;
 const style=i%4;
 put('city','skyline',cube(w,h,3),[x,h/2-1.2,z]);
 if(style===0){put('city','skyline',cube(w*.74,2.2,2.3),[x,h-.1,z]);put('city','skyline',cube(w*.45,1.7,1.6),[x,h+1.85,z]);}
 if(style===1)put('city','skyline',new THREE.ConeGeometry(w*.67,3,4),[x,h+.3,z],[0,Math.PI/4,0]);
 if(style===2){const g=cube(w,2,3),ps=g.attributes.position;for(let j=0;j<ps.count;j++)if(ps.getY(j)>0)ps.setY(j,1+ps.getX(j)*.7);g.computeVertexNormals();put('city','skyline',g,[x,h-.2,z]);}
 for(let yy=.3;yy<h-1.3;yy+=.72)for(let xx=-w/2+.35;xx<w/2-.2;xx+=.58)if(rnd()<.55)cityWindows.push({p:[x+xx,yy,z+1.51],roll:rnd()});
}
// Continuous land behind the tree line, with no thickness or exposed tray edges.
put('city','bank',new THREE.PlaneGeometry(800,400),[0,-1.05,-240],[-Math.PI/2,0,0]);

for(let x=-190;x<=190;x+=1.2){
 const z=-39.4-1.1*Math.sin(x*.035);
 put('city','stone',cube(1.25,1.1,1.2),[x,-1.2,z]);
 for(let j=0;j<2;j++)distantTrees.push({p:[x+R(-.4,.4),R(.3,1.2),z-1.8-j*1.7],scale:[R(.6,1.3),R(.9,1.7),R(.7,1.3)],shade:R(.7,1.2)});
}
inst('distant-trees',new THREE.IcosahedronGeometry(1,1),mats.cityLeaf,distantTrees,(o,m)=>compose(m,o.p,o.scale),o=>new THREE.Color().setScalar(o.shade),group('city'));
const cityWindowMaterial=new THREE.MeshBasicMaterial({color:0xffbd68});
const cityWindowMesh=inst('city-windows',new THREE.PlaneGeometry(.22,.34),cityWindowMaterial,cityWindows,(o,m)=>compose(m,o.p),o=>new THREE.Color().setScalar(o.roll),group('city'));cityWindowMesh.castShadow=false;
const cityU={level:{value:0},haze:{value:new THREE.Color()},low:{value:new THREE.Color()},top:{value:new THREE.Color()}};
function distantShader(shader,windows=false){
 shader.uniforms.uCityLevel=cityU.level;shader.uniforms.uCityHaze=cityU.haze;shader.uniforms.uCityLow=cityU.low;shader.uniforms.uCityTop=cityU.top;
 shader.vertexShader='varying vec3 vCity;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vec4 cityPos=vec4(transformed,1.);\n #ifdef USE_INSTANCING\n cityPos=instanceMatrix*cityPos;\n #endif\n vCity=(modelMatrix*cityPos).xyz;');
 shader.fragmentShader='varying vec3 vCity;uniform float uCityLevel;uniform vec3 uCityHaze,uCityLow,uCityTop;\n'+shader.fragmentShader;
 if(windows)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n if(vColor.r>uCityLevel)discard; diffuseColor.rgb=vec3(1.0,.54,.19)*(1.+uCityLevel);');
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','vec3 n=normalize(vCity-cameraPosition);float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);vec3 haze=mix(uCityHaze,uCityTop,smoothstep(-.08,.40,n.y));haze=mix(haze,uCityLow,exp(-pow((n.y+.20)/.16,2.))*side*.86);float bankFade=.30+.70*max(smoothstep(40.,140.,abs(vCity.x+15.)),smoothstep(120.,270.,distance(cameraPosition,vCity))); outgoingLight=mix(outgoingLight,haze,bankFade);\n #include <opaque_fragment>');
}
for(const mat of [mats.skyline,mats.cityLeaf,mats.bank]){mat.fog=false;mat.onBeforeCompile=shader=>distantShader(shader);}cityWindowMaterial.fog=false;
cityWindowMaterial.onBeforeCompile=shader=>distantShader(shader,true);
// Four articulated low-floor sections. The cab narrows and sweeps back at the glazing.
function cabGeometry(){
 const g=new RoundedBoxGeometry(3.8,2.2,1.65,5,.25),ps=g.attributes.position;
 for(let i=0;i<ps.count;i++){
  const x=ps.getX(i),y=ps.getY(i),f=THREE.MathUtils.smoothstep(x,.65,1.9);
  ps.setZ(i,ps.getZ(i)*(1-.27*f));ps.setX(i,x-f*(.15+.33*Math.max(y,0)));
 }
 g.computeVertexNormals();return g;
}
function windscreen(side,x){
 const g=new THREE.PlaneGeometry(1.12,1.18,12,8),ps=g.attributes.position;
 for(let i=0;i<ps.count;i++){
  const z=ps.getX(i),y=ps.getY(i),nose=1.84-.33*Math.max(y+.37,0)-.12*Math.pow(z/.56,2);
  ps.setXYZ(i,x+side*nose,2.12+y,side*z);
 }
 g.computeVertexNormals();return g;
}
const glazingU={top:{value:new THREE.Color()},bottom:{value:new THREE.Color()}};
mats.windscreen=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
mats.windscreen.onBeforeCompile=shader=>{
 shader.uniforms.uGlassTop=glazingU.top;shader.uniforms.uGlassBottom=glazingU.bottom;
 shader.vertexShader='varying float vGlassHeight;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vGlassHeight=uv.y;');
 shader.fragmentShader='varying float vGlassHeight;uniform vec3 uGlassTop,uGlassBottom;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=mix(uGlassBottom,uGlassTop,smoothstep(0.,1.,vGlassHeight));');
};
const routeCanvas=document.createElement('canvas');routeCanvas.width=256;routeCanvas.height=128;
const rg=routeCanvas.getContext('2d');rg.fillStyle='#FFF9E8';rg.fillRect(0,0,256,128);
rg.fillStyle='#B3232B';rg.font='bold 82px "PingFang SC", "Microsoft YaHei", sans-serif';rg.textAlign='center';rg.textBaseline='middle';rg.fillText('海珠',128,67);
const routeTexture=new THREE.CanvasTexture(routeCanvas);routeTexture.colorSpace=THREE.SRGBColorSpace;
mats.route=new THREE.MeshBasicMaterial({map:routeTexture});
// Procedural kapok wrap, with separated five-petal silhouettes and golden stamens.
const wrapCanvas=document.createElement('canvas');wrapCanvas.width=1024;wrapCanvas.height=160;
const wg=wrapCanvas.getContext('2d');
for(const [x,y,r] of [[95,76,35],[190,102,23],[264,62,42],[565,86,34],[646,52,27],[715,103,39],[885,74,31]]){
 wg.save();wg.translate(x,y);wg.fillStyle='#C8272D';
 for(let k=0;k<5;k++){wg.rotate(Math.PI*2/5);wg.beginPath();wg.ellipse(0,-r*.48,r*.29,r*.52,0,0,Math.PI*2);wg.fill();}
 wg.fillStyle='#E6AD37';wg.beginPath();wg.arc(0,0,r*.13,0,Math.PI*2);wg.fill();wg.restore();
}
const wrapTexture=new THREE.CanvasTexture(wrapCanvas);wrapTexture.colorSpace=THREE.SRGBColorSpace;
mats.wrap=new THREE.MeshStandardMaterial({map:wrapTexture,transparent:true,alphaTest:.3,depthWrite:false,roughness:.7,side:THREE.DoubleSide});
for(let i=0;i<TRAM.cars;i++){
 const x=(i-1.5)*(TRAM.carLength+TRAM.gap),end=i===0||i===3,dir=i===0?-1:1;
 put('tram','white',end?cabGeometry():new RoundedBoxGeometry(3.8,2.2,1.65,4,.22),[x,1.75,0],[0,end&&dir===-1?Math.PI:0,0]);
 // White skirts cover all but the bottom 8 cm of dark wheel rims.
 put('tram','white',new RoundedBoxGeometry(end?3.3:3.7,.55,1.62,3,.16),[x-(end?dir*.16:0),.68,0]);
 put('tram','gray',new RoundedBoxGeometry(1.65,.24,.92,2,.1),[x-.3,2.98,0]);
 for(let j=0;j<5;j++)put('tram','iron',cube(.035,.05,.7),[x-.85+j*.23,3.12,0]);
 for(const side of [-1,1]){
  for(let j=0;j<(end?3:4);j++){
   const dx=-1.25+j*.82+(end&&dir===-1?.85:0);
   put('tram','window',new RoundedBoxGeometry(.68,.94,.045,2,.065),[x+dx,2.02,side*.824]);
   put('tram','glass',cube(.035,1.12,.05),[x+dx+.38,1.96,side*.84]);
  }
  // One glass strip at the cab side joins the curved windscreen.
  if(end)put('tram','glass',new RoundedBoxGeometry(.55,1.02,.04,2,.08),[x+dir*1.08,2.05,side*.69],[0,-side*dir*.25,0]);
  put('tram','wrap',new THREE.PlaneGeometry(end?2.6:3.6,.48),[x-(end?dir*.3:0),1.14,side*.833],[0,side===1?0:Math.PI,0]);
  // Door seams / handles remain slim at this scale.
  put('tram','gray',cube(.018,1.6,.02),[x-.45,1.55,side*.84]);
 }
 for(const sx of [-1,1])for(const sz of [-1,1])put('tram','iron',cyl(.22,.22,.12,12),[x+sx*1.12,.54,sz*.69],[Math.PI/2,0,0]);
 if(i<3)for(let j=0;j<6;j++)put('tram',j%2?'gray':'iron',new RoundedBoxGeometry(.035,1.98,1.43,2,.12),[x+1.92+j*.044,1.66,0]);
 if(end){
  const glass=windscreen(dir,x);if(dir===-1)glass.setIndex(Array.from(glass.index.array).reduce((a,_,j,ar)=>{if(j%3===0)a.push(ar[j],ar[j+2],ar[j+1]);return a;},[]));
  put('tram','windscreen',glass);
  put('tram','lamp',cube(.035,.055,1.0),[x+dir*1.79,1.40,0]);
  put('tram','route',new THREE.PlaneGeometry(.48,.24),[x+dir*1.79,1.06,0],[0,dir*Math.PI/2,0]);
  rod('tram','iron',[x+dir*1.52,1.62,-.28],[x+dir*1.37,2.16,.25],.018);
 }
}
for(const z of [-.32,.32]){
 rod('tram','iron',[-1.8,3.14,z],[-.95,3.62,z],.022);rod('tram','iron',[-.95,3.62,z],[-.15,3.14,z],.022);
}
rod('tram','iron',[-.95,3.62,-.58],[-.95,3.62,.58],.028);
const clip=[new THREE.Plane(new THREE.Vector3(1,0,0),TRAM.clipX),new THREE.Plane(new THREE.Vector3(-1,0,0),TRAM.clipX)];
// Commit collected geometry. Every tram material (including lamps) uses the same world-space boundary.
for(const [key,gs] of bins){const [owner,mat]=key.split('|'),material=owner==='tram'||owner==='city'&&mat==='stone'?mats[mat].clone():mats[mat];if(owner==='tram'){material.clippingPlanes=clip;material.clipShadows=true;material.onBeforeCompile=mats[mat].onBeforeCompile;}if(owner==='city'&&mat==='stone'){material.fog=false;material.onBeforeCompile=shader=>distantShader(shader);}const mesh=new THREE.Mesh(mergeGeometries(gs),material);mesh.name=owner+'-'+mat;mesh.castShadow=!['city','canton'].includes(owner)&&!['lamp','windscreen','route'].includes(mat);mesh.receiveShadow=true;group(owner).add(mesh);gs.forEach(g=>g.dispose());}
// Moving traffic: one draw per repeated car part, seeded positions, no imported assets.
const carSpecs=Array.from({length:8},(_,i)=>({i,lane:i%4,z:3.45+i%4*1.7,color:['#B7C7CC','#E6CB86','#AB4238','#F1ECE3'][i%4],phase:R(0,42),speed:R(1.2,2.1)}));
const carBodies=inst('car-bodies',new RoundedBoxGeometry(2.1,0.6,0.95,2,0.17),mats.white,carSpecs,(o,m)=>compose(m,[0,0.67,o.z]),o=>new THREE.Color(o.color),group('cars'));
const carCabins=inst('car-cabins',new RoundedBoxGeometry(1.1,0.42,0.84,2,0.14),mats.glass,carSpecs,(o,m)=>compose(m,[0,1.07,o.z]),null,group('cars'));
const carWheels=inst('car-wheels',cyl(0.2,0.2,0.15,8),mats.iron,carSpecs.flatMap(c=>[-0.68,0.68].flatMap(x=>[-0.48,0.48].map(z=>({c,x,z})))),(o,m)=>compose(m,[o.x,0.4,o.c.z+o.z],[1,1,1],[Math.PI/2,0,0]),null,group('cars'));
// Painted roof and bumpers break up the dark cabin; each end has its own light colour.
const carRoof=inst('car-roofs',new RoundedBoxGeometry(.92,.10,.69,2,.04),mats.white,carSpecs,(o,m)=>compose(m,[0,1.3,o.z]),o=>new THREE.Color(o.color),group('cars'));
function pairGeometry(x,y){const parts=[];for(const z of [-.31,.31]){const g=new THREE.BoxGeometry(.05,.10,.2);g.translate(x,y,z);parts.push(g);}const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;}
const headMat=new THREE.MeshBasicMaterial({color:0xffd39a}),tailMat=new THREE.MeshBasicMaterial({color:0x7e130a});
const carHeads=inst('car-headlights',pairGeometry(1.04,.66),headMat,carSpecs,(o,m)=>compose(m,[0,0,o.z]),null,group('cars'));
const carTails=inst('car-taillights',pairGeometry(-1.04,.68),tailMat,carSpecs,(o,m)=>compose(m,[0,0,o.z]),null,group('cars'));
const carGrilles=inst('car-grilles',cube(.035,.13,.4),mats.iron,carSpecs,(o,m)=>compose(m,[1.05,.56,o.z]),null,group('cars'));
carHeads.castShadow=carTails.castShadow=false;
for(const mesh of [carBodies,carCabins,carWheels,carRoof,carHeads,carTails,carGrilles]){mesh.material=mesh.material.clone();mesh.material.clippingPlanes=clip;mesh.material.clipShadows=true;mesh.frustumCulled=false;}
// Low excursion boats on the river.
const boatSpecs=[{x:-25,z:-22,phase:0},{x:6,z:-30,phase:2.2},{x:27,z:-19,phase:4.1}];
const boatHulls=inst('boat-hulls',new RoundedBoxGeometry(3.8,0.6,1.35,3,0.3),mats.white,boatSpecs,(o,m)=>compose(m,[o.x,-1.55,o.z]),null,group('boats'));
const boatCabins=inst('boat-cabins',new RoundedBoxGeometry(2.3,0.7,1,2,0.12),mats.window,boatSpecs,(o,m)=>compose(m,[o.x,-0.95,o.z]),null,group('boats'));
for(const mesh of [boatHulls,boatCabins])mesh.frustumCulled=false;
// A narrow sun path, sparse near glints and separate soft night reflections. No texture files.
const waterU={time:{value:0},water:{value:new THREE.Color('#3E5F7A')},low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()},lights:{value:0},sunset:{value:0}};
const water=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.ShaderMaterial({uniforms:waterU,vertexShader:'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:`varying vec3 vWorld;uniform float time,lights,sunset;uniform vec3 water,low,mid,top;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
// All reflection paths begin at their actual far-bank source and extend towards the viewer.
vec2 pathCoords(vec2 p,vec2 source){vec2 d=normalize(cameraPosition.xz-source);vec2 v=p-source;return vec2(dot(v,vec2(d.y,-d.x)),dot(v,d));}
void main(){
 vec2 p=vWorld.xz;vec3 eye=normalize(cameraPosition-vWorld);float grazing=pow(1.-abs(eye.y),2.);float horizon=exp(-abs(eye.y)*3.);
 vec3 reflection=mix(top,mid,horizon);reflection=mix(reflection,low,.34*horizon);vec3 c=mix(water*.17,reflection,.55+.4*grazing);
 vec2 q=pathCoords(p,vec2(-33.,-43.));float width=1.25+max(q.y,0.)*.022;
 float band=(1.-smoothstep(width*.55,width,abs(q.x)))*smoothstep(0.,3.,q.y);
 vec2 cellPos=q/vec2(.82,.68),cell=floor(cellPos);float glints=0.;
 // Jittered anisotropic patches, not intersecting sine waves. Skip more cells nearer the viewer.
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  vec2 id=cell+vec2(float(i),float(j));float h=hash(id),h2=hash(id+19.71),h3=hash(id+53.17);
  vec2 centre=id+vec2(.12+.76*h,.1+.8*h2);vec2 delta=cellPos-centre;
  float a=.12+.38*h2,b=.018+.065*h3,aa=max(fwidth(cellPos.y),.008);
  float fleck=(1.-smoothstep(a*.45,a,abs(delta.x)))*(1.-smoothstep(b,b+aa,abs(delta.y)));
  float density=mix(.80,.16,smoothstep(0.,95.,q.y));
  float twinkle=pow(.5+.5*sin(time*(.7+h)+h3*30.),3.);
  glints+=fleck*step(h,density)*twinkle;
 }
 c+=low*glints*band*sunset*mix(1.4,.75,smoothstep(20.,100.,q.y));
 // A handful of vertically stretched, blurred city-light reflections take over after dusk.
 float night=smoothstep(.78,1.,lights)*(1.-sunset);
 for(int i=0;i<5;i++){
  float k=float(i);vec2 r=pathCoords(p,vec2(-57.+k*17.,-40.));
  float lengthFade=exp(-max(0.,r.y)/mix(18.,30.,hash(vec2(k,7.))));
  float soft=exp(-pow(r.x/(.48+max(r.y,0.)*.022),2.))*smoothstep(0.,2.,r.y)*lengthFade;
  float ripple=.82+.18*sin(r.y*2.1+time*.65+k);
  vec3 tint=mix(vec3(.42,.23,.10),vec3(.13,.22,.40),mod(k,2.));
  c+=tint*soft*ripple*night*.55;
 }
 vec3 n=normalize(vWorld-cameraPosition);float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);
 vec3 haze=mix(mid,top,smoothstep(-.08,.40,n.y));haze=mix(haze,low,exp(-pow((n.y+.20)/.16,2.))*side*.86);
 float distant=1.-exp(-max(0.,distance(cameraPosition.xz,p)-65.)*.035);c=mix(c,haze,distant);gl_FragColor=vec4(c,1.);
}`}));water.rotation.x=-Math.PI/2;water.position.y=-1.85;scene.add(water);
// Water occupies the back of the board as well as the surrounding river; the rear corners follow the base.
{const b=layout.waterSurface,hw=b.size[0]/2,f=-b.max[2],back=-b.min[2],r=BASE.radius,s=new THREE.Shape();s.moveTo(-hw,f);s.lineTo(hw,f);s.lineTo(hw,back-r);s.quadraticCurveTo(hw,back,hw-r,back);s.lineTo(-hw+r,back);s.quadraticCurveTo(-hw,back,-hw,back-r);s.lineTo(-hw,f);const g=new THREE.ShapeGeometry(s,12);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,water.material);m.position.y=b.center[1];scene.add(m);}
const skyU={low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(550,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',fragmentShader:'varying vec3 d;uniform vec3 low,mid,top;void main(){vec3 n=normalize(d);float h=n.y;vec3 c=mix(mid,top,smoothstep(-.08,.40,h));float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);float glow=exp(-pow((h+.20)/.16,2.))*side;c=mix(c,low,glow*.86);gl_FragColor=vec4(c,1.);}'}));sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
const sun=new THREE.DirectionalLight(0xffa564,2.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:180});sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.08;scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xd4d7e6,0x948265,1);scene.add(hemi);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),0.28,0.45,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
const requested=params.get('view'),validView=Object.hasOwn(VIEWS,requested),fixedTime=validView?Math.max(0,number('t',13)):null;
let view=validView?requested:'auto',frozen=validView,hour=clamp(number('h',0.55),0,1),t=fixedTime??0;
const rig=createRig({u:validView?VIEWS[requested]:0,auto:!matchMedia('(prefers-reduced-motion: reduce)').matches});
let W=1,H=1,aspect=1,copyTop=1,scaleIdx=0,pixelRatio=1,frames=0,calls=0,tris=0,fps=60,slow=0,fast=0;
const scales=[1,0.85,0.7,0.55];
document.body.classList.toggle('detail',validView&&['bridge','pagoda'].includes(requested));
function resize(){W=innerWidth;H=innerHeight;aspect=W/H;copyTop=document.querySelector('.copy').getBoundingClientRect().top/H;pixelRatio=Math.min(devicePixelRatio||1,2)*scales[scaleIdx];renderer.setPixelRatio(pixelRatio);renderer.setSize(W,H,false);composer.setPixelRatio(pixelRatio);composer.setSize(W,H);camera.aspect=aspect;camera.fov=fovFor(aspect);camera.updateProjectionMatrix();const sh=shiftFor(aspect);camera.projectionMatrix.elements[8]=-sh[0];camera.projectionMatrix.elements[9]=-sh[1];camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
addEventListener('resize',resize);resize();
let hoverId=null;
const tramLamps=group('tram').children.find(m=>m.name==='tram-lamp').material;
const tramWindows=group('tram').children.find(m=>m.name==='tram-window').material;
function applyHour(){const h=skyAt(hour);for(const k of ['low','mid','top'])skyU[k].value.setRGB(...h[k]);waterU.low.value.setRGB(...h.low);waterU.mid.value.setRGB(...h.mid);waterU.top.value.setRGB(...h.top);waterU.lights.value=h.lights;waterU.sunset.value=Math.sin(Math.PI*hour)*(1-THREE.MathUtils.smoothstep(hour,.66,.94));pagodaHour.value=hour;pagodaWindowMat.emissiveIntensity=1.4*h.lights*(hoverId==='pagoda'?1.18:1);mats.brick.emissiveIntensity=.32*(1-.8*THREE.MathUtils.smoothstep(hour,.55,1));glazingU.top.value.setRGB(...h.mid).multiplyScalar(1.7).lerp(new THREE.Color(.3,.4,.48),.26*(1-hour));glazingU.bottom.value.setRGB(.012,.025,.034).multiplyScalar(1-.65*hour);scene.fog.color.setRGB(...h.mid);cityU.haze.value.copy(scene.fog.color);cityU.low.value.setRGB(...h.low);cityU.top.value.setRGB(...h.top);cityU.level.value=Math.max(0,(h.lights-.3)*.75);towerU.level.value=Math.pow(h.lights,2)*1.15;towerU.time.value=t;beacon.material.color.setRGB(3,.015,.006).multiplyScalar(h.lights*(Math.sin(t*3.6-1)>.4?1:.05));sun.color.setRGB(...h.key);sun.intensity=h.keyInt;sun.position.set(-40,80*h.sunY,-65);hemi.intensity=h.hemi;headMat.color.setRGB(1,.75,.45).multiplyScalar(.04+2.8*h.lights);tailMat.color.setRGB(1,.014,.004).multiplyScalar(.12+1.7*h.lights);mats.lamp.color.copy(warm).multiplyScalar(0.12+4.6*h.lights);mats.window.emissiveIntensity=1.4*h.lights*(hoverId==='pagoda'?1.18:1);tramWindows.emissiveIntensity=1.35*h.lights;tramLamps.color.copy(warm).multiplyScalar(.15+3*h.lights);mats.tower.emissiveIntensity=h.lights*2.3;for(const l of lampLights)l.intensity=30*h.lights;bridgeLight.intensity=26*h.lights*(hoverId==='bridge'?1.25:1);}
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
function animate(dt){if(!frozen)t+=dt;const pose=rig.update(frozen?0:dt);camera.position.fromArray(pose.pos);camera.lookAt(...pose.target);camera.updateMatrixWorld();sky.position.copy(camera.position);if(!frozen){view=rig.mode;document.body.classList.toggle('detail',camera.position.distanceTo(new THREE.Vector3(0,4,0))<40||(aspect<.8&&projected(boardBounds).y1>copyTop-.02));}wind.value=t;waterU.time.value=t;group('tram').position.x=tramAt(t).x;
 const xx=[];carSpecs.forEach((c,i)=>{const dir=c.lane<2?1:-1,x=(((t*c.speed+c.phase)%48)-24)*dir;xx.push(x);carBodies.setMatrixAt(i,compose(M,[x,0.67,c.z]));carCabins.setMatrixAt(i,compose(M,[x-dir*0.15,1.07,c.z]));carRoof.setMatrixAt(i,compose(M,[x-dir*.17,1.3,c.z]));for(const mesh of [carHeads,carTails])mesh.setMatrixAt(i,compose(M,[x,0,c.z],[1,1,1],[0,dir===1?0:Math.PI,0]));carGrilles.setMatrixAt(i,compose(M,[x+dir*1.05,.56,c.z]));});
 let wi=0;for(const c of carSpecs)for(const x of [-0.68,0.68])for(const z of [-0.48,0.48])carWheels.setMatrixAt(wi++,compose(M,[xx[c.i]+x,0.4,c.z+z],[1,1,1],[Math.PI/2,0,0]));for(const mesh of [carBodies,carCabins,carWheels,carRoof,carHeads,carTails,carGrilles])mesh.instanceMatrix.needsUpdate=true;
 boatSpecs.forEach((b,i)=>{const x=b.x+Math.sin(t*0.018+b.phase)*7,y=Math.sin(t*0.7+b.phase)*0.045;boatHulls.setMatrixAt(i,compose(M,[x,-1.55+y,b.z]));boatCabins.setMatrixAt(i,compose(M,[x,-0.95+y,b.z]));});boatHulls.instanceMatrix.needsUpdate=true;boatCabins.instanceMatrix.needsUpdate=true;applyHour();renderer.info.reset();composer.render();calls=renderer.info.render.calls;tris=renderer.info.render.triangles;frames++;}
let last=performance.now();function frame(now){const raw=(now-last)/1000;last=now;animate(Math.min(raw,0.1));if(raw>0){fps+=(1/raw-fps)*0.05;if(fps<44){slow+=raw;fast=0;}else if(fps>57){fast+=raw;slow=0;}else{fast=slow=0;}}if(slow>1.5&&scaleIdx<3){scaleIdx++;slow=0;resize();}if(fast>12&&scaleIdx>0){scaleIdx--;fast=0;resize();}requestAnimationFrame(frame);}requestAnimationFrame(frame);
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),rendererName=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const rectOf=el=>{const r=el.getBoundingClientRect();return{x0:r.left/W,x1:r.right/W,y0:r.top/H,y1:r.bottom/H};};
// Project actual rendered geometry bounds with the actual Three camera, including its view shift.
function projected(b){const ps=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ps.push(new THREE.Vector3(x,y,z).project(camera));return{x0:(Math.min(...ps.map(p=>p.x))+1)/2,x1:(Math.max(...ps.map(p=>p.x))+1)/2,y0:(1-Math.max(...ps.map(p=>p.y)))/2,y1:(1-Math.min(...ps.map(p=>p.y)))/2,front:ps.every(p=>p.z<1)};}
const staticBoxes=Object.fromEntries(['pagoda','canton','bridge'].map(k=>[k,new THREE.Box3().setFromObject(group(k))]));
window.__huacheng={get ready(){return frames>3;},state:()=>({view,requestedView:requested,mode:rig.mode,auto:rig.auto,cam:camera.position.toArray(),target:rig.look.slice(),u:rig.u,t,hour,hover:hoverId,held:rig.held,tram:tramAt(t),frozen}),
info:()=>({calls,tris,fps,renderer:rendererName,w:W,h:H,dpr:devicePixelRatio,pixelRatio,scaleIdx,density:mobile?'mobile':'desktop',instances:instances.reduce((s,m)=>s+m.count,0),inventory:instances.map(m=>({name:m.name,count:m.count,type:m.type,isInstancedMesh:m.isInstancedMesh})),lightLevel:skyAt(hour).lights,pagodaLitByFloor:layout.levels.map(l=>l.windows.filter(w=>hour>=w.onAt).length),lighting:{lamps:lampLights[0].intensity,tramWindows:tramWindows.emissiveIntensity,towerWindows:pagodaWindowMat.emissiveIntensity}}),
setHour:h=>{if(Number.isFinite(h)){hour=clamp(h,0,1);$('hour').value=String(hour*1000);}},
tramGeometryBounds:()=>{const b=new THREE.Box3().setFromObject(group('tram'));return {min:b.min.toArray(),max:b.max.toArray()};},
subjectBoxes:()=>{const tr=tramAt(t);return{...Object.fromEntries(Object.entries(staticBoxes).map(([k,b])=>[k,projected(b)])),tram:projected(new THREE.Box3(new THREE.Vector3(...tr.clipped.min),new THREE.Vector3(...tr.clipped.max))),base:projected(new THREE.Box3(new THREE.Vector3(-22,-1.6,-16.5),new THREE.Vector3(22,0,16.5))) };},
uiBoxes:()=>Object.fromEntries(['.brand','.badge','.copy','.tele','.credit','.tools','.hour'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none'&&getComputedStyle(document.querySelector(s)).visibility!=='hidden').map(s=>[s,rectOf(document.querySelector(s))])),
};
window.__PLAYTEST__={get ready(){return window.__huacheng.ready;},snapshot:()=>({state:window.__huacheng.state(),info:window.__huacheng.info()}),reset:()=>{rig.reset();t=0;frozen=false;view='auto';syncAuto();}};
