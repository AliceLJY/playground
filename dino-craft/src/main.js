import {PALETTE} from './palettes.mjs';
import {measurePalette} from './palette-audit.mjs';
import {summarizePixels} from './palette-metrics.mjs';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createTerrainAtlas,createWaterTexture,createSkyTexture} from './textures.mjs';
import {rexParts,grazerParts,pteroParts} from './models.mjs';
import {runPilot} from './pilot.mjs';
import {createGame,createVoxelKernel,update,snapshot,rayBlock,craft,eat,BLOCKS,SLOTS,RECIPES,Quality} from './core.mjs';

const $=id=>document.getElementById(id),canvas=$('scene'),params=new URLSearchParams(location.search),mobile=matchMedia('(pointer:coarse)').matches||innerWidth<700;
const paletteId='noon',palette=PALETTE;
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});}catch(e){$('error').hidden=false;$('error').textContent='需要支持 WebGL 的浏览器。请开启硬件加速后重试。';throw e;}
renderer.setClearColor(palette.sky.horizon);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.45;
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),rendererName=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const skyDayTexture=createSkyTexture(THREE,palette.sky),skyNightTexture=createSkyTexture(THREE,palette.sky,true);
const scene=new THREE.Scene();scene.background=skyDayTexture;scene.fog=new THREE.Fog(palette.sky.horizon,(mobile?44:63)*.6,mobile?44:63);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.06,180);camera.rotation.order='YXZ';scene.add(camera);
const hemi=new THREE.HemisphereLight(palette.ambient,palette.shadow,palette.hemi),sun=new THREE.DirectionalLight(palette.sun,palette.direct);sun.position.set(-30,60,25);const skyFill=new THREE.AmbientLight(palette.ambient,.7);scene.add(hemi,sun,skyFill);
const lamp=new THREE.SpotLight(palette.lamp,0,43,Math.PI/7,.5,1.35);lamp.position.set(0,-.08,-.1);camera.add(lamp);lamp.target.position.set(0,-.05,-22);camera.add(lamp.target);
const terrainMaterial=new THREE.MeshLambertMaterial({vertexColors:true,map:createTerrainAtlas(THREE,palette),alphaTest:.35,transparent:true,depthWrite:true,forceSinglePass:true});
terrainMaterial.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float tile; attribute vec3 grassTint; varying float vAtlasTile; varying vec2 vVoxelUv; varying vec3 vGrassTint;').replace('#include <uv_vertex>','#include <uv_vertex>\nvAtlasTile=tile;vVoxelUv=uv;vGrassTint=grassTint;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vAtlasTile; varying vec2 vVoxelUv; varying vec3 vGrassTint;').replace('#include <map_fragment>',`vec2 pixelUv=vec2((vAtlasTile*16.+.5+fract(vVoxelUv.x)*15.)/256.,(.5+fract(vVoxelUv.y)*15.)/16.);diffuseColor*=texture2D(map,pixelUv);if(vAtlasTile<.5)diffuseColor.rgb*=vGrassTint;`);
};
const plainMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),color=new THREE.Color(),v3=new THREE.Vector3(),screen=new THREE.Vector3();
function bake(parts,material=plainMaterial){const pos=[],norm=[],colors=[],indices=[],m=new THREE.Matrix4(),r=new THREE.Euler(),s=new THREE.Vector3(),p=new THREE.Vector3();for(const b of parts){const [x,y,z,sx,sy,sz,c,rx=0,ry=0,rz=0]=b;m.compose(p.set(x,y,z),new THREE.Quaternion().setFromEuler(r.set(rx,ry,rz)),s.set(sx,sy,sz));color.set(c);const geom=box.clone().applyMatrix4(m),a=geom.attributes.position,n=geom.attributes.normal,base=pos.length/3;for(let i=0;i<a.count;i++){pos.push(a.getX(i),a.getY(i),a.getZ(i));norm.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(color.r,color.g,color.b);}for(const n of geom.index.array)indices.push(base+n);geom.dispose();}const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geom.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geom.setIndex(indices);return new THREE.Mesh(geom,material);}

// A cached box cloud layer; no billboards, imported textures or shadow-map passes.
const cloudParts=[];for(let i=0;i<22;i++){const x=Math.sin(i*27.1)*95,z=Math.cos(i*14.2)*95;cloudParts.push([x,43+(i%4)*2,z,12+(i%3)*5,1.3,5+(i%4)*2,palette.cloud]);}const clouds=bake(cloudParts,new THREE.MeshBasicMaterial({vertexColors:true}));scene.add(clouds);
const sunDisc=new THREE.Mesh(new THREE.CircleGeometry(5,24),new THREE.MeshBasicMaterial({color:palette.sun,fog:false}));sunDisc.position.set(-70,57,-95);sunDisc.lookAt(0,15,0);scene.add(sunDisc);
const waterMaterial=new THREE.MeshPhongMaterial({color:'#ffffff',map:createWaterTexture(THREE,terrainMaterial.map),transparent:true,opacity:.78,shininess:65,specular:palette.waterSpecular,side:THREE.DoubleSide});
const water=new THREE.Mesh(new THREE.PlaneGeometry(190,190),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=10.25;scene.add(water);
const rippleParts=[];for(let i=0;i<95;i++)rippleParts.push([(i*23.17)%126-63,10.28,(i*17.34)%126-63,1.5+(i%3),.012,.045,palette.waterSpecular]);const ripples=bake(rippleParts,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.28}));scene.add(ripples);

