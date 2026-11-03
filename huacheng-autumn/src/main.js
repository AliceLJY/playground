// Pure geometry. No imported models, images, fonts or texture maps.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SEED, BASE, BRIDGE, PAGODA, CANTON, TRAM, COLORS, makeLayout, cantonStructure, tramAt, carAt, boatAt, trafficAt, CAR_SPECS, BOAT_SPECS, mulberry32, clamp, VIEWS, pathAt, createRig, fovFor, shiftFor, skyAt, createJournal, journalStep, journalPlace, journalWindow, journalPrompt, JOURNAL_PLACES } from './core.js';
const $=id=>document.getElementById(id),canvas=$('scene'),params=new URLSearchParams(location.search);
const recording=params.get('record')==='1';
let recordLens=null,recordLamps=null;
if(recording){
 document.body.classList.add('recording');
 const style=document.createElement('style');
 style.textContent='body.recording *,body.recording *:before,body.recording *:after{animation:none!important;transition:none!important}body.recording .tools,body.recording .places,body.recording .hour,body.recording .badge,body.recording .tele,body.recording .credit,body.recording .copy p{display:none!important}body.recording .copy{visibility:visible;left:28px;right:28px;bottom:76px;top:auto;width:auto;max-width:none}body.recording .copy:before{display:none}body.recording .copy{left:0;right:0;bottom:0;padding:42px 28px 28px;box-sizing:border-box;color:#fff7ed;background:linear-gradient(transparent,rgba(8,19,24,.78));text-shadow:0 1px 5px #14212c}body.recording .copy h1{font-size:30px}body.recording .copy h1 b{font-size:24px}body.recording .brand{left:28px;top:auto;bottom:142px;font-size:9px;color:#fff7ed;text-shadow:0 1px 4px #14212c}#record-credit{position:fixed;bottom:76px;left:0;width:100%;text-align:center;font:13px var(--serif);letter-spacing:.12em;color:#f6ecdc;opacity:0;pointer-events:none}#record-fade{position:fixed;inset:0;background:#070c18;opacity:0;pointer-events:none}';
 document.head.append(style);
 for(const id of ['record-credit','record-fade']){const el=document.createElement('div');el.id=id;if(id==='record-credit')el.textContent='花城秋岸 · 我的AI小木屋';document.body.append(el);}
}
const number=(name,fallback)=>{const n=Number(params.get(name));return params.has(name)&&Number.isFinite(n)?n:fallback;};
const mobile=innerWidth<600,layout=makeLayout(SEED,mobile),rnd=mulberry32(SEED+1),R=(a,b)=>a+(b-a)*rnd();
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('fail').style.display='grid';throw e;}
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
// r186 computes BRDFs even for point lights with exactly zero cutoff attenuation.
// Skip only zero-contribution lights: same illumination, less work at default DPR 2.
THREE.ShaderChunk.lights_fragment_begin=THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight,','if ( directLight.visible ) RE_Direct( directLight,');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(56,1,0.15,650);
const boardBounds=new THREE.Box3(new THREE.Vector3(-BASE.width/2,-1.6,-BASE.depth/2),new THREE.Vector3(BASE.width/2,0,BASE.depth/2));
scene.fog=new THREE.Fog('#E8E4DE',260,500);
const std=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:0.78,...extra});
const warm=new THREE.Color(1,.56,.20);
const mats={
 base:std('#DEDCD5'),road:std('#41464A'),grass:std('#647660'),paving:std('#C6C4BA'),stone:std('#D5D4CC'),bridge:std('#DAD9D1'),
 brick:std('#9A5A3E',{roughness:.93}),cornice:std('#AF8D7C'),seam:std('#724B41'),rock:std('#987362'),soil:std('#746247'),
 bark:std('#756D5D'),iron:std('#3D494B',{metalness:0.5,roughness:0.4}),rail:std('#CBCFCD',{metalness:.05,roughness:.78}),
 line:std('#DBDAD1'),white:std('#F4F4F0'),glass:std('#253B47',{metalness:0.3,roughness:0.2}),red:std('#C8272D'),gray:std('#777C7C'),
 lamp:new THREE.MeshBasicMaterial({color:new THREE.Color(2,1.24,0.56)}),window:std('#171614',{emissive:warm,emissiveIntensity:2}),
 darkWindow:std('#1D2222'),silk:std('#E87BA8',{side:THREE.DoubleSide}),leaf:std('#FFFFFF',{side:THREE.DoubleSide,emissive:'#45634B',emissiveIntensity:.10}),bract:std('#FFFFFF',{side:THREE.DoubleSide}),
 skyline:std('#D4D5D2',{roughness:.62}),tower:std('#D6D9D8',{metalness:.32,roughness:.58,emissive:0xffffff,emissiveIntensity:0})
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
const cube=(w,h,d)=>new RoundedBoxGeometry(w,h,d,1,Math.min(.075,w*.14,h*.14,d*.14)),cyl=(a,b,h,n=12)=>new THREE.CylinderGeometry(a,b,h,n);
function rod(owner,mat,a,b,r=0.05){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=cyl(r,r,v.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,v.normalize()));put(owner,mat,g,a.map((x,i)=>(x+b[i])/2));}
// New repeated details share the existing collectors; no new scene framework.
mats.sandstone=std('#FFFFFF');
mats.shrub=std('#506B50');
mats.bank=std('#B2B6AA');
mats.cityLeaf=std('#3F5C42',{side:THREE.DoubleSide});
mats.glass.side=THREE.DoubleSide;mats.glass.emissive.set('#234452');mats.glass.emissiveIntensity=.02;
mats.tail=new THREE.MeshBasicMaterial({color:0x9d1c12});
// A procedural neutral reflection environment for steel and glazing (no downloaded HDR).
const envCanvas=document.createElement('canvas');envCanvas.width=256;envCanvas.height=128;
const eg=envCanvas.getContext('2d'),gradient=eg.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#EBEEEF');gradient.addColorStop(.48,'#DDDCD6');gradient.addColorStop(.52,'#B4B7B1');gradient.addColorStop(1,'#77796E');eg.fillStyle=gradient;eg.fillRect(0,0,256,128);
const envMap=new THREE.CanvasTexture(envCanvas);envMap.mapping=THREE.EquirectangularReflectionMapping;envMap.colorSpace=THREE.SRGBColorSpace;
const envGenerator=new THREE.PMREMGenerator(renderer);scene.environment=envGenerator.fromEquirectangular(envMap).texture;scene.environmentIntensity=.35;envMap.dispose();envGenerator.dispose();
mats.canopy=std('#B2C9CE',{transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false,metalness:.15,roughness:.22});
mats.cityGlass=std('#A9BDC2',{metalness:.25,roughness:.35});
mats.paving.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 vPave;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vPave=position;');
 shader.fragmentShader='varying vec3 vPave;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 tile=vPave.xz/1.2;vec2 edge=min(fract(tile),1.-fract(tile));vec2 aa=fwidth(tile);float joint=min(smoothstep(.008,.008+aa.x,edge.x),smoothstep(.008,.008+aa.y,edge.y));float variation=fract(sin(dot(floor(tile),vec2(17.1,73.7)))*43758.54);diffuseColor.rgb*=mix(.84,.98+.04*variation,joint);`);
};
const instances=[];
function inst(name,geo,mat,items,transform,color,owner=scene){
 const mesh=new THREE.InstancedMesh(geo,mat,items.length);mesh.name=name;items.forEach((o,i)=>{transform(o,M);mesh.setMatrixAt(i,M);if(color)mesh.setColorAt(i,color(o,i));});mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();owner.add(mesh);instances.push(mesh);return mesh;
}
const compose=(m,p,s=[1,1,1],r=[0,0,0])=>m.compose(P.fromArray(p),Q.setFromEuler(E.set(...r)),S.fromArray(s));
const beamMatrix=(o,m)=>{const a=new THREE.Vector3(...o.a),b=new THREE.Vector3(...o.b),v=b.clone().sub(a);return m.compose(a.add(b).multiplyScalar(0.5),Q.setFromUnitVectors(Y,v.clone().normalize()),S.set(o.width,v.length(),o.width));};
function roundedSlab(w,d,h,r){const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelThickness:.045,bevelSize:.045,bevelSegments:2,curveSegments:16});g.rotateX(-Math.PI/2);return g;}
// Board, paved surfaces and planted rail bed; their top faces come straight from core.js.
for(const b of layout.surfaces){if(b.id==='base')put('ground','base',roundedSlab(BASE.width,BASE.depth,1.6,2),[0,-1.6,0]);else put(b.id==='bridge'?'bridge':'ground',b.id==='road'?'road':b.id==='track-grass'?'grass':b.id==='bridge'?'bridge':'paving',cube(...b.size),b.center);}
for(const b of [...layout.piers,...layout.steps])put('bridge','bridge',cube(...b.size),b.center);
inst('bridge-rails',cyl(.5,.5,1,8),mats.rail,layout.rails,beamMatrix,null,group('bridge'));
// Promenade railing, benches and paving joints (geometry, no map).
const riverRails=[];
for(let x=-57;x<=57;x+=1.2)riverRails.push({a:[x,0.4,-13.6],b:[x,1.25,-13.6],width:0.045});
for(const y of [0.72,1.25])riverRails.push({a:[-20.5,y,-13.6],b:[20.5,y,-13.6],width:0.05});
inst('riverside-rails',cube(1,1,1),mats.stone,riverRails,beamMatrix);
for(const x of [-18,-12,0,6,19]){put('ground','bark',cube(1.55,0.15,0.5),[x,0.95,-7.8]);for(const s of [-1,1])put('ground','iron',cube(0.1,0.55,0.45),[x+s*0.6,0.68,-7.8]);}
// Road marks stand 5 cm above road, grass rails 5 cm above turf. No epsilon-height overlays.
for(const z of [6])for(let x=-50;x<51;x+=2.8)put('ground','line',cube(1.3,0.05,0.07),[x,0.225,z]);
for(const x of [-14,13.5])for(let z=3;z<9.3;z+=0.65)put('ground','line',cube(1.8,0.05,0.3),[x,0.225,z]);
for(const z of [-.7175,.7175])put('ground','rail',cube(114,0.1,0.055),[0,0.35,z]);
for(let x=-56.8;x<=56.8;x+=0.65)put('ground','soil',cube(0.15,0.05,1.5),[x,0.325,0]);
for(let x=-56;x<=56;x+=1.5)for(const z of [-8,-4.4,12.5])put('ground','stone',cube(0.045,0.05,z===12.5?3.6:1.3),[x,0.425,z]);
// Closed U-turn lanes, continuous rails and physical terminal buffers.
for(const x of [-52,52])put('ground','road',cyl(3.5,3.5,.2,64),[x,.1,6]);
for(const x of [-56,56]){
 put('ground','iron',cube(.25,1,2.3),[x,.85,0]);
 for(const z of [-.85,.85])rod('ground','iron',[x-.45,.35,z],[x,.95,z],.10);
 put('ground','red',cube(.3,.18,1.6),[x,1.1,0]);
}
// Canton Tower's foot is on the SOUTH bank, on continuous land outside the model edge.
mats.outland=std('#D3D2C8',{transparent:true,depthWrite:false});
mats.outland.onBeforeCompile=shader=>{
 shader.uniforms.uLandHaze=cityU.haze;
 shader.vertexShader='varying vec3 vLand;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLand=position;');
 shader.fragmentShader='varying vec3 vLand;uniform vec3 uLandHaze;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a*=1.-smoothstep(9.,27.,distance(vLand.xz,vec2(-67.,-6.)));outgoingLight=mix(outgoingLight,uLandHaze,.25);\n #include <opaque_fragment>');
};
put('ground','outland',new THREE.PlaneGeometry(60,60),[-75,0,-3],[-Math.PI/2,0,0]);
put('ground','grass',cyl(1,1,.08,64),[-65,.08,-5],[0,0,0],[10,1,7]);
put('ground','stone',cyl(5.3,5.5,.3,48),[CANTON.x,.25,CANTON.z]);
put('ground','paving',cube(13,.1,6),[-58,.35,-5]);
put('ground','paving',cube(14,.1,8),[-48,.45,-8]);
// Abstract white-crane wings: a continuous curved roof over the enclosed western platform.
{
 const ps=[],uv=[],ix=[],nx=36,nz=16;
 for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
  const u=i/nx*2-1,v=j/nz*2-1;
  ps.push(-45+u*10,4.65+.85*v*v+.3*u*u+.25*Math.sin(u*Math.PI)*v,-1.4+v*3.1);uv.push(i/nx,j/nz);
  if(i<nx&&j<nz){const k=i*(nz+1)+j;ix.push(k,k+1,k+nz+1,k+1,k+nz+2,k+nz+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
 mats.wing=std('#F0F0E9',{side:THREE.DoubleSide});put('ground','wing',g);
 for(const x of [-52,-45,-38]){rod('ground','stone',[x,.55,-3],[x,4.9,-3],.085);rod('ground','stone',[x,3.7,-3],[x,4.8,.7],.055);}
 // Rail-side screen doors and outer fence; door gaps remain visible as mullions.
 for(let x=-53.4;x< -36.5;x+=1.35){
  put('ground','canopy',cube(1.25,1.9,.045),[x,1.5,-1.76]);
  rod('ground','iron',[x-.65,.55,-1.76],[x-.65,2.5,-1.76],.026);
  rod('ground','iron',[x,.55,-3.43],[x,1.7,-3.43],.023);
 }
 for(const y of [1.0,1.7])rod('ground','iron',[-54,y,-3.43],[-36,y,-3.43],.025);
}
// A lawn and curved strolling path occupy the expanded park rather than an empty strip.
put('ground','grass',cube(24,.10,5.7),[18,.46,-5.7]);
for(let i=0;i<40;i++){const x=4+i*.8,z=-10.6+.75*Math.sin(i/39*Math.PI);put('ground','paving',cube(.84,.08,1.8),[x,.52,z]);}
// West-facing bougainvillea window. Its aperture clears the bridge's north edge.
const archBlooms=[],archLeaves=[];
for(const side of [-1,1]){
 for(const dx of [-.3,.3])rod('ground','stone',[15+dx,.4,-11+side*3.5],[15+dx,6,-11+side*3.5],.075);
}
for(const dx of [-.3,.3])for(let j=0;j<36;j++){
 const at=a=>[15+dx,6+3.5*Math.sin(a),-11+3.5*Math.cos(a)];
 rod('ground','stone',at(j/36*Math.PI),at((j+1)/36*Math.PI),.075);
}
for(let i=0;i<10000;i++){
 let y,z;if(i<6000){const a=R(0,Math.PI),r=R(3.5,4.05);y=6+r*Math.sin(a);z=-11+r*Math.cos(a);}else{y=R(.7,6);z=-11+(i%2?1:-1)*R(3.5,4.05);}
 const o={p:[15+R(-.45,.45),y,z],rot:[R(0,6.28),R(0,6.28),R(0,6.28)],size:R(.075,.12),shade:R(.78,1.14)};
 archBlooms.push(o);if(i%3===0)archLeaves.push(o);
}
inst('arch-bracts',petalGeometry(2),mats.bract,archBlooms,(o,m)=>compose(m,o.p,[o.size*1.3,o.size*1.8,o.size],o.rot),(_,i)=>new THREE.Color(i%4?'#D6246E':'#DA94B3').multiplyScalar(archBlooms[i].shade),group('ground'));
inst('arch-vines',leafGeometry(),mats.leaf,archLeaves,(o,m)=>compose(m,o.p,[.10,.17,1],o.rot),()=>new THREE.Color('#426340'),group('ground'));
// Low timber jetty stops short of the two navigation lanes.
put('ground','bark',cube(5,.18,1.5),[31,.55,-13.9]);
for(const x of [29,31,33])for(const z of [-13.2,-14.6]){rod('ground','bark',[x,-.3,z],[x,.65,z],.09);}
function stationSign(text,x,z){
 const c=document.createElement('canvas');c.width=512;c.height=96;const g=c.getContext('2d');g.fillStyle='#f1f0e9';g.fillRect(0,0,512,96);g.fillStyle='#344b4b';g.font='500 48px "PingFang SC",sans-serif';g.textAlign='center';g.fillText(text,256,66);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(6,.95),new THREE.MeshBasicMaterial({map:tx,side:THREE.DoubleSide}));mesh.position.set(x,3.2,z);scene.add(mesh);
}
stationSign('广州塔站',-45,-3.8);stationSign('赤岗塔 · 江岸',45,-3.5);
// Human-scale steel arches: a half vault spanning the tracks, charging equipment stays on-board.
const canopyParts=[];
for(let x=36;x<=54;x+=2){
 for(const side of [-1,1])rod('ground','iron',[x,.55,side*2.6],[x,2.85,side*2.6],.035);
 for(let j=0;j<24;j++){const at=a=>[x,2.85+2.12*Math.sin(a),2.6*Math.cos(a)];rod('ground','iron',at(j/24*Math.PI),at((j+1)/24*Math.PI),.035);}
}
for(const a of [0,Math.PI*.25,Math.PI*.5,Math.PI*.75,Math.PI])rod('ground','iron',[36,2.85+2.12*Math.sin(a),2.6*Math.cos(a)],[54,2.85+2.12*Math.sin(a),2.6*Math.cos(a)],.025);
{
 const p=[],ix=[],uv=[];for(let i=0;i<=1;i++)for(let j=0;j<=32;j++){const a=j/32*Math.PI;p.push(36+18*i,2.87+2.12*Math.sin(a),2.6*Math.cos(a));uv.push(i,j/32);if(i===0&&j<32)ix.push(j,j+1,j+33,j+1,j+34,j+33);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();put('ground','canopy',g);
}
put('ground','iron',cube(.05,2,.05),[34.2,1.55,-2.5]);put('ground','white',cube(1.1,.45,.08),[34.2,2.3,-2.5]);put('ground','red',cube(.6,.06,.09),[34.2,2.3,-2.5]);
// Slatted bench backs, litter bins and low bollards share existing material batches.
for(const x of [-18,-12,0,6,19]){
 for(const dy of [1.15,1.33])put('ground','bark',cube(1.55,.12,.065),[x,dy,-8.04]);
 for(const side of [-1,1])rod('ground','iron',[x+side*.6,.45,-8.04],[x+side*.6,1.4,-8.04],.025);
 put('ground','iron',cyl(.19,.19,.65,16),[x+1.1,.725,-8]);put('ground','gray',cyl(.2,.2,.055,16),[x+1.1,1.08,-8]);
}
for(const z of [10.05,-9.35])for(let x=-20;x<21;x+=3.3){put('ground','iron',cyl(.055,.07,.65,12),[x,.725,z]);put('ground','stone',cyl(.06,.06,.045,12),[x,1.04,z]);}
// A little riverside coffee counter with two occupied-scale table settings.
put('ground','white',cube(2.3,1.05,1.05),[23,.925,-8.55]);put('ground','bark',cube(2.5,.1,1.2),[23,1.49,-8.55]);
for(const x of [22.05,23.95])rod('ground','iron',[x,.4,-8.85],[x,2.65,-8.85],.035);
put('ground','stone',cube(2.65,.10,1.8),[23,2.67,-8.4],[.12,0,0]);
for(const x of [20,25.5]){
 const z=-5.5;put('ground','bark',cyl(.52,.52,.065,32),[x,1.15,z]);rod('ground','iron',[x,.4,z],[x,1.12,z],.035);
 for(const side of [-1,1]){const cx=x+side*.83;put('ground','bark',cube(.40,.055,.40),[cx,.85,z]);for(const dx of [-.16,.16])for(const dz of [-.16,.16])rod('ground','iron',[cx+dx,.4,z+dz],[cx+dx,.85,z+dz],.018);for(const dy of [1.02,1.17])put('ground','bark',cube(.40,.07,.035),[cx,dy,z+.2]);}
 rod('ground','iron',[x,.4,z],[x,3.15,z],.025);put('ground','stone',new THREE.ConeGeometry(1.3,.4,24,1,true),[x,2.95,z]);
 for(let j=0;j<8;j++){const a=j*Math.PI/4;rod('ground','iron',[x,3.15,z],[x+Math.cos(a)*1.28,2.75,z+Math.sin(a)*1.28],.012);}
 put('ground','white',cyl(.055,.045,.1,12),[x+.27,1.23,z]);
}
function bicycle(x,z,turn){
 const point=([a,b,c])=>[x+a*Math.cos(turn)+c*Math.sin(turn),.4+b,z-a*Math.sin(turn)+c*Math.cos(turn)];
 for(const dx of [-.57,.57]){const g=new THREE.TorusGeometry(.32,.022,5,24);put('ground','iron',g,point([dx,.32,0]),[0,turn,0]);for(let j=0;j<8;j++){const a=j*Math.PI/4;rod('ground','gray',point([dx,.32,0]),point([dx+.3*Math.cos(a),.32+.3*Math.sin(a),0]),.006);}}
 const rear=[-.57,.32,0],front=[.57,.32,0],crank=[-.02,.25,0],seat=[-.13,.79,0],head=[.38,.81,0];
 for(const [a,b] of [[rear,crank],[crank,seat],[seat,rear],[seat,head],[head,crank],[head,front]])rod('ground','iron',point(a),point(b),.021);
 put('ground','bark',cube(.26,.05,.15),point([-.15,.86,0]),[0,turn,0]);rod('ground','iron',point([.37,.94,-.22]),point([.37,.94,.22]),.018);rod('ground','iron',point([.38,.81,0]),point([.37,.94,0]),.018);
}
for(const [x,z,a] of [[-18.9,-9,.3],[-10,-9,-.2],[4,14.5,.2]])bicycle(x,z,a);
// Three terraces: jagged sandstone blocks, pale octagonal platform and stair gap.
const rocks=[],hillPlants=[];
for(let tier=0;tier<3;tier++){
 const rx=5.9-tier*1.25,rz=5.05-tier*1.02,y=.4+tier*.6;
 put('pagoda','rock',cyl(1,1,.64,13),[43.8,y+.27,-6],[0,tier*.2,0],[rx,1,rz]);
 for(let j=0;j<35-tier*5;j++){
  const a=j/(35-tier*5)*Math.PI*2;
  if(Math.sin(a)>.92&&Math.abs(Math.cos(a)*rx)<.9)continue;
  rocks.push({p:[43.8+Math.cos(a)*rx,y+.25+R(-.1,.1),-6+Math.sin(a)*rz],scale:[R(.55,.95),R(.35,.55),R(.45,.8)],rot:[R(-.4,.4),R(0,6.28),R(-.2,.2)],shade:R(.68,1.25)});
  if(j%2===0)hillPlants.push({p:[43.8+Math.cos(a)*(rx-.25),y+.65,-6+Math.sin(a)*(rz-.25)],scale:[R(.2,.45),R(.2,.35),R(.2,.4)]});
 }
}
inst('sandstone-blocks',rockGeometry(),mats.sandstone,rocks,(o,m)=>compose(m,o.p,o.scale,o.rot),o=>new THREE.Color('#987362').multiplyScalar(o.shade),group('pagoda'));
inst('rock-crevice-shrubs',new THREE.IcosahedronGeometry(1,2),mats.shrub,hillPlants,(o,m)=>compose(m,o.p,o.scale),null,group('pagoda'));
put('pagoda','stone',cyl(3.48,3.6,.25,8),[43.8,2.075,-6]);
put('pagoda','stone',cyl(2.65,2.9,.3,8),[43.8,2.35,-6]);
const terraceRails=[];
for(let i=0;i<32;i++){
 const a=i/32*Math.PI*2;if(Math.cos(a)>.91)continue;
 const x=43.8+Math.sin(a)*3.35,z=-6+Math.cos(a)*3.35;
 terraceRails.push({a:[x,2.2,z],b:[x,2.95,z],width:.05});
 const b=a+Math.PI/16;if(Math.cos(b)>.91)continue;
 for(const y of [2.55,2.93])terraceRails.push({a:[x,y,z],b:[43.8+Math.sin(b)*3.35,y,-6+Math.cos(b)*3.35],width:.05});
}
inst('terrace-balustrade',cube(1,1,1),mats.stone,terraceRails,beamMatrix,null,group('pagoda'));
for(let i=0;i<12;i++)put('pagoda','stone',cube(1.55,.16+i*.15,.35),[43.8,.4+(.16+i*.15)/2,-.65-i*.29]);
// Narrow stepped brick corbel cornices, NOT nine pavilion roofs. Arches follow each octagonal face.
function arch(w,h){const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2-w/2);s.absarc(0,h/2-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,-h/2);return new THREE.ShapeGeometry(s,12);}
// Staggered brick courses vary individually, without adding geometry or texture files.
mats.brick.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 vBrick;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vBrick=position;');
 shader.fragmentShader='varying vec3 vBrick;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float row=floor(vBrick.y/.12),a=atan(vBrick.x-43.8,vBrick.z+6.);
 float col=floor(a*length(vBrick.xz-vec2(43.8,-6.))/.24+mod(row,2.)*.5);
 float brickShade=mix(.91,1.09,fract(sin(dot(vec2(col,row),vec2(127.1,311.7)))*43758.5453));
 float mortarY=smoothstep(.035,.075,fract(vBrick.y/.12));
 float mortarX=smoothstep(.02,.05,fract(a*length(vBrick.xz-vec2(43.8,-6.))/.24+mod(row,2.)*.5));
 diffuseColor.rgb*=brickShade*mix(.82,1.,mortarY*mortarX);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance*=brickShade;');
 // Fine mortar relief; surface-gradient form follows Three r186's MIT bump shader.
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 float mortarHeight=.035*mortarY*mortarX;
 vec3 sigmaX=normalize(dFdx(-vViewPosition)),sigmaY=normalize(dFdy(-vViewPosition));
 vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);
 float det=dot(sigmaX,r1)*faceDirection;
 vec3 gradient=sign(det)*(dFdx(mortarHeight)*r1+dFdy(mortarHeight)*r2);
 normal=normalize(max(abs(det),.0001)*normal-gradient);`);
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

}
const top=PAGODA.base+9*PAGODA.floorH;
put('pagoda','cornice',cyl(0.7,1.55,0.65,8),[43.8,top+0.45,-6]);
for(const [dy,r,sy] of [[1,0.38,0.5],[1.65,0.25,0.35]])put('pagoda','cornice',new THREE.SphereGeometry(r,12,10),[43.8,top+dy,-6],[0,0,0],[1,sy/r,1]);
put('pagoda','cornice',new THREE.ConeGeometry(0.13,0.45,10),[43.8,top+2.08,-6]);
{const a=Math.PI/8,r=PAGODA.radius*Math.cos(a)+0.08,p=[PAGODA.x+Math.sin(a)*r,2.98,PAGODA.z+Math.cos(a)*r];put('pagoda','seam',arch(.86,.98),p,[0,a,0]);put('pagoda','darkWindow',arch(.68,.86),[p[0]+Math.sin(a)*.02,p[1],p[2]+Math.cos(a)*.02],[0,a,0]);}
// Individual folded leaf/bract geometry; leaves have a visible central crease.
function leafGeometry(){
 const g=new THREE.BufferGeometry(),p=[0,.48,.035],idx=[];
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;p.push(Math.sin(a)*.45,.5+Math.cos(a)*.5,0);idx.push(0,i+1,(i+1)%8+1);}
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function rockGeometry(){const g=new THREE.IcosahedronGeometry(1,2),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.22*Math.sin(x*3+y*4)*Math.cos(z*5-x*3)+.06*Math.sin(x*11+y*3);p.setXYZ(i,x*r,y*r,z*r);}g.deleteAttribute('normal');g.deleteAttribute('uv');const smooth=mergeVertices(g);smooth.computeVertexNormals();g.dispose();return smooth;}

function petalGeometry(segments=4){const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-0.7,0.45,-0.55,1,0,1);s.bezierCurveTo(0.55,1,0.7,0.45,0,0);const g=new THREE.ShapeGeometry(s,segments),ps=g.attributes.position;for(let i=0;i<ps.count;i++)ps.setZ(i,.14*Math.sin(Math.PI*ps.getY(i))*(1-.3*Math.abs(ps.getX(i))));g.computeVertexNormals();return g;}
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
const leafColors=[new THREE.Color('#2C5131'),new THREE.Color('#4C7249')];
const leaves=inst('individual-leaves',leafGeometry(),mats.leaf,leafItems,(o,m)=>{if(!o.normal)return compose(m,o.p,o.scale,o.rot);const n=new THREE.Vector3(...o.normal).normalize();return m.compose(P.fromArray(o.p),Q.setFromUnitVectors(new THREE.Vector3(0,0,1),n),S.fromArray(o.scale));},o=>leafColors[0].clone().lerp(leafColors[1],o.shade));
const flowers=inst('silk-five-petals',petalGeometry(),mats.silk,petals,(o,m)=>m.compose(P.fromArray(o.p),o.quat,S.set(o.size,o.size,1)),o=>new THREE.Color().setScalar(o.shade));
inst('silk-centres',new THREE.SphereGeometry(0.021,5,4),mats.cornice,centres,(o,m)=>compose(m,o.p));
inst('flower-vine-leaves',leafGeometry(),mats.leaf,layout.bracts.filter((_,i)=>i%7<3),(o,m)=>compose(m,[o.p[0],o.p[1]+.06,o.p[2]],[.095,.16,1],o.rot),()=>new THREE.Color('#426340'),group('bridge'));
const bracts=inst('bougainvillea-bracts',petalGeometry(2),mats.bract,layout.bracts,(o,m)=>compose(m,o.p,[o.scale*1.3,o.scale*1.8,o.scale],o.rot),o=>new THREE.Color(COLORS[o.color]).multiplyScalar(o.shade),group('bridge'));
// Broad drifts on both walks, track margins, road median and around the terraces.
// Blossoms are shallow five-petal cups, not flat coloured rugs.
const gardens=[],gardenFlowers=[],gardenLeaves=[];
function bed(x,z,w,d,color,y=.72,planter=false){gardens.push({x,z,w,d,color,y,planter});}
for(let x=-55.8;x<56;x+=2.25){
 for(const z of [-1.95,1.95])if(Math.abs(x)<34||z>0)bed(x,z,2.2,.45,Math.floor((x+22)/4)%4,.63,true);

}
for(let x=-51;x<52;x+=3.1){
 if(x<-5||x>3.5)bed(x,11.1,2.9,1.7,Math.floor((x+22)/5)%4,.93,true);

 if(x<-25||x>54)bed(x,-5.2,2.6,2.05,Math.floor((x+22)/4)%4,.9,true);
 if(x<-25)bed(x,-8.5,2.7,1.1,(Math.floor((x+22)/4)+2)%4,.85,true);
}
// Narrow inner planters leave the middle of the pedestrian deck unobstructed.
for(const side of [-1,1]){
 const x=BRIDGE.x+side*(BRIDGE.width/2-.27);
 put('bridge','stone',cube(.26,.30,17.1),[x,5.75,1.75]);
 put('bridge','soil',cube(.20,.05,16.95),[x,5.925,1.75]);
}
for(const b of gardens){
 if(b.planter){put('ground','stone',new RoundedBoxGeometry(b.w,.4,b.d,1,.06),[b.x,b.y-.3,b.z]);put('ground','soil',cube(b.w-.1,.08,b.d-.1),[b.x,b.y-.07,b.z]);}
 const spacing=mobile?.22:.15;
 for(let xx=-b.w/2;xx<b.w/2;xx+=spacing)for(let zz=-b.d/2;zz<b.d/2;zz+=spacing){
  const x=b.x+xx+R(0,spacing),z=b.z+zz+R(0,spacing),yy=b.y+.10+R(0,.35)+.2*Math.cos(xx*2)*Math.cos(zz*3);
  if(b.y>5||rnd()<.7)gardenFlowers.push({p:[x,yy,z],size:R(.115,.18),rot:[R(-.85,.85),R(0,6.28),R(-.75,.75)],color:b.color,shade:R(.78,1.22)});
  if(b.y<5||rnd()<.3)gardenLeaves.push({p:[x,yy-.2,z],scale:[.17,.34,1],rot:[R(-1,1),R(0,6.28),R(-2,2)],shade:R(.2,.8)});
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
inst('lamp-posts',cyl(1,1,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],2.2,p[2]],[0.045,3.6,0.045]));
inst('lamp-bases',cyl(1,1.2,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],0.65,p[2]],[0.10,0.32,0.10]));
inst('lamp-caps',new THREE.ConeGeometry(1,1,8),mats.iron,layout.lamps,(p,m)=>compose(m,[p[0],4.13,p[2]],[0.18,0.16,0.18]));
const lampGlobes=inst('lamp-globes',new THREE.SphereGeometry(1,8,6),mats.lamp,layout.lamps,(p,m)=>compose(m,[p[0],3.85,p[2]],[0.11,0.19,0.11]));lampGlobes.castShadow=false;
const lampLights=layout.lamps.map(p=>{const l=new THREE.PointLight(0xffbd79,8,8,2);l.position.set(p[0],3.7,p[2]);scene.add(l);return l;});
const bridgeGlow=inst('bridge-lamps',new THREE.SphereGeometry(0.13,8,6),mats.lamp,[-4,1.8,8].map(z=>[-5.5,5.05,z]),(p,m)=>compose(m,p),null,group('bridge'));bridgeGlow.castShadow=false;
const bridgeLight=new THREE.PointLight(0xffb977,8,10,2);bridgeLight.position.set(-5.5,4.7,0);scene.add(bridgeLight);
// Canton Tower: actual straight tilted columns, elliptical rings and diagonal braces.
const tower=cantonStructure(),towerPieces=[];
function towerRod(a,b,width){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=cyl(width,width,v.length(),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,v.normalize()));g.translate(...a.map((x,i)=>(x+b[i])/2));const ps=g.attributes.position,colors=[];for(let i=0;i<ps.count;i++){const k=clamp((ps.getY(i)-CANTON.base)/CANTON.height,0,1),c=new THREE.Color('#64BDCD').lerp(new THREE.Color('#CE80C7'),k);colors.push(c.r,c.g,c.b);}towerPieces.push(g.toNonIndexed());g.dispose();}
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
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n vec3 band=.60+.30*cos(vec3(0.,2.1,4.2)+vTowerY*.18-uTowerTime*.12); totalEmissiveRadiance=band*uTowerLevel;');
};
// Keep the beacon resolvable in the extended hero view (the former .13 m bulb became subpixel).
const beacon=new THREE.Mesh(new THREE.SphereGeometry(.30,8,6),new THREE.MeshBasicMaterial({color:0xff1812}));beacon.position.set(CANTON.x,CANTON.base+CANTON.height+9,CANTON.z);group('canton').add(beacon);
// The bank joins the horizon: continuous embankment, tree line, no floating platform.
const cityWindows=[],distantTrees=[],skylineReflection=[];
for(let i=0;i<105;i++){
 const x=-180+i*3.5,h=R(4,15),w=R(1.8,3.1),z=R(-65,-54);
 if(Math.abs(x-CANTON.x)<4)continue;
 const style=i%4;skylineReflection.push({x,w,h:h+(style===0?3:0)});
 put('city','skyline',cube(w,h,3),[x,h/2-1.2,z]);
 if(style===0){put('city','skyline',cube(w*.74,2.2,2.3),[x,h-.1,z]);put('city','skyline',cube(w*.45,1.7,1.6),[x,h+1.85,z]);}
 if(style===1)put('city','skyline',cube(w*.85,1.7,2.7),[x,h-.4,z]);
 if(style===2){const g=cube(w,2,3),ps=g.attributes.position;for(let j=0;j<ps.count;j++)if(ps.getY(j)>0)ps.setY(j,1+ps.getX(j)*.7);g.computeVertexNormals();put('city','skyline',g,[x,h-.2,z]);}
 for(let xx=-w/2+.16;xx<w/2-.1;xx+=.52){put('city','cityGlass',cube(.38,h-.7,.035),[x+xx,h/2-1.15,z+1.525]);put('city','stone',cube(.045,h-.4,.06),[x+xx+.23,h/2-1.1,z+1.55]);}
 if(i%3===0){put('city','white',cube(w*.5,.65,.85),[x,h-.85,z]);for(let j=0;j<4;j++)put('city','gray',cube(w*.4,.035,.045),[x,h-.64+j*.10,z+.44]);}
 for(let yy=.3;yy<h-1.3;yy+=.72)for(let xx=-w/2+.35;xx<w/2-.2;xx+=.58)if(rnd()<.55)cityWindows.push({p:[x+xx,yy,z+1.51],roll:rnd()});
}
// Pearl River NEW TOWN is north of the river. IFC: rounded triangular taper.
{
 const ps=[],ix=[],levels=32,segments=60;
 for(let j=0;j<=levels;j++)for(let k=0;k<=segments;k++){
  const a=k/segments*Math.PI*2,r=(3.4-.85*(j/levels)**2)*(1+.12*Math.cos(3*a));
  ps.push(-20+r*Math.cos(a),-.8+j/levels*35,-60+r*Math.sin(a));
  if(j<levels&&k<segments){const n=j*(segments+1)+k;ix.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();put('city','cityGlass',g);
 for(let j=0;j<32;j++)put('city','stone',cyl(3.4-.85*(j/32)**2,3.4-.85*(j/32)**2,.055,3),[-20,j/32*35,-60],[0,Math.PI/6,0]);
 // CTF: recognisable stepped square crown, 40 m rather than generic flat rooftops.
 for(const [y,h,w] of [[12,26,6],[29,8,5.2],[35,5,4.3],[39,3,3.1]])put('city','skyline',cube(w,h,w),[6,y,-58]);
 for(let x=3.4;x<=8.6;x+=.45)put('city','cityGlass',cube(.28,25,.04),[x,12,-54.97]);
}
// Continuous land behind the tree line, with no thickness or exposed tray edges.
put('city','bank',new THREE.PlaneGeometry(800,400),[0,-1.05,-240],[-Math.PI/2,0,0]);

for(let x=-190;x<=190;x+=1.2){
 const z=-39.4-1.1*Math.sin(x*.035);
 put('city','stone',cube(1.25,1.1,1.2),[x,-1.2,z]);
 for(let j=0;j<2;j++)distantTrees.push({p:[x+R(-.4,.4),R(.3,1.2),z-1.8-j*1.7],scale:[R(.6,1.3),R(.9,1.7),R(.7,1.3)],shade:R(.7,1.2)});
}
// The far bank also has porous foliage, not a chain of solid model-making spheres.
const farLeafRandom=mulberry32(SEED+83),farLeafParts=[];
for(let i=0;i<36;i++){
 const y=farLeafRandom()*2-1,a=farLeafRandom()*Math.PI*2,r=Math.sqrt(1-y*y),n=new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a));
 const p=n.clone().multiplyScalar(.25+.75*Math.cbrt(farLeafRandom())),g=leafGeometry();
 g.translate(0,-.5,0);g.scale(.55+farLeafRandom()*.22,.65+farLeafRandom()*.25,1);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),n));g.translate(...p.toArray());farLeafParts.push(g);
}
const farCanopy=mergeGeometries(farLeafParts);farLeafParts.forEach(g=>g.dispose());
const farTrees=inst('distant-trees',farCanopy,mats.cityLeaf,distantTrees,(o,m)=>compose(m,o.p,o.scale,[0,o.p[0]*2.1,0]),o=>new THREE.Color().setScalar(o.shade),group('city'));
// Outside the board's shadow volume; the broad instance bounds otherwise submit all far leaves.
farTrees.castShadow=false;farTrees.receiveShadow=false;
const cityWindowMaterial=new THREE.MeshBasicMaterial({color:0xffbd68});
const cityWindowMesh=inst('city-windows',new THREE.PlaneGeometry(.22,.34),cityWindowMaterial,cityWindows,(o,m)=>compose(m,o.p),o=>new THREE.Color().setScalar(o.roll),group('city'));cityWindowMesh.castShadow=false;
const cityU={level:{value:0},haze:{value:new THREE.Color()},low:{value:new THREE.Color()},top:{value:new THREE.Color()}};
function distantShader(shader,windows=false){
 shader.uniforms.uCityLevel=cityU.level;shader.uniforms.uCityHaze=cityU.haze;shader.uniforms.uCityLow=cityU.low;shader.uniforms.uCityTop=cityU.top;
 shader.vertexShader='varying vec3 vCity;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vec4 cityPos=vec4(transformed,1.);\n #ifdef USE_INSTANCING\n cityPos=instanceMatrix*cityPos;\n #endif\n vCity=(modelMatrix*cityPos).xyz;');
 shader.fragmentShader='varying vec3 vCity;uniform float uCityLevel;uniform vec3 uCityHaze,uCityLow,uCityTop;\n'+shader.fragmentShader;
 if(windows)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n if(vColor.r>uCityLevel)discard; diffuseColor.rgb=vec3(1.0,.54,.19)*(1.+uCityLevel);');
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','vec3 n=normalize(vCity-cameraPosition);float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);vec3 haze=mix(uCityHaze,uCityTop,smoothstep(-.08,.40,n.y));haze=mix(haze,uCityLow,exp(-pow((n.y+.20)/.16,2.))*side*.86);float bankFade=.08+.92*max(smoothstep(60.,180.,abs(vCity.x+15.)),smoothstep(150.,350.,distance(cameraPosition,vCity))); outgoingLight=mix(outgoingLight,haze,bankFade);\n #include <opaque_fragment>');
}
for(const mat of [mats.skyline,mats.cityLeaf,mats.bank,mats.cityGlass]){mat.fog=false;mat.onBeforeCompile=shader=>distantShader(shader);}cityWindowMaterial.fog=false;
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

// Commit all static detail by owner/material; moving geometry is never edge-clipped.
for(const [key,gs] of bins){const [owner,mat]=key.split('|'),material=owner==='tram'||owner==='city'&&['stone','white','gray'].includes(mat)?mats[mat].clone():mats[mat];if(owner==='tram'){material.onBeforeCompile=mats[mat].onBeforeCompile;}if(owner==='city'&&['stone','white','gray'].includes(mat)){material.fog=false;material.onBeforeCompile=shader=>distantShader(shader);}const mesh=new THREE.Mesh(mergeGeometries(gs),material);if(owner==='tram'){mesh.geometry.scale(1,1.25,2.65/1.65);mesh.geometry.translate(0,-.10,0);}mesh.name=owner+'-'+mat;mesh.castShadow=!['city','canton'].includes(owner)&&!['lamp','windscreen','route'].includes(mat);mesh.receiveShadow=true;group(owner).add(mesh);gs.forEach(g=>g.dispose());}
// Moving traffic: one draw per repeated car part, seeded positions, no imported assets.
const carSpecs=CAR_SPECS.map(c=>({...c,z:carAt(0,c.i).z}));
function carBodyGeometry(){
 const g=new RoundedBoxGeometry(4.5,.62,1.8,3,.17),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),end=THREE.MathUtils.smoothstep(Math.abs(x),1.4,2.25);p.setY(i,y-end*.10*Math.max(0,y/.31));p.setZ(i,p.getZ(i)*(1-.06*end));}g.computeVertexNormals();return g;
}
function carCabinGeometry(){
 const g=new RoundedBoxGeometry(2.65,.62,1.60,3,.10),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i),k=(y+.31)/.62;p.setX(i,p.getX(i)*(1-.30*k)-.12*k);p.setZ(i,p.getZ(i)*(1-.16*k));}g.computeVertexNormals();return g;
}
const carBodies=inst('car-bodies',carBodyGeometry(),mats.white,carSpecs,(o,m)=>compose(m,[0,.82,o.z]),o=>new THREE.Color(o.color),group('cars'));
const carCabins=inst('car-cabins',carCabinGeometry(),mats.glass,carSpecs,(o,m)=>compose(m,[0,1.27,o.z]),null,group('cars'));
const carWheels=inst('car-wheels',cyl(.31,.31,.16,16),mats.iron,carSpecs.flatMap(c=>[-1.43,1.43].flatMap(x=>[-.85,.85].map(z=>({c,x,z})))),(o,m)=>compose(m,[o.x,.51,o.c.z+o.z],[1,1,1],[Math.PI/2,0,0]),null,group('cars'));
// Paintwork includes a continuous belt line, roof pillars and bumpers, batched with each roof.
const trim=[];
function trimPart(w,h,d,x,y,z){const g=new RoundedBoxGeometry(w,h,d,2,Math.min(.04,h*.2));g.translate(x,y,z);trim.push(g);}
trimPart(1.94,.10,1.37,-.18,1.60,0);
for(const side of [-1,1]){
 trimPart(3.9,.065,.045,0,1.03,side*.885);
 trimPart(.095,.43,.06,-.12,1.30,side*.74);
 trimPart(.48,.045,.03,-.58,1.01,side*.91);
}
for(const side of [-1,1])trimPart(.07,.13,1.45,side*2.22,.60,0);
const carRoof=inst('car-roofs',mergeGeometries(trim),mats.white,carSpecs,(o,m)=>compose(m,[0,0,o.z]),o=>new THREE.Color(o.color),group('cars'));trim.forEach(g=>g.dispose());
function pairGeometry(x,y){const parts=[];for(const z of [-.62,.62]){const g=new RoundedBoxGeometry(.06,.12,.30,2,.025);g.translate(x,y,z);parts.push(g);}const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;}
const headMat=new THREE.MeshBasicMaterial({color:0xffd39a}),tailMat=new THREE.MeshBasicMaterial({color:0x7e130a});
const carHeads=inst('car-headlights',pairGeometry(2.255,.87),headMat,carSpecs,(o,m)=>compose(m,[0,0,o.z]),null,group('cars'));
const carTails=inst('car-taillights',pairGeometry(-2.255,.87),tailMat,carSpecs,(o,m)=>compose(m,[0,0,o.z]),null,group('cars'));
const carGrilles=inst('car-grilles',cube(.035,.16,.75),mats.iron,carSpecs,(o,m)=>compose(m,[2.25,.71,o.z]),null,group('cars'));
for(const mesh of [carBodies,carCabins,carWheels,carRoof,carHeads,carTails,carGrilles]){mesh.material=mesh.material.clone();mesh.frustumCulled=false;}
// Static sunlight is cached. Moving vehicles use soft independent road/track contact shadows.
const contactMat=new THREE.MeshBasicMaterial({color:'#080B0C',transparent:true,depthWrite:false,opacity:.35});
contactMat.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec2 vContact;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vContact=uv;');
 shader.fragmentShader='varying vec2 vContact;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n vec2 edge=abs(vContact*2.-1.);diffuseColor.a*=(1.-smoothstep(.45,1.,edge.x))*(1.-smoothstep(.35,1.,edge.y));');
};
const carContacts=inst('car-contact',new THREE.PlaneGeometry(4.8,2.15),contactMat,carSpecs,(o,m)=>compose(m,[0,.265,o.z],[1,1,1],[-Math.PI/2,0,0]),null,group('cars'));carContacts.frustumCulled=false;carContacts.castShadow=carContacts.receiveShadow=false;
const tramContact=inst('tram-contact',new THREE.PlaneGeometry(16.2,2.74),contactMat.clone(),[0],(_,m)=>compose(m,[0,.355,0],[1,1,1],[-Math.PI/2,0,0]),null,group('tram'));tramContact.material.opacity=.4;tramContact.material.onBeforeCompile=contactMat.onBeforeCompile;tramContact.castShadow=tramContact.receiveShadow=false;
// Low excursion boats on the river.
for(const k of ['cars','tram'])group(k).traverse(o=>{o.castShadow=false;});
const boatSpecs=BOAT_SPECS;
const boatHulls=inst('boat-hulls',new RoundedBoxGeometry(3.8,0.6,1.35,3,0.3),mats.white,boatSpecs,(o,m)=>compose(m,[o.x,-1.55,o.z]),null,group('boats'));
const boatCabins=inst('boat-cabins',new RoundedBoxGeometry(2.3,0.7,1,2,0.12),mats.window,boatSpecs,(o,m)=>compose(m,[o.x,-0.95,o.z]),null,group('boats'));
for(const mesh of [boatHulls,boatCabins]){mesh.frustumCulled=false;mesh.castShadow=false;}
// A narrow sun path, sparse near glints and separate soft night reflections. No texture files.
const reflectionCanvas=document.createElement('canvas');reflectionCanvas.width=1024;reflectionCanvas.height=128;
const reflectionCtx=reflectionCanvas.getContext('2d');reflectionCtx.filter='blur(2px)';reflectionCtx.fillStyle='#72818A';
for(const b of skylineReflection)reflectionCtx.fillRect((b.x+190)/380*1024,128-b.h/24*128,b.w/380*1024,b.h/24*128);
const reflectionMap=new THREE.CanvasTexture(reflectionCanvas);reflectionMap.colorSpace=THREE.SRGBColorSpace;
const waterU={shore:{value:reflectionMap},time:{value:0},water:{value:new THREE.Color('#3E5F7A')},low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()},lights:{value:0},sunset:{value:0}};
const water=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.ShaderMaterial({uniforms:waterU,vertexShader:'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:`varying vec3 vWorld;uniform float time,lights,sunset;uniform sampler2D shore;uniform vec3 water,low,mid,top;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
// All reflection paths begin at their actual far-bank source and extend towards the viewer.
vec2 pathCoords(vec2 p,vec2 source){vec2 d=normalize(cameraPosition.xz-source);vec2 v=p-source;return vec2(dot(v,vec2(d.y,-d.x)),dot(v,d));}
void main(){
 vec2 p=vWorld.xz;vec3 eye=normalize(cameraPosition-vWorld);float grazing=pow(1.-abs(eye.y),2.);float horizon=exp(-abs(eye.y)*3.);
 // Fine low-amplitude normal, not a tessellated choppy sea.
 vec3 normal=normalize(vec3(.009*sin(p.x*3.1+p.y*.6+time*.6),1.,.012*sin(p.y*4.2-p.x*.45+time*.7)));
 vec3 reflected=reflect(-eye,normal);float fresnel=pow(1.-max(dot(eye,normal),0.),3.);
 vec3 reflection=mix(top,mid,horizon);reflection=mix(reflection,low,.34*horizon);
 vec3 c=mix(water*(.75-.68*lights),reflection,.20+.28*fresnel);
 float rayT=(-57.-vWorld.z)/min(reflected.z,-.001);vec3 shoreHit=vWorld+reflected*max(rayT,0.);
 vec2 shoreUv=vec2((shoreHit.x+190.)/380.,shoreHit.y/24.);
 vec4 cityReflection=texture2D(shore,clamp(shoreUv,vec2(0.),vec2(1.)));
 float reflectedBank=step(0.,rayT)*step(0.,shoreUv.y)*step(shoreUv.y,1.)*exp(-abs(vWorld.z+39.)*.08);
 c=mix(c,cityReflection.rgb*.65+mid*.12,cityReflection.a*reflectedBank*.30*(1.-lights));
 c+=vec3(.002)*sin(p.y*3.8+p.x*.6+time*.7)*(1.-lights);
 vec2 q=pathCoords(p,vec2(-33.,-43.));float width=1.25+max(q.y,0.)*.022;
 float band=(1.-smoothstep(width*.55,width,abs(q.x)))*smoothstep(0.,3.,q.y);
 vec2 cellPos=q/vec2(.82,.68),cell=floor(cellPos);float glints=0.;
 // Jittered anisotropic patches, not intersecting sine waves. Skip more cells nearer the viewer.
 if(sunset>.001)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  vec2 id=cell+vec2(float(i),float(j));float h=hash(id),h2=hash(id+19.71),h3=hash(id+53.17);
  vec2 centre=id+vec2(.12+.76*h,.1+.8*h2);vec2 delta=cellPos-centre;
  float a=.12+.38*h2,b=.018+.065*h3,aa=max(fwidth(cellPos.y),.008);
  float fleck=(1.-smoothstep(a*.45,a,abs(delta.x)))*(1.-smoothstep(b,b+aa,abs(delta.y)));
  float density=mix(.80,.16,smoothstep(0.,95.,q.y));
  float twinkle=pow(.5+.5*sin(time*(.7+h)+h3*30.),3.);
  glints+=fleck*step(h,density)*twinkle;
 }
 c+=low*vec3(1.5,.95,.45)*glints*band*sunset*mix(1.4,.75,smoothstep(20.,100.,q.y));
 // A handful of vertically stretched, blurred city-light reflections take over after dusk.
 float night=smoothstep(.78,1.,lights)*(1.-sunset);
 if(night>.001)for(int i=0;i<5;i++){
  float k=float(i);vec2 r=pathCoords(p,vec2(-57.+k*17.,-40.));
  float lengthFade=exp(-max(0.,r.y)/mix(18.,30.,hash(vec2(k,7.))));
  float soft=exp(-pow(r.x/(.48+max(r.y,0.)*.022),2.))*smoothstep(0.,2.,r.y)*lengthFade;
  float ripple=.82+.18*sin(r.y*2.1+time*.65+k);
  vec3 tint=mix(vec3(.42,.23,.10),vec3(.13,.22,.40),mod(k,2.));
  c+=tint*soft*ripple*night*.55;
 }
 vec3 n=normalize(vWorld-cameraPosition);float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);
 vec3 haze=mix(mid,top,smoothstep(-.08,.40,n.y));haze=mix(haze,low,exp(-pow((n.y+.20)/.16,2.))*side*.86);
 float distant=1.-exp(-max(0.,distance(cameraPosition.xz,p)-150.)*.012);c=mix(c,haze,distant);gl_FragColor=vec4(c,1.);
}`}));water.rotation.x=-Math.PI/2;water.position.y=-1.85;scene.add(water);
// Water occupies the back of the board as well as the surrounding river; the rear corners follow the base.
{const b=layout.waterSurface,hw=b.size[0]/2,f=-b.max[2],back=-b.min[2],r=BASE.radius,s=new THREE.Shape();s.moveTo(-hw,f);s.lineTo(hw,f);s.lineTo(hw,back-r);s.quadraticCurveTo(hw,back,hw-r,back);s.lineTo(-hw+r,back);s.quadraticCurveTo(-hw,back,-hw,back-r);s.lineTo(-hw,f);const g=new THREE.ShapeGeometry(s,12);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,water.material);m.position.y=b.center[1];scene.add(m);}
const skyU={low:{value:new THREE.Color()},mid:{value:new THREE.Color()},top:{value:new THREE.Color()}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(550,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyU,vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',fragmentShader:'varying vec3 d;uniform vec3 low,mid,top;void main(){vec3 n=normalize(d);float h=n.y;vec3 c=mix(mid,top,smoothstep(-.08,.40,h));float side=pow(max(0.,dot(normalize(n.xz),normalize(vec2(-.6,-1.)))),3.);float glow=exp(-pow((h+.20)/.16,2.))*side;c=mix(c,low,glow*.86);gl_FragColor=vec4(c,1.);}'}));sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
const sun=new THREE.DirectionalLight(0xffa564,2.2);sun.castShadow=true;sun.shadow.mapSize.set(mobile?2048:4096,mobile?2048:4096);Object.assign(sun.shadow.camera,{left:-80,right:80,top:70,bottom:-70,near:1,far:180});sun.shadow.bias=-0.00008;sun.shadow.normalBias=0.025;sun.shadow.radius=3;scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xe8eceb,0x8d887c,1);scene.add(hemi);
// Single-sample HDR target; FXAA after output avoids costly multisample resolves at DPR 2.
const sceneTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:0,depthTexture:new THREE.DepthTexture(1,1)});
const composer=new EffectComposer(renderer,sceneTarget);composer.addPass(new RenderPass(scene,camera));
const savedRandom=Math.random;let gtao;try{Math.random=mulberry32(SEED+72);gtao=new GTAOPass(scene,camera,1,1);}finally{Math.random=savedRandom;}gtao.updateGtaoMaterial({radius:.7,thickness:1.2,distanceExponent:2,samples:8});gtao.updatePdMaterial({radius:5,samples:6});gtao.blendIntensity=.8;gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-75,-1.9,-21),new THREE.Vector3(62,45,22)));
// AO is a soft low-frequency effect: half-resolution integration, full-resolution scene depth.
const resizeAO=gtao.setSize.bind(gtao);gtao.setSize=(w,h)=>resizeAO(Math.max(1,Math.ceil(w*.5)),Math.max(1,Math.ceil(h*.5)));
// Reconstruct normals from the exact scene depth, including wind/clipping, with no second scene draw.
const renderAO=gtao.render.bind(gtao);gtao.render=(r,write,read,...args)=>{gtao.setGBuffer(read.depthTexture);renderAO(r,write,read,...args);};composer.addPass(gtao);
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),0.28,0.45,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
const fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
const requested=params.get('view'),validView=Object.hasOwn(VIEWS,requested),fixedTime=validView?Math.max(0,number('t',13)):null;
let view=validView?requested:'auto',frozen=validView,hour=clamp(number('h',0),0,1),t=fixedTime??0;
const rig=createRig({u:validView?VIEWS[requested]:0,auto:!matchMedia('(prefers-reduced-motion: reduce)').matches});
let journal=createJournal(),journalUI='';
const journalScene=()=>({time:t,hour,frozen,mode:rig.mode,auto:rig.auto,destination:rig.destination,pos:rig.pos,look:rig.look});
function updateJournal(intent='tick'){
 const sceneState=journalScene();journal=journalStep(journal,intent,sceneState);
 const active=journal.phase!=='idle',done=journal.phase==='done';
 const capture=active&&!done&&!journal.moment&&journal.stamps.includes('bridge');
 const available=capture&&journalPlace(sceneState)==='bridge'&&!!journalWindow(t);
 const prompt=done?'电车一刻：'+(journal.moment.direction===1?'向赤岗塔站':'向广州塔站')+'经过花瀑。':active?journalPrompt(journal,sceneState):'';
 const key=JSON.stringify([journal,available,prompt]);if(key===journalUI)return;journalUI=key;
 document.body.classList.toggle('journal-active',active);$('journal').hidden=!active;$('journal-start').hidden=active;
 $('journal-start').setAttribute('aria-expanded',String(active));
 $('journal-title').textContent=done?'我的秋岸游记':'等一班花电车';
 $('journal-stamps').textContent=journal.stamps.length?journal.stamps.map(p=>'✓ '+JOURNAL_PLACES[p].name).join(' → ')+(done?'':' · '+JOURNAL_PLACES[journal.stamps.at(-1)].note):'花桥 / 塔下 · 两处秋花';
 $('journal-goal').textContent=prompt;
 const memory=$('journal-memory');memory.hidden=!done;
 memory.textContent=done?'夜景：花窗里的广州塔亮起了。':'';
 const button=document.querySelector('[data-journal=capture]');button.hidden=!capture;button.disabled=!available;
 // Do not move focus on a timer. Completion is caused by the player's hour input.
 if(done&&intent==='hour')document.querySelector('[data-journal=exit]').focus({preventScroll:true});
}
let W=1,H=1,aspect=1,copyTop=1,scaleIdx=0,pixelRatio=1,frames=0,shadowRefreshes=0,calls=0,tris=0,fps=60,meanFrameTime=1/60,slow=0,fast=0;
const scales=[1,.9,.8,.75];
document.body.classList.toggle('detail',validView&&['station','bridge','arch','pagoda'].includes(requested));
function resize(){const oldAspect=aspect;W=innerWidth;H=innerHeight;aspect=W/H;copyTop=document.querySelector('.copy').getBoundingClientRect().top/H;pixelRatio=recording?Math.min(devicePixelRatio||1,3):Math.max(Math.min(devicePixelRatio||1,1.5),Math.min(devicePixelRatio||1,2)*scales[scaleIdx]);renderer.setPixelRatio(pixelRatio);renderer.setSize(W,H,false);composer.setPixelRatio(pixelRatio);composer.setSize(W,H);fxaa.uniforms.resolution.value.set(1/(W*pixelRatio),1/(H*pixelRatio));camera.aspect=aspect;if(aspect!==oldAspect)camera.fov=fovFor(aspect,rig.pos);camera.updateProjectionMatrix();const sh=shiftFor(aspect,rig.pos);camera.projectionMatrix.elements[8]=-sh[0];camera.projectionMatrix.elements[9]=-sh[1];camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
addEventListener('resize',resize);resize();
let hoverId=null;
const tramLamps=group('tram').children.find(m=>m.name==='tram-lamp').material;
const tramWindows=group('tram').children.find(m=>m.name==='tram-window').material;
let appliedHour=NaN,appliedHover=null,appliedLamps=null;
function applyHour(){const h=skyAt(hour);if(recordLamps!=null)h.lights=recordLamps;towerU.time.value=t;beacon.material.color.setRGB(3,.015,.006).multiplyScalar(h.lights*(Math.sin(t*3.6-1)>.4?1:.05));if(appliedHour===hour&&appliedHover===hoverId&&appliedLamps===recordLamps)return;if(appliedHour!==hour)renderer.shadowMap.needsUpdate=true;appliedHour=hour;appliedHover=hoverId;appliedLamps=recordLamps;renderer.toneMappingExposure=1+.30*Math.sin(Math.PI*hour);bloom.enabled=hour>.4;bloom.strength=.16;document.body.classList.toggle('night',hour>.72);document.querySelector('.tele').textContent='珠江南岸 · '+(hour<.28?'白天':hour<.77?'黄昏':'入夜')+' · 建筑意象，非测绘';for(const k of ['low','mid','top'])skyU[k].value.setRGB(...h[k]);waterU.low.value.setRGB(...h.low);waterU.mid.value.setRGB(...h.mid);waterU.top.value.setRGB(...h.top);waterU.lights.value=h.lights;waterU.sunset.value=Math.sin(Math.PI*hour)*(1-THREE.MathUtils.smoothstep(hour,.66,.94));pagodaHour.value=hour;pagodaWindowMat.emissiveIntensity=1.4*h.lights*(hoverId==='pagoda'?1.18:1);glazingU.top.value.setRGB(...h.mid).multiplyScalar(1.7).lerp(new THREE.Color(.3,.4,.48),.26*(1-hour));glazingU.bottom.value.setRGB(.012,.025,.034).multiplyScalar(1-.65*hour);scene.fog.color.setRGB(...h.mid);cityU.haze.value.copy(scene.fog.color);cityU.low.value.setRGB(...h.low);cityU.top.value.setRGB(...h.top);cityU.level.value=Math.max(0,(h.lights-.3)*.75);towerU.level.value=Math.pow(h.lights,2)*.9;towerU.time.value=t;beacon.material.color.setRGB(3,.015,.006).multiplyScalar(h.lights*(Math.sin(t*3.6-1)>.4?1:.05));sun.color.setRGB(...h.key);sun.intensity=h.keyInt;scene.environmentIntensity=.35*(1-.8*hour);sun.position.set(-42,80*h.sunY,64);hemi.intensity=h.hemi;carHeads.material.color.setRGB(1,.75,.45).multiplyScalar(.04+2.8*h.lights);carTails.material.color.setRGB(1,.014,.004).multiplyScalar(.12+1.7*h.lights);mats.lamp.color.copy(warm).multiplyScalar(0.12+4.6*h.lights);mats.window.emissiveIntensity=1.4*h.lights*(hoverId==='pagoda'?1.18:1);tramWindows.emissiveIntensity=1.35*h.lights;tramLamps.color.copy(warm).multiplyScalar(.15+3*h.lights);mats.tower.emissiveIntensity=h.lights*1.15;for(const l of lampLights){l.intensity=30*h.lights;l.visible=h.lights>.001;}bridgeLight.visible=h.lights>.001;bridgeLight.intensity=26*h.lights*(hoverId==='bridge'?1.25:1);}
$('hour').value=String(hour*1000);$('hour').addEventListener('input',()=>{hour=Number($('hour').value)/1000;updateJournal('hour');});
document.querySelector('.hour').addEventListener('click',e=>{const b=e.target.closest('[data-hour]');if(b){$('hour').value=b.dataset.hour;$('hour').dispatchEvent(new Event('input'));}});
const syncAuto=()=>{
 const b=document.querySelector('[data-act=auto]');b.setAttribute('aria-pressed',String(rig.auto));
 b.querySelector('span').textContent=rig.auto?'自动游览':'留在这里 · 继续';
 b.title=rig.auto?'留在这里':'继续自动游览';b.setAttribute('aria-label',b.title);
 for(const place of document.querySelectorAll('[data-place]'))place.setAttribute('aria-pressed',String(rig.destination===place.dataset.place));
};syncAuto();
$('journal-start').addEventListener('click',()=>{frozen=false;rig.setAuto(false);syncAuto();updateJournal('start');document.querySelector('[data-place=bridge]').focus({preventScroll:true});});
$('journal').addEventListener('click',e=>{
 const b=e.target.closest('[data-journal]');if(!b)return;
 if(b.dataset.journal==='exit'){updateJournal('exit');frozen=false;rig.setAuto(true);syncAuto();$('journal-start').focus({preventScroll:true});}
 else updateJournal('capture');
});
const touchRig=()=>{frozen=false;view='manual';rig.grab();syncAuto();};
$('places').addEventListener('click',e=>{const b=e.target.closest('[data-place]');if(!b)return;frozen=false;rig.goTo(b.dataset.place);syncAuto();});
$('tools').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;touchRig();if(b.dataset.act==='in')rig.zoom(0.87);if(b.dataset.act==='out')rig.zoom(1/0.87);if(b.dataset.act==='reset'){rig.reset();view='auto';updateJournal('exit');}if(b.dataset.act==='auto')rig.setAuto(!rig.auto);syncAuto();});
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{touchRig();rig.held=true;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);pinch=0;});
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),hit=new THREE.Vector3();
const hoverBoxes=['bridge','pagoda'].map(id=>({id,box:new THREE.Box3().setFromObject(group(id))}));
canvas.addEventListener('pointermove',e=>{const p=pointers.get(e.pointerId);if(!p){mouse.set(e.clientX/W*2-1,1-e.clientY/H*2);ray.setFromCamera(mouse,camera);hoverId=null;let best=Infinity;for(const q of hoverBoxes)if(ray.ray.intersectBox(q.box,hit)){const d=hit.distanceTo(camera.position);if(d<best){best=d;hoverId=q.id;}}return;}const dx=e.clientX-p[0],dy=e.clientY-p[1];p[0]=e.clientX;p[1]=e.clientY;if(pointers.size===1)rig.drag(dx/H*2.2,dy/H*1.6);else if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)rig.zoom(clamp(pinch/d,0.85,1.18));pinch=d;}});
const release=e=>{pointers.delete(e.pointerId);pinch=0;rig.held=pointers.size>0;rig.idle=0;};
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
const clearPointers=()=>{pointers.clear();pinch=0;rig.held=false;rig.idle=0;};addEventListener('blur',clearPointers);document.addEventListener('visibilitychange',clearPointers);canvas.addEventListener('pointerleave',()=>hoverId=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(frozen)touchRig();rig.zoom(Math.exp(clamp(e.deltaY,-120,120)*0.0014));syncAuto();},{passive:false});
function moveVehicles(t){
 group('tram').position.x=tramAt(t).x;
 carSpecs.forEach((c,i)=>{const a=carAt(t,i),r=[0,a.angle,0],local=(x,y,z)=>[a.x+x*Math.cos(a.angle)+z*Math.sin(a.angle),y,a.z-x*Math.sin(a.angle)+z*Math.cos(a.angle)];
  carBodies.setMatrixAt(i,compose(M,local(0,.82,0),[1,1,1],r));carCabins.setMatrixAt(i,compose(M,local(0,1.27,0),[1,1,1],r));
  for(const mesh of [carRoof,carHeads,carTails])mesh.setMatrixAt(i,compose(M,[a.x,0,a.z],[1,1,1],r));
  carGrilles.setMatrixAt(i,compose(M,local(2.25,.71,0),[1,1,1],r));
  // Compose yaw before the horizontal contact-plane / wheel rotations.
  Q.setFromAxisAngle(Y,a.angle);const yaw=Q.clone();
  carContacts.setMatrixAt(i,M.compose(P.set(a.x,.265,a.z),yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2)),S.set(1,1,1)));
  let k=i*4;for(const x of [-1.43,1.43])for(const z of [-.85,.85])carWheels.setMatrixAt(k++,M.compose(P.fromArray(local(x,.51,z)),yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2)),S.set(1,1,1)));
 });
 for(const mesh of [carBodies,carCabins,carWheels,carRoof,carHeads,carTails,carGrilles,carContacts])mesh.instanceMatrix.needsUpdate=true;
 boatSpecs.forEach((b,i)=>{const a=boatAt(t,i);boatHulls.setMatrixAt(i,compose(M,[a.x,a.y,a.z]));boatCabins.setMatrixAt(i,compose(M,[a.x,a.y+.6,a.z]));});boatHulls.instanceMatrix.needsUpdate=true;boatCabins.instanceMatrix.needsUpdate=true;
}
function animate(dt,render=true){if(!frozen)t+=dt;const pose=frozen?{pos:rig.pos,target:rig.look}:rig.update(dt,t);if(journal.phase!=='idle')updateJournal();camera.position.fromArray(pose.pos);
 // Hold the current lens during manual zoom; otherwise widening FOV cancels the dolly.
 const fov=recordLens?.fov??(frozen||rig.mode==='auto'||rig.mode==='travel'?fovFor(aspect,pose.pos):rig.mode==='return'?THREE.MathUtils.lerp(camera.fov,fovFor(aspect,pathAt(rig.u).pos),Math.min(1,dt*5)):camera.fov);
 if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();const sh=shiftFor(aspect,rig.pos);camera.projectionMatrix.elements[8]=-sh[0];camera.projectionMatrix.elements[9]=-sh[1];camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
 const lensShift=recordLens?[0,recordLens.shift]:shiftFor(aspect,pose.pos);camera.projectionMatrix.elements[8]=-lensShift[0];camera.projectionMatrix.elements[9]=-lensShift[1];camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 camera.lookAt(...pose.target);camera.updateMatrixWorld();sky.position.copy(camera.position);if(!frozen){view=rig.mode;document.body.classList.toggle('detail',rig.destination!==null||camera.position.distanceTo(new THREE.Vector3(0,4,0))<40||(aspect<.8&&projected(boardBounds).y1>copyTop-.02));}wind.value=t;waterU.time.value=t;moveVehicles(t);applyHour();
 // Keep local light evaluation bounded: the closest pools matter at this miniature scale.
 if(hour>0){const nearest=lampLights.slice().sort((a,b)=>a.position.distanceToSquared(camera.position)-b.position.distanceToSquared(camera.position));const active=new Set(nearest.slice(0,mobile?3:4));for(const l of lampLights)l.visible=active.has(l);}
 if(render){renderer.info.reset();if(renderer.shadowMap.needsUpdate)shadowRefreshes++;composer.render();calls=renderer.info.render.calls;tris=renderer.info.render.triangles;frames++;}}
let last=performance.now();function frame(now){const raw=(now-last)/1000;last=now;if(raw>0){meanFrameTime+=(raw-meanFrameTime)*.05;fps=1/meanFrameTime;if(fps<56){slow+=raw;fast=0;}else if(fps>59.5){fast+=raw;slow=0;}else{fast=slow=0;}}if(slow>1&&scaleIdx<3){scaleIdx++;slow=0;resize();}if(fast>60&&scaleIdx>0){scaleIdx--;fast=0;resize();}animate(Math.min(raw,0.1));requestAnimationFrame(frame);}requestAnimationFrame(frame);
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),rendererName=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const rectOf=el=>{const r=el.getBoundingClientRect();return{x0:r.left/W,x1:r.right/W,y0:r.top/H,y1:r.bottom/H};};
// Project actual rendered geometry bounds with the actual Three camera, including its view shift.
function projected(b){const ps=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ps.push(new THREE.Vector3(x,y,z).project(camera));return{x0:(Math.min(...ps.map(p=>p.x))+1)/2,x1:(Math.max(...ps.map(p=>p.x))+1)/2,y0:(1-Math.max(...ps.map(p=>p.y)))/2,y1:(1-Math.min(...ps.map(p=>p.y)))/2,front:ps.every(p=>p.z<1)};}
const staticBoxes=Object.fromEntries(['pagoda','canton','bridge'].map(k=>[k,new THREE.Box3().setFromObject(group(k))]));
function trafficGeometryAt(seconds){
 moveVehicles(seconds);scene.updateMatrixWorld(true);
 const read=b=>({min:b.min.toArray(),max:b.max.toArray()});
 const items=[{id:'tram',...read(new THREE.Box3().setFromObject(group('tram')))}];
 const addInstances=(id,i,meshes)=>{const b=new THREE.Box3(),matrix=new THREE.Matrix4();for(const [mesh,indices] of meshes){mesh.geometry.computeBoundingBox();for(const n of indices){mesh.getMatrixAt(n,matrix);matrix.premultiply(mesh.matrixWorld);b.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));}}items.push({id,...read(b)});};
 for(let i=0;i<carSpecs.length;i++)addInstances('car-'+i,i,[...[carBodies,carCabins,carRoof,carHeads,carTails,carGrilles].map(m=>[m,[i]]),[carWheels,[i*4,i*4+1,i*4+2,i*4+3]]]);
 for(let i=0;i<boatSpecs.length;i++)addInstances('boat-'+i,i,[[boatHulls,[i]],[boatCabins,[i]]]);
 moveVehicles(t);scene.updateMatrixWorld(true);return items;
}
window.__huacheng={get ready(){return frames>3;},state:()=>({view,requestedView:requested,mode:rig.mode,destination:rig.destination,auto:rig.auto,cam:camera.position.toArray(),target:rig.look.slice(),u:rig.u,t,hour,hover:hoverId,held:rig.held,tram:tramAt(t),frozen,journal:structuredClone(journal)}),
info:()=>({calls,tris,fps,shadowRefreshes,renderer:rendererName,shadowMap:sun.shadow.mapSize.x,exposure:renderer.toneMappingExposure,sunElevation:Math.atan2(sun.position.y,Math.hypot(sun.position.x,sun.position.z))*180/Math.PI,msaa:sceneTarget.samples,antialiasing:'FXAA',aoResolution:[gtao.width,gtao.height],activePointLights:lampLights.filter(l=>l.visible).length+Number(bridgeLight.visible),ao:gtao.enabled,bloom:bloom.enabled,w:W,h:H,dpr:devicePixelRatio,pixelRatio,scaleIdx,density:mobile?'mobile':'desktop',instances:instances.reduce((s,m)=>s+m.count,0),inventory:instances.map(m=>({name:m.name,count:m.count,type:m.type,isInstancedMesh:m.isInstancedMesh})),lightLevel:skyAt(hour).lights,pagodaLitByFloor:layout.levels.map(l=>l.windows.filter(w=>hour>=w.onAt).length),lighting:{lamps:lampLights[0].intensity,tramWindows:tramWindows.emissiveIntensity,towerWindows:pagodaWindowMat.emissiveIntensity}}),
setCamera:(pos,target)=>{if(params.has('record')&&[...pos,...target].length===6&&[...pos,...target].every(Number.isFinite)){rig.pos=pos.slice();rig.look=target.slice();frozen=true;view='record';document.body.classList.add('detail');animate(0);}},
setTime:seconds=>{if(Number.isFinite(seconds)){t=seconds;animate(0);}},
setView:name=>{if(Object.hasOwn(VIEWS,name)){rig.u=VIEWS[name];rig.pos=pathAt(rig.u).pos;rig.look=pathAt(rig.u).target;rig.mode='auto';frozen=true;view=name;document.body.classList.toggle('detail',!['hero','wide'].includes(name));animate(0);}},
traffic:(seconds=t)=>trafficAt(seconds),
worldSubjects:()=>Object.fromEntries(Object.entries(staticBoxes).map(([k,b])=>[k,{min:b.min.toArray(),max:b.max.toArray()}])),
trafficGeometryAt,
setHour:h=>{if(Number.isFinite(h)){hour=clamp(h,0,1);$('hour').value=String(hour*1000);}},
tramGeometryBounds:()=>{const b=new THREE.Box3().setFromObject(group('tram'));return {min:b.min.toArray(),max:b.max.toArray()};},
subjectBoxes:()=>{const tr=tramAt(t);return{...Object.fromEntries(Object.entries(staticBoxes).map(([k,b])=>[k,projected(b)])),tram:projected(new THREE.Box3(new THREE.Vector3(...tr.raw.min),new THREE.Vector3(...tr.raw.max))),base:projected(new THREE.Box3(new THREE.Vector3(-BASE.width/2,-1.6,-BASE.depth/2),new THREE.Vector3(BASE.width/2,0,BASE.depth/2))) };},
uiBoxes:()=>Object.fromEntries(['.brand','.badge','.copy','.tele','.credit','.tools','.places','.hour'].filter(s=>getComputedStyle(document.querySelector(s)).display!=='none'&&getComputedStyle(document.querySelector(s)).visibility!=='hidden').map(s=>[s,rectOf(document.querySelector(s))])),
};
window.__PLAYTEST__={get ready(){return window.__huacheng.ready;},snapshot:()=>({state:window.__huacheng.state(),info:window.__huacheng.info()}),reset:()=>{rig.reset();t=0;frozen=false;view='auto';updateJournal('exit');syncAuto();}};
// Recording-only camera score and geometric audit. Normal entry has neither API.
if(recording){
 const overlay=document.createElement('img');overlay.id='record-dissolve';
 overlay.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;opacity:0';
 document.body.append(overlay);
 const framePose=(frame,render)=>{
  const {pos,target,seconds,day,fov,shift,title,credit=0,fade=0}=frame;
  if(!Array.isArray(pos)||!Array.isArray(target)||pos.length!==3||target.length!==3||![...pos,...target,seconds,day,fov,shift,title,credit,fade].every(Number.isFinite)||fov<20||fov>110)throw Error('Invalid recording frame');
  rig.pos=pos.slice();rig.look=target.slice();frozen=true;view='record';t=seconds;hour=clamp(day,0,1);recordLens={fov,shift};
  // Demo v9: lamps can lag the sky so the street lights come on at dusk, not in daylight (Muse/Grok review of v8).
  recordLamps=Number.isFinite(frame.lamps)?clamp(frame.lamps,0,1):null;
  document.querySelector('.copy').style.opacity=String(clamp(title,0,1));document.querySelector('.brand').style.opacity=String(clamp(title,0,1));
  $('record-credit').style.opacity=String(clamp(credit,0,1));$('record-fade').style.opacity=String(clamp(fade,0,1));animate(0,render);
  // Only the recording grade: keep h=.8 lamps, but cool the sky/haze into blue hour.
  const blue=THREE.MathUtils.smoothstep(hour,.55,.80);
  if(blue>0){const h=skyAt(hour);for(const [k,c] of Object.entries({low:[.035,.070,.15],mid:[.020,.055,.13],top:[.008,.025,.075]})){skyU[k].value.setRGB(...h[k]).lerp(new THREE.Color(...c),blue);waterU[k].value.copy(skyU[k].value);}scene.fog.color.copy(skyU.mid.value);cityU.haze.value.copy(skyU.mid.value);cityU.low.value.copy(skyU.low.value);cityU.top.value.copy(skyU.top.value);if(render)composer.render();}
  scene.updateMatrixWorld(true);
 };
 const read=b=>({min:b.min.toArray(),max:b.max.toArray()});
 const staticAudit=[];
 const add=(id,b,category)=>staticAudit.push({id,...read(b),category});
 for(const id of ['bridge','pagoda','canton'])add(id,new THREE.Box3().setFromObject(group(id)),'building');
 // Merged city material meshes are deliberately conservative bounds. Land/water planes are not buildings.
 for(const mesh of group('city').children)if(/^city-(skyline|cityGlass|stone|white|gray)$/.test(mesh.name))add(mesh.name,new THREE.Box3().setFromObject(mesh),'building');
 for(const mesh of group('ground').children)if(/^arch-(bracts|vines)$/.test(mesh.name))add(mesh.name,new THREE.Box3().setFromObject(mesh),'flowers');
 for(const b of layout.obstacles.filter(b=>!['tram-range','pagoda','bridge'].includes(b.id)&&!b.id.startsWith('tree-'))){staticAudit.push({...b,id:b.id+'-'+staticAudit.length,category:b.id.startsWith('arch')?'arch':'structure'});}
 for(const tree of layout.trees){const b=new THREE.Box3(new THREE.Vector3(...tree.crownBox.min),new THREE.Vector3(...tree.crownBox.max));b.expandByPoint(new THREE.Vector3(...tree.root));b.expandByScalar(.15);add('tree-'+tree.id,b,tree.kind==='silk'?'silk':'tree');}
 // Shader wind shifts <= .1 m; expand flower bounds rather than ignoring the animation.
 for(const o of staticAudit)if(o.category==='flowers'){o.min=o.min.map(v=>v-.15);o.max=o.max.map(v=>v+.15);}
 const boxOf=o=>new THREE.Box3(new THREE.Vector3(...o.min),new THREE.Vector3(...o.max));
 // Clip the six faces of the real train's bounding box in homogeneous coordinates.
 // A simple Frustum.intersectsBox can be a false positive at a screen corner.
 const clippedProjection=b=>{
  const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),v=[];
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])v.push(new THREE.Vector4(x,y,z,1).applyMatrix4(vp));
  const planes=[p=>p.w+p.x,p=>p.w-p.x,p=>p.w+p.y,p=>p.w-p.y,p=>p.w+p.z,p=>p.w-p.z],points=[];
  for(const face of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]){
   let poly=face.map(i=>v[i]);
   for(const f of planes){const next=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);if(fa>=0)next.push(a);if((fa>=0)!==(fb>=0))next.push(a.clone().lerp(b,fa/(fa-fb)));}poly=next;if(!poly.length)break;}
   points.push(...poly);
  }
  if(!points.length)return null;
  return {x0:(Math.min(...points.map(p=>p.x/p.w))+1)/2,x1:(Math.max(...points.map(p=>p.x/p.w))+1)/2,y0:(1-Math.max(...points.map(p=>p.y/p.w)))/2,y1:(1-Math.min(...points.map(p=>p.y/p.w)))/2};
 };
 const archBox=boxOf(staticAudit.find(o=>o.id==='arch-bracts'));
 // Tower height excludes the much wider rock hill, terrace and approach stairs.
 // Clearance still uses the entire pagoda group, so this cannot relax collision safety.
 const pagodaTowerBox=new THREE.Box3();
 group('pagoda').traverse(o=>{if(/^pagoda-(brick|cornice|seam|darkWindow)$/.test(o.name))pagodaTowerBox.union(new THREE.Box3().setFromObject(o));});
 const silkBox=new THREE.Box3();for(const o of staticAudit.filter(o=>o.category==='silk'))silkBox.union(boxOf(o));
 const roof=group('ground').children.find(o=>o.name==='ground-wing');
 const roofPosition=roof.geometry.attributes.position;
 // Sum the clipped, projected triangles: a conservative upper bound on the
 // single white roof's screen coverage, including hidden/overlapping parts.
 const roofArea=()=>{
  const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(roof.matrixWorld);
  const planes=[p=>p.w+p.x,p=>p.w-p.x,p=>p.w+p.y,p=>p.w-p.y,p=>p.w+p.z,p=>p.w-p.z];let area=0;
  for(let i=0;i<roofPosition.count;i+=3){
   let poly=[0,1,2].map(j=>new THREE.Vector4(roofPosition.getX(i+j),roofPosition.getY(i+j),roofPosition.getZ(i+j),1).applyMatrix4(vp));
   for(const f of planes){const next=[];for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],fa=f(a),fb=f(b);if(fa>=0)next.push(a);if((fa>=0)!==(fb>=0))next.push(a.clone().lerp(b,fa/(fa-fb)));}poly=next;if(!poly.length)break;}
   let sum=0;for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];sum+=(a.x*b.y-b.x*a.y)/(a.w*b.w);}area+=Math.abs(sum)/8;
  }return area;
 };
 const towerAxis=(id,b,x,z)=>{
  const base=new THREE.Vector3(x,b.min.y,z).project(camera),top=new THREE.Vector3(x,b.max.y,z).project(camera);
  // NDC is not square on a portrait screen: use actual device pixels.
  return {visible:Boolean(clippedProjection(b)),base:[(base.x+1)*540,(1-base.y)*960],top:[(top.x+1)*540,(1-top.y)*960],tilt:THREE.MathUtils.radToDeg(Math.atan2(Math.abs(top.x-base.x)*1080,Math.abs(top.y-base.y)*1920))};
 };
 window.__huacheng.recordInventory=()=>({static:staticAudit,groundDatum:2.5,groundMethod:'Conservative altitude above the highest local terrain (pagoda terrace, 2.5 m); ground elsewhere is lower.',distanceMethod:'Euclidean distance to conservative world AABBs; building/arch bounds from rendered geometry, tree descriptor bounds include crown, trunk and wind padding. No centre-distance shortcut.'});
 window.__huacheng.recordMeasure=frame=>{
  framePose(frame,false);
  const objects=trafficGeometryAt(t),tram=boxOf(objects.find(o=>o.id==='tram')),centre=tram.getCenter(new THREE.Vector3());
  const sight=centre.clone().sub(camera.position).normalize(),forward=camera.getWorldDirection(new THREE.Vector3()),heading=new THREE.Vector3(tramAt(t).dir,0,0);
  const a=THREE.MathUtils.radToDeg(heading.angleTo(sight)),axis=THREE.MathUtils.radToDeg(heading.angleTo(forward)),p=projected(tram);
  const clipped=clippedProjection(tram),inFrustum=Boolean(clipped);
  const frameSubject=b=>{const p=projected(b);return {...p,height:p.y1-p.y0,width:p.x1-p.x0};};
  return {view,cam:camera.position.toArray(),target:rig.look.slice(),t,hour,groundHeightLowerBound:camera.position.y-2.5,bridgeClearance:camera.position.y-BRIDGE.top,
   objects,tramAngle:a,opticalAxisAngle:axis,pitch:THREE.MathUtils.radToDeg(Math.asin(-forward.y)),tramWidth:inFrustum?p.x1-p.x0:0,tramVisible:inFrustum,tramUnclippedProjectionWidth:p.x1-p.x0,tramScreenBox:clipped,
   fov:camera.fov,tramHeading:heading.toArray(),tramCentre:centre.toArray(),tramFacingDot:heading.dot(camera.position.clone().sub(centre).setY(0).normalize()),
   towerAxes:{pagoda:towerAxis('pagoda',pagodaTowerBox,PAGODA.x,PAGODA.z),canton:towerAxis('canton',staticBoxes.canton,CANTON.x,CANTON.z)},whiteRoofUpperBound:roofArea(),
   subjects:{bridge:frameSubject(staticBoxes.bridge),pagoda:frameSubject(pagodaTowerBox),pagodaWithTerrain:frameSubject(staticBoxes.pagoda),arch:frameSubject(archBox),silk:frameSubject(silkBox),canton:frameSubject(staticBoxes.canton)}};
 };
 // Native-size semantic raster, using the same vertices, instancing, wind and camera.
 // Original vertex programs are retained. Postprocessing/colour grading is excluded
 // from the mask; transparent glass/contact decals are omitted to count the surface below.
 // Far-bank scenery is NOT counted as the miniature. No AABB-area approximation.
 const maskTarget=new THREE.WebGLRenderTarget(1080,1920,{depthBuffer:true});
 const maskPixels=new Uint8Array(1080*1920*4),maskMaterials=new Map();
 const maskColour={board:[1,0,0],roof:[1,0,1],sky:[0,1,0],water:[0,0,1],other:[0,0,0]};
 function maskMaterial(material,kind){
  const key=material.uuid+kind;if(maskMaterials.has(key))return maskMaterials.get(key);
  const m=material.clone(),rgb=maskColour[kind].map(n=>n+'.0').join(',');
  m.toneMapped=false;m.fog=false;m.transparent=false;m.blending=THREE.NoBlending;
  m.onBeforeCompile=shader=>{material.onBeforeCompile(shader,renderer);const i=shader.fragmentShader.lastIndexOf('}');shader.fragmentShader=shader.fragmentShader.slice(0,i)+'gl_FragColor=vec4('+rgb+',1.0);\n'+shader.fragmentShader.slice(i);};
  m.customProgramCacheKey=()=>material.uuid+'-record-mask-'+kind;maskMaterials.set(key,m);return m;
 }
 window.__huacheng.recordCoverage=frame=>{
  framePose(frame,false);const saved=[];
  scene.traverse(o=>{if(!o.isMesh)return;let p=o,kind='board';while(p&&p!==scene){if(['city','tram','cars','boats'].includes(p.name))kind='other';p=p.parent;}if(o===sky)kind='sky';else if(o.material===water.material)kind='water';else if(o===roof)kind='roof';saved.push([o,o.material,o.visible]);if(o.material.transparent)o.visible=false;else o.material=maskMaterial(o.material,kind);});
  const target=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled,tone=renderer.toneMapping;
  try{renderer.shadowMap.enabled=false;renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(maskTarget);renderer.render(scene,camera);renderer.readRenderTargetPixels(maskTarget,0,0,1080,1920,maskPixels);}
  finally{for(const [o,m,v] of saved){o.material=m;o.visible=v;}renderer.setRenderTarget(target);renderer.shadowMap.enabled=shadows;renderer.toneMapping=tone;}
  let board=0,skyN=0,waterN=0,roofN=0;for(let i=0;i<maskPixels.length;i+=4){if(maskPixels[i]>200){board++;if(maskPixels[i+2]>200)roofN++;}else if(maskPixels[i+1]>200)skyN++;else if(maskPixels[i+2]>200)waterN++;}
  const n=1080*1920;return{board:board/n,sky:skyN/n,water:waterN/n,empty:(skyN+waterN)/n,other:1-(board+skyN+waterN)/n,whiteRoof:roofN/n};
 };
 window.__huacheng.recordFrame=(frame,previous=null,blend=1)=>{
  overlay.style.opacity='0';
  if(previous&&blend<1){framePose(previous,true);overlay.src=canvas.toDataURL('image/png');}
  framePose(frame,true);overlay.style.opacity=String(previous?1-clamp(blend,0,1):0);
  return {view,t,hour,cam:camera.position.toArray(),target:rig.look.slice(),tram:tramAt(t),pixelRatio,blend,previous:previous?.pos};
 };
}
