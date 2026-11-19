/* Flow-generated sprite for the hero (铜锣仔): an atlas of frames cut from five Google Flow image-to-video takes
   (idle, walk, gong block, finishing blow, hurt), keyed off magenta. The game logic is unchanged; this only
   picks which frame to show from the same simulation state the code rig reads. Source and process: README. */
(function(root){
'use strict';
const META={"image": "tongluozai-atlas.webp", "cell": [240, 272], "cols": 12, "rows": 11, "count": 125, "root": [120.0, 233.20000000000002], "worldPerPx": 0.0128625, "fps": 12, "anims": {"idle": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], "walk": [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54], "guard": [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66], "parry": [67, 68, 69, 70, 71, 72, 73, 74, 75, 76], "attack": [77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107], "hurt": [108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124]}, "source": {"idle": {"clip": "idle", "frames": [36, 62]}, "walk": {"clip": "walk", "frames": [45, 72]}, "guard": {"clip": "guard", "frames": [18, 29]}, "parry": {"clip": "guard", "frames": [13, 22]}, "attack": {"clip": "attack", "frames": [10, 40]}, "hurt": {"clip": "hurt", "frames": [2, 18]}}, "hit": {"parry": 2, "attack": 11}};
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const A=META.anims;
const at=(name,i)=>{const a=A[name];return a[clamp(Math.floor(i),0,a.length-1)];};
const loop=(name,i)=>{const a=A[name];return a[((Math.floor(i)%a.length)+a.length)%a.length];};
// map state time onto a clip so the clip's contact frame lands on the game's hit time
function oneShot(name,u,hit,dur){
  const n=A[name].length,h=META.hit[name];
  if(u<=hit)return at(name,h*clamp(u/Math.max(1e-6,hit),0,1));
  return at(name,h+(n-1-h)*clamp((u-hit)/Math.max(1e-6,dur-hit),0,1));
}
function frameFor(p,t){
  const u=p.st||0;
  switch(p.state){
    case 'walk':return loop('walk',(p.walkPhase/TAU)*14);
    case 'guard':return loop('guard',t*8);
    case 'parry':return at('parry',u/.42*(A.parry.length-1));
    case 'attack':return oneShot('attack',u,p.attackHit||.2,p.attackDur||.5);
    case 'execute':return oneShot('attack',u,.24,.55);
    case 'hurt':case 'bounced':return at('hurt',u/Math.max(.05,p.stateDur||.4)*(A.hurt.length-1));
    case 'broken':return at('hurt',7+Math.sin(u*9));
    case 'down':case 'dead':return at('hurt',7);
    case 'dodge':return loop('walk',u*24);
    case 'won':return loop('parry',t*10);
    default:return loop('idle',t*META.fps);
  }
}
root.GongFlow={META,frameFor,url:'assets/'+META.image};
})(typeof globalThis!=='undefined'?globalThis:this);
