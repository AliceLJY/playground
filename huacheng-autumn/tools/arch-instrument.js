// Appended only to the isolated audit build, never to dist or the source entry.
// Render the same scene twice, with/without shadow receiving, to isolate cast shadows.
let archSaved=[];
window.__archShadow=enabled=>{
 if(!enabled){scene.traverse(o=>{if(o.isMesh){archSaved.push([o,o.receiveShadow]);o.receiveShadow=false;}});}
 else {for(const [o,v] of archSaved)o.receiveShadow=v;archSaved=[];}
 animate(0);
};
window.__archFloor=()=>{
 const saved=[],clones=[],black=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide,fog:false}),white=black.clone();white.color.set(0xffffff);
 scene.traverse(o=>{if(!o.isMesh)return;const original=o.material;saved.push([o,original]);const floor=['ground-paving','ground-road'].includes(o.name);o.material=(floor?white:black).clone();clones.push(o.material);if(original.clippingPlanes)o.material.clippingPlanes=original.clippingPlanes;if(original.onBeforeCompile===windShader){o.material.onBeforeCompile=windShader;o.material.customProgramCacheKey=()=> 'floor-mask-wind';}});
 const target=new THREE.WebGLRenderTarget(W,H),old=renderer.getRenderTarget(),tone=renderer.toneMapping;
 renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(target);renderer.render(scene,camera);const a=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,a);
 renderer.setRenderTarget(old);renderer.toneMapping=tone;for(const [o,m] of saved)o.material=m;clones.forEach(m=>m.dispose());target.dispose();black.dispose();white.dispose();
 const mask=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)mask.push(a[((H-1-y)*W+x)*4]>250?1:0);animate(0);return {width:W,height:H,mask};
};

window.__archAO=enabled=>{if(typeof gtao==='undefined')return false;gtao.enabled=enabled;animate(0);return true;};
window.__archBridgeFrame=()=>{
 const saved=[],clones=[];
 scene.traverse(o=>{if(!o.isMesh)return;let parent=o,bridge=false;while(parent){if(parent.name==='bridge')bridge=true;parent=parent.parent;}
 const windy=o.material.onBeforeCompile===windShader;const material=new THREE.MeshBasicMaterial({color:bridge?0xffffff:0,side:THREE.DoubleSide,fog:false});
 material.onBeforeCompile=shader=>{if(windy)windShader(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=vec3('+(bridge?'1.':'0.')+');');};
 material.customProgramCacheKey=()=>String(bridge)+'-'+String(windy);material.clippingPlanes=o.material.clippingPlanes;saved.push([o,o.material]);o.material=material;clones.push(material);
 });
 const target=new THREE.WebGLRenderTarget(W,H),old=renderer.getRenderTarget(),tone=renderer.toneMapping;renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,pixels);renderer.setRenderTarget(old);renderer.toneMapping=tone;
 for(const [o,m] of saved)o.material=m;clones.forEach(m=>m.dispose());target.dispose();let x0=W,x1=0,y0=H,y1=0,n=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(pixels[((H-1-y)*W+x)*4]>250){x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);n++;}animate(0);return {x0:x0/W,x1:x1/W,y0:y0/H,y1:y1/H,visiblePixels:n};
};
