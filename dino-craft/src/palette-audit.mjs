// Test-only passes preserve default DPR, antialiasing, lighting and camera.
export function measurePalette({THREE,renderer,scene,camera,gl,chunks,animals,coverageMaterial,terrainMaterial,creatures,templates,sun}) {
  const {x:width,y:height}=renderer.getDrawingBufferSize(new THREE.Vector2());
  const read=()=>{renderer.render(scene,camera);const p=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const full=read(),hidden=[],terrain=new Set(chunks.values()),background=scene.background,material=animals.material,instanceColor=animals.instanceColor,animalVisible=animals.visible;
  scene.traverse(o=>{if(o.isMesh&&o!==animals&&!terrain.has(o)&&o.visible){hidden.push(o);o.visible=false;}});
  let isolated;
  const maskMaterial=new THREE.MeshBasicMaterial({toneMapped:false,fog:false});
  // Material IDs follow the real atlas alpha and depth, including sky seen through holes.
  const ids=new THREE.ShaderMaterial({
    uniforms:{atlas:{value:terrainMaterial.map},facePass:{value:false},sunDirection:{value:sun.position.clone().sub(sun.target.position).normalize()}},
    vertexShader:`attribute float tile; varying float blockTile; varying vec2 voxelUv; varying vec3 worldPosition; varying vec3 faceNormal;
      void main(){blockTile=tile;voxelUv=uv;faceNormal=normal;worldPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldPosition,1.);}`,
    fragmentShader:`uniform sampler2D atlas; uniform bool facePass; uniform vec3 sunDirection; varying float blockTile; varying vec2 voxelUv; varying vec3 worldPosition; varying vec3 faceNormal;
      void main(){vec2 uv=vec2((blockTile*16.+.5+fract(voxelUv.x)*15.)/256.,(.5+fract(voxelUv.y)*15.)/16.);
      if(texture2D(atlas,uv).a<.35)discard;
      bool leaf=abs(blockTile-8.)<.1||abs(blockTile-13.)<.1||abs(blockTile-15.)<.1;
      if(!facePass){gl_FragColor=leaf?vec4(1,0,0,1):vec4(0,0,0,1);return;}
      if(blockTile>2.1){gl_FragColor=vec4(0,0,0,1);return;}
      vec3 cell=floor(worldPosition-faceNormal*.02);
      float category=faceNormal.y>.5?128.:(faceNormal.y==0.&&dot(faceNormal,sunDirection)<=0.?64.:0.);
      gl_FragColor=vec4((cell+vec3(128,1.+category,128))/255.,1.);}`
  });
  let leaves,faces,mask;
  try {
    isolated=read();
    scene.background=new THREE.Color('#000000');animals.visible=false;
    for(const m of terrain)m.material=ids;
    leaves=read();ids.uniforms.facePass.value=true;faces=read();
    animals.visible=animalVisible;
    scene.background=new THREE.Color('#0000ff');for(const m of terrain)m.material=coverageMaterial;
    animals.material=maskMaterial;animals.instanceColor=instanceColor.clone();
    let i=0;for(const e of creatures)for(const part of templates[e.type])animals.setColorAt(i++,new THREE.Color(e.type==='rex'?'#ffffff':e.type==='grazer'?'#ffff00':'#00ffff'));
    animals.instanceColor.needsUpdate=true;mask=read();
  } finally {
    scene.background=background;for(const m of terrain)m.material=terrainMaterial;
    // Terrain material is passed separately: no modification survives an audit.
    animals.visible=animalVisible;animals.material=material;animals.instanceColor=instanceColor;for(const o of hidden)o.visible=true;maskMaterial.dispose();ids.dispose();
    renderer.render(scene,camera);
  }
  return {full,isolated,mask,leaves,faces,width,height};
}