let g=createGame(Number(params.get('seed'))||731),input={moveX:0,moveZ:0,fire:false,mine:false,place:false,jump:false,sprint:false},quality=new Quality(),started=false,crafting=false,fixed=false,view='play',ready=false;
let chunks=new Map(),wanted=new Set(),pending=new Map(),results=[],workerBusy=false,worker=null,epoch=0,radius=mobile?2:3,lastCX=1e9,lastCZ=1e9,maxMesh=0,meshJobs=0;
function setupWorker(){if(worker)worker.terminate();const code='const createVoxelKernel='+createVoxelKernel.toString()+';let kernel;onmessage=e=>{const d=e.data;if(!kernel||d.seed!==kernel.seed){kernel=createVoxelKernel(d.seed);kernel.seed=d.seed;}const m=kernel.mesh(d.cx,d.cz,d.edits);postMessage({...d,edits:undefined,...m},[m.position.buffer,m.normal.buffer,m.color.buffer,m.uv.buffer,m.tile.buffer,m.index.buffer]);};';const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=e=>{workerBusy=false;if(e.data.epoch===epoch)results.push(e.data);dispatch();};worker.onerror=e=>{console.error('Terrain worker',e.message);$('error').hidden=false;$('error').textContent='地形生成失败，请刷新重试。';};}
setupWorker();
function key(cx,cz){return cx+','+cz;}
function enqueue(cx,cz){const id=key(cx,cz);if(wanted.has(id))pending.set(id,{cx,cz});}
function dispatch(){if(workerBusy||!pending.size)return;let nearest=null,score=Infinity;const cx=Math.floor(g.p.x/16),cz=Math.floor(g.p.z/16);for(const [id,j] of pending){const d=(j.cx-cx)**2+(j.cz-cz)**2;if(d<score){score=d;nearest=[id,j];}}const [id,j]=nearest;pending.delete(id);const edits=[];for(const [k,b] of g.edits){const [x,y,z]=k.split(',').map(Number);if(x>=j.cx*16-1&&x<=j.cx*16+16&&z>=j.cz*16-1&&z<=j.cz*16+16)edits.push([x,y,z,b]);}workerBusy=true;meshJobs++;worker.postMessage({...j,seed:g.seed,edits,epoch});}
function stream(force=false){const cx=Math.floor(g.p.x/16),cz=Math.floor(g.p.z/16);if(!force&&cx===lastCX&&cz===lastCZ)return;lastCX=cx;lastCZ=cz;wanted=new Set();for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const x=cx+dx,z=cz+dz,id=key(x,z);wanted.add(id);if(!chunks.has(id))enqueue(x,z);}for(const [id,m] of chunks)if(!wanted.has(id)){scene.remove(m);m.geometry.dispose();chunks.delete(id);}for(const [id] of pending)if(!wanted.has(id))pending.delete(id);dispatch();}
const zoneColors=Object.fromEntries(Object.entries(palette.zones).map(([k,v])=>[k,new THREE.Color(v)])),grassBase=new THREE.Color(palette.texture.grassTop[0]);
function grassTints(mesh){
 const values=new Float32Array(mesh.position.length);values.fill(1);const cache=new Map();
 for(let i=0;i<mesh.tile.length;i++)if(mesh.tile[i]===0){
  const x=mesh.position[i*3],z=mesh.position[i*3+2],id=x+','+z;let tint=cache.get(id);
  if(!tint){const h=g.k.height(x,z),slope=Math.max(Math.abs(h-g.k.height(x+1,z)),Math.abs(h-g.k.height(x,z+1))),n=g.k.noise(x/23+13,z/23+29),hill=Math.min(1,Math.max(0,slope*.22+n*.95-.22)),shore=Math.min(.85,Math.max(0,(17.5-h)/4));
   const wet=Math.min(1,Math.max(0,(20-h)/5))*(.4+n*.6);
   const c=grassBase.clone().lerp(zoneColors.wet,wet).lerp(zoneColors.slope,hill).lerp(zoneColors.shore,shore).multiplyScalar(.97+g.k.noise(x/7,z/7)*.06);tint=[c.r/grassBase.r,c.g/grassBase.g,c.b/grassBase.b];cache.set(id,tint);
  }values.set(tint,i*3);
 }return values;
}
function applyMeshes(){for(let i=0;i<2&&results.length;i++){const d=results.shift(),id=key(d.cx,d.cz);if(!wanted.has(id))continue;maxMesh=Math.max(maxMesh,d.quads);const old=chunks.get(id);if(old){scene.remove(old);old.geometry.dispose();}const geom=new THREE.BufferGeometry();geom.setAttribute('grassTint',new THREE.BufferAttribute(grassTints(d),3));geom.setAttribute('position',new THREE.BufferAttribute(d.position,3));geom.setAttribute('normal',new THREE.BufferAttribute(d.normal,3));geom.setAttribute('color',new THREE.BufferAttribute(d.color,3));geom.setAttribute('uv',new THREE.BufferAttribute(d.uv,2));geom.setAttribute('tile',new THREE.BufferAttribute(d.tile,1));geom.setIndex(new THREE.BufferAttribute(d.index,1));geom.computeBoundingSphere();const mesh=new THREE.Mesh(geom,terrainMaterial);chunks.set(id,mesh);scene.add(mesh);}}
stream(true);

// All articulated animals share one instanced box draw. Templates are immutable.
const templates={rex:rexParts(palette),grazer:grazerParts(palette),ptero:pteroParts(palette)},animalMaterial=new THREE.MeshLambertMaterial({vertexColors:false}),animals=new THREE.InstancedMesh(box,animalMaterial,2400);animals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);animals.frustumCulled=false;scene.add(animals);
function drawAnimals(){
 dummy.rotation.order='YXZ';
 let count=0;
 for(const e of g.creatures){
  const sin=Math.sin(e.yaw),cos=Math.cos(e.yaw),stride=e.age*(e.flee?13:8),walk=Math.sin(stride)*.48;
  const bob=Math.cos(stride*2)*.065;
  for(const a of templates[e.type]){
   let [x,y,z,sx,sy,sz,c,joint,side]=a,rx=0,rz=0;
   if(joint==='leg'||joint==='foot'){z+=walk*(side||1);rx=walk*(side||1)*.55;y+=Math.max(0,Math.cos(stride)*(side||1))*.1;}
   if(joint==='body'||joint==='plate')y+=bob;
   if(joint==='head'){y+=bob+Math.sin(stride)*.045;}
   if(joint==='jaw'){
    const angle=e.warning>0?.48:.12+Math.max(0,Math.sin(e.age*2))*.09,hingeY=2.8,hingeZ=1.78;
    const dy=y-hingeY,dz=z-hingeZ;
    y=hingeY+dy*Math.cos(angle)-dz*Math.sin(angle)+bob;z=hingeZ+dy*Math.sin(angle)+dz*Math.cos(angle);rx=angle;
   }
   if(joint==='tail'){x+=Math.sin(e.age*2+(side||0)*.3)*.08;y+=bob-Math.sin(stride)*.035*(side||0);}
   if(joint==='wing'){rz=Math.sin(e.age*7)*.28*side;y+=Math.abs(x)*Math.sin(e.age*7)*.24;}
   dummy.position.set(e.x+x*cos+z*sin,e.y+y+(e.dead?-Math.min(e.dead,.9)*1.7:0),e.z-x*sin+z*cos);
   dummy.rotation.set(rx,e.yaw,rz+(e.dead?e.dead*.7:0));dummy.scale.set(sx,sy,sz);dummy.updateMatrix();animals.setMatrixAt(count,dummy.matrix);
   color.set(e.hit?'#ffe0a0':c);if(e.warning>0&&joint==='jaw')color.set('#dc7655');animals.setColorAt(count++,color);
  }
 }
 animals.count=count;animals.instanceMatrix.needsUpdate=true;if(animals.instanceColor)animals.instanceColor.needsUpdate=true;
}

