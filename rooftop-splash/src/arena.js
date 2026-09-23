/* Scene data only. Collision, bot navigation and minimap share these bounds. */
(function(root){
'use strict';
const arena={
  title:'天台水枪大战', subtitle:'ROOFTOP SPLASH', width:38, length:58,
  colors:{sky:0xf4d5ad,fog:0xf5d6b3,floor:0xe8d4b6,blue:0x26aebd,orange:0xff7b47},
  spawns:[{x:0,z:24,yaw:0},{x:0,z:-24,yaw:Math.PI}],
  // y is the bottom face. Low planters can be jumped onto; taller props block fire.
  props:[
    {kind:'shed',x:-12,z:20,w:8,d:6,h:4.3,color:0x75b7b1},
    {kind:'shed',x:12,z:-20,w:8,d:6,h:4.3,color:0xeaa17b},
    {kind:'tank',x:11,z:16,w:5,d:5,h:4.1,color:0x80b7c6},
    {kind:'tank',x:-11,z:-16,w:5,d:5,h:4.1,color:0xaebbae},
    {kind:'planter',x:-3,z:15,w:7,d:2.3,h:1.05,color:0xc88060},
    {kind:'planter',x:3,z:-15,w:7,d:2.3,h:1.05,color:0xc88060},
    {kind:'ac',x:-10,z:7,w:4.3,d:3,h:1.8,color:0xe4e5d5},
    {kind:'ac',x:10,z:-7,w:4.3,d:3,h:1.8,color:0xe4e5d5},
    {kind:'pergola',x:0,z:0,w:7,d:4,h:2.5,color:0xdfb37c},
    {kind:'planter',x:12,z:2.5,w:6,d:2.2,h:1.05,color:0xc88060},
    {kind:'planter',x:-12,z:-2.5,w:6,d:2.2,h:1.05,color:0xc88060},
    {kind:'crates',x:5,z:8,w:3.2,d:3.1,h:2.1,color:0xe6b94f},
    {kind:'crates',x:-5,z:-8,w:3.2,d:3.1,h:2.1,color:0x75b7b1},
    {kind:'bench',x:-15,z:13,w:2,d:4.2,h:.7,color:0xa9805c},
    {kind:'bench',x:15,z:-13,w:2,d:4.2,h:.7,color:0xa9805c}
  ]
};
arena.blocks=arena.props.map(p=>({minX:p.x-p.w/2,maxX:p.x+p.w/2,minZ:p.z-p.d/2,maxZ:p.z+p.d/2,minY:0,maxY:p.h}));
if(typeof module!=='undefined')module.exports=arena;
root.SplashArena=arena;
})(typeof globalThis!=='undefined'?globalThis:this);
