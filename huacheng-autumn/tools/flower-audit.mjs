// Render-only instrumentation appended to an isolated build of either revision.
// Does not change cameras, colours, bloom, geometry or the public scene hooks.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]||'shots/r2/audit.html');
const audit=String.raw`
window.__flowerAudit=()=>{
 const saved=[],clippedMaterials=[];
 const black=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide,fog:false});
 const red=new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide,fog:false});
 const green=new THREE.MeshBasicMaterial({color:0x00ff00,side:THREE.DoubleSide,fog:false});
 const redWind=red.clone(),greenWind=green.clone();for(const m of [redWind,greenWind]){m.onBeforeCompile=windShader;m.customProgramCacheKey=()=> 'flower-mask-wind';}
 const foreground=new Set(['ground','bridge','pagoda','tram','cars']);
 scene.traverse(o=>{if(!o.isMesh)return;let parent=o,board=false;while(parent){if(foreground.has(parent.name))board=true;parent=parent.parent;}
  if(o.isInstancedMesh&&!['boat-hulls','boat-cabins','distant-trees','city-windows'].includes(o.name))board=true;
  const flower=['bougainvillea-bracts','silk-five-petals','garden-blossoms','garden-centres'].includes(o.name);
  const windy=o.isInstancedMesh&&o.material.onBeforeCompile===windShader;saved.push([o,o.material]);o.material=flower?(windy?redWind:red):board?(windy?greenWind:green):black;if(saved.at(-1)[1].clippingPlanes){o.material=o.material.clone();o.material.clippingPlanes=saved.at(-1)[1].clippingPlanes;clippedMaterials.push(o.material);}
 });
 const target=new THREE.WebGLRenderTarget(W,H,{depthBuffer:true}),oldTarget=renderer.getRenderTarget(),oldTone=renderer.toneMapping;
 renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(target);renderer.render(scene,camera);
 const pixels=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,pixels);
 renderer.setRenderTarget(oldTarget);renderer.toneMapping=oldTone;for(const [o,m] of saved)o.material=m;
 clippedMaterials.forEach(m=>m.dispose());target.dispose();black.dispose();red.dispose();green.dispose();redWind.dispose();greenWind.dispose();
 // Screen order. Mesh instance colours multiply the ID material, so compare channels.
 const mask=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=((H-1-y)*W+x)*4;mask[y*W+x]=pixels[i]>5?2:pixels[i+1]>5?1:0;
 }
 animate(0);return {width:W,height:H,mask:Array.from(mask)};
};`;
const result=await build({stdin:{contents:readFileSync(path.join(root,'src/main.js'),'utf8')+audit+readFileSync(new URL('./arch-instrument.js',import.meta.url),'utf8')+readFileSync(new URL('./r5-instrument.js',import.meta.url),'utf8'),resolveDir:path.join(root,'src'),sourcefile:'audit.js'},nodePaths:[path.resolve('node_modules')],bundle:true,format:'iife',minify:true,write:false,target:'es2020',legalComments:'none'});
const html=readFileSync(path.join(root,'index.template.html'),'utf8').replace('<!--BUNDLE-->',()=>'<script>'+result.outputFiles[0].text.replace(/<\/script/g,'<\\/script')+'</script>');
mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,html);console.log(out);