const gun=new THREE.Group();camera.add(gun);const gunMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.48,metalness:.45});
const gunBody=bake([[0,0,0,.38,.35,.58,'#293d3c'],[0,.18,-.06,.48,.11,.36,'#5c7167'],[0,-.22,.2,.19,.42,.23,'#664d34',-.25],[-.23,-.02,.11,.12,.32,.3,'#b39863'],[.22,.04,.12,.09,.2,.3,'#a39362'],[0,.25,.12,.19,.09,.22,'#273a38'],[0,.32,.12,.2,.06,.05,'#d6c597'],[.23,-.16,.32,.24,.22,.36,'#bdab7b'],[.2,-.3,.52,.32,.22,.5,'#536b5a']],gunMaterial);gun.add(gunBody);
const barrelGeometry=[],barrelMuzzles=[];
function gunPiece(geometry,c,x,y,z){
 geometry.translate(x,y,z);color.set(c);const colors=[];for(let i=0;i<geometry.attributes.position.count;i++)colors.push(color.r,color.g,color.b);geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));barrelGeometry.push(geometry);
}
for(let i=0;i<6;i++){
 const a=i/6*Math.PI*2,x=Math.cos(a)*.155,y=Math.sin(a)*.155;
 const tube=new THREE.CylinderGeometry(.057,.057,1.03,12,1,true);tube.rotateX(Math.PI/2);gunPiece(tube,'#87978b',x,y,-.735);
 const rim=new THREE.TorusGeometry(.047,.012,4,12);gunPiece(rim,'#b6b89d',x,y,-1.25);
 gunPiece(new THREE.CircleGeometry(.039,12),'#101e20',x,y,-1.247);
 barrelMuzzles.push(new THREE.Vector3(x,y,-1.25));
}
for(const z of [-.34,-1.08])gunPiece(new THREE.TorusGeometry(.22,.035,6,24),'#495f57',0,0,z);
const barrels=new THREE.Mesh(mergeGeometries(barrelGeometry),gunMaterial);barrelGeometry.forEach(g=>g.dispose());gun.add(barrels);
const flash=bake([[0,0,-1.42,.12,.12,.3,'#ffedb0'],[0,0,-1.48,.28,.05,.13,'#ffcb6d'],[0,0,-1.48,.05,.28,.13,'#ffcb6d']],new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));gun.add(flash);flash.visible=false;

const muzzle=new THREE.PointLight('#ffc27b',0,3,2);muzzle.position.set(.4,-.3,-1.2);camera.add(muzzle);
const particles=new THREE.InstancedMesh(box,new THREE.MeshBasicMaterial({color:'#e1b575'}),96);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;scene.add(particles);const particleData=Array.from({length:96},()=>({life:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:.04}));let pi=0,flashTime=0,hitTime=0,trauma=0,freeze=0,recoil=0,toastTime=0,damageTime=0;
function emit(x,y,z,n=6,size=.08){const limit=quality.level>1?48:96;for(let i=0;i<n;i++){const p=particleData[pi++%limit];p.life=.4+g.random()*.5;p.x=x;p.y=y;p.z=z;p.vx=(g.random()-.5)*4;p.vy=g.random()*4;p.vz=(g.random()-.5)*4;p.size=size;}}
const drops=new THREE.InstancedMesh(box,new THREE.MeshLambertMaterial({color:'#d98d67'}),24);drops.frustumCulled=false;scene.add(drops);
const campLights=Array.from({length:4},()=>{const l=new THREE.PointLight('#ffb75e',0,12,1.8);scene.add(l);return l;});
function refreshCampLights(){let i=0;for(const [key,b] of g.edits){if((b===10||b===11)&&i<4){const a=key.split(',').map(Number),l=campLights[i++];l.position.set(a[0]+.5,a[1]+1.1,a[2]+.5);l.intensity=b===11?15:8;}}for(;i<4;i++)campLights[i].intensity=0;}
const targetBox=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012,1.012,1.012)),new THREE.LineBasicMaterial({color:'#ffe7b4',transparent:true,opacity:.8}));scene.add(targetBox);

