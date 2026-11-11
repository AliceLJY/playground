import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CELL,P,PALETTE,Grid,generateWorld,surfaceFaces,cornerAO,hash} from './world.js';
import {clamp,timeState,Quality,airshipAt} from './core.js';
import {PALETTES,paletteKey} from './palettes.js';
import {fillSkyRamp,atmosphereColor} from './sky-colors.js';
const params=new URLSearchParams(location.search),fixed=['hero','wide','night'].includes(params.get('view')),view=fixed?params.get('view'):'default',debug=params.has('debug')||globalThis.__SKY_TEST_CAPTURE__===true;
const selectedPalette=paletteKey(params.get('palette')),scheme=PALETTES[selectedPalette];
const canvas=document.querySelector('#scene'),mobile=()=>innerWidth<700||matchMedia('(pointer:coarse)').matches;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.info.autoReset=false;
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
const scene=new THREE.Scene();scene.fog=new THREE.Fog('#b8d1da',110,235);
// A tiny reusable sky ramp, uploaded only when the hour changes. No postprocessing.
const skyData=new Uint8Array(2048*4),skyTexture=new THREE.DataTexture(skyData,1,2048,THREE.RGBAFormat);
skyTexture.colorSpace=THREE.SRGBColorSpace;skyTexture.minFilter=skyTexture.magFilter=THREE.NearestFilter;scene.background=skyTexture;
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.2,250);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=22;controls.maxDistance=100;controls.minPolarAngle=.43;controls.maxPolarAngle=1.48;controls.enablePan=true;controls.panSpeed=.55;controls.rotateSpeed=.55;
const hemi=new THREE.HemisphereLight('#d7e2ed','#665875',1.7);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffc187',2.4);sun.position.set(-26,39,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-34,right:34,top:37,bottom:-28,near:1,far:110});sun.shadow.bias=-.00035;sun.shadow.normalBias=.04;sun.shadow.radius=3;scene.add(sun);sun.target.position.set(0,2,0);scene.add(sun.target);
const warmA=new THREE.PointLight('#ffaa55',0,22,2),warmB=new THREE.PointLight('#ffad60',0,16,2);warmA.position.set(0,8,5);warmB.position.set(10,2,8);scene.add(warmA,warmB);
const solidMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:.03});
const lampMaterial=new THREE.MeshStandardMaterial({vertexColors:true,emissive:'#ffc17a',emissiveIntensity:.5,roughness:.65});
const waterMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.15,transparent:true,opacity:.83});
const crystalMaterial=new THREE.MeshStandardMaterial({vertexColors:true,emissive:'#7db3c7',emissiveIntensity:.24,roughness:.3,metalness:.15});
const palette=PALETTE.map((c,i)=>new THREE.Color(scheme.materials[i]||c));
const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
let aoCorners=0,faceCount=0;
function meshGrid(grid,scale,group){const buckets=Array.from({length:4},()=>({p:[],n:[],c:[],idx:[]}));
 surfaceFaces(grid,(x,y,z,m,f)=>{const bi=m===P.light?1:m===P.water?2:m===P.crystal?3:0,b=buckets[bi],base=b.p.length/3,color=palette[m];let tint=.88+.21*hash(x,y,z,731);
 if(m===P.stone){if(y%4===0&&Math.abs((x+Math.floor(y/4)*2+z)%7)<2)tint*=.88;if(hash(x,0,z)> .96)tint*=.83;}
 if(m===P.roof)tint*=((x+z)%7===0?.85:1.05);if(m===P.rock)tint*=1+.06*Math.sin(y*.53+x*.15);
 for(const[su,sv]of corners){const ao=bi===1?1:cornerAO(grid,x,y,z,f,su,sv);if(ao<1)aoCorners++;b.p.push((x+f.n[0]*.5+f.u[0]*su*.5+f.v[0]*sv*.5)*scale,(y+f.n[1]*.5+f.u[1]*su*.5+f.v[1]*sv*.5)*scale,(z+f.n[2]*.5+f.u[2]*su*.5+f.v[2]*sv*.5)*scale);b.n.push(...f.n);b.c.push(color.r*tint*ao,color.g*tint*ao,color.b*tint*ao);}
 b.idx.push(base,base+1,base+2,base,base+2,base+3);faceCount++;
 });
 const mats=[solidMaterial,lampMaterial,waterMaterial,crystalMaterial];for(let i=0;i<4;i++){const b=buckets[i];if(!b.p.length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));geo.setIndex(b.idx);geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mats[i]);mesh.castShadow=i===0;mesh.receiveShadow=i===0;mesh.name=['exposed-voxel-surface','warm-window-voxels','water-channel-voxels','crystal-voxels'][i];group.add(mesh);}
}
const worldStart=performance.now(),world=generateWorld(731),citadel=new THREE.Group();scene.add(citadel);meshGrid(world.grid,CELL,citadel);let mainFaces=faceCount;const worldBounds=new THREE.Box3().setFromObject(citadel),worldSize=new THREE.Vector3();worldBounds.getSize(worldSize);
// Release the occupancy map after the static AO has been baked. No runtime remeshing.
world.grid.cells.clear();
const airship=new THREE.Group();scene.add(airship);const sg=new Grid();
sg.box(-11,11,-2,19,-27,27,(x,y,z)=>{const a=Math.abs(z);return a%11<2||Math.abs(x)<2?P.gold:P.copper;},(x,y,z)=>x*x/121+(y-8)**2/121+z*z/729<1);
sg.box(-4,4,-12,-8,-12,13,P.wood);sg.box(-5,5,-8,-8,-13,14,P.gold);for(let z=-9;z<=9;z+=5){sg.box(-5,-5,-11,-10,z,z+1,P.light);sg.box(5,5,-11,-10,z,z+1,P.light);}
for(const x of[-6,6])for(const z of[-14,14])sg.box(x,x,-8,5,z,z,P.gold);
sg.box(-1,1,8,23,-26,-20,P.roof,(x,y,z)=>y<23-(z+26)*1.5);sg.box(-15,15,7,8,-25,-18,P.roof,(x,y,z)=>Math.abs(x)<16-(z+25));sg.box(-3,3,-5,0,-18,-15,P.copper);meshGrid(sg,.13,airship);airship.traverse(o=>{o.castShadow=false;});const shipVoxels=sg.cells.size;sg.cells.clear();
const shipFaces=faceCount-mainFaces;
const cube=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),vec=new THREE.Vector3(),shipState={x:0,y:0,z:0,heading:0};
const propeller=new THREE.InstancedMesh(cube,new THREE.MeshStandardMaterial({color:'#a8a9a1',roughness:.5}),4);propeller.count=4;airship.add(propeller);
// Four cloth flags: voxel strips displaced in the vertex shader, one draw call.
const flagMat=new THREE.MeshStandardMaterial({color:'#a85b55',roughness:1,side:THREE.DoubleSide});let flagsUniform={value:0};flagMat.onBeforeCompile=s=>{s.uniforms.uTime=flagsUniform;s.vertexShader='uniform float uTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.z += sin(position.x * 5. + uTime * 1.8) * .10;');};
const flagMesh=new THREE.InstancedMesh(cube,flagMat,4*21);let fi=0;for(const f of world.meta.flags)for(let x=0;x<7;x++)for(let y=0;y<3;y++){dummy.position.set(f[0]+(x+1)*CELL,f[1]-y*CELL,f[2]);dummy.scale.set(CELL,CELL,CELL*.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();flagMesh.setMatrixAt(fi++,dummy.matrix);}scene.add(flagMesh);
// Shader point sprites use analytic falloff, never external textures or full-screen passes.
function pointField(count,kind){
 // Clouds and 80 waterfall-mist points share one submission, paying for the sky ramp's draw call.
 const total=count+(kind===0?80:0),positions=new Float32Array(total*3),seeds=new Float32Array(total),types=new Float32Array(total);
 for(let i=0;i<total;i++){seeds[i]=hash(i,3,kind,731);types[i]=i>=count?1:0;
  if(kind===0&&i<count){positions[i*3]=(hash(i,0,0)-.5)*160;positions[i*3+1]=-17-hash(i,1,0)*8;positions[i*3+2]=(hash(i,2,0)-.5)*140;}
  else if(kind===1){const a=hash(i,1,2)*Math.PI*2,b=hash(i,2,3)*.8+.15;positions[i*3]=Math.cos(a)*100*Math.sin(b);positions[i*3+1]=8+hash(i,4,5)*75;positions[i*3+2]=Math.sin(a)*100*Math.sin(b);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));geo.setAttribute('aMist',new THREE.BufferAttribute(types,1));
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:kind===1,blending:kind===1?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{uTime:{value:0},uDpr:{value:1},uColor:{value:new THREE.Color('#ffffff')},uShade:{value:new THREE.Color('#6088ac')},uMistColor:{value:new THREE.Color('#bce5ed')},uHideMist:{value:0},uAlpha:{value:1}},
 vertexShader:`attribute float aSeed;attribute float aMist;uniform float uTime;uniform float uDpr;varying float vSeed;varying float vMist;
 void main(){vSeed=aSeed;vMist=aMist;vec3 p=position;
 ${kind===0?`if(aMist<.5){p.x+=sin(uTime*.018+aSeed*8.)*4.;p.z+=cos(uTime*.015+aSeed*9.)*3.;}else{float t=fract(aSeed+uTime*.09);p=vec3(6.3+sin(aSeed*82.)*(.8+t*2.),-11.2-t*3.,9.5+cos(aSeed*62.)*(.3+t));}`:''}
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=${kind===0?'mix(13000.+aSeed*18000.,40.+aSeed*70.,aMist)':'(1.+aSeed*1.7)*(-mv.z)'}*uDpr/max(1.,-mv.z);}`,
 fragmentShader:`uniform vec3 uColor;uniform vec3 uShade;uniform vec3 uMistColor;uniform float uAlpha;uniform float uHideMist;varying float vSeed;varying float vMist;
 void main(){vec2 uv=gl_PointCoord-.5;float r=length(uv);float a;vec3 color=uColor;
 ${kind===1?'a=smoothstep(.5,.1,r)*uAlpha*.85;':`if(vMist>.5){a=exp(-r*r*14.)*smoothstep(.5,.3,r)*.28*(1.-uHideMist);color=uMistColor;}else{
 float lobes=max(max(exp(-dot(uv-vec2(-.18,.05),uv-vec2(-.18,.05))*32.),exp(-dot(uv-vec2(.06,-.08),uv-vec2(.06,-.08))*28.)),exp(-dot(uv-vec2(.2,.06),uv-vec2(.2,.06))*40.));
 a=lobes*smoothstep(.5,.35,r)*uAlpha;
 float light=clamp(.57-uv.y*1.5-uv.x*.35,0.,1.);color=mix(uShade,uColor,light);
 }`}
 gl_FragColor=vec4(color,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);return pts;
}
const clouds=pointField(86,0),stars=pointField(500,1);const pointFields=[clouds,stars];
const dropMat=new THREE.MeshStandardMaterial({color:'#c5f4ee',transparent:true,opacity:.64,roughness:.4,emissive:'#55929b',emissiveIntensity:.15});
const drops=new THREE.InstancedMesh(cube,dropMat,220);drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);drops.frustumCulled=false;scene.add(drops);
const smoke=new THREE.InstancedMesh(cube,new THREE.MeshLambertMaterial({color:'#e5d8cb',transparent:true,opacity:.34,depthWrite:false}),48);smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);smoke.frustumCulled=false;scene.add(smoke);
// A fine stepped waterfall veil, animated by falling voxel streaks; terminates above cloud bed.
const fallGeo=new THREE.BoxGeometry(.14,11.8,.14),fallMat=new THREE.MeshStandardMaterial({color:'#8ed8df',transparent:true,opacity:.38,roughness:.35,emissive:'#438da0',emissiveIntensity:.18});
const falls=new THREE.InstancedMesh(fallGeo,fallMat,9);for(let i=0;i<9;i++){dummy.position.set(6.1+(i-4)*.13,-5.3,9.65+Math.sin(i*1.3)*.1);dummy.scale.set(1,1,1);dummy.updateMatrix();falls.setMatrixAt(i,dummy.matrix);}scene.add(falls);
const buildMs=performance.now()-worldStart;
const quality=new Quality();let uiTime=0;let hour=view==='night'?3:2,simTime=fixed?12:0,paused=fixed,follow=false,focused='',manualAt=-100,flightTween=null,shadowUpdates=0,lastShadow=-100,shadowDirty=true,visible=true,intersecting=true,raf=0,lastFrame=0,lastRaf=0,frames=0,renderCount=0,lastJs=0;
const perf={js:[],interval:[],drawMax:0,triangleMax:0};const boundMin=new THREE.Vector3(-20,-6,-15),boundMax=new THREE.Vector3(20,15,15);const camHome=new THREE.Vector3(),homeTarget=new THREE.Vector3(0,2,0),savedCam=new THREE.Vector3(),savedTarget=new THREE.Vector3();
function home(){const aspect=innerWidth/innerHeight,isPhone=aspect<1;let dist=view==='wide'?89:view==='night'?57:69;const angle=view==='night'?1.12:.80;if(isPhone)dist*=1.45;homeTarget.set(0,isPhone?-6:view==='night'?6:3,0);camHome.set(Math.sin(angle)*dist,homeTarget.y+dist*.47,Math.cos(angle)*dist);camera.position.copy(camHome);controls.target.copy(homeTarget);controls.update();}
function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.25:1.5)*quality.scale);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.fov=camera.aspect<1?(view==='wide'?70:60):38;camera.filmOffset=innerHeight<480&&camera.aspect>1?8:0;camera.updateProjectionMatrix();for(const p of pointFields)p.material.uniforms.uDpr.value=renderer.getPixelRatio();}
home();resize();addEventListener('resize',()=>{resize();if(fixed&&!focused&&!follow)home();});
const hourInput=document.querySelector('#hour'),timeValue=document.querySelector('#timeValue'),flightButton=document.querySelector('#flight'),motionButton=document.querySelector('#motion');
const tintA=new THREE.Color();
function setHour(v){
 hour=clamp(Number(v)||0,0,3);const t=timeState(hour,selectedPalette),mix=(key,color)=>color.set(t.a[key]).lerp(tintA.set(t.b[key]),t.t),lerp=key=>THREE.MathUtils.lerp(t.a[key],t.b[key],t.t);
 const horizon=fillSkyRamp(t,skyData);skyTexture.needsUpdate=true;
 scene.fog.color.setRGB(...horizon,THREE.SRGBColorSpace);scene.fog.near=lerp('near');scene.fog.far=lerp('far');mix('sun',sun.color);sun.intensity=lerp('intensity');mix('hemi',hemi.color);mix('ground',hemi.groundColor);hemi.intensity=lerp('ambient');
 sun.position.set(-26+Math.sin(hour*.9)*8,32+Math.sin(hour*Math.PI/1.5)*8,18);
 lampMaterial.emissiveIntensity=.1+t.night*2.8;warmA.intensity=18*t.night;warmB.intensity=13*t.night;
 stars.material.uniforms.uAlpha.value=clamp((t.night-.45)/.55,0,1);stars.visible=stars.material.uniforms.uAlpha.value>0;
 for(const [key,uniform]of [['cloudLight','uColor'],['cloudShade','uShade']])clouds.material.uniforms[uniform].value.setRGB(...atmosphereColor(t.a[key],t.b[key],t.t),THREE.SRGBColorSpace);
 clouds.material.uniforms.uAlpha.value=lerp('cloudAlpha');clouds.material.uniforms.uMistColor.value.copy(scene.fog.color);
 hourInput.value=hour;const names=['黎明','正午','黄昏','深夜'];const j=Math.round(hour),minutes=Math.round((6+hour*6)*60)%1440;timeValue.textContent=names[j]+' / '+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');document.querySelectorAll('[data-time]').forEach(el=>el.classList.toggle('active',Math.abs(Number(el.dataset.time)-hour)<.15));shadowDirty=true;
}
setHour(hour);hourInput.addEventListener('input',()=>{setHour(hourInput.value);interact();});document.querySelectorAll('[data-time]').forEach(el=>el.addEventListener('click',()=>{setHour(el.dataset.time);interact();}));
function interact(){manualAt=uiTime;flightTween=null;}
controls.addEventListener('start',()=>{interact();if(follow)toggleFollow(false);});
const descriptions={palace:['01 / THE HIGH SANCTUM','主殿 · 穹顶之上','金色肋线托起青铜穹顶，拱窗把暮色留在城里。'],waterfall:['02 / THE CLOUD FALL','瀑布 · 水的去处','泉水穿过石渠，在岛边碎成水雾，落入没有尽头的云。'],bridge:['03 / THE SKYWAY','空桥 · 两岸之间','一格格石栏连起守望小岛，下方只有风与云海。'],island:['04 / THE QUIET GARDEN','花园岛 · 风的来信','小屋、松树和一盏灯，守着云海旁一处安静的角落。']};
function showPlace(id){document.body.dataset.focused=id;const d=descriptions[id];document.querySelector('#place').textContent=d[0];document.querySelector('#location').textContent=d[1];document.querySelector('#description').textContent=d[2];}
function focusLandmark(id){if(!descriptions[id])return;if(follow)toggleFollow(false);interact();focused=id;showPlace(id);const dest=new THREE.Vector3(...world.meta.landmarks[id]),off=new THREE.Vector3(19,13,23);if(id==='palace')off.set(23,13,29);if(mobile())off.multiplyScalar(1.18);flightTween={from:camera.position.clone(),targetFrom:controls.target.clone(),to:dest.clone().add(off),target:dest,start:uiTime};}
document.querySelectorAll('[data-landmark]').forEach(b=>b.addEventListener('click',()=>focusLandmark(b.dataset.landmark)));
function toggleFollow(force){const next=force??!follow;if(next===follow)return;interact();if(next){document.body.dataset.focused='flight';savedCam.copy(camera.position);savedTarget.copy(controls.target);focused='';}else{delete document.body.dataset.focused;camera.position.copy(savedCam);controls.target.copy(savedTarget);}follow=next;controls.enabled=!follow;flightButton.textContent=follow?'↙ 返回自由视角':'✧ 登上飞艇';flightButton.setAttribute('aria-pressed',String(follow));if(follow){document.querySelector('#location').textContent='巡航中 · 云的另一面';document.querySelector('#description').textContent='再点一下飞艇，或点「返回自由视角」，回到小城。';}else if(!focused){document.querySelector('#location').textContent='在云端，停留片刻';document.querySelector('#description').textContent='转动小城，寻找一扇亮起的窗。';}}
flightButton.addEventListener('click',()=>toggleFollow());
function setPaused(value){paused=value;motionButton.textContent=paused?'▷ 继续流动':'Ⅱ 暂停流动';motionButton.setAttribute('aria-pressed',String(paused));}
motionButton.addEventListener('click',()=>{setPaused(!paused);interact();});
function reset(){if(follow)toggleFollow(false);focused='';delete document.body.dataset.focused;flightTween=null;simTime=fixed?12:0;uiTime=0;manualAt=-100;setPaused(fixed);setHour(view==='night'?3:2);home();document.querySelector('#location').textContent='在云端，停留片刻';document.querySelector('#description').textContent='转动小城，寻找一扇亮起的窗。';}
document.querySelector('#reset').addEventListener('click',reset);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),hits=[];let downX=0,downY=0,dragged=false,pointers=new Set();
canvas.addEventListener('pointerdown',e=>{downX=e.clientX;downY=e.clientY;dragged=false;pointers.add(e.pointerId);interact();});canvas.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-downX,e.clientY-downY)>7)dragged=true;});
function release(e){pointers.delete(e.pointerId);}
canvas.addEventListener('pointerup',e=>{release(e);if(dragged||e.button>0)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);hits.length=0;raycaster.intersectObjects(airship.children,true,hits);if(hits.length){toggleFollow();return;}let best='',distance=.075;for(const[id,pos]of Object.entries(world.meta.landmarks)){vec.set(...pos).project(camera);const d=Math.hypot(vec.x-pointer.x,(vec.y-pointer.y)*camera.aspect);if(vec.z<1&&d<distance*3){distance=d/3;best=id;}}if(best)focusLandmark(best);});
for(const e of['pointercancel','lostpointercapture'])canvas.addEventListener(e,release);addEventListener('blur',()=>{pointers.clear();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
let autoAngle=0;const targetClamp=new THREE.Vector3();
function update(dt){uiTime+=dt;if(!paused)simTime+=dt;const animated=!paused?dt:0;
 airshipAt(simTime,shipState);airship.position.set(shipState.x,shipState.y,shipState.z);airship.rotation.y=shipState.heading;flagsUniform.value=simTime;
 const cs=Math.cos(shipState.heading),ss=Math.sin(shipState.heading);
 for(let i=0;i<48;i++){const age=((i/48+simTime*.18)%1),back=-2.9-age*5;dummy.position.set(shipState.x+ss*back+Math.sin(i*1.1)*age*.4,shipState.y-1+age*2,shipState.z+cs*back);dummy.scale.setScalar(Math.sin(age*Math.PI)*(.18+age*.48));dummy.rotation.set(age,age*.6,age);dummy.updateMatrix();smoke.setMatrixAt(i,dummy.matrix);}smoke.count=quality.level===2?24:48;smoke.instanceMatrix.needsUpdate=true;
 for(let i=0;i<220;i++){const t=(hash(i,2,4)+simTime*(.19+hash(i,3,4)*.06))%1,spread=t*t*.7;dummy.position.set(6.1+(hash(i,4,2)-.5)*1.1+Math.sin(i*2)*spread, .55-t*13.3,9.65+Math.cos(i*3)*(.12+spread));dummy.scale.set(.04+hash(i,4,5)*.055,.13+hash(i,3,6)*.35,.045);dummy.rotation.set(0,0,0);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);}drops.count=quality.level===2?120:220;drops.instanceMatrix.needsUpdate=true;
 for(let i=0;i<4;i++){dummy.position.set(0,-1,-2.4);dummy.rotation.set(0,0,simTime*14+i*Math.PI/2);dummy.scale.set(.10,.9,.09);dummy.updateMatrix();propeller.setMatrixAt(i,dummy.matrix);}propeller.instanceMatrix.needsUpdate=true;
 for(const p of pointFields)p.material.uniforms.uTime.value=simTime;
 if(follow){vec.set(-8,4,10).applyAxisAngle(THREE.Object3D.DEFAULT_UP,shipState.heading).add(airship.position);camera.position.lerp(vec,.065);controls.target.lerp(airship.position,.1);camera.lookAt(controls.target);}else if(flightTween){const t=clamp((uiTime-flightTween.start)/1.5,0,1),u=t*t*(3-2*t);camera.position.lerpVectors(flightTween.from,flightTween.to,u);controls.target.lerpVectors(flightTween.targetFrom,flightTween.target,u);if(t===1)flightTween=null;controls.update();}else{if(!fixed&&!paused&&uiTime-manualAt>12&&!pointers.size){autoAngle=.035*animated;vec.copy(camera.position).sub(controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP,autoAngle);camera.position.copy(controls.target).add(vec);}targetClamp.copy(controls.target).clamp(boundMin,boundMax);vec.subVectors(targetClamp,controls.target);camera.position.add(vec);controls.target.copy(targetClamp);controls.update();}
}
function draw(now,frameStart){const start=frameStart??performance.now();renderer.info.reset();if(shadowDirty&&(now-lastShadow>500||lastShadow<0)){renderer.shadowMap.needsUpdate=true;lastShadow=now;shadowDirty=false;shadowUpdates++;}renderer.render(scene,camera);renderCount++;lastJs=performance.now()-start;perf.drawMax=Math.max(perf.drawMax,renderer.info.render.calls);perf.triangleMax=Math.max(perf.triangleMax,renderer.info.render.triangles);if(perf.js.length>=180)perf.js.shift();perf.js.push(lastJs);}
function loop(now){raf=0;if(!visible||!intersecting)return;const interval=now-lastFrame,minFrame=paused&&!follow&&!pointers.size?100:1000/30;
 if(interval>=minFrame-.4){const raw=lastFrame?interval:33.33;lastFrame=now;const frameStart=performance.now();update(Math.min(raw/1000,.1));draw(now,frameStart);frames++;if(lastRaf&&perf.interval.length<240)perf.interval.push(raw);if(perf.interval.length>=240){perf.interval.shift();perf.interval.push(raw);}if(quality.sample(lastJs+Math.max(0,raw-minFrame-3))){resize();}lastRaf=now;}
 raf=requestAnimationFrame(loop);
}
function wake(){if(visible&&intersecting&&!raf){lastFrame=0;raf=requestAnimationFrame(loop);}}
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;pointers.clear();if(!visible){cancelAnimationFrame(raf);raf=0;}else wake();});
new IntersectionObserver(entries=>{intersecting=entries[0].isIntersecting;if(!intersecting){cancelAnimationFrame(raf);raf=0;}else wake();}).observe(canvas);
function projectedBounds(){let left=1,right=0,top=1,bottom=0;camera.updateMatrixWorld();for(const mesh of citadel.children){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){vec.fromBufferAttribute(p,i).project(camera);left=Math.min(left,vec.x*.5+.5);right=Math.max(right,vec.x*.5+.5);top=Math.min(top,-vec.y*.5+.5);bottom=Math.max(bottom,-vec.y*.5+.5);}}return{left,right,top,bottom};}
const shipProjection=new THREE.Vector3();
function snapshot(){const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:0;shipProjection.copy(airship.position).project(camera);return{view,hour,palette:selectedPalette,fogRange:[scene.fog.near,scene.fog.far],seed:world.meta.seed,ready:true,voxelCount:world.meta.voxelCount+shipVoxels+84,staticVoxels:world.meta.voxelCount,shipVoxels,mainFaces,shipFaces,aoCorners,buildMs,drawCalls:renderer.info.render.calls,drawMax:perf.drawMax,triangles:renderer.info.render.triangles,triangleMax:perf.triangleMax,renderer:gpu,software:/SwiftShader/i.test(gpu),pixelRatio:renderer.getPixelRatio(),devicePixelRatio,quality:quality.level,resolutionScale:quality.scale,viewport:[innerWidth,innerHeight],fps:1000/mean(perf.interval),jsMs:mean(perf.js),lastJs,shadowMap:2048,shadowUpdates,renderCount,simTime,paused,visible,intersecting,follow,focused,mode:follow?'follow':uiTime-manualAt>12?'orbit':'manual',pointers:pointers.size,camera:camera.position.toArray(),target:controls.target.toArray(),distance:camera.position.distanceTo(controls.target),bounds:projectedBounds(),airship:{...shipState,screen:[(shipProjection.x*.5+.5)*innerWidth,(-shipProjection.y*.5+.5)*innerHeight]},cloudX:Math.sin(simTime*.018)*4,waterPhase:simTime*.19%1,stars:stars.visible?500:0,night:timeState(hour,selectedPalette).night,particleCount:drops.count+smoke.count+80,landmarks:world.meta.landmarks,meshCount:scene.children.length};}
window.__PLAYTEST__={ready:false,snapshot,reset,setSeed(n){if(!Number.isInteger(n)||n<0||n>2147483647)throw new RangeError('seed must be an integer 0–2147483647');if(n!==world.meta.seed){const next=generateWorld(n);for(const child of [...citadel.children]){child.geometry.dispose();citadel.remove(child);}faceCount=0;aoCorners=0;meshGrid(next.grid,CELL,citadel);mainFaces=faceCount;world.meta=next.meta;next.grid.cells.clear();worldBounds.setFromObject(citadel);shadowDirty=true;}reset();update(0);draw(performance.now());return snapshot();},step(ms){if(!Number.isFinite(ms)||ms<0||ms>120000)throw new RangeError('step expects 0–120000 ms');for(let remain=ms;remain>0;remain-=1000/30)update(Math.min(remain,1000/30)/1000);draw(performance.now());return snapshot();}};
// Debug-only paired renders: identical camera/time, no HUD or moving foreground.
// The white silhouette is eroded by the pixel checker, excluding antialiased edges.
function capturePalette(){
 const vis=scene.children.map(o=>o.visible),background=scene.background,fog=scene.fog,override=scene.overrideMaterial;
 const maskMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
 const read=()=>{renderer.info.reset();renderer.render(scene,camera);return canvas.toDataURL('image/png');};
 try{
  const full=read();
  for(const o of [airship,flagMesh,drops,smoke,falls,stars])o.visible=false;
  clouds.material.uniforms.uHideMist.value=1;const subject=read();citadel.visible=false;const backgroundFrame=read();clouds.visible=false;const sky=read();
  citadel.visible=true;scene.background=new THREE.Color(0);scene.fog=null;scene.overrideMaterial=maskMaterial;
  const mask=read();return{full,subject,background:backgroundFrame,sky,mask};
 }finally{clouds.material.uniforms.uHideMist.value=0;scene.children.forEach((o,i)=>o.visible=vis[i]);scene.background=background;scene.fog=fog;scene.overrideMaterial=override;maskMaterial.dispose();renderer.info.reset();renderer.render(scene,camera);}
}
if(debug)window.__SKY_DEBUG__={capturePalette,setHour,focusLandmark,setPaused,toggleFollow,sampleQuality(ms,n){for(let i=0;i<n;i++)quality.sample(ms);resize();return quality.level;},clearPerformance(){perf.js.length=0;perf.interval.length=0;},resetQuality(){Object.assign(quality,new Quality());resize();},hide(v){visible=!v;if(v){cancelAnimationFrame(raf);raf=0;}else wake();},project(pos){vec.set(...pos).project(camera);return[(vec.x*.5+.5)*innerWidth,(-vec.y*.5+.5)*innerHeight];}};
setPaused(paused);update(0);draw(performance.now());window.__PLAYTEST__.ready=true;document.querySelector('#loading').classList.add('done');wake();
