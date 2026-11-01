// Audit build only. Same geometry-based sampling on ca58b02 and R5.
window.__r5Regions=()=>({
 bridge:window.__archBridgeFrame(),canton:window.__huacheng.subjectBoxes().canton,
 water:[[-15,-1.85,-19],[15,-1.85,-19],[15,-1.85,-37],[-15,-1.85,-37]].map(p=>{const v=new THREE.Vector3(...p).project(camera);return[(v.x+1)*W/2,(1-v.y)*H/2];}),
});
window.__r5Cars=()=>carSpecs.map((car,i)=>{
 const b=new THREE.Box3(),m=new THREE.Matrix4();
 for(const mesh of [carBodies,carCabins,carRoof,carHeads,carTails,carGrilles,carWheels]){
  mesh.geometry.computeBoundingBox();for(const j of mesh===carWheels?[i*4,i*4+1,i*4+2,i*4+3]:[i]){mesh.getMatrixAt(j,m);b.union(mesh.geometry.boundingBox.clone().applyMatrix4(m));}
 }
 return {size:b.getSize(new THREE.Vector3()).toArray(),colour:car.color};
});
window.__r5Structure=()=>{
 const saved=[],materials=[];
 scene.traverse(o=>{if(!o.isMesh)return;let parent=o,isBridge=false;while(parent){if(parent.name==='bridge')isBridge=true;parent=parent.parent;}
 const structure=isBridge&&['bridge-bridge','bridge-rails','bridge-stone'].includes(o.name),windy=o.material.onBeforeCompile===windShader;
 const m=new THREE.MeshBasicMaterial({color:structure?0xffffff:0,side:THREE.DoubleSide,fog:false});m.clippingPlanes=o.material.clippingPlanes;
 m.onBeforeCompile=s=>{if(windy)windShader(s);s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=vec3('+(structure?'1.':'0.')+');');};m.customProgramCacheKey=()=>String(structure)+String(windy);
 saved.push([o,o.material]);o.material=m;materials.push(m);});
 const target=new THREE.WebGLRenderTarget(W,H),old=renderer.getRenderTarget(),tone=renderer.toneMapping;renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(target);renderer.render(scene,camera);
 const p=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,p);renderer.setRenderTarget(old);renderer.toneMapping=tone;for(const [o,m] of saved)o.material=m;materials.forEach(m=>m.dispose());target.dispose();
 const mask=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)mask.push(p[((H-1-y)*W+x)*4]>250?1:0);animate(0);return mask;
};