const labels=Array.from({length:18},()=>{const el=document.createElement('div');el.className='enemy-label';el.hidden=true;el.innerHTML='<span></span><div class="bar"><i></i></div>';$('enemy-labels').append(el);return el;});
const floats=Array.from({length:12},()=>{const el=document.createElement('div');el.className='float';el.hidden=true;$('floats').append(el);return {el,life:0,x:0,y:0,z:0};});let fi=0;
const slots=SLOTS.map((b,i)=>{const el=document.createElement('button');el.className='slot';el.innerHTML=`<small>${i+1}</small><i class="cube" style="background:${BLOCKS[b][1]}"></i><span>${BLOCKS[b][0]}</span><b></b>`;el.title=BLOCKS[b][0];el.onclick=()=>{g.selected=i;};$('hotbar').append(el);return el;});
const names={wood:'原木',plank:'木板',stone:'石',ore:'铁矿',amber:'琥珀',torch:'火把',meat:'生肉',food:'熟肉'};
const recipeButtons=RECIPES.map((r,i)=>{const el=document.createElement('button');el.className='recipe';el.innerHTML=`<b>${r.name}</b><span>${Object.entries(r.cost).map(([k,n])=>names[k]+' '+n).join(' + ')}</span><small>${r.desc}</small>`;el.onclick=()=>{if(craft(g,i)){toast('已制作 '+r.name);refreshCraft();}};$('recipes').append(el);return el;});
function refreshCraft(){recipeButtons.forEach((el,i)=>{el.disabled=Object.entries(RECIPES[i].cost).some(([k,n])=>(g.inventory[k]||0)<n);});$('resources').textContent='木 '+g.inventory.wood+' / 石 '+g.inventory.stone+' / 琥珀 '+g.inventory.amber;}
function toast(s){$('toast').textContent=s;toastTime=3;}
function lockPointer(){const request=canvas.requestPointerLock?.();if(request?.catch)request.catch(()=>toast('点击画面锁定鼠标 · Esc 释放'));}
function clearInput(){for(const k of Object.keys(input))input[k]=typeof input[k]==='boolean'?false:0;pressed.clear();stickPointer=null;lookPointer=null;stickX=stickZ=0;$('stick-knob').style.transform='';document.querySelectorAll('.pressed').forEach(e=>e.classList.remove('pressed'));}
function openCraft(){if(!started||g.dead)return;crafting=!crafting;$('craft-modal').hidden=!crafting;clearInput();if(crafting){document.exitPointerLock?.();refreshCraft();}else if(!mobile)lockPointer();}
$('craft-open').onclick=openCraft;$('craft-close').onclick=openCraft;
$('lamp').onclick=()=>{g.headlamp=!g.headlamp&&g.p.battery>0;toast(g.headlamp?'头灯亮起 · 电量 '+Math.round(g.p.battery):'头灯已关闭');};$('eat').onclick=()=>{toast(eat(g)?'进食 · 恢复饥饿':'没有食物，击倒恐龙后走近拾肉');};
const pressed=new Set();let stickPointer=null,lookPointer=null,stickX=0,stickZ=0,lookX=0,lookY=0;
addEventListener('keydown',e=>{if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyE'){openCraft();return;}if(e.code==='KeyH')$('lamp').click();if(e.code==='KeyF')$('eat').click();if(/^Digit[1-6]$/.test(e.code))g.selected=Number(e.code.slice(-1))-1;pressed.add(e.code);});
addEventListener('keyup',e=>pressed.delete(e.code));
function readInput(){input.moveX=(pressed.has('KeyD')?1:0)-(pressed.has('KeyA')?1:0)+stickX;input.moveZ=(pressed.has('KeyW')?1:0)-(pressed.has('KeyS')?1:0)+stickZ;input.sprint=pressed.has('ShiftLeft')||pressed.has('ShiftRight')||Math.hypot(stickX,stickZ)>.8;input.jump=pressed.has('Space')||touchHeld.jump;input.place=pressed.has('KeyQ')||touchHeld.place||mouseHeld.place;input.fire=mouseHeld.fire||touchHeld.fire;input.mine=mouseHeld.mine||touchHeld.mine;}
const mouseHeld={fire:false,mine:false,place:false},touchHeld={fire:false,mine:false,place:false,jump:false};
function releaseAll(){clearInput();for(const k in mouseHeld)mouseHeld[k]=false;for(const k in touchHeld)touchHeld[k]=false;}
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!started||crafting||fixed||g.dead||e.pointerType==='touch')return;if(document.pointerLockElement!==canvas){lockPointer();return;}mouseHeld[e.button===0?'fire':e.button===2?'mine':'place']=true;});
addEventListener('pointerup',e=>{if(e.pointerType!=='touch')mouseHeld[e.button===0?'fire':e.button===2?'mine':'place']=false;});addEventListener('pointercancel',releaseAll);addEventListener('blur',releaseAll);
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)releaseAll();});
addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas||crafting||fixed)return;g.p.yaw-=e.movementX*.0022;g.p.pitch=Math.max(-1.48,Math.min(1.48,g.p.pitch-e.movementY*.0022));});
const stick=$('stick');stick.addEventListener('pointerdown',e=>{if(stickPointer!==null)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
function moveStick(e){if(e.pointerId!==stickPointer)return;const r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/35,z=-(e.clientY-r.top-r.height/2)/35,n=Math.max(1,Math.hypot(x,z));stickX=x/n;stickZ=z/n;$('stick-knob').style.transform=`translate(${stickX*29}px,${-stickZ*29}px)`;}
stick.addEventListener('pointermove',moveStick);for(const ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,()=>{stickPointer=null;stickX=stickZ=0;$('stick-knob').style.transform='';});
const look=$('look');look.addEventListener('pointerdown',e=>{lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;look.setPointerCapture(e.pointerId);});look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer||fixed||crafting)return;g.p.yaw-=(e.clientX-lookX)*.006;g.p.pitch=Math.max(-1.48,Math.min(1.48,g.p.pitch-(e.clientY-lookY)*.006));lookX=e.clientX;lookY=e.clientY;});for(const ev of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(ev,()=>lookPointer=null);
document.querySelectorAll('[data-intent]').forEach(b=>{b.addEventListener('pointerdown',e=>{if(!started||fixed||crafting)return;b.setPointerCapture(e.pointerId);touchHeld[b.dataset.intent]=true;b.classList.add('pressed');});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{touchHeld[b.dataset.intent]=false;b.classList.remove('pressed');});});

function restart(){ready=false;epoch++;pending.clear();results.length=0;for(const m of chunks.values()){scene.remove(m);m.geometry.dispose();}chunks.clear();g=createGame(Number(params.get('seed'))||731);fixed=false;view='play';started=true;crafting=false;releaseAll();$('intro').hidden=true;$('death').hidden=true;$('craft-modal').hidden=true;$('view-label').textContent='';flashTime=hitTime=trauma=freeze=recoil=damageTime=0;setupWorker();refreshCampLights();workerBusy=false;lastCX=lastCZ=1e9;stream(true);toast('先找木头，或沿河搜寻琥珀。');}
$('start').onclick=()=>{if(fixed)restart();else{started=true;$('intro').hidden=true;}if(!mobile)lockPointer();};$('restart').onclick=()=>{restart();if(!mobile)lockPointer();};

function fixedView(name){view=name;const nothing={};if(name==='night'){g=runPilot(g.seed,'precise',88).game;g.p.yaw=Math.PI;for(let i=0;i<150;i++)update(g,{moveZ:1,jump:true},.05);for(let i=0;i<14;i++)update(g,{},.05);g.headlamp=true;g.p.yaw=1.1;g.p.pitch=.05; }else for(let i=0;i<40;i++)update(g,nothing,.05);
 fixed=true;started=true;$('intro').hidden=true;$('view-label').textContent=name==='hero'?'01 / 河岸遭遇':name==='night'?'02 / 夜巡 · 头灯':'03 / 无边群岛';stream(true);
}
if(['hero','night','wide'].includes(params.get('view')))fixedView(params.get('view'));

function handleEvents(){for(const e of g.events){if(e.type==='shot'){flashTime=.055;recoil=Math.min(.055,recoil+.018);trauma=Math.min(.5,trauma+.06);emit(g.p.x+Math.cos(g.p.yaw)*.5,g.p.y+1.35,g.p.z-Math.sin(g.p.yaw)*.5,1,.035);if(e.hit)emit(e.x,e.y,e.z,3,.05);}if(e.type==='hit'){hitTime=.1;const f=floats[fi++%floats.length];f.life=.65;f.x=e.x;f.y=e.y;f.z=e.z;f.el.textContent='12';}if(e.type==='kill'){freeze=.045;trauma=Math.min(.8,trauma+.3);toast('击倒 · 走近拾取恐龙肉');}if(e.type==='hurt'){damageTime=.45;trauma=Math.min(.8,trauma+.4);}if(e.type==='mine'){emit(e.x,e.y,e.z,7,.1);toast('采集 +1 '+BLOCKS[e.b][0]);}if(e.type==='place')toast('已放置 '+BLOCKS[e.b][0]);if(e.type==='pickup')toast('恐龙肉 +2 · F 进食');if(e.type==='survived')toast('第一夜已过！继续探索与建造。');if(e.type==='death'){releaseAll();document.exitPointerLock?.();$('death').hidden=false;$('death-text').textContent=`存活 ${Math.floor(g.time)} 秒 · 第 ${g.day} 天 · 击倒 ${g.stats.kills} 只恐龙。下次试试先造屋顶，咬击预警出现时后退。`;}}}
let capturePose=null;
let uiTimer=0,simAccumulator=0,frameCount=0,renderCount=0,lastFrame=0,raf=0,offscreen=false,jsSamples=[],frameSamples=[],recentJS=0,recentFrame=16.7,adaptiveChanges=0;
let hudBounds=[],lastWarning=false;
function cacheHudBounds(){hudBounds=[];document.querySelectorAll('[data-layout]').forEach(el=>{const r=el.getBoundingClientRect();if(r.width&&r.height)hudBounds.push({left:r.left-5,right:r.right+5,top:r.top-5,bottom:r.bottom+5});});}
const fogDay=new THREE.Color(palette.sky.horizon),fogNight=new THREE.Color(palette.sky.nightHorizon),sunDay=new THREE.Color(palette.sun),sunNight=new THREE.Color(palette.moon);
function visual(dt){const p=g.p,night=g.night,lum=night?.12:1;scene.background=night?skyNightTexture:skyDayTexture;scene.fog.color.copy(night?fogNight:fogDay);skyFill.intensity=night?.2:.7;hemi.intensity=night?1.0:palette.hemi;sun.intensity=night?.7:palette.direct;sun.color.copy(night?sunNight:sunDay);clouds.visible=!night;sunDisc.visible=!night;waterMaterial.color.set(night?palette.nightWater:'#ffffff');water.position.x=p.x;water.position.z=p.z;ripples.position.set(Math.floor(p.x/126)*126,0,Math.floor(p.z/126)*126);
 lamp.intensity=g.headlamp?14:0;lamp.visible=g.headlamp;trauma=Math.max(0,trauma-dt*1.8);recoil=Math.max(0,recoil-dt*.2);flashTime-=dt;hitTime-=dt;damageTime=Math.max(0,damageTime-dt);flash.visible=flashTime>0;muzzle.intensity=flash.visible?3:0;const shake=trauma*trauma*.008;
 if(view==='hero'){camera.position.set(-12.5,29,-12);camera.rotation.set(-.262,-1.72,0);gun.visible=true;}else if(view==='wide'){camera.position.set(p.x+28,p.y+30,p.z+26);camera.lookAt(p.x+2,p.y-4,p.z-10);gun.visible=false;lamp.visible=false;}else{camera.position.set(p.x,p.y+1.65,p.z);camera.rotation.set(p.pitch+Math.sin(g.time*29)*shake,p.yaw+Math.cos(g.time*31)*shake,0);gun.visible=true;}
 if(capturePose){camera.position.fromArray(capturePose.position);camera.rotation.set(...capturePose.rotation);}
 const walk=Math.min(1,Math.hypot(input.moveX,input.moveZ));gun.position.set(mobile?.25:.4,-.535+Math.sin(g.time*10)*.012*walk,-1.1+recoil);gun.scale.setScalar(mobile?.48:.53);gun.rotation.set(-.035,0,-.045+Math.cos(g.time*8)*walk*.013);barrels.rotation.z+=dt*(g.spin*34);flash.rotation.z=barrels.rotation.z;const outlet=barrelMuzzles[Math.floor(g.time/.085)%6];flash.position.set(outlet.x*Math.cos(barrels.rotation.z)-outlet.y*Math.sin(barrels.rotation.z),outlet.x*Math.sin(barrels.rotation.z)+outlet.y*Math.cos(barrels.rotation.z),0);
 drawAnimals();let pc=0;for(const part of particleData){if(part.life<=0)continue;part.life-=dt;part.x+=part.vx*dt;part.y+=part.vy*dt;part.z+=part.vz*dt;part.vy-=12*dt;dummy.position.set(part.x,part.y,part.z);dummy.rotation.set(part.life*3,part.life*4,0);dummy.scale.setScalar(part.size);dummy.updateMatrix();particles.setMatrixAt(pc++,dummy.matrix);}particles.count=pc;particles.instanceMatrix.needsUpdate=true;
 let dc=0;for(const d of g.drops){dummy.position.set(d.x,d.y+Math.sin(g.time*3)*.1,d.z);dummy.rotation.set(0,g.time,0);dummy.scale.set(.35,.3,.35);dummy.updateMatrix();drops.setMatrixAt(dc++,dummy.matrix);}drops.count=dc;drops.instanceMatrix.needsUpdate=true;
 const cp=Math.cos(p.pitch),r=rayBlock(g,p.x,p.y+1.62,p.z,-Math.sin(p.yaw)*cp,Math.sin(p.pitch),-Math.cos(p.yaw)*cp,6);targetBox.visible=!!r&&view!=='wide';if(r){targetBox.position.set(r.x+.5,r.y+.5,r.z+.5);$('target').textContent=BLOCKS[r.b][0]+' · 挖掘 / 放置';}else $('target').textContent='';
 camera.updateMatrixWorld();let li=0,warn=g.creatures.some(e=>e.warning>0&&!e.dead);$('warning').hidden=!warn||view==='wide';if(warn)$('warning').textContent='⚠ 捕食者蓄势 · 后退，离开咬击范围';if(warn!==lastWarning){lastWarning=warn;cacheHudBounds();}for(const e of g.creatures){const el=labels[li++];if(!el)break;screen.set(e.x,e.y+(e.type==='rex'?4.4:e.type==='grazer'?2.3:.8),e.z).project(camera);const px=(screen.x*.5+.5)*innerWidth,py=(-screen.y*.5+.5)*innerHeight;let safeLabel=true;for(const r of hudBounds)if(px+38>r.left&&px-38<r.right&&py+3>r.top&&py-29<r.bottom){safeLabel=false;break;}const visible=safeLabel&&e.hp>0&&screen.z<1&&screen.z>0&&Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&Math.hypot(e.x-p.x,e.z-p.z)<32;el.hidden=!visible||view==='wide';if(visible){el.style.left=px+'px';el.style.top=py+'px';el.firstChild.textContent=e.type==='rex'?'霸王龙':e.type==='grazer'?'剑背龙':'翼龙';el.lastChild.firstChild.style.width=Math.max(0,e.hp/e.maxHp*100)+'%';}}for(;li<labels.length;li++)labels[li].hidden=true;
 $('warning').hidden=!warn||view==='wide';if(warn)$('warning').textContent='⚠ 捕食者蓄势 · 后退，离开咬击范围';
 for(const f of floats){f.life-=dt;f.el.hidden=f.life<=0||view==='wide';if(f.life>0){f.y+=dt*.9;screen.set(f.x,f.y,f.z).project(camera);f.el.style.transform=`translate(${(screen.x*.5+.5)*innerWidth}px,${(-screen.y*.5+.5)*innerHeight}px)`;f.el.style.opacity=Math.min(1,f.life*3);}}
 $('cross').classList.toggle('hit',hitTime>0);$('damage').style.opacity=damageTime*.9;toastTime-=dt;if(toastTime<=0)$('toast').textContent='';
 uiTimer+=dt;if(uiTimer>.1){uiTimer=0;$('hp').textContent=Math.ceil(p.hp);$('hp-bar').style.width=p.hp+'%';$('hunger').textContent=Math.ceil(p.hunger);$('food-bar').style.width=p.hunger+'%';$('stamina').textContent=Math.ceil(p.stamina);$('stamina-bar').style.width=p.stamina+'%';$('day').textContent='DAY '+String(g.day).padStart(2,'0');$('clock').textContent=(night?'夜晚':'白昼')+' / '+Math.floor(g.time%180)+'s';$('weather').textContent=g.sheltered?'庇护中 · 缓慢回血':night?'捕食者活跃':'史前群岛 · 晴';$('spin').style.width=g.spin*100+'%';$('gun-state').textContent=g.spin>.82?'转速就绪':g.spin>.02?'预热中…':'按住开火 / 预热 0.4s';$('lamp').textContent=(g.headlamp?'亮 ':'头灯 ')+Math.ceil(p.battery);$('lamp').setAttribute('aria-pressed',String(g.headlamp));$('goal').textContent=g.won?'02 / 把荒野变成家':'01 / 活过第一夜';$('goal-detail').textContent=g.sheltered?'屋顶和墙挡住了气味。':g.inventory.meat?'F 吃肉补给 · 合成可烤熟':'采木搭窝 · 开火会惊动附近的恐龙';slots.forEach((el,i)=>{el.classList.toggle('active',i===g.selected);const count=g.inventory[BLOCKS[SLOTS[i]][2]]||0;el.lastChild.textContent=count>99?'99+':count;});}
}
function resize(){const cap=mobile?1.25:1.5;renderer.setPixelRatio(Math.min(devicePixelRatio,cap)*quality.scale);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();cacheHudBounds();}addEventListener('resize',resize);resize();
function frame(now){raf=0;if(document.hidden||offscreen)return;const elapsed=lastFrame?now-lastFrame:34;const target=fixed||!started||crafting||mobile?1000/30:1000/60;if(elapsed<target-.7){raf=requestAnimationFrame(frame);return;}lastFrame=now;frameCount++;const dt=Math.min(.1,elapsed/1000),begin=performance.now();applyMeshes();if(started&&!fixed&&!crafting&&!g.dead){readInput();simAccumulator+=dt;let steps=0;while(simAccumulator>=1/60&&steps++<6){const slow=freeze>0?.1:1;update(g,input,1/60*slow);handleEvents();simAccumulator-=1/60;}}freeze=Math.max(0,freeze-dt);if(g.changed.length){refreshCampLights();for(const [cx,cz] of g.changed)enqueue(cx,cz);g.changed.length=0;dispatch();}stream();visual(dt);renderer.render(scene,camera);renderCount++;recentJS=performance.now()-begin;recentFrame=elapsed;jsSamples.push(recentJS);frameSamples.push(elapsed);if(jsSamples.length>360){jsSamples.shift();frameSamples.shift();}if(!fixed&&started&&quality.sample(elapsed,dt,mobile?34:19)){adaptiveChanges++;resize();}if(!ready&&chunks.has(key(Math.floor(g.p.x/16),Math.floor(g.p.z/16)))&&chunks.size>=9)ready=true;raf=requestAnimationFrame(frame);}
function wake(){if(!raf&&!document.hidden&&!offscreen){lastFrame=0;raf=requestAnimationFrame(frame);}}document.addEventListener('visibilitychange',()=>{releaseAll();if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}else wake();});const observer=new IntersectionObserver(entries=>{offscreen=!entries[0].isIntersecting;if(offscreen){if(raf)cancelAnimationFrame(raf);raf=0;releaseAll();}else wake();});observer.observe(canvas);wake();
function percentile(a,p){if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y);return +b[Math.floor((b.length-1)*p)].toFixed(2);}
const coverageMaterial=new THREE.ShaderMaterial({
 uniforms:{atlas:{value:terrainMaterial.map}},
 vertexShader:`attribute float tile;varying float blockTile;varying vec2 voxelUv;varying float viewDepth;void main(){blockTile=tile;voxelUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);viewDepth=-mv.z;gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`uniform sampler2D atlas;varying float blockTile;varying vec2 voxelUv;varying float viewDepth;void main(){vec2 p=vec2((blockTile*16.+.5+fract(voxelUv.x)*15.)/256.,(.5+fract(voxelUv.y)*15.)/16.);if(texture2D(atlas,p).a<.35)discard;bool plant=(blockTile>4.5&&blockTile<6.5)||abs(blockTile-8.)<.1||abs(blockTile-13.)<.1||abs(blockTile-15.)<.1;gl_FragColor=plant?(viewDepth<10.?vec4(1,0,1,1):vec4(1,0,0,1)):vec4(0,1,0,1);}`
});
function coverageAudit(){
 const hidden=[];scene.traverse(o=>{if(o.isMesh&&!chunksHas(o)&&o.visible){hidden.push(o);o.visible=false;}});
 const oldBackground=scene.background,oldOverride=scene.overrideMaterial;
 scene.background=new THREE.Color('#0000ff');scene.overrideMaterial=coverageMaterial;renderer.render(scene,camera);
 const size=renderer.getDrawingBufferSize(new THREE.Vector2()),pixels=new Uint8Array(size.x*size.y*4);
 gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 let sky=0,ground=0,plants=0,nearPlants=0,n=0;
 for(let i=0;i<pixels.length;i+=64){n++;if(pixels[i+2]>200&&pixels[i]<30)sky++;if(pixels[i+1]>200&&pixels[i]<30)ground++;if(pixels[i]>200&&pixels[i+1]<30){plants++;if(pixels[i+2]>200)nearPlants++;}}
 scene.background=oldBackground;scene.overrideMaterial=oldOverride;for(const o of hidden)o.visible=true;renderer.render(scene,camera);
 return {sky:sky/n,ground:ground/n,plants:plants/n,nearPlants:nearPlants/n,pixelsSampled:n};
}
function chunksHas(o){for(const mesh of chunks.values())if(mesh===o)return true;return false;}
function rexVisibility(){
 const hidden=[],oldCount=animals.count,oldMaterial=animals.material,oldInstanceColor=animals.instanceColor,oldBackground=scene.background;
 scene.traverse(o=>{if(o.isMesh&&o!==animals&&!chunksHas(o)&&o.visible){hidden.push(o);o.visible=false;}});
 const depthMaterial=terrainMaterial.clone();depthMaterial.onBeforeCompile=terrainMaterial.onBeforeCompile;depthMaterial.colorWrite=false;depthMaterial.transparent=false;
 for(const mesh of chunks.values()){mesh.material=depthMaterial;mesh.renderOrder=-1;}
 animals.count=templates.rex.length;animals.instanceColor=null;animals.material=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});scene.background=new THREE.Color('#000000');
 const size=renderer.getDrawingBufferSize(new THREE.Vector2()),pixels=new Uint8Array(size.x*size.y*4);
 const count=()=>{renderer.render(scene,camera);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]>240)n++;return n;};
 const visible=count();for(const mesh of chunks.values())mesh.visible=false;const total=count();
 for(const mesh of chunks.values()){mesh.visible=true;mesh.material=terrainMaterial;mesh.renderOrder=0;}
 animals.material.dispose();animals.material=oldMaterial;animals.instanceColor=oldInstanceColor;animals.count=oldCount;scene.background=oldBackground;for(const o of hidden)o.visible=true;depthMaterial.dispose();renderer.render(scene,camera);
 return {visiblePixels:visible,totalPixels:total,fraction:total?visible/total:0};
}
function renderAudit(){
 // Audit the rendered/animated transforms, not the template constants.
 const point=new THREE.Vector3(),matrix=new THREE.Matrix4();
 function bounds(feed){let minX=1,minY=1,maxX=-1,maxY=-1;feed((x,y,z,m)=>{point.set(x,y,z).applyMatrix4(m).project(camera);if(point.z>1||point.z<0)return;minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);});return {left:(minX+1)/2,right:(maxX+1)/2,top:(1-maxY)/2,bottom:(1-minY)/2,width:(maxX-minX)/2,height:(maxY-minY)/2};}
 const rex=bounds(visit=>{for(let i=0;i<templates.rex.length;i++){animals.getMatrixAt(i,matrix);for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])visit(x,y,z,matrix);}});
 const species=[];let offset=0;
 for(const e of g.creatures){
  const start=offset;offset+=templates[e.type].length;
  const outline=bounds(visit=>{for(let i=start;i<offset;i++){animals.getMatrixAt(i,matrix);for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])visit(x,y,z,matrix);}});
  species.push({id:e.id,type:e.type,...outline,pixelAspect:outline.width*innerWidth/(outline.height*innerHeight)});
 }
 const weapon=bounds(visit=>gun.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++)visit(a.getX(i),a.getY(i),a.getZ(i),mesh.matrixWorld);}));
 camera.getWorldDirection(point);const cp=Math.cos(g.p.pitch),aimDot=point.x*(-Math.sin(g.p.yaw)*cp)+point.y*Math.sin(g.p.pitch)+point.z*(-Math.cos(g.p.yaw)*cp);const result={aimDot,species,observer:view==='hero',rex,weapon:gun.visible?{...weapon,visibleWidth:Math.max(0,Math.min(1,weapon.right)-Math.max(0,weapon.left)),visibleHeight:Math.max(0,Math.min(1,weapon.bottom)-Math.max(0,weapon.top))}:null};
 const radialNormals=new Set();const bn=barrels.geometry.attributes.normal;for(let i=0;i<bn.count;i++)if(Math.abs(bn.getZ(i))<.5)radialNormals.add(bn.getX(i).toFixed(3)+','+bn.getY(i).toFixed(3));
 result.barrelRadialNormals=radialNormals.size;
 result.barrelAngle=barrels.rotation.z;flash.geometry.computeBoundingBox();barrels.geometry.computeBoundingBox();result.flash={visible:flash.visible,rearZ:flash.geometry.boundingBox.max.z,barrelFrontZ:barrels.geometry.boundingBox.min.z};
 result.coverage=coverageAudit();
 const landmarks={};
 for(const joint of ['head','body','tail','leg','jaw']){
  const points=[];
  for(let i=0;i<templates.rex.length;i++)if(templates.rex[i][7]===joint){animals.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).project(camera);points.push([point.x,point.y]);}
  landmarks[joint]=points.length?points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]):null;
 }
 result.rex.landmarks=landmarks;if(view==='hero')result.rex.visibility=rexVisibility();
 const hb=[landmarks.head[0]-landmarks.body[0],landmarks.head[1]-landmarks.body[1]],tb=[landmarks.tail[0]-landmarks.body[0],landmarks.tail[1]-landmarks.body[1]];
 result.articulation={};for(const joint of ['head','tail','jaw','leg']){result.articulation[joint]=[];for(let i=0;i<templates.rex.length;i++)if(templates.rex[i][7]===joint){animals.getMatrixAt(i,matrix);result.articulation[joint].push(matrix.toArray());}}
 result.maxLegAxisTilt=Math.max(...result.articulation.leg.map(m=>Math.abs(m[1])/Math.hypot(m[0],m[1],m[2])));
 result.muzzles=barrelMuzzles.map(p=>p.toArray());
 result.rex.headAhead=hb[0]*tb[0]+hb[1]*tb[1]<0&&Math.hypot(...hb)>.06;
 const atlasPixels=terrainMaterial.map.image.getContext('2d').getImageData(0,0,256,16).data;
 result.atlas={size:[256,16],tileSize:16,leafHoles:0,amberTranslucent:0};
 for(let i=0;i<256;i++){const x=i%16,y=Math.floor(i/16);if(atlasPixels[(y*256+8*16+x)*4+3]===0)result.atlas.leafHoles++;const alpha=atlasPixels[(y*256+9*16+x)*4+3];if(alpha>0&&alpha<255)result.atlas.amberTranslucent++;}

 result.terrain={textured:!!terrainMaterial.map,nearest:terrainMaterial.map?.magFilter===THREE.NearestFilter,alphaTest:terrainMaterial.alphaTest,uvVertices:[...chunks.values()].reduce((n,m)=>n+(m.geometry.attributes.uv?.count||0),0)};
 result.spawn={forwardClear:!rayBlock(g,g.p.x,g.p.y+1.65,g.p.z,-Math.sin(g.p.yaw)*Math.cos(g.p.pitch),Math.sin(g.p.pitch),-Math.cos(g.p.yaw)*Math.cos(g.p.pitch),6)};
 result.camera={position:camera.position.toArray(),rotation:camera.rotation.toArray().slice(0,3)};
 if(g.headlamp){const size=renderer.getDrawingBufferSize(new THREE.Vector2()),w=Math.floor(size.x*.5),h=Math.floor(size.y*.5),x=Math.floor(size.x*.25),y=Math.floor(size.y*.25),lit=new Uint8Array(w*h*4),dark=new Uint8Array(w*h*4),intensity=lamp.intensity;renderer.render(scene,camera);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,lit);lamp.intensity=0;renderer.render(scene,camera);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,dark);lamp.intensity=intensity;renderer.render(scene,camera);let changed=0,clipped=0,n=0;for(let i=0;i<lit.length;i+=16){n++;if((lit[i]+lit[i+1]+lit[i+2]-dark[i]-dark[i+1]-dark[i+2])/3>12)changed++;if(lit[i]>250&&lit[i+1]>250&&lit[i+2]>250)clipped++;}result.headlamp={litFraction:changed/n,clippedFraction:clipped/n,pixelsSampled:n};}
 return result;
}
window.__PLAYTEST__={get ready(){return ready&&!workerBusy&&!pending.size&&!results.length;},snapshot(){return {...snapshot(g),palette:paletteId,ready,view,started,crafting,input:{...input},chunkCount:chunks.size,pending:pending.size,workerBusy,meshJobs,maxChunkQuads:maxMesh,radius,renderer:rendererName,swiftShader:/swiftshader/i.test(rendererName),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,particleCount:particles.count,dinoParts:animals.count,quality:{level:quality.level,scale:quality.scale,changes:adaptiveChanges,dpr:renderer.getPixelRatio()},performance:{jsP50:percentile(jsSamples,.5),jsP95:percentile(jsSamples,.95),frameP50:percentile(frameSamples,.5),frameP95:percentile(frameSamples,.95),fps:frameSamples.length?+(1000/(frameSamples.reduce((a,b)=>a+b,0)/frameSamples.length)).toFixed(1):0},renderCount,hidden:document.hidden,offscreen};},reset(){restart();},setSeed(n){if(!Number.isFinite(n))return;params.set('seed',String(n|0));restart();},step(ms){if(!Number.isFinite(ms)||ms<0||ms>180000)return;for(let t=0;t<ms;t+=1000/60){update(g,input,1/60);handleEvents();}stream();},
 // Explicit diagnostic methods, only usable when test=1. Normal play does not call them.
 ...(params.has('test')?{paletteAudit(){const data=measurePalette({THREE,renderer,scene,camera,gl,chunks,animals,coverageMaterial,terrainMaterial,creatures:g.creatures,templates,sun});return summarizePixels(data.full,data.isolated,data.mask,data.width,data.height,renderer.getPixelRatio(),data.leaves,data.faces);},renderAudit,captureCamera(pose){capturePose=pose;},look(yaw,pitch){g.p.yaw=yaw;g.p.pitch=pitch;},clearPerformance(){jsSamples.length=0;frameSamples.length=0;},qualitySample(ms,n){for(let i=0;i<n;i++)if(quality.sample(ms)){adaptiveChanges++;resize();}},freeze(){fixed=true;},unfreeze(){fixed=false;},getBlock(x,y,z){return g.block(x,y,z);},creatureAim(id){const e=g.creatures.find(e=>e.id===id);if(!e)return;g.p.yaw=Math.atan2(-(e.x-g.p.x),-(e.z-g.p.z));g.p.pitch=Math.atan2(e.y+(e.type==='rex'?2:.9)-g.p.y-1.62,Math.hypot(e.x-g.p.x,e.z-g.p.z));}}:{})};
